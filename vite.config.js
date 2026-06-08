import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 프로젝트 사이트라 base 경로 필요
export default defineConfig({
  base: '/ssadagu-air-site/',
  plugins: [react()],
})
