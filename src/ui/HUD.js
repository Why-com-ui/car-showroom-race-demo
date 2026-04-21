// src/ui/HUD.js

export class HUD {
  constructor({ onExitRace, onToggleCamera, onResetCar } = {}) {
    this.onExitRace = onExitRace;
    this.onToggleCamera = onToggleCamera;
    this.onResetCar = onResetCar;

    this.root = document.createElement('div');
    this.root.className = 'ui-layer ui-hud';

    // 更新后的布局：速度 | 里程 | 得分 | 时间
    this.root.innerHTML = `
      <div class="ui-hud-bar">
        <div class="ui-hud-item">
          <div class="ui-hud-label">速度 (Speed)</div>
          <div class="ui-hud-value"><span data-bind="speed">0</span> <span style="font-size:12px">km/h</span></div>
        </div>
        
        <div class="ui-hud-item">
          <div class="ui-hud-label">里程 (Dist)</div>
          <div class="ui-hud-value"><span data-bind="mileage">0</span> <span style="font-size:12px">m</span></div>
        </div>

        <div class="ui-hud-item">
          <div class="ui-hud-label">得分 (Score)</div>
          <div class="ui-hud-value" style="color: #ffd700;"><span data-bind="score">0</span></div>
        </div>

        <div class="ui-hud-item">
          <div class="ui-hud-label">时间 (Time)</div>
          <div class="ui-hud-value"><span data-bind="time">0.0</span> <span style="font-size:12px">s</span></div>
        </div>

        <div class="ui-hud-actions">
          <button class="ui-btn ui-btn-ghost" data-action="camera">视角(C)</button>
          <button class="ui-btn ui-btn-ghost" data-action="reset">复位(R)</button>
          <button class="ui-btn ui-btn-ghost" data-action="exit">退出(Esc)</button>
        </div>
      </div>

      <div class="ui-countdown" data-bind="countdown" style="display:none;">3</div>
    `;

    // 绑定 DOM 元素
    this.$speed = this.root.querySelector('[data-bind="speed"]');
    this.$mileage = this.root.querySelector('[data-bind="mileage"]');
    this.$score = this.root.querySelector('[data-bind="score"]');
    this.$time = this.root.querySelector('[data-bind="time"]');
    this.$countdown = this.root.querySelector('[data-bind="countdown"]');

    this._onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-action');
      if (act === 'exit') this.onExitRace?.();
      if (act === 'camera') this.onToggleCamera?.();
      if (act === 'reset') this.onResetCar?.();
    };
    this.root.addEventListener('click', this._onClick);

    this.hide();
  }

  /**
   * 更新 HUD 数据
   * @param {object} payload
   * @param {number|string} [payload.speedKmh] 速度
   * @param {number|string} [payload.mileage] 里程 (对应原 laps)
   * @param {number|string} [payload.score] 得分 (新增)
   * @param {number|string} [payload.timeSec] 时间
   */
  setHud({ speedKmh, mileage, score, timeSec } = {}) {
    if (typeof speedKmh !== 'undefined') this.setSpeed(speedKmh);
    if (typeof mileage !== 'undefined') this.setMileage(mileage);
    if (typeof score !== 'undefined') this.setScore(score);
    if (typeof timeSec !== 'undefined') this.setTime(timeSec);
  }

  setSpeed(speedKmh) {
    this.$speed.textContent = String(speedKmh ?? 0);
  }

  setMileage(m) {
    this.$mileage.textContent = String(m ?? 0);
  }

  setScore(s) {
    this.$score.textContent = String(s ?? 0);
  }

  // 保留 setLaps 以兼容旧代码调用，但实际更新的是里程
  setLaps(laps) {
    this.setMileage(laps);
  }

  setTime(timeSec) {
    this.$time.textContent = String(timeSec ?? '0.0');
  }

  setCountdown(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) {
      this.$countdown.style.display = 'none';
      return;
    }
    this.$countdown.textContent = String(Math.ceil(v));
    this.$countdown.style.display = '';
  }

  show() {
    this.root.style.display = '';
  }

  hide() {
    this.root.style.display = 'none';
    // 隐藏时顺便把 countdown 关掉
    this.setCountdown(0);
  }

  destroy() {
    this.root.removeEventListener('click', this._onClick);
  }
}