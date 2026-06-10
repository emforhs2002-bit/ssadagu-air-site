import React, { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { DESTINATIONS } from './destinations'
import { COUNTRY_INFO, VISA_NOTE } from './planner'
import { vt, haptic, shareIt, useCountUp, Sheet, SearchOverlay, StepRow, MadLib, SkelRows } from './ui'
import { HOLIDAYS, upcomingWeekends } from './holidays'
const Hotels = lazy(() => import('./Hotels'))

/* ───────── helpers ───────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const won = n => (n == null ? '-' : Number(n).toLocaleString('ko-KR') + '원')
function parseDt(s) { if (!s) return null; const [d, t] = String(s).split(' '); const dt = new Date(d.replace(/-/g, '/') + ' ' + (t || '00:00')); return isNaN(dt) ? null : dt }
function fmtDate(s) { const dt = parseDt(s); if (!dt) return { full: s || '-', weekend: false, month: 0 }; const w = dt.getDay(); return { md: `${dt.getMonth() + 1}/${dt.getDate()}`, dow: DAYS[w], time: (s.split(' ')[1] || ''), weekend: w === 0 || w === 6, month: dt.getMonth() + 1, full: `${dt.getMonth() + 1}/${dt.getDate()}(${DAYS[w]}) ${s.split(' ')[1] || ''}` } }
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
  const cards = { lower: '💰 최저가', same: '💰 최저가', checked: '💰 최저가', phantom: '⚠️ 표시가와 실제가 달라요', refcheaper: '🔍 여러 채널 확인' }
  return { kind, channels: chs, short, line, warn: kind === 'phantom', card: cards[kind] }
}

/* ───────── 지역 매핑 (핫딜 카테고리) ───────── */
const GEO = {
  '일본': ['FUK', 'KIX', 'TYO', 'HND', 'NRT', 'OKA', 'CTS'], '대만': ['TPE', 'KHH'],
  '베트남': ['DAD', 'NHA', 'HAN', 'SGN'], '태국': ['BKK', 'HKT'], '필리핀': ['CEB', 'MNL'],
  '싱가포르': ['SIN'], '중국': ['PVG', 'TAO'], '괌': ['GUM'],
}
const REGION = { '동남아': ['베트남', '태국', '필리핀', '싱가포르'] }
const destOf = d => (d.route || '').split('-')[1] || ''
const ORIGIN_NAME = { ICN: '인천', GMP: '김포', PUS: '부산' }
const originOf = d => ORIGIN_NAME[(d.route || '').split('-')[0]] || ''
// 엔진 duration은 왕복 합산 비행시간 — '직항 9시간 30분' 오해 방지 위해 '왕복' 명시
const durOf = d => {
  if (!d.duration) return ''
  const m = +d.duration
  if (m > 0) return `왕복 ${Math.floor(m / 60)}시간 ${m % 60 ? m % 60 + '분' : ''}`.trim()
  return typeof d.duration === 'string' ? '왕복 ' + d.duration : ''
}
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

/* ───────── 목적지 사진(번들) + 항공사 로고 ───────── */
const DEST_PHOTO = { FUK: 'fukuoka', KIX: 'osaka', TYO: 'tokyo', NRT: 'tokyo', HND: 'tokyo', OKA: 'okinawa', CTS: 'sapporo', TPE: 'taipei', KHH: 'kaohsiung', DAD: 'danang', NHA: 'nhatrang', HAN: 'hanoi', SGN: 'hochiminh', BKK: 'bangkok', HKT: 'phuket', CEB: 'cebu', MNL: 'manila', BKI: 'kota', HKG: 'hongkong', SIN: 'singapore', GUM: 'guam' }
const photoOf = d => { const s = DEST_PHOTO[destOf(d)]; return s ? import.meta.env.BASE_URL + 'dest/' + s + '.jpg' : null }
const photoBySlug = s => import.meta.env.BASE_URL + 'dest/' + s + '.jpg'
const AIRLINE_IATA = { '대한항공': 'KE', '아시아나항공': 'OZ', '아시아나': 'OZ', '제주항공': '7C', '진에어': 'LJ', '티웨이항공': 'TW', '티웨이': 'TW', '에어부산': 'BX', '에어서울': 'RS', '이스타항공': 'ZE', '에어프레미아': 'YP', '세부퍼시픽': '5J', '세부퍼시픽항공': '5J', '비엣젯': 'VJ', '비엣젯항공': 'VJ', '베트남항공': 'VN', '피치': 'MM', '피치항공': 'MM', '에어아시아': 'AK', '타이에어아시아': 'FD', '스쿠트': 'TR', '필리핀항공': 'PR', '캐세이퍼시픽': 'CX', '홍콩익스프레스': 'UO', '싱가포르항공': 'SQ', '타이항공': 'TG', '전일본공수': 'NH', 'ANA': 'NH', '일본항공': 'JL', 'JAL': 'JL', '스타럭스': 'JX', '중화항공': 'CI', '에바항공': 'BR', '유나이티드항공': 'UA', '말레이시아항공': 'MH' }
const logoOf = d => { const c = d.airline_code || AIRLINE_IATA[(d.airline || '').trim()]; return c ? `https://pics.avs.io/60/60/${c}.png` : null }

/* ───────── localStorage ───────── */
function useSaved() {
  const [ids, setIds] = useState(() => { try { return JSON.parse(localStorage.getItem('saved') || '[]') } catch { return [] } })
  const toggle = id => setIds(p => { const n = p.includes(id) ? p.filter(x => x !== id) : [...p, id]; localStorage.setItem('saved', JSON.stringify(n)); return n })
  return [ids, toggle]
}
function report(id, kind) {
  const l = JSON.parse(localStorage.getItem('reports') || '[]'); l.push({ id, kind, at: new Date().toISOString() }); localStorage.setItem('reports', JSON.stringify(l))
  try { fetch(PROXY + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, kind }) }).catch(() => {}) } catch (e) {}
  alert('알려줘서 고마워요! 🙏 확인하고 바로 정리할게요.')
}
// 클릭 계측 (실패해도 무시 — KV 바인딩 전엔 503 폴백)
function track(type, id) { try { fetch(PROXY + '/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id }), keepalive: true }).catch(() => {}) } catch (e) {} }
// 검수 여부: 운영자 검수(inspection 보유) vs 엔진 자동 발견
const isAuto = d => d.source === 'auto' || !d.inspection
const insTime = d => {
  const t = d.inspection && (d.inspection.checked_at || d.inspection.time)
  if (!t) return null
  const x = parseDt(String(t).replace('T', ' ').slice(0, 16))
  return x ? `${x.getMonth() + 1}/${x.getDate()} ${pad2(x.getHours())}:${pad2(x.getMinutes())}` : null
}
const SITE_URL = 'https://emforhs2002-bit.github.io/ssadagu-air-site/'
const mapsUrl = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)

/* 🔔 핫딜 알림 조건(개인화) — 지금은 조건 저장 + 인앱 매칭(앱 열면 내 조건 딜 먼저).
   진짜 푸시(새 딜 뜨면 알림)는 OneSignal 웹푸시+이메일이 다음 단계. 조건이 공통 뿌리. */
function useAlertPrefs() {
  const [prefs, setPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('alertPrefs') || 'null') } catch { return null } })
  const save = p => { localStorage.setItem('alertPrefs', JSON.stringify(p)); setPrefs(p) }
  return [prefs, save]
}
const hasPrefs = p => !!(p && ((p.regions && p.regions.length) || p.budgetMax || p.directOnly))
function matchPrefs(d, p) {
  if (!hasPrefs(p)) return false
  if (p.budgetMax && d.price > p.budgetMax) return false
  if (p.directOnly && d.transfers !== 0) return false
  if (p.regions && p.regions.length && !p.regions.some(r => byGeo([d], r).length > 0)) return false
  return true
}

/* ───────── deal card (사진형) ───────── */
function DealCard({ d, saved, onSave, onOpen, mine }) {
  const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time)
  const pcv = priceCheckView(d.price_check), photo = photoOf(d), logo = logoOf(d)
  return (
    <div className="relative flex gap-3 bg-white rounded-2xl shadow-soft p-3 active:scale-[.99] transition" onClick={() => onOpen(d)}>
      {photo
        ? <div className="w-[80px] h-[80px] rounded-2xl bg-cover bg-center shrink-0 bg-slate-100" style={{ backgroundImage: `url(${photo})` }} />
        : <div className="w-[80px] h-[80px] rounded-2xl shrink-0 bg-brand-50 flex items-center justify-center text-2xl">✈️</div>}
      <div className="flex-1 min-w-0 pr-7">
        <div className="text-[16px] font-extrabold text-slate-900 leading-tight">{d.badge} {d.city}</div>
        <div className="text-[12px] text-slate-400 mt-1 flex items-center gap-1.5">
          {logo && <img src={logo} alt="" className="w-4 h-4 object-contain rounded-sm" onError={e => { e.target.style.display = 'none' }} />}
          {d.airline} · {d.transfers === 0 ? '직항' : '경유 ' + d.transfers}{durOf(d) ? ' · ' + durOf(d) : ''}
        </div>
        <div className="text-[12px] text-slate-500 mt-1.5">🛫 {originOf(d)} <b className={dep.weekend ? 'text-rose-500' : 'text-slate-700'}>{dep.md}({dep.dow})</b> · <b className={ret.weekend ? 'text-rose-500' : 'text-slate-700'}>{ret.md}({ret.dow})</b></div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {mine && <span className="text-[10.5px] font-bold text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">🔔 내 조건</span>}
          {isAuto(d) ? <span className="text-[10.5px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">🤖 자동 발견</span> : <span className="text-[10.5px] font-bold text-brand-700 bg-brand-50 rounded-full px-2 py-0.5">🛡️ 검수</span>}
          {d.discount_rate > 0 && <span className="text-[10.5px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">평소 대비 -{d.discount_rate}%</span>}
          {pcv && <span className={'text-[10.5px] font-bold rounded-full px-2 py-0.5 ' + (pcv.warn ? 'text-amber-700 bg-amber-50' : 'text-brand-700 bg-brand-50')}>{pcv.card}</span>}
        </div>
      </div>
      <div className="absolute bottom-3 right-3 text-right">
        <div className="text-[16px] font-black text-brand-600 leading-none">{won(d.price)}</div>
        <div className="text-[10px] text-slate-400 mt-0.5">왕복</div>
      </div>
    </div>
  )
}

