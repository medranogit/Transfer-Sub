// Pagina "Log da Sessao" - mostra o log bruto gravado em disco (um .txt por
// sessao do app, do momento que abre ate fechar - ver infra/sessionLog.ts).
// Diferente do Historico (so eventos estruturados de transferencia/limpeza/
// renomeacao): aqui e o log completo, linha por linha, igual ao painel da
// tela (LogPanel), mas de qualquer sessao anterior, nao so a atual.
import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { ReloadOutlined } from '@ant-design/icons'
import type { SessionLogInfo } from '@shared/types'
import { Button, Col, Row, SectionTitle } from '../ui/primitives'
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

const SessionItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  border-radius: ${(p) => p.theme.radius.sm};
  border: none;
  background: ${(p) => (p.$active ? p.theme.colors.accent : 'transparent')};
  color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.text)};
  font-size: 12px;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  cursor: pointer;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${(p) => (p.$active ? p.theme.colors.accent : p.theme.colors.panelAlt)};
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

// Formato gravado por infra/sessionLog.ts: "[HH:MM:SS] [NIVEL] mensagem".
const LINE_PATTERN = /^\[(\d{2}:\d{2}:\d{2})\] \[(INFO|SUCCESS|WARN|ERROR)\] (.*)$/

export function SessionLogView() {
  const [sessions, setSessions] = useState<SessionLogInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)

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

  const lines = content
    .split('\n')
    .filter((line, i, arr) => !(i === arr.length - 1 && line === ''))

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
            <SessionItem
              key={s.id}
              type="button"
              $active={s.id === selectedId}
              onClick={() => setSelectedId(s.id)}
            >
              <span>{s.label}</span>
              {s.current && <CurrentDot title="Sessao atual (esta aberta agora)" />}
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
    </Col>
  )
}
