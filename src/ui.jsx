import React, { useEffect, useMemo, useRef, useState } from 'react'
import { HOLIDAYS, upcomingWeekends } from './holidays'

/* ───────── 공용 인터랙션 키트 ─────────
   바텀시트(드래그 닫기) · 풀스크린 검색 오버레이(초성·음성·최근검색) · 레인지 달력(공휴일·연휴추천)
   · 스테퍼 · 스켈레톤 · 햅틱 · 공유 · 카운트업 · View Transition 헬퍼. 외부 라이브러리 0. */

export const haptic = (ms = 8) => { try { if (navigator.vibrate) navigator.vibrate(ms) } catch (e) {} }
// 문서가 숨겨진 상태(백그라운드 탭/창)에선 startViewTransition이 콜백을 버린 채
// InvalidStateError로 중단됨 → 보일 때만 VT, 아니면 즉시 실행
export const vt = fn => {
  if (!document.startViewTransition || document.visibilityState !== 'visible') { fn(); return }
  try { document.startViewTransition(fn) } catch (e) { fn() }
}

export async function shareIt({ title, text, url }) {
  haptic()
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared' }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel' }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); alert('내용을 복사했어요! 카톡 등에 붙여넣어 공유하세요 📋'); return 'copied' }
  catch (e) { return 'fail' }
}

/* 가격 카운트업 (마운트/변경 시 살짝 올라가는 숫자) */
export function useCountUp(target, dur = 450) {
  const [v, setV] = useState(target || 0)
  const prev = useRef(0)
  useEffect(() => {
    if (target == null) return
    const from = prev.current, to = target, t0 = performance.now()
    prev.current = to
    if (from === to) { setV(to); return }
    let raf
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3)
      setV(Math.round(from + (to - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return target == null ? null : v
}

/* 한글 초성 검색 (ㅇㅅㅋ → 오사카) */
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const chosung = s => [...String(s)].map(c => { const k = c.charCodeAt(0) - 0xac00; return (k >= 0 && k < 11172) ? CHO[Math.floor(k / 588)] : c }).join('')
const isChoQuery = q => [...q].every(c => CHO.includes(c))
export function matchKo(label, q) {
  if (!q) return true
  const l = String(label).toLowerCase(), s = q.toLowerCase().trim()
  if (l.includes(s)) return true
  return isChoQuery(s) && chosung(l).includes(s)
}

/* ───────── 바텀시트 (드래그 핸들 + 아래로 스와이프 닫기) ───────── */
export function Sheet({ open, onClose, title, children, max = '88vh' }) {
  const [dy, setDy] = useState(0)
  const start = useRef(null)
  useEffect(() => { if (open) setDy(0) }, [open])
  if (!open) return null
  const onTS = e => { start.current = e.touches[0].clientY }
  const onTM = e => { if (start.current == null) return; const d = e.touches[0].clientY - start.current; if (d > 0) setDy(d) }
  const onTE = () => { if (dy > 90) { haptic(); onClose() } else setDy(0); start.current = null }
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up flex flex-col"
        style={{ maxHeight: max, transform: dy ? `translateY(${dy}px)` : undefined, transition: dy ? 'none' : 'transform .2s ease' }}>
        <div className="pt-2.5 pb-1 shrink-0 cursor-grab" onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
          <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto" />
          {title && <div className="text-center text-[14.5px] font-extrabold text-slate-800 mt-2.5">{title}</div>}
        </div>
        <div className="overflow-y-auto no-scrollbar flex-1">{children}</div>
      </div>
    </div>
  )
}

/* ───────── 풀스크린 검색 오버레이 (자동완성 + 초성 + 최근검색 + 음성) ───────── */
export function SearchOverlay({ open, onClose, title, placeholder, groups, onPick, recentKey, voice }) {
  const [q, setQ] = useState('')
  const [listening, setListening] = useState(false)
  const inputRef = useRef(null)
  const recRef = useRef(null)
  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current && inputRef.current.focus(), 80) } }, [open])
  const recents = useMemo(() => { if (!open || !recentKey) return []; try { return JSON.parse(localStorage.getItem('rec_' + recentKey) || '[]') } catch (e) { return [] } }, [open, recentKey])
  if (!open) return null
  const pick = item => {
    haptic()
    if (recentKey) {
      const next = [item, ...recents.filter(r => r.id !== item.id)].slice(0, 6)
      localStorage.setItem('rec_' + recentKey, JSON.stringify(next))
    }
    onPick(item); onClose()
  }
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const mic = () => {
    if (!SR) { alert('이 브라우저는 음성 입력을 지원하지 않아요'); return }
    try {
      haptic(15)
      const r = new SR(); recRef.current = r
      r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1
      r.onresult = ev => { const t = ev.results[0][0].transcript; setQ(t); setListening(false) }
      r.onerror = () => setListening(false)
      r.onend = () => setListening(false)
      setListening(true); r.start()
    } catch (e) { setListening(false) }
  }
  const filtered = groups.map(g => ({ ...g, items: g.items.filter(it => matchKo(it.label, q) || (it.sub && matchKo(it.sub, q)) || (it.kw && it.kw.some(k => matchKo(k, q)))) })).filter(g => g.items.length)
  return (
    <div className="fixed inset-0 z-[70] bg-white max-w-md mx-auto flex flex-col fade-in">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-[20px] text-slate-500 px-1 py-1">←</button>
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-2xl px-3.5 py-3">
            <span className="text-slate-400">🔍</span>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-slate-400" />
            {q && <button onClick={() => setQ('')} className="text-slate-300 text-[14px]">✕</button>}
            {voice && <button onClick={mic} className={'text-[16px] ' + (listening ? 'animate-pulse' : '')}>{listening ? '🔴' : '🎤'}</button>}
          </div>
        </div>
        {title && <div className="text-[11.5px] text-slate-400 mt-2 px-1">{title} · 초성으로도 찾아져요 (ㅇㅅㅋ→오사카)</div>}
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-8">
        {!q && recents.length > 0 && <div className="mb-4">
          <div className="text-[12px] font-bold text-slate-500 mb-2">최근 검색</div>
          <div className="flex flex-wrap gap-1.5">{recents.map(r => <button key={r.id} onClick={() => pick(r)} className="text-[13px] bg-slate-100 text-slate-600 rounded-full px-3 py-1.5">{r.icon} {r.label}</button>)}</div>
        </div>}
        {filtered.length === 0 && <div className="text-center text-slate-400 pt-16"><div className="text-3xl mb-2">🔎</div><div className="text-[13px]">검색 결과가 없어요</div></div>}
        {filtered.map(g => <div key={g.title} className="mb-3">
          <div className="text-[12px] font-bold text-slate-500 mb-1 mt-3">{g.title}</div>
          {g.items.map(it => (
            <button key={it.id} onClick={() => pick(it)} className="w-full flex items-center gap-3 py-3 border-b border-slate-50 text-left active:bg-slate-50">
              <span className="text-[18px] w-7 text-center">{it.icon}</span>
              <span className="flex-1 min-w-0"><span className="text-[14.5px] font-bold text-slate-800">{it.label}</span>{it.sub && <span className="text-[12px] text-slate-400 ml-2">{it.sub}</span>}</span>
              <span className="text-slate-300">›</span>
            </button>
          ))}
        </div>)}
      </div>
    </div>
  )
}

