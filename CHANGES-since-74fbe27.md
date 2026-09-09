# Mudancas desde o commit 74fbe2731e6144a51b2513826f51be89991436b4

Ponto de partida (nao incluido nesta lista): `74fbe27 - feat: normalize
separators in episode matching and clean detected text in rename pattern`.

## 1. Sincronizar dentro do mesmo arquivo (Editar Arquivo) — commit `e23dd1b`

Antes, o modal **Sincronizar** so funcionava no fluxo Transferir Legenda:
comparava a legenda do arquivo de origem (fixa) com uma legenda do arquivo de
destino (escolhida no modal). Agora ele tambem funciona na tela **Editar
Arquivo** (antiga "Limpeza"), corrigindo o timing de uma legenda usando outra
legenda do **mesmo arquivo** — util quando um episodio ja foi sincronizado
errado antes, mas o arquivo ainda tem as duas faixas embutidas.

- Novo campo `syncTrackId` em `EpisodeRow`, independente do dropdown de
  filtragem de faixas ("Limpeza" — o que sobra no arquivo final). Escolher
  qual faixa corrigir e escolher quais faixas manter agora sao decisoes
  totalmente separadas.
- Em Editar Arquivo, as duas colunas do modal Sincronizar ficam livres (o
  usuario escolhe qualquer faixa de legenda do arquivo dos dois lados). Em
  Transferir Legenda, o comportamento continua igual: a coluna "Legenda
  Destino" fica travada na faixa ja escolhida na tabela.
- `cleanTracksInto`/`cleanRows` (main) passaram a aplicar `--sync` e
  `--subtitle-tracks` num unico comando do mkvmerge — corrige o timing e
  filtra as faixas ao mesmo tempo, sem arquivo intermediario.
- Coluna "Sincronizacao" da tabela agora aparece nas duas telas (antes so em
  Transferir Legenda).

## 2. Renomeacao "Limpeza" -> "Editar Arquivo" — commit `7815d97`

Troca de terminologia em toda a interface visivel ao usuario: sidebar, titulo
da pagina, rotulos em Configuracoes, coluna "Tipo" do Historico e textos de
botao/log ("Processar selecionados", "Processando...", etc).

Identificadores internos foram deixados como estavam de proposito (nomes de
funcao/variavel, canais IPC `scan:clean`/`clean:run`, chaves do `AppConfig`
como `namingClean`/`cleanDefaults`, e o valor `kind: 'clean'` gravado no
historico) — mudar esses quebraria dados ja salvos em `config.json` e
`transfer-log.json` de instalacoes existentes.

## 3. Limpeza de comentarios em todo o codigo — commit `0df2544`

Removidos todos os comentarios (linha unica e bloco) de todos os arquivos
`.ts`/`.tsx` do projeto (42 arquivos, ~770 linhas). Nenhuma logica foi
alterada — so comentarios saíram; validado com `typecheck` e `build` limpos
antes do commit. Criado `CLAUDE.md` na raiz com as regras do projeto (nao
comentar codigo, nao commitar/gerar instalador sem autorizacao, seguir a
arquitetura em camadas existente).

## 4. Botao "Verificar atualizacoes" ao lado de "Importar configuracoes" (pendente de commit)

Em Configuracoes, o botao "Verificar atualizacoes" saiu de uma linha propria
e passou a ficar na mesma linha de "Exportar configuracoes"/"Importar
configuracoes".

## 5. Notificacao de "nenhuma atualizacao disponivel" no sino (pendente de commit)

Antes, o resultado de "Verificar atualizacoes" so aparecia no log da tela.
Agora, quando o usuario clica manualmente em "Verificar atualizacoes" e nao
ha nada novo, uma notificacao tambem aparece no sino de notificacoes (canto
superior direito), alem do log. Verificacoes automaticas (ao abrir o app)
continuam so no log, sem gerar notificacao no sino.

- Novo canal IPC `notification` (main -> renderer), disparado so quando a
  verificacao foi iniciada manualmente (`updates:check`).
- `window.api.onNotification(...)` exposto no preload.

## 6. Botao de lixeira em cada notificacao (pendente de commit)

O sino de notificacoes agora permite remover qualquer item individualmente
(clicando no icone de lixeira), em vez de so poder limpar tudo escaneando de
novo. `NotificationsMenu` foi generalizado para receber uma lista de grupos
(`{ title, items, onDismiss }`), reaproveitavel para os 3 tipos de
notificacao existentes hoje: "Sem correspondencia no destino", "Avisos do
escaneamento" e "Atualizacoes".

---

## Arquivos alterados (commits `e23dd1b` + `7815d97` + `0df2544` + mudancas pendentes)

- `ui/src/main/index.ts`
- `ui/src/main/infra/mkvProcess.ts`
- `ui/src/main/workflow.ts`
- `ui/src/preload/index.ts`
- `ui/src/shared/types.ts`
- `ui/src/renderer/src/App.tsx`
- `ui/src/renderer/src/components/EpisodeTable.tsx`
- `ui/src/renderer/src/components/SyncModal.tsx`
- `ui/src/renderer/src/components/SettingsView.tsx`
- `ui/src/renderer/src/components/Sidebar.tsx`
- `ui/src/renderer/src/components/HistoryView.tsx`
- `ui/src/renderer/src/components/WorkflowView.tsx`
- `ui/src/renderer/src/components/NotificationsMenu.tsx`
- Todos os demais arquivos `.ts`/`.tsx` do projeto (so remocao de
  comentarios, commit `0df2544`)
- `CLAUDE.md` (novo)

## Pendente

- As mudancas dos itens 4, 5 e 6 (botao de atualizacoes, notificacao de "sem
  atualizacao" e lixeira por notificacao) ainda nao foram commitadas —
  aguardando autorizacao.
