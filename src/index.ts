#!/usr/bin/env node

import prompts from 'prompts';
import { spawn } from 'child_process';
import kleur from 'kleur';
import { homedir } from 'os';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import http from 'http';
import https from 'https';

import {
  API_KEY_URL,
  ENDPOINTS,
  baseURLOf,
  codexModels,
  codexDefaults,
  messageAndChatModels,
  modelById,
  type EndpointDef,
  type ModelEntry,
} from './data';
import {
  buildCodexConfig,
  buildCodexModelsJson,
  buildClaudeSettings,
  buildCodeWhaleConfig,
  buildOpenCodeConfig,
} from './generators';

type Language = 'en' | 'zh' | 'ja';
type Target = 'codex' | 'claude' | 'opencode' | 'codewhale';
type EndpointId = 'cdn' | 'us' | 'cn';

interface Messages {
  welcome: string;
  languagePrompt: string;
  languageChoices: Array<{ value: Language; title: string; description?: string }>;
  cancel: string;
  targetPrompt: string;
  targets: Record<Target, string>;
  startInstall: (command: string) => string;
  installSuccess: string;
  installFailed: string;
  confirmOverwrite: string;
  declineOverwrite: string;
  installConfirm: (command: string) => string;
  installSkipped: string;
  yes: string;
  no: string;
  apiKeyPrompt: string;
  apiKeyHint: string;
  apiKeyValidation: string;
  testingEndpoints: string;
  endpointPrompt: string;
  endpointHint: string;
  endpointNotes: Record<EndpointId, string>;
  unreachable: string;
  usingEndpoint: (base: string) => string;
  codexModelPrompt: string;
  claudeModelPrompt: string;
  claudeModelHint: string;
  opencodeModelPrompt: string;
  codewhaleModelPrompt: string;
  recommendedTag: string;
  defaultTag: string;
  codexResetPrompt: string;
  codexResetActive: string;
  codexResetInactive: string;
  historyPreserved: string;
  folderBackupDone: (dir: string) => string;
  folderNotFound: (dir: string) => string;
  writingConfig: string;
  backupDone: (file: string) => string;
  noBackupNeeded: (file: string) => string;
  configWritten: (file: string) => string;
  finished: (targetLabel: string) => string;
  docsHint: string;
}

const INSTALL_PACKAGES: Record<Target, string> = {
  codex: '@openai/codex',
  claude: '@anthropic-ai/claude-code',
  opencode: 'opencode-ai',
  codewhale: 'codewhale',
};

