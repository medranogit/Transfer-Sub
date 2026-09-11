import { useState } from 'react'
import styled from 'styled-components'
import { Input } from './primitives'

const Wrap = styled.div`
  position: relative;
  width: 100%;
`

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
  placeholder,
  onBlur
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  placeholder?: string
  onBlur?: (value: string) => void
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
        onBlur={() => {
          setTimeout(() => setOpen(false), 120)
          onBlur?.(value)
        }}
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
