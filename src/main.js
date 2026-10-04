/**
 * Jelly Jungle - Main Game Entry Point
 * Orchestrates physics loop, rendering, audio, UI, and asset management.
 */

import { createInitialState, stepPhysics, tryJump, respawnPlayer } from './physics/course.js';
import { AudioManager } from './audio/sound.js';
import { AssetRegistry } from './world/assetRegistry.js';
import { WorldManager } from './world/world.js';
import { InputManager } from './input/input.js';
import { UIManager } from './ui/ui.js';

// Game state variables
let state = createInitialState();
let isPlaying = false;
let isPaused = false;
let currentMode = 'tripo';
let lastTime = 0;
let accumulator = 0;
let bestRun = null;

try {
  bestRun = JSON.parse(localStorage.getItem('jelly-jungle-best') || 'null');
} catch {}

// Initialize Subsystems
const audio = new AudioManager();
const registry = new AssetRegistry();
const canvas = document.querySelector('#world');
const world = new WorldManager(canvas, state.platforms, registry);
world.makeGems(state.collectibles);

// Helper for UI visibility
const toggleClass = (selector, className, force) => {
  document.querySelector(selector)?.classList.toggle(className, force);
};

// UI Manager
const ui = new UIManager({
  onStart: () => {
    startGame();
  },
  onTogglePause: () => {
    togglePause(!isPaused);
  },
  onResume: () => {
    togglePause(false);
  },
  onRestart: () => {
    restartGame();
  },
  onToggleSound: async () => {
    return await audio.toggle();
  },
  onOpenHelp: () => {
    togglePause(true);
  },
  onCloseHelp: () => {
    togglePause(false);
  },
  onToggleMode: () => {
    currentMode = currentMode === 'tripo' ? 'classic' : 'tripo';
    registry.setMode(currentMode);
    return currentMode;
  },
  onUploadModel: async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    await registry.importCharacter(arrayBuffer);
    if (currentMode === 'classic') {
      currentMode = 'tripo';
      ui.updateModeUI('tripo');
      registry.setMode('tripo');
    }
    restartGame();
  }
});

// Input Manager
const input = new InputManager(
  // Jump action
  () => {
    if (!isPlaying) {
      startGame();
      return;
    }
    if (isPaused || state.finished) return;

    const jumped = tryJump(state);
    if (!jumped && state.jumps === 0) {
      ui.showToast('Space out your jumps to go farther. Land to recharge.', 1700);
    }
  },
  // Manual Respawn (R key)
  () => {
    if (isPlaying && !isPaused && !state.finished) {
      respawnPlayer(state, true);
    }
  },
  // Pause Toggle (Esc key)
  () => {
    togglePause(!isPaused);
  }
);

function startGame() {
  if (isPlaying) return;
  isPlaying = true;
  isPaused = false;
  document.body.classList.add('playing');

  const intro = document.querySelector('#intro');
  if (intro) {
    intro.classList.add('leaving');
    setTimeout(() => intro.classList.add('hidden'), 550);
  }

  document.querySelector('#world-label')?.classList.add('hidden');
  document.querySelector('#hud')?.classList.remove('hidden');
  document.querySelector('#jump-meter')?.classList.remove('hidden');
  document.querySelector('#mobile-controls')?.classList.remove('hidden');

  const isMobile = window.innerWidth < 700;
  ui.showToast(
    isMobile
      ? 'Move with the left joystick · Tap Jump up to three times'
      : 'WASD to move · Space to jump, then twice more in midair',
    4200
  );

  lastTime = performance.now();
  accumulator = 0;
}

function restartGame() {
  state = createInitialState();
  world.playerVisual.visible = true;
  world.resetGems(state.collectibles);
  input.clear();
  isPaused = false;
  isPlaying = true;

  document.body.classList.add('playing');
  document.querySelector('#intro')?.classList.add('hidden');
  document.querySelector('#world-label')?.classList.add('hidden');
  document.querySelector('#hud')?.classList.remove('hidden');
  document.querySelector('#jump-meter')?.classList.remove('hidden');
  document.querySelector('#mobile-controls')?.classList.remove('hidden');

  for (const dialog of document.querySelectorAll('dialog[open]')) {
    dialog.close();
  }

  ui.showToast('A fresh adventure awaits ✦', 2000);
  lastTime = performance.now();
  accumulator = 0;
}

function togglePause(pauseState) {
  if (!isPlaying || state.finished) return;
  isPaused = pauseState;
  input.clear();

  const pauseDialog = document.querySelector('#pause-dialog');
  if (pauseState) {
    pauseDialog?.showModal();
  } else {
    pauseDialog?.close();
  }
}

