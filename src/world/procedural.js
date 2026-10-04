/**
 * Jelly Jungle - Procedural Models & Materials Module
 * Constructs the rich sculpted toy world models for Classic mode:
 * Jelly character, spring mushroom, tropical palm tree, arches, and portal.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Reusable sphere geometry cache
const sphereGeomCache = new Map();
export function getSphereGeom(widthSegments = 20, heightSegments = 14) {
  const key = `s_${widthSegments}_${heightSegments}`;
  if (!sphereGeomCache.has(key)) {
    sphereGeomCache.set(key, new THREE.SphereGeometry(1, widthSegments, heightSegments));
  }
  return sphereGeomCache.get(key);
}

// Material generator helper
export function createMat(color, roughness = 0.62, metalness = 0.0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

// Palette of materials matching the visual direction
export const MATERIALS = {
  grass: createMat('#a8d78a'),
  edge: createMat('#679754'),
  rock: createMat('#bcafa0'),
  rockDark: createMat('#a79283'),
  stem: createMat('#e7d9ad'),
  pink: createMat('#ee97b3', 0.32, 0.0),
  mint: createMat('#65b5a2'),
  wood: createMat('#bd8d76'),
  leaf: createMat('#66b6a4'),
  cream: createMat('#fff2c6'),
  dark: createMat('#193b34'),
  gold: createMat('#f6c363', 0.3, 0.3)
};

// Mesh helper
export function addMesh(geom, mat, parent, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Scaled sphere mesh helper
export function addScaledSphere(parent, mat, x, y, z, sx, sy, sz) {
  const mesh = addMesh(getSphereGeom(), mat, parent, x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

// Cylinder mesh helper
export function addCylinder(parent, mat, rTop, rBottom, height, x = 0, y = 0, z = 0, radialSegments = 32) {
  const geom = new THREE.CylinderGeometry(rTop, rBottom, height, radialSegments);
  return addMesh(geom, mat, parent, x, y, z);
}

// Rounded box mesh helper
export function addRoundedBox(parent, mat, width, height, depth, segments = 2, radius = 0.1, x = 0, y = 0, z = 0) {
  const geom = new RoundedBoxGeometry(width, height, depth, segments, radius);
  return addMesh(geom, mat, parent, x, y, z);
}

// Torus ring helper
export function addTorus(parent, color, radius, tube, x = 0, y = 0, z = 0) {
  const geom = new THREE.TorusGeometry(radius, tube, 10, 64);
  const mat = createMat(color, 0.32, 0.12);
  return addMesh(geom, mat, parent, x, y, z);
}

/**
 * 1. Procedural Jelly Character
 * Candy-pink soft-vinyl character, stubby feet, glossy dark oval eyes with highlights,
 * rosy cheeks, smile, and mint two-leaf sprout.
 */
export function createProceduralJelly() {
  const group = new THREE.Group();

  // Main jelly blob body
  addScaledSphere(group, MATERIALS.pink, 0, 0.57, 0, 0.62, 0.62, 0.53);

  // Stubby cute feet / cheeks
  addScaledSphere(group, MATERIALS.pink, -0.5, 0.38, 0, 0.22, 0.22, 0.2);
  addScaledSphere(group, MATERIALS.pink, 0.5, 0.38, 0, 0.22, 0.22, 0.2);

  // Big dark oval eyes with glossy white highlights
  for (const eyeX of [-0.23, 0.23]) {
    // Dark pupil
    addScaledSphere(group, MATERIALS.dark, eyeX, 0.69, 0.47, 0.085, 0.125, 0.045);
    // Catchlight highlight
    addScaledSphere(group, MATERIALS.cream, eyeX - 0.02, 0.73, 0.505, 0.025, 0.038, 0.015);
  }

  // Rosy cheeks
  const blushMat = createMat('#f7759d', 0.4, 0.0);
  addScaledSphere(group, blushMat, -0.36, 0.55, 0.43, 0.08, 0.05, 0.03);
  addScaledSphere(group, blushMat, 0.36, 0.55, 0.43, 0.08, 0.05, 0.03);

  // Cheerful smile (half torus)
  const smileGeom = new THREE.TorusGeometry(0.095, 0.018, 6, 16, Math.PI);
  const smile = addMesh(smileGeom, MATERIALS.dark, group, 0, 0.45, 0.51);
  smile.rotation.z = Math.PI;

  // Mint two-leaf sprout on head
  const leaf1 = addScaledSphere(group, MATERIALS.leaf, 0.08, 1.21, 0, 0.17, 0.08, 0.08);
  leaf1.rotation.z = 0.6;
  const leaf2 = addScaledSphere(group, MATERIALS.leaf, -0.06, 1.22, 0.02, 0.15, 0.07, 0.07);
  leaf2.rotation.z = -0.5;

  return group;
}

/**
 * 2. Procedural Spring Mushroom
 * Broad coral-pink dome with raised ivory spots, cream gills, and short thick stem.
 */
export function createProceduralMushroom() {
  const group = new THREE.Group();

  // Short thick stem
  addCylinder(group, MATERIALS.stem, 0.24, 0.38, 0.85, 0, 0.42, 0, 14);

  // Broad coral-pink cap dome
  addScaledSphere(group, MATERIALS.pink, 0, 1.02, 0, 1.0, 0.37, 1.0);

  // Cream gills underside
  const gills = addMesh(new THREE.ConeGeometry(0.96, 0.25, 16, 1, true), MATERIALS.cream, group, 0, 0.9, 0);
  gills.rotation.x = Math.PI;

  // 7 raised ivory spots across cap
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    const dist = 0.4 + (i % 2) * 0.24;
    addScaledSphere(
      group,
      MATERIALS.cream,
      Math.cos(angle) * dist,
      1.32 - dist * 0.12,
      Math.sin(angle) * dist,
      0.12,
      0.03,
      0.11
    );
  }

  return group;
}

/**
 * 3. Procedural Tropical Palm Tree
 * Curved peach-brown trunk, oversized rounded turquoise/mint palm leaves, fruit clusters.
 */
export function createProceduralTree() {
  const group = new THREE.Group();

  // Curved peach-brown trunk
  const trunk = addCylinder(group, MATERIALS.wood, 0.12, 0.22, 2.6, 0, 1.3, 0, 8);
  trunk.rotation.z = -0.08;

  // 7 oversized rounded turquoise/mint palm leaves
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI * 2) / 7;
    const leaf = addScaledSphere(
      group,
      MATERIALS.leaf,
      Math.cos(angle) * 0.58,
      2.55,
      Math.sin(angle) * 0.58,
      0.32,
      0.18,
      1.0
    );
    leaf.rotation.y = -angle + Math.PI / 2;
    leaf.rotation.z = 0.15;
  }

  // Peach/warm apricot fruit clusters
  const peachMat = createMat('#f8a078', 0.5);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    addScaledSphere(group, peachMat, Math.cos(a) * 0.22, 2.38, Math.sin(a) * 0.22, 0.12, 0.12, 0.12);
  }

  return group;
}

/**
 * Creates dynamic text billboard for island signs, finish portal, and start arch
 */
export function createSignBillboard(text, x = 0, y = 0, z = 0, color = '#467856', scale = 0.7) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = color;
  ctx.font = '700 100px sans-serif';
  const width = ctx.measureText(text).width;
  if (width > 465) {
    ctx.font = `700 ${Math.floor((100 * 465) / width)}px sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 96);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.82
  });

  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(x, y, z);
  sprite.scale.set(scale * 2.67, scale, 1);
  return sprite;
}
