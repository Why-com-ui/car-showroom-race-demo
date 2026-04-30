// src/core/Input.js
/**
 * Unified keyboard input for gameplay and UI-triggered commands.
 * - input.down('KeyW')
 * - input.axis2D() => { throttle, steer }
 * - input.pressOnce('Escape')
 */

const DEFAULT_RESERVED_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyC',
  'KeyR',
  'Escape',
]);

const CONTINUOUS_GAMEPLAY_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

const KEY_TO_CODE = {
  w: 'KeyW',
  W: 'KeyW',
  a: 'KeyA',
  A: 'KeyA',
  s: 'KeyS',
  S: 'KeyS',
  d: 'KeyD',
  D: 'KeyD',
  c: 'KeyC',
  C: 'KeyC',
  r: 'KeyR',
  R: 'KeyR',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Escape: 'Escape',
  Esc: 'Escape',
  ' ': 'Space',
  Spacebar: 'Space',
};

export class Input {
  constructor({ reservedKeys = DEFAULT_RESERVED_KEYS } = {}) {
    this._keys = new Set();
    this._gameplayHeldKeys = new Set();
    this._syntheticKeys = new Set();
    this._reservedKeys = new Set(reservedKeys);
    this._handlersBound = false;
    this._inputSurface = null;
    this._gameplaySessionActive = false;
    this._debugEnabled = false;
    this._eventLog = [];
    this._clearCounts = {
      windowBlur: 0,
      hidden: 0,
      sessionExit: 0,
      manual: 0,
    };
    this._lastClearReason = 'initial';

    this._onKeyDown = (event) => {
      const code = this._normalizeCode(event);
      if (!code) return;

      if (this._shouldIgnoreTarget(event.target, code)) {
        this._recordEvent('keydown-ignored', code, event);
        return;
      }

      if (this._reservedKeys.has(code)) event.preventDefault();

      this._keys.add(code);
      if (this._gameplaySessionActive && CONTINUOUS_GAMEPLAY_KEYS.has(code)) {
        this._gameplayHeldKeys.add(code);
      }

      this._recordEvent('keydown', code, event);
    };

    this._onKeyUp = (event) => {
      const code = this._normalizeCode(event);
      if (!code) return;

      if (this._shouldIgnoreTarget(event.target, code)) {
        this._recordEvent('keyup-ignored', code, event);
        return;
      }

      if (this._reservedKeys.has(code)) event.preventDefault();

      this._keys.delete(code);
      this._gameplayHeldKeys.delete(code);
      this._syntheticKeys.delete(code);
      this._recordEvent('keyup', code, event);
    };

    this._onBlur = () => this.clear('windowBlur');
    this._onVisibilityChange = () => {
      if (document.hidden) this.clear('hidden');
    };
  }

  bindSurface(surface) {
    this._inputSurface = surface || null;
  }

  setDebugEnabled(enabled) {
    this._debugEnabled = !!enabled;
  }

  startGameplaySession() {
    this._gameplaySessionActive = true;
    this._gameplayHeldKeys.clear();
    this._syncGameplayHeldKeys();
  }

  endGameplaySession() {
    this._gameplaySessionActive = false;
    this.clear('sessionExit');
  }

  isGameplaySessionActive() {
    return this._gameplaySessionActive;
  }

  mount() {
    if (this._handlersBound) return;

    document.addEventListener('keydown', this._onKeyDown, { capture: true, passive: false });
    document.addEventListener('keyup', this._onKeyUp, { capture: true, passive: false });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this._handlersBound = true;
  }

  unmount() {
    if (!this._handlersBound) return;

    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('keyup', this._onKeyUp, true);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.clear('manual');
    this._handlersBound = false;
  }

  clear(reason = 'manual') {
    this._keys.clear();
    this._gameplayHeldKeys.clear();
    this._syntheticKeys.clear();
    this._lastClearReason = reason;
    if (this._clearCounts[reason] !== undefined) {
      this._clearCounts[reason] += 1;
    }
  }

  pressOnce(code) {
    if (!code) return;
    this._syntheticKeys.add(code);
    this._recordSynthetic(code);
  }

