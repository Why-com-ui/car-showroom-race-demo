export const DEFAULT_TRACK_ID = 'furnace';

export const RACE_TRACKS = Object.freeze([
  {
    id: 'furnace',
    name: '熔炉工业',
    tagline: '宽阔工厂高速路，漂移蓄氮更稳定',
    tags: ['工业', '宽弯', 'N2O'],
    difficulty: '中',
    style: '漂移补给',
  },
  {
    id: 'neon',
    name: '霓虹高速',
    tagline: '经典赛博城市路线，节奏均衡',
    tags: ['霓虹', '金币', '经典'],
    difficulty: '中',
    style: '均衡高速',
  },
  {
    id: 'blue_rain',
    name: '蓝雨玻璃高架',
    tagline: '更宽的湿滑高架，连续大弧弯和玻璃护墙',
    tags: ['湿滑', '宽弯', '玻璃墙'],
    difficulty: '中',
    style: '高速大弧',
  },
  {
    id: 'aurora',
    name: '极光山脉',
    tagline: '超宽山谷路，平滑起伏和连续巡航弯',
    tags: ['超宽', '大弯', '极光'],
    difficulty: '低',
    style: '高速巡航',
  },
  {
    id: 'quantum',
    name: '量子城市',
    tagline: '稳定双路线分岔、量子门和发光隧道',
    tags: ['稳定分岔', '量子门', '短弯'],
    difficulty: '高',
    style: '操控短弯',
  },
  {
    id: 'crystal_canyon',
    name: '晶体峡谷',
    tagline: '暖色晶体峡谷，宽路连续弯适合漂移',
    tags: ['晶体', '宽弯', '峡谷'],
    difficulty: '中',
    style: '宽路漂移',
  },
]);

const TRACK_LOADERS = {
  furnace: () => import('./Track_FurnaceHighway.js'),
  neon: () => import('./Track_NeonSpline.js'),
  blue_rain: () => import('./Track_BlueRainSkyway.js'),
  aurora: () => import('./Track_AuroraPass.js'),
  quantum: () => import('./Track_QuantumCity.js'),
  crystal_canyon: () => import('./Track_CrystalCanyon.js'),
};

export function normalizeTrackId(trackId) {
  return TRACK_LOADERS[trackId] ? trackId : DEFAULT_TRACK_ID;
}

export function getRaceTrackMeta(trackId) {
  const id = normalizeTrackId(trackId);
  return RACE_TRACKS.find((track) => track.id === id) || RACE_TRACKS[0];
}

export async function loadRaceTrack(trackId) {
  const id = normalizeTrackId(trackId);
  return TRACK_LOADERS[id]();
}
