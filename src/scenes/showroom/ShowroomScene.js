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

const STAGE_THEMES = {
  singularity: {
    background: 0x05010c,
    fog: 0x080016,
    fogDensity: 0.021,
    floor1: 0x2a005d,
    floor2: 0xc8ff00,
    dome: 0x3b007a,
    ring: 0xe9ff6a,
    glow: 0xb6ff00,
    dust: 0xff5cf4,
    data: 0xc8ff00,
    hemi: 0x160026,
    key: 0xfbffe6,
    rim: 0xc8ff00,
    fill: 0xff2bd6,
  },
  storm: {
    background: 0x02091b,
    fog: 0x031a42,
    fogDensity: 0.029,
    floor1: 0x001a63,
    floor2: 0x38d5ff,
    dome: 0x082c8e,
    ring: 0x9fefff,
    glow: 0x0c8cff,
    dust: 0x8bdcff,
    data: 0x55dfff,
    hemi: 0x071633,
    key: 0xd6f3ff,
    rim: 0x38d5ff,
    fill: 0x315dff,
  },
  ember: {
    background: 0x120805,
    fog: 0x1c0d06,
    fogDensity: 0.023,
    floor1: 0x6b2200,
    floor2: 0xff9f1c,
    dome: 0x9a3412,
    ring: 0xffd166,
    glow: 0xff7a1a,
    dust: 0xffd199,
    data: 0xff8c2a,
    hemi: 0x221108,
    key: 0xfff1d6,
    rim: 0xff7a1a,
    fill: 0xc2410c,
  },
  aurora: {
    background: 0x03110f,
    fog: 0x05201c,
    fogDensity: 0.024,
    floor1: 0x006b5a,
    floor2: 0x8dffba,
    dome: 0x00a66d,
    ring: 0xc8ffd8,
    glow: 0x38ff9c,
    dust: 0xb3ffd0,
    data: 0x44ff88,
    hemi: 0x0d2a20,
    key: 0xf3fff5,
    rim: 0x38ff9c,
    fill: 0x3dd6ff,
  },
};

export class ShowroomScene {
  constructor({ renderer }) {
    this.renderer = renderer;
    this._updatables = [];
    this.venueMode = 'storm';
    this.venueSceneVisible = true;
    this.stageRefs = {
      floorMaterial: null,
      domeMaterial: null,
      ringMaterial: null,
      dustMaterial: null,
      dataMaterial: null,
      glowMaterial: null,
      shadowMaterial: null,
      hemiLight: null,
      keyLight: null,
      rimLight: null,
      fillLight: null,
      beamMaterials: [],
    };
    this.venueGroups = {};

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
    this.controls.maxDistance = 42.0;
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
    this._buildVenueLayouts();

    // --- Animation ---
    this._initCinematicEntrance();

    // 初始化时强制应用一次 settings
    Object.keys(this.settings).forEach(key => {
      this.setEffectState(key, this.settings[key]);
    });
    this.setVenueMode(this.venueMode);
  }

  // === API: 开关特效 ===
  setEffectState(key, active) {
    this.settings[key] = active;

    if (key === 'beams') this.effects.beamRoot.visible = active;
    if (key === 'dust' && this.effects.dustMesh) this.effects.dustMesh.visible = active;
    if (key === 'particles' && this.effects.dataMesh) this.effects.dataMesh.visible = active;
    if (key === 'glow' && this.effects.glowSprite) this.effects.glowSprite.visible = active;
  }

  setAutoRotate(active) {
    if (!this.controls) return;
    this.controls.autoRotate = !!active;
  }

  setVenueSceneVisible(active) {
    this.venueSceneVisible = !!active;
    Object.entries(this.venueGroups).forEach(([name, group]) => {
      group.visible = this.venueSceneVisible && name === this.venueMode;
    });
  }

  setVenueShellVisible(active) {
    this.setVenueSceneVisible(active);
  }

  setVenueMode(mode = 'storm') {
    const key = STAGE_THEMES[mode] ? mode : 'storm';
    const theme = STAGE_THEMES[key];
    this.venueMode = key;

    this.scene.background?.setHex?.(theme.background);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(theme.fog);
      this.scene.fog.density = theme.fogDensity;
    }

