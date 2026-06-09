import React, { useEffect, useState } from 'react'
import { DESTINATIONS } from './destinations'

/* ───────── helpers ───────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const won = n => (n == null ? '-' : Number(n).toLocaleString('ko-KR') + '원')
function parseDt(s) { if (!s) return null; const [d, t] = String(s).split(' '); const dt = new Date(d.replace(/-/g, '/') + ' ' + (t || '00:00')); return isNaN(dt) ? null : dt }
function fmtDate(s) { const dt = parseDt(s); if (!dt) return { full: s || '-', weekend: false, month: 0 }; const w = dt.getDay(); return { md: `${dt.getMonth() + 1}/${dt.getDate()}`, dow: DAYS[w], time: (s.split(' ')[1] || ''), weekend: w === 0 || w === 6, month: dt.getMonth() + 1, full: `${dt.getMonth() + 1}/${dt.getDate()}(${DAYS[w]}) ${s.split(' ')[1] || ''}` } }
const moveComfort = f => ({ '좋음': '이동 편해요', '보통': '조금 번거로워요', '나쁨': '많이 번거로워요' }[f] || f)
const comfortStyle = f => ({ '좋음': 'text-brand-700 bg-brand-100', '보통': 'text-amber-700 bg-amber-100', '나쁨': 'text-rose-700 bg-rose-100' }[f] || 'text-slate-600 bg-slate-100')
const safeBooking = g => (g === 'A' || g === 'B') ? { t: '안심 예약처', c: 'bg-brand-500' } : { t: '확인 필요 예약처', c: 'bg-amber-500' }

/* 확인가 비교(price_check): 우리가 싸게 파는 게 아니라, 여러 채널을 확인해서 보여준다.
   톤 = '이겼다'❌ '여러 채널 확인'✅. ref_actual≠ref_price면 팬텀, 아니면 가격차로 3-케이스 분기. */
function priceCheckView(pc) {
  if (!pc || pc.our_price == null) return null
  const ref = pc.ref_channel || '비교 채널', our = pc.our_channel || '우리가 확인한 곳'
  const chs = (pc.channels && pc.channels.length) ? pc.channels : [ref, our].filter(Boolean)
  const refP = pc.ref_price, ourP = pc.our_price, actual = pc.ref_actual
  let kind, short, line
  if (actual != null && refP != null && actual !== refP) {
    kind = 'phantom'; short = `${ref} 표시가 ≠ 실제가`
    line = `${ref} 표시가 ${won(refP)} → 클릭 후 실제가 ${won(actual)} · ${our} ${won(ourP)} 확인`
  } else if (refP == null) {
    kind = 'checked'; short = `${won(ourP)} 확인`; line = `${our} ${won(ourP)} 확인`
  } else {
    const diff = refP - ourP
    if (diff > 0) { kind = 'lower'; short = `${ref} 대비 -${won(diff)}`; line = `${ref} ${won(refP)} → ${our} ${won(ourP)} · ${won(diff)} 낮게 확인` }
    else if (diff === 0) { kind = 'same'; short = `${ref}와 동일가`; line = `${ref}·${our} 모두 ${won(ourP)} · 동일가 확인` }
    else { kind = 'refcheaper'; short = `${ref}가 최저`; line = `최저는 ${ref} ${won(refP)} · ${our} ${won(ourP)} 확인` }
  }
  return { kind, channels: chs, short, line, warn: kind === 'phantom', card: `${chs.length}개 채널 확인${kind === 'checked' ? '' : ' · ' + short}` }
}

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
  const pcv = priceCheckView(d.price_check)
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
      {pcv && <div className={'mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold rounded-lg px-2 py-1 ' + (pcv.warn ? 'text-amber-700 bg-amber-50' : 'text-brand-700 bg-brand-50')}>🔍 {pcv.card}</div>}
    </div>
  )
}

