# Transfer Sub - UI (Electron + React + TypeScript + styled-components)

Janela desktop nativa em React/TypeScript. É o único front-end do projeto —
a versão anterior em Tkinter/Python foi removida.

A lógica de negócio roda inteira no processo principal do Electron (Node.js),
separada em duas camadas:

- `src/main/domain/` — regras puras, sem I/O: identificar episódio pelo nome
  do arquivo (`episodeMatcher.ts`) e reconhecer/priorizar legenda PT-BR
  (`subtitleLanguage.ts`).
- `src/main/infra/` — tudo que toca o mundo exterior: localizar o
  MKVToolNix, listar arquivos de vídeo, chamar `mkvmerge`/`mkvextract` e
  persistir a configuração.
- `src/main/workflow.ts` — orquestra domain + infra nos dois casos de uso
  (`scanFolders`, `transferRows`) que o processo principal expõe via IPC.
- `src/main/index.ts` — a única camada que conhece Electron/IPC; registra os
  handlers e cria a janela.

A janela (React) só fala com o processo principal via IPC
(`src/preload/index.ts`), nunca chama o MKVToolNix diretamente. Todo o
front-end (tema, estilos globais, componentes styled-components e o `App`)
vive em um único arquivo, `src/renderer/src/App.tsx` — de propósito, para
não espalhar a UI em muitos arquivos pequenos.

## Rodando em desenvolvimento

```
npm install
npm run dev
```

Isso abre a janela do app com hot-reload. Requer o MKVToolNix instalado
(detectado automaticamente em `C:\Program Files\MKVToolNix`, ou configurável
pela própria interface em "Localizar MKVToolNix...").

> Se você rodar isso de dentro de um terminal integrado do VS Code, a
> variável de ambiente `ELECTRON_RUN_AS_NODE` pode vazar do processo do
> próprio VS Code e fazer o Electron filho rodar como Node puro (erro
> `Cannot read properties of undefined (reading 'whenReady')`). Se isso
> acontecer, rode `Remove-Item Env:\ELECTRON_RUN_AS_NODE` antes do `npm run
> dev`, ou use um terminal externo (não integrado).

## Build / instalador

```
npm run build   # type-check + build de producao (main/preload/renderer)
npm run dist    # build + gera instalador .exe (electron-builder)
```

## Seleção automática de legenda em PT-BR

A função `isPtBrTrack` em `src/main/domain/subtitleLanguage.ts` marca uma
faixa como PT-BR quando:

- o código de idioma da faixa é `por`, `pt`, `pt-br`, `pob` ou `ptb`; **ou**
- o nome da faixa contém (como palavra inteira, ignorando acentos e
  maiúsculas/minúsculas) uma das palavras-chave: `portugues`, `portuguese`,
  `ptbr`, `pt br`, `brasil`, `brazil`, `brazilian`, `br`.

Ao escanear, a faixa PT-BR (se encontrada) já vem pré-selecionada na tabela;
qualquer outra faixa continua disponível no dropdown "Faixa de legenda" de
cada linha para trocar manualmente.

## Estrutura

```
src/
  main/
    domain/     regras puras (episodeMatcher.ts, subtitleLanguage.ts) — sem I/O
    infra/      I/O: mkvToolNixLocator.ts, mkvProcess.ts, videoFiles.ts, configStore.ts
    workflow.ts casos de uso (scanFolders, transferRows)
    index.ts    entrypoint do Electron + handlers IPC
  preload/      ponte contextBridge exposta como window.api
  renderer/     app React de arquivo unico (App.tsx) + main.tsx (bootstrap)
  shared/       tipos TypeScript compartilhados entre main/preload/renderer
```