const TRANSLATIONS: Record<Language, Messages> = {
  en: {
    welcome: '🚀  Ready to wire CodeX, Claude Code, OpenCode, or CodeWhale to OhMyGPT? Let\'s get your CLI in shape.',
    languagePrompt: 'Select the language for this setup wizard',
    languageChoices: [
      { value: 'en', title: 'English (Default)' },
      { value: 'zh', title: '简体中文' },
      { value: 'ja', title: '日本語' },
    ],
    cancel: 'Setup cancelled. Nothing was changed.',
    targetPrompt: 'Which CLI do you want to configure today?',
    targets: {
      codex: 'CodeX (OpenAI coding assistant)',
      claude: 'Claude Code (Anthropic)',
      opencode: 'OpenCode (opencode-ai)',
      codewhale: 'CodeWhale (codewhale)',
    },
    startInstall: (command) => `Running ${command} to make sure everything is up to date...`,
    installSuccess: 'Installation check completed.',
    installFailed: 'Installation failed. Please review the errors above and run the wizard again.',
    confirmOverwrite:
      'We will backup your current configuration (.bak files) and write the OhMyGPT settings. Continue?',
    declineOverwrite: 'Understood. No files were touched.',
    installConfirm: (command) => `Run ${command} now to ensure you have the latest release?`,
    installSkipped: 'Skipped installation. We\'ll use the version already on your machine.',
    yes: 'Yes',
    no: 'No',
    apiKeyPrompt: `Paste your OhMyGPT API key (open ${API_KEY_URL} if you need to create one)`,
    apiKeyHint: 'Your API key is stored locally on this device only.',
    apiKeyValidation: 'Please enter a non-empty API key.',
    testingEndpoints: 'Probing GET /v1/models latency (5 attempts per endpoint)...',
    endpointPrompt: 'Select the API relay endpoint to use',
    endpointHint: 'The lowest-latency endpoint is pre-selected. Press Enter to accept, or arrow to another.',
    endpointNotes: {
      cdn: 'Cloudflare Enterprise CDN — best from outside mainland China && outside the US',
      us: 'US direct endpoint — best from within the United States',
      cn: 'China-optimized CDN — best from mainland China',
    },
    unreachable: 'unreachable',
    usingEndpoint: (base) => `Relay endpoint: ${base}`,
    codexModelPrompt: 'Pick the default CodeX model to set in config.toml',
    claudeModelPrompt: 'Select the models to enable for Claude Code',
    claudeModelHint: 'Space to toggle, Enter to confirm. Defaults map Opus/Sonnet/Haiku slots.',
    opencodeModelPrompt: 'Pick the default model for OpenCode',
    codewhaleModelPrompt: 'Pick the default model for CodeWhale',
    recommendedTag: 'recommended',
    defaultTag: 'default',
    codexResetPrompt:
      'Hit 400 errors or a model list that does not fully show? You can try fully resetting the CodeX config folder.',
    codexResetActive: 'Reset whole ~/.codex',
    codexResetInactive: 'Keep ~/.codex, back up files only',
    historyPreserved:
      'Note: your CodeX chat history is NOT deleted — it is preserved inside the backup folder.',
    folderBackupDone: (dir) => `Backed up the whole CodeX folder to ${dir}`,
    folderNotFound: (dir) => `No existing ${dir} found; a fresh one will be created.`,
    writingConfig: 'Writing configuration files...',
    backupDone: (file) => `Backup saved: ${file}`,
    noBackupNeeded: (file) => `No existing file found at ${file}.`,
    configWritten: (file) => `Updated ${file}`,
    finished: (targetLabel) => `✅  All done! ${targetLabel} is now configured for OhMyGPT.`,
    docsHint: 'Tip: run `npx omgvibe` anytime you want to switch setups again.',
  },
  zh: {
    welcome: '🚀  开始把 CodeX / Claude Code / OpenCode / CodeWhale 接入 OhMyGPT，一起完成配置吧。',
    languagePrompt: '请选择向导语言',
    languageChoices: [
      { value: 'en', title: 'English (默认英语)' },
      { value: 'zh', title: '简体中文' },
      { value: 'ja', title: '日本語 / 日语' },
    ],
    cancel: '已取消，文件未做任何修改。',
    targetPrompt: '你想要配置哪一个 CLI？',
    targets: {
      codex: 'CodeX（OpenAI 代码助手）',
      claude: 'Claude Code（Anthropic）',
      opencode: 'OpenCode（opencode-ai）',
      codewhale: 'CodeWhale（codewhale）',
    },
    startInstall: (command) => `正在执行 ${command}，确保 CLI 已安装且为最新版本……`,
    installSuccess: '安装检查完成。',
    installFailed: '安装失败，请检查上方输出后重新运行向导。',
    confirmOverwrite: '将会先备份（*.bak）再覆写当前配置文件，是否继续？',
    declineOverwrite: '明白，未对文件进行任何更改。',
    installConfirm: (command) => `是否现在执行 ${command} 以确保使用最新版本？`,
    installSkipped: '已跳过安装，将使用你当前的 CLI 版本。',
    yes: '是',
    no: '否',
    apiKeyPrompt: `请输入你的 OhMyGPT API Key（如需创建，请访问 ${API_KEY_URL}）`,
    apiKeyHint: '密钥只会保存在本机。',
    apiKeyValidation: 'API Key 不能为空。',
    testingEndpoints: '正在测试 GET /v1/models 延迟（每个节点 5 次）……',
    endpointPrompt: '请选择要使用的 API 转发节点',
    endpointHint: '已自动选中平均延迟最低的节点，回车确认，或用方向键选择其它节点。',
    endpointNotes: {
      cdn: 'Cloudflare 企业级 CDN —— 适合非中国大陆 && 非美国本土访问',
      us: '美国直连节点 —— 适合美国本土访问',
      cn: '中国大陆优化 CDN —— 适合中国大陆访问',
    },
    unreachable: '不可达',
    usingEndpoint: (base) => `转发节点：${base}`,
    codexModelPrompt: '请选择 CodeX 默认模型（写入 config.toml）',
    claudeModelPrompt: '请选择要在 Claude Code 中启用的模型',
    claudeModelHint: '空格切换，回车确认。默认模型会映射到 Opus/Sonnet/Haiku 槽位。',
    opencodeModelPrompt: '请选择 OpenCode 的默认模型',
    codewhaleModelPrompt: '请选择 CodeWhale 的默认模型',
    recommendedTag: '推荐',
    defaultTag: '默认',
    codexResetPrompt:
      '遇到 400 错误或模型列表显示不全？可尝试完整重置 CodeX 配置文件夹（默认为否，仅备份单个文件）。',
    codexResetActive: '整体重置 ~/.codex',
    codexResetInactive: '保留 ~/.codex，仅备份单个文件',
    historyPreserved:
      '注意：CodeX 的会话历史不会被删除，它们会保存在备份文件夹中。',
    folderBackupDone: (dir) => `已将整个 CodeX 文件夹备份到 ${dir}`,
    folderNotFound: (dir) => `未找到 ${dir}，将直接新建。`,
    writingConfig: '正在写入配置文件……',
    backupDone: (file) => `已备份：${file}`,
    noBackupNeeded: (file) => `未在 ${file} 发现历史文件。`,
    configWritten: (file) => `已更新 ${file}`,
    finished: (targetLabel) => `✅  完成！${targetLabel} 已配置为使用 OhMyGPT。`,
    docsHint: '提示：再次执行 `npx omgvibe` 可以重新配置。',
  },
  ja: {
    welcome: '🚀  CodeX / Claude Code / OpenCode / CodeWhale を OhMyGPT へ接続します。セットアップを始めましょう。',
    languagePrompt: 'ウィザードで使用する言語を選択してください',
    languageChoices: [
      { value: 'en', title: 'English (デフォルト)' },
      { value: 'zh', title: '简体中文 / 中国語' },
      { value: 'ja', title: '日本語' },
    ],
    cancel: 'セットアップを中止しました。ファイルは変更されていません。',
    targetPrompt: 'どの CLI を設定しますか？',
    targets: {
      codex: 'CodeX（OpenAI のコーディング支援）',
      claude: 'Claude Code（Anthropic）',
      opencode: 'OpenCode（opencode-ai）',
      codewhale: 'CodeWhale（codewhale）',
    },
    startInstall: (command) => `${command} を実行し、最新バージョンが入っているか確認します…`,
    installSuccess: 'インストール確認が完了しました。',
    installFailed: 'インストールに失敗しました。ログを確認してから再実行してください。',
    confirmOverwrite: '既存の設定を .bak にバックアップしてから OhMyGPT 設定を書き込みます。続行しますか？',
    declineOverwrite: '了解しました。何も変更していません。',
    installConfirm: (command) => `${command} を今すぐ実行して最新版に更新しますか？`,
    installSkipped: 'インストールをスキップしました。現在の CLI バージョンを使用します。',
    yes: 'はい',
    no: 'いいえ',
    apiKeyPrompt: `OhMyGPT の API Key を入力してください（必要なら ${API_KEY_URL} で作成できます）`,
    apiKeyHint: 'キーはこの端末にのみ保存されます。',
    apiKeyValidation: 'API Key を入力してください。',
    testingEndpoints: 'GET /v1/models のレイテンシを計測中（各エンドポイント 5 回）…',
    endpointPrompt: '使用する API リレーエンドポイントを選択してください',
    endpointHint: '平均レイテンシが最も低いエンドポイントが選択済みです。Enter で確定、または矢印キーで変更します。',
    endpointNotes: {
      cdn: 'Cloudflare Enterprise CDN — 中国本土外 && 米国外から最適',
      us: '米国直結エンドポイント — 米国内から最適',
      cn: '中国本土向け最適化 CDN — 中国本土から最適',
    },
    unreachable: '到達不可',
    usingEndpoint: (base) => `リレーエンドポイント：${base}`,
    codexModelPrompt: 'config.toml に設定する CodeX のデフォルトモデルを選択してください',
    claudeModelPrompt: 'Claude Code で有効にするモデルを選択してください',
    claudeModelHint: 'スペースで切替、Enter で確定。デフォルトは Opus/Sonnet/Haiku スロットにマップされます。',
    opencodeModelPrompt: 'OpenCode のデフォルトモデルを選択してください',
    codewhaleModelPrompt: 'CodeWhale のデフォルトモデルを選択してください',
    recommendedTag: '推奨',
    defaultTag: 'デフォルト',
    codexResetPrompt:
      '400 エラーやモデル一覧が正しく表示されない場合、CodeX 設定フォルダーの完全リセットを試せます（デフォルトは「いいえ」）。',
    codexResetActive: '~/.codex を全体リセット',
    codexResetInactive: '~/.codex を維持し、個別ファイルのみバックアップ',
    historyPreserved:
      '注意：CodeX の会話履歴は削除されません。バックアップフォルダー内に保持されます。',
    folderBackupDone: (dir) => `CodeX フォルダー全体を ${dir} にバックアップしました`,
    folderNotFound: (dir) => `${dir} が見つからないため、新規作成します。`,
    writingConfig: '設定ファイルを書き込んでいます…',
    backupDone: (file) => `バックアップ完了: ${file}`,
    noBackupNeeded: (file) => `${file} に既存ファイルはありませんでした。`,
    configWritten: (file) => `${file} を更新しました`,
    finished: (targetLabel) => `✅  完了しました！${targetLabel} は OhMyGPT で利用できます。`,
    docsHint: '`npx omgvibe` を再度実行すれば再設定できます。',
  },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const detectLanguage = (): Language => {
  const env =
    process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || process.env.LC_MESSAGES || '';
  if (env.toLowerCase().startsWith('zh')) return 'zh';
  if (env.toLowerCase().startsWith('ja')) return 'ja';
  return 'en';
};

const formatTimestamp = (): string => {
  const date = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    '-' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
};

const ensureDir = async (filePath: string) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

const backupFile = async (filePath: string): Promise<string | null> => {
  if (!existsSync(filePath)) return null;
  const backupPath = `${filePath}.${formatTimestamp()}.bak`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
};

const writeFileSafely = async (filePath: string, content: string) => {
  await ensureDir(filePath);
  await fs.writeFile(filePath, content, 'utf8');
};

const runInstallCommand = async (
  command: string,
  args: string[],
  lang: Language,
): Promise<boolean> => {
  const messages = TRANSLATIONS[lang];
  console.log();
  const printable = [command, ...args].join(' ');
  console.log(kleur.cyan(messages.startInstall(printable)));
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', (error) => {
      console.error(kleur.red(messages.installFailed));
      console.error(error);
      resolve(false);
    });
    child.on('close', (code) => {
      if (code === 0) {
        console.log(kleur.green(messages.installSuccess));
        resolve(true);
      } else {
        console.error(kleur.red(messages.installFailed));
        resolve(false);
      }
    });
  });
};

