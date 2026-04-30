import * as THREE from 'three';

const DEFAULT_CONFIG = {
  id: 'procedural',
  name: 'ProceduralTrack',
  chunkLength: 104,
  chunkSegments: 36,
  controlSteps: 5,
  visibleChunks: 10,
  recycleDist: 108,
  roadWidth: 28,
  shoulderWidth: 6,
  turnScale: 0.52,
  turnFreqA: 0.016,
  turnFreqB: 0.007,
  turnAmpA: 0.052,
  turnAmpB: 0.034,
  turnNoise: 0.008,
  maxSlope: 0.035,
  slopeAmp: 0.02,
  slopeFreq: 0.006,
  slopeEase: 0.25,
  minY: -8,
  maxY: 20,
  branch: null,
  theme: {},
  tags: [],
  difficulty: '中',
  style: '高速',
  surfaceTuning: {},
  colors: {
    background: 0x020611,
    fog: 0x071326,
    road: 0x111827,
    roadEmissive: 0x061327,
    shoulder: 0x060b15,
    rail: 0x22d3ee,
    center: 0xdffcff,
    marker: 0x7dd3fc,
    wall: 0x18324a,
    glass: 0x7dd3fc,
    structure: 0x203040,
    coin: 0xffe38a,
    pad: 0x00f3ff,
    particle: 0x22d3ee,
    distant: 0x0b1d35,
  },
  materials: {
    roadRoughness: 0.32,
    roadMetalness: 0.44,
    roadEmissiveIntensity: 0.36,
  },
  lighting: {
    ambient: 0.72,
    hemi: 1.0,
    keyColor: 0xffffff,
    keyIntensity: 1.18,
    keyPosition: [36, 76, 26],
    fillColor: 0x22d3ee,
    fillIntensity: 0.55,
    fillPosition: [-42, 18, -56],
    accentIntensity: 1.8,
    accentRange: 190,
    shadowMapSize: 1024,
    shadowRange: 115,
  },
  features: {},
};

