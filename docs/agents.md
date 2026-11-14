# What each agent receives

`omgvibe <agent>` builds a launch from flags and environment variables, and `omgvibe setup <agent>` writes the same connection into the agent's config. This page lists both for every agent. `<endpoint>` is the chosen base URL (for example `https://api.ohmygpt.com`), `<key>` your API key and `<model>` the chosen model ID.

The source of truth is [`src/agents/`](../src/agents); each adapter links to the documentation it follows.

## Claude Code — `omgvibe claude`

Session: a settings file is written to `~/.omgvibe/run/`, passed with `--settings`, and removed when Claude Code exits. A file is used because a `env` block in `~/.claude/settings.json` overrides plain environment variables, while `--settings` ranks above it.

| Variable | Value |
| --- | --- |
| `ANTHROPIC_BASE_URL` | `<endpoint>` (no `/v1`; Claude Code appends `/v1/messages`) |
| `ANTHROPIC_AUTH_TOKEN` | `<key>` |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` | `1`, so `/model` lists the gateway's Claude models |
| `ANTHROPIC_CUSTOM_HEADERS` | the attribution headers |
| `ANTHROPIC_MODEL` | `<model>`, only when one is chosen |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`, `…_SONNET_MODEL`, `…_HAIKU_MODEL` | `<model>`, only for a model that is not Claude's |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | the model's context window, only for a model that is not Claude's |

`ANTHROPIC_API_KEY` is removed from the session's environment, so a real Anthropic key in your shell is never sent to another host.

Setup: the same variables under `env` in `~/.claude/settings.json`.

## Codex — `omgvibe codex`

Session: `-c key=value` overrides placed before your arguments, where Codex applies them to every subcommand. The key travels in `OHMYGPT_API_KEY`.

```text
-c model_provider="omgvibe"
-c model_providers.omgvibe.name="OhMyGPT"
-c model_providers.omgvibe.base_url="<endpoint>/v1"
-c model_providers.omgvibe.wire_api="responses"
-c model_providers.omgvibe.http_headers={ … }
-c model_providers.omgvibe.env_key="OHMYGPT_API_KEY"
-c model="<model>"
```

Two more overrides depend on the model:

- `-c web_search="disabled"` when the gateway offers no web search for the model. Codex declares that tool on every request, and the gateway rejects it for a model without it.
- `-c model_context_window=<n>` when the model's window is smaller than the 272,000 tokens Codex assumes for a model it has no metadata for.

Setup, in `~/.codex/config.toml`: `model`, `model_provider = "ohmygpt"`, `web_search = "disabled"` where it applies, and a `[model_providers.ohmygpt]` table that carries the key as `experimental_bearer_token`, so Codex needs no exported variable in the IDE extension or the desktop app.

## opencode — `omgvibe opencode`, Kilo Code — `omgvibe kilo`

Session: inline config in `OPENCODE_CONFIG_CONTENT` (`KILO_CONFIG_CONTENT` for Kilo Code), merged over your own config files. It defines a provider `ohmygpt` on `@ai-sdk/openai-compatible` with `baseURL` `<endpoint>/v1`, `apiKey` `{env:OHMYGPT_API_KEY}`, the attribution headers and the catalog's models with their context and output limits, and sets `model` and `small_model` to `ohmygpt/<model>`.

opencode 2 runs a shared background server that reads config from its own environment, so omgvibe adds `--standalone` to give the session a private server.

Setup: the same provider, with the key written in, in `~/.config/opencode/opencode.json` or `.jsonc` (`~/.config/kilo/kilo.jsonc` for Kilo Code), plus `model` and `small_model`.

## Qwen Code — `omgvibe qwen`

Session: `--auth-type openai --openai-base-url <endpoint>/v1 --model <model>`, with the key in `OPENAI_API_KEY`. `OPENAI_BASE_URL` and `OPENAI_MODEL` are removed from the session's environment so they cannot compete with the flags.

No setup: Qwen Code's provider settings are not stable enough to edit safely.

## Pi — `omgvibe pi`

Session: Pi has no base URL flag, so a small extension file is written to `~/.omgvibe/run/` and passed with `-e`. It registers a provider `ohmygpt` (`api: "openai-completions"`, `apiKey: "$OHMYGPT_API_KEY"`) with the catalog's models, context windows and prices. `--provider ohmygpt --model <model>` selects the model.

Setup: the provider in `~/.pi/agent/models.json`, and `defaultProvider` and `defaultModel` in `~/.pi/agent/settings.json`.

## CodeWhale — `omgvibe codewhale`

Session: CodeWhale does not send a key from the environment to a custom host, so the session gets a copy of your `~/.codewhale/config.toml` with these settings applied, passed with `--config`:

```toml
provider = "openai"
default_text_model = "<model>"

[providers.openai]
api_key_env = "OHMYGPT_API_KEY"
base_url = "<endpoint>/v1"
context_window = <the model's window>
```

Setup: the same settings in `~/.codewhale/config.toml`, with `api_key` in place of `api_key_env`.

## Attribution headers

```text
HTTP-Referer: https://github.com/DogeNet-LLC/omgvibe
X-OhMyGPT-Title: <agent name>
X-OhMyGPT-Categories: cli-agent
```

Sent by Claude Code, Codex, opencode, Kilo Code and Pi. Qwen Code and CodeWhale have no option for custom headers at launch.
