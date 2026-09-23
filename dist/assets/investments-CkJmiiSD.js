import{d as w,b as P,r as F,h as t,z as o,x as _,i as b,H as C,a6 as U,M as V,D,a7 as x,J as M,y as B,a8 as y}from"./index-CkDdCF5O.js";import{c as k,a as z,l as H,p as q,j,n as f,i as R,f as K,t as I,e as N,m as r,C as A,v as X,b as L}from"./shared-FnK0_Mov.js";const G={CDB:"CDB",LCI:"LCI",LCA:"LCA",LC:"LC",CRI:"CRI",CRA:"CRA",TREASURY:"Tesouro Direto",DEBENTURES:"Debêntures",CORPORATE_DEBT:"Dívida corporativa",MULTIMARKET_FUND:"Multimercado",FIXED_INCOME_FUND:"Fundo de renda fixa",STOCK_FUND:"Fundo de ações",INVESTMENT_FUND:"Fundo de investimento",ETF_FUND:"Fundo de ETF",OFFSHORE_FUND:"Fundo offshore",FIP_FUND:"FIP",EXCHANGE_FUND:"Fundo cambial",FI_INFRA:"Fundo de infraestrutura",FI_AGRO:"Fiagro",STOCK:"Ações",BDR:"BDR",REAL_ESTATE_FUND:"Fundo imobiliário",DERIVATIVES:"Derivativos",OPTION:"Opções",ETF:"ETF",RETIREMENT:"Previdência",STRUCTURED_NOTE:"COE"};function W(s){return s.rate!==null&&s.rateType?`${y(s.rate)}% ${s.rateType}`:s.fixedAnnualRate!==null?`${s.rateType?`${s.rateType} + `:""}${y(s.fixedAnnualRate)}% a.a.`:s.rateType?s.rateType:"—"}function Y(s){return s.profit!==null&&s.originalValue!==null&&s.originalValue>0?s.profit/s.originalValue:null}function Z(s){const n=s.root,g=()=>{const d=P.state;if(d.mode==="real"&&!H(d)){F(n,t`<div class="page"><div class="card">${q(d)}</div></div>`);return}const v=j(),p=d.dataset.investments.filter(a=>a.status!=="TOTAL_WITHDRAWAL").sort((a,e)=>e.value-a.value),l=v.investmentBreakdown,i=v.investmentReturn,c=new Map;for(const a of p)a.currency==="BRL"&&c.set(a.institution,(c.get(a.institution)??0)+a.value);const m=[...c.values()].reduce((a,e)=>a+e,0),u=d.dataset.snapshots.filter(a=>a.investments>0),$=Object.entries(v.totalInvestments.others);F(n,t`<div class="page">
        <div class="page-head"><p class="page-head__intro">Valores informados pelas instituições via Pluggy. Investimentos são contabilizados separadamente do saldo em contas. Nenhuma recomendação de investimento é feita aqui.</p></div>
        ${p.length?t`
        <div class="kpi-grid">
          <div class="card"><div class="figure"><span class="figure__label">Patrimônio investido ${R("Soma do valor líquido (após impostos e taxas) informado pela instituição.")}</span>${K(v.totalInvestments.base)}</div></div>
          <div class="card"><div class="figure"><span class="figure__label">Rentabilidade acumulada ${R("Lucro informado ÷ valor aplicado originalmente, somente dos produtos em que a instituição informa ambos.")}</span>
            ${i?t`<div class="figure__value figure__value--md ${i.rate>=0?"pos":"neg"}">${i.rate>=0?"+":"−"}${o(Math.abs(i.rate),!0)}</div><div class="figure__meta"><span><span class="money">${_(i.profit)}</span> sobre <span class="money">${_(i.original)}</span> · cobre ${o(i.coverage)} da carteira</span></div>`:f()}
          </div></div>
          <div class="card"><div class="figure"><span class="figure__label">Produtos</span><div class="figure__value figure__value--md">${p.length}</div><div class="figure__meta">${c.size} instituição(ões)</div></div></div>
        </div>
        ${$.length?t`<div class="callout callout--info">${b("info")}<div>Investimentos em outras moedas (não somados): ${$.map(([a,e])=>_(e,a)).join(" · ")}.</div></div>`:""}

        <div class="grid">
          <section class="card col-5">
            <div class="card__head"><div class="card__title card__title--lg">Composição patrimonial</div>${I("inv-comp")}</div>
            ${N("inv-comp",220,"Composição dos investimentos por classe",{caption:"Composição por classe",headers:["Classe","Valor","%"],rows:l.map(a=>[a.label,r(a.value),o(a.share)])})}
            <div class="dist-list">
              ${l.map(a=>t`<div class="dist-row">
                  <span class="dist-row__label"><span class="swatch" style="background:var(--series-${A[a.key]})"></span>${a.label} <span class="muted">(${a.count})</span></span>
                  <span class="dist-row__value">${r(a.value)} <span class="muted">${o(a.share)}</span></span>
                </div>`)}
            </div>
          </section>
          <section class="card col-7">
            <div class="card__head"><div class="card__title card__title--lg">Evolução do patrimônio investido</div>${u.length>=2?I("inv-evo"):""}</div>
            ${u.length>=2?N("inv-evo",260,"Evolução do valor investido segundo os registros locais",{caption:"Evolução dos investimentos",headers:["Data","Investido"],rows:u.map(a=>[C(a.date),r(a.investments)])}):f("Histórico disponível a partir do primeiro uso: o app registra o valor investido a cada dia sincronizado (a Pluggy não fornece série histórica).")}
            <div class="stack-sm">
              <div class="card__title">Por instituição</div>
              <div class="dist-list">
                ${[...c.entries()].sort((a,e)=>e[1]-a[1]).map(([a,e])=>t`<div class="dist-row">
                      <span class="dist-row__label">${b("bank")}${a}</span>
                      <span class="dist-row__value">${r(e)} <span class="muted">${o(m?e/m:0)}</span></span>
                      <div class="dist-row__bar"><span style="width:${((m?e/m:0)*100).toFixed(1)}%;background:var(--series-3)"></span></div>
                    </div>`)}
              </div>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card__title card__title--lg">Produtos</div>
          ${X({caption:"Produtos de investimento",headers:["Produto","Classe","Instituição","Taxa/indexador","Vencimento","Rentab. informada","Valor bruto","Valor líquido"],numericFrom:5,rows:p.map(a=>{const e=Y(a),E=a.lastTwelveMonthsRate;return[t`<strong>${a.name}</strong>`,t`${U[a.investmentClass]}<br /><span class="muted" style="font-size:12px">${a.subtype?G[a.subtype]??a.subtype:a.type}</span>`,a.institution,W(a),a.dueDate?C(a.dueDate):"—",e!==null?t`<span class="${e>=0?"pos":"neg"}">${o(e,!0)}</span>`:E!==null?t`${o(E,!0)} <span class="muted" style="font-size:11px">12m</span>`:t`<span class="muted" title="Dados não disponíveis pela instituição">—</span>`,r(a.grossValue,{currency:a.currency}),r(a.value,{currency:a.currency})]})})}
          <p class="field__hint">“—” = dado não disponível pela instituição. Nenhum valor é estimado silenciosamente.</p>
        </section>`:t`<div class="card">${f("Nenhum investimento informado pelas instituições conectadas")}</div>`}
      </div>`),V(n,a=>_(a));const T=L(n,"inv-comp");T&&D(T,x(l.map(a=>a.label),l.map(a=>a.value),l.map(a=>A[a.key])));const h=L(n,"inv-evo");h&&D(h,M(u.map(a=>B(a.date)),[{label:"Investido",data:u.map(a=>a.investments),colorIndex:3,fill:!0}],{maxTicksX:8}))},O=w(n,"click",k),S=z(g);return g(),()=>{O(),S()}}export{Z as mount};
