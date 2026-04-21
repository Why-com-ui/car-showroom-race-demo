// src/core/Input.js
/**
 * 统一键盘输入：
 * input.down('KeyW')
 * input.axis2D() => { throttle, steer }
 */

export class Input {
  constructor() {
    this._keys = new Set();
    this._handlersBound = false;
    this._onKeyDown = (e) => this._keys.add(e.code);
    this._onKeyUp = (e) => this._keys.delete(e.code);
    this._onBlur = () => this._keys.clear();
  }

  mount() {
    if (this._handlersBound) return;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this._handlersBound = true;
  }

  unmount() {
    if (!this._handlersBound) return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._keys.clear();
    this._handlersBound = false;
  }

  down(code) {
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
}
