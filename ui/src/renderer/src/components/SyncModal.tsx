import { useEffect, useState } from 'react'
import styled, { useTheme } from 'styled-components'
import {
  ClearOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined
} from '@ant-design/icons'
import { EXTERNAL_SUBTITLE_TRACK_ID } from '@shared/types'
import type { EpisodeRow, SubtitleEvent, SubtitleTrack, SyncMode, SyncPoint } from '@shared/types'
import { Button, Col, Label, Panel, Row } from '../ui/primitives'
import {
  canSyncTrack,
  formatEventTime,
  maskOffsetInput,
  maskTimeInput,
  trackLabel
} from '../utils/subtitleDisplay'
import { useEscapeToClose } from '../utils/useEscapeToClose'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`

const ModalBox = styled(Panel)`
  width: min(900px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
`

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const ModalTitle = styled.h3`
  font-size: 14px;
  font-weight: 700;
  margin: 0;
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

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const Select = styled.select`
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 5px 8px;
  color: ${(p) => p.theme.colors.text};
  flex: 1;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const ColumnsRow = styled.div`
  display: flex;
  gap: 12px;
  min-height: 0;
`

const Column = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const ColumnHeader = styled.div<{ $accent: string }>`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${(p) => p.$accent};
`

const FilterInput = styled.input`
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 5px 8px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.text};

  &::placeholder {
    color: ${(p) => p.theme.colors.textFaint};
  }

  &:focus {
    border-color: ${(p) => p.theme.colors.accent};
  }
`

const ColumnList = styled.div`
  height: 250px;
  overflow-y: auto;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.md};
  background: ${(p) => p.theme.colors.panelAlt};
`

const ColumnItem = styled.button<{ $selected: boolean; $accent: string }>`
  display: flex;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border: none;
  border-left: 3px solid ${(p) => (p.$selected ? p.$accent : 'transparent')};
  background: ${(p) => (p.$selected ? `color-mix(in srgb, ${p.$accent} 16%, transparent)` : 'transparent')};
  color: ${(p) => (p.$selected ? p.theme.colors.text : p.theme.colors.textMuted)};
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;

  &:hover {
    background: ${(p) =>
      p.$selected ? `color-mix(in srgb, ${p.$accent} 22%, transparent)` : p.theme.colors.panel};
  }
`

const ItemTime = styled.span`
  flex-shrink: 0;
  font-family: ${(p) => p.theme.font.mono};
  font-size: 10.5px;
  color: ${(p) => p.theme.colors.textFaint};
  padding-top: 1px;
`

const SubtitleThumb = styled.img`
  max-width: 100%;
  max-height: 60px;
  background: #000;
  border-radius: 2px;
`

const OffsetPreview = styled.div`
  font-size: 12.5px;
  color: ${(p) => p.theme.colors.text};
`

const PointsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.md};
`

const PointsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`

const PointsTitle = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
  display: flex;
  align-items: center;
  gap: 6px;
`

const ModeToggleRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`

const ModeButton = styled.button<{ $active: boolean }>`
  border: 1px solid ${(p) => (p.$active ? p.theme.colors.accent : p.theme.colors.border)};
  background: ${(p) => (p.$active ? `color-mix(in srgb, ${p.theme.colors.accent} 20%, transparent)` : 'transparent')};
  color: ${(p) => (p.$active ? p.theme.colors.text : p.theme.colors.textMuted)};
  padding: 3px 8px;
  border-radius: ${(p) => p.theme.radius.sm};
  font-size: 11px;
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${(p) => p.theme.colors.accent};
  }
`

const PointsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 120px;
  overflow-y: auto;
  padding-right: 4px;
`

const PointItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  background: ${(p) => p.theme.colors.panel};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  font-size: 11.5px;
`

const PointInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
`

const PointBadge = styled.span<{ $positive?: boolean }>`
  font-family: ${(p) => p.theme.font.mono};
  font-weight: 700;
  color: ${(p) => (p.$positive ? p.theme.colors.warning : p.theme.colors.accent)};
  background: ${(p) =>
    p.$positive
      ? `color-mix(in srgb, ${p.theme.colors.warning} 15%, transparent)`
      : `color-mix(in srgb, ${p.theme.colors.accent} 15%, transparent)`};
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  flex-shrink: 0;
`