const onCancel = (lang: Language) => {
  const messages = TRANSLATIONS[lang];
  console.log();
  console.log(kleur.yellow(messages.cancel));
  process.exit(0);
};

// ---------------------------------------------------------------------------
// endpoint latency probing
// ---------------------------------------------------------------------------

interface ProbeResult {
  endpoint: EndpointDef;
  avg: number | null;
  samples: number;
}

const probeOnce = (
  url: string,
  apiKey: string,
  timeoutMs: number,
): Promise<number | null> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value: number | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const started = Date.now();
    const req = lib.request(
      target,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'omgvibe',
          Accept: 'application/json',
        },
      },
      (res) => {
        finish(Date.now() - started);
        res.resume();
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish(null);
    });
    req.on('error', () => finish(null));
    req.end();
  });

const testEndpoints = async (apiKey: string): Promise<ProbeResult[]> => {
  const ATTEMPTS = 5;
  const TIMEOUT_MS = 8000;
  return await Promise.all(
    ENDPOINTS.map(async (endpoint) => {
      const url = `${endpoint.url}/v1/models`;
      const samples: number[] = [];
      const results = await Promise.all(
        Array.from({ length: ATTEMPTS }, () => probeOnce(url, apiKey, TIMEOUT_MS)),
      );
      for (const r of results) {
        if (r !== null) samples.push(r);
      }
      const avg =
        samples.length > 0
          ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
          : null;
      return { endpoint, avg, samples: samples.length };
    }),
  );
};

