// Pagina de trabalho compartilhada pelos dois modos (Transferir Legenda /
// Limpeza) - mesma estrutura de sempre (pastas, opcoes, tabela, log),
// so que agora e uma pagina navegada pela Sidebar em vez de alternada por
// um toggle dentro de uma unica tela.
import styled from 'styled-components'
import { CheckOutlined, ClearOutlined, StopOutlined } from '@ant-design/icons'
import type { EpisodeRow, LogEvent, RowStatus } from '@shared/types'
import { Button, Col, Panel, Row, SectionTitle } from '../ui/primitives'
import { Chip, ChipRow } from '../ui/Chip'
import { EpisodeMovieToggle } from '../ui/EpisodeMovieToggle'
import { FolderField } from './FolderField'
import { FileField } from './FileField'
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
  movieMode,
  onSetMovieMode,
  movieSourceFile,
  movieDestFile,
  onMovieSourceFileChange,
  onMovieDestFileChange,
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
  logs,
  onClearLog
}: {
  cleanOnly: boolean
  sourceDir: string
  destDir: string
  outputDir: string
  onSourceDirChange: (value: string) => void
  onDestDirChange: (value: string) => void
  onOutputDirChange: (value: string) => void
  movieMode: boolean
  onSetMovieMode: (movieMode: boolean) => void
  movieSourceFile: string
  movieDestFile: string
  onMovieSourceFileChange: (value: string) => void
  onMovieDestFileChange: (value: string) => void
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
  onClearLog: () => void
}) {
  return (
    <>
      <ConfigPanel>
        <Row $gap={12} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {!cleanOnly && <EpisodeMovieToggle movieMode={movieMode} onChange={onSetMovieMode} />}
          <ChipRow>
            <Chip
              type="button"
              $active={removeEnglishAudio}
              onClick={onToggleRemoveEnglishAudio}
              title="Remove a dublagem em ingles do arquivo de destino, mantendo so o audio japones."
            >
              {removeEnglishAudio && <CheckOutlined />}
              Remover dublagem em ingles
            </Chip>
            {!cleanOnly && (
              <Chip
                type="button"
                $active={removeExtraSubtitles}
                onClick={onToggleRemoveExtraSubtitles}
                title="Remove as legendas que ja existiam no destino, deixando so a legenda transferida."
              >
                {removeExtraSubtitles && <CheckOutlined />}
                Limpar legendas do destino
              </Chip>
            )}
          </ChipRow>
        </Row>
        {!cleanOnly && movieMode ? (
          <>
            <FileField
              label="Arquivo de origem (com legenda)"
              value={movieSourceFile}
              onChange={onMovieSourceFileChange}
            />
            <FileField
              label="Arquivo de destino (sem legenda)"
              value={movieDestFile}
              onChange={onMovieDestFileChange}
            />
          </>
        ) : (
          <>
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
          </>
        )}
        <FolderField label="Pasta de saida (arquivos finais)" value={outputDir} onChange={onOutputDirChange} />

        <ToolbarRow>
          <Row $gap={8}>
            <Button $variant="primary" onClick={onScan} disabled={scanning}>
              {scanning
                ? 'Escaneando...'
                : cleanOnly
                  ? 'Escanear pasta'
                  : movieMode
                    ? 'Preparar filme'
                    : 'Escanear pastas'}
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
        <SectionTitle>
          {cleanOnly ? `Arquivos (${rows.length})` : movieMode ? 'Filme' : `Episodios (${rows.length})`}
        </SectionTitle>
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
