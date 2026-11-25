# LUCKY BALL
1. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/schema.sql` 전체 실행
2. `.env.example`을 `.env`로 복사 후 Project URL / anon key 입력 (Settings → API)
3. `npm install && npm run dev`
4. GitHub에 push → Vercel에서 Import → Environment Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록 → Deploy
