/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0F1420',
        'navy-2': '#1C2432',
        'navy-3': '#2A3242',
        ink: '#151B28',
        slate: '#5B6478',
        muted: '#8B93A4',
        faint: '#C3C9D2',
        canvas: '#F5F6F8',
        'canvas-2': '#E9EBEF',
        line: 'rgba(21,27,40,.08)',
        brand: '#FF5A2D',
        'brand-dark': '#E8481F',
        'brand-soft': '#FFEDE6',
        'brand-tint': '#FFF6F2',
        success: '#16B364',
        'success-deep': '#0E9152',
        'success-soft': '#E7F7EF',
        danger: '#E5484D',
        'danger-soft': '#FCEBEC',
        warn: '#F59E0B',
        'warn-soft': '#FEF3E2',
        info: '#3B82F6',
        'info-soft': '#EAF1FE',
        violet: '#7C3AED',
        'violet-soft': '#F1EBFC',
        cyan: '#0891B2',
        'cyan-soft': '#E0F5FA',
        amber: '#B45309',
      },
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(.6)', opacity: '0' },
          '60%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translate(-50%,16px)' },
          to: { opacity: '1', transform: 'translate(-50%,0)' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.35' },
        },
        ring: {
          '0%': { transform: 'scale(.85)', opacity: '.7' },
          '100%': { transform: 'scale(1.4)', opacity: '0' },
        },
      },
      animation: {
        pop: 'pop .5s cubic-bezier(.2,.8,.3,1.2) both',
        fade: 'fadeUp .34s cubic-bezier(.2,.7,.3,1) both',
        toast: 'toastIn .3s ease both',
        pulsedot: 'pulseDot 1.8s infinite',
        ring: 'ring 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
}
