import * as THREE from 'three';

const CONFIG = {
  chunkLength: 96,
  chunkSegments: 40,
  roadWidth: 28,
  visibleChunks: 10,
  recycleDist: 96,
  turnScale: 0.62,
  maxSlope: 0.045,
  colors: {
    fog: 0x6a3c22,
    road: 0x4a2d22,
    roadEmissive: 0x6f341c,
    shoulder: 0x2d211b,
    edge: 0xffa12b,
    center: 0xffdf8a,
    hazard: 0xff5a1f,
    metal: 0x46362e,
    wall: 0x56351f,
    coin: 0xffe39b,
    pad: 0xff9c29,
  },
};

export function createTrack(THREE_Instance, opts = {}) {
  const T = THREE_Instance || THREE;
  const rng = createRandom(opts.seed || 2026);
  const root = new T.Object3D();
  root.name = 'Track_FurnaceHighway';

  const activeChunks = [];
  const roadMeshes = [];
  const interactables = [];
  let totalDist = 0;
  let lastPlayerS = 0;
  let nextChunkId = 0;

  const cursor = {
    pos: new T.Vector3(0, 0, 0),
    dir: new T.Vector3(0, 0, -1),
    right: new T.Vector3(1, 0, 0),
  };

  const roadMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.road,
    roughness: 0.48,
    metalness: 0.32,
    emissive: CONFIG.colors.roadEmissive,
    emissiveIntensity: 0.5,
    side: T.DoubleSide,
  });
  const shoulderMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.shoulder,
    roughness: 0.66,
    metalness: 0.26,
    emissive: 0x3c1d10,
    emissiveIntensity: 0.26,
    side: T.DoubleSide,
  });
  const railMat = makeGlowMaterial(T, CONFIG.colors.edge, 0.95);
  const centerMat = makeGlowMaterial(T, CONFIG.colors.center, 0.78);
  const hazardMat = makeGlowMaterial(T, CONFIG.colors.hazard, 0.88);
  const metalMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.metal,
    roughness: 0.56,
    metalness: 0.64,
    emissive: 0x33130a,
    emissiveIntensity: 0.22,
  });
  const wallMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.wall,
    roughness: 0.62,
    metalness: 0.34,
    emissive: 0x3a1608,
    emissiveIntensity: 0.24,
  });
  const coinMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.coin,
    roughness: 0.2,
    metalness: 0.9,
    emissive: CONFIG.colors.coin,
    emissiveIntensity: 0.72,
  });
  const padMat = new T.MeshStandardMaterial({
    color: CONFIG.colors.pad,
    roughness: 0.22,
    metalness: 0.72,
    emissive: CONFIG.colors.pad,
    emissiveIntensity: 1.25,
  });

  const boxGeo = new T.BoxGeometry(1, 1, 1);
  const coinGeo = new T.IcosahedronGeometry(0.86, 1);
  const padGeo = new T.BoxGeometry(5.4, 0.14, 3.0);
  const smokeGeo = new T.CylinderGeometry(0.36, 0.52, 5.8, 8);
  const dummy = new T.Object3D();
  const worldUp = new T.Vector3(0, 1, 0);

  addTrackLights(T, root);
  addFurnaceHaze(T, root, rng);

  class Chunk {
    constructor(id) {
      this.id = id;
      this.root = new T.Group();
      this.root.name = `FurnaceChunk_${id}`;
      this.boundsData = [];
      this.startDist = 0;
      this.endDist = 0;
      this.roadGeo = null;
      this.roadMesh = null;
      this.shoulderGeo = null;
      this.shoulderMesh = null;
    }

    generate(startPos, startDir) {
      const startDist = totalDist;
      const points = [startPos.clone()];
      let currPos = startPos.clone();
      let currDir = startDir.clone();
      const step = CONFIG.chunkLength / 5;

      for (let i = 0; i < 5; i++) {
        totalDist += step;
        const sBend = Math.sin(totalDist * 0.02) * 0.055;
        const heavyBend = Math.sin(totalDist * 0.007 + 1.4) * 0.035;
        const wobble = (rng() - 0.5) * 0.012;
        currDir.applyAxisAngle(worldUp, (sBend + heavyBend + wobble) * CONFIG.turnScale);
        const targetPitch = Math.sin(totalDist * 0.006 + this.id * 0.35) * 0.025;
        currDir.y += (targetPitch - currDir.y) * 0.28;
        currDir.y = clamp(currDir.y, -CONFIG.maxSlope, CONFIG.maxSlope);
        currDir.normalize();
        if (currPos.y > 18) currDir.y -= 0.02;
        if (currPos.y < -4) currDir.y += 0.02;
        currPos.addScaledVector(currDir, step);
        points.push(currPos.clone());
      }

      this.startDist = startDist;
      this.endDist = totalDist;
      cursor.pos.copy(currPos);
      cursor.dir.copy(currDir);

      const curve = new T.CatmullRomCurve3(points, false, 'centripetal', 0.18);
      const samples = [];
      const count = CONFIG.chunkSegments + 1;
      const positions = new Float32Array(count * 2 * 3);
      const uvs = new Float32Array(count * 2 * 2);
      const indices = [];
      const half = CONFIG.roadWidth / 2;
      const lastRight = cursor.right.clone();

      for (let i = 0; i <= CONFIG.chunkSegments; i++) {
        const t = i / CONFIG.chunkSegments;
        const center = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const right = new T.Vector3().crossVectors(tangent, worldUp);
        if (right.lengthSq() < 1e-6) right.copy(lastRight);
        else right.normalize();
        if (right.dot(lastRight) < 0) right.negate();
        lastRight.copy(right);
        const normal = new T.Vector3().crossVectors(right, tangent).normalize();
        const left = center.clone().addScaledVector(right, half);
        const rightEdge = center.clone().addScaledVector(right, -half);

        positions.set([left.x, left.y, left.z], i * 6);
        positions.set([rightEdge.x, rightEdge.y, rightEdge.z], i * 6 + 3);
        uvs.set([0, i], i * 4);
        uvs.set([1, i], i * 4 + 2);

        if (i < CONFIG.chunkSegments) {
          const a = i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }

        const s = this.startDist + t * (this.endDist - this.startDist);
        samples.push({ center, tangent, right, normal, t, s, chunkId: this.id });
        if (i % 2 === 0) this.boundsData.push({ center, forward: tangent, binormal: right, t, s, chunkId: this.id });
      }

      cursor.right.copy(lastRight);
      this.roadGeo = new T.BufferGeometry();
      this.roadGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
      this.roadGeo.setAttribute('uv', new T.BufferAttribute(uvs, 2));
      this.roadGeo.setIndex(indices);
      this.roadGeo.computeVertexNormals();
      this.roadGeo.computeBoundingSphere();
      this.roadMesh = new T.Mesh(this.roadGeo, roadMat);
      this.roadMesh.name = `RoadChunk_${this.id}`;
      this.roadMesh.userData.__chunkRef = this;
      this.roadMesh.frustumCulled = false;
      this.root.add(this.roadMesh);
      roadMeshes.push(this.roadMesh);

      const shoulderHalf = half + 5.2;
      const shoulderPositions = new Float32Array(count * 2 * 3);
      const shoulderUvs = new Float32Array(count * 2 * 2);
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        const left = sample.center.clone()
          .addScaledVector(sample.right, shoulderHalf)
          .addScaledVector(sample.normal, -0.04);
        const rightEdge = sample.center.clone()
          .addScaledVector(sample.right, -shoulderHalf)
          .addScaledVector(sample.normal, -0.04);
        shoulderPositions.set([left.x, left.y, left.z], i * 6);
        shoulderPositions.set([rightEdge.x, rightEdge.y, rightEdge.z], i * 6 + 3);
        shoulderUvs.set([0, i], i * 4);
        shoulderUvs.set([1, i], i * 4 + 2);
      }
      this.shoulderGeo = new T.BufferGeometry();
      this.shoulderGeo.setAttribute('position', new T.BufferAttribute(shoulderPositions, 3));
      this.shoulderGeo.setAttribute('uv', new T.BufferAttribute(shoulderUvs, 2));
      this.shoulderGeo.setIndex(indices);
      this.shoulderGeo.computeVertexNormals();
      this.shoulderGeo.computeBoundingSphere();
      this.shoulderMesh = new T.Mesh(this.shoulderGeo, shoulderMat);
      this.shoulderMesh.name = `FurnaceShoulder_${this.id}`;
      this.shoulderMesh.frustumCulled = false;
      this.root.add(this.shoulderMesh);

      this._addRoadDetails(samples);
      this._addFactorySet(samples);
      this._addCollectibles(samples);
      root.add(this.root);
    }

    _addRoadDetails(samples) {
      for (let i = 1; i < samples.length; i += 2) {
        const a = samples[i - 1];
        const b = samples[i];
        const len = a.center.distanceTo(b.center);
        const mid = a.center.clone().lerp(b.center, 0.5);
        const tangent = b.center.clone().sub(a.center).normalize();
        for (const side of [-1, 1]) {
          const pos = mid.clone().addScaledVector(a.right, side * (CONFIG.roadWidth / 2 + 0.22)).addScaledVector(a.normal, 0.32);
          addBox(T, this.root, boxGeo, railMat, [0.2, 0.55, len], pos, tangent, a.right, a.normal);
        }
        if (i % 4 === 1) {
          addBox(T, this.root, boxGeo, centerMat, [0.22, 0.08, len * 0.82], mid.clone().addScaledVector(a.normal, 0.06), tangent, a.right, a.normal);
        }
      }

      for (let i = 6; i < samples.length; i += 10) {
        const sample = samples[i];
        const side = Math.sin(sample.s * 0.045) > 0 ? 1 : -1;
        for (let k = 0; k < 3; k++) {
          const pos = sample.center.clone()
            .addScaledVector(sample.right, side * (2.0 + k * 1.35))
            .addScaledVector(sample.normal, 0.1)
            .addScaledVector(sample.tangent, k * 1.1);
          const arrow = addBox(T, this.root, boxGeo, hazardMat, [1.0, 0.08, 0.22], pos, sample.tangent, sample.right, sample.normal);
          arrow.rotation.z += side * 0.72;
        }
      }
    }

    _addFactorySet(samples) {
      for (let i = 4; i < samples.length; i += 8) {
        const sample = samples[i];
        const side = (i + this.id) % 2 === 0 ? 1 : -1;
        const offset = CONFIG.roadWidth / 2 + 42 + rng() * 24;
        const height = 8 + rng() * 18;
        const width = 8 + rng() * 10;
        const depth = 8 + rng() * 12;
        const base = sample.center.clone().addScaledVector(sample.right, side * offset);
        const pos = base.clone().addScaledVector(worldUp, height / 2 - 0.2);
        const building = addBox(T, this.root, boxGeo, metalMat, [width, height, depth], pos, sample.tangent, sample.right, worldUp);
        building.userData.floatAmp = 0;

        const doorPos = base.clone()
          .addScaledVector(sample.right, -side * (width * 0.5 + 0.04))
          .addScaledVector(worldUp, 3.0);
        addBox(T, this.root, boxGeo, hazardMat, [0.12, 5.2, depth * 0.72], doorPos, sample.tangent, sample.right, worldUp);

        if (i % 10 === 3) {
          const chimneyPos = base.clone()
            .addScaledVector(sample.right, side * (width * 0.35))
            .addScaledVector(sample.tangent, depth * 0.18)
            .addScaledVector(worldUp, height + 2.8);
          const chimney = new T.Mesh(smokeGeo, wallMat);
          chimney.position.copy(chimneyPos);
          chimney.name = 'FurnaceChimney';
          this.root.add(chimney);
          addBox(T, this.root, boxGeo, hazardMat, [2.2, 0.18, 2.2], chimneyPos.clone().addScaledVector(worldUp, 3.1), sample.tangent, sample.right, worldUp);
        }
      }

      if (this.id % 2 === 0) {
        const gateSample = samples[samples.length - 1];
        const gateCenter = gateSample.center.clone().addScaledVector(gateSample.normal, 0.2);
        for (const side of [-1, 1]) {
          const pillarPos = gateCenter.clone().addScaledVector(gateSample.right, side * (CONFIG.roadWidth / 2 + 5.5)).addScaledVector(worldUp, 5.4);
          addBox(T, this.root, boxGeo, wallMat, [1.1, 10.8, 1.1], pillarPos, gateSample.tangent, gateSample.right, worldUp);
          addBox(T, this.root, boxGeo, hazardMat, [0.22, 8.6, 0.22], pillarPos, gateSample.tangent, gateSample.right, worldUp);
        }
        addBox(T, this.root, boxGeo, hazardMat, [CONFIG.roadWidth + 8.4, 0.38, 1.0], gateCenter.clone().addScaledVector(worldUp, 10.6), gateSample.tangent, gateSample.right, worldUp);
        addBox(T, this.root, boxGeo, centerMat, [CONFIG.roadWidth + 6.2, 0.14, 0.62], gateCenter.clone().addScaledVector(worldUp, 9.3), gateSample.tangent, gateSample.right, worldUp);
      }
    }

    _addCollectibles(samples) {
      for (let i = 6; i < samples.length; i += 9) {
        const sample = samples[i];
        const offset = Math.sin(sample.s * 0.05) * (CONFIG.roadWidth * 0.27);
        const pos = sample.center.clone().addScaledVector(sample.right, offset).addScaledVector(sample.normal, 2.8);
        const coin = new T.Mesh(coinGeo, coinMat);
        coin.position.copy(pos);
        coin.name = 'FurnaceCoin';
        this.root.add(coin);
        interactables.push(makeInteractable('coin', coin, this.id, { active: true, value: 100, radius: 2.5 }));
      }

      if (this.id % 2 === 0) {
        const sample = samples[Math.floor(samples.length * 0.62)];
        const offset = Math.sin(sample.s * 0.03) * (CONFIG.roadWidth * 0.22);
        const pos = sample.center.clone().addScaledVector(sample.right, offset).addScaledVector(sample.normal, 0.14);
        const pad = new T.Mesh(padGeo, padMat.clone());
        pad.name = 'NitroPad';
        orientObject(T, pad, pos, sample.tangent, sample.right, sample.normal);
        pad.userData.phase = rng() * Math.PI * 2;
        this.root.add(pad);
        interactables.push(makeInteractable('nitro_pad', pad, this.id, { active: true, nitro: 35, value: 0, radius: 4.1 }));
      }
    }

    dispose() {
      this.roadGeo?.dispose?.();
      this.shoulderGeo?.dispose?.();
      root.remove(this.root);
      const roadIndex = roadMeshes.indexOf(this.roadMesh);
      if (roadIndex >= 0) roadMeshes.splice(roadIndex, 1);
      for (let i = interactables.length - 1; i >= 0; i--) {
        if (interactables[i].chunkId === this.id) interactables.splice(i, 1);
      }
    }
  }

  for (let i = 0; i < CONFIG.visibleChunks; i++) {
    const chunk = new Chunk(nextChunkId++);
    chunk.generate(cursor.pos, cursor.dir);
    activeChunks.push(chunk);
  }

  const spawnSample = activeChunks[0].boundsData[3] || activeChunks[0].boundsData[0];

  function update(dt, playerPos) {
    for (const item of interactables) {
      if (item.type !== 'nitro_pad' || !item.userData.active) continue;
      item.mesh.userData.phase += dt * 5.2;
      item.mesh.material.emissiveIntensity = 1.0 + Math.sin(item.mesh.userData.phase) * 0.35;
    }

    if (!playerPos || activeChunks.length === 0) return;
    const closest = getClosest(playerPos, lastPlayerS);
    if (closest.valid) lastPlayerS = Math.max(lastPlayerS, closest.s ?? 0);

    while (activeChunks.length && lastPlayerS > activeChunks[0].endDist + CONFIG.recycleDist) {
      const old = activeChunks.shift();
      old.dispose();
      const chunk = new Chunk(nextChunkId++);
      chunk.generate(cursor.pos, cursor.dir);
      activeChunks.push(chunk);
    }
  }

  function getClosest(pos, hintS = lastPlayerS) {
    let best = null;
    let bestCost = Infinity;
    const hasHint = Number.isFinite(hintS) && hintS > 0;
    const minS = hasHint ? hintS - 140 : -Infinity;
    const maxS = hasHint ? hintS + 320 : Infinity;

    for (const chunk of activeChunks) {
      for (const b of chunk.boundsData) {
        if (b.s < minS || b.s > maxS) continue;
        const dx = pos.x - b.center.x;
        const dy = pos.y - b.center.y;
        const dz = pos.z - b.center.z;
        if (Math.abs(dy) > 70) continue;
        const sPenalty = hasHint ? (b.s - hintS) * (b.s - hintS) * 0.001 : 0;
        const cost = dx * dx + dz * dz + dy * dy * 0.35 + sPenalty;
        if (cost < bestCost) {
          bestCost = cost;
          best = b;
        }
      }
    }

    if (!best) {
      for (const chunk of activeChunks) {
        for (const b of chunk.boundsData) {
          const dx = pos.x - b.center.x;
          const dy = pos.y - b.center.y;
          const dz = pos.z - b.center.z;
          const cost = dx * dx + dz * dz + dy * dy * 0.2;
          if (cost < bestCost) {
            bestCost = cost;
            best = b;
          }
        }
      }
    }

    if (!best) return { valid: false, lateral: 9999, center: pos };
    const delta = pos.clone().sub(best.center);
    const lateral = delta.dot(best.binormal);
    const along = delta.dot(best.forward);
    return {
      ...best,
      lateral,
      along,
      s: best.s + clamp(along, -8, 8),
      roadWidth: CONFIG.roadWidth,
      valid: true,
    };
  }

  return {
    root,
    roadWidth: CONFIG.roadWidth,
    theme: {
      background: 0x4c2f22,
      fog: CONFIG.colors.fog,
      fogDensity: 0.00028,
      fogNear: 28,
      fogFar: 300,
    },
    spawn: {
      position: spawnSample.center.clone().add(new T.Vector3(0, 1.5, 0)),
      yaw: Math.atan2(spawnSample.forward.x, spawnSample.forward.z),
    },
    checkpoints: activeChunks.flatMap((chunk) => chunk.boundsData.filter((_, index) => index % 6 === 0).map((b) => ({
      center: b.center.clone(),
      radius: 7,
    }))).slice(0, 12),
    bounds: {
      fn: (x, z, pos3D) => {
        const p = pos3D || new T.Vector3(x, 0, z);
        const res = getClosest(p, lastPlayerS);
        if (!res.valid) return 100;
        if (Math.abs(p.y - res.center.y) > 45) return 100;
        return Math.abs(res.lateral) - CONFIG.roadWidth / 2;
      },
      clampPosition: (pos, margin = 0.8) => {
        const res = getClosest(pos, lastPlayerS);
        if (!res.valid) return;
        const limit = CONFIG.roadWidth / 2 - margin;
        const absLat = Math.abs(res.lateral);
        if (absLat <= limit) return;
        const push = Math.min(absLat - limit, 4.5);
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
  };
}

function makeGlowMaterial(T, color, intensity = 1) {
  return new T.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.28,
    metalness: 0.55,
  });
}

