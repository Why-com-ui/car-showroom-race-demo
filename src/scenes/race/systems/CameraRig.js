// src/scenes/race/systems/CameraRig.js
import * as THREE from 'three';

/**
 * 跟车/车头/俯视切换
 *
 * modes:
 * - 'CHASE'  跟车视角（默认）
 * - 'HOOD'   车头/近景
 * - 'TOP'    俯视
 *
 * 用法：
 * const camRig = new CameraRig({ camera, target: carRoot })
 * camRig.setMode('CHASE')
 * camRig.update(dt, { forward, speed }) // 传入 speed 以启用动态拉远效果
 */
export class CameraRig {
  /**
   * @param {object} opts
   * @param {THREE.PerspectiveCamera} opts.camera
   * @param {THREE.Object3D} opts.target
   * @param {object} [opts.params]
   */
  constructor({ camera, target, params = {} }) {
    this.camera = camera;
    this.target = target;

    this.mode = 'CHASE';

    this.params = {
      smoothing: 0.12,

      // --- CHASE 模式参数 ---
      chaseBack: 6.5,       // 基础跟车距离
      chaseUp: 4.5,         // 高度
      chaseLookUp: 1.5,     // 看向目标上方的高度

      // ★★★ 新增：动态镜头参数 ★★★
      chaseSpeedEffect: 0.04, // 速度系数：每 1m/s 速度，相机后退多少米 (建议 0.02 ~ 0.05)
      chaseMaxBack: 9,     // 最大后退限制 (防止速度极快时相机飞太远)

      // --- HOOD 模式参数 ---
      hoodBack: -0.2,       // 负数表示在车头前方
      hoodUp: 1.1,
      hoodLookAhead: 6.0,

      // --- TOP 模式参数 ---
      topUp: 18,
      topBack: 1.5,

      ...params,
    };

    this._tmpPos = new THREE.Vector3();
    this._tmpLook = new THREE.Vector3();
    this._tmpForward = new THREE.Vector3(0, 0, 1);
  }

  setMode(mode) {
    if (!mode) return;
    this.mode = mode;
  }

  toggleMode() {
    const order = ['CHASE', 'HOOD', 'TOP'];
    const idx = order.indexOf(this.mode);
    this.mode = order[(idx + 1) % order.length];
  }

  /**
   * @param {number} dt
   * @param {object} info
   * @param {THREE.Vector3} [info.forward] 车辆朝向（单位向量）
   * @param {number} [info.speed] 车辆速度（m/s），用于动态调整镜头距离
   */
  update(dt, info = {}) {
    if (!this.camera || !this.target) return;

    const targetPos = this.target.position;
    const forward = info.forward ? info.forward : this._tmpForward;
    
    // ★★★ 获取传入的速度，默认为 0 ★★★
    const speed = info.speed || 0;

    // 计算不同模式下的相机目标位置、lookAt 目标
    if (this.mode === 'CHASE') {
      // 在车后上方
      
      // ★★★ 修改开始：计算动态距离 ★★★
      // 1. 计算由速度产生的额外距离 (取绝对值，倒车也拉远)
      // 使用可选链和空值合并，确保参数存在
      const speedFactor = this.params.chaseSpeedEffect ?? 0;
      const maxBack = this.params.chaseMaxBack ?? 100;
      
      const extraDist = Math.abs(speed) * speedFactor;
      
      // 2. 计算最终距离：基础距离 + 额外距离，但不超过最大限制
      const currentBack = Math.min(
        this.params.chaseBack + extraDist, 
        maxBack
      );

      // 3. 应用距离
      const back = forward.clone().multiplyScalar(-currentBack);
      // ★★★ 修改结束 ★★★

      this._tmpPos.copy(targetPos).add(back).add(new THREE.Vector3(0, this.params.chaseUp, 0));
      this._tmpLook.copy(targetPos).add(new THREE.Vector3(0, this.params.chaseLookUp, 0));

    } else if (this.mode === 'HOOD') {
      // 车头近景：略靠前，向前看
      // hoodBack 是负数表示“向前”
      const back = forward.clone().multiplyScalar(this.params.hoodBack); 
      this._tmpPos.copy(targetPos).add(back).add(new THREE.Vector3(0, this.params.hoodUp, 0));
      this._tmpLook.copy(targetPos).add(forward.clone().multiplyScalar(this.params.hoodLookAhead)).add(new THREE.Vector3(0, 1.0, 0));

    } else {
      // TOP 俯视
      const back = forward.clone().multiplyScalar(-this.params.topBack);
      this._tmpPos.copy(targetPos).add(back).add(new THREE.Vector3(0, this.params.topUp, 0));
      this._tmpLook.copy(targetPos);
    }

    // 平滑跟随
    this.camera.position.lerp(this._tmpPos, this.params.smoothing);
    this.camera.lookAt(this._tmpLook);
  }
}