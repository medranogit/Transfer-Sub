// Infraestrutura: permite abortar uma transferencia/limpeza em andamento.
// Guarda o processo mkvmerge/mkvextract atualmente rodando pra poder
// mata-lo na hora, e uma flag "aborted" que o laco principal (workflow.ts)
// confere entre um episodio e outro pra parar de processar os proximos.
import type { ChildProcess } from 'child_process'

export class OperationAbortedError extends Error {
  constructor() {
    super('Operacao abortada pelo usuario')
    this.name = 'OperationAbortedError'
  }
}

export class CancellationToken {
  private _aborted = false
  private currentProcess: ChildProcess | null = null

  get aborted(): boolean {
    return this._aborted
  }

  // Chamado pelo mkvProcess.ts assim que o processo e criado - se o abort ja
  // tiver sido pedido entre o inicio da chamada e esse ponto, mata na hora.
  trackProcess(proc: ChildProcess): void {
    this.currentProcess = proc
    if (this._aborted) proc.kill()
  }

  untrackProcess(proc: ChildProcess): void {
    if (this.currentProcess === proc) this.currentProcess = null
  }

  abort(): void {
    this._aborted = true
    this.currentProcess?.kill()
  }
}
