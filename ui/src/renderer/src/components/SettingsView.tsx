// Pagina de configuracoes - MKVToolNix (status + localizar) e como o app
// nomeia o arquivo de saida (assinatura da fansub no inicio + marcacao livre
// no final, uma config por modo). O resto das opcoes, tipo remover audio, e
// por operacao e fica nas paginas de Transferir/Limpeza, nao aqui.
import styled from 'styled-components'
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import type { MkvToolsStatus, NamingConfig } from '@shared/types'
import { Button, Col, Input, Label, Panel, Row, SectionTitle } from '../ui/primitives'
import { Checkbox } from '../ui/Checkbox'
import { TagListEditor } from '../ui/TagListEditor'

const SettingsPanel = styled(Panel)`
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 640px;
`

const StatusRow = styled(Row)<{ $found: boolean }>`
  color: ${(p) => (p.$found ? p.theme.colors.success : p.theme.colors.danger)};
  font-size: 12.5px;

  svg {
    font-size: 14px;
  }
`

const PathText = styled.span`
  font-family: ${(p) => p.theme.font.mono};
  font-size: 11.5px;
  color: ${(p) => p.theme.colors.textMuted};
  word-break: break-all;
`

const ToggleLabel = styled.span`
  font-size: 13px;
  color: ${(p) => p.theme.colors.text};
`

function NamingConfigPanel({
  id,
  title,
  value,
  onChange
}: {
  id: string
  title: string
  value: NamingConfig
  onChange: (next: NamingConfig) => void
}) {
  return (
    <Col $gap={10}>
      <Label>{title}</Label>

      <Row $gap={10}>
        <Checkbox
          checked={value.signatureEnabled}
          onChange={() => onChange({ ...value, signatureEnabled: !value.signatureEnabled })}
        />
        <ToggleLabel>
          Assinar <strong>[TS - Tag]</strong> ao lado da tag da fansub, no inicio do nome
        </ToggleLabel>
      </Row>

      <Row $gap={10}>
        <Checkbox checked={value.tagEnabled} onChange={() => onChange({ ...value, tagEnabled: !value.tagEnabled })} />
        <ToggleLabel>Adicionar uma marcacao no final do nome</ToggleLabel>
      </Row>
      {value.tagEnabled && (
        <Row $gap={8}>
          <Label htmlFor={id}>Palavra</Label>
          <Input
            id={id}
            value={value.tagWord}
            onChange={(e) => onChange({ ...value, tagWord: e.target.value })}
            placeholder="ex: legendado"
          />
        </Row>
      )}
    </Col>
  )
}

export function SettingsView({
  mkvStatus,
  onChooseMkvDir,
  namingTransfer,
  onNamingTransferChange,
  namingClean,
  onNamingCleanChange,
  ptBrTrackName,
  onPtBrTrackNameChange,
  renameFansubPresets,
  onRenameFansubPresetsChange,
  renameTagPresets,
  onRenameTagPresetsChange
}: {
  mkvStatus: MkvToolsStatus
  onChooseMkvDir: () => void
  namingTransfer: NamingConfig
  onNamingTransferChange: (next: NamingConfig) => void
  namingClean: NamingConfig
  onNamingCleanChange: (next: NamingConfig) => void
  ptBrTrackName: string
  onPtBrTrackNameChange: (next: string) => void
  renameFansubPresets: string[]
  onRenameFansubPresetsChange: (next: string[]) => void
  renameTagPresets: string[]
  onRenameTagPresetsChange: (next: string[]) => void
}) {
  return (
    <Col $gap={14}>
      <SettingsPanel>
        <Col $gap={6}>
          <Label>MKVToolNix</Label>
          <StatusRow $gap={8} $found={mkvStatus.found}>
            {mkvStatus.found ? <CheckCircleFilled /> : <CloseCircleFilled />}
            {mkvStatus.found ? 'Instalacao localizada' : 'Nao localizado'}
          </StatusRow>
          {mkvStatus.found && mkvStatus.mkvmergePath && <PathText>{mkvStatus.mkvmergePath}</PathText>}
        </Col>

        <Row $gap={8}>
          <Button type="button" $variant="secondary" onClick={onChooseMkvDir}>
            Localizar MKVToolNix...
          </Button>
        </Row>
      </SettingsPanel>

      <SettingsPanel>
        <SectionTitle>Nome do arquivo de saida</SectionTitle>
        <NamingConfigPanel
          id="tag-word-transfer"
          title="Transferir Legenda"
          value={namingTransfer}
          onChange={onNamingTransferChange}
        />
        <NamingConfigPanel id="tag-word-clean" title="Limpeza" value={namingClean} onChange={onNamingCleanChange} />
      </SettingsPanel>

      <SettingsPanel>
        <SectionTitle>Nome da faixa de legenda</SectionTitle>
        <Col $gap={6}>
          <Label htmlFor="pt-br-track-name">
            Nome dado a faixa quando reconhecida como PT-BR, so no modo Transferir Legenda
          </Label>
          <Input
            id="pt-br-track-name"
            value={ptBrTrackName}
            onChange={(e) => onPtBrTrackNameChange(e.target.value)}
            placeholder="Portugues BR"
          />
        </Col>
      </SettingsPanel>

      <SettingsPanel>
        <SectionTitle>Renomeador</SectionTitle>
        <Col $gap={6}>
          <Label>Fansubs conhecidas</Label>
          <TagListEditor values={renameFansubPresets} onChange={onRenameFansubPresetsChange} />
        </Col>
        <Col $gap={6}>
          <Label>Tags conhecidas</Label>
          <TagListEditor values={renameTagPresets} onChange={onRenameTagPresetsChange} />
        </Col>
      </SettingsPanel>
    </Col>
  )
}
