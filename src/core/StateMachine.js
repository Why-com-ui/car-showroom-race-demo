// src/core/StateMachine.js
/**
 * 状态机：负责场景状态切换
 * 每个 state 可选实现：
 * - name: string
 * - enter(): Promise|void
 * - exit(): Promise|void
 */

export class StateMachine {
  constructor() {
    this._current = null;
    this._isTransitioning = false;
    this._queuedState = null;
  }

  get current() {
    return this._current;
  }

  async setState(next) {
    if (!next) throw new Error('StateMachine.setState: next state is required');
    if (this._isTransitioning) {
      this._queuedState = next;
      return;
    }

    this._isTransitioning = true;

    try {
      let target = next;

      while (target) {
        this._queuedState = null;

        if (target !== this._current) {
          const prev = this._current;
          if (prev?.exit) await prev.exit();
          this._current = target;
          if (target?.enter) await target.enter();
        }

        target = this._queuedState;
      }
    } finally {
      this._isTransitioning = false;
    }
  }
}
