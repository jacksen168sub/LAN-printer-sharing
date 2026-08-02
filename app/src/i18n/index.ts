// vue-i18n 实例 + 语言检测/持久化。
// 优先级:localStorage 持久化选择 > 浏览器/系统语言自动检测 > 英文回退。
// 各 locale 按 Messages 接口校验,漏键编译报错(callsite 的 t() key 不做严格校验,见 README/notes)。
import { createI18n } from 'vue-i18n';
import { type Messages } from './messages';
import { zhCN } from './zh-CN';
import { en } from './en';

declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends Messages {}
}

export type Locale = 'zh-CN' | 'en';
const SUPPORTED: Locale[] = ['zh-CN', 'en'];
const STORAGE_KEY = 'lps.locale';
const DEFAULT_LOCALE: Locale = 'en';

/** 按 navigator.language(s) 匹配已支持语言,未命中回退英文。 */
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const langs = [navigator.language, ...(navigator.languages ?? [])];
  for (const l of langs) {
    const low = (l || '').toLowerCase();
    if (low.startsWith('zh')) return 'zh-CN';
    if (low.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

/** 初始:持久化选择优先,否则自动检测。 */
function loadLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (SUPPORTED as string[]).includes(saved)) return saved as Locale;
  } catch { /* localStorage 不可用,忽略 */ }
  return detectLocale();
}

export const i18n = createI18n({
  legacy: false,
  locale: loadLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { 'zh-CN': zhCN, en },
});

/** 切换语言并持久化(切换后不再被自动检测覆盖)。 */
export function setLocale(l: Locale) {
  i18n.global.locale.value = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* 忽略 */ }
}

export function getLocale(): Locale {
  return i18n.global.locale.value as Locale;
}

/** 通道状态枚举 → 本地化文案。 */
export function peerStateLabel(st: 'connecting' | 'open' | 'closed' | undefined): string {
  if (st === 'connecting') return i18n.global.t('peer.stateConnecting');
  if (st === 'open') return i18n.global.t('peer.stateOpen');
  if (st === 'closed') return i18n.global.t('peer.stateClosed');
  return i18n.global.t('peer.stateUnknown');
}