    this.stageRefs.floorMaterial?.uniforms?.uColor1?.value?.setHex?.(theme.floor1);
    this.stageRefs.floorMaterial?.uniforms?.uColor2?.value?.setHex?.(theme.floor2);
    this.stageRefs.domeMaterial?.uniforms?.uColor?.value?.setHex?.(theme.dome);
    this.stageRefs.ringMaterial?.color?.setHex?.(theme.ring);
    if (this.stageRefs.glowMaterial) this.stageRefs.glowMaterial.color.setHex(theme.glow);
    if (this.stageRefs.dustMaterial) this.stageRefs.dustMaterial.color.setHex(theme.dust);
    if (this.stageRefs.dataMaterial) this.stageRefs.dataMaterial.color.setHex(theme.data);
    if (this.stageRefs.shadowMaterial) this.stageRefs.shadowMaterial.color.setHex(0x000000);

    this.stageRefs.hemiLight?.color?.setHex?.(theme.hemi);
    this.stageRefs.keyLight?.color?.setHex?.(theme.key);
    this.stageRefs.rimLight?.color?.setHex?.(theme.rim);
    this.stageRefs.fillLight?.color?.setHex?.(theme.fill);

    this.stageRefs.beamMaterials.forEach((material, index) => {
      const color = index === 0 ? theme.key : theme.rim;
      material.uniforms?.uColor?.value?.setHex?.(color);
    });

    Object.entries(this.venueGroups).forEach(([name, group]) => {
      group.visible = this.venueSceneVisible && name === key;
    });
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
    this.stageRefs.beamMaterials.push(material);
    
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
    this.stageRefs.dustMaterial = material;
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
    this.stageRefs.dataMaterial = material;
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
    this.stageRefs.glowMaterial = glowMat;
    this._root.add(glowSprite);

