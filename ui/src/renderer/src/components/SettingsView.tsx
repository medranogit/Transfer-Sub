// Pagina de configuracoes - hoje so o MKVToolNix (status + localizar), mas
// e o lugar certo pra qualquer preferencia global que vier no futuro (o
// resto das opcoes atuais, tipo remover audio, sao por operacao e ficam nas
// paginas de Transferir/Limpar, nao aqui).
import styled from 'styled-components'
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import type { MkvToolsStatus } from '@shared/types'
import { Button, Col, Label, Panel, Row } from '../ui/primitives'

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

export function SettingsView({
  mkvStatus,
  onChooseMkvDir
}: {
  mkvStatus: MkvToolsStatus
  onChooseMkvDir: () => void
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
    </Col>
  )
}
