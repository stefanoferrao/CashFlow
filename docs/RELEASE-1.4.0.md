# Notas de Atualização — v1.4.0

Lançada em **01/11/2026**. Recategorizar agora pergunta se vale só para aquela transação ou para todas do mesmo estabelecimento. Esta versão também traz uma revisão das contas de faturas e parcelas, da sincronização e da segurança do cofre local.

## Novidades

### Recategorizar por estabelecimento
- Ao trocar a categoria de uma transação (por exemplo, um corte de cabelo que veio sem categoria), o app pergunta se a mudança vale **só para esta transação** ou para **todas do mesmo estabelecimento**, inclusive as próximas. A pergunta mostra quantas transações desse estabelecimento já existem.
- O estabelecimento é o nome informado pela Pluggy. Quando ele não vem, o app usa a descrição sem números e termos genéricos: "BARBEARIA DO ZE 0312" e "BARBEARIA DO ZE 0410" contam como o mesmo lugar.
- Recategorizar de novo o mesmo estabelecimento **substitui** a regra anterior. A regra mais recente vence as mais antigas. Se você já tinha regras que se sobrepõem (por exemplo, "barbearia" e "barbearia do zé"), agora vale a criada por último.
- Transações que você já ajustou uma a uma continuam como estão.
- Numa transação categorizada por regra, o botão **Remover regra** desfaz o "Todas".
- As regras de estabelecimento vão junto ao **exportar e importar personalizações**.

## Correções

### Faturas e parcelas
- Cartão que fecha no dia **29, 30 ou 31**: uma compra feita no último dia do mês não entra mais em duas faturas.
- Quando os dados do cartão estão alguns meses atrasados, as datas de fechamento e vencimento previstas não "encolhem" mais para o dia 28 ou 30.
- Parcelas da mesma compra com centavos diferentes (por exemplo, R$ 10,50 e R$ 10,49) não são mais tratadas como duas compras. Antes, as parcelas previstas apareciam duplicadas.
- Compras em outra moeda não são mais somadas ao valor da fatura em reais.
- O saldo previsto não desconta mais a fatura duas vezes quando o pagamento dela já está agendado no banco.
- Um lançamento previsto para **hoje** passa a contar nas receitas e despesas previstas do mês.
- "Despesas do mês" no dashboard compara com o mesmo período do mês anterior usando o mesmo critério (incluindo lançamentos pendentes nos dois lados).

### Sincronização ("Atualizar agora")
- Adicionar uma instituição durante uma sincronização não deixa mais essa instituição sem dados. Tocar em "Atualizar agora" enquanto uma única instituição sincroniza também atualiza as outras. Esses pedidos agora rodam logo em seguida.
- Uma instituição removida durante a sincronização não reaparece.
- Um erro no armazenamento do navegador durante a sincronização não deixa mais a tela de carregamento presa: o app mostra o erro.
- Com muitas contas na mesma instituição, as chamadas que aguardam na fila não estouram mais o tempo limite antes de serem enviadas.
- Regras antigas de "aplicar a futuras transações com descrição semelhante" que não pegavam nem a própria transação voltam a funcionar.
- O nome do banco é reconhecido com mais precisão: "iti Itaú" é iti e "Credicard Itaú" é Credicard.

### Importar personalizações
- Um arquivo com uma categoria inválida não quebra mais a importação nem a tela da transação.
- Um arquivo de uma versão antiga não apaga mais a organização atual do dashboard. A organização antiga fica de fora da importação, porque a grade mudou.

## Privacidade e segurança
- **Bloquear durante a sincronização:** depois do bloqueio, nenhum dado novo é baixado, gravado ou mostrado. Antes, uma sincronização em andamento podia terminar e colocar dados na tela bloqueada.
- **Bloquear durante a troca de senha local:** a chave não volta mais para a memória com o app bloqueado. A senha nova continua valendo.
- **Modo "Usar somente nesta sessão":** credenciais recusadas pela Pluggy não apagam mais as credenciais cifradas de um cofre salvo neste navegador. As credenciais anteriores da sessão voltam.
- **Apagar todos os dados locais** agora também bloqueia as outras abas abertas.
- Logos vindos de um arquivo de personalização importado só são aceitos da Pluggy (`*.pluggy.ai`), da biblioteca local ou de imagem enviada. Assim, um arquivo compartilhado não faz o app carregar imagens de servidores de terceiros.
- **O modelo de segurança não mudou.** Nenhuma chamada de rede nova.

## Como atualizar
1. Publique a nova versão (o GitHub Pages faz o build automaticamente).
2. Abra o CashFlow e recarregue a página (ou toque em **Atualizar agora** no aviso de nova versão).
3. Seus dados, credenciais e regras de categorização **continuam os mesmos**: não há migração nem nova conexão. Digite a senha local quando o app pedir.
4. Para recategorizar por estabelecimento, abra **Transações**, toque numa transação, escolha a categoria e toque em **Salvar**.
