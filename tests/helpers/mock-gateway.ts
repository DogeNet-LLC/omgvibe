import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A local stand-in for the OhMyGPT gateway. It answers the endpoints omgvibe
 * itself calls (`/api/v1/ping`, `/v1/models`, `/v1/me`) and the three model
 * protocols well enough for a real agent CLI to finish one turn, and it
 * records every request so a test can assert what the agent actually sent.
 */

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

export interface MockGateway {
  /** Base URL without `/v1`, e.g. `http://127.0.0.1:53211`. */
  url: string;
  requests: RecordedRequest[];
  /** Requests to a model protocol endpoint (messages, responses, chat completions). */
  modelCalls(): RecordedRequest[];
  close(): Promise<void>;
}

export interface MockGatewayOptions {
  /** The only key `/v1/me` and the model endpoints accept. */
  apiKey?: string;
  /** Set to make `/v1/me` report an account that has never topped up. */
  neverToppedUp?: boolean;
  /** Extra latency added to every response, in ms. */
  delayMs?: number;
  /** Replace the model list. */
  models?: unknown[];
}

export const MOCK_KEY = 'sk-test-0123456789abcdef';
const REPLY = 'This is a mock reply from OhMyGPT.';

const protocols = (id: string): unknown[] => [
  { id: 'openai-completions', path: '/v1/chat/completions' },
  { id: 'openai-responses', path: '/v1/responses' },
  { id: 'anthropic-messages', path: '/v1/messages' },
  { id: 'google-generative-ai', path: '/v1/models/{id}:generateContent', model: id },
];

interface ModelSeed {
  id: string;
  name: string;
  context?: number;
  output?: number;
  score?: number;
  rating?: number;
  created?: number;
  input?: number;
  outputPrice?: number;
  /** The gateway offers its web search tool for this model. */
  webSearch?: boolean;
  extra?: Record<string, unknown>;
}

const model = (seed: ModelSeed): unknown => ({
  id: seed.id,
  object: 'model',
  name: seed.name,
  owned_by: seed.id.split('/')[0],
  service: 'llm',
  available: true,
  context_length: seed.context ?? 1_000_000,
  limits: { max_completion_tokens: seed.output ?? 128_000 },
  modalities: { input: ['text', 'image'], output: ['text'] },
  protocols: protocols(seed.id),
  ...(seed.score === undefined ? {} : { capability: { score: seed.score } }),
  ...(seed.rating === undefined ? {} : { preference: { rating: seed.rating } }),
  created: seed.created ?? 1_780_000_000,
  pricing: {
    mode: 'flat',
    flat: [
      { kind: 'text.input', price_credits: (seed.input ?? 2) * 250_000 },
      { kind: 'text.output', price_credits: (seed.outputPrice ?? 10) * 250_000 },
      ...(seed.webSearch ? [{ kind: 'web_search', price_credits: 2750 }] : []),
    ],
  },
  ...seed.extra,
});

