import { reactive } from 'vue';
import type { PeerContent } from 'shared';

const ID_KEY = 'lps.identity.id';
const CONTENT_KEY = 'lps.content';

function genId(): string {
  // 32 位 hex(128 位随机),碰撞概率可忽略(生日界 ~2^64 设备)。
  // 用 crypto.getRandomValues 而非 Math.random,保证密码学强度。
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** ID 合规:32 位小写 hex(128 位)。旧版 4 位 hex 或损坏数据视为不合规。 */
export function isValidId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}

function loadId(): string {
  // 开发期:?id=xxxx 可覆盖本机 ID(不写 localStorage,便于同机多标签互测)。生产环境不生效。
  // 覆盖值也须合规 32 hex(服务端会拒绝不合规 ID);不合规则忽略并回退。
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get('id');
    if (override) {
      if (isValidId(override)) return override;
      console.warn('[identity] ?id= 非合规 32 位 hex,已忽略');
    }
  }
  // 本地存储的 ID 不合规(旧版 4 位 hex / 损坏)→ 重新生成 32 位并持久化。
  const stored = localStorage.getItem(ID_KEY);
  if (stored && isValidId(stored)) return stored;
  const fresh = genId();
  localStorage.setItem(ID_KEY, fresh);
  return fresh;
}

export const identity = reactive({ id: loadId() });

/**
 * 把 32 位 hex 格式化为 8-4-4-4-12(UUID 风格)便于人眼区分。
 * 仅用于展示;内部 PeerId、信令、localStorage 仍用原始 32 hex 串。
 */
export function formatId(id: string): string {
  return id.length === 32
    ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
    : id;
}

/** 短显示:前 8 位 hex(8 hex = 32 位,peer 间肉眼区分足够)。完整 ID 通过 title 悬停查看。 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function getOwnContent(): PeerContent | null {
  const raw = localStorage.getItem(CONTENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PeerContent;
  } catch {
    return null;
  }
}

export function setOwnContent(c: PeerContent) {
  localStorage.setItem(CONTENT_KEY, JSON.stringify(c));
}
