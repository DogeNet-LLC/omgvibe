# Supported models

`omgvibe` configures your CLI against the unified OhMyGPT `/v1` API. This page
lists the models the wizard knows about, grouped by provider, and explains which
are enabled by default for each CLI.

All models are served through direct endpoints (no special-pricing routes):

| Endpoint | Target audience |
| --- | --- |
| `https://apic1.ohmycdn.com` | Cloudflare Enterprise CDN — best outside mainland China and outside the US |
| `https://api.ohmygpt.com` | US direct — best from within the United States |
| `https://cn2us02.opapi.win` | China-optimized CDN — best from mainland China |

The wizard probes `GET /v1/models` five times per endpoint and pre-selects the
reachable endpoint with the lowest average latency.

## Wire-API support

The three native APIs are Responses (`/v1/responses`), Chat Completions
(`/v1/chat/completions`), and Messages (`/v1/messages`). Capability rules:

| Provider | Responses | Chat Completions | Messages |
| --- | :---: | :---: | :---: |
| OpenAI (gpt-5.6 family) | ✅ | ✅ | ❌ |
| Anthropic | ❌ | ✅ | ✅ |
| Together AI | ✅ | ✅ | ✅ |
| Alibaba Cloud | ✅ | ✅ | ✅ |
| Tencent Cloud | ✅ | ✅ | ✅ |
| DeepSeek | ✅ | ✅ | ✅ |
| Fireworks | ✅ | ✅ | ✅ |

OpenAI's gpt-5.6 models speak Responses + Chat Completions but not Messages, so
they are only offered for **CodeX**. Anthropic's models speak Messages + Chat
Completions but not Responses, so they are never offered for CodeX. All other
providers (Together AI, Alibaba Cloud, Tencent Cloud, DeepSeek, Fireworks) speak
all three APIs and are offered for every applicable target.

## Defaults & recommendations

### CodeX defaults

| Model | Notes |
| --- | --- |
| `gpt-5.6-sol` | Frontier GPT-5.6 model, default for CodeX |
| `gpt-5.6-terra` | Balanced GPT-5.6 |
| `gpt-5.6-luna` | Cost-optimized GPT-5.6 |

### Claude Code defaults

`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5` map to the Opus / Sonnet /
Haiku slots; other supported models can be enabled in the wizard.

### Highlighted recommendations

| Model | Why |
| --- | --- |
| `alibaba:deepseek/deepseek-v4-flash-0731` | High performance, cheap, great value |
| `alibaba:deepseek/deepseek-v4-pro-0813` | Pricier, higher-performance domestic model |
| `tencent/glm-5.3` | Pricier, higher-performance domestic model |
| `fireworks/kimi-k3` | High-intelligence domestic model, pricier, served by Fireworks AI |

## Full catalog

### OpenAI (CodeX only)

- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-5.6-luna`

### Together AI

- `TA/openai/gpt-oss-120b`
- `TA/openai/gpt-oss-20b`
- `TA/deepseek-ai/DeepSeek-V3.1`
- `TA/deepseek-ai/DeepSeek-R1`
- `TA/deepseek-ai/DeepSeek-V3`
- `TA/Qwen/Qwen2.5-7B-Instruct-Turbo`

### Alibaba Cloud

- `qwen/qwen3.8-max`
- `alibaba:deepseek/deepseek-v4-pro`
- `alibaba:deepseek/deepseek-v4-pro-0813`
- `alibaba:deepseek/deepseek-v4-flash`
- `alibaba:deepseek/deepseek-v4-flash-0731`
- `alibaba:moonshot/kimi-k2.7-code`
- `alibaba:moonshot/kimi-k2.5`
- `alibaba:zhipu/glm-5.2`
- `alibaba:zhipu/glm-5.1`

### Tencent Cloud

- `tencent/glm-5.3`
- `glm-5.2`
- `tencent/hy3`
- `tencent/kimi-k3`

### DeepSeek

- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `deepseek-chat`
- `deepseek-reasoner`

### Anthropic

- `claude-opus-5`
- `claude-sonnet-5`
- `claude-fable-5`
- `claude-opus-4-8`
- `claude-opus-4-7`
- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-opus-4-5`
- `claude-opus-4-5-20251101`
- `claude-sonnet-4-5`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5`
- `claude-haiku-4-5-20251001`

### Fireworks

- `fireworks/kimi-k3`
- `fireworks/glm-5p2`
- `fireworks/kimi-k2p7-code`
- `fireworks/minimax-m3`
- `fireworks/qwen3p7-plus`
- `fireworks/deepseek-v4-pro`
- `fireworks/kimi-k2p6`
- `fireworks/minimax-m2p7`
- `fireworks/gpt-oss-120b`
- `fireworks/gpt-oss-20b`
- `fireworks/nemotron-3-ultra-nvfp4`
- `fireworks/inkling`
- `fireworks/deepseek-v4-flash`
- `fireworks/deepseek-v4-flash-0731`
- `fireworks/kimi-k3-fast`
- `fireworks/glm-5p2-fast`
- `fireworks/kimi-k2p7-code-fast`
- `fireworks/kimi-k2p6-turbo`

> Model metadata (context windows, output limits) is sourced from the OhMyGPT
> pricing library at `~/proj/uni-pricing-data-repo`.
