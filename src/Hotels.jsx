import React, { useEffect, useRef, useState } from 'react'
import { Sheet, SearchOverlay, RangeCalendar, StepRow, MadLib, SkelRows, haptic, shareIt, useCountUp } from './ui'

/* ───────── 🏨 호텔 최저가 비교 (메타서치 · 문장형 검색) ─────────
   우리가 팔지 않는다. 예약처별 가격을 그대로 비교해 어디가 제일 싼지 보여주고,
   제휴 안 된 예약처가 싸도 그리로 보낸다. 데이터=Xotelo(TripAdvisor) 워커 프록시. 참고가. */

const PROXY = 'https://curly-meadow-ab36ssadagu-proxy.emforhs2002.workers.dev'
const ALLIANCE = 'Allianceid=8617491&SID=318432318'

// 도시 → TripAdvisor location_key (2026-06-10 전수 실검증, 미국 13곳 포함)
const HOTEL_CITIES = [
  ['g298566', '오사카', '일본'], ['g298184', '도쿄', '일본'], ['g298207', '후쿠오카', '일본'], ['g298560', '삿포로', '일본'], ['g298223', '오키나와', '일본'],
  ['g293913', '타이베이', '대만'], ['g297908', '가오슝', '대만'], ['g294217', '홍콩', '홍콩'],
  ['g298085', '다낭', '베트남'], ['g293928', '나트랑', '베트남'], ['g293924', '하노이', '베트남'], ['g293925', '호치민', '베트남'],
  ['g293916', '방콕', '태국'], ['g293920', '푸켓', '태국'], ['g294261', '세부', '필리핀'], ['g298573', '마닐라', '필리핀'],
  ['g298307', '코타키나발루', '말레이시아'], ['g60668', '괌', '괌'], ['g294265', '싱가포르', '싱가포르'],
  ['g60763', '뉴욕', '미국'], ['g32655', '로스앤젤레스', '미국'], ['g60982', '호놀룰루(하와이)', '미국'], ['g29220', '마우이(하와이)', '미국'],
  ['g45963', '라스베가스', '미국'], ['g60713', '샌프란시스코', '미국'], ['g60750', '샌디에이고', '미국'], ['g60878', '시애틀', '미국'],
  ['g35805', '시카고', '미국'], ['g60745', '보스턴', '미국'], ['g28970', '워싱턴 DC', '미국'], ['g34515', '올랜도', '미국'], ['g34438', '마이애미', '미국'],
]
const CITY_OF = Object.fromEntries(HOTEL_CITIES.map(([k, n]) => [k, n]))
const GEO_OF = Object.fromEntries(HOTEL_CITIES.map(([k, n]) => [n, k]))
// 검색 오버레이용 지역 그룹
const HOTEL_REGIONS = [
  ['🇯🇵 일본', ['일본']], ['🇹🇼 대만 · 홍콩', ['대만', '홍콩']],
  ['🌴 동남아', ['베트남', '태국', '필리핀', '말레이시아', '싱가포르']], ['🏝️ 괌', ['괌']],
  ['🇺🇸 미국', ['미국']],
]
const CITY_GROUPS = HOTEL_REGIONS.map(([title, cs]) => ({
  title, items: HOTEL_CITIES.filter(c => cs.includes(c[2])).map(([k, n, c]) => ({ id: k, label: n, sub: c, icon: '🏙️' })),
}))

const enc = encodeURIComponent
const PROVIDERS = {
  BookingCom: { name: '부킹닷컴', url: (n, ci, co, ad, rm) => `https://www.booking.com/searchresults.ko.html?ss=${enc(n)}&checkin=${ci}&checkout=${co}&group_adults=${ad}&no_rooms=${rm}` },
  Agoda: { name: '아고다', url: (n, ci, co, ad, rm) => `https://www.agoda.com/ko-kr/search?textToSearch=${enc(n)}&checkIn=${ci}&checkOut=${co}&adults=${ad}&rooms=${rm}` },
  CtripTA: { name: '트립닷컴', url: (n, ci, co, ad) => `https://kr.trip.com/hotels/list?searchWord=${enc(n)}&checkin=${ci}&checkout=${co}&adult=${ad}&${ALLIANCE}&trip_sub1=hotel_tab` },
  Expedia: { name: '익스피디아', url: (n, ci, co) => `https://www.expedia.co.kr/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}` },
  HotelsCom: { name: '호텔스닷컴', url: (n, ci, co) => `https://kr.hotels.com/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}` },
  Priceline: { name: '프라이스라인', url: null }, Travelocity: { name: '트래블로시티', url: null }, Orbitz: { name: '오르비츠', url: null },
}
const provName = c => (PROVIDERS[c] && PROVIDERS[c].name) || c

