// Infraestrutura: acesso ao sistema de arquivos para listar videos.
import { existsSync, readdirSync, statSync } from 'fs'
import { basename, join, parse } from 'path'
import { findEpisode } from '../domain/episodeMatcher'

export const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.wmv', '.mov', '.ts', '.webm'])

// Ordena pelo numero do episodio detectado (nao pelo texto do nome) - releases
// que nao preenchem os numeros com zero a esquerda de forma consistente (ex:
// "E17" ao lado de "E167"/"E170" na mesma pasta) ficam fora de ordem numa
// ordenacao alfabetica pura ("E17" < "E170" < "E18" como texto). Arquivo sem
// episodio detectavel cai no fim, ordenado entre si por nome.
export function listVideoFiles(folder: string): string[] {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return []
  return readdirSync(folder)
    .filter((name) => VIDEO_EXTS.has(parse(name).ext.toLowerCase()))
    .map((name) => join(folder, name))
    .sort((a, b) => {
      const [, episodeA] = findEpisode(basename(a))
      const [, episodeB] = findEpisode(basename(b))
      if (episodeA === null && episodeB === null) return a.localeCompare(b)
      if (episodeA === null) return 1
      if (episodeB === null) return -1
      return episodeA - episodeB || a.localeCompare(b)
    })
}
