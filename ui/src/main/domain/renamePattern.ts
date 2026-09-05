// Regras de dominio: gerar o novo nome de um arquivo a partir dos 4 campos
// do Renomeador (fansub, nome do anime, temporada, tags) e, no primeiro
// escaneamento, tentar detectar fansub/nome/temporada a partir de um
// arquivo de exemplo. Nenhuma dependencia de I/O - so texto.
import { parse } from 'path'
import { findEpisode, findEpisodeMatch } from './episodeMatcher'
import type { DetectedRenameFields, RenameFields } from '@shared/types'

export interface RenameResult {
  name: string | null
  // motivo de nao gerar um nome (episodio nao detectado no arquivo original)
  // - null quando "name" foi gerado com sucesso.
  reason: string | null
}

// Fansub original quase sempre marca o nome com "[Tag]" no inicio - mesma
// convencao usada em infra/mkvProcess.ts (withTransferSubSignature).
const FANSUB_TAG = /^\[([^\]]+)\]/

// Formato usado no nome gerado (2 digitos - ex: "S01E05") - diferente do
// episodeKey() de episodeMatcher.ts (3 digitos no episodio), que serve pro
// casamento origem/destino, nao pra exibicao aqui.
export function formatSeasonEpisode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

// Nome final: "[fansub] nomeAnime - S(temporada)E(episodio) - tags" (partes
// vazias sao omitidas, sem deixar "- -"/colchetes sobrando). O episodio vem
// do nome original via findEpisode; fansub/nomeAnime/temporada/tags sao os
// campos informados pelo usuario (temporada e tags valem pra pasta
// inteira). Numeros saem com 2 digitos (01, 11...) e a extensao do arquivo
// original e sempre preservada.
export function buildRenamedName(originalFileName: string, fields: RenameFields): RenameResult {
  const [, episode] = findEpisode(originalFileName)
  if (episode === null) return { name: null, reason: 'episodio nao detectado no nome original' }

  const fansub = fields.fansub.trim()
  const seasonEpisode = formatSeasonEpisode(fields.season, episode)
  const middle = [fields.animeName.trim(), seasonEpisode].filter((part) => part.length > 0).join(' - ')
  const namePart = [fansub ? `[${fansub}]` : '', middle].filter((part) => part.length > 0).join(' ')
  const newBase = [namePart, fields.tags.trim()].filter((part) => part.length > 0).join(' - ')

  const ext = parse(originalFileName).ext
  return { name: `${newBase}${ext}`, reason: null }
}

// Palpite de fansub/nomeAnime/temporada a partir de UM arquivo de exemplo
// (o primeiro da pasta escaneada) - so aplicado pela UI quando os campos
// ainda estao em branco. Fansub vem do "[Tag]" no inicio (se houver);
// nomeAnime e o texto entre o fansub e a marcacao de episodio (so quando um
// EPISODE_PATTERN bateu direto - no fallback via ultimo-numero-isolado nao
// da pra saber onde cortar com confianca, entao fica em branco); temporada
// vem do proprio nome ou 1 como padrao.
export function detectRenameFields(originalFileName: string): DetectedRenameFields {
  const name = parse(originalFileName).name

  const fansubMatch = name.match(FANSUB_TAG)
  const fansub = fansubMatch ? fansubMatch[1].trim() : ''
  const afterFansub = fansubMatch ? name.slice(fansubMatch[0].length) : name

  const episodeMatch = findEpisodeMatch(originalFileName)
  const season = episodeMatch?.season ?? 1

  let animeName = ''
  if (episodeMatch) {
    const cutPoint = episodeMatch.matchStart - (fansubMatch ? fansubMatch[0].length : 0)
    animeName = afterFansub
      .slice(0, Math.max(0, cutPoint))
      .trim()
      .replace(/[-\s]+$/, '')
  }

  return { fansub, animeName, season }
}
