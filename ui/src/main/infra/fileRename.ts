// Infraestrutura: renomear um arquivo no disco (usado pelo Renomeador).
import { rename } from 'fs/promises'

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  await rename(oldPath, newPath)
}
