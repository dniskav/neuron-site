<h1 align="center">neuron-site</h1>

<p align="center">
  <b>Neural networks you can watch learn.</b><br/>
  The interactive website for <a href="https://www.npmjs.com/package/@dniskav/neuron"><code>@dniskav/neuron</code></a>, a hand-built neural network library in pure TypeScript with zero dependencies.
</p>

<p align="center">
  <a href="https://neuron.dniskav.com"><b>Live site</b></a> ·
  <a href="https://dniskav.github.io/neuron-site/">GitHub Pages preview</a> ·
  <a href="https://www.npmjs.com/package/@dniskav/neuron">npm</a> ·
  <a href="https://github.com/dniskav/neuron">Library</a> ·
  <a href="./ARCHITECTURE.md">Architecture</a>
</p>

<p align="center">
  <img alt="Astro" src="https://img.shields.io/badge/Astro-static-BC52EE?logo=astro&logoColor=white" />
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white" />
  <img alt="Deploy" src="https://github.com/dniskav/neuron-site/actions/workflows/pages.yml/badge.svg" />
</p>

---

## What is this?

Most explanations of neural networks stop at formulas. This site lets you **see one learn**: a neuron answers, gets corrected, and its weights visibly change. Every drawing reads a **real model** from `@dniskav/neuron`: structure, weights, bias, inputs and outputs. Nothing on screen is invented or faked.

The audience is not technical, so there is no jargon or math on screen. The real code is one click away (the `</>` icon), and what the network has learned is one click away too (the brain icon).

## What you can do

| Screen | What happens |
| --- | --- |
| **Neuron** | Meet a single neuron and watch it answer. |
| **Teach it** | Train it yourself: answer, get corrected, see the weights move. |
| **Team** | A small network of neurons learns together, and every neuron reacts when it learns. |
| **Where will it land?** | Teach a network to place a ball on a palette. |
| **Snake** | A 3-neuron network learns to play Snake from rewards alone. A second level adds three hand-computed numbers (how much room is left) and the network learns when to trust them. |
| **Games / History** | More experiments and the story behind neural networks. |

The site is in Spanish (default) with an English route prepared under `/en/`.

## Design principles

1. **What is in the code is what you see.** Each visualization is driven by a real `NetworkN` / `NeuronN` instance, never a mock.
2. **Learning = answer and get corrected.** The correction travels backwards in proportion to the real weight change (Δw).
3. **Friendly to AI agents.** Static, semantic HTML that reads without JS, plus `llms.txt`, JSON-LD and a sitemap.
4. **Frozen visual spec.** The approved design lives in `reference/prototype-v3.html`; any difference from it is a bug.

## Tech

- [Astro](https://astro.build) in static output mode, strict TypeScript, no UI framework (islands are vanilla TS scripts bundled by Vite)
- Hand-written canvas visualizations in `src/viz/` (pure TypeScript, no Astro or global DOM; can be extracted as a package)
- `@dniskav/neuron` consumed from npm and bundled, not loaded from a CDN
- Plain CSS with design tokens, dark theme
- Vitest for the visualization layer and model-parity checks
- GitHub Actions deploying to GitHub Pages

## Run it locally

```sh
bun install
bun run dev      # dev server
bun run test     # vitest
bun run build    # astro check + static build into dist/
```

npm works too. Architecture, principles and folder structure: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Deployment

- **Production:** `dist/` is static and served at [neuron.dniskav.com](https://neuron.dniskav.com).
- **GitHub Pages:** every push to `main` runs `.github/workflows/pages.yml`, which builds with `GITHUB_PAGES=true` (setting the `/neuron-site` base path) and publishes to <https://dniskav.github.io/neuron-site/>.

## Author

Built by [Daniel Silva](https://dniskav.com) ([@dniskav](https://github.com/dniskav)), Senior Full-Stack Engineer focused on AI-native development.