/** A small catalog in the gateway's real wire shape, covering the cases the code branches on. */
export const MOCK_MODELS: unknown[] = [
  model({ id: 'anthropic/claude-opus-5-5', webSearch: true, name: 'Claude Opus 5.5', score: 168.5, rating: 1513, input: 4.4, outputPrice: 22 }),
  model({ id: 'anthropic/claude-sonnet-5-5', webSearch: true, name: 'Claude Sonnet 5.5', score: 166.5, rating: 1468, input: 2.2, outputPrice: 11 }),
  model({ id: 'anthropic/claude-haiku-5-5', webSearch: true, name: 'Claude Haiku 5.5', score: 160.4, rating: 1398, input: 1.1, outputPrice: 5.5 }),
  model({ id: 'openai/gpt-5.5', webSearch: true, name: 'GPT-5.5', context: 1_050_000, score: 160.1, rating: 1466, input: 4.5, outputPrice: 27 }),
  model({ id: 'openai/gpt-6.1-sol', webSearch: true, name: 'GPT-6.1 Sol', context: 1_050_000, score: 168.4, rating: 1445 }),
  model({ id: 'openai/gpt-6.1-terra', webSearch: true, name: 'GPT-6.1 Terra', context: 1_050_000, score: 164.2, rating: 1440 }),
  model({ id: 'zhipu/glm-5.3', name: 'GLM-5.3', context: 1_048_576, output: 131_072, score: 157.1, rating: 1475, input: 0.7, outputPrice: 2.45 }),
  model({ id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', output: 384_000, score: 156.7, input: 0.11, outputPrice: 0.22 }),
  model({ id: 'deepseek/deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017)', output: 384_000, score: 156.5, input: 0.11, outputPrice: 0.22 }),
  // Scheduled for retirement, with a successor.
  model({
    id: 'anthropic/claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    context: 200_000,
    output: 64_000,
    score: 150,
    extra: { lifecycle: { status: 'deprecated', sunset_at: '2026-11-30', successor: 'anthropic/claude-sonnet-5-5' } },
  }),
  // Too small for an agent.
  model({ id: 'tencent/hy-mt2-lite', name: 'Hy-MT2 Lite', context: 8000, output: 4000 }),
  // Speaks the chat protocols but produces audio.
  model({
    id: 'google/gemini-3.8-flash-tts',
    name: 'Gemini 3.8 Flash TTS',
    context: 8192,
    extra: { modalities: { input: ['text'], output: ['audio'] } },
  }),
  model({ id: 'ohmygpt/mock', name: 'OhMyGPT Mock', context: 128_000, output: 4096, input: 0, outputPrice: 0 }),
  // Not a chat model at all.
  {
    id: 'openai/text-embedding-3-large',
    object: 'model',
    name: 'Text Embedding 3 Large',
    owned_by: 'openai',
    service: 'embedding',
    available: true,
    context_length: 8191,
    protocols: [{ id: 'openai-embeddings', path: '/v1/embeddings' }],
    modalities: { input: ['text'], output: ['embedding'] },
    pricing: { mode: 'flat', flat: [{ kind: 'embedding.input', price_credits: 32_500 }] },
  },
];

const MODEL_PATHS = new Set(['/v1/messages', '/v1/responses', '/v1/chat/completions']);

function sse(response: http.ServerResponse, events: Array<{ event?: string; data: unknown }>): void {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  for (const { event, data } of events) {
    if (event) response.write(`event: ${event}\n`);
    response.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  }
  response.end();
}

function json(response: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

const openAiError = (code: string, message: string, type: string): unknown => ({ error: { code, message, type } });

function messagesReply(response: http.ServerResponse, body: { model?: string; stream?: boolean }): void {
  const modelId = body.model ?? 'mock';
  const usage = { input_tokens: 12, output_tokens: 9 };
  if (!body.stream) {
    json(response, 200, {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model: modelId,
      content: [{ type: 'text', text: REPLY }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage,
    });
    return;
  }
  sse(response, [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: { id: 'msg_mock', type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0 } },
      },
    },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: REPLY } } },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } } },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]);
}

function responsesReply(response: http.ServerResponse, body: { model?: string; stream?: boolean }): void {
  const modelId = body.model ?? 'mock';
  const item = {
    type: 'message',
    id: 'msg_mock',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text: REPLY, annotations: [] }],
  };
  const usage = { input_tokens: 12, input_tokens_details: { cached_tokens: 0 }, output_tokens: 9, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 21 };
  const base = { id: 'resp_mock', object: 'response', created_at: 1_794_000_000, model: modelId };
  const completed = { ...base, status: 'completed', output: [item], usage };
  if (!body.stream) {
    json(response, 200, completed);
    return;
  }
  sse(response, [
    { event: 'response.created', data: { type: 'response.created', sequence_number: 0, response: { ...base, status: 'in_progress', output: [] } } },
    { event: 'response.output_item.added', data: { type: 'response.output_item.added', sequence_number: 1, output_index: 0, item: { ...item, status: 'in_progress', content: [] } } },
    { event: 'response.content_part.added', data: { type: 'response.content_part.added', sequence_number: 2, item_id: 'msg_mock', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } } },
    { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', sequence_number: 3, item_id: 'msg_mock', output_index: 0, content_index: 0, delta: REPLY } },
    { event: 'response.output_text.done', data: { type: 'response.output_text.done', sequence_number: 4, item_id: 'msg_mock', output_index: 0, content_index: 0, text: REPLY } },
    { event: 'response.content_part.done', data: { type: 'response.content_part.done', sequence_number: 5, item_id: 'msg_mock', output_index: 0, content_index: 0, part: { type: 'output_text', text: REPLY, annotations: [] } } },
    { event: 'response.output_item.done', data: { type: 'response.output_item.done', sequence_number: 6, output_index: 0, item } },
    { event: 'response.completed', data: { type: 'response.completed', sequence_number: 7, response: completed } },
  ]);
}

