import { useEffect, useMemo, useState } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import { CheckOutlined } from '@ant-design/icons'
import type { EpisodeRow, LogEvent, MkvToolsStatus, RowStatus } from '@shared/types'
import { theme } from './theme'
import { GlobalStyle } from './GlobalStyle'
import { Button, Col, Label, Panel, Row, SectionTitle } from './ui/primitives'
import { Chip, ChipRow } from './ui/Chip'
import { FolderField } from './components/FolderField'
import { LogPanel } from './components/LogPanel'
import { ModeToggle } from './components/ModeToggle'
import { EpisodeTable } from './components/EpisodeTable'
import { SyncModal } from './components/SyncModal'
import { playCompletionSound } from './utils/completionSound'

// ---------------------------------------------------------------------------
// Layout - especifico desta tela, sem uso fora daqui.
// ---------------------------------------------------------------------------

const Shell = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 14px;
`

const Header = styled.header`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
`

const Title = styled.h1`
  font-size: 16px;
  margin: 0;
  font-weight: 700;
`

const MkvStatusText = styled.span<{ $found: boolean }>`
  font-size: 11.5px;
  color: ${(p) => (p.$found ? p.theme.colors.success : p.theme.colors.danger)};
`

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

function AppContent() {
  const [sourceDir, setSourceDir] = useState('')
  const [destDir, setDestDir] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [mkvStatus, setMkvStatus] = useState<MkvToolsStatus>({ found: false })

  const [rows, setRows] = useState<EpisodeRow[]>([])
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<LogEvent[]>([])

  const [scanning, setScanning] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [removeEnglishAudio, setRemoveEnglishAudio] = useState(true)
  const [removeExtraSubtitles, setRemoveExtraSubtitles] = useState(false)
  const [cleanOnly, setCleanOnly] = useState(false)
  const [syncRowId, setSyncRowId] = useState<string | null>(null)
  const [preferredEnTrackId, setPreferredEnTrackId] = useState<number | null>(null)

  useEffect(() => {
    window.api.loadConfig().then((config) => {
      setSourceDir(config.sourceDir)
      setDestDir(config.destDir)
      setOutputDir(config.outputDir)
      window.api.locateMkvTools(config.mkvToolNixDir).then(setMkvStatus)
    })

    const offLog = window.api.onLog((event) => setLogs((prev) => [...prev, event]))
    const offProgress = window.api.onTransferProgress(({ rowId, status }) => {
      setStatuses((prev) => ({ ...prev, [rowId]: status }))
    })
    return () => {
      offLog()
      offProgress()
    }
  }, [])

  function pushLog(message: string, level: LogEvent['level'] = 'info') {
    setLogs((prev) => [...prev, { level, message }])
  }

  function handleModeChange(next: boolean) {
    if (next === cleanOnly) return
    if (scanning || transferring) return
    setCleanOnly(next)
    setRows([])
    setStatuses({})
    setSelectedIds(new Set())
  }

  async function persistConfig(overrides: Partial<{ sourceDir: string; destDir: string; outputDir: string }> = {}) {
    await window.api.saveConfig({
      sourceDir: overrides.sourceDir ?? sourceDir,
      destDir: overrides.destDir ?? destDir,
      outputDir: overrides.outputDir ?? outputDir,
      mkvToolNixDir: mkvStatus.mkvmergePath ? mkvStatus.mkvmergePath.replace(/[\\/][^\\/]+$/, '') : ''
    })
  }

  async function handleChooseMkvDir() {
    const status = await window.api.chooseMkvToolsDir()
    setMkvStatus(status)
    if (!status.found) pushLog('MKVToolNix nao encontrado na pasta selecionada.', 'error')
  }

  async function handleScan() {
    if (!mkvStatus.found) {
      pushLog('Configure o MKVToolNix antes de escanear.', 'error')
      return
    }
    if (cleanOnly) {
      if (!destDir) {
        pushLog('Selecione a pasta com os arquivos a limpar.', 'error')
        return
      }
    } else if (!sourceDir || !destDir) {
      pushLog('Selecione as pastas de origem e destino.', 'error')
      return
    }
    const effectiveOutput = outputDir || destDir
    if (!outputDir) setOutputDir(effectiveOutput)

    await persistConfig({ outputDir: effectiveOutput })
    setScanning(true)
    setRows([])
    setStatuses({})
    setSelectedIds(new Set())
    try {
      const result = cleanOnly ? await window.api.scanClean(destDir) : await window.api.scan(sourceDir, destDir)
      setRows(result.rows)
      setSelectedIds(new Set(result.rows.map((r) => r.id)))
      setStatuses(Object.fromEntries(result.rows.map((r) => [r.id, 'idle' as RowStatus])))
      result.warnings.forEach((w) => pushLog(w, 'warn'))
    } catch (err) {
      pushLog(`Erro ao escanear: ${(err as Error).message}`, 'error')
    } finally {
      setScanning(false)
    }
  }

  function handleTrackChange(rowId: string, trackId: number | null) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, selectedTrackId: trackId } : r)))
  }

  function handleFirstLineTargetChange(rowId: string, firstLineTargetText: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, firstLineTargetText, manualOffsetText: firstLineTargetText ? '' : r.manualOffsetText }
          : r
      )
    )
  }

  function handleManualOffsetChange(rowId: string, manualOffsetText: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, manualOffsetText, firstLineTargetText: manualOffsetText ? '' : r.firstLineTargetText }
          : r
      )
    )
  }

  function handleApplySync(rowId: string, offsetMs: number) {
    const row = rows.find((r) => r.id === rowId)
    handleManualOffsetChange(rowId, String(offsetMs))
    if (row) pushLog(`[${row.episodeKey}] deslocamento de ${offsetMs}ms aplicado via auto-sync`, 'success')
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleSelectAll() {
    setSelectedIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))
  }

  async function handleTransfer() {
    const targets = cleanOnly
      ? rows.filter((r) => selectedIds.has(r.id))
      : rows.filter((r) => selectedIds.has(r.id) && r.selectedTrackId !== null)
    if (targets.length === 0) {
      pushLog(
        cleanOnly ? 'Nenhum arquivo selecionado.' : 'Nenhuma linha selecionada com legenda disponivel.',
        'error'
      )
      return
    }
    await persistConfig()
    setTransferring(true)
    try {
      const request = {
        rows: targets,
        outputDir: outputDir || destDir,
        removeEnglishAudio,
        removeExtraSubtitles: !cleanOnly && removeExtraSubtitles
      }
      const summary = cleanOnly ? await window.api.clean(request) : await window.api.transfer(request)
      pushLog(`Concluido: ${summary.success}/${summary.total} com sucesso.`, summary.failed ? 'warn' : 'success')
    } catch (err) {
      pushLog(`Erro: ${(err as Error).message}`, 'error')
    } finally {
      setTransferring(false)
      playCompletionSound()
    }
  }

  const progressPct = useMemo(() => {
    const total = selectedIds.size
    if (total === 0) return 0
    const finished = [...selectedIds].filter((id) => statuses[id] === 'done' || statuses[id] === 'error').length
    return Math.round((finished / total) * 100)
  }, [statuses, selectedIds])

  const syncRow = syncRowId ? rows.find((r) => r.id === syncRowId) : undefined

  return (
    <Shell>
      <Header>
        <Title>Transfer Sub</Title>
        <MkvStatusText $found={mkvStatus.found}>
          {mkvStatus.found ? `MKVToolNix: ${mkvStatus.mkvmergePath}` : 'MKVToolNix nao localizado'}
        </MkvStatusText>
      </Header>

      <ConfigPanel>
        <Row $gap={8}>
          <Label style={{ width: 190, flexShrink: 0 }}>Modo</Label>
          <ModeToggle cleanOnly={cleanOnly} disabled={scanning || transferring} onChange={handleModeChange} />
        </Row>

        <FolderField
          label="Pasta de origem (com legenda)"
          value={sourceDir}
          onChange={setSourceDir}
          disabled={cleanOnly}
        />
        <FolderField
          label={cleanOnly ? 'Pasta com os arquivos' : 'Pasta de destino (sem legenda)'}
          value={destDir}
          onChange={setDestDir}
        />
        <FolderField label="Pasta de saida (arquivos finais)" value={outputDir} onChange={setOutputDir} />

        <ChipRow>
          <Chip type="button" $active={removeEnglishAudio} onClick={() => setRemoveEnglishAudio(!removeEnglishAudio)}>
            {removeEnglishAudio && <CheckOutlined />}
            Remover dublagem em ingles do destino (manter so o audio japones)
          </Chip>
          {!cleanOnly && (
            <Chip
              type="button"
              $active={removeExtraSubtitles}
              onClick={() => setRemoveExtraSubtitles(!removeExtraSubtitles)}
            >
              {removeExtraSubtitles && <CheckOutlined />}
              Limpar legendas do destino, deixando so a transferida
            </Chip>
          )}
        </ChipRow>

        <ToolbarRow>
          <Row $gap={8}>
            <Button $variant="primary" onClick={handleScan} disabled={scanning}>
              {scanning ? 'Escaneando...' : cleanOnly ? 'Escanear pasta' : 'Escanear pastas'}
            </Button>
            <Button onClick={handleTransfer} disabled={transferring || rows.length === 0}>
              {transferring
                ? cleanOnly
                  ? 'Limpando...'
                  : 'Transferindo...'
                : cleanOnly
                  ? 'Limpar selecionados'
                  : 'Transferir selecionados'}
            </Button>
          </Row>
          <Row $gap={8}>
            <Button $variant="ghost" onClick={handleChooseMkvDir}>
              Localizar MKVToolNix...
            </Button>
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
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onTrackChange={handleTrackChange}
          onOpenSync={setSyncRowId}
        />
      </Col>

      <Col $gap={6}>
        <SectionTitle>Log</SectionTitle>
        <LogPanel entries={logs} />
      </Col>

      {syncRow && (
        <SyncModal
          row={syncRow}
          onClose={() => setSyncRowId(null)}
          onApply={(offsetMs) => handleApplySync(syncRow.id, offsetMs)}
          onFirstLineTargetChange={(value) => handleFirstLineTargetChange(syncRow.id, value)}
          onManualOffsetChange={(value) => handleManualOffsetChange(syncRow.id, value)}
          preferredEnTrackId={preferredEnTrackId}
          onEnTrackChosen={setPreferredEnTrackId}
        />
      )}
    </Shell>
  )
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <AppContent />
    </ThemeProvider>
  )
}
