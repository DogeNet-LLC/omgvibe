# Release Notes & Publishing Guide

## v0.2.0
- **Default target is now CodeX** with a 4-way target picker: CodeX (default),
  Claude Code, OpenCode (`opencode-ai`), and CodeWhale (`codewhale`).
- Switched from special-pricing routes to the unified direct `/v1` endpoints.
- Added automatic endpoint latency testing: probes `GET /v1/models` five times on
  each of `apic1.ohmycdn.com`, `api.ohmygpt.com`, and `cn2us02.opapi.win`, and
  pre-selects the reachable endpoint with the lowest average latency.
- CodeX now writes `~/.codex/models.json` (full Responses-capable catalog) and
  defaults to `gpt-5.6-sol` / `gpt-5.6-luna` / `gpt-5.6-terra`; the catalog path
  in `config.toml` is absolute to avoid tilde-resolution issues. The API key is
  stored directly in `config.toml` as `experimental_bearer_token` (no separate
  `auth.json`). Also adds an optional whole-folder reset: `~/.codex` is moved to
  `~/.codex-backup-<ts>` and rebuilt fresh, for stale-state 400 errors or missing
  models (history preserved).
- Claude Code defaults to `claude-opus-5` / `claude-sonnet-5` / `claude-fable-5`
  with a multi-select for additional models.
- OpenCode writes a custom `omg` provider (`@ai-sdk/openai-compatible`) with most
  supported models pre-registered.
- CodeWhale writes `~/.codewhale/config.toml` defaulting to
  `alibaba:deepseek/deepseek-v4-flash-0731`.
- Added provider/model catalogs for Together AI, Alibaba Cloud, Tencent Cloud,
  DeepSeek, Anthropic, and Fireworks (see `docs/supported-models.md`).

## v0.1.2
- Added GitHub metadata links to the npm package manifest
- Placed language switcher links at the top of each README variant
- Improved API key prompt layout to place masked input on its own line

## v0.1.1
- Default CodeX model now points to `gpt-5-codex` for better coding performance
- Added an opt-out for re-running `npm install -g` so users can keep existing CLI versions

## v0.1.0
- Initial public release of `omgvibe`
- Interactive NPX wizard with English/Chinese/Japanese localization
- CodeX support with model selection (`gpt-5`, `gpt-5-codex`)
- Claude Code support with configurable OhMyGPT base URL
- Automatic backups (timestamped `.bak`) for all touched config files

---

## Publish Checklist
1. **Update version** in `package.json` and propagate any README or documentation changes as needed.
2. **Review translations** in `src/index.ts` to ensure new strings exist in all languages.
3. Run the quality gates:
   ```bash
   npm run lint
   npm run build
   node dist/index.js   # optional: run through prompts locally
   ```
4. **Smoke test** the generated CLI locally:
   - `node dist/index.js`
   - Walk through both CodeX and Claude Code flows using disposable config folders if needed.
5. Commit and tag: `git commit -am "chore: release vX.Y.Z"` then `git tag vX.Y.Z`.
6. **Publish to npm**:
   ```bash
   npm login
   npm publish --access public
   ```
7. Verify from a clean machine (or using `npm pack`) that `npx omgvibe@latest` runs as expected.

## Post-Release Maintenance
- Document changes in this file for every release (new header per version).
- Update screenshots or additional docs if the flow changes significantly.
- Monitor user feedback (issues, help@ohmygpt.com) for bug fixes or localization requests.
- For hotfixes, increment the patch number, rebuild, test, and republish using the same checklist.