// ---------------------------------------------------------------------------
// model picker helpers
// ---------------------------------------------------------------------------

const modelChoiceTitle = (m: ModelEntry, messages: Messages): string =>
  m.recommended ? `${m.name}  [${messages.recommendedTag}]` : m.name;

const modelChoiceDescription = (m: ModelEntry): string => {
  const parts = [`${m.group} · ${m.id}`];
  if (m.note) parts.push(m.note);
  return parts.join(' — ');
};

const orderModels = (list: ModelEntry[], preferredIds: string[]): ModelEntry[] => {
  const preferred = preferredIds
    .map((id) => modelById(id))
    .filter((m): m is ModelEntry => m !== undefined);
  const rest = list.filter((m) => !preferredIds.includes(m.id));
  return [...preferred, ...rest];
};

const RECOMMENDED_IDS = [
  'alibaba:deepseek/deepseek-v4-flash-0731',
  'alibaba:deepseek/deepseek-v4-pro-0813',
  'tencent/glm-5.3',
  'fireworks/kimi-k3',
];

const CLAUDE_DEFAULT_IDS = ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5'];

/**
 * Map a user's Claude model selection onto the fixed Opus/Sonnet/Haiku and
 * subagent slots using simple name heuristics, with graceful fallbacks.
 */
const resolveClaudeSlots = (selectedIds: string[]) => {
  const ids = selectedIds.length > 0 ? selectedIds : CLAUDE_DEFAULT_IDS;
  const pick = (re: RegExp, index: number) =>
    ids.find((id) => re.test(id)) ?? ids[Math.min(index, ids.length - 1)] ?? 'claude-sonnet-5';
  return {
    opus: pick(/opus/i, 0),
    sonnet: pick(/sonnet/i, 1),
    haiku: pick(/haiku|fable/i, 2),
    subagent: pick(/haiku|fable|flash|mini|nano/i, 2),
  };
};

