import styled from 'styled-components'
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseOutlined,
  CopyOutlined,
  PlusOutlined,
  StarOutlined,
  SyncOutlined
} from '@ant-design/icons'
import type { EpisodeRow, RowStatus } from '@shared/types'
import { Button, Row } from '../ui/primitives'
import { Checkbox } from '../ui/Checkbox'
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
  cursor: pointer;

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
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 260px;
`

const TrackSelect = styled.select`
  flex: 1;
  min-width: 0;
  max-width: 320px;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 5px 6px;
  color: ${(p) => p.theme.colors.text};
`

const PtBrIcon = styled(CheckCircleFilled)`
  color: ${(p) => p.theme.colors.success};
  font-size: 13px;
  flex-shrink: 0;
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

const ArrowCell = styled.td`
  padding: 8px 4px;
  text-align: center;
  color: ${(p) => p.theme.colors.textFaint};
  font-size: 13px;
`

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function EpisodeTable({
  rows,
  statuses,
  selectedIds,
  cleanOnly,
  onToggleSelect,
  onToggleSelectAll,
  onTrackChange,
  onOpenSync,
  onApplyTrackToAll,
  onSelectPtBrForAll,
  onExternalSubtitleChange
}: {
  rows: EpisodeRow[]
  statuses: Record<string, RowStatus>
  selectedIds: Set<string>
  cleanOnly: boolean
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onTrackChange: (rowId: string, trackId: number | null) => void
  onOpenSync: (rowId: string) => void
  onApplyTrackToAll?: () => void
  onSelectPtBrForAll?: () => void
  onExternalSubtitleChange: (rowId: string, path: string | null) => void
}) {
  async function handlePickExternalSubtitle(rowId: string): Promise<void> {
    const path = await window.api.chooseSubtitleFile()
    if (path) onExternalSubtitleChange(rowId, path)
  }
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  return (
    <TableWrap>
      <Table>
        <Thead>
          <tr>
            <th style={{ width: 30 }}>
              <Checkbox checked={allSelected} onChange={onToggleSelectAll} title="Selecionar todos" />
            </th>
            <th style={{ width: 90 }}>Episodio</th>
            <th style={{ width: 175 }}>Sincronizacao</th>
            <th>
              <Row $gap={8} style={{ alignItems: 'center' }}>
                <span>{cleanOnly ? 'Limpeza' : 'Faixa de legenda'}</span>
                {cleanOnly && rows.length > 1 && onApplyTrackToAll && (
                  <Button
                    type="button"
                    $variant="ghost"
                    onClick={onApplyTrackToAll}
                    title="Aplica a faixa selecionada na 1a linha para todas as outras (so onde ela existir)"
                    style={{ textTransform: 'none', fontWeight: 400, padding: '2px 8px' }}
                  >
                    <CopyOutlined /> Aplicar a todos
                  </Button>
                )}
                {cleanOnly && rows.length > 1 && onSelectPtBrForAll && (
                  <Button
                    type="button"
                    $variant="ghost"
                    onClick={onSelectPtBrForAll}
                    title="Em cada linha, seleciona a faixa identificada como PT-BR (idioma/nome ou palpite pelo texto), sem mexer nas linhas onde nenhuma foi identificada"
                    style={{ textTransform: 'none', fontWeight: 400, padding: '2px 8px' }}
                  >
                    <StarOutlined /> Selecionar PT-BR
                  </Button>
                )}
              </Row>
            </th>
            {cleanOnly ? <th>Arquivo</th> : <th>Arquivo origem</th>}
            {cleanOnly && <th style={{ width: 170 }}>Legenda externa</th>}
            {!cleanOnly && <th style={{ width: 24 }} />}
            {!cleanOnly && <th>Arquivo destino</th>}
            <th style={{ width: 110 }}>Status</th>
          </tr>
        </Thead>
        <tbody>
          {rows.map((row) => {
            const selectedTrack = row.tracks.find((t) => t.trackId === row.selectedTrackId)
            return (
              <Tr key={row.id} onClick={() => onToggleSelect(row.id)}>
                <Td>
                  <Checkbox checked={selectedIds.has(row.id)} onChange={() => onToggleSelect(row.id)} />
                </Td>
                <Td>{row.episodeKey}</Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <Row $gap={6} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    {syncAdjustmentLabel(row) && <SyncStatusIcon title={syncAdjustmentLabel(row)!} />}
                    <Button
                      type="button"
                      $variant={row.syncPoints && row.syncPoints.length > 0 ? 'primary' : 'secondary'}
                      onClick={() => onOpenSync(row.id)}
                      disabled={
                        cleanOnly
                          ? row.tracks.length < 2 && !row.externalSubtitlePath
                          : row.selectedTrackId === null
                      }
                      title="Ajustar o timing de uma legenda (sincronizar com outra faixa, definir a 1a fala ou um deslocamento manual)"
                    >
                      <SyncOutlined /> Sincronizar
                    </Button>
                    {syncAdjustmentLabel(row) && (
                      <span
                        style={{
                          fontSize: 10.5,
                          color: row.syncPoints && row.syncPoints.length > 0 ? '#38bdf8' : undefined,
                          opacity: row.syncPoints && row.syncPoints.length > 0 ? 1 : 0.8,
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={syncAdjustmentLabel(row)!}
                      >
                        {syncAdjustmentLabel(row)}
                      </span>
                    )}
                  </Row>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <Row $gap={6} style={{ flexWrap: 'wrap' }}>
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
                            {t.isDefault ? '  📌 padrao' : ''}
                          </option>
                        ))}
                      </TrackSelect>
                    ) : (
                      <NoSubtitle>(nenhuma legenda encontrada)</NoSubtitle>
                    )}
                    {selectedTrack?.isPtBr && (
                      <PtBrIcon title="Faixa em PT-BR (idioma/nome reconhecido) selecionada automaticamente" />
                    )}
                    {!selectedTrack?.isPtBr && selectedTrack?.isPtBrGuess && (
                      <PtBrGuessTag title="Nenhuma faixa foi identificada como PT-BR por idioma/nome, mas o conteudo desta parece portugues - confira antes de transferir">
                        ⚠ rotulada "{selectedTrack.language}", mas parece PT-BR
                      </PtBrGuessTag>
                    )}
                  </Row>
                </Td>
                <Td>
                  <FileName title={row.sourceName}>{row.sourceName}</FileName>
                </Td>
                {cleanOnly && (
                  <Td onClick={(e) => e.stopPropagation()}>
                    <Row $gap={6} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        $variant="secondary"
                        onClick={() => handlePickExternalSubtitle(row.id)}
                        title={row.externalSubtitlePath ?? 'Anexar um arquivo .ass/.srt a este video'}
                      >
                        <PlusOutlined /> {row.externalSubtitlePath ? fileNameOf(row.externalSubtitlePath) : 'Adicionar legenda'}
                      </Button>
                      {row.externalSubtitlePath && (
                        <Button
                          type="button"
                          $variant="ghost"
                          onClick={() => onExternalSubtitleChange(row.id, null)}
                          title="Remover legenda externa"
                        >
                          <CloseOutlined />
                        </Button>
                      )}
                    </Row>
                  </Td>
                )}
                {!cleanOnly && (
                  <ArrowCell>
                    <ArrowRightOutlined />
                  </ArrowCell>
                )}
                {!cleanOnly && (
                  <Td>
                    <FileName title={row.destName}>{row.destName}</FileName>
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
