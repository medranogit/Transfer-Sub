import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import type { SessionLogInfo } from '@shared/types'
import { Button, Col, Row, SectionTitle } from '../ui/primitives'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/Table'

const Layout = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
`

const SessionList = styled.div`
  width: 200px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: ${(p) => p.theme.radius.md};
  border: 1px solid ${(p) => p.theme.colors.border};
  padding: 6px;
`

const SessionItem = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 10px;
  border-radius: ${(p) => p.theme.radius.sm};
  background: ${(p) => (p.$active ? p.theme.colors.accent : 'transparent')};

  &:hover {
    background: ${(p) => (p.$active ? p.theme.colors.accent : p.theme.colors.panelAlt)};
  }
`

const SessionLabel = styled.button<{ $active: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.text)};
  font-size: 12px;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  cursor: pointer;
  text-align: left;
`

const SessionLabelText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const DeleteSessionButton = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: ${(p) => p.theme.radius.sm};
  background: transparent;
  color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.textMuted)};
  opacity: 0.7;
  cursor: pointer;

  &:hover {
    opacity: 1;
    background: color-mix(in srgb, ${(p) => p.theme.colors.danger} 20%, transparent);
    color: ${(p) => p.theme.colors.danger};
  }

  svg {
    font-size: 11px;
  }
`

const CurrentDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: ${(p) => p.theme.colors.success};
  flex-shrink: 0;
`

const LogViewer = styled.div`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: ${(p) => p.theme.colors.panelAlt};
  border-radius: ${(p) => p.theme.radius.md};
  border: 1px solid ${(p) => p.theme.colors.border};
  padding: 10px 12px;
  font-family: ${(p) => p.theme.font.mono};
  font-size: 12px;
  line-height: 1.7;
  user-select: text;
  cursor: text;
`

const Line = styled.div<{ $level?: 'success' | 'warn' | 'error' }>`
  color: ${(p) =>
    p.$level === 'success'
      ? p.theme.colors.success
      : p.$level === 'warn'
        ? p.theme.colors.warning
        : p.$level === 'error'
          ? p.theme.colors.danger
          : p.theme.colors.textMuted};
`

const LineTime = styled.span`
  opacity: 0.55;
  margin-right: 6px;
`

const LINE_PATTERN = /^\[(\d{2}:\d{2}:\d{2})\] \[(INFO|SUCCESS|WARN|ERROR)\] (.*)$/

export function SessionLogView({ onError }: { onError: (message: string) => void }) {
  const [sessions, setSessions] = useState<SessionLogInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadList(preferId?: string | null) {
    setLoadingList(true)
    window.api
      .listSessionLogs()
      .then((list) => {
        setSessions(list)
        const stillExists = preferId && list.some((s) => s.id === preferId)
        setSelectedId(stillExists ? preferId! : (list.find((s) => s.current)?.id ?? list[0]?.id ?? null))
      })
      .finally(() => setLoadingList(false))
  }

  useEffect(() => {
    loadList()
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setContent('')
      return
    }
    setLoadingContent(true)
    window.api
      .readSessionLog(selectedId)
      .then(setContent)
      .finally(() => setLoadingContent(false))
  }, [selectedId])

  async function handleDeleteConfirmed() {
    if (!pendingDeleteId) return
    setDeleting(true)
    try {
      await window.api.deleteSessionLog(pendingDeleteId)
      setPendingDeleteId(null)
      loadList(selectedId)
    } catch (err) {
      onError(`Falha ao excluir sessao: ${(err as Error).message}`)
    } finally {
      setDeleting(false)
    }
  }

  const lines = content
    .split('\n')
    .filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
    .reverse()

  return (
    <Col $gap={10} style={{ flex: 1, minHeight: 0 }}>
      <Row $gap={10} style={{ justifyContent: 'space-between' }}>
        <SectionTitle>Log da Sessao</SectionTitle>
        <Button
          type="button"
          $variant="ghost"
          onClick={() => loadList(selectedId)}
          title="Recarrega a lista de sessoes e o log selecionado"
        >
          <ReloadOutlined /> Recarregar
        </Button>
      </Row>

      <Layout>
        <SessionList>
          {loadingList && <EmptyState style={{ padding: 16 }}>Carregando...</EmptyState>}
          {!loadingList && sessions.length === 0 && (
            <EmptyState style={{ padding: 16 }}>Nenhuma sessao registrada ainda.</EmptyState>
          )}
          {sessions.map((s) => (
            <SessionItem key={s.id} $active={s.id === selectedId}>
              <SessionLabel type="button" $active={s.id === selectedId} onClick={() => setSelectedId(s.id)}>
                {s.current && <CurrentDot title="Sessao atual (esta aberta agora)" />}
                <SessionLabelText>{s.label}</SessionLabelText>
              </SessionLabel>
              <DeleteSessionButton
                type="button"
                $active={s.id === selectedId}
                onClick={() => setPendingDeleteId(s.id)}
                title="Excluir esta sessao de log"
              >
                <DeleteOutlined />
              </DeleteSessionButton>
            </SessionItem>
          ))}
        </SessionList>

        <LogViewer>
          {loadingContent && <EmptyState>Carregando...</EmptyState>}
          {!loadingContent && lines.length === 0 && (
            <EmptyState>
              {selectedId ? 'Essa sessao ainda nao tem nada registrado.' : 'Selecione uma sessao ao lado.'}
            </EmptyState>
          )}
          {!loadingContent &&
            lines.map((line, i) => {
              const match = line.match(LINE_PATTERN)
              if (!match) return <Line key={i}>{line}</Line>
              const [, time, level, message] = match
              const levelKey = level.toLowerCase()
              const styledLevel = levelKey === 'success' || levelKey === 'warn' || levelKey === 'error' ? levelKey : undefined
              return (
                <Line key={i} $level={styledLevel}>
                  <LineTime>[{time}]</LineTime>
                  {message}
                </Line>
              )
            })}
        </LogViewer>
      </Layout>

      {pendingDeleteId && (
        <ConfirmDialog
          title="Excluir esta sessao de log?"
          message="Isso remove permanentemente o arquivo dessa sessao. Nao pode ser desfeito."
          confirmLabel={deleting ? 'Excluindo...' : 'Excluir'}
          danger
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </Col>
  )
}
