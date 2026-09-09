# Regras do projeto

- Nao adicionar comentarios no codigo (nem inline, nem blocos, nem docstrings). Nomes de variavel/funcao devem ser autoexplicativos. Codigo ja foi limpo de comentarios propositalmente - nao reintroduzir.
- Nunca fazer commit ou push sem autorizacao explicita do usuario para aquele commit especifico.
- Nunca gerar/buildar o instalador (.exe) sem perguntar antes se o usuario quer.
- Seguir a arquitetura em camadas ja existente: `main/domain` (logica pura), `main/infra` (I/O), `main/workflow.ts`/`renamer.ts` (casos de uso), `main/index.ts` (Electron/IPC), `renderer/src/components` e `renderer/src/ui` (componentes reutilizaveis). Preferir @ant-design/icons a alternativas ad-hoc.
