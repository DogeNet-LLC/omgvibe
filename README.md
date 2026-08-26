# omgvibe
*Languages: [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)*

`omgvibe` is an interactive NPX wizard that connects **CodeX**, **Claude Code**,
**OpenCode**, or **CodeWhale** to OhMyGPT's unified `/v1` API. It handles language
selection, CLI installation, endpoint latency testing, safe backups, and writes
the correct API key and model configuration for you.

## Highlights
- Zero-install: run everything in one command with `npx omgvibe`
- Guided flow in English, 简体中文, and 日本語 with automatic locale detection
- **Default target is CodeX** (Claude Code, OpenCode, and CodeWhale are one pick away)
- Re-runs the official `npm install -g` for the CLI you choose
- Probes `GET /v1/models` on all three relay endpoints (5 attempts each) and
  auto-selects the reachable endpoint with the lowest average latency
- Writes a full model catalog where supported (CodeX `models.json`) and the
  default/recommended models for every target
- Creates timestamped `.bak` backups before touching any existing config

## Quick Start
1. Make sure you have Node.js 18+ and npm installed.
2. Run the wizard:
   ```bash
   npx omgvibe
   ```
3. Choose your language, then pick the CLI to configure (**CodeX** is the default).
4. Confirm whether the wizard should run the official `npm install -g` for that CLI.
5. Paste your OhMyGPT API key (create one at <https://www.ohmygpt.com/apis/keys>).
6. Review the endpoint latency results and confirm the pre-selected fastest endpoint.
7. Pick your default model(s) and confirm the write.

> Backups are written next to the original files with names like
> `config.toml.20250101-103000.bak`, so you can roll back instantly.

## Relay endpoints

OhMyGPT is served from three direct `/v1` endpoints. The wizard tests them all and
pre-selects the fastest reachable one:

| Endpoint | Target audience |
| --- | --- |
| `https://apic1.ohmycdn.com` | Cloudflare Enterprise CDN — outside mainland China && outside the US |
| `https://api.ohmygpt.com` | US direct — within the United States |
| `https://cn2us02.opapi.win` | China-optimized CDN — mainland China |

## What Gets Configured

### CodeX (Responses API)
- Install/update `@openai/codex`
- `~/.codex/config.toml` — provider `omg`, `wire_api = "responses"`, base URL
  `https://<endpoint>/v1`, and `experimental_bearer_token = "<your API key>"`
- `~/.codex/models.json` — full model catalog; defaults to `gpt-5.6-sol`,
  `gpt-5.6-terra`, `gpt-5.6-luna`, plus every Responses-capable model
  (Together/Ali/Tencent/DeepSeek/Fireworks)
- Optional full reset: move the whole `~/.codex` to `~/.codex-backup-<timestamp>`
  and rebuild a fresh folder — offered when you hit 400 errors or a missing
  model list. Your CodeX chat history is preserved in the backup folder.

### Claude Code (Messages API)
- Install/update `@anthropic-ai/claude-code`
- `~/.claude/settings.json` — `env` block pointing at OhMyGPT with
  `ANTHROPIC_MODEL` and the Opus/Sonnet/Haiku slots defaulting to
  `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`

### OpenCode (Chat Completions API)
- Install/update `opencode-ai`
- `~/.config/opencode/opencode.json` — custom `omg` provider
  (`@ai-sdk/openai-compatible`) with most supported models pre-registered

### CodeWhale (Chat Completions API)
- Install/update `codewhale`
- `~/.codewhale/config.toml` — `provider = "openai"` with OhMyGPT `base_url`;
  defaults to `alibaba:deepseek/deepseek-v4-flash-0731` (and offers
  `alibaba:deepseek/deepseek-v4-pro-0813` plus the rest)

See [Supported models](./docs/supported-models.md) for the full catalog and the
per-CLI defaults.

## Reference docs
- CodeX: [`docs/cli-docs/ds-codex.md`](./docs/cli-docs/ds-codex.md)
- Claude Code: [`docs/cli-docs/ds-claudecode.md`](./docs/cli-docs/ds-claudecode.md)
- OpenCode: [`docs/cli-docs/opencode-config-docs.md`](./docs/cli-docs/opencode-config-docs.md)
- CodeWhale: [`docs/cli-docs/codewhale-config.md`](./docs/cli-docs/codewhale-config.md)

## Localization
- Default README: English (this file)
- 中文文档: [README.zh-CN.md](README.zh-CN.md)
- 日本語ドキュメント: [README.ja.md](README.ja.md)

The CLI follows the same translation set and defaults to your system locale.

## Development
```bash
npm install     # install dependencies
npm run lint    # type-check the project
npm run build   # compile TypeScript to dist/
```

Run the CLI locally with `node dist/index.js` after building.

## Support & Feedback
- API keys & billing: <https://www.ohmygpt.com/apis/keys>
- Issues and feature requests: open a ticket in your repository or contact help@ohmygpt.com

`omgvibe` is released under the MIT License (see [LICENSE](LICENSE)).
