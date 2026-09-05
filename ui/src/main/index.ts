import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { loadConfig, saveConfig } from './infra/configStore'
import { locateMkvToolNix, MkvToolsNotFoundError } from './infra/mkvToolNixLocator'
import { cleanRows, scanForClean, scanFolders, transferRows } from './workflow'
import type { AppConfig, MkvToolsStatus, TransferRequest } from '@shared/types'

// Tamanho inicial da janela do app - ajuste aqui.
const WINDOW_WIDTH = 1600
const WINDOW_HEIGHT = 1000

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 900,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14151a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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
    const { mkvmerge, mkvextract } = locateMkvToolNix(configuredDir)
    return { found: true, mkvmergePath: mkvmerge, mkvextractPath: mkvextract }
  } catch (err) {
    if (err instanceof MkvToolsNotFoundError) return { found: false }
    throw err
  }
}

app.whenReady().then(() => {
  ipcMain.handle('config:load', (): AppConfig => loadConfig())
  ipcMain.handle('config:save', (_e, config: AppConfig) => saveConfig(config))

  ipcMain.handle('dialog:chooseFolder', async (_e, initialPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      defaultPath: initialPath || undefined
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
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
    return scanFolders(status.mkvmergePath, status.mkvextractPath, sourceDir, destDir, (log) => {
      mainWindow?.webContents.send('log', log)
    })
  })

  ipcMain.handle('scan:clean', async (_e, { folder }: { folder: string }) => {
    const status = tryLocate(loadConfig().mkvToolNixDir)
    if (!status.found || !status.mkvmergePath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    return scanForClean(status.mkvmergePath, folder, (log) => {
      mainWindow?.webContents.send('log', log)
    })
  })

  ipcMain.handle('transfer:run', async (_e, request: TransferRequest) => {
    const status = tryLocate(loadConfig().mkvToolNixDir)
    if (!status.found || !status.mkvmergePath || !status.mkvextractPath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    return transferRows(
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
      }
    )
  })

  ipcMain.handle('clean:run', async (_e, request: TransferRequest) => {
    const status = tryLocate(loadConfig().mkvToolNixDir)
    if (!status.found || !status.mkvmergePath) {
      throw new Error('MKVToolNix nao localizado.')
    }
    return cleanRows(
      status.mkvmergePath,
      request.rows,
      request.outputDir,
      request.removeEnglishAudio,
      (rowId, statusValue, message) => {
        mainWindow?.webContents.send('transfer:progress', { rowId, status: statusValue, message })
      },
      (log) => {
        mainWindow?.webContents.send('log', log)
      }
    )
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
