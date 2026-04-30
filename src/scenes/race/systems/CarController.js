// src/scenes/race/systems/CarController.js
import * as THREE from 'three';

/**
 * 3D 物理车辆控制器 - 极速增强版 (Hyper Speed & Neon VFX)
 * * 特性:
 * 1. [Speed] 极速解锁至 160km/h，强劲推背感。
 * 2. [VFX] 使用 CanvasTexture + Sprite 实现高质量渐变光晕尾焰。
 * 3. [Physics] 动态路面检测 + 智能贴地。
 */
export class CarController {
  constructor({ carRoot, colliders = [], trackRoot = null, tuning = {} }) {
    this.carRoot = carRoot;
    this.colliders = colliders;
    
    // ★★★ 新增: 赛道根节点引用 (用于动态查找路面) ★★★
    this.trackRoot = trackRoot;

    // 物理状态
    this.state = {
      pos: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      heading: 0,
      speed: 0,
      onGround: false,
      groundNormal: new THREE.Vector3(0, 1, 0),
      isDrifting: false,
      driftFactor: 0,
      nitro: 0,
      nitroActive: false,
      nitroCharging: false,
    };

    // 复用对象 (减少 GC)
    this._raycaster = new THREE.Raycaster();
    this._rayDown = new THREE.Vector3(0, -1, 0);
    this._rayOrigin = new THREE.Vector3();

    this._up = new THREE.Vector3(0, 1, 0);
    this._dummyObj = new THREE.Object3D();
    this._baseQuat = new THREE.Quaternion();
    this._alignQuat = new THREE.Quaternion();
    this._normalMatrix = new THREE.Matrix3();
    this._targetGroundNormal = new THREE.Vector3(0, 1, 0);
    this._lastStepDt = 1 / 60;

    // ★★★ 核心升级：缓存粒子光晕贴图 ★★★
    this._particleTexture = this._createParticleTexture();

    // 调优参数 - 🚀 速度全面升级
    this.tuning = {
      // --- 动力系统 ---
      accel: 80,          // 加速度 (原 30) -> 强劲推背感
      brake: 60,          // 刹车力度 (原 40)
      drag: 0.8,          // 地面阻力 (原 1.5) -> 极速更高，滑行更远
      maxSpeed: 90,      // 最大速度
      reverseSpeed: 30,   // 倒车速度

      // --- 操控系统 ---
      turnRate: 3.0,      // 转向率 (高速下稍微降低灵敏度以防失控)
      grip: 0.96,         // 抓地力
      driftGrip: 0.88,    // 漂移时的抓地力
      
      // 转向灵敏度曲线：高速时变硬 (High Speed Stability)
      steerSensitivity: { low: 1.2, high: 0.4, threshold: 80 },
      steerEnableSpeed: 2.0, // 只有动起来才能转弯

      // --- 物理系统 ---
      gravity: 70,        // 重力加强 (原 40) -> 高速贴地更稳
      rideHeight: 1.3,    // 悬挂高度
      groundSnap: 8.0,    // 地面吸附距离
      rayStartHeight: 10.0, // 射线发射高度
      
      groundSnapResponse: 28,
      groundNormalResponse: 18,
      gripResponse: 15,
      alignResponse: 10,
      airDrag: 0.15,      // 空气阻力减小 (飞跃时更远)
      handbrakeDrag: 2.5,
      maxDt: 0.05,

      // --- 特效参数 ---
      particleRate: 0.02, // 喷射频率 (数值越小越密)
      skidWidth: 0.3,     // 刹车印宽度
      wheelOffsetZ: 1.2,  // 后轮距中心 Z 轴距离 (用于生成刹车印/尾焰)
      wheelOffsetX: 0.8,  // 后轮距中心 X 轴距离

      // --- 氮气系统 ---
      nitroCapacity: 100,
      nitroStart: 0,
      nitroChargeRate: 70,
      nitroMinDriftSpeed: 14,
      nitroUseRate: 42,
      nitroBoostAccel: 90,
      nitroMaxSpeedBonus: 32,

      // --- 调试 ---
      debug: false,

      ...tuning,
    };

    // 特效系统数据容器
    this.fx = {
      particles: [],
      skidMarks: [],
      currentSkid: null,
      lastParticleTime: 0,
    };

    // 特效根节点
    this.fxRoot = new THREE.Object3D();
    this.fxRoot.name = 'CarVFX';
    if (carRoot?.parent) {
      carRoot.parent.add(this.fxRoot);
    }

    // 调试辅助
    if (this.tuning.debug) {
      this._createDebugHelper();
    }
  }

