// src/core/App.js
import * as THREE from 'three';

// --- 引入后处理模块 ---
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class App {
  constructor({ mount, maxPixelRatio = 2 } = {}) {
    if (!mount) throw new Error('App: mount element is required');

    this.mount = mount;
    this.maxPixelRatio = maxPixelRatio;

    // 1. 渲染器设置
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // 开启阴影
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 色调映射 (Tone Mapping)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0; 

    // 色彩空间修正
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.mount.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    this.scene = null;
    this.camera = null;
    this.updateFn = null;
    this._running = false;
    this._raf = 0;

    // --- 后处理合成器 ---
    this.composer = null;
    this.bokehPass = null; // 即使不用也可以保留这个属性占位，或者删掉也行

    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
  }

  setActive({ scene, camera, update }) {
    this.scene = scene || null;
    this.camera = camera || null;
    this.updateFn = typeof update === 'function' ? update : null;

    // 当切换场景时 (例如进入比赛)，如果有相机和场景，初始化后处理管线
    if (this.scene && this.camera) {
      this._initPostProcessing();
    } else {
      // 如果没有场景 (比如销毁阶段)，清空合成器
      this.composer = null;
      this.bokehPass = null;
    }

    this._handleResize();
  }

  _initPostProcessing() {
    // 安全检查
    if (!this.renderer || !this.scene || !this.camera) return;

    // 1. 创建合成器
    this.composer = new EffectComposer(this.renderer);
    
    // 2. 基础渲染通道 (Render Scene) - 先把场景画出来
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 3. ✨ Unreal Bloom (辉光特效)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.01,  // 强度
      0.01,  // 半径
      1.5    // 阈值
    );
    this.composer.addPass(bloomPass);


    this.bokehPass = null; // 确保置空

    // 5. 色彩输出修正 (OutputPass)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.getDelta();
    this._tick();
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose?.();
    
    if (this.composer) {
        this.composer.renderTarget1.dispose();
        this.composer.renderTarget2.dispose();
        this.composer = null;
        this.bokehPass = null;
    }

    if (this.renderer.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  _tick() {
    this._raf = requestAnimationFrame(() => this._tick());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    
    if (this.updateFn) this.updateFn(dt, t);

    // 渲染逻辑分支
    if (this.scene && this.camera) {
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  _handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(width, height);

    if (this.camera?.isPerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }
}
