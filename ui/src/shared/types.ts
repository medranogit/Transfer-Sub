export interface SubtitleTrack {
  trackId: number
  // "Track number" do Matroska (properties.number do mkvmerge -J) - diferente
  // do trackId (id sequencial do mkvmerge, 0-based). Usado como seletor
  // (`track:@N`) do mkvpropedit pra editar nome/idioma da faixa sem remuxar -
  // ver infra/mkvProcess.ts. Preferido ao track UID porque cabe com folga
  // num number do JS (o UID e grande demais e perde precisao no JSON.parse).
  trackNumber: number
  codecId: string
  language: string
  trackName: string
  isAss: boolean
  isPtBr: boolean
  // true quando nenhuma faixa foi reconhecida como PT-BR por idioma/nome e
  // o conteudo da legenda parece portugues mesmo assim (fansub rotulou
  // errado). E so um palpite - ver domain/subtitleLanguage.ts.
  isPtBrGuess: boolean
}

export interface EpisodeRow {
  id: string
  episodeKey: string
  sourcePath: string
  sourceName: string
  destPath: string
  destName: string
  tracks: SubtitleTrack[]
  selectedTrackId: number | null
  // Instante em que a primeira legenda deve aparecer no video de destino,
  // no formato "MM:SS,mmm" (ex: "06:39,566") ou "H:MM:SS,mmm". Vazio = usar
  // o timing original, sem ajuste. O deslocamento e calculado no processo
  // principal a partir da legenda extraida. Mutuamente exclusivo com
  // manualOffsetText (a UI limpa um quando o outro e preenchido).
  firstLineTargetText: string
  // Deslocamento manual em milissegundos (positivo atrasa, negativo adianta),
  // como alternativa a firstLineTargetText. Vazio = nao aplicar deslocamento
  // manual (usa firstLineTargetText, se preenchido, ou o timing original).
  manualOffsetText: string
}

export interface ScanResult {
  rows: EpisodeRow[]
  warnings: string[]
  // Episodios encontrados na origem sem par correspondente no destino (nao
  // "nao identifiquei episodio" - esses ja entram em warnings - mas "achei o
  // episodio, so nao tem arquivo do outro lado com o mesmo numero").
  unmatchedSource: string[]
  // true quando o usuario clicou "Abortar" antes de escanear todos os
  // arquivos - rows/warnings/unmatchedSource refletem so o que rodou.
  aborted: boolean
}

export type RowStatus = 'idle' | 'extracting' | 'muxing' | 'done' | 'error'

export interface TransferProgressEvent {
  rowId: string
  status: RowStatus
  message?: string
}

export interface LogEvent {
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
}

export interface MkvToolsStatus {
  found: boolean
  mkvmergePath?: string
  mkvextractPath?: string
  mkvpropeditPath?: string
}

// Configuracao de como o app nomeia o arquivo de saida - uma por modo
// (Transferir/Limpeza), configuravel em Configuracoes: tagEnabled/tagWord
// acrescenta uma palavra livre no FINAL do nome (ex: "Nome do Episodio
// [legendado].mkv"). Desligado por padrao.
export interface NamingConfig {
  tagEnabled: boolean
  tagWord: string
}

// Estado inicial (ao abrir o app) dos alternadores/chips de cada tela,
// configuravel em Configuracoes - so o valor DEFAULT: o que o usuario mexe
// durante a sessao (ex: desligar "Remover dublagem" pra um lote especifico)
// nao e salvo de volta aqui, so afeta a sessao atual.
export interface TransferDefaults {
  movieMode: boolean
  removeEnglishAudio: boolean
  removeExtraSubtitles: boolean
}

export interface CleanDefaults {
  removeEnglishAudio: boolean
}

export interface RenameDefaults {
  movieMode: boolean
}

export interface AppConfig {
  sourceDir: string
  destDir: string
  outputDir: string
  mkvToolNixDir: string
  namingTransfer: NamingConfig
  namingClean: NamingConfig
  transferDefaults: TransferDefaults
  cleanDefaults: CleanDefaults
  renameDefaults: RenameDefaults
  // Nome da subpasta criada dentro da pasta de saida escolhida, onde os
  // arquivos finais de Transferir/Limpeza sao gerados (ver
  // infra/mkvProcess.ts:resolveResultFolder). Vazio cai no padrao "TS - Result".
  outputFolderName: string
  // Silencia os sons de conclusao/aviso (utils/completionSound.ts,
  // utils/warningSound.ts) sem desligar o restante da notificacao (log,
  // sino).
  muteSounds: boolean
  // Nome dado a faixa de legenda ao ser transferida, quando reconhecida como
  // PT-BR (por idioma/nome ou palpite de conteudo) - identifica facilmente
  // qual faixa o Transfer Sub adicionou em players que listam o nome da
  // faixa. So se aplica ao modo Transferir (Limpeza nao renomeia faixas).
  ptBrTrackName: string
  // Ultima pasta usada no Renomeador (nao tem par origem/destino/saida como
  // o resto do app - so essa).
  renameFolder: string
  // Listas configuraveis em Configuracoes, sugeridas via dropdown nos campos
  // Fansub/Tags do Renomeador - crescem conforme o usuario usa/cadastra.
  renameFansubPresets: string[]
  renameTagPresets: string[]
  // Ultimos arquivos escolhidos no Modo Filme do Transferir Legenda (nao tem
  // contagem de episodio pra parear automaticamente por pasta, entao o
  // usuario escolhe os dois arquivos direto).
  movieSourceFile: string
  movieDestFile: string
}

