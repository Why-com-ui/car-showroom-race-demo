// src/core/constants.js
import { publicAsset } from './publicAsset.js';

export const STATES = Object.freeze({
  MENU: 'MENU',
  SHOWROOM: 'SHOWROOM',
  RACE_INTRO: 'RACE_INTRO',
  RACE: 'RACE',
  RESULT: 'RESULT',
});

export const DEFAULT_CAR_MODELS = Object.freeze([
  { 
    name: 'Cyber T-900', // 原 Car 1
    path: publicAsset('car1.glb'),
    // 修复：模型本身朝向偏差 (Math.PI / 2 附近)
    rotationFix: -105 * (Math.PI / 180),
    // ★ 新增：性能参数 (用于 UI 展厅数据显示)
    // 范围 0 - 100
    stats: { speed: 85, handling: 70, accel: 90 }
  },
  { 
    name: 'Neon X-Type', // 原 Car 2
    path: publicAsset('car2.glb'),
    // 修复：模型本身朝向偏差
    rotationFix: 35 * (Math.PI / 180),
    // ★ 新增：性能参数
    stats: { speed: 95, handling: 60, accel: 80 }
  },
]);

export const DEFAULT_CAR_CONFIG = Object.freeze({
  bodyColor: '#ff2a2a',
  metalness: 0.7,
  roughness: 0.25,
  glassTransmission: 0.9,
  glassTint: '#aaccff',
});

export const DEFAULT_SETTINGS = Object.freeze({
  cameraSmoothing: 0.12,
  maxPixelRatio: 2,
});
