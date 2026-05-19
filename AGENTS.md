# Agent Project Notes

## Goal

- Build a local, extensible AI assistant inspired by OpenClaw.
- Prioritize fast local iteration, clear release paths, and safe tool execution.
- Keep the architecture product-oriented: CLI, local server, agent runtime, auth profiles, tools/plugins, and optional UI.

## Language Choice

- Use TypeScript as the primary language.
- Use Python as an optional sidecar/tool runtime, not the core application language.
- Keep Python useful for data analysis, PDF/Office processing, local ML, embeddings/reranking, scientific scripts, and user-defined tools.
- Existing local Miniconda can be used for Python tool sandboxes, though `uv` is also a good option for reproducible Python workers.

## Recommended Stack

- Package manager: `pnpm`.
- Repo style: pnpm workspace / monorepo.
- Development runtime: `tsx` for running TypeScript directly during development.
- Build output: compile to `dist/` for release.
- CLI entry: publish a Node CLI package with a `bin` entry.
- Web/API server: TypeScript, likely Fastify or Hono.
- UI: React + Vite if/when a control UI is needed.