  // =========================
  // 路面获取 (Robust Road Finding)
  // =========================

  _collectRoadMeshesFrom(obj, out) {
    if (!obj) return;
    obj.traverse((child) => {
      // 匹配所有名为 RoadChunk_ 开头的 Mesh
      if (child?.name && child.name.startsWith('RoadChunk_') && child.isMesh) {
        out.push(child);
      }
    });
  }

  _flattenColliderMeshes(colliders) {
    const meshes = [];
    if (!colliders || colliders.length === 0) return meshes;

    for (const c of colliders) {
      if (!c) continue;
      // 如果直接就是 Mesh
      if (c.isMesh) {
        meshes.push(c);
        continue;
      }
      // 如果是 Object3D/Group，递归查找
      if (c.traverse) {
        this._collectRoadMeshesFrom(c, meshes);
      }
    }
    return meshes;
  }

  // 动态获取路面网格：优先级 colliders -> trackRoot -> scene
  _getRoadMeshes() {
    // 1) 优先使用显式传入的 colliders
    const fromColliders = this._flattenColliderMeshes(this.colliders);
    if (fromColliders.length > 0) return fromColliders;

    // 2) 其次从 trackRoot 查找 (推荐)
    if (this.trackRoot) {
      const roadMeshes = [];
      this._collectRoadMeshesFrom(this.trackRoot, roadMeshes);
      if (roadMeshes.length > 0) return roadMeshes;
    }

    // 3) 最后尝试从 carRoot.parent (即 Scene) 查找
    if (this.carRoot?.parent) {
      const roadMeshes = [];
      this._collectRoadMeshesFrom(this.carRoot.parent, roadMeshes);
      if (roadMeshes.length > 0) return roadMeshes;
    }

    if (this.tuning.debug) console.warn('⚠️ CarController: 找不到路面网格!');
    return [];
  }

  // =========================
  // 生命周期 API
  // =========================

  reset(spawnPos, spawnYaw) {
    const { tuning } = this;

    this.state.pos.copy(spawnPos);
    this.state.pos.y += (tuning.rideHeight + 0.5);

    this.state.heading = spawnYaw ?? 0;
    this.state.speed = 0;
    this.state.velocity.set(0, 0, 0);
    this.state.onGround = false; 
    this.state.groundNormal.set(0, 1, 0);
    this.state.isDrifting = false;
    this.state.driftFactor = 0;
    this.state.nitro = clamp(tuning.nitroStart ?? 0, 0, tuning.nitroCapacity);
    this.state.nitroActive = false;
    this.state.nitroCharging = false;

    this._clearEffects();

    if (this.carRoot) {
      this.carRoot.position.copy(this.state.pos);
      this.carRoot.rotation.set(0, 0, 0);
      this.carRoot.rotation.y = this.state.heading;
    }

    // 立即做一次贴地，避免出生悬空
    this._handleRaycastGroundSnap(true);

    if (this.tuning.debug) {
      console.log('🚗 车辆重置:', {
        pos: this.state.pos.toArray().map(n => Number(n.toFixed(2))),
        yawDeg: Number((this.state.heading * 180 / Math.PI).toFixed(1))
      });
    }
  }

