import styled from 'styled-components'
import { ClearOutlined, SwapOutlined } from '@ant-design/icons'

const ModeSwitch = styled.div`
  display: inline-flex;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  padding: 3px;
  gap: 2px;
`

const ModeOption = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: none;
  border-radius: 5px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  background: ${(p) => (p.$active ? p.theme.colors.accent : 'transparent')};
  color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.textMuted)};
  transition: background 0.15s ease, color 0.15s ease;

  svg {
    font-size: 14px;
  }

  &:hover:not(:disabled) {
    color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.text)};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: ${(p) => (p.$active ? 1 : 0.45)};
  }
`

// Alterna entre "Transferir legenda" e "Apenas limpar". Fica bloqueado
// enquanto uma operacao (scan/transferencia) esta em andamento.
export function ModeToggle({
  cleanOnly,
  disabled,
  onChange
}: {
  cleanOnly: boolean
  disabled: boolean
  onChange: (cleanOnly: boolean) => void
}) {
  const busyTitle = 'Aguarde a operacao atual terminar para trocar de modo'

  return (
    <ModeSwitch>
      <ModeOption
        type="button"
        $active={!cleanOnly}
        onClick={() => onChange(false)}
        disabled={disabled}
        title={
          disabled ? busyTitle : 'Copia a legenda da pasta de origem para os arquivos correspondentes da pasta de destino'
        }
      >
        <SwapOutlined />
        Transferir legenda
      </ModeOption>
      <ModeOption
        type="button"
        $active={cleanOnly}
        onClick={() => onChange(true)}
        disabled={disabled}
        title={
          disabled
            ? busyTitle
            : 'So trata os arquivos da pasta de destino: remove legendas extras e/ou dublagem, sem transferir nada'
        }
      >
        <ClearOutlined />
        Apenas limpar
      </ModeOption>
    </ModeSwitch>
  )
}
