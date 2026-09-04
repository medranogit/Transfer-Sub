import { useEffect, useMemo, useRef, useState } from 'react'
import styled, { createGlobalStyle, css, ThemeProvider } from 'styled-components'
import type { EpisodeRow, LogEvent, MkvToolsStatus, RowStatus, SubtitleTrack } from '@shared/types'

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const theme = {
  colors: {
    bg: '#14151a',
    panel: '#1c1e26',
    panelAlt: '#23252f',
    border: '#2f313d',
    borderLight: '#3a3d4a',
    text: '#e8e9ee',
    textMuted: '#9497a6',
    textFaint: '#6b6e7d',
    accent: '#7c9dff',
    accentMuted: '#3d4a7a',
    success: '#4fd18b',
    warning: '#f2b84b',
    danger: '#f2665e',
    info: '#5bb8e6'
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px'
  },
  font: {
    body: "'Segoe UI', -apple-system, system-ui, sans-serif",
    mono: "'Cascadia Code', 'Consolas', monospace"
  }
} as const

type AppTheme = typeof theme

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends AppTheme {}
}

const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  html, body, #root {
    height: 100%;
    margin: 0;
  }

  body {
    background: ${(p) => p.theme.colors.bg};
    color: ${(p) => p.theme.colors.text};
    font-family: ${(p) => p.theme.font.body};
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }

  input, select, button, textarea {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
  }

  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  ::-webkit-scrollbar-thumb {
    background: ${(p) => p.theme.colors.borderLight};
    border-radius: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
`

// ---------------------------------------------------------------------------
// Primitivas (styled-components genericos reaproveitados pelos componentes)
// ---------------------------------------------------------------------------

const Panel = styled.div`
  background: ${(p) => p.theme.colors.panel};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.lg};
`

const Row = styled.div<{ $gap?: number; $align?: string }>`
  display: flex;
  align-items: ${(p) => p.$align ?? 'center'};
  gap: ${(p) => p.$gap ?? 8}px;
`

const Col = styled.div<{ $gap?: number }>`
  display: flex;
  flex-direction: column;
  gap: ${(p) => p.$gap ?? 8}px;
`

const Label = styled.label`
  font-size: 12px;
  color: ${(p) => p.theme.colors.textMuted};
  white-space: nowrap;
`

const Input = styled.input`
  flex: 1;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 7px 10px;
  color: ${(p) => p.theme.colors.text};
  outline: none;
  min-width: 0;

  &:focus {
    border-color: ${(p) => p.theme.colors.accent};
  }
`

const buttonBase = css`
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 8px 16px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 600;
  transition: filter 0.15s ease, opacity 0.15s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'ghost' }>`
  ${buttonBase}
  ${(p) =>
    p.$variant === 'primary' &&
    css`
      background: ${p.theme.colors.accent};
      color: #10121a;
    `}
  ${(p) =>
    (!p.$variant || p.$variant === 'secondary') &&
    css`
      background: ${p.theme.colors.panelAlt};
      border-color: ${p.theme.colors.border};
      color: ${p.theme.colors.text};
    `}
  ${(p) =>
    p.$variant === 'ghost' &&
    css`
      background: transparent;
      border-color: ${p.theme.colors.border};
      color: ${p.theme.colors.textMuted};
      padding: 6px 12px;
      font-weight: 500;
    `}
`

const SectionTitle = styled.h2`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textFaint};
  margin: 0;
`

// ---------------------------------------------------------------------------
// FolderField
// ---------------------------------------------------------------------------

