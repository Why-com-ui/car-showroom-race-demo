// src/scenes/showroom/CarCustomizer.js
import * as THREE from 'three';
import * as dat from 'dat.gui';

export class CarCustomizer {
  constructor() {
    this.gui = null;
    this._targets = null;
  }

  collectTargets(carRoot) {
    const bodyMeshes = [];
    const glassMeshes = [];
    // 排除列表：避免选中轮毂、刹车盘、内饰等不该变色的部件
    const excludeKeywords = ['wheel', 'tire', 'rim', 'disc', 'brake', 'interior', 'seat', 'light', 'lamp', 'head', 'tail', 'caliper'];

    carRoot.traverse((n) => {
      if (!n.isMesh) return;
      const name = (n.name || '').toLowerCase();

      // 1. 玻璃检测
      if (name.includes('glass') || name.includes('window') || name.includes('windshield')) {
        glassMeshes.push(n);
        return;
      }

      // 2. 车身检测
      const isExcluded = excludeKeywords.some((k) => name.includes(k));
      // 宽松匹配：包含 body/paint/shell 且不在排除列表中
      const looksLikeBody = (name.includes('body') || name.includes('paint') || name.includes('car_body') || name.includes('shell')) && !isExcluded;

      if (looksLikeBody) {
        bodyMeshes.push(n);
      }
    });

    // 兜底策略：如果没找到明确的 body，但也没排除掉，可能是简单的模型结构
    if (bodyMeshes.length === 0) {
      carRoot.traverse((n) => {
        if (!n.isMesh) return;
        const name = (n.name || '').toLowerCase();
        // 简单排除掉玻璃和轮子
        if (name.includes('glass') || name.includes('wheel') || name.includes('tire')) return;
        bodyMeshes.push(n);
      });
    }

    this._targets = { bodyMeshes, glassMeshes };
    return this._targets;
  }

  applyConfig(carRoot, config) {
    const targets = this._targets || this.collectTargets(carRoot);
    const bodyColor = new THREE.Color(config.bodyColor || '#ffffff');
    const glassTint = new THREE.Color(config.glassTint || '#aaccff');

    // --- 修复：复用材质，避免内存泄漏 ---

    // 1. 应用车身材质
    for (const m of targets.bodyMeshes) {
      m.castShadow = true;
      m.receiveShadow = true;

      // 如果已经是物理材质，直接更新属性
      if (m.material && m.material.isMeshPhysicalMaterial && !m.material._isGlass) {
        m.material.color.copy(bodyColor);
        m.material.metalness = clamp01(config.metalness);
        m.material.roughness = clamp01(config.roughness);
        // 确保高级属性也被更新
        m.material.clearcoat = 1.0;
        m.material.envMapIntensity = 1.0;
      } else {
        // 否则创建新材质 (只在初次加载时执行一次)
        const mat = new THREE.MeshPhysicalMaterial({
          color: bodyColor,
          metalness: clamp01(config.metalness),
          roughness: clamp01(config.roughness),
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
          envMapIntensity: 1.0
        });
        m.material = mat;
      }
    }

    // 2. 应用玻璃材质
    for (const m of targets.glassMeshes) {
      m.castShadow = true;
      m.receiveShadow = true;

      if (m.material && m.material.isMeshPhysicalMaterial && m.material._isGlass) {
        m.material.color.copy(glassTint);
        m.material.transmission = clamp01(config.glassTransmission);
      } else {
        const mat = new THREE.MeshPhysicalMaterial({
          color: glassTint,
          metalness: 0.1,
          roughness: 0.05,
          transparent: true,
          transmission: clamp01(config.glassTransmission),
          ior: 1.5,
          thickness: 0.5,
          envMapIntensity: 1.5
        });
        mat._isGlass = true; // 标记一下，防止混淆
        m.material = mat;
      }
    }
  }

  bindGUI(carRoot, configRef, onConfigChange) {
    this.disposeGUI();
    this.gui = new dat.GUI();
    this.gui.domElement.classList.add('datgui-theme');

    // 监听逻辑：onChange 时调用 applyConfig 更新视图，同时通知外部保存
    const changeHandler = () => {
      // 这里的 configRef 已经被 dat.gui 修改了
      this.applyConfig(carRoot, configRef);
      onConfigChange?.({ ...configRef });
    };

    const f1 = this.gui.addFolder('车漆 (Body Paint)');
    f1.addColor(configRef, 'bodyColor').name('颜色').onChange(changeHandler);
    f1.add(configRef, 'metalness', 0, 1, 0.01).name('金属度').onChange(changeHandler);
    f1.add(configRef, 'roughness', 0, 1, 0.01).name('粗糙度').onChange(changeHandler);
    f1.open();

    const f2 = this.gui.addFolder('玻璃 (Glass)');
    f2.add(configRef, 'glassTransmission', 0, 1, 0.01).name('通透度').onChange(changeHandler);
    f2.addColor(configRef, 'glassTint').name('颜色').onChange(changeHandler);
    f2.open();
  }

  disposeGUI() {
    if (this.gui) {
      this.gui.destroy();
      this.gui = null;
    }
  }

  dispose() {
    this.disposeGUI();
    this._targets = null;
  }
}

function clamp01(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}