/* ───────── detail sheet (간결) ───────── */
function DealSheet({ d, onClose, onPlan }) {
  const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time)
  const pcv = priceCheckView(d.price_check), photo = photoOf(d), logo = logoOf(d)
  const priceAnim = useCountUp(d.price)
  const doShare = () => shareIt({
    title: `${d.city} 특가 항공권`,
    text: `🔥 ${d.city} 왕복 ${won(d.price)} (${d.airline}, ${dep.full} 출발${d.discount_rate > 0 ? ` · 평소 대비 -${d.discount_rate}%` : ''}) — 어딜봐도 싸다구`,
    url: SITE_URL + '#deal=' + encodeURIComponent(d.id),
  })
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up max-h-[92vh] overflow-y-auto no-scrollbar">
        <div className="relative h-44 bg-cover bg-center bg-slate-200" style={photo ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55)),url(${photo})` } : {}}>
          <button onClick={onClose} className="absolute top-3 left-4 text-white/90 text-[13px] font-bold bg-black/25 rounded-full px-3 py-1.5">← 뒤로</button>
          <button onClick={doShare} className="absolute top-3 right-14 text-white text-[13px] font-bold bg-black/25 rounded-full px-3 py-1.5">공유 ↗</button>
          <button onClick={onClose} className="absolute top-3 right-4 text-white text-xl bg-black/25 rounded-full w-8 h-8">✕</button>
          <div className="absolute bottom-3 left-5 right-5 text-white">
            <div className="text-[12px] opacity-90 flex items-center gap-1.5">{logo && <img src={logo} alt="" className="w-4 h-4 object-contain rounded-sm bg-white/80 p-px" onError={e => { e.target.style.display = 'none' }} />}{originOf(d)} 출발 · {d.airline} · {d.transfers === 0 ? '직항' : '경유 ' + d.transfers}{durOf(d) ? ' · ' + durOf(d) : ''}</div>
            <div className="text-2xl font-extrabold leading-tight mt-0.5">{d.badge} {d.city}</div>
          </div>
        </div>
        <div className="px-5 pt-4 pb-8 space-y-4 text-[13.5px]">
          <div className="flex items-end justify-between">
            <div className="text-slate-600 text-[13px]">🛫 <b className={dep.weekend ? 'text-rose-500' : 'text-slate-800'}>{dep.full}</b><br />🛬 <b className={ret.weekend ? 'text-rose-500' : 'text-slate-800'}>{ret.full}</b></div>
            <div className="text-right"><div className="text-[28px] font-black text-brand-600 leading-none">{won(priceAnim)}</div>{d.discount_rate > 0 ? <div className="text-[11px] font-bold text-rose-500 mt-1">왕복 · 평소 대비 -{d.discount_rate}%</div> : <div className="text-[11px] text-slate-400 mt-1">왕복</div>}</div>
          </div>
          {isAuto(d)
            ? <div className="bg-amber-50 rounded-2xl p-3 text-[12.5px] text-amber-800"><b>🤖 자동 발견 · 검수 전</b> — 엔진이 방금 찾은 특가예요. 예약처에서 가격·조건을 꼭 확인하세요.</div>
            : <div className="bg-brand-50 rounded-2xl p-3 text-[12.5px]">
              <div className="font-bold text-brand-700">🛡️ 운영자가 직접 확인한 특가</div>
              <div className="text-slate-600 mt-1 space-y-0.5">
                {insTime(d) && <div>· {insTime(d)} 가격·링크 확인</div>}
                {d.booking_grade && d.booking_grade !== '검수 전' && <div>· 예약처: {safeBooking(d.booking_grade).t}</div>}
                {d.baggage_note && <div>· 수하물: {d.baggage_note}</div>}
                {d.inspection && d.inspection.refund && <div>· 환불: {d.inspection.refund}</div>}
              </div>
            </div>}
          {pcv && <div className={'rounded-2xl p-3 ' + (pcv.warn ? 'bg-amber-50' : 'bg-brand-50')}>
            <div className={'font-bold ' + (pcv.warn ? 'text-amber-700' : 'text-brand-700')}>{pcv.card}</div>
            <div className="text-slate-600 text-[12.5px] mt-1">{pcv.line}</div>
            {d.price_check.memo && <div className="text-[12px] text-slate-400 mt-1">메모: {d.price_check.memo}</div>}
          </div>}
          <a href={d.affiliate_url} target="_blank" rel="noopener" onClick={() => { haptic(); track('deal', d.id) }} className="block text-center bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">예약처에서 확인하기 →</a>
          <div className="text-center text-[11px] text-slate-400">가격·환불은 예약처에서 최종 확인</div>
          <div className="grid grid-cols-2 gap-2">
            <a href={mapsUrl(d.city + ' 여행')} target="_blank" rel="noopener" className="text-center bg-slate-100 text-slate-700 font-bold rounded-2xl py-3 text-[13px]">🗺️ {d.city} 지도</a>
            {onPlan ? <button onClick={() => onPlan(d)} className="border-2 border-brand-200 text-brand-700 font-bold rounded-2xl py-3 text-[13px]">플랜 짜기</button> : <span />}
          </div>
          <div className="border-t border-slate-100 pt-3"><div className="text-[12px] text-slate-400 mb-2">가격이 다르거나 마감됐나요?</div><div className="grid grid-cols-3 gap-2 text-[12.5px]">{[['price', '가격이 달라요'], ['soldout', '마감됐어요'], ['link', '링크 이상해요']].map(([k, t]) => <button key={k} onClick={() => report(d.id, k)} className="bg-slate-100 text-slate-600 rounded-xl py-2">{t}</button>)}</div></div>
        </div>
      </div>
    </div>
  )
}

/* ───────── 🔥 핫딜 (본체 · 포토 히어로) ───────── */
function HotDeals({ deals, savedIds, onSave, onOpen, prefs, onRefresh, updatedAt, ext }) {
  const [cat, setCat] = useState('all')
  const [pick, setPick] = useState(null)
  // 홈 검색에서 넘어온 필터(나라/도시) 적용
  useEffect(() => { if (!ext) return; setCat(ext.cat || 'all'); setPick(ext.pick || null) }, [ext && ext.ts])
  const [flash, setFlash] = useState(false)
  const [pull, setPull] = useState(0)
  const touchY = useRef(null)
  const doRefresh = () => { Promise.resolve(onRefresh && onRefresh()).then(() => { setFlash(true); setTimeout(() => setFlash(false), 1600) }) }
  // 당겨서 새로고침 (스크롤 최상단에서 아래로)
  const tStart = e => { touchY.current = window.scrollY <= 0 ? e.touches[0].clientY : null }
  const tMove = e => { if (touchY.current == null) return; const d = e.touches[0].clientY - touchY.current; if (d > 0 && window.scrollY <= 0) setPull(Math.min(90, d * 0.45)) }
  const tEnd = () => { if (pull > 60) { haptic(12); doRefresh() } setPull(0); touchY.current = null }
  const base = pick ? deals.filter(d => destOf(d) === pick) : filterCat(deals, cat)
  const list = [...base].sort((a, b) => (matchPrefs(b, prefs) - matchPrefs(a, prefs)) || (b.discount_rate - a.discount_rate))
  const mineCount = hasPrefs(prefs) ? list.filter(d => matchPrefs(d, prefs)).length : 0
  const byCity = {}; deals.forEach(d => { const c = destOf(d); if (!byCity[c] || d.price < byCity[c].price) byCity[c] = d })
  const circles = Object.values(byCity).sort((a, b) => a.price - b.price)
  return (
    <div onTouchStart={tStart} onTouchMove={tMove} onTouchEnd={tEnd}>
      {pull > 0 && <div className="flex items-center justify-center overflow-hidden" style={{ height: pull }}>
        <span className={'text-[12px] font-bold ' + (pull > 60 ? 'text-brand-600' : 'text-slate-400')}>{pull > 60 ? '↓ 놓으면 새로고침' : '↓ 당겨서 새로고침'}</span>
      </div>}
      <div className="px-4 pb-4">
        {/* circles */}
        {circles.length > 0 && <>
          <div className="flex items-baseline justify-between mt-6 mb-3"><h2 className="text-[16.5px] font-extrabold text-slate-900">🔥 지금 뜬 핫딜</h2>{pick && <button onClick={() => setPick(null)} className="text-[12.5px] text-brand-600 font-bold">전체 ›</button>}</div>
          <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1 snap-x-row">
            {circles.map(d => { const c = destOf(d), ph = photoOf(d); return (
              <button key={d.id} onClick={() => { setPick(pick === c ? null : c); setCat('all') }} className="shrink-0 w-[72px] text-center">
                <div className={'w-[68px] h-[68px] rounded-full bg-cover bg-center mx-auto bg-slate-200 ' + (pick === c ? 'ring-[3px] ring-brand-500' : '')} style={ph ? { backgroundImage: `url(${ph})` } : {}} />
                <div className="text-[12px] font-bold text-slate-700 mt-1.5 truncate">{d.city}</div>
                <div className="text-[11px] font-extrabold text-brand-600">{Math.round(d.price / 10000)}만</div>
              </button>
            ) })}
          </div>
        </>}
        {/* chips */}
        {!pick && <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-5 mb-1">
          {CATS.map(([k, label]) => <button key={k} onClick={() => setCat(k)} className={'shrink-0 text-[12.5px] rounded-full px-3 py-1.5 font-medium ' + (cat === k ? 'bg-brand-500 text-white' : 'bg-white text-slate-500 border border-slate-200')}>{label}</button>)}
        </div>}
        {/* list */}
        <div className="flex items-center justify-between mt-5 mb-1">
          <h2 className="text-[16.5px] font-extrabold text-slate-900">{mineCount > 0 ? '🔔 내 조건 핫딜' : '🔥 핫딜'} <span className="text-[12px] font-medium text-slate-400">{list.length}건</span></h2>
          <button onClick={doRefresh} className={'text-[12.5px] font-bold active:scale-95 ' + (flash ? 'text-emerald-500' : 'text-brand-600')}>{flash ? '✓ 최신이에요' : '🔄 새로고침'}</button>
        </div>
        {updatedAt && <div className="text-[11px] text-slate-400 mb-3"><b className="text-slate-500">{updatedAt}</b> 기준 · 1시간마다 자동 갱신, 누르면 최신 조회</div>}
        <div className="space-y-3">
          {list.length ? list.map(d => <DealCard key={d.id} d={d} saved={savedIds.includes(d.id)} onSave={onSave} onOpen={onOpen} mine={matchPrefs(d, prefs)} />)
            : <Empty icon="🔎" text="이 조건엔 핫딜이 아직 없어요." />}
        </div>
      </div>
    </div>
  )
}

/* ───────── 🧭 어디 갈까? ───────── */
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
/* ───────── ✈️ 항공편 찾기 (A안: 검색 → 예약처 딥링크 / 달력) ─────────
   우리가 가격을 매기지 않는다. 별도 수수료도 안 붙인다. 예약처(Aviasales)에서 실제가를 보게 연결만 한다.
   인앱에 가짜/참고가를 띄우지 않음 → '눌렀더니 가격 다름' 불만 원천 차단 + 어필리에이트 추적(marker). */
const MARKER = '737258'
const ORIGINS = [['ICN', '인천'], ['GMP', '김포'], ['PUS', '부산']]
const CITIES = [['FUK', '후쿠오카'], ['KIX', '오사카'], ['TYO', '도쿄'], ['OKA', '오키나와'], ['CTS', '삿포로'], ['TPE', '타이베이'], ['KHH', '가오슝'], ['DAD', '다낭'], ['NHA', '나트랑'], ['HAN', '하노이'], ['SGN', '호치민'], ['BKK', '방콕'], ['HKT', '푸켓'], ['CEB', '세부'], ['MNL', '마닐라'], ['BKI', '코타키나발루'], ['HKG', '홍콩'], ['SIN', '싱가포르'], ['GUM', '괌']]
const CITIES_US = [['NYC', '뉴욕'], ['LAX', '로스앤젤레스'], ['SFO', '샌프란시스코'], ['LAS', '라스베가스'], ['HNL', '호놀룰루(하와이)'], ['SEA', '시애틀'], ['ORD', '시카고'], ['BOS', '보스턴'], ['MIA', '마이애미']]
const pad2 = n => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`  // m: 0-based
const todayStr = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth(), d.getDate()) }
function aviaLink({ origin, dest, depart, ret, pax = 1 }) {
  const dm = s => { const p = s.split('-'); return p[2] + p[1] }  // YYYY-MM-DD → DDMM
  const code = origin + dm(depart) + dest + (ret ? dm(ret) : '') + pax
  return `https://www.aviasales.com/search/${code}?marker=${MARKER}`
}
const Seg = ({ on, children, onClick }) => <button onClick={onClick} className={'flex-1 text-[13px] rounded-xl py-2 font-bold ' + (on ? 'bg-brand-500 text-white' : 'bg-white text-slate-500 border border-slate-200')}>{children}</button>
const Pick = ({ label, value, onChange, options }) => <div><label className="text-[12px] text-slate-500">{label}</label><select value={value} onChange={e => onChange(e.target.value)} className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]">{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
const inputCls = 'w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]'