function FolderField({
  label,
  value,
  onChange,
  width = 190
}: {
  label: string
  value: string
  onChange: (value: string) => void
  width?: number
}) {
  async function browse(): Promise<void> {
    const folder = await window.api.chooseFolder(value || undefined)
    if (folder) onChange(folder)
  }

  return (
    <Row $gap={8}>
      <Label style={{ width, flexShrink: 0 }}>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="C:\..." />
      <Button $variant="secondary" onClick={browse}>
        Procurar...
      </Button>
    </Row>
  )
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<RowStatus, string> = {
  idle: 'Pronto',
  extracting: 'Extraindo...',
  muxing: 'Remuxando...',
  done: 'Concluido',
  error: 'Erro'
}

const Badge = styled.span<{ $status: RowStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  background: ${(p) =>
    ({
      idle: p.theme.colors.panelAlt,
      extracting: 'rgba(91, 184, 230, 0.15)',
      muxing: 'rgba(124, 157, 255, 0.15)',
      done: 'rgba(79, 209, 139, 0.15)',
      error: 'rgba(242, 102, 94, 0.15)'
    })[p.$status]};
  color: ${(p) =>
    ({
      idle: p.theme.colors.textMuted,
      extracting: p.theme.colors.info,
      muxing: p.theme.colors.accent,
      done: p.theme.colors.success,
      error: p.theme.colors.danger
    })[p.$status]};
`

function StatusBadge({ status, title }: { status: RowStatus; title?: string }) {
  return (
    <Badge $status={status} title={title}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// LogPanel
// ---------------------------------------------------------------------------

const LogWrap = styled.div`
  height: 140px;
  overflow-y: auto;
  background: ${(p) => p.theme.colors.panelAlt};
  border-radius: ${(p) => p.theme.radius.md};
  border: 1px solid ${(p) => p.theme.colors.border};
  padding: 8px 12px;
  font-family: ${(p) => p.theme.font.mono};
  font-size: 11.5px;
  line-height: 1.6;
`

const LogLine = styled.div<{ $level: LogEvent['level'] }>`
  color: ${(p) =>
    p.$level === 'error'
      ? p.theme.colors.danger
      : p.$level === 'warn'
        ? p.theme.colors.warning
        : p.theme.colors.textMuted};
  white-space: pre-wrap;
`

function LogPanel({ entries }: { entries: LogEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [entries])

  return (
    <LogWrap ref={ref}>
      {entries.length === 0 && <LogLine $level="info">Aguardando...</LogLine>}
      {entries.map((entry, i) => (
        <LogLine key={i} $level={entry.level}>
          {entry.message}
        </LogLine>
      ))}
    </LogWrap>
  )
}

// ---------------------------------------------------------------------------
// EpisodeTable
// ---------------------------------------------------------------------------

const TableWrap = styled.div`
  flex: 1;
  overflow: auto;
  border-radius: ${(p) => p.theme.radius.md};
  border: 1px solid ${(p) => p.theme.colors.border};
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
`

const Thead = styled.thead`
  position: sticky;
  top: 0;
  z-index: 1;
  background: ${(p) => p.theme.colors.panelAlt};

  th {
    text-align: left;
    padding: 9px 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${(p) => p.theme.colors.textFaint};
    border-bottom: 1px solid ${(p) => p.theme.colors.border};
  }
`

const Tr = styled.tr`
  &:not(:last-child) td {
    border-bottom: 1px solid ${(p) => p.theme.colors.border};
  }
  &:hover td {
    background: ${(p) => p.theme.colors.panelAlt};
  }
`

const Td = styled.td`
  padding: 8px 12px;
  vertical-align: middle;
  color: ${(p) => p.theme.colors.text};
`

const FileName = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
`

const TrackSelect = styled.select`
  width: 100%;
  max-width: 320px;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 5px 6px;
  color: ${(p) => p.theme.colors.text};
`

const PtBrTag = styled.span`
  color: ${(p) => p.theme.colors.success};
  font-weight: 700;
  font-size: 10.5px;
`

const NoSubtitle = styled.span`
  color: ${(p) => p.theme.colors.textFaint};
  font-style: italic;
`

const TimingInput = styled.input`
  width: 110px;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 5px 6px;
  color: ${(p) => p.theme.colors.text};
  font-family: ${(p) => p.theme.font.mono};

  &::placeholder {
    color: ${(p) => p.theme.colors.textFaint};
  }

  &:focus {
    border-color: ${(p) => p.theme.colors.accent};
  }
`

// Mascara de digitacao: conforme o usuario digita numeros, monta
// progressivamente o formato MM:SS,mmm (ex: "0025130" vira "00:25,130").
function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 7)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)},${digits.slice(4)}`
}

function trackLabel(track: SubtitleTrack): string {
  const name = track.trackName ? ` "${track.trackName}"` : ''
  return `#${track.trackId} [${track.language}]${name}`
}

