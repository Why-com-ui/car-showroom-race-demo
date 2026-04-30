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
      onQuickPaint: (color) => this.callbacks.onQuickPaint?.(color),
      onToggleSpin: (active) => this.callbacks.onToggleSpin?.(active),
      onToggleStageFx: (active) => this.callbacks.onToggleStageFx?.(active),
      onToggleVenueScene: (active) => this.callbacks.onToggleVenueScene?.(active),
      onVenueChange: (mode) => this.callbacks.onVenueChange?.(mode),
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

    this.focusPrompt = document.createElement('div');
    this.focusPrompt.className = 'ui-focus-prompt';
    this.focusPrompt.setAttribute('aria-hidden', 'true');
    this.focusPrompt.innerHTML = `
      <div class="ui-focus-prompt__card">
        <div class="ui-focus-prompt__eyebrow">INPUT PAUSED</div>
        <div class="ui-focus-prompt__title">Click anywhere to resume driving</div>
        <div class="ui-focus-prompt__hint">WASD / Arrow Keys / Space</div>
      </div>
    `;

    this.root.appendChild(this.menu.root);
    this.root.appendChild(this.showroom.root);
    this.root.appendChild(this.hud.root);
    this.root.appendChild(this.result.root);
    this.root.appendChild(this.focusPrompt);

    this._currentLayer = null;
    this._focusPromptVisible = false;

    this._onRootClick = (event) => {
      const button = event.target.closest('button');
      if (!button || !this.root.contains(button)) return;

      window.requestAnimationFrame(() => button.blur());
      this.callbacks.onUiAction?.(button.getAttribute('data-action') || '', button);
    };

    this._onRootPointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (this.focusPrompt.contains(target)) {
        event.preventDefault();
        this.callbacks.onRecoverInput?.();
        return;
      }

      const button = target.closest('button');
      if (button && this.root.contains(button)) {
        event.preventDefault();
      }
    };
  }

  mount() {
    if (!this.root.parentNode) this.mountEl.appendChild(this.root);
    this.root.addEventListener('pointerdown', this._onRootPointerDown, true);
    this.root.addEventListener('click', this._onRootClick);
    this.setLayer('menu');
  }

  destroy() {
    this.root.removeEventListener('pointerdown', this._onRootPointerDown, true);
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

  setFocusPromptVisible(visible) {
    this._focusPromptVisible = !!visible;
    this.focusPrompt.classList.toggle('is-visible', this._focusPromptVisible);
    this.focusPrompt.setAttribute('aria-hidden', this._focusPromptVisible ? 'false' : 'true');
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
