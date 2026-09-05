// Primitivas genericas de UI (sem regra de negocio) reaproveitadas por
// varios componentes do app.
import styled, { css } from 'styled-components'

export const Panel = styled.div`
  background: ${(p) => p.theme.colors.panel};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.lg};
`

export const Row = styled.div<{ $gap?: number; $align?: string }>`
  display: flex;
  align-items: ${(p) => p.$align ?? 'center'};
  gap: ${(p) => p.$gap ?? 8}px;
`

export const Col = styled.div<{ $gap?: number }>`
  display: flex;
  flex-direction: column;
  gap: ${(p) => p.$gap ?? 8}px;
`

export const Label = styled.label`
  font-size: 12px;
  color: ${(p) => p.theme.colors.textMuted};
  white-space: nowrap;
`

export const Input = styled.input`
  flex: 1;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 7px 10px;
  color: ${(p) => p.theme.colors.text};
  outline: none;
  min-width: 0;

  &:focus {
    border-color: ${(p) => p.theme.colors.accent};
  }
`

export const buttonBase = css`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 8px 16px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 600;
  transition: filter 0.15s ease, opacity 0.15s ease;
  white-space: nowrap;

  svg {
    font-size: 13px;
  }

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

export const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'ghost' }>`
  ${buttonBase}
  ${(p) =>
    p.$variant === 'primary' &&
    css`
      background: ${p.theme.colors.accent};
      color: #10121a;
    `}
  ${(p) =>
    (!p.$variant || p.$variant === 'secondary') &&
    css`
      background: ${p.theme.colors.panelAlt};
      border-color: ${p.theme.colors.border};
      color: ${p.theme.colors.text};
    `}
  ${(p) =>
    p.$variant === 'ghost' &&
    css`
      background: transparent;
      border-color: ${p.theme.colors.border};
      color: ${p.theme.colors.textMuted};
      padding: 6px 12px;
      font-weight: 500;
    `}
`

export const SectionTitle = styled.h2`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textFaint};
  margin: 0;
`
