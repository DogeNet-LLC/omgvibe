# omgvibe

`omgvibe` は CodeX と Claude Code CLI を OhMyGPT リレーに接続するためのインタラクティブ NPX ウィザードです。言語選択・CLI の再インストール・設定ファイルのバックアップ・API キーの書き込みまでをワンコマンドで実行します。

## 特長
- **インストール不要**：`npx omgvibe` だけでセットアップ開始
- **英語 / 中国語 / 日本語に対応**、システム言語を自動検出しつつ手動切替も可能
- 対象 CLI の最新バージョンを `npm install -g` で再インストール
- 設定を上書きする前にタイムスタンプ付き `.bak` を作成
- `~/.codex` と `~/.claude` を OhMyGPT 推奨設定で自動生成

## クイックスタート
1. Node.js 18 以上と npm をインストール済みであることを確認します。
2. ターミナルで次を実行します。
   ```bash
   npx omgvibe
   ```
3. ウィザード内で言語と対象 CLI（CodeX または Claude Code）を選びます。
4. ウィザードが公式の `npm install -g` を実行し、CLI を最新化します。
5. 設定ファイルをバックアップして上書きしてよいか確認します。
6. 案内に従って OhMyGPT の API Key（<https://www.ohmygpt.com/apis/keys> で発行）を入力し、残りの質問にも答えます。
7. 完了後は `codex` または `claude` を起動して利用を始めてください。

> バックアップ例：`config.toml.20250101-103000.bak`。元ファイルと同じフォルダーに保存され、いつでも復元できます。

## 生成される設定
### CodeX
- `~/.codex/config.toml` を OhMyGPT 推奨設定に書き換え (`https://apic1.ohmycdn.com/api/v1/ai/openai/codex-omg/v1` を使用)
- ウィザード内で `gpt-5` と `gpt-5-codex` を選択可能
- `~/.codex/auth.json` に `OPENAI_API_KEY` を保存

### Claude Code
- `@anthropic-ai/claude-code` をインストール / 更新
- `~/.claude/settings.json` の `env` セクションを OhMyGPT 向けに構成
- 必要に応じて Base URL をカスタマイズ可能（地域に合わせたエッジを利用）

## ローカライズ
- 英語 README: [README.md](README.md)
- 简体中文 README: [README.zh-CN.md](README.zh-CN.md)

## 開発メモ
```bash
npm install
npm run lint
npm run build
```

ビルド後は `node dist/index.js` でローカル実行、または `ts-node src/index.ts` で動作確認が行えます。

## サポート
- API キー / 請求関連: <https://www.ohmygpt.com/apis/keys>
- サポート窓口: help@ohmygpt.com

ライセンスは MIT（[LICENSE](LICENSE) を参照）。
