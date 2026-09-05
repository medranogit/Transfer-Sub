// Pagina "Renomeador" - renomeia em lote os videos de uma pasta a partir de
// 3 campos simples (texto inicial, temporada, texto final), pra facilitar
// quando o usuario quer trocar o padrao de nome de uma leva de arquivos sem
// editar um por um. O episodio e detectado automaticamente por arquivo (ver
// domain/renamePattern.ts); a temporada informada vale pra pasta inteira.
// Mesma estrutura de sempre (config -> escanear -> tabela de
// pre-visualizacao -> aplicar -> log).
import styled from 'styled-components'
import { CheckCircleFilled, WarningFilled } from '@ant-design/icons'
import type { LogEvent, RenameFields, RenamePreviewRow } from '@shared/types'
import { Button, Col, Input, Label, Panel, Row, SectionTitle } from '../ui/primitives'
import { EmptyState, Mono, Table, TableWrap, Td, Thead, Tr } from '../ui/Table'
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
  rows,
  scanning,
  renaming,
  onScan,
  onApply,
  logs
}: {
  folder: string
  onFolderChange: (value: string) => void
  fields: RenameFields
  onFieldsChange: (next: RenameFields) => void
  rows: RenamePreviewRow[]
  scanning: boolean
  renaming: boolean
  onScan: () => void
  onApply: () => void
  logs: LogEvent[]
}) {
  const readyCount = rows.filter((r) => r.newName).length

  return (
    <>
      <ConfigPanel>
        <FolderField label="Pasta com os arquivos" value={folder} onChange={onFolderChange} />

        <FieldsRow>
          <Field>
            <Label>Texto inicial</Label>
            <Input
              value={fields.prefixText}
              onChange={(e) => onFieldsChange({ ...fields, prefixText: e.target.value })}
              placeholder="[DKB] Benriya Saitou-san, Isekai ni Iku"
            />
          </Field>
          <Field $width={100}>
            <Label>Temporada</Label>
            <Input
              type="number"
              min={0}
              value={fields.season}
              onChange={(e) => onFieldsChange({ ...fields, season: Number(e.target.value) })}
            />
          </Field>
          <Field>
            <Label>Texto final</Label>
            <Input
              value={fields.suffixText}
              onChange={(e) => onFieldsChange({ ...fields, suffixText: e.target.value })}
              placeholder="BD HEVC 1080P"
            />
          </Field>
        </FieldsRow>
        <Hint>
          O episodio e detectado automaticamente em cada arquivo. Resultado:{' '}
          <strong>texto inicial - S(temporada)E(episodio) - texto final</strong> (ex: "...Iku - S01E01 - BD HEVC
          1080P"). A extensao do arquivo (.mkv, .ass...) e mantida automaticamente.
        </Hint>

        <Row $gap={8}>
          <Button $variant="primary" onClick={onScan} disabled={scanning || !folder}>
            {scanning ? 'Escaneando...' : 'Escanear pasta'}
          </Button>
          <Button onClick={onApply} disabled={renaming || readyCount === 0}>
            {renaming ? 'Renomeando...' : `Renomear (${readyCount})`}
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
        <SectionTitle>Log</SectionTitle>
        <LogPanel entries={logs} />
      </Col>
    </>
  )
}
