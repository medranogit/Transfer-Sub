import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig,
  LogEvent,
  MkvToolsStatus,
  ScanResult,
  SubtitleEvent,
  SyncPrepareResult,
  TransferProgressEvent,
  TransferRequest,
  TransferSummary
} from '@shared/types'

const api = {
  loadConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:load'),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', config),

  chooseFolder: (initialPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:chooseFolder', initialPath),

  locateMkvTools: (configuredDir?: string): Promise<MkvToolsStatus> =>
    ipcRenderer.invoke('mkvtools:locate', configuredDir),
  chooseMkvToolsDir: (): Promise<MkvToolsStatus> => ipcRenderer.invoke('mkvtools:chooseDir'),

  scan: (sourceDir: string, destDir: string): Promise<ScanResult> =>
    ipcRenderer.invoke('scan:run', { sourceDir, destDir }),

  scanClean: (folder: string): Promise<ScanResult> => ipcRenderer.invoke('scan:clean', { folder }),

  transfer: (request: TransferRequest): Promise<TransferSummary> =>
    ipcRenderer.invoke('transfer:run', request),

  clean: (request: TransferRequest): Promise<TransferSummary> => ipcRenderer.invoke('clean:run', request),

  prepareSync: (sourcePath: string, sourceTrackId: number, destPath: string): Promise<SyncPrepareResult> =>
    ipcRenderer.invoke('sync:prepare', { sourcePath, sourceTrackId, destPath }),

  getTrackEvents: (filePath: string, trackId: number): Promise<SubtitleEvent[]> =>
    ipcRenderer.invoke('sync:trackEvents', { filePath, trackId }),

  onLog: (callback: (event: LogEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: LogEvent): void => callback(payload)
    ipcRenderer.on('log', listener)
    return () => ipcRenderer.removeListener('log', listener)
  },

  onTransferProgress: (callback: (event: TransferProgressEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: TransferProgressEvent): void => callback(payload)
    ipcRenderer.on('transfer:progress', listener)
    return () => ipcRenderer.removeListener('transfer:progress', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
