import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(<App />)

// 웹푸시는 OneSignal 루트 워커(github.io/OneSignalSDKWorker.js)가 전담한다.
// GitHub Pages 하위경로 사이트라 OneSignal은 루트 스코프(/)로만 워커를 등록하는데,
// 우리가 하위경로(/ssadagu-air-site/)에 PWA 워커를 등록하면 그게 더 구체적 스코프라
// 페이지 제어권을 가져가 → OneSignal 워커가 페이지를 제어 못 해 구독이 생성되지 않는다.
// 따라서 PWA 워커는 등록하지 않고, 기존에 등록된 것이 있으면 해제한다(오프라인 캐싱 < 푸시).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(regs => regs.forEach(r => { if (r.scope.endsWith('/ssadagu-air-site/')) r.unregister() }))
      .catch(() => {})
  })
}