export function createProceduralSplineTrack(THREE_Instance, config = {}, opts = {}) {
  const T = THREE_Instance || THREE;
  const cfg = mergeConfig(DEFAULT_CONFIG, config);
  const rng = createRandom(opts.seed ?? config.seed ?? 2026);
  const root = new T.Object3D();
  root.name = `Track_${cfg.name || cfg.id}`;

  const activeChunks = [];
  const roadMeshes = [];
  const interactables = [];
  let totalDist = 0;
  let lastPlayerS = 0;
  let nextChunkId = 0;

  const worldUp = new T.Vector3(0, 1, 0);
  const cursor = {
    pos: new T.Vector3(0, 0, 0),
    dir: new T.Vector3(0, 0, -1),
    right: new T.Vector3(1, 0, 0),
  };

  const materials = createMaterials(T, cfg);
  const geometries = {
    box: new T.BoxGeometry(1, 1, 1),
    coin: new T.IcosahedronGeometry(0.82, 1),
    pad: new T.BoxGeometry(5.8, 0.16, 3.2),
    cone: new T.ConeGeometry(1, 1, 4),
    cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 12),
    torus: new T.TorusGeometry(1, 0.08, 8, 40),
  };

  addTrackLights(T, root, cfg);
  addGlobalSceneSet(T, root, cfg, rng, materials, geometries);

  class Chunk {
    constructor(id) {
      this.id = id;
      this.root = new T.Group();
      this.root.name = `${cfg.id}_Chunk_${id}`;
      this.boundsData = [];
      this.mainBounds = [];
      this.roadMeshes = [];
      this.geometries = [];
      this.startDist = 0;
      this.endDist = 0;
    }

    generate(startPos, startDir) {
      const points = [startPos.clone()];
      const startDist = totalDist;
      let currPos = startPos.clone();
      let currDir = startDir.clone();
      const step = cfg.chunkLength / cfg.controlSteps;

      for (let i = 0; i < cfg.controlSteps; i++) {
        totalDist += step;
        const turn =
          Math.sin(totalDist * cfg.turnFreqA + this.id * 0.11) * cfg.turnAmpA +
          Math.sin(totalDist * cfg.turnFreqB + 1.7) * cfg.turnAmpB +
          (rng() - 0.5) * cfg.turnNoise;
        currDir.applyAxisAngle(worldUp, turn * cfg.turnScale);

        const targetPitch = Math.sin(totalDist * cfg.slopeFreq + this.id * 0.31) * cfg.slopeAmp;
        currDir.y += (targetPitch - currDir.y) * cfg.slopeEase;
        currDir.y = clamp(currDir.y, -cfg.maxSlope, cfg.maxSlope);
        if (currPos.y > cfg.maxY) currDir.y -= cfg.maxSlope * 0.6;
        if (currPos.y < cfg.minY) currDir.y += cfg.maxSlope * 0.6;
        currDir.normalize();
        currPos.addScaledVector(currDir, step);
        points.push(currPos.clone());
      }

      this.startDist = startDist;
      this.endDist = totalDist;
      cursor.pos.copy(currPos);
      cursor.dir.copy(currDir);

      const curve = new T.CatmullRomCurve3(points, false, 'centripetal', 0.22);
      const samples = sampleCurve(T, curve, cfg, this.id, this.startDist, this.endDist, cursor.right, worldUp);
      cursor.right.copy(samples[samples.length - 1]?.right || cursor.right);

      const road = makeRibbonMesh(T, samples, cfg.roadWidth / 2, materials.road, `RoadChunk_${cfg.id}_${this.id}`, 0);
      road.userData.__chunkRef = this;
      road.userData.__boundsSamples = this.mainBounds;
      road.frustumCulled = false;
      applyShadowRole(road, 'road');
      this.root.add(road);
      this.roadMeshes.push(road);
      roadMeshes.push(road);
      this.geometries.push(road.geometry);

      const shoulder = makeRibbonMesh(
        T,
        samples,
        cfg.roadWidth / 2 + cfg.shoulderWidth,
        materials.shoulder,
        `${cfg.id}_Shoulder_${this.id}`,
        -0.06,
      );
      shoulder.frustumCulled = false;
      applyShadowRole(shoulder, 'road');
      this.root.add(shoulder);
      this.geometries.push(shoulder.geometry);

      for (let i = 0; i < samples.length; i += 2) {
        const sample = samples[i];
        const data = makeBoundsSample(sample, cfg.roadWidth, 'main', this.id);
        this.boundsData.push(data);
        this.mainBounds.push(data);
      }

      const branchSamples = this._maybeAddBranch(samples);
      this._addRoadDetails(samples, branchSamples);
      this._addCollectibles(samples, branchSamples);
      this._addScenery(samples, branchSamples);

      root.add(this.root);
    }

    _maybeAddBranch(samples) {
      const branch = cfg.branch;
      if (!branch?.enabled) return null;
      const every = Math.max(1, branch.every ?? 4);
      const phase = branch.phase ?? 1;
      if (this.id % every !== phase) return null;

      const side = Number.isFinite(branch.side) ? Math.sign(branch.side || 1) : (this.id % 2 === 0 ? 1 : -1);
      const offset = branch.offset ?? cfg.roadWidth * 0.92;
      const branchWidth = branch.width ?? cfg.roadWidth * 0.82;
      const branchBaseLift = branch.baseLift ?? 0.06;
      const branchLift = branch.lift ?? 0.16;
      const branchSamples = samples.map((sample) => {
        const alpha = branchAlpha(sample.t, branch.start ?? 0.18, branch.end ?? 0.84);
        const center = sample.center.clone()
          .addScaledVector(sample.right, side * offset * alpha)
          .addScaledVector(sample.normal, branchBaseLift + branchLift * alpha);
        return { ...sample, center, route: 'branch', roadWidth: branchWidth, branchAlpha: alpha };
      });

      const branchRoad = makeRibbonMesh(
        T,
        branchSamples,
        branchWidth / 2,
        materials.branchRoad || materials.road,
        `RoadChunk_${cfg.id}_branch_${this.id}`,
        0,
      );
      branchRoad.userData.__chunkRef = this;
      branchRoad.userData.__boundsSamples = [];
      branchRoad.frustumCulled = false;
      applyShadowRole(branchRoad, 'road');
      this.root.add(branchRoad);
      this.roadMeshes.push(branchRoad);
      roadMeshes.push(branchRoad);
      this.geometries.push(branchRoad.geometry);

      for (let i = 0; i < branchSamples.length; i += 2) {
        if ((branchSamples[i].branchAlpha ?? 0) < (branch.boundsMinAlpha ?? 0.025)) continue;
        const data = makeBoundsSample(branchSamples[i], branchWidth, 'branch', this.id);
        this.boundsData.push(data);
        branchRoad.userData.__boundsSamples.push(data);
      }

      this._addBranchJunctions(samples, branchSamples, side, offset, branchWidth);
      this._addBranchMarkers(branchSamples, side);
      return branchSamples;
    }

    _addBranchJunctions(samples, branchSamples, side, offset, branchWidth) {
      const split = findBranchJunctionSample(samples, branchSamples, true);
      const merge = findBranchJunctionSample(samples, branchSamples, false);
      for (const pair of [split, merge]) {
        if (!pair) continue;
        const { main, branchSample } = pair;
        const alpha = clamp(branchSample.branchAlpha ?? 0.2, 0.12, 0.45);
        const pos = main.center.clone()
          .addScaledVector(main.right, side * offset * alpha * 0.5)
          .addScaledVector(main.normal, 0.08);
        const plateWidth = cfg.roadWidth + branchWidth * 0.45 + Math.abs(offset) * alpha;
        const plate = addBox(T, this.root, geometries.box, materials.road, [plateWidth, 0.12, 7.8], pos, main.tangent, main.right, main.normal);
        plate.name = `RoadChunk_${cfg.id}_junction_${this.id}_${pair.kind}`;
        plate.userData.__chunkRef = this;
        plate.userData.__boundsSamples = [
          makeBoundsSample(main, cfg.roadWidth, 'main', this.id),
          makeBoundsSample(branchSample, branchWidth, 'branch', this.id),
        ];
        applyShadowRole(plate, 'road');
        roadMeshes.push(plate);
        this.roadMeshes.push(plate);
      }
    }

    _addRoadDetails(samples, branchSamples) {
      addRoadStriping(T, this.root, cfg, samples, materials, geometries);
      if (branchSamples) addRoadStriping(T, this.root, cfg, branchSamples, materials, geometries, true);

      if (cfg.features.glassWalls) addGlassWalls(T, this.root, cfg, samples, materials, geometries);
      if (cfg.features.quantumCity) addQuantumRoadSigns(T, this.root, cfg, samples, materials, geometries);
      if (cfg.features.auroraValley) addValleyGuard(T, this.root, cfg, samples, materials, geometries);
      if (cfg.features.furnaceWarmth) addHeatRibbons(T, this.root, cfg, samples, materials, geometries);
    }

    _addBranchMarkers(branchSamples, side) {
      if (!cfg.features.quantumCity) return;
      const start = branchSamples.find((sample) => sample.branchAlpha > 0.08);
      const end = [...branchSamples].reverse().find((sample) => sample.branchAlpha > 0.08);
      for (const sample of [start, end]) {
        if (!sample) continue;
        addPortal(T, this.root, cfg, sample, materials, geometries, side, cfg.roadWidth * 0.45);
      }
    }

    _addCollectibles(samples, branchSamples) {
      for (let i = 5; i < samples.length; i += 8) {
        if (rng() < 0.22) continue;
        const sample = samples[i];
        const offset = Math.sin(sample.s * 0.045 + this.id) * (cfg.roadWidth * 0.25);
        const pos = sample.center.clone().addScaledVector(sample.right, offset).addScaledVector(sample.normal, 2.75);
        const coin = new T.Mesh(geometries.coin, materials.coin);
        coin.name = `${cfg.id}_Coin`;
        coin.position.copy(pos);
        applyShadowRole(coin, 'small');
        this.root.add(coin);
        interactables.push(makeInteractable('coin', coin, this.id, { active: true, value: 100, radius: 2.5 }));
      }

      const nitroEvery = cfg.features.nitroEvery ?? 2;
      if (this.id % nitroEvery === 0) {
        const pool = branchSamples && rng() > 0.45 ? branchSamples : samples;
        const sample = pool[Math.floor(pool.length * 0.62)];
        const offset = Math.sin(sample.s * 0.034) * ((sample.roadWidth || cfg.roadWidth) * 0.18);
        const pos = sample.center.clone().addScaledVector(sample.right, offset).addScaledVector(sample.normal, 0.16);
        const pad = new T.Mesh(geometries.pad, materials.pad.clone());
        pad.name = `${cfg.id}_NitroPad`;
        pad.userData.phase = rng() * Math.PI * 2;
        orientObject(T, pad, pos, sample.tangent, sample.right, sample.normal);
        applyShadowRole(pad, 'small');
        this.root.add(pad);
        interactables.push(makeInteractable('nitro_pad', pad, this.id, { active: true, nitro: cfg.features.nitroAmount ?? 35, value: 0, radius: 4.2 }));
      }
    }

    _addScenery(samples, branchSamples) {
      if (cfg.features.blueRain) addBlueRainScenery(T, this.root, cfg, samples, materials, geometries, rng);
      if (cfg.features.auroraValley) addAuroraScenery(T, this.root, cfg, samples, materials, geometries, rng);
      if (cfg.features.quantumCity) addQuantumScenery(T, this.root, cfg, samples, branchSamples, materials, geometries, rng);
      if (cfg.features.crystalCanyon) addCrystalCanyonScenery(T, this.root, cfg, samples, materials, geometries, rng);
    }

    dispose() {
      root.remove(this.root);
      for (const mesh of this.roadMeshes) {
        const index = roadMeshes.indexOf(mesh);
        if (index >= 0) roadMeshes.splice(index, 1);
      }
      for (const geo of this.geometries) geo.dispose?.();
      for (let i = interactables.length - 1; i >= 0; i--) {
        if (interactables[i].chunkId === this.id) interactables.splice(i, 1);
      }
    }
  }

  for (let i = 0; i < cfg.visibleChunks; i++) {
    const chunk = new Chunk(nextChunkId++);
    chunk.generate(cursor.pos, cursor.dir);
    activeChunks.push(chunk);
  }

  const spawnSample = activeChunks[0]?.mainBounds[3] || activeChunks[0]?.mainBounds[0];

  function update(dt, playerPos) {
    for (const item of interactables) {
      if (item.type !== 'nitro_pad' || !item.userData.active) continue;
      item.mesh.userData.phase += dt * 5.2;
      item.mesh.material.emissiveIntensity = 1.0 + Math.sin(item.mesh.userData.phase) * 0.35;
    }
    if (root.userData.particles && playerPos) {
      root.userData.particles.position.x = playerPos.x;
      root.userData.particles.position.z = playerPos.z;
    }
    if (root.userData.aurora) {
      root.userData.aurora.material.opacity = root.userData.aurora.userData.baseOpacity + Math.sin(performance.now() * 0.001) * 0.04;
    }

    if (!playerPos || activeChunks.length === 0) return;
    const closest = getClosest(playerPos, lastPlayerS);
    if (closest.valid) lastPlayerS = Math.max(lastPlayerS, closest.s ?? 0);

    while (activeChunks.length && lastPlayerS > activeChunks[0].endDist + cfg.recycleDist) {
      const old = activeChunks.shift();
      old.dispose();
      const chunk = new Chunk(nextChunkId++);
      chunk.generate(cursor.pos, cursor.dir);
      activeChunks.push(chunk);
    }
  }

  function getClosest(pos, hintS = lastPlayerS) {
    const rayResult = closestByRaycast(T, pos, roadMeshes);
    if (rayResult) return makeClosestResult(pos, rayResult);

    let best = null;
    let bestCost = Infinity;
    const hasHint = Number.isFinite(hintS) && hintS > 0;
    const minS = hasHint ? hintS - 150 : -Infinity;
    const maxS = hasHint ? hintS + 340 : Infinity;

    const testSample = (b, withPenalty) => {
      const dx = pos.x - b.center.x;
      const dy = pos.y - b.center.y;
      const dz = pos.z - b.center.z;
      if (Math.abs(dy) > 80) return;
      const sPenalty = hasHint && withPenalty ? (b.s - hintS) * (b.s - hintS) * 0.0012 : 0;
      const cost = dx * dx + dz * dz + dy * dy * 0.32 + sPenalty;
      if (cost < bestCost) {
        bestCost = cost;
        best = b;
      }
    };

    for (const chunk of activeChunks) {
      for (const b of chunk.boundsData) {
        if (b.s < minS || b.s > maxS) continue;
        testSample(b, true);
      }
    }

    if (!best) {
      for (const chunk of activeChunks) {
        for (const b of chunk.boundsData) testSample(b, false);
      }
    }

    if (!best) return { valid: false, lateral: 9999, center: pos, roadWidth: cfg.roadWidth };
    return makeClosestResult(pos, best);
  }

  return {
    root,
    id: cfg.id,
    roadWidth: cfg.roadWidth,
    theme: {
      background: cfg.theme.background ?? cfg.colors.background,
      fog: cfg.theme.fog ?? cfg.colors.fog,
      fogDensity: cfg.theme.fogDensity ?? 0.00055,
      fogNear: cfg.theme.fogNear ?? 24,
      fogFar: cfg.theme.fogFar ?? 280,
    },
    surfaceTuning: { ...(cfg.surfaceTuning || {}) },
    tags: [...(cfg.tags || [])],
    difficulty: cfg.difficulty,
    style: cfg.style,
    spawn: {
      position: spawnSample.center.clone().add(new T.Vector3(0, 1.5, 0)),
      yaw: Math.atan2(spawnSample.forward.x, spawnSample.forward.z),
    },
    checkpoints: activeChunks
      .flatMap((chunk) => chunk.mainBounds.filter((_, index) => index % 5 === 0).map((b) => ({ center: b.center.clone(), radius: Math.max(7, cfg.roadWidth * 0.25) })))
      .slice(0, 14),
    bounds: {
      fn: (x, z, pos3D) => {
        const p = pos3D || new T.Vector3(x, 0, z);
        const res = getClosest(p, lastPlayerS);
        if (!res.valid) return 100;
        if (Math.abs(p.y - res.center.y) > 45) return 100;
        return Math.abs(res.lateral) - (res.roadWidth || cfg.roadWidth) / 2;
      },
      clampPosition: (pos, margin = 0.8) => {
        const res = getClosest(pos, lastPlayerS);
        if (!res.valid) return;
        const limit = (res.roadWidth || cfg.roadWidth) / 2 - margin;
        const absLat = Math.abs(res.lateral);
        if (absLat <= limit) return;
        const push = Math.min(absLat - limit, 4.4);
        const dir = Math.sign(res.lateral) || 1;
        pos.x -= res.binormal.x * dir * push;
        pos.z -= res.binormal.z * dir * push;
      },
    },
    update,
    getRespawn: (posHint) => {
      const res = getClosest(posHint || spawnSample.center, lastPlayerS);
      const center = (res.valid ? res.center : spawnSample.center).clone();
      const forward = res.valid ? res.forward : spawnSample.forward;
      return {
        position: center.add(new T.Vector3(0, 1.5, 0)),
        yaw: Math.atan2(forward.x, forward.z),
      };
    },
    getClosest,
    getInteractables: () => interactables.filter((item) => item.userData.active),
    dispose: () => {
      for (const chunk of activeChunks) chunk.dispose();
      activeChunks.length = 0;
      for (const geo of Object.values(geometries)) geo.dispose?.();
      for (const mat of Object.values(materials)) mat.dispose?.();
    },
  };
}

