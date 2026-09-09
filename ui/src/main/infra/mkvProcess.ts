// Infraestrutura: chamadas de processo ao mkvmerge/mkvextract (probe,
// extracao e remux). Depende do dominio apenas para classificar cada
// faixa encontrada (isAss / isPtBr).
import { join, parse } from 'path'
import { execFile } from 'child_process'
import type { ChildProcess } from 'child_process'
import { promisify } from 'util'
import type { NamingConfig, SubtitleTrack } from '@shared/types'
import { isPtBrTrack } from '../domain/subtitleLanguage'
import { CancellationToken, OperationAbortedError } from './cancellation'

const execFileAsync = promisify(execFile)

// mkvmerge usa codigo de saida 1 para "concluido com avisos" (seguro
// ignorar) e 2+ para erro real. Quando o processo e encerrado por sinal
// (crash, falta de memoria, antivirus interferindo) o Node nao preenche
// `code` (fica undefined) - sem tratar esse caso como falha, o app registrava
// "concluido" mesmo sem gerar o arquivo de saida.
//
// Usa execFile "cru" (nao a versao promisificada) pra ter acesso ao
// ChildProcess assim que ele e criado - e o que permite o botao "Abortar"
// matar o mkvmerge/mkvextract em andamento (via CancellationToken).
async function runMkvTool(execPath: string, args: string[], token?: CancellationToken): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = execFile(
      execPath,
      args,
      { maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        token?.untrackProcess(child)
        if (!err) {
          resolve()
          return
        }
        if (token?.aborted) {
          reject(new OperationAbortedError())
          return
        }
        const execErr = err as unknown as { code?: number; signal?: string }
        if (execErr.code === 1) {
          resolve()
          return
        }
        reject(
          new Error(
            execErr.signal
              ? `processo encerrado inesperadamente (sinal ${execErr.signal})`
              : stderr?.trim() || stdout?.trim() || 'mkvmerge falhou'
          )
        )
      }
    )
    token?.trackProcess(child)
  })
}

const ASS_CODEC_IDS = new Set(['S_TEXT/ASS', 'S_TEXT/SSA'])
const SUB_EXT_BY_CODEC: Record<string, string> = {
  'S_TEXT/ASS': '.ass',
  'S_TEXT/SSA': '.ssa',
  'S_TEXT/UTF8': '.srt',
  'S_HDMV/PGS': '.sup'
}

interface MkvMergeTrackJson {
  id: number
  type: string
  properties?: {
    codec_id?: string
    language?: string
    language_ietf?: string
    track_name?: string
    number?: number
  }
}

export async function probeSubtitleTracks(mkvmergePath: string, videoFile: string): Promise<SubtitleTrack[]> {
  const { stdout } = await execFileAsync(mkvmergePath, ['-J', videoFile], {
    maxBuffer: 32 * 1024 * 1024
  })
  const data = JSON.parse(stdout) as { tracks: MkvMergeTrackJson[] }

  return data.tracks
    .filter((t) => t.type === 'subtitles')
    .map((t) => {
      const props = t.properties ?? {}
      const codecId = props.codec_id ?? ''
      const language = props.language_ietf || props.language || 'und'
      const trackName = props.track_name ?? ''
      return {
        trackId: t.id,
        // "Track number" do Matroska - usado pelo mkvpropedit (`track:@N`)
        // pra editar essa faixa sem remuxar. Cai pro id+1 do mkvmerge (que e
        // 0-based) no caso raro de vir sem essa propriedade.
        trackNumber: props.number ?? t.id + 1,
        codecId,
        language,
        trackName,
        isAss: ASS_CODEC_IDS.has(codecId),
        isPtBr: isPtBrTrack(language, trackName),
        isPtBrGuess: false
      }
    })
}

