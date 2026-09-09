import { useState } from 'react'
import styled from 'styled-components'
import { BellOutlined, DeleteOutlined } from '@ant-design/icons'
import { useEscapeToClose } from '../utils/useEscapeToClose'

const Wrap = styled.div`
  position: relative;
`

const BellButton = styled.button<{ $hasAlerts: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${(p) => p.theme.radius.sm};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.panelAlt};
  color: ${(p) => (p.$hasAlerts ? p.theme.colors.warning : p.theme.colors.textMuted)};
  cursor: pointer;
  font-size: 15px;

  &:hover {
    border-color: ${(p) => p.theme.colors.accent};
  }
`

const Badge = styled.span`
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  background: ${(p) => p.theme.colors.danger};
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
`

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 90;
`

const Panel = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  max-height: 420px;
  overflow-y: auto;
  background: ${(p) => p.theme.colors.panel};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.md};
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  z-index: 91;
  padding: 8px;
`

const GroupTitle = styled.div`
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${(p) => p.theme.colors.textFaint};
  padding: 8px 8px 4px;
`

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.text};
  padding: 6px 8px;
  border-radius: ${(p) => p.theme.radius.sm};

  &:hover {
    background: ${(p) => p.theme.colors.panelAlt};
  }
`

const ItemText = styled.span`
  flex: 1;
  word-break: break-word;
`

const DismissButton = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: ${(p) => p.theme.radius.sm};
  background: transparent;
  color: ${(p) => p.theme.colors.textMuted};
  cursor: pointer;
  font-size: 12px;

  &:hover {
    background: ${(p) => p.theme.colors.panel};
    color: ${(p) => p.theme.colors.danger};
  }
`

const EmptyState = styled.div`
  padding: 20px 10px;
  text-align: center;
  color: ${(p) => p.theme.colors.textMuted};
  font-size: 12px;
`

export interface NotificationGroup {
  title: string
  items: string[]
  onDismiss: (index: number) => void
}

export function NotificationsMenu({ groups }: { groups: NotificationGroup[] }) {
  const [open, setOpen] = useState(false)
  const total = groups.reduce((sum, g) => sum + g.items.length, 0)

  useEscapeToClose(() => setOpen(false))

  return (
    <Wrap>
      <BellButton type="button" $hasAlerts={total > 0} onClick={() => setOpen((o) => !o)} title="Notificacoes">
        <BellOutlined />
        {total > 0 && <Badge>{total > 99 ? '99+' : total}</Badge>}
      </BellButton>
      {open && (
        <>
          <Overlay onClick={() => setOpen(false)} />
          <Panel onClick={(e) => e.stopPropagation()}>
            {total === 0 && <EmptyState>Nenhuma notificacao.</EmptyState>}
            {groups.map(
              (group) =>
                group.items.length > 0 && (
                  <div key={group.title}>
                    <GroupTitle>
                      {group.title} ({group.items.length})
                    </GroupTitle>
                    {group.items.map((item, i) => (
                      <Item key={i} title={item}>
                        <ItemText>{item}</ItemText>
                        <DismissButton
                          type="button"
                          onClick={() => group.onDismiss(i)}
                          title="Remover notificacao"
                        >
                          <DeleteOutlined />
                        </DismissButton>
                      </Item>
                    ))}
                  </div>
                )
            )}
          </Panel>
        </>
      )}
    </Wrap>
  )
}
