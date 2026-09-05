export const theme = {
  colors: {
    bg: '#14151a',
    panel: '#1c1e26',
    panelAlt: '#23252f',
    border: '#2f313d',
    borderLight: '#3a3d4a',
    text: '#e8e9ee',
    textMuted: '#9497a6',
    textFaint: '#6b6e7d',
    accent: '#7c9dff',
    accentMuted: '#3d4a7a',
    success: '#4fd18b',
    warning: '#f2b84b',
    danger: '#f2665e',
    info: '#5bb8e6'
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px'
  },
  font: {
    body: "'Segoe UI', -apple-system, system-ui, sans-serif",
    mono: "'Cascadia Code', 'Consolas', monospace"
  }
} as const

export type AppTheme = typeof theme

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends AppTheme {}
}
