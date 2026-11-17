# Changelog

## 1.0.0

A rewrite. The wizard that wrote config files is now a launcher with commands.

- **`ov`**, a short name installed next to `omgvibe` by `npm install -g omgvibe`. `npx omgvibe` still works without installing, and offers the install on first use.
- **`ov <agent>`** starts Claude Code, Codex, opencode (1.x and 2.x), Kilo Code, Qwen Code, Pi or CodeWhale on OhMyGPT for one session, without touching the agent's config. Arguments after the agent's name pass through.
- **`ov setup` / `reset`** write OhMyGPT into an agent's own config and take it back out. Only the needed settings are edited; comments and everything else in the file are kept; each change is recorded and can be undone.
- **Live model catalog.** Models, context windows and prices come from `GET /v1/models`. `--model` accepts any ID and corrects a mistyped name; `--pick` opens a searchable list; `ov models` lists and searches.
- **Six regional endpoints**, measured on a warm connection; the fastest is used and re-measured weekly. `ov endpoint` pins one.
- **`ov login`** checks the key before saving it. `OHMYGPT_API_KEY` and `--key` work without signing in.
- **`ov doctor`** checks the key, the endpoint and all three protocols against the free test model. **`ov status`** shows what is installed and set up.
- Codex: hosted web search is turned off for models that do not have it, which the gateway would otherwise reject.
- Claude Code: the real context window is passed for models that are not Claude's.
- Requests name the agent in `X-OhMyGPT-Title`.
- omgvibe's own requests honour `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`.
- English, 简体中文 and 日本語, following the system locale.
- One bundled file, no runtime dependencies. Requires Node.js 20.12 or newer.

Removed: the CodeX and Claude Code special-pricing channels, which have shut down; the built-in model list; the generated Codex `models.json`.

## 0.2.7 and earlier

- 0.2.x: default target CodeX; unified `/v1` endpoints with latency testing; OpenCode and CodeWhale targets; a generated Codex model catalog; a "Claude Models Only" target.
- 0.1.x: the first interactive wizard for CodeX and Claude Code, in English, Chinese and Japanese.
