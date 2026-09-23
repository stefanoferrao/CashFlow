import{d as R,b as z,r as M,h as t,ag as F,S as W,y as $,x as p,z as _,H as g,i as k,M as A,D as w,J as L,E as B}from"./index-CkDdCF5O.js";import{c as E,a as H,l as j,p as N,j as O,m as e,d as T,r as J,w as v,n as h,t as C,e as S,g as K,v as Q,b as q,i as V}from"./shared-FnK0_Mov.js";function o(u,n,r,l){return t`<div class="card"><div class="figure">
    <span class="figure__label">${u}${l?t` ${V(l)}`:""}</span>
    <div class="figure__value figure__value--md">${n}</div>
    ${r?t`<div class="figure__meta">${r}</div>`:""}
  </div></div>`}function Y(u){const n=u.root,r=()=>{const m=z.state;if(m.mode==="real"&&!j(m)){M(n,t`<div class="page"><div class="card">${N(m)}</div></div>`);return}const s=O(),f=m.dataset,P=f.cards.filter(a=>a.currency==="BRL").reduce((a,G)=>a+F(G),0),y=s.month.income-s.month.expenses,c=s.categoryMonth[0],i=s.netWorthGrowth30,d=f.snapshots,b=s.recurrences;M(n,t`<div class="page">
        <div class="page-head"><p class="page-head__intro">Indicadores do mês de ${W(s.today.slice(0,7))} (até ${$(s.today)}). Tudo aqui é calculado a partir dos seus dados — sem recomendações de investimento.</p></div>

        <div class="kpi-grid">
          ${o("Patrimônio líquido",e(s.netWorth.netWorth),void 0,"Ativos (contas + investimentos) − dívidas (cartões + cheque especial).")}
          ${o("Saldo disponível",e(s.totalBalance.base),"Somente contas bancárias")}
          ${o("Investimentos",e(s.totalInvestments.base))}
          ${o("Dívidas / faturas",e(P+s.netWorth.overdraft),t`Faturas abertas: <span class="money">${p(s.openBillsTotal)}</span>`,"Limite utilizado dos cartões (inclui parcelas futuras) + cheque especial.")}
          ${o("Receita mensal",e(s.month.income),"Lançada no mês")}
          ${o("Despesa mensal",e(s.month.expenses),s.previousMonthToDate.expenses>0?t`${T((s.month.expenses-s.previousMonthToDate.expenses)/s.previousMonthToDate.expenses,{upIsGood:!1})}<span>vs. mesmo período</span>`:void 0)}
          ${o("Economia mensal",t`<span class="${y<0?"neg":""}">${e(y)}</span>`,"Receitas − despesas do mês")}
          ${o("Taxa de poupança",_(s.savingsRate),void 0,"(Receitas − despesas) ÷ receitas no mês.")}
          ${o("Gasto médio diário",e(s.averageDailyExpense),`Desde ${$(`${s.today.slice(0,7)}-01`)}`)}
          ${o("Maior categoria de gasto",c?t`<span class="row" style="gap:8px">${J(c.category)}${v(c.category)}</span>`:"—",c?t`<span class="money">${p(c.total)}</span> · ${_(c.share)} das despesas`:"Sem despesas no mês")}
          ${o("Crescimento patrimonial",i?t`<span class="${i.change<0?"neg":"pos"}"><span class="money">${i.change>=0?"+":"−"}${p(Math.abs(i.change))}</span></span>`:"—",i?t`${T(i.pct)}<span>desde ${g(i.from)}</span>`:"Histórico local ainda insuficiente","Comparado ao registro local de patrimônio de ~30 dias atrás.")}
        </div>

        <section class="card">
          <div class="card__title card__title--lg">Insights</div>
          ${s.insights.length?t`<div class="auto-grid">${s.insights.map(a=>t`<div class="insight-card" data-tone="${a.tone}">
                  <span class="insight-card__icon">${k(a.icon)}</span>
                  <div><p>${a.text}</p><p class="insight-card__basis">Base: ${a.basis}</p></div>
                </div>`)}</div>`:h("Ainda não há dados suficientes para gerar insights")}
        </section>

        <div class="grid">
          <section class="card col-7">
            <div class="card__head"><div class="card__title card__title--lg">Patrimônio ao longo do tempo</div>${d.length>=2?C("an-nw"):""}</div>
            ${d.length>=2?S("an-nw",260,"Evolução do patrimônio líquido",{caption:"Patrimônio líquido registrado",headers:["Data","Patrimônio líquido","Contas","Investimentos","Dívida de cartões"],rows:d.map(a=>[g(a.date),e(a.netWorth),e(a.accounts),e(a.investments),e(a.cardDebt)])}):h("O app registra um ponto por dia sincronizado. A evolução aparece a partir do segundo registro (a Pluggy não fornece histórico de patrimônio).")}
          </section>
          <section class="card col-5">
            <div class="card__head"><div class="card__title card__title--lg">Gastos por categoria · mês</div>${s.categoryMonth.length?C("an-cat"):""}</div>
            ${s.categoryMonth.length?S("an-cat",Math.max(160,s.categoryMonth.length*36),"Gastos do mês por categoria",{caption:"Gastos por categoria no mês",headers:["Categoria","Total","Participação"],rows:s.categoryMonth.map(a=>[v(a.category),e(a.total),_(a.share)])}):h("Sem despesas no mês")}
          </section>
        </div>

        <section class="card">
          <div class="card__head">
            <div class="stack-sm"><div class="card__title card__title--lg">Recorrências identificadas</div>
            <span class="muted" style="font-size:13px">Lançamentos com a mesma descrição e valor semelhante em intervalos regulares. São estimativas usadas nas projeções (desative em Fluxo de Caixa).</span></div>
            ${K("estimativa","outline")}
          </div>
          ${b.length?Q({caption:"Recorrências identificadas",headers:["Descrição","Categoria","Frequência","Ocorrências","Última","Próxima prevista","Valor típico"],numericFrom:3,rows:b.map(a=>[a.label,v(a.category),a.cadence==="monthly"?"Mensal":a.cadence==="biweekly"?"Quinzenal":"Semanal",String(a.occurrences),g(a.lastDate),g(a.nextDate),e(a.averageAmount,{signed:!0,tone:!0})])}):h("Nenhuma recorrência identificada com segurança")}
        </section>
      </div>`),A(n,a=>p(a));const D=q(n,"an-nw");D&&w(D,L(d.map(a=>$(a.date)),[{label:"Patrimônio líquido",data:d.map(a=>a.netWorth),colorIndex:3,fill:!0}],{maxTicksX:8}));const x=q(n,"an-cat");x&&w(x,B(s.categoryMonth.map(a=>v(a.category)),[{label:"Gastos",data:s.categoryMonth.map(a=>a.total),colorIndex:2}],{horizontal:!0}))},l=R(n,"click",E),I=H(r);return r(),()=>{l(),I()}}export{Y as mount};
