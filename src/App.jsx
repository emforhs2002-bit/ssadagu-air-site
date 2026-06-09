import React, { useEffect, useState } from 'react'
import { DESTINATIONS } from './destinations'

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
function report(id, kind) { const l = JSON.parse(localStorage.getItem('reports') || '[]'); l.push({ id, kind, at: new Date().toISOString() }); localStorage.setItem('reports', JSON.stringify(l)); alert('알려줘서 고마워요! 🙏 확인하고 바로 정리할게요.') }

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
          {d.airline} · {d.transfers === 0 ? '직항' : '경유 ' + d.transfers}
        </div>
        <div className="text-[12px] text-slate-500 mt-1.5">🛫 <b className={dep.weekend ? 'text-rose-500' : 'text-slate-700'}>{dep.md}({dep.dow})</b> · <b className={ret.weekend ? 'text-rose-500' : 'text-slate-700'}>{ret.md}({ret.dow})</b></div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {mine && <span className="text-[10.5px] font-bold text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">🔔 내 조건</span>}
          <span className="text-[10.5px] font-bold text-orange-600 bg-orange-50 rounded-full px-2 py-0.5">{d.badge || '🔥'} 핫딜</span>
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
function DealSheet({ d, onClose }) {
  if (!d) return null
  const dep = fmtDate(d.departure_time), ret = fmtDate(d.return_time)
  const pcv = priceCheckView(d.price_check), photo = photoOf(d), logo = logoOf(d)
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up max-h-[92vh] overflow-y-auto no-scrollbar">
        <div className="relative h-44 bg-cover bg-center bg-slate-200" style={photo ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55)),url(${photo})` } : {}}>
          <button onClick={onClose} className="absolute top-3 left-4 text-white/90 text-[13px] font-bold bg-black/25 rounded-full px-3 py-1.5">← 뒤로</button>
          <button onClick={onClose} className="absolute top-3 right-4 text-white text-xl bg-black/25 rounded-full w-8 h-8">✕</button>
          <div className="absolute bottom-3 left-5 right-5 text-white">
            <div className="text-[12px] opacity-90 flex items-center gap-1.5">{logo && <img src={logo} alt="" className="w-4 h-4 object-contain rounded-sm bg-white/80 p-px" onError={e => { e.target.style.display = 'none' }} />}{d.airline} · {d.transfers === 0 ? '직항' : '경유 ' + d.transfers}</div>
            <div className="text-2xl font-extrabold leading-tight mt-0.5">{d.badge} {d.city}</div>
          </div>
        </div>
        <div className="px-5 pt-4 pb-8 space-y-4 text-[13.5px]">
          <div className="flex items-end justify-between">
            <div className="text-slate-600 text-[13px]">🛫 <b className={dep.weekend ? 'text-rose-500' : 'text-slate-800'}>{dep.full}</b><br />🛬 <b className={ret.weekend ? 'text-rose-500' : 'text-slate-800'}>{ret.full}</b></div>
            <div className="text-right"><div className="text-[28px] font-black text-brand-600 leading-none">{won(d.price)}</div>{d.discount_rate > 0 ? <div className="text-[11px] font-bold text-rose-500 mt-1">왕복 · 평소 대비 -{d.discount_rate}%</div> : <div className="text-[11px] text-slate-400 mt-1">왕복</div>}</div>
          </div>
          {pcv && <div className={'rounded-2xl p-3 ' + (pcv.warn ? 'bg-amber-50' : 'bg-brand-50')}>
            <div className={'font-bold ' + (pcv.warn ? 'text-amber-700' : 'text-brand-700')}>{pcv.card}</div>
            <div className="text-slate-600 text-[12.5px] mt-1">{pcv.line}</div>
            {d.price_check.memo && <div className="text-[12px] text-slate-400 mt-1">메모: {d.price_check.memo}</div>}
          </div>}
          <a href={d.affiliate_url} target="_blank" rel="noopener" className="block text-center bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">예약처에서 확인하기 →</a>
          <div className="text-center text-[11px] text-slate-400">가격·환불은 예약처에서 최종 확인</div>
          <div className="border-t border-slate-100 pt-3"><div className="text-[12px] text-slate-400 mb-2">가격이 다르거나 마감됐나요?</div><div className="grid grid-cols-3 gap-2 text-[12.5px]">{[['price', '가격이 달라요'], ['soldout', '마감됐어요'], ['link', '링크 이상해요']].map(([k, t]) => <button key={k} onClick={() => report(d.id, k)} className="bg-slate-100 text-slate-600 rounded-xl py-2">{t}</button>)}</div></div>
        </div>
      </div>
    </div>
  )
}

/* ───────── 🔥 핫딜 (본체 · 포토 히어로) ───────── */
function HotDeals({ deals, savedIds, onSave, onOpen, prefs, onSearch, onRefresh, updatedAt }) {
  const [cat, setCat] = useState('all')
  const [pick, setPick] = useState(null)
  const base = pick ? deals.filter(d => destOf(d) === pick) : filterCat(deals, cat)
  const list = [...base].sort((a, b) => (matchPrefs(b, prefs) - matchPrefs(a, prefs)) || (b.discount_rate - a.discount_rate))
  const mineCount = hasPrefs(prefs) ? list.filter(d => matchPrefs(d, prefs)).length : 0
  const byCity = {}; deals.forEach(d => { const c = destOf(d); if (!byCity[c] || d.price < byCity[c].price) byCity[c] = d })
  const circles = Object.values(byCity).sort((a, b) => a.price - b.price)
  return (
    <div>
      {/* hero */}
      <div className="relative h-[330px] bg-cover bg-center bg-slate-300" style={{ backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,0) 26%,rgba(0,0,0,.62)),url(${photoBySlug('hero')})` }}>
        <div className="absolute top-5 left-5 right-5 flex items-center justify-between text-white" style={{ textShadow: '0 1px 8px rgba(0,0,0,.45)' }}>
          <span className="font-extrabold text-[15px]">✈️ 싸다구항공</span>
        </div>
        <div className="absolute left-5 right-5 bottom-24 text-white">
          <span className="inline-block text-[11.5px] font-bold border border-white/60 rounded-full px-3 py-1 mb-3">이번 주 안심 특가</span>
          <h1 className="text-[25px] font-extrabold leading-[1.32]" style={{ textShadow: '0 2px 14px rgba(0,0,0,.35)' }}>발품은 우리가 팔게.<br />넌 떠나기만 해.</h1>
          <p className="text-[12.5px] text-white/90 mt-2" style={{ textShadow: '0 1px 10px rgba(0,0,0,.4)' }}>6개 사이트 안 뒤져도, 안심 특가만 골라드려요</p>
        </div>
      </div>
      {/* sheet */}
      <div className="bg-[#eefbf8] rounded-t-[26px] -mt-6 relative px-4 pb-4">
        {/* floating search card → 어디 갈까 */}
        <div onClick={onSearch} className="bg-white rounded-2xl shadow-soft -mt-10 relative px-4 py-0.5 active:scale-[.99] transition cursor-pointer">
          <div className="flex items-center gap-2.5 py-3.5 text-[14.5px]"><span>🔍</span><span className="text-slate-400">어디로 떠나세요?</span></div>
          <div className="flex border-t border-slate-100 text-[14px]"><div className="flex-1 flex items-center gap-2 py-3.5"><span>📅</span><span className="text-slate-400">언제든</span></div><div className="flex-1 flex items-center gap-2 py-3.5 border-l border-slate-100 pl-3"><span>👤</span><span className="text-slate-400">1명</span></div></div>
          <div className="bg-brand-500 text-white text-center font-bold rounded-xl py-3.5 my-2">안심 특가 찾기</div>
        </div>
        {/* circles */}
        {circles.length > 0 && <>
          <div className="flex items-baseline justify-between mt-6 mb-3"><h2 className="text-[16.5px] font-extrabold text-slate-900">🔥 지금 뜬 핫딜</h2>{pick && <button onClick={() => setPick(null)} className="text-[12.5px] text-brand-600 font-bold">전체 ›</button>}</div>
          <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1">
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
          <button onClick={onRefresh} className="text-[12.5px] font-bold text-brand-600 active:scale-95">🔄 새로고침</button>
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

function FlightSearch() {
  const [origin, setOrigin] = useState('ICN'), [dest, setDest] = useState('FUK')
  const [oneway, setOneway] = useState(false)
  const [depart, setDepart] = useState(''), [ret, setRet] = useState(''), [pax, setPax] = useState(1)
  const go = () => {
    if (!depart) return alert('가는 날을 선택해 주세요')
    if (!oneway && !ret) return alert('오는 날을 선택하거나 편도를 켜주세요')
    window.open(aviaLink({ origin, dest, depart, ret: oneway ? '' : ret, pax }), '_blank', 'noopener')
  }
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Pick label="출발" value={origin} onChange={setOrigin} options={ORIGINS.map(([c, n]) => [c, `${n}(${c})`])} />
          <Pick label="도착" value={dest} onChange={setDest} options={CITIES.map(([c, n]) => [c, `${n}(${c})`])} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[12px] text-slate-500">가는 날</label><input type="date" min={todayStr()} value={depart} onChange={e => setDepart(e.target.value)} className={inputCls} /></div>
          <div><label className="text-[12px] text-slate-500">오는 날</label><input type="date" min={depart || todayStr()} value={ret} disabled={oneway} onChange={e => setRet(e.target.value)} className={inputCls + (oneway ? ' opacity-40' : '')} /></div>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] text-slate-600"><input type="checkbox" checked={oneway} onChange={e => setOneway(e.target.checked)} /> 편도</label>
          <div className="flex items-center gap-2 text-[13px] text-slate-600">인원<select value={pax} onChange={e => setPax(+e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1">{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}명</option>)}</select></div>
        </div>
        <button onClick={go} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">예약처에서 가격 확인하기 →</button>
      </div>
      <p className="text-[12px] text-slate-400 leading-relaxed px-1">싸다구항공은 항공권을 직접 팔지 않고, <b className="text-slate-500">별도 예약 수수료도 붙이지 않아요.</b> 버튼을 누르면 예약처(Aviasales) 검색 결과로 이동해요. 가격·수하물·환불 조건은 예약처에서 최종 확인하세요.</p>
    </div>
  )
}

function FlightCalendar({ deals, onOpen }) {
  const [origin, setOrigin] = useState('ICN'), [dest, setDest] = useState('FUK'), [nights, setNights] = useState(3)
  const now = new Date()
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dealByDay = {}
  deals.forEach(d => { if (destOf(d) === dest) { const t = parseDt(d.departure_time); if (t) dealByDay[ymd(t.getFullYear(), t.getMonth(), t.getDate())] = d } })
  const lead = new Date(cur.y, cur.m, 1).getDay()
  const daysIn = new Date(cur.y, cur.m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysIn; d++) cells.push(d)
  const prevM = () => setCur(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const nextM = () => setCur(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })
  const onDay = d => {
    const key = ymd(cur.y, cur.m, d)
    if (dealByDay[key]) return onOpen(dealByDay[key])
    const r = new Date(cur.y, cur.m, d + nights)
    window.open(aviaLink({ origin, dest, depart: key, ret: ymd(r.getFullYear(), r.getMonth(), r.getDate()), pax: 1 }), '_blank', 'noopener')
  }
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Pick label="출발" value={origin} onChange={setOrigin} options={ORIGINS.map(([c, n]) => [c, `${n}(${c})`])} />
          <Pick label="도착" value={dest} onChange={setDest} options={CITIES.map(([c, n]) => [c, `${n}(${c})`])} />
        </div>
        <div className="flex items-center gap-2 text-[13px] text-slate-600">여행 기간<select value={nights} onChange={e => setNights(+e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1">{[2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}박</option>)}</select><span className="text-[12px] text-slate-400">(날짜를 누르면 그 일정으로 검색)</span></div>
      </div>
      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="flex items-center justify-between px-1 mb-2">
          <button onClick={prevM} className="text-slate-400 text-2xl px-3 leading-none">‹</button>
          <div className="font-bold text-[15px]">{cur.y}년 {cur.m + 1}월</div>
          <button onClick={nextM} className="text-slate-400 text-2xl px-3 leading-none">›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] mb-1">{['일', '월', '화', '수', '목', '금', '토'].map((w, i) => <div key={i} className={i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}>{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const key = ymd(cur.y, cur.m, d)
            const past = new Date(cur.y, cur.m, d) < today
            const deal = dealByDay[key]
            const dow = (lead + d - 1) % 7
            return (
              <button key={i} disabled={past} onClick={() => onDay(d)}
                className={'aspect-square rounded-xl flex flex-col items-center justify-center text-[12px] ' + (past ? 'text-slate-200' : deal ? 'bg-brand-500 text-white font-bold' : 'bg-slate-50 active:bg-slate-100 ' + (dow === 0 ? 'text-rose-400' : dow === 6 ? 'text-blue-400' : 'text-slate-600'))}>
                <span>{d}</span>
                {deal && <span className="text-[8.5px] font-bold leading-none mt-0.5">{Math.round(deal.price / 10000)}만</span>}
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-[12px] text-slate-400 leading-relaxed px-1"><b className="text-brand-600">초록 날</b>은 사람이 확인한 <b className="text-brand-600">안심 특가</b>가 있는 날이에요(가격 표시·누르면 상세). 그 외 날짜를 누르면 예약처(Aviasales)에서 <b className="text-slate-500">{nights}박 일정</b> 가격을 확인해요. 인앱에 가격을 따로 띄우지 않아요 — 예약처 실제가가 정확하니까요.</p>
    </div>
  )
}

function Flights({ deals, onOpen }) {
  const [mode, setMode] = useState('search')
  return (
    <div className="px-4 pt-2 pb-4">
      <div className="flex gap-2 mb-3">
        <Seg on={mode === 'search'} onClick={() => setMode('search')}>🔎 검색</Seg>
        <Seg on={mode === 'calendar'} onClick={() => setMode('calendar')}>📅 달력</Seg>
      </div>
      {mode === 'search' ? <FlightSearch /> : <FlightCalendar deals={deals} onOpen={onOpen} />}
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
      <AlertSetup prefs={prefs} onSave={onSavePrefs} />
      <Section title="관심 공항"><div className="flex gap-2 flex-wrap">{['인천(ICN)', '김포(GMP)'].map(a => <span key={a} className="text-[13px] bg-brand-50 text-brand-700 rounded-full px-3 py-1.5">{a}</span>)}</div></Section>
      <Section title="이런 특가는 숨기기"><Toggle label="경유 항공권 숨기기" k="no_transfer" /><Toggle label="새벽 출발/도착 숨기기" k="no_dawn" /><Toggle label="수하물 별도(LCC) 숨기기" k="no_lcc" /></Section>
      <div className="text-center text-[11px] text-slate-400 pt-2">싸다구항공 · 결제·환불은 판매처 직접, 우린 안심 특가만 골라드려요</div>
    </div>
  )
}

/* ───────── 🗺️ 여행 플래너 (준비 중) ───────── */
const Planner = () => <div className="px-6 pt-16 text-center">
  <div className="text-5xl mb-3">🗺️</div>
  <div className="text-lg font-extrabold mb-1">여행 플래너</div>
  <div className="inline-block text-[11px] font-bold text-brand-700 bg-brand-100 rounded-full px-2.5 py-1 mb-4">준비 중</div>
  <div className="text-[13.5px] text-slate-500 leading-relaxed">항공권을 예약하면, 도착·숙소 위치에 맞춰<br />일자별 동선까지 짜드릴게요. 곧 만나요!</div>
</div>

/* ───────── shell ───────── */
const TABS = [['hot', '🔥', '핫딜'], ['flights', '✈️', '항공편'], ['planner', '🗺️', '여행플래너'], ['my', '👤', '마이']]
const TAB_TITLE = { flights: '항공편', planner: '여행플래너', my: '마이' }
export default function App() {
  const [tab, setTab] = useState('hot')
  const [deals, setDeals] = useState(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const [sel, setSel] = useState(null)
  const [savedIds, toggleSave] = useSaved()
  const [prefs, savePrefs] = useAlertPrefs()
  const loadDeals = () => fetch(import.meta.env.BASE_URL + 'published.json?' + Date.now()).then(r => r.json()).then(d => { setDeals(d.deals || []); const t = new Date(); setUpdatedAt(`${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`) }).catch(() => setDeals([]))
  useEffect(() => { loadDeals() }, [])
  const p = { savedIds, onSave: toggleSave, onOpen: setSel }
  return (
    <div className="max-w-md mx-auto min-h-full flex flex-col bg-[#eefbf8]">
      <main className="flex-1 pb-20">
        {deals === null && <Empty icon="⏳" text="불러오는 중…" />}
        {deals && tab !== 'hot' && <div className="px-5 pt-7 pb-1"><h1 className="text-[22px] font-extrabold text-slate-900">{TAB_TITLE[tab]}</h1></div>}
        {deals && tab === 'hot' && (deals.length ? <HotDeals deals={deals} {...p} prefs={prefs} onSearch={() => setTab('flights')} onRefresh={loadDeals} updatedAt={updatedAt} /> : <Empty icon="🔎" text="핫딜이 아직 없어요." />)}
        {deals && tab === 'flights' && <Flights deals={deals} onOpen={setSel} />}
        {deals && tab === 'planner' && <Planner />}
        {deals && tab === 'my' && <My prefs={prefs} onSavePrefs={savePrefs} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-100 grid grid-cols-4 pb-[env(safe-area-inset-bottom)] z-40">
        {TABS.map(([k, ic, label]) => <button key={k} onClick={() => setTab(k)} className={'py-2.5 flex flex-col items-center gap-0.5 text-[10.5px] ' + (tab === k ? 'text-brand-600 font-bold' : 'text-slate-400')}><span className="text-lg leading-none">{ic}</span>{label}</button>)}
      </nav>
      {sel && <DealSheet d={sel} onClose={() => setSel(null)} />}
    </div>
  )
}
