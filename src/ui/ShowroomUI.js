import { DEFAULT_TRACK_ID, RACE_TRACKS, normalizeTrackId } from '../scenes/race/tracks/trackRegistry.js';

const PAINT_PRESETS = [
  { name: 'Redline', color: '#ff2a2a' },
  { name: 'Lava Orange', color: '#ff7a1a' },
  { name: 'Solar Gold', color: '#ffd24a' },
  { name: 'Volt Lime', color: '#7cff4d' },
  { name: 'Emerald', color: '#20d47a' },
  { name: 'Ion Blue', color: '#24d6ff' },
  { name: 'Deep Cobalt', color: '#246bff' },
  { name: 'Ultra Violet', color: '#8c5cff' },
  { name: 'Hot Magenta', color: '#ff3bd4' },
  { name: 'Pearl White', color: '#f4f7fb' },
  { name: 'Silver Alloy', color: '#9aa6b2' },
  { name: 'Graphite', color: '#3f4654' },
  { name: 'Black Ice', color: '#151923' },
  { name: 'Copper', color: '#c87333' },
  { name: 'Midnight Teal', color: '#0d6b6f' },
];

const CAMERA_PRESETS = [
  { mode: 'default', label: '默认' },
  { mode: 'top', label: '俯视' },
  { mode: 'front', label: '车头' },
  { mode: 'wheel', label: '轮毂' },
];

const VENUE_PRESETS = [
  { mode: 'singularity', label: '量子厅' },
  { mode: 'storm', label: '蓝雨厅' },
  { mode: 'ember', label: '熔炉厅' },
  { mode: 'aurora', label: '极光厅' },
];

