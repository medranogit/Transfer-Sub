// Alternancia "Episodio" / "Filme" reaproveitada no Transferir Legenda e no
// Renomeador: os dois tem a mesma ideia (filme nao tem numero de episodio
// pra detectar/parear automaticamente, entao o fluxo muda quando ativado).
// Sempre nessa ordem (Episodio primeiro) e sempre comecando em Episodio -
// quem usa este componente decide isso no estado inicial, nao aqui.
import styled from 'styled-components'

const Wrap = styled.div`
  display: inline-flex;
  border-radius: ${(p) => p.theme.radius.sm};
  border: 1px solid ${(p) => p.theme.colors.border};
  overflow: hidden;
  flex-shrink: 0;
`

const Option = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  border: none;
  background: ${(p) => (p.$active ? p.theme.colors.accent : p.theme.colors.panelAlt)};
  color: ${(p) => (p.$active ? '#10121a' : p.theme.colors.textMuted)};
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }
`

export function EpisodeMovieToggle({
  movieMode,
  onChange
}: {
  movieMode: boolean
  onChange: (movieMode: boolean) => void
}) {
  return (
    <Wrap>
      <Option type="button" $active={!movieMode} onClick={() => onChange(false)}>
        Episodio
      </Option>
      <Option type="button" $active={movieMode} onClick={() => onChange(true)}>
        Filme
      </Option>
    </Wrap>
  )
}
