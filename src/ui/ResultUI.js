// src/ui/ResultUI.js

export class ResultUI {
  constructor({ onRestartRace, onBackToShowroom, onBackToMenu } = {}) {
    this.onRestartRace = onRestartRace;
    this.onBackToShowroom = onBackToShowroom;
    this.onBackToMenu = onBackToMenu;

    this.root = document.createElement('div');
    this.root.className = 'ui-layer ui-result';

    this.root.innerHTML = `
      <div class="ui-card ui-result-card">
        <div class="ui-title">比赛结束</div>

        <div class="ui-result-grid">
          <div class="ui-result-item">
            <div class="ui-label">用时</div>
            <div class="ui-value" data-bind="time">0.0s</div>
          </div>
          <!-- 修复：将“圈数”改为“得分”，因为现在是无尽赛道模式 -->
          <div class="ui-result-item">
            <div class="ui-label">得分</div>
            <div class="ui-value" data-bind="score" style="color: var(--neon-green);">0</div>
          </div>
        </div>

        <div class="ui-actions">
          <button class="ui-btn ui-btn-primary" data-action="restart">再来一局</button>
          <button class="ui-btn" data-action="showroom">回展厅</button>
          <button class="ui-btn ui-btn-ghost" data-action="menu">回主菜单</button>
        </div>
      </div>
    `;

    this.$time = this.root.querySelector('[data-bind="time"]');
    this.$score = this.root.querySelector('[data-bind="score"]'); // 变量名也顺便改一下更清晰

    this._onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-action');
      if (act === 'restart') this.onRestartRace?.();
      if (act === 'showroom') this.onBackToShowroom?.();
      if (act === 'menu') this.onBackToMenu?.();
    };
    this.root.addEventListener('click', this._onClick);

    this.hide();
  }

  setResult(result = {}) {
    // 1. 设置时间
    let timeSec = '0.0';
    if (typeof result.timeSec !== 'undefined') {
      timeSec = String(result.timeSec);
    } else if (typeof result.timeMs === 'number') {
      timeSec = (result.timeMs / 1000).toFixed(1);
    }
    this.$time.textContent = `${timeSec}s`;

    // 2. 设置得分 (兼容旧代码传来的 laps 字段，RaceState 可能会把 score 传给 laps)
    const rawScore = result.score ?? result.laps ?? 0;
    this.$score.textContent = String(rawScore);
  }

  show() {
    this.root.style.display = '';
  }

  hide() {
    this.root.style.display = 'none';
  }

  destroy() {
    this.root.removeEventListener('click', this._onClick);
  }
}