const MENTION_KO = { Family: '가족', Business: '비즈니스', 'Mid-range': '중급', Luxury: '럭셔리', Budget: '가성비', 'City View': '시티뷰', Romantic: '커플', Spa: '스파', Beach: '해변', 'Breakfast included': '조식 포함' }
const wonFmt = n => (n == null ? '-' : '₩' + Math.round(n).toLocaleString('ko-KR'))
const pad2 = n => String(n).padStart(2, '0')
const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return dstr(d) }
const nightsOf = (ci, co) => { const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 0 }
const md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`

const HEmpty = ({ icon, text }) => <div className="text-center text-slate-400 py-14"><div className="text-4xl mb-2">{icon}</div><div className="text-[13px] px-10 leading-relaxed">{text}</div></div>

/* ── 날짜 기준 카드 가격: 보이는 카드만 rates 조회 (동시 3개 제한 + 세션 캐시) ── */
const RQ = { running: 0, q: [] }
function rqPump() {
  while (RQ.running < 3 && RQ.q.length) {
    const { fn, res, rej } = RQ.q.shift()
    RQ.running++
    fn().then(res, rej).finally(() => { RQ.running--; rqPump() })
  }
}
const rqEnqueue = fn => new Promise((res, rej) => { RQ.q.push({ fn, res, rej }); rqPump() })
const dmKey = (k, ci, co) => `dm_${k}_${ci}_${co}`
function dmCached(k, ci, co) { try { const c = sessionStorage.getItem(dmKey(k, ci, co)); return c == null ? undefined : (c === '' ? null : +c) } catch (e) { return undefined } }
async function dayMinOf(k, ci, co) {
  const v = await rqEnqueue(async () => {
    const r = await fetch(`${PROXY}/xotelo/rates?hotel_key=${k}&chk_in=${ci}&chk_out=${co}&currency=USD`)
    const j = await r.json()
    const rates = (j.result && j.result.rates) || []
    if (!rates.length) return null
    return Math.min(...rates.map(x => x.rate + (x.tax || 0)))
  }).catch(() => null)
  try { sessionStorage.setItem(dmKey(k, ci, co), v == null ? '' : String(v)) } catch (e) {}
  return v
}

/* ── 지도 보기: Leaflet+OpenStreetMap (무료·키 없음), 지도 열 때만 동적 로드 ── */
let leafletPromise = null
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload = () => resolve(window.L)
    s.onerror = reject
    document.head.appendChild(s)
  })
  return leafletPromise
}

function HotelMap({ hotels, usdKrw, onOpen, canLoadMore, onLoadMore }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const [inView, setInView] = useState(0)
  const userMoved = useRef(false)
  // moveend 핸들러가 항상 최신 값을 보도록 ref 경유
  const live = useRef({})
  live.current = { hotels, usdKrw, onOpen, canLoadMore, onLoadMore }

  const renderPins = (L, map) => {
    const b = map.getBounds()
    const { hotels: hs, usdKrw: fx, onOpen: open, canLoadMore: more, onLoadMore: loadMore } = live.current
    map.markersLayer.clearLayers()
    let n = 0
    hs.forEach(h => {
      if (!h.geo || h.geo.latitude == null || h.geo.longitude == null) return
      if (!b.contains([h.geo.latitude, h.geo.longitude])) return
      if (n >= 90) return
      n++
      const label = h.priceMin != null ? Math.round(h.priceMin * fx).toLocaleString('ko-KR') : (h.rating ? '★' + h.rating : '·')
      const icon = L.divIcon({ className: '', html: `<div class="map-pin">${label}</div>`, iconSize: null })
      L.marker([h.geo.latitude, h.geo.longitude], { icon }).on('click', () => { haptic(); open(h) }).addTo(map.markersLayer)
    })
    setInView(n)
    // 이 영역에 핀이 적으면 다음 페이지 자동 로드 → 영역 채워짐 (이동하며 탐색)
    if (n < 12 && more && loadMore) loadMore()
  }

  useEffect(() => {
    let dead = false
    loadLeaflet().then(L => {
      if (dead || !boxRef.current) return
      if (!mapRef.current) {
        const map = L.map(boxRef.current)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map)
        map.markersLayer = L.layerGroup().addTo(map)
        map.on('movestart', () => { if (!map.progMove) userMoved.current = true })
        map.on('moveend', () => renderPins(L, map))
        mapRef.current = map
      }
      const map = mapRef.current
      if (!userMoved.current) {
        const pts = hotels.filter(h => h.geo && h.geo.latitude != null).map(h => [h.geo.latitude, h.geo.longitude])
        if (pts.length) {
          map.progMove = true
          map.fitBounds(pts, { padding: [34, 34], maxZoom: 15 })
          setTimeout(() => { map.progMove = false }, 500)
        }
      }
      renderPins(L, map)
      setTimeout(() => map.invalidateSize(), 80)
    }).catch(() => setFailed(true))
    return () => { dead = true }
  }, [hotels, usdKrw])
  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }, [])
  if (failed) return <HEmpty icon="🗺️" text="지도를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
  return (
    <div className="relative">
      <div ref={boxRef} className="h-[460px] rounded-2xl overflow-hidden shadow-soft bg-slate-100 relative z-0" />
      <div className="absolute top-2.5 left-2.5 bg-white/95 rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-soft pointer-events-none">📍 이 지역 {inView}곳{canLoadMore ? ' · 지도를 움직이면 더 찾아요' : ''}</div>
    </div>
  )
}

function useUsdKrw() {
  const [rate, setRate] = useState(1500)
  const [live, setLive] = useState(false)
  useEffect(() => {
    fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW')
      .then(r => r.json()).then(j => { if (j && j.rates && j.rates.KRW) { setRate(j.rates.KRW); setLive(true) } })
      .catch(() => {})
  }, [])
  return [rate, live]
}

/* ── 자연어 한 줄 검색: 룰 기반 우선 → 부족하면 Gemini(워커 경유, 키 없으면 스킵) ── */
function ruleParse(text) {
  const out = {}
  for (const [, name] of HOTEL_CITIES.map(c => [c[0], c[1]])) if (text.includes(name)) { out.city = name; break }
  const mN = text.match(/(\d+)\s*박/); if (mN) out.nights = +mN[1]
  const mG = text.match(/(\d+)\s*명/); if (mG) out.guests = +mG[1]
  const now = new Date()
  const mD = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/)
  if (mD) {
    let y = now.getFullYear(); const m = +mD[1], d = +mD[2]
    if (m < now.getMonth() + 1) y += 1
    out.checkin = `${y}-${pad2(m)}-${pad2(d)}`
  } else {
    const mM = text.match(/(\d{1,2})\s*월\s*(초|중순|말)?/)
    if (mM) {
      let y = now.getFullYear(); const m = +mM[1]
      if (m < now.getMonth() + 1) y += 1
      const d = mM[2] === '초' ? 5 : mM[2] === '말' ? 25 : 15
      out.checkin = `${y}-${pad2(m)}-${pad2(d)}`
    }
  }
  return out
}
async function geminiParse(text) {
  const r = await fetch(`${PROXY}/gemini`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'hotel_slots', text, cities: HOTEL_CITIES.map(c => c[1]) }),
  })
  if (!r.ok) throw new Error('gemini ' + r.status)
  const j = await r.json()
  return j.slots || {}
}

/* ── 가격 비교 시트 ── */
function HotelSheet({ h, ci, co, adults, rooms, usdKrw, onClose }) {
  const [st, setSt] = useState({ status: 'loading' })
  const nights = nightsOf(ci, co)
  useEffect(() => {
    let alive = true
    setSt({ status: 'loading' })
    fetch(`${PROXY}/xotelo/rates?hotel_key=${h.key}&chk_in=${ci}&chk_out=${co}&currency=USD`)
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        const rates = (j.result && j.result.rates) || []
        if (j.error || !rates.length) setSt({ status: 'empty' })
        else setSt({ status: 'ok', rates: [...rates].sort((a, b) => (a.rate + (a.tax || 0)) - (b.rate + (b.tax || 0))) })
      })
      .catch(() => alive && setSt({ status: 'error' }))
    return () => { alive = false }
  }, [h.key, ci, co])
  const minTotal = st.status === 'ok' ? Math.min(...st.rates.map(r => r.rate + (r.tax || 0))) : null
  const minKrw = useCountUp(minTotal != null ? Math.round(minTotal * usdKrw) : null)
  const doShare = () => shareIt({
    title: `${h.name} 가격 비교`,
    text: `🏨 ${h.name} (${h.cityName}) ${md(ci)}~${md(co)} · 1박 최저 ${minTotal != null ? wonFmt(minTotal * usdKrw) : '비교 중'} — 예약처별 가격 비교는 싸다구항공에서`,
    url: 'https://emforhs2002-bit.github.io/ssadagu-air-site/',
  })
  return (
    <Sheet open onClose={onClose} max="92vh">
      <div className="relative h-40 -mt-7 bg-cover bg-center bg-slate-200 rounded-t-3xl overflow-hidden" style={h.image ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55)),url(${h.image})` } : {}}>
        <button onClick={doShare} className="absolute top-3 right-4 text-white text-[13px] font-bold bg-black/25 rounded-full px-3 py-1.5">공유 ↗</button>
        <div className="absolute bottom-3 left-5 right-5 text-white">
          <div className="text-[12px] opacity-90">{h.cityName} · {h.rating ? `★ ${h.rating} (${(h.reviews || 0).toLocaleString('ko-KR')})` : '평점 없음'}</div>
          <div className="text-xl font-extrabold leading-tight mt-0.5">{h.name}</div>
        </div>
      </div>
      <div className="px-5 pt-4 pb-8 space-y-3 text-[13.5px]">
        <div className="flex items-center justify-between">
          <div className="text-[12.5px] text-slate-500">🗓️ {md(ci)} ~ {md(co)} · {nights}박 · 성인 {adults}</div>
          {minKrw != null && <div className="text-[13px] font-bold text-brand-600">1박 최저 {wonFmt(minKrw / 1)}</div>}
        </div>
        {st.status === 'loading' && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="skel h-[58px] rounded-2xl" />)}</div>}
        {st.status === 'error' && <HEmpty icon="⚠️" text="가격을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />}
        {st.status === 'empty' && <div className="bg-slate-50 rounded-2xl p-3 text-[12.5px] text-slate-500">이 날짜엔 비교 가격이 안 잡혔어요. 아래 예약처에서 직접 확인해 보세요.</div>}
        {st.status === 'ok' && <div className="space-y-2">
          {st.rates.map((r, i) => {
            const total = r.rate + (r.tax || 0), lowest = total === minTotal
            const p = PROVIDERS[r.code]
            const href = p && p.url ? p.url(h.name, ci, co, adults, rooms) : h.taUrl
            return (
              <a key={i} href={href} target="_blank" rel="noopener" onClick={() => { haptic(); try { fetch(`${PROXY}/click`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'hotel', id: h.key + ':' + r.code }), keepalive: true }).catch(() => {}) } catch (e) {} }} className={'flex items-center justify-between rounded-2xl px-3.5 py-3 ' + (lowest ? 'bg-brand-50 glow-lowest' : 'bg-slate-50')}>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-slate-800">{provName(r.code)} {lowest && <span className="text-[10.5px] font-bold text-white bg-brand-500 rounded-full px-2 py-0.5 align-middle">🏆 전 예약처 최저</span>}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{r.tax ? `객실 ${wonFmt(r.rate * usdKrw)} + 세금 ${wonFmt(r.tax * usdKrw)}` : '세금 정보 없음'}</div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <div className={'text-[16px] font-black leading-none ' + (lowest ? 'text-brand-600' : 'text-slate-700')}>{wonFmt(total * usdKrw)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">1박 · 확인 ›</div>
                </div>
              </a>
            )
          })}
        </div>}
        <div className="bg-amber-50 text-amber-800 text-[11.5px] rounded-xl px-3 py-2">💡 환율 적용 <b>참고가</b>예요. 누르면 그 예약처에서 실제가·환불조건을 확인하고 결제해요. 우린 호텔을 팔지 않고 수수료도 안 붙여요.</div>
        <div className="grid grid-cols-2 gap-2">
          <a href={'https://www.google.com/maps/search/?api=1&query=' + (h.geo && h.geo.latitude ? h.geo.latitude + ',' + h.geo.longitude : enc(h.name))} target="_blank" rel="noopener" onClick={() => haptic()} className="text-center bg-slate-100 text-slate-700 font-bold rounded-2xl py-3 text-[13px]">🗺️ 구글 지도</a>
          <a href={h.taUrl} target="_blank" rel="noopener" className="text-center bg-slate-100 text-slate-700 font-bold rounded-2xl py-3 text-[13px]">⭐ 리뷰 보기</a>
        </div>
      </div>
    </Sheet>
  )
}