    this._updatables.push((dt, t) => {
      if (!this.settings.glow) return;
      const s = 8 + Math.sin(t * 3) * 0.5;
      glowSprite.scale.set(s, s, 1);
      glowSprite.material.opacity = 0.3 + Math.sin(t * 2) * 0.1;
    });
  }

  _createGlowMaterial(color, opacity = 0.65) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }

  _createSolidMaterial(color, opacity = 0.86) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: 0.25,
      roughness: 0.38,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
      side: THREE.DoubleSide,
    });
  }

  _addBox(group, size, position, color, opacity = 0.75) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), this._createGlowMaterial(color, opacity));
    mesh.position.set(position[0], position[1], position[2]);
    group.add(mesh);
    return mesh;
  }

  _addPanel(group, size, position, rotation, color, opacity = 0.24) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), this._createGlowMaterial(color, opacity));
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    group.add(mesh);
    return mesh;
  }

  _addSolidPanel(group, size, position, rotation, color, opacity = 0.22) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), this._createSolidMaterial(color, opacity));
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    group.add(mesh);
    return mesh;
  }

  _addTorus(group, radius, tube, position, rotation, color, opacity = 0.72) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 96), this._createGlowMaterial(color, opacity));
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    group.add(mesh);
    return mesh;
  }

  _addCylinder(group, radiusTop, radiusBottom, height, position, color, opacity = 0.52, segments = 48) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, false);
    const mesh = new THREE.Mesh(geometry, this._createGlowMaterial(color, opacity));
    mesh.position.set(position[0], position[1], position[2]);
    group.add(mesh);
    return mesh;
  }

  _addSolidBox(group, size, position, color, opacity = 0.95) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), this._createSolidMaterial(color, opacity));
    mesh.position.set(position[0], position[1], position[2]);
    group.add(mesh);
    return mesh;
  }

  _addVenueLight(group, color, intensity, distance, position) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(position[0], position[1], position[2]);
    group.add(light);
    return light;
  }

  _addVenueRunway(group, colorA, colorB) {
    this._addPanel(group, [2.4, 11.8], [-1.7, 0.055, 0], [-Math.PI / 2, 0, 0], colorA, 0.08);
    this._addPanel(group, [2.4, 11.8], [1.7, 0.055, 0], [-Math.PI / 2, 0, 0], colorB, 0.08);
    this._addBox(group, [0.035, 0.035, 11.4], [-3.1, 0.09, 0], colorA, 0.42);
    this._addBox(group, [0.035, 0.035, 11.4], [3.1, 0.09, 0], colorB, 0.42);
  }

  _addVenueFrame(group, color, z = -9, width = 12, height = 5, opacity = 0.46) {
    this._addBox(group, [0.08, height, 0.14], [-width / 2, height / 2, z], color, opacity);
    this._addBox(group, [0.08, height, 0.14], [width / 2, height / 2, z], color, opacity);
    this._addBox(group, [width, 0.08, 0.14], [0, height, z], color, opacity);
    this._addBox(group, [width, 0.04, 0.12], [0, 0.34, z], color, opacity * 0.55);
  }

  _addDistantSkyline(group, z, silhouetteColor, accentColor, opacity = 0.78) {
    const heights = [5.8, 9.2, 7.4, 12.6, 8.5, 10.8, 6.6, 10.0, 7.8];
    heights.forEach((height, index) => {
      const x = -21.6 + index * 5.4;
      const width = 2.0 + (index % 3) * 0.56;
      const tower = this._addSolidBox(group, [width, height, 0.42], [x, height / 2 + 0.12, z - (index % 2) * 0.45], silhouetteColor, opacity);
      tower.userData.baseY = tower.position.y;
      tower.userData.phase = index * 0.22;
      tower.userData.floatAmp = 0.025;
      this._addBox(group, [width * 0.72, 0.045, 0.08], [x, height + 0.24, z - 0.22], accentColor, 0.24);
      this._addBox(group, [0.035, height * 0.72, 0.08], [x - width * 0.32, height * 0.36 + 0.22, z - 0.24], accentColor, 0.12);
    });
  }

  _addMountainRange(group, points, z, color, opacity = 0.8) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], 0);
    points.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(points[points.length - 1][0], 0);
    shape.lineTo(points[0][0], 0);
    const material = this._createSolidMaterial(color, opacity);
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.position.set(0, 0.05, z);
    group.add(mesh);
    return mesh;
  }

  _addImmersiveShell(group, primaryColor, secondaryColor, {
    width = 34,
    height = 12,
    depth = 26,
    centerZ = -5,
    opacity = 0.1,
  } = {}) {
    const shell = new THREE.Group();
    shell.name = 'venue-shell';
    const sideX = width / 2;
    const backZ = centerZ - depth / 2;
    const frontZ = centerZ + depth / 2;

    for (const side of [-1, 1]) {
      this._addSolidPanel(shell, [depth, height], [side * sideX, height / 2, centerZ], [0, side * Math.PI / 2, 0], primaryColor, opacity * 1.45);
      this._addBox(shell, [0.1, height * 0.88, 0.14], [side * sideX, height * 0.44, centerZ], primaryColor, opacity * 2.9);
      this._addBox(shell, [0.12, 0.14, depth], [side * sideX, height, centerZ], secondaryColor, opacity * 2.5);
      this._addBox(shell, [0.12, 0.09, depth], [side * sideX, 0.46, centerZ], secondaryColor, opacity * 1.7);

      for (let z = backZ + 2.2; z <= frontZ - 1.2; z += 4.1) {
        this._addBox(shell, [0.1, height * 0.72, 0.12], [side * sideX, height * 0.38, z], secondaryColor, opacity * 2.4);
      }
    }

    for (let z = backZ + 2.4; z <= frontZ - 1.2; z += 3.8) {
      this._addBox(shell, [width, 0.07, 0.14], [0, height, z], primaryColor, opacity * 2.1);
      this._addBox(shell, [width * 0.82, 0.04, 0.1], [0, height - 1.45, z + 0.45], secondaryColor, opacity * 1.45);
    }

    const archRadius = width / 2;
    const archScaleY = height / width;
    [backZ + 1.4, centerZ + 1.2, frontZ - 1.8].forEach((z, index) => {
      const arch = this._addTorus(shell, archRadius, 0.024, [0, height / 2, z], [0, 0, 0], index % 2 ? secondaryColor : primaryColor, opacity * 3.2);
      arch.scale.y = archScaleY;
      arch.userData.spin = index === 1 ? 0.012 : 0;
    });

    group.add(shell);
    return shell;
  }

  _buildVenueLayouts() {
    const singularity = new THREE.Group();
    singularity.name = 'venue-singularity';
    this._addVenueRunway(singularity, 0xb6ff00, 0xff2bd6);
    this._addImmersiveShell(singularity, 0xb6ff00, 0xff2bd6, { width: 46, height: 24, depth: 54, centerZ: -4.8, opacity: 0.064 });
    this._addVenueLight(singularity, 0xb6ff00, 2.2, 15, [-4.2, 2.8, 1.4]);
    this._addVenueLight(singularity, 0xff2bd6, 1.65, 14, [4.2, 2.4, 1.6]);
    this._addCylinder(singularity, 4.15, 4.15, 0.1, [0, 0.08, 0], 0xb6ff00, 0.1, 96);
    this._addDistantSkyline(singularity, -32.0, 0x12001f, 0xb6ff00, 0.76);
    this._addVenueFrame(singularity, 0xb6ff00, -21.8, 52.0, 19.5, 0.56);
    this._addSolidPanel(singularity, [50.0, 18.2], [0, 10.0, -22.1], [0, 0, 0], 0x160026, 0.28);
    const portalOuter = this._addTorus(singularity, 12.6, 0.07, [0, 10.1, -22.36], [0, 0, 0], 0xb6ff00, 0.82);
    const portalInner = this._addTorus(singularity, 9.2, 0.034, [0, 10.1, -22.52], [0, 0, 0], 0xff2bd6, 0.68);
    const portalCore = this._addTorus(singularity, 6.15, 0.026, [0, 10.1, -22.62], [0, 0, Math.PI / 4], 0xf6ff7a, 0.46);
    portalOuter.userData.spin = 0.04;
    portalInner.userData.spin = -0.06;
    portalCore.userData.spin = 0.09;
    for (let i = 0; i < 6; i++) {
      const bar = this._addBox(singularity, [42.0 - i * 2.6, 0.07, 0.1], [0, 4.0 + i * 1.65, -22.72], i % 2 ? 0xff2bd6 : 0xb6ff00, 0.28);
      bar.userData.baseY = bar.position.y;
      bar.userData.phase = i * 0.55;
      bar.userData.floatAmp = 0.08;
    }
    for (const side of [-1, 1]) {
      const wing = this._addSolidPanel(singularity, [30.0, 14.8], [side * 25.5, 9.0, -5.2], [0, side * -0.5, 0], 0x1a0030, 0.22);
      wing.userData.baseY = wing.position.y;
      wing.userData.phase = side;
      wing.userData.floatAmp = 0.055;
      this._addBox(singularity, [0.12, 17.0, 0.14], [side * 23.5, 8.7, -5.2], side > 0 ? 0xff2bd6 : 0xb6ff00, 0.46);
      for (let z = -17.0; z <= 6.0; z += 5.75) {
        const shard = this._addBox(singularity, [1.2, 1.2, 0.12], [side * 23.2, 6.8 + (z % 2), z], side > 0 ? 0xb6ff00 : 0xff2bd6, 0.34);
        shard.rotation.z = Math.PI / 4;
        shard.userData.spin = side * 0.05;
      }
    }
    for (let i = 0; i < 9; i++) {
      const x = -19.2 + i * 4.8;
      const column = this._addBox(singularity, [0.2, 11.0 + (i % 3) * 2.8, 0.2], [x, 7.0, -28.6 - (i % 2) * 0.65], i % 2 ? 0xff2bd6 : 0xb6ff00, 0.28);
      column.rotation.y = Math.PI / 4;
      column.userData.baseY = column.position.y;
      column.userData.phase = i * 0.37;
      column.userData.floatAmp = 0.12;
    }
    this._addTorus(singularity, 21.0, 0.032, [0, 15.3, -3.4], [Math.PI / 2, 0, 0], 0xff2bd6, 0.42);
    this._addTorus(singularity, 15.5, 0.022, [0, 13.0, -8.6], [Math.PI / 2, 0.35, 0.15], 0xb6ff00, 0.34).userData.spin = -0.035;
    this._addTorus(singularity, 5.1, 0.018, [0, 0.12, 0], [Math.PI / 2, 0, 0], 0xf6ff7a, 0.44);
    this.venueGroups.singularity = singularity;
    this._root.add(singularity);

    const storm = new THREE.Group();
    storm.name = 'venue-storm';
    this._addVenueRunway(storm, 0x143bff, 0x55dfff);
    this._addImmersiveShell(storm, 0x143bff, 0x55dfff, { width: 48, height: 24, depth: 56, centerZ: -5, opacity: 0.078 });
    this._addVenueLight(storm, 0x55dfff, 1.8, 14, [-4.1, 2.7, 1.4]);
    this._addVenueLight(storm, 0x315dff, 1.45, 13, [4.1, 2.2, 1.8]);
    this._addCylinder(storm, 4.6, 4.6, 0.08, [0, 0.07, 0], 0x55dfff, 0.08, 96);
    this._addDistantSkyline(storm, -33.0, 0x020b25, 0x55dfff, 0.9);
    this._addSolidPanel(storm, [55.0, 18.8], [0, 10.2, -21.5], [0, 0, 0], 0x051b55, 0.26);
    this._addVenueFrame(storm, 0x8bdcff, -21.2, 56.0, 19.4, 0.52);
    for (let i = -3; i <= 3; i++) {
      this._addBox(storm, [0.08, 17.8, 0.1], [i * 7.2, 9.6, -20.9], i % 2 ? 0x315dff : 0x8bdcff, 0.36);
    }
    for (const side of [-1, 1]) {
      this._addSolidPanel(storm, [34.0, 16.2], [side * 26.0, 8.6, -5.1], [0, Math.PI / 2, 0], 0x041944, 0.22);
      this._addBox(storm, [0.14, 0.16, 38.0], [side * 25.2, 16.4, -5.1], 0x8bdcff, 0.44);
      this._addBox(storm, [0.14, 0.1, 38.0], [side * 25.2, 0.44, -5.1], 0x315dff, 0.32);
      for (let z = -20.5; z <= 8.0; z += 4.1) {
        const pane = this._addSolidPanel(storm, [3.2, 13.0], [side * 24.7, 8.0, z], [0, side * Math.PI / 2, 0], 0x0a3aa3, 0.13);
        pane.userData.baseY = pane.position.y;
        pane.userData.phase = z * 0.08 + side;
        pane.userData.floatAmp = 0.035;
      }
    }
    for (let i = 0; i < 58; i++) {
      const x = -29.0 + i * 1.02;
      const strip = this._addBox(storm, [0.045, 8.8 + (i % 4) * 1.2, 0.035], [x, 11.8, -23.4 - (i % 5) * 0.8], i % 3 ? 0x55dfff : 0x315dff, 0.34);
      strip.userData.baseY = strip.position.y;
      strip.userData.phase = i * 0.24;
      strip.userData.floatAmp = 0.36;
      strip.userData.floatSpeed = 1.32;
    }
    for (let z = -20.0; z <= 8.8; z += 3.6) {
      this._addBox(storm, [55.0, 0.08, 0.12], [0, 16.5, z], 0x55dfff, 0.28);
    }
    this._addTorus(storm, 20.5, 0.03, [0, 14.2, -2.6], [Math.PI / 2, 0, 0], 0x55dfff, 0.36);
    this._addTorus(storm, 13.8, 0.022, [0, 11.8, -9.4], [Math.PI / 2, -0.2, 0], 0x315dff, 0.24);
    this.venueGroups.storm = storm;
    this._root.add(storm);

    const ember = new THREE.Group();
    ember.name = 'venue-ember';
    this._addVenueRunway(ember, 0xff7a1a, 0xffd166);
    this._addImmersiveShell(ember, 0xff7a1a, 0xffd166, { width: 46, height: 23, depth: 52, centerZ: -5.8, opacity: 0.066 });
    this._addVenueLight(ember, 0xff9f1c, 3.2, 15, [-4.0, 2.7, 1.5]);
    this._addVenueLight(ember, 0xffd166, 2.1, 13, [4.2, 2.4, 1.8]);
    this._addCylinder(ember, 4.25, 4.25, 0.1, [0, 0.07, 0], 0xff9f1c, 0.1, 96);
    this._addDistantSkyline(ember, -32.5, 0x211006, 0xff7a1a, 0.88);
    this._addSolidBox(ember, [50.0, 17.6, 0.36], [0, 9.1, -21.0], 0x1a0b05, 0.56);
    this._addVenueFrame(ember, 0xff9f1c, -20.62, 52.0, 19.0, 0.56);
    for (let i = -3; i <= 3; i++) {
      const rib = this._addBox(ember, [0.12, 16.3, 0.1], [i * 6.9, 8.8, -20.2], i % 2 ? 0xffd166 : 0xff7a1a, 0.39);
      rib.userData.baseY = rib.position.y;
      rib.userData.phase = i * 0.35;
      rib.userData.floatAmp = 0.035;
    }
    for (const side of [-1, 1]) {
      this._addSolidBox(ember, [0.5, 14.4, 29.0], [side * 25.0, 7.5, -8.2], 0x241008, 0.66);
      this._addBox(ember, [0.16, 0.18, 30.0], [side * 24.0, 14.7, -8.2], 0xff9f1c, 0.36);
      this._addBox(ember, [0.16, 0.1, 30.0], [side * 24.0, 0.52, -8.2], 0xff3d00, 0.23);
      for (let z = -21.0; z <= 2.4; z += 3.7) {
        this._addBox(ember, [0.9, 0.13, 0.9], [side * 24.0, 8.8, z], 0xff9f1c, 0.36);
      }
    }
    this._addSolidBox(ember, [46.0, 0.38, 0.42], [0, 15.3, -9.0], 0x25110a, 0.84);
    this._addSolidBox(ember, [0.5, 3.2, 0.24], [0, 13.4, -9.0], 0x2c1208, 0.8);
    const hook = this._addBox(ember, [1.28, 1.5, 0.1], [0, 11.4, -9.0], 0xff7a1a, 0.45);
    hook.rotation.z = Math.PI / 4;
    for (let i = -4; i <= 4; i++) {
      this._addBox(ember, [0.07, 0.035, 5.8], [i * 0.64, 0.12, -0.35], 0xff9f1c, 0.22);
    }
    for (let i = 0; i < 5; i++) {
      const chimney = this._addSolidBox(ember, [1.9, 11.2 + i * 0.65, 1.18], [-22.0 + i * 11.0, 5.8 + i * 0.32, -28.0 - (i % 2) * 1.2], 0x241008, 0.86);
      chimney.userData.baseY = chimney.position.y;
      chimney.userData.phase = i * 0.4;
      chimney.userData.floatAmp = 0.025;
      this._addBox(ember, [1.5, 0.08, 0.8], [chimney.position.x, chimney.position.y + 5.7 + i * 0.32, chimney.position.z], 0xff7a1a, 0.34);
    }
    this._addTorus(ember, 3.95, 0.03, [0, 0.16, 0], [Math.PI / 2, 0, 0], 0xffd166, 0.52);
    this.venueGroups.ember = ember;
    this._root.add(ember);

    const aurora = new THREE.Group();
    aurora.name = 'venue-aurora';
    this._addVenueRunway(aurora, 0x38ff9c, 0x3dd6ff);
    this._addImmersiveShell(aurora, 0x38ff9c, 0x3dd6ff, { width: 48, height: 24, depth: 56, centerZ: -5.2, opacity: 0.064 });
    this._addVenueLight(aurora, 0x8dffba, 1.8, 14, [-4.1, 2.8, 1.6]);
    this._addVenueLight(aurora, 0x3dd6ff, 1.25, 13, [4.1, 2.4, 1.8]);
    this._addCylinder(aurora, 4.55, 4.55, 0.08, [0, 0.07, 0], 0x8dffba, 0.09, 96);
    this._addMountainRange(aurora, [[-42.0, 0.3], [-34.0, 8.4], [-28.0, 5.1], [-20.0, 11.2], [-12.0, 5.3], [-4.0, 12.6], [5.8, 4.6], [13.0, 9.8], [21.0, 4.4], [30.0, 8.0], [42.0, 0.45]], -32.0, 0x071a18, 0.88);
    this._addMountainRange(aurora, [[-43.0, 0.15], [-36.0, 4.9], [-29.0, 2.4], [-22.0, 6.6], [-15.0, 2.7], [-8.0, 7.5], [2.6, 2.3], [10.5, 6.2], [18.0, 2.8], [27.0, 5.1], [43.0, 0.2]], -27.0, 0x0a2a24, 0.72);
    this._addVenueFrame(aurora, 0x8dffba, -21.8, 52.0, 18.0, 0.4);
    for (let i = 0; i < 5; i++) {
      const ribbon = this._addPanel(aurora, [52.0 - i * 3.2, 2.25], [0, 12.0 + i * 0.82, -24.0 - i * 1.9], [0.22, 0, (i - 2) * 0.12], i % 2 ? 0x38ff9c : 0x3dd6ff, 0.2);
      ribbon.userData.baseY = ribbon.position.y;
      ribbon.userData.phase = i * 0.55;
      ribbon.userData.floatAmp = 0.18;
    }
    for (const side of [-1, 1]) {
      const sideMountains = this._addMountainRange(aurora, [[-24.0, 0.2], [-19.0, 3.8], [-13.8, 1.8], [-7.8, 5.6], [-1.5, 2.3], [5.4, 5.0], [12.6, 1.7], [19.0, 4.0], [24.0, 0.26]], 0, 0x061714, 0.68);
      sideMountains.position.set(side * 26.0, 0.05, -5.6);
      sideMountains.rotation.y = side * Math.PI / 2;
      this._addSolidPanel(aurora, [35.0, 16.2], [side * 25.2, 9.0, -5.6], [0, side * Math.PI / 2, 0], 0x0a2a24, 0.16);
      for (let i = 0; i < 3; i++) {
        const curtain = this._addPanel(aurora, [29.0 - i * 2.2, 1.6], [side * 24.6, 12.5 + i * 1.08, -3.8 - i * 3.0], [0.18, side * Math.PI / 2, side * (0.08 + i * 0.04)], i % 2 ? 0x38ff9c : 0x3dd6ff, 0.2);
        curtain.userData.baseY = curtain.position.y;
        curtain.userData.phase = i * 0.5 + side;
        curtain.userData.floatAmp = 0.14;
      }
      for (let i = 0; i < 4; i++) {
        const crystal = this._addCylinder(aurora, 0.16, 0.68, 3.8 + i * 0.82, [side * (21.6 + i * 1.15), 2.0 + i * 0.4, -10.8 + i * 1.0], i % 2 ? 0x38ff9c : 0x3dd6ff, 0.32, 5);
        crystal.rotation.z = side * (0.12 + i * 0.06);
        crystal.userData.baseY = crystal.position.y;
        crystal.userData.phase = i * 0.45 + side;
        crystal.userData.floatAmp = 0.06;
      }
      for (let i = 0; i < 2; i++) {
        const ring = this._addTorus(aurora, 4.8 + i * 1.25, 0.026, [side * (22.0 + i * 1.4), 9.0 + i * 1.7, -5.8 - i * 2.4], [Math.PI / 2, 0.7 * side, 0.25], i % 2 ? 0x44ff88 : 0x3dd6ff, 0.34);
        ring.userData.spin = side * (0.08 + i * 0.04);
      }
    }
    this._addTorus(aurora, 20.4, 0.03, [0, 14.2, -2.8], [Math.PI / 2, 0.08, 0], 0x8dffba, 0.31);
    this.venueGroups.aurora = aurora;
    this._root.add(aurora);

    Object.values(this.venueGroups).forEach((group) => {
      group.visible = false;
    });

    this._updatables.push((dt, t) => {
      const active = this.venueGroups[this.venueMode];
      if (!active) return;
      active.traverse((child) => {
        if (child.userData.baseY !== undefined) {
          const speed = child.userData.floatSpeed ?? 0.55;
          const amount = child.userData.floatAmp ?? 0.12;
          child.position.y = child.userData.baseY + Math.sin(t * speed + child.userData.phase) * amount;
        }
        if (child.userData.spin) {
          child.rotation.z += child.userData.spin * dt;
        }
      });
    });
  }

  _buildOrbitalLights() {
    const hemiLight = new THREE.HemisphereLight(0x0f172a, 0x000000, 0.4);
    this.scene.add(hemiLight);
    this.stageRefs.hemiLight = hemiLight;

    const keyLight = new THREE.SpotLight(0xffffff, 8.0);
    keyLight.angle = Math.PI / 6; keyLight.penumbra = 0.2; keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048); keyLight.shadow.bias = -0.0001;
    this.scene.add(keyLight);
    this.stageRefs.keyLight = keyLight;
    
    // 挂载体积光
    this._attachVolumetricBeam(keyLight, 0xffffff, 15, 3);

    const rimLight = new THREE.SpotLight(0x00ffff, 10.0);
    rimLight.angle = Math.PI / 4; rimLight.penumbra = 0.5;
    this.scene.add(rimLight);
    this.stageRefs.rimLight = rimLight;
    
    // 挂载体积光
    this._attachVolumetricBeam(rimLight, 0x00ffff, 12, 4);

    const fillLight = new THREE.PointLight(0xff00ff, 3.0, 20);
    this.scene.add(fillLight);
    this.stageRefs.fillLight = fillLight;

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
    this.stageRefs.floorMaterial = material;
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
    this.stageRefs.shadowMaterial = shadowMat;

    // Ring
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.6, 64), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this._root.add(ring);
    this.stageRefs.ringMaterial = ringMat;
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
    this.stageRefs.domeMaterial = material;
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
