// src/ui/UiRoot.js
import { MenuUI } from './MenuUI.js';
import { ShowroomUI } from './ShowroomUI.js';
import { HUD } from './HUD.js';
import { ResultUI } from './ResultUI.js';

/**
 * UiRoot：统一挂载 + 切换界面层
 *
 * 你在 main.js 里一般这样用：
 * const ui = new UiRoot({ mount: document.body, callbacks: {...} });
 * ui.mount();
 * ui.setLayer('menu');
 *
 * callbacks（按需提供）：
 * - onEnterShowroom()
 * - onBackToMenu()
 * - onPrevCar()
 * - onNextCar()
 * - onStartRace()
 * - onExitRace()
 * - onRestartRace()
 * - onBackToShowroom()
 */
export class UiRoot {
  constructor({ mount = document.body, callbacks = {} } = {}) {
    this.mountEl = mount;
    this.callbacks = { ...callbacks };

    this.root = document.createElement('div');
    this.root.className = 'ui-root';

    // Layers
    this.menu = new MenuUI({
      onEnterShowroom: () => this.callbacks.onEnterShowroom?.(),
    });

    this.showroom = new ShowroomUI({
      onBackToMenu: () => this.callbacks.onBackToMenu?.(),
      onPrevCar: () => this.callbacks.onPrevCar?.(),
      onNextCar: () => this.callbacks.onNextCar?.(),
      onStartRace: () => this.callbacks.onStartRace?.(),
    });

    this.hud = new HUD({
      onExitRace: () => this.callbacks.onExitRace?.(),
      onToggleCamera: () => this.callbacks.onToggleCamera?.(),
      onResetCar: () => this.callbacks.onResetCar?.(),
    });

    this.result = new ResultUI({
      onRestartRace: () => this.callbacks.onRestartRace?.(),
      onBackToShowroom: () => this.callbacks.onBackToShowroom?.(),
      onBackToMenu: () => this.callbacks.onBackToMenu?.(),
    });

    this.root.appendChild(this.menu.root);
    this.root.appendChild(this.showroom.root);
    this.root.appendChild(this.hud.root);
    this.root.appendChild(this.result.root);

    this._currentLayer = null;
  }

  mount() {
    if (!this.root.parentNode) this.mountEl.appendChild(this.root);
    this.setLayer('menu');
  }

  destroy() {
    this.menu?.destroy?.();
    this.showroom?.destroy?.();
    this.hud?.destroy?.();
    this.result?.destroy?.();

    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * layerName: 'menu' | 'showroom' | 'raceIntro' | 'hud' | 'result'
   */
  setLayer(layerName) {
    this._currentLayer = layerName;

    this.menu.hide();
    this.showroom.hide();
    this.hud.hide();
    this.result.hide();

    // raceIntro 其实就是 HUD + 倒计时遮罩
    if (layerName === 'raceIntro') {
      this.hud.show();
      this.hud.setCountdown(3);
      return;
    }

    if (layerName === 'menu') this.menu.show();
    else if (layerName === 'showroom') this.showroom.show();
    else if (layerName === 'hud') this.hud.show();
    else if (layerName === 'result') this.result.show();
    else this.menu.show();
  }

  // ---- Delegates for scenes ----
  setCarName(name) {
    this.showroom.setCarName(name);
  }

  setCountdown(n) {
    // 倒计时一般用于 raceIntro
    if (this._currentLayer !== 'raceIntro' && this._currentLayer !== 'hud') {
      // 允许在任何层调用但仅在 HUD 可见时显示
    }
    this.hud.setCountdown(n);
  }

  setHud(payload) {
    this.hud.setHud(payload);
  }

  setHudSpeed(speedKmh) {
    this.hud.setSpeed(speedKmh);
  }

  setHudLaps(laps) {
    this.hud.setLaps(laps);
  }

  setHudTime(timeSec) {
    this.hud.setTime(timeSec);
  }

  setResult(result) {
    this.result.setResult(result);
  }

  // 可选：展厅里同步配置（如果你后面要做表单）
  syncCarConfig(cfg) {
    this.showroom.syncCarConfig?.(cfg);
  }
}