function sampleCurve(T, curve, cfg, chunkId, startDist, endDist, lastRight, worldUp) {
  const samples = [];
  const rightRef = lastRight.clone();
  for (let i = 0; i <= cfg.chunkSegments; i++) {
    const t = i / cfg.chunkSegments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new T.Vector3().crossVectors(tangent, worldUp);
    if (right.lengthSq() < 1e-6) right.copy(rightRef);
    else right.normalize();
    if (right.dot(rightRef) < 0) right.negate();
    rightRef.copy(right);
    const normal = new T.Vector3().crossVectors(right, tangent).normalize();
    const s = startDist + t * (endDist - startDist);
    samples.push({ center, tangent, right, normal, t, s, chunkId, roadWidth: cfg.roadWidth, route: 'main' });
  }
  return samples;
}

function makeRibbonMesh(T, samples, halfWidth, mat, name, normalOffset = 0) {
  const count = samples.length;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices = [];
  for (let i = 0; i < count; i++) {
    const sample = samples[i];
    const center = sample.center.clone().addScaledVector(sample.normal, normalOffset);
    const left = center.clone().addScaledVector(sample.right, halfWidth);
    const right = center.clone().addScaledVector(sample.right, -halfWidth);
    positions.set([left.x, left.y, left.z], i * 6);
    positions.set([right.x, right.y, right.z], i * 6 + 3);
    uvs.set([0, i], i * 4);
    uvs.set([1, i], i * 4 + 2);
    if (i < count - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new T.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new T.Mesh(geo, mat);
  mesh.name = name;
  return mesh;
}

function findBranchJunctionSample(samples, branchSamples, first = true) {
  const threshold = 0.08;
  const order = first
    ? branchSamples.map((sample, index) => [sample, index])
    : branchSamples.map((sample, index) => [sample, index]).reverse();
  const found = order.find(([sample]) => (sample.branchAlpha ?? 0) > threshold);
  if (!found) return null;
  const [branchSample, index] = found;
  const main = samples[index];
  if (!main) return null;
  return {
    main,
    branchSample,
    kind: first ? 'split' : 'merge',
  };
}

function addRoadStriping(T, parent, cfg, samples, materials, geometries, isBranch = false) {
  for (let i = 1; i < samples.length; i += 2) {
    const a = samples[i - 1];
    const b = samples[i];
    const len = a.center.distanceTo(b.center);
    const mid = a.center.clone().lerp(b.center, 0.5);
    const roadWidth = isBranch ? (cfg.branch?.width ?? cfg.roadWidth * 0.82) : cfg.roadWidth;
    const tangent = b.center.clone().sub(a.center).normalize();
    for (const side of [-1, 1]) {
      const pos = mid.clone().addScaledVector(a.right, side * (roadWidth / 2 + 0.18)).addScaledVector(a.normal, 0.25);
      addBox(T, parent, geometries.box, materials.rail, [0.18, 0.45, len], pos, tangent, a.right, a.normal);
    }
    if (i % 4 === 1 && !isBranch) {
      addBox(T, parent, geometries.box, materials.center, [0.18, 0.06, len * 0.78], mid.clone().addScaledVector(a.normal, 0.06), tangent, a.right, a.normal);
    }
  }

  for (let i = 5; i < samples.length; i += 10) {
    const sample = samples[i];
    const turnSide = Math.sin(sample.s * 0.04 + (isBranch ? 1.5 : 0)) > 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const pos = sample.center.clone()
        .addScaledVector(sample.right, turnSide * (2.2 + k * 1.35))
        .addScaledVector(sample.normal, 0.1)
        .addScaledVector(sample.tangent, k * 1.1);
      const arrow = addBox(T, parent, geometries.box, materials.marker, [1.0, 0.08, 0.22], pos, sample.tangent, sample.right, sample.normal);
      arrow.rotation.z += turnSide * 0.7;
    }
  }
}

function addGlassWalls(T, parent, cfg, samples, materials, geometries) {
  for (let i = 2; i < samples.length; i += 3) {
    const sample = samples[i];
    for (const side of [-1, 1]) {
      const pos = sample.center.clone()
        .addScaledVector(sample.right, side * (cfg.roadWidth / 2 + 1.4))
        .addScaledVector(worldUpLike(sample.normal), 2.1);
      const wall = addBox(T, parent, geometries.box, materials.glass, [0.18, 4.2, 7.4], pos, sample.tangent, sample.right, worldUpLike(sample.normal));
      wall.userData.floatAmp = 0.02;
    }
  }
}

function addValleyGuard(T, parent, cfg, samples, materials, geometries) {
  for (let i = 3; i < samples.length; i += 6) {
    const sample = samples[i];
    for (const side of [-1, 1]) {
      const pos = sample.center.clone().addScaledVector(sample.right, side * (cfg.roadWidth / 2 + 3.3)).addScaledVector(sample.normal, 0.46);
      addBox(T, parent, geometries.box, materials.rail, [0.34, 0.72, 10.2], pos, sample.tangent, sample.right, sample.normal);
    }
  }
}

function addHeatRibbons(T, parent, cfg, samples, materials, geometries) {
  for (let i = 4; i < samples.length; i += 7) {
    const sample = samples[i];
    const pos = sample.center.clone().addScaledVector(sample.normal, 0.08);
    addBox(T, parent, geometries.box, materials.marker, [cfg.roadWidth * 0.4, 0.06, 0.24], pos, sample.tangent, sample.right, sample.normal);
  }
}

function addQuantumRoadSigns(T, parent, cfg, samples, materials, geometries) {
  for (let i = 6; i < samples.length; i += 12) {
    const sample = samples[i];
    addPortal(T, parent, cfg, sample, materials, geometries, Math.sin(sample.s * 0.03) > 0 ? 1 : -1, 0);
  }
}

function addBlueRainScenery(T, parent, cfg, samples, materials, geometries, rng) {
  for (let i = 3; i < samples.length; i += 8) {
    const sample = samples[i];
    for (const side of [-1, 1]) {
      const distance = cfg.roadWidth / 2 + 34 + rng() * 24;
      const height = 24 + rng() * 42;
      const width = 5 + rng() * 10;
      const depth = 7 + rng() * 18;
      const base = sample.center.clone().addScaledVector(sample.right, side * distance);
      const pos = base.clone().addScaledVector(worldUpLike(sample.normal), height / 2 - 2);
      addBox(T, parent, geometries.box, materials.distant, [width, height, depth], pos, sample.tangent, sample.right, worldUpLike(sample.normal));
      if (i % 16 === 3) {
        const bridge = base.clone().addScaledVector(sample.right, -side * distance).addScaledVector(worldUpLike(sample.normal), 16 + rng() * 8);
        addBox(T, parent, geometries.box, materials.glass, [cfg.roadWidth + 18, 0.26, 1.4], bridge, sample.tangent, sample.right, worldUpLike(sample.normal));
      }
    }
  }
}

function addAuroraScenery(T, parent, cfg, samples, materials, geometries, rng) {
  for (let i = 2; i < samples.length; i += 7) {
    const sample = samples[i];
    for (const side of [-1, 1]) {
      const distance = cfg.roadWidth / 2 + 58 + rng() * 42;
      const height = 26 + rng() * 34;
      const pos = sample.center.clone()
        .addScaledVector(sample.right, side * distance)
        .addScaledVector(worldUpLike(sample.normal), height * 0.5 - 8);
      const mountain = new T.Mesh(geometries.cone, materials.mountain);
      mountain.scale.set(18 + rng() * 22, height, 18 + rng() * 26);
      orientObject(T, mountain, pos, sample.tangent, sample.right, worldUpLike(sample.normal));
      mountain.rotation.y += rng() * Math.PI;
      applyShadowRole(mountain, 'large');
      parent.add(mountain);
    }
  }
}

function addQuantumScenery(T, parent, cfg, samples, branchSamples, materials, geometries, rng) {
  for (let i = 3; i < samples.length; i += 6) {
    const sample = samples[i];
    for (const side of [-1, 1]) {
      const distance = cfg.roadWidth / 2 + 18 + rng() * 18;
      const height = 16 + rng() * 34;
      const pos = sample.center.clone()
        .addScaledVector(sample.right, side * distance)
        .addScaledVector(worldUpLike(sample.normal), height / 2 - 1);
      addBox(T, parent, geometries.box, materials.distant, [4 + rng() * 8, height, 8 + rng() * 16], pos, sample.tangent, sample.right, worldUpLike(sample.normal));
    }
  }

  const tunnelEvery = branchSamples ? 12 : 15;
  for (let i = 4; i < samples.length; i += tunnelEvery) {
    const sample = samples[i];
    const pos = sample.center.clone().addScaledVector(sample.normal, 6.2);
    addBox(T, parent, geometries.box, materials.glow, [cfg.roadWidth + 5.5, 0.42, 1.0], pos, sample.tangent, sample.right, sample.normal);
    addBox(T, parent, geometries.box, materials.glow, [0.42, 12.4, 1.0], pos.clone().addScaledVector(sample.right, cfg.roadWidth / 2 + 2.8).addScaledVector(sample.normal, -0.1), sample.tangent, sample.right, sample.normal);
    addBox(T, parent, geometries.box, materials.glow, [0.42, 12.4, 1.0], pos.clone().addScaledVector(sample.right, -cfg.roadWidth / 2 - 2.8).addScaledVector(sample.normal, -0.1), sample.tangent, sample.right, sample.normal);
  }
}

function addCrystalCanyonScenery(T, parent, cfg, samples, materials, geometries, rng) {
  for (let i = 2; i < samples.length; i += 5) {
    const sample = samples[i];
    for (const side of [-1, 1]) {
      const distance = cfg.roadWidth / 2 + 30 + rng() * 22;
      const height = 14 + rng() * 34;
      const width = 7 + rng() * 10;
      const depth = 10 + rng() * 24;
      const wallPos = sample.center.clone()
        .addScaledVector(sample.right, side * distance)
        .addScaledVector(worldUpLike(sample.normal), height * 0.5 - 2);
      addBox(T, parent, geometries.box, materials.distant, [width, height, depth], wallPos, sample.tangent, sample.right, worldUpLike(sample.normal));

      if (i % 10 === 2) {
        const crystalPos = sample.center.clone()
          .addScaledVector(sample.right, side * (cfg.roadWidth / 2 + 12 + rng() * 10))
          .addScaledVector(worldUpLike(sample.normal), 4.5 + rng() * 2);
        const crystal = new T.Mesh(geometries.cone, materials.crystal || materials.glow);
        crystal.name = `${cfg.id}_Crystal`;
        crystal.scale.set(2.2 + rng() * 2.8, 9 + rng() * 11, 2.2 + rng() * 2.8);
        orientObject(T, crystal, crystalPos, sample.tangent, sample.right, worldUpLike(sample.normal));
        crystal.rotation.y += rng() * Math.PI;
        applyShadowRole(crystal, 'large');
        parent.add(crystal);
      }
    }
  }

  for (let i = 4; i < samples.length; i += 9) {
    const sample = samples[i];
    const pos = sample.center.clone().addScaledVector(sample.normal, 0.11);
    addBox(T, parent, geometries.box, materials.marker, [cfg.roadWidth * 0.54, 0.06, 0.28], pos, sample.tangent, sample.right, sample.normal);
  }
}

function addPortal(T, parent, cfg, sample, materials, geometries, side = 1, lateralOffset = 0) {
  const pos = sample.center.clone()
    .addScaledVector(sample.right, lateralOffset)
    .addScaledVector(sample.normal, 5.5);
  const ring = new T.Mesh(geometries.torus, materials.glow);
  ring.name = `${cfg.id}_Portal`;
  ring.scale.set(cfg.roadWidth * 0.42, cfg.roadWidth * 0.42, 1);
  orientObject(T, ring, pos, sample.tangent, sample.right, sample.normal);
  ring.rotation.z += Math.PI * 0.5 * side;
  parent.add(ring);
}

function addGlobalSceneSet(T, root, cfg, rng, materials, geometries) {
  const features = cfg.features || {};
  if (features.blueRain || features.quantumCity || features.auroraValley || features.crystalCanyon) {
    const geo = new T.BufferGeometry();
    const count = features.auroraValley ? 160 : (features.crystalCanyon ? 210 : 260);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() - 0.5) * (features.auroraValley ? 300 : (features.crystalCanyon ? 240 : 190));
      positions[i * 3 + 1] = 2 + rng() * (features.auroraValley ? 70 : (features.crystalCanyon ? 44 : 52));
      positions[i * 3 + 2] = (rng() - 0.5) * 360;
    }
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    const mat = new T.PointsMaterial({
      color: cfg.colors.particle,
      size: features.blueRain ? 0.34 : (features.crystalCanyon ? 0.42 : 0.5),
      transparent: true,
      opacity: features.blueRain ? 0.38 : (features.crystalCanyon ? 0.22 : 0.26),
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    const particles = new T.Points(geo, mat);
    particles.name = `${cfg.id}_Atmosphere`;
    root.add(particles);
    root.userData.particles = particles;
  }

  if (features.auroraValley) {
    const curtainGeo = new T.PlaneGeometry(220, 62, 18, 2);
    const curtainMat = new T.MeshBasicMaterial({
      color: cfg.colors.glass,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
    });
    const curtain = new T.Mesh(curtainGeo, curtainMat);
    curtain.name = `${cfg.id}_AuroraCurtain`;
    curtain.position.set(0, 48, -140);
    curtain.rotation.x = -0.08;
    curtain.userData.baseOpacity = 0.24;
    root.add(curtain);
    root.userData.aurora = curtain;
  }

  if (features.blueRain) {
    for (let i = 0; i < 7; i++) {
      const beam = new T.Mesh(geometries.box, materials.glass);
      beam.position.set((i - 3) * 28, 18 + (i % 2) * 8, -72 - i * 34);
      beam.scale.set(0.6, 38, 3.2);
      beam.rotation.z = 0.08 * (i % 2 ? 1 : -1);
      root.add(beam);
    }
  }

  if (features.crystalCanyon) {
    for (let i = 0; i < 6; i++) {
      const rib = new T.Mesh(geometries.box, materials.crystal || materials.glow);
      rib.position.set((i - 2.5) * 34, 10 + (i % 2) * 4, -84 - i * 42);
      rib.scale.set(1.2, 22 + i * 2, 1.2);
      rib.rotation.z = 0.16 * (i % 2 ? 1 : -1);
      rib.castShadow = true;
      root.add(rib);
    }
  }
}

function addTrackLights(T, root, cfg) {
  const features = cfg.features || {};
  const lighting = cfg.lighting || {};
  root.add(new T.AmbientLight(0xffffff, lighting.ambient ?? (features.auroraValley ? 0.92 : 0.72)));
  root.add(new T.HemisphereLight(
    cfg.colors.glass,
    cfg.colors.background,
    lighting.hemi ?? (features.blueRain ? 1.28 : 1.0),
  ));

  const key = new T.DirectionalLight(
    lighting.keyColor ?? (features.auroraValley ? 0xe7fff6 : 0xffffff),
    lighting.keyIntensity ?? (features.quantumCity ? 1.42 : 1.18),
  );
  key.position.set(...(lighting.keyPosition || [36, 76, 26]));
  key.castShadow = true;
  key.shadow.mapSize.set(lighting.shadowMapSize ?? 1024, lighting.shadowMapSize ?? 1024);
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.035;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 230;
  const shadowRange = lighting.shadowRange ?? 115;
  key.shadow.camera.left = -shadowRange;
  key.shadow.camera.right = shadowRange;
  key.shadow.camera.top = shadowRange;
  key.shadow.camera.bottom = -shadowRange;
  key.target.position.set(0, 0, -70);
  root.add(key);
  root.add(key.target);

  const fill = new T.PointLight(
    lighting.fillColor ?? cfg.colors.rail,
    lighting.fillIntensity ?? 0.55,
    lighting.fillRange ?? 155,
  );
  fill.position.set(...(lighting.fillPosition || [-42, 18, -56]));
  root.add(fill);

  const accent = new T.PointLight(
    cfg.colors.rail,
    lighting.accentIntensity ?? (features.quantumCity ? 2.6 : 1.8),
    lighting.accentRange ?? 190,
  );
  accent.position.set(0, 16, -48);
  root.add(accent);
}

function createMaterials(T, cfg) {
  const colors = cfg.colors;
  const road = new T.MeshStandardMaterial({
    color: colors.road,
    roughness: cfg.materials.roadRoughness,
    metalness: cfg.materials.roadMetalness,
    emissive: colors.roadEmissive,
    emissiveIntensity: cfg.materials.roadEmissiveIntensity,
    side: T.DoubleSide,
  });
  const shoulder = new T.MeshStandardMaterial({
    color: colors.shoulder,
    roughness: 0.66,
    metalness: 0.34,
    emissive: colors.roadEmissive,
    emissiveIntensity: 0.18,
    side: T.DoubleSide,
  });
  const glass = new T.MeshPhysicalMaterial({
    color: colors.glass,
    emissive: colors.glass,
    emissiveIntensity: 0.3,
    roughness: 0.06,
    metalness: 0.18,
    transparent: true,
    opacity: 0.34,
    transmission: 0.45,
    side: T.DoubleSide,
  });
  const glow = makeGlowMaterial(T, colors.rail, 1.1);
  return {
    road,
    branchRoad: new T.MeshStandardMaterial({
      color: colors.road,
      roughness: Math.max(0.12, cfg.materials.roadRoughness - 0.08),
      metalness: cfg.materials.roadMetalness,
      emissive: colors.rail,
      emissiveIntensity: 0.18,
      side: T.DoubleSide,
    }),
    shoulder,
    rail: makeGlowMaterial(T, colors.rail, 0.85),
    center: makeGlowMaterial(T, colors.center, 0.78),
    marker: makeGlowMaterial(T, colors.marker, 0.92),
    glass,
    glow,
    coin: new T.MeshStandardMaterial({
      color: colors.coin,
      roughness: 0.2,
      metalness: 0.9,
      emissive: colors.coin,
      emissiveIntensity: 0.72,
    }),
    pad: new T.MeshStandardMaterial({
      color: colors.pad,
      roughness: 0.18,
      metalness: 0.74,
      emissive: colors.pad,
      emissiveIntensity: 1.25,
    }),
    distant: new T.MeshStandardMaterial({
      color: colors.distant,
      roughness: 0.55,
      metalness: 0.38,
      emissive: colors.roadEmissive,
      emissiveIntensity: 0.18,
    }),
    mountain: new T.MeshStandardMaterial({
      color: colors.distant,
      roughness: 0.78,
      metalness: 0.05,
      emissive: colors.roadEmissive,
      emissiveIntensity: 0.12,
      flatShading: true,
    }),
    crystal: new T.MeshStandardMaterial({
      color: colors.glass,
      roughness: 0.18,
      metalness: 0.62,
      emissive: colors.glass,
      emissiveIntensity: 0.84,
      transparent: true,
      opacity: 0.86,
    }),
  };
}

function makeGlowMaterial(T, color, intensity = 1) {
  return new T.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.24,
    metalness: 0.58,
  });
}

