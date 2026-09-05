// Pagina de historico persistido em transfer-log.json (sobrevive a
// reinicios do app) - deixa ver transferencias/limpezas de sessoes
// anteriores, nao so o log da sessao atual (LogPanel, que e so em memoria).
// Antes era um modal (HistoryModal); virou pagina propria da Sidebar.
import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { DeleteOutlined, LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import type { TransferLogEntry } from '@shared/types'
import { theme } from '../theme'
import { Button, Col, Row, SectionTitle } from '../ui/primitives'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState, Mono, Table, TableWrap, Td, Thead, Tr } from '../ui/Table'
import { StatusBadge } from './StatusBadge'

// 100 por pagina - o arquivo pode ter ate 5000 entradas (MAX_LOG_ENTRIES em
// transferLog.ts), renderizar tudo de uma vez deixaria a tabela pesada.
const PAGE_SIZE = 100

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

const KIND_LABELS: Record<NonNullable<TransferLogEntry['kind']>, string> = {
  transfer: 'Transferir Legenda',
  clean: 'Limpeza',
  rename: 'Renomeador'
}

function folderOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '').toLowerCase()
}

// Entradas gravadas antes do campo "kind" existir nao tem como saber com
// certeza qual operacao gerou cada uma - o palpite usa o que da pra inferir
// dos caminhos:
// - sourceFile !== destFile so acontece no modo Transferir (par
//   origem/destino).
// - sourceFile === destFile cobre tanto Limpeza quanto Renomeador (os dois
//   trabalham numa unica pasta) - o desempate e a pasta do arquivo gerado:
//   Renomeador sempre renomeia no lugar (mesma pasta do original), enquanto
//   Limpeza normalmente escreve numa pasta de saida separada.
function resolveKind(entry: TransferLogEntry): NonNullable<TransferLogEntry['kind']> {
  if (entry.kind) return entry.kind
  if (entry.sourceFile !== entry.destFile) return 'transfer'
  return folderOf(entry.outputFile) === folderOf(entry.sourceFile) ? 'rename' : 'clean'
}

const KindTag = styled.span<{ $kind: NonNullable<TransferLogEntry['kind']> }>`
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  color: ${(p) =>
    ({
      transfer: p.theme.colors.accent,
      clean: p.theme.colors.info,
      rename: p.theme.colors.warning
    })[p.$kind]};
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.textMuted};
`

export function HistoryView() {
  const [entries, setEntries] = useState<TransferLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  function load() {
    setLoading(true)
    setError(null)
    setPage(0)
    window.api
      .loadTransferLog()
      .then(setEntries)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleClearConfirmed() {
    setClearing(true)
    try {
      await window.api.clearTransferLog()
      load()
    } finally {
      setClearing(false)
      setShowClearConfirm(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const pageEntries = useMemo(
    () => entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [entries, page]
  )

  return (
    <Col $gap={12} style={{ flex: 1, minHeight: 0 }}>
      <Row $gap={10} style={{ justifyContent: 'space-between' }}>
        <SectionTitle>Historico de transferencias ({entries.length})</SectionTitle>
        <Row $gap={8}>
          <Button type="button" $variant="ghost" onClick={load} title="Recarregar">
            <ReloadOutlined /> Recarregar
          </Button>
          <Button
            type="button"
            $variant="danger"
            onClick={() => setShowClearConfirm(true)}
            disabled={entries.length === 0}
            title="Apagar todo o historico"
          >
            <DeleteOutlined /> Apagar historico
          </Button>
        </Row>
      </Row>

      {showClearConfirm && (
        <ConfirmDialog
          title="Apagar todo o historico?"
          message={`Isso remove permanentemente as ${entries.length} entradas do historico de transferencias/limpezas. Os arquivos ja gerados nao sao afetados - so o registro.`}
          confirmLabel={clearing ? 'Apagando...' : 'Apagar tudo'}
          danger
          acknowledgeLabel="Entendo que essa acao nao pode ser desfeita"
          onConfirm={handleClearConfirmed}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

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
                <th>Tipo</th>
                <th>Data/hora</th>
                <th>Episodio</th>
                <th>Faixa</th>
                <th>Ajuste</th>
                <th>Arquivo gerado</th>
                <th>Status</th>
              </tr>
            </Thead>
            <tbody>
              {pageEntries.map((entry, i) => (
                <Tr key={page * PAGE_SIZE + i}>
                  <Td>
                    <KindTag $kind={resolveKind(entry)}>{KIND_LABELS[resolveKind(entry)]}</KindTag>
                  </Td>
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

      {!loading && !error && entries.length > 0 && (
        <Footer>
          <Button
            type="button"
            $variant="ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <LeftOutlined /> Anterior
          </Button>
          <span>
            Pagina {page + 1} de {pageCount}
          </span>
          <Button
            type="button"
            $variant="ghost"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Proxima <RightOutlined />
          </Button>
        </Footer>
      )}
    </Col>
  )
}