export class ShowroomUI {
  constructor({
    onBackToMenu,
    onPrevCar,
    onNextCar,
    onStartRace,
    onCamChange,
    onQuickPaint,
    onToggleSpin,
    onToggleStageFx,
    onToggleVenueScene,
    onVenueChange,
    onTuneChange,
  } = {}) {
    this.onBackToMenu = onBackToMenu;
    this.onPrevCar = onPrevCar;
    this.onNextCar = onNextCar;
    this.onStartRace = onStartRace;
    this.onCamChange = onCamChange;
    this.onQuickPaint = onQuickPaint;
    this.onToggleSpin = onToggleSpin;
    this.onToggleStageFx = onToggleStageFx;
    this.onToggleVenueScene = onToggleVenueScene;
    this.onVenueChange = onVenueChange;
    this.onTuneChange = onTuneChange;

    this._visible = false;
    this._advancedVisible = false;
    this._cameraMode = 'default';
    this._spinActive = true;
    this._stageFxActive = true;
    this._venueSceneVisible = true;
    this._panelsVisible = true;
    this._venueMode = 'storm';
    this._trackId = DEFAULT_TRACK_ID;
    this._trackPickerVisible = false;
    this._tuningState = {
      metalness: 0.7,
      roughness: 0.25,
      glassTransmission: 0.9,
      glassTint: '#aaccff',
    };

    this.root = document.createElement('div');
    this.root.className = 'ui-layer ui-showroom';

    this.root.innerHTML = `
      <button class="ui-panel-visibility-toggle" data-action="toggle-panels" aria-pressed="true">隐藏界面</button>

      <div class="ui-showroom-dock ui-showroom-dock-left">
        <section class="ui-showroom-panel ui-stats-panel" data-panel="stats">
          <div class="ui-panel-title">性能</div>
          <div class="ui-stat-row">
            <div class="ui-stat-head">
              <span>Speed</span>
              <span data-bind="stat-speed-val">-</span>
            </div>
            <div class="ui-progress-bg">
              <div class="ui-progress-fill ui-progress-fill--speed" data-bind="stat-speed"></div>
            </div>
          </div>
          <div class="ui-stat-row">
            <div class="ui-stat-head">
              <span>Handling</span>
              <span data-bind="stat-handling-val">-</span>
            </div>
            <div class="ui-progress-bg">
              <div class="ui-progress-fill ui-progress-fill--handling" data-bind="stat-handling"></div>
            </div>
          </div>
          <div class="ui-stat-row">
            <div class="ui-stat-head">
              <span>Accel</span>
              <span data-bind="stat-accel-val">-</span>
            </div>
            <div class="ui-progress-bg">
              <div class="ui-progress-fill ui-progress-fill--accel" data-bind="stat-accel"></div>
            </div>
          </div>
        </section>

        <section class="ui-showroom-panel ui-paint-panel" data-panel="paint">
          <div class="ui-panel-title">车漆</div>
          <div class="ui-paint-swatches">
            ${PAINT_PRESETS.map((preset) => `
              <button
                class="ui-paint-swatch"
                data-action="paint"
                data-color="${preset.color}"
                title="${preset.name}"
                aria-label="${preset.name}"
                style="--swatch:${preset.color}"
              ></button>
            `).join('')}
          </div>
          <button class="ui-paint-random" data-action="paint-random">随机车漆</button>
        </section>
      </div>

      <div class="ui-showroom-dock ui-showroom-dock-right">
        <section class="ui-showroom-panel ui-prep-panel">
          <div class="ui-panel-title">控制</div>
          <div class="ui-stage-controls">
            <button class="ui-stage-toggle" data-action="toggle-spin" aria-pressed="true">旋转</button>
            <button class="ui-stage-toggle" data-action="toggle-fx" aria-pressed="true">特效</button>
            <button class="ui-stage-toggle" data-action="toggle-scene" aria-pressed="true">场景</button>
            <button class="ui-stage-toggle" data-action="toggle-all" aria-pressed="false">调校</button>
          </div>
        </section>

        <section class="ui-showroom-panel ui-venue-panel" data-panel="venue">
          <div class="ui-panel-title">场地</div>
          <div class="ui-venue-controls">
            ${VENUE_PRESETS.map((preset) => `
              <button class="ui-venue-mode" data-action="venue-${preset.mode}" aria-pressed="false">
                ${preset.label}
              </button>
            `).join('')}
          </div>
        </section>

        <section class="ui-showroom-panel ui-camera-panel" data-panel="camera">
          <div class="ui-panel-title">镜头</div>
          <div class="ui-camera-controls">
            ${CAMERA_PRESETS.map((preset) => `
              <button class="ui-camera-mode" data-action="cam-${preset.mode}" aria-pressed="false">
                ${preset.label}
              </button>
            `).join('')}
          </div>
        </section>

        <section class="ui-showroom-panel ui-tuning-panel" data-bind="tuning-panel" aria-hidden="true">
          <div class="ui-panel-title">调校</div>
          <label class="ui-tune-row">
            <span>金属度</span>
            <input class="ui-tune-range" data-tune-key="metalness" type="range" min="0" max="1" step="0.01" value="0.7">
            <b data-bind="tune-metalness">70</b>
          </label>
          <label class="ui-tune-row">
            <span>粗糙度</span>
            <input class="ui-tune-range" data-tune-key="roughness" type="range" min="0" max="1" step="0.01" value="0.25">
            <b data-bind="tune-roughness">25</b>
          </label>
          <label class="ui-tune-row">
            <span>玻璃</span>
            <input class="ui-tune-range" data-tune-key="glassTransmission" type="range" min="0" max="1" step="0.01" value="0.9">
            <b data-bind="tune-glassTransmission">90</b>
          </label>
          <label class="ui-tune-color-row">
            <span>玻璃色</span>
            <input class="ui-tune-color" data-tune-key="glassTint" type="color" value="#aaccff" aria-label="玻璃色">
          </label>
        </section>
      </div>

      <div class="ui-bottom-bar">
        <div class="ui-bar-left">
          <button class="ui-btn ui-btn-ghost" data-action="back">返回菜单</button>
        </div>

        <div class="ui-car-selector">
          <button class="ui-btn ui-nav-arrow" data-action="prev" aria-label="上一辆">&lsaquo;</button>
          <div class="ui-car-display">
            <div class="ui-label">CURRENT MODEL</div>
            <div class="ui-value" data-bind="carName">-</div>
          </div>
          <button class="ui-btn ui-nav-arrow" data-action="next" aria-label="下一辆">&rsaquo;</button>
        </div>

        <div class="ui-bar-right">
          <button class="ui-btn ui-btn-primary ui-btn-large" data-action="start">开始比赛</button>
        </div>
      </div>

      <div class="ui-track-modal" data-bind="track-modal" aria-hidden="true">
        <div class="ui-track-dialog" role="dialog" aria-modal="true" aria-label="选择赛道">
          <div class="ui-track-dialog-head">
            <div>
              <div class="ui-track-eyebrow">RACE ROUTE</div>
              <div class="ui-track-title">选择赛车场地</div>
            </div>
            <button class="ui-track-close" data-action="track-cancel" aria-label="关闭">×</button>
          </div>
          <div class="ui-track-options">
            ${RACE_TRACKS.map((track) => `
              <button class="ui-track-option" data-action="track-select" data-track-id="${track.id}" aria-pressed="false">
                <span class="ui-track-option-name">${track.name}</span>
                <span class="ui-track-option-tagline">${track.tagline}</span>
              </button>
            `).join('')}
          </div>
          <div class="ui-track-actions">
            <button class="ui-btn ui-btn-ghost" data-action="track-cancel">取消</button>
            <button class="ui-btn ui-btn-primary" data-action="track-confirm">进入比赛</button>
          </div>
        </div>
      </div>
    `;

    this.$carName = this.root.querySelector('[data-bind="carName"]');
    this.$statSpeed = this.root.querySelector('[data-bind="stat-speed"]');
    this.$statHandling = this.root.querySelector('[data-bind="stat-handling"]');
    this.$statAccel = this.root.querySelector('[data-bind="stat-accel"]');
    this.$statSpeedVal = this.root.querySelector('[data-bind="stat-speed-val"]');
    this.$statHandlingVal = this.root.querySelector('[data-bind="stat-handling-val"]');
    this.$statAccelVal = this.root.querySelector('[data-bind="stat-accel-val"]');
    this.$paintButtons = [...this.root.querySelectorAll('.ui-paint-swatch')];
    this.$cameraButtons = [...this.root.querySelectorAll('.ui-camera-mode')];
    this.$venueButtons = [...this.root.querySelectorAll('.ui-venue-mode')];
    this.$advancedToggle = this.root.querySelector('[data-action="toggle-all"]');
    this.$spinToggle = this.root.querySelector('[data-action="toggle-spin"]');
    this.$stageFxToggle = this.root.querySelector('[data-action="toggle-fx"]');
    this.$sceneToggle = this.root.querySelector('[data-action="toggle-scene"]');
    this.$panelVisibilityToggle = this.root.querySelector('[data-action="toggle-panels"]');
    this.$trackModal = this.root.querySelector('[data-bind="track-modal"]');
    this.$trackButtons = [...this.root.querySelectorAll('.ui-track-option')];
    this.$tuningPanel = this.root.querySelector('[data-bind="tuning-panel"]');
    this.$tuneControls = [...this.root.querySelectorAll('[data-tune-key]')];
    this.$tuneValueLabels = {
      metalness: this.root.querySelector('[data-bind="tune-metalness"]'),
      roughness: this.root.querySelector('[data-bind="tune-roughness"]'),
      glassTransmission: this.root.querySelector('[data-bind="tune-glassTransmission"]'),
    };

    this._onClick = (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn || !this.root.contains(btn)) return;

      const act = btn.getAttribute('data-action');
      if (act === 'prev') this.onPrevCar?.();
      if (act === 'next') this.onNextCar?.();
      if (act === 'start') this.openTrackPicker();
      if (act === 'back') this.onBackToMenu?.();
      if (act === 'paint') this._applyPaint(btn.dataset.color);
      if (act === 'paint-random') this._applyRandomPaint();
      if (act === 'toggle-all') this._toggleAllPanels();
      if (act === 'toggle-spin') this._toggleSpin();
      if (act === 'toggle-fx') this._toggleStageFx();
      if (act === 'toggle-scene') this._toggleVenueScene();
      if (act === 'toggle-panels') this._togglePanels();
      if (act === 'track-select') this.setTrackId(btn.dataset.trackId);
      if (act === 'track-cancel') this.closeTrackPicker();
      if (act === 'track-confirm') this._confirmTrackAndStart();

      if (act.startsWith('venue-')) {
        const mode = act.replace('venue-', '');
        this.setVenueMode(mode);
        this.onVenueChange?.(mode);
      }

      if (act.startsWith('cam-')) {
        const mode = act.replace('cam-', '');
        this.setCameraMode(mode);
        this.onCamChange?.(mode);
      }
    };