// ---------------------------------------------------------------------------
// per-target flows
// ---------------------------------------------------------------------------

const confirmInstall = async (lang: Language, target: Target): Promise<boolean> => {
  const messages = TRANSLATIONS[lang];
  const installArgs = ['install', '-g', INSTALL_PACKAGES[target]];
  const installCommand = ['npm', ...installArgs];
  const { runInstall } = await prompts(
    {
      type: 'toggle',
      name: 'runInstall',
      message: messages.installConfirm(installCommand.join(' ')),
      initial: true,
      active: messages.yes,
      inactive: messages.no,
    },
    { onCancel: () => onCancel(lang) },
  );
  if (runInstall) {
    const ok = await runInstallCommand('npm', installArgs, lang);
    if (!ok) process.exit(1);
  } else {
    console.log(kleur.yellow(messages.installSkipped));
  }
  return true;
};

const collectApiKey = async (lang: Language): Promise<string> => {
  const messages = TRANSLATIONS[lang];
  const { apiKey } = await prompts(
    {
      type: 'password',
      name: 'apiKey',
      message: `${messages.apiKeyPrompt}\n`,
      validate: (value: string) =>
        value && value.trim().length > 0 ? true : messages.apiKeyValidation,
      hint: messages.apiKeyHint,
    },
    { onCancel: () => onCancel(lang) },
  );
  return (apiKey as string).trim();
};

