/**
 * Notas desta versão, embutidas no app. São exibidas em "Notas de Atualização" quando o GitHub não
 * responde (sem internet) ou enquanto a release ainda não foi publicada. O mesmo texto é usado na
 * release do GitHub (docs/RELEASE-1.4.1.md).
 */
export const BUNDLED_RELEASE_NOTES = `Lançada em **01/11/2026**. Visual novo, mais calmo e com cara de banco privado. Nenhuma conta, regra ou tela mudou de lugar: só a aparência.

## Novidades

### Visual novo
- **Fundo levemente lavanda e cartões brancos sem contorno:** os cartões se destacam pela cor, sem bordas nem sombras. A tela fica mais limpa e os valores ganham destaque.
- **Barra lateral escura** nos dois temas, como uma moldura. Os itens ficam em pílulas e o item da tela atual tem um destaque azul-claro.
- **Um único destaque índigo** para botões principais, links, foco do teclado e itens selecionados. Entradas continuam em **verde** e saídas em **vermelho**. As cores dos gráficos não mudaram: elas foram escolhidas para continuar legíveis para quem tem daltonismo.
- **Fonte Inter** em pesos mais leves. A hierarquia vem do tamanho e da cor, e os números mantêm a largura fixa para alinhar nas colunas.
- **Tema escuro "night"**, em tons de azul-violeta escuro.
- Botões secundários em pílula translúcida, que funcionam tanto sobre o fundo quanto sobre os cartões.

## Correções
- Valores grandes nos cards do dashboard se ajustam à largura do card e não passam mais da borda em telas médias (notebooks e tablets).
- Nomes longos na lista de investimentos (como "Previdência") quebram a linha em vez de passar por baixo do valor.
- Nesta versão não há mudança em cálculos, sincronização ou dados: só na aparência.

## Privacidade e segurança
- **O modelo de segurança não mudou.** A fonte nova vem junto com o app, sem chamada de rede nova.
- Todos os textos foram conferidos para contraste mínimo de leitura (WCAG AA) nos temas claro e escuro.

## Como atualizar
1. Publique a nova versão (o GitHub Pages faz o build automaticamente).
2. Abra o CashFlow e recarregue a página (ou toque em **Atualizar agora** no aviso de nova versão).
3. Seus dados, credenciais e personalizações **continuam os mesmos**: não há migração nem nova conexão.`;
