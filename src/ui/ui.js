/**
 * Jelly Jungle - UI & HUD Module
 * Manages intro screen, compact run HUD, three-dot jump meter, toasts,
 * mode switch dock, dialogs (Help, Pause, Win), and Lucide icons.
 */

import {
  createIcons,
  VolumeX,
  Volume2,
  CircleHelp,
  Pause,
  Play,
  Sparkles,
  Box,
  CornerRightDown,
  ChevronsUp,
  Rotate3d,
  Gem,
  ArrowUpRight,
  Orbit,
  Timer,
  Flag,
  RotateCcw
} from 'lucide';

export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export class UIManager {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.toastTimer = null;
    this.checkpointTimer = null;

    this.initIcons();
    this.bindEvents();
  }

  initIcons() {
    createIcons({
      icons: {
        VolumeX,
        Volume2,
        CircleHelp,
        Pause,
        Play,
        Sparkles,
        Box,
        CornerRightDown,
        ChevronsUp,
        Rotate3d,
        Gem,
        ArrowUpRight,
        Orbit,
        Timer,
        Flag,
        RotateCcw
      },
      attrs: {
        'stroke-width': 1.8
      }
    });
  }

  showToast(message, duration = 2500) {
    clearTimeout(this.toastTimer);
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  showCheckpointNotice() {
    clearTimeout(this.checkpointTimer);
    const notice = document.querySelector('#checkpoint-notice');
    if (!notice) return;
    notice.classList.remove('hidden');
    this.checkpointTimer = setTimeout(() => {
      notice.classList.add('hidden');
    }, 3800);
  }

  bindEvents() {
    // Start game button
    document.querySelector('#start')?.addEventListener('click', () => {
      if (this.callbacks.onStart) this.callbacks.onStart();
    });

    // Pause / Resume / Restart buttons
    document.querySelector('#pause')?.addEventListener('click', () => {
      if (this.callbacks.onTogglePause) this.callbacks.onTogglePause();
    });

    document.querySelector('#resume')?.addEventListener('click', () => {
      if (this.callbacks.onResume) this.callbacks.onResume();
    });

    document.querySelector('#restart')?.addEventListener('click', () => {
      if (this.callbacks.onRestart) this.callbacks.onRestart();
    });

    document.querySelector('#replay')?.addEventListener('click', () => {
      if (this.callbacks.onRestart) this.callbacks.onRestart();
    });

    // Sound toggle button
    document.querySelector('#sound')?.addEventListener('click', async () => {
      if (this.callbacks.onToggleSound) {
        const isSoundOn = await this.callbacks.onToggleSound();
        const soundBtn = document.querySelector('#sound');
        if (soundBtn) {
          soundBtn.innerHTML = `<i data-lucide="${isSoundOn ? 'volume-2' : 'volume-x'}"></i>`;
          soundBtn.setAttribute('aria-label', isSoundOn ? 'Turn sound off' : 'Turn sound on');
          this.initIcons();
        }
        this.showToast(isSoundOn ? 'Sound on · Bounce to the jungle beat' : 'Sound off');
      }
    });

    // Help Dialog
    const helpDialog = document.querySelector('#help-dialog');
    document.querySelector('#help')?.addEventListener('click', () => {
      if (this.callbacks.onOpenHelp) this.callbacks.onOpenHelp();
      helpDialog?.showModal();
    });

    for (const closeBtn of document.querySelectorAll('#help-dialog .modal-close')) {
      closeBtn.addEventListener('click', () => {
        helpDialog?.close();
      });
    }

    helpDialog?.addEventListener('close', () => {
      if (this.callbacks.onCloseHelp) this.callbacks.onCloseHelp();
    });

    // Dialog prevent default cancels
    document.querySelector('#pause-dialog')?.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (this.callbacks.onResume) this.callbacks.onResume();
    });

    document.querySelector('#win-dialog')?.addEventListener('cancel', (e) => {
      e.preventDefault();
    });

    // Mode Toggle (Tripo AI vs Classic)
    document.querySelector('#mode-toggle')?.addEventListener('click', () => {
      if (this.callbacks.onToggleMode) {
        const newMode = this.callbacks.onToggleMode();
        this.updateModeUI(newMode);
      }
    });

    // Custom model file upload
    document.querySelector('#model-upload')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 20 * 1024 * 1024) {
        this.showToast('Please use a model smaller than 20 MB.', 3000);
        return;
      }
      if (!/\.glb$/i.test(file.name)) {
        this.showToast('Please choose a 3D model in .glb format.');
        return;
      }

      if (this.callbacks.onUploadModel) {
        try {
          await this.callbacks.onUploadModel(file);
          this.showToast('Your character is here. Let’s bounce!', 3500);
        } catch (err) {
          this.showToast(`Could not load model: ${err.message}`, 4500);
        } finally {
          e.target.value = '';
        }
      }
    });

    // Responsive play hint
    if (window.innerWidth < 700) {
      const hint = document.querySelector('.play-hint');
      if (hint) {
        hint.textContent = 'Left joystick to move · Right button to triple jump';
      }
    }
  }

  updateModeUI(mode) {
    const isTripo = (mode === 'tripo');
    document.body.classList.toggle('classic', !isTripo);
    document.querySelector('#tripo-option')?.classList.toggle('active', isTripo);
    document.querySelector('#classic-option')?.classList.toggle('active', !isTripo);

    const toggleBtn = document.querySelector('#mode-toggle');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', String(isTripo));
      toggleBtn.setAttribute(
        'aria-label',
        isTripo
          ? 'Switch to Classic mode, with all assets created in Three.js'
          : 'Switch to Tripo-generated assets'
      );
    }

    const status = document.querySelector('#mode-status');
    if (status) {
      status.textContent = isTripo ? 'TRIPO 3D WORLD' : 'CLASSIC THREE.JS WORLD';
    }

    const footnote = document.querySelector('#mode-footnote');
    if (footnote) {
      footnote.textContent = isTripo
        ? 'Same course. Same rules. A different 3D world.'
        : 'All procedural assets rendered in pure Three.js.';
    }

    const canvas = document.querySelector('#world');
    if (canvas) {
      canvas.classList.remove('classic-flash');
      void canvas.offsetWidth; // Trigger reflow
      canvas.classList.add('classic-flash');
    }

    this.showToast(
      isTripo
        ? 'Tripo mode · Welcome back to a world of detail'
        : 'Classic mode · Same adventure, procedural Three.js assets',
      2200
    );
  }

  updateHUD(state) {
    const gemCount = document.querySelector('#gem-count');
    if (gemCount) gemCount.textContent = state.gems;

    const timer = document.querySelector('#timer');
    if (timer) timer.textContent = formatTime(state.time);

    const stageName = document.querySelector('#stage-name');
    if (stageName) {
      stageName.textContent = `${String(state.stage + 1).padStart(2, '0')} / ${state.platforms[state.stage].name}`;
    }

    const progressPct = Math.round((state.maxStage / 12) * 100);
    const progressText = document.querySelector('#progress-percent');
    if (progressText) progressText.textContent = `${progressPct}%`;

    const progressFill = document.querySelector('#progress-fill');
    if (progressFill) progressFill.style.width = `${progressPct}%`;

    // 3-dot jump meter
    const jumpDots = document.querySelector('#jump-dots');
    if (jumpDots) {
      [...jumpDots.children].forEach((dot, idx) => {
        dot.classList.toggle('spent', idx >= state.jumps);
      });
    }

    const jumpLabel = document.querySelector('#jump-label');
    if (jumpLabel) {
      jumpLabel.textContent = state.grounded >= 0
        ? 'Ready for another leap'
        : `${state.jumps} air ${state.jumps === 1 ? 'jump' : 'jumps'} left`;
    }
  }

  showWinScreen(state, bestRun) {
    document.querySelector('#final-time').textContent = formatTime(state.time);
    document.querySelector('#final-gems').textContent = `${state.gems} / 39`;
    document.querySelector('#final-falls').textContent = state.falls;

    // Stars: 3 for >= 30 gems, 2 for >= 18, 1 otherwise
    const stars = state.gems >= 30 ? 3 : (state.gems >= 18 ? 2 : 1);
    document.querySelector('#win-stars').textContent = '✦ '.repeat(stars) + '✧ '.repeat(3 - stars);

    const isNewBest = !bestRun || state.time < bestRun.time;
    document.querySelector('#win-summary').textContent = isNewBest
      ? 'A new personal best! Every leap made a difference.'
      : `Your best is ${formatTime(bestRun.time)}. Can you find a faster route?`;

    document.querySelector('#win-dialog')?.showModal();
  }
}
