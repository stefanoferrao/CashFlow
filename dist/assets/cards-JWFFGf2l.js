import{P as m,x as b,z as f,h as t,d as N,b as U,r as C,i as _,Q as j,R as k,K as I,H as P,S as M,M as S,D as T,E as V}from"./index-CkDdCF5O.js";import{c as B,a as E,l as A,p as K,j as O,n as q,f as h,h as F,g as w,u as H,m as l,t as W,e as Q,b as R,i as G}from"./shared-FnK0_Mov.js";function J(i,s=.45){const n=i.replace("#","");if(!/^[0-9a-f]{6}$/i.test(n))return"#0b0f17";const d=parseInt(n,16),$=c=>Math.round(c*(1-s));return`#${[d>>16&255,d>>8&255,d&255].map(c=>$(c).toString(16).padStart(2,"0")).join("")}`}function X(i){const s=i.institutionColor&&/^#[0-9a-f]{6}$/i.test(i.institutionColor)?i.institutionColor:"#1f2937",n=m(i);return t`<div class="cc" style="--cc-a:${s};--cc-b:${J(s)}" role="img" aria-label="Cartão ${i.name} final ${i.lastFourDigits??"não informado"}">
    <div class="cc__top">
      <div class="stack-sm" style="gap:2px">
        <span class="cc__brand">${[i.brand,i.level].filter(Boolean).join(" ")||"Cartão de crédito"}</span>
        <span class="cc__inst">${i.name}</span>
      </div>
      <span class="cc__inst">${i.institution}</span>
    </div>
    <div class="cc__chip" aria-hidden="true"></div>
    <div class="cc__number sensitive">•••• •••• •••• ${i.lastFourDigits??"••••"}</div>
    <div class="cc__bottom">
      <div><div class="cc__label">Limite</div><div class="cc__value money">${i.limit!==null?b(i.limit,i.currency):"—"}</div></div>
      <div><div class="cc__label">Disponível</div><div class="cc__value money">${i.availableLimit!==null?b(i.availableLimit,i.currency):"—"}</div></div>
      <div style="text-align:right"><div class="cc__label">Utilizado</div><div class="cc__value">${n!==null?f(n):"—"}</div></div>
    </div>
  </div>`}function o(i,s,n){return t`<div class="detail"><span>${i}${n?t` ${G(n)}`:""}</span><strong>${s}</strong></div>`}function aa(i){const s=i.root,n=()=>{const c=U.state;if(c.mode==="real"&&!A(c)){C(s,t`<div class="page"><div class="card">${K(c)}</div></div>`);return}const v=O(),g=c.dataset.cards,r=v.credit,u=g.filter(a=>m(a)!==null);C(s,t`<div class="page">
        <div class="page-head"><p class="page-head__intro">Limite de cartão não é patrimônio e fatura não é ativo — aqui eles aparecem como compromissos.</p></div>
        ${g.length?t`
          <div class="kpi-grid">
            <div class="card"><div class="figure"><span class="figure__label">Limite total</span>${h(r.limit)}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Limite utilizado</span>${h(r.used,"md")}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Limite disponível</span>${h(r.available,"md")}</div></div>
            <div class="card"><div class="figure"><span class="figure__label">Percentual utilizado</span><div class="figure__value figure__value--md">${f(r.utilization)}</div>${F(r.utilization,"Utilização total dos limites")}</div></div>
          </div>
          ${r.cardsWithoutData?t`<div class="callout callout--info">${_("info")}<div>${r.cardsWithoutData} cartão(ões) sem limite informado pela instituição ficam fora dos totais de limite.</div></div>`:""}

          ${g.map(a=>{const e=v.bills.find(x=>x.card.id===a.id),L=e?v.billProjections[a.id]:void 0,y=e?j(e,v.transactions,1)[0]:void 0,p=m(a),D=e?k(I(e.cycle.closing,1)).d:null;return t`<article class="card">
              <div class="card-tile">
                ${X(a)}
                <div class="stack">
                  <div class="row-between wrap">
                    <div class="stack-sm" style="gap:2px">
                      <strong style="font-size:18px">${a.name}</strong>
                      <span class="muted" style="font-size:13px">${a.institution} · final ${a.lastFourDigits??"—"}${a.holderType==="ADDITIONAL"?" · adicional":""}</span>
                    </div>
                    <div class="row wrap">${a.status&&a.status!=="ACTIVE"?w(a.status==="BLOCKED"?"Bloqueado":"Cancelado","bad"):""}${H(p)}</div>
                  </div>
                  ${F(p,`Utilização do limite do ${a.name}`,!0)}
                  <div class="detail-grid">
                    ${o("Limite total",l(a.limit,{currency:a.currency}))}
                    ${o("Limite disponível",l(a.availableLimit,{currency:a.currency}))}
                    ${o("Limite utilizado",l(a.usedLimit,{currency:a.currency}),"Limite total − disponível. Inclui parcelas futuras já comprometidas.")}
                    ${o("Percentual utilizado",p!==null?f(p):"Não informado")}
                    ${o("Melhor dia de compra",D?`Dia ${D}`:"Não informado","Estimado como o dia seguinte ao fechamento da fatura aberta.")}
                    ${o("Fechamento",e?t`${P(e.cycle.closing)}${e.cycle.estimated?t` ${w("estimado","outline")}`:""}`:"Não informado")}
                    ${o("Vencimento",e?P(e.cycle.due):"Não informado")}
                    ${o("Fatura atual",e?l(e.total,{currency:a.currency}):"Não disponível","Soma das compras e estornos do ciclo aberto, calculada a partir das transações.")}
                    ${o("Previsão de fechamento",L?l(L.paceForecast,{currency:a.currency}):"—","Lançado + parcelas conhecidas + ritmo médio de gastos até o fechamento.")}
                    ${o("Próxima fatura (parcelas já conhecidas)",y?t`${l(y.total,{currency:a.currency})} <span class="muted" style="font-weight:500;font-size:12px">${M(y.month)}</span>`:"Nenhuma parcela futura")}
                    ${a.minimumPayment!==null?o("Pagamento mínimo",l(a.minimumPayment,{currency:a.currency})):""}
                    ${o("Saldo informado pela instituição",l(a.institutionBalance,{currency:a.currency}),'Valor bruto "balance" da Pluggy. Em conectores Open Finance representa o limite utilizado; em outros, o saldo do mês.')}
                  </div>
                  <div class="row wrap">
                    <a class="btn btn--secondary btn--sm" href="#/faturas?card=${a.id}">${_("receipt")}Ver fatura e previsão</a>
                    <a class="btn btn--ghost btn--sm" href="#/transacoes?card=${a.id}">${_("list")}Transações do cartão</a>
                  </div>
                </div>
              </div>
            </article>`})}

          ${u.length>=2?t`<section class="card">
                <div class="card__head"><div class="card__title card__title--lg">Utilização por cartão</div>${W("card-util")}</div>
                ${Q("card-util",Math.max(120,u.length*56),"Percentual de limite utilizado por cartão",{caption:"Utilização por cartão",headers:["Cartão","Utilizado","Limite","%"],rows:u.map(a=>[a.name,l(a.usedLimit),l(a.limit),f(m(a))])})}
              </section>`:""}`:t`<div class="card">${q("Nenhum cartão de crédito encontrado nas instituições conectadas")}</div>`}
      </div>`),S(s,a=>b(a));const z=R(s,"card-util");z&&T(z,V(u.map(a=>a.name),[{label:"Utilizado",data:u.map(a=>m(a)??0),colorIndex:3}],{horizontal:!0,yFormat:"percent"}))},d=N(s,"click",B),$=E(n);return n(),()=>{d(),$()}}export{X as creditCardVisual,aa as mount};
