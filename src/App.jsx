import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import Machine, { Ball } from './Machine.jsx'

const SPIN_MS = 3600
const ALL = Array.from({ length: 12 }, (_, i) => i + 1)
const keyOf = (slug) => `luckyball:${slug}`

function Home() {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_room', { p_title: title })
    if (error) { alert('추첨방을 만들지 못했어요: ' + error.message); setBusy(false); return }
    localStorage.setItem(keyOf(data.slug), data.token)
    location.href = '/r/' + data.slug
  }
  return (
    <main className="home">
      <h1 className="logo">LUCKY BALL</h1>
      <p className="sub">회식 자리를 띄우는 실시간 번호 추첨</p>
      <input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)}
        placeholder="추첨방 이름 (예: 마케팅팀 송년회)" />
      <button className="gold" disabled={busy} onClick={create}>{busy ? '만드는 중…' : '추첨방 만들기'}</button>
      <p className="hint">만든 사람만 추첨 버튼을 누를 수 있고, 링크를 받은 사람은 로그인 없이 함께 봅니다.</p>
    </main>
  )
}

function Room({ slug }) {
  const [token] = useState(() => {
    const m = location.hash.match(/^#k=([a-f0-9]+)/)
    if (m) { localStorage.setItem(keyOf(slug), m[1]); history.replaceState(null, '', location.pathname) }
    return localStorage.getItem(keyOf(slug))
  })
  const [room, setRoom] = useState(null)
  const [draws, setDraws] = useState([])
  const [phase, setPhase] = useState('idle')
  const [show, setShow] = useState(false)
  const [isAdmin, setAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const prev = useRef(null)
  const timer = useRef()

  const spin = (ms) => {
    setShow(false); setPhase('spinning')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPhase('idle'); setShow(true) }, ms)
  }

  const load = useCallback(async () => {
    const { data: r } = await supabase.from('rooms').select('*').eq('slug', slug).maybeSingle()
    if (!r) { setRoom(false); return }
    const { data: d } = await supabase.from('draws').select('seq,ball').eq('room_id', r.id).order('seq')
    setDraws(d || []); setRoom(r)
    const p = prev.current; prev.current = r.draw_count
    if (p === null) { // 최초 접속/새로고침: 방금 뽑은 중이면 남은 시간만 연출, 아니면 상태만 복구
      const el = r.last_draw_at ? Date.now() - new Date(r.last_draw_at).getTime() : Infinity
      if (el < SPIN_MS) spin(SPIN_MS - Math.max(el, 0))
    } else if (r.draw_count > p) spin(SPIN_MS)
    else if (r.draw_count < p) { clearTimeout(timer.current); setPhase('idle'); setShow(false) }
  }, [slug])

  useEffect(() => {
    load()
    const ch = supabase.channel('room:' + slug)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `slug=eq.${slug}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draws' }, load)
      .subscribe((s) => s === 'SUBSCRIBED' && load())
    const poll = setInterval(load, 5000) // 연결 끊김 대비 보조 동기화
    const vis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', vis)
    return () => { supabase.removeChannel(ch); clearInterval(poll); document.removeEventListener('visibilitychange', vis) }
  }, [slug, load])

  useEffect(() => {
    if (token) supabase.rpc('check_admin', { p_slug: slug, p_token: token }).then(({ data }) => setAdmin(!!data))
  }, [slug, token])

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 7000)
    return () => clearTimeout(t)
  }, [show])

  if (room === null) return <main className="home"><p className="sub">불러오는 중…</p></main>
  if (room === false) return <main className="home"><h1 className="logo">404</h1><p className="sub">추첨방을 찾을 수 없어요.</p><a className="gold" href="/">새 추첨방 만들기</a></main>

  const spinning = phase === 'spinning'
  const shown = spinning ? draws.filter((d) => d.seq < room.draw_count) : draws
  const remaining = ALL.filter((n) => !shown.some((d) => d.ball === n))

  const act = async (fn) => {
    setBusy(true)
    const { error } = await supabase.rpc(fn, { p_slug: slug, p_token: token })
    setBusy(false)
    if (error) { if (!/busy/.test(error.message)) alert(/empty/.test(error.message) ? '모든 번호를 추첨했어요.' : '실행할 수 없어요: ' + error.message); return }
    load()
  }
  const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => alert(msg))
  const origin = location.origin

  return (
    <main className="room">
      <header><h1 className="logo sm">LUCKY BALL</h1><p className="sub">{room.title}</p></header>

      <Machine balls={remaining} spinning={spinning} />

      <p className="status">
        {spinning ? '추첨 중…' : remaining.length === 0 ? '모든 번호 추첨 완료!' : `남은 번호 ${remaining.length}개`}
      </p>

      {isAdmin && (
        <section className="admin">
          <button className="gold big" disabled={spinning || busy || remaining.length === 0} onClick={() => act('draw_ball')}>
            {remaining.length === 0 ? '추첨 완료' : spinning ? '추첨 중…' : '추첨 시작'}
          </button>
          <div className="row">
            <button onClick={() => copy(`${origin}/r/${slug}`, '참여자용 링크를 복사했어요.')}>참여자 링크 복사</button>
            <button onClick={() => copy(`${origin}/r/${slug}#k=${token}`, '관리자 링크를 복사했어요. 다른 사람에게 공유하지 마세요.')}>관리자 링크 복사</button>
            <button className="danger" disabled={spinning || busy} onClick={() => confirm('모든 추첨 기록을 지우고 처음부터 다시 시작할까요?') && act('reset_room')}>초기화</button>
          </div>
        </section>
      )}

      <section className="history">
        <h2>당첨 번호</h2>
        {shown.length === 0 ? <p className="empty">아직 추첨 전이에요.</p> : (
          <ol>{shown.map((d) => <li key={d.seq}><small>{d.seq}번째</small><Ball n={d.ball} size={52} /></li>)}</ol>
        )}
      </section>

      {show && room.current_ball && (
        <div className="reveal" onClick={() => setShow(false)}>
          <p>{room.draw_count}번째 당첨 번호</p>
          <div className="pop"><Ball n={room.current_ball} size={Math.min(window.innerWidth * 0.62, 320)} /></div>
        </div>
      )}
    </main>
  )
}

export default function App() {
  const m = location.pathname.match(/^\/r\/([a-z0-9]+)/)
  return m ? <Room slug={m[1]} /> : <Home />
}
