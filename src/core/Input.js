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

export class Input {
  constructor({ reservedKeys = DEFAULT_RESERVED_KEYS } = {}) {
    this._keys = new Set();
    this._syntheticKeys = new Set();
    this._reservedKeys = new Set(reservedKeys);
    this._handlersBound = false;
    this._inputSurface = null;

    this._onKeyDown = (event) => {
      if (this._shouldIgnoreTarget(event.target)) return;
      if (this._reservedKeys.has(event.code)) event.preventDefault();
      this._keys.add(event.code);
    };

    this._onKeyUp = (event) => {
      if (this._shouldIgnoreTarget(event.target)) return;
      if (this._reservedKeys.has(event.code)) event.preventDefault();
      this._keys.delete(event.code);
      this._syntheticKeys.delete(event.code);
    };

    this._onBlur = () => this.clear();
    this._onVisibilityChange = () => {
      if (document.hidden) this.clear();
    };
  }

  bindSurface(surface) {
    this._inputSurface = surface || null;
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
    this.clear();
    this._handlersBound = false;
  }

  clear() {
    this._keys.clear();
    this._syntheticKeys.clear();
  }

  pressOnce(code) {
    if (!code) return;
    this._syntheticKeys.add(code);
  }

  down(code) {
    if (this._syntheticKeys.has(code)) {
      this._syntheticKeys.delete(code);
      return true;
    }

    return this._keys.has(code);
  }

  axis2D() {
    const up = this.down('KeyW') || this.down('ArrowUp');
    const down = this.down('KeyS') || this.down('ArrowDown');
    const left = this.down('KeyA') || this.down('ArrowLeft');
    const right = this.down('KeyD') || this.down('ArrowRight');

    return {
      throttle: (up ? 1 : 0) + (down ? -1 : 0),
      steer: (right ? 1 : 0) + (left ? -1 : 0),
    };
  }

  _shouldIgnoreTarget(target) {
    if (!(target instanceof Element)) return false;

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
}
