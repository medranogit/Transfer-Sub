# Ideias e Melhorias Futuras

---

## ⚡ Scan Paralelo

**Status:** Planejado  
**Arquivo alvo:** `ui/src/main/workflow.ts`

### Problema

O scan atual processa os episódios em série — um por vez — mesmo que cada probe (`mkvmerge -J`) seja independente dos outros.

```
Atual:
ep01 → mkvmerge -J → ep02 → mkvmerge -J → ep03 → ...  (sequencial)

Proposto:
ep01 ┐
ep02 ├─ mkvmerge -J paralelo (até N por vez)
ep03 ┘
ep04 ┐
ep05 ├─ próximo lote
ep06 ┘
```

Para 24 episódios com concorrência 4 → redução de ~4x no tempo de scan.

### Por que ajuda

Cada `mkvmerge -J` tem latência de inicialização de processo (~100–300ms) mais leitura do cabeçalho MKV.
São operações independentes: o resultado de `ep02` não depende de `ep01`.
O scan é leve em CPU — paralelizar usa mais núcleos sem disputar disco de forma destrutiva.

### Por que o remux NÃO se beneficia

O `mkvmerge` durante o remux **não re-encoda** — copia bytes brutos. É puro I/O.
Rodar vários remuxes em paralelo faria os processos disputarem o mesmo disco sem ganho real
(e possivelmente mais lento por I/O aleatório vs sequencial).

### Implementação

#### Opção A — `Promise.all` em lotes fixos (simples)

```ts
const CONCURRENCY = 4

for (let i = 0; i < pairs.length; i += CONCURRENCY) {
  const batch = pairs.slice(i, i + CONCURRENCY)
  const batchRows = await Promise.all(
    batch.map(({ key, sourcePath, destPath }) =>
      buildEpisodeRow(mkvmergePath, mkvextractPath, key, sourcePath, destPath, onLog)
    )
  )
  rows.push(...batchRows)
  if (token?.aborted) break
}
```

#### Opção B — pool de concorrência com p-limit (mais elegante)

Instalar: `npm install p-limit`

```ts
import pLimit from 'p-limit'

const limit = pLimit(4)

const rowResults = await Promise.all(
  pairs.map(({ key, sourcePath, destPath }) =>
    limit(() => {
      if (token?.aborted) return null
      return buildEpisodeRow(mkvmergePath, mkvextractPath, key, sourcePath, destPath, onLog)
    })
  )
)

rows.push(...rowResults.filter(Boolean))
```

#### Opção B2 — sem dependência externa (pool manual)

```ts
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}
```

### Cuidados

- A ordem dos rows no resultado deve ser mantida (ordenada por episódio) — usar índice fixo ou ordenar depois.
- O `token?.aborted` precisa ser checado dentro de cada task para cancelamento funcionar.
- O `tagPtBrGuesses` (que extrai legenda pra adivinhar idioma) também é chamado dentro do `buildEpisodeRow`
  e roda `mkvextract` — com concorrência 4, até 4 extrações temporárias podem acontecer ao mesmo tempo (aceitável).
- Logs paralelos podem chegar fora de ordem — considerar prefixar com episódio (já está sendo feito com `[S01Exx]`).

### Concorrência recomendada

| Situação | Concorrência sugerida |
|---|---|
| SSD + série normal (13–24 eps) | 4 |
| HDD | 2 (evitar seek excessivo) |
| Série muito longa (150+ eps) | 6–8 |

Valor configurável em Settings seria ideal.

### Impacto estimado

| Episódios | Antes (série) | Depois (paralelo ×4) |
|---|---|---|
| 13 | ~4–6s | ~1–2s |
| 24 | ~7–10s | ~2–3s |
| 150 | ~45–60s | ~12–16s |

---

## 💾 Cache de Scan

**Status:** Ideia inicial  
**Dependência:** nenhuma

### Problema

Ao rescanear a mesma pasta (ex: após ajustar configuração), o app refaz todos os
`mkvmerge -J` mesmo que os arquivos não tenham mudado.

### Proposta

Salvar resultado do probe por arquivo usando `mtime + tamanho` como chave de cache.
Cache em memória durante a sessão (simples) ou em disco (persistente entre sessões).

```ts
interface ProbeCache {
  [filePath: string]: {
    mtime: number
    size: number
    tracks: SubtitleTrack[]
  }
}
```

Se `mtime` e `size` do arquivo não mudaram → usa cache, pula o `mkvmerge -J`.

