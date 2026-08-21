/**
 * Static data for omgvibe: API endpoints, provider/model catalog, and
 * wire-API capability rules.
 *
 * The model catalog below is derived from the OhMyGPT pricing library at
 * `~/proj/uni-pricing-data-repo` (packages/core/src/data/models.data.ts).
 */

export type ProviderKey =
  | 'openai'
  | 'together'
  | 'alibaba'
  | 'tencent'
  | 'deepseek'
  | 'anthropic'
  | 'fireworks';

export interface EndpointDef {
  id: string;
  url: string;
}

export interface ModelEntry {
  id: string;
  name: string;
  provider: ProviderKey;
  group: string;
  context: number;
  output?: number;
  recommended?: boolean;
  note?: string;
  codexDefault?: boolean;
}

/**
 * API relay endpoints. Each exposes a direct OpenAI-compatible `/v1` base
 * (Responses at `/v1/responses`, Chat Completions at `/v1/chat/completions`,
 * Anthropic Messages at `/v1/messages`).
 */
export const ENDPOINTS: EndpointDef[] = [
  { id: 'cdn', url: 'https://apic1.ohmycdn.com' },
  { id: 'us', url: 'https://api.ohmygpt.com' },
  { id: 'cn', url: 'https://cn2us02.opapi.win' },
];

export const API_KEY_URL = 'https://www.ohmygpt.com/apis/keys';

/**
 * The `/v1` base for a given endpoint (used as base_url for every target).
 */
export const baseURLOf = (endpoint: EndpointDef) => `${endpoint.url}/v1`;

/**
 * Wire-API capability rules:
 * - Anthropic's own models speak Messages + Chat Completions, not Responses.
 * - OpenAI's gpt-5.6 family speaks Responses + Chat Completions, not Messages.
 * - Everything else (Together, Alibaba, Tencent, DeepSeek, Fireworks) speaks
 *   all three native APIs.
 */
export const supportsResponses = (m: ModelEntry) => m.provider !== 'anthropic';
export const supportsChat = (_m: ModelEntry) => true;
export const supportsMessages = (m: ModelEntry) => m.provider !== 'openai';

const PROVIDER_GROUP: Record<ProviderKey, string> = {
  openai: 'OpenAI',
  together: 'Together AI',
  alibaba: 'Alibaba Cloud',
  tencent: 'Tencent Cloud',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  fireworks: 'Fireworks',
};

/**
 * Full model catalog, in a curated order. The first three entries are the
 * CodeX defaults; the next four are the highlighted recommendations; the rest
 * follow provider grouping so pickers stay readable.
 */
