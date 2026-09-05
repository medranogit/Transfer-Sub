// Pagina de trabalho compartilhada pelos dois modos (Transferir Legenda /
// Apenas Limpar) - mesma estrutura de sempre (pastas, opcoes, tabela, log),
// so que agora e uma pagina navegada pela Sidebar em vez de alternada por
// um toggle dentro de uma unica tela.
import styled from 'styled-components'
import { CheckOutlined, StopOutlined } from '@ant-design/icons'
import type { EpisodeRow, LogEvent, RowStatus } from '@shared/types'
import { Button, Col, Panel, Row, SectionTitle } from '../ui/primitives'
import { Chip, ChipRow } from '../ui/Chip'
import { FolderField } from './FolderField'
import { LogPanel } from './LogPanel'
import { EpisodeTable } from './EpisodeTable'

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

export function WorkflowView({
  cleanOnly,
  sourceDir,
  destDir,
  outputDir,
  onSourceDirChange,
  onDestDirChange,
  onOutputDirChange,
  removeEnglishAudio,
  onToggleRemoveEnglishAudio,
  removeExtraSubtitles,
  onToggleRemoveExtraSubtitles,
  scanning,
  transferring,
  aborting,
  onScan,
  onTransfer,
  onAbort,
  rows,
  statuses,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onTrackChange,
  onApplyTrackToAll,
  onOpenSync,
  progressPct,
  logs
}: {
  cleanOnly: boolean
  sourceDir: string
  destDir: string
  outputDir: string
  onSourceDirChange: (value: string) => void
  onDestDirChange: (value: string) => void
  onOutputDirChange: (value: string) => void
  removeEnglishAudio: boolean
  onToggleRemoveEnglishAudio: () => void
  removeExtraSubtitles: boolean
  onToggleRemoveExtraSubtitles: () => void
  scanning: boolean
  transferring: boolean
  aborting: boolean
  onScan: () => void
  onTransfer: () => void
  onAbort: () => void
  rows: EpisodeRow[]
  statuses: Record<string, RowStatus>
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onTrackChange: (rowId: string, trackId: number | null) => void
  onApplyTrackToAll: () => void
  onOpenSync: (rowId: string) => void
  progressPct: number
  logs: LogEvent[]
}) {
  return (
    <>
      <ConfigPanel>
        <FolderField
          label="Pasta de origem (com legenda)"
          value={sourceDir}
          onChange={onSourceDirChange}
          disabled={cleanOnly}
        />
        <FolderField
          label={cleanOnly ? 'Pasta com os arquivos' : 'Pasta de destino (sem legenda)'}
          value={destDir}
          onChange={onDestDirChange}
        />
        <FolderField label="Pasta de saida (arquivos finais)" value={outputDir} onChange={onOutputDirChange} />

        <ChipRow>
          <Chip type="button" $active={removeEnglishAudio} onClick={onToggleRemoveEnglishAudio}>
            {removeEnglishAudio && <CheckOutlined />}
            Remover dublagem em ingles do destino (manter so o audio japones)
          </Chip>
          {!cleanOnly && (
            <Chip type="button" $active={removeExtraSubtitles} onClick={onToggleRemoveExtraSubtitles}>
              {removeExtraSubtitles && <CheckOutlined />}
              Limpar legendas do destino, deixando so a transferida
            </Chip>
          )}
        </ChipRow>

        <ToolbarRow>
          <Row $gap={8}>
            <Button $variant="primary" onClick={onScan} disabled={scanning}>
              {scanning ? 'Escaneando...' : cleanOnly ? 'Escanear pasta' : 'Escanear pastas'}
            </Button>
            <Button onClick={onTransfer} disabled={transferring || rows.length === 0}>
              {transferring
                ? cleanOnly
                  ? 'Limpando...'
                  : 'Transferindo...'
                : cleanOnly
                  ? 'Limpar selecionados'
                  : 'Transferir selecionados'}
            </Button>
            {(transferring || scanning) && (
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
        <SectionTitle>{cleanOnly ? `Arquivos (${rows.length})` : `Episodios (${rows.length})`}</SectionTitle>
        <EpisodeTable
          rows={rows}
          statuses={statuses}
          selectedIds={selectedIds}
          cleanOnly={cleanOnly}
          onToggleSelect={onToggleSelect}
          onToggleSelectAll={onToggleSelectAll}
          onTrackChange={onTrackChange}
          onOpenSync={onOpenSync}
          onApplyTrackToAll={onApplyTrackToAll}
        />
      </Col>

      <Col $gap={6}>
        <SectionTitle>Log</SectionTitle>
        <LogPanel entries={logs} />
      </Col>
    </>
  )
}
