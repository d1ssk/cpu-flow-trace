# Development guide

How a CPU Works is developed in this repository as `cpu-flow-trace`, using React, TypeScript, and Vite.

## Run locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open the printed local URL at `/en/` or `/ja/`.

The home page executes TD4 programs through connected circuitry. It starts in MOS mode with power wires, a settled reset state, and the Count up program. The CPU starts paused. **Play** runs continuously; **Pause** immediately freezes observation time and all signals in flight. **Step one instruction** animates one clock cycle and pauses when propagation finishes; from mid-cycle it finishes only the current instruction. **Inspect signal steps** exposes event and time stepping within an instruction.

Playback defaults to 1×, advancing two milliseconds of model time per wall-clock millisecond (the former 2× rate). The home and module pages share the 0.125×, 0.25×, 0.5×, 1×, 2×, and 4× options. Manual time steps retain their displayed model-time duration.

The [workbench](../workbench/README.md) remains a separate prototype. Neither the main site nor its build reads files from it.

## Repository structure

| Directory | Purpose |
| --- | --- |
| `src/app/` | Routing, shared layout, and language switching |
| `src/pages/` | Home page, article index, and article placeholders |
| `src/simulator/` | Event timing, wire propagation, and circuit evaluation |
| `src/circuits/` | TD4 netlist, layout, generated circuits and their build sources; NAND lesson circuits |
| `src/visualization/` | SVG rendering, inputs, outputs, playback, and inspection |
| `src/td4/` | Instruction definitions, assembler, and sample programs |
| `src/articles/` | Article order, groups, and bilingual titles and descriptions |
| `src/i18n/` | English and Japanese interface text |
| `src/styles/` | Site and circuit styles |
| `public/` | Static site assets, including the favicon |
| `tests/e2e/` | Browser tests against the built site |
| `scripts/` | Build helpers and static route generation |
| `docs/` | Architecture and contribution guides |
| `workbench/` | Standalone circuit prototypes and their tests |

Article bodies and their rendering infrastructure will be added as the articles are written. The current article pages are placeholders.

## Validate changes

```sh
npm run check:cpu
npm test
npm run build
npm run test:e2e
npm run test:e2e:dev
```

The browser tests use Python 3 to serve `dist/` and Playwright to automate the browser. On macOS, the configuration uses an installed Google Chrome when available. Otherwise, install Chromium:

```sh
npx playwright install chromium
```

`test:e2e:dev` runs the CPU browser tests against `npm run dev`, including Vite's development-time loading of circuit JSON. It does not require a production build.

The tests cover language switching, program selection and editing, signal propagation, playback controls, keyboard interaction, article navigation, direct access and reloads, and mobile layout. Screenshots are saved in `test-results/`.

## Build and host

```sh
npm run build
npm run preview
```

Deploy `dist/` to a static host. The build generates an `index.html` for `/ja/`, `/en/`, each article route, and all nine `/modules/<id>/` routes in both languages, so these pages can be opened directly without SPA fallback rules. These files are entry points for client-side rendering, not prerendered article content.

For hosting under a subdirectory, set the base path at build time:

```sh
SITE_BASE=/cpu-flow-trace/ npm run build
```

Article routes are generated automatically from `src/articles/index.ts`. Add other page routes to `scripts/static-routes.mjs` when needed.

The build produces a local artifact; this workflow does not deploy the site.

## Circuit data

`src/circuits/td4/build/` contains the source templates, layout and routing algorithms. `src/circuits/td4/generated/` contains nine modules × three constructions (module, NAND, MOS), all with 1.3-unit wires. Both MOS supply displays share the same data and simulator.

```sh
npm run generate:cpu   # regenerate only when sources or artifacts changed
npm run check:cpu      # fail if generated data is stale, missing, or corrupt
```

`npm run dev` and `npm run build` check generation automatically. The development server watches circuit sources and regenerates before reloading. Do not edit generated JSON directly. The browser loads only the selected construction; an independent module page loads only its own circuit. Routing code is excluded from the browser bundle.

The original workbench keeps its own commands (`generate:td4-details`, `watch:td4-details`, `check:td4-details`, `test:workbench`); run these when changing that prototype.

## Design and contributions

- [Architecture and integration plans](architecture.md)
- [Adding circuits and articles](contributing.md)
- [Workbench documentation](../workbench/README.md)

## Sample program sources

The standard TD4 versions of the blinking LED and ramen timer programs come from [this TD4 implementation page](https://xyama.sakura.ne.jp/hp/4bitCPU_TD4.html). The C-like representations are explanatory pseudocode, not executable inputs to the simulator.
