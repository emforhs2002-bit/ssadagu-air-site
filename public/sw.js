/* 싸다구항공 서비스워커 v4 — 오프라인 지원
   /assets/(해시 번들)=cache-first(불변) · published.json/사진=stale-while-revalidate
   · API(워커 프록시)=network-first(오프라인 시 마지막 응답) · HTML=network-first(폴백 캐시) */
// ※ OneSignal 웹푸시는 루트(github.io/OneSignalSDKWorker.js)가 전담 — 여기서 import 안 함
//   (GitHub Pages 프로젝트 하위경로라 OneSignal은 루트 스코프로만 등록됨. 둘 다 import하면 충돌)

const V = 'ssadagu-v4'
const RUNTIME = V + '-rt'

self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => !k.startsWith(V)).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

const put = async (req, res) => { try { const c = await caches.open(RUNTIME); await c.put(req, res.clone()) } catch (e) {} }

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // 해시 번들: cache-first (내용 불변)
  if (url.pathname.includes('/assets/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) put(req, res)
      return res
    })())
    return
  }

  // 데이터·사진: stale-while-revalidate
  if (url.pathname.endsWith('published.json') || url.pathname.includes('/dest/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true })
      const net = fetch(req).then(res => { if (res.ok) put(req, res); return res }).catch(() => null)
      return hit || (await net) || new Response('{"deals":[]}', { headers: { 'Content-Type': 'application/json' } })
    })())
    return
  }

  // API 프록시: network-first, 오프라인 시 마지막 캐시
  if (url.hostname.endsWith('workers.dev')) {
    e.respondWith((async () => {
      try { const res = await fetch(req); if (res.ok) put(req, res); return res }
      catch (err) { const hit = await caches.match(req); if (hit) return hit; throw err }
    })())
    return
  }

  // 내비게이션(HTML): network-first, 오프라인 폴백
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { const res = await fetch(req); put(req, res); return res }
      catch (err) {
        const hit = await caches.match(req) || await caches.match(new URL('./', self.registration.scope).href)
        if (hit) return hit
        throw err
      }
    })())
  }
})
