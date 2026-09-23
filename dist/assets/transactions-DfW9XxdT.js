import{T as U,K as z,U as ra,W as V,I as G,X as ia,A,d as la,b as x,Y as ca,o as H,h as c,i as $,Z as Y,H as D,$ as P,a0 as I,a1 as W,a2 as X,a3 as da,a4 as Z,c as ua,a5 as pa,r as C,x as J}from"./index-CkDdCF5O.js";import{c as ma,j as L,r as T,w as S,s as Q,a as ga,m as aa,g as ea,l as fa,p as ba}from"./shared-FnK0_Mov.js";const ta=()=>({q:"",period:"90",from:null,to:null,account:"",card:"",institution:"",category:"",type:"all",min:null,max:null});function ya(d,s){const t=d.type==="pending"?null:s;switch(d.period){case"month":return{from:V(s),to:G(s)};case"prev":{const u=ra(V(s),-1);return{from:u,to:G(u)}}case"30":return{from:z(s,-29),to:t};case"90":return{from:z(s,-89),to:t};case"365":return{from:z(s,-364),to:t};case"custom":return{from:d.from,to:d.to};default:return{from:null,to:null}}}function va(d,s,t,u=()=>""){const{from:g,to:f}=ya(s,t),p=U(s.q.trim()),y=p?p.split(/\s+/):[];return d.filter(i=>{if(g&&i.date<g||f&&i.date>f||s.account&&i.accountId!==s.account||s.card&&i.cardId!==s.card||s.institution&&i.institution!==s.institution||s.category&&i.category!==s.category)return!1;const _=Math.abs(i.amount);if(s.min!==null&&_<s.min||s.max!==null&&_>s.max)return!1;switch(s.type){case"in":if(!(i.amount>0&&i.kind!=="internal_transfer"&&i.kind!=="card_payment"))return!1;break;case"out":if(!(i.amount<0&&i.kind!=="internal_transfer"&&i.kind!=="card_payment"))return!1;break;case"internal":if(i.kind!=="internal_transfer")return!1;break;case"card_payment":if(i.kind!=="card_payment")return!1;break;case"investment":if(i.kind!=="investment")return!1;break;case"pending":if(i.status!=="pending")return!1;break;case"ignored":if(!i.ignored)return!1;break}if(y.length){const v=U(`${i.description} ${i.merchant??""} ${i.subcategory??""} ${i.providerCategory??""} ${u(i)}`);if(!y.every(E=>v.includes(E)))return!1}return!0})}function $a(d,s,t,u){const g=t==="asc"?1:-1,f=[...d];return f.sort((p,y)=>{let i=0;return s==="date"?i=p.date.localeCompare(y.date)||p.id.localeCompare(y.id):s==="amount"?i=p.amount-y.amount:s==="description"?i=p.description.localeCompare(y.description,"pt-BR"):i=u(p.category).localeCompare(u(y.category),"pt-BR"),i*g}),f}function ha(d,s="BRL"){let t=0,u=0,g=0;for(const p of d){if(p.currency!==s){g++;continue}p.amount>=0?t+=p.amount:u+=-p.amount}const f=p=>Math.round(p*100)/100;return{count:d.length,inflow:f(t),outflow:f(u),net:f(t-u),otherCurrency:g}}function _a(d,s,t){const u=Math.max(1,Math.ceil(d.length/t)),g=Math.min(Math.max(1,s),u);return{items:d.slice((g-1)*t,g*t),page:g,pages:u}}const ka=[["all","Todos"],["in","Entradas"],["out","Saídas"],["internal","Transferências próprias"],["card_payment","Pagamento de fatura"],["investment","Investimentos"],["pending","Pendentes/futuras"],["ignored","Ignoradas nos cálculos"]],xa=[["month","Este mês"],["prev","Mês passado"],["30","Últimos 30 dias"],["90","Últimos 90 dias"],["365","Últimos 12 meses"],["all","Tudo (inclui futuras)"],["custom","Personalizado"]];function Ca(d){const s=d.root,t=ta();d.params.get("card")&&(t.card=d.params.get("card")),d.params.get("account")&&(t.account=d.params.get("account")),d.params.get("category")&&(t.category=d.params.get("category")),(t.card||t.account)&&(t.period="365");let u="date",g="desc",f=1,p=A.ui.defaultPageSize;const y=new Map,i=()=>{y.clear();for(const e of x.state.dataset.accounts)y.set(e.id,e.name);for(const e of x.state.dataset.cards)y.set(e.id,e.name)},_=e=>y.get(e.accountId??e.cardId??"")??e.institution,v=(e,a,n)=>c`<option value="${e}" ${e===n?"selected":""}>${a}</option>`,E=()=>{const e=x.state;if(e.mode==="real"&&!fa(e))return C(s,c`<div class="page"><div class="card">${ba(e)}</div></div>`),!1;i();const a=e.dataset,n=Array.from(new Set(a.transactions.map(r=>r.institution))).sort(),m=e.categorization.rules.length;return C(s,c`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">Categorias e ajustes feitos aqui ficam somente neste navegador. Transferências próprias, pagamentos de fatura e aplicações não contam como receita ou despesa.</p>
          <button type="button" class="btn btn--secondary btn--sm" data-action="rules">${$("settings")}Regras de categorização${m?` (${m})`:""}</button>
        </div>
        <section class="card stack" aria-label="Filtros">
          <div class="filter-bar">
            <label class="input-group" style="flex:1 1 260px">
              ${$("search")}
              <span class="sr-only">Buscar transações</span>
              <input class="input" type="search" data-filter="q" placeholder="Buscar por descrição, estabelecimento, categoria…" value="${t.q}" autocomplete="off" />
            </label>
            <label class="field" style="flex:0 1 220px"><span class="sr-only">Período</span>
              <select class="select" data-filter="period">${xa.map(([r,l])=>v(r,l,t.period))}</select>
            </label>
            <button type="button" class="btn btn--ghost btn--sm" data-action="toggle-filters" aria-expanded="false" aria-controls="more-filters">${$("filter")}Mais filtros</button>
            <button type="button" class="btn btn--ghost btn--sm" data-action="clear-filters">${$("x")}Limpar</button>
          </div>
          <div class="filters" id="more-filters" data-more-filters ${t.card||t.account||t.category?"":"hidden"}>
            <label class="field" data-custom-range ${t.period==="custom"?"":"hidden"}><span class="field__label">De</span><input class="input input--sm" type="date" data-filter="from" value="${t.from??""}" /></label>
            <label class="field" data-custom-range ${t.period==="custom"?"":"hidden"}><span class="field__label">Até</span><input class="input input--sm" type="date" data-filter="to" value="${t.to??""}" /></label>
            <label class="field"><span class="field__label">Conta</span>
              <select class="select select--sm" data-filter="account">${v("","Todas",t.account)}${a.accounts.map(r=>v(r.id,`${r.name} · ${r.institution}`,t.account))}</select></label>
            <label class="field"><span class="field__label">Cartão</span>
              <select class="select select--sm" data-filter="card">${v("","Todos",t.card)}${a.cards.map(r=>v(r.id,`${r.name} · ${r.institution}`,t.card))}</select></label>
            <label class="field"><span class="field__label">Instituição</span>
              <select class="select select--sm" data-filter="institution">${v("","Todas",t.institution)}${n.map(r=>v(r,r,t.institution))}</select></label>
            <label class="field"><span class="field__label">Categoria</span>
              <select class="select select--sm" data-filter="category">${v("","Todas",t.category)}${I.map(r=>v(r.id,r.label,t.category))}</select></label>
            <label class="field"><span class="field__label">Tipo</span>
              <select class="select select--sm" data-filter="type">${ka.map(([r,l])=>v(r,l,t.type))}</select></label>
            <label class="field"><span class="field__label">Valor mínimo (R$)</span><input class="input input--sm" type="number" inputmode="decimal" min="0" step="0.01" data-filter="min" value="${t.min??""}" /></label>
            <label class="field"><span class="field__label">Valor máximo (R$)</span><input class="input input--sm" type="number" inputmode="decimal" min="0" step="0.01" data-filter="max" value="${t.max??""}" /></label>
          </div>
        </section>
        <div data-results></div>
      </div>`),!0},w=(e,a,n="")=>c`<th scope="col" class="${n}" aria-sort="${u===e?g==="asc"?"ascending":"descending":"none"}">
      <button type="button" class="th-sort" data-action="sort" data-value="${e}" data-active="${u===e}">${a}${$(u===e?g==="asc"?"chevronUp":"chevronDown":"sort")}</button>
    </th>`,M=e=>c`${e.installment?c`<span class="badge">${e.installment.number}/${e.installment.total}</span>`:""}${e.status==="pending"?ea(e.date>L().today?"Futura":"Pendente","warn"):""}${e.ignored?ea("Ignorada","outline"):""}`,k=()=>{const e=s.querySelector("[data-results]");if(!e)return;const a=L(),n=va(a.transactions,t,a.today,o=>`${_(o)} ${S(o.category)}`),m=$a(n,u,g,S),r=ha(m),l=_a(m,f,p);if(f=l.page,!m.length){C(e,c`<div class="card">${Q({kind:"empty",title:"Nenhuma transação encontrada",text:"Ajuste a busca ou os filtros.",action:{label:"Limpar filtros",action:"clear-filters",icon:"x",primary:!1},compact:!0})}</div>`);return}const h=[];for(const o of l.items){const b=h[h.length-1];b&&b.date===o.date&&u==="date"?b.items.push(o):h.push({date:o.date,items:[o]})}C(e,c`<div class="summary-strip" role="status" aria-live="polite" style="margin-bottom:12px">
          <span><strong>${r.count}</strong> transações</span>
          <span>Entradas <strong class="money pos">${J(r.inflow)}</strong></span>
          <span>Saídas <strong class="money neg">${J(r.outflow)}</strong></span>
          <span>Resultado <strong class="money">${P(r.net)}</strong></span>
          ${r.otherCurrency?c`<span>${r.otherCurrency} em outras moedas (fora das somas)</span>`:""}
        </div>
        <section class="card card--flush">
          <div class="tx-table-view table-wrap">
            <table class="table">
              <caption class="sr-only">Transações filtradas</caption>
              <thead><tr>
                ${w("date","Data")}
                ${w("description","Descrição")}
                <th scope="col">Conta</th>
                ${w("category","Categoria")}
                <th scope="col">Tipo</th>
                ${w("amount","Valor","num")}
              </tr></thead>
              <tbody>
                ${l.items.map(o=>c`<tr data-clickable data-action="open-tx" data-value="${o.id}" tabindex="0" aria-label="${o.description}, ${P(o.amount,o.currency)}">
                    <td class="nowrap num">${D(o.date)}</td>
                    <td><div class="tx-desc">${T(o.category)}<div class="tx-desc__text"><strong title="${o.description}">${o.description}</strong><span class="row" style="gap:6px">${o.subcategory??o.providerCategory??""}${M(o)}</span></div></div></td>
                    <td><div class="tx-desc__text"><span style="font-size:13px;color:var(--text)">${_(o)}</span><span>${o.institution}</span></div></td>
                    <td>${S(o.category)}${o.userCategorized?c` <span class="badge badge--accent" title="Alterada por você">editada</span>`:""}</td>
                    <td><span class="muted" style="font-size:12px">${Y[o.kind]}</span></td>
                    <td class="num">${aa(o.amount,{currency:o.currency,signed:!0,tone:!0})}</td>
                  </tr>`)}
              </tbody>
            </table>
          </div>
          <div class="tx-list-view">
            ${h.map(o=>c`<div class="day-head">${D(o.date)}</div>
                <div class="list">${o.items.map(b=>c`<button type="button" class="list-item" data-action="open-tx" data-value="${b.id}">
                    ${T(b.category)}
                    <span class="list-item__main"><span class="list-item__title">${b.description}</span><span class="list-item__sub">${S(b.category)} · ${_(b)}</span></span>
                    <span class="list-item__end">${aa(b.amount,{currency:b.currency,signed:!0,tone:!0})}<span class="row" style="gap:4px">${M(b)}</span></span>
                  </button>`)}</div>`)}
          </div>
          <div class="pagination">
            <span>Página ${l.page} de ${l.pages} · ${m.length} resultado(s)</span>
            <div class="row">
              <label class="row" style="gap:6px"><span>Por página</span>
                <select class="select select--sm" data-filter="pageSize" style="width:auto">${[25,50,100].map(o=>v(String(o),String(o),String(p)))}</select>
              </label>
              <button type="button" class="icon-btn icon-btn--sm icon-btn--outline" data-action="page" data-value="${l.page-1}" aria-label="Página anterior" ${l.page<=1?"disabled":""}>${$("chevronLeft")}</button>
              <button type="button" class="icon-btn icon-btn--sm icon-btn--outline" data-action="page" data-value="${l.page+1}" aria-label="Próxima página" ${l.page>=l.pages?"disabled":""}>${$("chevronRight")}</button>
            </div>
          </div>
        </section>`)},R=()=>{E()&&k()},N=e=>{const a=e.dataset.filter,n=e.value;switch(a){case"q":t.q=n;break;case"period":if(t.period=n,s.querySelectorAll("[data-custom-range]").forEach(m=>m.hidden=n!=="custom"),n==="custom"){const m=s.querySelector("[data-more-filters]");m&&(m.hidden=!1)}break;case"from":t.from=n||null;break;case"to":t.to=n||null;break;case"min":t.min=n===""?null:Math.abs(Number(n));break;case"max":t.max=n===""?null:Math.abs(Number(n));break;case"pageSize":p=Number(n)||A.ui.defaultPageSize;break;case"account":case"card":case"institution":case"category":case"type":t[a]=n;break}f=1},O=ia(()=>k(),A.ui.searchDebounceMs),B=e=>{const a=e.target;a.dataset.filter&&(N(a),(a.dataset.filter==="q"||a.dataset.filter==="min"||a.dataset.filter==="max")&&O())},j=e=>{const a=e.target;!a.dataset.filter||a.dataset.filter==="q"||(N(a),k())},F=e=>{const a=e.target.closest('tr[data-action="open-tx"]');a&&(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),K(a.dataset.value))};s.addEventListener("input",B),s.addEventListener("change",j),s.addEventListener("keydown",F);const sa=la(s,"click",{...ma,sort:e=>{const a=e.dataset.value;u===a?g=g==="asc"?"desc":"asc":(u=a,g=a==="description"||a==="category"?"asc":"desc"),k()},page:e=>{f=Number(e.dataset.value),k(),s.querySelector("[data-results]")?.scrollIntoView({block:"start",behavior:"smooth"})},"toggle-filters":e=>{const a=s.querySelector("[data-more-filters]");a&&(a.hidden=!a.hidden,e.setAttribute("aria-expanded",String(!a.hidden)))},"clear-filters":()=>{Object.assign(t,ta()),f=1,R()},"open-tx":e=>K(e.dataset.value),rules:()=>q()});function K(e){const a=L().transactions.find(l=>l.id===e);if(!a)return;const n=x.state.categorization,m=Array.from(new Set([...ca[a.category]??[],...n.customSubcategories[a.category]??[]])),r=H({title:"Transação",body:c`
        <div class="row">${T(a.category)}<div class="stack-sm" style="gap:2px;min-width:0"><strong>${a.description}</strong><span class="muted" style="font-size:13px">${D(a.date)} · ${_(a)} · ${a.institution}</span></div></div>
        <div class="figure"><div class="figure__value ${a.amount<0?"neg":"pos"}"><span class="money">${P(a.amount,a.currency)}</span></div></div>
        <div class="kv-list">
          <div class="kv"><span>Tipo</span><strong>${Y[a.kind]}</strong></div>
          <div class="kv"><span>Situação</span><strong>${a.status==="pending"?"Pendente/futura":"Lançada"}</strong></div>
          ${a.installment?c`<div class="kv"><span>Parcela</span><strong>${a.installment.number} de ${a.installment.total}</strong></div>`:""}
          ${a.providerCategory?c`<div class="kv"><span>Categoria da Pluggy</span><strong>${a.providerCategory}</strong></div>`:""}
          ${a.merchant?c`<div class="kv"><span>Estabelecimento</span><strong>${a.merchant}</strong></div>`:""}
          ${a.paymentMethod?c`<div class="kv"><span>Meio de pagamento</span><strong>${a.paymentMethod}</strong></div>`:""}
        </div>
        <div class="divider"></div>
        <form class="stack" data-cat-form>
          <label class="field"><span class="field__label">Categoria</span>
            <select class="select" name="category">${I.map(l=>c`<option value="${l.id}" ${l.id===a.category?"selected":""}>${l.label}</option>`)}</select></label>
          <label class="field"><span class="field__label">Subcategoria</span>
            <input class="input" name="subcategory" list="subcat-list" value="${a.subcategory??""}" maxlength="40" placeholder="Opcional" autocomplete="off" />
            <datalist id="subcat-list">${m.map(l=>c`<option value="${l}"></option>`)}</datalist>
            <span class="field__hint">Digite um nome novo para criar uma subcategoria.</span></label>
          <label class="switch"><input type="checkbox" name="ignored" ${a.ignored?"checked":""} /><span class="switch__track"></span><span>Ignorar nos cálculos (receitas, despesas e fluxo)</span></label>
          <label class="check"><input type="checkbox" name="rule" /> Aplicar também a futuras transações com descrição semelhante (“${W(a.description)||a.description}”)</label>
        </form>`,footer:c`${a.userCategorized||n.overrides[a.id]?c`<button type="button" class="btn btn--ghost" data-reset>Desfazer ajustes</button>`:""}
        <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
        <button type="button" class="btn btn--primary" data-save>${$("check")}Salvar</button>`});r.el.querySelector("[data-reset]")?.addEventListener("click",async()=>{await X(a.id,null),r.close()}),r.el.querySelector("[data-save]").addEventListener("click",async()=>{const l=new FormData(r.el.querySelector("[data-cat-form]")),h=l.get("category"),o=String(l.get("subcategory")??"").trim()||null,b=l.get("ignored")==="on";if(o&&await da(h,o),await X(a.id,{category:h,subcategory:o,ignored:b}),l.get("rule")==="on"){const oa=W(a.description)||a.description.slice(0,30);await Z({contains:oa,category:h,subcategory:o})}r.close()})}function q(){const e=x.state.categorization.rules,a=H({title:"Regras de categorização",wide:!0,body:c`<p class="muted">Regras locais: transações cuja descrição contém o texto recebem a categoria escolhida. Ajustes individuais têm prioridade.</p>
        ${e.length?c`<div class="list">${e.map(n=>c`<div class="list-item">${T(n.category)}<span class="list-item__main"><span class="list-item__title">“${n.contains}”</span><span class="list-item__sub">${S(n.category)}${n.subcategory?` · ${n.subcategory}`:""}</span></span>
                <button type="button" class="icon-btn icon-btn--sm" data-remove-rule="${n.id}" aria-label="Remover regra ${n.contains}">${$("trash")}</button></div>`)}</div>`:Q({kind:"empty",title:"Nenhuma regra ainda",text:"Crie regras ao editar uma transação.",compact:!0})}
        <form class="filters" data-rule-form style="align-items:end">
          <label class="field"><span class="field__label">Descrição contém</span><input class="input input--sm" name="contains" required maxlength="60" /></label>
          <label class="field"><span class="field__label">Categoria</span><select class="select select--sm" name="category">${I.map(n=>c`<option value="${n.id}">${n.label}</option>`)}</select></label>
          <label class="field"><span class="field__label">Subcategoria</span><input class="input input--sm" name="subcategory" maxlength="40" /></label>
          <button type="submit" class="btn btn--secondary btn--sm">${$("plus")}Adicionar regra</button>
        </form>`});a.el.querySelectorAll("[data-remove-rule]").forEach(n=>n.addEventListener("click",async()=>{await ua({title:"Remover regra?",message:"As transações voltam à categoria original (ajustes individuais são mantidos).",confirmLabel:"Remover",danger:!0})&&(await pa(n.dataset.removeRule),a.close(),q())})),a.el.querySelector("[data-rule-form]").addEventListener("submit",async n=>{n.preventDefault();const m=new FormData(n.target),r=String(m.get("contains")??"").trim();r&&(await Z({contains:r,category:m.get("category"),subcategory:String(m.get("subcategory")??"").trim()||null}),a.close(),q())})}const na=ga((e,a)=>{if(e.categorization!==a.categorization&&e.dataset===a.dataset){k();const n=s.querySelector('[data-action="rules"]');n&&(n.lastChild.textContent=`Regras de categorização${e.categorization.rules.length?` (${e.categorization.rules.length})`:""}`)}else R()});return R(),()=>{sa(),na(),O.cancel(),s.removeEventListener("input",B),s.removeEventListener("change",j),s.removeEventListener("keydown",F)}}export{Ca as mount};
