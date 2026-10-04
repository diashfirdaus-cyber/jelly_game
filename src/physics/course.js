/**
 * Jelly Jungle - Physics & Course Simulation Module
 * Implements fixed-step physics, island mechanics, collisions, and gameplay rules.
 */

export const ISLANDS_DATA = [
  { x: 0,  z: 0,    y: 1.2, r: 5.4, type: 'start',      name: 'First Leap' },
  { x: 0,  z: -10,  y: 1.6, r: 3.1, type: 'plain',      name: 'Easy Does It' },
  { x: -4, z: -19,  y: 2.0, r: 3.1, type: 'spring',     name: 'Mushroom Launch' },
  { x: 2,  z: -29,  y: 3.2, r: 3.6, type: 'spinner',    name: 'Candy Spinner' },
  { x: 7,  z: -39,  y: 3.8, r: 4.0, type: 'checkpoint', name: 'Cloud Camp' },
  { x: 1,  z: -49,  y: 4.1, r: 3.1, type: 'moving',     name: 'Wandering Island' },
  { x: -6, z: -59,  y: 4.7, r: 3.2, type: 'spring',     name: 'Bounce Again' },
  { x: -1, z: -71,  y: 5.8, r: 3.8, type: 'spinner',    name: 'Double Trouble' },
  { x: 7,  z: -82,  y: 6.5, r: 4.0, type: 'checkpoint', name: 'Starlight Camp' },
  { x: 4,  z: -92,  y: 7.1, r: 3.0, type: 'crumble',    name: 'Keep Moving' },
  { x: -3, z: -102, y: 7.7, r: 3.2, type: 'moving',     name: 'Cloud Crossing' },
  { x: -7, z: -113, y: 8.2, r: 3.3, type: 'spring',     name: 'One Last Bounce' },
  { x: 0,  z: -127, y: 10.0,r: 5.0, type: 'finish',     name: 'Above the Clouds' }
];

/**
 * Distance from point (px, pz) to line segment (x1, z1) -> (x2, z2)
 */
export function distToSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return Math.hypot(px - projX, pz - projZ);
}

/**
 * Creates initial game state
 */
export function createInitialState() {
  const platforms = ISLANDS_DATA.map((isl, idx) => ({
    ...isl,
    id: idx,
    baseX: isl.x,
    baseZ: isl.z,
    dx: 0,
    dz: 0,
    angle: 0,
    crumble: 0,
    hidden: false
  }));

  // 3 crystals per island = 39 total
  const collectibles = platforms.flatMap(p => [0, 1, 2].map(slot => ({
    id: p.id * 3 + slot,
    x: p.x + (slot - 1) * 1.35,
    y: p.y + 1.05 + (slot === 1 ? 0.3 : 0),
    z: p.z - 0.9,
    platform: p.id,
    taken: false
  })));

  return {
    x: 0,
    y: 1.2,
    z: 1.7,
    vx: 0,
    vy: 0,
    vz: 0,
    jumps: 3,
    grounded: 0, // platform id if grounded, -1 if in air
    checkpoint: 0,
    stage: 0,
    maxStage: 0,
    gems: 0,
    falls: 0,
    time: 0,
    worldTime: 0,
    finished: false,
    invulnerable: 0,
    springCooldown: 0,
    coyote: 0,
    events: [],
    platforms,
    collectibles
  };
}

/**
 * Consume one jump charge if available
 */
export function tryJump(state) {
  if (state.finished || state.jumps <= 0) return false;
  // First jump is 9.2, air jumps are 8.5
  state.vy = state.jumps === 3 ? 9.2 : 8.5;
  state.jumps--;
  state.grounded = -1;
  state.coyote = 0;
  state.events.push({ type: 'jump', number: 3 - state.jumps });
  return true;
}

/**
 * Respawn player at last checkpoint
 */
