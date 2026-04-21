// src/scenes/race/systems/AIController.js
import * as THREE from 'three';
import { CarController } from './CarController.js';

/**
 * 工业级 PID 控制器 (Proportional-Integral-Derivative)
 * 用于平滑且精准的转向控制
 */
class PIDController {
  constructor(kp, ki, kd) {
    this.kp = kp; // 比例: 响应当前误差
    this.ki = ki; // 积分: 消除稳态误差
    this.kd = kd; // 微分: 预测趋势，抑制震荡
    this.prevError = 0;
    this.integral = 0;
  }

  update(error, dt) {
    if (dt <= 0) return 0;
    // 积分限幅，防止积分饱和 (Windup)
    this.integral = THREE.MathUtils.clamp(this.integral + error * dt, -1.0, 1.0);
    
    const derivative = (error - this.prevError) / dt;
    this.prevError = error;
    
    return this.kp * error + this.ki * this.integral + this.kd * derivative;
  }
  
  reset() {
    this.prevError = 0;
    this.integral = 0;
  }
}

/**
 * 旗舰级 AI 控制器 (Ultimate Edition)
 * 特性：
 * 1. [Void Lock] 视界锁：防止 AI 跑出赛道生成范围
 * 2. [Body Contact] 实体碰撞：与玩家的物理交互
 * 3. [God Grip] 动态抓地力：高速过弯不推头
 * 4. [Aggression] 攻击性：主动挤压玩家
 * 5. [Start Grace] 起步保护：防止起步瞬间撞击玩家
 * 6. [Shadow Step] 影步：落后太远时自动瞬移至玩家身后
 */
export class AIController extends CarController {
  constructor(opts) {
    // 1. 基础物理重写：给予 AI 远超玩家的物理潜能
    const godTuning = {
      ...opts.tuning,
      grip: 4.0,           // 基础抓地力极高
      driftGrip: 3.5,      // 漂移几乎不损失速度
      turnRate: 5.0,       // 转向极快
      
      // ★ 修改点 1：大幅提升加速能力和极速，确保能跑赢玩家的 380
      accel: 120,          // 加速由 100 -> 120
      maxSpeed: 400,       // 极速由 (必须大于玩家的 380)

      drag: 0.5,           // 低阻力
      airDrag: 0.05,       // 空中飞得更远
    };

    super({ ...opts, tuning: godTuning });
    
    this.trackData = opts.trackData; 

    // 2. 行为配置
    this.aiConfig = {
      // 感知
      lookAheadBase: 25.0,    // 基础视距
      lookAheadSpeedMult: 0.4,// 速度对视距的影响系数
      
      // 操控 (PID)
      steerKp: 0.12,
      steerKi: 0.00,
      steerKd: 0.25, // 高阻尼，防止高速画龙
      
      // 动态难度 (Rubber Banding)
      rubberBandDist: 80,     
      catchUpPower: 2.2,      // ★ 修改点 2：略微提升最大追赶倍率 (2.0 -> 2.2)
      waitPower: 0.6,         // 领先太远时的动力倍率
      
      // 视界限制 (防止跑出赛道)
      horizonLimit: 100,      // AI 绝不允许超过玩家前方 100 米
      maxLagDistance: 80,     // 最大落后距离，超过则瞬移
      
      // 碰撞
      collisionRadius: 2.2,   // 碰撞半径
      collisionPush: 15.0,    // 碰撞弹开力度

      // 起步保护 (秒)
      startGraceTime: 2.5,    // 起步前2.5秒不乱变道
      
      ...opts.aiConfig
    };

    // 状态
    this._currentLaneOffset = 0;
    this._targetLaneOffset = 0;
    this._laneTimer = 0;
    this._startTimer = 0; // 起步计时器
    this._bias = (Math.random() - 0.5) * 1.5; // 性格偏差
    
    this._steerPID = new PIDController(this.aiConfig.steerKp, this.aiConfig.steerKi, this.aiConfig.steerKd);
  }

