// src/scenes/race/tracks/Track_NeonSpline_Enhanced.js
import * as THREE from 'three';

/**
 * 🏙️ CYBER CITY RUN - 增强优化版（修正版）
 * 修复/增强内容:
 * 1) ✅ 解决汽车在赛道里变黑：默认给 track.root 添加基础灯光（可 opts.addLights=false 关闭）
 * 2) ✅ Curvature/Bending 真正生效：路/楼/粒子/拱门/金币统一弯曲
 * 3) ✅ 修复 Instanced 建筑 shader：补上 modelMatrix * instanceMatrix
 * 4) ✅ 建筑防重叠更靠谱：按建筑占地半径做 spacing，且 chunk 回收时清理记录
 * 5) ✅ bounds/clamp 更准：按 binormal 横向投影，不再用“点到点圆形距离”导致弯道误判
 * 6) ✅ getInteractables 性能：过滤 inactive + 缓存对象，减少 GC
 */

const CONFIG = {
  chunkLength: 60,
  chunkSegments: 30,
  roadWidth: 18,
  visibleChunks: 12,
  recycleDist: 60,

  maxSlope: 0.33,
  turnScale: 0.71,

  buildingOffset: 80,
  buildingDensity: 0.9,

  // 建筑间距：原来 1 太小（楼会互挤/穿插）。这里是“额外间隙”，真正 spacing 会按楼占地半径计算
  minBuildingSpacing: 7,
  recentBuildingKeep: 400,

  // 真实生效的弯曲参数（0=不弯；建议 0.2~0.8 微调）
  curvature: 0.3,

  // 默认补灯避免车黑（如果你的主场景已布光，可 opts.addLights=false）
  addLights: true,
  light: {
    ambient: 0.45,
    hemi: 0.55,
    directional: 1.15
  },

  colors: {
    fog: 0x0a0515,
    roadGrid: 0x00ffff,
    roadCenter: 0xff0099,
    building: 0x0a0a15,
    windowOn: 0xff6600,
    windowOff: 0x151515,
    arch: 0xff00ff,
    coin: 0xffd700,
    particle: 0x00ffff,
    neon: 0xff00cc
  },

  maxCoins: 500,
  maxBuildings: 2000,
  maxArches: 200,
  maxParticles: 1000
};

// ------------------------------------------------------------------
// Shader chunks
// ------------------------------------------------------------------

const BENDING_VERTEX_CHUNK = `
  uniform float uCurvature;
  varying float vDepth;

  vec4 bendViewPos(vec4 viewPos) {
    float zDepth = -viewPos.z;   // 越远越大
    vDepth = zDepth;

    // 轻微向上弯曲（地平线效果）。需要更强可调系数，建议先从 0.2~0.6 小范围调
    viewPos.y += uCurvature * zDepth * zDepth * 0.00035;
    return viewPos;
  }
`;

// 路面着色器 - 网格 + 中心脉冲 + 扫描线 + 边缘光晕
const ROAD_VERT = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  ${BENDING_VERTEX_CHUNK}

  void main() {
    vUv = uv;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    vec4 viewPos = viewMatrix * worldPos;
    viewPos = bendViewPos(viewPos);

    gl_Position = projectionMatrix * viewPos;
  }
`;

const ROAD_FRAG = `
  uniform float uTime;
  uniform vec3 uColorGrid;
  uniform vec3 uColorCenter;
  uniform vec3 uColorFog;

  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vWorldPos;

  void main() {
    // 基础网格
    vec2 gridUv = vUv * vec2(10.0, 20.0);
    gridUv.y -= uTime * 6.0;

    vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
    float line = min(grid.x, grid.y);
    float gridAlpha = 1.0 - smoothstep(0.0, 1.0, line);

    // 中心线脉冲
    float centerLine = 1.0 - smoothstep(0.02, 0.05, abs(vUv.x - 0.5));
    float centerPulse = 0.5 + 0.5 * sin(gridUv.y * 0.5 + uTime * 2.0);

    // 扫描线效果
    float scanLine = sin(vWorldPos.z * 0.5 - uTime * 10.0) * 0.5 + 0.5;
    scanLine = pow(scanLine, 3.0) * 0.3;

    // 边缘霓虹光晕
    float edgeGlow = smoothstep(0.3, 0.5, abs(vUv.x - 0.5));
    float edgePulse = sin(uTime * 3.0 + vWorldPos.z * 0.1) * 0.5 + 0.5;

    // 组合颜色
    vec3 color = vec3(0.05, 0.05, 0.12);
    color = mix(color, uColorGrid, gridAlpha * 0.9);
    color = mix(color, uColorCenter, centerLine * centerPulse);
    color += uColorGrid * edgeGlow * edgePulse * 0.7;
    color += uColorGrid * scanLine;

    // 增强雾效渐变
    float fogFactor = 1.0 - exp(-vDepth * vDepth * 0.00002);
    fogFactor = smoothstep(0.0, 1.0, fogFactor);

    gl_FragColor = vec4(mix(color, uColorFog, fogFactor), 1.0);
  }
