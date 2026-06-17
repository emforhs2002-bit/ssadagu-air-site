import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, SearchOverlay, RangeCalendar, StepRow, MadLib, SkelRows, haptic, shareIt, useCountUp } from './ui'

/* ───────── 🏨 호텔 최저가 비교 (메타서치 · 문장형 검색) ─────────
   우리가 팔지 않는다. 예약처별 가격을 그대로 비교해 어디가 제일 싼지 보여주고,
   제휴 안 된 예약처가 싸도 그리로 보낸다. 데이터=Xotelo(TripAdvisor) 워커 프록시. 참고가. */

const PROXY = 'https://curly-meadow-ab36ssadagu-proxy.emforhs2002.workers.dev'
const ALLIANCE = 'Allianceid=8617491&SID=318432318'

/* 호텔 한글명 (구글지도 표기, ko_names.json — 월간 배치 수집. 없으면 영어 폴백) */
let KO = {}
let HLANG = (() => { try { return localStorage.getItem('hotelLang') || 'ko' } catch (e) { return 'ko' } })()
let _koP = null
const loadKo = () => _koP || (_koP = fetch(import.meta.env.BASE_URL + 'ko_names.json')
  .then(r => (r.ok ? r.json() : {})).then(j => { KO = j || {} }).catch(() => {}))
const hname = h => (HLANG === 'ko' && KO[h.key]) || h.name          // 표시명
const hsub = h => (HLANG === 'ko' && KO[h.key] && KO[h.key] !== h.name ? h.name : null)  // 영어 부제

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
// 아동: 앱이 나이를 따로 받지 않으므로, 나이를 요구하는 예약처(부킹 등)는 기본 10세로 채운다
const childAges = ch => Array(Math.max(0, ch | 0)).fill(10)
const PROVIDERS = {
  BookingCom: { name: '부킹닷컴', url: (n, ci, co, ad, rm, ch = 0) => `https://www.booking.com/searchresults.ko.html?ss=${enc(n)}&checkin=${ci}&checkout=${co}&group_adults=${ad}&no_rooms=${rm}` + (ch > 0 ? `&group_children=${ch}` + childAges(ch).map(a => `&age=${a}`).join('') : '') },
  Agoda: { name: '아고다', url: (n, ci, co, ad, rm, ch = 0) => `https://www.agoda.com/search?textToSearch=${enc(n)}&checkIn=${ci}&los=${nightsOf(ci, co) || 1}&rooms=${rm}&adults=${ad}` + (ch > 0 ? `&children=${ch}&childAges=${childAges(ch).join(',')}` : '') },
  CtripTA: { name: '트립닷컴', url: (n, ci, co, ad, rm = 1, ch = 0) => `https://kr.trip.com/hotels/list?searchWord=${enc(n)}&checkin=${ci}&checkout=${co}&adult=${ad}&crn=${rm}` + (ch > 0 ? `&children=${ch}` : '') + `&${ALLIANCE}&trip_sub1=hotel_tab` },
  Expedia: { name: '익스피디아', url: (n, ci, co, ad = 2, rm = 1, ch = 0) => `https://www.expedia.co.kr/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}&adults=${ad}&rooms=${rm}` + (ch > 0 ? `&children=${ch}` : '') },
  HotelsCom: { name: '호텔스닷컴', url: (n, ci, co, ad = 2, rm = 1, ch = 0) => `https://kr.hotels.com/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}&adults=${ad}&rooms=${rm}` + (ch > 0 ? `&children=${ch}` : '') },
  Priceline: { name: '프라이스라인', url: null },
  Travelocity: { name: '트래블로시티', url: (n, ci, co, ad = 2, rm = 1, ch = 0) => `https://www.travelocity.com/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}&adults=${ad}&rooms=${rm}` + (ch > 0 ? `&children=${ch}` : '') },
  Orbitz: { name: '오르비츠', url: (n, ci, co, ad = 2, rm = 1, ch = 0) => `https://www.orbitz.com/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}&adults=${ad}&rooms=${rm}` + (ch > 0 ? `&children=${ch}` : '') },
}
const provName = c => (PROVIDERS[c] && PROVIDERS[c].name) || c
// 실시간 비교가(Xotelo)가 안 잡힐 때 직접 검색으로 보내줄 주요 예약처 (딥링크 빌더 있는 것만)
const FALLBACK_PROVIDERS = ['BookingCom', 'Agoda', 'CtripTA', 'Expedia', 'HotelsCom']