  updateAI(dt, playerState) {
    if (!this.trackData) return;
    // 限制 dt 防止物理爆炸
    dt = Math.min(dt, 0.1);

    // ★ 更新起步计时器
    this._startTimer += dt;
    const isStarting = this._startTimer < this.aiConfig.startGraceTime;

    const aiState = this.state;
    const aiPos = aiState.pos;
    const playerPos = playerState.pos;

    // --- 0. 碰撞检测 (Body Contact) ---
    this._handleCollision(dt, playerState);

    // --- 1. 视界锁 & 掉队保护 (Void Lock & Shadow Step) ---
    const distDirect = aiPos.distanceTo(playerPos);
    const toAI = aiPos.clone().sub(playerPos);
    const forward = new THREE.Vector3(Math.sin(playerState.heading), 0, Math.cos(playerState.heading));
    const isAhead = toAI.dot(forward) > 0;

    let speedLimitMult = 1.0;

    // A. 防止跑太远 (领先重置)
    if (isAhead && distDirect > this.aiConfig.horizonLimit) {
      speedLimitMult = 0.0; // 强制勒马
      if (distDirect > this.aiConfig.horizonLimit + 100) {
        // 领先太远，重置到身后近处
        this._respawnBehindPlayer(playerState, 20, 0.9);
        return;
      }
    }

    // B. ★ 防止掉队 (落后重置)
    // 如果不在玩家前方，且距离超过阈值，强制瞬移上来
    if (!isAhead && distDirect > this.aiConfig.maxLagDistance) {
      // 传送到身后 40 米，且赋予 1.2 倍玩家速度，确保刚传送就能跟上节奏
      this._respawnBehindPlayer(playerState, 40, 1.2);
      return;
    }

    // --- 2. 赛道定位 ---
    const currentTrackPos = this._getTrackDataAt(aiPos);
    
    if (!currentTrackPos.valid) {
      // 飞出赛道自动回正
      const rescueSteer = (this._currentLaneOffset > 0) ? -1 : 1;
      this.step(dt, { throttle: 0.5, steer: rescueSteer });
      
      // 如果出界太久或太远，也触发重置
      if (distDirect > 100) {
         this._respawnBehindPlayer(playerState, 30, 1.1);
         return;
      }
      return;
    }

    // --- 3. 动态性能 (Rubber Banding) ---
    let performanceMult = 1.0;
    
    if (!isAhead) {
      // === 落后：疯狗追赶模式 ===
      
      // 1. 基础追赶：移除原有的 20m 门槛，只要落后就加速
      // 分母改为 60，意味着落后 60 米即达到最大追赶倍率 (catchUpPower)
      const stress = Math.min(distDirect / 60.0, 1.0); 
      performanceMult = 1.0 + (this.aiConfig.catchUpPower - 1.0) * stress;

      // 2. ★ 修改点 3：复仇爆发 (Revenge Boost)
      // 如果玩家刚刚超车（距离小于 15 米），给予额外的爆发速度，试图立即反超
      if (distDirect < 15.0) {
         performanceMult *= 1.25; // 额外增加 25% 的动力
      }

      // 起步阶段给予微量额外动力补偿，防止被玩家起步瞬间甩开
      if (isStarting) performanceMult *= 1.1;

    } else {
      // 领先：等待模式
      if (distDirect > 50) {
        const chillFactor = Math.min((distDirect - 50) / 200, 1.0);
        performanceMult = THREE.MathUtils.lerp(1.0, this.aiConfig.waitPower, chillFactor);
      }
    }
    
    performanceMult *= speedLimitMult;

    // --- 4. 智能走线 (Racing Line) ---
    // ★ 起步保护：保护期内不执行变道逻辑，保持当前直线行驶，避免侧撞玩家
    if (isStarting) {
      this._targetLaneOffset = this._currentLaneOffset;
    } else {
      this._updateRacingLine(dt, currentTrackPos);
    }
    
    // 平滑变道
    const laneSpeed = 1.5;
    this._currentLaneOffset += (this._targetLaneOffset - this._currentLaneOffset) * dt * laneSpeed;

    // --- 5. 预瞄与转向 ---
    const lookDist = this.aiConfig.lookAheadBase + Math.abs(aiState.speed) * this.aiConfig.lookAheadSpeedMult;
    const predictPos = aiPos.clone().addScaledVector(this.getForward(), lookDist);
    const targetData = this._getTrackDataAt(predictPos);
    
    let steerOutput = 0;
    let throttleOutput = 1.0;

    if (targetData.valid) {
      // 目标点：赛道中心 + 走线偏移
      const desiredPos = targetData.center.clone()
        .addScaledVector(targetData.binormal, this._currentLaneOffset);

      // 转为局部坐标，计算误差角度
      const localTarget = desiredPos.clone().sub(aiPos);
      localTarget.applyQuaternion(this.carRoot.quaternion.clone().invert());
      const angleError = Math.atan2(localTarget.x, localTarget.z);
      
      // PID 计算
      steerOutput = this._steerPID.update(-angleError, dt);
      steerOutput = THREE.MathUtils.clamp(steerOutput, -1, 1);

      // --- 6. 弯道速度控制 ---
      const curvature = 1.0 - Math.max(0, this.getForward().dot(targetData.forward));
      
      // 动态调整物理参数 (弯道作弊)
      if (aiState.speed > 50 && curvature > 0.05) {
         this.tuning.grip = 6.0;      
         this.tuning.driftGrip = 5.0; 
      } else {
         this.tuning.grip = 4.0;      
         this.tuning.driftGrip = 3.5;
      }

      // ★ 修改点 4：大幅提升直道安全速度上限
      // 原来是 lerp(350, ...) -> 现在改为 lerp(480, ...)
      // 这样直道上 AI 允许跑到 480 km/h，不再被锁死在 350
      const safeCornerSpeed = THREE.MathUtils.lerp(480, 140, Math.sqrt(curvature));
      
      const targetMaxSpeed = this.tuning.maxSpeed * performanceMult;
      const finalSpeedLimit = Math.min(targetMaxSpeed, safeCornerSpeed);
      const currentSpeedKmh = aiState.speed * 3.6;
      
      if (currentSpeedKmh > finalSpeedLimit) {
        throttleOutput = -1.0; 
      } else if (currentSpeedKmh > finalSpeedLimit * 0.95) {
        throttleOutput = 0.1;  
      } else {
        throttleOutput = 1.0 * performanceMult; 
      }

    } else {
      // 失去目标时，如果是掉头了，尝试重置
      throttleOutput = -1.0;
    }

    // --- 7. 边缘救车 (Safety Net) ---
    const roadHalfWidth = 18 / 2; 
    const margin = 2.5;
    if (Math.abs(currentTrackPos.lateral) > roadHalfWidth - margin) {
      const rescueDir = currentTrackPos.lateral > 0 ? -1 : 1;
      steerOutput = rescueDir * 1.0;
      throttleOutput = 0.5;
    }

    this.step(dt, {
      throttle: throttleOutput,
      steer: steerOutput,
      handbrake: false
    });
    
    this.applyToObject3D();
  }

