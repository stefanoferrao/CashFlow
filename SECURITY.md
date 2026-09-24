# Segurança e privacidade — CashFlow

> As credenciais são configuradas e armazenadas localmente neste navegador. A plataforma não possui acesso ao seu Client Secret.

O CashFlow é **100% frontend**. Não há backend, API intermediária, banco de dados remoto, analytics nem telemetria.
O navegador conversa diretamente com a Pluggy (`api.pluggy.ai`, `cdn.pluggy.ai`, `connect.pluggy.ai`) e com mais ninguém.

Este documento descreve **exatamente** o que a implementação faz — onde as credenciais ficam, como são protegidas,
como apagá-las — e, com a mesma franqueza, **o que ela não consegue proteger**.

---

## 1. Onde ficam as credenciais

| Dado | Onde fica | Forma |
|---|---|---|
| Client ID e Client Secret | IndexedDB `cashflow` → store `pluggy_credentials`, registro `credentials` | **Cifrados** (AES-GCM-256) |
| Chave de dados (DEK) | IndexedDB, registro `vault` | **Embrulhada** (cifrada) pela chave derivada da senha local |
| Senha local | **Em lugar nenhum** | Só é usada para derivar a chave; nunca é gravada |
| `apiKey` da Pluggy (JWT de 2 h) | **Somente memória** (variável do cliente) | Nunca é gravado |
| Dados financeiros (contas, transações, cartões, faturas, investimentos, categorias, histórico) | IndexedDB, um store por tipo | **Cifrados** com a mesma DEK |
| Personalizações (nomes, cores e logos das instituições e cartões — inclusive imagens enviadas —, apelidos, dias de fechamento/vencimento) | IndexedDB, store `categories` | **Cifradas** com a mesma DEK |
| Arquivos do app e logos (PWA) | Cache Storage do navegador (service worker) | Texto puro — só arquivos públicos do próprio app e logos; **nunca** respostas da API, credenciais ou dados financeiros |
| Layout do dashboard e preferências de exibição | IndexedDB (`dashboard_layout`, `user_preferences`) | Texto puro — não contêm dados financeiros nem credenciais |
| Tema (claro/escuro/sistema) | `localStorage` (`cashflow.theme`) | Texto puro — só o nome do tema |

No modo **"Usar somente nesta sessão"**, nada disso é gravado: credenciais e dados ficam cifrados em memória com uma chave
efêmera e desaparecem ao fechar ou recarregar a aba.

**O Client Secret nunca vai para:** `localStorage`/`sessionStorage` em texto puro, cookies, URL/query string, código-fonte,
arquivos `.js`, variáveis de ambiente, GitHub Secrets, `console.log`, mensagens de erro, DOM (depois de salvo), telemetria
ou qualquer servidor que não seja o `POST https://api.pluggy.ai/auth` da própria Pluggy.

---

## 2. Como são protegidas

### Hierarquia de chaves

```
senha local ──PBKDF2-SHA256 (salt aleatório de 16 bytes, 600.000 iterações)──► KEK (AES-GCM-256, só wrap/unwrap)
                                                                                  │
                                                         embrulha (AES-GCM, IV de 12 bytes)
                                                                                  ▼
                                               DEK aleatória (AES-GCM-256) ── cifra cada registro:
                                               AES-GCM(DEK, IV aleatório de 12 bytes, AAD = "<store>:<id>")
```

- Tudo usa a **Web Crypto API** nativa do navegador; não há criptografia implementada à mão nem biblioteca de terceiros.
- A DEK usada em memória é **não extraível**: nem o próprio código do app consegue exportá-la em bytes.
- O **AAD** amarra cada registro ao seu lugar: um registro copiado de um store/ID para outro falha na autenticação.
- A **senha errada** é detectada pelo próprio AES-GCM (o desembrulho falha); não existe hash da senha guardado para comparação.
- **Trocar a senha local** re-embrulha a mesma DEK com um salt novo; os dados não precisam ser recifrados.

### Tempo de vida em memória

- O Secret só é decifrado dentro de `useCredentials()`, pelo tempo da chamada a `POST /auth`; a referência não é guardada.
  (Strings em JavaScript são imutáveis e não podem ser zeradas; o que dá para fazer é minimizar o tempo de vida.)
