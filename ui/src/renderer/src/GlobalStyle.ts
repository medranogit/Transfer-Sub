import { createGlobalStyle } from 'styled-components'

export const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  html, body, #root {
    height: 100%;
    margin: 0;
  }

  body {
    background: ${(p) => p.theme.colors.bg};
    color: ${(p) => p.theme.colors.text};
    font-family: ${(p) => p.theme.font.body};
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }

  input, select, button, textarea {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
  }

  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  ::-webkit-scrollbar-thumb {
    background: ${(p) => p.theme.colors.borderLight};
    border-radius: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
`
