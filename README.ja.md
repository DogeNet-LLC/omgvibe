# omgvibe

*言語: [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)*

Claude Code、Codex、opencode などのコーディングエージェントを、コマンド一つで [OhMyGPT](https://www.ohmygpt.com) につなぎます。

```bash
npm install -g omgvibe
ov claude
```

初回は OhMyGPT の API キーを尋ね、各リージョンのエンドポイントを計測して最速のものを選びます。それ以降は、キー・エンドポイント・モデルをそのセッションの引数と環境変数として渡した状態でエージェントが起動します。エージェント自身の設定ファイルには手を触れません。

`ov` は `omgvibe` の短い名前です。両方がインストールされ、同じプログラムを実行します。インストールせずに試す場合：

```bash
npx omgvibe claude
```

Node.js 20.12 以上が必要です。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `ov` | 以下の機能をまとめたメニューを開く |
| `ov <agent> [引数…]` | このセッションだけ OhMyGPT でエージェントを起動する |
| `ov setup [agent…]` | エージェント自身の設定に OhMyGPT を書き込み、omgvibe なしでも使えるようにする |
| `ov reset [agent…]` | `setup` の変更を元に戻す |
| `ov login` / `logout` | API キーを保存、または削除する |
| `ov models [検索語…]` | 使えるモデルをコンテキスト長と料金つきで一覧する |
| `ov status` | サインイン状態、エンドポイント、インストール済みエージェントを表示する |
| `ov doctor` | キー、エンドポイント、3 種類の API プロトコルを無料で確認する |
| `ov endpoint [リージョン\|url\|auto]` | エンドポイントを計測して選ぶ |
| `ov update` | omgvibe を更新する |

## 対応エージェント

| コマンド | エージェント | プロトコル | `setup` |
| --- | --- | --- | --- |
| `ov claude` | [Claude Code](https://code.claude.com/docs) | Anthropic Messages | 対応 |
| `ov codex` | [Codex](https://developers.openai.com/codex) | OpenAI Responses | 対応 |
| `ov opencode` | [opencode](https://opencode.ai) 1.x / 2.x | OpenAI Chat Completions | 対応 |
| `ov kilo` | [Kilo Code](https://kilo.ai) | OpenAI Chat Completions | 対応 |
| `ov qwen` | [Qwen Code](https://github.com/QwenLM/qwen-code) | OpenAI Chat Completions | セッションのみ |
| `ov pi` | [Pi](https://pi.dev) | OpenAI Chat Completions | 対応 |
| `ov codewhale` | [CodeWhale](https://github.com/codewhale-hq/CodeWhale) | OpenAI Chat Completions | 対応 |

エージェントが入っていない場合は、インストール用のコマンドを表示します。ターミナルでは、その場で実行するかどうかも尋ねます。

エージェント名より後ろの引数は、omgvibe のオプションではない最初のものから、そのままエージェントに渡ります。

```bash
ov claude -p "この diff をレビューして"
ov codex --model openai/gpt-5.5 exec "失敗しているテストを直して"
ov claude -- --model opus        # -- の後ろは --model も Claude Code に渡る
```

各エージェントに実際に渡す内容は [docs/agents.md](docs/agents.md) にまとめています。

## モデルを選ぶ

OhMyGPT のチャットモデルはどれも 3 種類のプロトコルすべてに対応しているため、どのモデルもどのエージェントで使えます。

```bash
ov models                 # すべてのチャットモデル（性能の高い順）
ov models claude sonnet   # 検索
ov codex --model zhipu/glm-5.3
ov opencode --pick        # 検索できる一覧から選ぶ。選んだモデルは記憶される
```

モデル ID は毎週変わる最新のカタログ（`GET /v1/models`）から取得するため、omgvibe 自体はモデル一覧を持ちません。名前の打ち間違いは補正します（`claude-sonet-5-5` → `anthropic/claude-sonnet-5-5`）。存在しないバージョンを別のバージョンに置き換えることはしません。

`--model` を付けない場合：

- **Claude Code** は自身の既定モデルを使い、`opus`・`sonnet`・`haiku` のエイリアスもそのまま使えます。OhMyGPT は Claude Code が送る Claude のモデル名を受け付けます。
- **Codex** は `openai/gpt-6.1-terra`、それ以外のエージェントは `deepseek/deepseek-v4.1-flash-1017` を使います。提供が終了した場合は、カタログが示す後継モデルに切り替わります。
- `--pick`、メニュー、`setup` で選んだモデルは、そのエージェントの既定として記憶されます。

## セッションか setup か

`ov <agent>` はディスク上の何も変更しません。同じエージェントを別のプロバイダーでも使う場合や、そのマシンの設定を変えたくない場合に向いています。

`ov setup` は、起動方法にかかわらず（素の `claude`、Codex のデスクトップアプリ、IDE 拡張）エージェントを OhMyGPT で使いたい場合のためのものです。

```bash
ov setup claude codex     # 引数なしなら一覧から選ぶ
ov reset codex
```

`setup` は必要な項目だけを書き換え、ファイルのそれ以外の部分はコメントも含めてそのまま残します。適用前に変更内容を表示し、各ファイルのコピーを `~/.omgvibe/backups/` に保存し、各項目の元の値を記録します。`reset` はその値を戻します。`setup` の後に自分で変更した項目には触れず、その旨を表示します。

## サインイン

`ov login` は ohmygpt.com のサインインページを開きます。サインインした状態で「承認」をクリックすると、新しいキーがそのままターミナルに届きます。ブラウザとターミナルが別のマシンにある場合（SSH、コンテナ）や `--no-browser` を付けた場合は、ページにキーが表示されるので、ターミナルに貼り付けます。[API キーのページ](https://www.ohmygpt.com/keys)にある既存のキーも貼り付けられます。どちらの場合も、キーは 1 回のリクエストで確認され、`~/.omgvibe/config.json` に本人だけが読める形で保存されます。

保存したキーがなければ、環境変数 `OHMYGPT_API_KEY` を読みます。`--key` はその実行だけに使われます。優先順位は `--key`、`OHMYGPT_API_KEY`、保存済みキーの順です。

```bash
OHMYGPT_API_KEY=sk-... npx omgvibe claude -p "hello"     # CI やコンテナ
```

## エンドポイント

OhMyGPT は同じ API を複数のリージョンから提供しています。omgvibe は確立済みの接続で各エンドポイントを計測して最速のものを使い、週に一度計測し直します。

| リージョン | ベース URL |
| --- | --- |
| `cloudflare` Cloudflare グローバル高速化 | `https://apic1.ohmycdn.com` |
| `us` 米国直結 | `https://api.ohmygpt.com` |
| `asia` アジア最適化 | `https://c-z0-api-01.hash070.com` |
| `cn2` アジア（中国本土向けに最適化） | `https://cn2us02.opapi.win` |
| `sg` シンガポール | `https://api-ep-sg1.ohmygpt.com` |
| `eu` ヨーロッパ（ドイツ） | `https://api-ep-eu1.ohmygpt.com` |

```bash
ov endpoint          # 計測して選ぶ
ov endpoint cn2      # 常にこれを使う
ov endpoint auto     # 最速の自動選択に戻す
```

`--endpoint <リージョン|url>` または環境変数 `OHMYGPT_BASE_URL` は、その実行だけのエンドポイントを指定します。omgvibe 自身のリクエストも、起動するエージェントと同じく `HTTPS_PROXY` / `HTTP_PROXY` を通り、`NO_PROXY` に従います。そのため、エージェントが実際に使う経路で計測されます。

## 接続の確認

```text
$ ov doctor
OhMyGPT への接続を確認しています  米国直結  https://api.ohmygpt.com
  ✓ エンドポイント                      到達可能、128 ms
  ✓ API キー                            有効、アカウント #1
  ✓ モデル一覧                          208 モデル
  ✓ OpenAI Chat Completions リクエスト  394 ms で応答
  ✓ OpenAI Responses リクエスト         391 ms で応答
  ✓ Anthropic Messages リクエスト       396 ms で応答

すべて正常です。  この確認には無料のテストモデルを使うため、料金はかかりません。
```

3 つのリクエストは無料のテストモデル `ohmygpt/mock` に送られます。`status` と `doctor` は `--json` に対応しています。

## オプション

| オプション | 意味 |
| --- | --- |
| `-m`、`--model <id>` | 使うモデル |
| `--pick` | 検索できる一覧からモデルを選ぶ |
| `--endpoint <リージョン\|url>` | 今回使うエンドポイント |
| `--key <key>` | 今回使う API キー |
| `--lang <en\|zh\|ja>` | 言語。既定はシステムのロケールに従う |
| `--install` | 未インストールのエージェントを確認なしでインストールする |
| `-y`、`--yes` | 既定値をそのまま使い、質問しない |
| `--json` | `models`、`status`、`doctor`、`endpoint` を JSON で出力する |

エージェント名の後ろで omgvibe が受け取るのは `--model`/`-m`、`--pick`、`--endpoint`、`--key`、`--lang`、`--install`、`--yes` だけです。そのため `ov claude --help` は Claude Code のヘルプを表示します。

## `ov` という名前がすでに使われている場合

`ov` という名前のプログラムはほかにもあり、ターミナル用のテキストビューアもその一つです。そうしたプログラムを入れている場合：

- **npm がコマンドを置くディレクトリにある**（例：Node.js もその `ov` も Homebrew で入れた）：`npm install -g omgvibe` は `EEXIST` で止まり、何もインストールされません。npm は自分が作成していないファイルを置き換えないためです。その `ov` を削除するか名前を変える、または `npx omgvibe` を使い続けてください。
- **別のディレクトリにあり、`PATH` で先に来る**：インストールは成功しますが、`ov` はそのプログラムを実行し続けます。`omgvibe` を使うか、npm の bin ディレクトリ（`npm prefix -g`）を `PATH` の先頭に移してください。

お使いのコンピューターで `ov` が何を実行するかは `omgvibe status` で確認できます。

## omgvibe がリクエストに加えるもの

エージェントがカスタムヘッダーに対応している場合、omgvibe は `X-OhMyGPT-Title` にエージェント名（例：`Claude Code`）を入れ、`HTTP-Referer` と `X-OhMyGPT-Categories: cli-agent` を付けます。それ以外は何も加えません。

omgvibe はテレメトリを送信しません。新しいバージョンの有無を、最大で 1 日 1 回 npm レジストリに問い合わせます。`OMGVIBE_NO_UPDATE_CHECK=1` で無効にできます。

## 0.2 からの移行

1.0 ではウィザードがコマンドに置き換わり、短い名前 `ov` が加わりました。引数なしの `ov` は引き続きガイド付きのメニューを開きます。

- CodeX と Claude Code の特別価格チャンネルは提供を終了したため、削除しました。
- 0.2 は設定ファイル全体を上書きしていました。1.0 は個々の項目だけを書き換え、元に戻せます。
- 0.2 は固定のモデル一覧を同梱していました。1.0 は最新のカタログを読み込みます。モデル ID は `creator/model` の形式です。

0.2 が書き込んだ設定は、エンドポイントが残っているかぎりそのまま使えます。消したい場合は、0.2 が各設定ファイルの隣に残した `.bak` を戻すか、0.2 が書き込んだ内容を削除してください。`~/.codex/config.toml` では `model_provider = "omg"` の行、`[model_providers.omg]` テーブル、`model_catalog_json`、および `~/.codex/models.json`。`~/.claude/settings.json` では `env` 配下の `ANTHROPIC_*` と `apiKeyHelper` です。

## 開発

[docs/development.md](docs/development.md) を参照してください。変更履歴は [CHANGELOG.md](CHANGELOG.md) にあります。

## サポート

- キーと料金：<https://www.ohmygpt.com/keys>
- ドキュメント：<https://www.ohmygpt.com/docs>
- 不具合の報告：<https://github.com/DogeNet-LLC/omgvibe/issues> または help@ohmygpt.com

MIT ライセンス。[LICENSE](LICENSE) を参照してください。
