import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { exportConfig, importConfig, loadConfig, saveConfig } from './infra/configStore'
import { locateMkvToolNix, MkvToolsNotFoundError } from './infra/mkvToolNixLocator'
import { clearTransferLog, loadTransferLog } from './infra/transferLog'
import { appendSessionLog, listSessionLogs, pruneOldSessionLogs, readSessionLog } from './infra/sessionLog'
import { CancellationToken } from './infra/cancellation'
import {
  cleanRows,
  getTrackEvents,
  prepareSync,
  renameSubtitleTracks,
  scanForClean,
  scanFolders,
  scanMovie,
  transferRows
} from './workflow'
import { VIDEO_EXTS } from './infra/videoFiles'
import { applyRename, previewRename, recomputeRename } from './renamer'
import type {
  AppConfig,
  LogEvent,
  MkvToolsStatus,
  RenameFields,
  RenamePreviewRow,
  TransferRequest
} from '@shared/types'

const WINDOW_WIDTH = 1750
const WINDOW_HEIGHT = 1000

const DEFAULT_ZOOM_FACTOR = 1
const ZOOM_STEP = 0.1
const MAX_ZOOM_STEPS = 2
const MIN_ZOOM_FACTOR = DEFAULT_ZOOM_FACTOR - ZOOM_STEP * MAX_ZOOM_STEPS
const MAX_ZOOM_FACTOR = DEFAULT_ZOOM_FACTOR + ZOOM_STEP * MAX_ZOOM_STEPS

