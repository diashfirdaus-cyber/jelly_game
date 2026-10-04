/**
 * Jelly Jungle - Input Controller Module
 * Handles keyboard, touch virtual joystick, and tap jump button with pointer capture.
 */

export class InputManager {
  constructor(onJump, onRespawn, onTogglePause) {
    this.keys = new Set();
    this.touchVector = { x: 0, z: 0 };
    this.activePointerId = null;

    this.onJump = onJump;
    this.onRespawn = onRespawn;
    this.onTogglePause = onTogglePause;

    this.setupKeyboard();
    this.setupTouch();
  }

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;

      const hasOpenDialog = !!document.querySelector('dialog[open]');
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !hasOpenDialog) {
        e.preventDefault();
      }

      if (!hasOpenDialog) {
        if (e.code === 'Escape') {
          if (this.onTogglePause) this.onTogglePause();
          return;
        }

        if (e.code === 'Space' && !e.repeat) {
          if (this.onJump) this.onJump();
        }

        if (e.code === 'KeyR' && !e.repeat) {
          if (this.onRespawn) this.onRespawn();
        }

        this.keys.add(e.code);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Clear keys when window loses focus
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clear();
      }
    });
  }

  setupTouch() {
    const joystick = document.querySelector('#joystick');
    const stick = document.querySelector('#stick');
    const touchJump = document.querySelector('#touch-jump');

    if (!joystick || !stick) return;

    const updateStick = (clientX, clientY) => {
      const rect = joystick.getBoundingClientRect();
      let dx = clientX - rect.left - rect.width / 2;
      let dy = clientY - rect.top - rect.height / 2;
      const dist = Math.hypot(dx, dy);
      const maxDist = 32;

      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }

      this.touchVector.x = dx / maxDist;
      this.touchVector.z = dy / maxDist;
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    joystick.addEventListener('pointerdown', (e) => {
      if (this.activePointerId === null) {
        this.activePointerId = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateStick(e.clientX, e.clientY);
      }
    });

    joystick.addEventListener('pointermove', (e) => {
      if (this.activePointerId === e.pointerId) {
        updateStick(e.clientX, e.clientY);
      }
    });

    const resetStick = (e) => {
      if (this.activePointerId === e.pointerId) {
        this.activePointerId = null;
        this.touchVector.x = 0;
        this.touchVector.z = 0;
        stick.style.transform = '';
      }
    };

    for (const evt of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      joystick.addEventListener(evt, resetStick);
    }

    if (touchJump) {
      touchJump.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.onJump) this.onJump();
      });
    }
  }

  clear() {
    this.keys.clear();
    this.touchVector.x = 0;
    this.touchVector.z = 0;
    const stick = document.querySelector('#stick');
    if (stick) stick.style.transform = '';
  }

  getMovementVector() {
    let x = 0;
    let z = 0;

    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;

    x += this.touchVector.x;
    z += this.touchVector.z;

    return { x, z };
  }
}
