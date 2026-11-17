# Development

```bash
npm install
npm run dev -- --help     # run from source
npm run typecheck
npm test
npm run build             # bundles to dist/cli.mjs
node bin/omgvibe.mjs status
```

The published package is the two entry files in `bin/` plus one bundled file, with no runtime dependencies to install. `bin/omgvibe.mjs` checks the Node version before loading the bundle. `bin/ov.mjs` is the short name: it records that `ov` was typed and loads `bin/omgvibe.mjs`.

Every command line shown to the user goes through `cmd()` in `src/core/invocation.ts`, so it starts with what the user typed: `ov`, `omgvibe` or `npx omgvibe`. Do not write `omgvibe <command>` into a message.

## Layout

| Path | Contents |
| --- | --- |
| `src/cli.ts`, `src/args.ts` | Entry point and argument parsing |
| `src/commands/` | One file per command |
| `src/agents/` | One adapter per agent: how to launch it and what `setup` edits |
| `src/core/` | Endpoints, model catalog, HTTP client, config edits, setup bookkeeping |
| `src/i18n/` | English is the source; `zh.ts` and `ja.ts` must have the same keys or the type check fails |
| `tests/` | Unit tests, and end-to-end tests that run the CLI against `tests/helpers/mock-gateway.ts` |

## Adding an agent

Add `src/agents/<name>.ts` exporting an `AgentDefinition` and list it in `src/agents/index.ts`.

- `launch` must not write to the agent's own config. Use flags, environment variables, or a file from `input.scratch`, which is removed when the agent exits.
- Keep the key out of argument lists (they show in `ps`). Pass it by environment variable.
- `setup` returns edits, not file contents. Only the listed settings are written and each one is undone by `reset`.
- Add the agent to `tests/agents.test.ts` and `docs/agents.md`, then verify it against the real CLI as described below.

## Tests

`npm test` needs no network and no agent CLI. The end-to-end tests start a local mock gateway and put stand-in agent executables on `PATH`.

### Real agents, in a VM

Agent CLIs are tested in a [Lima](https://lima-vm.io) Ubuntu VM, not on your own machine, so your `~/.claude`, `~/.codex` and other configs stay out of it.

```bash
brew install lima
limactl create --name=omgvibe --tty=false --cpus=4 --memory=6 --containerd=none \
  --mount-only "$PWD" --mount-only "/tmp/omgvibe-vm:w" template://ubuntu-lts
limactl start omgvibe
limactl shell omgvibe
```

Inside the VM:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs bubblewrap
npm config set prefix ~/.npm-global && export PATH=~/.npm-global/bin:$PATH
npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai @kilocode/cli \
  @qwen-code/qwen-code @earendil-works/pi-coding-agent codewhale
npm install -g /tmp/omgvibe-vm/omgvibe-*.tgz        # from `npm pack` on the host
```

Then, cheapest first:

1. `ov doctor` — the free test model through all three protocols.
2. Each agent on the free test model: `ov qwen --model ohmygpt/mock "ping"`. It costs nothing and proves the agent's own request shape gets through the gateway. The mock answers every tool-carrying request with a tool call first, which Claude Code keeps following, so stop it once the reply is printed.
3. One short task per agent on the cheapest real model, to see a real tool call. `ov models flash` lists candidates.

Keep the key in a file inside the VM and pass it as `OHMYGPT_API_KEY`; do not put it in the repository.

To test the install that `npx omgvibe` offers before a release exists on npm, point it at the tarball: `OMGVIBE_PACKAGE_SPEC=/tmp/omgvibe-vm/omgvibe-1.0.0.tgz`.

## Release

1. Update `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. `npm run typecheck && npm test && npm run build` (also run by `prepublishOnly`).
3. `npm pack`, install the tarball in the VM and run the checks above.
4. `git tag v<version>`, then `npm publish`.
