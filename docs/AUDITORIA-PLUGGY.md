# Auditoria técnica — Pluggy em arquitetura 100% frontend

> Documento produzido **antes** da implementação (Fases 1 e 2).
> Fontes: documentação oficial (docs.pluggy.ai), SDK oficial `pluggy-sdk` (repositório `pluggyai/pluggy-node`, v0.90.0),
> repositório oficial `pluggyai/quickstart` e guia oficial `pluggyai/meu-pluggy`. Onde algo **não** pôde ser confirmado,
> isso está dito explicitamente.

---

## 1. Resumo executivo

| Pergunta | Resposta |
|---|---|
| Dá para autenticar direto do navegador? | **Tecnicamente sim** (`POST /auth` com Client ID + Secret retorna um `apiKey`). **Mas a Pluggy recomenda fazer isso só em servidor.** Este projeto assume o risco de forma consciente e documentada: o usuário é o dono das credenciais e o único usuário do app. |
| O Connect Token resolve sem expor o Secret? | **Não para este app.** O Connect Token só acessa `GET /items/:id` e uma versão reduzida de `GET /accounts?itemId`. Transações, faturas e investimentos exigem o `apiKey`, que exige o Secret. |
| CORS permite chamadas do navegador? | **Sim — verificado empiricamente em 23/09/2026** a partir de uma origem arbitrária (`https://example.com`, navegador real): `POST /auth` (JSON, com preflight) e `GET` com header `X-API-KEY` (com preflight) retornam respostas legíveis. A documentação não fala de CORS, portanto isso pode mudar sem aviso: o app detecta bloqueio em tempo de execução e oferece um modo de *proxy local* (servidor do Vite rodando **na máquina do próprio usuário**, que só repassa requisições e não armazena nada). |
| Webhooks? | **Inviáveis** sem backend (exigem uma URL HTTPS pública). O app usa sincronização sob demanda + consulta de status do Item. |
| Listar os Items do usuário? | `GET /v2/items` existe, mas é **opt-in** (precisa ser habilitado pelo suporte da Pluggy). Por isso o app guarda localmente os IDs obtidos pelo Connect e permite colar IDs manualmente (fluxo Meu Pluggy). |

---

## 2. Autenticação (confirmado)

1. `POST https://api.pluggy.ai/auth` — corpo `{ "clientId": "<uuid>", "clientSecret": "<secret>", "nonExpiring": false }`
   (o SDK oficial envia `nonExpiring: false`). Resposta `200 { "apiKey": "<JWT>" }`.
2. O `apiKey` **expira em 2 horas**. É um JWT com `exp` — o SDK oficial decodifica o JWT e renova quando `exp` passa.
3. Todas as chamadas usam o header `X-API-KEY: <apiKey>` e `Content-Type: application/json`.
4. `POST /connect_token` (com `X-API-KEY`) — corpo `{ "itemId"?: "<uuid>", "options"?: { clientUserId, webhookUrl, oauthRedirectUri, avoidDuplicates } }`
   → `{ "accessToken": "<JWT>" }`, **válido por 30 minutos**. Propriedades fora de `options` são ignoradas silenciosamente.
5. Erros seguem o formato `{ "code": 401, "codeDescription": "CLIENT_KEYS_UNAUTHORIZED", "message": "..." }`.

**Verificação empírica (23/09/2026, navegador real, origem `https://example.com`):**

| Requisição | Resultado |
|---|---|
| `POST /auth` com credenciais inválidas | `401 CLIENT_KEYS_UNAUTHORIZED` — legível pelo navegador (CORS ok) |
| `GET /connectors` sem apiKey | `403 API_KEY_MISSING_OR_INVALID` — legível (CORS ok) |
| `GET /connectors` com `X-API-KEY` inválido | `403 API_KEY_MISSING_OR_INVALID` — legível (preflight ok) |
| `GET /v2/transactions` com `X-API-KEY` inválido | `403 API_KEY_MISSING_OR_INVALID` — legível |
| Headers `RateLimit-*` / `Retry-After` | **não expostos** ao JavaScript (CORS) → o app assume 60 s em caso de `429` |
| Script `cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js` | carrega e expõe `window.PluggyConnect` com `init`, `destroy`, `show`, `hide` |

⚠️ Diferente do que se esperaria, **apiKey ausente/inválido/expirado responde 403 (não 401)**. O cliente trata `403 API_KEY_MISSING_OR_INVALID` como "renovar apiKey e tentar de novo uma vez".

**Decisão:** o `apiKey` vive **somente em memória**; é renovado 5 minutos antes do `exp` e, em caso de `403 API_KEY_MISSING_OR_INVALID` (ou `401` fora do `/auth`), uma única renovação + nova tentativa.

## 3. Pluggy Connect (confirmado pelo quickstart oficial)