const selectEndpoint = async (lang: Language, apiKey: string): Promise<EndpointDef> => {
  const messages = TRANSLATIONS[lang];
  console.log();
  console.log(kleur.cyan(messages.testingEndpoints));
  const results = await testEndpoints(apiKey);

  const latencyLabel = (r: ProbeResult) =>
    r.avg === null ? messages.unreachable : `${r.avg}ms (${r.samples}/5)`;

  console.log();
  for (const r of results) {
    const note = messages.endpointNotes[r.endpoint.id as EndpointId];
    const label = latencyLabel(r);
    console.log(
      `  ${kleur.bold(r.endpoint.url)}  ${label}`,
    );
    console.log(`      ${kleur.gray(note)}`);
  }
  console.log();

  const accessible = results.filter((r) => r.avg !== null);
  const winner = accessible.reduce<ProbeResult | null>(
    (best, r) => (best === null || (r.avg as number) < (best.avg as number) ? r : best),
    null,
  );
  const initialIndex = winner ? results.indexOf(winner) : 0;

  const { endpointId } = await prompts(
    {
      type: 'select',
      name: 'endpointId',
      message: messages.endpointPrompt,
      hint: messages.endpointHint,
      initial: initialIndex,
      choices: results.map((r) => ({
        title: endpointChoiceTitle(r),
        value: r.endpoint.id,
        description: messages.endpointNotes[r.endpoint.id as EndpointId],
      })),
    },
    { onCancel: () => onCancel(lang) },
  );

  const selected = ENDPOINTS.find((e) => e.id === endpointId) ?? (winner?.endpoint ?? ENDPOINTS[0]);
  console.log();
  console.log(kleur.gray(messages.usingEndpoint(baseURLOf(selected))));
  return selected;

  function endpointChoiceTitle(r: ProbeResult): string {
    const lat = r.avg === null ? messages.unreachable : `${r.avg}ms`;
    return `${r.endpoint.url}  ${lat}  —  ${messages.endpointNotes[r.endpoint.id as EndpointId]}`;
  }
};

const confirmOverwrite = async (lang: Language): Promise<boolean> => {
  const messages = TRANSLATIONS[lang];
  const { confirm } = await prompts(
    {
      type: 'toggle',
      name: 'confirm',
      message: messages.confirmOverwrite,
      initial: true,
      active: messages.yes,
      inactive: messages.no,
    },
    { onCancel: () => onCancel(lang) },
  );
  if (!confirm) {
    console.log(kleur.yellow(messages.declineOverwrite));
    process.exit(0);
  }
  return true;
};

const logBackup = (lang: Language, backup: string | null, filePath: string) => {
  const messages = TRANSLATIONS[lang];
  if (backup) {
    console.log(kleur.gray(messages.backupDone(backup)));
  } else {
    console.log(kleur.gray(messages.noBackupNeeded(filePath)));
  }
};

/**
 * Move the entire `~/.codex` directory to `~/.codex-backup-<timestamp>` and
 * return the backup path (or null when there was nothing to back up). Chat
 * history is preserved inside the backup folder, never deleted.
 */
const backupCodexFolder = async (): Promise<string | null> => {
  const dir = path.join(homedir(), '.codex');
  if (!existsSync(dir)) return null;
  const stamp = formatTimestamp();
  let target = path.join(homedir(), `.codex-backup-${stamp}`);
  let n = 1;
  while (existsSync(target)) {
    target = path.join(homedir(), `.codex-backup-${stamp}-${n}`);
    n += 1;
  }
  await fs.rename(dir, target);
  return target;
};

// --- CodeX ---

