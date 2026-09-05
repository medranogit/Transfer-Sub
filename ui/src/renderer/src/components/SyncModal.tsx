// Auto-sync manual: duas colunas com as falas (ingles do destino e ptbr da
// origem), cada uma com scroll proprio. Clica numa fala de cada lado pra
// marcar o par "mesma fala nos dois idiomas" e calcular o deslocamento em
// ms. Tambem reune os dois campos manuais (1a fala / atraso-adiantamento)
// que ate entao viviam na tabela.
import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { EpisodeRow, SubtitleEvent, SubtitleTrack } from '@shared/types'
import { theme } from '../theme'
import { Button, Col, Label, Panel, Row } from '../ui/primitives'
import { formatEventTime, maskOffsetInput, maskTimeInput, trackLabel } from '../utils/subtitleDisplay'

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

const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: ${(p) => p.theme.colors.textMuted};
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

export function SyncModal({
  row,
  onClose,
  onApply,
  onFirstLineTargetChange,
  onManualOffsetChange,
  preferredEnTrackId,
  onEnTrackChosen
}: {
  row: EpisodeRow
  onClose: () => void
  onApply: (offsetMs: number) => void
  onFirstLineTargetChange: (value: string) => void
  onManualOffsetChange: (value: string) => void
  preferredEnTrackId: number | null
  onEnTrackChosen: (trackId: number) => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ptEvents, setPtEvents] = useState<SubtitleEvent[]>([])
  const [destTracks, setDestTracks] = useState<SubtitleTrack[]>([])
  const [enTrackId, setEnTrackId] = useState<number | null>(null)
  const [enEvents, setEnEvents] = useState<SubtitleEvent[]>([])
  const [loadingEnEvents, setLoadingEnEvents] = useState(false)
  const [selectedEnIndex, setSelectedEnIndex] = useState<number | null>(null)
  const [selectedPtIndex, setSelectedPtIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api
      .prepareSync(row.sourcePath, row.selectedTrackId as number, row.destPath)
      .then(async (result) => {
        if (cancelled) return
        setPtEvents(result.ptEvents)
        setDestTracks(result.destTracks)
        // Preferir a faixa em ingles escolhida manualmente num episodio anterior
        // (mesma temporada normalmente mantem a mesma estrutura de faixas) - so
        // cai pro palpite automatico se essa faixa nao existir neste episodio.
        const preferred =
          preferredEnTrackId !== null && result.destTracks.some((t) => t.trackId === preferredEnTrackId)
            ? preferredEnTrackId
            : result.suggestedEnTrackId
        setEnTrackId(preferred)
        if (preferred !== null) {
          const events = await window.api.getTrackEvents(row.destPath, preferred)
          if (!cancelled) setEnEvents(events)
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id])

  function handleEnTrackChange(trackId: number) {
    setEnTrackId(trackId)
    onEnTrackChosen(trackId)
    setSelectedEnIndex(null)
    setLoadingEnEvents(true)
    window.api
      .getTrackEvents(row.destPath, trackId)
      .then(setEnEvents)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingEnEvents(false))
  }

  const selectedEn = selectedEnIndex !== null ? enEvents[selectedEnIndex] : null
  const selectedPt = selectedPtIndex !== null ? ptEvents[selectedPtIndex] : null
  const offsetMs = selectedEn && selectedPt ? selectedEn.startMs - selectedPt.startMs : null

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
            O arquivo de destino nao tem nenhuma legenda para usar como referencia - nao e possivel
            sincronizar automaticamente neste episodio. Use os campos acima.
          </div>
        )}

        {!loading && !error && destTracks.length > 0 && (
          <>
            <FieldRow>
              Legenda em ingles (destino):
              <Select value={enTrackId ?? ''} onChange={(e) => handleEnTrackChange(Number(e.target.value))}>
                {enTrackId === null && <option value="">Selecione a faixa...</option>}
                {destTracks.map((t) => (
                  <option key={t.trackId} value={t.trackId}>
                    {trackLabel(t)}
                  </option>
                ))}
              </Select>
              {enTrackId === null && (
                <span style={{ color: theme.colors.warning }}>Nao detectei automaticamente - escolha a faixa</span>
              )}
            </FieldRow>

            <ColumnsRow>
              <Column>
                <ColumnHeader $accent={theme.colors.info}>Ingles ({enEvents.length})</ColumnHeader>
                <ColumnList>
                  {loadingEnEvents && <div style={{ padding: 10 }}>Carregando...</div>}
                  {!loadingEnEvents &&
                    enEvents.map((evt, i) => (
                      <ColumnItem
                        key={i}
                        type="button"
                        $selected={selectedEnIndex === i}
                        $accent={theme.colors.info}
                        onClick={() => setSelectedEnIndex(i)}
                      >
                        <ItemTime>{formatEventTime(evt.startMs)}</ItemTime>
                        <span>{evt.text}</span>
                      </ColumnItem>
                    ))}
                </ColumnList>
              </Column>

              <Column>
                <ColumnHeader $accent={theme.colors.success}>PT-BR ({ptEvents.length})</ColumnHeader>
                <ColumnList>
                  {ptEvents.map((evt, i) => (
                    <ColumnItem
                      key={i}
                      type="button"
                      $selected={selectedPtIndex === i}
                      $accent={theme.colors.success}
                      onClick={() => setSelectedPtIndex(i)}
                    >
                      <ItemTime>{formatEventTime(evt.startMs)}</ItemTime>
                      <span>{evt.text}</span>
                    </ColumnItem>
                  ))}
                </ColumnList>
              </Column>
            </ColumnsRow>

            <OffsetPreview>
              {offsetMs !== null
                ? `Deslocamento calculado: ${offsetMs > 0 ? '+' : ''}${offsetMs}ms (${
                    offsetMs > 0 ? 'atrasa' : offsetMs < 0 ? 'adianta' : 'sem ajuste'
                  } a legenda)`
                : 'Selecione uma fala em cada coluna para calcular o deslocamento'}
            </OffsetPreview>
          </>
        )}

        {!loading && !error && destTracks.length > 0 && (
          <ModalFooter>
            <Button
              $variant="primary"
              disabled={offsetMs === null}
              onClick={() => offsetMs !== null && onApply(offsetMs)}
            >
              Usar este deslocamento
            </Button>
          </ModalFooter>
        )}
      </ModalBox>
    </Overlay>
  )
}
