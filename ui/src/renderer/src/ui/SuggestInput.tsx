// Inputs com sugestoes em dropdown, customizados (nao usa <input list>/
// <datalist> nativo - no Chromium/Electron desse app o navegador ignora o
// CSS do campo quando ele tem "list" associado a um datalist, deixando o
// fundo branco). Dois modos, compartilhando a mesma base visual:
// - SuggestInput: escolher UM valor (ex: Fansub) - clicar numa sugestao
//   substitui o campo inteiro e fecha o dropdown.
// - TagPickerInput: compor uma lista de palavras num unico campo de texto
//   (ex: Tags) - clicar numa sugestao soma/remove ela do texto (toggle) e o
//   dropdown continua aberto, pra dar pra clicar varias seguidas; so fecha
//   quando o campo perde o foco.
import { useState } from 'react'
import styled from 'styled-components'
import { CheckOutlined } from '@ant-design/icons'
import { Input } from './primitives'

const Wrap = styled.div`
  position: relative;
  width: 100%;
`

// Input depende de "flex: 1" (primitives.ts) pra esticar - so funciona
// quando ele e filho direto de um container flex. Aqui ele fica dentro do
// Wrap (uma div comum), entao sem isso ele volta a largura padrao do
// navegador (~inline-block) e passa por cima do campo vizinho.
const StyledInput = styled(Input)`
  width: 100%;
`

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  background: ${(p) => p.theme.colors.panel};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.sm};
  max-height: 180px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
`

const MenuItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: ${(p) => (p.$active ? p.theme.colors.success : p.theme.colors.text)};
  font-size: 12.5px;
  cursor: pointer;

  svg {
    font-size: 10px;
  }

  &:hover {
    background: ${(p) => p.theme.colors.panelAlt};
  }
`

export function SuggestInput({
  value,
  onChange,
  options,
  placeholder
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)

  const filtered = options.filter((option) => option.toLowerCase().includes(value.trim().toLowerCase()))

  return (
    <Wrap>
      <StyledInput
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <Menu>
          {filtered.map((option) => (
            <MenuItem
              key={option}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {option}
            </MenuItem>
          ))}
        </Menu>
      )}
    </Wrap>
  )
}

// Compoe uma lista de palavras separadas por espaco num unico campo de
// texto (ex: "BD HEVC 1080p") - clicar numa sugestao soma ela ao texto se
// ainda nao estiver la, ou remove se ja estiver (toggle), sem diferenciar
// maiusculas/minusculas. O dropdown fica aberto enquanto o campo tem foco,
// pra dar pra clicar varias sugestoes seguidas sem reabrir a cada uma;
// digitar direto no campo continua funcionando normalmente.
export function TagPickerInput({
  value,
  onChange,
  options,
  placeholder
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const words = value.trim() ? value.trim().split(/\s+/) : []

  function toggle(option: string) {
    const has = words.some((w) => w.toLowerCase() === option.toLowerCase())
    const next = has ? words.filter((w) => w.toLowerCase() !== option.toLowerCase()) : [...words, option]
    onChange(next.join(' '))
  }

  return (
    <Wrap>
      <StyledInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
      />
      {open && options.length > 0 && (
        <Menu>
          {options.map((option) => {
            const active = words.some((w) => w.toLowerCase() === option.toLowerCase())
            return (
              <MenuItem
                key={option}
                type="button"
                $active={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(option)}
              >
                {active && <CheckOutlined />}
                {option}
              </MenuItem>
            )
          })}
        </Menu>
      )}
    </Wrap>
  )
}