### Impacto

Segundo scan da mesma pasta: quase instantâneo.

---

## 🎯 Sincronização Multiponto / Por Trechos (Multi-Point Sync)

**Status:** Planejado  
**Arquivos alvo:** `ui/src/renderer/src/components/SyncModal.tsx`, `ui/src/main/domain/subtitleTiming.ts`, `ui/src/main/workflow.ts`

### Problema

Comum em releases **TV vs Blu-ray** ou **Web-DL vs BD**:
- O episódio começa perfeitamente sincronizado (offset `0ms`).
- No meio do episódio (ex: transição de comercial/eyecatch, cena estendida ou pós-abertura), há uma diferença de tempo (ex: `+2.500ms` a mais ou a menos).
- A partir dali, toda a segunda metade fica fora de sincronia.
- O `--sync` padrão do `mkvmerge` só aceita **um único atraso** para o arquivo inteiro, sendo insuficiente.

### Solução Arquitetural

Em vez de delegar o offset ao `mkvmerge --sync`, o app **reescreve diretamente os timestamps das linhas no arquivo de legenda temporário (`.ass` ou `.srt`)** antes do muxing:

```
[Extrai legenda .ass/.srt]
         │
         ▼
[Aplica função adjustSubtitleTimestamps(content, points, mode)]
         │
         ▼
[Gera sub_adjusted.ass com Start/End corrigidos]
         │
         ▼
[Muxa com mkvmerge sem precisar de --sync global]
```

### Modos de Sincronia Multiponto

1. **Modo Degrau / Corte (Step / Segmented)** — *Principal para TV vs BD*:
   - Cada ponto define um novo deslocamento que passa a valer dali para frente até o próximo ponto.
   - *Exemplo:*
     - Trecho 1 (`00:00:00` até `00:12:35`): offset `-90ms`
     - Trecho 2 (`00:12:35` até fim): offset `-2150ms` (compensou 2s de eyecatch/cena estendida do BD)
2. **Modo Interpolação Linear (Stretch / Drift)**:
   - Para quando o áudio estica/desloca gradativamente (ex: descompasso de framerate 23.976 vs 24.000).
   - O offset é interpolado suavemente entre os pontos $P_1$ e $P_2$.

### Modelo de Dados Sugerido

```ts
export interface SyncPoint {
  /** Timestamp original na legenda em milissegundos (ou índice do evento) */
  sourceMs: number
  /** Deslocamento em milissegundos a aplicar neste trecho */
  offsetMs: number
}

export interface MultiPointSyncConfig {
  mode: 'step' | 'linear'
  points: SyncPoint[]
}
```

### Interface do Usuário (SyncModal)

1. Usuário seleciona fala na coluna esquerda (base) e direita (destino).
2. O modal mostra o offset calculado daquele momento e um botão: **"+ Adicionar Ponto de Sincronia"**.
3. Abaixo das colunas, exibe uma lista/chips dos pontos já adicionados:
   - `Ponto 1: [00:01:20] -> -90ms` [remover]
   - `Ponto 2: [00:13:45] -> -2150ms` [remover]
4. Um seletor de modo:
   - `[x] Modo Corte / Degrau (muda o atraso a partir deste ponto)`
   - `[ ] Modo Gradual (estica o tempo suavemente entre os pontos)`
5. Botão final: **"Aplicar sincronia multiponto (N pontos)"**.

### Lógica de Ajuste no `.ass`

No arquivo `.ass`, as falas ficam no formato:
`Dialogue: 0,0:12:34.56,0:12:38.90,Default,...`

```ts
export function adjustAssTimestamps(
  assContent: string,
  points: SyncPoint[],
  mode: 'step' | 'linear'
): string {
  // Ordena os pontos por sourceMs
  const sorted = [...points].sort((a, b) => a.sourceMs - b.sourceMs)

  return assContent.replace(
    /^(Dialogue:\s*[^,]+),(\d+:\d+:\d+\.\d+),(\d+:\d+:\d+\.\d+),(.*)$/gm,
    (match, prefix, startStr, endStr, rest) => {
      const startMs = parseAssTimeToMs(startStr)
      const endMs = parseAssTimeToMs(endStr)
      const offset = resolveOffsetForTime(startMs, sorted, mode)
      return `${prefix},${formatMsToAss(startMs + offset)},${formatMsToAss(endMs + offset)},${rest}`
    }
  )
}
```

