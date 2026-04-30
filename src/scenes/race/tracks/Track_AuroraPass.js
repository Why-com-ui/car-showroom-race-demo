import { createProceduralSplineTrack } from './createProceduralSplineTrack.js';

const CONFIG = {
  id: 'aurora',
  name: 'AuroraMountainPass',
  roadWidth: 32,
  shoulderWidth: 8,
  chunkLength: 132,
  chunkSegments: 42,
  controlSteps: 5,
  turnScale: 0.3,
  turnAmpA: 0.032,
  turnAmpB: 0.02,
  turnNoise: 0.003,
  maxSlope: 0.026,
  slopeAmp: 0.024,
  slopeFreq: 0.0045,
  slopeEase: 0.18,
  minY: -4,
  maxY: 26,
  tags: ['超宽', '极光', '巡航'],
  difficulty: '低',
  style: '高速巡航',
  surfaceTuning: {
    maxSpeed: 4,
    grip: 0.035,
    driftGrip: 0.02,
    turnRate: -0.02,
    nitroChargeRate: -2,
  },
  theme: {
    background: 0x07182a,
    fog: 0x15345a,
    fogDensity: 0.00032,
    fogNear: 36,
    fogFar: 420,
  },
  colors: {
    background: 0x07182a,
    fog: 0x15345a,
    road: 0x172338,
    roadEmissive: 0x0b2b34,
    shoulder: 0x10192a,
    rail: 0x7effc7,
    center: 0xecfff7,
    marker: 0x9bffde,
    wall: 0x1d344a,
    glass: 0x6dffcb,
    structure: 0x1b344c,
    coin: 0xffef9d,
    pad: 0x8bfff1,
    particle: 0x8cf7ff,
    distant: 0x17334a,
  },
  materials: {
    roadRoughness: 0.38,
    roadMetalness: 0.34,
    roadEmissiveIntensity: 0.24,
  },
  features: {
    auroraValley: true,
    nitroEvery: 3,
    nitroAmount: 30,
  },
};

export function createTrack(THREE, opts = {}) {
  return createProceduralSplineTrack(THREE, CONFIG, opts);
}
