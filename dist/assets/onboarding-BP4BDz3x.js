import{d as $,b,A as m,l as x,i as e,h as l,p as S,r as A,v as E,e as q,t as k,f as F,g as L,j as M,n as z,s as D,o as T,a as N,k as O}from"./index-CkDdCF5O.js";import{privacyPoints as R}from"./privacy-DwQHegGV.js";function B(){return l`<aside class="screen__aside">
    <span class="brand"><span class="brand__mark">${x()}</span><span class="brand__name">${m.name}</span></span>
    <div class="stack">
      <p class="screen__headline">Saiba <em>onde está</em> cada real do seu dinheiro.</p>
      <p class="screen__lede">Contas, cartões, faturas e investimentos consolidados — processados somente no seu navegador.</p>
      <div class="preview-stack" aria-hidden="true">
        <div class="preview-card"><span>Contas</span><span class="bar"><i style="width:62%"></i></span></div>
        <div class="preview-card"><span>Investimentos</span><span class="bar"><i style="width:88%"></i></span></div>
        <div class="preview-card"><span>Cartões</span><span class="bar"><i style="width:34%;background:#eb6834"></i></span></div>
      </div>
    </div>
    <p class="row" style="color:#aab0bb;font-size:13px">${e("shield")}<span>Sem backend próprio. Suas credenciais ficam neste navegador.</span></p>
  </aside>`}function j(){const n=b.state.theme.pref,r=n==="light"?"dark":n==="dark"?"system":"light",d=n==="light"?"Claro":n==="dark"?"Escuro":"Sistema";return l`<button type="button" class="icon-btn icon-btn--outline theme-float" data-action="cycle-theme" data-value="${r}" aria-label="Tema: ${d}. Alternar" data-tip="Tema: ${d}">${e(n==="light"?"sun":n==="dark"?"moon":"monitor")}</button>`}function G(n){let r=0,d="passphrase",c=!1,o=null,p=null;const s={clientId:"",clientSecret:"",pass1:"",pass2:""},g=()=>l`<div class="steps" aria-hidden="true">${[0,1,2,3].map(a=>l`<span class="${a<=r?"is-done":""}"></span>`)}</div>`,w={0:()=>l`
      ${g()}
      <span class="step-label">Bem-vindo</span>
      <h1>Tenha uma visão completa das suas finanças.</h1>
      <ul class="feature-list">
        <li>${e("pie")}<span>Patrimônio, saldos e investimentos consolidados — sem contar nada duas vezes.</span></li>
        <li>${e("receipt")}<span>Fatura atual, previsão de fechamento e gastos futuros dos cartões.</span></li>
        <li>${e("flow")}<span>Fluxo de caixa, saldo projetado e insights baseados só nos seus dados.</span></li>
        <li>${e("lock")}<span>Credenciais cifradas localmente. Nada é enviado a servidores do CashFlow.</span></li>
      </ul>
      <div class="stack-sm">
        <button type="button" class="btn btn--primary btn--lg btn--block" data-action="next">Começar${e("chevronRight")}</button>
        <button type="button" class="btn btn--secondary btn--lg btn--block" data-action="demo">${e("sparkle")}Começar no modo demonstração</button>
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-action="privacy" style="align-self:center">${e("shield")}Privacidade e segurança</button>`,1:()=>{const a=S(s.pass1);return l`
      ${g()}
      <span class="step-label">Passo 1 de 3</span>
      <h1>Configure sua conexão Pluggy.</h1>
      <div class="callout callout--good">${e("lock")}<div><strong>Suas credenciais permanecem neste navegador.</strong> As credenciais são configuradas e armazenadas localmente neste navegador. A plataforma não possui acesso ao seu Client Secret.</div></div>
      <details class="details">
        <summary>Onde encontro o Client ID e o Client Secret?</summary>
        <p class="muted">No <strong>Dashboard da Pluggy</strong> (dashboard.pluggy.ai) → <strong>Aplicações</strong> → sua aplicação. Para uso pessoal gratuito, conecte seus bancos no <strong>Meu Pluggy</strong> e vincule-os à aplicação pelo conector MeuPluggy.</p>
        <p class="muted">Recomendamos criar uma aplicação dedicada ao CashFlow, para poder revogar/rotacionar o Secret sem afetar outros usos.</p>
      </details>
      <form class="stack" data-form="credentials" novalidate autocomplete="off">
        <label class="field">
          <span class="field__label">Client ID</span>
          <input class="input" name="clientId" value="${s.clientId}" placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false" autocapitalize="off" required />
        </label>
        <label class="field">
          <span class="field__label">Client Secret</span>
          <span class="input-group input-group--action">
            ${e("key")}
            <input class="input" name="clientSecret" type="password" value="${s.clientSecret}" autocomplete="off" spellcheck="false" autocapitalize="off" required />
            <button type="button" class="icon-btn icon-btn--sm input-group__action" data-action="reveal" data-value="clientSecret" aria-label="Mostrar/ocultar Client Secret">${e("eye")}</button>
          </span>
          <span class="field__hint">Depois de salvo, o Secret nunca mais é exibido.</span>
        </label>
        <fieldset class="radio-cards" style="border:0;padding:0;margin:0">
          <legend class="field__label" style="margin-bottom:8px">Como guardar</legend>
          <label class="radio-card"><input type="radio" name="storage" value="passphrase" ${d==="passphrase"?"checked":""} data-action="storage" />
            <div><strong>Salvar cifrado neste navegador (recomendado)</strong><span>AES-256 com chave derivada de uma senha local que só você conhece.</span></div></label>
          <label class="radio-card"><input type="radio" name="storage" value="session" ${d==="session"?"checked":""} data-action="storage" />
            <div><strong>Usar somente nesta sessão</strong><span>Nada é salvo: ao fechar ou recarregar a aba, credenciais e dados somem.</span></div></label>
        </fieldset>
        ${d==="passphrase"?l`<label class="field">
              <span class="field__label">Senha local</span>
              <input class="input" name="pass1" type="password" value="${s.pass1}" autocomplete="new-password" minlength="${m.security.minPassphraseLength}" />
              <span class="strength" data-score="${a.score}" aria-live="polite"><i></i><i></i><i></i><i></i><span>${s.pass1?a.label:""}</span></span>
              <span class="field__hint">Mínimo de ${m.security.minPassphraseLength} caracteres. Não há como recuperá-la: se esquecer, será preciso apagar os dados locais e configurar de novo.</span>
            </label>
            <label class="field">
              <span class="field__label">Confirme a senha local</span>
              <input class="input" name="pass2" type="password" value="${s.pass2}" autocomplete="new-password" />
            </label>`:""}
        ${o?l`<div class="callout callout--danger" role="alert">${e("alert")}<div>${o}</div></div>`:""}
        ${p?l`<p class="row muted" role="status">${e("refresh","spin")}<span>${p}</span></p>`:""}
        <div class="row wrap">
          <button type="button" class="btn btn--ghost" data-action="back">${e("chevronLeft")}Voltar</button>
          <button type="submit" class="btn btn--primary grow" ${c?"disabled":""}>${e("shield")}Testar conexão e salvar</button>
        </div>
      </form>`},2:()=>{const a=b.state;return l`
      ${g()}
      <span class="step-label">Passo 2 de 3</span>
      <h1>Conecte suas instituições.</h1>
      <div class="callout callout--good">${e("check")}<div><strong>Conexão com a Pluggy funcionando.</strong> Credenciais ${a.connection.vaultMode==="session"?"mantidas só nesta sessão":"salvas e cifradas neste navegador"}.</div></div>
      <div class="option-card">
        <div class="row">${e("plug")}<strong>Pluggy Connect</strong></div>
        <p class="muted">Widget oficial da Pluggy para conectar um banco.</p>
        <label class="check"><input type="checkbox" data-action="sandbox" ${a.preferences.includeSandbox?"checked":""} /> Incluir conectores de teste (sandbox)</label>
        <button type="button" class="btn btn--primary" data-action="connect" ${c?"disabled":""}>${e("plus")}Abrir Pluggy Connect</button>
      </div>
      <div class="option-card">
        <div class="row">${e("link")}<strong>Tenho um Item ID (Meu Pluggy)</strong></div>
        <label class="field"><span class="field__label">Item ID</span><input class="input" name="itemId" placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false" /></label>
        <button type="button" class="btn btn--secondary" data-action="add-item" ${c?"disabled":""}>${e("check")}Adicionar Item</button>
      </div>
      ${o?l`<div class="callout callout--danger" role="alert">${e("alert")}<div>${o}</div></div>`:""}
      ${p||a.sync.progress?l`<p class="row muted" role="status">${e("refresh","spin")}<span>${p??a.sync.progress}</span></p>`:""}
      ${a.itemIds.length?l`<p class="badge badge--good" style="align-self:flex-start">${e("check")}${a.itemIds.length} instituição(ões) adicionada(s)</p>`:""}
      <div class="row wrap">
        <button type="button" class="btn ${a.itemIds.length?"btn--primary":"btn--ghost"} grow" data-action="next">${a.itemIds.length?"Continuar":"Fazer isso depois"}${e("chevronRight")}</button>
      </div>`},3:()=>l`
      ${g()}
      <span class="step-label">Tudo certo</span>
      <h1>Pronto. Seus dados financeiros estarão organizados em um só lugar.</h1>
      <ul class="feature-list">
        <li>${e("refresh")}<span>Use "Atualizar agora" para buscar dados novos na Pluggy.</span></li>
        <li>${e("layout")}<span>Personalize o dashboard: mova, redimensione, oculte e fixe cards.</span></li>
        <li>${e("lock")}<span>O app bloqueia sozinho após ${b.state.preferences.autoLockMinutes} minutos sem uso.</span></li>
      </ul>
      <button type="button" class="btn btn--primary btn--lg btn--block" data-action="finish">Ir para o Dashboard${e("chevronRight")}</button>`},i=()=>{A(n,l`${j()}<div class="screen">${B()}<main class="screen__main" id="main"><div class="screen__panel">${w[r]()}</div></main></div>`);const a=n.querySelector(r===1?'input[name="clientId"]':"h1");a&&r!==0&&(a.tagName==="H1"&&a.setAttribute("tabindex","-1"),a.focus({preventScroll:!0}))},u=()=>{const a=n.querySelector('[data-form="credentials"]');if(!a)return;const t=new FormData(a);s.clientId=String(t.get("clientId")??"").trim(),s.clientSecret=String(t.get("clientSecret")??"").trim(),s.pass1=String(t.get("pass1")??""),s.pass2=String(t.get("pass2")??"")},I=async()=>{if(u(),o=E({clientId:s.clientId,clientSecret:s.clientSecret}),!o&&d==="passphrase"&&(s.pass1.length<m.security.minPassphraseLength?o=`A senha local precisa ter pelo menos ${m.security.minPassphraseLength} caracteres.`:s.pass1!==s.pass2&&(o="As senhas locais não conferem.")),o){i();return}c=!0,p="Formato válido. Testando autenticação na Pluggy…",i();try{await q({clientId:s.clientId,clientSecret:s.clientSecret,passphrase:d==="passphrase"?s.pass1:null},{enterApp:!1}),s.clientSecret="",s.pass1="",s.pass2="",r=2,o=null}catch(a){o=(a instanceof Error&&a.name!=="PluggyError"?a:k(a)).message,s.clientSecret=""}finally{c=!1,p=null,i()}},_=$(n,"click",{next:()=>{u(),o=null,r=Math.min(3,r+1),i()},back:()=>{u(),o=null,r=Math.max(0,r-1),i()},demo:()=>N(),privacy:()=>{T({title:"Privacidade e segurança",wide:!0,body:R()})},"cycle-theme":a=>{D(a.dataset.value),u(),i()},reveal:a=>{const t=n.querySelector(`input[name="${a.dataset.value}"]`);t&&(t.type=t.type==="password"?"text":"password")},storage:a=>{u(),d=a.value,i()},connect:async()=>{o=null,c=!0,i();const a=await M();c=!1,a&&z("success","Instituição adicionada"),i()},"add-item":async()=>{const a=n.querySelector('input[name="itemId"]');o=null,c=!0,p="Validando o Item na Pluggy…",i();try{await L(a?.value??"")}catch(t){o=t instanceof Error&&t.name!=="PluggyError"?t.message:k(t).message}finally{c=!1,p=null,i()}},finish:()=>F()}),P=$(n,"change",{sandbox:a=>{O({includeSandbox:a.checked})}}),f=a=>{a.target.matches('[data-form="credentials"]')&&(a.preventDefault(),c||I())},h=a=>{const t=a.target;if(t.name==="pass1"){const y=S(t.value),v=n.querySelector(".strength");v&&(v.dataset.score=String(y.score),v.querySelector("span").textContent=t.value?y.label:"")}};n.addEventListener("submit",f),n.addEventListener("input",h);const C=b.subscribe((a,t)=>{r===2&&(a.sync.progress!==t.sync.progress||a.itemIds!==t.itemIds)&&i()});return i(),()=>{_(),P(),C(),n.removeEventListener("submit",f),n.removeEventListener("input",h)}}export{G as mountOnboarding,B as screenAside,j as themeFloat};
