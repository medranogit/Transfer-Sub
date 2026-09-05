// Modal de confirmacao generico e reutilizavel, pra qualquer acao
// destrutiva/irreversivel do app. Quando `acknowledgeLabel` e passado, exige
// marcar uma caixinha antes de habilitar o botao de confirmar - a "dupla
// verificacao" pra acoes mais sensiveis (ex: apagar o historico).
import { useState } from 'react'
import styled from 'styled-components'
import { ExclamationCircleFilled } from '@ant-design/icons'
import { Button, Row } from './primitives'
import { Checkbox } from './Checkbox'
import { useEscapeToClose } from '../utils/useEscapeToClose'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 110;
`

const Box = styled.div`
  width: min(420px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: ${(p) => p.theme.colors.panel};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.lg};
`

const TitleRow = styled(Row)<{ $danger: boolean }>`
  font-size: 14.5px;
  font-weight: 700;
  color: ${(p) => (p.$danger ? p.theme.colors.danger : p.theme.colors.text)};

  svg {
    font-size: 16px;
  }
`

const Message = styled.p`
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: ${(p) => p.theme.colors.textMuted};
`

const AcknowledgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.text};
  cursor: pointer;
`

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  acknowledgeLabel,
  onConfirm,
  onCancel
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  // Se preenchido, exige marcar essa caixinha antes de liberar o confirmar.
  acknowledgeLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(!acknowledgeLabel)

  useEscapeToClose(onCancel)

  return (
    <Overlay onClick={onCancel}>
      <Box onClick={(e) => e.stopPropagation()}>
        <TitleRow $gap={8} $danger={danger}>
          {danger && <ExclamationCircleFilled />}
          {title}
        </TitleRow>
        <Message>{message}</Message>

        {acknowledgeLabel && (
          <AcknowledgeRow onClick={() => setAcknowledged(!acknowledged)}>
            <Checkbox checked={acknowledged} onChange={() => setAcknowledged(!acknowledged)} />
            {acknowledgeLabel}
          </AcknowledgeRow>
        )}

        <Footer>
          <Button type="button" $variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" $variant={danger ? 'danger' : 'primary'} disabled={!acknowledged} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Footer>
      </Box>
    </Overlay>
  )
}