  // 物理碰撞处理
  _handleCollision(dt, playerState) {
    const p1 = this.state.pos;
    const p2 = playerState.pos;
    
    const dx = p1.x - p2.x;
    const dz = p1.z - p2.z;
    const distSq = dx*dx + dz*dz;
    const radiusSum = this.aiConfig.collisionRadius * 2;
    
    if (distSq < radiusSum * radiusSum) {
      const dist = Math.sqrt(distSq);
      const overlap = radiusSum - dist;
      
      const nx = dx / dist;
      const nz = dz / dist;
      
      // 1. 位置修正
      const push = overlap * 0.5;
      p1.x += nx * push;
      p1.z += nz * push;
      p2.x -= nx * push;
      p2.z -= nz * push;
      
      // 2. 冲量
      const pushForce = this.aiConfig.collisionPush * dt;
      this.state.velocity.x += nx * pushForce;
      this.state.velocity.z += nz * pushForce;
      
      if (playerState.velocity) {
        playerState.velocity.x -= nx * pushForce * 0.8;
        playerState.velocity.z -= nz * pushForce * 0.8;
      }
      this.state.speed *= 0.98;
    }
  }

  _updateRacingLine(dt, trackPos) {
    this._laneTimer += dt;
    if (this._laneTimer > 2.0) {
      this._laneTimer = 0;
      
      const lookDist = 100;
      const futurePos = this.state.pos.clone().addScaledVector(this.getForward(), lookDist);
      const futureData = this._getTrackDataAt(futurePos);
      
      if (futureData.valid) {
        const curvature = trackPos.forward.x * futureData.forward.z - trackPos.forward.z * futureData.forward.x;
        
        if (Math.abs(curvature) > 0.1) {
          // 切弯策略：左转靠左(>0), 右转靠右(<0)
          // 假设 lateral > 0 是左侧 (视具体赛道坐标系)
          const cutFactor = -Math.sign(curvature) * 6.0; 
          this._targetLaneOffset = cutFactor;
        } else {
          // 直道晃动干扰玩家
          this._targetLaneOffset = (Math.random() - 0.5) * 6.0 + this._bias;
        }
      }
    }
  }

  /**
   * 强制将 AI 传送到玩家身后
   * @param {object} playerState 
   * @param {number} offsetDist 身后多少米
   * @param {number} speedMult 速度继承倍率 (建议 1.0~1.2，让 AI 刚传送完就能跟上甚至反超)
   */
  _respawnBehindPlayer(playerState, offsetDist, speedMult = 1.0) {
    const dist = offsetDist !== undefined ? offsetDist : this.aiConfig.respawnBehind;
    
    // ★ 改进：优先使用赛道方向，而不是玩家朝向，防止玩家横在路上导致 AI 复位出界
    let respawnDir = new THREE.Vector3(Math.sin(playerState.heading), 0, Math.cos(playerState.heading));
    
    // 尝试获取玩家位置的赛道切线
    const trackInfo = this._getTrackDataAt(playerState.pos);
    if (trackInfo.valid && trackInfo.forward) {
       respawnDir.copy(trackInfo.forward);
    }
    
    const targetPos = playerState.pos.clone().addScaledVector(respawnDir, -dist);
    targetPos.y = Math.max(targetPos.y, playerState.pos.y) + 2.0;

    // 让 AI 朝向赛道前方
    const respawnYaw = Math.atan2(respawnDir.x, respawnDir.z);

    this.reset(targetPos, respawnYaw);
    
    // ★ 关键：赋予 AI 速度，避免传送后静止再次被甩开
    // 基础速度至少 100km/h (28m/s)，或者玩家当前速度的 speedMult 倍
    const baseSpeed = Math.max(28, Math.abs(playerState.speed));
    const finalSpeed = baseSpeed * speedMult;
    
    this.state.speed = finalSpeed;
    this.state.velocity.copy(respawnDir).multiplyScalar(finalSpeed);
  }

  _getTrackDataAt(pos) {
    if (this.trackData && this.trackData.getClosest) {
      return this.trackData.getClosest(pos);
    }
    return { valid: false };
  }
}