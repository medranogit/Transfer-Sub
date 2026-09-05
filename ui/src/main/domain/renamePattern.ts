// Regras de dominio: gerar o novo nome de um arquivo a partir de 3 campos
// simples (texto inicial, temporada, texto final) - o episodio e detectado
// automaticamente por arquivo, a temporada e a mesma pra pasta inteira.
// Nenhuma dependencia de I/O - so texto.
import { parse } from 'path'
import { findEpisode } from './episodeMatcher'

export interface RenameFields {
  prefixText: string
  season: number
  suffixText: string
}

export interface RenameResult {
  name: string | null
  // motivo de nao gerar um nome (episodio nao detectado no arquivo original)
  // - null quando "name" foi gerado com sucesso.
  reason: string | null
}

// Nome final: "{texto inicial} - S{temporada}E{episodio} - {texto final}"
// (partes vazias sao omitidas, sem deixar " - " sobrando). O episodio vem do
// nome original via findEpisode (mesma logica usada pro matching entre
// origem/destino) - a temporada informada e fixa pra pasta inteira. Numeros
// saem com 2 digitos (01, 11...) e a extensao do arquivo original e sempre
// preservada.
export function buildRenamedName(originalFileName: string, fields: RenameFields): RenameResult {
  const [, episode] = findEpisode(originalFileName)
  if (episode === null) return { name: null, reason: 'episodio nao detectado no nome original' }

  const seasonEpisode = `S${String(fields.season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
  const newBase = [fields.prefixText.trim(), seasonEpisode, fields.suffixText.trim()]
    .filter((part) => part.length > 0)
    .join(' - ')

  const ext = parse(originalFileName).ext
  return { name: `${newBase}${ext}`, reason: null }
}
