// src/scenes/showroom/carConfig.js
import { DEFAULT_CAR_CONFIG } from '../../core/constants.js';

export function makeDefaultCarConfig() {
  // 返回可变对象（DEFAULT_* 是 freeze 的）
  return {
    bodyColor: DEFAULT_CAR_CONFIG.bodyColor,
    metalness: DEFAULT_CAR_CONFIG.metalness,
    roughness: DEFAULT_CAR_CONFIG.roughness,
    glassTransmission: DEFAULT_CAR_CONFIG.glassTransmission,
    glassTint: DEFAULT_CAR_CONFIG.glassTint,
  };
}

export function normalizeCarConfig(cfg) {
  const d = makeDefaultCarConfig();
  return { ...d, ...(cfg || {}) };
}
