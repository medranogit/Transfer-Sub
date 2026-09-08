// Pagina de configuracoes - MKVToolNix (status + localizar), marcacao livre
// no final do nome de saida (uma config por modo), o estado inicial dos
// alternadores/chips de cada tela (Transferir/Limpeza/Renomeador - o usuario
// ainda pode mudar a vontade durante a sessao, isso so afeta como a tela
// comeca) e o nome dado a faixa de legenda quando reconhecida como PT-BR.
import styled from 'styled-components'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloudDownloadOutlined,
  DownloadOutlined,
  UploadOutlined
} from '@ant-design/icons'
import type { CleanDefaults, MkvToolsStatus, NamingConfig, RenameDefaults, TransferDefaults } from '@shared/types'
import { Button, Col, Input, Label, Panel, Row, SectionTitle } from '../ui/primitives'
import { Checkbox } from '../ui/Checkbox'
import { EpisodeMovieToggle } from '../ui/EpisodeMovieToggle'
import { TagListEditor } from '../ui/TagListEditor'

// Grid com 2 colunas explicitas (em vez de column-count, que balanceia a
// altura sozinho e pode mudar qual painel cai em qual coluna conforme o
// conteudo cresce) - cada painel e atribuido a uma coluna fixa no JSX abaixo,
// entao a posicao nao muda de lugar sozinha.
const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
`

const SettingsPanel = styled(Panel)`
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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

function TransferDefaultsPanel({
  value,
  onChange
}: {
  value: TransferDefaults
  onChange: (next: TransferDefaults) => void
}) {
  return (
    <Col $gap={10}>
      <Label>Transferir Legenda - Predefinicao Padrao</Label>
      <Row>
        <EpisodeMovieToggle movieMode={value.movieMode} onChange={(movieMode) => onChange({ ...value, movieMode })} />
      </Row>
      <Row $gap={10}>
        <Checkbox
          checked={value.removeEnglishAudio}
          onChange={() => onChange({ ...value, removeEnglishAudio: !value.removeEnglishAudio })}
        />
        <ToggleLabel>Padrao - Remover dublagens</ToggleLabel>
      </Row>
      <Row $gap={10}>
        <Checkbox
          checked={value.removeExtraSubtitles}
          onChange={() => onChange({ ...value, removeExtraSubtitles: !value.removeExtraSubtitles })}
        />
        <ToggleLabel>Padrao - Limpar Legendas</ToggleLabel>
      </Row>
    </Col>
  )
}

function CleanDefaultsPanel({
  value,
  onChange
}: {
  value: CleanDefaults
  onChange: (next: CleanDefaults) => void
}) {
  return (
    <Col $gap={10}>
      <Label>Limpeza - Predefinicao Padrao</Label>
      <Row $gap={10}>
        <Checkbox
          checked={value.removeEnglishAudio}
          onChange={() => onChange({ ...value, removeEnglishAudio: !value.removeEnglishAudio })}
        />
        <ToggleLabel>Padrao - Remover dublagens</ToggleLabel>
      </Row>
    </Col>
  )
}

function RenameDefaultsPanel({
  value,
  onChange
}: {
  value: RenameDefaults
  onChange: (next: RenameDefaults) => void
}) {
  return (
    <Col $gap={10}>
      <Label>Renomeador - Predefinicao Padrao</Label>
      <Row>
        <EpisodeMovieToggle movieMode={value.movieMode} onChange={(movieMode) => onChange({ ...value, movieMode })} />
      </Row>
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
  transferDefaults,
  onTransferDefaultsChange,
  cleanDefaults,
  onCleanDefaultsChange,
  renameDefaults,
  onRenameDefaultsChange,
  outputFolderName,
  onOutputFolderNameChange,
  muteSounds,
  onMuteSoundsChange,
  onExportConfig,
  onImportConfig,
  onCheckForUpdates,
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
  transferDefaults: TransferDefaults
  onTransferDefaultsChange: (next: TransferDefaults) => void
  cleanDefaults: CleanDefaults
  onCleanDefaultsChange: (next: CleanDefaults) => void
  renameDefaults: RenameDefaults
  onRenameDefaultsChange: (next: RenameDefaults) => void
  outputFolderName: string
  onOutputFolderNameChange: (next: string) => void
  muteSounds: boolean
  onMuteSoundsChange: (next: boolean) => void
  onExportConfig: () => void
  onImportConfig: () => void
  onCheckForUpdates: () => void
  ptBrTrackName: string
  onPtBrTrackNameChange: (next: string) => void
  renameFansubPresets: string[]
  onRenameFansubPresetsChange: (next: string[]) => void
  renameTagPresets: string[]
  onRenameTagPresetsChange: (next: string[]) => void
}) {
  return (
    <SettingsGrid>
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
          <SectionTitle>Geral</SectionTitle>
          <Col $gap={6}>
            <Label htmlFor="output-folder-name">Nome da subpasta de saida (Transferir/Limpeza)</Label>
            <Input
              id="output-folder-name"
              value={outputFolderName}
              onChange={(e) => onOutputFolderNameChange(e.target.value)}
              placeholder="TS - Result"
            />
          </Col>
          <Row $gap={10}>
            <Checkbox checked={muteSounds} onChange={() => onMuteSoundsChange(!muteSounds)} />
            <ToggleLabel>Silenciar sons de conclusao/aviso</ToggleLabel>
          </Row>
          <Row $gap={8}>
            <Button type="button" $variant="secondary" onClick={onExportConfig}>
              <UploadOutlined /> Exportar configuracoes...
            </Button>
            <Button type="button" $variant="secondary" onClick={onImportConfig}>
              <DownloadOutlined /> Importar configuracoes...
            </Button>
          </Row>
          <Row $gap={8}>
            <Button
              type="button"
              $variant="secondary"
              onClick={onCheckForUpdates}
              title="So funciona no instalador (.exe) - em modo desenvolvimento nao ha o que comparar"
            >
              <CloudDownloadOutlined /> Verificar atualizacoes
            </Button>
          </Row>
        </SettingsPanel>

        <SettingsPanel>
          <SectionTitle>Estado inicial de cada tela</SectionTitle>
          <TransferDefaultsPanel value={transferDefaults} onChange={onTransferDefaultsChange} />
          <CleanDefaultsPanel value={cleanDefaults} onChange={onCleanDefaultsChange} />
          <RenameDefaultsPanel value={renameDefaults} onChange={onRenameDefaultsChange} />
        </SettingsPanel>
      </Col>

      <Col $gap={14}>
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
    </SettingsGrid>
  )
}
