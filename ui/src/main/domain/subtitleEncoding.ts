// Regras de dominio: decodificar os bytes brutos de um arquivo de legenda
// sem assumir UTF-8 as cegas. Releases mais antigos de fansub as vezes
// salvam a legenda como "ANSI" (Windows-1252) em vez de UTF-8 - ler sempre
// como UTF-8 corrompe silenciosamente acentos/caracteres especiais, o que
// atrapalha tanto o palpite de conteudo PT-BR quanto a tela de auto-sync.
// Nenhuma dependencia de I/O - recebe o buffer, so decide como decodificar.
export function decodeSubtitleBuffer(buffer: Buffer): string {
  // BOM explicito no arquivo - respeita o que foi declarado.
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf-8')
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le')
  }

  // Sem BOM: tenta UTF-8 estrito (a grande maioria dos releases atuais). Se
  // a sequencia de bytes nao for UTF-8 valido, cai para Windows-1252.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}
