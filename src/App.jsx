import React, { useEffect, useMemo, useState } from 'react'

/* ───────── helpers ───────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const won = n => (n == null ? '-' : Number(n).toLocaleString('ko-KR') + '원')

function parseDt(s) {
  if (!s) return null
  const [d, t] = String(s).split(' ')
  const dt = new Date(d.replace(/-/g, '/') + ' ' + (t || '00:00'))
  return isNaN(dt) ? null : dt
}
function fmtDate(s) {
  const dt = parseDt(s)
  if (!dt) return { full: s || '-', weekend: false, month: 0 }
  const dow = dt.getDay()
  return {
    md: `${dt.getMonth() + 1}/${dt.getDate()}`,
    dow: DAYS[dow],
    time: s.split(' ')[1] || '',
    weekend: dow === 0 || dow === 6,
    month: dt.getMonth() + 1,
    full: `${dt.getMonth() + 1}/${dt.getDate()}(${DAYS[dow]}) ${s.split(' ')[1] || ''}`,
  }
}
const fatigueStyle = f => ({ '좋음': 'text-brand-700 bg-brand-100', '보통': 'text-amber-700 bg-amber-100', '나쁨': 'text-rose-700 bg-rose-100' }[f] || 'text-slate-600 bg-slate-100')
const gradeStyle = g => (g === 'A' ? 'bg-brand-600' : g === 'B' ? 'bg-brand-500' : g === 'C' ? 'bg-amber-500' : g === 'D' ? 'bg-rose-500' : 'bg-slate-400')
const statusLabel = s => ({ published: '검수완료', sample: '검수 샘플', auto: '자동발견', closed: '마감' }[s] || '검수 대기')

/* ───────── localStorage hooks ───────── */
function useSaved() {
  const [ids, setIds] = useState(() => { try { return JSON.parse(localStorage.getItem('saved') || '[]') } catch { return [] } })
  const toggle = id => setIds(prev => { const n = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; localStorage.setItem('saved', JSON.stringify(n)); return n })
  return [ids, toggle]
}
function report(id, kind) {
  const log = JSON.parse(localStorage.getItem('reports') || '[]')
  log.push({ id, kind, at: new Date().toISOString() })
  localStorage.setItem('reports', JSON.stringify(log))
  alert('신고 접수했어요. 감사합니다! 🙏\n운영자가 확인 후 정정/마감 처리합니다.')
}

/* ───────── deal card ───────── */
function DealCard({ d, saved, onSave, onOpen }) {
  const dep = fmtDate(d.departure_time)
  const ret = fmtDate(d.return_time)
  return (
    <div className="bg-white rounded-3xl shadow-soft p-4 active:scale-[.99] transition" onClick={() => onOpen(d)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] text-slate-400 font-medium">{d.route} · {d.airline}</div>
          <div className="text-[17px] font-extrabold leading-tight mt-0.5">{d.badge} {d.city}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onSave(d.id) }}
          className={'text-xl leading-none px-1 ' + (saved ? 'text-rose-500' : 'text-slate-300')}>♥</button>
      </div>

      <div className="flex items-end gap-2 mt-2">
        <div className="text-2xl font-black text-brand-600">{won(d.price)}</div>
        {d.discount_rate > 0 && <span className="mb-1 text-[12px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">-{d.discount_rate}%</span>}
        <span className="mb-1 text-[11px] text-slate-400">평소 <s>{won(d.normal_price)}</s></span>
      </div>

      <div className="text-[12.5px] text-slate-500 mt-1.5">
        🛫 <b className={dep.weekend ? 'text-rose-500' : 'text-slate-700'}>{dep.md}({dep.dow})</b> {dep.time}
        <span className="text-slate-300"> · </span>{d.transfers === 0 ? '직항' : '경유 ' + d.transfers + '회'}{d.duration ? ' · ' + d.duration : ''}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className="text-[11px] font-bold text-brand-700 bg-brand-50 rounded-full px-2 py-1">✅ {statusLabel(d.status)}</span>
        <span className={'text-[11px] font-bold rounded-full px-2 py-1 ' + fatigueStyle(d.fatigue)}>피로도 {d.fatigue}</span>
        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-1">🧳 {d.carrier_type === 'LCC' ? '수하물 별도 추정' : '수하물 포함 추정'}</span>
      </div>
    </div>
  )
}

