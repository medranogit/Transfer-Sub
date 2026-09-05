// Infraestrutura: log em JSON de cada transferencia. Em desenvolvimento fica
// na raiz do projeto (conveniente pra inspecionar); empacotado fica na pasta
// de dados do usuario (mesma de config.json) - NUNCA na pasta de instalacao,
// pois o instalador roda o desinstalador da versao anterior antes de
// atualizar, o que apaga qualquer arquivo solto ali (foi o que aconteceu:
// o log ficava ao lado do .exe e sumiu numa atualizacao).
import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { TransferLogEntry } from '@shared/types'

const LOG_FILE_NAME = 'transfer-log.json'
// Mantem so as entradas mais recentes - sem isso o arquivo cresce pra
// sempre num uso continuo por anos.
const MAX_LOG_ENTRIES = 5000

function logPath(): string {
  const dir = app.isPackaged ? app.getPath('userData') : app.getAppPath()
  return join(dir, LOG_FILE_NAME)
}

async function readLog(): Promise<TransferLogEntry[]> {
  try {
    const raw = await readFile(logPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Usado pela tela de historico - mais recente primeiro.
export async function loadTransferLog(): Promise<TransferLogEntry[]> {
  const entries = await readLog()
  return entries.slice().reverse()
}

// Serializa leitura+escrita do log: sem isso, duas chamadas concorrentes
// (duplo clique, ou duas janelas do app abertas) podem ler o mesmo estado
// antes de qualquer uma escrever - a segunda escrita sobrescreve a primeira
// e aquela entrada some do historico, mesmo com o arquivo final gerado
// normalmente.
let writeQueue: Promise<void> = Promise.resolve()

export function appendTransferLog(entry: TransferLogEntry): Promise<void> {
  const task = writeQueue.then(async () => {
    const entries = await readLog()
    entries.push(entry)
    const trimmed = entries.length > MAX_LOG_ENTRIES ? entries.slice(entries.length - MAX_LOG_ENTRIES) : entries
    await writeFile(logPath(), JSON.stringify(trimmed, null, 2), 'utf-8')
  })
  // Mesmo se essa escrita falhar, a fila segue livre para a proxima chamada.
  writeQueue = task.catch(() => {})
  return task
}
