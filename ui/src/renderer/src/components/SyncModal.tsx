import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { EXTERNAL_SUBTITLE_TRACK_ID } from '@shared/types'
import type { EpisodeRow, SubtitleEvent, SubtitleTrack } from '@shared/types'
import { theme } from '../theme'
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
  height: 360px;
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
  text-align: center;
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
  onFirstLineTargetChange,
  onManualOffsetChange,
  preferredEnTrackId,
  onEnTrackChosen,
  onError
}: {
  row: EpisodeRow
  cleanOnly: boolean
  onClose: () => void
  onApply: (offsetMs: number, syncTrackId: number) => void
  onFirstLineTargetChange: (value: string) => void
  onManualOffsetChange: (value: string) => void
  preferredEnTrackId: number | null
  onEnTrackChosen: (trackId: number) => void
  onError: (message: string) => void
}) {
  const [loading, setLoading] = useState(true)
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

  useEscapeToClose(onClose)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const initialPtTrackId = cleanOnly ? defaultPtTrackId(row) : (row.selectedTrackId as number)
    setPtTrackId(initialPtTrackId)
    if (initialPtTrackId === null) {
      setError('Nenhuma faixa de legenda disponivel neste arquivo.')
      setLoading(false)
      return
    }
    const usingExternal = initialPtTrackId === EXTERNAL_SUBTITLE_TRACK_ID && row.externalSubtitlePath
    Promise.all([
      window.api.prepareSync(row.sourcePath, initialPtTrackId, row.destPath, preferredEnTrackId),
      usingExternal ? window.api.getExternalSubtitleEvents(row.externalSubtitlePath!) : null
    ])
      .then(([result, externalPtEvents]) => {
        if (cancelled) return
        setPtEvents(externalPtEvents ?? result.ptEvents)
        setDestTracks(result.destTracks)
        setEnTrackId(result.chosenEnTrackId)
        setEnEvents(result.enEvents)
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
  }, [row.id])

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

        {loading && <div>Carregando falas...</div>}
        {error && <div style={{ color: theme.colors.danger }}>{error}</div>}

        {!loading && !error && destTracks.length === 0 && (
          <div style={{ color: theme.colors.warning }}>
            Este arquivo nao tem nenhuma outra legenda para usar como referencia - nao e possivel
            sincronizar automaticamente. Use os campos acima.
          </div>
        )}

        {!loading && !error && destTracks.length > 0 && (
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
              <OffsetPreview>
                {offsetMs !== null
                  ? `Deslocamento calculado: ${offsetMs > 0 ? '+' : ''}${offsetMs}ms (${
                      offsetMs > 0 ? 'atrasa' : offsetMs < 0 ? 'adianta' : 'sem ajuste'
                    } a legenda)`
                  : 'Selecione uma fala em cada coluna para calcular o deslocamento'}
              </OffsetPreview>
            )}
          </>
        )}

        {!loading && !error && destTracks.length > 0 && (
          <ModalFooter>
            <Button
              $variant="primary"
              disabled={offsetMs === null || ptTrackId === null}
              onClick={() => offsetMs !== null && ptTrackId !== null && onApply(offsetMs, ptTrackId)}
            >
              Usar este deslocamento
            </Button>
          </ModalFooter>
        )}
      </ModalBox>
    </Overlay>
  )
}
