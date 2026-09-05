# Transfer Sub - UI (Electron + React + TypeScript + styled-components)

Janela desktop nativa em React/TypeScript. É o único front-end do projeto —
a versão anterior em Tkinter/Python foi removida.

A navegação principal é um menu lateral (`components/Sidebar.tsx`, ícones do
[`@ant-design/icons`](https://ant.design/components/icon)) com cinco
páginas:

- **Transferir Legenda** — casa episódios entre uma pasta de origem (com
  legenda) e uma de destino (sem legenda) e transfere a faixa escolhida.
- **Limpeza** — não transfere nada; escaneia só uma pasta e permite
  manter apenas uma faixa de legenda (removendo as demais) e/ou remover a
  dublagem em inglês de cada arquivo.
- **Renomeador** — renomeia em lote os vídeos de uma pasta a partir de 3
  campos (texto inicial, temporada, texto final; o episódio é detectado por
  arquivo), pra trocar rapidamente o padrão de nome de uma leva de arquivos
  sem editar um por um.
- **Histórico** — todas as transferências/limpezas já feitas, persistidas em
  `transfer-log.json` (sobrevive a reinícios do app).
- **Configurações** — status/localização do MKVToolNix e como o app nomeia
  o arquivo de saída (assinatura da fansub + marcação livre, por modo); é o
  lugar certo pra qualquer preferência global futura (as opções atuais, tipo
  remover áudio, são por operação e ficam nas páginas de Transferir/Limpar).

Trocar entre Transferir Legenda e Limpeza limpa a lista escaneada
(para evitar rodar uma ação com dados da tela anterior) e o menu inteiro fica
bloqueado durante um escaneamento/transferência/limpeza em andamento;
Renomeador, Histórico e Configurações navegam livremente fora disso.

A lógica de negócio roda inteira no processo principal do Electron (Node.js),
separada em duas camadas:

- `src/main/domain/` — regras puras, sem I/O:
  - `episodeMatcher.ts` — identifica episódio pelo nome do arquivo. Casa
    origem/destino pelo **número do episódio**; a temporada só desempata
    quando há mais de um arquivo com o mesmo número de um lado (pasta com
    temporadas misturadas) — releases de fansub raramente incluem a
    temporada no nome, então exigir que os dois lados concordassem nisso
    deixava de casar episódios legítimos.
  - `subtitleLanguage.ts` — reconhece/prioriza legenda PT-BR.
  - `audioLanguage.ts` — reconhece faixas de áudio em inglês.
  - `subtitleTiming.ts` — converte texto `MM:SS,mmm` em milissegundos,
    encontra o instante da primeira legenda num arquivo `.ass`/`.ssa`/`.srt`
    e parseia todas as falas (`parseSubtitleEvents`) para a tela de sync.
  - `renamePattern.ts` — gera o novo nome de um arquivo a partir dos 3
    campos do Renomeador (texto inicial/temporada/texto final), usando
    `episodeMatcher.findEpisode` pra descobrir o episódio.
- `src/main/infra/` — tudo que toca o mundo exterior: localizar o
  MKVToolNix, listar arquivos de vídeo, chamar `mkvmerge`/`mkvextract`
  (`mkvProcess.ts`), persistir a configuração (`configStore.ts`), gravar o
  log de transferências (`transferLog.ts`), renomear um arquivo no disco
  (`fileRename.ts`) e permitir abortar uma operação em andamento matando o
  processo atual (`cancellation.ts`).
- `src/main/workflow.ts` — orquestra domain + infra nos casos de uso que o
  processo principal expõe via IPC: `scanFolders`/`transferRows` (modo
  Transferir), `scanForClean`/`cleanRows` (modo Limpar) e
  `prepareSync`/`getTrackEvents` (dados para o modal de sincronização).
- `src/main/renamer.ts` — caso de uso do Renomeador: `previewRename` lista os
  vídeos da pasta e calcula o novo nome de cada um (marcando conflito quando
  dois arquivos gerariam o mesmo nome), `applyRename` executa a renomeação
  linha a linha.
- `src/main/index.ts` — a única camada que conhece Electron/IPC; registra os
  handlers e cria a janela.

A janela (React) só fala com o processo principal via IPC
(`src/preload/index.ts`), nunca chama o MKVToolNix diretamente. O front-end
fica em `src/renderer/src/`, dividido por responsabilidade: `App.tsx` é só o
orquestrador (estado + handlers, decide qual página mostrar); `theme.ts`/
`GlobalStyle.ts` cuidam do tema; `ui/` guarda primitivas genéricas
reaproveitáveis (`Button`, `Row`, `Chip`, `Checkbox`, `ConfirmDialog`,
`Table`...); `components/` tem um arquivo por peça de UI com estado/lógica
própria — inclui as cinco páginas da Sidebar (`WorkflowView` usada tanto por
Transferir quanto por Limpar, `RenameView`, `HistoryView`, `SettingsView`) e
peças menores (`EpisodeTable`, `SyncModal`, `LogPanel`...); `utils/` guarda
funções puras de formatação (legenda/timing, som de conclusão).

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

## Abortar uma operação em andamento

O botão **Abortar** aparece ao lado de "Transferir/Limpar selecionados" (e
também durante o Escaneamento) enquanto uma operação roda. Ele mata o
processo `mkvmerge`/`mkvextract` atual na hora (`infra/cancellation.ts`) e
para de processar os itens restantes; o arquivo de saída parcial (truncado
pela morte do processo) é apagado automaticamente. Os itens já concluídos
antes do abort permanecem intactos.

## Não sobrescreve com duplicados

O nome do arquivo de saída é fixo por episódio/arquivo, então rodar de novo
sobre o mesmo arquivo sobrescreve o resultado anterior em vez de criar `(1)`,
`(2)` etc. — a identificação é só pelo nome do arquivo de origem.

Nos dois modos (Transferir e Limpar), por padrão o app assina ao lado da tag
da fansub original em vez de acrescentar um sufixo tipo `[legendado]`/`[limpo]`
— `[Judas] Nome do episodio.mkv` vira `[TS - Judas] Nome do episodio.mkv`
(`withTransferSubSignature`/`resolveOutputPath`/`resolveCleanOutputPath` em
`infra/mkvProcess.ts`). Sem tag reconhecida no nome original, usa
`[TS] Nome do episodio.mkv`. Se o arquivo já tiver sido processado antes (já
começa com `[TS...]`), a assinatura não é duplicada.

Em Configurações dá pra ajustar isso por modo (Transferir/Limpeza), via
`AppConfig.namingTransfer`/`namingClean` (`NamingConfig` em `shared/types.ts`):
desligar a assinatura `[TS - Tag]` (`signatureEnabled`, ligada por padrão) e/ou
ligar uma marcação extra no final do nome (`tagEnabled`/`tagWord`, ex.
`[legendado]`/`[limpo]` — a palavra é livre, desligada por padrão). Ex. com os
dois recursos juntos: `[TS - Judas] Nome do episodio [legendado].mkv`.

Como a saída pode acabar com o mesmo nome do arquivo de entrada quando a
pasta de saída é igual à de destino (ex: reprocessar um arquivo já
assinado), o `workflow.ts` recusa a operação nesse caso (`samePath`) em vez
de deixar o `mkvmerge` tentar ler e escrever o mesmo arquivo ao mesmo
tempo — o que corromperia o vídeo original.

## Renomeador

Página separada (`components/RenameView.tsx`) pra renomear em lote os vídeos
de uma pasta a partir de 4 campos — **Fansub**, **Nome do anime**,
**Temporada** e **Tags** (ex: `Judas` / `Black Clover` / `1` /
`BD HEVC 1080p`). Fluxo igual ao das outras páginas (escanear → tabela de
pré-visualização → aplicar), mais um botão **Atualizar**:

- O episódio é detectado automaticamente em cada arquivo via
  `episodeMatcher.findEpisode`; fansub/nome/temporada/tags valem pra pasta
  inteira (não são detectados por arquivo, exceto o episódio). Nome final:
  `[fansub] nome do anime - S{temporada}E{episódio} - tags` (partes vazias
  são omitidas, sem colchete/traço sobrando), com os números sempre em 2
  dígitos (`01`, `11`...) — `domain/renamePattern.ts`.
- **Detecção automática**: no primeiro escaneamento de uma pasta (campos
  ainda em branco), o app tenta identificar fansub (tag `[...]` no início do
  primeiro arquivo), nome do anime (texto entre a tag e a marcação de
  episódio) e temporada a partir de um arquivo de exemplo
  (`detectRenameFields`) e já preenche os campos — nunca sobrescreve edição
  manual do usuário (só dispara quando os 3 campos de texto estão vazios).
- **Atualizar**: reaplica os campos (fansub/nome/temporada/tags) editados em
  cima da mesma lista de arquivos já escaneada, sem reler a pasta do disco —
  só "Escanear pasta" volta a listar os arquivos de novo. Implementado como
  um caso de uso separado (`recomputeRename`, IPC `rename:recompute`) que
  reusa a mesma função pura de geração de nome.
- **Fansubs/tags conhecidas**: configuráveis na página Configurações
  (`renameFansubPresets`/`renameTagPresets` em `AppConfig`, editados via o
  componente reutilizável `ui/TagListEditor.tsx`) — sugeridas como dropdown
  nos campos Fansub (autocomplete nativo via `<datalist>`) e Tags (um
  `<select>` que soma a tag escolhida ao texto, sem substituir o que já foi
  digitado). Fansubs padrão: DKB, Erai-raws, EMBER, Judas, WF. Tags padrão:
  HEVC, BD, WebRip, 1080p, 720p.
- A última pasta usada é lembrada entre sessões (`AppConfig.renameFolder`,
  mesmo esquema de `sourceDir`/`destDir`).
- Arquivo sem episódio detectável no nome original é marcado como "não
  detectado" e fica de fora da renomeação (não trava a pasta inteira).
- Dois arquivos que gerariam o mesmo novo nome são marcados como conflito em
  vez de aplicados (renomear ambos pro mesmo nome perderia um dos dois).
- A extensão do arquivo original (`.mkv`, `.ass`...) é sempre preservada; só
  a base do nome muda.
- Só considera vídeos (`infra/videoFiles.ts`, mesmo filtro usado pelo resto
  do app) — não mexe em legendas/outros arquivos soltos na pasta.
- Cada renomeação (sucesso ou erro) também é gravada em `transfer-log.json`
  igual Transferir/Limpar (`renamer.ts` chama `appendTransferLog`) — aparece
  junto na página Histórico, com "Episódio" mostrando o `S00E00` calculado e
  "Arquivo gerado" mostrando o novo nome.

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
adição do deslocamento manual/Sincronizar. A página **Histórico** da Sidebar
(`components/HistoryView.tsx`) lê esse arquivo com paginação (100 por
página) e tem um botão **Apagar histórico** que zera o arquivo
(`clearTransferLog` em `infra/transferLog.ts`) — com dupla confirmação
(`ui/ConfirmDialog.tsx`, reutilizável: exige marcar uma caixinha antes de
liberar o botão de confirmar) já que é uma ação irreversível. A primeira
coluna ("Tipo") identifica qual operação gerou a entrada — Transferir
Legenda/Limpeza/Renomeador, via `TransferLogEntry.kind` — gravado por
`transferRows`/`cleanRows`/`renamer.ts` desde que o campo passou a existir;
entradas antigas (sem `kind`) caem no palpite `resolveKind` (mesmo
arquivo de origem e destino = Limpeza, senão Transferir — o Renomeador só
existe desde que esse campo já estava presente, então não entra nesse
palpite).

## Estrutura

```
src/
  main/
    domain/     regras puras, sem I/O:
                episodeMatcher.ts   — casar episodio pelo numero (temporada so desempata)
                subtitleLanguage.ts — reconhecer/priorizar legenda PT-BR
                audioLanguage.ts    — reconhecer audio em ingles
                subtitleTiming.ts   — parse/format de timecodes MM:SS,mmm
                subtitleEncoding.ts — decodificar legenda (UTF-8 com fallback Windows-1252)
    infra/      I/O: mkvToolNixLocator.ts, mkvProcess.ts, videoFiles.ts,
                configStore.ts, transferLog.ts, cancellation.ts (abortar)
    workflow.ts casos de uso: scanFolders/transferRows (Transferir),
                scanForClean/cleanRows (Limpar)
    index.ts    entrypoint do Electron + handlers IPC
  preload/      ponte contextBridge exposta como window.api
  renderer/     app React + main.tsx (bootstrap):
                App.tsx           orquestrador (estado + handlers), decide a pagina ativa
                theme.ts          tema (cores/spacing) + tipagem do styled-components
                GlobalStyle.ts    estilos globais (scrollbar, reset, fonte)
                ui/               primitivas genericas: primitives.ts (Button, Row, Col,
                                  Panel, Label, Input, SectionTitle), Chip.ts, Checkbox.tsx,
                                  ConfirmDialog.tsx (modal de confirmacao reutilizavel)
                components/       Sidebar (navegacao), WorkflowView (pagina Transferir/
                                  Limpar), HistoryView, SettingsView, FolderField,
                                  StatusBadge, LogPanel, EpisodeTable, SyncModal,
                                  NotificationsMenu — cada um com seu proprio estado
                utils/            subtitleDisplay.ts (formatacao de legenda/timing),
                                  completionSound.ts, useEscapeToClose.ts
  shared/       tipos TypeScript compartilhados entre main/preload/renderer
```
