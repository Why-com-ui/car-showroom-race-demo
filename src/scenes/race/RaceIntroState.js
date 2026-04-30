// src/scenes/race/RaceIntroState.js
import * as THREE from 'three';
import { STATES, DEFAULT_CAR_MODELS } from '../../core/constants.js';
import { Assets } from '../../core/Assets.js';
import { createTrack as createDefaultTrack } from './tracks/Track_SimpleRing.js';

export function createRaceIntroState(ctx) {
  const { app, store, assets, sm, ui } = ctx;

  let scene = null;
  let camera = null;
  let trackData = null;
  let carRoot = null; // 这是一个 Wrapper (父容器)
  let countdown = 3;
  let accum = 0;
  
  // ★ 新增：用于记录动画总时长
  let introTime = 0; 
  const INTRO_DURATION = 3.0; // 对应 3秒倒计时

  let _isStarting = false;

  function getModels() {
    const s = store.getState();
    return Array.isArray(s.carModels) && s.carModels.length ? s.carModels : DEFAULT_CAR_MODELS;
  }

  function getCarIndex() {
    const s = store.getState();
    return s.showroom?.carIndex ?? 0;
  }

  function getCarConfig() {
    const s = store.getState();
    return s.carConfig || {};
  }

  function applyCarConfig(car, cfg) {
    const bodyMeshes = [];
    const glassMeshes = [];

    car.traverse((n) => {
      if (!n.isMesh) return;
      const name = (n.name || '').toLowerCase();
      if (name.includes('glass') || name.includes('window')) glassMeshes.push(n);
      else if (name.includes('body') || name.includes('car_body') || name.includes('paint') || name.includes('shell')) bodyMeshes.push(n);
    });

    const bodyColor = new THREE.Color(cfg.bodyColor || '#ff2a2a');
    for (const m of bodyMeshes) {
      const mat = (m.material && m.material.isMeshStandardMaterial) ? m.material : new THREE.MeshStandardMaterial();
      mat.color = bodyColor;
      mat.metalness = clamp01(cfg.metalness ?? 0.7);
      mat.roughness = clamp01(cfg.roughness ?? 0.25);
      mat.needsUpdate = true;
      m.material = mat;
    }

    const glassTint = new THREE.Color(cfg.glassTint || '#aaccff');
    for (const m of glassMeshes) {
      m.material = new THREE.MeshPhysicalMaterial({
        color: glassTint,
        metalness: 0,
        roughness: 0,
        transparent: true,
        transmission: clamp01(cfg.glassTransmission ?? 0.9),
        ior: 1.5,
        thickness: 0.4,
      });
    }
  }

  async function buildSetup() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03040a);
    scene.fog = new THREE.Fog(0x03040a, 20, 140);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);

    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(8, 15, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(amb, dir);

    const trackModule = ctx.trackModule?.createTrack ? ctx.trackModule : { createTrack: createDefaultTrack };
    trackData = trackModule.createTrack(THREE, {});
    applyTrackSceneTheme();
    scene.add(trackData.root);

    // --- 获取车辆信息 ---
    const models = getModels();
    const idx = ((getCarIndex() % models.length) + models.length) % models.length;
    const carInfo = models[idx];
    
    let visualModel = null;

    // ★ 关键逻辑：优先检查是否有从展厅传过来的车
    if (ctx.runtime.transferredCar) {
      console.log('🏎️ RaceIntro: 接收到展厅车辆，跳过加载');
      visualModel = ctx.runtime.transferredCar;
      ctx.runtime.transferredCar = null; // 接收后清空，避免重复引用

      // 确保车辆是可见的（以防万一）
      visualModel.visible = true;
      
    } else {
      // 兜底逻辑：正常加载（如果直接进入赛道或刷新页面）
      console.log('🏎️ RaceIntro: 加载新车辆');
      const gltf = await assets.loadGLTF(carInfo.path);
      visualModel = assets.cloneGLTFScene(gltf);
      applyCarConfig(visualModel, getCarConfig());
    }

    // --- 统一处理模型修正 (Rotation / Lift) ---
    // 1. 应用旋转修正
    if (carInfo.rotationFix) {
      visualModel.rotation.y = carInfo.rotationFix;
    } else {
      visualModel.rotation.y = 0;
    }

    // 2. 确保贴地 (Local Y)
    Assets.liftToGround(visualModel, 0);

    // 3. 创建容器 (Wrapper)
    const wrapper = new THREE.Object3D();
    wrapper.add(visualModel);
    carRoot = wrapper;

    scene.add(carRoot);

    // --- 设置初始位置 (移动的是 wrapper) ---
    const spawn = trackData.spawn;
    carRoot.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    carRoot.rotation.y = spawn.yaw;

    // 设置相机初始位置 (会被 update 里的动画立即覆盖，但给个初始值比较安全)
    camera.position.set(spawn.position.x, 10, spawn.position.z + 10);
    camera.lookAt(carRoot.position);

    // 保存到 ctx.runtime 供 RaceState 使用
    ctx.runtime.raceSetup = {
      scene,
      camera,
      trackData,
      carRoot, // 传递的是修正后的 Wrapper
      carInfo,
      carConfig: getCarConfig(),
    };
  }

  function applyTrackSceneTheme() {
    const theme = trackData?.theme;
    if (!theme || !scene) return;
    const background = theme.background ?? theme.fog ?? 0x03040a;
    const fog = theme.fog ?? background;
    scene.background = new THREE.Color(background);
    scene.fog = new THREE.Fog(fog, theme.fogNear ?? 20, theme.fogFar ?? 140);
  }

  return {
    name: STATES.RACE_INTRO,

    async enter() {
      ui?.setLayer?.('raceIntro');
      ui?.setCountdown?.(3);

      countdown = 3;
      accum = 0;
      introTime = 0; // 重置动画计时
      _isStarting = false;

      await buildSetup();

      app.setActive({
        scene,
        camera,
        update: (dt, t) => {
          if (_isStarting) return;

          // 1. 倒计时逻辑
          accum += dt;
          if (accum >= 1) {
            accum = 0;
            countdown -= 1;
            ui?.setCountdown?.(Math.max(0, countdown));
          }

          // 2. ★★★ 电影级运镜动画逻辑 ★★★
          introTime += dt;
          
          // 计算当前进度 (0.0 ~ 1.0)
          let progress = introTime / INTRO_DURATION;
          if (progress > 1.0) progress = 1.0;

          // 使用 smoothstep 做缓动，让运动起步和结束都很柔和
          // 公式: t * t * (3 - 2 * t)
          const ease = progress * progress * (3 - 2 * progress);

          // 获取赛道出生点信息
          const spawn = trackData.spawn;
          const center = new THREE.Vector3(spawn.position.x, spawn.position.y, spawn.position.z);

          // === 运镜参数设定 ===
          // 角度：从侧前方 (Yaw + 45°) 旋转到 正后方 (Yaw + 180°)
          // 注意：Math.PI * 0.25 是 45度，Math.PI 是 180度
          const startAngle = spawn.yaw + Math.PI * 0.25; 
          const endAngle = spawn.yaw + Math.PI; 

          // 距离：从远 (11米) 拉近到 比赛视角 (6.5米)
          const startDist = 11.0;
          const endDist = 6.5; // 对应 CameraRig 里的 chaseBack

          // 高度：从高 (6米) 降到 比赛视角 (4.5米)
          const startHeight = 6.0;
          const endHeight = 4.5; // 对应 CameraRig 里的 chaseUp

          // === 插值计算 ===
          const currentAngle = THREE.MathUtils.lerp(startAngle, endAngle, ease);
          const currentDist = THREE.MathUtils.lerp(startDist, endDist, ease);
          const currentHeight = THREE.MathUtils.lerp(startHeight, endHeight, ease);

          // === 更新相机 ===
          // 计算相机在圆周上的偏移
          const offsetX = Math.sin(currentAngle) * currentDist;
          const offsetZ = Math.cos(currentAngle) * currentDist;

          camera.position.set(
            center.x + offsetX,
            center.y + currentHeight,
            center.z + offsetZ
          );

          // 让相机始终注视车身上方一点点 (模拟 CameraRig 的 chaseLookUp)
          const lookTarget = center.clone().add(new THREE.Vector3(0, 1.2, 0));
          camera.lookAt(lookTarget);

          // 3. 结束检查
          if (countdown <= 0) {
            _isStarting = true;
            // 此时相机位置正好停在比赛视角的起始点，实现无缝切换
            sm.setState(ctx.createRaceState ? ctx.createRaceState(ctx) : null);
          }
        },
      });
      ctx.requestInputFocus?.();
    },

    async exit() {
      // 退出 Intro 时，不销毁场景资源（因为要传给 RaceState）
      // 只解绑 update 循环
      app.setActive({ scene: null, camera: null, update: null });
    },
  };
}

function clamp01(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
