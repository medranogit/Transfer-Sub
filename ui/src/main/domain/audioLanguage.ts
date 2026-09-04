// Regras de dominio: reconhecer faixas de audio em ingles, para permitir
// remover dublagem e manter so o audio original (normalmente japones).
const ENGLISH_LANG_CODES = new Set(['eng', 'en', 'enus', 'engb'])

export function isEnglishAudio(language: string): boolean {
  const normalized = language.toLowerCase().replace(/[^a-z]/g, '')
  return ENGLISH_LANG_CODES.has(normalized)
}