const RAW_MODELS: Array<{
  id: string;
  name: string;
  provider: ProviderKey;
  context: number;
  output?: number;
  recommended?: boolean;
  note?: string;
  codexDefault?: boolean;
}> = [
  // CodeX defaults (OpenAI gpt-5.6 family).
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', provider: 'openai', context: 1050000, output: 128000, codexDefault: true },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', provider: 'openai', context: 1050000, output: 128000, codexDefault: true },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', provider: 'openai', context: 1050000, output: 128000, codexDefault: true },

  // Highlighted recommendations.
  { id: 'alibaba:deepseek/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash 0731 (Alibaba Cloud)', provider: 'alibaba', context: 1000000, output: 384000, recommended: true, note: 'High performance, cheap, great value' },
  { id: 'alibaba:deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813 (Alibaba Cloud)', provider: 'alibaba', context: 1000000, output: 384000, recommended: true, note: 'Pricier but higher-performance domestic model' },
  { id: 'tencent/glm-5.3', name: 'GLM-5.3', provider: 'tencent', context: 1000000, output: 128000, recommended: true, note: 'Pricier but higher-performance domestic model' },
  { id: 'fireworks/kimi-k3', name: 'Kimi K3', provider: 'fireworks', context: 1048576, output: 131072, recommended: true, note: 'High-intelligence domestic model, pricier, served by Fireworks AI' },

  // Together AI.
  { id: 'TA/openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'together', context: 128000 },
  { id: 'TA/openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'together', context: 128000 },
  { id: 'TA/deepseek-ai/DeepSeek-V3.1', name: 'DeepSeek V3.1', provider: 'together', context: 128000 },
  { id: 'TA/deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', provider: 'together', context: 64000, output: 8000 },
  { id: 'TA/deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'together', context: 64000, output: 8000 },
  { id: 'TA/Qwen/Qwen2.5-7B-Instruct-Turbo', name: 'Qwen2.5 7B Instruct Turbo', provider: 'together', context: 128000 },

  // Alibaba Cloud.
  { id: 'qwen/qwen3.8-max', name: 'Qwen3.8 Max', provider: 'alibaba', context: 1000000, output: 131072 },
  { id: 'alibaba:deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro (Alibaba Cloud)', provider: 'alibaba', context: 1000000, output: 384000 },
  { id: 'alibaba:deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash (Alibaba Cloud)', provider: 'alibaba', context: 1000000, output: 384000 },
  { id: 'alibaba:moonshot/kimi-k2.7-code', name: 'Kimi K2.7 Code (Alibaba Cloud)', provider: 'alibaba', context: 1048576, output: 65536 },
  { id: 'alibaba:moonshot/kimi-k2.5', name: 'Kimi K2.5 (Alibaba Cloud)', provider: 'alibaba', context: 262144, output: 262144 },
  { id: 'alibaba:zhipu/glm-5.2', name: 'GLM-5.2 (Alibaba Cloud)', provider: 'alibaba', context: 1000000, output: 65536 },
  { id: 'alibaba:zhipu/glm-5.1', name: 'GLM-5.1 (Alibaba Cloud)', provider: 'alibaba', context: 200000, output: 128000 },

  // Tencent Cloud.
  { id: 'glm-5.2', name: 'GLM-5.2', provider: 'tencent', context: 1000000, output: 128000 },
  { id: 'tencent/hy3', name: 'Hy3', provider: 'tencent', context: 256000, output: 128000 },
  { id: 'tencent/kimi-k3', name: 'Kimi K3', provider: 'tencent', context: 1000000, output: 1000000 },

  // DeepSeek.
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', context: 1000000, output: 384000 },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek', context: 1000000, output: 384000 },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', context: 1000000, output: 384000 },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', context: 1000000, output: 384000 },

  // Anthropic.
  { id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'anthropic', context: 1000000, output: 128000 },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic', context: 1000000, output: 128000 },
  { id: 'claude-fable-5', name: 'Claude Fable 5', provider: 'anthropic', context: 1000000, output: 128000 },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', provider: 'anthropic', context: 1000000, output: 128000 },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic', context: 1000000, output: 128000 },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', context: 1000000, output: 128000 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', context: 1000000, output: 64000 },
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic', context: 200000, output: 64000 },
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5 (20251101)', provider: 'anthropic', context: 200000, output: 64000 },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', context: 200000, output: 64000 },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (20250929)', provider: 'anthropic', context: 200000, output: 64000 },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'anthropic', context: 200000, output: 64000 },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (20251001)', provider: 'anthropic', context: 200000, output: 64000 },

  // Fireworks.
  { id: 'fireworks/glm-5p2', name: 'GLM-5.2', provider: 'fireworks', context: 1048575, output: 131072 },
  { id: 'fireworks/kimi-k2p7-code', name: 'Kimi K2.7 Code', provider: 'fireworks', context: 262000, output: 262000 },
  { id: 'fireworks/minimax-m3', name: 'MiniMax-M3', provider: 'fireworks', context: 512000, output: 512000 },
  { id: 'fireworks/qwen3p7-plus', name: 'Qwen 3.7 Plus', provider: 'fireworks', context: 262144, output: 65536 },
  { id: 'fireworks/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'fireworks', context: 1000000, output: 384000 },
  { id: 'fireworks/kimi-k2p6', name: 'Kimi K2.6', provider: 'fireworks', context: 262000, output: 262000 },
  { id: 'fireworks/minimax-m2p7', name: 'MiniMax-M2.7', provider: 'fireworks', context: 196608, output: 196608 },
  { id: 'fireworks/gpt-oss-120b', name: 'OpenAI gpt-oss-120b', provider: 'fireworks', context: 131072, output: 32768 },
  { id: 'fireworks/gpt-oss-20b', name: 'OpenAI gpt-oss-20b', provider: 'fireworks', context: 131072, output: 32768 },
  { id: 'fireworks/nemotron-3-ultra-nvfp4', name: 'NVIDIA Nemotron 3 Ultra NVFP4', provider: 'fireworks', context: 262144 },
  { id: 'fireworks/inkling', name: 'Inkling', provider: 'fireworks', context: 1048576 },
  { id: 'fireworks/deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'fireworks', context: 1000000, output: 384000 },
  { id: 'fireworks/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash 0731', provider: 'fireworks', context: 1000000, output: 131072 },
  { id: 'fireworks/kimi-k3-fast', name: 'Kimi K3 Fast', provider: 'fireworks', context: 1048576, output: 131072 },
  { id: 'fireworks/glm-5p2-fast', name: 'GLM-5.2 Fast', provider: 'fireworks', context: 1048575, output: 131072 },
  { id: 'fireworks/kimi-k2p7-code-fast', name: 'Kimi K2.7 Code Fast', provider: 'fireworks', context: 262000, output: 262000 },
  { id: 'fireworks/kimi-k2p6-turbo', name: 'Kimi K2.6 Turbo', provider: 'fireworks', context: 262000, output: 262000 },
];

export const MODELS: ModelEntry[] = RAW_MODELS.map((m) => ({
  ...m,
  group: PROVIDER_GROUP[m.provider],
}));

export const modelById = (id: string): ModelEntry | undefined =>
  MODELS.find((m) => m.id === id);

/** Models available for the CodeX Responses API (everything except Anthropic). */
export const codexModels = (): ModelEntry[] => MODELS.filter(supportsResponses);

/** Models available for Claude/OpenCode/CodeWhale (everything except OpenAI). */
export const messageAndChatModels = (): ModelEntry[] => MODELS.filter(supportsMessages);

/** The 3 CodeX defaults, in order. */
export const codexDefaults = (): ModelEntry[] =>
  MODELS.filter((m) => m.codexDefault);

/** The highlighted recommendations (used for ordering/prominence). */
export const recommendedModels = (): ModelEntry[] => MODELS.filter((m) => m.recommended);