import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/* ───────── Supabase 인증 + 클라우드 동기화 ─────────
   키 발급 절차는 SETUP_AUTH.md 참고. anon key는 공개해도 되는 키(RLS가 데이터 보호).
   키가 비어 있으면 로그인 UI가 숨겨지고 사이트는 기존 그대로(로컬 저장) 동작한다. */
export const SUPABASE_URL = 'https://pzmufzhbzgufagjouzqd.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_RWbhJbpnrmbbZb9rCm0SDA_21Br2YL2'
export const authReady = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
export const supabase = authReady ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

export function useAuth() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser((data.session && data.session.user) || null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser((s && s.user) || null))
    return () => sub.subscription.unsubscribe()
  }, [])
  return user
}

export function signIn(provider) {  // 'google' | 'kakao' — 리다이렉트 방식(정적 호스팅 OK)
  if (!supabase) return
  supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } })
}
export function signOut() { if (supabase) supabase.auth.signOut() }

/* 회원 기능 게이트 — 알림·노선찜 등은 로그인해야 사용. 비로그인이면 로그인 화면(open-login)을 띄우고 false.
   키 미설정(authReady=false) 상태에선 게이트 없이 기존처럼 동작. */
let currentUser = null
if (supabase) {
  supabase.auth.getSession().then(({ data }) => { currentUser = (data.session && data.session.user) || null })
  supabase.auth.onAuthStateChange((_e, s) => { currentUser = (s && s.user) || null })
}
export function requireLogin() {
  if (!authReady || currentUser) return true
  window.dispatchEvent(new Event('open-login'))
  return false
}

/* 동기화 대상: localStorage 키 ↔ user_data 컬럼 */
const FIELDS = [['saved', 'saved', '[]'], ['routeWatch', 'route_watch', '[]'], ['alertPrefs', 'alert_prefs', 'null'], ['plans', 'plans', '[]']]
const readLocal = () => Object.fromEntries(FIELDS.map(([lk, col, def]) => {
  let v; try { v = JSON.parse(localStorage.getItem(lk) || def) } catch { v = JSON.parse(def) }
  return [col, v]
}))

let timer = null
export function scheduleSync() {  // 로컬 변경 → 1.5초 디바운스 후 서버 반영 (로그인 상태에서만)
  if (!supabase) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const u = data.session && data.session.user
      if (!u) return
      await supabase.from('user_data').upsert({ user_id: u.id, ...readLocal(), updated_at: new Date().toISOString() })
    } catch (e) {}
  }, 1500)
}

/* 앱 시작 시(로그인돼 있으면): 서버에 데이터가 있으면 로컬을 덮어쓴다(변경 때마다 푸시하므로 서버=최신).
   서버에 없으면(첫 로그인) 지금 로컬 데이터를 올려 계정을 시드한다. */
export async function pullCloud(user) {
  if (!supabase || !user) return
  try {
    const { data: row } = await supabase.from('user_data').select('*').eq('user_id', user.id).maybeSingle()
    if (!row) { scheduleSync(); return }
    let changed = false
    FIELDS.forEach(([lk, col]) => {
      const v = row[col]
      if (v == null) return
      const s = JSON.stringify(v)
      if (localStorage.getItem(lk) !== s) { localStorage.setItem(lk, s); changed = true }
    })
    if (changed) window.dispatchEvent(new Event('cloud-sync'))
  } catch (e) {}
}
