import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { join, basename, extname, resolve } from 'path'
import { episodeKey, findEpisode } from './domain/episodeMatcher'
import {
  guessPtBrFromContent,
  pickBestTrackIndex,
  resolveTransferLanguage,
  resolveTransferTrackName
} from './domain/subtitleLanguage'
import { isEnglishAudio } from './domain/audioLanguage'
import { decodeSubtitleBuffer } from './domain/subtitleEncoding'
import {
  formatMsAsTimeCode,
  parseFirstEventStartMs,
  parseSubtitleEvents,
  parseTimeCodeToMs
} from './domain/subtitleTiming'
import { listVideoFiles } from './infra/videoFiles'
import {
  cleanTracksInto,
  extractAttachments,
  extractSubtitle,
  muxSubtitleInto,
  probeAttachments,
  probeAudioTracks,
  probeSubtitleTracks,
  resolveCleanOutputPath,
  resolveOutputPath,
  subtitleExtension
} from './infra/mkvProcess'
import { appendTransferLog } from './infra/transferLog'
import { CancellationToken, OperationAbortedError } from './infra/cancellation'
import type {
  EpisodeRow,
  LogEvent,
  NamingConfig,
  RowStatus,
  ScanResult,
  SubtitleEvent,
  SubtitleTrack,
  SyncPrepareResult,
  TransferSummary
} from '@shared/types'

type LogFn = (event: LogEvent) => void

// mkvmerge nao suporta ler e escrever no mesmo arquivo ao mesmo tempo -
// com a assinatura "[TS - Tag]" sendo idempotente (nao assina de novo se o
// arquivo ja foi processado antes), rodar a mesma operacao 2x sem trocar a
// pasta de saida faria o output bater com o proprio arquivo de entrada.
// Comparacao normalizada (resolve + minusculo) pois no Windows o path nao
// diferencia maiusculas/minusculas.
function samePath(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase()
}