  step(dt, input) {
    const { tuning, state } = this;

    dt = clamp(dt ?? 0, 0, tuning.maxDt);
    if (dt <= 0) return;

    const throttle = clamp(input?.throttle ?? 0, -1, 1);
    const steer = clamp(input?.steer ?? 0, -1, 1);
    const handbrake = !!input?.handbrake;
    const wantsNitro = !!input?.nitro;
    state.nitroActive = false;
    state.nitroCharging = false;

    // --- 1. 动力系统 ---
    if (throttle >= 0) {
      state.speed += tuning.accel * throttle * dt;
    } else {
      // 刹车/倒车
      state.speed += tuning.brake * throttle * dt; 
    }

    // 自然阻力
    state.speed -= state.speed * tuning.drag * dt;
    // 手刹阻力
    if (handbrake) state.speed *= Math.exp(-tuning.handbrakeDrag * dt);

    const canUseNitro =
      wantsNitro &&
      state.nitro > 0 &&
      throttle > 0;

    if (canUseNitro) {
      state.nitroActive = true;
      state.nitro = clamp(state.nitro - tuning.nitroUseRate * dt, 0, tuning.nitroCapacity);
      if (state.speed < 0) state.speed = 0;
      state.speed += tuning.nitroBoostAccel * (0.7 + throttle * 0.3) * dt;
      if (!state.onGround) {
        state.velocity.addScaledVector(this.getForward(new THREE.Vector3()), tuning.nitroBoostAccel * 0.65 * dt);
      }
    }

    // 速度限制
    const maxForwardSpeed = tuning.maxSpeed + (state.nitroActive ? tuning.nitroMaxSpeedBonus : 0);
    state.speed = clamp(state.speed, -tuning.reverseSpeed, maxForwardSpeed);
    if (state.nitro <= 0) state.nitroActive = false;

    // --- 2. 转向系统 ---
    // 计算当前转向灵敏度
    const speedRatio = clamp(Math.abs(state.speed) / tuning.steerSensitivity.threshold, 0, 1);
    const sensitivity = lerp(tuning.steerSensitivity.low, tuning.steerSensitivity.high, speedRatio);
    
    // 速度太低时不转向
    const steerEnable = clamp(Math.abs(state.speed) / tuning.steerEnableSpeed, 0, 1);
    // 倒车反向
    const reverseMult = state.speed < 0 ? -1 : 1;

    state.heading -= steer * tuning.turnRate * sensitivity * dt * steerEnable * reverseMult;

    // --- 3. 运动学 & 漂移 ---
    if (state.onGround) {
      const forwardX = Math.sin(state.heading);
      const forwardZ = Math.cos(state.heading);

      // 目标速度矢量
      const targetVelX = forwardX * state.speed;
      const targetVelZ = forwardZ * state.speed;

      // 计算侧向速度 (侧滑程度)
      const lateralVel = Math.abs(state.velocity.x * forwardZ - state.velocity.z * forwardX);
      
      // 侧滑阈值判断 (高速下稍微放宽阈值)
      const isSlip = lateralVel > 8.0 || handbrake; 

      // 漂移因子过渡
      const targetDrift = isSlip ? 1.0 : 0.0;
      state.driftFactor = lerp(state.driftFactor, targetDrift, dt * 5);
      state.isDrifting = state.driftFactor > 0.1;
      this._updateNitroCharge(dt);

      // 动态抓地力
      const dynamicGrip = lerp(tuning.grip, tuning.driftGrip, state.driftFactor);
      const t = 1 - Math.exp(-tuning.gripResponse * dynamicGrip * dt);

      // 速度融合
      state.velocity.x = lerp(state.velocity.x, targetVelX, t);
      state.velocity.z = lerp(state.velocity.z, targetVelZ, t);
      state.velocity.y = 0;
    } else {
      // 空中状态
      const airMul = Math.exp(-tuning.airDrag * dt);
      state.velocity.x *= airMul;
      state.velocity.z *= airMul;
      state.velocity.y -= tuning.gravity * dt; // 重力下落
      state.isDrifting = false;
      state.driftFactor = 0;
      state.nitroCharging = false;
    }

    // --- 4. 积分位移 ---
    state.pos.x += state.velocity.x * dt;
    state.pos.z += state.velocity.z * dt;
    state.pos.y += state.velocity.y * dt;

    // --- 5. 贴地检测 ---
    this._lastStepDt = dt;
    this._handleRaycastGroundSnap();

    // --- 6. 更新特效 ---
    this._updateEffects(dt, throttle);

    // --- 7. 更新调试 ---
    if (this.tuning.debug && this._debugHelper) {
      this._updateDebugHelper();
    }
  }

  getNitroState() {
    const capacity = Math.max(1, this.tuning.nitroCapacity || 100);
    return {
      level: Math.round(this.state.nitro),
      capacity,
      ratio: clamp(this.state.nitro / capacity, 0, 1),
      active: !!this.state.nitroActive,
      charging: !!this.state.nitroCharging,
    };
  }

  addNitro(amount = 0) {
    const capacity = Math.max(1, this.tuning.nitroCapacity || 100);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return this.state.nitro;
    this.state.nitro = clamp(this.state.nitro + value, 0, capacity);
    return this.state.nitro;
  }

