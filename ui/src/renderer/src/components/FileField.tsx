import { FolderOpenOutlined } from '@ant-design/icons'
import { Button, Input, Label, Row } from '../ui/primitives'

export function FileField({
  label,
  value,
  onChange,
  width = 190,
  disabled = false
}: {
  label: string
  value: string
  onChange: (value: string) => void
  width?: number
  disabled?: boolean
}) {
  async function browse(): Promise<void> {
    const file = await window.api.chooseFile(value || undefined)
    if (file) onChange(file)
  }

  return (
    <Row $gap={8} style={disabled ? { opacity: 0.45 } : undefined}>
      <Label style={{ width, flexShrink: 0 }}>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="C:\...\arquivo.mkv" disabled={disabled} />
      <Button $variant="secondary" onClick={browse} disabled={disabled}>
        Procurar...
      </Button>
      <Button
        type="button"
        $variant="ghost"
        onClick={() => window.api.showItemInFolder(value)}
        disabled={disabled || !value}
        title="Mostrar este arquivo no Explorer"
      >
        <FolderOpenOutlined />
      </Button>
    </Row>
  )
}
