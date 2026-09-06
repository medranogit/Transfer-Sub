// Regras de dominio: decodificar um arquivo de legenda PGS (.sup, formato
// "S_HDMV/PGS" do Matroska - legenda de imagem comum em releases de
// Blu-ray) em uma lista de eventos com timestamp + a propria imagem da
// legenda (PNG, como data URL) - usado pela tela de auto-sync manual quando
// a faixa de referencia nao tem texto codificado pra comparar (ver
// subtitleTiming.ts, usado pro caso ASS/SSA/SRT). Nenhuma dependencia de
// I/O - so transforma o buffer ja extraido pelo mkvextract.
//
// Formato PGS (documentado publicamente, ex: especificacao "Blu-ray Disc
// Read-Only Format" / paginas da comunidade tipo "PGS subtitle format"):
// sequencia de segmentos, cada um com header de 13 bytes (magic "PG",
// PTS/DTS de 4 bytes cada, tipo, tamanho) seguido dos dados do segmento.
// So os 4 tipos usados aqui: PDS (paleta), ODS (bitmap RLE), PCS
// (composicao - quando/qual objeto mostrar) e END (fim do "display set").
import { deflateSync } from 'zlib'
import type { SubtitleEvent } from '@shared/types'

const SEG_PDS = 0x14
const SEG_ODS = 0x15
const SEG_PCS = 0x16
const SEG_END = 0x80

interface PaletteEntry {
  r: number
  g: number
  b: number
  a: number
}

interface PendingObject {
  width: number
  height: number
  chunks: Buffer[]
}

interface Composition {
  objectId: number
  startMs: number
  pixels: Uint8Array | null
  width: number
  height: number
}

// Maior canvas de composicao que o PGS suporta e 1920x1080 - um objeto
// isolado nunca excede isso. Serve so pra descartar um objeto obviamente
// corrompido (leitura desalinhada) antes de tentar alocar um bitmap gigante
// pra ele - sem isso, um unico frame malformado (ex: um display set com 2
// objetos de composicao simultaneos, onde so o primeiro era rastreado)
// travava ou derrubava a extracao do episodio inteiro.
const MAX_OBJECT_PIXELS = 1920 * 1080

interface DecodedImage {
  startMs: number
  width: number
  height: number
  pixels: Uint8Array
  palette: Map<number, PaletteEntry>
}

// Conversao YCbCr -> RGB (BT.601, faixa completa) - precisao broadcast exata
// nao importa aqui, e so pra gerar uma miniatura legivel; texto de legenda
// e proximo de branco/preto, onde qualquer formula razoavel bate certo.
function ycbcrToRgb(y: number, cr: number, cb: number): [number, number, number] {
  const r = y + 1.402 * (cr - 128)
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)
  const b = y + 1.772 * (cb - 128)
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  return [clamp(r), clamp(g), clamp(b)]
}

// RLE dos bitmaps PGS: cada byte != 0 e um pixel isolado (indice de cor =
// o proprio byte); byte 0x00 introduz uma run (0x00 0x00 = fim de linha,
// os outros 3 casos codificam comprimento/cor conforme os 2 bits mais altos
// do 2o byte - ver os 4 ramos abaixo).
function decodeRle(data: Buffer, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height)
  let p = 0
  let x = 0
  let y = 0
  while (p < data.length && y < height) {
    const b1 = data[p++]
    let color: number
    let length: number
    if (b1 !== 0) {
      color = b1
      length = 1
    } else {
      const b2 = data[p++]
      if (b2 === 0) {
        x = 0
        y++
        continue
      } else if ((b2 & 0xc0) === 0x00) {
        length = b2 & 0x3f
        color = 0
      } else if ((b2 & 0xc0) === 0x40) {
        const b3 = data[p++]
        length = ((b2 & 0x3f) << 8) | b3
        color = 0
      } else if ((b2 & 0xc0) === 0x80) {
        const b3 = data[p++]
        length = b2 & 0x3f
        color = b3
      } else {
        const b3 = data[p++]
        const b4 = data[p++]
        length = ((b2 & 0x3f) << 8) | b3
        color = b4
      }
    }
    for (let i = 0; i < length && x < width; i++, x++) {
      pixels[y * width + x] = color
    }
  }
  return pixels
}

