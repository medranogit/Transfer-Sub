// Navegacao lateral principal do app: Transferir Legenda / Apenas Limpar
// (os dois modos de trabalho, antes um toggle dentro da mesma tela) mais
// Historico e Configuracoes como paginas proprias.
import type { ReactNode } from 'react'
import styled from 'styled-components'
import { ClearOutlined, HistoryOutlined, SettingOutlined, SwapOutlined, TranslationOutlined } from '@ant-design/icons'

export type ViewId = 'transfer' | 'clean' | 'history' | 'settings'

const NAV_ITEMS: { id: ViewId; label: string; icon: ReactNode }[] = [
  { id: 'transfer', label: 'Transferir Legenda', icon: <SwapOutlined /> },
  { id: 'clean', label: 'Apenas Limpar', icon: <ClearOutlined /> },
  { id: 'history', label: 'Historico', icon: <HistoryOutlined /> },
  { id: 'settings', label: 'Configuracoes', icon: <SettingOutlined /> }
]

const Wrap = styled.nav`
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 10px;
  background: ${(p) => p.theme.colors.panel};
  border-right: 1px solid ${(p) => p.theme.colors.border};
`

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 18px;
  font-weight: 700;
  font-size: 14px;

  svg {
    font-size: 17px;
    color: ${(p) => p.theme.colors.accent};
  }
`

const NavItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: ${(p) => p.theme.radius.sm};
  border: none;
  background: ${(p) => (p.$active ? p.theme.colors.accent : 'transparent')};
  color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.textMuted)};
  font-size: 13px;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;

  &:hover:not(:disabled) {
    background: ${(p) => (p.$active ? p.theme.colors.accent : p.theme.colors.panelAlt)};
    color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.text)};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  svg {
    font-size: 14px;
    flex-shrink: 0;
  }
`

export function Sidebar({
  active,
  onNavigate,
  workflowSwitchDisabled
}: {
  active: ViewId
  onNavigate: (id: ViewId) => void
  // Trocar entre Transferir Legenda <-> Apenas Limpar no meio de um
  // escaneamento/transferencia invalidaria a tabela/estado em andamento -
  // Historico e Configuracoes continuam acessiveis a qualquer momento.
  workflowSwitchDisabled: boolean
}) {
  return (
    <Wrap>
      <Brand>
        <TranslationOutlined />
        Transfer Sub
      </Brand>
      {NAV_ITEMS.map((item) => {
        const isWorkflowTab = item.id === 'transfer' || item.id === 'clean'
        return (
          <NavItem
            key={item.id}
            type="button"
            $active={active === item.id}
            disabled={isWorkflowTab && workflowSwitchDisabled && active !== item.id}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            {item.label}
          </NavItem>
        )
      })}
    </Wrap>
  )
}