function EpisodeTable({
  rows,
  statuses,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onTrackChange,
  onFirstLineTargetChange
}: {
  rows: EpisodeRow[]
  statuses: Record<string, RowStatus>
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onTrackChange: (rowId: string, trackId: number) => void
  onFirstLineTargetChange: (rowId: string, value: string) => void
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  return (
    <TableWrap>
      <Table>
        <Thead>
          <tr>
            <th style={{ width: 30 }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
            </th>
            <th style={{ width: 90 }}>Episodio</th>
            <th>Arquivo origem</th>
            <th>Faixa de legenda</th>
            <th>Arquivo destino</th>
            <th
              style={{ width: 130 }}
              title='Instante em que a primeira legenda deve aparecer no video de destino, formato MM:SS,mmm (ex: 06:39,566). O resto da legenda e deslocado automaticamente. Deixe vazio para nao ajustar.'
            >
              1a fala em
            </th>
            <th style={{ width: 110 }}>Status</th>
          </tr>
        </Thead>
        <tbody>
          {rows.map((row) => {
            const selectedTrack = row.tracks.find((t) => t.trackId === row.selectedTrackId)
            return (
              <Tr key={row.id}>
                <Td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => onToggleSelect(row.id)}
                  />
                </Td>
                <Td>{row.episodeKey}</Td>
                <Td>
                  <FileName title={row.sourceName}>{row.sourceName}</FileName>
                </Td>
                <Td>
                  {row.tracks.length > 0 ? (
                    <TrackSelect
                      value={row.selectedTrackId ?? ''}
                      onChange={(e) => onTrackChange(row.id, Number(e.target.value))}
                    >
                      {row.tracks.map((t) => (
                        <option key={t.trackId} value={t.trackId}>
                          {trackLabel(t)}
                          {t.isPtBr ? '  ★ PT-BR' : ''}
                        </option>
                      ))}
                    </TrackSelect>
                  ) : (
                    <NoSubtitle>(nenhuma legenda encontrada)</NoSubtitle>
                  )}
                  {selectedTrack?.isPtBr && <PtBrTag> auto-selecionado PT-BR</PtBrTag>}
                </Td>
                <Td>
                  <FileName title={row.destName}>{row.destName}</FileName>
                </Td>
                <Td>
                  <TimingInput
                    type="text"
                    placeholder="06:39,566"
                    value={row.firstLineTargetText}
                    onChange={(e) => onFirstLineTargetChange(row.id, maskTimeInput(e.target.value))}
                    title="Instante (MM:SS,mmm) em que a primeira legenda deve aparecer. Vazio = timing original."
                  />
                </Td>
                <Td>
                  <StatusBadge status={statuses[row.id] ?? 'idle'} />
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </TableWrap>
  )
}

// ---------------------------------------------------------------------------
// App
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

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.textMuted};
  cursor: pointer;
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
    if (!sourceDir || !destDir) {
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
      const result = await window.api.scan(sourceDir, destDir)
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

  function handleTrackChange(rowId: string, trackId: number) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, selectedTrackId: trackId } : r)))
  }

  function handleFirstLineTargetChange(rowId: string, firstLineTargetText: string) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, firstLineTargetText } : r)))
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
    const targets = rows.filter((r) => selectedIds.has(r.id) && r.selectedTrackId !== null)
    if (targets.length === 0) {
      pushLog('Nenhuma linha selecionada com legenda disponivel.', 'error')
      return
    }
    await persistConfig()
    setTransferring(true)
    try {
      const summary = await window.api.transfer({
        rows: targets,
        outputDir: outputDir || destDir,
        removeEnglishAudio
      })
      pushLog(`Concluido: ${summary.success}/${summary.total} com sucesso.`)
    } catch (err) {
      pushLog(`Erro na transferencia: ${(err as Error).message}`, 'error')
    } finally {
      setTransferring(false)
    }
  }

  const progressPct = useMemo(() => {
    const total = selectedIds.size
    if (total === 0) return 0
    const finished = [...selectedIds].filter((id) => statuses[id] === 'done' || statuses[id] === 'error').length
    return Math.round((finished / total) * 100)
  }, [statuses, selectedIds])

  return (
    <Shell>
      <Header>
        <Title>Transfer Sub</Title>
        <MkvStatusText $found={mkvStatus.found}>
          {mkvStatus.found ? `MKVToolNix: ${mkvStatus.mkvmergePath}` : 'MKVToolNix nao localizado'}
        </MkvStatusText>
      </Header>

      <ConfigPanel>
        <FolderField label="Pasta de origem (com legenda)" value={sourceDir} onChange={setSourceDir} />
        <FolderField label="Pasta de destino (sem legenda)" value={destDir} onChange={setDestDir} />
        <FolderField label="Pasta de saida (arquivos finais)" value={outputDir} onChange={setOutputDir} />

        <Row $gap={8}>
          <Label style={{ width: 190, flexShrink: 0 }} />
          <CheckboxLabel>
            <input
              type="checkbox"
              checked={removeEnglishAudio}
              onChange={(e) => setRemoveEnglishAudio(e.target.checked)}
            />
            Remover dublagem em ingles do destino (manter so o audio japones)
          </CheckboxLabel>
        </Row>

        <ToolbarRow>
          <Row $gap={8}>
            <Button $variant="primary" onClick={handleScan} disabled={scanning}>
              {scanning ? 'Escaneando...' : 'Escanear pastas'}
            </Button>
            <Button onClick={handleTransfer} disabled={transferring || rows.length === 0}>
              {transferring ? 'Transferindo...' : 'Transferir selecionados'}
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
        <SectionTitle>Episodios ({rows.length})</SectionTitle>
        <EpisodeTable
          rows={rows}
          statuses={statuses}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onTrackChange={handleTrackChange}
          onFirstLineTargetChange={handleFirstLineTargetChange}
        />
      </Col>

      <Col $gap={6}>
        <SectionTitle>Log</SectionTitle>
        <LogPanel entries={logs} />
      </Col>
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
