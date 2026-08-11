import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error -- plain .mjs config, shared with node scripts that can't read TS
import { cspDevHeader, cspProdMeta, securityHeaders } from './csp.config.mjs';

const CSP_META_PLACEHOLDER = '%CSP%';

/**
 * Applies the CSP in all three places it has to exist:
 *   dev   -> response header on the dev server (relaxed, HMR needs it)
 *   build -> <meta> tag, so the policy survives hosts that drop custom headers
 *   build -> dist/_headers, the real header for Cloudflare Pages / Netlify
 */
function csp(): Plugin {
  return {
    name: 'localmd-csp',

    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', cspDevHeader);
        next();
      });
    },

    transformIndexHtml(html, ctx) {
      // Dev gets the policy via response header instead — a strict meta tag would
      // break HMR. Strip the whole tag rather than emptying it; an empty content
      // attribute is an invalid policy and browsers log it as an error.
      if (ctx.server) {
        return html.replace(/^\s*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/m, '');
      }
      return html.replace(CSP_META_PLACEHOLDER, cspProdMeta);
    },

    // Emitted rather than copied from public/ so the policy can't drift from csp.config.mjs.
    writeBundle(options) {
      const dir = options.dir ?? resolve(process.cwd(), 'dist');
      const body = Object.entries(securityHeaders)
        .map(([name, value]) => `  ${name}: ${value}`)
        .join('\n');
      writeFileSync(resolve(dir, '_headers'), `/*\n${body}\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), csp()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  build: {
    // Public repo, unobfuscated bundle — but source maps are deliberately off.
    // See "Decisions locked" in the plan: verifiability comes from the repo and
    // observable network behavior, not from shipping maps.
    sourcemap: false,
  },
});
