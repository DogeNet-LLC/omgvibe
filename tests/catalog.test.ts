import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  agentModels,
  formatModelPrice,
  formatPrice,
  formatTokens,
  isAgentModel,
  loadCatalog,
  matchModel,
  type Model,
  pickDefaultModel,
  toModel,
} from '../src/core/catalog';
import { MOCK_MODELS, type MockGateway, startMockGateway } from './helpers/mock-gateway';

const models: Model[] = (MOCK_MODELS as Array<{ id: string }>).map((raw) => toModel(raw));
const ids = (list: Model[]): string[] => list.map((model) => model.id);

describe('toModel', () => {
  it('reads the base price from each pricing mode, in USD per million tokens', () => {
    const now = Date.parse('2026-11-14T00:00:00Z');
    const price = (pricing: unknown): [number | undefined, number | undefined] => {
      const model = toModel({ id: 'a/b', pricing } as never, now);
      return [model.inputPrice, model.outputPrice];
    };
    expect(price({ mode: 'flat', flat: [{ kind: 'text.input', price_credits: 550_000 }, { kind: 'text.output', price_credits: 2_750_000 }] })).toEqual([2.2, 11]);
    // Tiered and variant pricing: the first tier / the default variant.
    expect(
      price({
        mode: 'tiered',
        tiered: [
          { up_to: 100_001, items: [{ kind: 'text.input', price_credits: 27_500 }, { kind: 'text.output', price_credits: 137_500 }] },
          { up_to: 0, items: [{ kind: 'text.input', price_credits: 137_500 }, { kind: 'text.output', price_credits: 687_500 }] },
        ],
      }),
    ).toEqual([0.11, 0.55]);
    expect(
      price({
        mode: 'variant',
        variants: [
          { name: 'default', items: [{ kind: 'text.input', price_credits: 1_100_000 }, { kind: 'text.output', price_credits: 5_500_000 }] },
          { name: 'fast', items: [{ kind: 'text.input', price_credits: 2_200_000 }, { kind: 'text.output', price_credits: 11_000_000 }] },
        ],
      }),
    ).toEqual([4.4, 22]);
    // Rules: only the default service tier, and only rules in force today.
    expect(
      price({
        mode: 'rules',
        rules: [
          { kind: 'text.input', price_credits: 450_000, condition: { service_tier: 'default', max_input: 272_001 } },
          { kind: 'text.input', price_credits: 900_000, condition: { service_tier: 'default', min_input: 272_001 } },
          { kind: 'text.input', price_credits: 100_000, condition: { service_tier: 'batch' } },
          { kind: 'text.input', price_credits: 50_000, condition: { valid_until: '2026-01-01T00:00:00Z' } },
          { kind: 'text.output', price_credits: 2_250_000, condition: { service_tier: 'default' } },
          { kind: 'text.output', price_credits: 9_000_000, condition: { valid_from: '2027-01-01T00:00:00Z' } },
        ],
      }),
    ).toEqual([1.8, 9]);
    expect(price(undefined)).toEqual([undefined, undefined]);
  });

  it('marks web search support from the price list and retirement from the lifecycle', () => {
    const byId = (id: string): Model => models.find((model) => model.id === id)!;
    expect(byId('openai/gpt-5.5').webSearch).toBe(true);
    expect(byId('zhipu/glm-5.3').webSearch).toBe(false);
    expect(byId('anthropic/claude-sonnet-4-5').retiring).toEqual({ sunsetAt: '2026-11-30', successor: 'anthropic/claude-sonnet-5-5' });
    expect(byId('anthropic/claude-sonnet-5-5').retiring).toBeUndefined();
    expect(byId('zhipu/glm-5.3')).toMatchObject({ creator: 'zhipu', context: 1_048_576, maxOutput: 131_072 });
  });
});

describe('agent model selection', () => {
  it('offers only callable text models with room to work, strongest first', () => {
    const offered = ids(agentModels(models, 'openai-responses'));
    expect(offered).toEqual([
      'anthropic/claude-opus-5-5',
      'openai/gpt-6.1-sol',
      'anthropic/claude-sonnet-5-5',
      'anthropic/claude-haiku-5-5',
      'openai/gpt-5.5',
      'zhipu/glm-5.3',
      'deepseek/deepseek-v4.1-flash',
    ]);
    // Left out: the free test model, a retiring model, a tiny model, an audio model, an embedding model.
    for (const id of ['ohmygpt/mock', 'anthropic/claude-sonnet-4-5', 'tencent/hy-mt2-lite', 'google/gemini-3.8-flash-tts', 'openai/text-embedding-3-large']) {
      expect(offered).not.toContain(id);
    }
    expect(isAgentModel(models.find((model) => model.id === 'openai/text-embedding-3-large')!, 'openai-completions')).toBe(false);
  });

  it('picks the preferred default, follows a retired one to its successor, and otherwise stays with the creator', () => {
    expect(pickDefaultModel(models, 'openai-responses', ['openai/gpt-5.5'])?.id).toBe('openai/gpt-5.5');
    expect(pickDefaultModel(models, 'anthropic-messages', ['anthropic/claude-sonnet-4-5'])?.id).toBe('anthropic/claude-sonnet-5-5');
    expect(pickDefaultModel(models, 'openai-responses', ['openai/gpt-9-gone'])?.id).toBe('openai/gpt-6.1-sol');
    expect(pickDefaultModel(models, 'openai-responses', ['nobody/unknown'])?.id).toBe('anthropic/claude-opus-5-5');
    expect(pickDefaultModel([], 'openai-responses', ['openai/gpt-5.5'])).toBeUndefined();
  });
});

