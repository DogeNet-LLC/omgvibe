# omgvibe

`omgvibe` 是一个面向 CodeX 与 Claude Code CLI 的交互式 NPX 向导，一键帮助你把客户端切换到 OhMyGPT 转发服务。流程中会自动选择语言、重新安装最新 CLI、备份配置并写入正确的 APIKey。

## 主要特性
- **零安装成本**：执行 `npx omgvibe` 即可完成全部步骤
- **英语 / 简体中文 / 日语三语界面**，自动检测系统语言，也可手动切换
- **自动安装升级** 目标 CLI，确保使用官方最新版本
- **安全备份**：在同目录生成带时间戳的 `.bak` 文件
- **一键写入** `~/.codex` 与 `~/.claude` 的推荐配置

## 快速开始
1. 请确保已安装 Node.js 18+ 与 npm。
2. 在终端中执行：
   ```bash
   npx omgvibe
   ```
3. 选择界面语言，并指定需要配置的 CLI（CodeX 或 Claude Code）。
4. 选择是否执行对应的 `npm install -g` 命令（推荐保持最新版本）。
5. 确认是否允许备份并覆写现有配置。
6. 按提示粘贴你的 OhMyGPT APIKey（可以访问 <https://www.ohmygpt.com/apis/keys> 获取），并根据提示完成剩余步骤。
7. 完成后即可直接运行 `codex` 或 `claude` 开始使用。

> 备份文件示例：`config.toml.20250101-103000.bak`，位于原文件同一目录，随时可恢复。

## 配置细节
### CodeX
- 重写 `~/.codex/config.toml`，默认使用 `https://apic1.ohmycdn.com/api/v1/ai/openai/codex-omg/v1`
- 默认推荐模型为 `gpt-5-codex`，你也可以切换至 `gpt-5`
- `~/.codex/auth.json` 中写入你的 `OPENAI_API_KEY`

### Claude Code
- 自动安装 / 更新 `@anthropic-ai/claude-code`
- 重写 `~/.claude/settings.json` 的 `env` 区域，指向 OhMyGPT 服务
- 支持自定义 Base URL，方便在不同网络环境下选择节点

## 更多信息
- English README: [README.md](README.md)
- 日本語 README: [README.ja.md](README.ja.md)

## 开发说明
```bash
npm install
npm run lint
npm run build
```

构建后可通过 `node dist/index.js` 验证，亦可使用 `ts-node src/index.ts` 进行调试。

## 支持与反馈
- APIKey 获取 & 计费：<https://www.ohmygpt.com/apis/keys>
- 技术支持：help@ohmygpt.com

本项目遵循 MIT 开源协议，详见 [LICENSE](LICENSE)。
