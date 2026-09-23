import{as as U,d as q,c as T,ak as O,j,au as F,av as M,b as x,r as w,h as o,aw as N,K as H,i as c,x as m,H as J,ar as K,y as h,M as V,D as X,J as Y}from"./index-CkDdCF5O.js";import{g as u,c as G,o as Q,a as W,l as Z,p as aa,j as ta,f as b,i as ea,q as sa,t as na,e as oa,m as k,n as ia,x as ra,b as ca}from"./shared-FnK0_Mov.js";const da={checking:"Conta corrente",savings:"Poupança",other:"Conta"};function la(d,r){if(r)return u("Sincronizando","info","refresh");if(!d)return u("Aguardando sincronização","neutral","clock");switch(d.syncState){case"syncing":return u("Sincronizando","info","refresh");case"error":return u("Erro na sincronização","bad","alert");case"action_required":return u("Reconexão necessária","warn","alert");default:return u(d.lastUpdatedAt?`Atualizado ${U(d.lastUpdatedAt)}`:"Conectado","good","check")}}function va(d){const r=d.root;let v=90;const p=()=>{const t=x.state;if(t.mode==="real"&&!Z(t)&&!t.itemIds.length){w(r,o`<div class="page"><div class="card">${aa(t)}</div></div>`);return}const i=ta(),n=t.dataset,g=t.mode==="demo",z=n.accounts.filter(a=>a.type==="checking"&&a.currency==="BRL").reduce((a,e)=>a+e.balance,0),C=n.accounts.filter(a=>a.type==="savings"&&a.currency==="BRL").reduce((a,e)=>a+e.balance,0),R=n.accounts.reduce((a,e)=>a+(e.overdraftUsed??0),0),f=N(n.accounts,i.transactions,H(i.today,-v),i.today),A=g?n.items.map(a=>a.id):Array.from(new Set([...t.itemIds,...n.items.map(a=>a.id)])),P=t.sync.status==="syncing";w(r,o`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">Somente contas bancárias (corrente e poupança). Investimentos, limites de cartão e faturas ficam nas respectivas páginas.</p>
          ${t.mode==="real"?o`<button type="button" class="btn btn--primary btn--sm" data-action="add-institution">${c("plus")}Adicionar instituição</button>`:""}
        </div>

        <div class="kpi-grid">
          <div class="card"><div class="figure"><span class="figure__label">Saldo em contas</span>${b(i.totalBalance.base)}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Contas correntes</span>${b(z,"md")}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Poupanças</span>${b(C,"md")}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Cheque especial utilizado ${ea("Informado pela instituição (overdraftUsedLimit). Saldo negativo também é tratado como dívida no patrimônio.")}</span>${b(R,"md")}</div></div>
        </div>
        ${Object.keys(i.totalBalance.others).length?o`<div class="callout callout--info">${c("info")}<div>Contas em outras moedas não entram no total em reais: ${Object.entries(i.totalBalance.others).map(([a,e])=>m(e,a)).join(" · ")}.</div></div>`:""}

        <section class="card">
          <div class="card__head">
            <div class="stack-sm">
              <div class="card__title card__title--lg">Evolução do saldo em contas</div>
              <span class="muted" style="font-size:13px">Reconstruída a partir das transações lançadas (saldo atual − movimentações posteriores).</span>
            </div>
            <div class="row wrap">${sa("range",[{value:"30",label:"30 dias"},{value:"90",label:"90 dias"},{value:"180",label:"180 dias"}],String(v),"Período")}${na("acc-hist")}</div>
          </div>
          ${n.accounts.length?oa("acc-hist",240,`Saldo total das contas nos últimos ${v} dias`,{caption:"Saldo diário reconstruído",headers:["Data","Saldo"],rows:f.filter((a,e)=>e%7===0||e===f.length-1).map(a=>[J(a.date),k(a.balance)])}):ia("Nenhuma conta bancária")}
        </section>

        <section class="section">
          <div class="section__head"><h2 class="section__title">Instituições</h2><span class="muted" style="font-size:13px">${A.length} conectada(s)</span></div>
          ${A.map(a=>{const e=n.items.find(s=>s.id===a)??null,$=n.accounts.filter(s=>s.itemId===a),B=n.cards.filter(s=>s.itemId===a).length,E=n.investments.filter(s=>s.itemId===a).length,y=e?.institution.name??"Instituição (aguardando dados)";return o`<article class="card card--flush inst-group">
              <div class="inst-group__head">
                <div class="inst-group__title">
                  ${ra(e?.institution??{name:y,imageUrl:null,primaryColor:null})}
                  <div class="stack-sm" style="gap:2px;min-width:0">
                    <strong class="truncate">${y}</strong>
                    <span class="muted" style="font-size:12px">${$.length} conta(s) · ${B} cartão(ões) · ${E} investimento(s)${e?.institution.isOpenFinance?" · Open Finance":""}</span>
                  </div>
                </div>
                <div class="row wrap">
                  ${la(e,P)}
                  ${g?"":o`<div class="menu-wrap">
                        <button type="button" class="icon-btn icon-btn--sm icon-btn--outline" data-action="item-menu" data-value="${a}" aria-haspopup="menu" aria-label="Ações para ${y}">${c("more")}</button>
                        <div class="menu" role="menu" data-item-menu="${a}">
                          <button type="button" class="menu__item" role="menuitem" data-action="item-sync" data-value="${a}">${c("refresh")}Atualizar dados</button>
                          <button type="button" class="menu__item" role="menuitem" data-action="item-refresh" data-value="${a}">${c("zap")}Solicitar coleta na instituição</button>
                          <button type="button" class="menu__item" role="menuitem" data-action="item-reconnect" data-value="${a}">${c("plug")}Reconectar</button>
                          <div class="menu__sep"></div>
                          <button type="button" class="menu__item" role="menuitem" data-action="item-remove" data-value="${a}">${c("trash")}Remover deste navegador</button>
                        </div>
                      </div>`}
                </div>
              </div>
              ${e?.message?o`<div class="callout ${e.syncState==="updated"?"callout--info":"callout--warn"}" style="margin:16px 24px 0">${c("alert")}<div>${e.message}</div></div>`:""}
              ${$.length?$.map(s=>o`<div class="account-row">
                      <div class="stack-sm" style="gap:4px;min-width:0">
                        <strong class="truncate">${s.name}</strong>
                        <div class="account-row__meta">
                          <span>${da[s.type]}</span>
                          ${s.lastDigits?o`<span class="sensitive">•••• ${s.lastDigits}</span>`:""}
                          ${s.currency!=="BRL"?o`<span>${s.currency}</span>`:""}
                          ${s.overdraftLimit?o`<span>Cheque especial: ${m(s.overdraftUsed??0)} de ${m(s.overdraftLimit)}</span>`:""}
                          ${s.reservedTotal?o`<span>Saldo reservado (informativo): ${m(s.reservedTotal)}</span>`:""}
                        </div>
                      </div>
                      <div class="account-row__value ${s.balance<0?"neg":""}">${k(s.balance,{currency:s.currency})}</div>
                    </div>`):o`<div class="account-row"><span class="muted">${e?"Nenhuma conta bancária neste item.":'Use "Atualizar agora" para baixar os dados.'}</span></div>`}
              <div class="card__foot" style="padding:12px 24px;border-top:1px solid var(--border)">
                <span>${e?.lastUpdatedAt?`Coleta da Pluggy: ${K(e.lastUpdatedAt)}`:"Sem coleta registrada"}</span>
                <span>${e?.nextAutoSyncAt?`Próxima coleta automática: ${h(e.nextAutoSyncAt.slice(0,10))}`:e?.consentExpiresAt?`Consentimento até ${h(e.consentExpiresAt.slice(0,10))}`:""}</span>
              </div>
            </article>`})}
        </section>
      </div>`),V(r,a=>m(a));const S=ca(r,"acc-hist");S&&X(S,Y(f.map(a=>h(a.date)),[{label:"Saldo em contas",data:f.map(a=>a.balance),colorIndex:1,fill:!0}],{maxTicksX:8,zeroLine:!0}))},l=()=>r.querySelectorAll("[data-item-menu]").forEach(t=>t.removeAttribute("data-open")),I=q(r,"click",{...G,"add-institution":()=>Q(),range:t=>{v=Number(t.dataset.value),p()},"item-menu":(t,i)=>{i.stopPropagation();const n=r.querySelector(`[data-item-menu="${t.dataset.value}"]`),g=n?.getAttribute("data-open")==="true";l(),n&&!g&&(n.setAttribute("data-open","true"),n.querySelector(".menu__item")?.focus())},"item-sync":t=>{l(),M({onlyItemId:t.dataset.value})},"item-refresh":t=>{l(),F(t.dataset.value)},"item-reconnect":t=>{l(),j(t.dataset.value)},"item-remove":async t=>{l(),await T({title:"Remover instituição deste navegador?",message:"Os dados desta instituição serão apagados do cache local. O item continua existindo na Pluggy — para revogar o acesso, remova-o no Dashboard da Pluggy ou no Meu Pluggy.",confirmLabel:"Remover",danger:!0})&&await O(t.dataset.value)}}),_=t=>{t.target.closest(".menu-wrap")||l()};document.addEventListener("click",_);const D=W(p),L=x.subscribe((t,i)=>{t.sync.status!==i.sync.status&&p()});return p(),()=>{I(),D(),L(),document.removeEventListener("click",_)}}export{la as itemStatusBadge,va as mount};