// Quando nenhuma faixa foi reconhecida como PT-BR por idioma/nome, tenta
// como ultimo recurso extrair cada faixa e olhar o proprio texto - fansubs
// as vezes rotulam a faixa com o idioma errado. Para no primeiro palpite
// positivo para nao gastar tempo extraindo faixas a mais.
async function tagPtBrGuesses(
  mkvextractPath: string,
  sourcePath: string,
  tracks: SubtitleTrack[],
  episodeKeyForLog: string,
  onLog: LogFn
): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-guess-'))
  try {
    for (const track of tracks) {
      const tmpPath = join(tmpDir, `probe${subtitleExtension(track.codecId)}`)
      try {
        await extractSubtitle(mkvextractPath, sourcePath, track.trackId, tmpPath)
        const content = decodeSubtitleBuffer(await readFile(tmpPath))
        if (guessPtBrFromContent(content)) {
          track.isPtBrGuess = true
          onLog({
            level: 'warn',
            message: `[${episodeKeyForLog}] faixa #${track.trackId} esta rotulada como "${track.language}" mas o conteudo parece ser PT-BR - confira antes de transferir`
          })
          break
        }
      } catch {
        // faixa nao pode ser extraida/lida - ignora e tenta a proxima
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

// Monta uma linha (sondagem de faixas + deteccao/palpite de PT-BR + escolha
// da faixa padrao) pra um par origem/destino ja definido - reaproveitada
// tanto pelo pareamento automatico por episodio (scanFolders) quanto pelo
// modo filme (scanMovie, que ja recebe os dois arquivos escolhidos direto,
// sem precisar identificar numero de episodio).
async function buildEpisodeRow(
  mkvmergePath: string,
  mkvextractPath: string,
  key: string,
  sourcePath: string,
  destPath: string,
  onLog: LogFn
): Promise<EpisodeRow> {
  let tracks: SubtitleTrack[]
  try {
    tracks = await probeSubtitleTracks(mkvmergePath, sourcePath)
  } catch (err) {
    onLog({ level: 'error', message: `Falha ao ler faixas de ${basename(sourcePath)}: ${(err as Error).message}` })
    tracks = []
  }

  const assTracks = tracks.filter((t) => t.isAss)
  const usableTracks = assTracks.length > 0 ? assTracks : tracks

  if (usableTracks.length > 0 && !usableTracks.some((t) => t.isPtBr)) {
    await tagPtBrGuesses(mkvextractPath, sourcePath, usableTracks, key, onLog)
  }

  const bestIndex = pickBestTrackIndex(usableTracks)
  const selectedTrackId = bestIndex >= 0 ? usableTracks[bestIndex].trackId : null

  return {
    id: key,
    episodeKey: key,
    sourcePath,
    sourceName: basename(sourcePath),
    destPath,
    destName: basename(destPath),
    tracks: usableTracks,
    selectedTrackId,
    firstLineTargetText: '',
    manualOffsetText: ''
  }
}

export async function scanFolders(
  mkvmergePath: string,
  mkvextractPath: string,
  sourceDir: string,
  destDir: string,
  onLog: LogFn,
  token?: CancellationToken
): Promise<ScanResult> {
  const sourceFiles = listVideoFiles(sourceDir)
  const destFiles = listVideoFiles(destDir)

  const warnings: string[] = []

  interface Candidate {
    file: string
    season: number | null
  }

  function indexByEpisode(files: string[], side: string): Map<number, Candidate[]> {
    const map = new Map<number, Candidate[]>()
    for (const file of files) {
      const [season, episode] = findEpisode(basename(file))
      if (episode === null) {
        warnings.push(`Nao identifiquei episodio em (${side}): ${basename(file)}`)
        continue
      }
      const list = map.get(episode) ?? []
      list.push({ file, season })
      map.set(episode, list)
    }
    return map
  }

  const sourceByEpisode = indexByEpisode(sourceFiles, 'origem')
  const destByEpisode = indexByEpisode(destFiles, 'destino')

  // Casa pelo numero do episodio; a temporada so desempata quando ha mais de
  // um arquivo com o mesmo numero de um lado (pasta com varias temporadas
  // juntas). Fansubs raramente incluem a temporada no nome do arquivo (ex:
  // "Nome - 01.mkv"), enquanto bibliotecas organizadas costumam usar
  // "Nome - S01E01.mkv" - exigir que os dois lados concordassem em
  // temporada deixava de casar episodios legitimos como esse.
  function pickPair(sourceCandidates: Candidate[], destCandidates: Candidate[]): [Candidate, Candidate] | null {
    if (sourceCandidates.length === 1 && destCandidates.length === 1) {
      return [sourceCandidates[0], destCandidates[0]]
    }
    for (const s of sourceCandidates) {
      for (const d of destCandidates) {
        if (s.season !== null && s.season === d.season) return [s, d]
      }
    }
    return null
  }

  const episodes = [...sourceByEpisode.keys()].filter((e) => destByEpisode.has(e)).sort((a, b) => a - b)
  const rows: EpisodeRow[] = []
  const matchedSourceFiles = new Set<string>()

  for (const episode of episodes) {
    if (token?.aborted) break

    const pair = pickPair(sourceByEpisode.get(episode)!, destByEpisode.get(episode)!)
    if (!pair) continue
    const [source, dest] = pair
    matchedSourceFiles.add(source.file)
    const sourcePath = source.file
    const destPath = dest.file
    const key = episodeKey(source.season ?? dest.season, episode)!

    rows.push(await buildEpisodeRow(mkvmergePath, mkvextractPath, key, sourcePath, destPath, onLog))
  }

  const unmatchedSource = [...sourceByEpisode.values()]
    .flat()
    .filter((c) => !matchedSourceFiles.has(c.file))
    .map((c) => basename(c.file))

  const aborted = token?.aborted ?? false
  onLog({
    level: 'info',
    message: aborted
      ? `Escaneamento abortado: ${rows.length} episodios casados antes de parar.`
      : `Encontrados ${rows.length} episodios casados.`
  })

  return { rows, warnings, unmatchedSource, aborted }
}

// Modo "filme": filmes nao tem numero de episodio pra parear automaticamente
// (scanFolders exigiria isso e so geraria avisos de "nao identifiquei
// episodio"), entao aqui o usuario ja escolhe direto os dois arquivos - o de
// origem (com a legenda ptbr) e o de destino (sem legenda) - e o app monta
// uma unica linha pra esse par, reaproveitando a mesma logica de
// sondagem/deteccao de faixa PT-BR do pareamento automatico.
export async function scanMovie(
  mkvmergePath: string,
  mkvextractPath: string,
  sourceFile: string,
  destFile: string,
  onLog: LogFn
): Promise<ScanResult> {
  const key = basename(sourceFile, extname(sourceFile))
  const row = await buildEpisodeRow(mkvmergePath, mkvextractPath, key, sourceFile, destFile, onLog)
  onLog({ level: 'info', message: `Filme pronto para transferir: ${row.sourceName} -> ${row.destName}` })
  return { rows: [row], warnings: [], unmatchedSource: [], aborted: false }
}

// Modo "apenas limpar": nao ha par origem/destino, cada arquivo da pasta
// informada e tratado sozinho (sourcePath === destPath). O dropdown de
// legenda usa as proprias faixas do arquivo; selectedTrackId comeca em
// null (mantem todas as legendas) - o usuario escolhe manualmente qual
// faixa manter quando quiser remover as demais.
export async function scanForClean(
  mkvmergePath: string,
  folder: string,
  onLog: LogFn,
  token?: CancellationToken
): Promise<ScanResult> {
  const files = listVideoFiles(folder)
  const rows: EpisodeRow[] = []
  const warnings: string[] = []

  for (const file of files) {
    if (token?.aborted) break

    let tracks: SubtitleTrack[]
    try {
      tracks = await probeSubtitleTracks(mkvmergePath, file)
    } catch (err) {
      onLog({ level: 'error', message: `Falha ao ler faixas de ${basename(file)}: ${(err as Error).message}` })
      tracks = []
    }

    const [season, episode] = findEpisode(basename(file))
    const key = episodeKey(season, episode) ?? basename(file)

    rows.push({
      id: file,
      episodeKey: key,
      sourcePath: file,
      sourceName: basename(file),
      destPath: file,
      destName: basename(file),
      tracks,
      selectedTrackId: null,
      firstLineTargetText: '',
      manualOffsetText: ''
    })
  }

  const aborted = token?.aborted ?? false
  onLog({
    level: 'info',
    message: aborted
      ? `Escaneamento abortado: ${rows.length} arquivos lidos antes de parar.`
      : `Encontrados ${rows.length} arquivos na pasta.`
  })

  return { rows, warnings, unmatchedSource: [], aborted }
}

// Se removeEnglishAudio estiver ligado, devolve a lista de IDs de faixas de
// audio a manter (todas menos as em ingles). Retorna undefined quando nao ha
// nada a filtrar (recurso desligado, sem faixas em ingles, ou remover as
// faixas em ingles deixaria o arquivo sem nenhum audio) - nesses casos o
// mkvmerge mantem todas as faixas de audio originais.
async function resolveAudioTrackFilter(
  mkvmergePath: string,
  destPath: string,
  removeEnglishAudio: boolean,
  episodeKeyForLog: string,
  onLog: LogFn
): Promise<number[] | undefined> {
  if (!removeEnglishAudio) return undefined

  let audioTracks
  try {
    audioTracks = await probeAudioTracks(mkvmergePath, destPath)
  } catch (err) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] falha ao ler faixas de audio de ${basename(destPath)}: ${(err as Error).message}`
    })
    return undefined
  }

  const keepIds = audioTracks.filter((t) => !isEnglishAudio(t.language)).map((t) => t.trackId)
  if (keepIds.length === audioTracks.length) return undefined // nenhuma faixa em ingles encontrada
  if (keepIds.length === 0) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] todas as faixas de audio sao em ingles - mantendo todas por seguranca`
    })
    return undefined
  }
  return keepIds
}

