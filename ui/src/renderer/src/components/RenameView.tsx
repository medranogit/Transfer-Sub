import styled from 'styled-components'
import { CheckCircleFilled, ClearOutlined, TagOutlined, WarningFilled } from '@ant-design/icons'
import { NOT_AVAILABLE_TAG } from '@shared/types'
import type { LogEvent, RenameFields, RenamePreviewRow } from '@shared/types'
import { Button, Col, Input, Label, Panel, Row, SectionTitle } from '../ui/primitives'
import { EmptyState, Mono, Table, TableWrap, Td, Thead, Tr } from '../ui/Table'
import { SuggestInput } from '../ui/SuggestInput'
import { EpisodeMovieToggle } from '../ui/EpisodeMovieToggle'
import { FolderField } from './FolderField'
import { LogPanel } from './LogPanel'

const ConfigPanel = styled(Panel)`
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const FieldsRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 10px;
`

const Field = styled.div<{ $width?: number }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: ${(p) => (p.$width ? '0 0 auto' : '1')};
  width: ${(p) => (p.$width ? `${p.$width}px` : 'auto')};
`

const Hint = styled.p`
  margin: 0;
  font-size: 11.5px;
  color: ${(p) => p.theme.colors.textMuted};
`

const StatusText = styled.span<{ $ok: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${(p) => (p.$ok ? p.theme.colors.success : p.theme.colors.warning)};
  font-size: 12px;

  svg {
    font-size: 12px;
  }
`

