import { createProceduralSplineTrack } from './createProceduralSplineTrack.js';

const CONFIG = {
  id: 'blue_rain',
  name: 'BlueRainSkyway',
  roadWidth: 26,
  chunkLength: 122,
  chunkSegments: 40,
  turnScale: 0.34,
  turnAmpA: 0.035,
  turnAmpB: 0.022,
  turnNoise: 0.004,
  maxSlope: 0.012,
  slopeAmp: 0.006,
  slopeEase: 0.18,
  minY: -2,
  maxY: 10,
  tags: ['湿滑', '玻璃墙', '长直道'],
  difficulty: '中',
  style: '高速大弧',
  surfaceTuning: {
    maxSpeed: 2,
    grip: -0.045,
    driftGrip: -0.07,
    turnRate: -0.04,
    nitroChargeRate: 4,
  },
  theme: {
    background: 0x06162f,
    fog: 0x0b3a62,
    fogDensity: 0.00044,
    fogNear: 28,
    fogFar: 340,
  },
  colors: {
    background: 0x06162f,
    fog: 0x0b3a62,
    road: 0x10273e,
    roadEmissive: 0x063a63,
    shoulder: 0x061426,
    rail: 0x5be7ff,
    center: 0xcffaff,
    marker: 0x34d8ff,
    wall: 0x15395d,
    glass: 0x92ecff,
    structure: 0x153252,
    coin: 0xffeaa3,
    pad: 0x26f4ff,
    particle: 0x28bfff,
    distant: 0x102b4d,
  },
  materials: {
    roadRoughness: 0.12,
    roadMetalness: 0.62,
    roadEmissiveIntensity: 0.42,
  },
  features: {
    blueRain: true,
    glassWalls: true,
    nitroEvery: 2,
    nitroAmount: 32,
  },
};

export function createTrack(THREE, opts = {}) {
  return createProceduralSplineTrack(THREE, CONFIG, opts);
}
