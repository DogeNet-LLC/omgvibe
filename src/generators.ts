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
  tool_mode: null;
  multi_agent_version: string;
  use_responses_lite: boolean;
  include_skills_usage_instructions: boolean;
  auto_review_model_override: null;
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
    instructions_variables: {
      personality_default: string;
      personality_friendly: string;
      personality_pragmatic: string;
    };
    approvals: null;
  };
  experimental_supported_tools: string[];
  supports_search_tool: boolean;
  default_service_tier: null;
  supports_reasoning_summaries: boolean;
  base_instructions: string;
}

function codexCatalogEntry(model: ModelEntry, priority: number): CodeXModelCatalogEntry {
  return {
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
