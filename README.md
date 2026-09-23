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
11. [Limitações](#limitações)
12. [Estrutura de pastas](#estrutura-de-pastas)
13. [Bibliotecas](#bibliotecas)
14. [Testes](#testes)
15. [Publicação (build estático)](#publicação-build-estático)

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
| `categories` | Árvore de categorias da Pluggy, suas regras/ajustes e lançamentos previstos | **Sim** |
| `snapshots` | Registros diários de patrimônio (histórico local) | **Sim** |
| `dashboard_layout` | Posição/tamanho/visibilidade dos cards | Não (só layout) |
| `user_preferences` | Preferências de exibição, cache, bloqueio | Não (sem dados sensíveis) |

Fora do IndexedDB, só o tema fica em `localStorage` (`cashflow.theme`), para ser aplicado antes da primeira pintura e evitar flash.

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

**Ciclo da fatura:** usa `balanceCloseDate`/`balanceDueDate` da instituição quando válidos. O início é o dia seguinte ao fechamento
da última fatura fechada; sem isso, fechamento − 1 mês (rotulado como estimado). Quando a transação traz `billForecastDate`
(Open Finance), ele tem prioridade.

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
- **Cartões** — limites, % usado, melhor dia de compra, fechamento, vencimento, fatura atual e próxima.
- **Faturas** — previsão (lançado + futuro), "Se você continuar gastando neste ritmo…", evolução diária, faturas futuras e fechadas.
- **Transações** — busca instantânea (sem acento), filtros por período, conta, cartão, instituição, categoria, tipo e valor, ordenação e paginação; recategorização e regras.
- **Investimentos** — por classe, instituição e produto; "Dados não disponíveis pela instituição" quando falta informação (nada é estimado).
- **Fluxo de Caixa** — dia/semana/mês/ano, taxa de poupança, projeção 7–90 dias, lançamentos previstos.
- **Análises** — indicadores e insights baseados apenas nos seus dados, cada um com a base de cálculo; sem recomendações de investimento.
- **Configurações** — Conta, Pluggy, Segurança, Aparência, Dashboard, Dados locais e Sobre. Tela de **Privacidade e segurança**.
- Tema Claro/Escuro/Sistema; ocultar valores; modo demonstração; menu inferior no mobile; responsivo de 320 a 1920 px.
- Todo gráfico tem alternativa em tabela; cores validadas para daltonismo; nenhuma informação transmitida só por cor.

---

## Limitações

| Limitação | Motivo | O que o app faz |
|---|---|---|
| O Secret fica no navegador | Sem backend não há outro lugar; a Pluggy recomenda uso em servidor | Cifragem em repouso, memória mínima, CSP, poucas dependências — ver `SECURITY.md` |
| Sem webhooks | Exigem uma URL pública | Sincronização sob demanda + status do Item |
| Sem atualização em segundo plano | Sem servidor, nada roda com o app fechado | A Pluggy/Meu Pluggy sincroniza os Items do lado dela (ex.: a cada 24 h) |
| Fatura aberta não vem da API | `/bills` só retorna faturas fechadas | Calculada pelas transações do ciclo e rotulada como tal |
| Histórico de patrimônio | A API não fornece | Registros locais diários + reconstrução por transações |
| Histórico de transações | A Pluggy fornece até ~12 meses | Busca 365 dias para trás e lançamentos futuros até 400 dias |
| Listar Items automaticamente | `GET /v2/items` é opt-in | Guarda IDs do Connect e aceita IDs colados |
| Items do Meu Pluggy | Não aceitam `PATCH /items/{id}` | Mensagem explicando que a atualização é feita pelo Meu Pluggy |
| Categorias | Premium após o trial na Pluggy; podem vir nulas | Mapeamento por palavras-chave + ajustes do usuário |
| Dados em outro dispositivo | Tudo é local | Cada navegador tem seu próprio cofre; exporte só a configuração visual |
| Esqueceu a senha local | Não há recuperação (por desenho) | "Esqueci a senha local" apaga os dados locais para recomeçar |

---

## Estrutura de pastas

```
├── index.html               # Shell HTML (CSP injetada no build)
├── public/                  # theme-boot.js (tema antes da pintura), favicon
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

**Unitários (82):** todos os cálculos do `FinancialCalculator` (saldo, investimentos, patrimônio, dívida, utilização, ciclo de
fatura, previsão no ritmo, saldo projetado, receitas/despesas, poupança, fluxo, alocação, histórico reconstruído), normalização
(sinais de cartão, `kind`, parcelas, PII removida), Web Crypto (AES-GCM, AAD, senha errada, chave não extraível), cliente Pluggy
(`/auth`, reuso e renovação do `apiKey`, cursor `next` sem recodificar, paginação, CORS × offline), formatação pt-BR, XSS,
redação de logs, recorrências e consulta de transações.

**E2E (21, API da Pluggy simulada com os formatos oficiais):** tema claro/escuro/sistema e persistência; dashboard demo;
personalização persistida e restaurar padrão; tabela alternativa dos gráficos; **sem overflow horizontal em
320/375/390/414/768/1024/1280/1440/1920 px em todas as páginas**; menu "Mais" no mobile; fluxo de conexão completo (formato inválido,
credencial recusada, sucesso, paginação por cursor, descrição maliciosa renderizada como texto); **nenhum segredo em texto puro**
no IndexedDB, `localStorage`, URL ou DOM; bloqueio/desbloqueio usando o cache cifrado sem nova chamada à API; Item inexistente;
detecção de CORS; "Apagar todos os dados locais".

Nenhum teste usa credenciais reais.

---

## Publicação (build estático)

`npm run build` gera `dist/` com caminhos relativos (`base: './'`): pode ser servido por qualquer host estático (GitHub Pages,
Netlify, Cloudflare Pages, um servidor local). O build injeta a CSP como `<meta>`. Se o host permitir cabeçalhos HTTP,
repita a mesma política no cabeçalho `Content-Security-Policy` e adicione `frame-ancestors 'none'` (que não funciona via `<meta>`).

### GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` compila e publica o projeto automaticamente a cada push na branch `main`.
No repositório do GitHub, abra **Settings > Pages** e, em **Build and deployment > Source**, selecione **GitHub Actions**.
Depois, acompanhe a primeira publicação na aba **Actions**. O site ficará disponível em
`https://<usuario>.github.io/<repositorio>/`.

Não selecione **Deploy from a branch**: essa opção publicaria os arquivos-fonte do Vite sem executar o build.

Não coloque credenciais em variáveis de ambiente, arquivos `.env`, GitHub Secrets ou no código: elas são informadas **somente**
na interface, por quem usa o app, e ficam no navegador dessa pessoa.