// Edita so o nome e o idioma de uma faixa ja existente, sem remuxar o
// arquivo inteiro (mkvpropedit e uma edicao de metadado, quase instantanea
// mesmo em arquivos grandes) - usado pelo Renomeador pra corrigir em lote o
// rotulo da faixa PT-BR de arquivos que ja foram transferidos antes.
export async function setSubtitleTrackLabel(
  mkvpropeditPath: string,
  videoFile: string,
  trackNumber: number,
  name: string,
  language: string,
  token?: CancellationToken
): Promise<void> {
  await runMkvTool(
    mkvpropeditPath,
    [videoFile, '--edit', `track:@${trackNumber}`, '--set', `name=${name}`, '--set', `language=${language}`],
    token
  )
}

export function subtitleExtension(codecId: string): string {
  return SUB_EXT_BY_CODEC[codecId] ?? '.sub'
}

export interface AudioTrack {
  trackId: number
  language: string
}

export async function probeAudioTracks(mkvmergePath: string, videoFile: string): Promise<AudioTrack[]> {
  const { stdout } = await execFileAsync(mkvmergePath, ['-J', videoFile], {
    maxBuffer: 32 * 1024 * 1024
  })
  const data = JSON.parse(stdout) as { tracks: MkvMergeTrackJson[] }

  return data.tracks
    .filter((t) => t.type === 'audio')
    .map((t) => ({
      trackId: t.id,
      language: t.properties?.language_ietf || t.properties?.language || 'und'
    }))
}

export async function extractSubtitle(
  mkvextractPath: string,
  videoFile: string,
  trackId: number,
  outPath: string
): Promise<void> {
  await execFileAsync(mkvextractPath, ['tracks', videoFile, `${trackId}:${outPath}`], {
    maxBuffer: 32 * 1024 * 1024
  })
}

export interface SubtitleAttachment {
  id: number
  fileName: string
  contentType: string
}

// Legendas ASS costumam depender de fontes customizadas anexadas ao mkv
// original - sem elas, o player usa uma fonte generica e a legenda parece
// "sem formatacao" mesmo com os estilos intactos no texto da legenda.
export async function probeAttachments(mkvmergePath: string, videoFile: string): Promise<SubtitleAttachment[]> {
  const { stdout } = await execFileAsync(mkvmergePath, ['-J', videoFile], {
    maxBuffer: 32 * 1024 * 1024
  })
  const data = JSON.parse(stdout) as {
    attachments?: { id: number; file_name: string; content_type: string }[]
  }

  return (data.attachments ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    contentType: a.content_type
  }))
}

export interface ExtractedAttachment {
  fileName: string
  contentType: string
  path: string
}

export async function extractAttachments(
  mkvextractPath: string,
  videoFile: string,
  attachments: SubtitleAttachment[],
  outDir: string
): Promise<ExtractedAttachment[]> {
  if (attachments.length === 0) return []

  const withPath = attachments.map((a) => ({ ...a, path: join(outDir, `${a.id}_${a.fileName}`) }))
  const specs = withPath.map((a) => `${a.id}:${a.path}`)
  await execFileAsync(mkvextractPath, ['attachments', videoFile, ...specs], { maxBuffer: 32 * 1024 * 1024 })

  return withPath.map(({ fileName, contentType, path }) => ({ fileName, contentType, path }))
}

export async function muxSubtitleInto(
  mkvmergePath: string,
  destVideo: string,
  subtitleFile: string,
  outputFile: string,
  language = 'und',
  trackName = '',
  offsetMs = 0,
  keepAudioTrackIds?: number[],
  clearDefaultSubtitleTrackIds?: number[],
  attachments?: ExtractedAttachment[],
  removeExtraSubtitles = false,
  token?: CancellationToken
): Promise<void> {
  const args = ['-o', outputFile]
  if (keepAudioTrackIds) {
    args.push('--audio-tracks', keepAudioTrackIds.join(','))
  }
  if (removeExtraSubtitles) {
    // Nao copia nenhuma legenda que ja existia no destino - so a
    // transferida sobra no arquivo final.
    args.push('--no-subtitles')
  } else {
    // Zera a flag "padrao" de legendas ja existentes no destino, para a
    // legenda transferida ser a unica marcada como padrao no arquivo final.
    clearDefaultSubtitleTrackIds?.forEach((trackId) => {
      args.push('--default-track-flag', `${trackId}:no`)
    })
  }
  // Leva junto as fontes anexadas da origem, senao a legenda perde a
  // formatacao (o player cai pra uma fonte generica).
  attachments?.forEach((a) => {
    args.push('--attachment-name', a.fileName, '--attachment-mime-type', a.contentType, '--attach-file', a.path)
  })
  args.push(
    destVideo,
    '--language',
    `0:${language}`,
    '--default-track-flag',
    '0:yes'
  )
  if (trackName) {
    args.push('--track-name', `0:${trackName}`)
  }
  if (offsetMs) {
    args.push('--sync', `0:${offsetMs}`)
  }
  args.push(subtitleFile)

  await runMkvTool(mkvmergePath, args, token)
}

