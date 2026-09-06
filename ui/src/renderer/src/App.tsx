import { useEffect, useMemo, useState } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import type {
  DetectedRenameFields,
  EpisodeRow,
  LogEvent,
  MkvToolsStatus,
  NamingConfig,
  RenameFields,
  RenamePreviewRow,
  RowStatus
} from '@shared/types'
import { theme } from './theme'
import { GlobalStyle } from './GlobalStyle'
import { Sidebar } from './components/Sidebar'
import type { ViewId } from './components/Sidebar'
import { WorkflowView } from './components/WorkflowView'
import { RenameView } from './components/RenameView'
import { HistoryView } from './components/HistoryView'
import { SettingsView } from './components/SettingsView'
import { SyncModal } from './components/SyncModal'
import { NotificationsMenu } from './components/NotificationsMenu'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { playCompletionSound } from './utils/completionSound'
import { playWarningSound } from './utils/warningSound'

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
  clean: 'Limpeza',
  rename: 'Renomeador',
  history: 'Historico',
  settings: 'Configuracoes'
}

function AppContent() {
  const [view, setView] = useState<ViewId>('transfer')

  const [sourceDir, setSourceDir] = useState('')
  const [destDir, setDestDir] = useState('')
  const [outputDir, setOutputDir] = useState('')
  // Modo Filme (so no Transferir Legenda): filmes nao tem numero de episodio
  // pra parear automaticamente por pasta, entao o usuario escolhe os dois
  // arquivos direto em vez de pastas inteiras. Nao persiste o toggle em si
  // (sempre comeca desligado, como os outros toggles de operacao), so os
  // ultimos arquivos escolhidos.
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

  const [scanning, setScanning] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [removeEnglishAudio, setRemoveEnglishAudio] = useState(true)
  const [removeExtraSubtitles, setRemoveExtraSubtitles] = useState(false)
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
  // Fansub detectada no escaneamento que ainda nao esta na lista conhecida -
  // preenchida so enquanto o modal de confirmacao esta aberto perguntando se
  // adiciona a lista e aplica no campo (ver handleRenameScan).
  const [pendingFansub, setPendingFansub] = useState<DetectedRenameFields | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renamingTracks, setRenamingTracks] = useState(false)

  const cleanOnly = view === 'clean'

  useEffect(() => {
    window.api.loadConfig().then((config) => {
      setSourceDir(config.sourceDir)
      setDestDir(config.destDir)
      setOutputDir(config.outputDir)
      setNamingTransfer(config.namingTransfer)
      setNamingClean(config.namingClean)
      setPtBrTrackName(config.ptBrTrackName)
      setRenameFolder(config.renameFolder)
      setRenameFansubPresets(config.renameFansubPresets)
      setRenameTagPresets(config.renameTagPresets)
      setMovieSourceFile(config.movieSourceFile)
      setMovieDestFile(config.movieDestFile)
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

  // Com um escaneamento/transferencia/limpeza em andamento a Sidebar ja
  // desabilita todo o resto (so a aba ativa fica clicavel) - essa checagem e
  // so uma segunda camada de protecao. Trocar entre Transferir Legenda <->
  // Limpeza tambem invalida a tabela escaneada (o escaneamento de cada
  // modo e diferente).
  function handleNavigate(next: ViewId) {
    if (next === view) return
    if (scanning || transferring) return
    const isWorkflowSwitch = (next === 'transfer' || next === 'clean') && (view === 'transfer' || view === 'clean')
    if (isWorkflowSwitch) {
      setRows([])
      setStatuses({})
      setSelectedIds(new Set())
      setScanWarnings([])
      setUnmatchedSource([])
    }
    setView(next)
  }

  async function persistConfig(
    overrides: Partial<{
      sourceDir: string
      destDir: string
      outputDir: string
      namingTransfer: NamingConfig
      namingClean: NamingConfig
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
        pushLog('Selecione a pasta com os arquivos a limpar.', 'error')
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
    // Sem pasta de saida definida, cai na pasta do destino - no modo filme
    // isso e a pasta que contem o arquivo de destino, ja que nao ha uma
    // "pasta de destino" escolhida separadamente.
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
      if (result.warnings.length + result.unmatchedSource.length > 0) playWarningSound()
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
    try {
      const { rows: result, detected } = await window.api.previewRename(renameFolder, renameFields)
      setRenameRows(result)
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

  // So mexe no metadado da faixa (nome + idioma) de arquivos .mkv/.webm ja
  // escaneados - nao muda o nome do arquivo, entao (diferente de
  // handleRenameApply) nao limpa renameRows no final.
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
      <Sidebar active={view} onNavigate={handleNavigate} navigationLocked={scanning || transferring} />

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
            movieMode={movieMode}
            onSetMovieMode={setMovieMode}
            movieSourceFile={movieSourceFile}
            movieDestFile={movieDestFile}
            onMovieSourceFileChange={setMovieSourceFile}
            onMovieDestFileChange={setMovieDestFile}
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
          />
        )}

        {view === 'history' && <HistoryView />}

        {view === 'settings' && (
          <SettingsView
            mkvStatus={mkvStatus}
            onChooseMkvDir={handleChooseMkvDir}
            namingTransfer={namingTransfer}
            onNamingTransferChange={handleNamingTransferChange}
            namingClean={namingClean}
            onNamingCleanChange={handleNamingCleanChange}
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
          onClose={() => setSyncRowId(null)}
          onApply={(offsetMs) => handleApplySync(syncRow.id, offsetMs)}
          onFirstLineTargetChange={(value) => handleFirstLineTargetChange(syncRow.id, value)}
          onManualOffsetChange={(value) => handleManualOffsetChange(syncRow.id, value)}
          preferredEnTrackId={preferredEnTrackId}
          onEnTrackChosen={setPreferredEnTrackId}
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
