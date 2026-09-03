export interface SubtitleTrack {
  trackId: number
  codecId: string
  language: string
  trackName: string
  isAss: boolean
  isPtBr: boolean
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
  level: 'info' | 'warn' | 'error'
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
}

export interface TransferSummary {
  total: number
  success: number
  failed: number
}
