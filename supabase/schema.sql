-- LUCKY BALL: Supabase SQL Editor에서 통째로 실행하세요.
create extension if not exists pgcrypto with schema extensions;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default 'LUCKY BALL',
  current_ball int check (current_ball between 1 and 12),
  draw_count int not null default 0,
  last_draw_at timestamptz,
  created_at timestamptz not null default now()
);
-- 관리자 토큰 해시: 정책이 없으므로 클라이언트에서 절대 읽을 수 없음
create table public.room_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  admin_token_hash text not null
);
create table public.draws (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  seq int not null,
  ball int not null check (ball between 1 and 12),
  drawn_at timestamptz not null default now(),
  unique (room_id, ball),
  unique (room_id, seq)
);

alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.draws enable row level security;

-- 누구나 조회만 가능 (쓰기 정책 없음 = 직접 INSERT/UPDATE/DELETE 불가)
create policy "rooms_read" on public.rooms for select using (true);
create policy "draws_read" on public.draws for select using (true);

revoke all on public.rooms, public.draws, public.room_secrets from anon, authenticated;
grant select on public.rooms, public.draws to anon, authenticated;

-- 내부 헬퍼 (외부 호출 불가)
create function public._is_admin(p_room uuid, p_token text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from room_secrets
    where room_id = p_room and admin_token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex'));
$$;
revoke execute on function public._is_admin(uuid, text) from public, anon, authenticated;

create function public.create_room(p_title text default 'LUCKY BALL') returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text; v_token text;
begin
  v_slug  := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into rooms (slug, title) values (v_slug, left(coalesce(nullif(trim(p_title), ''), 'LUCKY BALL'), 40))
    returning id into v_id;
  insert into room_secrets values (v_id, encode(digest(v_token, 'sha256'), 'hex'));
  return json_build_object('slug', v_slug, 'token', v_token);
end $$;

create function public.check_admin(p_slug text, p_token text) returns boolean
language sql security definer set search_path = public as $$
  select coalesce((select _is_admin(id, p_token) from rooms where slug = p_slug), false);
$$;

-- 당첨 번호는 오직 여기(서버)에서 단 한 번 결정됩니다.
create function public.draw_ball(p_slug text, p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms%rowtype; v_ball int; v_seq int;
begin
  select * into r from rooms where slug = p_slug for update;  -- 동시 클릭 방지(행 잠금)
  if not found or not _is_admin(r.id, p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if r.last_draw_at is not null and now() - r.last_draw_at < interval '4 seconds' then
    raise exception 'busy';
  end if;
  select n into v_ball from generate_series(1, 12) n
    where n not in (select ball from draws where room_id = r.id)
    order by random() limit 1;
  if v_ball is null then raise exception 'empty'; end if;
  v_seq := r.draw_count + 1;
  insert into draws (room_id, seq, ball) values (r.id, v_seq, v_ball);
  update rooms set current_ball = v_ball, draw_count = v_seq, last_draw_at = now() where id = r.id;
  return json_build_object('ball', v_ball, 'seq', v_seq);
end $$;

create function public.reset_room(p_slug text, p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  select id into v_id from rooms where slug = p_slug for update;
  if v_id is null or not _is_admin(v_id, p_token) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  delete from draws where room_id = v_id;
  update rooms set current_ball = null, draw_count = 0, last_draw_at = null where id = v_id;
end $$;

grant execute on function public.create_room(text), public.check_admin(text, text),
  public.draw_ball(text, text), public.reset_room(text, text) to anon, authenticated;

-- 실시간 구독 활성화
alter publication supabase_realtime add table public.rooms, public.draws;
