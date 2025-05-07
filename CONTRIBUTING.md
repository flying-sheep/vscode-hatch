# How to contribute

## Understanding the setup

The scripts in `packagage.json` are used to manage this project.

- running `yarn install` runs the `postinstall` script, which.
  1. sets up `pre-commit` scripts that run `lint`s (see below) before each `git commit`.
  2. downloads `src/vscode-python-environments.ts` which isn’t published to npm yet.
- `watch` and `compile` can be used to compile the TypeScript sources,
  but “Run Extension” in `.vscode/launch.json` also runs `watch` for you.
- `lint` runs the following:
  - `lint:check` runs the Biome linter and formatter.
  - `lint:style` runs the ESLint linter (which also sorts imports).
  - `lint:deps` runs `depcheck` to see if we have superfluous dependencies.
- `vsce-package` builds the VS Code extension.
