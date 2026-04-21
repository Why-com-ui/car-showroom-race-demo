# Track Contract (Three.js)

每个赛道模块必须导出：

```js
export function createTrack(THREE, opts) {
  return {
    root: Object3D,  // 整个赛道(道路/护栏/灯光/装饰)，添加进 scene
    spawn: {
      position: new THREE.Vector3(x,y,z),
      yaw: number // 车辆初始朝向（绕Y轴）
    },
    checkpoints: Array<{
      center: new THREE.Vector3(x,y,z),
      radius: number
    }>,
    bounds: {
      // 必须：有符号距离函数：<0 在赛道内，>0 在赛道外
      fn: (x, z) => number,

      // 可选：如果你能给出更好的“拉回赛道”方式（推荐）
      clampPosition?: (posVec3, margin) => void
    }
  }
}
```说明

checkpoints 必须按赛道顺序排列，至少 6 个。

bounds.fn(x,z) 返回：负值表示在赛道可行驶区域内；正值表示出界，数值越大离赛道越远。

clampPosition(pos, margin) 可选：用于 RaceState 里出界时把车“拉回”赛道边缘。'''



