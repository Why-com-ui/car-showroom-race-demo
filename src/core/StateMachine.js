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
  }

  get current() {
    return this._current;
  }

  async setState(next) {
    if (!next) throw new Error('StateMachine.setState: next state is required');
    if (this._isTransitioning) return;

    this._isTransitioning = true;
    const prev = this._current;

    try {
      if (prev?.exit) await prev.exit();
      this._current = next;
      if (next?.enter) await next.enter();
    } finally {
      this._isTransitioning = false;
    }
  }
}
