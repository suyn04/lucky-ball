import { useEffect, useRef } from 'react'

export const COLORS = ['#e53935','#fb8c00','#fdd835','#43a047','#00acc1','#1e88e5','#5e35b1','#d81b60','#8d6e63','#00897b','#7cb342','#ec407a']

export function Ball({ n, size }) {
  return (
    <div className="ball" style={{ '--c': COLORS[n - 1], '--d': size + 'px', width: size, height: size, position: 'relative' }}>
      <span>{n}</span>
    </div>
  )
}

// 투명 추첨 기계: 간단한 물리 시뮬레이션 (중력/회전/충돌)
export default function Machine({ balls, spinning }) {
  const box = useRef(null)
  const els = useRef({})
  const st = useRef({})
  const spin = useRef(spinning)
  spin.current = spinning

  useEffect(() => {
    let raf, last = performance.now()
    const tick = (t) => {
      const dt = Math.min((t - last) / 16.7, 2); last = t
      const R = box.current.clientWidth / 2, d = R * 0.28, lim = R - d / 2 - R * 0.05
      for (const k of Object.keys(st.current)) if (!balls.includes(+k)) delete st.current[k]
      const list = balls.map((n) => st.current[n] ||= {
        n, x: (Math.random() - 0.5) * R * 0.9, y: R * 0.35 + Math.random() * R * 0.3, vx: 0, vy: 0 })
      for (const b of list) {
        if (spin.current) {
          const m = Math.hypot(b.x, b.y) || 1
          b.vx += (-b.y / m) * 0.55 * dt + (Math.random() - 0.5) * 0.9
          b.vy += (b.x / m) * 0.55 * dt + (Math.random() - 0.5) * 0.9 - 0.12 * dt
        } else b.vy += 0.32 * dt
        b.vx *= 0.992; b.vy *= 0.992
        b.x += b.vx * dt * (R / 220); b.y += b.vy * dt * (R / 220)
        const dist = Math.hypot(b.x, b.y)
        if (dist > lim) {
          const nx = b.x / dist, ny = b.y / dist, dot = b.vx * nx + b.vy * ny
          b.x = nx * lim; b.y = ny * lim
          if (dot > 0) { b.vx -= 1.7 * dot * nx; b.vy -= 1.7 * dot * ny }
        }
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        let dx = b.x - a.x, dy = b.y - a.y; const dist = Math.hypot(dx, dy) || 0.01
        if (dist < d) {
          dx /= dist; dy /= dist
          const push = (d - dist) / 2
          a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push
          const rv = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy
          if (rv < 0) { a.vx += rv * dx; a.vy += rv * dy; b.vx -= rv * dx; b.vy -= rv * dy }
        }
      }
      for (const b of list) {
        const el = els.current[b.n]; if (!el) continue
        el.style.width = el.style.height = d + 'px'
        el.style.setProperty('--d', d + 'px')
        el.style.left = R + b.x - d / 2 + 'px'; el.style.top = R + b.y - d / 2 + 'px'
        el.style.transform = `rotate(${(b.x + b.y) * 1.2}deg)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [balls.join(',')])

  return (
    <div className="machine-wrap">
      <div ref={box} className={'machine' + (spinning ? ' spinning' : '')}>
        {balls.map((n) => (
          <div key={n} ref={(e) => (els.current[n] = e)} className="ball abs" style={{ '--c': COLORS[n - 1] }}>
            <span>{n}</span>
          </div>
        ))}
        <div className="glare" />
      </div>
      <div className="base"><i /><i /><i /></div>
    </div>
  )
}
