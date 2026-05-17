import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#060910',
          surface: '#0a0e1a',
          card: '#0d1117',
          cardHover: '#111827',
          border: '#1a2236',
          borderLight: '#243050',
        },
        brand: {
          blue: '#4f8ef7',
          blueLight: '#82b0ff',
          violet: '#7c3aed',
          violetLight: '#a78bfa',
          cyan: '#22d3ee',
          cyanLight: '#67e8f9',
        },
        risk: {
          low: '#10b981',
          medium: '#f59e0b',
          high: '#f97316',
          critical: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-brand': 'linear-gradient(135deg, #4f8ef7 0%, #7c3aed 100%)',
        'gradient-danger': 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
        'gradient-success': 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        glow: '0 0 20px rgba(79,142,247,0.15)',
        'glow-danger': '0 0 20px rgba(239,68,68,0.15)',
        'glow-success': '0 0 20px rgba(16,185,129,0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
