import React, { useEffect, useState } from 'react'

/* ───────── helpers ───────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const won = n => (n == null ? '-' : Number(n).toLocaleString('ko-KR') + '원')
function parseDt(s) { if (!s) return null; const [d, t] = String(s).split(' '); const dt = new Date(d.replace(/-/g, '/') + ' ' + (t || '00:00')); return isNaN(dt) ? null : dt }
function fmtDate(s) { const dt = parseDt(s); if (!dt) return { full: s || '-', weekend: false, month: 0 }; const w = dt.getDay(); return { md: `${dt.getMonth() + 1}/${dt.getDate()}`, dow: DAYS[w], time: (s.split(' ')[1] || ''), weekend: w === 0 || w === 6, month: dt.getMonth() + 1, full: `${dt.getMonth() + 1}/${dt.getDate()}(${DAYS[w]}) ${s.split(' ')[1] || ''}` } }
const moveComfort = f => ({ '좋음': '이동 편해요', '보통': '조금 번거로워요', '나쁨': '많이 번거로워요' }[f] || f)
const comfortStyle = f => ({ '좋음': 'text-brand-700 bg-brand-100', '보통': 'text-amber-700 bg-amber-100', '나쁨': 'text-rose-700 bg-rose-100' }[f] || 'text-slate-600 bg-slate-100')
const safeBooking = g => (g === 'A' || g === 'B') ? { t: '안심 예약처', c: 'bg-brand-500' } : { t: '확인 필요 예약처', c: 'bg-amber-500' }

/* ───────── 지역 매핑 (핫딜 카테고리) ───────── */
const GEO = {
  '일본': ['FUK', 'KIX', 'TYO', 'HND', 'NRT', 'OKA', 'CTS'], '대만': ['TPE', 'KHH'],
  '베트남': ['DAD', 'NHA', 'HAN', 'SGN'], '태국': ['BKK', 'HKT'], '필리핀': ['CEB', 'MNL'],
  '싱가포르': ['SIN'], '중국': ['PVG', 'TAO'], '괌': ['GUM'],
}
const REGION = { '동남아': ['베트남', '태국', '필리핀', '싱가포르'] }
const destOf = d => (d.route || '').split('-')[1] || ''
function byGeo(deals, q) {
  const codes = new Set(); const countries = []
  for (const [r, cs] of Object.entries(REGION)) if (q.includes(r) || r.includes(q)) countries.push(...cs)
  for (const [c, list] of Object.entries(GEO)) if (q.includes(c) || c.includes(q) || countries.includes(c)) list.forEach(x => codes.add(x))
  return deals.filter(d => codes.has(destOf(d)) || (d.city && (d.city.includes(q) || q.includes(d.city))))
}
const CATS = [['all', '전체'], ['일본', '일본'], ['동남아', '동남아'], ['대만', '대만'], ['weekend', '주말 출발'], ['b20', '20만↓'], ['b30', '30만↓']]
function filterCat(deals, cat) {
  if (cat === 'all') return deals
  if (cat === 'weekend') return deals.filter(d => fmtDate(d.departure_time).weekend)
  if (cat === 'b20') return deals.filter(d => d.price <= 200000)
  if (cat === 'b30') return deals.filter(d => d.price <= 300000)
  return byGeo(deals, cat)
}

/* ───────── localStorage ───────── */
function useSaved() {
  const [ids, setIds] = useState(() => { try { return JSON.parse(localStorage.getItem('saved') || '[]') } catch { return [] } })
  const toggle = id => setIds(p => { const n = p.includes(id) ? p.filter(x => x !== id) : [...p, id]; localStorage.setItem('saved', JSON.stringify(n)); return n })
  return [ids, toggle]
}
function report(id, kind) { const l = JSON.parse(localStorage.getItem('reports') || '[]'); l.push({ id, kind, at: new Date().toISOString() }); localStorage.setItem('reports', JSON.stringify(l)); alert('알려줘서 고마워요! 🙏 확인하고 바로 정리할게요.') }

