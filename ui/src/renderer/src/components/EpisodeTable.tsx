import styled from 'styled-components'
import { ClockCircleFilled, SyncOutlined } from '@ant-design/icons'
import type { EpisodeRow, RowStatus } from '@shared/types'
import { Button, Row } from '../ui/primitives'
import { syncAdjustmentLabel, trackLabel } from '../utils/subtitleDisplay'
import { StatusBadge } from './StatusBadge'

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

const PtBrGuessTag = styled.span`
  color: ${(p) => p.theme.colors.warning};
  font-weight: 700;
  font-size: 10.5px;
`

const SyncStatusIcon = styled(ClockCircleFilled)`
  color: ${(p) => p.theme.colors.accent};
  font-size: 13px;
  flex-shrink: 0;
`

const NoSubtitle = styled.span`
  color: ${(p) => p.theme.colors.textFaint};
  font-style: italic;
`

export function EpisodeTable({
  rows,
  statuses,
  selectedIds,
  cleanOnly,
  onToggleSelect,
  onToggleSelectAll,
  onTrackChange,
  onOpenSync
}: {
  rows: EpisodeRow[]
  statuses: Record<string, RowStatus>
  selectedIds: Set<string>
  cleanOnly: boolean
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onTrackChange: (rowId: string, trackId: number | null) => void
  onOpenSync: (rowId: string) => void
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
            {cleanOnly ? <th>Arquivo</th> : <th>Arquivo origem</th>}
            <th>{cleanOnly ? 'Legenda a manter' : 'Faixa de legenda'}</th>
            {!cleanOnly && <th>Arquivo destino</th>}
            {!cleanOnly && <th style={{ width: 150 }}>Sincronizacao</th>}
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
                      onChange={(e) =>
                        onTrackChange(row.id, e.target.value === '' ? null : Number(e.target.value))
                      }
                    >
                      {cleanOnly && <option value="">Manter todas as legendas</option>}
                      {row.tracks.map((t) => (
                        <option key={t.trackId} value={t.trackId}>
                          {trackLabel(t)}
                          {t.isPtBr ? '  ★ PT-BR' : t.isPtBrGuess ? '  ⚠ pode ser PT-BR' : ''}
                        </option>
                      ))}
                    </TrackSelect>
                  ) : (
                    <NoSubtitle>(nenhuma legenda encontrada)</NoSubtitle>
                  )}
                  {selectedTrack?.isPtBr && <PtBrTag> auto-selecionado PT-BR</PtBrTag>}
                  {!selectedTrack?.isPtBr && selectedTrack?.isPtBrGuess && (
                    <PtBrGuessTag title="Nenhuma faixa foi identificada como PT-BR por idioma/nome, mas o conteudo desta parece portugues - confira antes de transferir">
                      {' '}
                      ⚠ rotulada "{selectedTrack.language}", mas parece PT-BR
                    </PtBrGuessTag>
                  )}
                </Td>
                {!cleanOnly && (
                  <Td>
                    <FileName title={row.destName}>{row.destName}</FileName>
                  </Td>
                )}
                {!cleanOnly && (
                  <Td>
                    <Row $gap={8}>
                      {syncAdjustmentLabel(row) && <SyncStatusIcon title={syncAdjustmentLabel(row)!} />}
                      <Button
                        type="button"
                        $variant="secondary"
                        onClick={() => onOpenSync(row.id)}
                        disabled={row.selectedTrackId === null}
                        title="Ajustar o timing da legenda transferida (sincronizar com a legenda em ingles, definir a 1a fala ou um deslocamento manual)"
                      >
                        <SyncOutlined /> Sincronizar
                      </Button>
                    </Row>
                  </Td>
                )}
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
