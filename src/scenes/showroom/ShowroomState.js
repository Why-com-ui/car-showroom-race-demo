// src/scenes/showroom/ShowroomState.js
import { STATES, DEFAULT_CAR_MODELS } from '../../core/constants.js';
import * as THREE from 'three';
import { Assets } from '../../core/Assets.js';
import { ShowroomScene } from './ShowroomScene.js';
import { CarCustomizer } from './CarCustomizer.js';
import { normalizeCarConfig, makeDefaultCarConfig } from './carConfig.js';

export function createShowroomState(ctx) {
  const { app, store, assets, ui } = ctx;

  let showroom = null;
  let carRoot = null;
  let customizer = null;

  function getModels() {
    const s = store.getState();
    return Array.isArray(s.carModels) && s.carModels.length > 0 ? s.carModels : DEFAULT_CAR_MODELS;
  }

  function getCarIndex() {
    const s = store.getState();
    const idx = s.showroom?.carIndex ?? 0;
    return Number.isFinite(idx) ? idx : 0;
  }

  function setCarIndex(next) {
    store.setState((prev) => ({
      showroom: { ...(prev.showroom || {}), carIndex: next },
    }));
  }

  function ensureCarConfig() {
    const s = store.getState();
    if (!s.carConfig) {
      store.setState({ carConfig: makeDefaultCarConfig() });
      return makeDefaultCarConfig();
    }
    const norm = normalizeCarConfig(s.carConfig);
    store.setState({ carConfig: norm });
    return norm;
  }

  async function loadCarByIndex(index) {
    const models = getModels();
    const i = ((index % models.length) + models.length) % models.length;
    const info = models[i];

    // 1. 更新 UI 文字
    ui?.setCarName?.(info.name);

    // 2. ★ 新增：更新 UI 性能雷达/进度条
    // 直接访问 ui.showroom 实例来设置数据 (前提是 ShowroomUI 实现了 setCarStats)
    if (ui?.showroom?.setCarStats && info.stats) {
      ui.showroom.setCarStats(info.stats);
    }

    // 清理旧车
    if (carRoot) {
      showroom.scene.remove(carRoot);
      assets.disposeObject3D(carRoot);
      carRoot = null;
    }

    // 加载 gltf -> clone
    const gltf = await assets.loadGLTF(info.path);
    const root = assets.cloneGLTFScene(gltf);
    
    // 先重置到原点，再计算贴地
    root.position.set(0, 0, 0); 
    Assets.liftToGround(root, 0.20);

    // 应用改车配置
    const cfg = ensureCarConfig();
    customizer.collectTargets(root);
    customizer.applyConfig(root, cfg);

    showroom.scene.add(root);
    carRoot = root;

    // 绑定 GUI
    customizer.bindGUI(root, cfg, (nextCfg) => {
      store.setState({ carConfig: nextCfg });
      ui?.syncCarConfig?.(nextCfg);
    });

    // 添加场景特效控制 GUI
    if (customizer.gui) {
      const fxFolder = customizer.gui.addFolder('场景特效 (Scene FX)');
      
      const fxState = {
        beams: false, // 默认关闭体积光 (会由 playLightIntro 动画开启)
        dust: true,
        particles: true,
        glow: true,
      };

      const updateFx = (key, val) => {
        showroom?.setEffectState?.(key, val);
      };

      fxFolder.add(fxState, 'beams').name('体积光束').onChange((v) => updateFx('beams', v));
      fxFolder.add(fxState, 'dust').name('悬浮微尘').onChange((v) => updateFx('dust', v));
      fxFolder.add(fxState, 'particles').name('数据流粒子').onChange((v) => updateFx('particles', v));
      fxFolder.add(fxState, 'glow').name('底盘辉光').onChange((v) => updateFx('glow', v));
      
      // 初始化特效状态
      Object.keys(fxState).forEach(k => updateFx(k, fxState[k]));

      fxFolder.open();
    }
  }

  return {
    name: STATES.SHOWROOM,

    async enter() {
      ui?.setLayer?.('showroom');

      showroom = new ShowroomScene({ renderer: app.renderer });
      customizer = new CarCustomizer();

      // ★ 关键：连接 UI 的视角切换事件
      // 直接挂载回调到 ui.showroom 实例上，无需修改 UiRoot
      if (ui?.showroom) {
        ui.showroom.onCamChange = (mode) => {
          showroom?.focusCamera(mode);
        };
      }

      const idx = getCarIndex();
      await loadCarByIndex(idx);

      app.setActive({
        scene: showroom.scene,
        camera: showroom.camera,
        update: (dt, t) => showroom.update(dt, t),
      });

      // ★ 进场：播放灯光秀 (延迟一点点，确保渲染循环已启动)
      setTimeout(() => {
        showroom?.playLightIntro?.();
      }, 100);
    },

    async exit() {
      // 1. 尝试播放离场动画 (配合 ShowroomScene 使用)
      // 如果去比赛，且场景支持动画，则等待动画完成
      if (ctx.runtime.isStartingRace === true && showroom && typeof showroom.animateExit === 'function') {
         await showroom.animateExit();
      }

      // 清理 UI 回调，防止内存泄漏或错误调用
      if (ui?.showroom) {
        ui.showroom.onCamChange = null;
      }

      customizer?.dispose?.();
      customizer = null;

      // ★ 车辆无缝传递逻辑
      const isGoingToRace = ctx.runtime.isStartingRace === true;

      if (carRoot) {
        showroom?.scene?.remove(carRoot);
        
        if (isGoingToRace) {
          // A. 如果去比赛：保存车辆实例到 runtime，不销毁
          console.log('🏎️ ShowroomState: 车辆实例已传递给赛道');
          ctx.runtime.transferredCar = carRoot; 
        } else {
          // B. 否则（回菜单）：正常销毁释放内存
          assets.disposeObject3D(carRoot);
        }
        carRoot = null;
      }

      showroom?.dispose?.();
      showroom = null;

      // 重置标记
      ctx.runtime.isStartingRace = false;

      app.setActive({ scene: null, camera: null, update: null });
    },

    async prevCar() {
      const models = getModels();
      if (models.length <= 1) return;
      const next = (getCarIndex() - 1 + models.length) % models.length;
      setCarIndex(next);
      await loadCarByIndex(next);
    },

    async nextCar() {
      const models = getModels();
      if (models.length <= 1) return;
      const next = (getCarIndex() + 1) % models.length;
      setCarIndex(next);
      await loadCarByIndex(next);
    },

    getCarConfig() {
      return ensureCarConfig();
    },

    getSelectedCarModel() {
      const models = getModels();
      const info = models[((getCarIndex() % models.length) + models.length) % models.length];
      return info;
    },

    // 暴露给外部调用 (备用)
    setCameraMode(mode) {
      showroom?.focusCamera(mode);
    }
  };
}