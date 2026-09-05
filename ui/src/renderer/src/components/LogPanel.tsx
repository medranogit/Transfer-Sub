import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import type { LogEvent } from '@shared/types'
import { theme } from '../theme'

const LogWrap = styled.div`
  height: 140px;
  overflow-y: auto;
  background: ${(p) => p.theme.colors.panelAlt};
  border-radius: ${(p) => p.theme.radius.md};
  border: 1px solid ${(p) => p.theme.colors.border};
  padding: 6px;
  font-family: ${(p) => p.theme.font.mono};
  font-size: 11.5px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 1px;
`

const LOG_COLOR: Record<LogEvent['level'], keyof typeof theme.colors> = {
  info: 'info',
  success: 'success',
  warn: 'warning',
  error: 'danger'
}

const LOG_ICON: Record<LogEvent['level'], string> = {
  info: 'ℹ',
  success: '✓',
  warn: '⚠',
  error: '✕'
}

const LogLine = styled.div<{ $level: LogEvent['level'] }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 8px;
  border-radius: ${(p) => p.theme.radius.sm};
  color: ${(p) => (p.$level === 'info' ? p.theme.colors.textMuted : p.theme.colors[LOG_COLOR[p.$level]])};
  background: ${(p) =>
    p.$level === 'info'
      ? 'transparent'
      : `color-mix(in srgb, ${p.theme.colors[LOG_COLOR[p.$level]]} 10%, transparent)`};
  white-space: pre-wrap;
`

const LogIcon = styled.span`
  flex-shrink: 0;
  font-weight: 700;
  width: 12px;
  text-align: center;
`

export function LogPanel({ entries }: { entries: LogEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [entries])

  return (
    <LogWrap ref={ref}>
      {entries.length === 0 && <LogLine $level="info">Aguardando...</LogLine>}
      {entries.map((entry, i) => (
        <LogLine key={i} $level={entry.level}>
          <LogIcon>{LOG_ICON[entry.level]}</LogIcon>
          <span>{entry.message}</span>
        </LogLine>
      ))}
    </LogWrap>
  )
}
