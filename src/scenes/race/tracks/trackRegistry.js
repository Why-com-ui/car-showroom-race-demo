export const DEFAULT_TRACK_ID = 'furnace';

export const RACE_TRACKS = Object.freeze([
  {
    id: 'furnace',
    name: '熔炉工业',
    tagline: 'Drift through molten factory lanes',
  },
  {
    id: 'neon',
    name: '霓虹高速',
    tagline: 'Classic cyber city run',
  },
]);

const TRACK_LOADERS = {
  furnace: () => import('./Track_FurnaceHighway.js'),
  neon: () => import('./Track_NeonSpline.js'),
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
