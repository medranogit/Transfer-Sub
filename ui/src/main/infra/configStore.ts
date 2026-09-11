import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { categorizeTagWord } from '../domain/renamePattern'
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
  convertFolder: '',
  renameFansubPresets: ['DKB', 'Erai-raws', 'EMBER', 'Judas', 'WF'],
  renameSourcePresets: ['BD', 'WebRip', 'DVD'],
  renameCodecPresets: ['HEVC', 'AVC'],
  renameResolutionPresets: ['1080p', '720p'],
  movieSourceFile: '',
  movieDestFile: ''
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function migrateLegacyTagPresets(raw: Record<string, unknown>): void {
  if (!Array.isArray(raw.renameTagPresets) || Array.isArray(raw.renameSourcePresets)) return
  const buckets: Record<'source' | 'codec' | 'resolution', string[]> = { source: [], codec: [], resolution: [] }
  for (const tag of raw.renameTagPresets as string[]) {
    buckets[categorizeTagWord(tag)].push(tag)
  }
  raw.renameSourcePresets = buckets.source
  raw.renameCodecPresets = buckets.codec
  raw.renameResolutionPresets = buckets.resolution
}

export function loadConfig(): AppConfig {
  const path = configPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    migrateLegacyTagPresets(raw)
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
  migrateLegacyTagPresets(raw)
  const merged: AppConfig = { ...DEFAULT_CONFIG, ...raw }
  saveConfig(merged)
  return merged
}