- Vanilla JS: `<script src="https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js">` → `new PluggyConnect({...}).init()`.
- Opções usadas: `connectToken` (obrigatório), `includeSandbox`, `updateItem` (reconectar), `language` (padrão `pt`), `theme` (`light`/`dark`),
  callbacks `onSuccess({ item })`, `onError(error)`, `onClose()`, `onEvent(payload)`.
- Ambiente único de produção (`connect.pluggy.ai`); sandbox via `includeSandbox: true` (conector *Pluggy Bank*, usuário `user-ok`, senha `password-ok`, MFA `123456`).
- **Decisão:** o script é carregado **sob demanda** (só quando o usuário clica em "Adicionar instituição"), em versão fixa, liberado explicitamente na CSP.

## 4. Fluxo "Meu Pluggy" (uso pessoal gratuito — confirmado)

Pessoas físicas normalmente usam o **Meu Pluggy**: até 5 conexões ativas, mesmo titular, uso **não comercial**, atualização automática a cada 24 h.
1. Conectar os bancos em `meu.pluggy.ai` (Open Finance).
2. No Dashboard (`dashboard.pluggy.ai`), criar a aplicação e obter Client ID/Secret.
3. Vincular cada banco do Meu Pluggy à aplicação pelo conector **MeuPluggy** (via Demo da aplicação) → copiar o **Item ID**.
4. No CashFlow: informar Client ID/Secret e colar os Item IDs.

Observações práticas (documentadas pela comunidade, tratadas com mensagens amigáveis): Items do conector MeuPluggy **não aceitam** `PATCH /items/{id}` (a atualização é feita pelo próprio Meu Pluggy).

## 5. Endpoints necessários (confirmados no SDK oficial)

| Dado | Endpoint | Paginação |
|---|---|---|
| Item / instituição / status | `GET /items/{id}` | — |
| Listar Items (opt-in) | `GET /v2/items?after=` | cursor (`next`) |
| Contas e cartões | `GET /accounts?itemId=&type=BANK\|CREDIT` | página (`page`, `total`, `totalPages`, `results`) |
| Transações | `GET /v2/transactions?accountId=&dateFrom=&dateTo=&after=` | **cursor, 500 fixos por página** |
| Faturas (fechadas) | `GET /bills?accountId=` | página |
| Investimentos | `GET /investments?itemId=&pageSize=&page=` | página (máx. 500) |
| Categorias Pluggy | `GET /categories` | página |
| Conectores | `GET /connectors` | página |
| Forçar sincronização | `PATCH /items/{id}` | — (limite 20/min) |
| Token do widget | `POST /connect_token` | — |

Pontos de atenção confirmados:
- `GET /transactions` (paginado por página) está **depreciado** e disponível **somente até 31/12/2026** → o app usa **apenas** `/v2/transactions`.
- Em `/v2/transactions`, o campo `next` já vem **pronto e codificado**; deve ser anexado **como está** (reconstruir com `URLSearchParams` recodifica e quebra).
  Parâmetros como `pageSize`, `page`, `cursor` e `itemId` são rejeitados.
- Histórico de transações: **até 12 meses**.

## 6. Modelo de dados da Pluggy (campos confirmados no SDK oficial)

- **Account**: `id, itemId, type (BANK|CREDIT), subtype (CHECKING_ACCOUNT|SAVINGS_ACCOUNT|CREDIT_CARD), number, name, marketingName, balance, currencyCode, owner, taxNumber, bankData, creditData`.
  - `bankData`: `transferNumber, closingBalance, automaticallyInvestedBalance, overdraftContractedLimit, overdraftUsedLimit, unarrangedOverdraftAmount, hasReservedBalance, reservedBalances[]`.
  - `creditData`: `level, brand, balanceCloseDate, balanceDueDate, availableCreditLimit, balanceForeignCurrency, minimumPayment, creditLimit, isLimitFlexible, status, holderType, disaggregatedCreditLimits[]`.
  - **Atenção:** para cartões, `balance` é o saldo em aberto do mês **exceto** em conectores Open Finance, onde representa o **limite utilizado**. O app **não** usa `balance` como "fatura atual" sem ressalva.
- **Transaction**: `id, accountId, date, description, descriptionRaw, type (DEBIT|CREDIT), amount, amountInAccountCurrency, balance, currencyCode, category, categoryId, status (PENDING|POSTED), providerCode, paymentData, creditCardMetadata, merchant, operationType, providerId, createdAt, updatedAt`.
  - Sinal: conta bancária → positivo = entrada, negativo = saída. **Cartão → positivo = compra/encargo, negativo = pagamento/estorno.**
  - `creditCardMetadata`: `installmentNumber, totalInstallments, totalAmount, payeeMCC, purchaseDate, billId, cardNumber, feeType, otherCreditsType, billForecastDate (YYYY-MM, só Open Finance)`.
  - Parcelas futuras podem vir como `PENDING`. Não existe identificador único que agrupe as parcelas de uma compra.
