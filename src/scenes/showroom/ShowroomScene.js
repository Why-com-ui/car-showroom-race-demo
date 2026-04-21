// src/scenes/showroom/ShowroomScene.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/**
 * ==========================================
 * THEME: QUANTUM SINGULARITY (PRO VERSION)
 * ==========================================
 * 特性：
 * 1. [Reflector] 真实镜面地板
 * 2. [Cinematic] 电影级入场 & 离场 & 机位切换
 * 3. [Volumetric] 动态体积光 (可开关)
 * 4. [Particles] 悬浮微尘 & 数据流 (可开关)
 * 5. [Shadows] 动态接触阴影 (新增)
 * 6. [LightShow] 进场灯光秀 (新增)
 */

// --- Shaders ---

// 1. 体积光 Shader
const BEAM_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const BEAM_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  void main() {
    float fresnel = clamp(1.0 - abs(dot(normalize(vViewPosition), vNormal)), 0.0, 1.0);
    float fade = smoothstep(0.0, 0.4, vUv.y);
    float pulse = 0.8 + 0.2 * sin(uTime * 3.0 + vUv.y * 10.0);
    gl_FragColor = vec4(uColor, fresnel * fade * uOpacity * pulse);
  }
`;

// 2. 地面 Shader
const FLOOR_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FLOOR_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  varying vec2 vUv;
  varying vec3 vPos;
  float grid(vec2 uv, float size) { return 1.0 - step(0.02, length(fract(uv * size) - 0.5)); }
  void main() {
    float dist = length(vPos.xy);
    float pulse = pow(sin(dist * 0.5 - uTime * 2.0) * 0.5 + 0.5, 8.0);
    float g1 = grid(vPos.xy / 10.0, 1.0) * 0.5;
    float alpha = 1.0 - smoothstep(5.0, 40.0, dist);
    vec3 color = mix(uColor1, uColor2, pulse);
    gl_FragColor = vec4(color * (g1 + pulse * 0.8) * 2.0, alpha * (g1 + pulse * 0.8));
  }
`;

// 3. 穹顶 Shader
const DOME_VERTEX_SHADER = `
  varying vec3 vNormal; varying vec3 vPos;
  void main() { vNormal = normalize(normalMatrix * normal); vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const DOME_FRAGMENT_SHADER = `
  uniform float uTime; uniform vec3 uColor; varying vec3 vNormal; varying vec3 vPos;
  void main() {
    float fresnel = pow(1.0 - dot(normalize(cameraPosition - vPos), vNormal), 3.0);
    float scan = pow(sin(vPos.y * 2.0 - uTime * 0.5) * 0.5 + 0.5, 4.0);
    gl_FragColor = vec4(uColor, (fresnel * 0.2 + scan * 0.1) * smoothstep(0.0, 5.0, vPos.y + 5.0) * 0.3);
  }
