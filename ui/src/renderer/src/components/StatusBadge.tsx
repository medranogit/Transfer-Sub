import styled from 'styled-components'
import type { RowStatus } from '@shared/types'

const STATUS_LABELS: Record<RowStatus, string> = {
  idle: 'Pronto',
  extracting: 'Extraindo...',
  muxing: 'Remuxando...',
  done: 'Concluido',
  error: 'Erro'
}

const Badge = styled.span<{ $status: RowStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  background: ${(p) =>
    ({
      idle: p.theme.colors.panelAlt,
      extracting: 'rgba(91, 184, 230, 0.15)',
      muxing: 'rgba(124, 157, 255, 0.15)',
      done: 'rgba(79, 209, 139, 0.15)',
      error: 'rgba(242, 102, 94, 0.15)'
    })[p.$status]};
  color: ${(p) =>
    ({
      idle: p.theme.colors.textMuted,
      extracting: p.theme.colors.info,
      muxing: p.theme.colors.accent,
      done: p.theme.colors.success,
      error: p.theme.colors.danger
    })[p.$status]};
`

export function StatusBadge({ status, title }: { status: RowStatus; title?: string }) {
  return (
    <Badge $status={status} title={title}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
