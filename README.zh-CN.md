# omgvibe

*语言: [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)*

一条命令，让 Claude Code、Codex、opencode 等编程 Agent 跑在 [OhMyGPT](https://www.ohmygpt.com) 上。

```bash
npm install -g omgvibe
ov claude
```

第一次运行会让你填 OhMyGPT API Key，并给各地区节点测速、选出最快的那个。之后再运行，Agent 启动时就已经接好：Key、节点和模型通过命令行参数与环境变量传给这一次会话，Agent 自己的配置文件不会被改动。

`ov` 是 `omgvibe` 的短名，两个命令会一起装上，运行的是同一个程序。不想安装、只想先试试：

```bash
npx omgvibe claude
```

需要 Node.js 20.12 或更高版本。

## 命令

| 命令 | 作用 |
| --- | --- |
| `ov` | 打开菜单，下面的功能都在里面 |
| `ov <agent> [参数…]` | 本次会话在 OhMyGPT 上启动 Agent |
| `ov setup [agent…]` | 把 OhMyGPT 写进 Agent 自己的配置，不经 omgvibe 也能用 |
| `ov reset [agent…]` | 撤销 `setup` 的改动 |
| `ov login` / `logout` | 保存或删除 API Key |
| `ov models [关键字…]` | 列出可用模型，带上下文长度和价格 |
| `ov status` | 查看登录状态、节点和已安装的 Agent |
| `ov doctor` | 检查 Key、节点和三种 API 协议，不产生费用 |
| `ov endpoint [地区\|url\|auto]` | 测速并选择节点 |
| `ov update` | 更新 omgvibe |

## 支持的 Agent

| 命令 | Agent | 协议 | `setup` |
| --- | --- | --- | --- |
| `ov claude` | [Claude Code](https://code.claude.com/docs) | Anthropic Messages | 支持 |
| `ov codex` | [Codex](https://developers.openai.com/codex) | OpenAI Responses | 支持 |
| `ov opencode` | [opencode](https://opencode.ai) 1.x 与 2.x | OpenAI Chat Completions | 支持 |
| `ov kilo` | [Kilo Code](https://kilo.ai) | OpenAI Chat Completions | 支持 |
| `ov qwen` | [Qwen Code](https://github.com/QwenLM/qwen-code) | OpenAI Chat Completions | 仅会话 |
| `ov pi` | [Pi](https://pi.dev) | OpenAI Chat Completions | 支持 |
| `ov codewhale` | [CodeWhale](https://github.com/codewhale-hq/CodeWhale) | OpenAI Chat Completions | 支持 |

Agent 没装时，omgvibe 会列出它的安装命令；在终端里还会问你要不要直接装。

Agent 名称之后的参数，从第一个不属于 omgvibe 的开始，原样交给 Agent：

```bash
ov claude -p "review 这个 diff"
ov codex --model openai/gpt-5.5 exec "修好失败的测试"
ov claude -- --model opus        # -- 之后，连 --model 也交给 Claude Code
```

每个 Agent 具体收到哪些参数和变量，见 [docs/agents.md](docs/agents.md)。

## 选模型

OhMyGPT 上的对话模型都同时支持三种协议，所以任何模型都能用在任何 Agent 里。

```bash
ov models                 # 全部对话模型，强的排前面
ov models claude sonnet   # 搜索
ov codex --model zhipu/glm-5.3
ov opencode --pick        # 从可搜索的列表里选，选过会记住
```

模型 ID 取自实时目录（`GET /v1/models`）。目录每周都在变，所以 omgvibe 不内置模型表。名字拼错会自动纠正（`claude-sonet-5-5` → `anthropic/claude-sonnet-5-5`）；版本号对不上时不会替你换成别的版本。

不带 `--model` 时：

- **Claude Code** 用它自带的默认模型，`opus`、`sonnet`、`haiku` 这些别名照常可用，OhMyGPT 认它发出的 Claude 模型名。
- **Codex** 用 `openai/gpt-6.1-terra`，其余 Agent 用 `deepseek/deepseek-v4.1-flash-1017`。默认模型下线后，改用目录里标明的替代模型。
- 用 `--pick`、菜单或 `setup` 选过的模型，会记作这个 Agent 的默认模型。

## 会话还是 setup

`ov <agent>` 不改磁盘上的任何东西。同一个 Agent 还要接别的服务商，或者不想动这台机器的配置时，用它。

想让 Agent 不管怎么启动都走 OhMyGPT（直接敲 `claude`、Codex 桌面端、IDE 插件），用 `ov setup`。

```bash
ov setup claude codex     # 不带参数则从列表里选
ov reset codex
```

`setup` 只改它需要的那几项，文件里其余内容连同注释都保持原样。改之前会先列出要改什么；每个文件在 `~/.omgvibe/backups/` 下留一份备份，每一项原来的值也都记了下来。`reset` 把这些值放回去；你在 `setup` 之后自己改过的项不会动，并会告诉你。

## 登录

`ov login` 会打开 ohmygpt.com 上的登录页，你在登录状态下点“授权”，新 Key 就直接回到终端。浏览器和终端不在同一台机器上（SSH、容器），或者加了 `--no-browser` 时，页面会显示这个 Key，把它粘贴到终端即可；[API Key 页面](https://www.ohmygpt.com/keys)上已有的 Key 也可以粘贴。两种方式拿到的 Key 都会先用一次请求校验，再保存到 `~/.omgvibe/config.json`，只有你本人可读。

没有保存 Key 时，omgvibe 读取环境变量 `OHMYGPT_API_KEY`；`--key` 只对当次运行生效。优先级：`--key`、`OHMYGPT_API_KEY`、已保存的 Key。

```bash
OHMYGPT_API_KEY=sk-... npx omgvibe claude -p "hello"     # CI、容器
```

## 节点

OhMyGPT 在多个地区提供同一套 API。omgvibe 在已建立的连接上给每个节点测速，用最快的那个，每周重测一次。

| 地区 | Base URL |
| --- | --- |
| `cloudflare` Cloudflare 全球加速 | `https://apic1.ohmycdn.com` |
| `us` 美国直连 | `https://api.ohmygpt.com` |
| `asia` 亚洲优化 | `https://c-z0-api-01.hash070.com` |
| `cn2` 亚洲（中国大陆优化） | `https://cn2us02.opapi.win` |
| `sg` 新加坡 | `https://api-ep-sg1.ohmygpt.com` |
| `eu` 欧洲（德国） | `https://api-ep-eu1.ohmygpt.com` |

```bash
ov endpoint          # 测速并选择
ov endpoint cn2      # 固定用这个
ov endpoint auto     # 恢复自动选最快
```

`--endpoint <地区|url>` 或环境变量 `OHMYGPT_BASE_URL` 只影响当次运行。omgvibe 自己的请求和它启动的 Agent 一样，走 `HTTPS_PROXY` / `HTTP_PROXY` 并遵守 `NO_PROXY`，所以测到的就是 Agent 实际会走的线路。

## 检查连接

```text
$ ov doctor
正在检查与 OhMyGPT 的连接  美国直连  https://api.ohmygpt.com
  ✓ 节点                          可达，128 ms
  ✓ API Key                       有效，账户 #1
  ✓ 模型列表                      208 个模型
  ✓ OpenAI Chat Completions 请求  394 ms 内返回
  ✓ OpenAI Responses 请求         391 ms 内返回
  ✓ Anthropic Messages 请求       396 ms 内返回

一切正常。  以上检查用的是免费测试模型，不产生费用。
```

三次请求发给免费测试模型 `ohmygpt/mock`。`status` 和 `doctor` 支持 `--json`。

## 选项

| 选项 | 含义 |
| --- | --- |
| `-m`、`--model <id>` | 要用的模型 |
| `--pick` | 从可搜索的列表里选模型 |
| `--endpoint <地区\|url>` | 本次使用的节点 |
| `--key <key>` | 本次使用的 API Key |
| `--lang <en\|zh\|ja>` | 语言，默认跟随系统 |
| `--install` | Agent 未安装时直接安装，不再询问 |
| `-y`、`--yes` | 全部采用默认值，不提问 |
| `--json` | `models`、`status`、`doctor`、`endpoint` 输出 JSON |

Agent 名称之后，只有 `--model`/`-m`、`--pick`、`--endpoint`、`--key`、`--lang`、`--install`、`--yes` 归 omgvibe，所以 `ov claude --help` 显示的是 Claude Code 的帮助。

## 如果 `ov` 已经被占用

还有别的程序也叫 `ov`，其中一个是终端文本查看器。如果你装了这样的程序：

- **它就在 npm 放命令的目录里**（比如 Node.js 和那个 `ov` 都是用 Homebrew 装的）：`npm install -g omgvibe` 会报 `EEXIST` 并且什么都不安装，因为 npm 不会替换不是它创建的文件。请移除或改名那个 `ov`，或者继续用 `npx omgvibe`。
- **它在别的目录，而且在 `PATH` 里更靠前**：安装会成功，但 `ov` 运行的仍是那个程序。请改用 `omgvibe`，或者把 npm 的 bin 目录（`npm prefix -g`）挪到 `PATH` 最前面。

`omgvibe status` 会显示你的电脑上 `ov` 运行的是什么。

## omgvibe 往请求里加了什么

在 Agent 支持自定义请求头的地方，omgvibe 用 `X-OhMyGPT-Title` 标明是哪个 Agent（例如 `Claude Code`），并带上 `HTTP-Referer` 和 `X-OhMyGPT-Categories: cli-agent`。除此之外不加别的。

omgvibe 不上报任何遥测数据。它每天最多向 npm registry 查一次有没有新版本，设置 `OMGVIBE_NO_UPDATE_CHECK=1` 可以关掉。

## 从 0.2 升级

1.0 把向导换成了命令，并新增短名 `ov`；不带参数运行 `ov` 仍然会打开引导菜单。

- CodeX 与 Claude Code 特价渠道已停止服务，相关选项已移除。
- 0.2 会整体覆盖配置文件；1.0 只改单项设置，并且可以撤销。
- 0.2 内置固定的模型表；1.0 读取实时目录，模型 ID 的形式是 `creator/model`。

0.2 写下的配置，在节点仍然存在的情况下可以继续用。想清掉的话，恢复 0.2 留在配置文件旁边的 `.bak`，或者删除它写入的内容：`~/.codex/config.toml` 里的 `model_provider = "omg"`、`[model_providers.omg]` 表和 `model_catalog_json`，以及 `~/.codex/models.json`；`~/.claude/settings.json` 里 `env` 下的 `ANTHROPIC_*` 各项和 `apiKeyHelper`。

## 开发

见 [docs/development.md](docs/development.md)。版本变更记录在 [CHANGELOG.md](CHANGELOG.md)。

## 支持

- Key 与充值：<https://www.ohmygpt.com/keys>
- 文档：<https://www.ohmygpt.com/docs>
- 问题反馈：<https://github.com/DogeNet-LLC/omgvibe/issues> 或 help@ohmygpt.com

MIT 许可证，见 [LICENSE](LICENSE)。
