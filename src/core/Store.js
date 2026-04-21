// src/core/Store.js
/**
 * 轻量全局 Store：
 * - store.getState()
 * - store.setState(partial)
 * - store.subscribe(fn)
 */

export class Store {
  /** @param {object} initialState */
  constructor(initialState = {}) {
    this._state = structuredCloneSafe(initialState);
    this._subs = new Set();
  }

  getState() {
    return this._state;
  }

  /**
   * @param {object|function} partialOrFn  partial 或 (prev)=>partial
   */
  setState(partialOrFn) {
    const prev = this._state;
    const partial = typeof partialOrFn === 'function' ? partialOrFn(prev) : partialOrFn;
    if (!partial || typeof partial !== 'object') return;

    const next = deepMerge(structuredCloneSafe(prev), partial);
    this._state = next;

    for (const fn of this._subs) {
      try {
        fn(next, prev);
      } catch (e) {
        console.error('Store subscriber error:', e);
      }
    }
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }
}

function deepMerge(target, source) {
  for (const k of Object.keys(source)) {
    const sv = source[k];
    const tv = target[k];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      target[k] = deepMerge(tv, sv);
    } else {
      target[k] = sv;
    }
  }
  return target;
}

function structuredCloneSafe(obj) {
  // 兼容性兜底（Vite 环境一般支持 structuredClone）
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}
