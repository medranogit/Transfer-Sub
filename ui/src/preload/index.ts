import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig,
  ConvertRequest,
  ConvertScanResult,
  LogEvent,
  MkvToolsStatus,
  RenameFields,
  RenamePreviewResult,
  RenamePreviewRow,
  RenameSummary,
  ScanResult,
  SessionLogInfo,
  SubtitleEvent,
  SyncPrepareResult,
  TransferLogEntry,
  TransferProgressEvent,
  TransferRequest,
  TransferSummary
} from '@shared/types'

const api = {
  loadConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:load'),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', config),
  exportConfig: (): Promise<boolean> => ipcRenderer.invoke('config:export'),
  importConfig: (): Promise<AppConfig | null> => ipcRenderer.invoke('config:import'),

  chooseFolder: (initialPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:chooseFolder', initialPath),

  chooseFile: (initialPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:chooseFile', initialPath),

  chooseSubtitleFile: (initialPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:chooseSubtitleFile', initialPath),

  openFolder: (folderPath: string): Promise<void> => ipcRenderer.invoke('shell:openFolder', folderPath),
  showItemInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:showItemInFolder', filePath),

  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updates:check'),

  locateMkvTools: (configuredDir?: string): Promise<MkvToolsStatus> =>
    ipcRenderer.invoke('mkvtools:locate', configuredDir),
  chooseMkvToolsDir: (): Promise<MkvToolsStatus> => ipcRenderer.invoke('mkvtools:chooseDir'),

  scan: (sourceDir: string, destDir: string): Promise<ScanResult> =>
    ipcRenderer.invoke('scan:run', { sourceDir, destDir }),

  scanClean: (folder: string): Promise<ScanResult> => ipcRenderer.invoke('scan:clean', { folder }),

  scanMovie: (sourceFile: string, destFile: string): Promise<ScanResult> =>
    ipcRenderer.invoke('scan:movie', { sourceFile, destFile }),

  transfer: (request: TransferRequest): Promise<TransferSummary> =>
    ipcRenderer.invoke('transfer:run', request),

  clean: (request: TransferRequest): Promise<TransferSummary> => ipcRenderer.invoke('clean:run', request),

  scanConvert: (folder: string): Promise<ConvertScanResult> => ipcRenderer.invoke('scan:convert', { folder }),

  convert: (request: ConvertRequest): Promise<TransferSummary> => ipcRenderer.invoke('convert:run', request),

  abortOperation: (): Promise<void> => ipcRenderer.invoke('operation:abort'),

  prepareSync: (
    sourcePath: string,
    sourceTrackId: number,
    destPath: string,
    preferredEnTrackId: number | null
  ): Promise<SyncPrepareResult> =>
    ipcRenderer.invoke('sync:prepare', { sourcePath, sourceTrackId, destPath, preferredEnTrackId }),

  getTrackEvents: (filePath: string, trackId: number): Promise<SubtitleEvent[]> =>
    ipcRenderer.invoke('sync:trackEvents', { filePath, trackId }),

  getExternalSubtitleEvents: (filePath: string): Promise<SubtitleEvent[]> =>
    ipcRenderer.invoke('sync:externalEvents', filePath),

  loadTransferLog: (): Promise<TransferLogEntry[]> => ipcRenderer.invoke('transferLog:load'),
  clearTransferLog: (): Promise<void> => ipcRenderer.invoke('transferLog:clear'),

  appendSessionLog: (entry: LogEvent): Promise<void> => ipcRenderer.invoke('sessionLog:append', entry),
  listSessionLogs: (): Promise<SessionLogInfo[]> => ipcRenderer.invoke('sessionLog:list'),
  readSessionLog: (id: string): Promise<string> => ipcRenderer.invoke('sessionLog:read', id),

  previewRename: (folder: string, fields: RenameFields): Promise<RenamePreviewResult> =>
    ipcRenderer.invoke('rename:preview', { folder, fields }),

  recomputeRename: (paths: string[], fields: RenameFields): Promise<RenamePreviewRow[]> =>
    ipcRenderer.invoke('rename:recompute', { paths, fields }),

  applyRename: (rows: RenamePreviewRow[]): Promise<RenameSummary> => ipcRenderer.invoke('rename:apply', rows),

  renameSubtitleTracks: (paths: string[]): Promise<RenameSummary> =>
    ipcRenderer.invoke('rename:tracks', { paths }),

  onLog: (callback: (event: LogEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: LogEvent): void => callback(payload)
    ipcRenderer.on('log', listener)
    return () => ipcRenderer.removeListener('log', listener)
  },

  onNotification: (callback: (message: string) => void): (() => void) => {
    const listener = (_e: unknown, message: string): void => callback(message)
    ipcRenderer.on('notification', listener)
    return () => ipcRenderer.removeListener('notification', listener)
  },

  onTransferProgress: (callback: (event: TransferProgressEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: TransferProgressEvent): void => callback(payload)
    ipcRenderer.on('transfer:progress', listener)
    return () => ipcRenderer.removeListener('transfer:progress', listener)
  },

  zoomIn: (): Promise<number> => ipcRenderer.invoke('zoom:in'),
  zoomOut: (): Promise<number> => ipcRenderer.invoke('zoom:out'),
  zoomReset: (): Promise<number> => ipcRenderer.invoke('zoom:reset')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
