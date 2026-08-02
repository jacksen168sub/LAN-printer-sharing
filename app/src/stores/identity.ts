import { reactive } from 'vue';
import type { PeerContent } from 'shared';

const ID_KEY = 'lps.identity.id';
const CONTENT_KEY = 'lps.content';

function genId(): string {
  // 4 位 hex
  return Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
}

function loadId(): string {
  // 开发期:?id=xxxx 可覆盖本机 ID(不写 localStorage,便于同机多标签互测)。生产环境不生效。
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get('id');
    if (override) return override;
  }
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = genId();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export const identity = reactive({ id: loadId() });

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
