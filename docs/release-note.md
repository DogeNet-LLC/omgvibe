# Release Notes & Publishing Guide

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
