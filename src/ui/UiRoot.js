// src/ui/UiRoot.js
import { MenuUI } from './MenuUI.js';
import { ShowroomUI } from './ShowroomUI.js';
import { HUD } from './HUD.js';
import { ResultUI } from './ResultUI.js';

export class UiRoot {
  constructor({ mount = document.body, callbacks = {} } = {}) {
    this.mountEl = mount;
    this.callbacks = { ...callbacks };

    this.root = document.createElement('div');
    this.root.className = 'ui-root';

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
    this._onRootClick = (event) => {
      const button = event.target.closest('button');
      if (!button || !this.root.contains(button)) return;

      window.requestAnimationFrame(() => button.blur());
      this.callbacks.onUiAction?.(button.getAttribute('data-action') || '', button);
    };
  }

  mount() {
    if (!this.root.parentNode) this.mountEl.appendChild(this.root);
    this.root.addEventListener('click', this._onRootClick);
    this.setLayer('menu');
  }

  destroy() {
    this.root.removeEventListener('click', this._onRootClick);
    this.menu?.destroy?.();
    this.showroom?.destroy?.();
    this.hud?.destroy?.();
    this.result?.destroy?.();

    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setLayer(layerName) {
    this._currentLayer = layerName;

    this.menu.hide();
    this.showroom.hide();
    this.hud.hide();
    this.result.hide();

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

  setCarName(name) {
    this.showroom.setCarName(name);
  }

  setCountdown(n) {
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

  syncCarConfig(cfg) {
    this.showroom.syncCarConfig?.(cfg);
  }
}
