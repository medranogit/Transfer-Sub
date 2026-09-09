import type { ReactNode } from 'react'
import styled from 'styled-components'
import {
  EditOutlined,
  FileSyncOutlined,
  FileTextOutlined,
  HistoryOutlined,
  SettingOutlined,
  SwapOutlined,
  TranslationOutlined
} from '@ant-design/icons'

export type ViewId = 'transfer' | 'clean' | 'rename' | 'history' | 'sessionLog' | 'settings'

const NAV_ITEMS: { id: ViewId; label: string; icon: ReactNode }[] = [
  { id: 'transfer', label: 'Transferir Legenda', icon: <SwapOutlined /> },
  { id: 'clean', label: 'Editar Arquivo', icon: <FileSyncOutlined /> },
  { id: 'rename', label: 'Renomeador', icon: <EditOutlined /> },
  { id: 'history', label: 'Historico', icon: <HistoryOutlined /> },
  { id: 'sessionLog', label: 'Log da Sessao', icon: <FileTextOutlined /> },
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

const Footer = styled.div`
  margin-top: auto;
  padding: 10px 12px 2px;
  font-size: 11px;
  color: ${(p) => p.theme.colors.textFaint};
  text-align: center;
`

export function Sidebar({
  active,
  onNavigate,
  navigationLocked
}: {
  active: ViewId
  onNavigate: (id: ViewId) => void
  navigationLocked: boolean
}) {
  return (
    <Wrap>
      <Brand>
        <TranslationOutlined />
        Transfer Sub
      </Brand>
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.id}
          type="button"
          $active={active === item.id}
          disabled={navigationLocked && active !== item.id}
          onClick={() => onNavigate(item.id)}
        >
          {item.icon}
          {item.label}
        </NavItem>
      ))}
      <Footer>medranogit</Footer>
    </Wrap>
  )
}