/* ───────── deal card ───────── */
function DealCard({ d, saved, onSave, onOpen }) {
  const dep = fmtDate(d.departure_time)
  return (
    <div className="bg-white rounded-3xl shadow-soft p-4 active:scale-[.99] transition" onClick={() => onOpen(d)}>
      <div className="flex items-start justify-between">
        <div><div className="text-[12px] text-slate-400 font-medium">{d.route} · {d.airline}</div><div className="text-[17px] font-extrabold leading-tight mt-0.5">{d.badge} {d.city}</div></div>
        <button onClick={e => { e.stopPropagation(); onSave(d.id) }} className={'text-xl leading-none px-1 ' + (saved ? 'text-rose-500' : 'text-slate-300')}>♥</button>
      </div>
      <div className="flex items-end gap-2 mt-2">
        <div className="text-2xl font-black text-brand-600">{won(d.price)}</div>
        {d.discount_rate > 0 && <span className="mb-1 text-[12px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">-{d.discount_rate}%</span>}
        <span className="mb-1 text-[11px] text-slate-400">평소 <s>{won(d.normal_price)}</s></span>
      </div>
      <div className="text-[12.5px] text-slate-500 mt-1.5">🛫 <b className={dep.weekend ? 'text-rose-500' : 'text-slate-700'}>{dep.md}({dep.dow})</b> {dep.time}<span className="text-slate-300"> · </span>{d.transfers === 0 ? '직항' : '경유 ' + d.transfers + '회'}{d.duration ? ' · ' + d.duration : ''}</div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className="text-[11px] font-bold text-brand-700 bg-brand-50 rounded-full px-2 py-1">✅ 안심 특가</span>
        <span className={'text-[11px] font-bold rounded-full px-2 py-1 ' + comfortStyle(d.fatigue)}>{moveComfort(d.fatigue)}</span>
        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-1">🧳 {d.carrier_type === 'LCC' ? '수하물 별도 추정' : '수하물 포함 추정'}</span>
      </div>
    </div>
  )
}

/* ───────── detail sheet ───────── */
function DealSheet({ d, onClose }) {
  if (!d) return null
  const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time), hc = d.hidden_cost || {}, insp = d.inspection || {}, sb = safeBooking(d.booking_grade)
  const Row = ({ l, r, s }) => <div className={'flex justify-between ' + (s ? 'font-bold text-brand-700 border-t border-brand-100 pt-1 mt-1' : '')}><span>{l}</span><span>{r}</span></div>
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="sticky top-0 bg-white pt-2 pb-3 px-5 rounded-t-3xl">
          <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between"><div><div className="text-[12px] text-slate-400">{d.route} · {d.airline}</div><div className="text-xl font-extrabold">{d.badge} {d.city}</div></div><button onClick={onClose} className="text-slate-400 text-2xl leading-none">✕</button></div>
          <div className="flex items-end gap-2 mt-1"><div className="text-3xl font-black text-brand-600">{won(d.price)}</div>{d.discount_rate > 0 && <span className="mb-1.5 text-[12px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">평소 대비 -{d.discount_rate}%</span>}</div>
        </div>
        <div className="px-5 pb-8 space-y-4 text-[13px]">
          <div className="text-slate-600">🛫 가는 편 <b className={dep.weekend ? 'text-rose-500' : ''}>{dep.full}</b><br />🛬 오는 편 <b className={ret.weekend ? 'text-rose-500' : ''}>{ret.full}</b><br />{d.transfers === 0 ? '직항' : '경유 ' + d.transfers + '회'} · {d.duration} · <b>{moveComfort(d.fatigue)}</b></div>
          <section className="border border-slate-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-700">🔎 꼼꼼 확인표</h3><span className={'text-[11px] text-white rounded-full px-2 py-0.5 ' + sb.c}>{sb.t}</span></div>
            <div className="text-slate-600 space-y-0.5">
              <div>확인 시각: {insp.checked_at || '-'}</div>
              <div>가격 확인: {insp.price_ok === true ? '✅ 직접 확인했어요' : insp.price_ok === false ? '❌' : '— (확인 예정)'}</div>
              <div>링크 확인: {insp.link_ok === true ? '✅' : insp.link_ok === false ? '❌' : '— (확인 예정)'}</div>
              <div>수하물: {d.baggage_note}</div>
              <div>환불/변경: {insp.refund || '-'}</div>
            </div>
          </section>
          <section className="bg-brand-50/70 rounded-2xl p-4"><h3 className="font-bold text-brand-800 mb-2">💰 진짜 내는 돈</h3><div className="text-slate-700 space-y-0.5">
            <Row l="항공권 표시가" r={won(hc.airfare)} /><Row l="위탁수하물(추정)" r={'+' + won(hc.baggage_est)} /><Row l="eSIM" r={'+' + won(hc.esim)} /><Row l="숙소" r={hc.hotel_note || '별도'} /><Row l="예상 총여행비" r={won(hc.total_est)} s />
          </div></section>
          <section className="grid gap-2"><div className="bg-brand-50 rounded-2xl p-3"><b className="text-brand-700">👍 이런 분께 추천</b><div className="text-slate-600 mt-1">{(d.fit_recommend || []).join(' · ')}</div></div><div className="bg-rose-50 rounded-2xl p-3"><b className="text-rose-600">👎 이런 분껜 비추천</b><div className="text-slate-600 mt-1">{(d.fit_avoid || []).join(' · ')}</div></div></section>
          <a href={d.affiliate_url} target="_blank" rel="noopener" className="block text-center bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">예약하러 가기 →</a>
          <div className="text-center text-[12px] text-slate-400">결제·환불은 항공사/판매처 직접 · 예약 전 실제가 꼭 확인</div>
          <div className="border-t border-slate-100 pt-3"><div className="text-[12px] text-slate-400 mb-2">가격이 다르거나 마감됐나요?</div><div className="grid grid-cols-2 gap-2 text-[12.5px]">{[['price', '가격이 달라요'], ['soldout', '마감됐어요'], ['baggage', '수하물 달라요'], ['link', '링크 이상해요']].map(([k, t]) => <button key={k} onClick={() => report(d.id, k)} className="bg-slate-100 text-slate-600 rounded-xl py-2">{t}</button>)}</div></div>
        </div>
      </div>
    </div>
  )
}

