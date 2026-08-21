# omgvibe
*语言: [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)*

`omgvibe` 是一个交互式 NPX 向导，帮你把 **CodeX**、**Claude Code**、**OpenCode**
或 **CodeWhale** 一键接入 OhMyGPT 的统一 `/v1` API。流程中会自动选择语言、安装
CLI、测试节点延迟、备份配置并写入正确的 APIKey 与模型配置。

## 主要特性
- **零安装成本**：执行 `npx omgvibe` 即可完成全部步骤
- **英语 / 简体中文 / 日语三语界面**，自动检测系统语言，也可手动切换
- **默认配置 CodeX**（Claude Code、OpenCode、CodeWhale 一键切换）
- **自动安装升级**目标 CLI，确保使用官方最新版本
- **节点延迟测试**：对三个转发节点各测试 5 次 `GET /v1/models`，自动选中
  可访问且平均延迟最低的节点
- **安全备份**：在同目录生成带时间戳的 `.bak` 文件
- 按目标写入默认/推荐模型，并为 CodeX 生成完整的 `models.json` 模型目录

## 快速开始
1. 请确保已安装 Node.js 18+ 与 npm。
2. 在终端中执行：
   ```bash
   npx omgvibe
   ```
3. 选择界面语言，并指定需要配置的 CLI（默认 **CodeX**）。
4. 确认是否执行对应的 `npm install -g` 命令。
5. 按提示粘贴你的 OhMyGPT APIKey（可在 <https://www.ohmygpt.com/apis/keys> 获取）。
6. 查看节点延迟结果，确认已预选的最快节点。
7. 选择默认模型并确认写入。

> 备份文件示例：`config.toml.20250101-103000.bak`，位于原文件同一目录，随时可恢复。

## 转发节点

OhMyGPT 由三个直连 `/v1` 节点提供服务，向导会自动测试并预选最快的可访问节点：

| 节点 | 适用场景 |
| --- | --- |
| `https://apic1.ohmycdn.com` | Cloudflare 企业级 CDN —— 非中国大陆 && 非美国本土 |
| `https://api.ohmygpt.com` | 美国直连 —— 美国本土 |
| `https://cn2us02.opapi.win` | 中国大陆优化 CDN —— 中国大陆 |

## 配置细节

### CodeX（Responses API）
- 安装/更新 `@openai/codex`
- `~/.codex/config.toml` —— 提供方 `omg`，`wire_api = "responses"`，Base URL
  `https://<endpoint>/v1`，并以 `experimental_bearer_token = "<你的 API Key>"`
  写入密钥
- `~/.codex/models.json` —— 完整模型目录，默认 `gpt-5.6-sol`、`gpt-5.6-luna`、
  `gpt-5.6-terra`，并包含全部支持 Responses 的模型（Together/Ali/Tencent/
  DeepSeek/Fireworks）
- 可选完整重置：把整个 `~/.codex` 移动到 `~/.codex-backup-<时间戳>` 并重建全新
  目录——遇到 400 错误或模型列表显示不全时可尝试。CodeX 会话历史会保留在备份
  目录中，不会被删除。

### Claude Code（Messages API）
- 安装/更新 `@anthropic-ai/claude-code`
- `~/.claude/settings.json` —— `env` 区域指向 OhMyGPT，`ANTHROPIC_MODEL` 与
  Opus/Sonnet/Haiku 槽位默认映射为 `claude-opus-5`、`claude-sonnet-5`、
  `claude-fable-5`

### OpenCode（Chat Completions API）
- 安装/更新 `opencode-ai`
- `~/.config/opencode/opencode.json` —— 自定义 `omg` 提供方
  （`@ai-sdk/openai-compatible`），预注册大部分支持的模型

### CodeWhale（Chat Completions API）
- 安装/更新 `codewhale`
- `~/.codewhale/config.toml` —— `provider = "openai"` 指向 OhMyGPT `base_url`；
  默认 `alibaba:deepseek/deepseek-v4-flash-0731`（另可选
  `alibaba:deepseek/deepseek-v4-pro-0813` 及其余模型）

完整模型目录与各目标默认值请见 [支持的模型](./docs/supported-models.md)。

## 参考文档
- CodeX：<./docs/cli-docs/ds-codex.md>
- Claude Code：<./docs/cli-docs/ds-claudecode.md>
- OpenCode：<./docs/cli-docs/opencode-config-docs.md>
- CodeWhale：<./docs/cli-docs/codewhale-config.md>

## 更多信息
- English README: [README.md](README.md)
- 日本語 README: [README.ja.md](README.ja.md)

## 开发说明
```bash
npm install
npm run lint
npm run build
```

构建后可通过 `node dist/index.js` 进行本地验证。

## 支持与反馈
- APIKey 获取 & 计费：<https://www.ohmygpt.com/apis/keys>
- 技术支持：help@ohmygpt.com

本项目遵循 MIT 开源协议，详见 [LICENSE](LICENSE)。