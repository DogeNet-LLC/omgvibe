# omgvibe
*言語: [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)*

`omgvibe` は **CodeX**・**Claude Code**・**OpenCode**・**CodeWhale** を OhMyGPT の
統一 `/v1` API へ接続するインタラクティブ NPX ウィザードです。言語選択・CLI の
インストール・エンドポイントのレイテンシ計測・設定のバックアップ・API キーと
モデル設定の書き込みまでをワンコマンドで実行します。

## 特長
- **インストール不要**：`npx omgvibe` だけでセットアップ開始
- **英語 / 中国語 / 日本語に対応**、システム言語を自動検出しつつ手動切替も可能
- **デフォルトは CodeX**（Claude Code・OpenCode・CodeWhale もすぐ切替可能）
- 対象 CLI の最新バージョンを `npm install -g` で再インストール
- 3 つのリレーエンドポイントに `GET /v1/models` を各 5 回実行し、到達可能かつ
  平均レイテンシが最も低いエンドポイントを自動選択
- 設定を上書きする前にタイムスタンプ付き `.bak` を作成
- CodeX には完全なモデルカタログ（`models.json`）を生成し、各ターゲットに
  デフォルト / 推奨モデルを設定

## クイックスタート
1. Node.js 18 以上と npm をインストール済みであることを確認します。
2. ターミナルで次を実行します。
   ```bash
   npx omgvibe
   ```
3. ウィザード内で言語と対象 CLI（デフォルトは **CodeX**）を選びます。
4. 公式の `npm install -g` を実行するかどうかを選択します。
5. OhMyGPT の API Key（<https://www.ohmygpt.com/apis/keys> で発行）を入力します。
6. レイテンシ計測結果を確認し、事前選択された最速エンドポイントを確定します。
7. デフォルトモデルを選び、書き込みを確定します。

> バックアップ例：`config.toml.20250101-103000.bak`。元ファイルと同じフォルダーに
> 保存され、いつでも復元できます。

## リレーエンドポイント

OhMyGPT は 3 つの直結 `/v1` エンドポイントで提供されます。ウィザードがすべてを
計測し、最速の到達可能なエンドポイントを事前選択します：

| エンドポイント | 対象 |
| --- | --- |
| `https://apic1.ohmycdn.com` | Cloudflare Enterprise CDN — 中国本土外 && 米国外 |
| `https://api.ohmygpt.com` | 米国直結 — 米国内 |
| `https://cn2us02.opapi.win` | 中国本土向け最適化 CDN — 中国本土 |

## 生成される設定

### CodeX（Responses API）
- `@openai/codex` をインストール / 更新
- `~/.codex/config.toml` — プロバイダー `omg`、`wire_api = "responses"`、
  Base URL `https://<endpoint>/v1`、および
  `experimental_bearer_token = "<あなたの API Key>"` でキーを保存
- `~/.codex/models.json` — モデルカタログ。デフォルトは `gpt-5.6-sol`・
  `gpt-5.6-terra`・`gpt-5.6-luna` と、Responses 対応の全モデル
  （Together/Ali/Tencent/DeepSeek/Fireworks）
- オプションの完全リセット：`~/.codex` 全体を `~/.codex-backup-<timestamp>` へ
  移動して再構築——400 エラーやモデル一覧の不具合が起きた場合に選択できます。
  CodeX の会話履歴はバックアップフォルダー内に保持され、削除されません。

### Claude Code（Messages API）
- `@anthropic-ai/claude-code` をインストール / 更新
- `~/.claude/settings.json` — OhMyGPT を指す `env` ブロック。
  `ANTHROPIC_MODEL` と Opus/Sonnet/Haiku スロットのデフォルトは
  `claude-opus-5`・`claude-sonnet-5`・`claude-fable-5`

### OpenCode（Chat Completions API）
- `opencode-ai` をインストール / 更新
- `~/.config/opencode/opencode.json` — カスタム `omg` プロバイダー
  （`@ai-sdk/openai-compatible`）。対応モデルの大半を事前登録

### CodeWhale（Chat Completions API）
- `codewhale` をインストール / 更新
- `~/.codewhale/config.toml` — `provider = "openai"` で OhMyGPT `base_url` を指定。
  デフォルトは `alibaba:deepseek/deepseek-v4-flash-0731`
  （`alibaba:deepseek/deepseek-v4-pro-0813` ほかも選択可能）

全モデルカタログと各ターゲットのデフォルト値は
[対応モデル](./docs/supported-models.md) を参照してください。

## 参考ドキュメント
- CodeX：<./docs/cli-docs/ds-codex.md>
- Claude Code：<./docs/cli-docs/ds-claudecode.md>
- OpenCode：<./docs/cli-docs/opencode-config-docs.md>
- CodeWhale：<./docs/cli-docs/codewhale-config.md>

## ローカライズ
- 英語 README: [README.md](README.md)
- 简体中文 README: [README.zh-CN.md](README.zh-CN.md)

## 開発メモ
```bash
npm install
npm run lint
npm run build
```

ビルド後は `node dist/index.js` でローカル実行できます。

## サポート
- API キー / 請求関連: <https://www.ohmygpt.com/apis/keys>
- サポート窓口: help@ohmygpt.com

ライセンスは MIT（[LICENSE](LICENSE) を参照）。
