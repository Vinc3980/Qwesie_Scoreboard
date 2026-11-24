/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic console tokens (CSS variables) - light/dark via :root/.dark
        // RGB channel tokens + <alpha-value> so opacity modifiers work everywhere.
        background: 'rgb(var(--app-background-rgb) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--app-surface-rgb) / <alpha-value>)',
          raised: 'rgb(var(--app-surface-raised-rgb) / <alpha-value>)',
          sunken: 'rgb(var(--app-surface-sunken-rgb) / <alpha-value>)',
          alt: 'rgb(var(--app-surface-alt-rgb) / <alpha-value>)',
          hover: 'rgb(var(--app-surface-alt-rgb) / <alpha-value>)',
          card: 'rgb(var(--app-surface-rgb) / <alpha-value>)',
          subtle: 'rgb(var(--app-surface-sunken-rgb) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--app-border-rgb) / <alpha-value>)',
          strong: 'rgb(var(--app-border-strong-rgb) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--app-foreground-rgb) / <alpha-value>)',
          muted: 'rgb(var(--app-muted-rgb) / <alpha-value>)',
          subtle: 'rgb(var(--app-subtle-rgb) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--app-accent-rgb) / <alpha-value>)',
          hover: 'rgb(var(--app-accent-hover-rgb) / <alpha-value>)',
          fg: 'rgb(var(--app-accent-foreground-rgb) / <alpha-value>)',
          subtle: 'var(--app-accent-subtle)',
        },
        success: {
          DEFAULT: 'rgb(var(--app-success-rgb) / <alpha-value>)',
          fg: 'rgb(var(--app-success-fg-rgb) / <alpha-value>)',
          subtle: 'var(--app-success-subtle)',
        },
        danger: {
          DEFAULT: 'rgb(var(--app-danger-rgb) / <alpha-value>)',
          fg: 'rgb(var(--app-danger-fg-rgb) / <alpha-value>)',
          subtle: 'var(--app-danger-subtle)',
        },
        warning: {
          DEFAULT: 'rgb(var(--app-warning-rgb) / <alpha-value>)',
          fg: 'rgb(var(--app-warning-fg-rgb) / <alpha-value>)',
          subtle: 'var(--app-warning-subtle)',
        },
        info: {
          DEFAULT: 'rgb(var(--app-info-rgb) / <alpha-value>)',
          fg: 'rgb(var(--app-info-fg-rgb) / <alpha-value>)',
          subtle: 'var(--app-info-subtle)',
        },
        warn: {
          DEFAULT: 'rgb(var(--app-warning-rgb) / <alpha-value>)',
          subtle: 'var(--app-warning-subtle)',
        },
        live: 'rgb(var(--app-live-rgb) / <alpha-value>)',
        focus: 'rgb(var(--app-focus-rgb) / <alpha-value>)',
        // Team identity tokens (console only; broadcast keeps its own --team-* tokens)
        teamA: {
          DEFAULT: 'rgb(var(--app-team-a-rgb) / <alpha-value>)',
          subtle: 'rgb(var(--app-team-a-rgb) / 0.12)',
        },
        teamB: {
          DEFAULT: 'rgb(var(--app-team-b-rgb) / <alpha-value>)',
          subtle: 'rgb(var(--app-team-b-rgb) / 0.12)',
        },
        server: '#facc15',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Barlow Condensed"', 'Inter', 'system-ui', 'sans-serif'],
        broadcast: ['"Barlow Condensed"', 'Inter', 'system-ui', 'sans-serif'],
        broadcastText: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        control: '10px',
        panel: '14px',
      },
      spacing: {
        'safe-title': '5%',
        'safe-action': '3.5%',
      },
      transitionDuration: {
        broadcast: '280ms',
        'broadcast-fast': '160ms',
        'broadcast-slow': '450ms',
      },
      transitionTimingFunction: {
        broadcast: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'broadcast-in': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'broadcast-out': 'cubic-bezier(0.7, 0, 0.84, 0)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
