import type { Config } from 'tailwindcss'

/** Token do design system: lê a CSS var e preserva o modificador de opacidade (`bg-primary/10`). */
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Design System Sebratel (tokens canônicos) ──
        // Valores em src/styles/globals.css (:root e .dark).
        primary: token('primary'),
        'primary-container': token('primary-container'),
        'primary-strong': token('primary-strong'),
        'on-primary': token('on-primary'),
        secondary: token('secondary'),
        'secondary-container': token('secondary-container'),
        tertiary: token('tertiary'),

        surface: token('surface'),
        'surface-container-low': token('surface-container-low'),
        'surface-container-lowest': token('surface-container-lowest'),
        'surface-container-high': token('surface-container-high'),

        'on-surface': token('on-surface'),
        'on-surface-variant': token('on-surface-variant'),

        outline: token('outline'),
        'outline-strong': token('outline-strong'),
        'outline-variant': 'var(--color-outline-variant)',

        'inverse-surface': token('inverse-surface'),

        // Fixos nos dois temas — camada sobre mídia (hero do login).
        scrim: token('scrim'),
        'on-scrim': token('on-scrim'),

        risk: {
          low: token('risk-low'),
          medium: token('risk-medium'),
          high: token('risk-high'),
          critical: token('risk-critical'),
        },
        'health-excellent': token('health-excellent'),

        // Rampa categórica (identidade sem ordem) — ver globals.css.
        data: {
          1: token('data-1'),
          2: token('data-2'),
          3: token('data-3'),
          4: token('data-4'),
          5: token('data-5'),
          6: token('data-6'),
          7: token('data-7'),
          8: token('data-8'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        '4xl': '32px',
      },
      transitionTimingFunction: {
        // curva única de movimento do design system
        nexa: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-brand': 'linear-gradient(135deg, #ffb000 0%, #ff8f00 100%)',
        'gradient-danger': 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
        'gradient-success': 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04)',
        'card-md': '0 8px 24px -4px rgba(15,23,42,0.08)',
        'card-lg': '0 12px 40px -12px rgba(15,23,42,0.15)',
        glow: '0 0 20px rgba(255,176,0,0.18)',
        'glow-danger': '0 0 20px rgba(239,68,68,0.15)',
        'glow-success': '0 0 20px rgba(16,185,129,0.15)',
        'glow-violet': '0 0 24px rgba(255,143,0,0.20)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        float: 'float 7s ease-in-out infinite',
        'header-in': 'header-in 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in-up': 'fade-in-up 300ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
