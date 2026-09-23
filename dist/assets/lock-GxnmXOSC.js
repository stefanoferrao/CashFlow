import{d,u as m,V as b,r as f,i as o,h as r,c as g,w as v,s as h,a as y}from"./index-CkDdCF5O.js";import{themeFloat as w,screenAside as $}from"./onboarding-BP4BDz3x.js";import"./privacy-DwQHegGV.js";function S(e){let t=null,s=!1,l=0;const n=()=>{f(e,r`${w()}<div class="screen">${$()}
        <main class="screen__main" id="main">
          <form class="screen__panel" data-form="unlock" novalidate>
            <span class="step-label">Cofre local</span>
            <h1 tabindex="-1">Desbloquear o CashFlow</h1>
            <p class="muted">Seus dados e credenciais estão cifrados neste navegador. Digite sua senha local para abri-los.</p>
            <label class="field">
              <span class="field__label">Senha local</span>
              <span class="input-group input-group--action">
                ${o("lock")}
                <input class="input" type="password" name="passphrase" autocomplete="current-password" required ${t?r`aria-invalid="true" aria-describedby="unlock-error"`:""} />
                <button type="button" class="icon-btn icon-btn--sm input-group__action" data-action="reveal" aria-label="Mostrar/ocultar senha">${o("eye")}</button>
              </span>
            </label>
            ${t?r`<div class="callout callout--danger" role="alert" id="unlock-error">${o("alert")}<div>${t}</div></div>`:""}
            <button type="submit" class="btn btn--primary btn--lg btn--block" ${s?"disabled":""}>${o(s?"refresh":"unlock",s?"spin":"")}${s?"Derivando chave…":"Desbloquear"}</button>
            <div class="row-between wrap">
              <button type="button" class="btn btn--ghost btn--sm" data-action="forgot">${o("help")}Esqueci a senha local</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="demo">${o("sparkle")}Ver demonstração</button>
            </div>
          </form>
        </main>
      </div>`),e.querySelector('input[name="passphrase"]')?.focus()},i=async a=>{if(a.preventDefault(),s)return;const c=e.querySelector('input[name="passphrase"]')?.value??"";if(!c){t="Digite sua senha local.",n();return}s=!0,t=null,n();try{await m(c)}catch(u){l++,s=!1,t=u instanceof b?u.message:"Não foi possível desbloquear. Tente novamente.",l>=3&&(t+=" Se esqueceu a senha, não há como recuperá-la — apague os dados locais e configure novamente."),n()}},p=d(e,"click",{reveal:()=>{const a=e.querySelector('input[name="passphrase"]');a&&(a.type=a.type==="password"?"text":"password")},demo:()=>y(),"cycle-theme":a=>{h(a.dataset.value),n()},forgot:async()=>{await g({title:"Apagar todos os dados locais?",message:"A senha local não pode ser recuperada — ela é a única forma de abrir o cofre. Apagar os dados remove credenciais, cache financeiro, categorização e layout deste navegador. Seus dados na Pluggy não são afetados.",confirmLabel:"Apagar tudo",danger:!0,requireText:"APAGAR"})&&await v()}});return e.addEventListener("submit",i),n(),()=>{p(),e.removeEventListener("submit",i)}}export{S as mountLock};
