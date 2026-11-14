import type { Lang } from '../core/store';
import { en, type Messages } from './en';
import { ja } from './ja';
import { zh } from './zh';

const LANGUAGES: Record<Lang, Messages> = { en, zh, ja };

export const LANGS: readonly Lang[] = ['en', 'zh', 'ja'];

/** Each language's own name, for the language picker. */
export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', zh: '简体中文', ja: '日本語' };

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** Maps `zh-CN`, `zh_TW.UTF-8`, `ja-JP` and the like to a supported language. */
export function parseLang(value: string | undefined): Lang | undefined {
  const tag = value?.trim().toLowerCase();
  if (!tag) return undefined;
  if (tag.startsWith('zh')) return 'zh';
  if (tag.startsWith('ja')) return 'ja';
  if (tag.startsWith('en')) return 'en';
  return undefined;
}

/**
 * The language of the user's system: the POSIX locale variables in their
 * documented order of precedence, then the locale Node resolved (which is
 * what Windows provides), then English.
 */
export function detectLang(env: NodeJS.ProcessEnv = process.env): Lang {
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG', 'LANGUAGE']) {
    const value = env[name];
    // `C` and `POSIX` mean "no localisation", not English by choice; keep looking.
    if (!value || /^(c|posix)(\.|$)/i.test(value)) continue;
    const lang = parseLang(value);
    if (lang) return lang;
  }
  try {
    return parseLang(Intl.DateTimeFormat().resolvedOptions().locale) ?? 'en';
  } catch {
    return 'en';
  }
}

let current: Messages = en;
let currentLang: Lang = 'en';

export function setLang(lang: Lang): void {
  current = LANGUAGES[lang];
  currentLang = lang;
}

export const lang = (): Lang => currentLang;

/** The messages for the active language. Read it at call time: `t().loginDone`. */
export const t = (): Messages => current;

export type { Messages };
