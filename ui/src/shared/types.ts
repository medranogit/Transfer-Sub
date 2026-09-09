export interface SubtitleTrack {
  trackId: number
  trackNumber: number
  codecId: string
  language: string
  trackName: string
  isAss: boolean
  isPtBr: boolean
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
  firstLineTargetText: string
  manualOffsetText: string
  syncTrackId: number | null
}

export interface ScanResult {
  rows: EpisodeRow[]
  warnings: string[]
  unmatchedSource: string[]
  aborted: boolean
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
  mkvpropeditPath?: string
}

export interface NamingConfig {
  tagEnabled: boolean
  tagWord: string
}

export interface TransferDefaults {
  movieMode: boolean
  removeEnglishAudio: boolean
  removeExtraSubtitles: boolean
}

export interface CleanDefaults {
  removeEnglishAudio: boolean
}

export interface RenameDefaults {
  movieMode: boolean
}

export interface AppConfig {
  sourceDir: string
  destDir: string
  outputDir: string
  mkvToolNixDir: string
  namingTransfer: NamingConfig
  namingClean: NamingConfig
  transferDefaults: TransferDefaults
  cleanDefaults: CleanDefaults
  renameDefaults: RenameDefaults
  outputFolderName: string
  muteSounds: boolean
  ptBrTrackName: string
  renameFolder: string
  renameFansubPresets: string[]
  renameTagPresets: string[]
  movieSourceFile: string
  movieDestFile: string
}

export interface TransferRequest {
  rows: EpisodeRow[]
  outputDir: string
  removeEnglishAudio: boolean
  removeExtraSubtitles: boolean
}

export interface TransferSummary {
  total: number
  success: number
  failed: number
  aborted: boolean
}

export interface SubtitleEvent {
  startMs: number
  text: string
  imageDataUrl?: string
}

export interface SyncPrepareResult {
  ptEvents: SubtitleEvent[]
  destTracks: SubtitleTrack[]
  suggestedEnTrackId: number | null
  chosenEnTrackId: number | null
  enEvents: SubtitleEvent[]
}

export interface TransferLogEntry {
  timestamp: string
  kind?: 'transfer' | 'clean' | 'rename'
  episodeKey: string
  sourceFile: string
  destFile: string
  outputFile: string
  trackId: number | null
  language: string | null
  trackName: string | null
  firstLineTargetText: string
  appliedOffsetMs: number | null
  status: 'done' | 'error'
  error?: string
}

export interface RenameFields {
  fansub: string
  animeName: string
  season: number
  tags: string
  movieMode: boolean
}

export interface DetectedRenameFields {
  fansub: string
  animeName: string
  season: number
  tags: string
}

export interface RenamePreviewRow {
  id: string
  originalPath: string
  originalName: string
  newName: string | null
  skipReason: string | null
  episodeKey: string | null
}

export interface RenamePreviewResult {
  rows: RenamePreviewRow[]
  detected: DetectedRenameFields | null
  warnings: string[]
}

export interface RenameSummary {
  total: number
  success: number
  failed: number
}

export interface SessionLogInfo {
  id: string
  label: string
  current: boolean
}