// Calcula o deslocamento (ms) a aplicar via --sync, comparando o instante
// da primeira legenda extraida com o instante desejado (row.firstLineTargetText).
// Retorna 0 quando nao ha alvo definido ou quando algo nao pode ser
// interpretado (formato invalido, arquivo sem nenhum evento) - nesses casos
// a legenda mantem o timing original, sem travar a transferencia.
async function resolveOffsetMs(
  subPath: string,
  extension: string,
  firstLineTargetText: string,
  episodeKeyForLog: string,
  onLog: LogFn
): Promise<number> {
  if (!firstLineTargetText.trim()) return 0

  const targetMs = parseTimeCodeToMs(firstLineTargetText)
  if (targetMs === null) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] tempo "${firstLineTargetText}" invalido (use MM:SS,mmm) - mantendo timing original`
    })
    return 0
  }

  const content = decodeSubtitleBuffer(await readFile(subPath))
  const originalMs = parseFirstEventStartMs(content, extension)
  if (originalMs === null) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] nao encontrei nenhuma legenda no arquivo extraido - mantendo timing original`
    })
    return 0
  }

  const offsetMs = targetMs - originalMs
  onLog({
    level: 'info',
    message: `[${episodeKeyForLog}] primeira legenda original em ${formatMsAsTimeCode(originalMs)}, alvo ${formatMsAsTimeCode(targetMs)} (deslocamento de ${offsetMs}ms)`
  })
  return offsetMs
}

