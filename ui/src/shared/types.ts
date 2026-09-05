export interface SubtitleTrack {
  trackId: number
  codecId: string
  language: string
  trackName: string
  isAss: boolean
  isPtBr: boolean
  // true quando nenhuma faixa foi reconhecida como PT-BR por idioma/nome e
  // o conteudo da legenda parece portugues mesmo assim (fansub rotulou
  // errado). E so um palpite - ver domain/subtitleLanguage.ts.
  isPtBrGuess: boolean
}

export interface EpisodeRow {
  id: string
  episodeKey: string
  sourcePath: string
  sourceName: string
  destPath: string
  destName: string
  tracks: SubtitleTrack[]
  selectedTrackId: number | null
  // Instante em que a primeira legenda deve aparecer no video de destino,
  // no formato "MM:SS,mmm" (ex: "06:39,566") ou "H:MM:SS,mmm". Vazio = usar
  // o timing original, sem ajuste. O deslocamento e calculado no processo
  // principal a partir da legenda extraida. Mutuamente exclusivo com
  // manualOffsetText (a UI limpa um quando o outro e preenchido).
  firstLineTargetText: string
  // Deslocamento manual em milissegundos (positivo atrasa, negativo adianta),
  // como alternativa a firstLineTargetText. Vazio = nao aplicar deslocamento
  // manual (usa firstLineTargetText, se preenchido, ou o timing original).
  manualOffsetText: string
}

export interface ScanResult {
  rows: EpisodeRow[]
  warnings: string[]
  unmatchedSource: string[]
}

export type RowStatus = 'idle' | 'extracting' | 'muxing' | 'done' | 'error'

export interface TransferProgressEvent {
  rowId: string
  status: RowStatus
  message?: string
}

export interface LogEvent {
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
}

export interface MkvToolsStatus {
  found: boolean
  mkvmergePath?: string
  mkvextractPath?: string
}

export interface AppConfig {
  sourceDir: string
  destDir: string
  outputDir: string
  mkvToolNixDir: string
}

export interface TransferRequest {
  rows: EpisodeRow[]
  outputDir: string
  removeEnglishAudio: boolean
  // Remove as legendas que ja existiam no destino, deixando so a faixa
  // transferida. So se aplica ao modo Transferir (o modo Limpar ja tem seu
  // proprio controle por linha).
  removeExtraSubtitles: boolean
}

export interface TransferSummary {
  total: number
  success: number
  failed: number
}
