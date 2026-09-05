import { useEffect, useMemo, useState } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import type { EpisodeRow, LogEvent, MkvToolsStatus, RowStatus } from '@shared/types'
import { theme } from './theme'
import { GlobalStyle } from './GlobalStyle'
import { Sidebar } from './components/Sidebar'
import type { ViewId } from './components/Sidebar'
import { WorkflowView } from './components/WorkflowView'
import { HistoryView } from './components/HistoryView'
import { SettingsView } from './components/SettingsView'
import { SyncModal } from './components/SyncModal'
import { NotificationsMenu } from './components/NotificationsMenu'
import { playCompletionSound } from './utils/completionSound'

// ---------------------------------------------------------------------------
// Layout - especifico desta tela, sem uso fora daqui.
// ---------------------------------------------------------------------------

const Shell = styled.div`
  height: 100%;
  display: flex;
`

const MainArea = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 14px;
`

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const Title = styled.h1`
  font-size: 16px;
  margin: 0;
  font-weight: 700;
`

const VIEW_TITLES: Record<ViewId, string> = {
  transfer: 'Transferir Legenda',
  clean: 'Apenas Limpar',
  history: 'Historico',
  settings: 'Configuracoes'
}

function AppContent() {
  const [view, setView] = useState<ViewId>('transfer')

  const [sourceDir, setSourceDir] = useState('')
  const [destDir, setDestDir] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [mkvStatus, setMkvStatus] = useState<MkvToolsStatus>({ found: false })

  const [rows, setRows] = useState<EpisodeRow[]>([])
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [scanWarnings, setScanWarnings] = useState<string[]>([])
  const [unmatchedSource, setUnmatchedSource] = useState<string[]>([])

  const [scanning, setScanning] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [removeEnglishAudio, setRemoveEnglishAudio] = useState(true)
  const [removeExtraSubtitles, setRemoveExtraSubtitles] = useState(false)
  const [syncRowId, setSyncRowId] = useState<string | null>(null)
  const [preferredEnTrackId, setPreferredEnTrackId] = useState<number | null>(null)

  const cleanOnly = view === 'clean'

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

  // Trocar entre Transferir Legenda <-> Apenas Limpar invalida a tabela
  // escaneada (o escaneamento de cada modo e diferente) - Historico e
  // Configuracoes nao mexem nesse estado, entao navegam livremente.
  function handleNavigate(next: ViewId) {
    if (next === view) return
    const isWorkflowSwitch = (next === 'transfer' || next === 'clean') && (view === 'transfer' || view === 'clean')
    if (isWorkflowSwitch) {
      if (scanning || transferring) return
      setRows([])
      setStatuses({})
      setSelectedIds(new Set())
      setScanWarnings([])
      setUnmatchedSource([])
    }
    setView(next)
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
    setScanWarnings([])
    setUnmatchedSource([])
    try {
      const result = cleanOnly ? await window.api.scanClean(destDir) : await window.api.scan(sourceDir, destDir)
      setRows(result.rows)
      setSelectedIds(new Set(result.rows.map((r) => r.id)))
      setStatuses(Object.fromEntries(result.rows.map((r) => [r.id, 'idle' as RowStatus])))
      setScanWarnings(result.warnings)
      setUnmatchedSource(result.unmatchedSource)
      result.warnings.forEach((w) => pushLog(w, 'warn'))
      if (result.aborted) pushLog('Escaneamento abortado antes de terminar.', 'warn')
    } catch (err) {
      pushLog(`Erro ao escanear: ${(err as Error).message}`, 'error')
    } finally {
      setScanning(false)
      setAborting(false)
    }
  }

  function handleTrackChange(rowId: string, trackId: number | null) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, selectedTrackId: trackId } : r)))
  }

  // So no modo Limpar: copia a faixa escolhida na 1a linha pras demais, pra
  // evitar selecionar a mesma faixa manualmente episodio por episodio
  // quando todos vem do mesmo release (mesma estrutura de faixas).
  function handleApplyTrackToAll() {
    const template = rows[0]?.selectedTrackId ?? null
    setRows((prev) =>
      prev.map((r) => {
        if (template === null) return { ...r, selectedTrackId: null }
        return r.tracks.some((t) => t.trackId === template) ? { ...r, selectedTrackId: template } : r
      })
    )
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

  // Selecionar uma linha marca a intencao de (re)processa-la agora - se ela
  // ainda carregava um status 'done'/'error' de uma transferencia anterior
  // nesta mesma sessao, isso deixava a % de progresso ja alta so por causa
  // de linhas que nem entraram nesta leva, dando a falsa impressao de que a
  // transferencia pulou o arquivo (sem pular - o mkvmerge sempre sobrescreve).
  function selectRows(nextIds: Set<string>) {
    const added = [...nextIds].filter((id) => !selectedIds.has(id))
    setSelectedIds(nextIds)
    if (added.length > 0) {
      setStatuses((prev) => {
        const next = { ...prev }
        added.forEach((id) => {
          next[id] = 'idle'
        })
        return next
      })
    }
  }

  function handleToggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectRows(next)
  }

  function handleToggleSelectAll() {
    selectRows(selectedIds.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))
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
      if (summary.aborted) {
        pushLog(`Abortado: ${summary.success}/${summary.total} processados antes de parar.`, 'warn')
      } else {
        pushLog(`Concluido: ${summary.success}/${summary.total} com sucesso.`, summary.failed ? 'warn' : 'success')
      }
    } catch (err) {
      pushLog(`Erro: ${(err as Error).message}`, 'error')
    } finally {
      setTransferring(false)
      setAborting(false)
      playCompletionSound()
    }
  }

  function handleAbort() {
    setAborting(true)
    window.api.abortOperation()
    pushLog('Abortando... interrompendo o episodio atual e cancelando os restantes.', 'warn')
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
      <Sidebar active={view} onNavigate={handleNavigate} workflowSwitchDisabled={scanning || transferring} />

      <MainArea>
        <Header>
          <Title>{VIEW_TITLES[view]}</Title>
          <NotificationsMenu warnings={scanWarnings} unmatchedSource={unmatchedSource} />
        </Header>

        {(view === 'transfer' || view === 'clean') && (
          <WorkflowView
            cleanOnly={cleanOnly}
            sourceDir={sourceDir}
            destDir={destDir}
            outputDir={outputDir}
            onSourceDirChange={setSourceDir}
            onDestDirChange={setDestDir}
            onOutputDirChange={setOutputDir}
            removeEnglishAudio={removeEnglishAudio}
            onToggleRemoveEnglishAudio={() => setRemoveEnglishAudio(!removeEnglishAudio)}
            removeExtraSubtitles={removeExtraSubtitles}
            onToggleRemoveExtraSubtitles={() => setRemoveExtraSubtitles(!removeExtraSubtitles)}
            scanning={scanning}
            transferring={transferring}
            aborting={aborting}
            onScan={handleScan}
            onTransfer={handleTransfer}
            onAbort={handleAbort}
            rows={rows}
            statuses={statuses}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onTrackChange={handleTrackChange}
            onApplyTrackToAll={handleApplyTrackToAll}
            onOpenSync={setSyncRowId}
            progressPct={progressPct}
            logs={logs}
          />
        )}

        {view === 'history' && <HistoryView />}

        {view === 'settings' && <SettingsView mkvStatus={mkvStatus} onChooseMkvDir={handleChooseMkvDir} />}
      </MainArea>

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
