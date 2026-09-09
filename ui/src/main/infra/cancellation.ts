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
