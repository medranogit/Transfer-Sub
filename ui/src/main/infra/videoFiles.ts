// Infraestrutura: acesso ao sistema de arquivos para listar videos.
import { existsSync, readdirSync, statSync } from 'fs'
import { join, parse } from 'path'

export const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.wmv', '.mov', '.ts', '.webm'])

export function listVideoFiles(folder: string): string[] {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return []
  return readdirSync(folder)
    .filter((name) => VIDEO_EXTS.has(parse(name).ext.toLowerCase()))
    .map((name) => join(folder, name))
    .sort()
}