function HotelCard({ h, ci, co, usdKrw, onOpen }) {
  const tags = (h.mentions || []).map(m => MENTION_KO[m]).filter(Boolean).slice(0, 3)
  const [dayMin, setDayMin] = useState(() => dmCached(h.key, ci, co))
  const ref = useRef(null)
  // 화면에 보일 때만 그 날짜의 예약처별 최저가를 가져옴 (큐 대기 → 카드 가격이 날짜 기준으로 업그레이드)
  useEffect(() => {
    if (dayMin !== undefined) return
    const el = ref.current
    if (!el) return
    let dead = false
    const io = new IntersectionObserver(es => {
      if (es[0].isIntersecting) { io.disconnect(); dayMinOf(h.key, ci, co).then(v => { if (!dead) setDayMin(v) }) }
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => { dead = true; io.disconnect() }
  }, [h.key, ci, co])
  return (
    <div ref={ref} className="relative flex gap-3 bg-white rounded-2xl shadow-soft p-3 active:scale-[.99] transition cursor-pointer" onClick={() => { haptic(); onOpen(h) }}>
      <div className="w-[84px] h-[84px] rounded-2xl shrink-0 bg-slate-100 overflow-hidden flex items-center justify-center text-2xl">
        {h.image ? <img src={h.image} alt="" loading="lazy" className="w-full h-full object-cover fade-in" onError={e => { e.target.style.display = 'none' }} /> : '🏨'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-extrabold text-slate-900 leading-tight truncate">{h.name}</div>
        <div className="text-[12px] text-slate-400 mt-1">{h.rating ? <>★ <b className="text-slate-600">{h.rating}</b> ({(h.reviews || 0).toLocaleString('ko-KR')})</> : '평점 없음'}{h.type ? ` · ${h.type}` : ''}</div>
        {tags.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{tags.map(t => <span key={t} className="text-[10.5px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{t}</span>)}</div>}
        <div className="mt-1.5 text-[12px] text-slate-500">
          {dayMin === undefined ? <span className="skel inline-block h-[14px] w-28 rounded-md align-middle" />
            : dayMin != null ? <>1박 <b className="text-brand-600 text-[14px] font-black">{wonFmt(dayMin * usdKrw)}</b><span className="text-slate-400"> · 선택 날짜 · 세금포함</span></>
            : h.priceMin != null ? <>1박 <b className="text-slate-600 text-[13px] font-bold">{wonFmt(h.priceMin * usdKrw)}</b><span className="text-slate-400">부터 · 참고가</span></>
            : '가격은 비교에서 확인'}
        </div>
      </div>
      <div className="self-center text-brand-500 font-bold text-[12px] shrink-0">비교 ›</div>
    </div>
  )
}

export default function Hotels() {
  const [geo, setGeo] = useState('g298566')
  const [ci, setCi] = useState(addDays(dstr(new Date()), 14))
  const [co, setCo] = useState(addDays(dstr(new Date()), 16))
  const [rooms, setRooms] = useState(1)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [sort, setSort] = useState('popularity')
  const [view, setView] = useState('list')
  const [st, setSt] = useState({ status: 'idle' })
  const [sel, setSel] = useState(null)
  const [ovCity, setOvCity] = useState(false)
  const [ovCal, setOvCal] = useState(false)
  const [ovGuest, setOvGuest] = useState(false)
  const [nl, setNl] = useState('')
  const [nlBusy, setNlBusy] = useState(false)
  const [usdKrw] = useUsdKrw()
  const sentinel = useRef(null)
  const stRef = useRef(st); stRef.current = st

  const fetchList = async (g, srt, offset = 0, prev = []) => {
    setSt(offset === 0 ? { status: 'loading' } : { ...stRef.current, loadingMore: true })
    try {
      const r = await fetch(`${PROXY}/xotelo/list?location_key=${g}&limit=30&offset=${offset}&sort=${srt}`)
      const j = await r.json()
      const raw = (j.result && j.result.list) || []
      if (j.error || (!raw.length && offset === 0)) { setSt({ status: 'error' }); return }
      const items = raw.map(x => ({
        key: x.key, name: x.name, type: x.accommodation_type === 'Hotel' ? '' : x.accommodation_type,
        rating: x.review_summary && x.review_summary.rating, reviews: x.review_summary && x.review_summary.count,
        priceMin: x.price_ranges && x.price_ranges.minimum,
        image: x.image && x.image.replace('/photo-o/', '/photo-l/'),  // 원본 대신 550px 변형 (데이터 절약)
        mentions: x.mentions,
        geo: x.geo, taUrl: x.url, cityName: CITY_OF[g],
      }))
      const seen = new Set(prev.map(p => p.key))
      const list = [...prev, ...items.filter(it => !seen.has(it.key))]
      setSt({ status: 'ok', list, total: j.result.total_count, more: list.length < j.result.total_count, loadingMore: false })
    } catch (e) { setSt(offset === 0 ? { status: 'error' } : { ...stRef.current, loadingMore: false }) }
  }
  const search = (g = geo, srt = sort) => { haptic(12); fetchList(g, srt, 0, []) }

  // 무한 스크롤 (sentinel 보이면 다음 페이지)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(es => {
      const s = stRef.current
      if (es[0].isIntersecting && s.status === 'ok' && s.more && !s.loadingMore) fetchList(geo, sort, s.list.length, s.list)
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [st.status, geo, sort])

  const runNl = async () => {
    const text = nl.trim()
    if (!text) return
    setNlBusy(true); haptic()
    try {
      let slots = ruleParse(text)
      if (!slots.city) { try { slots = { ...(await geminiParse(text)), ...slots } } catch (e) {} }
      if (!slots.city || !GEO_OF[slots.city]) { alert('어느 도시인지 못 알아들었어요 😅 도시명을 넣어 다시 말해주세요 (예: 7월 중순 오사카 2박)'); return }
      const g = GEO_OF[slots.city]
      setGeo(g)
      let nci = ci, nco = co
      if (slots.checkin) { nci = slots.checkin; nco = addDays(slots.checkin, slots.nights || 2); setCi(nci); setCo(nco) }
      else if (slots.nights) { nco = addDays(ci, slots.nights); setCo(nco) }
      if (slots.guests) setAdults(Math.min(9, Math.max(1, slots.guests)))
      fetchList(g, sort, 0, [])
    } finally { setNlBusy(false) }
  }

  const nights = nightsOf(ci, co)
  const guestLabel = `성인 ${adults}${children ? ` · 아동 ${children}` : ''} · 객실 ${rooms}`

  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      {/* 문장형 검색 (Mad Libs) */}
      <div className="bg-white rounded-3xl shadow-soft p-5">
        <MadLib parts={[
          { t: CITY_OF[geo], on: () => setOvCity(true) }, '에서 ',
          { t: `${md(ci)} ~ ${md(co)} · ${nights}박`, on: () => setOvCal(true) }, ', ',
          { t: guestLabel, on: () => setOvGuest(true) }, ' 묵을 곳 찾기',
        ]} />
        <button onClick={() => search()} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5 mt-4">호텔 최저가 비교 🔍</button>
        <div className="flex items-center gap-2 mt-3 bg-slate-50 rounded-2xl px-3 py-1">
          <span className="text-[14px]">✨</span>
          <input value={nl} onChange={e => setNl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runNl() }} placeholder="말로 찾기: 7월 중순 오사카 2박 2명"
            className="flex-1 bg-transparent outline-none text-[13.5px] py-2 placeholder:text-slate-400" />
          <button onClick={runNl} disabled={nlBusy} className="text-[13px] font-bold text-brand-600 px-1">{nlBusy ? '…' : '찾기'}</button>
        </div>
      </div>

      {st.status === 'idle' && <p className="text-[12.5px] text-slate-400 px-1 leading-relaxed">밑줄 친 부분을 눌러 조건을 바꾸고 검색하면, 호텔별로 <b className="text-slate-500">부킹닷컴·아고다·트립닷컴 등 예약처 가격을 비교</b>해 어디가 제일 싼지 보여드려요. 우린 호텔을 팔지 않아요 — 제일 싼 예약처로 연결만 해요.</p>}
      {st.status === 'loading' && <SkelRows n={5} />}
      {st.status === 'error' && <HEmpty icon="⚠️" text="호텔을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />}
      {st.status === 'ok' && <>
        <div className="flex items-center justify-between px-1">
          <div className="text-[12px] text-slate-400">{CITY_OF[geo]} 숙소 <b className="text-slate-500">{(st.total || 0).toLocaleString('ko-KR')}곳</b></div>
          <div className="flex gap-1.5">
            <div className="flex bg-white border border-slate-200 rounded-full p-0.5">
              {[['list', '목록'], ['map', '🗺️ 지도']].map(([v, t]) => <button key={v} onClick={() => { haptic(); setView(v) }} className={'text-[12px] rounded-full px-3 py-1 font-bold ' + (view === v ? 'bg-brand-500 text-white' : 'text-slate-500')}>{t}</button>)}
            </div>
            {view === 'list' && [['popularity', '인기순'], ['best_value', '가성비순']].map(([v, t]) => <button key={v} onClick={() => { setSort(v); search(geo, v) }} className={'text-[12px] rounded-full px-3 py-1.5 font-bold ' + (sort === v ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200')}>{t}</button>)}
          </div>
        </div>
        {view === 'map' && <>
          <HotelMap hotels={st.list} usdKrw={usdKrw} onOpen={setSel}
            canLoadMore={!!st.more && !st.loadingMore}
            onLoadMore={() => { const s = stRef.current; if (s.status === 'ok' && s.more && !s.loadingMore) fetchList(geo, sort, s.list.length, s.list) }} />
          <div className="text-[11.5px] text-slate-400 px-1">핀의 숫자는 <b className="text-slate-500">1박 참고가(원)</b> · 핀을 누르면 예약처별 가격 비교가 열려요</div>
        </>}
        {view === 'list' && <div className="space-y-3">{st.list.map(h => <HotelCard key={h.key + ci + co} h={h} ci={ci} co={co} usdKrw={usdKrw} onOpen={setSel} />)}</div>}
        {view === 'list' && <div ref={sentinel} />}
        {st.loadingMore && <SkelRows n={2} />}
        {st.more && !st.loadingMore && <button onClick={() => fetchList(geo, sort, st.list.length, st.list)} className="w-full bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl py-3 text-[13.5px]">호텔 더 불러오기</button>}
      </>}

      <SearchOverlay open={ovCity} onClose={() => setOvCity(false)} title="어느 도시로 가세요?" placeholder="도시 검색 (예: 뉴욕, ㅇㅅㅋ)"
        recentKey="hotelCity" voice
        groups={CITY_GROUPS}
        onPick={it => { setGeo(it.id); search(it.id, sort) }} />
      <RangeCalendar open={ovCal} onClose={() => setOvCal(false)} title="체크인 · 체크아웃" mode="range"
        initStart={ci} initEnd={co} onConfirm={(s, e) => { setCi(s); setCo(e) }} />
      <Sheet open={ovGuest} onClose={() => setOvGuest(false)} title="인원 · 객실">
        <div className="px-5 pb-6 pt-1 divide-y divide-slate-100">
          <StepRow label="객실" value={rooms} min={1} max={5} onChange={setRooms} />
          <StepRow label="성인" sub="만 18세 이상" value={adults} min={1} max={9} onChange={setAdults} />
          <StepRow label="아동" sub="0~17세" value={children} min={0} max={6} onChange={setChildren} />
          <div className="pt-3"><button onClick={() => setOvGuest(false)} className="w-full bg-brand-500 text-white font-bold rounded-2xl py-3">완료</button></div>
        </div>
      </Sheet>
      {sel && <HotelSheet h={sel} ci={ci} co={co} adults={adults} rooms={rooms} usdKrw={usdKrw} onClose={() => setSel(null)} />}
    </div>
  )
}