`;

export class ShowroomScene {
  constructor({ renderer }) {
    this.renderer = renderer;
    this._updatables = [];

    // --- 统一管理特效引用 ---
    this.effects = {
      beamRoot: new THREE.Group(),   // 体积光容器
      dustMesh: null,                // 悬浮微尘
      dataMesh: null,                // 数据流粒子
      glowSprite: null,              // 地面辉光
    };
    
    // 默认开启状态
    this.settings = {
      beams: false,
      dust: true,
      particles: true,
      glow: true,
    };

    // 灯光引用数组 (用于灯光秀动画)
    this.lights = [];

    // 机位动画状态
    this._camAnim = null;

    // --- 1. Init ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020203);
    this.scene.fog = new THREE.FogExp2(0x020203, 0.02);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(14, 6, 16); // 远景起点

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.03;
    this.controls.enablePan = false;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 16.0;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.target.set(0, 0.7, 0);
    this.controls.enabled = false; // 初始禁用，等待入场

    this._root = new THREE.Object3D();
    this.scene.add(this._root);
    
    // 添加特效层容器
    this._root.add(this.effects.beamRoot);

    // --- Build ---
    this._generateHighEndEnvironment();
    this._buildShaderStage();
    this._buildContactShadow(); // ★ 新增接触阴影
    this._buildHoloDome();
    this._buildOrbitalLights();
    
    // 可开关的特效构建
    this._buildDataParticles();
    this._buildFloatingDust();
    this._buildGlowSprites();

    // --- Animation ---
    this._initCinematicEntrance();

    // 初始化时强制应用一次 settings
    Object.keys(this.settings).forEach(key => {
      this.setEffectState(key, this.settings[key]);
    });
  }

  // === API: 开关特效 ===
  setEffectState(key, active) {
    this.settings[key] = active;

    if (key === 'beams') this.effects.beamRoot.visible = active;
    if (key === 'dust' && this.effects.dustMesh) this.effects.dustMesh.visible = active;
    if (key === 'particles' && this.effects.dataMesh) this.effects.dataMesh.visible = active;
    if (key === 'glow' && this.effects.glowSprite) this.effects.glowSprite.visible = active;
  }

  // === API: 播放进场灯光秀 (新增) ===
  playLightIntro() {
    // 目标强度配置 (Key, Rim, Fill)
    const targetIntensities = [8.0, 10.0, 3.0]; 
    let t = 0;
    
    const animateLights = (dt) => {
      t += dt;
      // 顺序亮起逻辑: 
      // 0~2s: 主光渐亮
      if (this.lights[0]) this.lights[0].intensity = Math.min(targetIntensities[0], t * 4);
      // 0.5~2.5s: 轮廓光渐亮
      if (t > 0.5 && this.lights[1]) this.lights[1].intensity = Math.min(targetIntensities[1], (t - 0.5) * 4);
      // 1.0~3.0s: 补光渐亮
      if (t > 1.0 && this.lights[2]) this.lights[2].intensity = Math.min(targetIntensities[2], (t - 1.0) * 4);
      
      // 动画持续约 2.5 秒
      if (t < 2.5) {
        // 使用 RAF 自身递归，或者通过 _updatables 系统
        // 这里为了简单直接用 _updatables
      } else {
        // 动画结束，移除自身
        const idx = this._updatables.indexOf(wrapper);
        if (idx > -1) this._updatables.splice(idx, 1);
        
       
      }
    };

    // 包装一下以便放入 updatables
    const wrapper = (dt) => animateLights(dt);
    this._updatables.push(wrapper);
  }

  // === API: 切换机位 (新增) ===
  focusCamera(presetName) {
    // 定义预设机位 (Position, Target)
    const presets = {
      'default': { pos: new THREE.Vector3(14, 6, 16), target: new THREE.Vector3(0, 0.7, 0) },
      'front':   { pos: new THREE.Vector3(0, 1.2, 5.5), target: new THREE.Vector3(0, 0.8, 0) },
      'wheel':   { pos: new THREE.Vector3(2.8, 0.6, 1.8), target: new THREE.Vector3(0.5, 0.4, 0.5) },
      'top':     { pos: new THREE.Vector3(0, 9, 0.1), target: new THREE.Vector3(0, 0, 0) },
    };

    const p = presets[presetName] || presets['default'];

    // 记录动画目标
    this._camAnim = {
      startPos: this.camera.position.clone(),
      endPos: p.pos,
      startTgt: this.controls.target.clone(),
      endTgt: p.target,
      t: 0,
      duration: 1.2 // 1.2秒平滑过渡
    };

    this.controls.autoRotate = false; // 切换视角时停止自动旋转
    this.controls.enabled = false;    // 暂时禁用手动控制
  }

  // === API: 无缝离场动画 ===
  animateExit() {
    this.controls.enabled = false;
    this.controls.autoRotate = false;

    const startPos = this.camera.position.clone();
    const endPos = new THREE.Vector3(0, 1.2, 3.5); 
    let t = 0;

    return new Promise((resolve) => {
      const onUpdate = (dt) => {
        t += dt * 2.5; 
        if (t >= 1.0) {
          t = 1.0;
          resolve();
        }
        const smoothT = t * t * t; 
        this.camera.position.lerpVectors(startPos, endPos, smoothT);
        this.camera.lookAt(0, 0.8, 0);
        
        if (t >= 1.0) {
           const idx = this._updatables.indexOf(onUpdate);
           if (idx > -1) this._updatables.splice(idx, 1);
        }
      };
      this._updatables.push(onUpdate);
    });
  }

  _initCinematicEntrance() {
    let introTime = 0;
    const duration = 2.5;
    const startPos = new THREE.Vector3(14, 6, 16);
    const targetPos = new THREE.Vector3(6, 2.5, 8); // 稍微近一点的初始位置

    const entranceAnim = (dt) => {
      if (introTime < duration) {
        introTime += dt;
        let p = Math.min(introTime / duration, 1.0);
        const smoothP = p * p * (3 - 2 * p);
        this.camera.position.lerpVectors(startPos, targetPos, smoothP);
        this.camera.lookAt(0, 0.5, 0);

        if (p >= 1.0) {
          this.controls.enabled = true;
          this.controls.target.set(0, 0.7, 0);
          this.controls.update();
          
          const idx = this._updatables.indexOf(entranceAnim);
          if (idx > -1) this._updatables.splice(idx, 1);
        }
      }
    };
    this._updatables.push(entranceAnim);
  }

  _attachVolumetricBeam(light, color, length = 10, width = 3) {
    const geometry = new THREE.ConeGeometry(width, length, 32, 1, true);
    geometry.translate(0, -length / 2, 0);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 0.12 },
        uTime: { value: 0 }
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });

    const beam = new THREE.Mesh(geometry, material);
    this.effects.beamRoot.add(beam);
    
    this._updatables.push((dt, t) => {
      material.uniforms.uTime.value = t;
      if (light.parent) {
        beam.position.copy(light.position);
        beam.lookAt(light.target.position);
      }
    });
  }

  _buildContactShadow() {
    // 使用 Canvas 生成一个简单的软阴影贴图
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // 径向渐变：中心黑 -> 边缘透明
    const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.2, "rgba(0,0,0,0.7)");
    grd.addColorStop(0.5, "rgba(0,0,0,0.3)");
    grd.addColorStop(1.0, "rgba(0,0,0,0)");
    
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    
    // 创建平面
    const geometry = new THREE.PlaneGeometry(4.2, 7.5); // 稍微比车大一点
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false, // 关键：不遮挡其他物体
      depthTest: true,
    });
    
    const shadowPlane = new THREE.Mesh(geometry, material);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.02; // 紧贴地面，但在反射层之上
    
    this._root.add(shadowPlane);
  }

  _buildFloatingDust() {
    const count = 300;
    const geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for(let i=0; i<count*3; i++) pos[i] = (Math.random() - 0.5) * 20;
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const material = new THREE.PointsMaterial({
      color: 0x88ccff, size: 0.05, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false
    });

    const dust = new THREE.Points(geometry, material);
    this.effects.dustMesh = dust;
    this._root.add(dust);

    this._updatables.push((dt, t) => {
      if (!this.settings.dust) return;
      dust.rotation.y = t * 0.02;
      dust.position.y = Math.sin(t * 0.1) * 0.5;
    });
  }

  _buildDataParticles() {
    const count = 400;
    const geometry = new THREE.BoxGeometry(0.02, 0.2, 0.02);
    const material = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.6 });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    this.effects.dataMesh = mesh;
    this._root.add(mesh);

    const dummy = new THREE.Object3D();
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20,
        y: Math.random() * 10, speed: 0.5 + Math.random() * 1.5, scale: Math.random() * 0.5 + 0.5,
      });
    }

    this._updatables.push((dt, t) => {
      if (!this.settings.particles) return;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        p.y += p.speed * dt;
        if (p.y > 10) p.y = 0;
        const dist = Math.sqrt(p.x * p.x + p.z * p.z);
        if (dist < 3.0) p.y = -100;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(1, p.scale, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  _buildGlowSprites() {
    const glowTexture = this._createGlowTexture();
    const glowMat = new THREE.SpriteMaterial({ 
      map: glowTexture, color: 0x0088ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending 
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(8, 8, 1);
    glowSprite.position.set(0, 0.05, 0);
    
    this.effects.glowSprite = glowSprite;
    this._root.add(glowSprite);

    this._updatables.push((dt, t) => {
      if (!this.settings.glow) return;
      const s = 8 + Math.sin(t * 3) * 0.5;
      glowSprite.scale.set(s, s, 1);
      glowSprite.material.opacity = 0.3 + Math.sin(t * 2) * 0.1;
    });
  }

  _buildOrbitalLights() {
    const hemiLight = new THREE.HemisphereLight(0x0f172a, 0x000000, 0.4);
    this.scene.add(hemiLight);

    const keyLight = new THREE.SpotLight(0xffffff, 8.0);
    keyLight.angle = Math.PI / 6; keyLight.penumbra = 0.2; keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048); keyLight.shadow.bias = -0.0001;
    this.scene.add(keyLight);
    
    // 挂载体积光
    this._attachVolumetricBeam(keyLight, 0xffffff, 15, 3);

    const rimLight = new THREE.SpotLight(0x00ffff, 10.0);
    rimLight.angle = Math.PI / 4; rimLight.penumbra = 0.5;
    this.scene.add(rimLight);
    
    // 挂载体积光
    this._attachVolumetricBeam(rimLight, 0x00ffff, 12, 4);

    const fillLight = new THREE.PointLight(0xff00ff, 3.0, 20);
    this.scene.add(fillLight);

    // ★ 收集灯光引用，并初始设为暗（为了进场动画）
    this.lights.push(keyLight, rimLight, fillLight);
    keyLight.intensity = 0;
    rimLight.intensity = 0;
    fillLight.intensity = 0;

    this._updatables.push((dt, t) => {
      // 只有在没有进行机位切换动画时，才允许灯光旋转
      // 或者保持灯光旋转，增加动感
      keyLight.position.set(Math.sin(t * 0.2) * 5 + 5, 10, Math.cos(t * 0.2) * 5 + 5);
      keyLight.lookAt(0, 0, 0);

      rimLight.position.set(Math.cos(t * 0.3 + Math.PI) * 8, 4, Math.sin(t * 0.3 + Math.PI) * 8);
      rimLight.lookAt(0, 0, 0);

      fillLight.position.set(Math.cos(t * 0.5) * 6, 3 + Math.sin(t) * 2, Math.sin(t * 0.5) * 6);
    });
  }

  _generateHighEndEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x000000);
    const createLightPanel = (w, h, color, x, y, z, rx, ry, rz) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color, toneMapped: false }));
      mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.material.side = THREE.DoubleSide;
      envScene.add(mesh);
    };
    createLightPanel(15, 15, 0xffffff, 0, 8, 0, Math.PI / 2, 0, 0);
    createLightPanel(10, 2, 0x00aaff, -8, 2, 4, 0, Math.PI / 4, 0);
    createLightPanel(10, 2, 0xffaa00, 8, 2, -4, 0, -Math.PI / 4, 0);
    createLightPanel(20, 5, 0x111122, 0, 2, -10, 0, 0, 0);
    this.scene.environment = pmremGenerator.fromScene(envScene).texture;
    pmremGenerator.dispose();
  }

  _buildShaderStage() {
    const geometry = new THREE.PlaneGeometry(80, 80);
    const material = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERTEX_SHADER, fragmentShader: FLOOR_FRAGMENT_SHADER,
      uniforms: { uTime: { value: 0 }, uColor1: { value: new THREE.Color(0x004488) }, uColor2: { value: new THREE.Color(0x00ffff) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; 
    this._root.add(floor);
    this._updatables.push((dt, t) => { material.uniforms.uTime.value = t; });

    // Reflector
    const mirror = new Reflector(new THREE.PlaneGeometry(80, 80), {
      clipBias: 0.003, textureWidth: window.innerWidth, textureHeight: window.innerHeight, color: 0x333333,
    });
    mirror.rotation.x = -Math.PI / 2; mirror.position.y = 0.00;
    this._root.add(mirror);

    // Shadow
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.6, color: 0x000000 });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = 0.01; shadowPlane.receiveShadow = true;
    this._root.add(shadowPlane);

    // Ring
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.6, 64), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this._root.add(ring);
    this._updatables.push((dt, t) => { ring.rotation.z = t * 0.2; ringMat.opacity = 0.3 + Math.sin(t * 5.0) * 0.2; });
  }

  _buildHoloDome() {
    const material = new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX_SHADER, fragmentShader: DOME_FRAGMENT_SHADER,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x0066cc) } },
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(20, 3), material);
    this._root.add(dome);
    this._updatables.push((dt, t) => { material.uniforms.uTime.value = t; dome.rotation.y = t * 0.05; });
  }

  _createGlowTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.2, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  update(dt, t) {
    if (this.controls.enabled) this.controls.update();
    
    // --- 处理机位动画插值 ---
    if (this._camAnim) {
      this._camAnim.t += dt;
      const k = Math.min(this._camAnim.t / this._camAnim.duration, 1.0);
      const ease = k * (2 - k); // EaseOut
      
      this.camera.position.lerpVectors(this._camAnim.startPos, this._camAnim.endPos, ease);
      this.controls.target.lerpVectors(this._camAnim.startTgt, this._camAnim.endTgt, ease);
      
      if (k >= 1.0) {
        this._camAnim = null;
        this.controls.enabled = true; // 动画结束恢复控制
      }
    }

    const list = [...this._updatables];
    list.forEach(fn => fn(dt, t));
  }

  dispose() {
    this.controls?.dispose?.(); this.scene.environment?.dispose();
    this._root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } });
  }
}