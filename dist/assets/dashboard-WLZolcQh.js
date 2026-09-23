import{d as U,m as de,q as le,b as k,x as W,y as E,h as i,i as h,z as L,B as K,C as Y,D as J,E as ce,F as X,G as ue,H as P,I as Z,J as pe,K as me,L as Q,r as ee,M as ve,_ as $e,N as he,O as fe}from"./index-CkDdCF5O.js";import{c as ge,o as be,a as ye,i as R,f as x,d as F,k as m,m as l,n as I,C as H,b as ae,t as se,e as te,g as O,u as _e,h as we,j as xe,l as ke,p as De,s as Se}from"./shared-FnK0_Mov.js";const q=3,ze=1100,Ee=["renda_fixa","fundos","acoes","etfs","previdencia","outros"];function Ie(a){if(a.length<2)return i``;const e=240,s=44,t=Math.min(...a),o=Math.max(...a)-t||1,D=a.map((S,B)=>[B/(a.length-1)*e,s-4-(S-t)/o*(s-8)]),_=D.map(([S,B],T)=>`${T?"L":"M"}${S.toFixed(1)},${B.toFixed(1)}`).join(" "),M=`${_} L${e},${s} L0,${s} Z`,g=D[D.length-1];return i`<svg class="sparkline" viewBox="0 0 ${e} ${s}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${M}" fill="var(--series-3)" opacity="0.1"></path>
    <path d="${_}" fill="none" stroke="var(--series-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
    <circle cx="${g[0]}" cy="${g[1]}" r="3.5" fill="var(--series-3)" stroke="var(--surface)" stroke-width="2"></circle>
  </svg>`}const $=(a,e,s)=>i`<div class="card__head"><div class="card__title">${h(e)}${a}</div>${s??""}</div>`,j=[{id:"patrimonio",title:"Patrimônio",icon:"pie",layout:{x:0,y:0,w:4,h:5,minW:3,minH:4},visibleByDefault:!0,render:a=>{const e=a.netWorth,s=a.netWorthGrowth30,t=k.state.dataset.snapshots.slice(-26).map(n=>n.netWorth);return i`${$("Patrimônio líquido","pie",R("Contas (saldo positivo) + investimentos − dívidas de cartão e cheque especial. Limite de cartão não é patrimônio."))}
        <div class="figure">
          ${x(e.netWorth,"hero")}
          <div class="figure__meta">
            ${s?i`${F(s.pct)}<span>${s.change>=0?"+":"−"}${W(Math.abs(s.change))} desde ${E(s.from)}</span>`:i`<span>Histórico em construção — o app registra um ponto por dia sincronizado.</span>`}
          </div>
        </div>
        ${Ie(t)}
        <div class="kv-list">
          ${m("Ativos (contas + investimentos)",l(e.assets))}
          ${m("Dívidas (cartões e cheque especial)",l(e.liabilities))}
        </div>
        ${e.excludedCurrencies.length?i`<p class="field__hint">Contas em ${e.excludedCurrencies.join(", ")} não entram no total (sem conversão de câmbio).</p>`:""}`}},{id:"saldo",title:"Saldo em contas",icon:"wallet",layout:{x:4,y:0,w:4,h:5,minW:3,minH:4},visibleByDefault:!0,render:a=>{const e=k.state.dataset.accounts,s=new Map;for(const n of e)n.currency==="BRL"&&s.set(n.institution,(s.get(n.institution)??0)+n.balance);const t=Object.entries(a.totalBalance.others);return i`${$("Saldo em contas","wallet",R("Somente contas bancárias. Não inclui investimentos, limite de cartão nem valor de fatura."))}
        <div class="figure">${x(a.totalBalance.base)}<div class="figure__meta">${e.length} ${e.length===1?"conta":"contas"} bancárias</div></div>
        <div class="kv-list">
          ${[...s.entries()].sort((n,o)=>o[1]-n[1]).slice(0,4).map(([n,o])=>m(n,l(o)))}
          ${t.map(([n,o])=>m(`Em ${n} (não somado)`,l(o,{currency:n})))}
        </div>
        ${e.length?"":I("Nenhuma conta bancária encontrada")}
        <div class="card__foot"><a href="#/contas">Ver contas</a>${h("chevronRight")}</div>`}},{id:"investimentos",title:"Investimentos",icon:"trending",layout:{x:8,y:0,w:4,h:5,minW:3,minH:4},visibleByDefault:!0,render:a=>{const e=a.investmentBreakdown,s=a.investmentReturn;return i`${$("Investimentos","trending",R("Valor líquido informado pela instituição, separado do saldo em contas."))}
        <div class="figure">${x(a.totalInvestments.base)}
          <div class="figure__meta">${s?i`${F(s.rate)}<span>rentabilidade informada${s.coverage<1?` (${L(s.coverage)} da carteira)`:""}</span>`:i`<span>Rentabilidade não informada pela instituição</span>`}</div>
        </div>
        ${e.length?i`<div class="dist-list dist-list--compact">${Ee.map(t=>e.find(n=>n.key===t)).filter(t=>!!t).map(t=>i`<div class="dist-row">
                  <span class="dist-row__label"><span class="swatch" style="background:var(--series-${H[t.key]})"></span>${t.label}</span>
                  <span class="dist-row__value">${l(t.value)} <span class="muted">${L(t.share)}</span></span>
                </div>`)}</div>`:I("Nenhum investimento informado")}`}},{id:"fluxo",title:"Fluxo de caixa",icon:"flow",layout:{x:0,y:5,w:7,h:6,minW:5,minH:4},wide:!0,visibleByDefault:!0,render:a=>{const e=K(a.today,6),s=Y(a.transactions,{granularity:"month",start:`${e[0]}-01`,end:a.today});return i`${$("Receitas × despesas","flow",se("dash-flow"))}
        <div class="chart-legend">
          <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-1)"></span>Entradas</span>
          <span class="chart-legend__item"><span class="chart-legend__key" style="--key:var(--series-2)"></span>Saídas</span>
          <span class="chart-legend__item"><span class="chart-legend__key is-line" style="--key:var(--series-3)"></span>Saldo líquido</span>
          <span class="chart-legend__note">Últimos 6 meses · sem transferências próprias, faturas e aplicações</span>
        </div>
        ${te("dash-flow",220,"Gráfico de receitas e despesas dos últimos 6 meses",{caption:"Receitas e despesas por mês",headers:["Mês","Entradas","Saídas","Saldo"],rows:s.map(t=>[X(t.start.slice(0,7)),l(t.income),l(t.expenses),l(t.net,{signed:!0,tone:!0})])})}`},after:(a,e)=>{const s=K(e.today,6),t=Y(e.transactions,{granularity:"month",start:`${s[0]}-01`,end:e.today}),n=ae(a,"dash-flow");n&&J(n,ce(t.map(o=>X(o.start.slice(0,7))),[{label:"Entradas",data:t.map(o=>o.income),colorIndex:1},{label:"Saídas",data:t.map(o=>o.expenses),colorIndex:2},{label:"Saldo líquido",data:t.map(o=>o.net),colorIndex:3,asLine:!0}]))}},{id:"distribuicao",title:"Para onde está indo meu dinheiro?",icon:"grid",layout:{x:7,y:5,w:5,h:6,minW:4,minH:5},wide:!1,visibleByDefault:!0,render:a=>{const e=a.allocation,s=a.netWorth;return e.slices.length?i`${$("Para onde está indo meu dinheiro?","grid",R("Cada recurso aparece uma única vez: contas (saldo positivo) e investimentos por classe. Cartões são compromissos, não patrimônio."))}
        <div class="row-between wrap"><span class="muted">Total de ativos</span><strong class="figure__value--sm">${l(e.total)}</strong></div>
        <div class="dist-stack" role="img" aria-label="Distribuição dos ativos">
          ${e.slices.map(t=>i`<span style="flex-grow:${t.value};background:var(--series-${H[t.key]})" title="${t.label}: ${L(t.share)}"></span>`)}
        </div>
        <div class="dist-list">
          ${e.slices.map(t=>i`<div class="dist-row">
              <span class="dist-row__label"><span class="swatch" style="background:var(--series-${H[t.key]})"></span>${t.group==="contas"?"Contas":`Investimentos · ${t.label}`}</span>
              <span class="dist-row__value">${l(t.value)} <span class="muted">${L(t.share)}</span></span>
              <div class="dist-row__bar"><span style="width:${(t.share*100).toFixed(1)}%;background:var(--series-${H[t.key]})"></span></div>
            </div>`)}
        </div>
        <div class="card__foot">
          <span>Compromissos em cartões</span><strong class="neg">${l(s.cardDebt)}</strong>
        </div>`:i`${$("Para onde está indo meu dinheiro?","grid")}${I("Sem saldos ou investimentos para distribuir")}`}},{id:"fatura",title:"Fatura atual",icon:"receipt",layout:{x:0,y:11,w:6,h:4,minW:4,minH:3},visibleByDefault:!0,render:a=>{const e=[...a.bills].sort((n,o)=>n.cycle.due.localeCompare(o.cycle.due))[0];if(!e)return i`${$("Fatura atual","receipt")}${I(k.state.dataset.cards.length?"Datas de fechamento não informadas pela instituição":"Nenhum cartão de crédito conectado")}`;const s=a.billProjections[e.card.id],t=ue(a.today,e.cycle.due);return i`${$(`Fatura atual · ${e.card.name}`,"receipt",e.cycle.estimated?O("Datas estimadas","warn","info"):O(t<=0?"Vence hoje":`Vence em ${t} d`,t<=5?"warn":"neutral","calendar"))}
        <div class="split">
          <div class="figure">
            <span class="figure__label">Valor acumulado</span>
            ${x(e.total,"display")}
            <div class="figure__meta"><span>Previsão de fechamento</span><strong class="money">${W(s.paceForecast)}</strong></div>
          </div>
          <div class="kv-list">
            ${m("Fechamento",P(e.cycle.closing))}
            ${m("Vencimento",P(e.cycle.due))}
            ${m("Lançamentos futuros",l(e.future))}
          </div>
        </div>
        ${a.bills.length>1?i`<p class="field__hint">Total em faturas abertas (${a.bills.length} cartões): <strong class="money">${W(a.openBillsTotal)}</strong></p>`:""}
        <div class="card__foot"><a href="#/faturas">Previsão detalhada</a>${h("chevronRight")}</div>`}},{id:"cartoes",title:"Cartões",icon:"card",layout:{x:6,y:11,w:6,h:4,minW:4,minH:3},visibleByDefault:!0,render:a=>{const e=a.credit;return k.state.dataset.cards.length?i`${$("Limites dos cartões","card",_e(e.utilization))}
        <div class="split">
          <div class="figure"><span class="figure__label">Limite disponível</span>${x(e.available,"display")}</div>
          <div class="kv-list">
            ${m("Limite total",l(e.limit))}
            ${m("Limite utilizado",l(e.used))}
            ${m("Percentual utilizado",L(e.utilization))}
          </div>
        </div>
        ${we(e.utilization,"Utilização do limite total",!0)}
        ${e.cardsWithoutData?i`<p class="field__hint">${e.cardsWithoutData} cartão(ões) sem limite informado pela instituição.</p>`:""}
        <div class="card__foot"><a href="#/cartoes">Ver cartões</a>${h("chevronRight")}</div>`:i`${$("Cartões","card")}${I("Nenhum cartão de crédito conectado")}`}},{id:"receitas",title:"Receitas",icon:"arrowDown",layout:{x:0,y:15,w:4,h:4,minW:3,minH:3},visibleByDefault:!0,render:a=>{const e=a.outlook;return i`${$("Receitas do mês","arrowDown")}
        <div class="figure">${x(e.realizedIncome,"display")}<div class="figure__meta">recebidas até ${E(a.today)}</div></div>
        <div class="kv-list">
          ${m(i`Previstas até ${E(Z(a.today))} ${e.expectedIncome>0?O("estimativa","outline"):""}`,l(e.expectedIncome))}
          ${m("Total esperado no mês",l(e.realizedIncome+e.expectedIncome))}
          ${m("Mesmo período do mês anterior",l(a.previousMonthToDate.income))}
        </div>`}},{id:"despesas",title:"Despesas",icon:"arrowUp",layout:{x:4,y:15,w:4,h:4,minW:3,minH:3},visibleByDefault:!0,render:a=>{const e=a.outlook,s=a.previousMonthToDate.expenses,t=s>0?(e.realizedExpenses-s)/s:null;return i`${$("Despesas do mês","arrowUp")}
        <div class="figure">${x(e.realizedExpenses,"display")}<div class="figure__meta">${t!==null?i`${F(t,{upIsGood:!1})}<span>vs. mesmo período do mês anterior</span>`:i`<span>realizadas até ${E(a.today)}</span>`}</div></div>
        <div class="kv-list">
          ${m(i`Previstas até ${E(Z(a.today))} ${e.expectedExpenses>0?O("estimativa","outline"):""}`,l(e.expectedExpenses))}
          ${m("Total esperado no mês",l(e.realizedExpenses+e.expectedExpenses))}
          ${m("Gasto médio por dia",l(a.averageDailyExpense))}
        </div>`}},{id:"proximos",title:"Próximos gastos",icon:"calendar",layout:{x:8,y:15,w:4,h:4,minW:3,minH:3},visibleByDefault:!0,render:a=>{const e=a.upcoming.slice(0,4);return i`${$("Próximos gastos · 30 dias","calendar")}
        ${e.length?i`<ul class="mini-list">
              ${e.map(s=>i`<li>
                  <span class="mini-list__date">${E(s.date)}</span>
                  <span class="mini-list__label truncate" title="${s.label}">${s.label}${s.certainty==="estimated"?i` <span class="badge badge--outline">estimativa</span>`:""}</span>
                  <span class="mini-list__value">${l(s.amount)}</span>
                </li>`)}
            </ul>`:I("Nenhuma despesa futura conhecida")}
        <div class="card__foot"><a href="#/fluxo">Ver projeção</a>${h("chevronRight")}</div>`}},{id:"projecao",title:"Saldo projetado",icon:"target",layout:{x:0,y:19,w:8,h:5,minW:5,minH:4},wide:!0,visibleByDefault:!1,render:a=>{const e=ie(a);return i`${$("Saldo projetado · 30 dias","target",se("dash-proj"))}
        <div class="row-between wrap">
          <div class="figure"><span class="figure__label">Estimado em ${P(me(a.today,30))}</span>${x(e.end,"md")}</div>
          <div class="figure"><span class="figure__label">Menor saldo no período</span><div class="figure__value figure__value--sm ${e.min<0?"neg":""}"><span class="money">${W(e.min)}</span></div></div>
        </div>
        ${te("dash-proj",150,"Projeção do saldo em contas para os próximos 30 dias",{caption:"Saldo projetado",headers:["Data","Saldo"],rows:e.series.filter((s,t)=>t%5===0).map(s=>[P(s.date),l(s.balance)])})}`},after:(a,e)=>{const s=ie(e),t=ae(a,"dash-proj");t&&J(t,pe(s.series.map(n=>E(n.date)),[{label:"Saldo projetado",data:s.series.map(n=>n.balance),colorIndex:3,fill:!0}],{maxTicksX:6,zeroLine:!0}))}},{id:"insights",title:"Insights",icon:"bulb",layout:{x:8,y:19,w:4,h:5,minW:3,minH:4},visibleByDefault:!1,render:a=>i`${$("Insights","bulb")}
        ${a.insights.length?i`<ul class="insight-list">${a.insights.slice(0,3).map(e=>i`<li class="insight insight--${e.tone}">${h(e.icon)}<span>${e.text}</span></li>`)}</ul>`:I("Ainda não há dados suficientes")}
        <div class="card__foot"><a href="#/analises">Ver análises</a>${h("chevronRight")}</div>`}];function ie(a){const e=he({today:a.today,days:30,transactions:a.transactions,billSummaries:a.bills,bills:k.state.dataset.bills,recurrences:a.recurrences,planned:k.state.planned,includeEstimates:k.state.preferences.includeEstimates});return fe(a.totalBalance.base,a.today,30,e)}const C=new Map(j.map(a=>[a.id,a]));function G(){return{version:q,widgets:j.map(a=>({id:a.id,x:a.layout.x,y:a.layout.y,w:a.layout.w,h:a.layout.h,visible:a.visibleByDefault,pinned:!1})),mobileOrder:j.map(a=>a.id)}}function Be(a){const e=G();if(!a||a.version!==q)return e;const s=new Map(a.widgets.map(o=>[o.id,o])),t=e.widgets.map(o=>({...o,...s.get(o.id)??{}})),n=(a.mobileOrder??[]).filter(o=>C.has(o));for(const o of j)n.includes(o.id)||n.push(o.id);return{version:q,widgets:t,mobileOrder:n}}function We(a){const e=a.root;let s=G(),t=!1,n=null,o=!1;const D=matchMedia(`(min-width: ${ze}px)`),_=()=>D.matches,M=(d,u)=>i`<div class="card card--fill dash-card" data-widget="${d.id}">${d.render(u)}</div>`,g=async()=>{if(o)return;n?.destroy(!1),n=null;const d=k.state,u=xe();if(d.mode==="real"&&!ke(d)){ee(e,i`<div class="page"><div class="card">${De(d)}</div></div>`);return}const c=s.widgets.filter(r=>r.visible&&C.has(r.id)),b=i`<div class="page-head">
      <p class="page-head__intro">Visão consolidada de contas, cartões e investimentos${d.dataset.fetchedAt?i` · dados de ${P(d.dataset.fetchedAt.slice(0,10))}`:""}.</p>
      <div class="row wrap">
        ${d.mode==="real"?i`<button type="button" class="btn btn--secondary btn--sm" data-action="add-institution">${h("plus")}Adicionar instituição</button>`:""}
        <button type="button" class="btn ${t?"btn--primary":"btn--secondary"} btn--sm" data-action="customize" aria-pressed="${t}">${h(t?"check":"layout")}${t?"Concluir":"Personalizar"}</button>
      </div>
    </div>`,w=t?i`<section class="card customize-panel" aria-label="Personalizar dashboard">
          <div class="row-between wrap">
            <div class="stack-sm">
              <strong>Personalizar dashboard</strong>
              <span class="muted">${_()?"Arraste os cards pela borda superior e redimensione pelo canto. Cards fixados não se movem.":"Mostre, oculte e reordene os cards."}</span>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" data-action="reset-layout">${h("refresh")}Restaurar padrão</button>
          </div>
          <ul class="customize-list">
            ${(_()?s.widgets.map(r=>r.id):s.mobileOrder??[]).map((r,p,v)=>{const y=s.widgets.find(z=>z.id===r),f=C.get(r);return i`<li class="customize-item">
                <label class="check"><input type="checkbox" data-action="toggle-widget" data-value="${r}" ${y.visible?"checked":""} />${f.title}</label>
                <span class="row">
                  ${_()?i`<button type="button" class="icon-btn icon-btn--sm" data-action="pin-widget" data-value="${r}" aria-pressed="${y.pinned}" aria-label="${y.pinned?"Desafixar":"Fixar"} ${f.title}" data-tip="${y.pinned?"Desafixar":"Fixar posição"}" ${y.visible?"":"disabled"}>${h("pin")}</button>`:i`<button type="button" class="icon-btn icon-btn--sm" data-action="move-up" data-value="${r}" aria-label="Mover ${f.title} para cima" ${p===0?"disabled":""}>${h("chevronUp")}</button>
                        <button type="button" class="icon-btn icon-btn--sm" data-action="move-down" data-value="${r}" aria-label="Mover ${f.title} para baixo" ${p===v.length-1?"disabled":""}>${h("chevronDown")}</button>`}
                </span>
              </li>`})}
          </ul>
        </section>`:"";let A;if(_())A=i`<div class="grid-stack dash-grid ${t?"is-editing":""}">
        ${c.map(r=>{const p=C.get(r.id);return i`<div class="grid-stack-item ${r.pinned?"is-pinned":""}" gs-id="${r.id}" gs-x="${r.x}" gs-y="${r.y}" gs-w="${r.w}" gs-h="${r.h}" gs-min-w="${p.layout.minW}" gs-min-h="${p.layout.minH}" ${r.pinned?i`gs-locked="true" gs-no-move="true" gs-no-resize="true"`:""}>
            <div class="grid-stack-item-content">${M(p,u)}</div>
          </div>`})}
      </div>`;else{const r=(s.mobileOrder??[]).filter(p=>c.some(v=>v.id===p));A=i`<div class="dash-flow">${r.map(p=>{const v=C.get(p);return i`<div class="dash-flow__item ${v.wide?"is-wide":""}">${M(v,u)}</div>`})}</div>`}ee(e,i`<div class="page">${b}${w}${c.length?A:i`<div class="card">${Se({kind:"empty",title:"Todos os cards estão ocultos",text:'Use "Personalizar" para mostrar os cards.',compact:!0})}</div>`}</div>`),ve(e,r=>W(r));for(const r of c){const p=C.get(r.id),v=e.querySelector(`[data-widget="${r.id}"]`);v&&p.after&&p.after(v,u)}if(_()){const{GridStack:r}=await $e(async()=>{const{GridStack:y}=await import("./gridstack-BHT0qyFg.js");return{GridStack:y}},[],import.meta.url);if(o)return;const p=e.querySelector(".grid-stack");if(!p)return;const v=r.init({column:12,cellHeight:76,margin:8,float:!1,animate:!0,staticGrid:!t,handle:".card__head",resizable:{handles:"se"}},p);if(!v)return;n=v,v.on("change",()=>{const y=v.save(!1);s={...s,widgets:s.widgets.map(f=>{const z=y.find(re=>re.id===f.id);return z?{...f,x:z.x??f.x,y:z.y??f.y,w:z.w??f.w,h:z.h??f.h}:f})},Q(s)}),v.on("resizestop",()=>{requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")))})}},S=async()=>{await Q(s),await g()},B=(d,u)=>{s={...s,widgets:s.widgets.map(c=>c.id===d?{...c,...u}:c)}},T=U(e,"click",{...ge,"add-institution":()=>be(),customize:()=>{t=!t,g()},"reset-layout":async()=>{s=G(),await de(),await g()},"pin-widget":d=>{const u=d.dataset.value,c=s.widgets.find(b=>b.id===u);c&&(B(u,{pinned:!c.pinned}),S())},"move-up":d=>V(d.dataset.value,-1),"move-down":d=>V(d.dataset.value,1)}),ne=U(e,"change",{"toggle-widget":d=>{const u=d.dataset.value,c=d;s.widgets.find(w=>w.id===u)&&(B(u,c.checked?{visible:!0,y:1e3}:{visible:!1}),S())}});function V(d,u){const c=[...s.mobileOrder??[]],b=c.indexOf(d),w=b+u;b<0||w<0||w>=c.length||([c[b],c[w]]=[c[w],c[b]],s={...s,mobileOrder:c},S().then(()=>e.querySelector(`[data-action="${u<0?"move-up":"move-down"}"][data-value="${d}"]`)?.focus()))}const N=()=>{g()};D.addEventListener("change",N);const oe=ye(()=>{g()});return(async()=>(s=Be(await le()),await g()))(),()=>{o=!0,T(),ne(),oe(),D.removeEventListener("change",N),n?.destroy(!1),n=null}}const Pe=j.map(a=>({id:a.id,title:a.title}));export{Pe as DASHBOARD_WIDGETS,G as defaultLayout,We as mount};
