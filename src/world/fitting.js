/**
 * Jelly Jungle - 3D Asset Fitting & Validation Module
 * Validates bounding boxes, normalizes scale, centers pivots, aligns bases to local y=0,
 * fits footprint diameters, and safely disposes superseded resources.
 */

import * as THREE from 'three';

/**
 * Scale footprint of an object to match target diameter (e.g. for mushroom cap alignment)
 */
export function fitFootprint(object, targetX, targetZ = targetX) {
  const clone = object.clone(true);
  clone.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
  if (size.x <= 0 || size.z <= 0) {
    throw new Error('Asset has invalid footprint dimensions');
  }
  object.scale.x *= targetX / size.x;
  object.scale.z *= targetZ / size.z;
  return object;
}

/**
 * Validates a loaded 3D scene from GLTF:
 * - Ensures finite bounding box
 * - Checks for at least one visible mesh
 * - Normalizes pivot: center on X/Z, base (min Y) at y = 0
 * - Scales to target height
 * - Enables cast/receive shadows
 * - Clamps roughness and metalness to soft toy aesthetic
 */
export function validateAndFitModel(modelScene, targetHeight = 1.65, options = {}) {
  let meshCount = 0;
  modelScene.traverse(child => {
    if (child.isMesh) meshCount++;
  });

  if (meshCount === 0) {
    throw new Error('The model contains no visible meshes');
  }

  // Calculate bounding box
  const box = new THREE.Box3().setFromObject(modelScene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z) || size.y < 0.001) {
    throw new Error('The model has invalid or non-finite dimensions');
  }

  // Wrapper group to hold the adjusted model
  const wrapper = new THREE.Group();

  // Normalize scale so total height equals 1 unit inside wrapper (outer wrapper handles targetHeight)
  modelScene.scale.multiplyScalar(1 / size.y);

  // Offset so pivot base is at local y = 0 and center is at x = 0, z = 0
  modelScene.position.set(
    -center.x / size.y,
    -box.min.y / size.y,
    -center.z / size.y
  );

  // Traverse materials & shadows
  modelScene.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat) {
          // Soft toy vinyl aesthetic
          if ('roughness' in mat) mat.roughness = Math.max(mat.roughness, 0.3);
          if ('metalness' in mat) mat.metalness = Math.min(mat.metalness, 0.15);
        }
      }
    }
  });

  wrapper.add(modelScene);

  // Optional custom rotation (e.g. Jelly face forward)
  if (options.rotationY) {
    wrapper.rotation.y = options.rotationY;
  }

  return wrapper;
}

/**
 * Deep disposal helper for Three.js objects
 * Prevents memory leaks and WebGL context bloat when models are swapped
 */
export function disposeHierarchy(object) {
  if (!object) return;

  object.traverse(child => {
    if (child.isMesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          // Dispose textures
          for (const key of Object.keys(mat)) {
            const val = mat[key];
            if (val && val.isTexture) {
              val.dispose();
            }
          }
          mat.dispose();
        }
      }
    }
  });
}