  down(code) {
    if (this._syntheticKeys.has(code)) {
      this._syntheticKeys.delete(code);
      return true;
    }

    if (this._gameplaySessionActive && CONTINUOUS_GAMEPLAY_KEYS.has(code)) {
      return this._isGameplayKeyDown(code);
    }

    return this._keys.has(code);
  }

  axis2D() {
    if (this._gameplaySessionActive) {
      const up = this._isGameplayKeyDown('KeyW') || this._isGameplayKeyDown('ArrowUp');
      const down = this._isGameplayKeyDown('KeyS') || this._isGameplayKeyDown('ArrowDown');
      const left = this._isGameplayKeyDown('KeyA') || this._isGameplayKeyDown('ArrowLeft');
      const right = this._isGameplayKeyDown('KeyD') || this._isGameplayKeyDown('ArrowRight');

      return {
        throttle: (up ? 1 : 0) + (down ? -1 : 0),
        steer: (right ? 1 : 0) + (left ? -1 : 0),
      };
    }

    const up = this.down('KeyW') || this.down('ArrowUp');
    const down = this.down('KeyS') || this.down('ArrowDown');
    const left = this.down('KeyA') || this.down('ArrowLeft');
    const right = this.down('KeyD') || this.down('ArrowRight');

    return {
      throttle: (up ? 1 : 0) + (down ? -1 : 0),
      steer: (right ? 1 : 0) + (left ? -1 : 0),
    };
  }

  getDebugSnapshot() {
    return {
      gameplaySessionActive: this._gameplaySessionActive,
      heldKeys: [...this._gameplayHeldKeys],
      rawKeys: [...this._keys],
      syntheticKeys: [...this._syntheticKeys],
      axis: this.axis2D(),
      clearCounts: { ...this._clearCounts },
      lastClearReason: this._lastClearReason,
      eventLog: [...this._eventLog],
    };
  }

  _normalizeCode(event) {
    const keyCode = event?.key ? KEY_TO_CODE[event.key] : null;
    if (keyCode && this._reservedKeys.has(keyCode)) return keyCode;
    if (event?.code && event.code !== 'Unidentified') return event.code;
    if (keyCode) return keyCode;
    return null;
  }

  _syncGameplayHeldKeys() {
    for (const code of this._keys) {
      if (CONTINUOUS_GAMEPLAY_KEYS.has(code)) {
        this._gameplayHeldKeys.add(code);
      }
    }
  }

  _isGameplayKeyDown(code) {
    return this._gameplayHeldKeys.has(code) || this._keys.has(code);
  }

  _shouldIgnoreTarget(target, code) {
    if (!(target instanceof Element)) return false;

    if (this._gameplaySessionActive && this._reservedKeys.has(code)) {
      return false;
    }

    if (this._inputSurface && target === this._inputSurface) {
      return false;
    }

    if (target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
      return true;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      return true;
    }

    return false;
  }

  _recordEvent(type, code, event) {
    if (!this._debugEnabled) return;

    this._eventLog.push({
      type,
      code,
      key: event.key,
      repeat: !!event.repeat,
      target: describeTarget(event.target),
      at: performance.now(),
    });

    if (this._eventLog.length > 10) {
      this._eventLog.shift();
    }
  }

  _recordSynthetic(code) {
    if (!this._debugEnabled) return;

    this._eventLog.push({
      type: 'synthetic',
      code,
      key: code,
      repeat: false,
      target: 'ui-command',
      at: performance.now(),
    });

    if (this._eventLog.length > 10) {
      this._eventLog.shift();
    }
  }
}

function describeTarget(target) {
  if (!(target instanceof Element)) return 'unknown';

  const parts = [target.tagName.toLowerCase()];
  if (target.id) parts.push(`#${target.id}`);
  if (target.classList.length) {
    parts.push(`.${[...target.classList].slice(0, 2).join('.')}`);
  }
  if (target.getAttribute('data-action')) {
    parts.push(`[data-action="${target.getAttribute('data-action')}"]`);
  }
  return parts.join('');
}
