// src/ui/ShowroomUI.js

export class ShowroomUI {
  constructor({ onBackToMenu, onPrevCar, onNextCar, onStartRace, onCamChange } = {}) {
    this.onBackToMenu = onBackToMenu;
    this.onPrevCar = onPrevCar;
    this.onNextCar = onNextCar;
    this.onStartRace = onStartRace;
    this.onCamChange = onCamChange;

    this.root = document.createElement('div');
    this.root.className = 'ui-layer ui-showroom';

    this.root.innerHTML = `
      <div class="ui-sidebar-left" style="
          position: absolute; 
          left: 20px; 
          top: 20px; 
          bottom: 100px; 
          width: 280px; 
          display: flex; 
          flex-direction: column; 
          gap: 12px; 
          pointer-events: none; 
          z-index: 5;
      ">
      
        <div class="ui-showroom-help ui-card" style="
            position: relative !important; 
            left: auto !important; 
            top: auto !important; 
            width: 100% !important; 
            margin: 0 !important;
            pointer-events: auto;
        ">
          <div class="ui-section-title">改装提示</div>
          <div class="ui-text" style="text-align: center; line-height: 1.6; font-size: 14px;">
            拖拽旋转视角，滚轮缩放。<br>
            使用右上角面板调整材质。<br>
            左方车辆数值和切换视角。
          </div>
          <div class="ui-actions" style="justify-content: flex-start; margin-top: 10px;">
            <button class="ui-btn ui-btn-ghost" style="font-size: 12px; padding: 6px 12px; width: 100%;" data-action="toggle-all">
              👁 显/隐 所有参数与控制
            </button>
          </div>
        </div>

        <div class="ui-stats-panel ui-card" style="
            position: relative !important;
            left: auto !important;
            top: auto !important;
            width: 100% !important;
            margin: 0 !important;
            pointer-events: auto; 
            background: rgba(0,0,0,0.6); 
            padding: 15px; 
            border-left: 2px solid var(--neon-cyan);
            backdrop-filter: blur(4px);
            box-sizing: border-box;
            transition: opacity 0.3s ease;
        ">
          <div class="ui-stat-row" style="margin-bottom:12px; width: 100%;">
            <div class="ui-label" style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:bold; letter-spacing:1px; font-size: 12px;">
              <span>极速 (SPEED)</span>
              <span data-bind="stat-speed-val" style="color:var(--neon-cyan)">-</span>
            </div>
            <div class="ui-progress-bg" style="background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; width: 100%;">
              <div class="ui-progress-fill" data-bind="stat-speed" style="width: 0%; height:100%; background:var(--neon-cyan); box-shadow: 0 0 10px var(--neon-cyan); transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);"></div>
            </div>
          </div>

          <div class="ui-stat-row" style="margin-bottom:12px; width: 100%;">
            <div class="ui-label" style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:bold; letter-spacing:1px; font-size: 12px;">
              <span>操控 (HANDLING)</span>
              <span data-bind="stat-handling-val" style="color:var(--neon-purple)">-</span>
            </div>
            <div class="ui-progress-bg" style="background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; width: 100%;">
              <div class="ui-progress-fill" data-bind="stat-handling" style="width: 0%; height:100%; background:var(--neon-purple); box-shadow: 0 0 10px var(--neon-purple); transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);"></div>
            </div>
          </div>

          <div class="ui-stat-row" style="width: 100%;">
            <div class="ui-label" style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:bold; letter-spacing:1px; font-size: 12px;">
              <span>加速 (ACCEL)</span>
              <span data-bind="stat-accel-val" style="color:var(--neon-green)">-</span>
            </div>
            <div class="ui-progress-bg" style="background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; width: 100%;">
              <div class="ui-progress-fill" data-bind="stat-accel" style="width: 0%; height:100%; background:var(--neon-green); box-shadow: 0 0 10px var(--neon-green); transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);"></div>
            </div>
          </div>
        </div>

        <div class="ui-camera-controls" style="
            position: relative !important;
            right: auto !important;
            bottom: auto !important;
            width: 100% !important;
            pointer-events: auto;
            display: grid;
            grid-template-columns: 1fr 1fr; 
            gap: 8px;
            transition: opacity 0.3s ease;
        ">
          <button class="ui-btn ui-btn-ghost" data-action="cam-default" style="text-align:center; border-left:3px solid var(--neon-cyan); background:rgba(0,0,0,0.5); font-size:12px;">默认视角</button>
          <button class="ui-btn ui-btn-ghost" data-action="cam-top" style="text-align:center; border-left:3px solid white; background:rgba(0,0,0,0.5); font-size:12px;">上帝视角</button>
          
          <button class="ui-btn ui-btn-ghost" data-action="cam-front" style="text-align:center; border-left:3px solid var(--neon-purple); background:rgba(0,0,0,0.5); font-size:12px;">车头特写</button>
          <button class="ui-btn ui-btn-ghost" data-action="cam-wheel" style="text-align:center; border-left:3px solid var(--neon-green); background:rgba(0,0,0,0.5); font-size:12px;">轮毂细节</button>
        </div>

      </div> <div class="ui-bottom-bar">
        <div class="ui-bar-left">
          <button class="ui-btn ui-btn-ghost" data-action="back">
            <span style="margin-right:5px">↩</span> 返回菜单
          </button>
        </div>

        <div class="ui-car-selector">
          <button class="ui-btn ui-nav-arrow" data-action="prev">❮</button>
          
          <div class="ui-car-display">
            <div class="ui-label">CURRENT MODEL</div>
            <div class="ui-value" data-bind="carName">-</div>
          </div>

          <button class="ui-btn ui-nav-arrow" data-action="next">❯</button>
        </div>

        <div class="ui-bar-right">
          <button class="ui-btn ui-btn-primary ui-btn-large" data-action="start">
            开始比赛 ➔
          </button>
        </div>
      </div>
    `;

    // ----------------------------------------------------
    // JS 绑定与逻辑
    // ----------------------------------------------------
    
    this.$carName = this.root.querySelector('[data-bind="carName"]');
    this.$statSpeed = this.root.querySelector('[data-bind="stat-speed"]');
    this.$statHandling = this.root.querySelector('[data-bind="stat-handling"]');
    this.$statAccel = this.root.querySelector('[data-bind="stat-accel"]');
    this.$statSpeedVal = this.root.querySelector('[data-bind="stat-speed-val"]');
    this.$statHandlingVal = this.root.querySelector('[data-bind="stat-handling-val"]');
    this.$statAccelVal = this.root.querySelector('[data-bind="stat-accel-val"]');

    this.$panelStats = this.root.querySelector('.ui-stats-panel');
    this.$panelCams = this.root.querySelector('.ui-camera-controls');

    this._onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-action');

      if (act === 'prev') this.onPrevCar?.();
      if (act === 'next') this.onNextCar?.();
      if (act === 'start') this.onStartRace?.();
      if (act === 'back') this.onBackToMenu?.();
      
      if (act === 'toggle-all') this._toggleAllPanels();

      if (act.startsWith('cam-')) {
        const mode = act.replace('cam-', '');
        this.onCamChange?.(mode);
      }
    };

    this.root.addEventListener('click', this._onClick);
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

  _toggleAllPanels() {
    const gui = document.querySelector('.datgui-theme') 
             || document.querySelector('.dg.ac') 
             || document.querySelector('.dg');

    const isHidden = this.$panelStats.style.display === 'none';

    if (isHidden) {
      this.$panelStats.style.display = '';
      this.$panelCams.style.display = 'grid';
      if (gui) gui.style.display = '';
    } else {
      this.$panelStats.style.display = 'none';
      this.$panelCams.style.display = 'none';
      if (gui) gui.style.display = 'none';
    }
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