- Buffers intermediários de cifragem são zerados (`fill(0)`) após o uso.
- O `apiKey` fica só em memória e é renovado 5 min antes de expirar.
- **Bloqueio** (manual ou automático por inatividade — padrão 15 min; opções 5/15/30/60 min ou nunca) descarta DEK, `apiKey`,
  credenciais em memória e a cópia decifrada do cache.

### Superfície de ataque do código

- **XSS:** descrições de transações e nomes vindos dos bancos são texto não confiável. Toda renderização passa por um template
  que **escapa HTML por padrão**; não há `innerHTML` com dados. Um teste E2E injeta `<img onerror=…>` como descrição e verifica que nada executa.
- **CSP** (build de produção): `default-src 'self'`; scripts só do próprio site e de `https://cdn.pluggy.ai`; conexões só com
  `*.pluggy.ai`; `worker-src 'self'` e `manifest-src 'self'` (PWA); `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`.
- **Dependências de runtime:** Chart.js e GridStack (versões fixas) e uma fonte local. Sem framework de UI, sem CDN de terceiros
  além da Pluggy, sem scripts de analytics.
- **Requisições:** `credentials: 'omit'` (nenhum cookie vai junto) e `referrerPolicy: 'no-referrer'`.
- **Logs:** desligados por padrão. O "modo de depuração" passa tudo por um redator que remove Secret, `apiKey`/JWT, `X-API-KEY`,
  CPF, CNPJ e identificadores.
- **Erros:** o usuário vê mensagens amigáveis; stack traces e corpos de resposta não são exibidos.
- **Dados pessoais:** nome e CPF/CNPJ do titular e os dados de pagador/recebedor que a Pluggy retorna não são guardados; da parte de pagamento, só o meio (ex.: PIX) é mantido. Quando a instituição usa o nome do titular como nome da conta ou do cartão (inclusive abreviado), ele é trocado por um nome genérico ("Conta corrente", "Mastercard Gold") na normalização.
- **Logos das instituições:** vêm de uma biblioteca **local** (228 SVGs do projeto react-bancos, MIT, em `public/banks/`), servida
  pelo próprio app: nenhum terceiro fica sabendo quais bancos você usa. Os SVGs são exibidos como `<img>` (não executam scripts) e o
  script de importação recusa arquivos com script, eventos ou referências externas. Só instituições fora da biblioteca usam o logo do
  catálogo da Pluggy (`cdn.pluggy.ai`, com `referrerpolicy="no-referrer"`) — a Pluggy já sabe quais instituições você conectou.
- **Imagem enviada como logo:** lida no navegador (sem upload a lugar nenhum), redesenhada em um PNG de 128 px (o que descarta
  metadados e qualquer conteúdo ativo de SVG) e guardada cifrada. Só `data:image/png|jpeg|webp` é aceito na hora de exibir.
- **Service worker (PWA):** registrado só no build de produção. Guarda no Cache Storage apenas os arquivos listados no build e os
  logos; requisições à API da Pluggy, ao Pluggy Connect, a scripts de terceiros e ao proxy local (`/pluggy-api`) **não passam pelo
  cache**. Uma versão nova só é ativada quando você clica em "Atualizar agora". O teste E2E verifica que nenhuma resposta da Pluggy
  fica em cache.

---

## 3. Como apagar

| Ação | Onde | O que remove |
|---|---|---|
| **Remover credenciais** (com confirmação) | Configurações → Segurança | Client ID/Secret e o `apiKey` em memória. O cache financeiro cifrado continua, até você apagá-lo |
| **Remover deste navegador** (instituição) | Contas → menu da instituição, ou Configurações → Pluggy | O Item, os dados dele e as personalizações dele **neste navegador** (não apaga nada na Pluggy) |
| **Limpar cache financeiro** | Configurações → Dados locais | Só os dados baixados da Pluggy; categorização, lançamentos previstos e personalizações são mantidos |
| **Apagar todos os dados locais** | Configurações → Segurança (confirmação digitando `APAGAR`) | O banco IndexedDB inteiro, o tema no `localStorage` e o `sessionStorage`; descarta chaves da memória e volta ao início. Também apaga os logos guardados pelo app instalado; os arquivos do app (públicos) continuam — para removê-los, desinstale o app ou apague os dados do site no navegador |
| **Esqueci a senha local** | Tela de desbloqueio | O mesmo que "Apagar todos os dados locais" (sem a senha não há como decifrar nada) |
| **Bloquear agora** | Menu do usuário ou Configurações | Nada é apagado; tudo que estava decifrado sai da memória |

