/**
 * Jelly Jungle - 3D World & Scene Rendering Module
 * Manages Three.js scene, renderer, cameras, lighting, environment, terrain,
 * particle effects, animations, and visual transitions.
 */

import * as THREE from 'three';
import {
  createMat,
  MATERIALS,
  addMesh,
  addScaledSphere,
  addCylinder,
  addRoundedBox,
  addTorus,
  createSignBillboard
} from './procedural.js';
import { fitFootprint } from './fitting.js';

export class WorldManager {
  constructor(canvas, platforms, assetRegistry) {
    this.canvas = canvas;
    this.platforms = platforms;
    this.registry = assetRegistry;

    // 1. Scene & Environment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b8dfd3');
    this.scene.fog = new THREE.FogExp2('#bfdfd3', 0.006);

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    // Ambient spherical harmonics environment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envLight = new THREE.HemisphereLight('#e5fffa', '#789c83', 1.0);
    envScene.add(envLight);
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    envScene.clear();
    pmrem.dispose();

    // 3. Camera & Lighting
    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 360);
    this.camera.position.set(18, 18, 25);
    this.camera.lookAt(0, 1, -17);
    this.cameraTarget = new THREE.Vector3();

    // Warm golden sunlight
    this.sun = new THREE.DirectionalLight('#fff1d5', 2.6);
    this.sun.position.set(-18, 35, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -27,
      right: 27,
      top: 32,
      bottom: -32,
      near: 1,
      far: 100
    });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Soft sky and fill lights
    const hemiLight = new THREE.HemisphereLight('#e5fffa', '#789c83', 1.65);
    this.scene.add(hemiLight);

    const fillLight = new THREE.DirectionalLight('#d0f6eb', 0.85);
    fillLight.position.set(15, 12, -25);
    this.scene.add(fillLight);

    // 4. Object Collections
    this.platformMeshes = [];
    this.spinGroups = [];
    this.gemMeshes = [];
    this.effects = [];
    this.waterfalls = [];
    this.flags = [];
    this.time = 0;
    this.squash = 0;

    // 5. Construct Environment
    this.makeSky();
    this.makeWater();
    this.makeClouds();
    this.makeDistantIslands();

    // Construct course islands
    for (const plat of platforms) {
      this.makeIsland(plat);
    }

    // 6. Player Character
    this.player = new THREE.Group();
    this.scene.add(this.player);

    this.playerVisual = new THREE.Group();
    this.player.add(this.playerVisual);

    // Register player jelly asset slot
    this.playerSlot = this.registry.registerSlot('jelly', this.playerVisual, 0, 0, 0, 1.65, 0);

    // Dynamic ground shadow disc
    const shadowGeom = new THREE.CircleGeometry(0.62, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#315850',
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    });
    this.shadow = new THREE.Mesh(shadowGeom, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    // Floating particles & course props
    this.makeParticles();
    this.makePortal(platforms[platforms.length - 1]);
    this.createStartArch();

    window.addEventListener('resize', () => this.resize());
  }

  makeSky() {
    const skyGeom = new THREE.SphereGeometry(300, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#94dacf') },
        bottom: { value: new THREE.Color('#e0efcf') }
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top;
        uniform vec3 bottom;
        void main() {
          float h = normalize(vPos).y;
          gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.4, 0.5, h)), 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.sky);
  }

  makeWater() {
    const waterGeom = new THREE.PlaneGeometry(1000, 1000);
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        varying vec3 v;
        varying vec3 world;
        void main() {
          v = position;
          world = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 v;
        varying vec3 world;
        uniform float time;
        void main() {
          float a = sin(v.x * 0.08 + time * 0.13) * cos(v.y * 0.1 - time * 0.17);
          float b = pow(max(0.0, sin(v.x * 0.28 + v.y * 0.21 + time * 0.3)), 18.0);
          vec3 c = mix(vec3(0.43, 0.70, 0.65), vec3(0.48, 0.74, 0.68), a * 0.5 + 0.5);
          c = mix(c, vec3(0.70, 0.83, 0.72), smoothstep(55.0, 180.0, distance(world, cameraPosition)));
          gl_FragColor = vec4(c + b * 0.002, 0.86);
        }
      `
    });
    this.water = new THREE.Mesh(waterGeom, waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -16;
    this.scene.add(this.water);
  }

  makeClouds() {
    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#eef7e1',
      roughness: 1.0
    });
    const sphereGeom = new THREE.SphereGeometry(1, 16, 12);
    const instanced = new THREE.InstancedMesh(sphereGeom, cloudMat, 220);
    const dummy = new THREE.Object3D();

    const rand = (min, max) => min + Math.random() * (max - min);

    for (let i = 0; i < 55; i++) {
      const cx = rand(-130, 130);
      const cy = rand(-13, -6);
      const cz = rand(-180, 50);
      const scale = rand(2, 5);

      for (let j = 0; j < 4; j++) {
        dummy.position.set(
          cx + (j * 1.5 - 2) * scale,
          cy + rand(0, 0.4) * scale,
          cz + rand(-0.5, 0.5) * scale
        );
        dummy.scale.set(
          rand(1.2, 2.3) * scale,
          rand(0.5, 1.0) * scale,
          rand(1.0, 2.0) * scale
        );
        dummy.updateMatrix();
        instanced.setMatrixAt(i * 4 + j, dummy.matrix);
      }
    }
    this.clouds.add(instanced);
  }

  makeDistantIslands() {
    const rand = (min, max) => min + Math.random() * (max - min);

    for (let i = 0; i < 19; i++) {
      const island = new THREE.Group();
      const x = (i % 2 ? -1 : 1) * rand(22, 85);
      const z = rand(-180, 10);
      const y = rand(-9, 5);
      const r = rand(3, 9);
      island.position.set(x, y, z);

      // Low-poly underside cone
      const coneGeom = new THREE.ConeGeometry(r, r * 1.1, 7);
      const rock = addMesh(coneGeom, MATERIALS.rock, island, 0, -r * 0.6, 0);
      rock.rotation.z = Math.PI;

      // Rounded edge
      addCylinder(island, MATERIALS.edge, r, r * 0.9, 0.55, 0, 0, 0, 12);

      // Tree decoration
      this.registry.registerSlot('tree', island, 0, 0.2, 0, rand(3.8, 6.5), rand(0, Math.PI * 2));
      this.scene.add(island);
    }
  }

  makeIsland(plat) {
    const group = new THREE.Group();
    group.position.set(plat.x, plat.y, plat.z);
    this.scene.add(group);
    this.platformMeshes[plat.id] = group;

    const rand = (min, max) => min + Math.random() * (max - min);

    // 1. Sculpted underside rock cone
    const rockCyl = new THREE.CylinderGeometry(plat.r * 0.95, plat.r * 0.25, plat.r * 0.92, 13, 3);
    const posAttr = rockCyl.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      if (posAttr.getY(i) < plat.r * 0.4) {
        posAttr.setX(i, posAttr.getX(i) + Math.sin(i * 3.78) * 0.15);
        posAttr.setZ(i, posAttr.getZ(i) + Math.cos(i * 4.41) * 0.15);
      }
    }
    rockCyl.computeVertexNormals();
    addMesh(rockCyl, MATERIALS.rock, group, 0, -plat.r * 0.5 - 0.28, 0);

    // 2. Thick rounded grass lips
    addCylinder(group, MATERIALS.edge, plat.r * 0.98, plat.r * 0.93, 0.5, 0, -0.3, 0, 64);

    const rimColor = plat.type === 'crumble' ? '#eabd85' : (plat.type === 'moving' ? '#88bfb1' : '#97cb73');
    addCylinder(group, createMat(rimColor), plat.r, plat.r * 0.98, 0.22, 0, -0.11, 0, 64);

    const torusRim = addTorus(group, plat.type === 'moving' ? '#d1f6d2' : '#c9e89e', plat.r - 0.11, 0.045, 0, 0.025, 0);
    torusRim.rotation.x = Math.PI / 2;

    // Center circular grass meadow
    const centerGrass = new THREE.Mesh(
      new THREE.CircleGeometry(plat.r * 0.58, 48),
      createMat(plat.type === 'crumble' ? '#f2d3a0' : '#c9e3a8', 1.0)
    );
    centerGrass.rotation.x = -Math.PI / 2;
    centerGrass.position.y = 0.006;
    centerGrass.receiveShadow = true;
    group.add(centerGrass);

    const outerGrass = addTorus(group, rimColor, plat.r - 0.17, 0.24, 0, -0.13, 0);
    outerGrass.rotation.x = Math.PI / 2;
    outerGrass.scale.z = 0.8;

    // Rock crags on underside
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + plat.id;
      const dist = plat.r * 0.55;
      const rockMesh = addMesh(
        new THREE.DodecahedronGeometry(plat.r * 0.34, 0),
        i % 2 ? MATERIALS.rock : MATERIALS.rockDark,
        group,
        Math.cos(a) * dist,
        -plat.r * 0.55,
        Math.sin(a) * dist
      );
      rockMesh.scale.set(1, 0.95 + (i % 3) * 0.3, 1);
      rockMesh.rotation.set(i, i * 0.7, 0);
    }

    // Trailing vines from lip
    const vineLeafGeom = new THREE.SphereGeometry(1, 10, 8);
    const leavesInstanced = new THREE.InstancedMesh(vineLeafGeom, MATERIALS.leaf, 24);
    const stemGeom = new THREE.CylinderGeometry(0.027, 0.018, 1, 5);
    const stemInstanced = new THREE.InstancedMesh(stemGeom, MATERIALS.edge, 6);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < 6; i++) {
      const a = i * 2.3 + plat.id;
      const vx = Math.cos(a) * plat.r * 0.97;
      const vz = Math.sin(a) * plat.r * 0.97;
      const vLen = 0.9 + (i % 3) * 0.5;

      dummy.position.set(vx, -0.35 - vLen / 2, vz);
      dummy.scale.set(1, vLen, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      stemInstanced.setMatrixAt(i, dummy.matrix);

      for (let j = 0; j < 4; j++) {
        dummy.position.set(vx + ((j % 2) - 0.5) * 0.18, -0.35 - (j * vLen) / 4, vz);
        dummy.scale.set(0.15, 0.09, 0.045);
        dummy.rotation.z = ((j % 2) - 0.5) * 0.7;
        dummy.updateMatrix();
        leavesInstanced.setMatrixAt(i * 4 + j, dummy.matrix);
      }
    }
    group.add(stemInstanced, leavesInstanced);

    // Type-specific island mechanisms:
    // Spring Mushroom platform
    if (plat.type === 'spring') {
      const slot = this.registry.registerSlot('mushroom', group, 0, -4.4, 0, 4.5, plat.id * 0.9);
      slot.wrapper.userData.spring = true;
      slot.fitDiameter = (plat.r * 2) / 4.5;
      fitFootprint(slot.classic, slot.fitDiameter);

      const targetRing = addTorus(group, '#ffcfbb', plat.r * 0.75, 0.045, 0, 0.07, 0);
      targetRing.rotation.x = Math.PI / 2;
      targetRing.userData.spring = true;

      const launchSign = this.makeSign(group, '↑ ↑ ↑', 0, 1.8, -plat.r + 0.6, '#b86d83');
      launchSign.userData.spring = true;
    }

    // Candy Spinner platform
    if (plat.type === 'spinner') {
      const spinGroup = new THREE.Group();
      spinGroup.position.y = 0.75;
      group.add(spinGroup);

      addCylinder(spinGroup, createMat('#d3dfa0'), plat.r * 0.7, plat.r * 0.7, 0.045, 0, -0.67, 0, 48);

      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const beam = addMesh(
          new THREE.BoxGeometry(plat.r * 0.53, 0.018, 0.14),
          MATERIALS.cream,
          spinGroup,
          Math.cos(a) * plat.r * 0.42,
          -0.64,
          Math.sin(a) * plat.r * 0.42
        );
        beam.rotation.y = -a;
      }

      // Rotating candy bar sweeper
      const candyBar = addRoundedBox(spinGroup, MATERIALS.pink, plat.r * 1.8, 0.4, 0.45, 3, 0.17);
      candyBar.castShadow = true;

      for (const endX of [-plat.r * 0.87, plat.r * 0.87]) {
        addScaledSphere(spinGroup, MATERIALS.cream, endX, 0, 0, 0.33, 0.33, 0.33);
      }

      addCylinder(group, MATERIALS.stem, 0.25, 0.35, 1.45, 0, 0.6, 0, 20);
      addScaledSphere(group, MATERIALS.gold, 0, 1.37, 0, 0.38, 0.25, 0.38);

      this.spinGroups.push({ id: plat.id, group: spinGroup });

      const spinnerRing = addTorus(group, '#e7b5b0', plat.r * 0.8, 0.025, 0, 0.04, 0);
      spinnerRing.rotation.x = Math.PI / 2;
    }

    // Checkpoint platform
    if (plat.type === 'checkpoint') {
      this.makeFlag(group, plat.id);
    }

    // Moving platform decorative wings
    if (plat.type === 'moving') {
      for (const dir of [-1, 1]) {
        const wing = addScaledSphere(group, MATERIALS.cream, dir * (plat.r + 0.18), -0.3, 0, 0.7, 0.2, 1.05);
        wing.rotation.z = dir * 0.22;
      }
    }

    // Crumble platform cracks
    if (plat.type === 'crumble') {
      for (let i = 0; i < 5; i++) {
        const crack = addMesh(
          new THREE.BoxGeometry(0.035, 0.025, 0.8),
          MATERIALS.rockDark,
          group,
          (i - 2) * 0.8,
          0.03,
          (i % 2) - 0.5
        );
        crack.rotation.y = i * 0.8;
      }
    }

    // Scenery trees and mushrooms along edges
    const sceneryCount = plat.id === 0 ? 8 : 3;
    for (let i = 0; i < sceneryCount; i++) {
      const a = plat.id === 0
        ? (i / (sceneryCount - 1)) * Math.PI + 0.1
        : (i / (sceneryCount - 1)) * Math.PI * 1.3 + 0.3;
      const d = plat.r * 0.84;
      const sx = Math.cos(a) * d;
      const sz = Math.sin(a) * d;

      if ((plat.type === 'spinner' || plat.type === 'spring') && i > 0) continue;

      if (i % 3 === 0 && !(plat.id === 0 && i === 6)) {
        this.registry.registerSlot(
          'tree',
          group,
          plat.id === 0 ? (i === 0 ? -4.1 : 4.1) : sx,
          0,
          plat.id === 0 ? -1.8 : sz,
          plat.id === 0 ? 5.8 : rand(3.6, 5.0),
          rand(0, Math.PI * 2)
        );
      } else {
        this.registry.registerSlot('mushroom', group, sx, 0, sz, rand(0.7, 1.35), rand(0, Math.PI * 2));
      }
    }

    // Grass tufts and flowers
    this.addGrass(group, plat.r, plat.id);

    // Decorative pebbles
    for (let i = 0; i < 4; i++) {
      const a = i * 2.4 + plat.id;
      const px = Math.cos(a) * plat.r * 0.88;
      const pz = Math.sin(a) * plat.r * 0.88;
      const pebble = addScaledSphere(
        group,
        i % 2 ? MATERIALS.cream : MATERIALS.rock,
        px,
        0.16,
        pz,
        0.22,
        0.18,
        0.3
      );
      pebble.rotation.y = a;
    }

    // Occasional waterfalls
    if ([0, 4, 8, 12].includes(plat.id)) {
      this.makeWaterfall(group, plat.r);
    }

    // Island number sign
    this.makeSign(group, String(plat.id + 1).padStart(2, '0'), plat.r * 0.72, 0.32, 1, '#3c7555', 0.48);

    // Center offset adjustment for spring platforms
    if (plat.type === 'spring') {
      for (const child of group.children) {
        if (!child.userData.spring) {
          child.position.y -= 2.2;
        }
      }
    }
  }

  addGrass(group, r, id) {
    const bladeGeom = new THREE.ConeGeometry(0.06, 0.34, 3);
    const bladeMat = createMat('#639664');
    const bladeCount = 90;
    const instanced = new THREE.InstancedMesh(bladeGeom, bladeMat, bladeCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < bladeCount; i++) {
      const a = i * 2.399 + id;
      const dist = r * (0.66 + 0.27 * ((i * 7) % 23 / 23));
      dummy.position.set(Math.cos(a) * dist, 0.11, Math.sin(a) * dist);
      dummy.scale.set(1, 0.7 + (i % 4) * 0.28, 1);
      dummy.rotation.set(0, a, Math.sin(i) * 0.18);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.castShadow = true;
    group.add(instanced);

    // Tiny pink flowers
    const flowerMat = createMat('#f4bfd0');
    for (let i = 0; i < 9; i++) {
      const a = i * 2.2 + id;
      const fx = Math.cos(a) * r * 0.81;
      const fz = Math.sin(a) * r * 0.81;
      addScaledSphere(group, flowerMat, fx, 0.25, fz, 0.11, 0.15, 0.11);
    }
  }

  makeWaterfall(group, r) {
    const waterfallGeom = new THREE.PlaneGeometry(0.9, 9, 1, 1);
    const waterfallMat = new THREE.MeshBasicMaterial({
      color: '#caeee3',
      transparent: true,
      opacity: 0.37,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const sheet = new THREE.Mesh(waterfallGeom, waterfallMat);
    sheet.position.set(-r * 0.7, -4.65, r * 0.6);
    sheet.rotation.y = -0.8;
    group.add(sheet);
    this.waterfalls.push(sheet);

    // Falling water spray droplets
    for (let i = 0; i < 3; i++) {
      const drop = addMesh(
        new THREE.CylinderGeometry(0.025, 0.05, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#e5fff1', transparent: true, opacity: 0.35 }),
        group,
        -r * 0.7 + (i - 1) * 0.18,
        -4.6,
        r * 0.6
      );
      drop.castShadow = false;
    }
  }

  makeFlag(group, id) {
    const flagGroup = new THREE.Group();
    flagGroup.position.set(-2.3, 0, -0.7);

    addCylinder(flagGroup, MATERIALS.wood, 0.055, 0.065, 2.5, 0, 1.25, 0, 12);
    const banner = addMesh(
      new THREE.PlaneGeometry(1, 0.65, 8, 4),
      new THREE.MeshStandardMaterial({ color: '#f5d87a', side: THREE.DoubleSide }),
      flagGroup,
      0.5,
      2.05,
      0
    );
    addScaledSphere(flagGroup, MATERIALS.gold, 0, 2.58, 0, 0.12, 0.12, 0.12);
    group.add(flagGroup);
    this.flags.push({ id, flag: banner });

    const baseRing = addTorus(group, '#f9e8a1', 1.8, 0.07, 0, 0.08, 0);
    baseRing.rotation.x = Math.PI / 2;
  }

  makeSign(group, text, x, y, z, color = '#467856', scale = 0.7) {
    const billboard = createSignBillboard(text, x, y, z, color, scale);
    group.add(billboard);
    return billboard;
  }

  makeGems(collectibles) {
    const gemGeom = new THREE.OctahedronGeometry(0.27, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: '#fff0ad',
      emissive: '#ffc96d',
      emissiveIntensity: 0.22,
      metalness: 0.3,
      roughness: 0.23
    });

    for (const gem of collectibles) {
      const mesh = addMesh(gemGeom, gemMat, this.scene, gem.x, gem.y, gem.z);
      mesh.scale.set(0.85, 1.35, 0.85);
      this.gemMeshes[gem.id] = mesh;
    }
  }

  resetGems(collectibles) {
    for (const gem of collectibles) {
      const mesh = this.gemMeshes[gem.id];
      if (mesh) {
        mesh.visible = true;
      }
    }
  }

  makeParticles() {
    const count = 250;
    const positions = new Float32Array(count * 3);
    const rand = (min, max) => min + Math.random() * (max - min);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = rand(-22, 22);
      positions[i * 3 + 1] = rand(-2, 16);
      positions[i * 3 + 2] = rand(-145, 15);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Particle texture
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, '#fffbdc');
    grad.addColorStop(0.2, 'rgba(255, 251, 220, 0.88)');
    grad.addColorStop(1, 'rgba(255, 251, 220, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const pMat = new THREE.PointsMaterial({
      color: '#fff4c2',
      size: 0.14,
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });

    this.particles = new THREE.Points(geom, pMat);
    this.scene.add(this.particles);
  }

  makePortal(island) {
    const portalGroup = new THREE.Group();
    portalGroup.position.set(island.x, island.y + 2.25, island.z - 0.8);
    this.scene.add(portalGroup);
    this.portal = portalGroup;

    // Outer golden torus
    addTorus(portalGroup, '#d4ad71', 2.25, 0.17, 0, 0, 0);

    // Glowing inner ring
    const glowTorus = new THREE.Mesh(
      new THREE.TorusGeometry(2.04, 0.045, 8, 72),
      new THREE.MeshBasicMaterial({ color: '#fff5b6' })
    );
    portalGroup.add(glowTorus);
    this.portalGlow = glowTorus;

    // Animated vortex swirl shader disc
    const portalMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        varying vec2 u;
        void main() {
          u = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 u;
        uniform float time;
        void main() {
          vec2 p = u - 0.5;
          float d = length(p);
          float a = atan(p.y, p.x);
          float spiral = sin(a * 3.0 + d * 28.0 - time * 2.0);
          vec3 c = mix(vec3(0.7, 0.94, 0.68), vec3(1.0, 0.87, 0.57), spiral * 0.5 + 0.5);
          gl_FragColor = vec4(c, (0.15 + pow(d * 2.0, 3.0) * 0.6) * (1.0 - smoothstep(0.48, 0.5, d)));
        }
      `
    });

    const portalDisc = new THREE.Mesh(new THREE.CircleGeometry(2.0, 64), portalMat);
    portalGroup.add(portalDisc);
    this.portalInside = portalDisc;

    // 9 orbiting golden octahedron crystals
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const crystal = addMesh(
        new THREE.OctahedronGeometry(0.16),
        MATERIALS.gold,
        portalGroup,
        Math.cos(a) * 2.24,
        Math.sin(a) * 2.24,
        0.1
      );
      crystal.rotation.z = a;
    }

    this.makeSign(portalGroup, 'FINISH', 0, 3.25, 0, '#3e7255', 0.6);
  }

  createStartArch() {
    const archGroup = new THREE.Group();
    archGroup.position.set(0, 1.2, -3.2);

    for (const postX of [-2.8, 2.8]) {
      addCylinder(archGroup, MATERIALS.wood, 0.12, 0.16, 3.9, postX, 1.95, 0, 14);
      addScaledSphere(archGroup, MATERIALS.cream, postX, 4, 0, 0.2, 0.2, 0.2);
    }

    addRoundedBox(archGroup, createMat('#f3e3ae'), 5.9, 0.7, 0.13, 2, 0.09, 0, 3.63, 0);
    this.makeSign(archGroup, 'JELLY JUNGLE', 0, 3.66, 0.15, '#315f48', 1.65);

    const rope = addCylinder(archGroup, MATERIALS.cream, 0.018, 0.018, 5.6, 0, 3.0, 0, 8);
    rope.rotation.z = Math.PI / 2;

    // Hanging triangular bunting pennants
    for (let i = 0; i < 9; i++) {
      const flagGeom = new THREE.BufferGeometry();
      flagGeom.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.46, 0], 3)
      );
      flagGeom.computeVertexNormals();
      addMesh(
        flagGeom,
        new THREE.MeshStandardMaterial({
          color: i % 2 ? '#e5a5b1' : '#87bfa3',
          side: THREE.DoubleSide
        }),
        archGroup,
        -2.35 + i * 0.59,
        3.0,
        0
      );
    }

    this.scene.add(archGroup);
  }

  bounceSpring(platId) {
    const platGroup = this.platformMeshes[platId];
    const slot = this.registry.swaps.find(
      s => s.wrapper.parent === platGroup && s.wrapper.userData.spring
    );
    if (slot) {
      slot.bounce = 0;
    }
  }

  burst(x, y, z, color = '#ffe0a0', count = 12) {
    const rand = (min, max) => min + Math.random() * (max - min);
    for (let i = 0; i < count; i++) {
      const mesh = addMesh(
        new THREE.IcosahedronGeometry(rand(0.035, 0.09), 0),
        new THREE.MeshBasicMaterial({ color, transparent: true }),
        this.scene,
        x,
        y,
        z
      );
      const vel = new THREE.Vector3(rand(-2, 2), rand(1, 4), rand(-2, 2));
      this.effects.push({ m: mesh, v: vel, life: 0.6, max: 0.6 });
    }
  }

  ripple(x, y, z, color = '#fff8d0') {
    const ring = addMesh(
      new THREE.TorusGeometry(0.45, 0.025, 5, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
      this.scene,
      x,
      y + 0.05,
      z
    );
    ring.rotation.x = Math.PI / 2;
    this.effects.push({ m: ring, v: new THREE.Vector3(), life: 0.45, max: 0.45, ring: true });
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  }

  update(state, dt, isPlaying = false) {
    this.time += dt;
    const t = this.time;

    // Animate water, portal, particles, clouds
    this.water.material.uniforms.time.value = t;
    this.portalInside.material.uniforms.time.value = t;
    this.particles.rotation.y = Math.sin(t * 0.08) * 0.015;
    this.clouds.position.x = Math.sin(t * 0.02) * 2;

    // Update platforms: moving oscillation, crumbling shake
    for (const plat of state.platforms) {
      const mesh = this.platformMeshes[plat.id];
      mesh.position.set(plat.x, plat.y, plat.z);
      mesh.visible = !plat.hidden;

      if (plat.type === 'crumble' && plat.crumble > 0 && plat.crumble < 1.5) {
        mesh.rotation.z = Math.sin(t * 50) * plat.crumble * 0.01;
      } else {
        mesh.rotation.z = 0;
      }
    }

    // Spinners turntable rotation
    for (const spin of this.spinGroups) {
      spin.group.rotation.y = -state.platforms[spin.id].angle;
    }

    // Crystals floating bob and spin
    for (const gem of state.collectibles) {
      const mesh = this.gemMeshes[gem.id];
      if (!mesh) continue;
      const plat = state.platforms[gem.platform];
      mesh.visible = !gem.taken && !plat.hidden;
      mesh.position.set(
        gem.x + plat.x - plat.baseX,
        gem.y + Math.sin(t * 2.5 + gem.id) * 0.11,
        gem.z
      );
      mesh.rotation.y = t * 1.3 + gem.id;
    }

    // Spring mushroom compression / rebound animation
    for (const slot of this.registry.swaps) {
      if (slot.bounce !== undefined) {
        slot.bounce += dt;
        const rebound = Math.sin(slot.bounce * 22) * Math.exp(-slot.bounce * 5) * 0.14;
        slot.wrapper.scale.y = 4.5 * (1 - rebound);
        slot.wrapper.position.y = 0.1 - slot.wrapper.scale.y;
        if (slot.bounce > 1.2) {
          delete slot.bounce;
        }
      }
      // Gentle breeze sway on trees
      if (slot.kind === 'tree') {
        slot.wrapper.rotation.z = Math.sin(t * 0.8 + slot.wrapper.position.x) * 0.012;
      }
    }

    // Checkpoint flags wave and color update
    for (const f of this.flags) {
      f.flag.rotation.y = Math.sin(t * 2) * 0.16;
      f.flag.material.color.set(f.id <= state.checkpoint ? '#9ee2bb' : '#f5d87a');
    }

    // Player position and breathing / squash-and-stretch
    const speed = Math.hypot(state.vx, state.vz);
    this.player.position.set(state.x, state.y, state.z);

    const bobY = isPlaying
      ? state.grounded >= 0
        ? Math.sin(t * 15) * Math.min(speed * 0.015, 0.06)
        : 0
      : Math.sin(t * 2) * 0.07;

    this.playerVisual.position.y = bobY;

    if (!isPlaying) {
      // Menu showcase pose on start island
      this.player.position.set(1.9, 1.2, 2.2);
      this.playerVisual.rotation.y = -0.08;
      this.playerVisual.scale.setScalar(1.45);
    } else {
      // Rotate character smoothly towards movement direction
      const targetAngle = speed > 0.4 ? Math.atan2(state.vx, state.vz) : this.playerVisual.rotation.y;
      this.playerVisual.rotation.y +=
        Math.atan2(
          Math.sin(targetAngle - this.playerVisual.rotation.y),
          Math.cos(targetAngle - this.playerVisual.rotation.y)
        ) * Math.min(dt * 9, 1);

      // Squash and stretch in air & landing
      const verticalStretch = state.grounded < 0
        ? Math.min(0.18, Math.abs(state.vy) * 0.012)
        : Math.sin(t * 15) * Math.min(0.06, speed * 0.007);
      const widthScale = 1 - verticalStretch * 0.5;
      const heightScale = 1 + verticalStretch;

      this.squash *= Math.exp(-dt * 15);
      this.playerVisual.scale.lerp(
        new THREE.Vector3(widthScale + this.squash * 0.5, heightScale - this.squash, widthScale + this.squash * 0.5),
        Math.min(1, dt * 18)
      );

      // Invulnerability flicker
      this.playerVisual.visible = !(state.invulnerable > 0.1 && Math.floor(t * 12) % 2 === 0);
    }

    // Dynamic ground shadow
    let groundHeight = -15;
    for (const plat of state.platforms) {
      if (!plat.hidden && Math.hypot(state.x - plat.x, state.z - plat.z) < plat.r) {
        groundHeight = Math.max(groundHeight, plat.y);
      }
    }
    this.shadow.position.set(this.player.position.x, groundHeight + 0.03, this.player.position.z);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - (state.y - groundHeight) * 0.045));
    this.shadow.material.opacity = Math.max(0.04, 0.21 - (state.y - groundHeight) * 0.02);

    // Smooth camera tracking
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();

    if (isPlaying) {
      const baseY = Math.max(state.y, state.platforms[state.checkpoint].y);
      // Follow behind at offset (0, 8.8, 15.3), looking 5.8 units ahead
      camPos.set(state.x * 0.65, baseY + 8.8, state.z + 15.3);
      camLook.set(state.x * 0.78, baseY + 1.6, state.z - 5.8);
    } else {
      // Menu composition: Start island centre-right, course receding upper-right
      const isMobile = window.innerWidth < 700;
      camPos.set(isMobile ? 20 : 16, isMobile ? 19 : 15, isMobile ? 25 : 21);
      camLook.set(isMobile ? -2 : -11, isMobile ? 1 : 2, isMobile ? -17 : -8);
      camPos.x += Math.sin(t * 0.12) * 0.5;
    }

    this.camera.position.lerp(camPos, 1 - Math.exp(-dt * (isPlaying ? 3 : 1.5)));
    this.cameraTarget.lerp(camLook, 1 - Math.exp(-dt * (isPlaying ? 5 : 1.5)));
    this.camera.lookAt(this.cameraTarget);

    // Dynamic sunlight positioning
    const sunZ = isPlaying ? state.z - 10 : -15;
    this.sun.position.set(state.x - 18, 35 + Math.max(0, state.y), sunZ + 18);
    this.sun.target.position.set(state.x, state.y, sunZ);
    this.sun.target.updateMatrixWorld();

    this.sky.position.copy(this.camera.position);

    // Particle effects decay and motion
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        this.scene.remove(fx.m);
        fx.m.geometry.dispose();
        fx.m.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      fx.m.position.addScaledVector(fx.v, dt);
      if (fx.ring) {
        fx.m.scale.setScalar(1 + (1 - fx.life / fx.max) * 3);
      } else {
        fx.v.y -= 6 * dt; // Particle gravity
      }
      fx.m.material.opacity = fx.life / fx.max;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
