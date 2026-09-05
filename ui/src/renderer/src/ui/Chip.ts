// Chip de alternancia (on/off) generico e reaproveitavel - fica verde quando
// ativo, neutro quando nao. Usado para as opcoes de configuracao (remover
// dublagem, limpar legendas extras etc.) e preparado pra crescer com mais
// opcoes no futuro (quebra linha sozinho via flex-wrap).
import styled from 'styled-components'

export const ChipRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 2px 0;
`

export const Chip = styled.button<{ $active: boolean }>`
  flex: 1;
  min-width: 200px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 10px 14px;
  border-radius: ${(p) => p.theme.radius.sm};
  border: 1px solid ${(p) => (p.$active ? p.theme.colors.success : p.theme.colors.border)};
  background: ${(p) =>
    p.$active ? `color-mix(in srgb, ${p.theme.colors.success} 14%, transparent)` : p.theme.colors.panelAlt};
  color: ${(p) => (p.$active ? p.theme.colors.success : p.theme.colors.textMuted)};
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  svg {
    font-size: 13px;
    flex-shrink: 0;
  }

  &:hover {
    border-color: ${(p) => (p.$active ? p.theme.colors.success : p.theme.colors.borderLight)};
    color: ${(p) => (p.$active ? p.theme.colors.success : p.theme.colors.text)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.accent};
    outline-offset: 2px;
  }
`