describe('matchModel', () => {
  it('accepts an exact ID as it is', () => {
    expect(matchModel(models, 'zhipu/glm-5.3')).toMatchObject({ model: { id: 'zhipu/glm-5.3' }, corrected: false });
  });

  it('corrects case, a bare name without its creator, and a mistyped name', () => {
    expect(matchModel(models, 'OpenAI/GPT-5.5')).toMatchObject({ model: { id: 'openai/gpt-5.5' }, corrected: true });
    expect(matchModel(models, 'claude-sonnet-5-5')).toMatchObject({ model: { id: 'anthropic/claude-sonnet-5-5' }, corrected: true });
    expect(matchModel(models, 'zhipu/gml-5.3')).toMatchObject({ model: { id: 'zhipu/glm-5.3' }, corrected: true });
    expect(matchModel(models, 'anthropic/claude-sonet-5-5')).toMatchObject({ model: { id: 'anthropic/claude-sonnet-5-5' }, corrected: true });
  });

  it('never swaps a version that does not exist for one that does', () => {
    const result = matchModel(models, 'zhipu/glm-5.4');
    expect(result.model).toBeUndefined();
    expect(result.suggestions[0]).toBe('zhipu/glm-5.3');
    expect(matchModel(models, 'anthropic/claude-opus-5-1').model).toBeUndefined();
  });

  it('does not guess when the input is vague, and suggests instead', () => {
    const vague = matchModel(models, 'claude');
    expect(vague.model).toBeUndefined();
    expect(vague.suggestions.length).toBeGreaterThan(0);
    expect(vague.suggestions.every((id) => id.includes('claude'))).toBe(true);
  });
});

describe('formatting', () => {
  it('formats token counts and prices compactly', () => {
    expect([1_000_000, 1_048_576, 1_050_000, 262_144, 8192, 512].map(formatTokens)).toEqual(['1M', '1M', '1.1M', '262K', '8K', '512']);
    expect([0, 0.0657, 0.11, 2.2, 11, 27.5, 150].map(formatPrice)).toEqual(['$0', '$0.0657', '$0.11', '$2.2', '$11', '$27.5', '$150']);
    expect(formatModelPrice(models.find((model) => model.id === 'anthropic/claude-sonnet-5-5')!)).toBe('$2.2 / $11');
    expect(formatModelPrice({ ...models[0]!, inputPrice: undefined })).toBe('');
  });
});

describe('loadCatalog', () => {
  let gateway: MockGateway;
  let home: string;
  const env = (): NodeJS.ProcessEnv => ({ OMGVIBE_HOME: home });

  beforeAll(async () => {
    gateway = await startMockGateway();
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'omgvibe-catalog-'));
  });
  afterAll(async () => {
    await gateway.close();
    await fs.rm(home, { recursive: true, force: true });
  });

  it('fetches once, then serves the cache while it is fresh', async () => {
    const first = await loadCatalog({ endpoint: gateway.url, env: env() });
    expect(first.stale).toBe(false);
    expect(first.models).toHaveLength(MOCK_MODELS.length);
    const requests = gateway.requests.length;
    const second = await loadCatalog({ endpoint: gateway.url, env: env() });
    expect(gateway.requests.length).toBe(requests);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    await loadCatalog({ endpoint: gateway.url, env: env(), refresh: true });
    expect(gateway.requests.length).toBe(requests + 1);
  });

  it('falls back to an old copy, marked stale, when the gateway cannot be reached', async () => {
    const offline = await loadCatalog({ endpoint: 'http://127.0.0.1:9', env: env(), maxAgeMs: 0 });
    expect(offline.stale).toBe(true);
    expect(offline.models.length).toBeGreaterThan(0);
  });

  it('ignores a cache written with another schema, and fails when there is nothing to fall back to', async () => {
    const cacheFile = path.join(home, 'cache', 'models.json');
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as { schema: number };
    await fs.writeFile(cacheFile, JSON.stringify({ ...cached, schema: cached.schema - 1 }));
    await expect(loadCatalog({ endpoint: 'http://127.0.0.1:9', env: env() })).rejects.toThrow();
  });
});