/* ───────── 레인지 달력 (세로 스크롤 + 공휴일 + 연휴 추천 + 날짜별 가격) ───────── */
const pad2 = n => String(n).padStart(2, '0')
const ymdOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`
const todayYmd = () => { const t = new Date(); return ymdOf(t.getFullYear(), t.getMonth(), t.getDate()) }
const fmtMD = s => s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : ''
const diffDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

function MonthGrid({ y, m, start, end, onTap, priceOf, minPrice }) {
  const lead = new Date(y, m, 1).getDay(), daysIn = new Date(y, m + 1, 0).getDate()
  const today = todayYmd()
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysIn; d++) cells.push(d)
  return (
    <div className="px-4 pb-2">
      <div className="text-[14px] font-extrabold text-slate-800 mb-1.5">{y}년 {m + 1}월</div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={'x' + i} />
          const key = ymdOf(y, m, d), dow = (lead + d - 1) % 7
          const past = key < today, hol = HOLIDAYS[key]
          const inRange = start && end && key > start && key < end
          const isStart = key === start, isEnd = key === end
          const p = priceOf ? priceOf(key) : null
          const colorCls = past ? 'text-slate-200' : hol || dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-blue-500' : 'text-slate-700'
          return (
            <button key={key} disabled={past} onClick={() => onTap(key)}
              className={'relative h-[46px] flex flex-col items-center justify-center rounded-xl leading-none ' +
                (isStart || isEnd ? 'bg-brand-500 text-white' : inRange ? 'bg-brand-100' : '')}>
              <span className={'text-[13px] font-bold ' + (isStart || isEnd ? 'text-white' : colorCls)}>{d}</span>
              {hol && !isStart && !isEnd && <span className="text-[7.5px] text-rose-500 mt-0.5 truncate max-w-full px-0.5">{hol}</span>}
              {!hol && p != null && !past && <span className={'text-[8px] font-bold mt-0.5 ' + (isStart || isEnd ? 'text-white/90' : p === minPrice ? 'text-emerald-600' : 'text-slate-400')}>{Math.round(p / 10000)}만</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function RangeCalendar({ open, onClose, title = '날짜 선택', mode = 'range', initStart, initEnd, onConfirm, priceOf, monthsCount = 12, confirmLabel }) {
  const [start, setStart] = useState(initStart || null)
  const [end, setEnd] = useState(initEnd || null)
  useEffect(() => { if (open) { setStart(initStart || null); setEnd(initEnd || null) } }, [open])
  const months = useMemo(() => {
    const out = [], now = new Date()
    for (let i = 0; i < monthsCount; i++) { const mm = now.getMonth() + i; out.push({ y: now.getFullYear() + Math.floor(mm / 12), m: ((mm % 12) + 12) % 12 }) }
    return out
  }, [monthsCount])
  const weekends = useMemo(() => upcomingWeekends(todayYmd()).slice(0, 5), [open])
  const minPrice = useMemo(() => {
    if (!priceOf) return null
    let min = null
    months.slice(0, 2).forEach(({ y, m }) => { const dim = new Date(y, m + 1, 0).getDate(); for (let d = 1; d <= dim; d++) { const p = priceOf(ymdOf(y, m, d)); if (p != null && (min == null || p < min)) min = p } })
    return min
  }, [priceOf, months])
  if (!open) return null
  const tap = key => {
    haptic()
    if (mode === 'single') { setStart(key); setEnd(null); return }
    if (!start || (start && end)) { setStart(key); setEnd(null) }
    else if (key > start) setEnd(key)
    else { setStart(key); setEnd(null) }
  }
  const nights = start && end ? diffDays(start, end) : 0
  const ok = mode === 'single' ? !!start : !!(start && end)
  return (
    <Sheet open={open} onClose={onClose} title={title} max="92vh">
      {weekends.length > 0 && <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pt-2 pb-1">
        {weekends.map(w => (
          <button key={w.start} onClick={() => { haptic(); setStart(w.start); setEnd(mode === 'single' ? null : w.end) }}
            className={'shrink-0 text-[11.5px] font-bold rounded-full px-3 py-1.5 ' + (w.leave ? 'bg-amber-100 text-amber-700' : 'bg-rose-50 text-rose-500')}>
            {w.leave ? '🔥' : '🗓️'} {w.label}{w.leave ? ` (연차${w.leave})` : ''}
          </button>
        ))}
      </div>}
      <div className="grid grid-cols-7 text-center text-[10.5px] py-1.5 border-b border-slate-100 sticky top-0 bg-white z-10">
        {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => <div key={w} className={i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}>{w}</div>)}
      </div>
      <div className="pt-2" style={{ paddingBottom: 90 }}>
        {months.map(({ y, m }) => <MonthGrid key={`${y}-${m}`} y={y} m={m} start={start} end={mode === 'single' ? null : end} onTap={tap} priceOf={priceOf} minPrice={minPrice} />)}
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-white border-t border-slate-100 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button disabled={!ok} onClick={() => { haptic(12); onConfirm(start, end); onClose() }}
          className={'w-full font-bold rounded-2xl py-3.5 text-[15px] ' + (ok ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400')}>
          {ok ? (confirmLabel || (mode === 'single' ? `${fmtMD(start)} 선택` : `${fmtMD(start)} ~ ${fmtMD(end)} · ${nights}박 선택`)) : mode === 'single' ? '날짜를 선택하세요' : start ? '종료일을 선택하세요' : '시작일을 선택하세요'}
        </button>
      </div>
    </Sheet>
  )
}

/* ───────── 스테퍼 ───────── */
export function StepRow({ label, sub, value, min = 0, max = 9, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div><div className="text-[14.5px] font-bold text-slate-800">{label}</div>{sub && <div className="text-[11.5px] text-slate-400">{sub}</div>}</div>
      <div className="flex items-center gap-3">
        <button onClick={() => { if (value > min) { haptic(); onChange(value - 1) } }} className={'w-9 h-9 rounded-full border text-[18px] leading-none ' + (value > min ? 'border-brand-300 text-brand-600' : 'border-slate-100 text-slate-200')}>−</button>
        <span className="w-6 text-center text-[15px] font-extrabold">{value}</span>
        <button onClick={() => { if (value < max) { haptic(); onChange(value + 1) } }} className={'w-9 h-9 rounded-full border text-[18px] leading-none ' + (value < max ? 'border-brand-300 text-brand-600' : 'border-slate-100 text-slate-200')}>+</button>
      </div>
    </div>
  )
}

/* ───────── 문장형 검색 (Mad Libs) ───────── */
export function MadLib({ parts, className }) {
  return (
    <div className={'text-[17px] leading-[1.9] font-bold text-slate-800 ' + (className || '')}>
      {parts.map((p, i) => typeof p === 'string'
        ? <span key={i} className="text-slate-500 font-medium">{p}</span>
        : <button key={i} onClick={() => { haptic(); p.on() }} className="text-brand-600 border-b-2 border-brand-300 mx-0.5 active:bg-brand-50 rounded-sm">{p.t}</button>)}
    </div>
  )
}

/* ───────── 스켈레톤 ───────── */
export const Skel = ({ className }) => <div className={'skel rounded-xl ' + (className || '')} />
export const SkelCard = () => (
  <div className="flex gap-3 bg-white rounded-2xl shadow-soft p-3">
    <Skel className="w-[84px] h-[84px] rounded-2xl shrink-0" />
    <div className="flex-1 pt-1 space-y-2"><Skel className="h-4 w-3/4" /><Skel className="h-3 w-1/2" /><Skel className="h-3 w-2/3" /></div>
  </div>
)
export const SkelRows = ({ n = 4 }) => <div className="space-y-3">{Array.from({ length: n }, (_, i) => <SkelCard key={i} />)}</div>