/* ───────── 🔥 핫딜 (본체) ───────── */
function HotDeals({ deals, savedIds, onSave, onOpen }) {
  const [cat, setCat] = useState('all')
  const list = filterCat(deals, cat).sort((a, b) => b.discount_rate - a.discount_rate)
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pt-1 pb-2 sticky top-[60px] z-20 bg-[#eefbf8]/90 backdrop-blur">
        {CATS.map(([k, label]) => <button key={k} onClick={() => setCat(k)} className={'shrink-0 text-[13px] rounded-full px-3.5 py-1.5 font-medium ' + (cat === k ? 'bg-brand-500 text-white' : 'bg-white text-slate-500 border border-slate-200')}>{label}</button>)}
      </div>
      <div className="px-4 pb-4 space-y-3">
        <p className="text-[12.5px] text-slate-500">✅ 사람이 직접 확인한 <b className="text-slate-700">안심 특가</b> {list.length}건</p>
        {list.length ? list.map(d => <DealCard key={d.id} d={d} saved={savedIds.includes(d.id)} onSave={onSave} onOpen={onOpen} />)
          : <Empty icon="🔎" text="이 조건엔 안심 특가가 아직 없어요. 다른 카테고리를 눌러보세요." />}
      </div>
    </div>
  )
}

/* ───────── 🧭 어디 갈까? / ✈️ 항공편 (준비 중) ───────── */
const Soon = ({ icon, title, lines }) => (
  <div className="px-6 pt-10 text-center">
    <div className="text-5xl mb-3">{icon}</div>
    <div className="text-lg font-extrabold mb-1">{title}</div>
    <div className="inline-block text-[11px] font-bold text-brand-700 bg-brand-100 rounded-full px-2.5 py-1 mb-4">곧 만나요</div>
    <div className="text-[13.5px] text-slate-500 leading-relaxed space-y-1">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
  </div>
)
const Where = () => <Soon icon="🧭" title="어디 갈까?" lines={['언제 · 누구랑 · 예산 · 분위기만 고르면', '딱 맞는 여행지를 추천해드려요.', '', '“이번 달 30만원, 커플, 맛집” →', '후쿠오카·타이베이 + 지금 뜬 특가까지.']} />
const Flights = () => <Soon icon="✈️" title="항공편 둘러보기" lines={['출발·도착·날짜를 직접 넣고', '항공권을 둘러보는 기능이에요.', '', '※ 최근 발견된 참고가 기준이며', '실제 결제가는 예약처에서 확인해요.']} />