function closestByRaycast(T, pos, roadMeshes) {
  if (!pos || !roadMeshes.length || !Number.isFinite(pos.y)) return null;
  const raycaster = closestByRaycast._raycaster || (closestByRaycast._raycaster = new T.Raycaster());
  const origin = closestByRaycast._origin || (closestByRaycast._origin = new T.Vector3());
  const down = closestByRaycast._down || (closestByRaycast._down = new T.Vector3(0, -1, 0));
  origin.copy(pos);
  origin.y += 2;
  raycaster.near = 0;
  raycaster.far = 170;
  raycaster.set(origin, down);
  const hits = raycaster.intersectObjects(roadMeshes, false);
  if (!hits.length) return null;
  const hit = hits[0];
  const samples = hit.object.userData.__boundsSamples || hit.object.userData.__chunkRef?.boundsData || [];
  let best = null;
  let bestCost = Infinity;
  for (const sample of samples) {
    const d = hit.point.distanceToSquared(sample.center);
    if (d < bestCost) {
      bestCost = d;
      best = sample;
    }
  }
  return best;
}

function makeClosestResult(pos, sample) {
  const delta = pos.clone().sub(sample.center);
  const lateral = delta.dot(sample.binormal);
  const along = delta.dot(sample.forward);
  return {
    ...sample,
    lateral,
    along,
    s: sample.s + clamp(along, -8, 8),
    valid: true,
  };
}

