const LIMITS = Object.freeze({
  maxSpeed: [95, 122],
  accel: [68, 94],
  turnRate: [2.75, 3.55],
  grip: [0.86, 1.04],
  driftGrip: [0.78, 0.98],
});

export function deriveRaceTuning(stats = {}, carConfig = {}, surfaceTuning = {}) {
  const speed = clampNumber(stats.speed ?? 82, 0, 100);
  const handling = clampNumber(stats.handling ?? 70, 0, 100);
  const accelScore = clampNumber(stats.accel ?? 82, 0, 100);
  const roughness = clamp01(carConfig.roughness ?? 0.25);
  const metalness = clamp01(carConfig.metalness ?? 0.7);

  const slickness = Math.max(0, 0.5 - roughness);
  const planted = Math.max(0, roughness - 0.5);
  const massFeel = Math.max(0, metalness - 0.5);

  const next = {
    maxSpeed: 105 + (speed - 80) * 0.36 + slickness * 14 - planted * 7 - massFeel * 3.5,
    accel: 78 + (accelScore - 80) * 0.48 - massFeel * 5.5 - planted * 2.5,
    turnRate: 3.08 + (handling - 70) * 0.011 - massFeel * 0.08 + planted * 0.03,
    grip: 0.96 + (handling - 70) * 0.0022 + planted * 0.09 - slickness * 0.1 + massFeel * 0.012,
    driftGrip: 0.9 + (handling - 70) * 0.0012 + planted * 0.045 - slickness * 0.145,
  };

  const surface = surfaceTuning || {};
  for (const key of Object.keys(LIMITS)) {
    next[key] += Number(surface[key] ?? 0);
    next[key] = clampNumber(next[key], LIMITS[key][0], LIMITS[key][1]);
  }

  if (surface.nitroChargeRate !== undefined) {
    next.nitroChargeRate = clampNumber(70 + Number(surface.nitroChargeRate || 0), 48, 92);
  }
  if (surface.nitroBoostAccel !== undefined) {
    next.nitroBoostAccel = clampNumber(90 + Number(surface.nitroBoostAccel || 0), 72, 112);
  }

  return next;
}

export function deriveCarProfile(stats = {}, carConfig = {}) {
  const speed = clampNumber(stats.speed ?? 82, 0, 100);
  const handling = clampNumber(stats.handling ?? 70, 0, 100);
  const accel = clampNumber(stats.accel ?? 82, 0, 100);
  const roughness = clamp01(carConfig.roughness ?? 0.25);
  const metalness = clamp01(carConfig.metalness ?? 0.7);
  const slickness = Math.max(0, 0.5 - roughness);

  const speedScore = speed + (0.5 - roughness) * 20 - metalness * 3;
  const driftScore = (100 - handling) * 0.35 + slickness * 44 + speed * 0.12;
  const handlingScore = handling + roughness * 12 - metalness * 4;
  const balancedSpread = Math.max(speed, handling, accel) - Math.min(speed, handling, accel);

  if (slickness > 0.32 && handling <= 75) return '漂移型';
  if (balancedSpread <= 16 && roughness >= 0.28 && roughness <= 0.68) return '均衡型';
  if (driftScore >= speedScore && driftScore >= handlingScore && slickness > 0.08) return '漂移型';
  if (speedScore >= handlingScore && speed >= 88) return '高速型';
  if (handlingScore >= 72) return '操控型';
  return '均衡型';
}

function clamp01(value) {
  return clampNumber(value, 0, 1);
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
