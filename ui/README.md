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
  - `subtitleTiming.ts` — converte texto `MM:SS,mmm` em milissegundos,
    encontra o instante da primeira legenda num arquivo `.ass`/`.ssa`/`.srt`
    e parseia todas as falas (`parseSubtitleEvents`) para a tela de sync.
- `src/main/infra/` — tudo que toca o mundo exterior: localizar o
  MKVToolNix, listar arquivos de vídeo, chamar `mkvmerge`/`mkvextract`
  (`mkvProcess.ts`), persistir a configuração (`configStore.ts`) e gravar o
  log de transferências (`transferLog.ts`).
- `src/main/workflow.ts` — orquestra domain + infra nos casos de uso que o
  processo principal expõe via IPC: `scanFolders`/`transferRows` (modo
  Transferir), `scanForClean`/`cleanRows` (modo Limpar) e
  `prepareSync`/`getTrackEvents` (dados para o modal de sincronização).
- `src/main/index.ts` — a única camada que conhece Electron/IPC; registra os
  handlers e cria a janela.

A janela (React) só fala com o processo principal via IPC
(`src/preload/index.ts`), nunca chama o MKVToolNix diretamente. O front-end
fica em `src/renderer/src/`, dividido por responsabilidade: `App.tsx` é só o
orquestrador (estado + handlers da tela); `theme.ts`/`GlobalStyle.ts` cuidam
do tema; `ui/` guarda primitivas genéricas reaproveitáveis (`Button`, `Row`,
`Chip`...); `components/` tem um arquivo por peça de UI com estado/lógica
própria (`EpisodeTable`, `SyncModal`, `LogPanel`...); `utils/` guarda funções
puras de formatação (legenda/timing, som de conclusão).

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

Quando nenhuma faixa é reconhecida como PT-BR por idioma/nome, `scanFolders`
extrai cada faixa e usa `guessPtBrFromContent` (mesmo arquivo) para procurar,
no texto, palavras bem características do português (evitando as que também
existem em espanhol/italiano) e a terminação `-ção`/`-ções`. Se achar, marca
a faixa com `isPtBrGuess` e loga um aviso — a UI mostra `⚠ pode ser PT-BR` no
dropdown, mas não bloqueia nada, é só um alerta pra conferir.

## Fontes anexadas (attachments)

Legendas ASS costumam depender de fontes customizadas anexadas ao `.mkv` de
origem (fansubs sempre embutem as delas). Sem levar essas fontes junto, a
legenda transferida perde a formatação porque o player cai numa fonte
genérica. `transferRows` copia os attachments do arquivo de origem para o
final via `--attach-file`/`--attachment-name`/`--attachment-mime-type`.

## Nome e idioma da faixa transferida

A faixa PT-BR transferida é renomeada para `PortuguesBr - TransferSub`
(`resolveTransferTrackName` em `subtitleLanguage.ts`) e vai com idioma `und`
(indeterminado) em vez do idioma original (`resolveTransferLanguage`) —
alguns players completam o nome da faixa com "- [Idioma]" sempre que há um
código de idioma reconhecido, e como o nome já deixa claro que é português,
isso evita a redundância. Faixas que não são PT-BR mantêm nome e idioma
originais.

## Ajustar o timing da legenda

O botão **Sincronizar** de cada linha (só habilitado depois de escolher uma
faixa) abre um modal com três formas de ajustar o timing, todas mutuamente
exclusivas entre si (preencher uma limpa as outras):

- **1ª fala em** — horário no formato `MM:SS,mmm` (ex.: `06:39,566`; o campo
  formata sozinho enquanto você digita só números) em que a primeira legenda
  deve aparecer no vídeo de destino. O app calcula a diferença entre esse
  horário e o instante da primeira legenda no arquivo original.
- **Atraso/adiantamento (ms)** — um valor direto em milissegundos; positivo
  atrasa, negativo (com `-` na frente) adianta.
