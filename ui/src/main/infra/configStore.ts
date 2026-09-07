// Infraestrutura: persistencia da configuracao do usuario em disco.
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

// app.getPath('userData') fica fora da pasta de instalacao (ex:
// %APPDATA%\transfer-sub-ui no Windows) - o instalador roda o desinstalador
// da versao anterior antes de atualizar (ver COMO_GERAR_EXE.txt), o que
// apagaria qualquer coisa gravada dentro da pasta de instalacao. Por ficar
// fora dela, config.json (e transfer-log.json/session-logs/, mesmo esquema)
// sobrevive normalmente a atualizacoes e reinstalacoes.
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

// Exportar/Importar (Configuracoes) - um arquivo .json a parte do
// config.json interno, pra levar as configuracoes pra outra maquina/backup
// manual. Importar sempre mescla sobre o DEFAULT_CONFIG (igual loadConfig),
// entao um arquivo exportado de uma versao mais antiga (sem algum campo
// novo) continua carregando sem quebrar - so o que faltar cai no padrao.
export function exportConfig(filePath: string): void {
  writeFileSync(filePath, JSON.stringify(loadConfig(), null, 2), 'utf-8')
}

export function importConfig(filePath: string): AppConfig {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
  const merged: AppConfig = { ...DEFAULT_CONFIG, ...raw }
  saveConfig(merged)
  return merged
}
