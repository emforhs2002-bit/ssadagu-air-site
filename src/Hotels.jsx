import React, { useEffect, useState } from 'react'

/* ───────── 🏨 호텔 최저가 비교 (메타서치) ─────────
   정체성: 우리가 팔지 않는다. 예약처별 가격을 그대로 비교해 어디가 제일 싼지 보여주고,
   제휴 안 된 예약처가 싸도 그리로 보낸다(커미션보다 고객 최저가 우선).
   데이터: Xotelo(TripAdvisor 기반) — 워커 프록시 경유(CORS·캐시). 가격은 참고가, 최종은 예약처. */

const PROXY = 'https://curly-meadow-ab36ssadagu-proxy.emforhs2002.workers.dev'
const ALLIANCE = 'Allianceid=8617491&SID=318432318'

// 도시 → TripAdvisor location_key (2026-06-10 전수 실검증 완료)
const HOTEL_CITIES = [
  ['g298566', '오사카'], ['g298184', '도쿄'], ['g298207', '후쿠오카'], ['g298560', '삿포로'], ['g298223', '오키나와'],
  ['g293913', '타이베이'], ['g297908', '가오슝'], ['g294217', '홍콩'],
  ['g298085', '다낭'], ['g293928', '나트랑'], ['g293924', '하노이'], ['g293925', '호치민'],
  ['g293916', '방콕'], ['g293920', '푸켓'], ['g294261', '세부'], ['g298573', '마닐라'],
  ['g298307', '코타키나발루'], ['g60668', '괌'], ['g294265', '싱가포르'],
]
const CITY_OF = Object.fromEntries(HOTEL_CITIES)

// 예약처 코드 → 한글명 + 검색 딥링크 (Trip.com만 제휴 추적, 나머지는 무커미션이어도 연결 = 고객 최저가 우선)
const enc = encodeURIComponent
const PROVIDERS = {
  BookingCom: { name: '부킹닷컴', url: (n, ci, co) => `https://www.booking.com/searchresults.ko.html?ss=${enc(n)}&checkin=${ci}&checkout=${co}` },
  Agoda: { name: '아고다', url: (n, ci, co) => `https://www.agoda.com/ko-kr/search?textToSearch=${enc(n)}&checkIn=${ci}&checkOut=${co}` },
  CtripTA: { name: '트립닷컴', url: (n, ci, co) => `https://kr.trip.com/hotels/list?searchWord=${enc(n)}&checkin=${ci}&checkout=${co}&${ALLIANCE}&trip_sub1=hotel_tab` },
  Expedia: { name: '익스피디아', url: (n, ci, co) => `https://www.expedia.co.kr/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}` },
  HotelsCom: { name: '호텔스닷컴', url: (n, ci, co) => `https://kr.hotels.com/Hotel-Search?destination=${enc(n)}&startDate=${ci}&endDate=${co}` },
  Priceline: { name: '프라이스라인', url: null },
  Travelocity: { name: '트래블로시티', url: null },
  Orbitz: { name: '오르비츠', url: null },
}
const provName = c => (PROVIDERS[c] && PROVIDERS[c].name) || c

const MENTION_KO = { Family: '가족', Business: '비즈니스', 'Mid-range': '중급', Luxury: '럭셔리', Budget: '가성비', 'City View': '시티뷰', Romantic: '커플', Spa: '스파', Beach: '해변', 'Breakfast included': '조식 포함' }
const wonFmt = n => (n == null ? '-' : '₩' + Math.round(n).toLocaleString('ko-KR'))
const pad2 = n => String(n).padStart(2, '0')
const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return dstr(d) }
const nightsOf = (ci, co) => { const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 0 }

const HEmpty = ({ icon, text }) => <div className="text-center text-slate-400 py-14"><div className="text-4xl mb-2">{icon}</div><div className="text-[13px] px-10 leading-relaxed">{text}</div></div>

/* USD→KRW 환율 (frankfurter, 무료·키없음). 실패 시 보수적 고정값 폴백. */
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

