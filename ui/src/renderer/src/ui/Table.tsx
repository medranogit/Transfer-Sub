// Primitivas genericas de tabela (sem regra de negocio) - extraidas pra
// reaproveitar entre paginas com listagem tabular simples (Historico,
// Renomeador). EpisodeTable tem sua propria variante (linhas clicaveis,
// colunas com controles) e continua a parte.
import styled from 'styled-components'

export const TableWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radius.md};
`

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
`

export const Thead = styled.thead`
  position: sticky;
  top: 0;
  background: ${(p) => p.theme.colors.panelAlt};

  th {
    text-align: left;
    padding: 8px 10px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${(p) => p.theme.colors.textMuted};
    border-bottom: 1px solid ${(p) => p.theme.colors.border};
    white-space: nowrap;
  }
`

export const Tr = styled.tr`
  &:hover td {
    background: ${(p) => p.theme.colors.panelAlt};
  }
`

export const Td = styled.td`
  padding: 7px 10px;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  vertical-align: top;
`

export const Mono = styled.span`
  font-family: ${(p) => p.theme.font.mono};
  font-size: 11.5px;
  color: ${(p) => p.theme.colors.textMuted};
`

export const EmptyState = styled.div`
  padding: 40px;
  text-align: center;
  color: ${(p) => p.theme.colors.textMuted};
`
