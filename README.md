# omgvibe

*Languages: [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)*

Run Claude Code, Codex, opencode and other coding agents on [OhMyGPT](https://www.ohmygpt.com) with one command.

```bash
npx omgvibe claude
```

The first run asks for your OhMyGPT API key, measures the regional endpoints and keeps the fastest. After that the command starts the agent already connected: your key, the endpoint and the model arrive as flags and environment variables for that session, and the agent's own config files are not touched.

Needs Node.js 20.12 or newer. To install it instead of using `npx`: `npm install -g omgvibe`.

## Commands

| Command | What it does |
| --- | --- |
| `omgvibe` | Opens a menu with everything below |
| `omgvibe <agent> [args…]` | Starts an agent on OhMyGPT for this session |
| `omgvibe setup [agent…]` | Writes OhMyGPT into an agent's own config, so it works without omgvibe |
| `omgvibe reset [agent…]` | Undoes what `setup` changed |
| `omgvibe login` / `logout` | Saves or removes your API key |
| `omgvibe models [search…]` | Lists the models you can use, with context window and price |
| `omgvibe status` | Shows sign-in, endpoint and installed agents |
| `omgvibe doctor` | Checks the key, the endpoint and all three API protocols, free of charge |
| `omgvibe endpoint [region\|url\|auto]` | Measures the endpoints and chooses one |
| `omgvibe update` | Updates omgvibe |

## Agents

| Command | Agent | Protocol | `setup` |
| --- | --- | --- | --- |
| `omgvibe claude` | [Claude Code](https://code.claude.com/docs) | Anthropic Messages | yes |
| `omgvibe codex` | [Codex](https://developers.openai.com/codex) | OpenAI Responses | yes |
| `omgvibe opencode` | [opencode](https://opencode.ai) 1.x and 2.x | OpenAI Chat Completions | yes |
| `omgvibe kilo` | [Kilo Code](https://kilo.ai) | OpenAI Chat Completions | yes |
| `omgvibe qwen` | [Qwen Code](https://github.com/QwenLM/qwen-code) | OpenAI Chat Completions | session only |
| `omgvibe pi` | [Pi](https://pi.dev) | OpenAI Chat Completions | yes |
| `omgvibe codewhale` | [CodeWhale](https://github.com/codewhale-hq/CodeWhale) | OpenAI Chat Completions | yes |

If the agent is not installed, omgvibe shows its install commands and, in a terminal, offers to run one.

Arguments after the agent's name go to the agent unchanged, starting at the first one that is not an omgvibe option:

```bash
omgvibe claude -p "review this diff"
omgvibe codex --model openai/gpt-5.5 exec "fix the failing test"
omgvibe claude -- --model opus        # after --, even --model goes to Claude Code
```

[docs/agents.md](docs/agents.md) lists exactly what each agent receives.

## Choosing a model

Every chat model on OhMyGPT accepts all three protocols, so any of them works in any agent.

```bash
omgvibe models                 # all chat models, strongest first
omgvibe models claude sonnet   # search
omgvibe codex --model zhipu/glm-5.3
omgvibe opencode --pick        # choose from a searchable list; the choice is remembered
```

Model IDs come from the live catalog (`GET /v1/models`), which changes every week, so omgvibe ships no model list. A mistyped name is corrected (`claude-sonet-5-5` → `anthropic/claude-sonnet-5-5`); a version that does not exist is never swapped for one that does.

With no `--model`:

- **Claude Code** keeps its own default and its `opus`, `sonnet` and `haiku` aliases. OhMyGPT accepts the Claude model names it sends.
- **Codex** uses `openai/gpt-5.5`; the other agents use `anthropic/claude-sonnet-5-5`. If one of these is retired, its successor from the catalog is used.
- A model you chose with `--pick`, in the menu or in `setup` is remembered for that agent.

## Session or setup

`omgvibe <agent>` changes nothing on disk. It is the right choice when you also use the agent with another provider, or on a machine you do not want to reconfigure.

`omgvibe setup` is for an agent you want on OhMyGPT however it is started: a plain `claude`, the Codex desktop app, an IDE extension.

```bash
omgvibe setup claude codex     # or just `omgvibe setup` to pick from a list
omgvibe reset codex
```

`setup` edits only the settings it needs and leaves the rest of the file, comments included, as you wrote it. It shows the changes before applying them, keeps a copy of each file under `~/.omgvibe/backups/`, and records what every setting was before. `reset` puts those values back. A setting you changed after `setup` is left alone and reported.

## Signing in

`omgvibe login` opens the [API keys page](https://www.ohmygpt.com/keys), takes the key you paste and checks it with one request. The key is saved in `~/.omgvibe/config.json`, readable only by you.

Without a saved key, omgvibe reads `OHMYGPT_API_KEY`. `--key` sets one for a single run. Order of precedence: `--key`, `OHMYGPT_API_KEY`, the saved key.

```bash
OHMYGPT_API_KEY=sk-... npx omgvibe claude -p "hello"     # CI, containers
```

## Endpoints

OhMyGPT serves the same API from several regions. omgvibe measures each one on a warm connection and uses the fastest, measuring again once a week.

| Region | Base URL |
| --- | --- |
| `cloudflare` Cloudflare global acceleration | `https://apic1.ohmycdn.com` |
| `us` US direct | `https://api.ohmygpt.com` |
| `asia` Asia optimized | `https://c-z0-api-01.hash070.com` |
| `cn2` Asia, optimized for mainland China | `https://cn2us02.opapi.win` |
| `sg` Singapore | `https://api-ep-sg1.ohmygpt.com` |
| `eu` Europe (Germany) | `https://api-ep-eu1.ohmygpt.com` |

```bash
omgvibe endpoint          # measure and choose
omgvibe endpoint cn2      # always use this one
omgvibe endpoint auto     # back to the fastest
```

`--endpoint <region|url>` or `OHMYGPT_BASE_URL` sets the endpoint for one run. omgvibe's own requests go through `HTTPS_PROXY` / `HTTP_PROXY` and respect `NO_PROXY`, the same as the agents it starts, so the endpoint is measured over the route the agent will use.

## Checking the connection

```text
$ omgvibe doctor
Checking your connection to OhMyGPT  US direct  https://api.ohmygpt.com
  ✓ Endpoint                         reachable, 128 ms
  ✓ API key                          valid, account #1
  ✓ Model list                       208 models
  ✓ OpenAI Chat Completions request  answered in 394 ms
  ✓ OpenAI Responses request         answered in 391 ms
  ✓ Anthropic Messages request       answered in 396 ms

Everything works.  These checks use the free test model and cost nothing.
```

The three requests go to `ohmygpt/mock`, the free test model. `status` and `doctor` take `--json`.

## Options

| Option | Meaning |
| --- | --- |
| `-m`, `--model <id>` | Model to use |
| `--pick` | Choose the model from a searchable list |
| `--endpoint <region\|url>` | Endpoint for this run |
| `--key <key>` | API key for this run |
| `--lang <en\|zh\|ja>` | Language; the default follows your system locale |
| `--install` | Install a missing agent without asking |
| `-y`, `--yes` | Accept defaults and never prompt |
| `--json` | Machine-readable output for `models`, `status`, `doctor`, `endpoint` |

After an agent's name only `--model`/`-m`, `--pick`, `--endpoint`, `--key`, `--lang`, `--install` and `--yes` are omgvibe's, so `omgvibe claude --help` shows Claude Code's help.

## What omgvibe adds to requests

Where the agent allows custom headers, omgvibe names it in `X-OhMyGPT-Title` (for example `Claude Code`), with `HTTP-Referer` and `X-OhMyGPT-Categories: cli-agent`. That is what lets [usage](https://www.ohmygpt.com/usage) be broken down per agent. Nothing else is added.

omgvibe sends no telemetry. At most once a day it asks the npm registry whether a newer version exists; `OMGVIBE_NO_UPDATE_CHECK=1` turns that off.

## Coming from 0.2

1.0 replaces the wizard with commands. `npx omgvibe` still opens a guided menu.

- The CodeX and Claude Code special-pricing channels have shut down and are gone.
- 0.2 replaced whole config files. 1.0 edits single settings and can undo them.
- 0.2 shipped a fixed model list. 1.0 reads the live catalog, whose IDs have the form `creator/model`.

Configs written by 0.2 keep working where the endpoints still exist. To clear them, restore the `.bak` file 0.2 left next to each config, or remove what it wrote: in `~/.codex/config.toml` the `model_provider = "omg"` line, the `[model_providers.omg]` table and `model_catalog_json`, plus `~/.codex/models.json`; in `~/.claude/settings.json` the `ANTHROPIC_*` entries under `env` and `apiKeyHelper`.

## Development

See [docs/development.md](docs/development.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Support

- Keys and billing: <https://www.ohmygpt.com/keys>
- Documentation: <https://www.ohmygpt.com/docs>
- Issues: <https://github.com/DogeNet-LLC/omgvibe/issues> or help@ohmygpt.com

MIT License. See [LICENSE](LICENSE).