const MENTION_KO = { Family: '가족', Business: '비즈니스', 'Mid-range': '중급', Luxury: '럭셔리', Budget: '가성비', 'City View': '시티뷰', Romantic: '커플', Spa: '스파', Beach: '해변', 'Breakfast included': '조식 포함' }
/* 필터 (트립닷컴 스타일 — 불러온 호텔에 즉시 적용) */
const PRICE_BUCKETS = [['10만 이하', 0, 100000], ['10~20만', 100000, 200000], ['20~40만', 200000, 400000], ['40만 이상', 400000, Infinity]]
const TAG_OPTIONS = ['조식 포함', '가족', '커플', '가성비', '럭셔리', '비즈니스', '스파', '해변', '시티뷰']
const hotelTags = h => {
  const t = (h.mentions || []).map(m => MENTION_KO[m]).filter(Boolean)
  if ((h.labels || []).includes('Breakfast included')) t.push('조식 포함')
  return t
}
/* 인기 도시 (빈 화면용 사진 카드) */
const POPULAR_CITIES = [
  ['g298566', '오사카', 'osaka'], ['g298184', '도쿄', 'tokyo'], ['g298207', '후쿠오카', 'fukuoka'], ['g293916', '방콕', 'bangkok'],
  ['g298085', '다낭', 'danang'], ['g293913', '타이베이', 'taipei'], ['g294261', '세부', 'cebu'], ['g60668', '괌', 'guam'],
]
const destPhoto = slug => import.meta.env.BASE_URL + 'dest/' + slug + '.jpg'
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
const dmKey = (k, ci, co) => `dm2_${k}_${ci}_${co}`
// 캐시 값: undefined(미조회) | null(이 날짜 비교가 없음) | {min,max,rows:[{code,total}×3]}
function dmCached(k, ci, co) { try { const c = sessionStorage.getItem(dmKey(k, ci, co)); return c == null ? undefined : JSON.parse(c) } catch (e) { return undefined } }
async function dayRatesOf(k, ci, co) {
  const v = await rqEnqueue(async () => {
    const r = await fetch(`${PROXY}/xotelo/rates?hotel_key=${k}&chk_in=${ci}&chk_out=${co}&currency=USD`)
    const j = await r.json()
    const rates = (j.result && j.result.rates) || []
    if (!rates.length) return null
    const totals = rates.map(x => ({ code: x.code, total: x.rate + (x.tax || 0) })).sort((a, b) => a.total - b.total)
    return { min: totals[0].total, max: totals[totals.length - 1].total, rows: totals.slice(0, 3) }
  }).catch(() => null)
  try { sessionStorage.setItem(dmKey(k, ci, co), JSON.stringify(v)) } catch (e) {}
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

/* 실시간 비교가가 없을 때: 호텔명·날짜·인원을 채운 예약처 직접검색 버튼들 */
function ProviderLinks({ h, ci, co, adults, rooms, children }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {FALLBACK_PROVIDERS.map(code => {
        const p = PROVIDERS[code]
        const href = p && p.url ? p.url(h.name, ci, co, adults, rooms, children) : h.taUrl
        return (
          <a key={code} href={href} target="_blank" rel="noopener"
            onClick={() => { haptic(); try { fetch(`${PROXY}/click`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'hotel', id: h.key + ':' + code }), keepalive: true }).catch(() => {}) } catch (e) {} }}
            className="flex items-center justify-between bg-slate-50 rounded-2xl px-3.5 py-3 text-[13.5px] font-bold text-slate-800">
            <span className="truncate">{p ? p.name : code}</span><span className="text-slate-400 text-[11px] shrink-0 pl-2">검색 ›</span>
          </a>
        )
      })}
    </div>
  )
}