Apagar no CashFlow **não** revoga nada na Pluggy. Para isso:

- **Troque o Client Secret** no [Dashboard da Pluggy](https://dashboard.pluggy.ai) se suspeitar que ele foi exposto. O antigo deixa de funcionar.
- Exclua conexões (Items) no Dashboard da Pluggy ou no [Meu Pluggy](https://meu.pluggy.ai).
- O navegador também permite apagar os dados do site em *Configurações do navegador → Privacidade → Dados de sites*.

---

## 4. Riscos (o que o app **não** consegue impedir)

1. **O Secret existe no navegador.** A Pluggy recomenda usar Client ID/Secret só em servidor. Sem backend, não há outro lugar:
   aqui o usuário é o dono das credenciais e o único usuário do app. A cifragem protege os dados **em repouso**; enquanto o app
   está desbloqueado, qualquer código rodando na página poderia, em tese, chegar ao Secret no instante do `/auth`.
2. **O `apiKey` dá acesso a toda a sua aplicação Pluggy por até 2 horas** (todos os Items). Quem o obtiver pode ler seus dados
   financeiros até ele expirar. Ele fica só em memória e é descartado no bloqueio.
3. **Extensões do navegador** com permissão para ler páginas podem ver tudo que a página vê. Use um perfil do navegador sem
   extensões desnecessárias.
4. **Computador comprometido** (malware, keylogger, captura de tela): fora do alcance de qualquer app web.
5. **Computador compartilhado:** outra pessoa com acesso ao seu usuário do sistema pode copiar o IndexedDB. Sem a senha local, os
   dados estão cifrados, mas uma cópia permite **tentativas offline** contra a senha. O PBKDF2 com 600.000 iterações encarece cada
   tentativa; uma **senha longa** (4+ palavras ou 14+ caracteres) é o que torna isso impraticável. O medidor de força ajuda na escolha.
6. **Quem hospeda o site controla o código.** Se o `dist/` for servido por terceiros, quem controla o host pode alterar o JavaScript.
   O mais seguro é rodar localmente (`npm run build && npm run preview`) ou hospedar você mesmo.
7. **Cadeia de suprimentos:** uma versão maliciosa de uma dependência afetaria o build. As versões de runtime estão fixadas; confira
   o `package-lock.json` gerado e rode `npm audit` antes de atualizar.
8. **Script da Pluggy:** o widget `pluggy-connect.js` vem de `cdn.pluggy.ai` (versão fixa, carregado só ao conectar). Ele é da própria
   Pluggy, a quem você já confia seus dados, mas roda na mesma página.
9. **Modo "proxy local"** (desligado por padrão): as requisições, inclusive o `POST /auth`, passam pelo processo do Vite na sua
   máquina antes de chegar à Pluggy. Ele não grava nada, mas é um intermediário local. Use só se a Pluggy bloquear CORS.

---

## 5. Limitações de uma arquitetura só-frontend

- Não dá para esconder o Secret do próprio navegador que o usa — só protegê-lo em repouso e reduzir sua exposição.
- Não dá para zerar strings da memória do JavaScript.
- Não há webhooks nem sincronização com o app fechado.
- Não há recuperação de senha: se esquecer a senha local, os dados cifrados são irrecuperáveis (por desenho).
- Não há controle de taxa do lado servidor: o app respeita os limites da Pluggy (fila com no máx. 3 requisições, `Retry-After` de 60 s).
- O cabeçalho `frame-ancestors` (proteção contra clickjacking) não funciona via `<meta>`; configure-o no host, se possível.
- Cada navegador/dispositivo tem seu próprio cofre; nada é sincronizado entre eles.

---

## 6. Recomendações de uso

- Use o **cofre com senha** e uma senha local forte e **diferente** de outras senhas suas.
- Mantenha o **bloqueio automático** ligado.
- Prefira rodar o app **localmente** ou em um host que só você controla.
- Use um perfil do navegador com poucas extensões.
- Em computador de terceiros, use **"Usar somente nesta sessão"** e, ao terminar, **Apagar todos os dados locais**.
- Se algo parecer estranho, **troque o Client Secret** no Dashboard da Pluggy.