let mainWindow: BrowserWindow | null = null
let activeToken: CancellationToken | null = null

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 900,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14151a',
    icon: is_dev() ? join(__dirname, '../../build/icon.ico') : undefined,
    title: `Transfer Sub - v${app.getVersion()}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setZoomFactor(DEFAULT_ZOOM_FACTOR)

  mainWindow.on('page-title-updated', (event) => event.preventDefault())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is_dev() && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function is_dev(): boolean {
  return !app.isPackaged
}

function tryLocate(configuredDir?: string): MkvToolsStatus {
  try {
    const { mkvmerge, mkvextract, mkvpropedit } = locateMkvToolNix(configuredDir)
    return { found: true, mkvmergePath: mkvmerge, mkvextractPath: mkvextract, mkvpropeditPath: mkvpropedit }
  } catch (err) {
    if (err instanceof MkvToolsNotFoundError) return { found: false }
    throw err
  }
}

function sendLog(level: LogEvent['level'], message: string): void {
  mainWindow?.webContents.send('log', { level, message })
}

function sendNotification(message: string): void {
  mainWindow?.webContents.send('notification', message)
}

let autoUpdaterInitialized = false
let manualUpdateCheckPending = false

function setupAutoUpdater(): void {
  if (!app.isPackaged || autoUpdaterInitialized) return
  autoUpdaterInitialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => sendLog('info', 'Verificando atualizacoes...'))
  autoUpdater.on('update-not-available', () => {
    sendLog('info', 'Nenhuma atualizacao disponivel - esta e a versao mais recente.')
    if (manualUpdateCheckPending) {
      sendNotification('Nenhuma atualizacao disponivel - voce ja esta na versao mais recente.')
      manualUpdateCheckPending = false
    }
  })
  autoUpdater.on('update-available', (info) => {
    sendLog('info', `Atualizacao disponivel: v${info.version} - baixando...`)
    manualUpdateCheckPending = false
  })
  autoUpdater.on('error', (err) => {
    sendLog('error', `Falha ao verificar atualizacoes: ${err.message}`)
    manualUpdateCheckPending = false
  })
  autoUpdater.on('update-downloaded', async (info) => {
    sendLog('success', `Atualizacao v${info.version} baixada.`)
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualizacao pronta',
      message: `A versao ${info.version} foi baixada.`,
      detail:
        'Reinicie agora pra aplicar, ou continue usando normalmente - a atualizacao e instalada ' +
        'sozinha na proxima vez que voce fechar o app.'
    })
    if (result.response === 0) autoUpdater.quitAndInstall()
  })

  checkForUpdates()
}

function checkForUpdates(): void {
  autoUpdater
    .checkForUpdates()
    .catch((err) => sendLog('error', `Falha ao verificar atualizacoes: ${(err as Error).message}`))
}

if (gotSingleInstanceLock) {
app.whenReady().then(() => {
  ipcMain.handle('config:load', (): AppConfig => loadConfig())
  ipcMain.handle('config:save', (_e, config: AppConfig) => saveConfig(config))

  ipcMain.handle('config:export', async (): Promise<boolean> => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exportar configuracoes',
      defaultPath: 'transfer-sub-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    exportConfig(result.filePath)
    return true
  })

  ipcMain.handle('config:import', async (): Promise<AppConfig | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Importar configuracoes',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      return importConfig(result.filePaths[0])
    } catch (err) {
      throw new Error(`Arquivo de configuracoes invalido: ${(err as Error).message}`)
    }
  })

  ipcMain.handle('zoom:in', (): number => {
    const wc = mainWindow?.webContents
    if (!wc) return DEFAULT_ZOOM_FACTOR
    const next = Math.min(MAX_ZOOM_FACTOR, wc.getZoomFactor() + ZOOM_STEP)
    wc.setZoomFactor(next)
    return next
  })
  ipcMain.handle('zoom:out', (): number => {
    const wc = mainWindow?.webContents
    if (!wc) return DEFAULT_ZOOM_FACTOR
    const next = Math.max(MIN_ZOOM_FACTOR, wc.getZoomFactor() - ZOOM_STEP)
    wc.setZoomFactor(next)
    return next
  })
  ipcMain.handle('zoom:reset', (): number => {
    mainWindow?.webContents.setZoomFactor(DEFAULT_ZOOM_FACTOR)
    return DEFAULT_ZOOM_FACTOR
  })

  ipcMain.handle('dialog:chooseFolder', async (_e, initialPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      defaultPath: initialPath || undefined
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:chooseFile', async (_e, initialPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      defaultPath: initialPath || undefined,
      filters: [
        { name: 'Videos', extensions: [...VIDEO_EXTS].map((ext) => ext.slice(1)) },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('shell:openFolder', (_e, folderPath: string) => {
    if (folderPath) shell.openPath(folderPath)
  })

  ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => {
    if (filePath) shell.showItemInFolder(filePath)
  })

  ipcMain.handle('mkvtools:locate', (_e, configuredDir?: string) => tryLocate(configuredDir))

  ipcMain.handle('mkvtools:chooseDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return tryLocate()
    const chosenDir = result.filePaths[0]
    const status = tryLocate(chosenDir)
    if (status.found) {
      saveConfig({ ...loadConfig(), mkvToolNixDir: chosenDir })
    }
    return status
  })

  ipcMain.handle('scan:run', async (_e, { sourceDir, destDir }: { sourceDir: string; destDir: string }) => {
    const status = tryLocate(loadConfig().mkvToolNixDir)
    if (!status.found || !status.mkvmergePath || !status.mkvextractPath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    const token = new CancellationToken()
    activeToken = token
    try {
      return await scanFolders(
        status.mkvmergePath,
        status.mkvextractPath,
        sourceDir,
        destDir,
        (log) => {
          mainWindow?.webContents.send('log', log)
        },
        token
      )
    } finally {
      if (activeToken === token) activeToken = null
    }
  })

  ipcMain.handle(
    'scan:movie',
    async (_e, { sourceFile, destFile }: { sourceFile: string; destFile: string }) => {
      const status = tryLocate(loadConfig().mkvToolNixDir)
      if (!status.found || !status.mkvmergePath || !status.mkvextractPath) {
        throw new Error('MKVToolNix nao localizado.')
      }
      return scanMovie(status.mkvmergePath, status.mkvextractPath, sourceFile, destFile, (log) => {
        mainWindow?.webContents.send('log', log)
      })
    }
  )

  ipcMain.handle('scan:clean', async (_e, { folder }: { folder: string }) => {
    const status = tryLocate(loadConfig().mkvToolNixDir)
    if (!status.found || !status.mkvmergePath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    const token = new CancellationToken()
    activeToken = token
    try {
      return await scanForClean(
        status.mkvmergePath,
        folder,
        (log) => {
          mainWindow?.webContents.send('log', log)
        },
        token
      )
    } finally {
      if (activeToken === token) activeToken = null
    }
  })

  ipcMain.handle('transfer:run', async (_e, request: TransferRequest) => {
    const config = loadConfig()
    const status = tryLocate(config.mkvToolNixDir)
    if (!status.found || !status.mkvmergePath || !status.mkvextractPath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    const token = new CancellationToken()
    activeToken = token
    try {
      return await transferRows(
        status.mkvmergePath,
        status.mkvextractPath,
        request.rows,
        request.outputDir,
        request.removeEnglishAudio,
        request.removeExtraSubtitles,
        (rowId, statusValue, message) => {
          mainWindow?.webContents.send('transfer:progress', { rowId, status: statusValue, message })
        },
        (log) => {
          mainWindow?.webContents.send('log', log)
        },
        token,
        config.namingTransfer,
        config.ptBrTrackName,
        config.outputFolderName
      )
    } finally {
      if (activeToken === token) activeToken = null
    }
  })

  ipcMain.handle('operation:abort', () => {
    activeToken?.abort()
  })

  ipcMain.handle(
    'sync:prepare',
    async (
      _e,
      {
        sourcePath,
        sourceTrackId,
        destPath,
        preferredEnTrackId
      }: { sourcePath: string; sourceTrackId: number; destPath: string; preferredEnTrackId: number | null }
    ) => {
      const status = tryLocate(loadConfig().mkvToolNixDir)
      if (!status.found || !status.mkvmergePath || !status.mkvextractPath) {
        throw new Error('MKVToolNix nao localizado.')
      }
      return prepareSync(
        status.mkvmergePath,
        status.mkvextractPath,
        sourcePath,
        sourceTrackId,
        destPath,
        preferredEnTrackId
      )
    }
  )

  ipcMain.handle('sync:trackEvents', async (_e, { filePath, trackId }: { filePath: string; trackId: number }) => {
    const status = tryLocate(loadConfig().mkvToolNixDir)
    if (!status.found || !status.mkvmergePath || !status.mkvextractPath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    return getTrackEvents(status.mkvmergePath, status.mkvextractPath, filePath, trackId)
  })

  ipcMain.handle('transferLog:load', () => loadTransferLog())
  ipcMain.handle('transferLog:clear', () => clearTransferLog())

  ipcMain.handle('sessionLog:append', (_e, entry: LogEvent) => appendSessionLog(entry))
  ipcMain.handle('sessionLog:list', () => listSessionLogs())
  ipcMain.handle('sessionLog:read', (_e, id: string) => readSessionLog(id))
  pruneOldSessionLogs().catch(() => {})

  ipcMain.handle('clean:run', async (_e, request: TransferRequest) => {
    const config = loadConfig()
    const status = tryLocate(config.mkvToolNixDir)
    if (!status.found || !status.mkvmergePath || !status.mkvextractPath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    const token = new CancellationToken()
    activeToken = token
    try {
      return await cleanRows(
        status.mkvmergePath,
        status.mkvextractPath,
        request.rows,
        request.outputDir,
        request.removeEnglishAudio,
        (rowId, statusValue, message) => {
          mainWindow?.webContents.send('transfer:progress', { rowId, status: statusValue, message })
        },
        (log) => {
          mainWindow?.webContents.send('log', log)
        },
        token,
        config.namingClean,
        config.outputFolderName
      )
    } finally {
      if (activeToken === token) activeToken = null
    }
  })

  ipcMain.handle('rename:preview', (_e, { folder, fields }: { folder: string; fields: RenameFields }) =>
    previewRename(folder, fields)
  )

  ipcMain.handle('rename:recompute', (_e, { paths, fields }: { paths: string[]; fields: RenameFields }) =>
    recomputeRename(paths, fields)
  )

  ipcMain.handle('rename:apply', (_e, rows: RenamePreviewRow[]) =>
    applyRename(rows, (log) => {
      mainWindow?.webContents.send('log', log)
    })
  )

  ipcMain.handle('rename:tracks', async (_e, { paths }: { paths: string[] }) => {
    const config = loadConfig()
    const status = tryLocate(config.mkvToolNixDir)
    if (!status.found || !status.mkvmergePath || !status.mkvextractPath || !status.mkvpropeditPath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    return renameSubtitleTracks(
      status.mkvmergePath,
      status.mkvextractPath,
      status.mkvpropeditPath,
      paths,
      config.ptBrTrackName,
      (log) => {
        mainWindow?.webContents.send('log', log)
      }
    )
  })

  ipcMain.handle('updates:check', () => {
    if (!app.isPackaged) {
      sendLog('info', 'Verificacao de atualizacoes desativada em modo desenvolvimento.')
      return
    }
    manualUpdateCheckPending = true
    checkForUpdates()
  })

  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
}
