# Notas de Atualização — v1.3.0

Lançada em **28/09/2026**. Limite do cartão corrigido nos dados do Meu Pluggy / Open Finance, tela de carregamento ao atualizar, busca automática do Item ID, cópia das suas personalizações entre celular e computador e uma barra superior com cara de aplicativo.

## Novidades

### Limite do cartão correto (Nubank e demais via Meu Pluggy / Open Finance)
- O **limite utilizado** agora segue a documentação da Pluggy: nos dados do **Open Finance** (o Meu Pluggy é um deles) o **saldo do cartão é o limite utilizado**. Antes o app confiava só em "limite total − disponível" e, quando o *disponível* informado pela Pluggy não batia com o saldo, mostrava um uso muito maior que o real (ex.: **R$ 4.424,03 · 48,4%** num cartão com saldo de **R$ 418,73**).
- Quando a instituição detalha as **linhas de limite** (`disaggregatedCreditLimits`), vale a **linha de limite total** informada por ela.
- No cartão, o app diz **de onde veio** o limite utilizado e, se a Pluggy informou algo diferente, mostra os dois valores num aviso — nada some em silêncio.
- Cartões que **dividem o mesmo limite** (linha consolidada) entram **uma vez só** nos totais de limite, no patrimônio e nos insights. Cada cartão continua aparecendo com o seu limite.
- Os dados guardados antes desta versão são **baixados de novo automaticamente** na próxima abertura, sem precisar lembrar de atualizar.

### Tela de carregamento ao atualizar
- **"Atualizar agora"** (botão do computador e ícone do celular) e a atualização que roda **ao entrar no app** agora cobrem a tela inteira com uma tela de carregamento no mesmo visual do app, mostrando a etapa atual ("Banco X: contas e cartões").
- Não pisca em atualizações rápidas. Se a Pluggy demorar, **"Continuar em segundo plano"** (ou a tecla Esc) fecha a tela e a atualização segue, com o andamento no topo.

### Tela de abertura do app
- O CashFlow abre com uma tela cheia (logo, nome e barra de progresso), que aparece antes de qualquer coisa carregar, segue o tema claro/escuro e sai sozinha quando o app está pronto.

### Item ID encontrado sozinho
- Depois de conectar a conta Pluggy, o app procura os **Items que já existem** na sua aplicação (Dashboard da Pluggy / Meu Pluggy) e adiciona os que ainda não estão aqui — sem copiar o Item ID. Ignora os conectores de teste e adiciona no máximo 20 de uma vez.
- Esse recurso é **opcional na Pluggy** (`GET /v2/items` vem desabilitado até o suporte habilitar). Se não estiver ligado, o app avisa sem erro e o **"Tenho um Item ID"** continua funcionando como antes.

### Copie suas personalizações para outro aparelho
- Em **Configurações → Segurança**: **Exportar arquivo**, **Copiar**, **Importar arquivo** e **Colar** (celular e computador). No celular, exportar abre a folha de compartilhar.
- Levam: **nomes** de contas e cartões, **nome, cor e logo** das instituições, **ícones** dos cartões, **dias de fechamento e vencimento**, **organização do dashboard** (computador e celular), categorização, lançamentos previstos, tema e preferências de exibição.
- **Nunca** entram credenciais, senha local, tokens, lista de conexões, bloqueio automático, modo de conexão nem dados baixados da Pluggy — nem mesmo num arquivo editado à mão: esses campos são descartados e o app avisa.
- Ao importar, o app mostra **o que vai mudar** e pede confirmação. O que já existe no aparelho é mantido; em conflito, vale o do arquivo.

### Barra superior com cara de aplicativo
- Fundo sólido (igual ao da barra de status), **fixa no topo** ao rolar, com um filete só quando há conteúdo passando por baixo.
- No celular: sem o logo repetido, título maior, situação da atualização sem corte, ícones uniformes com área de toque de 44 px e o tema em **Aparência e tema**, no menu do usuário. No computador: "Atualizar agora" tonal e ícones sem contorno.
- O menu do usuário ficou mais largo, com cada item em uma linha.

## Correções

### Limite utilizado do cartão
- O limite utilizado aparecia **muito acima do real** em cartões do Meu Pluggy/Open Finance (ver acima), e isso também inflava os **compromissos em cartões** do patrimônio. Corrigido.

### Configurações no celular
- A linha **Instituições (Items)** estourava o card, esticava a página e **cortava o menu inferior** (só "Início, Contas, Cartões"). Agora cada instituição cabe na tela, e uma proteção geral impede que um elemento largo demais volte a esticar a janela.

### Controles de Configurações que não funcionavam
- **Ocultar valores**, **bloqueio automático**, **validade do cache**, **modo de depuração**, **conectores de teste**, os **dias de fechamento e vencimento** dos cartões e o **Restaurar configuração** não faziam nada em Configurações. Corrigido.

### Barra superior
- A barra superior **não ficava fixa** ao rolar (estava presa a um contêiner de 60 px). Corrigido.

## Privacidade e segurança
- A exportação e a importação usam uma **lista fechada de campos** e validam tudo o que entra (cores, endereços de logo, datas de 1 a 31, categorias, tamanhos e nomes de chave). Os identificadores de conexão, conta e cartão aparecem só como chave de cada personalização, para saber a quem ela pertence; não são credenciais.
- A busca automática do Item ID usa a mesma chamada direta ao navegador de sempre: nada passa por servidores do CashFlow.

## Como atualizar
1. Publique a nova versão (o GitHub Pages faz o build automaticamente).
2. Abra o CashFlow e recarregue a página (ou toque em **Atualizar agora** no aviso de nova versão).
3. Ao abrir, o app baixa os dados de novo para recalcular o **limite dos cartões**: aguarde a tela de carregamento terminar.
4. Para levar suas personalizações do computador ao celular (ou o contrário), use **Configurações → Segurança → Exportar / Importar**.