export function RenameView({
  folder,
  onFolderChange,
  fields,
  onFieldsChange,
  fansubPresets,
  onFansubBlur,
  sourcePresets,
  codecPresets,
  resolutionPresets,
  rows,
  scanning,
  renaming,
  renamingTracks,
  onScan,
  onUpdate,
  onApply,
  onRenameTracks,
  logs,
  onClearLog
}: {
  folder: string
  onFolderChange: (value: string) => void
  fields: RenameFields
  onFieldsChange: (next: RenameFields) => void
  fansubPresets: string[]
  onFansubBlur: (value: string) => void
  sourcePresets: string[]
  codecPresets: string[]
  resolutionPresets: string[]
  rows: RenamePreviewRow[]
  scanning: boolean
  renaming: boolean
  renamingTracks: boolean
  onScan: () => void
  onUpdate: () => void
  onApply: () => void
  onRenameTracks: () => void
  logs: LogEvent[]
  onClearLog: () => void
}) {
  const readyCount = rows.filter((r) => r.newName).length
  const mkvCount = rows.filter((r) => /\.(mkv|webm)$/i.test(r.originalName)).length

  return (
    <>
      <ConfigPanel>
        <Row $gap={8}>
          <EpisodeMovieToggle
            movieMode={fields.movieMode}
            onChange={(movieMode) => onFieldsChange({ ...fields, movieMode })}
          />
        </Row>

        <FolderField label="Pasta com os arquivos" value={folder} onChange={onFolderChange} />

        <FieldsRow>
          <Field $width={130}>
            <Label>Fansub</Label>
            <SuggestInput
              value={fields.fansub}
              onChange={(value) => onFieldsChange({ ...fields, fansub: value })}
              options={fansubPresets}
              placeholder="Judas"
              onBlur={(value) => {
                onFansubBlur(value)
                onUpdate()
              }}
            />
          </Field>
          <Field>
            <Label>Nome do anime</Label>
            <Input
              value={fields.animeName}
              onChange={(e) => onFieldsChange({ ...fields, animeName: e.target.value })}
              onBlur={onUpdate}
              placeholder="Black Clover"
            />
          </Field>
          {!fields.movieMode && (
            <Field $width={90}>
              <Label>Temporada</Label>
              <Input
                type="number"
                min={0}
                value={fields.season}
                onChange={(e) => onFieldsChange({ ...fields, season: Number(e.target.value) })}
                onBlur={onUpdate}
              />
            </Field>
          )}
          <Field $width={110}>
            <Label>Fonte</Label>
            <SuggestInput
              value={fields.source}
              onChange={(value) => onFieldsChange({ ...fields, source: value })}
              options={[NOT_AVAILABLE_TAG, ...sourcePresets]}
              placeholder="BD"
              onBlur={onUpdate}
            />
          </Field>
          <Field $width={110}>
            <Label>Codec</Label>
            <SuggestInput
              value={fields.codec}
              onChange={(value) => onFieldsChange({ ...fields, codec: value })}
              options={[NOT_AVAILABLE_TAG, ...codecPresets]}
              placeholder="HEVC"
              onBlur={onUpdate}
            />
          </Field>
          <Field $width={110}>
            <Label>Resolucao</Label>
            <SuggestInput
              value={fields.resolution}
              onChange={(value) => onFieldsChange({ ...fields, resolution: value })}
              options={[NOT_AVAILABLE_TAG, ...resolutionPresets]}
              placeholder="1080p"
              onBlur={onUpdate}
            />
          </Field>
        </FieldsRow>
        <Hint>
          {fields.movieMode ? (
            <>
              Filme: sem numero de episodio. Resultado: <strong>[fansub] nome do filme - fonte codec resolucao</strong>{' '}
              (ex: "[EMBER] Nome do Filme - BD HEVC 1080p").
            </>
          ) : (
            <>
              O episodio e detectado automaticamente em cada arquivo. Resultado:{' '}
              <strong>[fansub] nome do anime - S(temporada)E(episodio) - fonte codec resolucao</strong> (ex: "[Judas]
              Black Clover - S01E02 - BD HEVC 1080p").
            </>
          )}{' '}
          Fansub/nome{fields.movieMode ? '' : '/temporada'}/fonte/codec/resolucao sao sugeridos a cada escaneamento
          da pasta. A extensao do arquivo (.mkv, .ass...) e mantida automaticamente.
        </Hint>

        <Row $gap={8}>
          <Button $variant="primary" onClick={onScan} disabled={scanning || !folder}>
            {scanning ? 'Escaneando...' : 'Escanear pasta'}
          </Button>
          <Button onClick={onApply} disabled={renaming || readyCount === 0}>
            {renaming ? 'Renomeando...' : `Renomear (${readyCount})`}
          </Button>
          <Button
            type="button"
            $variant="secondary"
            onClick={onRenameTracks}
            disabled={renamingTracks || mkvCount === 0}
            title={
              'Nao mexe no nome do arquivo - edita o rotulo da faixa de legenda JA EMBUTIDA em cada .mkv/.webm ' +
              'listado abaixo (rapido, so metadado, sem remuxar o arquivo inteiro). Em cada arquivo: acha a faixa ' +
              'em portugues (pelo idioma/nome da faixa, ou pelo palpite no proprio texto quando nenhuma faixa ' +
              'esta rotulada como PT-BR) e troca o nome dela para o que estiver em Configuracoes > "Nome da faixa ' +
              'de legenda", alem de sempre marcar o idioma da faixa como portugues. Arquivos sem nenhuma faixa ' +
              'reconhecida como PT-BR sao pulados (aparece no log).'
            }
          >
            <TagOutlined /> {renamingTracks ? 'Rotulando...' : `Rotular faixa PT-BR (${mkvCount})`}
          </Button>
        </Row>
      </ConfigPanel>

      <Col $gap={6} style={{ flex: 1, minHeight: 0 }}>
        <SectionTitle>Arquivos ({rows.length})</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState>Escaneie uma pasta para ver a pre-visualizacao dos novos nomes.</EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <th>Nome atual</th>
                  <th>Novo nome</th>
                  <th>Status</th>
                </tr>
              </Thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Mono>{row.originalName}</Mono>
                    </Td>
                    <Td>{row.newName ? <Mono>{row.newName}</Mono> : '-'}</Td>
                    <Td>
                      <StatusText $ok={!!row.newName}>
                        {row.newName ? (
                          <>
                            <CheckCircleFilled /> Pronto
                          </>
                        ) : (
                          <>
                            <WarningFilled /> {row.skipReason}
                          </>
                        )}
                      </StatusText>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Col>

      <Col $gap={6}>
        <Row $gap={12} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionTitle>Log</SectionTitle>
          <Button
            type="button"
            $variant="ghost"
            onClick={onClearLog}
            disabled={logs.length === 0}
            title="Limpar o log desta sessao"
          >
            <ClearOutlined /> Limpar log
          </Button>
        </Row>
        <LogPanel entries={logs} />
      </Col>
    </>
  )
}
