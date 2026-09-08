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

// Fansub original quase sempre marca o nome com "[Tag]" no inicio.
const FANSUB_TAG = /^\[([^\]]+)\]/

// Fansubs que usam "_" como separador (ex: "Accel_World_-_01_[...]") deixavam
// o nome/tags detectados cheios de "_" literal (o "_" so e' normalizado pra
// espaco dentro de episodeMatcher, pra fins de casamento - o texto aqui
// ainda vem do nome ORIGINAL). Normaliza espacos/underscore e tira
// separador solto (espaco/traco) das pontas so' nos campos DETECTADOS -
// o nome do arquivo em si nao muda.
function cleanDetectedText(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^-+\s*|\s*-+$/g, '')
    .trim()
}

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
//
// No modo filme (fields.movieMode) nao ha temporada/episodio pra incluir -
// nem pra exigir: filmes raramente tem uma marcacao "S01E01" no nome, entao
// aqui nao chama findEpisode (diferente do modo episodio, onde a ausencia
// dele bloqueia a linha). Resultado vira so "[fansub] nomeAnime - tags".
export function buildRenamedName(originalFileName: string, fields: RenameFields): RenameResult {
  const fansub = fields.fansub.trim()
  const ext = parse(originalFileName).ext

  if (fields.movieMode) {
    const namePart = [fansub ? `[${fansub}]` : '', fields.animeName.trim()]
      .filter((part) => part.length > 0)
      .join(' ')
    const newBase = [namePart, fields.tags.trim()].filter((part) => part.length > 0).join(' - ')
    if (!newBase) return { name: null, reason: 'preencha ao menos o nome do filme' }
    return { name: `${newBase}${ext}`, reason: null }
  }

  const [, episode] = findEpisode(originalFileName)
  if (episode === null) return { name: null, reason: 'episodio nao detectado no nome original' }

  const seasonEpisode = formatSeasonEpisode(fields.season, episode)
  const middle = [fields.animeName.trim(), seasonEpisode].filter((part) => part.length > 0).join(' - ')
  const namePart = [fansub ? `[${fansub}]` : '', middle].filter((part) => part.length > 0).join(' ')
  const newBase = [namePart, fields.tags.trim()].filter((part) => part.length > 0).join(' - ')

  return { name: `${newBase}${ext}`, reason: null }
}

// Palpite de fansub/nomeAnime/temporada/tags a partir de UM arquivo de
// exemplo (o primeiro da pasta escaneada) - so aplicado pela UI quando os
// campos ainda estao em branco. Fansub vem do "[Tag]" no inicio (se houver);
// nomeAnime e tags sao o texto antes/depois da marcacao de episodio
// (matchStart/matchEnd - disponivel tanto no EPISODE_PATTERNS quanto no
// fallback de ultimo-numero-isolado, ver episodeMatcher.ts); temporada vem
// do proprio nome ou 1 como padrao.
export function detectRenameFields(originalFileName: string): DetectedRenameFields {
  const name = parse(originalFileName).name

  const fansubMatch = name.match(FANSUB_TAG)
  const fansub = fansubMatch ? fansubMatch[1].trim() : ''
  const afterFansub = fansubMatch ? name.slice(fansubMatch[0].length) : name
  const fansubLen = fansubMatch ? fansubMatch[0].length : 0

  const episodeMatch = findEpisodeMatch(originalFileName)
  const season = episodeMatch?.season ?? 1

  let animeName = ''
  let tags = ''
  if (episodeMatch) {
    const cutPoint = episodeMatch.matchStart - fansubLen
    animeName = cleanDetectedText(afterFansub.slice(0, Math.max(0, cutPoint)))

    const tagsStart = episodeMatch.matchEnd - fansubLen
    tags = cleanDetectedText(afterFansub.slice(Math.max(0, tagsStart)))
  }

  return { fansub, animeName, season, tags }
}
