# omgvibe

*Languages: [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)*

Run Claude Code, Codex, opencode and other coding agents on [OhMyGPT](https://www.ohmygpt.com) with one command.

```bash
npm install -g omgvibe
ov claude
```

The first run asks for your OhMyGPT API key, measures the regional endpoints and keeps the fastest. After that the command starts the agent already connected: your key, the endpoint and the model arrive as flags and environment variables for that session, and the agent's own config files are not touched.

`ov` is the short name of `omgvibe`; both are installed and run the same program. To try it without installing anything:

```bash
npx omgvibe claude
```

Needs Node.js 20.12 or newer.

## Commands

| Command | What it does |
| --- | --- |
| `ov` | Opens a menu with everything below |
| `ov <agent> [args…]` | Starts an agent on OhMyGPT for this session |
| `ov setup [agent…]` | Writes OhMyGPT into an agent's own config, so it works without omgvibe |
| `ov reset [agent…]` | Undoes what `setup` changed |
| `ov login` / `logout` | Saves or removes your API key |
| `ov models [search…]` | Lists the models you can use, with context window and price |
| `ov status` | Shows sign-in, endpoint and installed agents |
| `ov doctor` | Checks the key, the endpoint and all three API protocols, free of charge |
| `ov endpoint [region\|url\|auto]` | Measures the endpoints and chooses one |
| `ov update` | Updates omgvibe |

## Agents

| Command | Agent | Protocol | `setup` |
| --- | --- | --- | --- |
| `ov claude` | [Claude Code](https://code.claude.com/docs) | Anthropic Messages | yes |
| `ov codex` | [Codex](https://developers.openai.com/codex) | OpenAI Responses | yes |
| `ov opencode` | [opencode](https://opencode.ai) 1.x and 2.x | OpenAI Chat Completions | yes |
| `ov kilo` | [Kilo Code](https://kilo.ai) | OpenAI Chat Completions | yes |
| `ov qwen` | [Qwen Code](https://github.com/QwenLM/qwen-code) | OpenAI Chat Completions | session only |
| `ov pi` | [Pi](https://pi.dev) | OpenAI Chat Completions | yes |
| `ov codewhale` | [CodeWhale](https://github.com/codewhale-hq/CodeWhale) | OpenAI Chat Completions | yes |

If the agent is not installed, omgvibe shows its install commands and, in a terminal, offers to run one.

Arguments after the agent's name go to the agent unchanged, starting at the first one that is not an omgvibe option:

```bash
ov claude -p "review this diff"
ov codex --model openai/gpt-5.5 exec "fix the failing test"
ov claude -- --model opus        # after --, even --model goes to Claude Code
```

[docs/agents.md](docs/agents.md) lists exactly what each agent receives.

## Choosing a model

Every chat model on OhMyGPT accepts all three protocols, so any of them works in any agent.

```bash
ov models                 # all chat models, strongest first
ov models claude sonnet   # search
ov codex --model zhipu/glm-5.3
ov opencode --pick        # choose from a searchable list; the choice is remembered
```

Model IDs come from the live catalog (`GET /v1/models`), which changes every week, so omgvibe ships no model list. A mistyped name is corrected (`claude-sonet-5-5` → `anthropic/claude-sonnet-5-5`); a version that does not exist is never swapped for one that does.

With no `--model`:

- **Claude Code** keeps its own default and its `opus`, `sonnet` and `haiku` aliases. OhMyGPT accepts the Claude model names it sends.
- **Codex** uses `openai/gpt-6.1-terra`; the other agents use `deepseek/deepseek-v4.1-flash-1017`. If one of these is retired, its successor from the catalog is used.
- A model you chose with `--pick`, in the menu or in `setup` is remembered for that agent.

## Session or setup

`ov <agent>` changes nothing on disk. It is the right choice when you also use the agent with another provider, or on a machine you do not want to reconfigure.

`ov setup` is for an agent you want on OhMyGPT however it is started: a plain `claude`, the Codex desktop app, an IDE extension.

```bash
ov setup claude codex     # or just `ov setup` to pick from a list
ov reset codex
```

`setup` edits only the settings it needs and leaves the rest of the file, comments included, as you wrote it. It shows the changes before applying them, keeps a copy of each file under `~/.omgvibe/backups/`, and records what every setting was before. `reset` puts those values back. A setting you changed after `setup` is left alone and reported.

## Signing in

`ov login` opens a page on ohmygpt.com where you click Authorize while signed in, and a new key comes straight back to the terminal. When the browser runs on another machine (SSH, a container) or `--no-browser` is given, the page shows the key and you paste it into the terminal; a key from the [API keys page](https://www.ohmygpt.com/keys) can be pasted there too. Either way the key is checked with one request and saved in `~/.omgvibe/config.json`, readable only by you.

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
ov endpoint          # measure and choose
ov endpoint cn2      # always use this one
ov endpoint auto     # back to the fastest
```

`--endpoint <region|url>` or `OHMYGPT_BASE_URL` sets the endpoint for one run. omgvibe's own requests go through `HTTPS_PROXY` / `HTTP_PROXY` and respect `NO_PROXY`, the same as the agents it starts, so the endpoint is measured over the route the agent will use.

## Checking the connection

```text
$ ov doctor
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

After an agent's name only `--model`/`-m`, `--pick`, `--endpoint`, `--key`, `--lang`, `--install` and `--yes` are omgvibe's, so `ov claude --help` shows Claude Code's help.

## If `ov` is already taken

`ov` is also the name of other programs, among them a terminal pager. If you have one of them:

- **In the directory npm installs commands into** (for example Node.js and the other `ov` both come from Homebrew): `npm install -g omgvibe` stops with `EEXIST` and installs nothing, because npm does not replace files it did not create. Remove or rename the other `ov`, or keep using `npx omgvibe`.
- **Somewhere else, earlier on `PATH`**: the install succeeds, and `ov` goes on running the other program. Use `omgvibe` instead, or move npm's bin directory (`npm prefix -g`) to the front of `PATH`.

`omgvibe status` shows what `ov` runs on your computer.

## What omgvibe adds to requests

Where the agent allows custom headers, omgvibe names it in `X-OhMyGPT-Title` (for example `Claude Code`), with `HTTP-Referer` and `X-OhMyGPT-Categories: cli-agent`. Nothing else is added.

ov sends no telemetry. At most once a day it asks the npm registry whether a newer version exists; `OMGVIBE_NO_UPDATE_CHECK=1` turns that off.

## Coming from 0.2

1.0 replaces the wizard with commands, and adds the short name `ov`. `ov` with no arguments still opens a guided menu.

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
