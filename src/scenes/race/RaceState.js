// src/scenes/race/RaceState.js
import * as THREE from 'three';
import { DEFAULT_CAR_MODELS, STATES } from '../../core/constants.js';
import { Assets } from '../../core/Assets.js';

// 默认赛道
import { createTrack as createDefaultTrack } from './tracks/Track_SimpleRing.js';

import { CarController } from './systems/CarController.js';
import { AIController } from './systems/AIController.js';
import { CameraRig } from './systems/CameraRig.js';
import { BoundsSystem } from './systems/BoundsSystem.js';
import { ScoreSystem } from './systems/ScoreSystem.js';

export function createRaceState(ctx) {
  const { app, store, assets, input, ui } = ctx;

  let scene = null;
  let camera = null;
  let trackData = null;
  
  // 玩家车辆
  let carRoot = null; 
  let carCtrl = null;

  // AI 车辆
  let aiRoot = null;
  let aiCtrl = null;

  // 性能优化：反射控制器
  let cubeCamera = null;
  let cubeRenderTarget = null;
  let carVisualBody = null; 
  
  // 优化参数
  let frameCount = 0; 
  const REFLECTION_INTERVAL = 3; 
  const REFLECTION_RES = 128;    

  // 子系统
  let camRig = null;
  let scoreSys = null;
  let boundsSys = null;
  let roadMeshCount = 0;
  let initialResetSnapshot = null;
  let latestDebugSnapshot = null;

  const prevKeys = { esc: false, r: false, c: false };

  // ----------------------------------------------------------------
  // 1. 初始化实时反射系统
  // ----------------------------------------------------------------
  function initRealtimeReflection(renderer, scene) {
    cubeRenderTarget = new THREE.WebGLCubeRenderTarget(REFLECTION_RES);
    cubeRenderTarget.texture.type = THREE.HalfFloatType; 
    
    // Near: 0.5, Far: 100
    cubeCamera = new THREE.CubeCamera(0.5, 100, cubeRenderTarget);
    scene.add(cubeCamera);
    
    return cubeRenderTarget.texture;
  }

  // ----------------------------------------------------------------
  // 2. 材质配置
  // ----------------------------------------------------------------
  function applyCarConfig(car, cfg, dynamicEnvMap) {
    if (!cfg) return;

    const bodyMeshes = [];
    const glassMeshes = [];
    const allMeshes = [];

    car.traverse((n) => {
      if (!n.isMesh) return;
      allMeshes.push(n);

      const name = (n.name || '').toLowerCase();
      if (name.includes('glass') || name.includes('window')) {
        glassMeshes.push(n);
      } else if (name.includes('body') || name.includes('paint') || name.includes('shell') || name.includes('chassis') || name.includes('car')) {
        bodyMeshes.push(n);
      }
    });

    const targetMeshes = bodyMeshes.length > 0 ? bodyMeshes : allMeshes.filter(m => !glassMeshes.includes(m));
    carVisualBody = targetMeshes; 

    const bodyColor = new THREE.Color(cfg.bodyColor || '#ff0000');
    const userMetalness = cfg.metalness ?? 0.7;
    const userRoughness = cfg.roughness ?? 0.2;

    for (const m of targetMeshes) {
      m.material = new THREE.MeshPhysicalMaterial();
      m.material.color.copy(bodyColor);
      m.material.metalness = userMetalness;
      m.material.roughness = userRoughness;
      
      const smartClearcoat = Math.max(0, 1.0 - userRoughness); 
      m.material.clearcoat = smartClearcoat; 
      m.material.clearcoatRoughness = userRoughness * 0.5;

      m.material.envMap = dynamicEnvMap;
      
      let intensity = 1.0 + (userMetalness * 1.5);
      intensity *= (1.0 - userRoughness * 0.8);
      m.material.envMapIntensity = Math.max(0.5, intensity);
    }

    const glassTint = new THREE.Color(cfg.glassTint || '#aaccff');
    const glassTrans = cfg.glassTransmission ?? 0.9;

    for (const m of glassMeshes) {
      m.material = new THREE.MeshPhysicalMaterial({
        color: glassTint,
        metalness: 0.9, 
        roughness: 0.0,
        transparent: true,
        transmission: glassTrans,
        thickness: 0.5,
        envMap: dynamicEnvMap,
        envMapIntensity: 2.5
      });
    }
  }

  // 加载 AI 车辆
  async function loadAICar() {
    const s = store.getState();
    const models = s.carModels || DEFAULT_CAR_MODELS;
    const aiModelInfo = models.length > 1 ? models[1] : models[0];

    const gltf = await assets.loadGLTF(aiModelInfo.path);
    const model = assets.cloneGLTFScene(gltf);

    if (aiModelInfo.rotationFix) model.rotation.y = aiModelInfo.rotationFix;
    Assets.liftToGround(model, 0);

    // AI 换色
    model.traverse((n) => {
      if (n.isMesh) {
         const name = (n.name || '').toLowerCase();
         if (name.includes('body') || name.includes('paint') || name.includes('shell')) {
            n.material = n.material.clone(); 
            n.material.color.setHex(0xff00ff); // Neon Purple
            n.material.emissive.setHex(0xaa00aa);
            n.material.emissiveIntensity = 0.8;
            n.material.metalness = 0.9;
            n.material.roughness = 0.1;
         }
      }
    });

    const wrapper = new THREE.Object3D();
    wrapper.add(model);
    return wrapper;
  }

  // --- 场景构建 ---
  async function buildSetupFallback() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    scene.fog = new THREE.FogExp2(0x020205, 0.001); 

    const realtimeEnvMap = initRealtimeReflection(app.renderer, scene);

    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(50, 100, 50);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const d = 100;
    dir.shadow.camera.left = -d; dir.shadow.camera.right = d;
    dir.shadow.camera.top = d; dir.shadow.camera.bottom = -d;
    scene.add(amb, dir);

    // 赛道
    const trackModule = ctx.trackModule?.createTrack ? ctx.trackModule : { createTrack: createDefaultTrack };
    trackData = trackModule.createTrack(THREE, { seed: Math.random() * 1000 });
    scene.add(trackData.root);

    // 玩家车辆
    const s = store.getState();
    const models = s.carModels || DEFAULT_CAR_MODELS;
    const idx = ((s.showroom?.carIndex ?? 0) % models.length + models.length) % models.length;
    const carInfo = models[idx];

    const gltf = await assets.loadGLTF(carInfo.path);
    const visualModel = assets.cloneGLTFScene(gltf);

    if (carInfo.rotationFix) visualModel.rotation.y = carInfo.rotationFix;
    Assets.liftToGround(visualModel, 0);

    const wrapper = new THREE.Object3D();
    wrapper.add(visualModel);
    carRoot = wrapper;
    scene.add(carRoot);

    const carConfig = s.carConfig || {};
    applyCarConfig(visualModel, carConfig, realtimeEnvMap);
  }

  function commitSetupFromRuntime() {
    const setup = ctx.runtime?.raceSetup;
    if (!setup) return false;
    scene = setup.scene;
    camera = setup.camera;
    trackData = setup.trackData;
    carRoot = setup.carRoot;
    return true;
  }

  function countRoadMeshes(root) {
    if (!root?.traverse) return 0;
    let count = 0;
    root.traverse((node) => {
      if (node?.isMesh && typeof node.name === 'string' && node.name.startsWith('RoadChunk_')) {
        count += 1;
      }
    });
    return count;
  }

  return {
    name: STATES.RACE,

    async enter() {
      ui?.setLayer?.('hud');
      input.startGameplaySession();

      const hasSetup = commitSetupFromRuntime();
      if (!hasSetup || !cubeCamera) {
          if(scene) {
             while(scene.children.length > 0){ scene.remove(scene.children[0]); }
          }
          await buildSetupFallback();
      }

      // ----------------------------------
      // Init Player Controller
      // ----------------------------------
      carCtrl = new CarController({
        carRoot,
        trackRoot: trackData.root,
        tuning: {
          maxSpeed: 110,
          accel: 85,
          turnRate: 3.2,
          grip: 0.98,
          driftGrip: 0.94,
        },
      });

      if (trackData?.spawn) {
        carCtrl.reset(trackData.spawn.position, trackData.spawn.yaw);
        initialResetSnapshot = {
          posY: Number(carCtrl.state.pos.y.toFixed(2)),
          onGround: carCtrl.state.onGround,
          speed: Number(carCtrl.state.speed.toFixed(2)),
        };
      }
      roadMeshCount = countRoadMeshes(trackData?.root);

      // ----------------------------------
      // Init AI Controller
      // ----------------------------------
      aiRoot = await loadAICar();
      scene.add(aiRoot);

      // AI 出生位置计算 (并排起步优化)
      const spawnPos = trackData.spawn.position.clone();
      const spawnDir = new THREE.Vector3(Math.sin(trackData.spawn.yaw), 0, Math.cos(trackData.spawn.yaw));
      
      // 计算赛道右侧向量 (用于横向偏移，防止重叠)
      const up = new THREE.Vector3(0, 1, 0);
      const rightDir = new THREE.Vector3().crossVectors(spawnDir, up).normalize();

      // ★★★ 改进：并排起步 ★★★
      // 纵向不偏移(0)，横向偏移 6 米，实现与玩家并排
      spawnPos.addScaledVector(spawnDir, 0); 
      spawnPos.addScaledVector(rightDir, 6.0); 

      aiCtrl = new AIController({
        carRoot: aiRoot,
        trackRoot: trackData.root,
        trackData: trackData, 
        colliders: [], 
        tuning: {
          maxSpeed: 130, 
          accel: 60,
          grip: 1.5,     
          turnRate: 4.0
        },
        aiConfig: {
            rubberBandDist: 200, 
            catchUpSpeed: 1.2,   
            respawnBehind: 30,   
            startGraceTime: 2.5, // 配合 AIController 的起步保护
        }
      });
      aiCtrl.reset(spawnPos, trackData.spawn.yaw);


      // ----------------------------------
      // Other Systems
      // ----------------------------------
      camRig = new CameraRig({ camera, target: carRoot });
      camRig.setMode('CHASE');

      scoreSys = new ScoreSystem({ trackData });
      boundsSys = new BoundsSystem({ trackData });

      prevKeys.esc = false;
      prevKeys.r = false;
      prevKeys.c = false;
      
      frameCount = 0;
      latestDebugSnapshot = {
        phase: 'race-enter',
        frame: 0,
        timeSec: '0.0',
        axis: { throttle: 0, steer: 0 },
        speedKmh: 0,
        onGround: carCtrl?.state?.onGround ?? false,
        posY: Number(carCtrl?.state?.pos?.y?.toFixed?.(2) ?? 0),
        handbrake: false,
        roadMeshCount,
        initialReset: initialResetSnapshot,
      };
      ctx.setRaceDebugMetricsProvider?.(() => latestDebugSnapshot);

      app.setActive({
        scene,
        camera,
        update: (dt, t) => {
          frameCount++;

          // 1. 赛道逻辑
          if (trackData && typeof trackData.update === 'function') {
            trackData.update(dt, carCtrl.state.pos);
          }

          // 2. 玩家车辆物理
          const axis = input.axis2D();
          const handbrake = input.down('Space');
          carCtrl.step(dt, { ...axis, handbrake });

          const boundsResult = boundsSys.enforce(carCtrl.state);
          if (boundsResult.out && boundsResult.distance > 50) {
            const respawn = (trackData.getRespawn?.(carCtrl.state.pos) || trackData.spawn);
            carCtrl.reset(respawn.position, respawn.yaw);
          }
          carCtrl.applyToObject3D();

          // 3. AI 逻辑更新
          if (aiCtrl && carCtrl) {
            aiCtrl.updateAI(dt, carCtrl.state);
          }

          // 4. 实时反射 (Player Car Only)
          if (cubeCamera && carRoot && carVisualBody && (frameCount % REFLECTION_INTERVAL === 0)) {
             cubeCamera.position.copy(carRoot.position);
             cubeCamera.position.y += 0.8; 

             for(let i=0; i<carVisualBody.length; i++) carVisualBody[i].visible = false;
             cubeCamera.update(app.renderer, scene);
             for(let i=0; i<carVisualBody.length; i++) carVisualBody[i].visible = true;
          }

          // 5. 其他系统
          scoreSys.update(dt, carCtrl.state.pos);
          const forward = carCtrl.getForward();
          
          camRig.update(dt, { forward, speed: carCtrl.state.speed });

          // 6. UI & Input
          const escDown = input.down('Escape');
          const rDown = input.down('KeyR');
          const cDown = input.down('KeyC');

          if (escDown && !prevKeys.esc) {
            const { score } = scoreSys.getDisplayData();
            ctx.onRaceFinish?.({ timeSec: t.toFixed(1), score });
            return;
          }
          if (rDown && !prevKeys.r) {
            const respawn = (trackData.getRespawn?.(carCtrl.state.pos) || trackData.spawn);
            carCtrl.reset(respawn.position, respawn.yaw);
            scoreSys = new ScoreSystem({ trackData });
          }
          if (cDown && !prevKeys.c) {
            camRig.toggleMode();
          }
          prevKeys.esc = escDown;
          prevKeys.r = rDown;
          prevKeys.c = cDown;

          const speedKmh = Math.max(0, Math.round(Math.abs(carCtrl.state.speed) * 3.6));
          const { score, distance } = scoreSys.getDisplayData();
          ui?.setHud?.({ speedKmh, mileage: distance, score, timeSec: t.toFixed(1) });
          latestDebugSnapshot = {
            phase: 'race',
            frame: frameCount,
            timeSec: t.toFixed(1),
            axis,
            speedKmh,
            onGround: carCtrl.state.onGround,
            posY: Number(carCtrl.state.pos.y.toFixed(2)),
            handbrake,
            roadMeshCount,
            initialReset: initialResetSnapshot,
          };
        },
      });
      ctx.requestInputFocus?.();
    },

    async exit() {
      input.endGameplaySession();
      ctx.setRaceDebugMetricsProvider?.(() => ({
        phase: 'race-exit',
        roadMeshCount,
        initialReset: initialResetSnapshot,
      }));
      app.setActive({ scene: null, camera: null, update: null });
      if(cubeRenderTarget) cubeRenderTarget.dispose();
      try {
        if (carRoot) {
          scene?.remove(carRoot);
          assets.disposeObject3D(carRoot);
        }
        if (aiRoot) {
          scene?.remove(aiRoot);
          assets.disposeObject3D(aiRoot);
        }
        if (trackData?.root) {
          scene?.remove(trackData.root);
          assets.disposeObject3D(trackData.root);
        }
      } catch (e) {
        console.warn('RaceState cleanup error:', e);
      }
      if (ctx.runtime) ctx.runtime.raceSetup = null;
    },
  };
}
