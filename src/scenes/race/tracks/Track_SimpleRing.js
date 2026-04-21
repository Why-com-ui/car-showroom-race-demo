import * as THREE_NS from 'three';

/**
 * ✅ 兜底赛道：霓虹环形赛道（不用任何 glb）
 * 视觉：暗底 + 霓虹边缘 + 发光拱门 + 漂浮广告牌（轻量）
 */
export function createTrack(THREE, opts = {}) {
  const innerR = opts.innerR ?? 10;
  const outerR = opts.outerR ?? 16;
  const center = opts.center ?? new THREE.Vector3(0, 0, 0);

  const root = new THREE.Object3D();

  // --- 地面 ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ color: 0x05060b, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // --- 道路（环） ---
  const road = new THREE.Mesh(
    new THREE.RingGeometry(innerR, outerR, 256),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.25,
      side: THREE.DoubleSide,
    })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  root.add(road);

  // --- 霓虹边缘（内外） ---
  const neonMatA = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
  const neonMatB = new THREE.MeshBasicMaterial({ color: 0xa78bfa, side: THREE.DoubleSide });

  const innerEdge = new THREE.Mesh(new THREE.RingGeometry(innerR - 0.07, innerR + 0.07, 256), neonMatA);
  const outerEdge = new THREE.Mesh(new THREE.RingGeometry(outerR - 0.07, outerR + 0.07, 256), neonMatB);

  innerEdge.rotation.x = outerEdge.rotation.x = -Math.PI / 2;
  innerEdge.position.y = outerEdge.position.y = 0.03;
  root.add(innerEdge, outerEdge);

  // --- 发光拱门（“隧道段”的感觉） ---
  const midR = (innerR + outerR) * 0.5;
  const archGeo = new THREE.TorusGeometry(midR, 0.08, 12, 64, Math.PI);
  const archMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = center.x + Math.cos(a) * midR;
    const z = center.z + Math.sin(a) * midR;

    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(x, 2.2, z);
    arch.rotation.y = -a + Math.PI / 2;
    root.add(arch);
  }

  // --- 漂浮广告牌（轻量） ---
  const signGeo = new THREE.PlaneGeometry(2.8, 1.2);
  const signMat = new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = outerR + 4;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;

    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(x, 2.0, z);
    sign.rotation.y = -a;
    root.add(sign);
  }

  // --- checkpoints（按顺序绕圈） ---
  const checkpoints = [];
  const cpCount = opts.checkpointCount ?? 10;
  // 修复 Bug: cpRadius 默认值稍微大一点，防止车走外道时判定不到
  const cpRadius = opts.checkpointRadius ?? 4.0;

  for (let i = 0; i < cpCount; i++) {
    const a = (i / cpCount) * Math.PI * 2;
    const x = center.x + Math.cos(a) * midR;
    const z = center.z + Math.sin(a) * midR;
    checkpoints.push({
      center: new THREE.Vector3(x, 0, z),
      radius: cpRadius,
    });
  }

  // --- spawn ---
  // 放在 (0, 0, midR)
  const spawnPos = new THREE.Vector3(center.x, 0, center.z + midR);
  // 修复 Bug: 之前的 Math.PI 是面向 -Z (圆心)，导致开局撞墙。
  // 环形赛道逆时针/顺时针切线方向应该是 X 轴方向。
  // 在 (0, R) 处，切线指向 +X (如果逆时针跑)。
  // Yaw 0 = +Z, Yaw -PI/2 = +X.
  const spawnYaw = -Math.PI / 2; 

  // --- bounds：SDF ---
  const bounds = {
    fn(x, z) {
      const dx = x - center.x;
      const dz = z - center.z;
      const r = Math.sqrt(dx * dx + dz * dz);

      if (r < innerR) return innerR - r;      // inside hole
      if (r > outerR) return r - outerR;      // outside
      return -Math.min(r - innerR, outerR - r); // valid
    },

    clampPosition(pos, margin = 0.35) {
      const dx = pos.x - center.x;
      const dz = pos.z - center.z;
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r < 1e-6) return;

      const minR = innerR + margin;
      const maxR = outerR - margin;
      const clampedR = Math.max(minR, Math.min(maxR, r));
      const k = clampedR / r;
      pos.x = center.x + dx * k;
      pos.z = center.z + dz * k;
    },

    meta: { type: 'ring', center, innerR, outerR },
  };

  return {
    root,
    spawn: { position: spawnPos, yaw: spawnYaw },
    checkpoints,
    bounds,
  };
}