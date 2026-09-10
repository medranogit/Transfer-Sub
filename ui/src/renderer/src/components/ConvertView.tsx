import styled from 'styled-components'
import { ClearOutlined, StopOutlined } from '@ant-design/icons'
import type { ConvertRow, LogEvent, RowStatus } from '@shared/types'
import { Button, Col, Panel, Row, SectionTitle } from '../ui/primitives'
import { EmptyState, Mono, Table, TableWrap, Td, Thead, Tr } from '../ui/Table'
import { FolderField } from './FolderField'
import { LogPanel } from './LogPanel'
import { StatusBadge } from './StatusBadge'

const ConfigPanel = styled(Panel)`
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const ToolbarRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

const ProgressTrack = styled.div`
  height: 6px;
  border-radius: 999px;
  background: ${(p) => p.theme.colors.panelAlt};
  overflow: hidden;
  flex: 1;
`

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${(p) => p.$pct}%;
  background: ${(p) => p.theme.colors.accent};
  transition: width 0.2s ease;
`

export function ConvertView({
  sourceDir,
  onSourceDirChange,
  outputDir,
  outputFolderName,
  onOutputDirChange,
  scanning,
  converting,
  aborting,
  onScan,
  onConvert,
  onAbort,
  rows,
  statuses,
  progressPct,
  logs,
  onClearLog
}: {
  sourceDir: string
  onSourceDirChange: (value: string) => void
  outputDir: string
  outputFolderName: string
  onOutputDirChange: (value: string) => void
  scanning: boolean
  converting: boolean
  aborting: boolean
  onScan: () => void
  onConvert: () => void
  onAbort: () => void
  rows: ConvertRow[]
  statuses: Record<string, RowStatus>
  progressPct: number
  logs: LogEvent[]
  onClearLog: () => void
}) {
  return (
    <>
      <ConfigPanel>
        <FolderField label="Pasta com os arquivos .mp4" value={sourceDir} onChange={onSourceDirChange} />
        <FolderField
          label="Pasta de saida (arquivos .mkv)"
          title={`Os arquivos convertidos sao gerados dentro de uma subpasta "${outputFolderName}" criada nesta pasta, nao direto nela (nome configuravel em Configuracoes).`}
          value={outputDir}
          onChange={onOutputDirChange}
        />

        <ToolbarRow>
          <Row $gap={8}>
            <Button $variant="primary" onClick={onScan} disabled={scanning}>
              {scanning ? 'Escaneando...' : 'Escanear pasta'}
            </Button>
            <Button onClick={onConvert} disabled={converting || rows.length === 0}>
              {converting ? 'Convertendo...' : 'Converter para MKV'}
            </Button>
            {(converting || scanning) && (
              <Button type="button" $variant="danger" onClick={onAbort} disabled={aborting}>
                <StopOutlined /> {aborting ? 'Abortando...' : 'Abortar'}
              </Button>
            )}
          </Row>
        </ToolbarRow>
      </ConfigPanel>

      <Row $gap={10}>
        <ProgressTrack>
          <ProgressFill $pct={progressPct} />
        </ProgressTrack>
        <span style={{ fontSize: 11, minWidth: 34, textAlign: 'right' }}>{progressPct}%</span>
      </Row>

      <Col $gap={6} style={{ flex: 1, minHeight: 0 }}>
        <SectionTitle>Arquivos ({rows.length})</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState>Escaneie uma pasta para ver os arquivos .mp4 encontrados.</EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Status</th>
                </tr>
              </Thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Mono>{row.sourceName}</Mono>
                    </Td>
                    <Td>
                      <StatusBadge status={statuses[row.id] ?? 'idle'} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Col>

      <Col $gap={6}>
        <ToolbarRow>
          <SectionTitle>Log</SectionTitle>
          <Button
            type="button"
            $variant="ghost"
            onClick={onClearLog}
            disabled={logs.length === 0}
            title="Limpar o log desta sessao"
          >
            <ClearOutlined /> Limpar log
          </Button>
        </ToolbarRow>
        <LogPanel entries={logs} />
      </Col>
    </>
  )
}