- **Bill** (fatura): `id, dueDate, billClosingDate, totalAmount, totalAmountCurrencyCode, minimumPaymentAmount, allowsInstallments, financeCharges[], payments[]`.
  Retornada obrigatoriamente em Open Finance regulado; em conexões diretas, só Inter PF e Itaú Cartões. **A fatura aberta não vem em `/bills`.**
- **Investment**: `id, itemId, type (MUTUAL_FUND|SECURITY|EQUITY|COE|FIXED_INCOME|ETF|OTHER), subtype, name, code, isin, currencyCode, balance (líquido), amount (bruto), amountOriginal, amountProfit, amountWithdrawal, value, quantity, taxes, taxes2, date, dueDate, issuer, issueDate, purchaseDate, rate, rateType, fixedAnnualRate, lastMonthRate, lastTwelveMonthsRate, annualRate, status, institution, owner`.
  Rentabilidades mensais/anuais só existem para fundos. Não há série histórica.
- **Item**: `id, connector{ id, name, imageUrl, primaryColor, type, isOpenFinance, ... }, status (UPDATED|UPDATING|WAITING_USER_INPUT|WAITING_USER_ACTION|MERGING|LOGIN_ERROR|OUTDATED), executionStatus, statusDetail, error, createdAt, updatedAt, lastUpdatedAt, nextAutoSyncAt, consentExpiresAt`.
- **Category**: `id (8 dígitos), description (EN), descriptionTranslated (PT), parentId, parentDescription`. Categorização é recurso premium após o trial → `category` pode vir `null`.

## 7. Limites de requisição (confirmados)

Por endpoint, **por IP, por minuto**: `POST /auth` 360 · `GET /transactions` 360 · `GET /investments` 360 · `PATCH /items/{id}` 20.
Resposta `429` com `Retry-After` (sempre 60 s) e `RateLimit-Limit`/`RateLimit-Reset`.
**Decisão:** fila com no máximo 3 requisições simultâneas, deduplicação de chamadas idênticas em andamento, respeito ao `Retry-After`, reaproveitamento do `apiKey` por toda a validade.

## 8. Riscos de segurança identificados

1. **Secret no navegador** (contra a recomendação da Pluggy). Mitigado, não eliminado: criptografia em repouso, memória mínima, CSP, poucas dependências.
2. **`apiKey` dá acesso total à aplicação Pluggy por 2 h** (todos os Items). Vive só em memória; bloqueio automático por inatividade descarta tudo.
3. **XSS** — descrições de transações vêm de bancos (texto não confiável). Toda renderização escapa HTML; nada de `innerHTML` com dados.
4. **Cadeia de suprimentos** — qualquer script da página poderia ler o Secret decifrado. Dependências de runtime reduzidas a 2 bibliotecas + 1 fonte, versões fixas, sem CDN de terceiros além da própria Pluggy.
5. **Extensões do navegador / computador compartilhado** — fora do alcance do app; documentado.
6. **Dados financeiros em cache** — também cifrados (mesma chave de dados).

## 9. Limitações encontradas (o que exigiria backend)

| Funcionalidade | Situação no frontend-only |
|---|---|
| Guardar o Secret longe do usuário final | Impossível sem backend — aceito por ser um app **pessoal** (o usuário é o dono do Secret). |
| Webhooks (`item/updated`, `transactions/created`...) | Exige endpoint público → **não implementado**; sincronização sob demanda. |
| Atualização automática em segundo plano | Sem backend, só acontece com o app aberto. A Pluggy/Meu Pluggy já sincroniza os Items no servidor dela (ex.: a cada 24 h). |
| Histórico de patrimônio | A Pluggy não fornece série histórica → o app registra *snapshots* locais diários e reconstrói o saldo bancário a partir das transações. |
| Receitas/despesas "previstas" | A Pluggy não fornece agendamentos → o app usa (a) lançamentos futuros/parcelas, (b) faturas a vencer, (c) recorrências detectadas no histórico (rotuladas como estimativa) e (d) lançamentos manuais locais. |
| CORS | Hoje liberado (verificado). Se a Pluggy passar a bloquear chamadas do navegador, o único caminho sem backend hospedado é o **proxy local** do Vite (`npm run dev`/`npm run preview` na máquina do usuário). |

## 10. Plano de implementação

Fases 3–24 conforme solicitado, com validação (typecheck, testes, build, screenshots) após cada bloco.

## 11. Situação após a implementação

As decisões acima foram implementadas como descritas. Detalhes de uso, arquitetura final e modelo de segurança estão em
[`README.md`](../README.md) e [`SECURITY.md`](../SECURITY.md). Os formatos de payload usados nos testes E2E (API simulada)
seguem os tipos do SDK oficial listados na seção 6.