// Marcacao opcional configurada pelo usuario em Configuracoes (ex: "
// [legendado]"), acrescentada ao final do nome. tagWord vazio/undefined =
// nao marca.
function withOptionalTag(name: string, tagWord?: string): string {
  return tagWord ? `${name} [${tagWord}]` : name
}

// Os arquivos finais vao numa subpasta dentro da pasta de saida escolhida, em
// vez de direto nela - fica claro o que o app gerou (em vez de misturar com
// o resto do que já estiver la) e, de quebra, evita a maioria dos casos de
// "saida igual ao destino" quando o usuario escolhe a mesma pasta de destino
// como saida (ver samePath em workflow.ts). O nome e configuravel em
// Configuracoes (AppConfig.outputFolderName); resultFolderName vazio (config
// nunca definida, ou usuario limpou o campo) cai nesse padrao.
export const DEFAULT_RESULT_FOLDER_NAME = 'TS - Result'

export function resolveResultFolder(outputFolder: string, resultFolderName: string): string {
  return join(outputFolder, resultFolderName.trim() || DEFAULT_RESULT_FOLDER_NAME)
}

// Nome fixo por episodio (sem sufixo de contador): se ja existir um arquivo
// com esse nome na pasta de saida, o mkvmerge sobrescreve - nao criamos
// duplicados "(1)", "(2)", etc.
export function resolveOutputPath(
  destVideo: string,
  outputFolder: string,
  naming: NamingConfig,
  resultFolderName: string
): string {
  const base = withOptionalTag(parse(destVideo).name, naming.tagEnabled ? naming.tagWord.trim() : undefined)
  return join(resolveResultFolder(outputFolder, resultFolderName), `${base}.mkv`)
}

// Remuxa o proprio arquivo filtrando faixas: mantem so a legenda escolhida
// (null = mantem todas) e, opcionalmente, so as faixas de audio indicadas.
// Nao extrai/adiciona nada - e so uma remuxagem com filtro (modo "limpar").
export async function cleanTracksInto(
  mkvmergePath: string,
  sourceFile: string,
  outputFile: string,
  keepSubtitleTrackId: number | null,
  keepAudioTrackIds: number[] | undefined,
  syncTrackId: number | null,
  offsetMs: number,
  token?: CancellationToken
): Promise<void> {
  const args = ['-o', outputFile]
  if (keepAudioTrackIds) {
    args.push('--audio-tracks', keepAudioTrackIds.join(','))
  }
  if (keepSubtitleTrackId !== null) {
    args.push('--subtitle-tracks', String(keepSubtitleTrackId))
    args.push('--default-track-flag', `${keepSubtitleTrackId}:yes`)
  }
  if (syncTrackId !== null && offsetMs !== 0) {
    args.push('--sync', `${syncTrackId}:${offsetMs}`)
  }
  args.push(sourceFile)

  await runMkvTool(mkvmergePath, args, token)
}

// Mesmo esquema de nome fixo (sobrescreve por nome) e mesma subpasta do
// resolveOutputPath - ver withOptionalTag/resolveResultFolder.
export function resolveCleanOutputPath(
  sourceFile: string,
  outputFolder: string,
  naming: NamingConfig,
  resultFolderName: string
): string {
  const base = withOptionalTag(parse(sourceFile).name, naming.tagEnabled ? naming.tagWord.trim() : undefined)
  return join(resolveResultFolder(outputFolder, resultFolderName), `${base}.mkv`)
}
