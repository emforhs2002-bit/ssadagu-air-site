import React, { useEffect, useMemo, useRef, useState } from 'react'

/* ───────── helpers ───────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const won = n => (n == null ? '-' : Number(n).toLocaleString('ko-KR') + '원')
function parseDt(s) { if (!s) return null; const [d, t] = String(s).split(' '); const dt = new Date(d.replace(/-/g, '/') + ' ' + (t || '00:00')); return isNaN(dt) ? null : dt }
function fmtDate(s) { const dt = parseDt(s); if (!dt) return { full: s || '-', weekend: false, month: 0 }; const w = dt.getDay(); return { md: `${dt.getMonth() + 1}/${dt.getDate()}`, dow: DAYS[w], time: (s.split(' ')[1] || ''), weekend: w === 0 || w === 6, month: dt.getMonth() + 1, full: `${dt.getMonth() + 1}/${dt.getDate()}(${DAYS[w]}) ${s.split(' ')[1] || ''}` } }
const fatigueStyle = f => ({ '좋음': 'text-brand-700 bg-brand-100', '보통': 'text-amber-700 bg-amber-100', '나쁨': 'text-rose-700 bg-rose-100' }[f] || 'text-slate-600 bg-slate-100')
const gradeStyle = g => (g === 'A' ? 'bg-brand-600' : g === 'B' ? 'bg-brand-500' : g === 'C' ? 'bg-amber-500' : g === 'D' ? 'bg-rose-500' : 'bg-slate-400')
const statusLabel = s => ({ published: '검수완료', sample: '검수 샘플', auto: '자동발견', closed: '마감' }[s] || '검수 대기')

/* ───────── 지역/도시 매핑 (채팅 검색) ───────── */
const GEO = {
  '일본': ['FUK', 'KIX', 'TYO', 'HND', 'NRT', 'OKA', 'CTS'],
  '대만': ['TPE', 'KHH'],
  '베트남': ['DAD', 'NHA', 'HAN', 'SGN', 'PQC'],
  '태국': ['BKK', 'HKT', 'CNX'],
  '필리핀': ['CEB', 'MNL', 'KLO'],
  '싱가포르': ['SIN'], '말레이시아': ['KUL', 'BKI'], '인도네시아': ['DPS', 'CGK'],
  '중국': ['PVG', 'TAO', 'PEK', 'CAN'], '홍콩': ['HKG'], '괌': ['GUM'], '사이판': ['SPN'],
}
const REGION = {
  '동남아': ['베트남', '태국', '필리핀', '싱가포르', '말레이시아', '인도네시아'],
  '일본대만': ['일본', '대만'],
}
const destOf = d => (d.route || '').split('-')[1] || ''
function searchDeals(deals, qRaw) {
  const q = (qRaw || '').trim()
  if (!q) return []
  if (['전체', '전부', '다', '아무', '모두'].some(k => q.includes(k))) return deals
  const codes = new Set(); const countries = []
  for (const [r, cs] of Object.entries(REGION)) if (q.includes(r) || r.includes(q)) countries.push(...cs)
  for (const [c, list] of Object.entries(GEO)) if (q.includes(c) || c.includes(q) || countries.includes(c)) list.forEach(x => codes.add(x))
  return deals.filter(d => codes.has(destOf(d)) || (d.city && (d.city.includes(q) || q.includes(d.city))))
}

/* ───────── localStorage ───────── */
function useSaved() {
  const [ids, setIds] = useState(() => { try { return JSON.parse(localStorage.getItem('saved') || '[]') } catch { return [] } })
  const toggle = id => setIds(p => { const n = p.includes(id) ? p.filter(x => x !== id) : [...p, id]; localStorage.setItem('saved', JSON.stringify(n)); return n })
  return [ids, toggle]
}
function report(id, kind) { const l = JSON.parse(localStorage.getItem('reports') || '[]'); l.push({ id, kind, at: new Date().toISOString() }); localStorage.setItem('reports', JSON.stringify(l)); alert('신고 접수했어요. 감사합니다! 🙏') }

