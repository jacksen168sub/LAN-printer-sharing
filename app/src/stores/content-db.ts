// IndexedDB 封装 + 内存缓存。
// 关键设计:getOwnContent()/setOwnContent() 保持同步签名,从内存缓存读写;
// 启动期 initContentStore() 一次性把 IDB 读进缓存(main.ts mount 前调)。
// 旧 localStorage 数据自动迁移到 IDB。id/room/locale 仍用 localStorage(小数据)。
import type { PeerContent } from 'shared';

const DB_NAME = 'lps';
const STORE = 'content';
const KEY = 'own';
const LEGACY_LS_KEY = 'lps.content'; // 旧 localStorage key,迁移用

let cache: PeerContent | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(db: IDBDatabase, key: string, val: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 启动期预热:把 IDB 的 own 读进内存缓存。
 * 若 IDB 无数据,尝试从旧 localStorage 迁移。
 * 失败时缓存保持 null,UI 显示无内容,优雅降级。
 */
export async function initContentStore(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const db = await openDb();
      const got = await dbGet(db, KEY);
      if (got) {
        cache = got as PeerContent;
      } else {
        // 迁移:旧 localStorage 数据搬入 IDB
        const legacy = localStorage.getItem(LEGACY_LS_KEY);
        if (legacy) {
          try {
            cache = JSON.parse(legacy) as PeerContent;
            await dbPut(db, KEY, cache);
          } catch { /* 损坏数据忽略 */ }
          localStorage.removeItem(LEGACY_LS_KEY);
        }
      }
    } catch (e) {
      console.warn('[content-db] init failed, fallback to empty', e);
    }
    initialized = true;
  })();
  return initPromise;
}

/** 同步读缓存(启动后必命中)。 */
export function getOwnContent(): PeerContent | null {
  return cache;
}

/** 同步写缓存 + 后台串行写 IDB(写失败仅 warn,不影响本次会话)。 */
export function setOwnContent(c: PeerContent): void {
  cache = c;
  writeChain = writeChain
    .then(() => openDb().then((db) => dbPut(db, KEY, c)))
    .catch((e) => console.warn('[content-db] write failed', e));
}
