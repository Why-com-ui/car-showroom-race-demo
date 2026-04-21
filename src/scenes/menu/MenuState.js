// src/scenes/menu/MenuState.js
import * as THREE from 'three';
import { STATES } from '../../core/constants.js';

/**
 * MenuState (光速跳跃版 - Warp Speed)
 * 使用 InstancedMesh 渲染大量被拉伸的线条，
 * 模拟星球大战中飞船进入超光速时的视觉效果。
 */
export function createMenuState(ctx) {
  const { app, ui } = ctx;

  let scene = null;
  let camera = null;
  let warpStars = null;

  // --- 配置参数 ---
  const STAR_COUNT = 3000;    // 星星数量
  const FIELD_DEPTH = 1500;   // 空间深度
  const BASE_SPEED = 8.0;     // 基础移动速度 (比之前慢，不晕)
  const STRETCH_FACTOR = 8.0; // 拉伸系数：数值越大，线条越长，速度感越强

  // 用于存储每颗星的状态
  const starData = []; 

  return {
    name: STATES.MENU,

    async enter() {
      ui?.setLayer?.('menu');

      scene = new THREE.Scene();
      // 纯黑深空背景，增加一点点雾来隐藏远处的生成突兀感
      scene.background = new THREE.Color(0x020005); 
      scene.fog = new THREE.FogExp2(0x020005, 0.0015);

      camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
      camera.position.set(0, 0, 10);
      // 相机看向深处
      camera.lookAt(0, 0, -100);

      // --- 1. 创建几何体：细长的长方体 ---
      // 默认长度为 1，稍后通过 scale.z 拉伸
      const geometry = new THREE.BoxGeometry(0.15, 0.15, 1.0);
      
      // 材质：高亮发光
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff, // 保持 UI 的酸性绿主题，或者用 0xffffff 白光
        transparent: true,
        opacity: 1
      });

      // --- 2. 使用 InstancedMesh 批量渲染 ---
      warpStars = new THREE.InstancedMesh(geometry, material, STAR_COUNT);
      // 设为 FrustumCulled = false 防止粒子在背后时整个系统闪烁（虽然这里一直向前飞一般没事）
      warpStars.frustumCulled = false; 
      scene.add(warpStars);

      // --- 3. 初始化位置 ---
      const dummy = new THREE.Object3D();
      
      for (let i = 0; i < STAR_COUNT; i++) {
        const x = (Math.random() - 0.5) * 1200; // 宽阔的视野
        const y = (Math.random() - 0.5) * 800;
        const z = -Math.random() * FIELD_DEPTH; // 初始随机分布在前方

        // 随机速度倍率 (0.5 ~ 1.5)
        const speedScale = 0.1 + Math.random(); 
        
        starData.push({ x, y, z, speedScale });

        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        warpStars.setMatrixAt(i, dummy.matrix);
      }
      warpStars.instanceMatrix.needsUpdate = true;

      app.setActive({
        scene,
        camera,
        update: (dt, t) => {
          // --- 4. 动画循环 ---
          // 稍微动态调整一点速度，模拟飞船引擎的不稳定脉冲 (呼吸感)
          const pulse = 1.0 + Math.sin(t * 2.0) * 0.2; 
          
          for (let i = 0; i < STAR_COUNT; i++) {
            const data = starData[i];
            
            // 移动位置
            const currentSpeed = BASE_SPEED * data.speedScale * pulse;
            data.z += currentSpeed * (dt * 60); // 简单的帧率补偿

            // 重置逻辑：如果飞到了相机后面 (z > 20)
            if (data.z > 20) {
              data.z = -FIELD_DEPTH;
              // 每次重置随机一下位置，避免重复图案
              data.x = (Math.random() - 0.5) * 1200;
              data.y = (Math.random() - 0.5) * 800;
            }

            // 更新矩阵
            dummy.position.set(data.x, data.y, data.z);
            
            // ★★★ 关键：光速跳跃效果 ★★★
            // 将 Z 轴缩放设置为与速度成正比
            // 速度越快，星星拉得越长
            const stretch = 1.0 + currentSpeed * STRETCH_FACTOR;
            dummy.scale.set(1, 1, stretch);
            
            dummy.updateMatrix();
            warpStars.setMatrixAt(i, dummy.matrix);
          }
          
          warpStars.instanceMatrix.needsUpdate = true;

          // 额外的：稍微旋转整个星系，增加迷幻感
          warpStars.rotation.z = Math.sin(t * 0.1) * 0.05;
        },
      });
    },

    async exit() {
      if (warpStars) {
        warpStars.geometry.dispose();
        warpStars.material.dispose();
      }
      scene = null;
      camera = null;
      app.setActive({ scene: null, camera: null, update: null });
    },
  };
}