const configureCodex = async (lang: Language, apiKey: string, endpoint: EndpointDef) => {
  const messages = TRANSLATIONS[lang];

  const defaults = codexDefaults();
  const preferredIds = [...defaults.map((m) => m.id), ...RECOMMENDED_IDS];
  const choices = orderModels(codexModels(), preferredIds).map((m) => ({
    title: m.id === defaults[0].id ? `${m.name}  [${messages.defaultTag}]` : modelChoiceTitle(m, messages),
    value: m.id,
    description: modelChoiceDescription(m),
  }));

  const { model } = await prompts(
    {
      type: 'select',
      name: 'model',
      message: messages.codexModelPrompt,
      choices,
      initial: 0,
    },
    { onCancel: () => onCancel(lang) },
  );
  const selectedModel = (model as string) || defaults[0].id;

  // Offer a full folder reset (default: no) for stale-state 400s / missing models.
  const { fullReset } = await prompts(
    {
      type: 'toggle',
      name: 'fullReset',
      message: messages.codexResetPrompt,
      initial: false,
      active: messages.codexResetActive,
      inactive: messages.codexResetInactive,
    },
    { onCancel: () => onCancel(lang) },
  );
  if (fullReset) {
    console.log();
    console.log(kleur.yellow(messages.historyPreserved));
  }

  await confirmOverwrite(lang);

  const codexDir = path.join(homedir(), '.codex');
  const configPath = path.join(codexDir, 'config.toml');
  const modelsPath = path.join(codexDir, 'models.json');

  console.log();
  console.log(kleur.cyan(messages.writingConfig));

  if (fullReset) {
    const backupDir = await backupCodexFolder();
    if (backupDir) {
      console.log(kleur.gray(messages.folderBackupDone(backupDir)));
    } else {
      console.log(kleur.gray(messages.folderNotFound(codexDir)));
    }
  } else {
    logBackup(lang, await backupFile(configPath), configPath);
    logBackup(lang, await backupFile(modelsPath), modelsPath);
  }

  const configContent = buildCodexConfig(endpoint, selectedModel, apiKey);
  const modelsContent = buildCodexModelsJson(codexModels());

  await writeFileSafely(configPath, configContent);
  await writeFileSafely(modelsPath, modelsContent);

  console.log(kleur.green(messages.configWritten(configPath)));
  console.log(kleur.green(messages.configWritten(modelsPath)));
  finish(lang, 'codex');
};

// --- Claude Code ---

const configureClaude = async (lang: Language, apiKey: string, endpoint: EndpointDef) => {
  const messages = TRANSLATIONS[lang];

  const preferredIds = [...CLAUDE_DEFAULT_IDS, ...RECOMMENDED_IDS];
  const choices = orderModels(messageAndChatModels(), preferredIds).map((m) => ({
    title: modelChoiceTitle(m, messages),
    value: m.id,
    description: modelChoiceDescription(m),
    selected: CLAUDE_DEFAULT_IDS.includes(m.id),
  }));

  const { models: selected } = await prompts(
    {
      type: 'multiselect',
      name: 'models',
      message: messages.claudeModelPrompt,
      hint: messages.claudeModelHint,
      choices,
      min: 1,
      instructions: false,
    },
    { onCancel: () => onCancel(lang) },
  );

  const selectedIds: string[] = Array.isArray(selected) ? (selected as string[]) : [];
  const slots = resolveClaudeSlots(selectedIds);

  await confirmOverwrite(lang);

  const settingsPath = path.join(homedir(), '.claude', 'settings.json');

  console.log();
  console.log(kleur.cyan(messages.writingConfig));

  logBackup(lang, await backupFile(settingsPath), settingsPath);

  const content = buildClaudeSettings(
    endpoint,
    apiKey,
    slots.opus,
    slots.sonnet,
    slots.haiku,
    slots.subagent,
  );

  await writeFileSafely(settingsPath, content);

  console.log(kleur.green(messages.configWritten(settingsPath)));
  finish(lang, 'claude');
};

// --- OpenCode ---

const configureOpenCode = async (lang: Language, apiKey: string, endpoint: EndpointDef) => {
  const messages = TRANSLATIONS[lang];

  const preferredIds = [...RECOMMENDED_IDS, ...CLAUDE_DEFAULT_IDS];
  const choices = orderModels(messageAndChatModels(), preferredIds).map((m) => ({
    title: modelChoiceTitle(m, messages),
    value: m.id,
    description: modelChoiceDescription(m),
  }));

  const { model } = await prompts(
    {
      type: 'select',
      name: 'model',
      message: messages.opencodeModelPrompt,
      choices,
      initial: 0,
    },
    { onCancel: () => onCancel(lang) },
  );
  const selectedModel = (model as string) || RECOMMENDED_IDS[0];

  await confirmOverwrite(lang);

  const configPath = path.join(homedir(), '.config', 'opencode', 'opencode.json');

  console.log();
  console.log(kleur.cyan(messages.writingConfig));

  logBackup(lang, await backupFile(configPath), configPath);

  const content = buildOpenCodeConfig(endpoint, apiKey, selectedModel, messageAndChatModels());

  await writeFileSafely(configPath, content);

  console.log(kleur.green(messages.configWritten(configPath)));
  finish(lang, 'opencode');
};