/* ── 가격 비교 시트 ── */
function HotelSheet({ h, ci, co, adults, rooms, children, usdKrw, onClose }) {
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
  const maxTotal = st.status === 'ok' ? Math.max(...st.rates.map(r => r.rate + (r.tax || 0))) : null
  const minKrw = useCountUp(minTotal != null ? Math.round(minTotal * usdKrw) : null)
  const doShare = () => shareIt({
    title: `${hname(h)} 가격 비교`,
    text: `🏨 ${hname(h)} (${h.cityName}) ${md(ci)}~${md(co)} · 1박 ${minTotal != null ? wonFmt(minTotal * usdKrw) + '부터' : (h.priceMin != null ? '참고가 ' + wonFmt(h.priceMin * usdKrw) + '부터' : '가격 확인')} — 싸다구여행`,
    url: 'https://emforhs2002-bit.github.io/ssadagu-air-site/',
  })
  return (
    <Sheet open onClose={onClose} max="92vh">
      <div className="relative h-40 -mt-7 bg-cover bg-center bg-slate-200 rounded-t-3xl overflow-hidden" style={h.image ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55)),url(${h.image})` } : {}}>
        <button onClick={doShare} className="absolute top-3 right-4 text-white text-[13px] font-bold bg-black/25 rounded-full px-3 py-1.5">공유 ↗</button>
        <div className="absolute bottom-3 left-5 right-5 text-white">
          <div className="text-[12px] opacity-90">{h.cityName} · {h.rating ? `★ ${h.rating} (${(h.reviews || 0).toLocaleString('ko-KR')})` : '평점 없음'}</div>
          <div className="text-xl font-extrabold leading-tight mt-0.5">{hname(h)}</div>
          {hsub(h) && <div className="text-[11px] opacity-75 truncate">{hsub(h)}</div>}
        </div>
      </div>
      <div className="px-5 pt-4 pb-8 space-y-3 text-[13.5px]">
        <div className="flex items-center justify-between">
          <div className="text-[12.5px] text-slate-500">🗓️ {md(ci)} ~ {md(co)} · {nights}박 · 성인 {adults}</div>
          {minKrw != null ? <div className="text-[13px] font-bold text-brand-600">1박 최저 {wonFmt(minKrw)}</div> : (h.priceMin != null && <div className="text-[13px] font-bold text-brand-600">참고가 1박 {wonFmt(h.priceMin * usdKrw)}~</div>)}
        </div>
        {minTotal != null && maxTotal > minTotal && Math.round((maxTotal - minTotal) * usdKrw) >= 10000 &&
          <div className="bg-rose-50 text-rose-600 text-[12.5px] font-bold rounded-xl px-3 py-2.5">💸 같은 호텔인데 예약처 따라 1박 최대 <b>{wonFmt((maxTotal - minTotal) * usdKrw)}</b> 차이 — 최저 예약처를 콕 집어드렸어요</div>}
        {st.status === 'loading' && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="skel h-[58px] rounded-2xl" />)}</div>}
        {st.status === 'error' && <><div className="bg-slate-50 rounded-2xl p-3 text-[12.5px] text-slate-500">실시간 비교가를 잠깐 불러오지 못했어요. 아래 예약처에서 바로 확인해 보세요.</div><ProviderLinks h={h} ci={ci} co={co} adults={adults} rooms={rooms} children={children} /></>}
        {st.status === 'empty' && <><div className="bg-slate-50 rounded-2xl p-3 text-[12.5px] text-slate-500">{h.priceMin != null ? <>참고가는 1박 <b className="text-slate-700">{wonFmt(h.priceMin * usdKrw)}</b>부터예요. </> : ''}아래 예약처에서 이 날짜 실시간 가격을 확인하세요.</div><ProviderLinks h={h} ci={ci} co={co} adults={adults} rooms={rooms} children={children} /></>}
        {st.status === 'ok' && <div className="space-y-2">
          {st.rates.map((r, i) => {
            const total = r.rate + (r.tax || 0), lowest = total === minTotal
            const p = PROVIDERS[r.code]
            const href = p && p.url ? p.url(h.name, ci, co, adults, rooms, children) : h.taUrl
            return (
              <a key={i} href={href} target="_blank" rel="noopener" onClick={() => { haptic(); try { fetch(`${PROXY}/click`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'hotel', id: h.key + ':' + r.code }), keepalive: true }).catch(() => {}) } catch (e) {} }} className={'flex items-center justify-between rounded-2xl px-3.5 py-3 ' + (lowest ? 'bg-brand-50 glow-lowest shine' : 'bg-slate-50')}>
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

/* 네이버 호텔식 카드 — 큰 사진 + 예약처별 가격 인라인 비교 + 최저가 반짝 */
function HotelCard({ h, ci, co, adults, rooms, children, usdKrw, onOpen }) {
  const tags = (h.mentions || []).map(m => MENTION_KO[m]).filter(Boolean).slice(0, 3)
  const [dm, setDm] = useState(() => dmCached(h.key, ci, co))
  const ref = useRef(null)
  // 화면에 보일 때만 그 날짜의 예약처별 가격을 가져옴 (동시 3개 큐 + 세션 캐시)
  useEffect(() => {
    if (dm !== undefined) return
    const el = ref.current
    if (!el) return
    let dead = false
    const io = new IntersectionObserver(es => {
      if (es[0].isIntersecting) { io.disconnect(); dayRatesOf(h.key, ci, co).then(v => { if (!dead) setDm(v) }) }
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => { dead = true; io.disconnect() }
  }, [h.key, ci, co])
  const saving = dm && dm.max > dm.min ? Math.round((dm.max - dm.min) * usdKrw) : 0
  const rowGo = (e, r) => {
    e.stopPropagation(); haptic()
    try { fetch(`${PROXY}/click`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'hotel', id: h.key + ':' + r.code }), keepalive: true }).catch(() => {}) } catch (err) {}
    const p = PROVIDERS[r.code]
    window.open(p && p.url ? p.url(h.name, ci, co, adults, rooms, children) : h.taUrl, '_blank', 'noopener')
  }
  return (
    <div ref={ref} className="bg-white rounded-2xl shadow-soft overflow-hidden active:scale-[.995] transition cursor-pointer" onClick={() => { haptic(); onOpen(h) }}>
      <div className="relative h-36 bg-slate-100">
        {h.image ? <img src={h.image} alt="" loading="lazy" className="w-full h-full object-cover fade-in" onError={e => { e.target.style.display = 'none' }} /> : <div className="w-full h-full flex items-center justify-center text-3xl">🏨</div>}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {h.rating >= 4.5 && <span className="text-[10.5px] font-bold text-white bg-emerald-500/95 rounded-full px-2 py-0.5">⭐ 평점 우수</span>}
          {(h.reviews || 0) >= 2000 && <span className="text-[10.5px] font-bold text-white bg-sky-500/95 rounded-full px-2 py-0.5">💬 리뷰 많은</span>}
        </div>
        <span className="absolute bottom-2.5 right-2.5 text-[11.5px] font-bold text-brand-700 bg-white/95 rounded-full px-3 py-1.5 shadow">예약처 가격 보기 ›</span>
      </div>
      <div className="p-3.5">
        <div className="text-[15px] font-extrabold text-slate-900 leading-tight truncate">{hname(h)}</div>
        {hsub(h) && <div className="text-[10.5px] text-slate-300 truncate leading-tight">{hsub(h)}</div>}
        <div className="text-[12px] text-slate-400 mt-0.5 truncate">{h.rating ? <>★ <b className="text-slate-600">{h.rating}</b> ({(h.reviews || 0).toLocaleString('ko-KR')})</> : '평점 없음'}{h.type ? ` · ${h.type}` : ''}{tags.length > 0 && <> · {tags.join(' · ')}</>}</div>
        <div className="mt-2.5 space-y-1.5">
          {dm && dm.rows && dm.rows.length ? <>
            {dm.rows.map((r, i) => {
              const low = i === 0
              return (
                <button key={r.code + i} onClick={e => rowGo(e, r)} className={'w-full flex items-center justify-between rounded-xl px-3 py-2 text-left ' + (low ? 'bg-brand-50 glow-lowest shine' : 'bg-slate-50')}>
                  <span className="text-[12.5px] font-bold text-slate-700 truncate">{provName(r.code)} {low && <span className="text-[10px] font-bold text-white bg-brand-500 rounded-full px-1.5 py-0.5 align-middle">💰 최저</span>}</span>
                  <span className={'text-[14px] font-black shrink-0 pl-2 ' + (low ? 'text-brand-600' : 'text-slate-600')}>{wonFmt(r.total * usdKrw)}<span className="text-[10px] text-slate-400 font-medium"> /1박</span></span>
                </button>
              )
            })}
            {saving >= 10000 && <div className="text-[11.5px] font-bold text-rose-500 px-0.5">💸 예약처 따라 1박 최대 {wonFmt(saving)} 차이 — 최저 예약처를 콕 집었어요</div>}
          </> : <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
            <span className="text-[12px] text-slate-500">{h.priceMin != null ? '참고가 1박' : '예약처 가격'}</span>
            <span className="text-[14px] font-black text-brand-600">{h.priceMin != null ? <>{wonFmt(h.priceMin * usdKrw)}<span className="text-[10px] text-slate-400 font-medium">부터 · 눌러서 확인 ›</span></> : <span className="text-[12.5px]">눌러서 확인 ›</span>}</span>
          </div>}
        </div>
      </div>
    </div>
  )
}

export default function Hotels() {
  const [, koTick] = useState(0)
  useEffect(() => { loadKo().then(() => koTick(t => t + 1)) }, [])  // 한글명 로드 후 리렌더
  const setLang = l => { HLANG = l; try { localStorage.setItem('hotelLang', l) } catch (e) {}; koTick(t => t + 1) }
  const [geo, setGeo] = useState('g298566')
  const [ci, setCi] = useState(addDays(dstr(new Date()), 14))
  const [co, setCo] = useState(addDays(dstr(new Date()), 16))
  const [rooms, setRooms] = useState(1)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [sort, setSort] = useState('popularity')
  const [clientSort, setClientSort] = useState(null)   // 'price' | 'rating' | null(API 순서)
  const [flt, setFlt] = useState({ bucket: null, rating: null, tags: [] })
  const [ovFilter, setOvFilter] = useState(false)
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
        mentions: x.mentions, labels: x.merchandising_labels || [],
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
  const fltCount = (flt.bucket != null ? 1 : 0) + (flt.rating ? 1 : 0) + flt.tags.length
  const toggleTag = t => setFlt(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))
  // 필터+정렬 적용 결과 (불러온 호텔에 즉시 적용)
  const displayed = useMemo(() => {
    if (st.status !== 'ok') return []
    let arr = st.list.filter(h => {
      if (flt.bucket != null) {
        const b = PRICE_BUCKETS[flt.bucket]
        const p = h.priceMin != null ? h.priceMin * usdKrw : null
        if (p == null || p < b[1] || p >= b[2]) return false
      }
      if (flt.rating && !(h.rating >= flt.rating)) return false
      if (flt.tags.length) { const ts = hotelTags(h); if (!flt.tags.every(t => ts.includes(t))) return false }
      return true
    })
    // 정렬은 카드에 보이는 가격 기준: 날짜 가격(캐시 min)이 있으면 그걸, 없으면 참고가
    const eff = h => { const c = dmCached(h.key, ci, co); if (c && c.min != null) return c.min; return h.priceMin != null ? h.priceMin : 9e9 }
    const hasP = h => { const c = dmCached(h.key, ci, co); return (c && c.min != null) || h.priceMin != null }
    if (clientSort === 'price') arr = [...arr].sort((a, b) => eff(a) - eff(b))
    else if (clientSort === 'rating') arr = [...arr].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    // 가격 없는(만실 등) 호텔은 정렬 모드와 무관하게 항상 아래로 (그룹 내 기존 순서 유지 = 안정 정렬)
    arr = [...arr].sort((a, b) => (hasP(a) ? 0 : 1) - (hasP(b) ? 0 : 1))
    return arr
  }, [st, flt, clientSort, usdKrw, ci, co])
  const airbnbUrl = `https://www.airbnb.co.kr/s/${enc(CITY_OF[geo])}/homes?checkin=${ci}&checkout=${co}&adults=${adults}`

  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      {/* 구조화 검색 박스 (네이버·트립닷컴식 필드 구분형) */}
      <div className="bg-white rounded-3xl shadow-soft p-4 space-y-2">
        <button onClick={() => { haptic(); setOvCity(true) }} className="w-full bg-slate-50 rounded-xl px-3.5 py-3 text-left active:scale-[.99] transition">
          <div className="text-[10.5px] text-slate-400 font-bold">목적지</div>
          <div className="text-[15px] font-extrabold text-slate-800">📍 {CITY_OF[geo]}</div>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { haptic(); setOvCal(true) }} className="bg-slate-50 rounded-xl px-3.5 py-3 text-left active:scale-[.99] transition">
            <div className="text-[10.5px] text-slate-400 font-bold">체크인 · 체크아웃</div>
            <div className="text-[13.5px] font-extrabold text-slate-800">📅 {md(ci)}~{md(co)} · {nights}박</div>
          </button>
          <button onClick={() => { haptic(); setOvGuest(true) }} className="bg-slate-50 rounded-xl px-3.5 py-3 text-left active:scale-[.99] transition">
            <div className="text-[10.5px] text-slate-400 font-bold">인원 · 객실</div>
            <div className="text-[13.5px] font-extrabold text-slate-800">👤 {guestLabel}</div>
          </button>
        </div>
        <button onClick={() => search()} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl py-3.5">호텔 최저가 비교 🔍</button>
        <div className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3 py-1">
          <span className="text-[14px]">✨</span>
          <input value={nl} onChange={e => setNl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runNl() }} placeholder="말로 찾기: 7월 중순 오사카 2박 2명"
            className="flex-1 bg-transparent outline-none text-[13.5px] py-2 placeholder:text-slate-400" />
          <button onClick={runNl} disabled={nlBusy} className="text-[13px] font-bold text-brand-600 px-1">{nlBusy ? '…' : '찾기'}</button>
        </div>
      </div>

      {st.status === 'idle' && <div>
        <div className="flex items-baseline justify-between px-1 mb-2.5 mt-1">
          <h2 className="text-[16px] font-extrabold text-slate-900">🏨 어디 호텔을 비교해볼까요?</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {POPULAR_CITIES.map(([k, n, slug]) => (
            <button key={k} onClick={() => { haptic(); setGeo(k); search(k, sort) }} className="relative h-[104px] rounded-2xl overflow-hidden text-left active:scale-[.98] transition">
              <div className="absolute inset-0 bg-cover bg-center bg-slate-300" style={{ backgroundImage: `url(${destPhoto(slug)})` }} />
              <div className="absolute inset-0 p-3 flex flex-col justify-end" style={{ background: 'linear-gradient(180deg,rgba(15,23,42,.05),rgba(15,23,42,.72))' }}>
                <b className="text-white text-[15.5px]">{n}</b>
                <span className="text-slate-300 text-[10.5px]">부킹·아고다·트립 비교 ›</span>
              </div>
            </button>
          ))}
        </div>
      </div>}
      {st.status === 'loading' && <SkelRows n={5} />}
      {st.status === 'error' && <HEmpty icon="⚠️" text="호텔을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />}
      {st.status === 'ok' && <>
        <div className="flex items-center justify-between px-1">
          <div className="flex bg-white border border-slate-200 rounded-full p-0.5">
            {[['list', '목록'], ['map', '🗺️ 지도']].map(([v, t]) => <button key={v} onClick={() => { haptic(); setView(v) }} className={'text-[12px] rounded-full px-3 py-1 font-bold ' + (view === v ? 'bg-brand-500 text-white' : 'text-slate-500')}>{t}</button>)}
          </div>
          <select value={clientSort || sort} onChange={e => { haptic(); const v = e.target.value; if (v === 'price' || v === 'rating') { setClientSort(v) } else { setClientSort(null); setSort(v); search(geo, v) } }} className="text-[12px] font-bold text-slate-600 bg-white border border-slate-200 rounded-full pl-3 pr-2 py-1.5 outline-none">
            <option value="popularity">인기순</option>
            <option value="price">가격 낮은순</option>
            <option value="rating">평점순</option>
            <option value="best_value">가성비</option>
          </select>
        </div>
        {/* 필터 · 정렬 바 */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-0.5 -mt-1">
          <button onClick={() => { haptic(); setOvFilter(true) }} className={'shrink-0 text-[12px] rounded-full px-3 py-1.5 font-bold border ' + (fltCount ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200')}>⚙️ 필터{fltCount ? ' ' + fltCount : ''}</button>
          <button onClick={() => { haptic(); setLang(HLANG === 'ko' ? 'en' : 'ko') }} className="shrink-0 text-[12px] rounded-full px-3 py-1.5 font-bold border bg-white text-slate-600 border-slate-200">🌐 {HLANG === 'ko' ? '한글명' : 'English'}</button>
          <button onClick={() => { haptic(); setFlt(f => ({ ...f, rating: f.rating === 4 ? null : 4 })) }} className={'shrink-0 text-[12px] rounded-full px-3 py-1.5 font-bold border ' + (flt.rating === 4 ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200')}>4.0+</button>
          <button onClick={() => { haptic(); toggleTag('조식 포함') }} className={'shrink-0 text-[12px] rounded-full px-3 py-1.5 font-bold border ' + (flt.tags.includes('조식 포함') ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200')}>🍳 조식</button>
        </div>
        {view === 'map' && <>
          <HotelMap hotels={displayed} usdKrw={usdKrw} onOpen={setSel}
            canLoadMore={!!st.more && !st.loadingMore}
            onLoadMore={() => { const s = stRef.current; if (s.status === 'ok' && s.more && !s.loadingMore) fetchList(geo, sort, s.list.length, s.list) }} />
          <div className="text-[11.5px] text-slate-400 px-1">핀 숫자 = <b className="text-slate-500">1박 참고가(원)</b> · 핀을 누르면 가격 비교</div>
        </>}
        <div className="bg-slate-50 text-slate-500 text-[12px] rounded-xl px-3 py-2.5"><b className="text-rose-500">1박 · 세금 포함 참고가</b>예요. 판매 사이트에서 숙소명·위치·가격을 다시 확인하세요.</div>
        {view === 'list' && <div className="space-y-3">
          {displayed.map(h => <HotelCard key={h.key + ci + co} h={h} ci={ci} co={co} adults={adults} rooms={rooms} children={children} usdKrw={usdKrw} onOpen={setSel} />)}
          {displayed.length === 0 && <HEmpty icon="🔎" text="조건에 맞는 호텔이 아직 없어요. 아래 '더 불러오기'를 누르거나 필터를 줄여보세요." />}
        </div>}
        {view === 'list' && <div ref={sentinel} />}
        {st.loadingMore && <SkelRows n={2} />}
        {st.more && !st.loadingMore && <button onClick={() => fetchList(geo, sort, st.list.length, st.list)} className="w-full bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl py-3 text-[13.5px]">호텔 더 불러오기</button>}
        <a href={airbnbUrl} target="_blank" rel="noopener" onClick={() => haptic()} className="block text-center font-bold rounded-2xl py-3 text-[13.5px]" style={{ background: '#ffe9ee', color: '#e0254f' }}>🏠 에어비앤비에서 같은 날짜 보기 ↗</a>
      </>}

      <SearchOverlay open={ovCity} onClose={() => setOvCity(false)} title="어느 도시로 가세요?" placeholder="도시 검색 (예: 뉴욕, ㅇㅅㅋ)"
        recentKey="hotelCity" voice
        groups={CITY_GROUPS}
        onPick={it => { setGeo(it.id); search(it.id, sort) }} />
      <RangeCalendar open={ovCal} onClose={() => setOvCal(false)} title="체크인 · 체크아웃" mode="range"
        initStart={ci} initEnd={co} onConfirm={(s, e) => { setCi(s); setCo(e) }} />
      <Sheet open={ovFilter} onClose={() => setOvFilter(false)} title="필터">
        <div className="px-5 pb-6 pt-1 space-y-4">
          <div>
            <div className="text-[13px] font-bold text-slate-700 mb-2">가격대 (1박 참고가)</div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_BUCKETS.map((b, i) => <button key={b[0]} onClick={() => { haptic(); setFlt(f => ({ ...f, bucket: f.bucket === i ? null : i })) }} className={'text-[13px] rounded-full px-3.5 py-2 font-bold border ' + (flt.bucket === i ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200')}>{b[0]}</button>)}
            </div>
          </div>
          <div>
            <div className="text-[13px] font-bold text-slate-700 mb-2">평점</div>
            <div className="flex flex-wrap gap-1.5">
              {[[4.5, '4.5 이상'], [4, '4.0 이상'], [3.5, '3.5 이상']].map(([v, t]) => <button key={v} onClick={() => { haptic(); setFlt(f => ({ ...f, rating: f.rating === v ? null : v })) }} className={'text-[13px] rounded-full px-3.5 py-2 font-bold border ' + (flt.rating === v ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200')}>⭐ {t}</button>)}
            </div>
          </div>
          <div>
            <div className="text-[13px] font-bold text-slate-700 mb-2">특징 (여러 개)</div>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map(t => <button key={t} onClick={() => { haptic(); toggleTag(t) }} className={'text-[13px] rounded-full px-3.5 py-2 font-bold border ' + (flt.tags.includes(t) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200')}>{t}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={() => { haptic(); setFlt({ bucket: null, rating: null, tags: [] }) }} className="bg-slate-100 text-slate-600 font-bold rounded-2xl py-3">초기화</button>
            <button onClick={() => { haptic(12); setOvFilter(false) }} className="bg-brand-500 text-white font-bold rounded-2xl py-3">적용{fltCount ? ` (${fltCount})` : ''}</button>
          </div>
        </div>
      </Sheet>
      <Sheet open={ovGuest} onClose={() => setOvGuest(false)} title="인원 · 객실">
        <div className="px-5 pb-6 pt-1 divide-y divide-slate-100">
          <StepRow label="객실" value={rooms} min={1} max={5} onChange={setRooms} />
          <StepRow label="성인" sub="만 18세 이상" value={adults} min={1} max={9} onChange={setAdults} />
          <StepRow label="아동" sub="0~17세" value={children} min={0} max={6} onChange={setChildren} />
          <div className="pt-3"><button onClick={() => setOvGuest(false)} className="w-full bg-brand-500 text-white font-bold rounded-2xl py-3">완료</button></div>
        </div>
      </Sheet>
      {sel && <HotelSheet h={sel} ci={ci} co={co} adults={adults} rooms={rooms} children={children} usdKrw={usdKrw} onClose={() => setSel(null)} />}
    </div>
  )
}
