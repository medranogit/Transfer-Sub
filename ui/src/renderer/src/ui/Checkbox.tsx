// Checkbox customizado (o nativo do navegador fica minusculo e sem estilo no
// tema escuro) - input real escondido por cima de uma caixinha estilizada,
// pra manter acessibilidade (foco por teclado, leitor de tela) intacta.
import styled from 'styled-components'
import { CheckOutlined } from '@ant-design/icons'

const CheckboxLabel = styled.label`
  position: relative;
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
`

const CheckboxInput = styled.input`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
`

const CheckboxBox = styled.span`
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  border: 1.5px solid ${(p) => p.theme.colors.borderLight};
  background: ${(p) => p.theme.colors.panelAlt};
  color: transparent;
  font-size: 11px;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;

  ${CheckboxInput}:hover + & {
    border-color: ${(p) => p.theme.colors.accent};
  }

  ${CheckboxInput}:focus-visible + & {
    outline: 2px solid ${(p) => p.theme.colors.accent};
    outline-offset: 2px;
  }

  ${CheckboxInput}:checked + & {
    background: ${(p) => p.theme.colors.success};
    border-color: ${(p) => p.theme.colors.success};
    color: #0d1710;
  }
`

export function Checkbox({
  checked,
  onChange,
  title,
  stopPropagation = true
}: {
  checked: boolean
  onChange: () => void
  title?: string
  stopPropagation?: boolean
}) {
  return (
    <CheckboxLabel title={title} onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}>
      <CheckboxInput type="checkbox" checked={checked} onChange={onChange} />
      <CheckboxBox>
        <CheckOutlined />
      </CheckboxBox>
    </CheckboxLabel>
  )
}
