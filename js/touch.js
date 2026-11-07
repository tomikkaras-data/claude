// ---------------------------------------------------------------------------
// On-screen controls for phones and tablets
// ---------------------------------------------------------------------------

const Touch = {
  enabled: false,

  init(getGame) {
    this.getGame = getGame;
    const root = document.getElementById('touchControls');
    this.root = root;

    // Show the controls on touch devices, or as soon as the screen is touched
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) this.enable();
    window.addEventListener('touchstart', () => this.enable(), { passive: true, once: true });

    for (const btn of root.querySelectorAll('[data-key]')) {
      const code = btn.dataset.key;
      let held = false;
      const down = e => {
        e.preventDefault();
        const g = this.getGame();
        if (!g || held) return;
        held = true;
        btn.classList.add('held');
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) { /* ignore */ } }
        g.press(code);
      };
      const up = e => {
        e.preventDefault();
        if (!held) return;
        held = false;
        btn.classList.remove('held');
        const g = this.getGame();
        if (g) g.release(code);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    }
  },

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.root.hidden = false;
    document.body.classList.add('touch');
    const g = this.getGame && this.getGame();
    if (g) g.isTouch = true;
  },

  // Dim the controls when it's not a human's turn
  update(game) {
    if (!this.root) return;
    const humanTurn = game && game.active && !game.active.isCPU && !game.over;
    this.root.classList.toggle('inactive', !humanTurn);
  },
};

const Fullscreen = {
  supported() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  },
  active() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },
  async enter() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    } catch (e) { /* not allowed - ignore */ }
  },
  async exit() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) { /* ignore */ }
  },
  toggle() { return this.active() ? this.exit() : this.enter(); },
};