    this._onInput = (event) => {
      const input = event.target.closest('[data-tune-key]');
      if (!input || !this.root.contains(input)) return;
      this._applyTuneInput(input);
    };

    this._onKeyDown = (event) => {
      if (!this._visible || event.repeat || shouldIgnoreKeyTarget(event.target)) return;

      const key = event.key;
      const lowerKey = key.toLowerCase();
      if (this._trackPickerVisible) {
        if (key === 'Enter') {
          event.preventDefault();
          this._confirmTrackAndStart();
        } else if (key === 'Escape') {
          event.preventDefault();
          this.closeTrackPicker();
        }
        return;
      }
      if (key === 'ArrowLeft' || lowerKey === 'a') {
        event.preventDefault();
        this.onPrevCar?.();
        return;
      }
      if (key === 'ArrowRight' || lowerKey === 'd') {
        event.preventDefault();
        this.onNextCar?.();
        return;
      }
      if (key === 'Enter') {
        event.preventDefault();
        this.openTrackPicker();
        return;
      }
      if (lowerKey === 'h') {
        event.preventDefault();
        this._togglePanels();
        return;
      }

      const cameraIndex = ['1', '2', '3', '4'].indexOf(key);
      if (cameraIndex >= 0) {
        event.preventDefault();
        const mode = CAMERA_PRESETS[cameraIndex]?.mode;
        if (mode) {
          this.setCameraMode(mode);
          this.onCamChange?.(mode);
        }
      }

      const venueIndex = ['5', '6', '7', '8'].indexOf(key);
      if (venueIndex >= 0) {
        event.preventDefault();
        const mode = VENUE_PRESETS[venueIndex]?.mode;
        if (mode) {
          this.setVenueMode(mode);
          this.onVenueChange?.(mode);
        }
      }
    };

