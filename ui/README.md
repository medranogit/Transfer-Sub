# Transfer Sub - UI (Electron + React + TypeScript + styled-components)

Janela desktop nativa em React/TypeScript. É o único front-end do projeto —
a versão anterior em Tkinter/Python foi removida.

A navegação principal é um menu lateral (`components/Sidebar.tsx`, ícones do
[`@ant-design/icons`](https://ant.design/components/icon)) com seis
páginas:

- **Transferir Legenda** — casa episódios entre uma pasta de origem (com
  legenda) e uma de destino (sem legenda) e transfere a faixa escolhida.
  Tem um alternador **Episódio / Filme** no topo: em Episódio funciona como
  descrito acima (pastas inteiras, casamento por número de episódio); em
  Filme os campos viram **seletor de arquivo** (um de origem, um de destino)
  em vez de pasta, já que um filme não tem número de episódio pra casar
  automaticamente.
- **Limpeza** — não transfere nada; escaneia só uma pasta e permite
  manter apenas uma faixa de legenda (removendo as demais) e/ou remover a
  dublagem em inglês de cada arquivo.
- **Renomeador** — renomeia em lote os vídeos de uma pasta a partir de 4
  campos (fansub, nome do anime, temporada, tags; o episódio é detectado por
  arquivo), com o mesmo alternador **Episódio / Filme** (em Filme o campo
  Temporada some e o nome gerado não leva `S00E00`). Também tem um botão
  separado pra **rotular em lote a faixa de legenda PT-BR já embutida** nos
  `.mkv`/`.webm` da pasta (edição de metadado, sem remuxar nada).
- **Histórico** — todas as transferências/limpezas/renomeações já feitas,
  persistidas em `transfer-log.json` (sobrevive a reinícios do app).
- **Log da Sessão** — o log bruto (todas as linhas, igual ao painel da tela)
  de qualquer sessão anterior do app, um arquivo `.txt` por sessão (do
  momento que abre até fechar), navegável sem precisar copiar o log da tela
  antes de fechar. Diferente do Histórico (só eventos estruturados de
  transferência/limpeza/renomeação), aqui é tudo — inclusive navegação entre
  páginas e mudanças de zoom.
- **Configurações** — status/localização do MKVToolNix, marcação livre no
  final do nome de saída (por modo), o nome dado à faixa de legenda quando
  reconhecida como PT-BR, e as fansubs/tags conhecidas do Renomeador; é o
  lugar certo pra qualquer preferência global futura (as opções atuais, tipo
  remover áudio, são por operação e ficam nas páginas de Transferir/Limpar).

Trocar de página **preserva** o escaneamento em andamento: o último resultado
de Transferir Legenda e o de Limpeza ficam guardados cada um no seu canto
(`transferSnapshot`/`cleanSnapshot` em `App.tsx`) e voltam do jeito que
estavam ao reentrar na página, mesmo passando por outras páginas no meio
(Renomeador/Histórico/Log da Sessão/Configurações) — salvar ao sair e
restaurar ao entrar são independentes um do outro, então uma navegação
indireta (Transferir → Configurações → Limpeza → Transferir) não perde nada.
O menu inteiro fica bloqueado (exceto a página ativa) durante um
escaneamento/transferência/limpeza em andamento; as demais páginas navegam
livremente fora disso. Toda troca de página também vira uma linha no log
(tela + arquivo da sessão).

A lógica de negócio roda inteira no processo principal do Electron (Node.js),
separada em duas camadas:

- `src/main/domain/` — regras puras, sem I/O:
  - `episodeMatcher.ts` — identifica episódio pelo nome do arquivo. Casa
    origem/destino pelo **número do episódio**; a temporada só desempata
    quando há mais de um arquivo com o mesmo número de um lado (pasta com
    temporadas misturadas) — releases de fansub raramente incluem a
    temporada no nome, então exigir que os dois lados concordassem nisso
    deixava de casar episódios legítimos. `findEpisodeMatch` devolve também
    a posição do episódio dentro do nome (tanto quando um padrão tipo
    `S01E05` bate direto quanto no fallback de último-número-isolado — a
    limpeza de ruído preserva o tamanho da string trocando cada trecho por
    espaços, em vez de colapsar tudo, pra posição continuar batendo com o
    nome original), usada pelo Renomeador pra cortar nome do anime e tags.
    Também expõe `findEpisodeGaps`/`describeEpisodeGaps`, que detectam
    "buracos" na sequência de números de episódio de uma pasta (ver seção
    própria abaixo).
  - `subtitleLanguage.ts` — reconhece/prioriza legenda PT-BR e resolve o
    nome/idioma que a faixa recebe ao ser transferida.
  - `audioLanguage.ts` — reconhece faixas de áudio em inglês.
  - `subtitleTiming.ts` — converte texto `MM:SS,mmm` em milissegundos,
    encontra o instante da primeira legenda num arquivo `.ass`/`.ssa`/`.srt`
    e parseia todas as falas (`parseSubtitleEvents`) para a tela de sync.
  - `pgsSubtitle.ts` — decodifica legenda de imagem (`.sup`, codec Matroska
    `S_HDMV/PGS`, comum em BDs) direto do stream binário: segmentos PDS
    (paleta)/ODS (bitmap, RLE)/PCS (composição)/END, YCbCr→RGB, e um
    encoder de PNG minimalista escrito na mão (sem depender de `sharp`/libs
    externas) via `zlib.deflateSync` do próprio Node — cada frame decodificado
    vira um `SubtitleEvent` com `imageDataUrl` (PNG em base64) em vez de texto,
    pra tela de sync mostrar a imagem da legenda.
  - `renamePattern.ts` — gera o novo nome de um arquivo a partir dos 4
    campos do Renomeador e detecta fansub/nome/temporada/tags a partir de um
    arquivo de exemplo (`detectRenameFields`).
- `src/main/infra/` — tudo que toca o mundo exterior: localizar o
  MKVToolNix (`mkvmerge`/`mkvextract`/`mkvpropedit`), listar arquivos de
  vídeo, chamar `mkvmerge`/`mkvextract`/`mkvpropedit` (`mkvProcess.ts`),
  persistir a configuração (`configStore.ts`), gravar o log de
  transferências (`transferLog.ts`), gravar o log bruto de cada sessão do
  app (`sessionLog.ts`, um `.txt` por sessão, com poda automática das mais
  antigas), renomear um arquivo no disco (`fileRename.ts`) e permitir abortar
  uma operação em andamento matando o processo atual (`cancellation.ts`).
- `src/main/workflow.ts` — orquestra domain + infra nos casos de uso que o
  processo principal expõe via IPC: `scanFolders`/`transferRows` (modo
  Transferir), `scanMovie` (modo Filme do Transferir — escaneia um par de
  arquivos já escolhidos em vez de pastas inteiras), `scanForClean`/
  `cleanRows` (modo Limpar), `prepareSync`/`getTrackEvents` (dados para o
  modal de sincronização) e `renameSubtitleTracks` (rotular em lote a faixa
  PT-BR já embutida num `.mkv`/`.webm`, via `mkvpropedit`).
- `src/main/renamer.ts` — caso de uso do Renomeador: `previewRename` lista os
  vídeos da pasta, detecta fansub/nome/temporada/tags do primeiro arquivo (e
  sobrescreve os campos a cada escaneamento) e calcula o novo nome de cada um
  (marcando conflito quando dois arquivos gerariam o mesmo nome);
  `recomputeRename` reaplica os campos atuais sem reler a pasta (botão
  "Atualizar"); `applyRename` executa a renomeação linha a linha.
- `src/main/index.ts` — a única camada que conhece Electron/IPC; registra os
  handlers e cria a janela. Também cuida de: **instância única**
  (`app.requestSingleInstanceLock()` — abrir o app de novo só foca a janela
  já aberta em vez de criar uma segunda) e **zoom nativo** (`webContents.
  setZoomFactor`, já que Electron não liga `Ctrl +`/`Ctrl -`/`Ctrl 0` a zoom
  sozinho sem um `Menu` de aplicação — aqui é um listener de teclado no
  renderer + IPC pros handlers `zoom:in`/`zoom:out`/`zoom:reset`, limitado a
  ±2 passos de 10% a partir do padrão de 100%, ou seja 80%–120%).

A janela (React) só fala com o processo principal via IPC
(`src/preload/index.ts`), nunca chama o MKVToolNix diretamente. O front-end
fica em `src/renderer/src/`, dividido por responsabilidade: `App.tsx` é só o
orquestrador (estado + handlers, decide qual página mostrar); `theme.ts`/
`GlobalStyle.ts` cuidam do tema; `ui/` guarda primitivas genéricas
reaproveitáveis (`Button`, `Row`, `Chip`, `Checkbox`, `ConfirmDialog`,
`Table`, `EpisodeMovieToggle`, `SuggestInput`/`TagPickerInput`...);
`components/` tem um arquivo por peça de UI com estado/lógica própria —
inclui as seis páginas da Sidebar (`WorkflowView` usada tanto por
Transferir quanto por Limpar, `RenameView`, `HistoryView`, `SessionLogView`,
`SettingsView`) e peças menores (`EpisodeTable`, `SyncModal`, `LogPanel`,
`FolderField`, `FileField`, `NotificationsMenu`...); `utils/` guarda funções
puras de formatação (legenda/timing, som de conclusão/aviso).

## Rodando em desenvolvimento

```
npm install
npm run dev
```

Isso abre a janela do app com hot-reload. Requer o MKVToolNix instalado
(detectado automaticamente em `C:\Program Files\MKVToolNix`, ou configurável
pela própria interface em "Localizar MKVToolNix..."; o app precisa achar
`mkvmerge.exe`, `mkvextract.exe` **e** `mkvpropedit.exe` juntos na mesma
pasta).

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

### Release automatica (GitHub Actions)

`.github/workflows/release.yml` builda e publica o instalador sozinho quando
uma tag `vX.Y.Z` e' empurrada - precisa bater com o `version` deste
`package.json`, ja' que e' o que o `electron-builder` usa (via
`--publish always`, config `build.publish` no `package.json`) pra decidir o
nome/tag da Release no GitHub, nao a tag que disparou o workflow. Roda num
runner Windows (o instalador e' NSIS, so' builda em Windows) e usa o
`GITHUB_TOKEN` que o proprio Actions ja' fornece - nao precisa cadastrar
nenhum secret. Tambem pode ser disparado manualmente (sem tag) pela aba
Actions do GitHub (`workflow_dispatch`), util pra testar o workflow em si.

```
git tag v2.3.0
git push origin v2.3.0
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

Quando nenhuma faixa é reconhecida como PT-BR por idioma/nome, o app extrai
cada faixa e usa `guessPtBrFromContent` (mesmo arquivo) para procurar, no
texto, palavras bem características do português (evitando as que também
existem em espanhol/italiano) e a terminação `-ção`/`-ções`. Se achar, marca
a faixa com `isPtBrGuess` e loga um aviso — a UI mostra `⚠ pode ser PT-BR` no
dropdown, mas não bloqueia nada, é só um alerta pra conferir. Essa mesma
detecção (idioma/nome, com o palpite por conteúdo como último recurso) é
reaproveitada pelo escaneamento normal **e** pela rotulagem em lote de faixas
do Renomeador (ver seção própria abaixo).

## Fontes anexadas (attachments)

Legendas ASS costumam depender de fontes customizadas anexadas ao `.mkv` de
origem (fansubs sempre embutem as delas). Sem levar essas fontes junto, a
legenda transferida perde a formatação porque o player cai numa fonte
genérica. `transferRows` copia os attachments do arquivo de origem para o
final via `--attach-file`/`--attachment-name`/`--attachment-mime-type`.

## Nome e idioma da faixa transferida

A faixa PT-BR transferida é renomeada para o valor configurado em
Configurações → "Nome da faixa de legenda" (`AppConfig.ptBrTrackName`,
padrão `Portugues BR` — `resolveTransferTrackName` em `subtitleLanguage.ts`)
e vai com idioma `por` (`resolveTransferLanguage`), reforçando o idioma
correto mesmo que a faixa original viesse rotulada como `und` ou com um
código errado. Faixas que não são PT-BR mantêm nome e idioma originais.

Esse mesmo nome/idioma pode ser aplicado **retroativamente** em arquivos
`.mkv`/`.webm` que já tenham uma legenda embutida (transferidos antes de essa
configuração existir, ou renomeados manualmente) — ver "Rotular faixa PT-BR"
na seção do Renomeador.

## Modo Filme (Transferir Legenda e Renomeador)

Filmes não têm número de episódio pra casar/detectar automaticamente, então
tanto o Transferir Legenda quanto o Renomeador têm um alternador
**Episódio / Filme** (`ui/EpisodeMovieToggle.tsx`, sempre começa em
Episódio, não persiste entre sessões):

- **Transferir Legenda**: em Filme, os campos "Pasta de origem"/"Pasta de
  destino" viram **"Arquivo de origem"/"Arquivo de destino"**
  (`components/FileField.tsx`, com diálogo `dialog:chooseFile` filtrado por
  extensão de vídeo) — você escolhe os dois arquivos direto em vez de pastas
  inteiras. O botão vira "Preparar filme" e a tabela mostra uma única linha,
  reaproveitando toda a lógica existente (detecção de faixa PT-BR, seleção
  de faixa, sincronização manual, transferência) via `workflow.scanMovie`.
  Os últimos arquivos escolhidos ficam salvos (`AppConfig.movieSourceFile`/
  `movieDestFile`).
- **Renomeador**: em Filme, o campo "Temporada" some e o nome gerado não
  leva `S00E00` (vira só `[fansub] nome do filme - tags`) — ver seção do
  Renomeador.

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

Ao abrir, o modal já busca em paralelo (`workflow.prepareSync`) a extração
da legenda de origem e a sondagem + extração da legenda em inglês do
destino — as duas cadeias não dependem uma da outra, então o tempo total
fica limitado pela mais lenta, não pela soma das duas.

Qualquer valor calculado vira um `--sync` no `mkvmerge` para deslocar toda a
legenda. Deixe todos os campos em branco para manter o timing original.

![Modal de sincronização, com as duas colunas de legenda lado a lado](../docs/sync-modal.png)

### Sincronizar automaticamente com legenda de imagem (PGS)

Faixas PGS (`.sup`, comuns em releases de BD) não têm texto codificado — só
bitmaps. `canSyncTrack` (`utils/subtitleDisplay.ts`) reconhece PGS como
"sincronizável" mesmo sem texto; `domain/pgsSubtitle.ts` decodifica cada
frame do stream binário (segmentos PDS/ODS/PCS/END, RLE, YCbCr→RGB) e gera um
PNG (via `zlib.deflateSync`, sem depender de biblioteca externa) para cada
`SubtitleEvent.imageDataUrl`. O modal (`SyncModal.tsx`) mostra a imagem em vez
do texto quando `imageDataUrl` existe — a coluna some no lugar do texto tanto
do lado PT-BR (sempre extraído já sabendo o codec) quanto do lado inglês. A
faixa é tratada como **segunda opção**: o app sempre tenta identificar
automaticamente a legenda em inglês do destino (por código de idioma) e,
sendo texto, mostra as falas normalmente; só quando a faixa disponível é de
imagem (ou o usuário troca manualmente pra uma) é que aparecem as imagens —
o usuário ainda escolhe visualmente a "mesma fala" nos dois lados do mesmo
jeito, só que reconhecendo pela imagem em vez de ler o texto. Um único objeto
de composição corrompido no meio do arquivo (raro, mas existe em alguns BDs)
é pulado individualmente (try/catch por frame) em vez de derrubar a extração
inteira. Faixas VobSub (`S_VOBSUB`) continuam sem suporte (nem texto nem
imagem) — o modal avisa e o ajuste ali precisa ser manual (1ª fala/deslocamento).

## Tabela de episódios

`components/EpisodeTable.tsx` mostra, da esquerda pra direita: checkbox,
Episódio, Sincronização (botão + ícone de relógio quando já há um ajuste de
timing salvo), Faixa de legenda, **Arquivo origem**, uma seta (→) e
**Arquivo destino**, Status — arquivo de origem fica do lado esquerdo da
seta e o de destino do lado direito, refletindo a direção real da
transferência. Nomes de arquivo/anime longos quebram linha
(`overflow-wrap: break-word`) em vez de truncar com reticências, então dá
pra ler o nome inteiro sem precisar de tooltip. A faixa PT-BR selecionada
automaticamente mostra um ícone de check verde com tooltip explicando o
motivo (idioma/nome reconhecido), em vez de um texto fixo do lado.

## Chips de opções

As opções booleanas (remover dublagem, limpar legendas extras) aparecem como
chips clicáveis (`ui/Chip.ts`, agrupados num `ChipRow`) em vez de checkbox
tradicional: ficam verdes quando ativas, neutras quando não, com tamanho
ajustado ao texto (não esticam pra preencher a linha) — e a linha quebra
sozinha (`flex-wrap`) se mais opções forem adicionadas no futuro. Cada chip
tem um `title` (tooltip nativo do navegador) com a explicação completa, já
que o texto visível é propositalmente curto. Ficam na mesma linha do
alternador **Episódio / Filme**, logo acima dos campos de pasta/arquivo —
os itens dessa linha (`Row` com `flex-wrap`) ficam colados da esquerda pra
direita (sem `justify-content: space-between` nem espaço reservado quando um
lado tem menos itens que o outro, ex. modo Limpeza com só um chip).

- **"Remover dublagem em inglês"** (ativado por padrão, vale para os dois
  modos) — antes de gerar o arquivo final, o app lê as faixas de áudio do
  vídeo e, se houver alguma em inglês, remuxa mantendo só as demais — a
  menos que isso zere todas as faixas de áudio, caso em que mantém tudo por
  segurança (com aviso no log).
- **"Limpar legendas do destino"** (só no modo Transferir) — remove as
  legendas que já existiam no arquivo de destino no resultado final,
  mantendo apenas a faixa transferida.

## Abortar uma operação em andamento

O botão **Abortar** aparece ao lado de "Transferir/Limpar selecionados" (e
também durante o Escaneamento) enquanto uma operação roda. Ele mata o
processo `mkvmerge`/`mkvextract` atual na hora (`infra/cancellation.ts`) e
para de processar os itens restantes; o arquivo de saída parcial (truncado
pela morte do processo) é apagado automaticamente. Os itens já concluídos
antes do abort permanecem intactos.

## Não sobrescreve com duplicados

O nome do arquivo de saída é fixo por episódio/arquivo (o original,
opcionalmente com uma marcação livre no final — ver Configurações), então
rodar de novo sobre o mesmo arquivo sobrescreve o resultado anterior em vez
de criar `(1)`, `(2)` etc. — a identificação é só pelo nome do arquivo de
origem.

Em Configurações dá pra ligar, por modo (Transferir/Limpeza), uma marcação
extra no final do nome (`NamingConfig.tagEnabled`/`tagWord` em
`shared/types.ts`, ex. `[legendado]`/`[limpo]` — a palavra é livre, desligada
por padrão).

Como a saída pode acabar com o mesmo nome do arquivo de entrada quando a
pasta de saída é igual à de destino, o `workflow.ts` recusa a operação nesse
caso (`samePath`) em vez de deixar o `mkvmerge` tentar ler e escrever o
mesmo arquivo ao mesmo tempo — o que corromperia o vídeo original.

## Pasta de saída (subpasta "TS - Result")

Os arquivos finais de Transferir/Limpeza não vão direto na pasta de saída
escolhida — vão numa **subpasta** criada dentro dela (`resolveResultFolder`
em `infra/mkvProcess.ts`), criada automaticamente (`mkdir` recursivo) antes de
gerar qualquer arquivo. Fica claro o que o app gerou, sem misturar com o
resto do que já estiver na pasta, e reduz bastante os casos em que
"pasta de saída igual a de destino" bloquearia a operação (ver seção acima) —
já que o arquivo final não cai mais no mesmo caminho do arquivo de destino.

O nome da subpasta é configurável em Configurações → Geral
(`AppConfig.outputFolderName`), padrão `"TS - Result"`; se o campo ficar
vazio, cai de volta nesse padrão (`DEFAULT_RESULT_FOLDER_NAME`).

## Aviso de episódio faltando

Fácil de não perceber, olhando uma tabela com muitos arquivos, que falta um
episódio no meio da sequência (ex.: pasta vai do 01 ao 25 mas não tem o 14).
`findEpisodeGaps`/`describeEpisodeGaps` (`domain/episodeMatcher.ts`) recebem a
lista de números de episódio encontrados numa pasta e devolvem os que faltam
dentro do intervalo mínimo–máximo (só faz sentido com 2+ números diferentes;
não aponta nada fora desse intervalo, já que não há como saber quantos
episódios a temporada realmente tem). Usado nos três escaneamentos que lidam
com pasta(s) de vários arquivos:

- `scanFolders` (Transferir Legenda) — checa a pasta de origem e a de destino
  **separadamente**, cada uma podendo gerar seu próprio aviso.
- `scanForClean` (Limpeza) — checa a única pasta escaneada.
- `previewRename` (Renomeador) — checa a pasta, exceto em **Modo Filme**
  (onde não há número de episódio).

O aviso entra no mesmo array `warnings` que os demais alertas de
escaneamento — aparece no log (nível `warn`) e no sino de notificações do
topo (`NotificationsMenu`), com o som de aviso tocando junto. No Renomeador
isso exigiu adicionar `warnings` ao `RenamePreviewResult` (antes só tinha
`rows`/`detected`) e ligar `handleRenameScan` (`App.tsx`) no mesmo
`scanWarnings`/`playWarningSound` que Transferir/Limpeza já usavam.

## Renomeador

Página separada (`components/RenameView.tsx`) pra renomear em lote os vídeos
de uma pasta a partir de 4 campos — **Fansub**, **Nome do anime**,
**Temporada** (some no modo Filme) e **Tags** (ex: `Judas` / `Black Clover` /
`1` / `BD HEVC 1080p`). Fluxo igual ao das outras páginas (escanear → tabela
de pré-visualização → aplicar), mais dois botões extras — **Atualizar** e
**Rotular faixa PT-BR**:

- O episódio é detectado automaticamente em cada arquivo via
  `episodeMatcher.findEpisode`; fansub/nome/temporada/tags valem pra pasta
  inteira (não são detectados por arquivo, exceto o episódio). Nome final:
  `[fansub] nome do anime - S{temporada}E{episódio} - tags` (partes vazias
  são omitidas, sem colchete/traço sobrando), com os números sempre em 2
  dígitos (`01`, `11`...) — `domain/renamePattern.ts`. No modo **Filme** não
  há temporada/episódio: o nome vira `[fansub] nome do filme - tags` e não
  exige detectar nenhum episódio no nome original (diferente do modo
  Episódio, onde a ausência de episódio detectado bloqueia a linha).
- **Detecção automática**: a **cada** "Escanear pasta" (não só na primeira
  vez), o app tenta identificar fansub (tag `[...]` no início do primeiro
  arquivo), nome do anime, temporada e tags a partir de um arquivo de
  exemplo (`detectRenameFields`) e **sobrescreve** os campos com o que
  encontrar — mesmo que você tenha editado manualmente antes. Nome/tags são
  o texto antes/depois da marcação de episódio (funciona tanto quando um
  padrão tipo `S01E05` bate direto quanto no fallback de
  último-número-isolado, ex. `Nome - 01.mkv`, já que `findEpisodeMatch`
  reporta a posição do episódio nos dois casos). Quem quiser manter os
  campos atuais sem essa sobrescrita usa o botão **Atualizar** em vez de
  escanear de novo.
- **Atualizar**: reaplica os campos (fansub/nome/temporada/tags) editados em
  cima da mesma lista de arquivos já escaneada, sem reler a pasta do disco e
  **sem** rodar a detecção automática — só "Escanear pasta" detecta/
  sobrescreve de novo. Implementado como um caso de uso separado
  (`recomputeRename`, IPC `rename:recompute`) que reusa a mesma função pura
  de geração de nome.
- **Rotular faixa PT-BR**: separado do "Renomear" (que só troca o nome do
  arquivo) — pega os arquivos `.mkv`/`.webm` já escaneados e edita **só o
  metadado** da faixa de legenda já embutida em cada um (`mkvpropedit`,
  seletor `track:@N` pelo "track number" do Matroska — não remuxa o arquivo
  inteiro, é quase instantâneo mesmo em arquivos grandes). Reaproveita a
  mesma detecção de PT-BR do Transferir (idioma/nome reconhecido, com
  palpite pelo conteúdo como último recurso), troca o nome da faixa para o
  configurado em Configurações e sempre reforça o idioma como `por`.
  Arquivos sem nenhuma faixa reconhecida como PT-BR, ou já rotulados
  corretamente, são pulados (aparece no log) — `workflow.renameSubtitleTracks`
  /`infra/mkvProcess.ts:setSubtitleTrackLabel`.
- **Fansubs/tags conhecidas**: configuráveis na página Configurações
  (`renameFansubPresets`/`renameTagPresets` em `AppConfig`, editados via o
  componente reutilizável `ui/TagListEditor.tsx`) — sugeridas como dropdown
  customizado nos campos Fansub (`ui/SuggestInput.tsx` — substitui o campo
  inteiro ao clicar) e Tags (`ui/SuggestInput.tsx:TagPickerInput` — soma/
  remove a tag do texto ao clicar, sem fechar o dropdown, pra dar pra
  marcar várias seguidas). Fansubs padrão: DKB, Erai-raws, EMBER, Judas, WF
  (mais as que o usuário for cadastrando). Tags padrão: HEVC, BD, WebRip,
  1080p, 720p.
- A última pasta usada é lembrada entre sessões (`AppConfig.renameFolder`,
  mesmo esquema de `sourceDir`/`destDir`).
- Arquivo sem episódio detectável no nome original (modo Episódio) é
  marcado como "não detectado" e fica de fora da renomeação (não trava a
  pasta inteira).
- Dois arquivos que gerariam o mesmo novo nome são marcados como conflito em
  vez de aplicados (renomear ambos pro mesmo nome perderia um dos dois).
- A extensão do arquivo original (`.mkv`, `.ass`...) é sempre preservada; só
  a base do nome muda.
- Só considera vídeos (`infra/videoFiles.ts`, mesmo filtro usado pelo resto
  do app) — não mexe em legendas/outros arquivos soltos na pasta.
- Cada renomeação (sucesso ou erro) também é gravada em `transfer-log.json`
  igual Transferir/Limpar (`renamer.ts` chama `appendTransferLog`) — aparece
  junto na página Histórico, com "Episódio" mostrando o `S00E00` calculado e
  "Arquivo gerado" mostrando o novo nome. A rotulagem de faixa (que não
  mexe no nome do arquivo) não gera entrada própria no Histórico.

## Log de transferências

O painel de log na tela (`components/LogPanel.tsx`) colore cada linha por
nível (`info`/`success`/`warn`/`error`) com um ícone e um leve tingimento de
fundo; o texto é selecionável/copiável (`user-select: text`, exceção ao resto
da UI que desativa seleção pra não marcar rótulo de botão/checkbox sem
querer) e um botão **Limpar log** (ao lado do título "Log", em
`WorkflowView.tsx`) zera só a lista em tela da sessão atual — não mexe no
arquivo da sessão gravado em disco (ver "Log da Sessão" abaixo). Um som de
conclusão minimalista (`utils/completionSound.ts`, via Web Audio API) toca ao
terminar uma transferência ou limpeza; um som de aviso diferente, mais grave
(`utils/warningSound.ts`) toca quando um escaneamento produz avisos, episódio
faltando na numeração ou sem correspondência — o mesmo sino de notificações
do topo (`NotificationsMenu`) que mostraria o badge.

**Todo** erro do app aparece no log, mesmo os que só apareceriam dentro de um
modal/tela específica: `HistoryView` e `SyncModal` recebem um `onError`
(`App.tsx` repassa pra `pushLog(message, 'error')`) além do próprio estado
local de erro exibido ali — assim uma falha ao preparar a sincronização ou ao
apagar o histórico, por exemplo, não fica só visível numa tela que o usuário
pode não estar olhando.

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
entradas antigas (sem `kind`) caem no palpite `resolveKind` (mesmo arquivo
de origem e destino, e a saída na mesma pasta do arquivo de origem = na
verdade Renomeador; mesmo arquivo de origem e destino noutra pasta =
Limpeza; senão Transferir).

## Log da Sessão

Além do painel da tela (que só existe enquanto o app está aberto) e de
`transfer-log.json` (só histórico estruturado de transferência/limpeza/
renomeação), `infra/sessionLog.ts` grava **todo** evento de log
(`appendSessionLog`) num arquivo `.txt` por sessão (do momento que o
processo abre até fechar, nome = timestamp de início) — `session-logs/`
dentro da pasta de dados do usuário quando empacotado, ou na raiz do
projeto em desenvolvimento (mesmo esquema de `transfer-log.json`). Isso
cobre coisas que não entram em `transfer-log.json`: navegação entre
páginas, avisos de escaneamento, mudanças de zoom, erros de UI. Sessões
antigas além de `MAX_SESSIONS` (200) são apagadas automaticamente na
abertura do app (`pruneOldSessionLogs`).

A página **Log da Sessão** (`components/SessionLogView.tsx`) lista as
sessões com log gravado (mais recente primeiro, sessão atual marcada com um
ponto verde) numa coluna lateral, e mostra o conteúdo da selecionada — as
linhas aparecem na **ordem contrária** de como foram gravadas (mais recente
no topo), diferente do painel da tela (que cresce pra baixo, ao vivo); faz
mais sentido aqui porque é histórico, não algo acompanhado em tempo real. O
texto também é selecionável/copiável.

## Configurações

`components/SettingsView.tsx` — layout em grid de 2 colunas fixas (cada
painel é atribuído a uma coluna no JSX, não balanceado automaticamente pelo
navegador, pra não pular de coluna sozinho conforme o conteúdo cresce). Além
do que já tinha (MKVToolNix, nome do arquivo de saída, nome da faixa PT-BR,
presets do Renomeador), agora tem:

- **Predefinições por tela** (`AppConfig.transferDefaults`/`cleanDefaults`/
  `renameDefaults`) — o estado com que Transferir Legenda, Limpeza e
  Renomeador já abrem: Modo Episódio/Filme (mesmo componente
  `EpisodeMovieToggle` usado nas telas de trabalho, um interruptor — ativar
  um lado desativa o outro) e as ações padrão ("Remover dublagem em inglês",
  "Limpar legendas do destino", só no Transferir). Mudar aqui já aplica no
  estado ao vivo da tela correspondente na hora (não só na próxima abertura
  do app) e persiste como o novo padrão. `removeEnglishAudio`/
  `removeExtraSubtitles` deixaram de ser um único estado compartilhado entre
  Transferir e Limpeza (`App.tsx`) — cada tela tem o seu, senão não daria pra
  configurar um padrão diferente por tela de verdade.
- **Silenciar sons** (`AppConfig.muteSounds`) — desliga os sons de
  conclusão/aviso (`utils/completionSound.ts`/`warningSound.ts`) sem afetar
  o resto (log, sino de notificações).
- **Exportar/Importar configurações** — grava/lê o `AppConfig` inteiro num
  `.json` à parte do `config.json` interno (`infra/configStore.ts:
  exportConfig`/`importConfig`), via diálogo de salvar/abrir arquivo. Útil
  pra levar a configuração pra outra máquina ou guardar um backup manual.
  Importar sempre mescla sobre os valores padrão (mesmo esquema do
  `loadConfig`), então um arquivo exportado de uma versão mais antiga (sem
  algum campo novo) continua carregando sem quebrar.

`config.json` fica em `app.getPath('userData')` (fora da pasta de instalação
do app) — sobrevive normalmente a atualizações/reinstalações, já que o
instalador só limpa a pasta de instalação, nunca a de dados do usuário.

## Estrutura

```
src/
  main/
    domain/     regras puras, sem I/O:
                episodeMatcher.ts   — casar episodio pelo numero (temporada so desempata);
                                      findEpisodeMatch devolve posicao (padrao direto OU fallback)
                subtitleLanguage.ts — reconhecer/priorizar legenda PT-BR, resolver nome/idioma
                                      da faixa transferida
                audioLanguage.ts    — reconhecer audio em ingles
                subtitleTiming.ts   — parse/format de timecodes MM:SS,mmm
                subtitleEncoding.ts — decodificar legenda (UTF-8 com fallback Windows-1252)
                pgsSubtitle.ts      — decodificar legenda de imagem PGS (.sup) em PNGs, pro
                                      modal de sync mostrar quando nao ha texto codificado
                renamePattern.ts    — gerar nome + detectar fansub/nome/temporada/tags (Renomeador)
    infra/      I/O: mkvToolNixLocator.ts (mkvmerge/mkvextract/mkvpropedit), mkvProcess.ts,
                videoFiles.ts, configStore.ts, transferLog.ts, sessionLog.ts (log bruto por
                sessao, pagina Log da Sessao), cancellation.ts (abortar), fileRename.ts
    workflow.ts casos de uso: scanFolders/transferRows (Transferir), scanMovie (Transferir
                modo Filme), scanForClean/cleanRows (Limpar), prepareSync/getTrackEvents
                (modal de sync), renameSubtitleTracks (rotular faixa PT-BR em lote)
    renamer.ts  caso de uso do Renomeador: previewRename/recomputeRename/applyRename
    index.ts    entrypoint do Electron + handlers IPC, instancia unica
                (requestSingleInstanceLock), zoom nativo da janela (zoom:in/out/reset)
  preload/      ponte contextBridge exposta como window.api
  renderer/     app React + main.tsx (bootstrap):
                App.tsx           orquestrador (estado + handlers), decide a pagina ativa,
                                  guarda snapshot do scan por modo (Transferir/Limpeza),
                                  atalhos de zoom (Ctrl +/-/0)
                theme.ts          tema (cores/spacing) + tipagem do styled-components
                GlobalStyle.ts    estilos globais (scrollbar, reset, fonte)
                ui/               primitivas genericas: primitives.ts (Button, Row, Col,
                                  Panel, Label, Input, SectionTitle), Chip.ts, Checkbox.tsx,
                                  ConfirmDialog.tsx, EpisodeMovieToggle.tsx, SuggestInput.tsx
                                  (SuggestInput/TagPickerInput), TagListEditor.tsx
                components/       Sidebar (navegacao, 6 paginas), WorkflowView (pagina
                                  Transferir/Limpar, com modo Filme), RenameView (com modo
                                  Filme e rotulagem de faixa), HistoryView, SessionLogView
                                  (log bruto por sessao), SettingsView, FolderField,
                                  FileField, StatusBadge, LogPanel, EpisodeTable, SyncModal
                                  (com imagem PGS), NotificationsMenu — cada um com seu
                                  proprio estado
                utils/            subtitleDisplay.ts (formatacao de legenda/timing),
                                  completionSound.ts, warningSound.ts, useEscapeToClose.ts
  shared/       tipos TypeScript compartilhados entre main/preload/renderer
```

## Licenca

[MIT](../LICENSE) — copyright (c) 2026 Vinicius Medrano.
