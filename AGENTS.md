# Repository Guidelines

## Project Structure & Module Organization

- `src/core/` contains Atari 2600 emulation logic: CPU, TIA video, RIOT, bus, cartridge, and audio.
- `src/platform/` contains browser adapters for audio and keyboard input; keep browser APIs out of `src/core/`.
- `src/main.ts` connects the emulator to the HTML canvas and page controls in `index.html`.
- `tests/` contains Vitest suites. ROM fixtures belong in `tests/fixtures/` and should not be reformatted.
- `public/` holds static web assets. `src-tauri/` contains the Rust desktop shell and Tauri configuration.

## Build, Test, and Development Commands

Use Node.js 22.12+ and npm.

- `npm install` installs dependencies.
- `npm run dev` starts Vite at `http://localhost:9000`.
- `npm run build` type-checks TypeScript and emits the web build to `dist/`.
- `npm test` runs all Vitest tests once.
- `npm run typecheck` runs TypeScript checks without building.
- `npm run lint` runs Biome linting.
- `npm run desktop:dev` starts the Tauri shell; `npm run desktop:build` creates a native installer for the host platform.

## Coding Style & Naming Conventions

Write strict TypeScript with two-space indentation, single quotes, and no unused locals or parameters. Use `camelCase` for functions and variables, `PascalCase` for classes and types, and descriptive lower-case file names such as `cpu6507.ts`. Keep emulation behavior deterministic and model hardware concerns in focused modules rather than expanding UI code. Biome performs linting; no automatic formatter is configured, so preserve the surrounding style.

## Testing Guidelines

Place tests in `tests/` as `*.test.ts`, named for the subsystem being verified (for example, `tia.test.ts`). Add regression tests whenever CPU instructions, timing, cartridge mapping, audio, or input behavior changes. Run `npm test`, `npm run typecheck`, and `npm run lint` before opening a pull request.

## Commit & Pull Request Guidelines

Use short imperative commit subjects, matching existing history: `Add CI pipeline with Biome lint, typecheck, test, build`. Keep commits focused. Pull requests should summarize the behavioral change, list validation commands, link related issues when available, and include a screenshot or recording for visible UI changes. Do not include copyrighted ROMs; only commit small, legally distributable test fixtures.
