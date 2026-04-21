// src/scenes/race/systems/ScoreSystem.js
import * as THREE from 'three';

export class ScoreSystem {
  constructor({ trackData }) {
    this.trackData = trackData;
    this.score = 0;
    this.distance = 0;
    
    // 碰撞检测半径
    this.collectRadius = 2.5; 

    // 用于记录上一帧位置，计算实际位移
    this.lastPos = null;
  }

  update(dt, carPos) {
    // 1. 初始化上一帧位置 (如果是第一帧)
    if (!this.lastPos) {
      this.lastPos = carPos.clone();
      return; // 第一帧没有位移，直接返回
    }

    // 2. 计算实际移动距离 (Dist)
    // distanceTo 计算两点间的 3D 距离
    const moveDist = carPos.distanceTo(this.lastPos);
    
    // 只有车动了，distance 才会增加
    this.distance += moveDist;

    // 3. 更新分数 (Score)
    // 修改：移动不再增加分数，分数仅由金币决定
    // this.score += moveDist; 

    // ★ 更新上一帧位置，供下一次计算使用
    this.lastPos.copy(carPos);

    // 4. 吃金币逻辑 (原有逻辑保持不变)
    // 从 trackData 获取当前所有金币
    if (this.trackData.getInteractables) {
      const items = this.trackData.getInteractables();
      
      for (const item of items) {
        // 只检测还存在的金币
        if (item.userData.active) {
          const d = carPos.distanceTo(item.position);
          
          if (d < this.collectRadius) {
            // ★ 吃掉逻辑！
            
            // A. 如果是高性能 Instanced 对象 (Track_NeonSpline)，调用专用 hide 方法
            if (item.hide) {
              item.hide(); 
            } 
            // B. 如果是普通 Mesh (兼容老赛道)，直接隐藏
            else {
              item.visible = false;
            }
            
            // 标记逻辑状态为已消耗
            item.userData.active = false;
            
            // 加分 (金币分值通常较大，比如 100)
            this.score += item.userData.value || 100;
            
            // console.log("Coin collected! Score:", Math.floor(this.score));
          }
        }
      }

      // 5. 旋转动画 (适配 Instancing)
      items.forEach(item => {
        // 只旋转还活跃的金币
        if (item.userData.active) {
           item.rotation.y += dt * 3;
           
           // ★ 关键适配：如果是 InstancedMesh，必须手动触发矩阵更新
           if (item.updateVisual) {
             item.updateVisual();
           }
        }
      });
    }
  }

  getDisplayData() {
    return {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance) + 'm'
    };
  }
}