/* ───────── deal card ───────── */
function DealCard({ d, saved, onSave, onOpen }) {
  const dep = fmtDate(d.departure_time)
  return (
    <div className="bg-white rounded-3xl shadow-soft p-4 active:scale-[.99] transition" onClick={() => onOpen(d)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] text-slate-400 font-medium">{d.route} · {d.airline}</div>
          <div className="text-[17px] font-extrabold leading-tight mt-0.5">{d.badge} {d.city}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onSave(d.id) }} className={'text-xl leading-none px-1 ' + (saved ? 'text-rose-500' : 'text-slate-300')}>♥</button>
      </div>
      <div className="flex items-end gap-2 mt-2">
        <div className="text-2xl font-black text-brand-600">{won(d.price)}</div>
        {d.discount_rate > 0 && <span className="mb-1 text-[12px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">-{d.discount_rate}%</span>}
        <span className="mb-1 text-[11px] text-slate-400">평소 <s>{won(d.normal_price)}</s></span>
      </div>
      <div className="text-[12.5px] text-slate-500 mt-1.5">🛫 <b className={dep.weekend ? 'text-rose-500' : 'text-slate-700'}>{dep.md}({dep.dow})</b> {dep.time}<span className="text-slate-300"> · </span>{d.transfers === 0 ? '직항' : '경유 ' + d.transfers + '회'}{d.duration ? ' · ' + d.duration : ''}</div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className="text-[11px] font-bold text-brand-700 bg-brand-50 rounded-full px-2 py-1">✅ {statusLabel(d.status)}</span>
        <span className={'text-[11px] font-bold rounded-full px-2 py-1 ' + fatigueStyle(d.fatigue)}>피로도 {d.fatigue}</span>
        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-1">🧳 {d.carrier_type === 'LCC' ? '수하물 별도 추정' : '수하물 포함 추정'}</span>
      </div>
    </div>
  )
}

/* ───────── detail sheet ───────── */
function DealSheet({ d, onClose }) {
  if (!d) return null
  const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time), hc = d.hidden_cost || {}, insp = d.inspection || {}
  const Row = ({ l, r, s }) => <div className={'flex justify-between ' + (s ? 'font-bold text-brand-700 border-t border-brand-100 pt-1 mt-1' : '')}><span>{l}</span><span>{r}</span></div>
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="sticky top-0 bg-white pt-2 pb-3 px-5 rounded-t-3xl">
          <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between">
            <div><div className="text-[12px] text-slate-400">{d.route} · {d.airline}</div><div className="text-xl font-extrabold">{d.badge} {d.city}</div></div>
            <button onClick={onClose} className="text-slate-400 text-2xl leading-none">✕</button>
          </div>
          <div className="flex items-end gap-2 mt-1"><div className="text-3xl font-black text-brand-600">{won(d.price)}</div>{d.discount_rate > 0 && <span className="mb-1.5 text-[12px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">평소 대비 -{d.discount_rate}%</span>}</div>
        </div>
        <div className="px-5 pb-8 space-y-4 text-[13px]">
          <div className="text-slate-600">🛫 가는 편 <b className={dep.weekend ? 'text-rose-500' : ''}>{dep.full}</b><br />🛬 오는 편 <b className={ret.weekend ? 'text-rose-500' : ''}>{ret.full}</b><br />{d.transfers === 0 ? '직항' : '경유 ' + d.transfers + '회'} · {d.duration} · 피로도 <b>{d.fatigue}</b></div>
          <section className="border border-slate-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-700">🔎 검수 영수증</h3><span className={'text-[11px] text-white rounded-full px-2 py-0.5 ' + gradeStyle(d.booking_grade)}>예약처 {d.booking_grade}</span></div>
            <div className="text-slate-600 space-y-0.5">
              <div>확인 시각: {insp.checked_at || '-'}</div>
              <div>가격 확인: {insp.price_ok === true ? '✅' : insp.price_ok === false ? '❌' : '—'}</div>
              <div>링크 확인: {insp.link_ok === true ? '✅' : insp.link_ok === false ? '❌' : '—'}</div>
              <div>수하물: {d.baggage_note}</div>
              <div>환불/변경: {insp.refund || '-'}</div>
            </div>
          </section>
          <section className="bg-brand-50/70 rounded-2xl p-4"><h3 className="font-bold text-brand-800 mb-2">💰 숨은비용 레이더</h3><div className="text-slate-700 space-y-0.5">
            <Row l="항공권 표시가" r={won(hc.airfare)} /><Row l="위탁수하물(추정)" r={'+' + won(hc.baggage_est)} /><Row l="eSIM" r={'+' + won(hc.esim)} /><Row l="숙소" r={hc.hotel_note || '별도'} /><Row l="예상 총여행비" r={won(hc.total_est)} s />
          </div></section>
          <section className="grid gap-2"><div className="bg-brand-50 rounded-2xl p-3"><b className="text-brand-700">👍 추천</b><div className="text-slate-600 mt-1">{(d.fit_recommend || []).join(' · ')}</div></div><div className="bg-rose-50 rounded-2xl p-3"><b className="text-rose-600">👎 비추천</b><div className="text-slate-600 mt-1">{(d.fit_avoid || []).join(' · ')}</div></div></section>
          <a href={d.affiliate_url} target="_blank" rel="noopener" className="block text-center bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">예약 보러가기 →</a>
          <div className="text-center text-[12px] text-slate-400">결제·환불은 항공사/판매처 직접 · 예약 전 실제가 꼭 확인</div>
          <div className="border-t border-slate-100 pt-3"><div className="text-[12px] text-slate-400 mb-2">가격이 다르거나 마감됐나요?</div><div className="grid grid-cols-2 gap-2 text-[12.5px]">{[['price', '가격이 달라요'], ['soldout', '마감됐어요'], ['baggage', '수하물 달라요'], ['link', '링크 이상해요']].map(([k, t]) => <button key={k} onClick={() => report(d.id, k)} className="bg-slate-100 text-slate-600 rounded-xl py-2">{t}</button>)}</div></div>
        </div>
      </div>
    </div>
  )
}

