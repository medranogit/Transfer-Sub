import { useEffect, useMemo, useState } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import type {
  AppConfig,
  CleanDefaults,
  DetectedRenameFields,
  EpisodeRow,
  LogEvent,
  MkvToolsStatus,
  NamingConfig,
  RenameDefaults,
  RenameFields,
  RenamePreviewRow,
  RowStatus,
  TransferDefaults
} from '@shared/types'
import { theme } from './theme'
import { GlobalStyle } from './GlobalStyle'
import { Sidebar } from './components/Sidebar'
import type { ViewId } from './components/Sidebar'
import { WorkflowView } from './components/WorkflowView'
import { RenameView } from './components/RenameView'
import { HistoryView } from './components/HistoryView'
import { SessionLogView } from './components/SessionLogView'
import { SettingsView } from './components/SettingsView'
import { SyncModal } from './components/SyncModal'
import { NotificationsMenu } from './components/NotificationsMenu'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { playCompletionSound } from './utils/completionSound'
import { playWarningSound } from './utils/warningSound'


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
  clean: 'Editar Arquivo',
  rename: 'Renomeador',
  history: 'Historico',
  sessionLog: 'Log da Sessao',
  settings: 'Configuracoes'
}

interface WorkflowSnapshot {
  rows: EpisodeRow[]
  statuses: Record<string, RowStatus>
  selectedIds: Set<string>
  scanWarnings: string[]
  unmatchedSource: string[]
}