/* ───────── ♡ 찜 / 👤 마이 ───────── */
function Saved({ deals, savedIds, onSave, onOpen }) {
  const list = deals.filter(d => savedIds.includes(d.id))
  if (!list.length) return <Empty icon="♡" text="찜한 특가가 없어요. 카드의 하트를 눌러 저장하세요." />
  return <div className="px-4 space-y-3 pt-2 pb-4">{list.map(d => <DealCard key={d.id} d={d} saved onSave={onSave} onOpen={onOpen} />)}</div>
}
function Toggle({ label, k }) {
  const [on, setOn] = useState(() => localStorage.getItem('opt_' + k) === '1')
  return <button onClick={() => { const n = !on; setOn(n); localStorage.setItem('opt_' + k, n ? '1' : '0') }} className="w-full flex items-center justify-between py-2.5"><span className="text-slate-700 text-[14px]">{label}</span><span className={'w-11 h-6 rounded-full p-0.5 transition ' + (on ? 'bg-brand-500' : 'bg-slate-200')}><span className={'block w-5 h-5 bg-white rounded-full transition ' + (on ? 'translate-x-5' : '')} /></span></button>
}
const Section = ({ title, children }) => <div className="bg-white rounded-2xl shadow-soft p-4"><div className="text-[13px] font-bold text-slate-700 mb-2">{title}</div>{children}</div>
const Empty = ({ icon, text }) => <div className="text-center text-slate-400 py-20"><div className="text-4xl mb-2">{icon}</div><div className="text-[13px] px-10">{text}</div></div>
const My = () => <div className="px-4 pb-4 pt-2 space-y-4">
  <Section title="관심 공항"><div className="flex gap-2 flex-wrap">{['인천(ICN)', '김포(GMP)'].map(a => <span key={a} className="text-[13px] bg-brand-50 text-brand-700 rounded-full px-3 py-1.5">{a}</span>)}</div></Section>
  <Section title="이런 특가는 숨기기"><Toggle label="경유 항공권 숨기기" k="no_transfer" /><Toggle label="새벽 출발/도착 숨기기" k="no_dawn" /><Toggle label="수하물 별도(LCC) 숨기기" k="no_lcc" /></Section>
  <Section title="특가 알림"><div className="text-[13px] text-slate-500">🔥🔥 이상만 받기 (기본) · <span className="text-slate-400">알림은 다음 업데이트</span></div></Section>
  <div className="text-center text-[11px] text-slate-400 pt-2">싸다구항공 · 결제·환불은 판매처 직접, 우린 안심 특가만 골라드려요</div>
</div>

/* ───────── shell ───────── */
const TABS = [['hot', '🔥', '핫딜'], ['where', '🧭', '어디 갈까?'], ['flights', '✈️', '항공편'], ['saved', '♡', '찜'], ['my', '👤', '마이']]
export default function App() {
  const [tab, setTab] = useState('hot')
  const [deals, setDeals] = useState(null)
  const [sel, setSel] = useState(null)
  const [savedIds, toggleSave] = useSaved()
  useEffect(() => { fetch(import.meta.env.BASE_URL + 'published.json?' + Date.now()).then(r => r.json()).then(d => setDeals(d.deals || [])).catch(() => setDeals([])) }, [])
  const p = { savedIds, onSave: toggleSave, onOpen: setSel }
  return (
    <div className="max-w-md mx-auto min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#eefbf8]/90 backdrop-blur px-4 pt-6 pb-2">
        <div className="flex items-center gap-2"><span className="text-2xl">✈️</span><h1 className="text-xl font-extrabold">싸다구항공</h1></div>
        <p className="text-[12px] text-slate-500 mt-0.5">검색하기 전에, 안심 특가만 골라드려요</p>
      </header>
      <main className="flex-1 pb-20">
        {deals === null && <Empty icon="⏳" text="불러오는 중…" />}
        {deals && tab === 'hot' && (deals.length ? <HotDeals deals={deals} {...p} /> : <Empty icon="🔎" text="안심 특가가 아직 없어요." />)}
        {deals && tab === 'where' && <Where />}
        {deals && tab === 'flights' && <Flights />}
        {deals && tab === 'saved' && <Saved deals={deals} {...p} />}
        {deals && tab === 'my' && <My />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-100 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] z-40">
        {TABS.map(([k, ic, label]) => <button key={k} onClick={() => setTab(k)} className={'py-2.5 flex flex-col items-center gap-0.5 text-[10.5px] ' + (tab === k ? 'text-brand-600 font-bold' : 'text-slate-400')}><span className="text-lg leading-none">{ic}</span>{label}</button>)}
      </nav>
      {sel && <DealSheet d={sel} onClose={() => setSel(null)} />}
    </div>
  )
}
