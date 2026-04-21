// src/ui/MenuUI.js

// 图标常量 (保持不变)
const ICONS = {
  trophy: `<svg viewBox="0 0 24 24"><path d="M5 2H19V4H17C17 6.76 14.76 9 12 9C9.24 9 7 6.76 7 4H5V2M19 11C19 12.1 18.1 13 17 13H15L14 14.5L15.31 20.69C15.42 21.14 15.08 21.5 14.65 21.5H9.35C8.92 21.5 8.58 21.14 8.69 20.69L10 14.5L9 13H7C5.9 13 5 12.1 5 11V5H7V11H17V5H19V11Z"/></svg>`,
  car: `<svg viewBox="0 0 24 24"><path d="M18.92 6C18.72 5.42 18.16 5 17.5 5H6.5C5.84 5 5.29 5.42 5.08 6L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6M6.5 6.5H17.5L18.5 9.5H5.5L6.5 6.5M19 17H5V12L19 12V17Z"/></svg>`,
  tool: `<svg viewBox="0 0 24 24"><path d="M22.7 19L13.6 9.9C14.5 7.6 14 4.9 12.1 3C10.1 1 7.1 0.6 4.7 1.7L9 6L6 9L1.6 4.7C0.4 7.1 0.9 10.1 2.9 12.1C4.8 14 7.5 14.5 9.8 13.6L18.9 22.7C19.3 23.1 19.9 23.1 20.3 22.7L22.6 20.4C23.1 20 23.1 19.3 22.7 19Z"/></svg>`
};

export class MenuUI {
  constructor({ onEnterShowroom } = {}) {
    this.onEnterShowroom = onEnterShowroom;

    this.root = document.createElement('div');
    this.root.className = 'ui-layer ui-menu';

    this.root.innerHTML = `
      <div class="ui-menu-card">
        <div style="font-size: 10px; color: var(--neon-green); letter-spacing: 2px; text-align: left; opacity: 0.8;">
          系统就绪 // v1.0.4 // 已连接网络
        </div>

        <div>
          <div class="ui-hero-title">竞速赛车</div>
          <div class="ui-hero-subtitle">终极 · 赛博 · 狂飙</div>
        </div>

        <div class="ui-deco-row">
          <div class="ui-icon-box">${ICONS.car}<span>超跑库</span></div>
          <div class="ui-icon-box">${ICONS.tool}<span>改装工坊</span></div>
          <div class="ui-icon-box">${ICONS.trophy}<span>排行榜</span></div>
        </div>

        <div class="ui-actions-hero">
          <button class="ui-btn-hero" data-action="enter">
            启动引擎
          </button>
        </div>

        <div class="ui-hint-bar">
          <span>操作：WASD / 方向键 驾驶</span>
          <span>版本: ⟁⌁◈</span>
        </div>
      </div>
    `;

    this._onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-action');
      if (act === 'enter') this.onEnterShowroom?.();
    };
    this.root.addEventListener('click', this._onClick);

    this.hide();
  }

  show() {
    this.root.style.display = 'flex';
  }

  hide() {
    this.root.style.display = 'none';
  }

  destroy() {
    this.root.removeEventListener('click', this._onClick);
  }
}
