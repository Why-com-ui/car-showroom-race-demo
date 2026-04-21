// src/core/Assets.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 资源管理：
 * - loadGLTF(url) 缓存
 * - cloneGLTFScene(gltf) 深克隆(材质/几何体)
 * - disposeObject3D(obj) 释放 GPU 资源
 */

export class Assets {
  constructor() {
    this._gltfLoader = new GLTFLoader();
    this._gltfCache = new Map(); // url -> Promise<gltf>
  }

  loadGLTF(url) {
    if (this._gltfCache.has(url)) return this._gltfCache.get(url);

    const p = new Promise((resolve, reject) => {
      this._gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (err) => reject(err)
      );
    });

    this._gltfCache.set(url, p);
    return p;
  }

  /**
   * 深克隆 gltf.scene（含材质/几何体 clone）
   */
  cloneGLTFScene(gltf) {
    const root = gltf.scene.clone(true);

    root.traverse((n) => {
      if (!n.isMesh) return;

      // clone geometry/material，避免不同实例互相影响
      if (n.geometry) n.geometry = n.geometry.clone();

      if (n.material) {
        if (Array.isArray(n.material)) {
          n.material = n.material.map((m) => (m ? m.clone() : m));
        } else {
          n.material = n.material.clone();
        }
      }

      n.castShadow = true;
      n.receiveShadow = true;
    });

    return root;
  }

  /**
   * 释放 Object3D 中所有 mesh 的 geometry/material
   * ⚠️ 修复 Bug：不应该释放 Texture，因为 Texture 依然存在于 this._gltfCache 中。
   * 如果释放了 Texture，下次从缓存 clone 出来的模型就会变黑或报错。
   */
  disposeObject3D(obj) {
    if (!obj) return;

    obj.traverse((n) => {
      if (!n.isMesh) return;

      if (n.geometry) n.geometry.dispose?.();

      const disposeMaterial = (m) => {
        if (!m) return;
        // 仅释放材质本身，保留贴图（因为贴图可能被 cached GLTF 引用）
        m.dispose?.();
      };

      if (Array.isArray(n.material)) n.material.forEach(disposeMaterial);
      else disposeMaterial(n.material);
    });
  }

  /**
   * 工具：自动把模型贴地（返回 yOffset）
   */
  static liftToGround(obj, lift = 0.2) {
    const box = new THREE.Box3().setFromObject(obj);
    const yOffset = -box.min.y + lift;
    obj.position.y += yOffset;
    return yOffset;
  }
}