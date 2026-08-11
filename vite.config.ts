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
    alias: {
      '@': resolve(import.meta.dirname, 'src'),

      /**
       * KaTeX's HTML parser, in its DOM-free form.
       *
       * `hast-util-from-html-isomorphic` — reached through rehype-katex —
       * builds `new DOMParser()` at module scope under its `browser`
       * condition. In the render worker that throws before any math is
       * rendered, and because the client falls back rather than failing, the
       * only symptom was that every document containing `$$` quietly rendered
       * on the main thread at main-thread speed. The parse5 build it uses
       * everywhere else does the same job with no DOM.
       */
      'hast-util-from-html-isomorphic': resolve(
        import.meta.dirname,
        'node_modules/hast-util-from-html-isomorphic/index.js',
      ),

      /**
       * The entity decoder, in its DOM-free form.
       *
       * `decode-named-character-reference` ships two builds and its `browser`
       * condition picks the one that decodes entities with
       * `document.createElement('i')` — at module scope. remark-parse depends
       * on it, so importing the pipeline anywhere without a DOM throws
       * `document is not defined` before a line of it runs, which is precisely
       * what happened the first time the render worker started. The package
       * offers a `worker` condition for exactly this, but a worker built from
       * the client config still resolves as a browser.
       *
       * Aliased globally rather than for the worker alone, because `src/core`
       * claims to be DOM-free and worker-ready, and a dependency quietly
       * reaching for `document` makes that claim false everywhere it is
       * relied on. The table-based build costs a few KB in a chunk that is
       * lazily loaded anyway.
       */
      'decode-named-character-reference': resolve(
        import.meta.dirname,
        'node_modules/decode-named-character-reference/index.js',
      ),
    },
  },
  worker: {
    /**
     * Module workers, not IIFE.
     *
     * Vite's default bundles a worker into one classic script, which means
     * *inlining every dynamic import it can reach*. For the render worker that
     * is KaTeX and every Shiki grammar — several megabytes, downloaded before
     * the first document appears, and fatal besides: KaTeX touches `document`
     * at module scope, so the worker threw `document is not defined` on start
     * and every render quietly fell back to the main thread. The fallback
     * worked, which is exactly what made it easy to miss.
     *
     * As ES, the dynamic imports stay dynamic: math loads for documents with
     * math, a grammar loads for a language that appears.
     */
    format: 'es',
  },
  build: {
    // Public repo, unobfuscated bundle — but source maps are deliberately off.
    // See "Decisions locked" in the plan: verifiability comes from the repo and
    // observable network behavior, not from shipping maps.
    sourcemap: false,

    // Vite inlines assets under 4KB as data: URIs, which silently turns KaTeX's
    // smaller font files into `data:font/woff2` and gets them refused by
    // `font-src 'self'`. Loosening the CSP to `font-src 'self' data:` would fix
    // the symptom; keeping every font a real same-origin file keeps the
    // directive meaning what it says.
    assetsInlineLimit: (filePath) => !/\.(woff2?|ttf|otf|eot)$/i.test(filePath),
  },
});
