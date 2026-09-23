import{d as M,a9 as V,k as U,b as X,r as P,h as c,C as J,aa as W,ab as Q,N as Y,O as Z,x as p,z as x,ac as R,y as D,K as _,H as g,i as y,ad as aa,M as ea,D as S,E as T,J as sa,ae as ta,W as na,U as ia,af as la,F as ra}from"./index-CkDdCF5O.js";import{c as oa,a as da,l as ca,p as pa,j as ma,q as F,f as A,i as ua,t as w,e as k,m as u,r as va,w as I,n as N,g as G,b as E}from"./shared-FnK0_Mov.js";const $={day:"Dia",week:"Semana",month:"Mês",year:"Ano"};function ga(m,e){switch(m){case"day":return{start:_(e,-29),end:e,label:"últimos 30 dias"};case"week":return{start:la(_(e,-77)),end:e,label:"últimas 12 semanas"};case"month":return{start:na(ia(e,-11)),end:e,label:"últimos 12 meses"};case"year":return{start:`${Number(e.slice(0,4))-2}-01-01`,end:e,label:"últimos 3 anos (histórico disponível)"}}}function B(m,e){return e==="month"?ra(m.slice(0,7)):e==="year"?m.slice(0,4):D(m)}function ba(m){const e=m.root;let l="month",d=30;const f=()=>{const s=X.state;if(s.mode==="real"&&!ca(s)){P(e,c`<div class="page"><div class="card">${pa(s)}</div></div>`);return}const t=ma(),i=ga(l,t.today),r=J(t.transactions,{granularity:l,start:i.start,end:i.end}),o=W(t.transactions,i.start,i.end,!1),b=R(o.income,o.expenses),v=Q(t.transactions,i.start,i.end),h=Y({today:t.today,days:d,transactions:t.transactions,billSummaries:t.bills,bills:s.dataset.bills,recurrences:t.recurrences,planned:s.planned,includeEstimates:s.preferences.includeEstimates}),n=Z(t.totalBalance.base,t.today,d,h);P(e,c`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">Receitas e despesas em regime de competência: compras no cartão contam na data da compra; pagamento de fatura, transferências próprias e aplicações não entram.</p>
          ${F("gran",Object.keys($).map(a=>({value:a,label:$[a]})),l,"Agrupar por")}
        </div>

        <div class="kpi-grid">
          <div class="card"><div class="figure"><span class="figure__label">Entradas · ${i.label}</span>${A(o.income,"md")}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Saídas</span>${A(o.expenses,"md")}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Saldo líquido</span><div class="figure__value figure__value--md ${o.net<0?"neg":""}"><span class="money">${p(o.net)}</span></div></div></div>
          <div class="card"><div class="figure"><span class="figure__label">Taxa de poupança ${ua("(Entradas − saídas) ÷ entradas no período.")}</span><div class="figure__value figure__value--md">${x(b)}</div></div></div>
        </div>

        <section class="card">
          <div class="card__head"><div class="card__title card__title--lg">Entradas, saídas e saldo líquido por ${$[l].toLowerCase()}</div>${w("cf-main")}</div>
          <div class="chart-legend">
            <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-1)"></span>Entradas</span>
            <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-2)"></span>Saídas</span>
            <span class="chart-legend__item"><span class="chart-legend__key is-line" style="--key:var(--series-3)"></span>Saldo líquido</span>
          </div>
          ${k("cf-main",300,`Entradas e saídas por ${$[l].toLowerCase()}`,{caption:"Fluxo de caixa",headers:["Período","Entradas","Saídas","Saldo líquido","Taxa de poupança"],rows:r.map(a=>[B(a.start,l),u(a.income),u(a.expenses),u(a.net,{signed:!0,tone:!0}),x(R(a.income,a.expenses))])})}
        </section>

        <section class="card">
          <div class="card__head"><div class="card__title card__title--lg">Gastos por categoria · ${i.label}</div>${v.length?w("cf-cats"):""}</div>
          ${v.length?k("cf-cats",Math.max(160,v.length*38),"Gastos por categoria",{caption:"Gastos por categoria",headers:["Categoria","Total","Participação","Transações"],rows:v.map(a=>[c`<span class="row">${va(a.category)}${I(a.category)}</span>`,u(a.total),x(a.share),String(a.count)])}):N("Sem despesas no período")}
        </section>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm">
              <div class="card__title card__title--lg">Saldo projetado</div>
              <span class="muted" style="font-size:13px">Saldo atual das contas + receitas previstas − despesas previstas − faturas (regime de caixa).</span>
            </div>
            <div class="row wrap">
              ${F("horizon",[7,15,30,60,90].map(a=>({value:String(a),label:`${a} dias`})),String(d),"Horizonte")}
            </div>
          </div>
          <label class="switch"><input type="checkbox" data-action="estimates" ${s.preferences.includeEstimates?"checked":""} /><span class="switch__track"></span><span>Incluir recorrências estimadas a partir do histórico</span></label>
          <div class="kpi-grid">
            <div class="figure"><span class="figure__label">Saldo atual</span><div class="figure__value figure__value--sm"><span class="money">${p(n.start)}</span></div></div>
            <div class="figure"><span class="figure__label">Receitas previstas</span><div class="figure__value figure__value--sm pos"><span class="money">+${p(n.income)}</span></div></div>
            <div class="figure"><span class="figure__label">Despesas previstas</span><div class="figure__value figure__value--sm neg"><span class="money">−${p(n.expenses)}</span></div></div>
            <div class="figure"><span class="figure__label">Faturas</span><div class="figure__value figure__value--sm neg"><span class="money">−${p(n.bills)}</span></div></div>
            <div class="figure"><span class="figure__label">Saldo estimado em ${D(_(t.today,d))}</span><div class="figure__value figure__value--sm ${n.end<0?"neg":""}"><span class="money">${p(n.end)}</span></div></div>
            <div class="figure"><span class="figure__label">Menor saldo</span><div class="figure__value figure__value--sm ${n.min<0?"neg":""}"><span class="money">${p(n.min)}</span></div><span class="muted" style="font-size:12px">em ${g(n.minDate)}</span></div>
          </div>
          <div class="row-between"><span class="card__title">Saldo atual → próximos dias</span>${w("cf-proj")}</div>
          ${k("cf-proj",240,`Projeção do saldo nos próximos ${d} dias`,{caption:"Saldo projetado",headers:["Data","Saldo projetado"],rows:n.series.filter((a,L)=>L%Math.max(1,Math.round(d/15))===0||L===n.series.length-1).map(a=>[g(a.date),u(a.balance)])})}
          ${n.min<0?c`<div class="callout callout--warn">${y("alert")}<div>A projeção indica saldo negativo em ${g(n.minDate)}. Considere os lançamentos abaixo.</div></div>`:""}
          <div class="card__title">Eventos considerados (${h.filter(a=>a.date>t.today&&a.date<=_(t.today,d)).length})</div>
          ${h.length?c`<div class="table-wrap"><table class="table"><caption class="sr-only">Eventos da projeção</caption>
                <thead><tr><th>Data</th><th>Descrição</th><th>Origem</th><th class="num">Valor</th></tr></thead>
                <tbody>${h.map(a=>c`<tr><td class="nowrap num">${g(a.date)}</td><td>${a.label}</td>
                    <td>${a.certainty==="estimated"?G(a.origin==="recurrence"?"Recorrência estimada":"Estimado","outline"):G(a.origin==="bill"?"Fatura":a.origin==="planned"?"Previsto por você":"Agendado",a.origin==="bill"?"warn":"neutral")}</td>
                    <td class="num">${u(a.amount,{signed:!0,tone:!0})}</td></tr>`)}</tbody></table></div>`:N("Nenhum evento futuro conhecido no horizonte")}
        </section>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm">
              <div class="card__title card__title--lg">Lançamentos previstos</div>
              <span class="muted" style="font-size:13px">Receitas e despesas que você sabe que vão acontecer (ficam somente neste navegador${s.mode==="demo"?" — no modo demonstração, apenas em memória":""}).</span>
            </div>
          </div>
          <form class="filters" data-planned-form style="align-items:end">
            <label class="field"><span class="field__label">Descrição</span><input class="input input--sm" name="description" required maxlength="60" /></label>
            <label class="field"><span class="field__label">Tipo</span><select class="select select--sm" name="kind"><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
            <label class="field"><span class="field__label">Valor (R$)</span><input class="input input--sm" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required /></label>
            <label class="field"><span class="field__label">Data</span><input class="input input--sm" name="date" type="date" required value="${_(aa(),1)}" /></label>
            <label class="field"><span class="field__label">Repetição</span><select class="select select--sm" name="recurrence"><option value="none">Única</option><option value="monthly">Mensal</option></select></label>
            <button type="submit" class="btn btn--secondary btn--sm">${y("plus")}Adicionar</button>
          </form>
          ${s.planned.length?c`<div class="list">${s.planned.map(a=>c`<div class="list-item">
                  <span class="cat-icon">${y(a.amount>=0?"arrowDown":"arrowUp")}</span>
                  <span class="list-item__main"><span class="list-item__title">${a.description}</span><span class="list-item__sub">${g(a.date)}${a.recurrence==="monthly"?" · mensal":""}</span></span>
                  <span class="list-item__end">${u(a.amount,{signed:!0,tone:!0})}</span>
                  <button type="button" class="icon-btn icon-btn--sm" data-action="remove-planned" data-value="${a.id}" aria-label="Remover ${a.description}">${y("trash")}</button>
                </div>`)}</div>`:""}
        </section>
      </div>`),ea(e,a=>p(a));const C=E(e,"cf-main");C&&S(C,T(r.map(a=>B(a.start,l)),[{label:"Entradas",data:r.map(a=>a.income),colorIndex:1},{label:"Saídas",data:r.map(a=>a.expenses),colorIndex:2},{label:"Saldo líquido",data:r.map(a=>a.net),colorIndex:3,asLine:!0}],{maxTicksX:l==="day"?10:12}));const q=E(e,"cf-cats");q&&S(q,T(v.map(a=>I(a.category)),[{label:"Gastos",data:v.map(a=>a.total),colorIndex:2}],{horizontal:!0}));const z=E(e,"cf-proj");z&&S(z,sa(n.series.map(a=>D(a.date)),[{label:"Saldo projetado",data:n.series.map(a=>a.balance),colorIndex:3,fill:!0}],{maxTicksX:8,zeroLine:!0}))},H=M(e,"click",{...oa,gran:s=>{l=s.dataset.value,f()},horizon:s=>{d=Number(s.dataset.value),f()},"remove-planned":s=>{V(s.dataset.value)}}),K=M(e,"change",{estimates:s=>{U({includeEstimates:s.checked})}}),j=s=>{const t=s.target;if(!t.matches("[data-planned-form]"))return;s.preventDefault();const i=new FormData(t),r=Math.abs(Number(i.get("amount"))),o=String(i.get("description")??"").trim(),b=String(i.get("date")??"");!o||!r||!/^\d{4}-\d{2}-\d{2}$/.test(b)||ta({description:o,amount:i.get("kind")==="income"?r:-r,date:b,recurrence:i.get("recurrence")==="monthly"?"monthly":"none"})};e.addEventListener("submit",j);const O=da(f);return f(),()=>{H(),K(),O(),e.removeEventListener("submit",j)}}export{ba as mount};