const PROXY = 'https://curly-meadow-ab36ssadagu-proxy.emforhs2002.workers.dev'
const IATA_NAME = { KE: '대한항공', OZ: '아시아나항공', '7C': '제주항공', LJ: '진에어', TW: '티웨이항공', BX: '에어부산', RS: '에어서울', ZE: '이스타항공', YP: '에어프레미아', '5J': '세부퍼시픽', VJ: '비엣젯', VN: '베트남항공', MM: '피치항공', AK: '에어아시아', FD: '타이에어아시아', TR: '스쿠트', PR: '필리핀항공', CX: '캐세이퍼시픽', UO: '홍콩익스프레스', SQ: '싱가포르항공', TG: '타이항공', NH: 'ANA', JL: '일본항공', JX: '스타럭스', CI: '중화항공', BR: '에바항공', UA: '유나이티드', MH: '말레이시아항공', DL: '델타항공', AA: '아메리칸항공', HA: '하와이안항공', AS: '알래스카항공', B6: '제트블루', AC: '에어캐나다', WS: '웨스트젯' }
const airlineName = c => IATA_NAME[c] || c
function fmtISO(s) { if (!s) return { full: '-' }; const dt = new Date(s); if (isNaN(dt)) return { full: s }; const w = dt.getDay(); return { md: `${dt.getMonth() + 1}/${dt.getDate()}`, dow: DAYS[w], time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`, weekend: w === 0 || w === 6 } }
function offerLink(o) { const base = 'https://www.aviasales.com' + (o.link || ''); return base + (base.includes('?') ? '&' : '?') + 'marker=' + MARKER }
const durStr = m => m ? `${Math.floor(m / 60)}시간 ${m % 60}분` : ''

function FlightResult({ o, low }) {
  const dep = fmtISO(o.departure_at), ret = fmtISO(o.return_at)
  return (
    <a href={offerLink(o)} target="_blank" rel="noopener" className={'block bg-white rounded-2xl shadow-soft p-3.5 active:scale-[.99] transition' + (low ? ' glow-lowest' : '')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={`https://pics.avs.io/60/60/${o.airline}.png`} alt="" className="w-8 h-8 object-contain rounded-md bg-slate-50" onError={e => { e.target.style.visibility = 'hidden' }} />
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-slate-800 truncate">{airlineName(o.airline)} {low && <span className="text-[10px] font-bold text-white bg-brand-500 rounded-full px-2 py-0.5 align-middle">🏆 이 검색 최저</span>}</div>
            <div className="text-[11.5px] text-slate-400">{o.transfers === 0 ? '직항' : '경유 ' + o.transfers + '회'}{o.duration ? ' · ' + durStr(o.duration) : ''}</div>
          </div>
        </div>
        <div className="text-right shrink-0 pl-2">
          <div className="text-[17px] font-black text-brand-600 leading-none">{won(o.price)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{o.return_at ? '왕복' : '편도'} · 참고가</div>
        </div>
      </div>
      <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-[12px] text-slate-500 flex items-center justify-between">
        <span>🛫 <b className={dep.weekend ? 'text-rose-500' : 'text-slate-700'}>{dep.md}({dep.dow})</b> {dep.time}{o.return_at && <> · 🛬 <b className={ret.weekend ? 'text-rose-500' : 'text-slate-700'}>{ret.md}({ret.dow})</b> {ret.time}</>}</span>
        <span className="text-brand-600 font-bold shrink-0">실시간 확인 ›</span>
      </div>
    </a>
  )
}

const CITY_NAME = Object.fromEntries([...CITIES, ...CITIES_US])
const cityName = c => CITY_NAME[c] || c
function monthsList() {
  const out = [], now = new Date()
  for (let i = 0; i < 8; i++) { const m = now.getMonth() + i, y = now.getFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; out.push({ value: `${y}-${pad2(mm + 1)}`, label: `${mm + 1}월`, y, m: mm }) }
  return out
}

/* 날짜별 최저가 달력 (월 캐시 데이터 → 날짜별 min, 탭하면 그날 필터) */
function PriceCalendar({ y, m, cal, day, onPick }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const lead = new Date(y, m, 1).getDay(), daysIn = new Date(y, m + 1, 0).getDate()
  const ps = Object.values(cal), min = ps.length ? Math.min(...ps) : 0
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysIn; d++) cells.push(d)
  return (
    <div className="bg-white rounded-2xl shadow-soft p-3">
      <div className="text-center font-bold text-[13.5px] mb-2">{y}년 {m + 1}월 · 날짜별 최저가</div>
      <div className="grid grid-cols-7 text-center text-[10px] mb-1">{['일', '월', '화', '수', '목', '금', '토'].map((w, i) => <div key={i} className={i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}>{w}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = `${y}-${pad2(m + 1)}-${pad2(d)}`, p = cal[key], past = new Date(y, m, d) < today, sel = day === key, hol = HOLIDAYS[key]
          return (
            <button key={i} disabled={!p || past} onClick={() => onPick(sel ? null : key)} title={hol || ''}
              className={'aspect-square rounded-lg flex flex-col items-center justify-center leading-none ' + (sel ? 'bg-brand-500 text-white' : (p && !past) ? (p === min ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-700') : 'text-slate-200')}>
              <span className={'text-[11px] font-bold' + (hol && !sel && !past ? ' text-rose-500' : '')}>{d}{hol ? '·' : ''}</span>
              {p && !past && <span className="text-[8px] font-bold mt-0.5">{Math.round(p / 10000)}만</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Flights() {
  const months = monthsList()
  const [origin, setOrigin] = useState('ICN'), [dest, setDest] = useState('FUK')
  const [mi, setMi] = useState(1)
  const [oneway, setOneway] = useState(false)
  const [pax, setPax] = useState(1), [cabin, setCabin] = useState('Y')
  const [day, setDay] = useState(null)
  const [sort, setSort] = useState('price'), [directOnly, setDirectOnly] = useState(false)
  const [st, setSt] = useState({ status: 'idle' })
  const [ovFrom, setOvFrom] = useState(false)
  const [ovTo, setOvTo] = useState(false)
  const [ovMonth, setOvMonth] = useState(false)
  const [ovPax, setOvPax] = useState(false)
  const anywhere = dest === '-'
  const routeSearch = async (d) => {
    setDest(d); setDay(null); setSt({ status: 'loading' })
    const mo = months[mi]
    const params = new URLSearchParams({ origin, destination: d, departure_at: mo.value, currency: 'krw', market: 'kr', one_way: oneway ? 'true' : 'false', sorting: 'price', limit: '100', unique: 'false' })
    try {
      const r = await fetch(`${PROXY}/aviasales/v3/prices_for_dates?${params}`)
      const j = await r.json()
      const data = (j.data || []).sort((a, b) => a.price - b.price)
      const cal = {}; data.forEach(o => { const k = (o.departure_at || '').slice(0, 10); if (k && (!cal[k] || o.price < cal[k])) cal[k] = o.price })
      setSt({ status: 'route', data, cal, y: mo.y, m: mo.m, label: mo.label })
    } catch (e) { setSt({ status: 'error' }) }
  }
  const anywhereSearch = async () => {
    setDay(null); setSt({ status: 'loading' })
    const params = new URLSearchParams({ origin, currency: 'krw', market: 'kr', limit: '40', one_way: oneway ? 'true' : 'false', period_type: 'year', page: '1' })
    try {
      const r = await fetch(`${PROXY}/aviasales/v3/get_latest_prices?${params}`)
      const j = await r.json()
      const byDest = {}; (j.data || []).forEach(o => { const c = o.destination; if (c && (!byDest[c] || o.value < byDest[c].value)) byDest[c] = o })
      setSt({ status: 'anywhere', dests: Object.values(byDest).sort((a, b) => a.value - b.value) })
    } catch (e) { setSt({ status: 'error' }) }
  }
  const search = () => anywhere ? anywhereSearch() : routeSearch(dest)
  const DESTOPTS = [['-', '🌍 어디든지'], ...CITIES.map(([c, n]) => [c, `${n}(${c})`])]
  const results = st.status === 'route' ? (day ? st.data.filter(o => (o.departure_at || '').slice(0, 10) === day) : st.data) : []
  const view = results.filter(o => !directOnly || o.transfers === 0).sort((a, b) => sort === 'duration' ? ((a.duration || 9e9) - (b.duration || 9e9)) : (a.price - b.price))
  const lowest = view.length ? view.reduce((m, o) => Math.min(m, o.price), Infinity) : 0

  const oName = (ORIGINS.find(([c]) => c === origin) || [])[1] || origin
  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      {/* 문장형 검색 (Mad Libs) */}
      <div className="bg-white rounded-3xl shadow-soft p-5">
        <MadLib parts={[
          { t: oName, on: () => setOvFrom(true) }, '에서 ',
          { t: anywhere ? '🌍 어디든지' : cityName(dest), on: () => setOvTo(true) }, ', ',
          { t: months[mi].label, on: () => setOvMonth(true) }, '에 ',
          { t: `${pax}명${oneway ? ' · 편도' : ''}`, on: () => setOvPax(true) }, ' 떠나요',
        ]} />
        <button onClick={search} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5 mt-4">{anywhere ? '🌍 어디가 싼지 보기' : '최저가 검색 ✈️'}</button>
      </div>

      <SearchOverlay open={ovFrom} onClose={() => setOvFrom(false)} title="어디서 출발하세요?" placeholder="출발 공항"
        recentKey="fromAp" groups={[{ title: '출발 공항', items: ORIGINS.map(([c, n]) => ({ id: c, label: n, sub: c, icon: '🛫' })) }]}
        onPick={it => setOrigin(it.id)} />
      <SearchOverlay open={ovTo} onClose={() => setOvTo(false)} title="어디로 가세요?" placeholder="도시 검색 (예: 오사카, ㅇㅅㅋ)"
        recentKey="toAp" voice
        groups={[
          { title: '모르겠어요', items: [{ id: '-', label: '어디든지', sub: '가장 싼 도시부터 보기', icon: '🌍' }] },
          { title: '아시아 · 괌', items: CITIES.map(([c, n]) => ({ id: c, label: n, sub: c, icon: '🏙️' })) },
          { title: '🇺🇸 미주', items: CITIES_US.map(([c, n]) => ({ id: c, label: n, sub: c, icon: '🗽' })) },
        ]}
        onPick={it => setDest(it.id)} />
      <Sheet open={ovMonth} onClose={() => setOvMonth(false)} title="언제 떠나세요?">
        <div className="grid grid-cols-4 gap-2 px-5 pb-6 pt-2">
          {months.map((mo, i) => <button key={mo.value} onClick={() => { haptic(); setMi(i); setOvMonth(false) }}
            className={'rounded-2xl py-3 text-[14px] font-bold ' + (mi === i ? 'bg-brand-500 text-white' : 'bg-slate-50 text-slate-600')}>{mo.label}</button>)}
        </div>
      </Sheet>
      <Sheet open={ovPax} onClose={() => setOvPax(false)} title="인원 · 옵션">
        <div className="px-5 pb-6 pt-1 divide-y divide-slate-100">
          <StepRow label="인원" sub="성인 기준" value={pax} min={1} max={6} onChange={setPax} />
          <div className="py-3 flex items-center justify-between">
            <div className="text-[14.5px] font-bold text-slate-800">여정</div>
            <div className="flex gap-1.5">
              {[[false, '왕복'], [true, '편도']].map(([v, t]) => <button key={t} onClick={() => { haptic(); setOneway(v) }} className={'text-[13px] rounded-full px-3.5 py-1.5 font-bold ' + (oneway === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500')}>{t}</button>)}
            </div>
          </div>
          <div className="py-3 flex items-center justify-between">
            <div className="text-[14.5px] font-bold text-slate-800">좌석</div>
            <div className="flex gap-1.5">
              {[['Y', '일반석'], ['C', '비즈니스']].map(([v, t]) => <button key={v} onClick={() => { haptic(); setCabin(v) }} className={'text-[13px] rounded-full px-3.5 py-1.5 font-bold ' + (cabin === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500')}>{t}</button>)}
            </div>
          </div>
          <div className="pt-3"><button onClick={() => setOvPax(false)} className="w-full bg-brand-500 text-white font-bold rounded-2xl py-3">완료</button></div>
        </div>
      </Sheet>

      {st.status === 'idle' && <div>
        <div className="flex items-baseline justify-between px-1 mb-2.5 mt-1">
          <h2 className="text-[16px] font-extrabold text-slate-900">🔥 인기 노선, 바로 검색</h2>
          <button onClick={() => { haptic(); setDest('-'); anywhereSearch() }} className="text-[12px] text-brand-600 font-bold">🌍 어디든지 ›</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['FUK', '후쿠오카'], ['KIX', '오사카'], ['TYO', '도쿄'], ['OKA', '오키나와'], ['BKK', '방콕'], ['DAD', '다낭'], ['TPE', '타이베이'], ['CEB', '세부']].map(([c, n]) => {
            const slug = DEST_PHOTO[c]
            return (
              <button key={c} onClick={() => { haptic(); routeSearch(c) }} className="relative h-[104px] rounded-2xl overflow-hidden text-left active:scale-[.98] transition">
                <div className="absolute inset-0 bg-cover bg-center bg-slate-300" style={slug ? { backgroundImage: `url(${photoBySlug(slug)})` } : {}} />
                <div className="absolute inset-0 p-3 flex flex-col justify-end" style={{ background: 'linear-gradient(180deg,rgba(15,23,42,.05),rgba(15,23,42,.72))' }}>
                  <b className="text-white text-[15.5px]">{n}</b>
                  <span className="text-slate-300 text-[10.5px]">{oName} 출발 최저가 ›</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>}
      {st.status === 'loading' && <div className="text-center text-slate-400 py-12"><div className="text-3xl mb-2 animate-pulse">✈️</div><div className="text-[13px]">최근 가격을 불러오는 중…</div></div>}
      {st.status === 'error' && <Empty icon="⚠️" text="조회 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." />}

      {st.status === 'anywhere' && (st.dests.length
        ? <>
          <div className="text-[12px] text-slate-400 px-1">가장 싼 여행지 <b className="text-slate-500">{st.dests.length}곳</b> · 탭하면 그 도시 항공권</div>
          <div className="grid grid-cols-2 gap-2">
            {st.dests.map((o, i) => <button key={i} onClick={() => routeSearch(o.destination)} className="text-left bg-white rounded-2xl shadow-soft p-3 active:scale-[.98]">
              <div className="text-[15px] font-extrabold text-slate-800 truncate">{cityName(o.destination)} <span className="text-[11px] text-slate-400 font-medium">{o.destination}</span></div>
              <div className="text-[11.5px] text-slate-400 mt-0.5">{(o.depart_date || '').slice(5, 10).replace('-', '/')} · {o.number_of_changes === 0 ? '직항' : '경유'}</div>
              <div className="text-[16px] font-black text-brand-600 mt-1">{won(o.value)}</div>
            </button>)}
          </div>
        </>
        : <Empty icon="🔎" text="지금은 캐시된 여행지가 없어요. 잠시 후 다시 시도해 보세요." />)}

      {st.status === 'route' && (st.data.length
        ? <>
          <PriceCalendar y={st.y} m={st.m} cal={st.cal} day={day} onPick={setDay} />
          <div className="flex items-center gap-1.5 text-[12.5px]">
            <button onClick={() => setSort('price')} className={'rounded-full px-3 py-1.5 font-bold ' + (sort === 'price' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200')}>최저가순</button>
            <button onClick={() => setSort('duration')} className={'rounded-full px-3 py-1.5 font-bold ' + (sort === 'duration' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200')}>빠른순</button>
            <label className="ml-auto flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={directOnly} onChange={e => setDirectOnly(e.target.checked)} /> 직항만</label>
          </div>
          <div className="text-[12px] text-slate-500 px-1">{day ? <><b className="text-brand-600">{day.slice(5).replace('-', '/')}</b> 출발 · <button onClick={() => setDay(null)} className="text-brand-600 font-bold">전체</button></> : st.label} · 최저가 <b className="text-brand-600">{won(lowest)}</b> · {view.length}편 · <a href={mapsUrl(cityName(dest) + ' 관광')} target="_blank" rel="noopener" className="text-brand-600 font-bold">🗺️ {cityName(dest)} 지도</a></div>
          <div className="bg-amber-50 text-amber-800 text-[11.5px] rounded-xl px-3 py-2">💡 여기 보이는 건 <b>최근 확인된 최저가 모음(참고가)</b>이에요 — 전체 시간표가 아니에요. 카드를 누르면 예약처에서 실시간 확정, 모든 항공편은 아래 <b>실시간 전체 보기</b>로.</div>
          {view.length ? view.map((o, i) => <FlightResult key={i} o={o} low={o.price === lowest} />) : <Empty icon="🔎" text="직항만 조건에 맞는 게 없어요. 직항만을 꺼보세요." />}
          {view.length > 0 && (() => {
            const c = view[0]
            const dd = (c.departure_at || '').slice(0, 10), rr = oneway ? null : (c.return_at || '').slice(0, 10)
            if (!dd) return null
            return <a href={aviaLink({ origin, dest, depart: dd, ret: rr, pax })} target="_blank" rel="noopener" onClick={() => haptic()}
              className="block text-center border-2 border-brand-200 bg-white text-brand-700 font-bold rounded-2xl py-3.5 text-[14px]">🔎 이 날짜 전체 항공편 실시간 보기 →</a>
          })()}
        </>
        : <Empty icon="🔎" text="이 달엔 캐시된 가격이 없어요. 다른 달·도시로 검색해 보세요." />)}
    </div>
  )
}

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

const A_REGIONS = ['일본', '동남아', '대만', '베트남', '태국', '괌']
const A_BUDGET = [['20만 이하', 200000], ['30만 이하', 300000], ['40만 이하', 400000], ['상관없음', 0]]
function AlertSetup({ prefs, onSave }) {
  const [regions, setRegions] = useState(prefs?.regions || [])
  const [budgetMax, setBudget] = useState(prefs?.budgetMax || 0)
  const [directOnly, setDirect] = useState(prefs?.directOnly || false)
  const toggleR = r => setRegions(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])
  const save = () => { onSave({ regions, budgetMax, directOnly }); alert('알림 조건을 저장했어요! 🔔\n지금은 앱을 열면 내 조건에 맞는 안심 특가를 먼저 보여드려요.\n곧 새 딜이 뜨면 알려주는 푸시·이메일 알림도 추가돼요.') }
  return (
    <Section title="🔔 내 특가 알림 조건">
      <div className="text-[12px] text-slate-500 mb-3">조건을 저장하면 핫딜 탭에서 <b className="text-rose-500">내 조건에 맞는 안심 특가를 먼저</b> 보여드려요.</div>
      <div className="text-[12px] font-bold text-slate-600 mb-1">지역</div>
      <div className="flex flex-wrap gap-1.5">{A_REGIONS.map(r => <Chip key={r} on={regions.includes(r)} onClick={() => toggleR(r)}>{r}</Chip>)}</div>
      <div className="text-[12px] font-bold text-slate-600 mt-3 mb-1">예산 (1인 왕복)</div>
      <div className="flex flex-wrap gap-1.5">{A_BUDGET.map(([l, v]) => <Chip key={l} on={budgetMax === v} onClick={() => setBudget(v)}>{l}</Chip>)}</div>
      <label className="flex items-center gap-2 text-[13px] text-slate-600 mt-3"><input type="checkbox" checked={directOnly} onChange={e => setDirect(e.target.checked)} /> 직항만 받기</label>
      <button onClick={save} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3 mt-3">알림 조건 저장 🔔</button>
    </Section>
  )
}
function My({ prefs, onSavePrefs }) {
  return (
    <div className="px-4 pb-4 pt-2 space-y-4">
      <Section title="관심 공항"><div className="flex gap-2 flex-wrap">{['인천(ICN)', '김포(GMP)'].map(a => <span key={a} className="text-[13px] bg-brand-50 text-brand-700 rounded-full px-3 py-1.5">{a}</span>)}</div></Section>
      <Section title="이런 특가는 숨기기"><Toggle label="경유 항공권 숨기기" k="no_transfer" /><Toggle label="새벽 출발/도착 숨기기" k="no_dawn" /><Toggle label="수하물 별도(LCC) 숨기기" k="no_lcc" /></Section>
      <div className="text-center text-[11px] text-slate-400 pt-2">싸다구항공 · 결제·환불은 판매처 직접, 우린 안심 특가만 골라드려요</div>
    </div>
  )
}

/* ───────── 🗺️ 여행 플래너 (예약 후 · 템플릿 + 목적지 DB, LLM 생성 없음) ─────────
   정직 원칙: 구체적 장소를 지어내지 않는다. 준비 정보는 검증 가능한 사실,
   일자별 일정은 사용자가 채우는 뼈대 + 테마 힌트만. localStorage에 영속. */
const PLAN_THEME_ICON = { '맛집': '🍜', '쇼핑': '🛍️', '휴양': '🏖️', '바다': '🌊', '자연': '🌿', '도시': '🏙️', '온천': '♨️' }
const SLOTS = [['am', '오전'], ['pm', '오후'], ['eve', '저녁']]
const PREP_KEYS = ['passport', 'booking', 'esim', 'insurance', 'money', 'adapter', 'weather', 'meds']
function tripDays(start, end) { const a = new Date(start), b = new Date(end); if (isNaN(a) || isNaN(b)) return 0; const n = Math.round((b - a) / 86400000) + 1; return n > 0 ? n : 0 }
function loadPlans() { try { return JSON.parse(localStorage.getItem('plans') || '[]') } catch { return [] } }
const mdSlash = s => (s || '').slice(5).replace('-', '/')
function seedFromDeal(d) {
  const dest = DESTINATIONS.find(x => x.codes.includes(destOf(d)))
  const toYmd = s => { const dt = parseDt(s); return dt ? `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}` : '' }
  return { destName: dest ? dest.name : (d.city || ''), start: toYmd(d.departure_time), end: toYmd(d.return_time) }
}

function InterestCard({ icon, title, k }) {
  const [on, setOn] = useState(() => localStorage.getItem('int_' + k) === '1')
  const toggle = () => { const n = !on; setOn(n); localStorage.setItem('int_' + k, n ? '1' : '0') }
  return (
    <button onClick={toggle} className="w-full bg-white rounded-2xl shadow-soft p-3 text-left flex items-center gap-2.5 active:scale-[.99]">
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0"><div className="text-[13px] font-bold text-slate-700">{title}</div><div className="text-[11px] text-slate-400">곧 검수한 특가로 연결할게요</div></div>
      <span className={'text-[11px] font-bold rounded-full px-2 py-1 shrink-0 ' + (on ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500')}>{on ? '🔔 등록됨' : '관심 등록'}</span>
    </button>
  )
}

function PlanDetail({ plan, onChange, onBack, onDelete }) {
  const info = COUNTRY_INFO[plan.country]
  const m = plan.start ? new Date(plan.start).getMonth() + 1 : null
  const goodSeason = !!(m && plan.months && plan.months.includes(m))
  const slug = plan.codes && plan.codes.length ? DEST_PHOTO[plan.codes[0]] : null, photo = slug ? photoBySlug(slug) : null
  const PREP = [
    ['passport', '여권 유효기간 6개월 이상'],
    ['booking', '항공권·숙소 예약 확인서 저장'],
    ['esim', 'eSIM / 유심 데이터'],
    ['insurance', '여행자보험 가입'],
    ['money', '환전 · 해외결제 카드'],
    ['adapter', info ? `콘센트 어댑터 (${info.plug.split(' · ')[0]})` : '콘센트 어댑터'],
    ['weather', '목적지 날씨 확인 · 옷차림'],
    ['meds', '상비약 · 비상약'],
  ]
  const doneN = PREP.filter(([k]) => plan.checks[k]).length
  const days = []
  for (let i = 0; i < plan.days; i++) {
    if (i === 0) days.push({ i, label: '도착', tip: '공항 → eSIM 개통 → 환전·교통카드 → 체크인 → 첫 끼' })
    else if (i === plan.days - 1 && plan.days > 1) days.push({ i, label: '출국', tip: '체크아웃(짐 보관) → 마지막 일정 → 공항 2~3시간 전 도착' })
    else days.push({ i, label: '자유 일정' })
  }
  const setNote = (key, v) => onChange({ notes: { ...plan.notes, [key]: v } })
  const toggleCheck = k => onChange({ checks: { ...plan.checks, [k]: !plan.checks[k] } })
  return (
    <div className="px-4 pb-6 pt-1 space-y-4">
      <button onClick={onBack} className="text-[13px] text-brand-600 font-bold">← 내 여행</button>
      <div className="relative rounded-3xl overflow-hidden h-36 bg-slate-200 bg-cover bg-center" style={photo ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.55)),url(${photo})` } : {}}>
        <div className="absolute bottom-3 left-4 right-4 text-white" style={{ textShadow: '0 1px 8px rgba(0,0,0,.4)' }}>
          <div className="text-2xl font-extrabold">📍 {plan.destName}</div>
          <div className="text-[12.5px] opacity-90 mt-0.5">{plan.country}{plan.start ? ` · ${mdSlash(plan.start)} ~ ${mdSlash(plan.end)}` : ''} · {plan.days}일</div>
        </div>
      </div>
      <div className={'rounded-2xl p-3 text-[12.5px] ' + (goodSeason ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600')}>
        {goodSeason ? '🌤️ 여행하기 좋은 시즌이에요.' : '🗓️ 가는 시기의 날씨를 한 번 확인해보세요.'}
        {plan.caution && plan.caution.length > 0 && <span className="text-amber-700"> · ⚠️ {plan.caution.join(' · ')}</span>}
      </div>
      {info && <div className="bg-white rounded-2xl shadow-soft p-4">
        <div className="text-[13px] font-bold text-slate-700 mb-2">ℹ️ {plan.country} 기본 정보</div>
        <div className="grid grid-cols-2 gap-y-2 text-[12.5px]">
          <div><span className="text-slate-400">통화 </span><b className="text-slate-700">{info.currency}</b></div>
          <div><span className="text-slate-400">시차 </span><b className="text-slate-700">{info.tz}</b></div>
          <div><span className="text-slate-400">전원 </span><b className="text-slate-700">{info.plug}</b></div>
          <div><span className="text-slate-400">데이터 </span><b className="text-slate-700">{info.data}</b></div>
          <div className="col-span-2"><span className="text-slate-400">교통 </span><b className="text-slate-700">{info.transit}</b></div>
        </div>
        <div className="text-[12px] text-slate-500 mt-2">💡 {info.tip}</div>
        <div className="text-[11px] text-slate-400 mt-2 border-t border-slate-100 pt-2">{VISA_NOTE}</div>
      </div>}
      <div className="bg-white rounded-2xl shadow-soft p-4">
        <div className="flex items-center justify-between mb-1"><div className="text-[13px] font-bold text-slate-700">✅ 출발 전 준비물</div><div className="text-[12px] font-bold text-brand-600">{doneN}/{PREP.length}</div></div>
        <div className="space-y-0.5">
          {PREP.map(([k, label]) => <button key={k} onClick={() => toggleCheck(k)} className="w-full flex items-center gap-2.5 py-1.5 text-left">
            <span className={'w-5 h-5 rounded-md flex items-center justify-center text-[12px] shrink-0 ' + (plan.checks[k] ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-300')}>✓</span>
            <span className={'text-[13px] ' + (plan.checks[k] ? 'text-slate-400 line-through' : 'text-slate-700')}>{label}</span>
          </button>)}
        </div>
      </div>
      <div>
        <div className="text-[13px] font-bold text-slate-700 mb-1">🗓️ 일자별 일정</div>
        {plan.themes && plan.themes.length > 0 && <div className="text-[12px] text-slate-500 mb-2">이 도시 분위기 {plan.themes.map(t => (PLAN_THEME_ICON[t] || '') + t).join(' · ')} — 참고해서 채워보세요</div>}
        <div className="space-y-3">
          {days.map(day => <div key={day.i} className="bg-white rounded-2xl shadow-soft p-4">
            <div className="text-[14px] font-extrabold text-slate-800 mb-1">{day.i + 1}일차 <span className="text-[12px] font-medium text-slate-400">· {day.label}</span></div>
            {day.tip && <div className="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-2">{day.tip}</div>}
            <div className="space-y-2 mt-1">
              {SLOTS.map(([sk, sl]) => <div key={sk} className="flex gap-2 items-start">
                <span className="text-[11px] font-bold text-brand-600 bg-brand-50 rounded-full px-2 py-1 mt-0.5 shrink-0 w-11 text-center">{sl}</span>
                <textarea value={plan.notes[`${day.i}:${sk}`] || ''} onChange={e => setNote(`${day.i}:${sk}`, e.target.value)} rows={1} placeholder="가고 싶은 곳, 먹고 싶은 것…" className="flex-1 text-[13px] bg-slate-50 rounded-xl px-3 py-2 resize-none border border-transparent focus:border-brand-300 focus:bg-white outline-none" />
              </div>)}
            </div>
          </div>)}
        </div>
      </div>
      <div>
        <div className="text-[13px] font-bold text-slate-700 mb-2">🧳 현지 준비물</div>
        <div className="space-y-2">
          <InterestCard icon="📶" title="eSIM · 데이터" k="esim" />
          <InterestCard icon="🛡️" title="여행자보험" k="insurance" />
          <InterestCard icon="🚌" title="공항 교통 · 교통패스" k="transit" />
        </div>
      </div>
      <button onClick={onDelete} className="w-full text-[12.5px] text-slate-400 py-2">이 여행 삭제</button>
    </div>
  )
}

function Planner({ seed, clearSeed }) {
  const [plans, setPlans] = useState(loadPlans)
  const [mode, setMode] = useState('list')   // 'list' | 'new' | <planId>
  const [destName, setDestName] = useState(DESTINATIONS[0].name)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  useEffect(() => {
    if (seed) { setDestName(seed.destName || DESTINATIONS[0].name); setStart(seed.start || ''); setEnd(seed.end || ''); setMode('new'); clearSeed && clearSeed() }
  }, [seed])
  const persist = list => { setPlans(list); localStorage.setItem('plans', JSON.stringify(list)) }
  const create = () => {
    const d = DESTINATIONS.find(x => x.name === destName) || {}
    const days = tripDays(start, end) || 3
    const plan = { id: 'p' + Date.now(), destName, country: d.country || '', codes: d.codes || [], themes: d.themes || [], caution: d.caution || [], months: d.months || [], start, end, days, notes: {}, checks: {}, createdAt: new Date().toISOString() }
    persist([plan, ...plans]); setMode(plan.id); setStart(''); setEnd('')
  }
  const update = (id, patch) => persist(plans.map(p => p.id === id ? { ...p, ...patch } : p))
  const remove = id => { persist(plans.filter(p => p.id !== id)); setMode('list') }

  if (mode !== 'list' && mode !== 'new') {
    const plan = plans.find(p => p.id === mode)
    if (!plan) return <Empty icon="🗺️" text="플랜을 찾을 수 없어요." />
    return <PlanDetail plan={plan} onChange={patch => update(plan.id, patch)} onBack={() => setMode('list')} onDelete={() => remove(plan.id)} />
  }
  if (mode === 'new') {
    const nights = tripDays(start, end)
    const valid = !!(start && end && nights > 0)
    const options = DESTINATIONS.map(d => d.name)
    if (!options.includes(destName)) options.unshift(destName)
    return (
      <div className="px-4 pt-2 pb-6 space-y-4">
        <button onClick={() => setMode('list')} className="text-[13px] text-brand-600 font-bold">← 내 여행</button>
        <div className="bg-white rounded-2xl shadow-soft p-4 space-y-4">
          <div><label className="text-[12px] text-slate-500">어디로 가세요?</label>
            <select value={destName} onChange={e => setDestName(e.target.value)} className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]">{options.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[12px] text-slate-500">출발일</label><input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]" /></div>
            <div><label className="text-[12px] text-slate-500">귀국일</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]" /></div>
          </div>
          {valid && <div className="text-[12.5px] text-brand-600 font-bold">{nights - 1}박 {nights}일 일정으로 만들어드릴게요</div>}
          <button onClick={create} disabled={!valid} className={'w-full font-bold rounded-2xl py-3.5 ' + (valid ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-slate-100 text-slate-400')}>여행 플랜 만들기 🗺️</button>
        </div>
        <p className="text-[12px] text-slate-400 px-1 leading-relaxed">목적지·날짜를 고르면 <b className="text-slate-500">준비물 체크리스트 · 현지 기본 정보 · 일자별 빈 일정표</b>를 만들어드려요. 일정은 직접 채우는 방식이라, 없는 정보를 지어내지 않아요.</p>
      </div>
    )
  }
  return (
    <div className="px-4 pt-2 pb-6 space-y-3">
      <button onClick={() => { setStart(''); setEnd(''); setMode('new') }} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">+ 새 여행 플랜 만들기</button>
      {plans.length === 0
        ? <div className="text-center text-slate-400 py-16"><div className="text-4xl mb-2">🗺️</div><div className="text-[13px] px-8 leading-relaxed">아직 만든 여행 플랜이 없어요.<br />항공권을 예약했다면, 여기서 준비물과 일정을 정리해보세요.</div></div>
        : plans.map(p => {
          const done = PREP_KEYS.filter(k => p.checks && p.checks[k]).length
          const slug = p.codes && p.codes.length ? DEST_PHOTO[p.codes[0]] : null, photo = slug ? photoBySlug(slug) : null
          return (
            <button key={p.id} onClick={() => setMode(p.id)} className="w-full flex gap-3 bg-white rounded-2xl shadow-soft p-3 text-left active:scale-[.99]">
              {photo ? <div className="w-16 h-16 rounded-xl bg-cover bg-center shrink-0 bg-slate-100" style={{ backgroundImage: `url(${photo})` }} /> : <div className="w-16 h-16 rounded-xl shrink-0 bg-brand-50 flex items-center justify-center text-2xl">🗺️</div>}
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-extrabold text-slate-800">📍 {p.destName}</div>
                <div className="text-[12px] text-slate-400 mt-0.5">{p.start ? `${mdSlash(p.start)} ~ ${mdSlash(p.end)}` : ''} · {p.days}일</div>
                <div className="text-[11.5px] text-brand-600 font-bold mt-1.5">준비물 {done}/{PREP_KEYS.length}</div>
              </div>
              <span className="text-slate-300 text-xl self-center">›</span>
            </button>
          )
        })}
    </div>
  )
}

/* ───────── 🏠 홈 (B안: 포토 감성 + 서비스 그리드 + 핫딜 검색) ───────── */
function homeDestGroups(deals) {
  const cities = {}
  deals.forEach(d => { const c = destOf(d); if (c && !cities[c]) cities[c] = d.city })
  return [
    { title: '바로 보기', items: [{ id: 'all', label: '전체 핫딜', sub: '지금 뜬 특가 전부', icon: '🔥' }] },
    { title: '나라 · 지역', items: [...Object.keys(REGION), ...Object.keys(GEO)].map(g => ({ id: 'g:' + g, label: g, icon: '🌏' })) },
    { title: '지금 딜 있는 도시', items: Object.entries(cities).map(([code, name]) => ({ id: 'c:' + code, label: name, sub: code, icon: '🏙️' })) },
  ]
}
function Home({ deals, onGo, onDeal, onDealFilter }) {
  const [ov, setOv] = useState(false)
  const wk = upcomingWeekends(todayStr())[0]
  const top = [...deals].sort((a, b) => (b.discount_rate || 0) - (a.discount_rate || 0)).slice(0, 2)
  return (
    <div>
      <div className="relative h-[248px] bg-cover bg-center bg-slate-300" style={{ backgroundImage: `linear-gradient(180deg,rgba(15,23,42,.4),rgba(15,23,42,.04) 38%,rgba(15,23,42,.82)),url(${photoBySlug('hero')})` }}>
        <div className="absolute top-5 left-5 right-5">
          <span className="text-white font-extrabold text-[16px]" style={{ textShadow: '0 1px 8px rgba(0,0,0,.5)' }}>✈️ 싸다구항공</span>
        </div>
        <div className="absolute left-5 right-5 bottom-12 text-white">
          <h1 className="text-[23px] font-extrabold leading-[1.3]" style={{ textShadow: '0 2px 14px rgba(0,0,0,.45)' }}>발품은 우리가 팔게<br />넌 떠나기만 해.</h1>
          <p className="text-[14px] font-bold mt-1.5" style={{ textShadow: '0 1px 8px rgba(0,0,0,.5)' }}>어딜봐도 싸다구.</p>
        </div>
      </div>
      <div className="bg-[#f2faf8] rounded-t-3xl -mt-7 relative px-4 pb-5">
        <button onClick={() => { haptic(); setOv(true) }} className="w-full bg-white rounded-2xl shadow-soft -mt-6 relative px-4 py-4 flex items-center gap-2.5 text-left active:scale-[.99] transition">
          <span>🔍</span><span className="text-slate-400 text-[14.5px]">어디로 떠나세요? 도시 · 나라 · 전체</span>
        </button>
        <div className="grid grid-cols-4 pt-5 pb-1">
          {[['hot', '🔥', '핫딜'], ['flights', '✈️', '항공편'], ['hotels', '🏨', '호텔'], ['planner', '🗺️', '플래너']].map(([k, ic, t]) => (
            <button key={k} onClick={() => onGo(k)} className="text-center py-1.5 active:scale-95 transition">
              <span className="w-[52px] h-[52px] mx-auto rounded-full bg-white shadow-soft flex items-center justify-center text-[24px]">{ic}</span>
              <span className="block text-[12px] font-bold text-slate-700 mt-1.5">{t}</span>
            </button>
          ))}
        </div>
        {wk && <button onClick={() => onGo('flights')} className="w-full bg-white rounded-2xl shadow-soft px-4 py-3 mt-3 flex items-center gap-3 text-left border-l-4 border-amber-400" style={{ borderRadius: '0 16px 16px 0' }}>
          <span className="text-[22px]">🗓️</span>
          <span className="flex-1"><b className="block text-[13.5px] text-amber-800">{wk.label}{wk.leave ? ' (연차 ' + wk.leave + '개)' : ''}</b><span className="text-[11.5px] text-amber-600">지금 제일 싸게 갈 수 있는 곳 보기 ›</span></span>
        </button>}
        <div className="flex items-baseline justify-between mt-6 mb-3">
          <h2 className="text-[17px] font-extrabold text-slate-900">🔥 지금 뜬 핫딜</h2>
          <button onClick={() => onDealFilter({})} className="text-[12px] text-brand-600 font-bold">전체 ›</button>
        </div>
        <div className="space-y-3.5">
          {top.map(d => {
            const ph = photoOf(d)
            return (
              <div key={d.id} onClick={() => { haptic(); onDeal(d) }} className="bg-white rounded-3xl shadow-soft overflow-hidden cursor-pointer active:scale-[.99] transition">
                <div className="relative h-[148px] bg-cover bg-center bg-slate-200" style={ph ? { backgroundImage: `url(${ph})` } : {}}>
                  {d.discount_rate > 0 && <span className="absolute top-3 left-3 bg-rose-500 text-white text-[11.5px] font-extrabold rounded-lg px-2.5 py-1">평소 대비 -{d.discount_rate}%</span>}
                  <span className="absolute left-3.5 bottom-3 text-white text-[18px] font-extrabold" style={{ textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>{d.city}</span>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-slate-700 font-bold truncate">🛫 {(() => { const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time); return <><b className={dep.weekend ? 'text-rose-500' : ''}>{dep.md}({dep.dow})</b> ~ <b className={ret.weekend ? 'text-rose-500' : ''}>{ret.md}({ret.dow})</b></> })()}</span>
                    <span className="text-[16px] font-black text-brand-600 shrink-0">{won(d.price)} <span className="text-[10px] text-slate-400 font-semibold">왕복</span></span>
                  </div>
                  <div className="text-[11.5px] text-slate-400 mt-1 truncate">{originOf(d)} 출발 · {d.airline} · {d.transfers === 0 ? '직항' : '경유 ' + d.transfers}{durOf(d) ? ' · ' + durOf(d) : ''}{isAuto(d) ? ' · 검수 전' : ''}</div>
                </div>
              </div>
            )
          })}
          {top.length === 0 && <Empty icon="🔎" text="지금 게시된 핫딜이 없어요. 알림을 걸어두면 뜨자마자 알려드릴게요." />}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={() => onGo('hotels')} className="relative h-[96px] rounded-2xl overflow-hidden text-left active:scale-[.98] transition">
            <div className="absolute inset-0 bg-cover bg-center bg-slate-300" style={{ backgroundImage: `url(${photoBySlug('bangkok')})` }} />
            <div className="absolute inset-0 p-3 flex flex-col justify-end" style={{ background: 'linear-gradient(180deg,rgba(15,23,42,.1),rgba(15,23,42,.75))' }}>
              <b className="text-white text-[13.5px]">🏨 호텔 최저가 비교</b><span className="text-slate-300 text-[10.5px]">부킹·아고다·트립 한 번에</span>
            </div>
          </button>
          <button onClick={() => onGo('flights')} className="relative h-[96px] rounded-2xl overflow-hidden text-left active:scale-[.98] transition">
            <div className="absolute inset-0 bg-cover bg-center bg-slate-300" style={{ backgroundImage: `url(${photoBySlug('tokyo')})` }} />
            <div className="absolute inset-0 p-3 flex flex-col justify-end" style={{ background: 'linear-gradient(180deg,rgba(15,23,42,.1),rgba(15,23,42,.75))' }}>
              <b className="text-white text-[13.5px]">✈️ 항공권 검색</b><span className="text-slate-300 text-[10.5px]">어디든지 · 날짜별 최저가</span>
            </div>
          </button>
        </div>
        <SearchOverlay open={ov} onClose={() => setOv(false)} title="어디 핫딜을 볼까요?" placeholder="도시·나라 (예: 오사카, 일본, ㅇㅅㅋ)" recentKey="homeDest" voice
          groups={homeDestGroups(deals)}
          onPick={it => { if (it.id === 'all') onDealFilter({}); else if (it.id.startsWith('g:')) onDealFilter({ cat: it.id.slice(2) }); else onDealFilter({ pick: it.id.slice(2) }) }} />
      </div>
    </div>
  )
}

/* ───────── 🔔 알림 ───────── */
function enablePush(prefs) {
  haptic(12)
  try {
    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async OneSignal => {
      await OneSignal.Notifications.requestPermission()
      try {
        await OneSignal.User.addTags({
          regions: ((prefs && prefs.regions) || []).join(',') || 'all',
          budget: String((prefs && prefs.budgetMax) || 0),
          direct: prefs && prefs.directOnly ? '1' : '0',
        })
      } catch (e) {}
    })
  } catch (e) { alert('푸시 설정 중 문제가 있었어요. 잠시 후 다시 시도해주세요.') }
}
function Alerts({ prefs, onSavePrefs }) {
  return (
    <div className="px-4 pb-4 pt-2 space-y-4">
      <Section title="📲 푸시 알림">
        <p className="text-[12.5px] text-slate-500 leading-relaxed mb-3">새 특가가 뜨면 폰으로 바로 알려드려요. 아이폰은 <b className="text-slate-600">홈 화면에 추가한 뒤</b> 켤 수 있어요.</p>
        <button onClick={() => enablePush(prefs)} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3">🔔 푸시 알림 켜기</button>
      </Section>
      <AlertSetup prefs={prefs} onSave={onSavePrefs} />
    </div>
  )
}

/* ───────── shell ───────── */
const TABS = [['home', '🏠', '홈'], ['hot', '🔥', '핫딜'], ['alerts', '🔔', '알림'], ['my', '👤', '마이']]
const TAB_TITLE = { hot: '🔥 핫딜', alerts: '특가 알림', flights: '최저가 항공권 검색', hotels: '호텔 최저가 비교', planner: '여행플래너', my: '마이' }

/* 홈화면 설치 유도 (안드로이드=네이티브 프롬프트, iOS=가이드 시트) */
function useInstall() {
  const [evt, setEvt] = useState(null)
  const [mode, setMode] = useState(null)
  useEffect(() => {
    if (localStorage.getItem('installHide')) return
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    if (standalone) return
    const h = e => { e.preventDefault(); setEvt(e); setMode('android') }
    window.addEventListener('beforeinstallprompt', h)
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setMode('ios')
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  const dismiss = () => { localStorage.setItem('installHide', '1'); setMode(null) }
  return { mode, evt, dismiss }
}
export default function App() {
  const [tab, setTab] = useState('home')
  const [deals, setDeals] = useState(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const [sel, setSel] = useState(null)
  const [planSeed, setPlanSeed] = useState(null)
  const [hotExt, setHotExt] = useState(null)
  const [savedIds, toggleSave] = useSaved()
  const [prefs, savePrefs] = useAlertPrefs()
  const loadDeals = () => fetch(import.meta.env.BASE_URL + 'published.json?' + Date.now()).then(r => r.json()).then(d => { setDeals(d.deals || []); const t = new Date(); setUpdatedAt(`${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`) }).catch(() => setDeals([]))
  useEffect(() => { loadDeals() }, [])
  // 공유 딥링크: #deal=id 로 들어오면 해당 딜 상세 자동 오픈
  useEffect(() => {
    if (!deals || !deals.length) return
    const m = location.hash.match(/^#deal=(.+)$/)
    if (m) {
      const d = deals.find(x => String(x.id) === decodeURIComponent(m[1]))
      if (d) { setSel(d); history.replaceState(null, '', location.pathname + location.search) }
    }
  }, [deals])
  const inst = useInstall()
  const [iosGuide, setIosGuide] = useState(false)
  // 앱 아이콘 배지: 설치된 PWA에 현재 핫딜 수
  useEffect(() => { try { if (deals && navigator.setAppBadge) navigator.setAppBadge(deals.length) } catch (e) {} }, [deals])
  // 상태바 색 동기화
  useEffect(() => { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', tab === 'home' ? '#14b8a6' : '#eefbf8') }, [tab])
  const switchTab = k => { haptic(); vt(() => setTab(k)) }
  const p = { savedIds, onSave: toggleSave, onOpen: setSel }
  return (
    <div className="max-w-md mx-auto min-h-full flex flex-col bg-[#eefbf8]">
      <main className="flex-1 pb-20">
        {deals === null && <div className="px-4 pt-8"><SkelRows n={5} /></div>}
        {deals && tab !== 'home' && <div className="px-5 pt-7 pb-1 flex items-center gap-1.5">
          {!TABS.some(t => t[0] === tab) && <button onClick={() => switchTab('home')} className="text-[22px] text-slate-500 -ml-2 pr-1">←</button>}
          <h1 className="text-[22px] font-extrabold text-slate-900">{TAB_TITLE[tab]}</h1>
        </div>}
        {deals && tab === 'home' && <Home deals={deals} onGo={switchTab} onDeal={setSel} onDealFilter={f => { setHotExt({ ...f, ts: Date.now() }); switchTab('hot') }} />}
        {deals && tab === 'hot' && (deals.length ? <HotDeals deals={deals} {...p} prefs={prefs} ext={hotExt} onRefresh={loadDeals} updatedAt={updatedAt} /> : <Empty icon="🔎" text="핫딜이 아직 없어요. 알림을 걸어두면 뜨자마자 알려드릴게요." />)}
        {deals && tab === 'alerts' && <Alerts prefs={prefs} onSavePrefs={savePrefs} />}
        {deals && tab === 'flights' && <Flights deals={deals} onOpen={setSel} />}
        {deals && tab === 'hotels' && <Suspense fallback={<div className="px-4 pt-2"><SkelRows n={4} /></div>}><Hotels /></Suspense>}
        {deals && tab === 'planner' && <Planner seed={planSeed} clearSeed={() => setPlanSeed(null)} />}
        {deals && tab === 'my' && <My prefs={prefs} onSavePrefs={savePrefs} />}
      </main>
      {inst.mode && <div className="fixed bottom-[70px] inset-x-0 max-w-md mx-auto px-3 z-40">
        <div className="bg-slate-900/95 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-soft fade-in">
          <span className="text-xl">📲</span>
          <div className="flex-1 text-[12.5px]"><b>홈 화면에 추가</b>하면 앱처럼 빨라요</div>
          <button onClick={() => { if (inst.mode === 'android' && inst.evt) { inst.evt.prompt(); inst.dismiss() } else setIosGuide(true) }} className="bg-brand-500 text-white text-[12.5px] font-bold rounded-full px-3.5 py-1.5">추가</button>
          <button onClick={inst.dismiss} className="text-white/50 text-[14px] px-1">✕</button>
        </div>
      </div>}
      {iosGuide && <Sheet open onClose={() => { setIosGuide(false); inst.dismiss() }} title="홈 화면에 추가하기">
        <div className="px-5 pb-8 pt-2 space-y-3.5 text-[14px] text-slate-700">
          <div className="flex gap-3 items-center"><span className="w-7 h-7 shrink-0 rounded-full bg-brand-50 text-brand-600 font-bold flex items-center justify-center">1</span><span>사파리 하단의 <b>공유 버튼</b>을 눌러요</span></div>
          <div className="flex gap-3 items-center"><span className="w-7 h-7 shrink-0 rounded-full bg-brand-50 text-brand-600 font-bold flex items-center justify-center">2</span><span>아래로 내려 <b>'홈 화면에 추가'</b>를 선택해요</span></div>
          <div className="flex gap-3 items-center"><span className="w-7 h-7 shrink-0 rounded-full bg-brand-50 text-brand-600 font-bold flex items-center justify-center">3</span><span>이제 앱처럼 열려요. 곧 <b>특가 알림</b>도 받을 수 있어요 🔔</span></div>
        </div>
      </Sheet>}
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-100 grid grid-cols-4 pb-[env(safe-area-inset-bottom)] z-40">
        {TABS.map(([k, ic, label]) => <button key={k} onClick={() => switchTab(k)} className={'py-2.5 flex flex-col items-center gap-0.5 text-[10.5px] ' + (tab === k ? 'text-brand-600 font-bold' : 'text-slate-400')}><span className="text-lg leading-none">{ic}</span>{label}</button>)}
      </nav>
      {sel && <DealSheet d={sel} onClose={() => setSel(null)} onPlan={d => { setSel(null); setPlanSeed(seedFromDeal(d)); setTab('planner') }} />}
    </div>
  )
}