function decodeImages(buffer: Buffer): DecodedImage[] {
  const images: DecodedImage[] = []
  let offset = 0
  // Um "display set" pode ter mais de um objeto de composicao ao mesmo tempo
  // (ex: legenda + um efeito separado) - cada um com seu proprio stream de
  // segmentos ODS (as vezes intercalados). Precisa rastrear por object_id,
  // nao um unico "objeto atual", senao o segundo objeto acaba lendo o
  // cabecalho (largura/altura) na posicao errada.
  const pendingObjects = new Map<number, PendingObject>()
  let currentPalette: Map<number, PaletteEntry> | null = null
  let currentComposition: Composition | null = null

  while (offset + 13 <= buffer.length) {
    if (buffer[offset] !== 0x50 || buffer[offset + 1] !== 0x47) break // magic "PG"

    const pts = buffer.readUInt32BE(offset + 2)
    const segType = buffer[offset + 10]
    const segSize = buffer.readUInt16BE(offset + 11)
    const dataStart = offset + 13
    const data = buffer.subarray(dataStart, dataStart + segSize)
    const startMs = Math.round(pts / 90) // PTS e um clock de 90kHz

    if (segType === SEG_PDS) {
      const palette = new Map<number, PaletteEntry>()
      let i = 2 // pula palette_id + palette_version
      while (i + 5 <= data.length) {
        const idx = data[i]
        const [r, g, b] = ycbcrToRgb(data[i + 1], data[i + 2], data[i + 3])
        palette.set(idx, { r, g, b, a: data[i + 4] })
        i += 5
      }
      currentPalette = palette
    } else if (segType === SEG_ODS && data.length >= 11) {
      const objectId = data.readUInt16BE(0)
      const seqFlag = data[3]
      const first = (seqFlag & 0x40) !== 0
      const last = (seqFlag & 0x80) !== 0
      if (first) {
        // Bytes 4-6: tamanho total do RLE (3 bytes, ignorado - so usamos os
        // proprios bytes recebidos). 7-8: largura, 9-10: altura.
        const width = data.readUInt16BE(7)
        const height = data.readUInt16BE(9)
        // Descarta objeto com dimensao maior que o canvas maximo do PGS -
        // sinal de leitura desalinhada (ver comentario de MAX_OBJECT_PIXELS),
        // nao um bitmap real.
        if (width * height <= MAX_OBJECT_PIXELS) {
          pendingObjects.set(objectId, { width, height, chunks: [Buffer.from(data.subarray(11))] })
        } else {
          pendingObjects.delete(objectId)
        }
      } else {
        // Continuacao de um objeto grande (varios segmentos ODS) - sem
        // repetir o cabecalho, so mais bytes de RLE. Se nao ha objeto
        // pendente com esse id (stream truncado/fora de ordem), ignora.
        pendingObjects.get(objectId)?.chunks.push(Buffer.from(data))
      }
      if (last) {
        const pending = pendingObjects.get(objectId)
        pendingObjects.delete(objectId)
        if (pending && currentComposition?.objectId === objectId) {
          try {
            currentComposition.pixels = decodeRle(Buffer.concat(pending.chunks), pending.width, pending.height)
            currentComposition.width = pending.width
            currentComposition.height = pending.height
          } catch {
            // Bitmap malformado - so pula esse frame, nao trava o resto.
          }
        }
      }
    } else if (segType === SEG_PCS) {
      // Byte 10: numero de composition objects. Quando 0, este "display set"
      // e so um "limpa a tela" (sem imagem nova) - ignorado.
      const numComposition = data[10]
      currentComposition =
        numComposition > 0
          ? { objectId: data.readUInt16BE(11), startMs, pixels: null, width: 0, height: 0 }
          : null
    } else if (segType === SEG_END) {
      if (currentComposition?.pixels && currentPalette) {
        images.push({
          startMs: currentComposition.startMs,
          width: currentComposition.width,
          height: currentComposition.height,
          pixels: currentComposition.pixels,
          palette: currentPalette
        })
      }
      currentComposition = null
    }

    offset = dataStart + segSize
  }

  return images
}

// --- Encoder PNG minimo (RGBA, sem filtro por linha, so o necessario pra
// gerar uma imagem que o <img> da UI consiga exibir) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function encodePng(image: DecodedImage): Buffer {
  const { width, height, pixels, palette } = image
  const raw = Buffer.alloc(height * (1 + width * 4))
  let pos = 0
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0 // filtro "None"
    for (let x = 0; x < width; x++) {
      const entry = palette.get(pixels[y * width + x]) ?? { r: 0, g: 0, b: 0, a: 0 }
      raw[pos++] = entry.r
      raw[pos++] = entry.g
      raw[pos++] = entry.b
      raw[pos++] = entry.a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// Decodifica um .sup (PGS) inteiro em eventos prontos pra tela de auto-sync -
// mesmo formato (SubtitleEvent) usado pelas legendas de texto, so que com
// imageDataUrl no lugar de text. Uma imagem individual que falhar ao
// codificar (bitmap malformado que passou pelas checagens acima) e so
// pulada - nao derruba a extracao do episodio inteiro.
export function parsePgsSubtitle(buffer: Buffer): SubtitleEvent[] {
  const events: SubtitleEvent[] = []
  for (const image of decodeImages(buffer).sort((a, b) => a.startMs - b.startMs)) {
    try {
      events.push({
        startMs: image.startMs,
        text: '',
        imageDataUrl: `data:image/png;base64,${encodePng(image).toString('base64')}`
      })
    } catch {
      // pula essa imagem
    }
  }
  return events
}
