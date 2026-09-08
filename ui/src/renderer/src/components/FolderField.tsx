import { FolderOpenOutlined } from '@ant-design/icons'
import { Button, Input, Label, Row } from '../ui/primitives'

export function FolderField({
  label,
  title,
  value,
  onChange,
  width = 190,
  disabled = false
}: {
  label: string
  title?: string
  value: string
  onChange: (value: string) => void
  width?: number
  disabled?: boolean
}) {
  async function browse(): Promise<void> {
    const folder = await window.api.chooseFolder(value || undefined)
    if (folder) onChange(folder)
  }

  return (
    <Row $gap={8} style={disabled ? { opacity: 0.45 } : undefined}>
      <Label style={{ width, flexShrink: 0 }} title={title}>
        {label}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="C:\..." disabled={disabled} />
      <Button $variant="secondary" onClick={browse} disabled={disabled}>
        Procurar...
      </Button>
      <Button
        type="button"
        $variant="ghost"
        onClick={() => window.api.openFolder(value)}
        disabled={disabled || !value}
        title="Abrir esta pasta no Explorer"
      >
        <FolderOpenOutlined />
      </Button>
    </Row>
  )
}
