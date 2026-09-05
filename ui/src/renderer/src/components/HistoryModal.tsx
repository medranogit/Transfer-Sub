// Tela cheia com o historico persistido em transfer-log.json (sobrevive a
// reinicios do app) - deixa ver transferencias/limpezas de sessoes
// anteriores, nao so o log da sessao atual (LogPanel, que e so em memoria).
import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import type { TransferLogEntry } from '@shared/types'
import { theme } from '../theme'
import { Button } from '../ui/primitives'
import { StatusBadge } from './StatusBadge'

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('pt-BR')
}

function adjustmentLabel(entry: TransferLogEntry): string {
  if (entry.firstLineTargetText) return `1a fala: ${entry.firstLineTargetText}`
  if (entry.appliedOffsetMs) return `${entry.appliedOffsetMs > 0 ? '+' : ''}${entry.appliedOffsetMs}ms`
  return '-'
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`

const Box = styled.div`
  width: 94vw;
  height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  background: ${(p) => p.theme.colors.panel};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.lg};
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const Title = styled.h3`
  font-size: 15px;
  font-weight: 700;
  margin: 0;
`

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`

const TableWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.md};
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
`

const Thead = styled.thead`
  position: sticky;
  top: 0;
  background: ${(p) => p.theme.colors.panelAlt};

  th {
    text-align: left;
    padding: 8px 10px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${(p) => p.theme.colors.textMuted};
    border-bottom: 1px solid ${(p) => p.theme.colors.border};
    white-space: nowrap;
  }
`

const Tr = styled.tr`
  &:hover td {
    background: ${(p) => p.theme.colors.panelAlt};
  }
`

const Td = styled.td`
  padding: 7px 10px;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  vertical-align: top;
`

const Mono = styled.span`
  font-family: ${(p) => p.theme.font.mono};
  font-size: 11.5px;
  color: ${(p) => p.theme.colors.textMuted};
`

const EmptyState = styled.div`
  padding: 40px;
  text-align: center;
  color: ${(p) => p.theme.colors.textMuted};
`

export function HistoryModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<TransferLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    window.api
      .loadTransferLog()
      .then(setEntries)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <Overlay onClick={onClose}>
      <Box onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Historico de transferencias ({entries.length})</Title>
          <HeaderActions>
            <Button type="button" $variant="ghost" onClick={load} title="Recarregar">
              <ReloadOutlined /> Recarregar
            </Button>
            <Button type="button" $variant="ghost" onClick={onClose}>
              <CloseOutlined /> Fechar
            </Button>
          </HeaderActions>
        </Header>

        {loading && <EmptyState>Carregando...</EmptyState>}
        {error && <EmptyState style={{ color: theme.colors.danger }}>{error}</EmptyState>}
        {!loading && !error && entries.length === 0 && (
          <EmptyState>Nenhuma transferencia registrada ainda.</EmptyState>
        )}

        {!loading && !error && entries.length > 0 && (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Episodio</th>
                  <th>Faixa</th>
                  <th>Ajuste</th>
                  <th>Arquivo gerado</th>
                  <th>Status</th>
                </tr>
              </Thead>
              <tbody>
                {entries.map((entry, i) => (
                  <Tr key={i}>
                    <Td>
                      <Mono>{formatTimestamp(entry.timestamp)}</Mono>
                    </Td>
                    <Td>{entry.episodeKey}</Td>
                    <Td>
                      {entry.trackId !== null
                        ? `#${entry.trackId}${entry.language ? ` [${entry.language}]` : ''}${
                            entry.trackName ? ` "${entry.trackName}"` : ''
                          }`
                        : '-'}
                    </Td>
                    <Td>{adjustmentLabel(entry)}</Td>
                    <Td>{fileName(entry.outputFile)}</Td>
                    <Td>
                      <StatusBadge status={entry.status} title={entry.error} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Box>
    </Overlay>
  )
}