export interface TransferRequest {
  rows: EpisodeRow[]
  outputDir: string
  removeEnglishAudio: boolean
  // Remove as legendas que ja existiam no destino, deixando so a faixa
  // transferida. So se aplica ao modo Transferir (o modo Limpar ja tem seu
  // proprio controle por linha).
  removeExtraSubtitles: boolean
}

export interface TransferSummary {
  total: number
  success: number
  failed: number
  // true quando o usuario clicou "Abortar" antes de processar todas as
  // linhas - "total" continua sendo a selecao original, nao so o que rodou.
  aborted: boolean
}

// Uma linha de legenda ja parseada, usada pela tela de auto-sync manual
// (escolher a "mesma fala" em ingles e ptbr). Legendas de texto (ASS/SSA/
// SRT) preenchem "text"; legendas de imagem (PGS) nao tem texto codificado,
// entao preenchem "imageDataUrl" com um PNG (data URL) da propria imagem da
// legenda - o usuario le a imagem pra reconhecer a "mesma fala".
export interface SubtitleEvent {
  startMs: number
  text: string
  imageDataUrl?: string
}

export interface SyncPrepareResult {
  ptEvents: SubtitleEvent[]
  destTracks: SubtitleTrack[]
  // Faixa do destino que parece ser a legenda em ingles (por codigo de
  // idioma). Null quando nenhuma faixa bateu - o usuario escolhe manualmente.
  suggestedEnTrackId: number | null
  // Faixa realmente usada pra ja extrair enEvents abaixo: a preferida (vinda
  // de um episodio anterior), se ainda existir neste arquivo, senao a
  // sugerida. Null quando nenhuma das duas existe - a UI fica sem selecao.
  chosenEnTrackId: number | null
  // Falas da faixa chosenEnTrackId, ja extraidas em paralelo com ptEvents no
  // processo principal - evita uma segunda ida e volta (sync:trackEvents) so
  // pra carregar a selecao inicial, o que impediria de fato paralelizar.
  enEvents: SubtitleEvent[]
}

// Uma entrada do historico persistido em transfer-log.json - cobre
// transferencias, limpezas e renomeacoes, de qualquer sessao anterior do
// app. "kind" e opcional pra nao quebrar a leitura de entradas gravadas
// antes desse campo existir - ver HistoryView.resolveKind pro fallback.
export interface TransferLogEntry {
  timestamp: string
  kind?: 'transfer' | 'clean' | 'rename'
  episodeKey: string
  sourceFile: string
  destFile: string
  outputFile: string
  trackId: number | null
  language: string | null
  trackName: string | null
  firstLineTargetText: string
  appliedOffsetMs: number | null
  status: 'done' | 'error'
  error?: string
}

// Os 4 campos do Renomeador: "[fansub] nomeAnime - S(season)E(episodio) -
// tags". Season e tags valem pra pasta inteira; o episodio e detectado por
// arquivo - ver domain/renamePattern.ts. fansub/animeName podem ser
// detectados automaticamente no primeiro escaneamento (ver DetectedRenameFields).
export interface RenameFields {
  fansub: string
  animeName: string
  season: number
  tags: string
  // Filme: sem numero de episodio - omite a temporada/episodio do nome
  // gerado ("[fansub] nomeAnime - tags") e nao exige detectar episodio no
  // nome original.
  movieMode: boolean
}

// Palpite de fansub/nomeAnime/temporada/tags a partir do primeiro arquivo de
// uma pasta recem-escaneada - reaplicado a cada "Escanear pasta", mesmo que
// os campos ja tenham sido editados antes (ver previewRename).
export interface DetectedRenameFields {
  fansub: string
  animeName: string
  season: number
  tags: string
}

// Uma linha da pre-visualizacao do Renomeador: nome atual x novo nome
// calculado a partir dos campos. newName null = nao foi possivel gerar (ver
// skipReason) - a linha fica de fora quando o usuario clica "Renomear".
export interface RenamePreviewRow {
  id: string
  originalPath: string
  originalName: string
  newName: string | null
  skipReason: string | null
  // "S01E05" (temporada informada + episodio detectado) - so pra identificar
  // a linha no Historico; null quando o episodio nao foi detectado.
  episodeKey: string | null
}

export interface RenamePreviewResult {
  rows: RenamePreviewRow[]
  detected: DetectedRenameFields | null
  // Ex: "possivel episodio faltando entre 01 e 25: 14" - so calculado fora do
  // modo filme (que nao tem numero de episodio). Vazio quando nao ha buraco.
  warnings: string[]
}

export interface RenameSummary {
  total: number
  success: number
  failed: number
}

// Uma sessao do app (do momento que abre ate fechar) com log gravado em
// disco - ver infra/sessionLog.ts. "id" e o timestamp (ms) de quando o
// processo comecou, usado tambem como nome do arquivo .txt.
export interface SessionLogInfo {
  id: string
  label: string
  current: boolean
}