/* ───────── 채팅 검색 (메인) ───────── */
function Chat({ deals, savedIds, onSave, onOpen }) {
  const [msgs, setMsgs] = useState([{ from: 'bot', text: '안녕하세요! 어디로 떠나고 싶으세요? ✈️\n나라·도시·지역을 입력해보세요. (예: 일본, 동남아, 방콕, 다낭)' }])
  const [input, setInput] = useState('')
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  function send(text) {
    const q = (text ?? input).trim(); if (!q) return
    const res = searchDeals(deals, q)
    const bot = res.length
      ? { from: 'bot', text: `'${q}' 검수된 딜 ${res.length}개 찾았어요 👇`, deals: res }
      : { from: 'bot', text: `'${q}' 쪽은 아직 검수된 딜이 없어요 😅\n다른 지역을 말하거나 아래 '전체 보기'를 눌러보세요.` }
    setMsgs(m => [...m, { from: 'user', text: q }, bot]); setInput('')
  }
  const chips = ['일본', '동남아', '대만', '베트남', '방콕', '전체 보기']
  return (
    <div className="flex flex-col h-[calc(100vh-118px)]">
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.from === 'user' ? 'flex justify-end' : ''}>
            {m.from === 'bot' && <div className="text-[11px] text-slate-400 mb-1">✈️ 싸다구 도우미</div>}
            <div className={'max-w-[82%] whitespace-pre-line text-[14px] leading-relaxed rounded-2xl px-3.5 py-2.5 ' + (m.from === 'user' ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-white text-slate-700 shadow-soft rounded-tl-sm')}>{m.text}</div>
            {m.deals && <div className="space-y-3 mt-2">{m.deals.map(d => <DealCard key={d.id} d={d} saved={savedIds.includes(d.id)} onSave={onSave} onOpen={onOpen} />)}</div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="px-3 pt-2 pb-2 bg-[#eefbf8]/95 backdrop-blur border-t border-brand-100">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2">
          {chips.map(c => <button key={c} onClick={() => send(c)} className="shrink-0 text-[12.5px] bg-white text-brand-700 border border-brand-200 rounded-full px-3 py-1.5">{c}</button>)}
        </div>
        <div className="flex gap-2 items-center">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="나라·도시·지역 입력 (예: 일본)" className="flex-1 bg-white rounded-full px-4 py-3 text-[14px] outline-none border border-slate-200" />
          <button onClick={() => send()} className="bg-brand-500 text-white font-bold rounded-full w-12 h-12 shrink-0">↑</button>
        </div>
      </div>
    </div>
  )
}

/* ───────── 전체 / 찜 / 마이 ───────── */
function AllDeals({ deals, savedIds, onSave, onOpen }) {
  const sorted = [...deals].sort((a, b) => b.discount_rate - a.discount_rate)
  return <div className="px-4 space-y-3 pt-2 pb-4">
    <p className="text-[13px] text-slate-500">검수 완료된 전체 딜 {sorted.length}건</p>
    {sorted.map(d => <DealCard key={d.id} d={d} saved={savedIds.includes(d.id)} onSave={onSave} onOpen={onOpen} />)}
  </div>
}
function Saved({ deals, savedIds, onSave, onOpen }) {
  const list = deals.filter(d => savedIds.includes(d.id))
  if (!list.length) return <Empty icon="♡" text="찜한 딜이 없어요. 카드의 하트를 눌러 저장하세요." />
  return <div className="px-4 space-y-3 pt-2 pb-4">{list.map(d => <DealCard key={d.id} d={d} saved onSave={onSave} onOpen={onOpen} />)}</div>
}
function Toggle({ label, k }) {
  const [on, setOn] = useState(() => localStorage.getItem('opt_' + k) === '1')
  return <button onClick={() => { const n = !on; setOn(n); localStorage.setItem('opt_' + k, n ? '1' : '0') }} className="w-full flex items-center justify-between py-2.5"><span className="text-slate-700 text-[14px]">{label}</span><span className={'w-11 h-6 rounded-full p-0.5 transition ' + (on ? 'bg-brand-500' : 'bg-slate-200')}><span className={'block w-5 h-5 bg-white rounded-full transition ' + (on ? 'translate-x-5' : '')} /></span></button>
}
const Section = ({ title, children }) => <div className="bg-white rounded-2xl shadow-soft p-4"><div className="text-[13px] font-bold text-slate-700 mb-2">{title}</div>{children}</div>
const Empty = ({ icon, text }) => <div className="text-center text-slate-400 py-24"><div className="text-4xl mb-2">{icon}</div><div className="text-[13px] px-10">{text}</div></div>
function My() {
  return <div className="px-4 pb-4 pt-2 space-y-4">
    <Section title="관심 공항"><div className="flex gap-2 flex-wrap">{['인천(ICN)', '김포(GMP)'].map(a => <span key={a} className="text-[13px] bg-brand-50 text-brand-700 rounded-full px-3 py-1.5">{a}</span>)}</div></Section>
    <Section title="제외 조건 (이런 딜은 숨기기)"><Toggle label="경유 항공권 숨기기" k="no_transfer" /><Toggle label="새벽 출발/도착 숨기기" k="no_dawn" /><Toggle label="수하물 별도(LCC) 숨기기" k="no_lcc" /></Section>
    <Section title="푸시 강도"><div className="text-[13px] text-slate-500">🔥🔥 이상만 받기 (기본) · <span className="text-slate-400">설정은 다음 업데이트</span></div></Section>
    <div className="text-center text-[11px] text-slate-400 pt-2">싸다구항공 · 결제·환불은 판매처 직접, 우린 검수된 딜만</div>
  </div>
}

/* ───────── shell ───────── */
const TABS = [['chat', '💬', '찾기'], ['all', '🔥', '전체'], ['saved', '♡', '찜'], ['my', '👤', '마이']]
export default function App() {
  const [tab, setTab] = useState('chat')
  const [deals, setDeals] = useState(null)
  const [sel, setSel] = useState(null)
  const [savedIds, toggleSave] = useSaved()
  useEffect(() => { fetch(import.meta.env.BASE_URL + 'published.json?' + Date.now()).then(r => r.json()).then(d => setDeals(d.deals || [])).catch(() => setDeals([])) }, [])
  const p = { savedIds, onSave: toggleSave, onOpen: setSel }
  return (
    <div className="max-w-md mx-auto min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#eefbf8]/90 backdrop-blur px-4 pt-6 pb-3">
        <div className="flex items-center gap-2"><span className="text-2xl">✈️</span><h1 className="text-xl font-extrabold">싸다구항공</h1><span className="text-[11px] font-semibold text-brand-700 bg-brand-100 rounded-full px-2 py-0.5">딜 검문소</span></div>
      </header>
      <main className="flex-1 pb-20">
        {deals === null && <Empty icon="⏳" text="불러오는 중…" />}
        {deals && tab === 'chat' && <Chat deals={deals} {...p} />}
        {deals && tab === 'all' && (deals.length ? <AllDeals deals={deals} {...p} /> : <Empty icon="🔎" text="검수된 딜이 아직 없어요." />)}
        {deals && tab === 'saved' && <Saved deals={deals} {...p} />}
        {deals && tab === 'my' && <My />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-100 grid grid-cols-4 pb-[env(safe-area-inset-bottom)] z-40">
        {TABS.map(([k, ic, label]) => <button key={k} onClick={() => setTab(k)} className={'py-2.5 flex flex-col items-center gap-0.5 text-[11px] ' + (tab === k ? 'text-brand-600 font-bold' : 'text-slate-400')}><span className="text-lg leading-none">{ic}</span>{label}</button>)}
      </nav>
      {sel && <DealSheet d={sel} onClose={() => setSel(null)} />}
    </div>
  )
}
