// ---------------------------------------------------------------------------
// Main menu, weapon bar and overlays
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'craterClash.settings';
const $ = id => document.getElementById(id);

const App = {
  game: null,
  settings: null,

  defaults() {
    return {
      count: 4,
      turnTime: 45,
      health: 100,
      difficulty: 'normal',
      theme: 'random',
      players: DEFAULT_NAMES.map((name, i) => ({ name, cpu: i !== 0, team: i % 2 })),
    };
  },

  load() {
    let s = this.defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.players) && saved.players.length === 8) s = { ...s, ...saved };
    } catch (e) { /* ignore */ }
    return s;
  },

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
  },

  init() {
    this.settings = this.load();
    const s = this.settings;

    const count = $('countSelect');
    for (let n = 2; n <= 8; n++) count.add(new Option(`${n} characters`, n));
    count.value = s.count;
    count.onchange = () => { s.count = +count.value; this.renderPlayers(); this.save(); };

    const bindRange = (id, key, fmt) => {
      const el = $(id), out = $(id + 'Value');
      el.value = s[key];
      const show = () => { out.textContent = fmt(el.value); };
      el.oninput = () => { s[key] = +el.value; show(); this.save(); };
      show();
    };
    bindRange('turnTime', 'turnTime', v => `${v}s`);
    bindRange('health', 'health', v => `${v} HP`);

    for (const id of ['difficulty', 'theme']) {
      $(id).value = s[id];
      $(id).onchange = () => { s[id] = $(id).value; this.save(); };
    }

    $('startBtn').onclick = () => this.start();
    $('resumeBtn').onclick = () => this.game && this.game.setPaused(false);
    $('rematchBtn').onclick = () => this.start();
    $('menuBtn').onclick = () => this.toMenu();

    this.renderPlayers();
  },

  renderPlayers() {
    const s = this.settings;
    const list = $('playerList');
    list.innerHTML = '';
    for (let i = 0; i < s.count; i++) {
      const p = s.players[i];
      const row = document.createElement('div');
      row.className = 'player-row';
      row.style.setProperty('--team-color', TEAMS[p.team].color);

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;

      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 12;
      name.value = p.name;
      name.setAttribute('aria-label', `Name of character ${i + 1}`);
      name.oninput = () => { p.name = name.value; this.save(); };

      const toggle = document.createElement('div');
      toggle.className = 'toggle';
      for (const [label, cpu] of [['Human', false], ['CPU', true]]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = p.cpu === cpu ? 'on' : '';
        b.onclick = () => { p.cpu = cpu; this.save(); this.renderPlayers(); };
        toggle.appendChild(b);
      }

      const swatches = document.createElement('div');
      swatches.className = 'swatches';
      for (const t of TEAMS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch' + (p.team === t.id ? ' on' : '');
        b.style.background = t.color;
        b.title = t.name;
        b.setAttribute('aria-label', `${t.name} for character ${i + 1}`);
        b.onclick = () => { p.team = t.id; this.save(); this.renderPlayers(); };
        swatches.appendChild(b);
      }

      row.append(num, name, toggle, swatches);
      list.appendChild(row);
    }
    this.validate();
  },

  validate() {
    const s = this.settings;
    const used = new Set(s.players.slice(0, s.count).map(p => p.team));
    const msg = used.size < 2 ? 'Put characters in at least two different teams.' : '';
    $('menuError').textContent = msg;
    $('startBtn').disabled = !!msg;
    return !msg;
  },

  start() {
    if (!this.validate()) return;
    Sound.init();
    const s = this.settings;
    const players = s.players.slice(0, s.count).map((p, i) => ({
      name: (p.name || '').trim() || DEFAULT_NAMES[i],
      cpu: p.cpu,
      team: p.team,
    }));
    if (this.game) this.game.destroy();
    $('menu').hidden = true;
    $('gameScreen').hidden = false;
    $('overlay').hidden = true;

    this.game = new Game($('canvas'), {
      players,
      turnTime: s.turnTime,
      health: s.health,
      difficulty: s.difficulty,
      theme: s.theme,
    }, {
      onWeaponsChanged: () => this.renderWeapons(),
      onPause: paused => this.showPause(paused),
      onGameOver: result => this.showGameOver(result),
    });
    window.__game = this.game; // handy for debugging from the console
    this.renderWeapons();
    this.game.start();
  },

  toMenu() {
    if (this.game) this.game.destroy();
    this.game = null;
    $('overlay').hidden = true;
    $('gameScreen').hidden = true;
    $('menu').hidden = false;
  },

  renderWeapons() {
    const g = this.game;
    const bar = $('weaponBar');
    if (!g || !g.active) return;
    const c = g.active;
    const team = g.teams[c.team];
    const humanCanPick = !c.isCPU && !g.hasFired && (g.state === 'turn' || g.state === 'banner');
    bar.innerHTML = '';
    for (const w of WEAPONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'weapon' + (c.weapon === w.id ? ' on' : '');
      const ammo = team.ammo[w.id];
      b.disabled = !humanCanPick || !(ammo > 0);
      b.title = `${w.name} (${w.key})`;
      b.innerHTML = `<span class="key">${w.key}</span>` +
        (ammo !== Infinity ? `<span class="ammo">×${ammo}</span>` : '') +
        `<span class="icon">${w.icon}</span><span>${w.name}</span>`;
      b.onclick = () => { g.selectWeapon(w.id); b.blur(); };
      bar.appendChild(b);
    }
  },

  showPause(paused) {
    $('overlay').hidden = !paused;
    if (!paused) return;
    $('overlayTitle').textContent = 'Paused';
    $('overlayTitle').style.color = '';
    $('overlayText').textContent = 'Take a breather.';
    $('resumeBtn').hidden = false;
    $('rematchBtn').hidden = true;
  },

  showGameOver({ team, survivors, turns }) {
    setTimeout(() => {
      $('overlay').hidden = false;
      $('resumeBtn').hidden = true;
      $('rematchBtn').hidden = false;
      if (team) {
        $('overlayTitle').textContent = `${team.name} wins!`;
        $('overlayTitle').style.color = team.color;
        $('overlayText').textContent = `Survivors: ${survivors.map(s => `${s.name} (${Math.max(0, s.hp)} HP)`).join(', ')} · ${turns} turns`;
      } else {
        $('overlayTitle').textContent = 'Draw!';
        $('overlayTitle').style.color = '';
        $('overlayText').textContent = 'Nobody survived.';
      }
    }, 900);
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
