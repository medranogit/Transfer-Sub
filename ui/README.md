# Transfer Sub - UI (Electron + React + TypeScript + styled-components)

Janela desktop nativa em React/TypeScript. É o único front-end do projeto —
a versão anterior em Tkinter/Python foi removida.

A tela tem um seletor de modo (ícones do [`@ant-design/icons`](https://ant.design/components/icon)):

- **Transferir legenda** — casa episódios entre uma pasta de origem (com
  legenda) e uma de destino (sem legenda) e transfere a faixa escolhida.
- **Apenas limpar** — não transfere nada; escaneia só uma pasta e permite
  manter apenas uma faixa de legenda (removendo as demais) e/ou remover a
  dublagem em inglês de cada arquivo.

Trocar de modo limpa a lista escaneada, para evitar rodar uma ação com dados
da tela anterior.

A lógica de negócio roda inteira no processo principal do Electron (Node.js),
separada em duas camadas:

- `src/main/domain/` — regras puras, sem I/O:
  - `episodeMatcher.ts` — identifica episódio pelo nome do arquivo.
  - `subtitleLanguage.ts` — reconhece/prioriza legenda PT-BR.
  - `audioLanguage.ts` — reconhece faixas de áudio em inglês.
  - `subtitleTiming.ts` — converte texto `MM:SS,mmm` em milissegundos e
    encontra o instante da primeira legenda num arquivo `.ass`/`.ssa`/`.srt`.
- `src/main/infra/` — tudo que toca o mundo exterior: localizar o
  MKVToolNix, listar arquivos de vídeo, chamar `mkvmerge`/`mkvextract`
  (`mkvProcess.ts`), persistir a configuração (`configStore.ts`) e gravar o
  log de transferências (`transferLog.ts`).
- `src/main/workflow.ts` — orquestra domain + infra nos casos de uso que o
  processo principal expõe via IPC: `scanFolders`/`transferRows` (modo
  Transferir) e `scanForClean`/`cleanRows` (modo Limpar).
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
cada linha para trocar manualmente. No modo "Apenas limpar" o dropdown
também tem a opção "Manter todas as legendas" (padrão), já que ali a ideia é
opt-in: só remove faixas quando você escolhe uma específica.

## Ajustar o instante da primeira legenda

No modo Transferir, a coluna "1ª fala em" aceita um horário no formato
`MM:SS,mmm` (ex.: `06:39,566`) — o campo já formata sozinho enquanto você
digita só números. Quando preenchido, o app calcula a diferença entre esse
horário e o instante da primeira legenda no arquivo original e aplica um
`--sync` no `mkvmerge` para deslocar toda a legenda por esse valor. Deixe em
branco para manter o timing original.

## Remover dublagem em inglês

O checkbox "Remover dublagem em inglês" (marcado por padrão) vale para os
dois modos. Antes de gerar o arquivo final, o app lê as faixas de áudio do
vídeo e, se houver alguma em inglês, remuxa mantendo só as demais — a menos
que isso zere todas as faixas de áudio, caso em que mantém tudo por
segurança (com aviso no log).

## Não sobrescreve com duplicados

O nome do arquivo de saída é fixo por episódio/arquivo — `Nome [legendado].mkv`
no modo Transferir, `Nome [limpo].mkv` no modo Limpar. Rodar de novo sobre o
mesmo arquivo sobrescreve o resultado anterior em vez de criar `(1)`, `(2)`
etc. — a identificação é só pelo nome do arquivo de origem.

## Log de transferências

Cada execução (sucesso ou erro) grava uma entrada em `transfer-log.json`,
na raiz do projeto (mesma pasta do `package.json`/`README.md`) em
desenvolvimento, ou ao lado do executável quando empacotado — nunca dentro
da pasta de saída escolhida pelo usuário.

## Estrutura

```
src/
  main/
    domain/     regras puras, sem I/O:
                episodeMatcher.ts   — casar episodio pelo nome do arquivo
                subtitleLanguage.ts — reconhecer/priorizar legenda PT-BR
                audioLanguage.ts    — reconhecer audio em ingles
                subtitleTiming.ts   — parse/format de timecodes MM:SS,mmm
    infra/      I/O: mkvToolNixLocator.ts, mkvProcess.ts, videoFiles.ts,
                configStore.ts, transferLog.ts
    workflow.ts casos de uso: scanFolders/transferRows (Transferir),
                scanForClean/cleanRows (Limpar)
    index.ts    entrypoint do Electron + handlers IPC
  preload/      ponte contextBridge exposta como window.api
  renderer/     app React de arquivo unico (App.tsx) + main.tsx (bootstrap)
  shared/       tipos TypeScript compartilhados entre main/preload/renderer
```