`;

// 建筑着色器 - 霓虹边缘 + 动态窗户
const BUILDING_VERT = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  ${BENDING_VERTEX_CHUNK}

  void main() {
    vLocalPos = position;

    // ✅ 正确的 instancing 世界坐标：modelMatrix * instanceMatrix
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    // ✅ 法线也补上 modelMatrix（root 有变换时也正确）
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);

    vec4 viewPos = viewMatrix * worldPos;
    viewPos = bendViewPos(viewPos);

    gl_Position = projectionMatrix * viewPos;
  }
`;

const BUILDING_FRAG = `
  uniform float uTime;
  uniform vec3 uColorFog;
  uniform vec3 uWinColor;
  uniform vec3 uNeonColor;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying float vDepth;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  void main() {
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diff = max(dot(vNormal, lightDir), 0.0);
    vec3 baseColor = vec3(0.03, 0.03, 0.08) * (0.3 + 0.7 * diff);

    // 窗户系统：只在侧面生成（y 法线接近 0）
    float windowMask = 0.0;
    if (abs(vNormal.y) < 0.1) {
      vec2 tile = vLocalPos.y * vec2(0.3) + vWorldPos.xz * 0.3;
      vec2 grid = fract(tile);
      float border = step(0.12, grid.x) * step(0.12, grid.y) *
                     step(grid.x, 0.88) * step(grid.y, 0.88);

      vec2 id = floor(tile);
      float noise = random(id);

      // 动态闪烁
      float flicker = step(0.95, random(id + floor(uTime * 3.0)));
      float wave = sin(uTime * 2.0 + id.x + id.y) * 0.5 + 0.5;
      float lit = step(0.3, noise);

      windowMask = border * lit * (0.8 + 0.2 * wave) + flicker * 0.5;
    }

    // 顶部边缘霓虹
    float edgeGlow = 0.0;
    if (vLocalPos.y > 0.95) {
      edgeGlow = sin(uTime * 4.0 + vWorldPos.x * 0.5) * 0.5 + 0.5;
      edgeGlow = pow(edgeGlow, 2.0) * 0.8;
    }

    vec3 finalColor = mix(baseColor, uWinColor, windowMask);
    finalColor += uNeonColor * edgeGlow;

    // 雾效
    float fogFactor = 1.0 - exp(-vDepth * vDepth * 0.00004);
    gl_FragColor = vec4(mix(finalColor, uColorFog, fogFactor), 1.0);
  }
`;

// 粒子着色器（支持 curvature）
const PARTICLE_VERT = `
  uniform float uTime;
  uniform float uSize;
  uniform float uCurvature;
  attribute float aSpeed;
  attribute float aPhase;
  varying float vAlpha;
  varying float vDepth;

  vec4 bendViewPos(vec4 viewPos) {
    float zDepth = -viewPos.z;
    vDepth = zDepth;
    viewPos.y += uCurvature * zDepth * zDepth * 0.00035;
    return viewPos;
  }

  void main() {
    vec3 pos = position;
    float life = mod(uTime * aSpeed + aPhase, 10.0) / 10.0;
    pos.y += life * 80.0;

    vAlpha = 1.0 - life;
    vAlpha *= smoothstep(0.0, 0.1, life);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    mvPosition = bendViewPos(mvPosition);

    gl_PointSize = uSize * (300.0 / -mvPosition.z) * vAlpha;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAG = `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    float alpha = (1.0 - dist * 2.0) * vAlpha;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// ------------------------------------------------------------------
// Utils
// ------------------------------------------------------------------

