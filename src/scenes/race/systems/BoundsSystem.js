// src/scenes/race/systems/BoundsSystem.js

/**
 * 赛道边界限制/重置
 *
 * trackData.bounds.fn(x, z, pos3D?): number
 * - <0 inside
 * - >0 outside
 *
 * trackData.bounds.clampPosition(pos, margin) 可选：
 * - 用于把 pos 拉回赛道边界内
 */
export class BoundsSystem {
  /**
   * @param {object} opts
   * @param {{bounds:{fn:(x:number,z:number,p?:any)=>number, clampPosition?:(pos,margin)=>void}, spawn:{position, yaw}}} opts.trackData
   * @param {object} [opts.params]
   */
  constructor({ trackData, params = {} }) {
    this.trackData = trackData;

    this.params = {
      margin: 0.35,
      speedMulWhenOut: 0.4, // 出界时速度乘数
      ...params,
    };
  }

  /**
   * @param {{pos:any, speed:number}} carStateOrControllerState
   * 需要有 pos(Vector3) 与 speed 字段
   */
  enforce(carStateOrControllerState) {
    const b = this.trackData?.bounds;
    if (!b?.fn) return { out: false, distance: 0 };

    const pos = carStateOrControllerState.pos;

    // 修复 Bug：传入完整的 pos 对象作为第三参数
    // 这样 3D 赛道（Track_NeonSpline）可以使用 pos.y 或 3D 距离公式
    const d = b.fn(pos.x, pos.z, pos);

    if (d > 0) {
      // 出界：减速 + 拉回
      if (typeof carStateOrControllerState.speed === 'number') {
        carStateOrControllerState.speed *= this.params.speedMulWhenOut;
      }

      if (typeof b.clampPosition === 'function') {
        b.clampPosition(pos, this.params.margin);
      }

      return { out: true, distance: d };
    }

    return { out: false, distance: d };
  }

  /**
   * 直接重置到 spawn
   * @param {{pos:any, yaw:number, speed:number}} carState
   */
  resetToSpawn(carState) {
    const sp = this.trackData?.spawn;
    if (!sp) return;

    // 修复 Bug：必须使用 sp.position.y，不能写死 0
    // 否则在过山车赛道（起点在半空）重置时会掉下去
    carState.pos.set(sp.position.x, sp.position.y, sp.position.z);
    carState.yaw = sp.yaw ?? 0;
    carState.speed = 0;
  }
}