function addTrackLights(T, root) {
  root.add(new T.AmbientLight(0xffead2, 0.82));
  const hemi = new T.HemisphereLight(0xffc16b, 0x3a2115, 1.24);
  root.add(hemi);
  const key = new T.DirectionalLight(0xfff3d7, 1.75);
  key.position.set(40, 86, 32);
  root.add(key);
  const furnace = new T.PointLight(0xff8f24, 2.5, 170);
  furnace.position.set(0, 14, -48);
  root.add(furnace);
}

function addFurnaceHaze(T, root, rng) {
  const geo = new T.BufferGeometry();
  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * 220;
    positions[i * 3 + 1] = 3 + rng() * 42;
    positions[i * 3 + 2] = -rng() * 340;
  }
  geo.setAttribute('position', new T.BufferAttribute(positions, 3));
  const mat = new T.PointsMaterial({
    color: 0xffb15a,
    size: 0.36,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const sparks = new T.Points(geo, mat);
  sparks.name = 'FurnaceSparks';
  root.add(sparks);
}

function addBox(T, parent, geo, mat, scale, pos, tangent, right, normal) {
  const mesh = new T.Mesh(geo, mat);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  orientObject(T, mesh, pos, tangent, right, normal);
  parent.add(mesh);
  return mesh;
}

function orientObject(T, obj, pos, tangent, right, normal) {
  const xAxis = right.clone().normalize();
  const yAxis = normal.clone().normalize();
  const zAxis = tangent.clone().normalize();
  const matrix = new T.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  obj.position.copy(pos);
  obj.quaternion.setFromRotationMatrix(matrix);
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
    updateVisual() {
      if (this.type === 'coin') this.mesh.rotation.y += 0.04;
    },
  };
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