function makeBoundsSample(sample, roadWidth, route, chunkId) {
  return {
    center: sample.center.clone(),
    forward: sample.tangent.clone(),
    binormal: sample.right.clone(),
    normal: sample.normal.clone(),
    t: sample.t,
    s: sample.s,
    chunkId,
    route,
    roadWidth,
  };
}

function makeInteractable(type, mesh, chunkId, userData) {
  return {
    id: `${type}-${chunkId}-${mesh.id}`,
    type,
    chunkId,
    mesh,
    position: mesh.position,
    rotation: mesh.rotation,
    userData,
    hide() {
      this.userData.active = false;
      this.mesh.visible = false;
    },
    collect() {
      this.hide();
    },
    updateVisual(dt = 0.016) {
      if (this.type === 'coin') this.mesh.rotation.y += dt * 3;
      if (this.type === 'nitro_pad') this.mesh.position.y += Math.sin((this.mesh.userData.phase || 0) + dt) * 0.001;
    },
  };
}

function addBox(T, parent, geo, mat, scale, pos, tangent, right, normal) {
  const mesh = new T.Mesh(geo, mat);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  orientObject(T, mesh, pos, tangent, right, normal);
  applyShadowRole(mesh, inferShadowRole(scale));
  parent.add(mesh);
  return mesh;
}