function AppContent() {
  const [view, setView] = useState<ViewId>('transfer')

  const [sourceDir, setSourceDir] = useState('')
  const [destDir, setDestDir] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [movieMode, setMovieMode] = useState(false)
  const [movieSourceFile, setMovieSourceFile] = useState('')
  const [movieDestFile, setMovieDestFile] = useState('')
  const [mkvStatus, setMkvStatus] = useState<MkvToolsStatus>({ found: false })

  const [rows, setRows] = useState<EpisodeRow[]>([])
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [scanWarnings, setScanWarnings] = useState<string[]>([])
  const [unmatchedSource, setUnmatchedSource] = useState<string[]>([])
  const [updateNotifications, setUpdateNotifications] = useState<string[]>([])
  const [transferSnapshot, setTransferSnapshot] = useState<WorkflowSnapshot | null>(null)
  const [cleanSnapshot, setCleanSnapshot] = useState<WorkflowSnapshot | null>(null)

  const [scanning, setScanning] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [transferRemoveEnglishAudio, setTransferRemoveEnglishAudio] = useState(true)
  const [transferRemoveExtraSubtitles, setTransferRemoveExtraSubtitles] = useState(false)
  const [cleanRemoveEnglishAudio, setCleanRemoveEnglishAudio] = useState(true)
  const [syncRowId, setSyncRowId] = useState<string | null>(null)
  const [preferredEnTrackId, setPreferredEnTrackId] = useState<number | null>(null)
  const [namingTransfer, setNamingTransfer] = useState<NamingConfig>({
    tagEnabled: false,
    tagWord: 'legendado'
  })
  const [namingClean, setNamingClean] = useState<NamingConfig>({
    tagEnabled: false,
    tagWord: 'limpo'
  })
  const [transferDefaults, setTransferDefaults] = useState<TransferDefaults>({
    movieMode: false,
    removeEnglishAudio: true,
    removeExtraSubtitles: false
  })
  const [cleanDefaults, setCleanDefaults] = useState<CleanDefaults>({ removeEnglishAudio: true })
  const [renameDefaults, setRenameDefaults] = useState<RenameDefaults>({ movieMode: false })
  const [outputFolderName, setOutputFolderName] = useState('TS - Result')
  const [muteSounds, setMuteSounds] = useState(false)
  const [ptBrTrackName, setPtBrTrackName] = useState('')

  const [renameFolder, setRenameFolder] = useState('')
  const [renameFields, setRenameFields] = useState<RenameFields>({
    fansub: '',
    animeName: '',
    season: 1,
    tags: '',
    movieMode: false
  })
  const [renameFansubPresets, setRenameFansubPresets] = useState<string[]>([])
  const [renameTagPresets, setRenameTagPresets] = useState<string[]>([])
  const [renameRows, setRenameRows] = useState<RenamePreviewRow[]>([])
  const [renameScanning, setRenameScanning] = useState(false)
  const [renameUpdating, setRenameUpdating] = useState(false)
  const [pendingFansub, setPendingFansub] = useState<DetectedRenameFields | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renamingTracks, setRenamingTracks] = useState(false)

  const cleanOnly = view === 'clean'
  const removeEnglishAudio = cleanOnly ? cleanRemoveEnglishAudio : transferRemoveEnglishAudio
  const removeExtraSubtitles = transferRemoveExtraSubtitles

  function handleToggleRemoveEnglishAudio(): void {
    if (cleanOnly) setCleanRemoveEnglishAudio((v) => !v)
    else setTransferRemoveEnglishAudio((v) => !v)
  }

  function handleToggleRemoveExtraSubtitles(): void {
    setTransferRemoveExtraSubtitles((v) => !v)
  }

  function applyConfig(config: AppConfig): void {
    setSourceDir(config.sourceDir)
    setDestDir(config.destDir)
    setOutputDir(config.outputDir)
    setNamingTransfer(config.namingTransfer)
    setNamingClean(config.namingClean)
    setTransferDefaults(config.transferDefaults)
    setCleanDefaults(config.cleanDefaults)
    setRenameDefaults(config.renameDefaults)
    setMovieMode(config.transferDefaults.movieMode)
    setTransferRemoveEnglishAudio(config.transferDefaults.removeEnglishAudio)
    setTransferRemoveExtraSubtitles(config.transferDefaults.removeExtraSubtitles)
    setCleanRemoveEnglishAudio(config.cleanDefaults.removeEnglishAudio)
    setRenameFields((prev) => ({ ...prev, movieMode: config.renameDefaults.movieMode }))
    setOutputFolderName(config.outputFolderName)
    setMuteSounds(config.muteSounds)
    setPtBrTrackName(config.ptBrTrackName)
    setRenameFolder(config.renameFolder)
    setRenameFansubPresets(config.renameFansubPresets)
    setRenameTagPresets(config.renameTagPresets)
    setMovieSourceFile(config.movieSourceFile)
    setMovieDestFile(config.movieDestFile)
    window.api.locateMkvTools(config.mkvToolNixDir).then(setMkvStatus)
  }

  useEffect(() => {
    window.api.loadConfig().then(applyConfig)

    const offLog = window.api.onLog((event) => addLog(event))
    const offProgress = window.api.onTransferProgress(({ rowId, status }) => {
      setStatuses((prev) => ({ ...prev, [rowId]: status }))
    })
    const offNotification = window.api.onNotification((message) => {
      setUpdateNotifications((prev) => [...prev, message])
    })
    return () => {
      offLog()
      offProgress()
      offNotification()
    }
  }, [])

  function logZoom(factor: number): void {
    pushLog(`Zoom da tela: ${Math.round(factor * 100)}%`)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault()
        window.api.zoomIn().then(logZoom)
      } else if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault()
        window.api.zoomOut().then(logZoom)
      } else if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault()
        window.api.zoomReset().then(logZoom)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function addLog(event: LogEvent): void {
    setLogs((prev) => [...prev, event])
    window.api.appendSessionLog(event).catch(() => {})
  }

  function pushLog(message: string, level: LogEvent['level'] = 'info') {
    addLog({ level, message })
  }

  function handleClearLog(): void {
    setLogs([])
  }

  function handleNavigate(next: ViewId) {
    if (next === view) return
    if (scanning || transferring) return

    if (view === 'transfer' || view === 'clean') {
      const outgoing: WorkflowSnapshot = { rows, statuses, selectedIds, scanWarnings, unmatchedSource }
      if (view === 'transfer') setTransferSnapshot(outgoing)
      else setCleanSnapshot(outgoing)
    }
    if (next === 'transfer' || next === 'clean') {
      const incoming = next === 'transfer' ? transferSnapshot : cleanSnapshot
      setRows(incoming?.rows ?? [])
      setStatuses(incoming?.statuses ?? {})
      setSelectedIds(incoming?.selectedIds ?? new Set())
      setScanWarnings(incoming?.scanWarnings ?? [])
      setUnmatchedSource(incoming?.unmatchedSource ?? [])
    }
    pushLog(`Navegou de "${VIEW_TITLES[view]}" para "${VIEW_TITLES[next]}"`)
    setView(next)
  }

  async function persistConfig(
    overrides: Partial<{
      sourceDir: string
      destDir: string
      outputDir: string
      namingTransfer: NamingConfig
      namingClean: NamingConfig
      transferDefaults: TransferDefaults
      cleanDefaults: CleanDefaults
      renameDefaults: RenameDefaults
      outputFolderName: string
      muteSounds: boolean
      ptBrTrackName: string
      renameFolder: string
      renameFansubPresets: string[]
      renameTagPresets: string[]
      movieSourceFile: string
      movieDestFile: string
    }> = {}
  ) {
    await window.api.saveConfig({
      sourceDir: overrides.sourceDir ?? sourceDir,
      destDir: overrides.destDir ?? destDir,
      outputDir: overrides.outputDir ?? outputDir,
      mkvToolNixDir: mkvStatus.mkvmergePath ? mkvStatus.mkvmergePath.replace(/[\\/][^\\/]+$/, '') : '',
      namingTransfer: overrides.namingTransfer ?? namingTransfer,
      namingClean: overrides.namingClean ?? namingClean,
      transferDefaults: overrides.transferDefaults ?? transferDefaults,
      cleanDefaults: overrides.cleanDefaults ?? cleanDefaults,
      renameDefaults: overrides.renameDefaults ?? renameDefaults,
      outputFolderName: overrides.outputFolderName ?? outputFolderName,
      muteSounds: overrides.muteSounds ?? muteSounds,
      ptBrTrackName: overrides.ptBrTrackName ?? ptBrTrackName,
      renameFolder: overrides.renameFolder ?? renameFolder,
      renameFansubPresets: overrides.renameFansubPresets ?? renameFansubPresets,
      renameTagPresets: overrides.renameTagPresets ?? renameTagPresets,
      movieSourceFile: overrides.movieSourceFile ?? movieSourceFile,
      movieDestFile: overrides.movieDestFile ?? movieDestFile
    })
  }

  function handleNamingTransferChange(next: NamingConfig) {
    setNamingTransfer(next)
    persistConfig({ namingTransfer: next })
  }

  function handleNamingCleanChange(next: NamingConfig) {
    setNamingClean(next)
    persistConfig({ namingClean: next })
  }

  function handleTransferDefaultsChange(next: TransferDefaults) {
    setTransferDefaults(next)
    setMovieMode(next.movieMode)
    setTransferRemoveEnglishAudio(next.removeEnglishAudio)
    setTransferRemoveExtraSubtitles(next.removeExtraSubtitles)
    persistConfig({ transferDefaults: next })
  }

  function handleCleanDefaultsChange(next: CleanDefaults) {
    setCleanDefaults(next)
    setCleanRemoveEnglishAudio(next.removeEnglishAudio)
    persistConfig({ cleanDefaults: next })
  }

  function handleRenameDefaultsChange(next: RenameDefaults) {
    setRenameDefaults(next)
    setRenameFields((prev) => ({ ...prev, movieMode: next.movieMode }))
    persistConfig({ renameDefaults: next })
  }

  function handleOutputFolderNameChange(next: string) {
    setOutputFolderName(next)
    persistConfig({ outputFolderName: next })
  }

  function handleMuteSoundsChange(next: boolean) {
    setMuteSounds(next)
    persistConfig({ muteSounds: next })
  }

  async function handleExportConfig() {
    const ok = await window.api.exportConfig()
    pushLog(ok ? 'Configuracoes exportadas.' : 'Exportacao de configuracoes cancelada.', ok ? 'success' : 'info')
  }

  async function handleImportConfig() {
    try {
      const config = await window.api.importConfig()
      if (!config) {
        pushLog('Importacao de configuracoes cancelada.', 'info')
        return
      }
      applyConfig(config)
      pushLog('Configuracoes importadas.', 'success')
    } catch (err) {
      pushLog(`Erro ao importar configuracoes: ${(err as Error).message}`, 'error')
    }
  }

  function handleCheckForUpdates() {
    window.api.checkForUpdates().catch((err) => pushLog(`Erro ao verificar atualizacoes: ${(err as Error).message}`, 'error'))
  }

  function handlePtBrTrackNameChange(next: string) {
    setPtBrTrackName(next)
    persistConfig({ ptBrTrackName: next })
  }

  function handleRenameFansubPresetsChange(next: string[]) {
    setRenameFansubPresets(next)
    persistConfig({ renameFansubPresets: next })
  }

  function handleRenameTagPresetsChange(next: string[]) {
    setRenameTagPresets(next)
    persistConfig({ renameTagPresets: next })
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
        pushLog('Selecione a pasta com os arquivos a processar.', 'error')
        return
      }
    } else if (movieMode) {
      if (!movieSourceFile || !movieDestFile) {
        pushLog('Selecione os arquivos de origem e destino do filme.', 'error')
        return
      }
    } else if (!sourceDir || !destDir) {
      pushLog('Selecione as pastas de origem e destino.', 'error')
      return
    }
    const fallbackOutput = movieMode ? movieDestFile.replace(/[\\/][^\\/]+$/, '') : destDir
    const effectiveOutput = outputDir || fallbackOutput
    if (!outputDir) setOutputDir(effectiveOutput)

    await persistConfig({ outputDir: effectiveOutput, movieSourceFile, movieDestFile })
    setScanning(true)
    setRows([])
    setStatuses({})
    setSelectedIds(new Set())
    setScanWarnings([])
    setUnmatchedSource([])
    try {
      const result = cleanOnly
        ? await window.api.scanClean(destDir)
        : movieMode
          ? await window.api.scanMovie(movieSourceFile, movieDestFile)
          : await window.api.scan(sourceDir, destDir)
      setRows(result.rows)
      setSelectedIds(new Set(result.rows.map((r) => r.id)))
      setStatuses(Object.fromEntries(result.rows.map((r) => [r.id, 'idle' as RowStatus])))
      setScanWarnings(result.warnings)
      setUnmatchedSource(result.unmatchedSource)
      if (!muteSounds && result.warnings.length + result.unmatchedSource.length > 0) playWarningSound()
      result.warnings.forEach((w) => pushLog(w, 'warn'))
      if (result.aborted) pushLog('Escaneamento abortado antes de terminar.', 'warn')
    } catch (err) {
      pushLog(`Erro ao escanear: ${(err as Error).message}`, 'error')
    } finally {
      setScanning(false)
      setAborting(false)
    }
  }

  async function handleRenameScan() {
    if (!renameFolder) {
      pushLog('Selecione a pasta com os arquivos a renomear.', 'error')
      return
    }
    if (!renameFields.movieMode && (!Number.isFinite(renameFields.season) || renameFields.season < 0)) {
      pushLog('Informe uma temporada valida.', 'error')
      return
    }
    await persistConfig({ renameFolder })
    setRenameScanning(true)
    setScanWarnings([])
    setUnmatchedSource([])
    try {
      const { rows: result, detected, warnings } = await window.api.previewRename(renameFolder, renameFields)
      setRenameRows(result)
      setScanWarnings(warnings)
      if (!muteSounds && warnings.length > 0) playWarningSound()
      warnings.forEach((w) => pushLog(w, 'warn'))
      if (detected) {
        const fansubKnown =
          !detected.fansub || renameFansubPresets.some((p) => p.toLowerCase() === detected.fansub.toLowerCase())
        setRenameFields((prev) => ({
          ...prev,
          fansub: fansubKnown ? detected.fansub : '',
          animeName: detected.animeName,
          season: detected.season,
          tags: detected.tags
        }))
        if (fansubKnown) {
          pushLog(`Detectado automaticamente: fansub "${detected.fansub}", temporada ${detected.season}.`, 'info')
        } else {
          setPendingFansub(detected)
          pushLog(
            `Detectado automaticamente: temporada ${detected.season}. Fansub "${detected.fansub}" nao esta na lista - confirme para adicionar.`,
            'info'
          )
        }
      }
      const ready = result.filter((r) => r.newName).length
      pushLog(`Pre-visualizacao gerada: ${ready}/${result.length} prontos para renomear.`, ready ? 'success' : 'warn')
    } catch (err) {
      pushLog(`Erro ao escanear: ${(err as Error).message}`, 'error')
    } finally {
      setRenameScanning(false)
    }
  }

  async function handleRenameUpdate() {
    if (renameRows.length === 0) return
    if (!renameFields.movieMode && (!Number.isFinite(renameFields.season) || renameFields.season < 0)) {
      pushLog('Informe uma temporada valida.', 'error')
      return
    }
    setRenameUpdating(true)
    try {
      const result = await window.api.recomputeRename(
        renameRows.map((r) => r.originalPath),
        renameFields
      )
      setRenameRows(result)
      const ready = result.filter((r) => r.newName).length
      pushLog(`Pre-visualizacao atualizada: ${ready}/${result.length} prontos para renomear.`, ready ? 'success' : 'warn')
    } catch (err) {
      pushLog(`Erro ao atualizar: ${(err as Error).message}`, 'error')
    } finally {
      setRenameUpdating(false)
    }
  }

  function handleConfirmNewFansub() {
    if (!pendingFansub) return
    const next = [...renameFansubPresets, pendingFansub.fansub]
    setRenameFansubPresets(next)
    persistConfig({ renameFansubPresets: next })
    setRenameFields((prev) => ({ ...prev, fansub: pendingFansub.fansub }))
    setPendingFansub(null)
  }

  function handleCancelNewFansub() {
    setPendingFansub(null)
  }

  async function handleRenameApply() {
    const targets = renameRows.filter((r) => r.newName)
    if (targets.length === 0) {
      pushLog('Nenhum arquivo pronto para renomear.', 'error')
      return
    }
    setRenaming(true)
    try {
      const summary = await window.api.applyRename(targets)
      pushLog(`Renomeacao concluida: ${summary.success}/${summary.total} com sucesso.`, summary.failed ? 'warn' : 'success')
      setRenameRows([])
    } catch (err) {
      pushLog(`Erro ao renomear: ${(err as Error).message}`, 'error')
    } finally {
      setRenaming(false)
    }
  }

  async function handleRenameTracks() {
    const targets = renameRows.filter((r) => /\.(mkv|webm)$/i.test(r.originalName)).map((r) => r.originalPath)
    if (targets.length === 0) {
      pushLog('Nenhum arquivo .mkv/.webm para rotular.', 'error')
      return
    }
    setRenamingTracks(true)
    try {
      const summary = await window.api.renameSubtitleTracks(targets)
      pushLog(
        `Rotulagem de faixas concluida: ${summary.success}/${summary.total} com sucesso.`,
        summary.failed ? 'warn' : 'success'
      )
    } catch (err) {
      pushLog(`Erro ao rotular faixas: ${(err as Error).message}`, 'error')
    } finally {
      setRenamingTracks(false)
    }
  }

  function handleTrackChange(rowId: string, trackId: number | null) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, selectedTrackId: trackId } : r)))
  }

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

  function handleApplySync(rowId: string, offsetMs: number, syncTrackId: number) {
    const row = rows.find((r) => r.id === rowId)
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, syncTrackId } : r)))
    handleManualOffsetChange(rowId, String(offsetMs))
    if (row) pushLog(`[${row.episodeKey}] deslocamento de ${offsetMs}ms aplicado via auto-sync`, 'success')
  }

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
        outputDir: outputDir || (movieMode ? movieDestFile.replace(/[\\/][^\\/]+$/, '') : destDir),
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
      if (!muteSounds) playCompletionSound()
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
      <Sidebar active={view} onNavigate={handleNavigate} navigationLocked={scanning || transferring} />

      <MainArea>
        <Header>
          <Title>{VIEW_TITLES[view]}</Title>
          <NotificationsMenu
            groups={[
              {
                title: 'Sem correspondencia no destino',
                items: unmatchedSource,
                onDismiss: (i) => setUnmatchedSource((prev) => prev.filter((_, idx) => idx !== i))
              },
              {
                title: 'Avisos do escaneamento',
                items: scanWarnings,
                onDismiss: (i) => setScanWarnings((prev) => prev.filter((_, idx) => idx !== i))
              },
              {
                title: 'Atualizacoes',
                items: updateNotifications,
                onDismiss: (i) => setUpdateNotifications((prev) => prev.filter((_, idx) => idx !== i))
              }
            ]}
          />
        </Header>

        {(view === 'transfer' || view === 'clean') && (
          <WorkflowView
            cleanOnly={cleanOnly}
            sourceDir={sourceDir}
            destDir={destDir}
            outputDir={outputDir}
            outputFolderName={outputFolderName}
            onSourceDirChange={setSourceDir}
            onDestDirChange={setDestDir}
            onOutputDirChange={setOutputDir}
            movieMode={movieMode}
            onSetMovieMode={setMovieMode}
            movieSourceFile={movieSourceFile}
            movieDestFile={movieDestFile}
            onMovieSourceFileChange={setMovieSourceFile}
            onMovieDestFileChange={setMovieDestFile}
            removeEnglishAudio={removeEnglishAudio}
            onToggleRemoveEnglishAudio={handleToggleRemoveEnglishAudio}
            removeExtraSubtitles={removeExtraSubtitles}
            onToggleRemoveExtraSubtitles={handleToggleRemoveExtraSubtitles}
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
            onClearLog={handleClearLog}
          />
        )}

        {view === 'rename' && (
          <RenameView
            folder={renameFolder}
            onFolderChange={setRenameFolder}
            fields={renameFields}
            onFieldsChange={setRenameFields}
            fansubPresets={renameFansubPresets}
            tagPresets={renameTagPresets}
            rows={renameRows}
            scanning={renameScanning}
            updating={renameUpdating}
            renaming={renaming}
            renamingTracks={renamingTracks}
            onScan={handleRenameScan}
            onUpdate={handleRenameUpdate}
            onApply={handleRenameApply}
            onRenameTracks={handleRenameTracks}
            logs={logs}
            onClearLog={handleClearLog}
          />
        )}

        {view === 'history' && <HistoryView onError={(message) => pushLog(message, 'error')} />}

        {view === 'sessionLog' && <SessionLogView />}

        {view === 'settings' && (
          <SettingsView
            mkvStatus={mkvStatus}
            onChooseMkvDir={handleChooseMkvDir}
            namingTransfer={namingTransfer}
            onNamingTransferChange={handleNamingTransferChange}
            namingClean={namingClean}
            onNamingCleanChange={handleNamingCleanChange}
            transferDefaults={transferDefaults}
            onTransferDefaultsChange={handleTransferDefaultsChange}
            cleanDefaults={cleanDefaults}
            onCleanDefaultsChange={handleCleanDefaultsChange}
            renameDefaults={renameDefaults}
            onRenameDefaultsChange={handleRenameDefaultsChange}
            outputFolderName={outputFolderName}
            onOutputFolderNameChange={handleOutputFolderNameChange}
            muteSounds={muteSounds}
            onMuteSoundsChange={handleMuteSoundsChange}
            onExportConfig={handleExportConfig}
            onImportConfig={handleImportConfig}
            onCheckForUpdates={handleCheckForUpdates}
            ptBrTrackName={ptBrTrackName}
            onPtBrTrackNameChange={handlePtBrTrackNameChange}
            renameFansubPresets={renameFansubPresets}
            onRenameFansubPresetsChange={handleRenameFansubPresetsChange}
            renameTagPresets={renameTagPresets}
            onRenameTagPresetsChange={handleRenameTagPresetsChange}
          />
        )}
      </MainArea>

      {syncRow && (
        <SyncModal
          row={syncRow}
          cleanOnly={cleanOnly}
          onClose={() => setSyncRowId(null)}
          onApply={(offsetMs, syncTrackId) => handleApplySync(syncRow.id, offsetMs, syncTrackId)}
          onFirstLineTargetChange={(value) => handleFirstLineTargetChange(syncRow.id, value)}
          onManualOffsetChange={(value) => handleManualOffsetChange(syncRow.id, value)}
          preferredEnTrackId={preferredEnTrackId}
          onEnTrackChosen={setPreferredEnTrackId}
          onError={(message) => pushLog(message, 'error')}
        />
      )}

      {pendingFansub && (
        <ConfirmDialog
          title="Fansub desconhecida"
          message={`A fansub "${pendingFansub.fansub}" detectada no arquivo nao esta na lista conhecida. Adicionar a lista e usar nos campos?`}
          confirmLabel="Adicionar e usar"
          cancelLabel="Deixar em branco"
          onConfirm={handleConfirmNewFansub}
          onCancel={handleCancelNewFansub}
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
