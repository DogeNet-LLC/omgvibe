/**
 * Configuration content generators for each supported CLI target.
 *
 * All targets share the same API key and the same selected relay endpoint
 * (the direct `/v1` base URL chosen by the latency probe).
 */

import { homedir } from 'os';
import path from 'path';

import { baseURLOf, type EndpointDef, type ModelEntry } from './data';
import { CODEX_SYSTEM_PROMPT } from './codex-prompt';

/** Minimal TOML string escaping (keys/values we embed are simple, but be safe). */
const tomlString = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const DEFAULT_REASONING_LEVELS = [
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'high', description: 'Extra high reasoning depth for complex problems' },
  { effort: 'max', description: 'Maximum reasoning depth for the hardest problems' },
];

// Derived from OpenAI's official CodeX model catalog
// (docs/cli-docs/codex-models.json) for the gpt-5.6 family. These models are
// multimodal and use CodeX's Responses-Lite "code mode" rather than the generic
// third-party fallback used by every other relay model.
const GPT56_REASONING_LEVELS = [
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
  { effort: 'high', description: 'Greater reasoning depth for complex problems' },
  { effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
  { effort: 'max', description: 'Maximum reasoning depth for the hardest problems' },
  { effort: 'ultra', description: 'Maximum reasoning with automatic task delegation' },
];

// ---------------------------------------------------------------------------
// CodeX
// ---------------------------------------------------------------------------

interface CodeXModelCatalogEntry {
  slug: string;
  prefer_websockets: boolean;
  support_verbosity: boolean;
  default_verbosity: string;
  apply_patch_tool_type: string;
  web_search_tool_type: string;
  input_modalities: string[];
  supports_image_detail_original: boolean;
  truncation_policy: { mode: string; limit: number };
  supports_parallel_tool_calls: boolean;
  tool_mode: string | null;
  multi_agent_version: string;
  use_responses_lite: boolean;
  include_skills_usage_instructions: boolean;
  include_apps_usage_instructions?: boolean;
  include_plugin_usage_instructions?: boolean;
  node_repl_auto_review_required?: boolean;
  node_repl_disabled?: boolean;
  auto_review_model_override: null;
  model_specialty?: string | null;
  context_window: number;
  max_context_window: number;
  effective_context_window_percent: number;
  auto_compact_token_limit: null;
  comp_hash: string;
  reasoning_summary_format: string;
  default_reasoning_summary: string;
  display_name: string;
  description: string;
  default_reasoning_level: string;
  supported_reasoning_levels: Array<{ effort: string; description: string }>;
  shell_type: string;
  visibility: string;
  minimal_client_version: string;
  supported_in_api: boolean;
  availability_nux: null;
  upgrade: null;
  priority: number;
  model_messages: {
    instructions_template: string;
    instructions_variables:
      | {
          personality_default: string;
          personality_friendly: string;
          personality_pragmatic: string;
        }
      | null;
    approvals: null;
  };
  experimental_supported_tools: string[];
  supports_search_tool: boolean;
  default_service_tier: null;
  supports_reasoning_summary_parameter?: boolean;
  supports_reasoning_summaries: boolean;
  base_instructions: string;
}

type CodeXModelCatalogOverrides = Partial<CodeXModelCatalogEntry>;

/**
 * Official CodeX metadata for OpenAI's gpt-5.6 family. Source:
 * docs/cli-docs/codex-models.json.
 */
const CODEX_GPT56_OVERRIDES: Record<string, CodeXModelCatalogOverrides> = {
  'gpt-5.6-sol': {
    prefer_websockets: true,
    web_search_tool_type: 'text_and_image',
    input_modalities: ['text', 'image'],
    supports_image_detail_original: true,
    supports_parallel_tool_calls: true,
    tool_mode: 'code_mode_only',
    use_responses_lite: true,
    include_apps_usage_instructions: true,
    include_plugin_usage_instructions: true,
    node_repl_auto_review_required: false,
    node_repl_disabled: false,
    model_specialty: null,
    effective_context_window_percent: undefined,
    reasoning_summary_format: undefined,
    context_window: 272000,
    max_context_window: 872000,
    display_name: 'GPT-5.6-Sol',
    description: 'Latest frontier agentic coding model.',
    default_reasoning_level: 'low',
    supported_reasoning_levels: GPT56_REASONING_LEVELS,
    shell_type: 'unified_exec',
    multi_agent_version: 'v2',
    priority: 1,
    model_messages: {
      instructions_template: CODEX_SYSTEM_PROMPT,
      instructions_variables: null,
      approvals: null,
    },
    supports_reasoning_summary_parameter: true,
    base_instructions: CODEX_SYSTEM_PROMPT,
  },
  'gpt-5.6-terra': {
    prefer_websockets: true,
    web_search_tool_type: 'text_and_image',
    input_modalities: ['text', 'image'],
    supports_image_detail_original: true,
    supports_parallel_tool_calls: true,
    tool_mode: 'code_mode_only',
    use_responses_lite: true,
    include_apps_usage_instructions: true,
    include_plugin_usage_instructions: true,
    node_repl_auto_review_required: false,
    node_repl_disabled: false,
    model_specialty: null,
    effective_context_window_percent: undefined,
    reasoning_summary_format: undefined,
    context_window: 272000,
    max_context_window: 872000,
    display_name: 'GPT-5.6-Terra',
    description: 'Balanced agentic coding model for everyday work.',
    default_reasoning_level: 'medium',
    supported_reasoning_levels: GPT56_REASONING_LEVELS,
    shell_type: 'unified_exec',
    multi_agent_version: 'v2',
    priority: 2,
    model_messages: {
      instructions_template: CODEX_SYSTEM_PROMPT,
      instructions_variables: null,
      approvals: null,
    },
    supports_reasoning_summary_parameter: true,
    base_instructions: CODEX_SYSTEM_PROMPT,
  },
  'gpt-5.6-luna': {
    prefer_websockets: true,
    web_search_tool_type: 'text_and_image',
    input_modalities: ['text', 'image'],
    supports_image_detail_original: true,
    supports_parallel_tool_calls: true,
    tool_mode: 'code_mode_only',
    use_responses_lite: true,
    include_apps_usage_instructions: true,
    include_plugin_usage_instructions: true,
    node_repl_auto_review_required: false,
    node_repl_disabled: false,
    model_specialty: null,
    effective_context_window_percent: undefined,
    reasoning_summary_format: undefined,
    context_window: 272000,
    max_context_window: 872000,
    display_name: 'GPT-5.6-Luna',
    description: 'Fast and affordable agentic coding model.',
    default_reasoning_level: 'medium',
    supported_reasoning_levels: GPT56_REASONING_LEVELS.slice(0, -1),
    shell_type: 'unified_exec',
    multi_agent_version: 'v1',
    priority: 3,
    model_messages: {
      instructions_template: CODEX_SYSTEM_PROMPT,
      instructions_variables: null,
      approvals: null,
    },
    supports_reasoning_summary_parameter: true,
    base_instructions: CODEX_SYSTEM_PROMPT,
  },
};

function codexCatalogEntry(model: ModelEntry, priority: number): CodeXModelCatalogEntry {
  const base: CodeXModelCatalogEntry = {
    slug: model.id,
    prefer_websockets: false,
    support_verbosity: true,
    default_verbosity: 'low',
    apply_patch_tool_type: 'freeform',
    web_search_tool_type: 'text',
    input_modalities: ['text'],
    supports_image_detail_original: false,
    truncation_policy: { mode: 'tokens', limit: 10000 },
    supports_parallel_tool_calls: true,
    tool_mode: null,
    multi_agent_version: 'v2',
    use_responses_lite: false,
    include_skills_usage_instructions: false,
    auto_review_model_override: null,
    context_window: model.context,
    max_context_window: model.context,
    effective_context_window_percent: 95,
    auto_compact_token_limit: null,
    comp_hash: '3000',
    reasoning_summary_format: 'experimental',
    default_reasoning_summary: 'none',
    display_name: model.name,
    description: `${model.name} via OhMyGPT (${model.group}).`,
    default_reasoning_level: 'high',
    supported_reasoning_levels: DEFAULT_REASONING_LEVELS,
    shell_type: 'shell_command',
    visibility: 'list',
    minimal_client_version: '0.144.0',
    supported_in_api: true,
    availability_nux: null,
    upgrade: null,
    priority,
    model_messages: {
      instructions_template: CODEX_SYSTEM_PROMPT,
      instructions_variables: {
        personality_default: '',
        personality_friendly: '',
        personality_pragmatic: '',
      },
      approvals: null,
    },
    experimental_supported_tools: [],
    supports_search_tool: true,
    default_service_tier: null,
    supports_reasoning_summaries: true,
    base_instructions: CODEX_SYSTEM_PROMPT,
  };
  const overrides = CODEX_GPT56_OVERRIDES[model.id];
  return overrides ? { ...base, ...overrides } : base;
}

/** `~/.codex/models.json` — the CodeX model catalog. */
export function buildCodexModelsJson(models: ModelEntry[]): string {
  const catalog = { models: models.map((m, i) => codexCatalogEntry(m, i + 1)) };
  return JSON.stringify(catalog, null, 2) + '\n';
}

/** `~/.codex/config.toml`. The API key is embedded as `experimental_bearer_token`. */
export function buildCodexConfig(endpoint: EndpointDef, defaultModel: string, apiKey: string): string {
  const base = baseURLOf(endpoint);
  // Use an absolute path (not `~/…`) so CodeX always resolves the custom
  // model catalog regardless of how it expands tilde across versions.
  const catalogPath = path.join(homedir(), '.codex', 'models.json');
  return [
    'model_provider = "omg"',
    `model = ${tomlString(defaultModel)}`,
    'model_reasoning_effort = "high"',
    'disable_response_storage = true',
    'preferred_auth_method = "apikey"',
    'forced_login_method = "api"',
    `model_catalog_json = ${tomlString(catalogPath)}`,
    '',
    '[model_providers.omg]',
    'name = "omg"',
    `base_url = ${tomlString(base)}`,
    'wire_api = "responses"',
    `experimental_bearer_token = ${tomlString(apiKey)}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

/** `~/.claude/settings.json`. */
export function buildClaudeSettings(
  endpoint: EndpointDef,
  apiKey: string,
  opusModel: string,
  sonnetModel: string,
  haikuModel: string,
  subagentModel: string,
): string {
  const base = endpoint.url;
  const settings = {
    env: {
      DISABLE_TELEMETRY: '1',
      OTEL_METRICS_EXPORTER: 'otlp',
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_BASE_URL: base,
      ANTHROPIC_MODEL: sonnetModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
      CLAUDE_CODE_SUBAGENT_MODEL: subagentModel,
      CLAUDE_CODE_EFFORT_LEVEL: 'high',
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '786432',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
    includeCoAuthoredBy: false,
    apiKeyHelper: `echo ${apiKey}`,
    permissions: {
      allow: [] as string[],
      deny: [] as string[],
    },
  };
  return JSON.stringify(settings, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// OpenCode
// ---------------------------------------------------------------------------

/** `~/.config/opencode/opencode.json`. */
export function buildOpenCodeConfig(
  endpoint: EndpointDef,
  apiKey: string,
  defaultModel: string,
  models: ModelEntry[],
): string {
  // OpenCode's config schema requires `limit.output` to be present. A few
  // catalog entries don't advertise a max output, so fill a sane 32K default
  // rather than emitting an object that fails schema validation.
  const DEFAULT_OUTPUT_TOKENS = 32768;
  const modelMap: Record<string, { name: string; limit: { context: number; output: number } }> = {};
  for (const m of models) {
    modelMap[m.id] = {
      name: m.name,
      limit: { context: m.context, output: m.output ?? DEFAULT_OUTPUT_TOKENS },
    };
  }

  const config = {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      omg: {
        npm: '@ai-sdk/openai-compatible',
        name: 'OhMyGPT',
        options: {
          baseURL: baseURLOf(endpoint),
          apiKey,
        },
        models: modelMap,
      },
    },
    model: `omg/${defaultModel}`,
  };
  return JSON.stringify(config, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// CodeWhale
// ---------------------------------------------------------------------------

/** `~/.codewhale/config.toml`. */
export function buildCodeWhaleConfig(
  endpoint: EndpointDef,
  apiKey: string,
  model: ModelEntry,
): string {
  const base = baseURLOf(endpoint);
  return [
    'provider = "openai"',
    `default_text_model = ${tomlString(model.id)}`,
    '',
    '[providers.openai]',
    `api_key = ${tomlString(apiKey)}`,
    `base_url = ${tomlString(base)}`,
    `context_window = ${model.context}`,
    '',
  ].join('\n');
}
