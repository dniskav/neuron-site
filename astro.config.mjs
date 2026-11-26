import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** El prototipo congelado solo se sirve en desarrollo (/__ref/prototype.html) para comparar lado a lado: no se despliega. */
const stripRef = () => ({
  name: 'strip-ref',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await rm(fileURLToPath(new URL('__ref', dir)), { recursive: true, force: true });
    },
  },
});

/** Producción: neuron.dniskav.com (raíz). Vista previa en GitHub Pages: dniskav.github.io/neuron-site (el workflow pone GITHUB_PAGES=true). */
const pages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  site: pages ? 'https://dniskav.github.io' : 'https://neuron.dniskav.com',
  base: pages ? '/neuron-site' : '/',
  output: 'static',
  integrations: [sitemap(), stripRef()],
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