function createRandom(seed) {
  let val = seed;
  return function () {
    let t = (val += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SimpleNoise {
  constructor(rng) {
    this.offsets = [rng() * 100, rng() * 100];
  }
  get(x, y) {
    return (Math.sin(x + this.offsets[0]) + Math.sin(y + this.offsets[1])) * 0.5;
  }
}

class InstanceManager {
  constructor(mesh, count) {
    this.mesh = mesh;
    this.maxCount = count;
    this.instances = [];
    this.freeIds = Array.from({ length: count }, (_, i) => count - 1 - i);
    this.dummy = new THREE.Object3D();
    this.resetAll();
  }

  resetAll() {
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.maxCount; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(matrix, chunkId, userData = {}) {
    if (this.freeIds.length === 0) return null;
    const idx = this.freeIds.pop();
    this.mesh.setMatrixAt(idx, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    const inst = { idx, chunkId, userData };
    this.instances.push(inst);
    return inst;
  }

  removeByChunk(chunkId) {
    const keep = [];
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (const inst of this.instances) {
      if (inst.chunkId === chunkId) {
        this.mesh.setMatrixAt(inst.idx, this.dummy.matrix);
        this.freeIds.push(inst.idx);
      } else {
        keep.push(inst);
      }
    }
    this.instances = keep;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------
// Main Generator
// ------------------------------------------------------------------

export function createTrack(THREE_Instance, opts = {}) {
  const T = THREE_Instance || THREE;
  const rng = createRandom(opts.seed || 42);
  const noise = new SimpleNoise(rng);

  const root = new T.Object3D();

  const uniforms = {
    uTime: { value: 0 },
    uCurvature: { value: opts.curvature ?? CONFIG.curvature },
    uColorFog: { value: new T.Color(CONFIG.colors.fog) },
    uColorGrid: { value: new T.Color(CONFIG.colors.roadGrid) },
    uColorCenter: { value: new T.Color(CONFIG.colors.roadCenter) },
    uWinColor: { value: new T.Color(CONFIG.colors.windowOn) },
    uNeonColor: { value: new T.Color(CONFIG.colors.neon) }
  };

  // ----------------------------
  // 基础灯光：避免汽车（Standard/Physical）变黑
  // ----------------------------
  const enableLights = (opts.addLights ?? CONFIG.addLights) !== false;
  if (enableLights) {
    const amb = new T.AmbientLight(0xffffff, CONFIG.light.ambient);
    const hemi = new T.HemisphereLight(0x88aaff, 0x080010, CONFIG.light.hemi);

    const dir = new T.DirectionalLight(0xffffff, CONFIG.light.directional);
    dir.position.set(40, 80, 30);
    dir.target.position.set(0, 0, -50);

    root.add(amb);
    root.add(hemi);
    root.add(dir);
    root.add(dir.target);
  }

  // ----------------------------
  // 对 Standard/Physical 材质做 curvature 注入（拱门/金币等）
  // ----------------------------
  function applyCurvatureToStandardMaterial(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCurvature = uniforms.uCurvature;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
uniform float uCurvature;
vec4 bendViewPos(vec4 viewPos){
  float zDepth = -viewPos.z;
  viewPos.y += uCurvature * zDepth * zDepth * 0.00035;
  return viewPos;
}`
      );

      // 直接替换 project_vertex，确保 instancing/batching 都能走到 bend
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
#ifdef USE_BATCHING
  vec4 mvPosition = batchingMatrix * vec4( transformed, 1.0 );
#else
  vec4 mvPosition = vec4( transformed, 1.0 );
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  mvPosition = modelViewMatrix * mvPosition;
  mvPosition = bendViewPos(mvPosition);
  gl_Position = projectionMatrix * mvPosition;
`
      );
    };

    mat.customProgramCacheKey = () => 'curvature_standard_v1';
    mat.needsUpdate = true;
  }

  // 路面
  const roadMat = new T.ShaderMaterial({
    vertexShader: ROAD_VERT,
    fragmentShader: ROAD_FRAG,
    uniforms,
    side: T.DoubleSide
  });

  // 建筑
  const buildGeo = new T.BoxGeometry(1, 1, 1);
  buildGeo.translate(0, 0.5, 0);

  const buildMat = new T.ShaderMaterial({
    vertexShader: BUILDING_VERT,
    fragmentShader: BUILDING_FRAG,
    uniforms: { ...uniforms }
  });

  const buildMesh = new T.InstancedMesh(buildGeo, buildMat, CONFIG.maxBuildings);
  buildMesh.frustumCulled = false;
  buildMesh.raycast = () => {};
  root.add(buildMesh);
  const buildings = new InstanceManager(buildMesh, CONFIG.maxBuildings);

  // 拱门
  const archGeo = new T.TorusGeometry(10, 1.0, 8, 32, Math.PI);
  const archMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.arch,
    emissive: CONFIG.colors.arch,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.8
  });
  applyCurvatureToStandardMaterial(archMat);

  const archMesh = new T.InstancedMesh(archGeo, archMat, CONFIG.maxArches);
  archMesh.frustumCulled = false;
  archMesh.raycast = () => {};
  root.add(archMesh);
  const arches = new InstanceManager(archMesh, CONFIG.maxArches);

  // 金币
  const coinGeo = new T.IcosahedronGeometry(0.8, 1);
  const coinMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.coin,
    roughness: 0.2,
    metalness: 0.9,
    emissive: 0xffaa00,
    emissiveIntensity: 0.6
  });
  applyCurvatureToStandardMaterial(coinMat);

  const coinMesh = new T.InstancedMesh(coinGeo, coinMat, CONFIG.maxCoins);
  coinMesh.frustumCulled = false;
  coinMesh.raycast = () => {};
  root.add(coinMesh);
  const coins = new InstanceManager(coinMesh, CONFIG.maxCoins);

  // 粒子系统
  const particleGeo = new T.BufferGeometry();
  const particleCount = CONFIG.maxParticles;
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);
  const phases = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (rng() - 0.5) * 100;
    positions[i * 3 + 1] = rng() * 5;
    positions[i * 3 + 2] = (rng() - 0.5) * 200;
    speeds[i] = 0.5 + rng() * 1.5;
    phases[i] = rng() * 10;
  }

  particleGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
  particleGeo.setAttribute('aSpeed', new T.BufferAttribute(speeds, 1));
  particleGeo.setAttribute('aPhase', new T.BufferAttribute(phases, 1));

  const particleMat = new T.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: {
      uTime: uniforms.uTime,
      uCurvature: uniforms.uCurvature,
      uSize: { value: 4.0 },
      uColor: { value: new T.Color(CONFIG.colors.particle) }
    },
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false
  });

  const particleMesh = new T.Points(particleGeo, particleMat);
  root.add(particleMesh);

  let activeChunks = [];
  let totalDist = 0;
  let lastPlayerS = 0;

  // ------------------------------------------------------------
  // Closest-point stability (立体交叉/陡坡防“跳跃”)
  // 1) 优先用“向下 Raycast”拿到当前脚下的路面（能区分上下层赛道）
  // 2) Raycast 失败时，再用里程 s 的窗口做局部搜索，避免选到远处但 XZ 很近的分支
  // ------------------------------------------------------------
  const roadMeshes = [];
  const _raycaster = new T.Raycaster();
  const _rayOrigin = new T.Vector3();
  const _rayDirDown = new T.Vector3(0, -1, 0);
  _raycaster.near = 0;
  _raycaster.far = 180;

  const CLOSEST_CFG = {
    backS: 90,          // 只在 lastPlayerS 附近往后搜多远（米）
    fwdS: 260,          // 只在 lastPlayerS 附近往前搜多远（米）
    reacquireBackS: 420,
    reacquireFwdS: 700,
    yReject: 90,        // 样本搜索时允许的上下高度差（米）
    yWeight: 0.35,      // cost 里 Y 的权重（越大越不容易选到上下层）
    sWeight: 0.0015,    // cost 里 s 偏差惩罚（越大越“粘”在当前分支）
    rayUp: 2.0,         // 从车身上方多少米开始向下射线（避免从地面以下起射）
    rayFar: 180         // 向下 ray 的最大距离
  };

  const cursor = {
    pos: new T.Vector3(0, 0, 0),
    dir: new T.Vector3(0, 0, -1),
    lastBinormal: new T.Vector3(1, 0, 0)
  };

  // 用于追踪建筑位置，避免重叠（带半径/chunkId）
  let recentBuildings = []; // {x,z,r,chunkId}

  class Chunk {
    constructor(id) {
      this.id = id;
      this.boundsData = [];
    this.startDist = 0;
    this.endDist = 0;

      this.geo = new T.BufferGeometry();
      const count = (CONFIG.chunkSegments + 1) * 2;
      this.geo.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3));
      this.geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(count * 2), 2));

      const indices = [];
      for (let i = 0; i < CONFIG.chunkSegments; i++) {
        const currLeft = i * 2;
        const currRight = i * 2 + 1;
        const nextLeft = (i + 1) * 2;
        const nextRight = (i + 1) * 2 + 1;
        indices.push(currLeft, nextLeft, currRight);
        indices.push(currRight, nextLeft, nextRight);
      }
      this.geo.setIndex(indices);

      this.mesh = new T.Mesh(this.geo, roadMat);
      this.mesh.userData.__chunkRef = this; // 给 raycast 回查 chunk 用
      this.mesh.frustumCulled = false;
      this.mesh.name = 'RoadChunk_' + id;
    }

    generate(startPos, startDir) {
      const startDist = totalDist;
      const points = [startPos.clone()];
      const step = CONFIG.chunkLength / 3;
      let currPos = startPos.clone();
      let currDir = startDir.clone();

      for (let i = 0; i < 3; i++) {
        totalDist += step;
        const nTurn = noise.get(totalDist * 0.005, 0);
        const nSlope = noise.get(0, totalDist * 0.01);

        currDir.applyAxisAngle(new T.Vector3(0, 1, 0), nTurn * 0.3 * CONFIG.turnScale);
        currDir.y += nSlope * 0.2;
        currDir.y = Math.max(-CONFIG.maxSlope, Math.min(CONFIG.maxSlope, currDir.y));
        currDir.normalize();

        if (currPos.y > 50) currDir.y -= 0.1;
        if (currPos.y < -20) currDir.y += 0.1;

        currPos.addScaledVector(currDir, step);
        points.push(currPos.clone());
      }

      this.startDist = startDist;
      this.endDist = totalDist;

      cursor.pos.copy(currPos);
      cursor.dir.copy(currDir);

      const curve = new T.CatmullRomCurve3(points);
      curve.tension = 0.5;

      const worldUp = new T.Vector3(0, 1, 0);
      const _right = new T.Vector3();
      const _up = new T.Vector3();
      const _tangent = new T.Vector3();
      const lastRight = cursor.lastBinormal ? cursor.lastBinormal.clone() : new T.Vector3(1, 0, 0);

      const posAttr = this.geo.attributes.position;
      const uvAttr = this.geo.attributes.uv;
      const widthHalf = CONFIG.roadWidth / 2;
      const dummy = new T.Object3D();

      for (let i = 0; i <= CONFIG.chunkSegments; i++) {
        const t = i / CONFIG.chunkSegments;
        const pt = curve.getPointAt(t);
        _tangent.copy(curve.getTangentAt(t)).normalize();

        _right.crossVectors(_tangent, worldUp);
        if (_right.lengthSq() < 1e-8) {
          _right.copy(lastRight);
        } else {
          _right.normalize();
        }
        if (_right.dot(lastRight) < 0) _right.negate();

        _up.crossVectors(_right, _tangent).normalize();
        lastRight.copy(_right);

        const binormal = _right;
        const normal = _up;
        const tangent = _tangent;

        const left = pt.clone().addScaledVector(binormal, widthHalf);
        const right = pt.clone().addScaledVector(binormal, -widthHalf);

        posAttr.setXYZ(i * 2, left.x, left.y, left.z);
        posAttr.setXYZ(i * 2 + 1, right.x, right.y, right.z);
        uvAttr.setXY(i * 2, 0, i);
        uvAttr.setXY(i * 2 + 1, 1, i);

        if (i % 2 === 0) {
          const t = i / CONFIG.chunkSegments;
          this.boundsData.push({
            center: pt.clone(),
            forward: tangent.clone(),
            binormal: binormal.clone(),
            t,
            chunkId: this.id,
            s: this.startDist + t * (this.endDist - this.startDist)
          });
        }

        // ----------------------------------------------------------------
        // ✅ 增强版建筑生成：加入碰撞检测 (Collision Detection)
        // ----------------------------------------------------------------
        
        if (i % 3 === 0 && rng() < CONFIG.buildingDensity) {
          const side = rng() > 0.5 ? 1 : -1;

          // 1. 随机尺寸
          const sx = 6 + rng() * 12; // 宽 6~18
          const sz = 6 + rng() * 12; // 深 6~18
          const buildHeight = 25 + rng() * 60;

          // 2. 🧮 计算“绝对防御”半径
          // 使用勾股定理算出大楼最长的一根对角线的一半，确保大楼任何角落都在这个半径内
          const buildingMaxRadius = Math.sqrt(sx * sx + sz * sz) / 2;
          
          // 3. 🚧 设定安全红线 (Deadzone)
          // 赛道半宽(9) + 大楼半径(~12) + 弯道补偿缓冲(8.0)
          // 之前的缓冲只有3.0，弯道容易切角，现在加到 8.0 甚至 10.0 确保万无一失
          const roadHalfWidth = CONFIG.roadWidth / 2;
          const curveBuffer = 8.0; 
          const minSafeDist = roadHalfWidth + buildingMaxRadius + curveBuffer;

          // 4. 原始计算的随机距离
          let dist = CONFIG.buildingOffset + rng() * 15;

          // 5. 👮‍♂️ 强制修正：如果不满足安全红线，强制推出去
          if (dist < minSafeDist) {
             // 强制推到安全线外，并额外加一点点随机(0~5)，避免所有楼都整齐排成一堵墙
             dist = minSafeDist + rng() * 5; 
          }

          // 6. 计算坐标
          const bPos = pt.clone().addScaledVector(binormal, side * dist);

          // 7. 楼与楼之间的间距检测 (Spacing)
          // 这里使用稍微小一点的半径做 spacing，允许楼之间稍微紧密一点，但绝不许碰路
          const footprintRadius = buildingMaxRadius + CONFIG.minBuildingSpacing;

          let tooClose = false;
          for (const e of recentBuildings) {
            const dx = bPos.x - e.x;
            const dz = bPos.z - e.z;
            const rr = footprintRadius + e.r;
            // 简单的圆形碰撞
            if (dx * dx + dz * dz < rr * rr) {
              tooClose = true;
              break;
            }
          }

          if (!tooClose) {
            bPos.y = pt.y; // 底部贴合

            dummy.position.copy(bPos);
            dummy.lookAt(pt); // 让楼面向赛道
            dummy.scale.set(sx, buildHeight, sz);
            dummy.updateMatrix();
            buildings.spawn(dummy.matrix, this.id);

            recentBuildings.push({ x: bPos.x, z: bPos.z, r: footprintRadius, chunkId: this.id });
            // 限制缓存大小，优化性能
            if (recentBuildings.length > CONFIG.recentBuildingKeep) recentBuildings.shift();
          }
        }

        // 金币生成（较均匀）
        if (i % 6 === 0 && rng() > 0.7) {
          const offset = (rng() - 0.5) * (CONFIG.roadWidth - 5);
          const cPos = pt.clone().addScaledVector(binormal, offset);
          cPos.addScaledVector(normal, 3.0);

          dummy.position.copy(cPos);
          dummy.rotation.set(0, rng() * Math.PI, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          coins.spawn(dummy.matrix, this.id, { active: true, value: 100 });
        }
      }

      cursor.lastBinormal = lastRight.clone();

      // 拱门
      const endPt = curve.getPointAt(1);
      const endTan = curve.getTangentAt(1).normalize();
      dummy.position.copy(endPt);
      dummy.position.y += 8;
      dummy.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), endTan);
      dummy.scale.set(1.2, 1.2, 1.2);
      dummy.updateMatrix();
      arches.spawn(dummy.matrix, this.id);

      posAttr.needsUpdate = true;
      uvAttr.needsUpdate = true;
      this.geo.computeVertexNormals();
      this.geo.computeBoundingSphere();
    }

    dispose() {
      this.geo.dispose();
      buildings.removeByChunk(this.id);
      coins.removeByChunk(this.id);
      arches.removeByChunk(this.id);

      // 清理该 chunk 的建筑占位记录，避免“幽灵占位”影响新 chunk 生成
      recentBuildings = recentBuildings.filter((b) => b.chunkId !== this.id);
    }
  }

  // 初始生成
  for (let i = 0; i < CONFIG.visibleChunks; i++) {
    const c = new Chunk(i);
    c.generate(cursor.pos, cursor.dir);
    root.add(c.mesh);
    activeChunks.push(c);
    roadMeshes.push(c.mesh);
  }

  const _tempMat = new T.Matrix4();
  const ZERO_MAT = new T.Matrix4().makeScale(0, 0, 0);

  // interactables 缓存：避免每次 new 一堆对象/闭包
  const interactablesCache = [];
  const coinObjCache = new Array(CONFIG.maxCoins);

  function coinHide() {
    coins.mesh.setMatrixAt(this.id, ZERO_MAT);
    coins.mesh.instanceMatrix.needsUpdate = true;
  }

  function coinCollect() {
    if (this.userData) this.userData.active = false;
    coins.mesh.setMatrixAt(this.id, ZERO_MAT);
    coins.mesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt, playerPos) {
    uniforms.uTime.value += dt;

    // 粒子跟随玩家（只跟随 xz）
    if (playerPos && particleMesh) {
      particleMesh.position.x = playerPos.x;
      particleMesh.position.z = playerPos.z;
    }

    if (!playerPos || activeChunks.length === 0) return;

    const closest = getClosest(playerPos, lastPlayerS, { preferRaycast: true });
    if (!closest.valid) return;

    const playerS = Math.max(lastPlayerS, closest.s ?? 0);
    lastPlayerS = playerS;

    // 使用沿赛道“里程”回收（而不是欧式距离），避免赛道绕回时停止生成导致“跑到一半掉下去”。
    while (activeChunks.length && playerS > (activeChunks[0].endDist ?? 0) + CONFIG.recycleDist) {
      const oldChunk = activeChunks.shift();
      roadMeshes.shift();
      oldChunk.dispose();
      root.remove(oldChunk.mesh);

      const lastId = activeChunks.length ? activeChunks[activeChunks.length - 1].id : oldChunk.id;
      const newChunk = new Chunk(lastId + 1);
      newChunk.generate(cursor.pos, cursor.dir);
      root.add(newChunk.mesh);
      activeChunks.push(newChunk);
      roadMeshes.push(newChunk.mesh);
    }
  }

  // 更稳定的“离路最近采样点”：按 XZ 选最近点，再用 binormal 做横向偏移
  // 更稳定的“离路最近点”
  // - 立体交叉：优先 raycast 找脚下那层
  // - 回环/立交：用 lastPlayerS 做局部窗口，避免选到远处但 XZ 很近的分支
  const getClosest = (pos, hintS = lastPlayerS, opts = {}) => {
    const preferRaycast = opts.preferRaycast !== false;

    const makeRes = (b, sOverride) => {
      const dx = pos.x - b.center.x;
      const dy = pos.y - b.center.y;
      const dz = pos.z - b.center.z;

      const bn = b.binormal;
      const fw = b.forward;

      const lateral = dx * bn.x + dy * bn.y + dz * bn.z;
      const along = dx * fw.x + dy * fw.y + dz * fw.z;

      // 让 s 更平滑一点：用局部 along 做微调，但限制在很小范围内，防止跨段跳跃
      let s = Number.isFinite(sOverride) ? sOverride : (b.s ?? 0);
      if (Number.isFinite(b.s)) {
        const sCand = b.s + along;
        if (Math.abs(sCand - b.s) <= 10) s = sCand;
      }

      return { ...b, s, lateral, along, distXZ: Math.sqrt(dx * dx + dz * dz), valid: true };
    };

    const closestBySamples = (sMin, sMax, yReject, withPenalty) => {
      let best = null;
      let minCost = Infinity;

      const hasSWindow = Number.isFinite(sMin) && Number.isFinite(sMax);
      const hasHint = Number.isFinite(hintS) && hintS > 0;

      for (const c of activeChunks) {
        for (const b of c.boundsData) {
          if (hasSWindow && (b.s < sMin || b.s > sMax)) continue;

          const dx = pos.x - b.center.x;
          const dy = pos.y - b.center.y;
          const dz = pos.z - b.center.z;

          if (Math.abs(dy) > yReject) continue;

          const d2xz = dx * dx + dz * dz;
          const cost = d2xz + (dy * dy) * CLOSEST_CFG.yWeight + (hasHint && withPenalty ? ((b.s - hintS) * (b.s - hintS)) * CLOSEST_CFG.sWeight : 0);

          if (cost < minCost) {
            minCost = cost;
            best = b;
          }
        }
      }
      return best;
    };

    const closestByRaycastDown = () => {
      if (!roadMeshes.length) return null;

      _raycaster.far = CLOSEST_CFG.rayFar;
      _rayOrigin.copy(pos);
      _rayOrigin.y += CLOSEST_CFG.rayUp;
      _raycaster.set(_rayOrigin, _rayDirDown);

      const hits = _raycaster.intersectObjects(roadMeshes, false);
      if (!hits.length) return null;

      const hit = hits[0];
      const chunk = hit.object?.userData?.__chunkRef;
      const hp = hit.point;

      // 在命中的 chunk 内找最近的 bounds 采样点（orientation 用）
      let bestB = null;
      let minD2 = Infinity;
      const list = chunk?.boundsData || [];
      for (const b of list) {
        const dx = hp.x - b.center.x;
        const dy = hp.y - b.center.y;
        const dz = hp.z - b.center.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minD2) {
          minD2 = d2;
          bestB = b;
        }
      }
      if (!bestB) return null;

      // 用“命中点”微调 s（更连续），再用玩家 pos 计算 lateral/along
      const fw = bestB.forward;
      const dxh = hp.x - bestB.center.x;
      const dyh = hp.y - bestB.center.y;
      const dzh = hp.z - bestB.center.z;
      const alongHit = dxh * fw.x + dyh * fw.y + dzh * fw.z;
      let s = (bestB.s ?? 0) + alongHit;

      if (Number.isFinite(chunk?.startDist) && Number.isFinite(chunk?.endDist)) {
        s = Math.max(chunk.startDist, Math.min(chunk.endDist, s));
      }

      return makeRes(bestB, s);
    };

    // 1) 尽量用 raycast，直接拿到“脚下那层”
    if (preferRaycast && Number.isFinite(pos.y)) {
      const rayRes = closestByRaycastDown();
      if (rayRes) return rayRes;
    }

    // 2) 局部窗口（防止跨立交跳段）
    if (Number.isFinite(hintS) && hintS > 0) {
      const sMin = hintS - CLOSEST_CFG.backS;
      const sMax = hintS + CLOSEST_CFG.fwdS;
      const b1 = closestBySamples(sMin, sMax, CLOSEST_CFG.yReject, true);
      if (b1) return makeRes(b1);

      // 3) 如果局部没找到，再扩大窗口做重捕获
      const sMin2 = hintS - CLOSEST_CFG.reacquireBackS;
      const sMax2 = hintS + CLOSEST_CFG.reacquireFwdS;
      const b2 = closestBySamples(sMin2, sMax2, CLOSEST_CFG.yReject * 2, false);
      if (b2) return makeRes(b2);
    }

    // 4) 兜底：全局找（一般用于初始/重生/完全离路）
    const b3 = closestBySamples(-Infinity, Infinity, CLOSEST_CFG.yReject * 3, false);
    if (b3) return makeRes(b3);

    return { distXZ: 9999, lateral: 9999, center: pos, valid: false };
  };

  const spawnPt = activeChunks[0].boundsData[3];

  return {
    root,
    roadWidth: CONFIG.roadWidth,
    surfaceTuning: {
      maxSpeed: 1,
      grip: 0,
      driftGrip: 0,
    },
    tags: ['霓虹', '金币', '经典'],
    difficulty: '中',
    style: '均衡高速',
    theme: {
      background: 0x03040a,
      fog: CONFIG.colors.fog,
      fogDensity: 0.0008,
      fogNear: 20,
      fogFar: 260,
    },
    spawn: {
      position: spawnPt.center.clone().add(new T.Vector3(0, 1.5, 0)),
      yaw: Math.atan2(spawnPt.forward.x, spawnPt.forward.z)
    },
    checkpoints: activeChunks.flatMap((chunk) => chunk.boundsData.filter((_, index) => index % 5 === 0).map((b) => ({
      center: b.center.clone(),
      radius: 7,
    }))).slice(0, 12),

    bounds: {
      fn: (x, z, pos3D) => {
        const p = pos3D || new T.Vector3(x, 0, z);
        const res = getClosest(p, lastPlayerS, { preferRaycast: !!pos3D });
        if (!res.valid) return 100;
        if (Math.abs(p.y - res.center.y) > 35) return 100;

        return Math.abs(res.lateral) - CONFIG.roadWidth / 2;
      },

      clampPosition: (pos, margin = 0.5) => {
        const res = getClosest(pos, lastPlayerS, { preferRaycast: true });
        if (!res.valid) return;

        const limit = CONFIG.roadWidth / 2 - margin;
        const absLat = Math.abs(res.lateral);

        if (absLat > limit) {
          const over = absLat - limit;

          // over 太大通常意味着“closest 选错了上下层/分支”（立体交叉处最常见）
          // 这时不要强行吸回赛道，否则会瞬移或被弹飞。
          if (over > CONFIG.roadWidth * 1.5) return;

          // 单帧最大推回距离，避免突然被“拉回去”造成飞车
          const push = Math.min(over, 4.0);
          const dir = Math.sign(res.lateral) || 1;
          const bn = res.binormal;

          // 沿 binormal 推回去（更贴合路的左右方向）
          pos.x -= bn.x * dir * push;
          pos.z -= bn.z * dir * push;
          // pos.y 不动（避免坡道上抖动）
        }
      }
    },


    update,

    // 在“无限/循环”赛道上，旧的 spawn 可能已经被回收掉；用最近的路面点做重生点更稳。
    getRespawn: (posHint) => {
      const p = posHint || spawnPt.center;
      const res = getClosest(p, lastPlayerS, { preferRaycast: true });
      const center = (res.valid ? res.center : spawnPt.center).clone();
      const fw = (res.valid ? res.forward : spawnPt.forward);
      const yaw = Math.atan2(fw.x, fw.z);
      return { position: center.add(new T.Vector3(0, 1.5, 0)), yaw };
    },

    getInteractables: () => {
      interactablesCache.length = 0;

      for (const inst of coins.instances) {
        if (!inst.userData?.active) continue;

        coins.mesh.getMatrixAt(inst.idx, _tempMat);

        let obj = coinObjCache[inst.idx];
        if (!obj) {
          obj = {
            id: inst.idx,
            type: 'coin',
            position: new T.Vector3(),
            rotation: { y: 0 },
            userData: inst.userData,
            hide: coinHide,
            collect: coinCollect
          };
          coinObjCache[inst.idx] = obj;
        }

        obj.userData = inst.userData;
        obj.position.setFromMatrixPosition(_tempMat);

        interactablesCache.push(obj);
      }

      return interactablesCache;
    },

    __debug: {
      buildingsMesh: buildMesh,
      archesMesh: archMesh,
      coinsMesh: coinMesh,
      particles: particleMesh
    },

    getClosest: (pos) => getClosest(pos, lastPlayerS, { preferRaycast: true }),
    
    dispose: () => {
      for (const c of activeChunks) {
        root.remove(c.mesh);
        c.dispose();
      }
      activeChunks.length = 0;

      recentBuildings = [];

      roadMat.dispose();

      buildGeo.dispose();
      buildMat.dispose();

      archGeo.dispose();
      archMat.dispose();

      coinGeo.dispose();
      coinMat.dispose();

      particleGeo.dispose();
      particleMat.dispose();
    }
  };
}
