export interface AppTheme {
  colors: {
    bg: string
    panel: string
    panelAlt: string
    border: string
    borderLight: string
    text: string
    textMuted: string
    textFaint: string
    accent: string
    accentMuted: string
    success: string
    warning: string
    danger: string
    info: string
  }
  radius: {
    sm: string
    md: string
    lg: string
  }
  font: {
    body: string
    mono: string
  }
}

const radius = {
  sm: '6px',
  md: '10px',
  lg: '14px'
}

const font = {
  body: "'Segoe UI', -apple-system, system-ui, sans-serif",
  mono: "'Cascadia Code', 'Consolas', monospace"
}

export const darkTheme: AppTheme = {
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
  radius,
  font
}

export const lightTheme: AppTheme = {
  colors: {
    bg: '#e7e8ed',
    panel: '#f1f2f6',
    panelAlt: '#e2e3e9',
    border: '#d0d2da',
    borderLight: '#bcbec8',
    text: '#33343c',
    textMuted: '#63656f',
    textFaint: '#8a8c96',
    accent: '#5977d6',
    accentMuted: '#c3cef5',
    success: '#2f9e63',
    warning: '#b87a1a',
    danger: '#c8453d',
    info: '#2f86ad'
  },
  radius,
  font
}

export type ThemeMode = 'dark' | 'light'

export function themeForMode(mode: ThemeMode): AppTheme {
  return mode === 'light' ? lightTheme : darkTheme
}

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}
