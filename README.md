# CashFlow

Plataforma pessoal de gestão financeira construída sobre a API da **Pluggy** (Open Finance), **100% frontend**:
o navegador fala direto com `https://api.pluggy.ai`. Não existe backend próprio, API intermediária nem servidor
que receba ou armazene credenciais.

> As credenciais são configuradas e armazenadas localmente neste navegador. A plataforma não possui acesso ao seu Client Secret.

- Auditoria da documentação da Pluggy (feita antes da implementação): [`docs/AUDITORIA-PLUGGY.md`](docs/AUDITORIA-PLUGGY.md)
- Modelo de segurança, riscos e como apagar tudo: [`SECURITY.md`](SECURITY.md)

---

## Sumário

1. [Início rápido](#início-rápido)
2. [Configurando a Pluggy](#configurando-a-pluggy)
3. [Arquitetura](#arquitetura)
4. [Fluxo de autenticação](#fluxo-de-autenticação)
5. [Segurança (resumo)](#segurança-resumo)
6. [Armazenamento local](#armazenamento-local)
7. [CORS](#cors)
8. [Modelo de dados normalizado](#modelo-de-dados-normalizado)
9. [Cálculos financeiros](#cálculos-financeiros)
10. [Funcionalidades](#funcionalidades)
11. [Aplicativo (PWA)](#aplicativo-pwa)
12. [Limitações](#limitações)
13. [Estrutura de pastas](#estrutura-de-pastas)
14. [Bibliotecas](#bibliotecas)
15. [Testes](#testes)
16. [Publicação (build estático)](#publicação-build-estático)

---

## Início rápido

Requisitos: **Node.js 20.19+** (ou 22.12+) e npm.

```bash
npm install
npm run dev          # http://localhost:5173
```

Na primeira tela, escolha **"Começar no modo demonstração"** para explorar com dados fictícios
(nada é salvo, e a faixa **MODO DEMONSTRAÇÃO** fica visível o tempo todo) ou **"Começar"** para configurar a Pluggy.

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Typecheck + build de produção em `dist/` (com CSP injetada) |
| `npm run preview` | Serve o `dist/` em `http://localhost:4173` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:e2e` | Testes ponta a ponta (Playwright; requer `npm run build` antes) |
| `npm run test:all` | Typecheck → unitários → build → E2E |

Para os testes E2E, instale o navegador do Playwright uma vez: `npx playwright install chromium`.

---

## Configurando a Pluggy

### 1. Obter Client ID e Client Secret

1. Crie uma conta em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) e crie uma aplicação.
2. Copie o **Client ID** (formato UUID) e o **Client Secret**.

### 2. Conectar suas instituições

Existem dois caminhos, e o app suporta ambos:

**a) Pluggy Connect (widget oficial)** — em *Contas → Adicionar instituição → Abrir Pluggy Connect*.
O app cria um `connect_token` e abre o widget oficial (`cdn.pluggy.ai/pluggy-connect/v2.8.2`), carregado só nesse momento.
Ao concluir, o Item é salvo localmente e sincronizado.

**b) Meu Pluggy (uso pessoal gratuito)** — recomendado para pessoa física:

1. Conecte seus bancos em [meu.pluggy.ai](https://meu.pluggy.ai) (até 5 conexões, mesmo titular, uso não comercial).
2. No Dashboard da Pluggy, vincule cada banco do Meu Pluggy à sua aplicação pelo conector **MeuPluggy** e copie o **Item ID**.
3. No CashFlow: *Contas → Adicionar instituição → Tenho um Item ID*, cole o ID e clique em **Adicionar Item**.

Se a sua aplicação tiver `GET /v2/items` habilitado (recurso opt-in da Pluggy), a opção **"Buscar automaticamente os Items da minha aplicação"**
lista todos; se não tiver, o app explica e mantém o caminho manual.

As conexões do Meu Pluggy chegam com o conector **"MeuPluggy"**, sem o nome do banco. O app identifica o banco pelos próprios dados
(por exemplo, a conta "Nu Pagamentos S.A." indica Nubank) e usa o logo e a cor do catálogo oficial da Pluggy. Quando não dá para
identificar, a conexão aparece como **"Banco não identificado"**: use **Contas → Personalizar** para dar nome, logo/ícone e cor
(veja [Identidade das instituições](#identidade-das-instituições)).

### 3. No CashFlow

*Configurações → Pluggy* (ou o onboarding) → informe Client ID, Client Secret e escolha como guardá-los:

- **Salvar cifrado neste navegador** (recomendado): tudo é cifrado no IndexedDB com uma chave derivada da sua senha local.
- **Usar somente nesta sessão**: nada é gravado; tudo some ao fechar ou recarregar a aba.

O app valida o formato, **testa a autenticação na Pluggy** e só então salva. Depois de salvo, o Secret **nunca mais é exibido**.

---

## Arquitetura

```
┌──────────────────────── Navegador do usuário ────────────────────────┐
│                                                                       │
│  Páginas (src/pages)  ──►  store/actions (src/state)                  │
│        ▲                     │         │          │                   │
│        │               vault (cofre)  repository  PluggyClient ───────┼──► https://api.pluggy.ai
│        │               AES-GCM/PBKDF2  IndexedDB   (fetch, retry,     │    (POST /auth, GET /accounts,
│        │                     │       (cifrado)      fila, dedupe)     │     /v2/transactions, /bills,
│        │                     ▼                        │               │     /investments, /categories,
│  analytics (memo) ◄── FinancialDataService ◄──────────┘               │     /items, /connect_token)
│  FinancialCalculator     (normalização central)                       │
│                                                                       │
│  Pluggy Connect (script oficial, carregado sob demanda) ──────────────┼──► connect.pluggy.ai
└───────────────────────────────────────────────────────────────────────┘
```

**Por que TypeScript puro + Vite (sem framework de UI)?** O Client Secret decifrado passa pela memória da página,
então **cada linha de código de terceiros é superfície de ataque**. Sem React/Vue, as dependências de runtime ficam em
duas bibliotecas (Chart.js e GridStack) e uma fonte. A UI usa um template ``html`…` `` próprio que **escapa tudo por padrão**
(descrições de transações vêm dos bancos e são texto não confiável). O Vite só existe em tempo de build.

Camadas:

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Cliente Pluggy | `src/pluggy/client.ts` | `/auth`, `apiKey` em memória com renovação, timeout, fila (máx. 3 simultâneas), deduplicação de GETs, retry em 429/5xx, paginação por página e por cursor |
| Erros | `src/pluggy/errors.ts` | Classifica HTTP/rede em mensagens amigáveis; nunca mostra stack trace |
| Sincronização | `src/pluggy/sync.ts` | Busca o pacote de um Item (Item, contas, transações, faturas, investimentos); falhas parciais viram avisos |
| Normalização | `src/services/financialDataService.ts` | Converte payloads da Pluggy em modelos próprios; **único** lugar que interpreta sinais, tipos e categorias |
| Identidade | `src/services/institutions.ts`, `bankIcons.ts` | Nome, logo e cor de cada conexão e de cada conta/cartão; detecção do banco nas conexões do Meu Pluggy; biblioteca local de 228 logos; apelidos e ciclos manuais de cartão. Só apresentação: não altera nenhum valor |
| PWA | `src/pwa.ts`, `scripts/pwa.mjs`, `scripts/sw.template.js` | Instalação, service worker (só arquivos do app), aviso de nova versão |
| Cálculos | `src/services/financialCalculator.ts` | Todas as regras financeiras (funções puras); nenhuma página calcula nada por conta própria |
| Analytics | `src/services/analytics.ts` | Resultado memoizado dos cálculos para a UI |
| Cofre | `src/security/vault.ts`, `crypto.ts` | Chaves, cifragem e acesso às credenciais |
| Persistência | `src/storage/*` | IndexedDB (cifrado) e preferências visuais |
| Estado | `src/state/store.ts`, `actions.ts` | Estado central (pub/sub) e orquestração |

---

## Fluxo de autenticação

1. O usuário informa Client ID/Secret → validação de formato (UUID; Secret ≥ 16 caracteres, sem espaços).
2. `POST /auth` com `{ clientId, clientSecret, nonExpiring: false }` → `{ apiKey }` (JWT válido por **2 horas**).
3. O `apiKey` fica **só em memória** e é enviado no header `X-API-KEY`. É renovado 5 minutos antes do `exp`.
4. Se a Pluggy responder `403 API_KEY_MISSING_OR_INVALID` (verificado: é 403, não 401), o cliente renova o `apiKey` **uma vez** e repete a chamada.
5. Para abrir o widget: `POST /connect_token` → `accessToken` (30 min) → `new PluggyConnect({ connectToken, ... }).init()`.
6. O Secret só existe decifrado dentro de `useCredentials()`, durante a chamada a `/auth`.

---

## Segurança (resumo)

Detalhes completos em [`SECURITY.md`](SECURITY.md).

- Client Secret **cifrado em repouso** (AES-GCM-256) com chave derivada da senha local (PBKDF2-SHA256, 600.000 iterações).
- Cache financeiro também cifrado com a mesma chave de dados.
- **Nunca** em `localStorage`, cookies, URL, código-fonte, logs, DOM ou telemetria. Não há analytics nem telemetria.
- Bloqueio automático por inatividade (padrão 15 min) descarta chaves e `apiKey` da memória.
- CSP restritiva no build de produção; requisições com `credentials: 'omit'` e `referrerPolicy: 'no-referrer'`.
- *Configurações → Segurança → Apagar todos os dados locais* remove tudo (IndexedDB, tema, sessão).

---

## Armazenamento local

Banco IndexedDB `cashflow` (versão 1):

| Store | Conteúdo | Cifrado? |
|---|---|---|
| `pluggy_credentials` | Metadados do cofre (salt, DEK embrulhada) e credenciais | Credenciais: **sim** (AES-GCM). Metadados: não são segredo |
| `pluggy_items` | Itens conectados + data de sincronização e validade | **Sim** |
| `accounts` | Contas bancárias normalizadas | **Sim** |
| `transactions` | Transações normalizadas | **Sim** |
| `credit_cards` | Cartões normalizados | **Sim** |
| `bills` | Faturas fechadas | **Sim** |
| `investments` | Investimentos | **Sim** |
| `categories` | Árvore de categorias da Pluggy, suas regras/ajustes, lançamentos previstos, personalizações (nomes, cores, logos escolhidos ou enviados, apelidos, dias de fechamento/vencimento) e o catálogo de conectores da Pluggy (7 dias) | **Sim** |
| `snapshots` | Registros diários de patrimônio (histórico local) | **Sim** |
| `dashboard_layout` | Posição/tamanho/visibilidade dos cards | Não (só layout) |
| `user_preferences` | Preferências de exibição, cache, bloqueio | Não (sem dados sensíveis) |

Fora do IndexedDB, só o tema fica em `localStorage` (`cashflow.theme`), para ser aplicado antes da primeira pintura e evitar flash.
O service worker do PWA mantém no Cache Storage **apenas arquivos do app** (HTML, JS, CSS, fontes, ícones) e logos de instituições —
nenhuma resposta da API, credencial ou dado financeiro (ver [Aplicativo (PWA)](#aplicativo-pwa)).

Cada registro cifrado usa o identificador `store:id` como *additional authenticated data* (AAD): um registro copiado
para outro lugar falha na autenticação.

**Validade do cache:** padrão de 6 horas (configurável). Ao desbloquear com o cache válido, nenhuma chamada à Pluggy é feita;
com o cache vencido, o app sincroniza. **"Atualizar agora"** força a sincronização a qualquer momento.
As categorias da Pluggy ficam em cache por 7 dias.

---

## CORS

A documentação da Pluggy **não** fala sobre CORS. Por isso, isso foi **verificado empiricamente em 23/09/2026** num navegador
real a partir de uma origem arbitrária: `POST /auth` e `GET` com `X-API-KEY` passam pelo preflight e retornam respostas legíveis.
Os headers `RateLimit-*`/`Retry-After` **não** são expostos ao JavaScript; em `429` o app aguarda 60 s (valor documentado).

Como isso pode mudar sem aviso, o cliente distingue em tempo de execução **bloqueio de CORS** de **falta de internet**
(sonda `no-cors`) e mostra a mensagem certa. Se a Pluggy passar a bloquear chamadas do navegador, existe o **proxy local**:

- *Configurações → Pluggy → Modo de conexão → Proxy local*.
- As chamadas vão para `/pluggy-api/*`, que o **servidor do Vite na sua própria máquina** (`npm run dev` ou `npm run preview`) repassa para `api.pluggy.ai`.
- Ele não registra corpo nem cabeçalhos e não armazena nada. Não é um backend hospedado, e **não funciona** quando o `dist/` é servido por um host estático.
- Nesse modo, as credenciais passam pelo processo local do Vite antes de chegar à Pluggy. Por isso ele fica **desligado por padrão**.

---

## Modelo de dados normalizado

Definido em `src/models/finance.ts`. Os campos vêm **somente** do que a Pluggy documenta (ver auditoria); nada é inventado.

- **NormalizedAccount** — conta bancária: instituição, nome, número mascarado, saldo, moeda, cheque especial (quando informado).
- **NormalizedCard** — cartão: bandeira, nível, final, limite total, disponível, **utilizado = limite − disponível**, fechamento e vencimento informados, saldo informado pela instituição.
- **NormalizedTransaction** — valor com sinal do ponto de vista do usuário (+ entrada / − saída), `kind`, categoria/subcategoria, parcela `n/total`, previsão de fatura (`billForecastDate`), status (`posted`/`pending`). Nome e CPF/CNPJ do titular e dados de pagador/recebedor **não** são guardados (só o meio de pagamento, ex.: PIX).
- **NormalizedBill** — fatura fechada: fechamento, vencimento, total, mínimo, pagamentos.
- **NormalizedInvestment** — classe (renda fixa, fundos, ações, ETFs, previdência, outros), valor líquido e bruto, valor original, lucro, vencimento, taxas **somente** quando informadas.

**Convenção de sinais da Pluggy** (confirmada no SDK): em conta bancária `+` é entrada e `−` é saída. Em **cartão**, `+` é compra e
`−` é pagamento/estorno. A normalização inverte o sinal do cartão para que, no app, **saída seja sempre negativa**.

**`kind` de cada transação** — é o que impede dupla contagem:

| kind | Exemplo | Entra em receitas/despesas? |
|---|---|---|
| `income` | salário, rendimento, estorno | Receita (estornos no cartão **reduzem** despesas) |
| `expense` | compra, conta, tarifa | Despesa |
| `internal_transfer` | transferência entre contas do mesmo titular | **Não** |
| `card_payment` | pagamento de fatura (na conta e no cartão) | **Não** — a compra já contou na data em que foi feita |
| `investment` | aplicação/resgate | **Não** |

Categorias do app: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Assinaturas, Compras, Investimentos,
Transferências, Receitas e Outros, com subcategorias. O mapeamento usa a árvore oficial de `/categories` da Pluggy e, na falta dela,
palavras-chave. Ajustes e regras do usuário ficam só neste navegador.

---

## Cálculos financeiros

Todos em `src/services/financialCalculator.ts` (funções puras, com testes):

| Função | Regra |
|---|---|
| `calculateTotalBalance` | Soma **apenas** saldos de contas bancárias na moeda base |
| `calculateTotalInvestments` | Soma o valor líquido dos investimentos ativos |
| `calculateNetWorth` | (contas com saldo positivo + investimentos) − (dívida de cartões + cheque especial usado). Limite de cartão **não** é patrimônio; fatura **não** é ativo |
| `calculateCreditUtilization` | Limite total, utilizado, disponível e % — só com cartões que informam limite |
| `calculateCurrentBills` | Fatura aberta **calculada** a partir das transações do ciclo (a Pluggy não fornece a fatura aberta em `/bills`) |
| `calculateProjectedBill` | Previsão = lançado + parcelas futuras já conhecidas. "No ritmo atual" = previsão + média diária de compras novas × dias até o fechamento (parcelas antigas não entram na média) |
| `calculateProjectedBalance` | Saldo atual + receitas previstas − despesas previstas − faturas, para 7/15/30/60/90 dias |
| `calculateMonthlyIncome` / `Expenses` | Regime de competência, só `income`/`expense` |
| `calculateSavingsRate` | (receitas − despesas) / receitas; indefinida sem receitas |
| `calculateCashFlow` | Entradas, saídas e saldo líquido por dia/semana/mês/ano |
| `calculateAssetAllocation` | Contas + investimentos por classe; cada real aparece **uma** vez |

**Ciclo da fatura:** a prioridade das datas é (1) os dias de fechamento e vencimento que **você** definiu (no cartão ou em
Configurações → Cartões) — valem mesmo que a instituição informe outros; (2) `balanceCloseDate`/`balanceDueDate` informados pela
instituição; (3) uma fatura ainda aberta na lista de faturas da instituição (fechamento ≥ hoje); (4) a última fatura fechada + 1 mês
(rotulado como estimado). Sem nenhum deles, o app não inventa ciclo e pede os dias. O início do ciclo é o dia seguinte ao fechamento anterior.

**A que fatura pertence cada compra** (nesta ordem): o `billId` de uma fatura informada pela instituição (a fatura com o mesmo mês de
vencimento do ciclo aberto conta como **aberta**, não como fechada — é o caso do Inter via Open Finance, que já lista a fatura atual);
o `billForecastDate` (Open Finance), calibrado pelas compras à vista quando a instituição usa outro mês de referência; parcela com a
data da compra original (ciclo da compra + n − 1); e, por fim, a janela de datas do ciclo.

**Parcelas previstas:** de cada compra parcelada vista (ex.: 3/10 na fatura de setembro), as parcelas que ainda não apareceram são
projetadas uma por fatura (4/10 em outubro … 10/10 em abril). Entram na fatura aberta e nas próximas, identificadas como "prevista".
Se a instituição informa para a fatura um total maior que a soma das transações, vale o valor dela.

**Projeção de saldo** combina: lançamentos futuros informados pelo banco, faturas (aberta no vencimento, fechadas não pagas,
parcelas futuras), **recorrências detectadas** no histórico (sempre rotuladas como estimativa e desligáveis em
*Configurações → Aparência → Incluir estimativas*) e lançamentos previstos que você cadastra.

**Moedas:** valores em moeda diferente do real **nunca** são somados nem convertidos; o app avisa que ficaram de fora.

**Histórico:** a Pluggy não fornece série histórica de saldo ou patrimônio. O app (a) grava um registro local de patrimônio por dia
após cada sincronização e (b) reconstrói o saldo bancário diário a partir das transações.

---

## Funcionalidades

- **Dashboard** modular (GridStack): mover, redimensionar, ocultar, mostrar, fixar e restaurar padrão; layout salvo localmente.
  Cards: Patrimônio líquido, Saldo em contas, Investimentos por classe, Receitas × despesas, Para onde está indo meu dinheiro?,
  Fatura atual, Limites dos cartões, Receitas, Despesas, Próximos gastos, Saldo projetado e Insights.
- **Contas** — saldos por instituição, histórico reconstruído, status de sincronização de cada Item, atualizar/reconectar/remover.
- **Cartões** — limites, % usado, melhor dia de compra, fechamento, vencimento, fatura atual e seguinte; dias de fechamento e vencimento definidos por você; logo próprio de cada cartão.
- **Faturas** — previsão (lançado + futuro + parcelas previstas), "Se você continuar gastando neste ritmo…", evolução diária, próximas faturas e fechadas.
- **Transações** — busca instantânea (sem acento), filtros por período, conta, cartão, instituição, categoria, tipo e valor, ordenação e paginação; recategorização e regras.
- **Investimentos** — por classe, instituição e produto; "Dados não disponíveis pela instituição" quando falta informação (nada é estimado).
- **Fluxo de Caixa** — dia/semana/mês/ano, taxa de poupança, projeção 7–90 dias, lançamentos previstos.
- **Análises** — indicadores e insights baseados apenas nos seus dados, cada um com a base de cálculo; sem recomendações de investimento.
- **Configurações** — Conta, Pluggy, Cartões, Segurança, Aparência, Aplicativo, Dashboard, Dados locais e Sobre. Tela de **Privacidade e segurança**.
- Tema Claro/Escuro/Sistema; ocultar valores; modo demonstração; menu inferior no mobile; responsivo de 320 a 1920 px.
- Todo gráfico tem alternativa em tabela; cores validadas para daltonismo; nenhuma informação transmitida só por cor.

### Identidade das instituições

Cada conexão tem um **nome, um logo (ou ícone/iniciais) e uma cor** que aparecem em todo o app: Contas, Cartões (inclusive a cor do
cartão), Faturas, Transações, Investimentos, Dashboard e Configurações.

- **Automático:** conexões diretas usam o nome do conector. Nas conexões do **Meu Pluggy**, o banco é identificado pelos dados
  (nome da conta, instituição custodiante e emissor dos investimentos) de forma conservadora: na dúvida, não identifica.
- **Biblioteca de logos (local):** 228 logos de bancos, fintechs, corretoras, cartões e bandeiras do projeto
  [react-bancos](https://github.com/henriquezolini/react-bancos) (MIT), guardados em `public/banks/` e servidos pelo próprio app —
  nenhum site externo é consultado para exibi-los, e funcionam offline. Instituições fora da biblioteca usam o logo do catálogo
  oficial da Pluggy (`GET /connectors`, cache de 7 dias). Para atualizar a biblioteca: `node scripts/update-bank-icons.mjs <clone do react-bancos>`.
- **Logo do cartão:** cada cartão (e conta) pode ter logo próprio, como *Nubank Ultravioleta*, *Itaú Black*, *C6 Carbon* ou
  *Banrisul Visa Infinite*. Quando o banco é conhecido e o nome/nível do cartão indica o produto, ele é reconhecido sozinho.
  A cor do cartão acompanha o logo escolhido.
- **Logo e nome / Personalizar** (Contas, Cartões ou Configurações → Pluggy): nome exibido; galeria com busca por nome, produto ou
  código COMPE (ex.: "Inter", "Ultravioleta", "077"), aplicada à instituição ou a um cartão/conta específico; **enviar uma imagem**
  própria (reduzida a 128 px no navegador); iniciais ou um ícone; cor (12 opções ou qualquer cor); e **apelidos** para contas e
  cartões, por exemplo "Nubank · Conta salário".
- Nomes de "razão social" ("Nu Pagamentos S.A. – Instituição de Pagamento") viram o tipo da conta ("Conta corrente"); o nome
  original continua visível como "Na instituição: …". Cartões ou contas que a instituição nomeia com o **nome do titular** passam a
  usar bandeira + nível (ex.: "Mastercard Gold"), e o nome do titular não é guardado.
- Tudo fica **cifrado neste navegador**; "Voltar ao automático" desfaz a personalização.

---

## Aplicativo (PWA)

O CashFlow pode ser instalado como aplicativo no celular (Android e iPhone) e no computador:

- **Android / Chrome / Edge:** botão **Instalar aplicativo** em *Configurações → Aplicativo* (ou no menu do usuário). No celular também
  aparece em *Mais*.
- **iPhone / iPad:** no Safari, *Compartilhar → Adicionar à Tela de Início*.
- Abre em janela própria (sem barra do navegador), com ícone, atalhos (Faturas, Transações, Cartões) e respeito ao recorte da tela.
- **Offline:** depois da primeira abertura, o app abre sem internet e mostra os dados já baixados (cifrados). Sincronizar exige internet.
- **Atualizações:** quando há uma versão nova publicada, aparece o aviso **"Nova versão do CashFlow — Atualizar agora"**. Nada é
  trocado sem você pedir.

**O que o service worker guarda:** somente os arquivos do build (lista gerada no `npm run build`) e os logos das instituições.
Chamadas à API da Pluggy, ao Pluggy Connect e ao proxy local passam direto pela rede e **nunca** são guardadas. O service worker só
é registrado no build de produção (o `npm run dev` não usa cache). Instalar exige HTTPS — o GitHub Pages já é — ou `localhost`.

---

## Limitações

| Limitação | Motivo | O que o app faz |
|---|---|---|
| O Secret fica no navegador | Sem backend não há outro lugar; a Pluggy recomenda uso em servidor | Cifragem em repouso, memória mínima, CSP, poucas dependências — ver `SECURITY.md` |
| Sem webhooks | Exigem uma URL pública | Sincronização sob demanda + status do Item |
| Sem atualização em segundo plano | Sem servidor, nada roda com o app fechado | A Pluggy/Meu Pluggy sincroniza os Items do lado dela (ex.: a cada 24 h) |
| Fatura aberta não vem da API | `/bills` costuma trazer só faturas fechadas (no Open Finance, só Inter PF e Itaú Cartões trazem faturas) | Calculada pelas transações do ciclo + parcelas previstas; se a instituição já lista a fatura atual, ela é reconhecida como aberta e o maior valor prevalece |
| Parcelas futuras | Instituições do Open Finance costumam enviar só a parcela do mês | As parcelas restantes são projetadas a partir da última conhecida (rotuladas como "prevista") |
| Histórico de patrimônio | A API não fornece | Registros locais diários + reconstrução por transações |
| Histórico de transações | A Pluggy fornece até ~12 meses | Busca 365 dias para trás e lançamentos futuros até 400 dias |
| Listar Items automaticamente | `GET /v2/items` é opt-in | Guarda IDs do Connect e aceita IDs colados |
| Items do Meu Pluggy | Não aceitam `PATCH /items/{id}` | Mensagem explicando que a atualização é feita pelo Meu Pluggy |
| Banco de origem no Meu Pluggy | O conector "MeuPluggy" não informa de qual banco são os dados | Detecção pelos dados + personalização (nome, logo, cor) |
| Fechamento/vencimento do cartão | Algumas instituições não informam (ou informam datas que não batem) | Você define os dias no cartão ou em Configurações → Cartões; eles têm prioridade |
| Logos | Marcas de terceiros | Biblioteca local (react-bancos, MIT) usada só para identificar as instituições; você pode enviar a sua imagem |
| iPhone: instalação | O Safari não oferece botão de instalar para sites | Instruções em Configurações → Aplicativo |
| Categorias | Premium após o trial na Pluggy; podem vir nulas | Mapeamento por palavras-chave + ajustes do usuário |
| Dados em outro dispositivo | Tudo é local | Cada navegador tem seu próprio cofre; exporte só a configuração visual |
| Esqueceu a senha local | Não há recuperação (por desenho) | "Esqueci a senha local" apaga os dados locais para recomeçar |

---

## Estrutura de pastas

```
├── index.html               # Shell HTML (CSP injetada no build)
├── public/                  # theme-boot.js, favicon, manifest.webmanifest, icons/ (PWA), banks/ (228 logos, react-bancos MIT)
├── scripts/                 # pwa.mjs + sw.template.js (service worker), update-bank-icons.mjs, generate-pwa-icons.mjs
├── docs/AUDITORIA-PLUGGY.md # Auditoria da documentação oficial
├── src/
│   ├── main.ts / app.ts / router.ts   # Entrada, telas por modo, rotas com lazy-loading
│   ├── config/app.config.ts           # Timeouts, limites, iterações, TTLs
│   ├── pluggy/      # client, errors, sync, connect (widget), types (payloads oficiais)
│   ├── security/    # crypto (Web Crypto), vault (cofre), redact (logs sem segredos)
│   ├── storage/     # db (IndexedDB), repository (registros cifrados), preferences
│   ├── services/    # financialDataService, financialCalculator, analytics, categories,
│   │                # recurrence, insights, transactionQuery, demoData
│   ├── state/       # store (estado central), actions (orquestração), notify
│   ├── models/      # tipos normalizados e categorias
│   ├── components/  # dom (template seguro), ui, shell, modal, toast, icons
│   ├── charts/      # Chart.js com tema lido das variáveis CSS
│   ├── pages/       # dashboard, contas, cartões, faturas, transações, investimentos,
│   │                # fluxo, análises, configurações, privacidade, onboarding, bloqueio
│   ├── styles/      # tokens.css (cores/tema), base, layout, components, pages
│   └── utils/       # format (Intl pt-BR), dates, async (debounce, fila, memo)
└── tests/
    ├── unit/        # cálculos, normalização, cripto, cliente Pluggy, utilitários
    └── e2e/         # Playwright com a API da Pluggy simulada
```

---

## Bibliotecas

Critérios: compatibilidade, tamanho, licença e manutenção. Versões de runtime fixadas.

| Biblioteca | Versão | Licença | Por quê |
|---|---|---|---|
| Chart.js | 4.5.1 | MIT | Canvas, leve (registro só dos componentes usados), acessível com tabelas alternativas; ativo e maduro. Carregado só quando um gráfico aparece |
| GridStack | 13.3.0 | MIT | Grade arrastável/redimensionável sem dependências e sem framework. A v14 saiu dias antes do início do projeto; a 13.3.0 foi fixada por estabilidade |
| @fontsource-variable/dm-sans | ^5.2 | OFL-1.1 | Fonte servida localmente (sem Google Fonts em runtime, sem CDN extra na CSP) |
| react-bancos (só os SVGs) | commit 03a8050 (v0.11) | MIT | 228 logos de bancos, cartões e bandeiras do Brasil com nome, código COMPE e cor. Só os arquivos SVG e os metadados são copiados para `public/banks/` (o componente React não é usado — nada de React no runtime) |
| Vite | ^7.1 | MIT | Só build/dev; não vai para o navegador |
| TypeScript | ~6.0 | Apache-2.0 | Tipagem estrita |
| Vitest | ^3.2 | MIT | Testes unitários |
| Playwright | ^1.56 | Apache-2.0 | Testes E2E |

Descartados: React/Vue (superfície de ataque sem ganho real aqui), ECharts (bem mais pesado), Highcharts (licença comercial para uso não pessoal),
`pluggy-sdk` (feito para Node: depende de `got` e `jsonwebtoken`).

---

## Testes

```bash
npm test          # unitários
npm run build && npm run test:e2e
```

**Unitários (118):** todos os cálculos do `FinancialCalculator` (saldo, investimentos, patrimônio, dívida, utilização, ciclo de
fatura, previsão no ritmo, saldo projetado, receitas/despesas, poupança, fluxo, alocação, histórico reconstruído), normalização
(sinais de cartão, `kind`, parcelas, PII removida), Web Crypto (AES-GCM, AAD, senha errada, chave não extraível), cliente Pluggy
(`/auth`, reuso e renovação do `apiKey`, cursor `next` sem recodificar, paginação, CORS × offline), formatação pt-BR, XSS,
redação de logs, recorrências, consulta de transações e identidade das instituições (detecção do banco no Meu Pluggy, casos
de corretora com vários emissores, nomes de razão social e do titular, catálogo de conectores, aplicação das personalizações,
ciclo de fatura com dias definidos pelo usuário), faturas (fatura aberta listada pela instituição — cenário do Inter —, atribuição
por `billId`, calibração do `billForecastDate`, parcelas previstas, valor informado pela instituição, sem dupla contagem no saldo
projetado) e biblioteca de logos (busca por nome/COMPE/produto, URLs aceitas, logo do produto do cartão).

**E2E (25, API da Pluggy simulada com os formatos oficiais):** tema claro/escuro/sistema e persistência; dashboard demo;
personalização persistida e restaurar padrão; tabela alternativa dos gráficos; **sem overflow horizontal em
320/375/390/414/768/1024/1280/1440/1920 px em todas as páginas**; menu "Mais" no mobile; fluxo de conexão completo (formato inválido,
credencial recusada, sucesso, paginação por cursor, descrição maliciosa renderizada como texto); **nenhum segredo em texto puro**
no IndexedDB, `localStorage`, URL ou DOM; bloqueio/desbloqueio usando o cache cifrado sem nova chamada à API; Item inexistente;
detecção de CORS; "Apagar todos os dados locais"; conexão do Meu Pluggy identificada como Nubank com logo do catálogo, nome do
titular nunca exibido, dias de fechamento/vencimento definidos pelo usuário, personalização aplicada em cartões e transações,
guardada cifrada e mantida após bloquear/desbloquear; logo próprio do cartão escolhido na galeria; galeria de logos com busca por
código COMPE; renomear instituição e conta no modo demonstração; **PWA** (manifesto instalável, service worker ativo, app abre sem
internet e nenhuma resposta da Pluggy fica em cache).

Nenhum teste usa credenciais reais.

---

## Publicação (build estático)

`npm run build` gera `dist/` com caminhos relativos (`base: './'`): pode ser servido por qualquer host estático (GitHub Pages,
Netlify, Cloudflare Pages, um servidor local), inclusive numa subpasta — o PWA usa escopo relativo. O build injeta a CSP como `<meta>`
e gera `dist/sw.js`. Se o host permitir cabeçalhos HTTP,
repita a mesma política no cabeçalho `Content-Security-Policy` e adicione `frame-ancestors 'none'` (que não funciona via `<meta>`).

Não coloque credenciais em variáveis de ambiente, arquivos `.env`, GitHub Secrets ou no código: elas são informadas **somente**
na interface, por quem usa o app, e ficam no navegador dessa pessoa.
