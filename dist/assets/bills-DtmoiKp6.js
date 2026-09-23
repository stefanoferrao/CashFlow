import{d as C,b as x,r as y,h as c,Q as M,i as $,H as r,x as b,y as _,S as V,M as E,D as S,J as T}from"./index-CkDdCF5O.js";import{c as I,a as N,l as L,p as z,j as H,n as p,q,g,f as J,m as t,i as K,t as Q,e as R,r as U,v as j,b as X}from"./shared-FnK0_Mov.js";function G(k){const d=k.root;let m=k.params.get("card"),o=!1;const h=()=>{const i=x.state;if(i.mode==="real"&&!L(i)){y(d,c`<div class="page"><div class="card">${z(i)}</div></div>`);return}const v=H(),l=i.dataset.cards;if(!l.length){y(d,c`<div class="page"><div class="card">${p("Nenhum cartão de crédito encontrado nas instituições conectadas")}</div></div>`);return}(!m||!l.some(a=>a.id===m))&&(m=l[0].id);const u=l.find(a=>a.id===m),s=v.bills.find(a=>a.card.id===u.id),e=s?v.billProjections[u.id]:void 0,w=i.dataset.bills.filter(a=>a.cardId===u.id).sort((a,f)=>f.dueDate.localeCompare(a.dueDate)),D=s?M(s,v.transactions,6):[],n=u.currency;y(d,c`<div class="page">
        <div class="page-head">
          <p class="page-head__intro">A fatura aberta não é fornecida pela Pluggy: ela é calculada a partir das transações do ciclo atual. Faturas fechadas vêm da instituição.</p>
          ${l.length>1?q("select-card",l.map(a=>({value:a.id,label:a.name})),u.id,"Cartão"):""}
        </div>

        ${!s||!e?c`<div class="card">${p("Datas de fechamento/vencimento não informadas pela instituição — não é possível montar o ciclo da fatura.")}</div>`:c`
          <section class="card">
            <div class="bill-hero">
              <div class="stack">
                <div class="row-between wrap">
                  <span class="card__title">${$("receipt")}Previsão da próxima fatura · ${u.name}</span>
                  ${s.cycle.estimated?g("Datas estimadas","warn","info"):g(`Vence em ${r(s.cycle.due)}`,"neutral","calendar")}
                </div>
                ${J(e.forecast,"hero",n)}
                <div class="breakdown">
                  <div class="breakdown__row"><span>Fatura já lançada</span><strong>${t(e.launched,{currency:n})}</strong></div>
                  <div class="breakdown__row"><span>Compras futuras (parcelas conhecidas) ${K("Lançamentos com data futura dentro do ciclo atual, como parcelas de compras anteriores.")}</span><strong>${t(e.future,{currency:n})}</strong></div>
                  <div class="breakdown__row"><span>Previsão final</span><strong>${t(e.forecast,{currency:n})}</strong></div>
                </div>
                <div class="pace" role="note">
                  ${$("trending")}
                  <div>
                    <span class="muted">Se você continuar gastando neste ritmo…</span>
                    <strong class="money">${b(e.paceForecast,n)}</strong>
                    <span class="muted" style="font-size:12px">Média de ${b(e.dailyAverage,n)}/dia em compras novas × ${e.daysRemaining} dia(s) até o fechamento. Estimativa, não valor da instituição.</span>
                  </div>
                </div>
                <div class="kv-list">
                  <div class="kv"><span>Ciclo</span><strong>${_(s.cycle.start)} a ${_(s.cycle.closing)}</strong></div>
                  <div class="kv"><span>Fechamento</span><strong>${r(s.cycle.closing)}</strong></div>
                  <div class="kv"><span>Vencimento</span><strong>${r(s.cycle.due)}</strong></div>
                </div>
              </div>
              <div class="stack">
                <div class="card__head">
                  <div class="card__title">Evolução diária da fatura</div>
                  ${Q("bill-evo")}
                </div>
                <div class="chart-legend">
                  <span class="chart-legend__item"><span class="chart-legend__key is-line" style="--key:var(--series-2)"></span>Acumulado</span>
                  <span class="chart-legend__item"><span class="chart-legend__key is-dashed" style="--key:var(--series-2)"></span>Projeção no ritmo atual</span>
                </div>
                ${R("bill-evo",280,"Evolução diária do valor acumulado da fatura com projeção até o fechamento",{caption:"Evolução diária da fatura",headers:["Dia","Acumulado","Projeção"],rows:e.series.filter((a,f)=>f%3===0||f===e.series.length-1).map(a=>[_(a.date),a.actual!==null?t(a.actual):"—",a.projected!==null?t(a.projected):"—"])})}
              </div>
            </div>
          </section>

          <section class="card card--flush">
            <div class="card__pad" style="padding-bottom:12px"><div class="card__title card__title--lg">Lançamentos do ciclo atual</div></div>
            ${s.transactions.length?c`<div class="list">${s.transactions.slice().reverse().slice(0,o?void 0:10).map(a=>c`<div class="list-item">
                      ${U(a.category)}
                      <div class="list-item__main">
                        <span class="list-item__title">${a.description}</span>
                        <span class="list-item__sub">${r(a.date)}${a.installment?` · parcela ${a.installment.number}/${a.installment.total}`:""}${a.date>v.today?" · futuro":""}</span>
                      </div>
                      <div class="list-item__end">${t(-a.amount,{currency:n})}</div>
                    </div>`)}</div>
                  ${s.transactions.length>10?c`<div class="pagination"><span>${o?s.transactions.length:10} de ${s.transactions.length} lançamentos</span><button type="button" class="btn btn--ghost btn--sm" data-action="toggle-all" aria-expanded="${o}">${$(o?"chevronUp":"chevronDown")}${o?"Mostrar menos":"Mostrar todos"}</button></div>`:""}`:c`<div class="card__pad">${p("Nenhum lançamento no ciclo atual")}</div>`}
          </section>

          <section class="card">
            <div class="card__title card__title--lg">Faturas futuras (parcelas já conhecidas)</div>
            ${D.length?j({caption:"Faturas futuras",headers:["Fatura","Vencimento estimado","Lançamentos","Valor conhecido"],rows:D.map(a=>[V(a.month),r(a.due),String(a.count),t(a.total,{currency:n})]),numericFrom:2}):p("Nenhuma parcela futura conhecida")}
            <p class="field__hint">Valores mínimos: novas compras ainda serão somadas. Datas de vencimento projetadas mês a mês a partir do ciclo atual.</p>
          </section>`}

        <section class="card">
          <div class="card__title card__title--lg">Faturas fechadas</div>
          ${w.length?j({caption:"Faturas fechadas",headers:["Fechamento","Vencimento","Situação","Total","Pago","Mínimo","Encargos"],rows:w.map(a=>[a.closingDate?r(a.closingDate):"—",r(a.dueDate),a.isPaid?g("Paga","good","check"):a.dueDate<v.today?g("Em aberto","bad","alert"):g("A vencer","warn","clock"),t(a.totalAmount,{currency:a.currency}),t(a.paidAmount,{currency:a.currency}),t(a.minimumPayment,{currency:a.currency}),t(a.financeCharges,{currency:a.currency})]),numericFrom:3}):p("Faturas fechadas não disponibilizadas pela instituição")}
        </section>
      </div>`),E(d,a=>b(a,n));const F=X(d,"bill-evo");F&&e&&S(F,T(e.series.map(a=>_(a.date)),[{label:"Acumulado",data:e.series.map(a=>a.actual),colorIndex:2,fill:!0},{label:"Projeção",data:e.series.map(a=>a.projected),colorIndex:2,projection:!0}],{beginAtZero:!0,maxTicksX:8}))},A=C(d,"click",{...I,"select-card":i=>{m=i.dataset.value??null,o=!1,h()},"toggle-all":()=>{o=!o,h()}}),P=N(h);return h(),()=>{A(),P()}}export{G as mount};