    this.root.addEventListener('click', this._onClick);
    this.root.addEventListener('input', this._onInput);
    this.setCameraMode(this._cameraMode);
    this.setSpinActive(this._spinActive);
    this.setStageFxActive(this._stageFxActive);
    this.setVenueSceneVisible(this._venueSceneVisible);
    this.setVenueMode(this._venueMode);
    this.setTrackId(this._trackId);
    this.setPanelsVisible(this._panelsVisible);
    this.hide();
  }

  setCarName(name) {
    if (this.$carName) this.$carName.textContent = name || '-';
  }

  setCarStats(stats = {}) {
    const speed = stats.speed ?? 0;
    const handling = stats.handling ?? 0;
    const accel = stats.accel ?? 0;

    if (this.$statSpeed) this.$statSpeed.style.width = `${speed}%`;
    if (this.$statHandling) this.$statHandling.style.width = `${handling}%`;
    if (this.$statAccel) this.$statAccel.style.width = `${accel}%`;

    if (this.$statSpeedVal) this.$statSpeedVal.textContent = speed;
    if (this.$statHandlingVal) this.$statHandlingVal.textContent = handling;
    if (this.$statAccelVal) this.$statAccelVal.textContent = accel;
  }

  syncCarConfig(cfg = {}) {
    this.setActivePaint(cfg.bodyColor);
    this.setTuningState(cfg);
  }

  setActivePaint(color) {
    const target = normalizeHex(color);
    this._activePaintColor = target;
    for (const btn of this.$paintButtons) {
      const isActive = normalizeHex(btn.dataset.color) === target;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  setCameraMode(mode = 'default') {
    this._cameraMode = mode;
    for (const btn of this.$cameraButtons) {
      const buttonMode = btn.getAttribute('data-action')?.replace('cam-', '');
      const isActive = buttonMode === this._cameraMode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  setSpinActive(active) {
    this._spinActive = !!active;
    this.$spinToggle?.classList.toggle('is-active', this._spinActive);
    this.$spinToggle?.setAttribute('aria-pressed', this._spinActive ? 'true' : 'false');
  }

  setStageFxActive(active) {
    this._stageFxActive = !!active;
    this.$stageFxToggle?.classList.toggle('is-active', this._stageFxActive);
    this.$stageFxToggle?.setAttribute('aria-pressed', this._stageFxActive ? 'true' : 'false');
  }

  setVenueSceneVisible(active) {
    this._venueSceneVisible = !!active;
    this.$sceneToggle?.classList.toggle('is-active', this._venueSceneVisible);
    this.$sceneToggle?.setAttribute('aria-pressed', this._venueSceneVisible ? 'true' : 'false');
  }

  setVenueShellVisible(active) {
    this.setVenueSceneVisible(active);
  }

  setVenueMode(mode = 'storm') {
    this._venueMode = VENUE_PRESETS.some((preset) => preset.mode === mode) ? mode : 'storm';
    for (const btn of this.$venueButtons) {
      const buttonMode = btn.getAttribute('data-action')?.replace('venue-', '');
      const isActive = buttonMode === this._venueMode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  setTrackId(trackId = DEFAULT_TRACK_ID) {
    this._trackId = normalizeTrackId(trackId);
    for (const btn of this.$trackButtons) {
      const isActive = btn.dataset.trackId === this._trackId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  setTuningState(cfg = {}) {
    const next = {
      ...this._tuningState,
      ...Object.fromEntries(
        Object.entries(cfg).filter(([, value]) => value !== undefined && value !== null),
      ),
    };

    this._tuningState = {
      metalness: clamp01(next.metalness),
      roughness: clamp01(next.roughness),
      glassTransmission: clamp01(next.glassTransmission),
      glassTint: normalizeColor(next.glassTint || this._tuningState.glassTint),
    };

    for (const input of this.$tuneControls) {
      const key = input.dataset.tuneKey;
      if (!(key in this._tuningState)) continue;
      input.value = key === 'glassTint'
        ? this._tuningState[key]
        : String(this._tuningState[key]);
    }

    this._syncTuneLabels();
  }

  openTrackPicker() {
    this._trackPickerVisible = true;
    this.$trackModal?.classList.add('is-visible');
    this.$trackModal?.setAttribute('aria-hidden', 'false');
    this.setTrackId(this._trackId);
  }

  closeTrackPicker() {
    this._trackPickerVisible = false;
    this.$trackModal?.classList.remove('is-visible');
    this.$trackModal?.setAttribute('aria-hidden', 'true');
  }

  _applyPaint(color) {
    if (!color) return;
    this.setActivePaint(color);
    this.onQuickPaint?.(color);
  }

  _applyRandomPaint() {
    const choices = PAINT_PRESETS.filter((preset) => normalizeHex(preset.color) !== this._activePaintColor);
    const pool = choices.length > 0 ? choices : PAINT_PRESETS;
    const preset = pool[Math.floor(Math.random() * pool.length)];
    this._applyPaint(preset?.color);
  }

  _toggleAllPanels() {
    this.setAdvancedVisible(!this._advancedVisible);
  }

  _applyTuneInput(input) {
    const key = input.dataset.tuneKey;
    if (!key) return;

    const value = input.type === 'color'
      ? normalizeColor(input.value)
      : clamp01(input.value);

    this._tuningState = { ...this._tuningState, [key]: value };
    this._syncTuneLabels();
    this.onTuneChange?.({ [key]: value });
  }

  _syncTuneLabels() {
    for (const [key, label] of Object.entries(this.$tuneValueLabels)) {
      if (!label) continue;
      label.textContent = String(Math.round(clamp01(this._tuningState[key]) * 100));
    }
  }

  _togglePanels() {
    this.setPanelsVisible(!this._panelsVisible);
  }

  _toggleSpin() {
    const next = !this._spinActive;
    this.setSpinActive(next);
    this.onToggleSpin?.(next);
  }

  _toggleStageFx() {
    const next = !this._stageFxActive;
    this.setStageFxActive(next);
    this.onToggleStageFx?.(next);
  }

  _toggleVenueScene() {
    const next = !this._venueSceneVisible;
    this.setVenueSceneVisible(next);
    this.onToggleVenueScene?.(next);
  }

  _confirmTrackAndStart() {
    const trackId = this._trackId;
    this.closeTrackPicker();
    this.onStartRace?.(trackId);
  }

  setAdvancedVisible(visible) {
    this._advancedVisible = !!visible;
    this.$advancedToggle?.classList.toggle('is-active', this._advancedVisible);
    this.$advancedToggle?.setAttribute('aria-pressed', this._advancedVisible ? 'true' : 'false');
    this.$tuningPanel?.classList.toggle('is-visible', this._advancedVisible);
    this.$tuningPanel?.setAttribute('aria-hidden', this._advancedVisible ? 'false' : 'true');
    const gui = document.querySelector('.datgui-theme')
      || document.querySelector('.dg.ac')
      || document.querySelector('.dg');
    if (gui) gui.style.display = 'none';
  }

  setPanelsVisible(visible) {
    this._panelsVisible = !!visible;
    this.root.classList.toggle('is-panels-hidden', !this._panelsVisible);
    if (!this._panelsVisible) this.setAdvancedVisible(false);
    if (this.$panelVisibilityToggle) {
      this.$panelVisibilityToggle.textContent = this._panelsVisible ? '隐藏界面' : '显示界面';
      this.$panelVisibilityToggle.setAttribute('aria-pressed', this._panelsVisible ? 'true' : 'false');
    }
  }

  show() {
    this.root.style.display = '';
    this.setAdvancedVisible(this._advancedVisible);
    if (!this._visible) {
      document.addEventListener('keydown', this._onKeyDown);
      this._visible = true;
    }
  }

  hide() {
    this.root.style.display = 'none';
    this.closeTrackPicker();
    if (this._visible) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._visible = false;
    }
  }

  destroy() {
    this.root.removeEventListener('click', this._onClick);
    this.root.removeEventListener('input', this._onInput);
    document.removeEventListener('keydown', this._onKeyDown);
  }
}

function normalizeHex(color) {
  return String(color || '').trim().toLowerCase();
}

function normalizeColor(color) {
  const value = normalizeHex(color);
  return /^#[0-9a-f]{6}$/.test(value) ? value : '#aaccff';
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function shouldIgnoreKeyTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="textbox"], .dg, .datgui-theme');
}