// Handle physics events (audio, particles, notices)
function handlePhysicsEvents() {
  for (const ev of state.events) {
    audio.play(ev.type, ev.number || state.gems);

    if (ev.type === 'jump') {
      world.ripple(state.x, state.y, state.z, ev.number === 3 ? '#efadcd' : '#ecffd2');
      if (ev.number === 3) {
        ui.showToast('Triple jump! A little farther ✦', 950);
      }
    }

    if (ev.type === 'spring') {
      world.bounceSpring(ev.platform);
      world.burst(state.x, state.y + 0.25, state.z, '#ffc6dc', 24);
      world.ripple(state.x, state.y + 0.04, state.z, '#ffb4d2');
      ui.showToast('Mushroom boost ↑ All jumps recharged', 1700);
    }

    if (ev.type === 'land') {
      world.squash = 0.22;
      world.ripple(state.x, state.y, state.z);
    }

    if (ev.type === 'gem') {
      const mesh = world.gemMeshes[ev.id];
      if (mesh) {
        world.burst(mesh.position.x, mesh.position.y, mesh.position.z, '#ffe7a3', 8);
      }
      if (state.gems % 9 === 0) {
        ui.showToast(`Looking bright! ${state.gems} crystals collected ✦`, 1500);
      }
    }

    if (ev.type === 'hit') {
      ui.showToast('Bumped by a candy bar! Jump higher to clear it.', 2000);
      world.burst(state.x, state.y + 0.7, state.z, '#f49caa', 14);
    }

    if (ev.type === 'checkpoint') {
      ui.showCheckpointNotice();
      world.burst(state.x, state.y + 1, state.z, '#d9f5b5', 30);
    }

    if (ev.type === 'crumble') {
      ui.showToast('This island is crumbling. Keep jumping!', 2000);
    }

    if (ev.type === 'respawn') {
      ui.showToast(
        ev.manual
          ? 'Back at your checkpoint. Find your rhythm.'
          : 'The clouds brought you back. Try another leap!',
        2100
      );
      world.burst(state.x, state.y + 0.5, state.z, '#eaffd7', 15);
    }

    if (ev.type === 'win') {
      onWin();
    }
  }
  state.events.length = 0;
}

function onWin() {
  input.clear();
  document.querySelector('#jump-meter')?.classList.add('hidden');
  document.querySelector('#mobile-controls')?.classList.add('hidden');

  // Victory firework bursts
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      world.burst(
        state.x + (Math.random() - 0.5) * 7,
        state.y + 4,
        state.z + (Math.random() - 0.5) * 4,
        i % 2 ? '#f3b7d7' : '#f7e895',
        30
      );
    }, i * 180);
  }

  // Update best run in localStorage
  const isNewBest = !bestRun || state.time < bestRun.time;
  if (isNewBest) {
    bestRun = { time: state.time, gems: state.gems };
    try {
      localStorage.setItem('jelly-jungle-best', JSON.stringify(bestRun));
    } catch {}
  }

  setTimeout(() => {
    ui.showWinScreen(state, bestRun);
  }, 1000);
}

// Background tab pause management
let autoPausedFromBlur = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isPlaying && !isPaused && !state.finished) {
    isPaused = true;
    autoPausedFromBlur = true;
  } else if (!document.hidden && autoPausedFromBlur) {
    isPaused = false;
    autoPausedFromBlur = false;
  }
  lastTime = performance.now();
  accumulator = 0;
});

// Asynchronously load Tripo models in background
registry.loadDefaultModels((loaded, total) => {
  const loadingLabel = document.querySelector('#loading-label');
  if (loadingLabel) {
    loadingLabel.textContent = `Waking up the jungle… ${loaded} / ${total}`;
  }
}).then((results) => {
  const failed = results.filter(r => r.status === 'rejected');
  const loadingBadge = document.querySelector('#loading');
  if (failed.length === 0) {
    loadingBadge?.classList.add('hidden');
  } else {
    const loadingLabel = document.querySelector('#loading-label');
    if (loadingLabel) {
      loadingLabel.textContent = 'Some models could not load. Running Classic mode.';
    }
    setTimeout(() => loadingBadge?.classList.add('hidden'), 2000);
  }
});

// Fixed 1/120s step Main Game Loop
const FIXED_STEP = 1 / 120;

function mainLoop(now) {
  requestAnimationFrame(mainLoop);

  if (!lastTime) lastTime = now;
  const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (isPlaying && !isPaused && !state.finished) {
    accumulator += deltaTime;
    const moveInput = input.getMovementVector();

    // Consume fixed steps
    while (accumulator >= FIXED_STEP) {
      stepPhysics(state, moveInput, FIXED_STEP);
      accumulator -= FIXED_STEP;
    }

    handlePhysicsEvents();
    ui.updateHUD(state);
  }

  // Render 3D World
  world.update(state, deltaTime, isPlaying);
}

requestAnimationFrame(mainLoop);
