import { existsSync } from 'fs'
import { join } from 'path'

export class MkvToolsNotFoundError extends Error {}

export function locateMkvToolNix(
  configuredDir?: string
): { mkvmerge: string; mkvextract: string; mkvpropedit: string } {
  const candidates: string[] = []
  if (configuredDir) candidates.push(configuredDir)
  candidates.push('C:\\Program Files\\MKVToolNix')
  candidates.push('C:\\Program Files (x86)\\MKVToolNix')

  for (const dir of candidates) {
    const mkvmerge = join(dir, 'mkvmerge.exe')
    const mkvextract = join(dir, 'mkvextract.exe')
    const mkvpropedit = join(dir, 'mkvpropedit.exe')
    if (existsSync(mkvmerge) && existsSync(mkvextract) && existsSync(mkvpropedit)) {
      return { mkvmerge, mkvextract, mkvpropedit }
    }
  }

  throw new MkvToolsNotFoundError(
    'Nao foi possivel localizar mkvmerge.exe / mkvextract.exe / mkvpropedit.exe. Instale o MKVToolNix ou informe a pasta manualmente.'
  )
}
