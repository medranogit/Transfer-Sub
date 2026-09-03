// Infraestrutura: localizar a instalacao do MKVToolNix no disco.
import { existsSync } from 'fs'
import { join } from 'path'

export class MkvToolsNotFoundError extends Error {}

export function locateMkvToolNix(configuredDir?: string): { mkvmerge: string; mkvextract: string } {
  const candidates: string[] = []
  if (configuredDir) candidates.push(configuredDir)
  candidates.push('C:\\Program Files\\MKVToolNix')
  candidates.push('C:\\Program Files (x86)\\MKVToolNix')

  for (const dir of candidates) {
    const mkvmerge = join(dir, 'mkvmerge.exe')
    const mkvextract = join(dir, 'mkvextract.exe')
    if (existsSync(mkvmerge) && existsSync(mkvextract)) {
      return { mkvmerge, mkvextract }
    }
  }

  throw new MkvToolsNotFoundError(
    'Nao foi possivel localizar mkvmerge.exe / mkvextract.exe. Instale o MKVToolNix ou informe a pasta manualmente.'
  )
}