- **Sincronizar automaticamente** — o modal mostra duas colunas com scroll
  próprio: a legenda em inglês do arquivo de destino (auto-detectada por
  código de idioma, com fallback manual se houver mais de uma ou nenhuma) e
  a PT-BR da origem. Clique na mesma fala nos dois lados e o botão "Usar
  este deslocamento" calcula a diferença em ms e preenche o campo de
  deslocamento manual. A faixa em inglês escolhida manualmente fica lembrada
  para os próximos episódios da mesma sessão (`preferredEnTrackId` em
  `App.tsx`), já que geralmente a estrutura de faixas se repete na
  temporada.

Qualquer valor calculado vira um `--sync` no `mkvmerge` para deslocar toda a
legenda. Deixe todos os campos em branco para manter o timing original.

## Chips de opções

As opções booleanas (remover dublagem, limpar legendas extras) aparecem como
chips clicáveis (`ui/Chip.ts`) em vez de checkbox tradicional: ficam verdes
quando ativas, neutras quando não — e a linha quebra sozinha (`flex-wrap`)
se mais opções forem adicionadas no futuro.

- **"Remover dublagem em inglês do destino"** (ativado por padrão, vale para
  os dois modos) — antes de gerar o arquivo final, o app lê as faixas de
  áudio do vídeo e, se houver alguma em inglês, remuxa mantendo só as
  demais — a menos que isso zere todas as faixas de áudio, caso em que
  mantém tudo por segurança (com aviso no log).
- **"Limpar legendas do destino, deixando só a transferida"** (só no modo
  Transferir) — remove as legendas que já existiam no arquivo de destino no
  resultado final, mantendo apenas a faixa transferida.

## Não sobrescreve com duplicados

O nome do arquivo de saída é fixo por episódio/arquivo, então rodar de novo
sobre o mesmo arquivo sobrescreve o resultado anterior em vez de criar `(1)`,
`(2)` etc. — a identificação é só pelo nome do arquivo de origem.

- **Modo Transferir**: assina ao lado da tag da fansub original, em vez de
  só acrescentar um sufixo — `[Judas] Nome do episodio.mkv` vira
  `[TS - Judas] Nome do episodio.mkv` (`resolveOutputPath` em
  `infra/mkvProcess.ts`). Sem tag reconhecida no nome original, usa
  `[TS] Nome do episodio.mkv`.
- **Modo Limpar**: mantém o sufixo `Nome [limpo].mkv`.

## Log de transferências

O painel de log na tela (`components/LogPanel.tsx`) colore cada linha por
nível (`info`/`success`/`warn`/`error`) com um ícone e um leve tingimento de
fundo, e um som de conclusão minimalista (`utils/completionSound.ts`, via
Web Audio API) toca ao terminar uma transferência ou limpeza.

Além disso, cada execução (sucesso ou erro) grava uma entrada em
`transfer-log.json`, na raiz do projeto (mesma pasta do
`package.json`/`README.md`) em desenvolvimento, ou na pasta de dados do
usuário (`app.getPath('userData')`, mesmo lugar de `config.json`) quando
empacotado — nunca dentro da pasta de saída escolhida pelo usuário, e nunca
dentro da pasta de instalação (o instalador roda o desinstalador da versão
anterior antes de atualizar, o que apagaria qualquer arquivo solto ali).
Esse arquivo é só histórico de execuções passadas: o formato de cada entrada
(`trackId`, `language`, `trackName`, `appliedOffsetMs`...) já cobre qualquer
um dos três métodos de ajuste de timing, então não precisou mudar com a
adição do deslocamento manual/Sincronizar. A tela cheia de histórico
(`components/HistoryModal.tsx`, botão "Histórico" no cabeçalho) lê esse
arquivo com paginação (100 por página).

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
  renderer/     app React + main.tsx (bootstrap):
                App.tsx           orquestrador (estado + handlers), monta a tela
                theme.ts          tema (cores/spacing) + tipagem do styled-components
                GlobalStyle.ts    estilos globais (scrollbar, reset, fonte)
                ui/               primitivas genericas: primitives.ts (Button, Row, Col,
                                  Panel, Label, Input, SectionTitle), Chip.ts
                components/       FolderField, StatusBadge, LogPanel, ModeToggle,
                                  EpisodeTable, SyncModal — cada um com seu proprio estado
                utils/            subtitleDisplay.ts (formatacao de legenda/timing),
                                  completionSound.ts
  shared/       tipos TypeScript compartilhados entre main/preload/renderer
```