const PointTime = styled.span`
  font-family: ${(p) => p.theme.font.mono};
  font-size: 11px;
  color: ${(p) => p.theme.colors.textFaint};
  flex-shrink: 0;
`

const PointText = styled.span`
  color: ${(p) => p.theme.colors.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
`

const DeletePointBtn = styled.button`
  background: transparent;
  border: none;
  color: ${(p) => p.theme.colors.textFaint};
  cursor: pointer;
  padding: 2px 4px;
  border-radius: ${(p) => p.theme.radius.sm};
  display: flex;
  align-items: center;
  font-size: 12px;

  &:hover {
    color: ${(p) => p.theme.colors.danger};
    background: ${(p) => `color-mix(in srgb, ${p.theme.colors.danger} 15%, transparent)`};
  }
`

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function defaultPtTrackId(row: EpisodeRow): number | null {
  return (
    row.syncTrackId ??
    row.tracks.find((t) => t.isPtBr)?.trackId ??
    row.tracks.find((t) => t.isPtBrGuess)?.trackId ??
    row.selectedTrackId ??
    row.tracks[0]?.trackId ??
    null
  )
}

export function SyncModal({
  row,
  cleanOnly,
  onClose,
  onApply,
  onApplyMultiPoint,
  onFirstLineTargetChange,
  onManualOffsetChange,
  preferredEnTrackId,
  onEnTrackChosen,
  onError
}: {
  row: EpisodeRow
  cleanOnly: boolean
  onClose: () => void
  onApply: (
    offsetMs: number,
    syncTrackId: number,
    details?: {
      sourceMs: number
      targetMs: number
      sourceText?: string
      targetText?: string
    }
  ) => void
  onApplyMultiPoint?: (points: SyncPoint[], mode: SyncMode, syncTrackId: number) => void
  onFirstLineTargetChange: (value: string) => void
  onManualOffsetChange: (value: string) => void
  preferredEnTrackId: number | null
  onEnTrackChosen: (trackId: number) => void
  onError: (message: string) => void
}) {
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ptTrackId, setPtTrackId] = useState<number | null>(null)
  const [ptEvents, setPtEvents] = useState<SubtitleEvent[]>([])
  const [destTracks, setDestTracks] = useState<SubtitleTrack[]>([])
  const [enTrackId, setEnTrackId] = useState<number | null>(null)
  const [enEvents, setEnEvents] = useState<SubtitleEvent[]>([])
  const [loadingEnEvents, setLoadingEnEvents] = useState(false)
  const [selectedEnIndex, setSelectedEnIndex] = useState<number | null>(null)
  const [selectedPtIndex, setSelectedPtIndex] = useState<number | null>(null)
  const [enFilterInput, setEnFilterInput] = useState('')
  const [enFilter, setEnFilter] = useState('')
  const [ptFilterInput, setPtFilterInput] = useState('')
  const [ptFilter, setPtFilter] = useState('')

  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>(row.syncPoints ? [...row.syncPoints] : [])
  const [syncMode, setSyncMode] = useState<SyncMode>(row.syncMode ?? 'step')

  useEscapeToClose(onClose)

  useEffect(() => {
    setLoading(false)
    setLoaded(false)
    setError(null)
    setPtEvents([])
    setDestTracks([])
    setEnTrackId(null)
    setEnEvents([])
    setSelectedEnIndex(null)
    setSelectedPtIndex(null)
    setSyncPoints(row.syncPoints ? [...row.syncPoints] : [])
    setSyncMode(row.syncMode ?? 'step')
    const initialPtTrackId = cleanOnly ? defaultPtTrackId(row) : (row.selectedTrackId as number)
    setPtTrackId(initialPtTrackId)
    if (initialPtTrackId === null) {
      setError('Nenhuma faixa de legenda disponivel neste arquivo.')
    }
  }, [row.id])

  function handleAddPoint() {
    if (!selectedEn || !selectedPt || offsetMs === null) return
    const newPoint: SyncPoint = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sourceMs: selectedPt.startMs,
      targetMs: selectedEn.startMs,
      offsetMs,
      sourceText: selectedPt.text,
      targetText: selectedEn.text
    }
    setSyncPoints((prev) => {
      const filtered = prev.filter((p) => p.sourceMs !== newPoint.sourceMs)
      return [...filtered, newPoint].sort((a, b) => a.sourceMs - b.sourceMs)
    })
  }

  function handleRemovePoint(id: string) {
    setSyncPoints((prev) => prev.filter((p) => p.id !== id))
  }

  function handleClearAllPoints() {
    setSyncPoints([])
  }

  function loadFalas() {
    if (ptTrackId === null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const usingExternal = ptTrackId === EXTERNAL_SUBTITLE_TRACK_ID && row.externalSubtitlePath
    Promise.all([
      window.api.prepareSync(row.sourcePath, ptTrackId, row.destPath, preferredEnTrackId),
      usingExternal ? window.api.getExternalSubtitleEvents(row.externalSubtitlePath!) : null
    ])
      .then(([result, externalPtEvents]) => {
        if (cancelled) return
        setPtEvents(externalPtEvents ?? result.ptEvents)
        setDestTracks(result.destTracks)
        setEnTrackId(result.chosenEnTrackId)
        setEnEvents(result.enEvents)
        setLoaded(true)
      })
      .catch((err) => {
        const message = (err as Error).message
        if (!cancelled) setError(message)
        onError(`[${row.episodeKey}] falha ao preparar sincronizacao: ${message}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }

  function handleEnTrackChange(trackId: number) {
    setEnTrackId(trackId)
    onEnTrackChosen(trackId)
    setSelectedEnIndex(null)
    setLoadingEnEvents(true)
    window.api
      .getTrackEvents(row.destPath, trackId)
      .then(setEnEvents)
      .catch((err) => {
        const message = (err as Error).message
        setError(message)
        onError(`[${row.episodeKey}] falha ao carregar falas da faixa: ${message}`)
      })
      .finally(() => setLoadingEnEvents(false))
  }

  function handlePtTrackChange(trackId: number) {
    setPtTrackId(trackId)
    setSelectedPtIndex(null)
    const promise =
      trackId === EXTERNAL_SUBTITLE_TRACK_ID && row.externalSubtitlePath
        ? window.api.getExternalSubtitleEvents(row.externalSubtitlePath)
        : window.api.getTrackEvents(row.sourcePath, trackId)
    promise
      .then(setPtEvents)
      .catch((err) => {
        const message = (err as Error).message
        setError(message)
        onError(`[${row.episodeKey}] falha ao carregar falas da faixa: ${message}`)
      })
  }

  const selectedEn = selectedEnIndex !== null ? enEvents[selectedEnIndex] : null
  const selectedPt = selectedPtIndex !== null ? ptEvents[selectedPtIndex] : null
  const offsetMs = selectedEn && selectedPt ? selectedEn.startMs - selectedPt.startMs : null

  function filterEvents(events: SubtitleEvent[], filter: string): { evt: SubtitleEvent; i: number }[] {
    const needle = filter.trim().toLowerCase()
    return events
      .map((evt, i) => ({ evt, i }))
      .filter(({ evt }) => !needle || evt.text.toLowerCase().includes(needle))
  }

  const enEventsFiltered = filterEvents(enEvents, enFilter)
  const ptEventsFiltered = filterEvents(ptEvents, ptFilter)

  const enTrack = destTracks.find((t) => t.trackId === enTrackId)
  const enTrackUnsupported = enTrack !== undefined && !canSyncTrack(enTrack.codecId)
  const ptTrack = row.tracks.find((t) => t.trackId === ptTrackId)
  const ptTrackUnsupported = ptTrack !== undefined && !canSyncTrack(ptTrack.codecId)
  const anyTrackUnsupported = enTrackUnsupported || ptTrackUnsupported

  return (
    <Overlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Sincronizar legenda - {row.episodeKey}</ModalTitle>
          <Button $variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </ModalHeader>

        {row.syncPoints && row.syncPoints.length > 0 && (
          <Row
            $gap={8}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              background: 'color-mix(in srgb, #38bdf8 12%, transparent)',
              border: '1px solid color-mix(in srgb, #38bdf8 30%, transparent)',
              alignItems: 'center',
              fontSize: 12,
              color: '#38bdf8'
            }}
          >
            <InfoCircleOutlined />
            <span>
              Sincronização multiponto ativa ({row.syncPoints.length} pontos, modo{' '}
              {row.syncMode === 'linear' ? 'linear' : 'degrau'}). Os campos de 1a fala e atraso único são ignorados enquanto houver pontos.
            </span>
          </Row>
        )}

        <Row $gap={20}>
          <Col $gap={4}>
            <Label>1a fala em</Label>
            <TimingInput
              type="text"
              placeholder="06:39,566"
              value={row.firstLineTargetText}
              disabled={row.manualOffsetText !== ''}
              onChange={(e) => onFirstLineTargetChange(maskTimeInput(e.target.value))}
              title="Instante (MM:SS,mmm) em que a primeira legenda deve aparecer. Vazio = timing original."
            />
          </Col>
          <Col $gap={4}>
            <Label>Atraso/adiant. (ms)</Label>
            <TimingInput
              type="text"
              placeholder="500 ou -500"
              value={row.manualOffsetText}
              disabled={row.firstLineTargetText !== ''}
              onChange={(e) => onManualOffsetChange(maskOffsetInput(e.target.value))}
              title='Desloca a legenda em ms: positivo atrasa, "-" na frente adianta. Vazio = sem deslocamento manual.'
            />
          </Col>
        </Row>

        {error && <div style={{ color: theme.colors.danger }}>{error}</div>}

        {!loaded && !error && ptTrackId !== null && (
          <Col $gap={8}>
            <div style={{ color: theme.colors.textMuted, fontSize: 12.5 }}>
              As falas so sao carregadas quando voce pedir - se for so definir um deslocamento manual
              acima, pode fechar sem carregar.
            </div>
            <Row>
              <Button $variant="primary" onClick={loadFalas} disabled={loading}>
                {loading ? 'Carregando falas...' : 'Carregar falas para sincronizar'}
              </Button>
            </Row>
          </Col>
        )}

        {loaded && !error && destTracks.length === 0 && (
          <div style={{ color: theme.colors.warning }}>
            Este arquivo nao tem nenhuma outra legenda para usar como referencia - nao e possivel
            sincronizar automaticamente. Use os campos acima.
          </div>
        )}

        {loaded && !error && destTracks.length > 0 && (
          <>
            {enTrackId === null && (
              <span style={{ color: theme.colors.warning }}>Nao detectei automaticamente - escolha a faixa</span>
            )}

            <ColumnsRow>
              <Column>
                <ColumnHeader $accent={theme.colors.info}>
                  Legenda base ({enFilter ? `${enEventsFiltered.length}/${enEvents.length}` : enEvents.length})
                </ColumnHeader>
                <Select value={enTrackId ?? ''} onChange={(e) => handleEnTrackChange(Number(e.target.value))}>
                  {enTrackId === null && <option value="">Selecione a faixa...</option>}
                  {destTracks.map((t) => (
                    <option key={t.trackId} value={t.trackId}>
                      {trackLabel(t)}
                    </option>
                  ))}
                </Select>
                {enTrackUnsupported ? (
                  <div style={{ color: theme.colors.warning }}>
                    Legenda de imagem em formato ainda nao suportado (VobSub) - escolha outra faixa
                    (PGS e suportado).
                  </div>
                ) : (
                  <>
                    <FilterInput
                      type="text"
                      placeholder="Filtrar (Enter para pesquisar)..."
                      value={enFilterInput}
                      onChange={(e) => setEnFilterInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEnFilter(enFilterInput)
                      }}
                    />
                    <ColumnList>
                      {loadingEnEvents && <div style={{ padding: 10 }}>Carregando...</div>}
                      {!loadingEnEvents &&
                        enEventsFiltered.map(({ evt, i }) => (
                          <ColumnItem
                            key={i}
                            type="button"
                            $selected={selectedEnIndex === i}
                            $accent={theme.colors.info}
                            onClick={() => setSelectedEnIndex(i)}
                          >
                            <ItemTime>{formatEventTime(evt.startMs)}</ItemTime>
                            {evt.imageDataUrl ? (
                              <SubtitleThumb src={evt.imageDataUrl} alt="" />
                            ) : (
                              <span>{evt.text}</span>
                            )}
                          </ColumnItem>
                        ))}
                    </ColumnList>
                  </>
                )}
              </Column>

              <Column>
                <ColumnHeader $accent={theme.colors.success}>
                  Legenda destino ({ptFilter ? `${ptEventsFiltered.length}/${ptEvents.length}` : ptEvents.length})
                </ColumnHeader>
                <Select
                  value={ptTrackId ?? ''}
                  disabled={!cleanOnly}
                  onChange={(e) => handlePtTrackChange(Number(e.target.value))}
                >
                  {row.externalSubtitlePath && (
                    <option value={EXTERNAL_SUBTITLE_TRACK_ID}>
                      Legenda externa adicionada ({fileNameOf(row.externalSubtitlePath)})
                    </option>
                  )}
                  {row.tracks.map((t) => (
                    <option key={t.trackId} value={t.trackId}>
                      {trackLabel(t)}
                    </option>
                  ))}
                </Select>
                {ptTrackUnsupported ? (
                  <div style={{ color: theme.colors.warning }}>
                    Legenda de imagem em formato ainda nao suportado (VobSub) - escolha outra faixa
                    (PGS e suportado).
                  </div>
                ) : (
                  <>
                    <FilterInput
                      type="text"
                      placeholder="Filtrar (Enter para pesquisar)..."
                      value={ptFilterInput}
                      onChange={(e) => setPtFilterInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setPtFilter(ptFilterInput)
                      }}
                    />
                    <ColumnList>
                      {ptEventsFiltered.map(({ evt, i }) => (
                        <ColumnItem
                          key={i}
                          type="button"
                          $selected={selectedPtIndex === i}
                          $accent={theme.colors.success}
                          onClick={() => setSelectedPtIndex(i)}
                        >
                          <ItemTime>{formatEventTime(evt.startMs)}</ItemTime>
                          {evt.imageDataUrl ? (
                            <SubtitleThumb src={evt.imageDataUrl} alt="" />
                          ) : (
                            <span>{evt.text}</span>
                          )}
                        </ColumnItem>
                      ))}
                    </ColumnList>
                  </>
                )}
              </Column>
            </ColumnsRow>

            {!anyTrackUnsupported && (
              <Row $gap={12} style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <OffsetPreview>
                  {offsetMs !== null ? (
                    <span>
                      Deslocamento neste ponto:{' '}
                      <strong style={{ color: offsetMs === 0 ? undefined : offsetMs > 0 ? theme.colors.warning : theme.colors.accent }}>
                        {offsetMs > 0 ? '+' : ''}{offsetMs}ms
                      </strong>{' '}
                      ({offsetMs > 0 ? 'atrasa' : offsetMs < 0 ? 'adianta' : 'sem ajuste'} a legenda)
                    </span>
                  ) : (
                    <span style={{ color: theme.colors.textMuted }}>
                      Selecione uma fala em cada coluna para calcular o deslocamento
                    </span>
                  )}
                </OffsetPreview>
                {offsetMs !== null && (
                  <Button
                    type="button"
                    $variant="primary"
                    onClick={handleAddPoint}
                    title="Adicionar o par de falas selecionado como um novo ponto de sincronizacao"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                  >
                    <PlusOutlined /> Adicionar ponto de sincronia
                  </Button>
                )}
              </Row>
            )}

            {syncPoints.length > 0 && (
              <PointsSection>
                <PointsHeader>
                  <PointsTitle>
                    <span>Pontos de sincronia ({syncPoints.length})</span>
                    <span
                      title="No modo Degrau, a cada ponto um novo atraso entra em vigor dali para frente. No modo Linear, o atraso e interpolado gradualmente entre os pontos."
                      style={{ cursor: 'help', color: theme.colors.textFaint }}
                    >
                      <InfoCircleOutlined />
                    </span>
                  </PointsTitle>

                  <ModeToggleRow>
                    <span style={{ fontSize: 11, color: theme.colors.textFaint }}>Modo:</span>
                    <ModeButton
                      type="button"
                      $active={syncMode === 'step'}
                      onClick={() => setSyncMode('step')}
                      title="A partir de cada ponto, o novo atraso entra em vigor fixo (ideal para cortes de comercial e TV vs Blu-ray)"
                    >
                      Degrau (TV vs BD)
                    </ModeButton>
                    <ModeButton
                      type="button"
                      $active={syncMode === 'linear'}
                      onClick={() => setSyncMode('linear')}
                      title="Estica o tempo gradualmente entre os pontos (ideal para diferenca de velocidade/framerate)"
                    >
                      Linear (Esticar)
                    </ModeButton>
                    <Button
                      type="button"
                      $variant="ghost"
                      onClick={handleClearAllPoints}
                      title="Remover todos os pontos adicionados"
                      style={{ fontSize: 11, padding: '2px 6px', color: theme.colors.textFaint }}
                    >
                      <ClearOutlined /> Limpar
                    </Button>
                  </ModeToggleRow>
                </PointsHeader>

                <PointsList>
                  {syncPoints.map((point, idx) => (
                    <PointItem key={point.id}>
                      <PointInfo>
                        <span style={{ fontWeight: 600, color: theme.colors.textFaint, fontSize: 10.5 }}>
                          #{idx + 1}
                        </span>
                        <PointTime title="Momento na legenda de destino">{formatEventTime(point.sourceMs)}</PointTime>
                        <PointBadge $positive={point.offsetMs > 0}>
                          {point.offsetMs > 0 ? `+${point.offsetMs}ms` : `${point.offsetMs}ms`}
                        </PointBadge>
                        <PointText title={point.sourceText}>
                          {point.sourceText ? `"${point.sourceText}"` : '(sem texto)'}
                        </PointText>
                      </PointInfo>
                      <DeletePointBtn
                        type="button"
                        onClick={() => handleRemovePoint(point.id)}
                        title="Remover este ponto"
                      >
                        <DeleteOutlined />
                      </DeletePointBtn>
                    </PointItem>
                  ))}
                </PointsList>
              </PointsSection>
            )}
          </>
        )}

        {loaded && !error && destTracks.length > 0 && (
          <ModalFooter>
            {syncPoints.length > 0 ? (
              <>
                <Button
                  $variant="primary"
                  disabled={ptTrackId === null}
                  onClick={() =>
                    ptTrackId !== null &&
                    onApplyMultiPoint &&
                    onApplyMultiPoint(syncPoints, syncMode, ptTrackId)
                  }
                >
                  Salvar sincronização multiponto ({syncPoints.length} ponto{syncPoints.length > 1 ? 's' : ''})
                </Button>
                {offsetMs !== null && (
                  <Button
                    $variant="secondary"
                    disabled={ptTrackId === null}
                    onClick={() => {
                      if (offsetMs === null || ptTrackId === null) return
                      const details =
                        selectedPt && selectedEn
                          ? {
                              sourceMs: selectedPt.startMs,
                              targetMs: selectedEn.startMs,
                              sourceText: selectedPt.text,
                              targetText: selectedEn.text
                            }
                          : undefined
                      onApply(offsetMs, ptTrackId, details)
                    }}
                    title="Ignorar os pontos e aplicar somente o deslocamento selecionado no par atual para o arquivo todo"
                  >
                    Usar apenas deslocamento único ({offsetMs > 0 ? '+' : ''}{offsetMs}ms)
                  </Button>
                )}
              </>
            ) : (
              <Button
                $variant="primary"
                disabled={offsetMs === null || ptTrackId === null}
                onClick={() => {
                  if (offsetMs === null || ptTrackId === null) return
                  const details =
                    selectedPt && selectedEn
                      ? {
                          sourceMs: selectedPt.startMs,
                          targetMs: selectedEn.startMs,
                          sourceText: selectedPt.text,
                          targetText: selectedEn.text
                        }
                      : undefined
                  onApply(offsetMs, ptTrackId, details)
                }}
              >
                Usar este deslocamento
              </Button>
            )}
          </ModalFooter>
        )}
      </ModalBox>
    </Overlay>
  )
}