  _updateNitroCharge(dt) {
    const { state, tuning } = this;
    if (state.nitroActive) return;

    const driftStrength = clamp((state.driftFactor - 0.25) / 0.75, 0, 1);
    const fastEnough = Math.abs(state.speed) >= tuning.nitroMinDriftSpeed;
    if (!state.onGround || !fastEnough || driftStrength <= 0 || state.nitro >= tuning.nitroCapacity) {
      return;
    }

    state.nitroCharging = true;
    state.nitro = clamp(
      state.nitro + tuning.nitroChargeRate * driftStrength * dt,
      0,
      tuning.nitroCapacity
    );
  }

  // =========================
  // 贴地检测 (Ground Snap)
  // =========================

  _handleRaycastGroundSnap(immediate = false) {
    const { tuning, state } = this;

    // 射线起点：车顶上方
    this._rayOrigin.copy(state.pos);
    this._rayOrigin.y += tuning.rayStartHeight;

    this._raycaster.set(this._rayOrigin, this._rayDown);
    this._raycaster.near = 0;
    this._raycaster.far = tuning.rayStartHeight + tuning.groundSnap;

    // 获取路面
    const roadMeshes = this._getRoadMeshes();

    if (roadMeshes.length === 0) {
      state.onGround = false;
      state.groundNormal.copy(this._up);
      return;
    }

    const intersects = this._raycaster.intersectObjects(roadMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const chassisToGround = hit.distance - tuning.rayStartHeight;

      if (chassisToGround <= tuning.groundSnap) {
        const wasOnGround = state.onGround;
        state.onGround = true;

        // 强行贴地：设置 Y 坐标
        const dt = clamp(this._lastStepDt ?? (1 / 60), 0, tuning.maxDt);
        const targetY = hit.point.y + tuning.rideHeight;
        const snapT = 1 - Math.exp(-(tuning.groundSnapResponse ?? 28) * dt);
        const jump = Math.abs(targetY - state.pos.y);
        if (immediate || !wasOnGround || jump > tuning.groundSnap * 0.65) {
          state.pos.y = targetY;
        } else {
          state.pos.y = lerp(state.pos.y, targetY, snapT);
        }
        state.velocity.y = 0;

        // 获取法线
        const faceNormal = hit.face?.normal;
        if (faceNormal) {
          this._normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          this._targetGroundNormal.copy(faceNormal).applyMatrix3(this._normalMatrix).normalize();
        } else {
          this._targetGroundNormal.copy(this._up);
        }
        if (immediate || !wasOnGround) {
          state.groundNormal.copy(this._targetGroundNormal);
        } else {
          const normalT = 1 - Math.exp(-(tuning.groundNormalResponse ?? 18) * dt);
          state.groundNormal.lerp(this._targetGroundNormal, normalT).normalize();
        }
        return;
      }
    }

    // 未命中或距离太远 -> 腾空
    state.onGround = false;
    state.groundNormal.copy(this._up);
  }

  // =========================
  // ✨ 特效系统 (VFX System)
  // =========================

