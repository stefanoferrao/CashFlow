/**
 * Notas desta versão, embutidas no app. São exibidas em "Notas de Atualização" quando o GitHub não
 * responde (sem internet) ou enquanto a release ainda não foi publicada. O mesmo texto é usado na
 * release do GitHub (docs/RELEASE-1.2.0.md).
 */
export const BUNDLED_RELEASE_NOTES = `Faturas de todos os cartões somadas, rendimento real dos investimentos, conexão pelo Pluggy Connect sem erro e sem conexões repetidas, e um dashboard muito mais fácil de personalizar.

## Novidades

### Fatura atual de todos os cartões
- O card **Fatura atual** do dashboard agora mostra o **total somado** das faturas abertas de todos os cartões, em destaque.
- Uma **barra dividida por cartão** e a lista logo abaixo mostram quanto cada cartão representa: valor, participação no total, vencimento ("vence 05/10 · em 11 dias") e final do cartão.
- Toque em um cartão para abrir a fatura dele. Também aparece a **previsão no ritmo atual** somando todos os cartões.
- Faturas já fechadas e ainda não pagas (quando a instituição informa) aparecem à parte, sem somar duas vezes.

### "Próxima fatura" em Cartões e em Faturas
- **Cartões:** novo campo **Próxima fatura (soma)** no topo e o bloco **Próxima fatura por cartão**.
- **Faturas:** novo bloco **Próxima fatura · todos os cartões**, que também serve para escolher o cartão do detalhe, e o resumo das **faturas seguintes** (parcelas já conhecidas) somando todos os cartões.

### Rendimento dos investimentos
- O rendimento deixou de aparecer zerado. Agora ele é **calculado**: valor atual + o que já voltou para você (resgates, juros, amortizações) − o total aplicado.
- O valor aplicado vem, nesta ordem: das **movimentações do próprio produto** (aplicações e resgates, com o histórico conferido pela quantidade de cotas ou pela data da aplicação), do **valor aplicado informado pela instituição** ou do **lucro informado**.
- Produtos sem base confiável ficam **fora da conta** e aparecem listados com o motivo. Eles nunca contam como "rendimento zero".
- Novos indicadores: **Rendimento acumulado** (R$ e %), **Aplicado × valor atual**, **rendimento líquido estimado** (após IR/IOF informados pela instituição) e **cobertura do cálculo**.
- A tabela de produtos mostra, para cada um, o aplicado, o valor atual, o rendimento e de onde veio o cálculo.

### Fluxo de Caixa por período
- Os botões "Dia / Semana / Mês / Ano" (que só mudavam o agrupamento) viraram **Mês · Trimestre · Ano · Todo o período**.
- Setas **‹ ›** para navegar entre meses, trimestres e anos, e **Voltar ao atual**.
- O agrupamento do gráfico se ajusta ao período (por dia no mês, por semana no trimestre, por mês no ano). No mês, a linha mostra o **resultado acumulado**.

### Patrimônio ao longo do tempo (Análises)
- O **saldo em contas** agora é **reconstruído pelas transações** (saldo atual − movimentações posteriores), exato a partir da primeira transação disponível de cada instituição.
- O **patrimônio líquido completo** aparece nos dias registrados pelo app. Investimentos e dívidas não são estimados para o passado: a Pluggy informa só o valor atual deles, e estimar mostraria um histórico que não aconteceu.
- Novos indicadores: variação registrada do patrimônio e variação do saldo em contas.

### Dashboard: personalizar ficou claro
- Em **Personalizar**, cada card ganha uma **barra verde no topo** para arrastar e mover (com o aviso "Arraste por esta barra para mover").
- **Largura e altura com botões − / +** no rodapé de cada card (1/4, 1/3, 1/2, 2/3 ou largura inteira), além da **alça de redimensionar** sempre visível no canto.
- **Ocultar** e **fixar** direto no card, instruções passo a passo no painel e tamanho de cada card na lista.
- No celular e no tablet, setas ↑ ↓ em cada card para reordenar.

### Notas de Atualização
- Nova tela **Notas de Atualização** (menu lateral "Novidades", menu do usuário e Configurações → Sobre), com o histórico de versões lido das Releases do GitHub.
- Depois de uma atualização, o app avisa uma vez: "CashFlow atualizado para a versão 1.2.0 — Ver novidades".

## Correções

### Conexão pelo Pluggy Connect
- **Erro "Um erro inesperado ocorreu. Por favor, tente novamente mais tarde."**: acontecia quando a conta **já estava conectada** na sua aplicação Pluggy. A Pluggy recusa a conexão repetida e devolve o ID da conexão existente. Agora o CashFlow **reaproveita automaticamente essa conexão**, sem precisar do "Tenho um Item ID".
- **Conexões repetidas**: cada conexão enviava um identificador de usuário diferente. Agora o app envia um **identificador fixo** (derivado do Client ID, sem expô-lo), e a Pluggy reconhece conexões repetidas.
- Conexões repetidas que já existiam são **detectadas** (mesmo conector e mesmas contas/cartões), **ficam fora dos totais** para não somar o mesmo dinheiro duas vezes e podem ser removidas em **Contas → Remover repetidas**.
- Autorização no banco pelo celular: o app informa à Pluggy o endereço de retorno (https) exigido pelo Open Finance e pelo Meu Pluggy.
- Conexões do Meu Pluggy não oferecem mais "Reconectar" (que não é permitido para elas): o menu leva ao Meu Pluggy.
- A tela **Adicionar instituição** ficou mais simples: o Pluggy Connect é o caminho principal e o Item ID virou uma opção avançada.

### Dicas (ícone "?") e botões
- As dicas dos cards eram **cortadas** pelas bordas do card, pelo topo da tela ou pela faixa do modo demonstração, e o mesmo acontecia no botão **ocultar/mostrar valores**. Agora a dica flutua sobre a página, escolhe o lado com espaço e nunca é cortada. No celular, toque no "?" para abrir.

### Investimentos
- As taxas de rentabilidade informadas pela Pluggy (mês e 12 meses) vêm em percentual e eram exibidas 100 vezes maiores. Corrigido.

## Privacidade e segurança
- A tela Notas de Atualização consulta **somente** as Releases públicas do GitHub, **apenas quando é aberta**, sem cookies e sem referrer. Nenhum dado seu é enviado. A CSP libera apenas \`api.github.com\` para isso.
- O identificador enviado à Pluggy (\`clientUserId\`) é um resumo SHA-256 do Client ID: não permite recuperá-lo.
- A página passou a enviar no máximo a **origem** do site (nunca a rota) ao widget da Pluggy, necessário para concluir autorizações do Open Finance. Chamadas à API e imagens continuam sem referrer.

## Como atualizar
1. Publique a nova versão (o GitHub Pages faz o build automaticamente).
2. Abra o CashFlow e toque em **Atualizar agora** no aviso de nova versão (ou recarregue a página).
3. Em **Contas**, se aparecer "conexão repetida", use **Remover repetidas**.
4. Clique em **Atualizar agora** no topo para baixar as movimentações dos investimentos e calcular o rendimento.`;
