// Editor generico de uma lista de textos curtos (ex: fansubs/tags
// conhecidas em Configuracoes) - mostra cada valor como uma pilula com botao
// de remover, mais um campo pra adicionar um novo. Reaproveitavel: so recebe
// os valores atuais e um onChange, sem saber pra que lista serve.
import { useState } from 'react'
import styled from 'styled-components'
import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Row } from './primitives'

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  background: ${(p) => p.theme.colors.panelAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  color: ${(p) => p.theme.colors.text};
  font-size: 12px;
`

const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: ${(p) => p.theme.colors.textMuted};
  cursor: pointer;
  padding: 0;

  &:hover {
    background: color-mix(in srgb, ${(p) => p.theme.colors.danger} 20%, transparent);
    color: ${(p) => p.theme.colors.danger};
  }

  svg {
    font-size: 9px;
  }
`

export function TagListEditor({ values, onChange }: { values: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function addValue() {
    const trimmed = draft.trim()
    if (!trimmed || values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, trimmed])
    setDraft('')
  }

  function removeValue(value: string) {
    onChange(values.filter((v) => v !== value))
  }

  return (
    <div>
      <PillRow style={{ marginBottom: values.length > 0 ? 8 : 0 }}>
        {values.map((value) => (
          <Pill key={value}>
            {value}
            <RemoveButton type="button" onClick={() => removeValue(value)} title={`Remover "${value}"`}>
              <CloseOutlined />
            </RemoveButton>
          </Pill>
        ))}
      </PillRow>
      <Row $gap={8}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addValue()
            }
          }}
          placeholder="Adicionar..."
        />
        <Button type="button" $variant="secondary" onClick={addValue} disabled={!draft.trim()}>
          <PlusOutlined /> Adicionar
        </Button>
      </Row>
    </div>
  )
}