/* 가격 비교 시트: 예약처별 참고가 + 💰최저 표시 + 딥링크 */
function HotelSheet({ h, ci, co, usdKrw, onClose }) {
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
  const minTotal = st.status === 'ok' ? Math.min(...st.rates.map(r => r.rate + (r.tax || 0))) : 0
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl sheet-up max-h-[92vh] overflow-y-auto no-scrollbar">
        <div className="relative h-40 bg-cover bg-center bg-slate-200" style={h.image ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55)),url(${h.image})` } : {}}>
          <button onClick={onClose} className="absolute top-3 left-4 text-white/90 text-[13px] font-bold bg-black/25 rounded-full px-3 py-1.5">← 뒤로</button>
          <button onClick={onClose} className="absolute top-3 right-4 text-white text-xl bg-black/25 rounded-full w-8 h-8">✕</button>
          <div className="absolute bottom-3 left-5 right-5 text-white">
            <div className="text-[12px] opacity-90">{h.cityName} · {h.rating ? `★ ${h.rating} (${h.reviews ? h.reviews.toLocaleString('ko-KR') : 0})` : '평점 없음'}</div>
            <div className="text-xl font-extrabold leading-tight mt-0.5">{h.name}</div>
          </div>
        </div>
        <div className="px-5 pt-4 pb-8 space-y-3 text-[13.5px]">
          <div className="text-[12.5px] text-slate-500">🗓️ {ci.slice(5).replace('-', '/')} ~ {co.slice(5).replace('-', '/')} · {nights}박 기준 · 1박당 참고가(세금 포함)</div>
          {st.status === 'loading' && <div className="text-center text-slate-400 py-8"><div className="text-2xl mb-1 animate-pulse">🏨</div><div className="text-[12.5px]">예약처별 가격을 비교하는 중…</div></div>}
          {st.status === 'error' && <HEmpty icon="⚠️" text="가격을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />}
          {st.status === 'empty' && <div className="bg-slate-50 rounded-2xl p-3 text-[12.5px] text-slate-500">이 날짜엔 비교 가격이 안 잡혔어요. 아래 예약처에서 직접 확인해 보세요.</div>}
          {st.status === 'ok' && <div className="space-y-2">
            {st.rates.map((r, i) => {
              const total = r.rate + (r.tax || 0), lowest = total === minTotal
              const p = PROVIDERS[r.code]
              const href = p && p.url ? p.url(h.name, ci, co) : h.taUrl
              return (
                <a key={i} href={href} target="_blank" rel="noopener" className={'flex items-center justify-between rounded-2xl px-3.5 py-3 ' + (lowest ? 'bg-brand-50 border border-brand-200' : 'bg-slate-50')}>
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-slate-800">{provName(r.code)} {lowest && <span className="text-[10.5px] font-bold text-white bg-brand-500 rounded-full px-2 py-0.5 align-middle">💰 최저</span>}</div>
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
          <a href={h.taUrl} target="_blank" rel="noopener" className="block text-center text-[12.5px] text-slate-500 underline">트립어드바이저에서 리뷰·전체 비교 보기</a>
        </div>
      </div>
    </div>
  )
}

function HotelCard({ h, usdKrw, onOpen }) {
  const tags = (h.mentions || []).map(m => MENTION_KO[m]).filter(Boolean).slice(0, 3)
  return (
    <div className="relative flex gap-3 bg-white rounded-2xl shadow-soft p-3 active:scale-[.99] transition cursor-pointer" onClick={() => onOpen(h)}>
      {h.image
        ? <div className="w-[84px] h-[84px] rounded-2xl bg-cover bg-center shrink-0 bg-slate-100" style={{ backgroundImage: `url(${h.image})` }} />
        : <div className="w-[84px] h-[84px] rounded-2xl shrink-0 bg-brand-50 flex items-center justify-center text-2xl">🏨</div>}
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-extrabold text-slate-900 leading-tight truncate">{h.name}</div>
        <div className="text-[12px] text-slate-400 mt-1">{h.rating ? <>★ <b className="text-slate-600">{h.rating}</b> ({h.reviews ? h.reviews.toLocaleString('ko-KR') : 0})</> : '평점 없음'}{h.type ? ` · ${h.type}` : ''}</div>
        {tags.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{tags.map(t => <span key={t} className="text-[10.5px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{t}</span>)}</div>}
        <div className="mt-1.5 text-[12px] text-slate-500">{h.priceMin != null ? <>1박 <b className="text-brand-600 text-[14px] font-black">{wonFmt(h.priceMin * usdKrw)}</b><span className="text-slate-400">부터 · 참고가</span></> : '가격은 비교에서 확인'}</div>
      </div>
      <div className="self-center text-brand-500 font-bold text-[12px] shrink-0">비교 ›</div>
    </div>
  )
}

export default function Hotels() {
  const [geo, setGeo] = useState('g298566')
  const [ci, setCi] = useState(addDays(dstr(new Date()), 14))
  const [co, setCo] = useState(addDays(dstr(new Date()), 16))
  const [sort, setSort] = useState('popularity')
  const [st, setSt] = useState({ status: 'idle' })
  const [sel, setSel] = useState(null)
  const [usdKrw, fxLive] = useUsdKrw()

  const fetchList = async (offset = 0, prev = []) => {
    setSt(offset === 0 ? { status: 'loading' } : { status: 'ok', list: prev, more: true, loadingMore: true })
    try {
      const r = await fetch(`${PROXY}/xotelo/list?location_key=${geo}&limit=30&offset=${offset}&sort=${sort}`)
      const j = await r.json()
      const raw = (j.result && j.result.list) || []
      if (j.error || (!raw.length && offset === 0)) { setSt({ status: 'error' }); return }
      const items = raw.map(x => ({
        key: x.key, name: x.name, type: x.accommodation_type === 'Hotel' ? '' : x.accommodation_type,
        rating: x.review_summary && x.review_summary.rating, reviews: x.review_summary && x.review_summary.count,
        priceMin: x.price_ranges && x.price_ranges.minimum, image: x.image, mentions: x.mentions,
        geo: x.geo, taUrl: x.url, cityName: CITY_OF[geo],
      }))
      const list = [...prev, ...items]
      setSt({ status: 'ok', list, total: j.result.total_count, more: list.length < j.result.total_count })
    } catch (e) { setSt(offset === 0 ? { status: 'error' } : { status: 'ok', list: prev, more: true }) }
  }
  const search = () => fetchList(0, [])
  const nights = nightsOf(ci, co)
  const validDates = nights > 0

  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
        <div>
          <label className="text-[12px] text-slate-500">도시</label>
          <select value={geo} onChange={e => setGeo(e.target.value)} className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]">
            {HOTEL_CITIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[12px] text-slate-500">체크인</label><input type="date" value={ci} onChange={e => { setCi(e.target.value); if (nightsOf(e.target.value, co) <= 0) setCo(addDays(e.target.value, 2)) }} className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]" /></div>
          <div><label className="text-[12px] text-slate-500">체크아웃</label><input type="date" value={co} onChange={e => setCo(e.target.value)} className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px]" /></div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {[['popularity', '인기순'], ['best_value', '가성비순']].map(([v, t]) => <button key={v} onClick={() => setSort(v)} className={'text-[12.5px] rounded-full px-3 py-1.5 font-bold ' + (sort === v ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200')}>{t}</button>)}
          </div>
          {validDates && <span className="text-[12px] text-slate-400">{nights}박</span>}
        </div>
        <button onClick={search} disabled={!validDates} className={'w-full font-bold rounded-2xl py-3.5 ' + (validDates ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-slate-100 text-slate-400')}>호텔 최저가 비교 🔍</button>
      </div>

      {st.status === 'idle' && <p className="text-[12.5px] text-slate-400 px-1 leading-relaxed">도시를 고르고 검색하면 호텔을 한눈에 보고, 호텔을 누르면 <b className="text-slate-500">부킹닷컴·아고다·트립닷컴 등 예약처별 가격을 비교</b>해 어디가 제일 싼지 보여드려요. 우린 호텔을 팔지 않아요 — 제일 싼 예약처로 연결만 해요.</p>}
      {st.status === 'loading' && <div className="text-center text-slate-400 py-12"><div className="text-3xl mb-2 animate-pulse">🏨</div><div className="text-[13px]">호텔을 불러오는 중…</div></div>}
      {st.status === 'error' && <HEmpty icon="⚠️" text="호텔을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />}
      {st.status === 'ok' && <>
        <div className="text-[12px] text-slate-400 px-1">{CITY_OF[geo]} 숙소 <b className="text-slate-500">{(st.total || 0).toLocaleString('ko-KR')}곳</b> · 호텔을 누르면 예약처별 가격 비교{fxLive ? '' : ' · 환율 추정치 적용 중'}</div>
        <div className="space-y-3">{st.list.map(h => <HotelCard key={h.key} h={h} usdKrw={usdKrw} onOpen={setSel} />)}</div>
        {st.more && <button onClick={() => fetchList(st.list.length, st.list)} className="w-full bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl py-3 text-[13.5px]">{st.loadingMore ? '불러오는 중…' : '더 보기'}</button>}
      </>}
      {sel && <HotelSheet h={sel} ci={ci} co={co} usdKrw={usdKrw} onClose={() => setSel(null)} />}
    </div>
  )
}