/* ───────── detail sheet ───────── */
function DealSheet({ d, onClose }) {
  if (!d) return null
  const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time), hc = d.hidden_cost || {}, insp = d.inspection || {}, sb = safeBooking(d.booking_grade)
  const pcv = priceCheckView(d.price_check)
  const Row = ({ l, r, s }) => <div className={'flex justify-between ' + (s ? 'font-bold text-brand-700 border-t border-brand-100 pt-1 mt-1' : '')}><span>{l}</span><span>{r}</span></div>
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="sticky top-0 bg-white pt-2 pb-3 px-5 rounded-t-3xl">
          <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-2" />
          <button onClick={onClose} className="text-[13px] text-slate-500 font-bold mb-2">← 뒤로</button>
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
              {pcv && <div className="pt-1.5 mt-1.5 border-t border-slate-100 space-y-0.5">
                <div>비교 확인: {pcv.channels.join(' / ')} 확인</div>
                <div className={'font-bold ' + (pcv.warn ? 'text-amber-700' : 'text-brand-700')}>결과: {pcv.line}</div>
                {d.price_check.memo && <div className="text-[12px] text-slate-400">메모: {d.price_check.memo}</div>}
              </div>}
            </div>
          </section>
          <section className="bg-brand-50/70 rounded-2xl p-4"><h3 className="font-bold text-brand-800 mb-2">💰 진짜 내는 돈</h3><div className="text-slate-700 space-y-0.5">
            <Row l="항공권 표시가" r={won(hc.airfare)} /><Row l="위탁수하물(추정)" r={'+' + won(hc.baggage_est)} /><Row l="eSIM" r={'+' + won(hc.esim)} /><Row l="숙소" r={hc.hotel_note || '별도'} /><Row l="예상 총여행비" r={won(hc.total_est)} s />
          </div><div className="text-[11px] text-slate-400 mt-2">※ 수하물·좌석 등 일부는 항공사 유형 기준 예상값이에요. 예약 전 결제화면에서 확인하세요.</div></section>
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
const Q_WHEN = ['이번 달', '다음 달', '3개월 안', '연휴', '상관없음']
const Q_WHO = ['혼자', '커플', '친구', '가족', '부모님']
const Q_BUDGET = [['20만대', 299000], ['30만대', 399000], ['50만대', 599000], ['상관없음', 9e12]]
const Q_MOOD = ['맛집', '쇼핑', '휴양', '바다', '자연', '도시', '온천']
const Q_FLIGHT = [['짧게 (3시간 이내)', 180], ['상관없음', 9999]]
const Chip = ({ on, children, onClick }) => <button onClick={onClick} className={'text-[13px] rounded-full px-3.5 py-2 font-medium border ' + (on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200')}>{children}</button>
const QGroup = ({ title, children }) => <div className="mb-4"><div className="text-[13px] font-bold text-slate-700 mb-2">{title}</div><div className="flex flex-wrap gap-2">{children}</div></div>
function scoreDest(d, { who, budgetMax, moods, flightMax }) {
  let s = 0
  moods.forEach(m => { if (d.themes.includes(m)) s += 3 })
  if (who) { if (d.goodFor.includes(who)) s += 3; if (d.badFor.includes(who)) s -= 5 }
  s += d.budgetMin <= budgetMax ? 2 : -2
  if (flightMax <= 180) s += d.flightMin <= 180 ? 3 : -4
  return s
}
function whyReasons(d, { who, budgetMax, moods, flightMax }) {
  const r = []
  if (flightMax <= 180 && d.flightMin <= 180) r.push(`비행 ${Math.round(d.flightMin / 6) / 10}시간 정도로 짧아요`)
  const mm = moods.filter(m => d.themes.includes(m)); if (mm.length) r.push(`${mm.join('·')} 분위기와 잘 맞아요`)
  if (who && d.goodFor.includes(who)) r.push(`${who} 여행에 좋아요`)
  if (d.budgetMin <= budgetMax) r.push(`예산 ${d.budget}대로 가능해요`)
  if (!r.length) r.push('전반적으로 무난한 여행지예요')
  return r
}
function Where({ deals, onOpen }) {
  const [who, setWho] = useState(null), [when, setWhen] = useState(null), [budgetMax, setB] = useState(null), [moods, setMoods] = useState([]), [flightMax, setF] = useState(null), [results, setResults] = useState(null)
  const toggleMood = m => setMoods(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m])
  function recommend() {
    const cond = { who, budgetMax: budgetMax ?? 9e12, moods, flightMax: flightMax ?? 9999 }
    const ranked = [...DESTINATIONS].map(d => ({ d, s: scoreDest(d, cond) })).sort((a, b) => b.s - a.s).slice(0, 3)
    setResults(ranked.map(({ d }) => ({ d, deal: deals.filter(x => d.codes.includes((x.route || '').split('-')[1])).sort((a, b) => a.price - b.price)[0], why: whyReasons(d, cond) })))
  }
  function saveAlert(d) {
    const w = JSON.parse(localStorage.getItem('wishlist') || '[]'); w.push({ name: d.name, codes: d.codes, who, when, budgetMax, moods, at: new Date().toISOString() }); localStorage.setItem('wishlist', JSON.stringify(w))
    alert(`${d.name} 조건 알림 신청 완료! 🔔\n이 조건에 맞는 안심 특가가 뜨면 알려드릴게요.`)
  }
  if (results) return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      <button onClick={() => setResults(null)} className="text-[13px] text-brand-600 font-bold">← 다시 고르기</button>
      <p className="text-[13px] text-slate-500">조건에 맞는 여행지 <b className="text-slate-700">{results.length}곳</b>이에요</p>
      {results.map(({ d, deal, why }) => (
        <div key={d.name} className="bg-white rounded-3xl shadow-soft p-4">
          <div className="text-lg font-extrabold">📍 {d.name} <span className="text-[12px] text-slate-400 font-medium">{d.country} · 비행 {Math.round(d.flightMin / 6) / 10}h</span></div>
          <div className="mt-2 text-[13px]"><b className="text-brand-700">왜 맞나요?</b><ul className="text-slate-600 mt-1 list-disc list-inside space-y-0.5">{why.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          {d.caution.length > 0 && <div className="mt-2 text-[12.5px] text-amber-700">⚠️ {d.caution.join(' · ')}</div>}
          <div className="mt-3">
            {deal
              ? <div onClick={() => onOpen(deal)} className="cursor-pointer bg-brand-50 rounded-2xl p-3 flex items-center justify-between"><div><div className="text-[12px] text-brand-700 font-bold">지금 볼 만한 안심 특가</div><div className="font-extrabold text-brand-700">{deal.city} 왕복 {Number(deal.price).toLocaleString('ko-KR')}원</div></div><span className="text-brand-500 text-xl">›</span></div>
              : <button onClick={() => saveAlert(d)} className="w-full bg-slate-100 text-slate-600 rounded-2xl py-3 text-[13px] font-bold">현재 안심 특가 없음 · 🔔 이 조건 알림받기</button>}
          </div>
        </div>
      ))}
    </div>
  )
  return (
    <div className="px-4 pt-2 pb-4">
      <p className="text-[13px] text-slate-500 mb-4">어디 갈지 모르겠으면, 몇 개만 골라보세요 👇</p>
      <QGroup title="누구랑 가세요?">{Q_WHO.map(x => <Chip key={x} on={who === x} onClick={() => setWho(x)}>{x}</Chip>)}</QGroup>
      <QGroup title="예산은요? (1인 왕복)">{Q_BUDGET.map(([l, v]) => <Chip key={l} on={budgetMax === v} onClick={() => setB(v)}>{l}</Chip>)}</QGroup>
      <QGroup title="무슨 분위기를 원해요? (여러 개)">{Q_MOOD.map(x => <Chip key={x} on={moods.includes(x)} onClick={() => toggleMood(x)}>{x}</Chip>)}</QGroup>
      <QGroup title="비행시간은요?">{Q_FLIGHT.map(([l, v]) => <Chip key={l} on={flightMax === v} onClick={() => setF(v)}>{l}</Chip>)}</QGroup>
      <QGroup title="언제 가세요?">{Q_WHEN.map(x => <Chip key={x} on={when === x} onClick={() => setWhen(x)}>{x}</Chip>)}</QGroup>
      <button onClick={recommend} className="w-full bg-brand-500 text-white font-bold rounded-2xl py-3.5 mt-2">여행지 추천받기 ✨</button>
    </div>
  )
}
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
        {deals && tab === 'where' && <Where deals={deals} onOpen={setSel} />}
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