function chatReply(response: http.ServerResponse, body: { model?: string; stream?: boolean }): void {
  const modelId = body.model ?? 'mock';
  const usage = { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 };
  if (!body.stream) {
    json(response, 200, {
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: 1_794_000_000,
      model: modelId,
      choices: [{ index: 0, message: { role: 'assistant', content: REPLY }, finish_reason: 'stop' }],
      usage,
    });
    return;
  }
  const chunk = (delta: unknown, finish: string | null, extra: Record<string, unknown> = {}): unknown => ({
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: 1_794_000_000,
    model: modelId,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...extra,
  });
  sse(response, [
    { data: chunk({ role: 'assistant', content: '' }, null) },
    { data: chunk({ content: REPLY }, null) },
    { data: chunk({}, 'stop', { usage }) },
    { data: '[DONE]' },
  ]);
}

export async function startMockGateway(options: MockGatewayOptions = {}): Promise<MockGateway> {
  const apiKey = options.apiKey ?? MOCK_KEY;
  const requests: RecordedRequest[] = [];

  const authorized = (request: http.IncomingMessage): boolean => {
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    return bearer === apiKey || request.headers['x-api-key'] === apiKey;
  };

  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://mock');
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        // keep the raw text
      }
      requests.push({ method: request.method ?? 'GET', path: url.pathname, headers: request.headers, body });

      const reply = (): void => {
        if (url.pathname === '/api/v1/ping') {
          json(response, 200, { statusCode: 200, message: 'pong' });
        } else if (url.pathname === '/v1/models' && request.method === 'GET') {
          json(response, 200, { object: 'list', data: options.models ?? MOCK_MODELS });
        } else if (url.pathname === '/v1/me') {
          if (!authorized(request)) {
            json(response, 401, openAiError('invalid_api_key', 'Invalid API key. Copy a key from https://www.ohmygpt.com/keys.', 'authentication_error'));
          } else {
            json(response, 200, { user_id: 4242, rpm: 1000, recharge_band: 'vip', recharge_total_cny: options.neverToppedUp ? 0 : 50 });
          }
        } else if (MODEL_PATHS.has(url.pathname) && request.method === 'POST') {
          if (!authorized(request)) {
            json(response, 401, openAiError('invalid_api_key', 'Invalid API key.', 'authentication_error'));
            return;
          }
          const payload = (typeof body === 'object' && body !== null ? body : {}) as { model?: string; stream?: boolean };
          if (url.pathname === '/v1/messages') messagesReply(response, payload);
          else if (url.pathname === '/v1/responses') responsesReply(response, payload);
          else chatReply(response, payload);
        } else if (url.pathname === '/v1/messages/count_tokens') {
          json(response, 200, { input_tokens: 12 });
        } else {
          json(response, 404, openAiError('not_found', `No route for ${request.method} ${url.pathname}`, 'not_found_error'));
        }
      };
      if (options.delayMs) setTimeout(reply, options.delayMs);
      else reply();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    modelCalls: () => requests.filter((request) => MODEL_PATHS.has(request.path) && request.method === 'POST'),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
