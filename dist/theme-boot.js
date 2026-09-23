// Aplica a preferência de tema antes da primeira pintura.
// Lê SOMENTE a preferência de tema (valor não sensível) do localStorage.
(function () {
  try {
    var pref = localStorage.getItem('cashflow.theme') || 'system';
    if (pref !== 'light' && pref !== 'dark' && pref !== 'system') pref = 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.setAttribute('data-theme-pref', pref);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
