// Infraestrutura: log bruto (texto) de tudo que o usuario fez numa sessao do
// app (do momento que abre ate fechar) - um arquivo .txt por sessao. Usado
// pela pagina "Log da Sessao" pra navegar sessoes anteriores sem precisar
// copiar o log da tela manualmente antes de fechar o app. So gravado
// (append:true) - a UI apenas lista/le, nunca escreve.
import { app } from 'electron'
import { appendFile, mkdir, readdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { LogEvent, SessionLogInfo } from '@shared/types'

const SESSION_LOG_DIR_NAME = 'session-logs'
// Numero de sessoes (arquivos) mantidas - as mais antigas sao apagadas
// automaticamente, senao a pasta cresce pra sempre num uso continuo por anos.
const MAX_SESSIONS = 200

function sessionLogDir(): string {
  const dir = app.isPackaged ? app.getPath('userData') : app.getAppPath()
  return join(dir, SESSION_LOG_DIR_NAME)
}

// Timestamp de quando o processo do app comecou a rodar - usado como nome
// do arquivo (ordenavel, sem ambiguidade de fuso/formato) e como id da
// sessao atual pro lado da UI.
const sessionStartedAt = Date.now()

function filePathFor(id: string): string {
  return join(sessionLogDir(), `${id}.txt`)
}

function formatLine(entry: LogEvent): string {
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false })
  return `[${time}] [${entry.level.toUpperCase()}] ${entry.message}\n`
}

// Serializa gravacoes (mesmo padrao do transferLog.ts) - uma transferencia/
// renomeacao em lote dispara varios logs em sequencia rapida.
let writeQueue: Promise<void> = Promise.resolve()

export function appendSessionLog(entry: LogEvent): Promise<void> {
  const task = writeQueue.then(async () => {
    await mkdir(sessionLogDir(), { recursive: true })
    await appendFile(filePathFor(String(sessionStartedAt)), formatLine(entry), 'utf-8')
  })
  // Mesmo se essa escrita falhar, a fila segue livre para a proxima chamada.
  writeQueue = task.catch(() => {})
  return task
}

function idToLabel(id: string): string {
  const ms = Number(id)
  if (!Number.isFinite(ms)) return id
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} - ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Lista as sessoes com arquivo gravado, mais recente primeiro - sessoes em
// que nada foi feito nunca chegam a criar o arquivo (nada pra mostrar).
export async function listSessionLogs(): Promise<SessionLogInfo[]> {
  let names: string[]
  try {
    names = await readdir(sessionLogDir())
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.txt'))
    .map((name) => name.slice(0, -'.txt'.length))
    .sort((a, b) => Number(b) - Number(a))
    .map((id) => ({ id, label: idToLabel(id), current: id === String(sessionStartedAt) }))
}

export async function readSessionLog(id: string): Promise<string> {
  try {
    return await readFile(filePathFor(id), 'utf-8')
  } catch {
    return ''
  }
}

// Poda sessoes antigas alem do limite - chamada uma vez no inicio do app.
export async function pruneOldSessionLogs(): Promise<void> {
  const sessions = await listSessionLogs()
  const toDelete = sessions.slice(MAX_SESSIONS)
  await Promise.all(toDelete.map((s) => unlink(filePathFor(s.id)).catch(() => {})))
}
