import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

/**
 * CashFlow — configuração do Vite.
 *
 * - Não existe backend próprio. O app chama https://api.pluggy.ai diretamente do navegador.
 * - O "proxy local" abaixo existe APENAS como alternativa caso a Pluggy bloqueie CORS para o seu navegador.
 *   Ele roda na SUA máquina (npm run dev / npm run preview), apenas repassa as requisições para a Pluggy,
 *   não registra corpo nem cabeçalhos e não armazena nada. Ative-o em Configurações → Pluggy → Modo de conexão.
 */
const PLUGGY_API = 'https://api.pluggy.ai';

const pluggyProxy: Record<string, ProxyOptions> = {
  '/pluggy-api': {
    target: PLUGGY_API,
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/pluggy-api/, ''),
  },
};

/**
 * Content-Security-Policy aplicada somente no build de produção
 * (o servidor de desenvolvimento precisa de websocket/HMR).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.pluggy.ai",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.pluggy.ai https://*.pluggy.ai",
  "frame-src https://connect.pluggy.ai https://*.pluggy.ai",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'cashflow-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [cspPlugin()],
  server: {
    port: 5173,
    proxy: pluggyProxy,
  },
  preview: {
    port: 4173,
    proxy: pluggyProxy,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
