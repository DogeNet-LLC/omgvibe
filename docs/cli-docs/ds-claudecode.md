注：仅供参考，我们只做config文件的修改，不读写环境变量

接入 Claude Code
Claude Code 是一个运行在终端内的 AI 编程助手。

从现有安装中迁移到 DeepSeek
如果你已经安装了 Claude Code，只需修改以下环境变量，其中 API Key 在 DeepSeek Platform 获取。

Linux / Mac 用户，直接在终端中执行：

export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=<你的 DeepSeek API Key>
export ANTHROPIC_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
export CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash
export CLAUDE_CODE_EFFORT_LEVEL=max
export CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432

Windows 用户，在 Powershell 中执行：

$env:ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN="<你的 DeepSeek API Key>"
$env:ANTHROPIC_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
$env:CLAUDE_CODE_SUBAGENT_MODEL="deepseek-v4-flash"
$env:CLAUDE_CODE_EFFORT_LEVEL="max"
$env:CLAUDE_CODE_AUTO_COMPACT_WINDOW="786432"

配置完成后，执行（其中 /path/to/my-project 替换为你的项目路径）：

cd /path/to/my-project
claude

从零安装 Claude Code
1. 安装 Claude Code
安装 Node.js 18+。
Windows 用户需安装 Git for Windows。
在命令行界面，执行以下命令安装 Claude Code：
npm install -g @anthropic-ai/claude-code

安装结束后，执行以下命令，若显示版本号则安装成功：
claude --version

2. 配置环境变量
Linux / Mac 用户执行以下命令配置相关环境变量，其中 API Key 在 DeepSeek Platform 获取：

export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=<你的 DeepSeek API Key>
export ANTHROPIC_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
export CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash
export CLAUDE_CODE_EFFORT_LEVEL=max
export CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432

Windows 用户执行：

$env:ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN="<你的 DeepSeek API Key>"
$env:ANTHROPIC_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
$env:CLAUDE_CODE_SUBAGENT_MODEL="deepseek-v4-flash"
$env:CLAUDE_CODE_EFFORT_LEVEL="max"
$env:CLAUDE_CODE_AUTO_COMPACT_WINDOW="786432"

3. 进入项目目录，执行 claude 命令，即可开始使用了。
cd /path/to/my-project
claude


使用 Claude Code 的 Web Search 功能
DeepSeek API 原生支持 Claude Code 中的 Web Search 功能。在使用 Claude Code 的过程中，如果模型判断您的问题需要通过搜索功能才能满足，模型会调用 Web Search 工具，并通过 DeepSeek 提供的 API 进行搜索。因为调用 Web Search 工具会产生额外的大模型 API 请求来对获取到的搜索内容进行总结，因此会产生额外的模型 Token 费用。

下图展示了在 Claude Code 中触发 Web Search 功能的示例，用户的提问（Help me to search for best Rust tutorials）触发了 Web Search 工具的调用：


使用 Claude Code 或者 Claude Desktop APP 时的模型映射
您在使用 Claude Code 或者 Claude Desktop APP 时，我们会对您传入的 claude 模型名进行映射：

claude-opus 开头的模型，会映射到 deepseek-v4-pro
claude-haiku、claude-sonnet 开头的模型，会映射到 deepseek-v4-flash
通过这样的映射，您在使用新版 Claude Desktop APP 的 developer 模式时，可以绕过 APP 对模型名的限制，只需改动 base_url 和 api_key，即可在其中接入 DeepSeek 模型。