// Deslocamento manual informado diretamente pelo usuario (em ms, positivo
// atrasa e negativo adianta), como alternativa ao calculo automatico feito
// por resolveOffsetMs. A UI garante que so um dos dois esteja preenchido por
// vez; aqui so cuidamos de um valor invalido nao travar a transferencia.
function resolveManualOffsetMs(text: string, episodeKeyForLog: string, onLog: LogFn): number {
  const value = Number(text.trim())
  if (!Number.isFinite(value)) {
    onLog({
      level: 'warn',
      message: `[${episodeKeyForLog}] deslocamento manual "${text}" invalido - mantendo timing original`
    })
    return 0
  }

  const offsetMs = Math.round(value)
  onLog({
    level: 'info',
    message: `[${episodeKeyForLog}] aplicando deslocamento manual de ${offsetMs}ms`
  })
  return offsetMs
}

export async function transferRows(
  mkvmergePath: string,
  mkvextractPath: string,
  rows: EpisodeRow[],
  outputDir: string,
  removeEnglishAudio: boolean,
  removeExtraSubtitles: boolean,
  onProgress: (rowId: string, status: RowStatus, message?: string) => void,
  onLog: LogFn,
  token: CancellationToken | undefined,
  naming: NamingConfig
): Promise<TransferSummary> {
  let success = 0
  let failed = 0

  for (const row of rows) {
    if (token?.aborted) break

    const track = row.tracks.find((t) => t.trackId === row.selectedTrackId)
    if (!track) {
      onProgress(row.id, 'error', 'Nenhuma faixa selecionada')
      failed += 1
      continue
    }

    onProgress(row.id, 'extracting')
    onLog({ level: 'info', message: `[${row.episodeKey}] extraindo faixa ${track.trackId} de ${row.sourceName}` })

    const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-'))
    const outputFile = resolveOutputPath(row.destPath, outputDir, naming)
    if (samePath(outputFile, row.destPath)) {
      failed += 1
      onProgress(row.id, 'error', 'Pasta de saida igual a de destino geraria o mesmo nome de arquivo')
      onLog({
        level: 'error',
        message: `[${row.episodeKey}] pasta de saida resultaria no mesmo arquivo do destino (${basename(outputFile)}) - escolha uma pasta de saida diferente`
      })
      await rm(tmpDir, { recursive: true, force: true })
      continue
    }
    try {
      const extension = subtitleExtension(track.codecId)
      const subPath = join(tmpDir, `sub${extension}`)
      await extractSubtitle(mkvextractPath, row.sourcePath, track.trackId, subPath)

      // Legendas ASS costumam depender de fontes customizadas anexadas ao
      // mkv de origem - sem levar essas fontes junto, a legenda transferida
      // perde a formatacao (o player cai pra uma fonte generica).
      let attachments: Awaited<ReturnType<typeof extractAttachments>> = []
      try {
        const sourceAttachments = await probeAttachments(mkvmergePath, row.sourcePath)
        attachments = await extractAttachments(mkvextractPath, row.sourcePath, sourceAttachments, tmpDir)
      } catch (err) {
        onLog({
          level: 'warn',
          message: `[${row.episodeKey}] falha ao copiar fontes anexadas: ${(err as Error).message}`
        })
      }

      const offsetMs = row.manualOffsetText.trim()
        ? resolveManualOffsetMs(row.manualOffsetText, row.episodeKey, onLog)
        : await resolveOffsetMs(subPath, extension, row.firstLineTargetText, row.episodeKey, onLog)

      const keepAudioTrackIds = await resolveAudioTrackFilter(
        mkvmergePath,
        row.destPath,
        removeEnglishAudio,
        row.episodeKey,
        onLog
      )

      // Legendas que ja existem no destino (ex: signs/songs de um raw) nao
      // podem continuar marcadas como padrao, senao o arquivo final fica
      // com duas faixas de legenda "padrao" ao mesmo tempo. So precisa
      // disso quando elas vao ser mantidas - se removeExtraSubtitles esta
      // ligado, elas nem entram no arquivo final.
      let destSubtitleTrackIds: number[] = []
      if (!removeExtraSubtitles) {
        try {
          destSubtitleTrackIds = (await probeSubtitleTracks(mkvmergePath, row.destPath)).map((t) => t.trackId)
        } catch {
          destSubtitleTrackIds = []
        }
      }

      onProgress(row.id, 'muxing')
      const overwriteInfo = existsSync(outputFile) ? ' (sobrescrevendo arquivo existente)' : ''
      const audioInfo = keepAudioTrackIds ? ' (removendo audio em ingles)' : ''
      const fontsInfo = attachments.length > 0 ? ` (com ${attachments.length} fonte(s) anexada(s))` : ''
      const subsInfo = removeExtraSubtitles ? ' (removendo legendas extras do destino)' : ''
      onLog({
        level: 'info',
        message: `[${row.episodeKey}] gerando ${basename(outputFile)}${overwriteInfo}${audioInfo}${fontsInfo}${subsInfo}`
      })

      await muxSubtitleInto(
        mkvmergePath,
        row.destPath,
        subPath,
        outputFile,
        resolveTransferLanguage(track),
        resolveTransferTrackName(track),
        offsetMs,
        keepAudioTrackIds,
        destSubtitleTrackIds,
        attachments,
        removeExtraSubtitles,
        token
      )

      onProgress(row.id, 'done')
      success += 1
      onLog({ level: 'success', message: `[${row.episodeKey}] concluido: ${basename(outputFile)}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'transfer',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: track.trackId,
        language: track.language,
        trackName: track.trackName,
        firstLineTargetText: row.firstLineTargetText,
        appliedOffsetMs: offsetMs,
        status: 'done'
      })
    } catch (err) {
      if (err instanceof OperationAbortedError) {
        // Mata o arquivo de saida parcial (mkvmerge morto no meio da escrita
        // deixa um .mkv truncado/invalido) - melhor esforco, sem travar o
        // abort se a exclusao falhar por qualquer motivo.
        await rm(outputFile, { force: true }).catch(() => {})
        onProgress(row.id, 'idle')
        onLog({ level: 'warn', message: `[${row.episodeKey}] abortado pelo usuario` })
        break
      }
      failed += 1
      const message = (err as Error).message
      onProgress(row.id, 'error', message)
      onLog({ level: 'error', message: `[${row.episodeKey}] ERRO: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'transfer',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: track.trackId,
        language: track.language,
        trackName: track.trackName,
        firstLineTargetText: row.firstLineTargetText,
        appliedOffsetMs: null,
        status: 'error',
        error: message
      })
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  const aborted = token?.aborted ?? false
  const total = rows.length
  onLog({
    level: aborted ? 'warn' : failed ? 'warn' : 'success',
    message: aborted
      ? `Transferencia abortada: ${success}/${total} processados antes de parar${failed ? `, ${failed} com erro` : ''}.`
      : `Transferencia concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed, aborted }
}

// Modo "apenas limpar": remuxa cada arquivo (row.destPath) filtrando faixas -
// mantem so a legenda escolhida (ou todas, se null) e, opcionalmente, remove
// audio em ingles. Sem extracao/adicao de legenda externa.
export async function cleanRows(
  mkvmergePath: string,
  rows: EpisodeRow[],
  outputDir: string,
  removeEnglishAudio: boolean,
  onProgress: (rowId: string, status: RowStatus, message?: string) => void,
  onLog: LogFn,
  token: CancellationToken | undefined,
  naming: NamingConfig
): Promise<TransferSummary> {
  let success = 0
  let failed = 0

  for (const row of rows) {
    if (token?.aborted) break

    const outputFile = resolveCleanOutputPath(row.destPath, outputDir, naming)
    if (samePath(outputFile, row.destPath)) {
      failed += 1
      onProgress(row.id, 'error', 'Pasta de saida igual a de destino geraria o mesmo nome de arquivo')
      onLog({
        level: 'error',
        message: `[${row.episodeKey}] pasta de saida resultaria no mesmo arquivo do destino (${basename(outputFile)}) - escolha uma pasta de saida diferente`
      })
      continue
    }
    onProgress(row.id, 'muxing')

    try {
      const keepAudioTrackIds = await resolveAudioTrackFilter(
        mkvmergePath,
        row.destPath,
        removeEnglishAudio,
        row.episodeKey,
        onLog
      )

      const overwriteInfo = existsSync(outputFile) ? ' (sobrescrevendo arquivo existente)' : ''
      const audioInfo = keepAudioTrackIds ? ' (removendo audio em ingles)' : ''
      const subInfo =
        row.selectedTrackId !== null ? ` (mantendo somente legenda #${row.selectedTrackId})` : ''
      onLog({
        level: 'info',
        message: `[${row.episodeKey}] gerando ${basename(outputFile)}${overwriteInfo}${audioInfo}${subInfo}`
      })

      await cleanTracksInto(mkvmergePath, row.destPath, outputFile, row.selectedTrackId, keepAudioTrackIds, token)

      onProgress(row.id, 'done')
      success += 1
      onLog({ level: 'success', message: `[${row.episodeKey}] concluido: ${basename(outputFile)}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'clean',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: row.selectedTrackId,
        language: null,
        trackName: null,
        firstLineTargetText: '',
        appliedOffsetMs: null,
        status: 'done'
      })
    } catch (err) {
      if (err instanceof OperationAbortedError) {
        await rm(outputFile, { force: true }).catch(() => {})
        onProgress(row.id, 'idle')
        onLog({ level: 'warn', message: `[${row.episodeKey}] abortado pelo usuario` })
        break
      }
      failed += 1
      const message = (err as Error).message
      onProgress(row.id, 'error', message)
      onLog({ level: 'error', message: `[${row.episodeKey}] ERRO: ${message}` })
      await appendTransferLog({
        timestamp: new Date().toISOString(),
        kind: 'clean',
        episodeKey: row.episodeKey,
        sourceFile: row.sourcePath,
        destFile: row.destPath,
        outputFile,
        trackId: row.selectedTrackId,
        language: null,
        trackName: null,
        firstLineTargetText: '',
        appliedOffsetMs: null,
        status: 'error',
        error: message
      })
    }
  }

  const aborted = token?.aborted ?? false
  const total = rows.length
  onLog({
    level: aborted ? 'warn' : failed ? 'warn' : 'success',
    message: aborted
      ? `Limpeza abortada: ${success}/${total} processados antes de parar${failed ? `, ${failed} com erro` : ''}.`
      : `Limpeza concluida: ${success}/${total} com sucesso${failed ? `, ${failed} com erro` : ''}.`
  })

  return { total, success, failed, aborted }
}

// Extrai uma faixa de legenda e devolve suas falas ja parseadas (timestamp +
// texto), para a tela de auto-sync manual (escolher visualmente a "mesma
// fala" em ingles e ptbr).
async function extractSubtitleEvents(
  mkvextractPath: string,
  filePath: string,
  track: SubtitleTrack
): Promise<SubtitleEvent[]> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'transfer-sub-events-'))
  try {
    const extension = subtitleExtension(track.codecId)
    const tmpPath = join(tmpDir, `evt${extension}`)
    await extractSubtitle(mkvextractPath, filePath, track.trackId, tmpPath)
    const content = decodeSubtitleBuffer(await readFile(tmpPath))
    return parseSubtitleEvents(content, extension)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

// Monta os dados iniciais da tela de auto-sync manual: as falas da legenda
// ptbr ja escolhida na linha (origem), a lista de faixas de legenda do
// destino, e as falas ja extraidas da faixa em ingles (preferida de um
// episodio anterior, ou a sugerida por idioma).
//
// O lado da origem (sondar + extrair a legenda ptbr) e o lado do destino
// (sondar + extrair a legenda em ingles) nao dependem um do outro - rodar em
// paralelo via Promise.all faz o tempo total ficar limitado pelo lado mais
// lento, nao pela soma dos dois. A extracao do lado do destino ja acontece
// aqui dentro (em vez de uma segunda chamada separada depois) porque so
// assim ela roda de fato em paralelo com a da origem.
export async function prepareSync(
  mkvmergePath: string,
  mkvextractPath: string,
  sourcePath: string,
  sourceTrackId: number,
  destPath: string,
  preferredEnTrackId: number | null
): Promise<SyncPrepareResult> {
  const [ptEvents, destResult] = await Promise.all([
    (async () => {
      const sourceTracks = await probeSubtitleTracks(mkvmergePath, sourcePath)
      const ptTrack = sourceTracks.find((t) => t.trackId === sourceTrackId)
      return ptTrack ? extractSubtitleEvents(mkvextractPath, sourcePath, ptTrack) : []
    })(),
    (async () => {
      const destTracks = await probeSubtitleTracks(mkvmergePath, destPath)
      const suggested = destTracks.find((t) => isEnglishAudio(t.language))
      const chosen =
        preferredEnTrackId !== null && destTracks.some((t) => t.trackId === preferredEnTrackId)
          ? destTracks.find((t) => t.trackId === preferredEnTrackId)!
          : suggested
      const enEvents = chosen ? await extractSubtitleEvents(mkvextractPath, destPath, chosen) : []
      return {
        destTracks,
        suggestedEnTrackId: suggested?.trackId ?? null,
        chosenEnTrackId: chosen?.trackId ?? null,
        enEvents
      }
    })()
  ])

  return { ptEvents, ...destResult }
}

// Devolve as falas de uma faixa de legenda especifica - usado pela tela de
// auto-sync manual quando o usuario troca a faixa em ingles sugerida.
export async function getTrackEvents(
  mkvmergePath: string,
  mkvextractPath: string,
  filePath: string,
  trackId: number
): Promise<SubtitleEvent[]> {
  const tracks = await probeSubtitleTracks(mkvmergePath, filePath)
  const track = tracks.find((t) => t.trackId === trackId)
  return track ? extractSubtitleEvents(mkvextractPath, filePath, track) : []
}