/* ───────── detail bottom sheet ───────── */
function DealSheet({ d, onClose }) {
  if (!d) return null
  const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time)
  const hc = d.hidden_cost || {}, insp = d.inspection || {}
  const Row = ({ l, r, strong }) => (
    <div className={'flex justify-between ' + (strong ? 'font-bold text-brand-700 border-t border-brand-100 pt-1 mt-1' : '')}><span>{l}</span><span>{r}</span></div>
  )
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="sticky top-0 bg-white pt-2 pb-3 px-5 rounded-t-3xl">
          <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[12px] text-slate-400">{d.route} · {d.airline}</div>
              <div className="text-xl font-extrabold">{d.badge} {d.city}</div>
            </div>
            <button onClick={onClose} className="text-slate-400 text-2xl leading-none">✕</button>
          </div>
          <div className="flex items-end gap-2 mt-1">
            <div className="text-3xl font-black text-brand-600">{won(d.price)}</div>
            {d.discount_rate > 0 && <span className="mb-1.5 text-[12px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">평소 대비 -{d.discount_rate}%</span>}
          </div>
        </div>

        <div className="px-5 pb-8 space-y-4 text-[13px]">
          <div className="text-slate-600">
            🛫 가는 편 <b className={dep.weekend ? 'text-rose-500' : ''}>{dep.full}</b><br />
            🛬 오는 편 <b className={ret.weekend ? 'text-rose-500' : ''}>{ret.full}</b><br />
            {d.transfers === 0 ? '직항' : '경유 ' + d.transfers + '회'} · {d.duration} · 피로도 <b>{d.fatigue}</b>
          </div>

          {/* 검수 영수증 */}
          <section className="border border-slate-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-700">🔎 검수 영수증</h3>
              <span className={'text-[11px] text-white rounded-full px-2 py-0.5 ' + gradeStyle(d.booking_grade)}>예약처 {d.booking_grade}</span>
            </div>
            <div className="text-slate-600 space-y-0.5">
              <div>확인 시각: {insp.checked_at || '-'}</div>
              <div>가격 확인: {insp.price_ok === true ? '✅' : insp.price_ok === false ? '❌' : '— (검수 예정)'}</div>
              <div>링크 확인: {insp.link_ok === true ? '✅' : insp.link_ok === false ? '❌' : '— (검수 예정)'}</div>
              <div>수하물: {d.baggage_note}</div>
              <div>환불/변경: {insp.refund || '-'}</div>
            </div>
          </section>

          {/* 숨은비용 레이더 */}
          <section className="bg-brand-50/70 rounded-2xl p-4">
            <h3 className="font-bold text-brand-800 mb-2">💰 숨은비용 레이더</h3>
            <div className="text-slate-700 space-y-0.5">
              <Row l="항공권 표시가" r={won(hc.airfare)} />
              <Row l="위탁수하물(추정)" r={'+' + won(hc.baggage_est)} />
              <Row l="eSIM" r={'+' + won(hc.esim)} />
              <Row l="숙소" r={hc.hotel_note || '별도'} />
              <Row l="예상 총여행비" r={won(hc.total_est)} strong />
            </div>
          </section>

          {/* 추천 / 비추천 */}
          <section className="grid grid-cols-1 gap-2">
            <div className="bg-brand-50 rounded-2xl p-3"><b className="text-brand-700">👍 추천</b><div className="text-slate-600 mt-1">{(d.fit_recommend || []).join(' · ')}</div></div>
            <div className="bg-rose-50 rounded-2xl p-3"><b className="text-rose-600">👎 비추천</b><div className="text-slate-600 mt-1">{(d.fit_avoid || []).join(' · ')}</div></div>
          </section>

          {/* 액션 */}
          <a href={d.affiliate_url} target="_blank" rel="noopener"
            className="block text-center bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">예약 보러가기 →</a>
          <div className="text-center text-[12px] text-slate-400">결제·환불은 항공사/판매처에서 직접 · 예약 전 실제가 꼭 확인</div>

          <div className="border-t border-slate-100 pt-3">
            <div className="text-[12px] text-slate-400 mb-2">가격이 다르거나 마감됐나요?</div>
            <div className="grid grid-cols-2 gap-2 text-[12.5px]">
              {[['price', '가격이 달라요'], ['soldout', '마감됐어요'], ['baggage', '수하물 달라요'], ['link', '링크 이상해요']].map(([k, t]) =>
                <button key={k} onClick={() => report(d.id, k)} className="bg-slate-100 text-slate-600 rounded-xl py-2">{t}</button>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── screens ───────── */
function Today({ deals, ...p }) {
  const sorted = [...deals].sort((a, b) => b.discount_rate - a.discount_rate)
  return (
    <div className="px-4 space-y-3 pb-4">
      <p className="text-[13px] text-slate-500 pt-1">사람이 검수한 딜만 올립니다. <b className="text-slate-700">잡아도 되는 이유</b>를 함께 봐요.</p>
      {sorted.map(d => <DealCard key={d.id} d={d} saved={p.savedIds.includes(d.id)} onSave={p.onSave} onOpen={p.onOpen} />)}
    </div>
  )
}
function Monthly({ deals, ...p }) {
  const groups = useMemo(() => {
    const g = {}
    deals.forEach(d => { const m = fmtDate(d.departure_time).month || 0; (g[m] = g[m] || []).push(d) })
    return Object.entries(g).sort((a, b) => a[0] - b[0])
  }, [deals])
  return (
    <div className="px-4 pb-4">
      <p className="text-[13px] text-slate-500 py-1">출발 <b>월별</b>로 검수된 딜을 모았어요. <span className="text-slate-400">(전체 날짜 최저가 아님 — 검수된 딜만)</span></p>
      {groups.map(([m, list]) => (
        <div key={m} className="mt-3">
          <div className="text-[15px] font-extrabold text-brand-700 mb-2">{m}월 출발 딜 <span className="text-slate-400 text-[12px] font-medium">{list.length}건</span></div>
          <div className="space-y-3">{list.map(d => <DealCard key={d.id} d={d} saved={p.savedIds.includes(d.id)} onSave={p.onSave} onOpen={p.onOpen} />)}</div>
        </div>
      ))}
    </div>
  )
}
function Saved({ deals, savedIds, ...p }) {
  const list = deals.filter(d => savedIds.includes(d.id))
  if (!list.length) return <Empty icon="♡" text="찜한 딜이 없어요. 카드의 하트를 눌러 저장하세요." />
  return <div className="px-4 space-y-3 pt-2 pb-4">{list.map(d => <DealCard key={d.id} d={d} saved={savedIds.includes(d.id)} onSave={p.onSave} onOpen={p.onOpen} />)}</div>
}

function Toggle({ label, k }) {
  const [on, setOn] = useState(() => localStorage.getItem('opt_' + k) === '1')
  return (
    <button onClick={() => { const n = !on; setOn(n); localStorage.setItem('opt_' + k, n ? '1' : '0') }}
      className="w-full flex items-center justify-between py-2.5">
      <span className="text-slate-700 text-[14px]">{label}</span>
      <span className={'w-11 h-6 rounded-full p-0.5 transition ' + (on ? 'bg-brand-500' : 'bg-slate-200')}>
        <span className={'block w-5 h-5 bg-white rounded-full transition ' + (on ? 'translate-x-5' : '')} />
      </span>
    </button>
  )
}
function My() {
  return (
    <div className="px-4 pb-4 pt-2 space-y-4">
      <Section title="관심 공항">
        <div className="flex gap-2 flex-wrap">{['인천(ICN)', '김포(GMP)'].map(a => <span key={a} className="text-[13px] bg-brand-50 text-brand-700 rounded-full px-3 py-1.5">{a}</span>)}</div>
      </Section>
      <Section title="제외 조건 (이런 딜은 숨기기)">
        <Toggle label="경유 항공권 숨기기" k="no_transfer" />
        <Toggle label="새벽 출발/도착 숨기기" k="no_dawn" />
        <Toggle label="수하물 별도(LCC) 숨기기" k="no_lcc" />
        <Toggle label="3박 미만 일정 숨기기" k="no_short" />
      </Section>
      <Section title="푸시 강도">
        <div className="text-[13px] text-slate-500">🔥🔥 이상만 받기 (기본) · <span className="text-slate-400">설정/푸시는 다음 업데이트에서</span></div>
      </Section>
      <div className="text-center text-[11px] text-slate-400 pt-2">싸다구항공 · 결제·환불은 판매처 직접, 우린 검수된 딜만 안내</div>
    </div>
  )
}
const Section = ({ title, children }) => (
  <div className="bg-white rounded-2xl shadow-soft p-4"><div className="text-[13px] font-bold text-slate-700 mb-2">{title}</div>{children}</div>
)
const Empty = ({ icon, text }) => (
  <div className="text-center text-slate-400 py-24"><div className="text-4xl mb-2">{icon}</div><div className="text-[13px] px-10">{text}</div></div>
)

/* ───────── app shell ───────── */
const TABS = [['today', '🔥', '오늘'], ['monthly', '📆', '월별'], ['saved', '♡', '찜'], ['my', '👤', '마이']]

export default function App() {
  const [tab, setTab] = useState('today')
  const [deals, setDeals] = useState(null)
  const [note, setNote] = useState('')
  const [sel, setSel] = useState(null)
  const [savedIds, toggleSave] = useSaved()

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'published.json?' + Date.now())
      .then(r => r.json()).then(d => { setDeals(d.deals || []); setNote(d.note || '') })
      .catch(() => setDeals([]))
  }, [])

  const screenProps = { savedIds, onSave: toggleSave, onOpen: setSel }

  return (
    <div className="max-w-md mx-auto min-h-full flex flex-col">
      {/* header */}
      <header className="sticky top-0 z-30 bg-[#eefbf8]/90 backdrop-blur px-4 pt-6 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✈️</span>
          <h1 className="text-xl font-extrabold">싸다구항공</h1>
          <span className="text-[11px] font-semibold text-brand-700 bg-brand-100 rounded-full px-2 py-0.5">딜 검문소</span>
        </div>
      </header>

      {note && <div className="mx-4 mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">ℹ️ {note}</div>}

      {/* body */}
      <main className="flex-1 pb-24">
        {deals === null && <Empty icon="⏳" text="검수된 딜을 불러오는 중…" />}
        {deals && deals.length === 0 && <Empty icon="🔎" text="오늘 검수된 딜이 아직 없어요." />}
        {deals && deals.length > 0 && (
          <DealList tab={tab} deals={deals} {...screenProps} />
        )}
      </main>

      {/* bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-100 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([k, ic, label]) => (
          <button key={k} onClick={() => setTab(k)} className={'py-2.5 flex flex-col items-center gap-0.5 text-[11px] ' + (tab === k ? 'text-brand-600 font-bold' : 'text-slate-400')}>
            <span className="text-lg leading-none">{ic}</span>{label}
          </button>
        ))}
      </nav>

      {sel && <DealSheet d={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

function DealList({ tab, deals, ...p }) {
  if (tab === 'today') return <Today deals={deals} {...p} />
  if (tab === 'monthly') return <Monthly deals={deals} {...p} />
  if (tab === 'saved') return <Saved deals={deals} {...p} />
  return <My />
}
