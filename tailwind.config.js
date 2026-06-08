/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#effaf7',100:'#d7f2ea',500:'#14b8a6',600:'#0d9488',700:'#0f766e' },
      },
      boxShadow: { soft: '0 6px 24px rgba(20,184,166,.12)' },
    },
  },
  plugins: [],
}
