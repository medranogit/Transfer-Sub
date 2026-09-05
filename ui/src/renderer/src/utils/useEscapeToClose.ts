import { useEffect } from 'react'

// Fecha modais/overlays com Esc - convencao padrao de teclado, facilita
// navegar entre varios episodios sem precisar clicar no botao "Fechar".
export function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}
