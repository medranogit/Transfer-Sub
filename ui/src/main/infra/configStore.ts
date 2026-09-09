import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_PT_BR_TRANSFER_TRACK_NAME } from '../domain/subtitleLanguage'
import type { AppConfig } from '@shared/types'

const DEFAULT_CONFIG: AppConfig = {
  sourceDir: '',
  destDir: '',
  outputDir: '',
  mkvToolNixDir: '',
  namingTransfer: { tagEnabled: false, tagWord: 'legendado' },
  namingClean: { tagEnabled: false, tagWord: 'limpo' },
  transferDefaults: { movieMode: false, removeEnglishAudio: true, removeExtraSubtitles: false },
  cleanDefaults: { removeEnglishAudio: true },
  renameDefaults: { movieMode: false },
  outputFolderName: 'TS - Result',
  muteSounds: false,
  ptBrTrackName: DEFAULT_PT_BR_TRANSFER_TRACK_NAME,
  renameFolder: '',
  renameFansubPresets: ['DKB', 'Erai-raws', 'EMBER', 'Judas', 'WF'],
  renameTagPresets: ['HEVC', 'BD', 'WebRip', '1080p', '720p'],
  movieSourceFile: '',
  movieDestFile: ''
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  const path = configPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return { ...DEFAULT_CONFIG, ...raw }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function exportConfig(filePath: string): void {
  writeFileSync(filePath, JSON.stringify(loadConfig(), null, 2), 'utf-8')
}

export function importConfig(filePath: string): AppConfig {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
  const merged: AppConfig = { ...DEFAULT_CONFIG, ...raw }
  saveConfig(merged)
  return merged
}