  /**
   * 创建粒子光晕贴图 (Canvas 2D)
   * 效果：中心亮白 -> 中间青色 -> 边缘紫色 -> 透明
   */
  _createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // 径向渐变
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');     // 核心：亮白
    grad.addColorStop(0.2, 'rgba(0, 255, 255, 0.9)');   // 内圈：青色 (Neon Cyan)
    grad.addColorStop(0.5, 'rgba(180, 0, 255, 0.5)');   // 外圈：紫色 (Neon Purple)
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');           // 边缘：透明
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; // 确保在后处理中颜色正确
    return tex;
  }

  _updateEffects(dt, throttle) {
    if (!this.fxRoot.parent && this.carRoot?.parent) {
      this.carRoot.parent.add(this.fxRoot);
    }

    this._updateParticles(dt, throttle);
    this._updateSkidMarks(dt);
  }

  _updateParticles(dt, throttle) {
    const { state, tuning, fx } = this;

    fx.lastParticleTime += dt;
    
    // 喷射条件：油门踩下 + 速度 > 10 + 间隔满足
    const particleRate = state.nitroActive ? tuning.particleRate * 0.45 : tuning.particleRate;
    if (throttle > 0.5 && state.speed > 10 && fx.lastParticleTime > particleRate) {
      fx.lastParticleTime = 0;
      // 双管齐下，喷射两次增加密度
      this._spawnExhaustParticle();
      this._spawnExhaustParticle();
      if (state.nitroActive) {
        this._spawnExhaustParticle();
        this._spawnExhaustParticle();
      }
    }

    // 更新现有粒子
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        // 销毁
        this.fxRoot.remove(p.mesh);
        p.mesh.material.dispose(); 
        fx.particles.splice(i, 1);
      } else {
        // 运动
        p.mesh.position.addScaledVector(p.vel, dt);
        
        // --- 核心动画美化 ---
        const progress = 1.0 - (p.life / p.maxLife); // 0 (生) -> 1 (死)
        
        // 1. 变大动画：从 0.5 倍长到 2.5 倍
        const scale = 0.5 + progress * 2.0;
        p.mesh.scale.set(scale, scale, 1);

        // 2. 透明度淡出：随生命周期线性减少
        p.mesh.material.opacity = (p.life / p.maxLife);
      }
    }
  }

  _spawnExhaustParticle() {
    // 使用虚拟对象定位车尾
    const dummy = this._dummyObj;
    dummy.position.copy(this.state.pos);
    dummy.rotation.set(0, this.state.heading, 0);

    // 适配车身坡度
    if (this.state.groundNormal.distanceToSquared(this._up) > 0.0001) {
      const align = new THREE.Quaternion().setFromUnitVectors(this._up, this.state.groundNormal);
      dummy.quaternion.premultiply(align);
    }
    dummy.updateMatrix();

    // 定义排气管位置 (在车尾左右两侧)
    const offsets = [
      new THREE.Vector3(-0.4, 0.4, 2.3), // 左排气管
      new THREE.Vector3(0.4, 0.4, 2.3),  // 右排气管
    ];

    // 随机选一个出口
    const offset = offsets[Math.floor(Math.random() * offsets.length)];
    const worldPos = offset.clone().applyMatrix4(dummy.matrix);

    // ★ 使用 SpriteMaterial 实现自发光效果
    const mat = new THREE.SpriteMaterial({
      map: this._particleTexture,
      color: this.state.nitroActive ? 0x7df9ff : 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending, // 关键：叠加混合模式，越叠越亮
      depthWrite: false, // 不写入深度，避免遮挡
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(worldPos);
    const baseScale = this.state.nitroActive ? 0.95 : 0.6;
    sprite.scale.set(baseScale, baseScale, 1); // 初始大小

    // 计算喷射速度
    const forward = this.getForward(new THREE.Vector3());
    
    // 粒子初速度 = (车速 * 0.8) [惯性] + (向后喷射 * 随机值)
    const vel = forward.clone().multiplyScalar(this.state.speed * 0.8); 
    const ejectionPower = this.state.nitroActive ? 18 : 5;
    const ejectionSpread = this.state.nitroActive ? 16 : 8;
    const ejection = forward.clone().multiplyScalar(-ejectionPower - Math.random() * ejectionSpread); // 向后猛喷
    vel.add(ejection);
    
    // 增加随机散布 (Turbulence)
    vel.x += (Math.random() - 0.5) * 2.5;
    vel.y += (Math.random() - 0.5) * 2.5;
    vel.y += 0.5; // 稍微有热气上浮

    this.fxRoot.add(sprite);
    
    // 随机寿命
    const life = 0.3 + Math.random() * 0.4;
    this.fx.particles.push({ mesh: sprite, vel, life, maxLife: life });
  }

  _updateSkidMarks(dt) {
    const { state, tuning, fx } = this;

    // 触发条件：在地面 + 正在漂移
    const shouldSkid = state.onGround && state.driftFactor > 0.3;

    if (shouldSkid) {
      const dummy = this._dummyObj;
      dummy.position.copy(this.state.pos);
      dummy.rotation.set(0, state.heading, 0);

      if (state.groundNormal.distanceToSquared(this._up) > 0.0001) {
        dummy.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(this._up, state.groundNormal));
      }
      dummy.updateMatrix();

      // 后轮接触点
      const p1 = new THREE.Vector3(-tuning.wheelOffsetX, 0.05, tuning.wheelOffsetZ).applyMatrix4(dummy.matrix);
      const p2 = new THREE.Vector3(tuning.wheelOffsetX, 0.05, tuning.wheelOffsetZ).applyMatrix4(dummy.matrix);

      // 如果还没有当前的刹车印，新建一条
      if (!fx.currentSkid) {
        fx.currentSkid = this._createSkidMesh();
        this.fxRoot.add(fx.currentSkid.mesh);
        fx.skidMarks.push(fx.currentSkid);
      }

      // 添加顶点
      this._appendSkidPoint(fx.currentSkid, p1, p2);
    } else {
      // 停止漂移，断开当前刹车印
      fx.currentSkid = null;
    }

    // 更新刹车印淡出
    for (let i = fx.skidMarks.length - 1; i >= 0; i--) {
      const mark = fx.skidMarks[i];
      if (mark === fx.currentSkid) continue; // 当前正在画的不淡出

      mark.life -= dt;
      if (mark.life <= 0) {
        this.fxRoot.remove(mark.mesh);
        mark.mesh.geometry.dispose();
        mark.mesh.material.dispose();
        fx.skidMarks.splice(i, 1);
      } else {
        mark.mesh.material.opacity = (mark.life / mark.maxLife) * 0.4;
      }
    }
  }

  _createSkidMesh() {
    const geometry = new THREE.BufferGeometry();
    // 预分配缓冲区？这里简化为动态扩展 (ThreeJS 会自动处理)
    // 初始空数组
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));

    const material = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false, // 防止 z-fighting
    });

    return {
      mesh: new THREE.Mesh(geometry, material),
      points: [],
      life: 5.0,
      maxLife: 5.0,
    };
  }

  _appendSkidPoint(skid, p1, p2) {
    skid.points.push(p1.clone(), p2.clone());
    
    // 至少两个横截面 (4个点) 才能画出面
    if (skid.points.length < 4) return;

    const pts = skid.points;
    const verts = [];

    // 重新构建整个 Mesh (简化版，性能足够)
    for (let k = 0; k < pts.length - 2; k += 2) {
      const v0 = pts[k];
      const v1 = pts[k + 1];
      const v2 = pts[k + 2];
      const v3 = pts[k + 3];
      if (!v2 || !v3) break;

      // 两个三角形组成矩形
      // Tri 1
      verts.push(v0.x, v0.y, v0.z);
      verts.push(v1.x, v1.y, v1.z);
      verts.push(v2.x, v2.y, v2.z);

      // Tri 2
      verts.push(v1.x, v1.y, v1.z);
      verts.push(v3.x, v3.y, v3.z);
      verts.push(v2.x, v2.y, v2.z);
    }

    const geo = skid.mesh.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
  }

  _clearEffects() {
    if (!this.fxRoot) return;

    this.fx.particles.forEach((p) => {
      this.fxRoot.remove(p.mesh);
      p.mesh.material.dispose();
    });
    this.fx.particles = [];

    this.fx.skidMarks.forEach((s) => {
      this.fxRoot.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    });
    this.fx.skidMarks = [];
    this.fx.currentSkid = null;
  }

  // =========================
  // 调试辅助 (Debug)
  // =========================

  _createDebugHelper() {
    if (!this.carRoot || !this.carRoot.parent) return;

    this._debugHelper = {
      ray: new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(),
        10,
        0xff0000
      ),
    };

    this.carRoot.parent.add(this._debugHelper.ray);
  }

  _updateDebugHelper() {
    if (!this._debugHelper) return;

    const { ray } = this._debugHelper;
    const { tuning, state } = this;

    ray.position.copy(state.pos);
    ray.position.y += tuning.rayStartHeight;
    ray.setLength(tuning.rayStartHeight + tuning.groundSnap);
    ray.setColor(state.onGround ? 0x00ff00 : 0xff0000);
  }

  // =========================
  // 公共工具 (Utils)
  // =========================

  getForward(out = new THREE.Vector3()) {
    out.set(Math.sin(this.state.heading), 0, Math.cos(this.state.heading));
    return out;
  }

  /**
   * 将物理状态应用到 3D 模型
   * 包含平滑插值，消除抖动
   */
  applyToObject3D(dt = 1 / 60) {
    if (!this.carRoot) return;

    this.carRoot.position.copy(this.state.pos);

    // 基础朝向 (Yaw)
    this._dummyObj.rotation.set(0, this.state.heading, 0);
    this._dummyObj.updateMatrix();
    this._baseQuat.copy(this._dummyObj.quaternion);

    // 坡度适配 (Pitch/Roll)
    if (this.state.groundNormal.distanceToSquared(this._up) > 0.0001) {
      this._alignQuat.setFromUnitVectors(this._up, this.state.groundNormal);
      this._baseQuat.premultiply(this._alignQuat);
    }

    dt = clamp(dt ?? (1 / 60), 0, this.tuning.maxDt);
    // 姿态平滑系数
    const t = 1 - Math.exp(-this.tuning.alignResponse * dt);

    this.carRoot.quaternion.slerp(this._baseQuat, t);
  }
}

// =========================
// Helpers
// =========================
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
