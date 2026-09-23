import{r as n,h as a,i as e}from"./index-CkDdCF5O.js";function r(){return a`<ul class="privacy-list">${[["database","Não possuímos backend próprio","O CashFlow é um aplicativo estático: todo o processamento acontece no seu navegador. Não existe servidor do CashFlow recebendo dados."],["lock","Credenciais ficam localmente","Client ID e Client Secret são cifrados (AES-GCM 256) com uma chave derivada da sua senha local (PBKDF2-SHA256, 600 mil iterações) e guardados no IndexedDB deste navegador."],["shield","Seus dados não são vendidos","Não há anúncios, analytics, telemetria nem terceiros recebendo dados. O único destino das requisições é a API oficial da Pluggy."],["external",'Nada é enviado ao "nosso servidor"',"As chamadas vão diretamente do navegador para api.pluggy.ai. O widget Pluggy Connect é carregado do CDN oficial da Pluggy somente quando você conecta uma instituição."],["key","Você controla as credenciais","Você pode trocar, testar ou remover as credenciais a qualquer momento. Recomendamos uma aplicação Pluggy dedicada, para poder rotacionar o Secret."],["trash","Você pode apagar tudo",'Em Configurações → Segurança, "Apagar todos os dados locais" remove credenciais, cache financeiro, categorização e layout deste navegador.']].map(([s,i,d])=>a`<li>${e(s)}<div><strong>${i}</strong><p>${d}</p></div></li>`)}</ul>
    <div class="callout callout--warn">${e("alert")}<div><strong>Limitações honestas.</strong> A Pluggy recomenda manter o Client Secret apenas em servidores. Aqui ele fica no seu navegador porque você é o dono e o único usuário das credenciais. Enquanto o app está desbloqueado, extensões maliciosas do navegador ou um computador comprometido poderiam acessá-lo. Use um navegador de confiança, não use em computadores compartilhados e remova as credenciais se suspeitar de algo.</div></div>`}function c(o){n(o.root,a`<div class="page">
      <div class="page-head"><p class="page-head__intro">Como o CashFlow trata suas credenciais e seus dados financeiros.</p></div>
      <section class="card">${r()}</section>
      <section class="card">
        <div class="card__title card__title--lg">Detalhes técnicos</div>
        <div class="kv-list">
          <div class="kv"><span>Armazenamento</span><strong>IndexedDB (cifrado) · tema em localStorage</strong></div>
          <div class="kv"><span>Criptografia</span><strong>AES-GCM 256 · PBKDF2-SHA256 600k</strong></div>
          <div class="kv"><span>Token da Pluggy (apiKey)</span><strong>Somente em memória · expira em 2 h</strong></div>
          <div class="kv"><span>Bloqueio automático</span><strong>Configurável (padrão 15 min)</strong></div>
          <div class="kv"><span>Content-Security-Policy</span><strong>Somente api.pluggy.ai e cdn.pluggy.ai</strong></div>
        </div>
        <p class="muted">Leia também o arquivo SECURITY.md do projeto.</p>
      </section>
    </div>`)}export{c as mount,r as privacyPoints};