export function respawnPlayer(state, manual = false) {
  const cp = state.platforms[state.checkpoint];
  state.x = cp.x;
  state.z = cp.z + 1.4;
  state.y = cp.y + 0.05;
  state.vx = 0;
  state.vy = 0;
  state.vz = 0;
  state.jumps = 3;
  state.grounded = cp.id;
  state.invulnerable = 1.5;
  state.springCooldown = 0.3;
  if (!manual) {
    state.falls++;
  }
  state.events.push({ type: 'respawn', manual });
}

/**
 * Step physics simulation by fixed dt (typically 1/120s)
 */
export function stepPhysics(state, input, dt = 1 / 120) {
  if (state.finished) return;

  state.time += dt;
  state.worldTime += dt;
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  state.springCooldown = Math.max(0, state.springCooldown - dt);

  // 1. Update platform states (moving, rotating, crumbling)
  for (const plat of state.platforms) {
    const prevX = plat.x;
    const prevZ = plat.z;

    // Moving platforms oscillate horizontally by ~2.6 units
    if (plat.type === 'moving') {
      plat.x = plat.baseX + Math.sin(state.worldTime * 0.85 + plat.id) * 2.6;
    }
    plat.z = plat.baseZ;
    plat.dx = plat.x - prevX;
    plat.dz = plat.z - prevZ;

    // Spinners: Island 7 (Double Trouble) spins reverse (-1.35 rad/s), Island 3 spins 0.95 rad/s
    plat.angle = state.worldTime * (plat.id === 7 ? -1.35 : 0.95) + plat.id;

    // Crumbling platform
    if (plat.crumble > 0) {
      plat.crumble += dt;
      // Vanish 1.5s after landing, hidden for ~4.0s (up to 5.5s)
      plat.hidden = plat.crumble > 1.5 && plat.crumble < 5.5;
      if (plat.crumble >= 5.5) {
        plat.crumble = 0;
        plat.hidden = false;
      }
    }
  }

  // 2. Carry grounded player with platform displacement / rotation
  if (state.grounded >= 0) {
    const plat = state.platforms[state.grounded];
    state.x += plat.dx;
    state.z += plat.dz;

    if (plat.type === 'spinner') {
      const rotDelta = (plat.id === 7 ? -1.35 : 0.95) * dt;
      const relX = state.x - plat.x;
      const relZ = state.z - plat.z;
      state.x = plat.x + relX * Math.cos(rotDelta) - relZ * Math.sin(rotDelta);
      state.z = plat.z + relX * Math.sin(rotDelta) + relZ * Math.cos(rotDelta);
    }

    if (plat.hidden) {
      state.grounded = -1;
      state.jumps = 2; // Lost ground footing, 2 air jumps left
    }
  }

  // 3. User input & horizontal movement
  let moveX = input.x || 0;
  let moveZ = input.z || 0;
  const inputLen = Math.hypot(moveX, moveZ);
  if (inputLen > 1) {
    moveX /= inputLen;
    moveZ /= inputLen;
  }

  // Responsive ground acceleration (15), gentler air steering (8)
  const accelRate = state.grounded >= 0 ? 15 : 8;
  const targetVx = moveX * 8.8;
  const targetVz = moveZ * 8.8;
  state.vx += (targetVx - state.vx) * Math.min(1, accelRate * dt);
  state.vz += (targetVz - state.vz) * Math.min(1, accelRate * dt);

  // 4. Vertical velocity & gravity (22 units/s²)
  const prevY = state.y;
  state.x += state.vx * dt;
  state.z += state.vz * dt;
  state.vy -= 22 * dt;
  state.y += state.vy * dt;

  // 5. Landing / Platform Collision
  let landPlatId = -1;
  if (state.vy <= 0) {
    for (const plat of state.platforms) {
      if (plat.hidden) continue;
      // Check vertical crossing of platform landing surface
      if (prevY >= plat.y - 0.12 && state.y <= plat.y) {
        const distFromCenter = Math.hypot(state.x - plat.x, state.z - plat.z);
        if (distFromCenter < plat.r - 0.06) {
          if (landPlatId < 0 || plat.y > state.platforms[landPlatId].y) {
            landPlatId = plat.id;
          }
        }
      }
    }
  }

  const prevGrounded = state.grounded;
  state.grounded = landPlatId;

  if (landPlatId >= 0) {
    const plat = state.platforms[landPlatId];
    state.y = plat.y;
    state.vy = 0;
    state.jumps = 3; // Recharges all 3 jumps
    state.stage = plat.id;
    state.maxStage = Math.max(state.maxStage, plat.id);
    state.coyote = 0.11;

    if (prevGrounded !== landPlatId) {
      state.events.push({ type: 'land', platform: plat.id });
    }

    // Checkpoint activation
    if (plat.type === 'checkpoint' && plat.id > state.checkpoint) {
      state.checkpoint = plat.id;
      state.events.push({ type: 'checkpoint', platform: plat.id });
    }

    // Crumble trigger
    if (plat.type === 'crumble' && plat.crumble === 0) {
      plat.crumble = 0.001;
      state.events.push({ type: 'crumble' });
    }

    // Spring mushroom launch: vy ~ 16, recharges jumps
    if (plat.type === 'spring' && state.springCooldown === 0) {
      state.vy = 16;
      state.grounded = -1;
      state.jumps = 3;
      state.springCooldown = 0.6;
      state.events.push({ type: 'spring', platform: plat.id });
    }

    // Finish portal reached
    if (plat.type === 'finish' && Math.hypot(state.x - plat.x, state.z - plat.z) < 3.0) {
      state.finished = true;
      state.events.push({ type: 'win' });
    }
  } else {
    // Airborne coyote time
    state.coyote = Math.max(0, state.coyote - dt);
    if (prevGrounded >= 0 && state.jumps === 3 && state.vy < 0 && state.coyote === 0) {
      state.jumps = 2; // Walking off ledge consumes ground jump
    }
  }

  // 6. Spinner candy bar hazard collision
  for (const plat of state.platforms) {
    if (plat.type !== 'spinner' || state.invulnerable > 0) continue;

    const barLen = plat.r * 0.9;
    const endX1 = plat.x - Math.cos(plat.angle) * barLen;
    const endZ1 = plat.z - Math.sin(plat.angle) * barLen;
    const endX2 = plat.x + Math.cos(plat.angle) * barLen;
    const endZ2 = plat.z + Math.sin(plat.angle) * barLen;

    // Vertical overlap check: jumping clears the low rotating candy bar
    const lowBound = plat.y + 0.5;
    const highBound = plat.y + 1.02;
    if (state.y < highBound && state.y + 1.1 > lowBound) {
      const dToBar = distToSegment(state.x, state.z, endX1, endZ1, endX2, endZ2);
      if (dToBar < 0.62) {
        // Knockback hit!
        state.vy = 7;
        state.vx = Math.cos(plat.angle + Math.PI / 2) * 12;
        state.vz = Math.sin(plat.angle + Math.PI / 2) * 12;
        state.grounded = -1;
        state.invulnerable = 1.7; // ~1.7 seconds of immunity
        state.events.push({ type: 'hit', platform: plat.id });
      }
    }
  }

  // 7. Collectible crystals
  for (const gem of state.collectibles) {
    if (gem.taken) continue;
    const plat = state.platforms[gem.platform];
    const currX = gem.x + plat.x - plat.baseX;
    const d = Math.hypot(currX - state.x, gem.y - (state.y + 0.7), gem.z - state.z);
    if (d < 1.05) {
      gem.taken = true;
      state.gems++;
      state.events.push({ type: 'gem', id: gem.id });
    }
  }

  // 8. Out of bounds fall detection
  const cpPlat = state.platforms[state.checkpoint];
  if (state.y < -12 || state.y < cpPlat.y - 20) {
    respawnPlayer(state, false);
  }
}