function applyShadowRole(mesh, role) {
  if (!mesh) return mesh;
  if (role === 'road') {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
  } else if (role === 'large') {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  } else if (role === 'small') {
    mesh.castShadow = true;
    mesh.receiveShadow = false;
  } else {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }
  return mesh;
}

function inferShadowRole(scale = [1, 1, 1]) {
  const [sx = 1, sy = 1, sz = 1] = scale;
  if (sy > 2.4 || sx > 4 || sz > 4) return 'large';
  if (sx > 1.5 || sz > 1.5) return 'road';
  return 'none';
}

function orientObject(T, obj, pos, tangent, right, normal) {
  const xAxis = right.clone().normalize();
  const yAxis = normal.clone().normalize();
  const zAxis = tangent.clone().normalize();
  const matrix = new T.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  obj.position.copy(pos);
  obj.quaternion.setFromRotationMatrix(matrix);
}

function branchAlpha(t, start, end) {
  if (t <= start || t >= end) return 0;
  const mid = (start + end) * 0.5;
  if (t <= mid) return smoothstep(start, mid, t);
  return smoothstep(end, mid, t);
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function worldUpLike(normal) {
  if (!normal) return new THREE.Vector3(0, 1, 0);
  return normal.y > 0.72 ? normal : new THREE.Vector3(0, 1, 0);
}

function mergeConfig(base, override) {
  const next = { ...base, ...override };
  next.colors = { ...base.colors, ...(override.colors || {}) };
  next.materials = { ...base.materials, ...(override.materials || {}) };
  next.features = { ...base.features, ...(override.features || {}) };
  next.theme = { ...base.theme, ...(override.theme || {}) };
  next.surfaceTuning = { ...base.surfaceTuning, ...(override.surfaceTuning || {}) };
  return next;
}

function createRandom(seed) {
  let value = Math.floor(seed) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
