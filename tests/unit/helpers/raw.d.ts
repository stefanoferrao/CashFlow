// Importação de texto de arquivos (?raw do Vite) usada por testes que conferem o código-fonte de UI sem montar o DOM.
declare module '*?raw' {
  const content: string;
  export default content;
}
