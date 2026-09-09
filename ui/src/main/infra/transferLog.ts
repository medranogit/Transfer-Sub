import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { TransferLogEntry } from '@shared/types'

const LOG_FILE_NAME = 'transfer-log.json'
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

export async function loadTransferLog(): Promise<TransferLogEntry[]> {
  const entries = await readLog()
  return entries.slice().reverse()
}

let writeQueue: Promise<void> = Promise.resolve()

export function appendTransferLog(entry: TransferLogEntry): Promise<void> {
  const task = writeQueue.then(async () => {
    const entries = await readLog()
    entries.push(entry)
    const trimmed = entries.length > MAX_LOG_ENTRIES ? entries.slice(entries.length - MAX_LOG_ENTRIES) : entries
    await writeFile(logPath(), JSON.stringify(trimmed, null, 2), 'utf-8')
  })
  writeQueue = task.catch(() => {})
  return task
}

export function clearTransferLog(): Promise<void> {
  const task = writeQueue.then(async () => {
    await writeFile(logPath(), JSON.stringify([], null, 2), 'utf-8')
  })
  writeQueue = task.catch(() => {})
  return task
}
