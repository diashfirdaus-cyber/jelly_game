/**
 * Jelly Jungle - Asset Registry & Replacement Module
 * Manages asset families ('jelly', 'mushroom', 'tree'), handles Classic vs Tripo AI modes,
 * loads GLB models with GLTFLoader, validates geometry, and safely swaps models without state loss.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createProceduralJelly,
  createProceduralMushroom,
  createProceduralTree
} from './procedural.js';
import {
  fitFootprint,
  validateAndFitModel,
  disposeHierarchy
} from './fitting.js';

export class AssetRegistry {
  constructor() {
    this.loader = new GLTFLoader();
    this.models = {}; // Loaded base templates: { jelly: Group, mushroom: Group, tree: Group }
    this.swaps = [];  // List of active instance slots in the world
    this.mode = 'tripo'; // 'tripo' or 'classic'
    this.loadVersion = 0; // Async race condition prevention
  }

  /**
   * Registers a replaceable asset instance slot in the scene
   */
  registerSlot(kind, parentGroup, x, y, z, scale = 1, rotationY = 0) {
    const wrapper = new THREE.Group();
    wrapper.position.set(x, y, z);
    wrapper.rotation.y = rotationY;
    wrapper.scale.setScalar(scale);
    parentGroup.add(wrapper);

    // Create procedural variant for Classic mode
    let classicObj;
    if (kind === 'jelly') {
      classicObj = createProceduralJelly();
    } else if (kind === 'mushroom') {
      classicObj = createProceduralMushroom();
    } else {
      classicObj = createProceduralTree();
    }

    // Normalize classic model pivot & scale
    const box = new THREE.Box3().setFromObject(classicObj);
    const size = box.getSize(new THREE.Vector3());
    classicObj.scale.setScalar(1 / size.y);
    classicObj.position.y = -box.min.y / size.y;
    wrapper.add(classicObj);

    const slot = {
      kind,
      wrapper,
      classic: classicObj,
      tripo: null,
      fitDiameter: null
    };

    // If Tripo model is already loaded, instantiate it immediately
    if (this.models[kind]) {
      slot.tripo = this.models[kind].clone(true);
      wrapper.add(slot.tripo);
      slot.tripo.visible = (this.mode === 'tripo');
      slot.classic.visible = (this.mode !== 'tripo');
    }

    this.swaps.push(slot);
    return slot;
  }

  /**
   * Load base replacement models from /models/ directory
   */
  async loadDefaultModels(onProgress) {
    const currentVersion = ++this.loadVersion;
    const families = ['jelly', 'mushroom', 'tree'];
    let loadedCount = 0;

    const results = await Promise.allSettled(
      families.map(async (kind) => {
        const gltf = await this.loader.loadAsync(`/models/${kind}.glb`);
        if (currentVersion !== this.loadVersion) return kind; // Discard stale load

        const fitted = validateAndFitModel(gltf.scene, 1.0, {
          rotationY: kind === 'jelly' ? -Math.PI / 2 : 0
        });

        this.models[kind] = fitted;

        // Apply to all matching slots
        for (const slot of this.swaps.filter(s => s.kind === kind)) {
          if (slot.tripo) {
            slot.wrapper.remove(slot.tripo);
            disposeHierarchy(slot.tripo);
          }
          slot.tripo = fitted.clone(true);
          if (slot.fitDiameter) {
            fitFootprint(slot.tripo, slot.fitDiameter);
          }
          slot.wrapper.add(slot.tripo);
          slot.tripo.visible = (this.mode === 'tripo');
          slot.classic.visible = (this.mode !== 'tripo');
        }

        loadedCount++;
        if (onProgress) onProgress(loadedCount, families.length);
        return kind;
      })
    );

    return results;
  }

  /**
   * Switch between 'tripo' and 'classic'
   */
  setMode(mode) {
    this.mode = mode;
    for (const slot of this.swaps) {
      if (slot.tripo) {
        slot.tripo.visible = (mode === 'tripo');
      }
      slot.classic.visible = (mode === 'classic' || !slot.tripo);
    }
  }

  /**
   * Import custom character model (.glb)
   */
  async importCharacter(arrayBuffer) {
    const gltf = await this.loader.parseAsync(arrayBuffer, '');
    const fitted = validateAndFitModel(gltf.scene, 1.0, {
      rotationY: 0
    });

    this.models['jelly'] = fitted;

    for (const slot of this.swaps.filter(s => s.kind === 'jelly')) {
      if (slot.tripo) {
        slot.wrapper.remove(slot.tripo);
        disposeHierarchy(slot.tripo);
      }
      slot.tripo = fitted.clone(true);
      slot.wrapper.add(slot.tripo);
      slot.tripo.visible = (this.mode === 'tripo');
      slot.classic.visible = (this.mode !== 'tripo');
    }

    return true;
  }
}