// --- CodeWhale ---

const configureCodeWhale = async (lang: Language, apiKey: string, endpoint: EndpointDef) => {
  const messages = TRANSLATIONS[lang];

  const preferredIds = [
    'alibaba:deepseek/deepseek-v4-flash-0731',
    'alibaba:deepseek/deepseek-v4-pro-0813',
    ...RECOMMENDED_IDS,
    ...CLAUDE_DEFAULT_IDS,
  ];
  const choices = orderModels(messageAndChatModels(), preferredIds).map((m) => ({
    title: modelChoiceTitle(m, messages),
    value: m.id,
    description: modelChoiceDescription(m),
  }));

  const { model } = await prompts(
    {
      type: 'select',
      name: 'model',
      message: messages.codewhaleModelPrompt,
      choices,
      initial: 0,
    },
    { onCancel: () => onCancel(lang) },
  );
  const selectedModelId = (model as string) || 'alibaba:deepseek/deepseek-v4-flash-0731';
  const selectedModel = modelById(selectedModelId) ?? modelById('alibaba:deepseek/deepseek-v4-flash-0731')!;

  await confirmOverwrite(lang);

  const configPath = path.join(homedir(), '.codewhale', 'config.toml');

  console.log();
  console.log(kleur.cyan(messages.writingConfig));

  logBackup(lang, await backupFile(configPath), configPath);

  const content = buildCodeWhaleConfig(endpoint, apiKey, selectedModel);

  await writeFileSafely(configPath, content);

  console.log(kleur.green(messages.configWritten(configPath)));
  finish(lang, 'codewhale');
};

const finish = (lang: Language, target: Target) => {
  const messages = TRANSLATIONS[lang];
  console.log();
  console.log(kleur.bold().green(messages.finished(messages.targets[target])));
  console.log(kleur.gray(messages.docsHint));
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const main = async () => {
  const defaultLang = detectLanguage();
  const initialChoiceIndex = TRANSLATIONS[defaultLang].languageChoices.findIndex(
    (c) => c.value === defaultLang,
  );

  const languageChoice = await prompts(
    {
      type: 'select',
      name: 'language',
      message: TRANSLATIONS[defaultLang].languagePrompt,
      choices: TRANSLATIONS[defaultLang].languageChoices,
      initial: initialChoiceIndex >= 0 ? initialChoiceIndex : 0,
    },
    { onCancel: () => onCancel(defaultLang) },
  );

  const lang = (languageChoice.language || defaultLang) as Language;
  const messages = TRANSLATIONS[lang];

  console.log();
  console.log(kleur.bold().magenta(messages.welcome));
  console.log();

  const { target } = await prompts(
    {
      type: 'select',
      name: 'target',
      message: messages.targetPrompt,
      choices: [
        { title: messages.targets.codex, value: 'codex' },
        { title: messages.targets.claude, value: 'claude' },
        { title: messages.targets.opencode, value: 'opencode' },
        { title: messages.targets.codewhale, value: 'codewhale' },
      ],
      initial: 0,
    },
    { onCancel: () => onCancel(lang) },
  );

  const selectedTarget = (target || 'codex') as Target;

  await confirmInstall(lang, selectedTarget);
  const apiKey = await collectApiKey(lang);
  const endpoint = await selectEndpoint(lang, apiKey);

  switch (selectedTarget) {
    case 'codex':
      await configureCodex(lang, apiKey, endpoint);
      break;
    case 'claude':
      await configureClaude(lang, apiKey, endpoint);
      break;
    case 'opencode':
      await configureOpenCode(lang, apiKey, endpoint);
      break;
    case 'codewhale':
      await configureCodeWhale(lang, apiKey, endpoint);
      break;
    default:
      onCancel(lang);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});