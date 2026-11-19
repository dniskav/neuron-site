# neuron-site

Web de [`@dniskav/neuron`](https://www.npmjs.com/package/@dniskav/neuron), publicada en [neuron.dniskav.com](https://neuron.dniskav.com). Astro en modo estático, TypeScript estricto y la librería consumida desde npm.

## Comandos

```sh
bun install
bun run dev      # servidor de desarrollo
bun run build    # astro check + build estático
bun run test     # vitest
```

`dist/` es estático: se sirve tal cual en neuron.dniskav.com (Caddy o nginx).

Arquitectura, principios y estructura: [ARCHITECTURE.md](./ARCHITECTURE.md).
