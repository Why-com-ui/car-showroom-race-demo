// src/core/App.js
import * as THREE from 'three';

let postProcessingModulesPromise = null;

function loadPostProcessingModules() {
  if (!postProcessingModulesPromise) {
    postProcessingModulesPromise = Promise.all([
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
      import('three/examples/jsm/postprocessing/OutputPass.js'),
    ]).then(([composerModule, renderPassModule, bloomPassModule, outputPassModule]) => ({
      EffectComposer: composerModule.EffectComposer,
      RenderPass: renderPassModule.RenderPass,
      UnrealBloomPass: bloomPassModule.UnrealBloomPass,
      OutputPass: outputPassModule.OutputPass,
    }));
  }
  return postProcessingModulesPromise;
}

export class App {
  constructor({ mount, maxPixelRatio = 2 } = {}) {
    if (!mount) throw new Error('App: mount element is required');

    this.mount = mount;
    this.maxPixelRatio = maxPixelRatio;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.inputSurface = this.renderer.domElement;
    this.inputSurface.tabIndex = 0;
    this.inputSurface.autofocus = true;
    this.inputSurface.dataset.inputSurface = 'game';
    this.inputSurface.setAttribute('role', 'application');
    this.inputSurface.setAttribute('aria-label', '3D racing viewport. Use WASD or arrow keys to drive.');
    this.inputSurface.style.touchAction = 'none';

    this.mount.appendChild(this.inputSurface);

    this.clock = new THREE.Clock();
    this.scene = null;
    this.camera = null;
    this.updateFn = null;
    this._running = false;
    this._raf = 0;
    this._inputSurfaceFocused = false;
    this._focusDebug = {
      pointerDownCount: 0,
      surfaceFocusCount: 0,
      surfaceBlurCount: 0,
      recentEvents: [],
    };

    this.composer = null;
    this.bokehPass = null;
    this._postProcessingToken = 0;

    this._onResize = () => this._handleResize();
    this._onSurfacePointerDown = (event) => {
      this._recordFocusEvent('pointerdown');
      event.preventDefault();
      this.focusInputSurface();
    };
    this._onSurfaceFocus = () => {
      this._inputSurfaceFocused = true;
      this._recordFocusEvent('focus');
    };
    this._onSurfaceBlur = () => {
      this._inputSurfaceFocused = false;
      this._recordFocusEvent('blur');
    };

    window.addEventListener('resize', this._onResize);
    this.inputSurface.addEventListener('pointerdown', this._onSurfacePointerDown, { passive: false });
    this.inputSurface.addEventListener('focus', this._onSurfaceFocus);
    this.inputSurface.addEventListener('blur', this._onSurfaceBlur);
  }

  setActive({ scene, camera, update }) {
    const token = ++this._postProcessingToken;

    this.scene = scene || null;
    this.camera = camera || null;
    this.updateFn = typeof update === 'function' ? update : null;

    this._disposeComposer();

    if (this.scene && this.camera) {
      this._initPostProcessing(token).catch((error) => {
        if (token === this._postProcessingToken) {
          console.warn('Post-processing init failed:', error);
        }
      });
    }

    this._handleResize();
  }

  focusInputSurface() {
    if (!this.inputSurface?.isConnected) return;
    this.inputSurface.focus({ preventScroll: true });
  }

  blurInputSurface() {
    if (!this.inputSurface?.isConnected) return;
    this.inputSurface.blur();
  }

  isInputSurfaceFocused() {
    return this._inputSurfaceFocused || document.activeElement === this.inputSurface;
  }

  getFocusDebugSnapshot() {
    const surfaceFocused = this.isInputSurfaceFocused();
    return {
      isInputSurfaceFocused: surfaceFocused,
      pointerDownCount: this._focusDebug.pointerDownCount,
      surfaceFocusCount: this._focusDebug.surfaceFocusCount,
      surfaceBlurCount: this._focusDebug.surfaceBlurCount,
      recentEvents: [...this._focusDebug.recentEvents],
    };
  }

  async _initPostProcessing(token) {
    if (!this.renderer || !this.scene || !this.camera) return;
    const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = await loadPostProcessingModules();
    if (token !== this._postProcessingToken || !this.renderer || !this.scene || !this.camera) return;

    const composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.18,
      0.26,
      0.88
    );
    composer.addPass(bloomPass);

    this.bokehPass = null;

    const outputPass = new OutputPass();
    composer.addPass(outputPass);
    this.composer = composer;
    this._handleResize();
  }

  _disposeComposer() {
    if (!this.composer) {
      this.bokehPass = null;
      return;
    }

    this.composer.renderTarget1?.dispose?.();
    this.composer.renderTarget2?.dispose?.();
    this.composer.dispose?.();
    this.composer = null;
    this.bokehPass = null;
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
    this._postProcessingToken += 1;
    window.removeEventListener('resize', this._onResize);
    this.inputSurface.removeEventListener('pointerdown', this._onSurfacePointerDown);
    this.inputSurface.removeEventListener('focus', this._onSurfaceFocus);
    this.inputSurface.removeEventListener('blur', this._onSurfaceBlur);
    this.renderer.dispose?.();
    this._disposeComposer();

    if (this.renderer.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  _tick() {
    this._raf = requestAnimationFrame(() => this._tick());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    if (this.updateFn) this.updateFn(dt, t);

    if (this.scene && this.camera) {
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
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

  _recordFocusEvent(type) {
    if (type === 'pointerdown') this._focusDebug.pointerDownCount += 1;
    if (type === 'focus') this._focusDebug.surfaceFocusCount += 1;
    if (type === 'blur') this._focusDebug.surfaceBlurCount += 1;

    this._focusDebug.recentEvents.push({
      type,
      at: performance.now(),
    });
    if (this._focusDebug.recentEvents.length > 10) {
      this._focusDebug.recentEvents.shift();
    }
  }
}
