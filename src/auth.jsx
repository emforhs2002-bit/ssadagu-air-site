import { useCallback, useEffect, useRef, useState } from 'react'

/* ──────────────────────────────────────────────────────────────
   구글 회원 로그인 (Google Identity Services / Sign in with Google)
   - 정적 사이트라 클라이언트 ID만 필요. 비밀키 없음.
   - 토큰 서명검증은 워커(/auth/google)에서. 여기 디코드는 화면 표시용.
   - GOOGLE_CLIENT_ID 가 비어 있으면 enabled=false → 로그인 UI 미표시(기존 동작 유지).
     → 발급받은 ID를 아래 상수에 붙여넣는 순간 활성화된다.
   ────────────────────────────────────────────────────────────── */

// ⬇️ 구글에서 발급받은 OAuth 웹 클라이언트 ID를 여기에 붙여넣으세요
//    형태: '345790571122-xxxxxxxx.apps.googleusercontent.com'
export const GOOGLE_CLIENT_ID = '345790571122-8pr1tjtl2qmothhr7kd7guvttf14s67r.apps.googleusercontent.com'

const PROXY = 'https://curly-meadow-ab36ssadagu-proxy.emforhs2002.workers.dev'
const LS_KEY = 'ssadagu_user'

export const authEnabled = () => !!GOOGLE_CLIENT_ID

/* JWT(credential) 페이로드만 디코드 — 표시용(이메일/이름/사진). 신뢰검증은 서버에서. */
function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(atob(part).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
    return JSON.parse(json)
  } catch (e) { return null }
}

function loadUser() {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null } catch (e) { return null }
}

/* GIS 스크립트 로더 — index.html에 넣어두지만, 없을 때 안전망으로 동적 주입도 지원 */
let gisPromise = null
function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve()
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const ex = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (ex) { ex.addEventListener('load', resolve); ex.addEventListener('error', reject); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true
    s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
  return gisPromise
}

export function useGoogleAuth() {
  const [user, setUser] = useState(loadUser)
  const [ready, setReady] = useState(false)
  const pendingCb = useRef(null)

  const handleCredential = useCallback(resp => {
    const token = resp && resp.credential
    if (!token) return
    const payload = decodeJwt(token)
    if (!payload) return
    const u = { sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture, token }
    try { localStorage.setItem(LS_KEY, JSON.stringify(u)) } catch (e) {}
    setUser(u)
    // 회원→구독 기록(비차단): 워커 KV에 저장. 실패해도 로그인 자체엔 영향 없음.
    try { fetch(`${PROXY}/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: token }), keepalive: true }).catch(() => {}) } catch (e) {}
    if (pendingCb.current) { const cb = pendingCb.current; pendingCb.current = null; try { cb(u) } catch (e) {} }
  }, [])

  useEffect(() => {
    if (!authEnabled()) return
    let alive = true
    loadGis().then(() => {
      if (!alive || !(window.google && window.google.accounts)) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      })
      setReady(true)
    }).catch(() => {})
    return () => { alive = false }
  }, [handleCredential])

  /* 공식 구글 버튼을 컨테이너에 렌더 (One Tap보다 차단·호환 안정적) */
  const renderButton = useCallback(el => {
    if (!authEnabled() || !el || !(window.google && window.google.accounts)) return
    el.innerHTML = ''
    try {
      window.google.accounts.id.renderButton(el, {
        theme: 'outline', size: 'large', type: 'standard',
        shape: 'pill', text: 'signin_with', logo_alignment: 'left',
      })
    } catch (e) {}
  }, [ready])

  /* 로그인 보장: 이미 로그인돼 있으면 즉시 cb, 아니면 One Tap을 띄우고 로그인 성공 후 cb 실행 */
  const ensureLogin = useCallback(cb => {
    if (user) { cb && cb(user); return true }
    if (!authEnabled()) { cb && cb(null); return false }
    pendingCb.current = cb || null
    try { window.google && window.google.accounts.id.prompt() } catch (e) {}
    return false
  }, [user])

  const logout = useCallback(() => {
    try { localStorage.removeItem(LS_KEY) } catch (e) {}
    try { window.google && window.google.accounts.id.disableAutoSelect() } catch (e) {}
    setUser(null)
  }, [])

  return { user, ready, enabled: authEnabled(), renderButton, ensureLogin, logout }
}
