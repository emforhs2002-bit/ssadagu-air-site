/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#effaf7',100:'#d7f2ea',500:'#14b8a6',600:'#0d9488',700:'#0f766e' },
      },
      boxShadow: {
        soft: '0 2px 12px rgba(15,23,42,.06)',
        card: '0 1px 3px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.05)',
      },
    },
  },
  plugins: [],
}
