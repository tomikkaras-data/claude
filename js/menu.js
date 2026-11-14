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
      mapSize: 'medium',
      mines: 'few',
      friendlyFire: false,
      crates: 'normal',
      weapons: {},
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

    for (const id of ['difficulty', 'theme', 'mapSize', 'mines', 'crates']) {
      $(id).value = s[id];
      $(id).onchange = () => { s[id] = $(id).value; this.save(); };
    }
    $('friendlyFire').value = s.friendlyFire ? 'on' : 'off';
    $('friendlyFire').onchange = () => { s.friendlyFire = $('friendlyFire').value === 'on'; this.save(); };
    $('weaponsBtn').onclick = () => this.showWeaponConfig(true);
    $('weaponsDone').onclick = () => this.showWeaponConfig(false);
    $('weaponsReset').onclick = () => { s.weapons = {}; this.save(); this.renderWeaponConfig(); };
    $('optBtn').onclick = () => { if (this.game) this.game.cycleOption(); $('optBtn').blur(); };
    this.updateWeaponsSummary();
    $('skipBtn').onclick = () => {
      if (!this.game) return;
      this.game.skipToEnd();
      $('skipBtn').disabled = true;
      $('skipBtn').textContent = 'Fast-forwarding…';
    };

    $('startBtn').onclick = () => this.start();
    $('resumeBtn').onclick = () => this.game && this.game.setPaused(false);
    $('rematchBtn').onclick = () => this.start();
    $('menuBtn').onclick = () => this.toMenu();
    $('pauseBtn').onclick = () => this.game && !this.game.over && this.game.setPaused(true);
    $('fullscreenBtn').onclick = () => Fullscreen.toggle();
    $('fullscreenBtn').hidden = !Fullscreen.supported();
    $('rotateClose').onclick = () => $('rotateHint').classList.add('dismissed');
    Touch.init(() => this.game);

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
    // On phones and tablets go fullscreen (also hides the browser bars)
    if (Touch.enabled && !Fullscreen.active() && Fullscreen.supported()) Fullscreen.enter();
    $('menu').hidden = true;
    $('gameScreen').hidden = false;
    $('overlay').hidden = true;
    this.showSkip(false);

    this.game = new Game($('canvas'), {
      players,
      turnTime: s.turnTime,
      health: s.health,
      difficulty: s.difficulty,
      theme: s.theme,
      mapSize: s.mapSize,
      mines: s.mines,
      friendlyFire: s.friendlyFire,
      crates: s.crates,
      weapons: s.weapons,
    }, {
      onWeaponsChanged: () => this.renderWeapons(),
      onPause: paused => this.showPause(paused),
      onGameOver: result => this.showGameOver(result),
      onSkipAvailable: show => this.showSkip(show),
    });
    if (Touch.enabled) this.game.isTouch = true;
    window.__game = this.game; // handy for debugging from the console
    this.renderWeapons();
    this.game.start();
  },

  showWeaponConfig(show) {
    $('menu').hidden = show;
    $('weaponsScreen').hidden = !show;
    if (show) this.renderWeaponConfig();
    else this.updateWeaponsSummary();
    window.scrollTo(0, 0);
  },

  updateWeaponsSummary() {
    const n = Object.keys(this.settings.weapons || {}).length;
    $('weaponsSummary').textContent = n ? `${n} weapon${n > 1 ? 's' : ''} changed` : 'All weapons at default values';
  },

  renderWeaponConfig() {
    const s = this.settings;
    s.weapons = s.weapons || {};
    const body = $('weaponRows');
    body.innerHTML = '';
    const LIMITS = { damage: 500, radius: 300, ammo: 99, bombletDamage: 500 };

    const input = (w, field) => {
      const d = WEAPON_DEFAULTS[w.id][field];
      const o = (s.weapons[w.id] || {})[field];
      const el = document.createElement('input');
      el.type = 'number';
      el.inputMode = 'numeric';
      el.min = 0;
      el.max = LIMITS[field];
      el.id = `cfg-${w.id}-${field}`;
      el.setAttribute('aria-label', `${w.name} ${field === 'bombletDamage' ? 'bomblet damage' : field}`);
      if (field === 'ammo') el.placeholder = '∞';
      const show = v => (v === Infinity || v < 0 ? '' : String(v));
      el.value = show(o != null ? o : d);
      const mark = () => el.classList.toggle('changed', o != null || (s.weapons[w.id] || {})[field] != null);
      el.onchange = () => {
        const raw = el.value.trim();
        let v;
        if (raw === '' && field === 'ammo') v = -1;
        else {
          v = parseInt(raw, 10);
          if (!isFinite(v)) { el.value = show(d); v = null; } else v = clamp(v, 0, LIMITS[field]);
        }
        const isDefault = v == null || v === d || (v === -1 && d === Infinity);
        const entry = s.weapons[w.id] || {};
        if (isDefault) delete entry[field]; else entry[field] = v;
        if (Object.keys(entry).length) s.weapons[w.id] = entry; else delete s.weapons[w.id];
        if (v != null) el.value = show(v);
        el.classList.toggle('changed', !isDefault);
        this.save();
      };
      mark();
      return el;
    };

    const addRow = (w, label, note, fields, sub) => {
      const tr = document.createElement('tr');
      if (sub) tr.className = 'sub';
      const name = document.createElement('td');
      name.className = 'name';
      name.innerHTML = `<span class="wname">${sub ? '' : w.icon} ${label}${w.crate && !sub ? ' <span class="badge">crate</span>' : ''}</span>` +
        (note ? `<span class="wnote">${note}</span>` : '');
      tr.appendChild(name);
      for (const f of fields) {
        const td = document.createElement('td');
        if (f && f in WEAPON_DEFAULTS[w.id]) td.appendChild(input(w, f));
        else { td.textContent = '—'; td.className = 'na'; }
        tr.appendChild(td);
      }
      body.appendChild(tr);
    };

    for (const w of WEAPONS) {
      if (w.kind === 'skip' || w.kind === 'rope') continue;
      addRow(w, w.name, w.note || '', ['damage', 'radius', 'ammo']);
      if (w.bombletDamage != null) addRow(w, w.subLabel, w.subNote, ['bombletDamage', null, null], true);
    }
  },

  showSkip(show) {
    const b = $('skipBtn');
    b.hidden = !show;
    b.disabled = false;
    b.textContent = '⏩ Skip to end';
  },

  toMenu() {
    if (this.game) this.game.destroy();
    this.game = null;
    $('overlay').hidden = true;
    this.showSkip(false);
    $('optBtn').hidden = true;
    $('gameScreen').hidden = true;
    $('menu').hidden = false;
  },

  renderWeapons() {
    const g = this.game;
    const bar = $('weaponBar');
    if (!g || !g.active) return;
    const c = g.active;
    const team = g.teams[c.team];
    Touch.update(g);
    const humanCanPick = !c.isCPU && !g.hasFired && !g.lockedWeapon && (g.state === 'turn' || g.state === 'banner');
    bar.innerHTML = '';
    for (const w of WEAPONS) {
      if (w.crate && !(team.ammo[w.id] > 0)) continue; // special weapons appear once found
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'weapon' + (c.weapon === w.id ? ' on' : '');
      const ammo = team.ammo[w.id];
      b.disabled = !humanCanPick || !(ammo > 0);
      b.title = w.key ? `${w.name} (${w.key})` : w.name;
      b.innerHTML = (w.key ? `<span class="key">${w.key}</span>` : '') +
        (ammo !== Infinity ? `<span class="ammo">×${ammo}</span>` : '') +
        `<span class="icon">${w.icon}</span><span>${w.name}</span>`;
      b.onclick = () => { g.selectWeapon(w.id); b.blur(); };
      bar.appendChild(b);
    }
    // timer / rotate button for the active human
    const opt = $('optBtn');
    const cw = WEAPON[c.weapon];
    const showOpt = !c.isCPU && !g.hasFired && !g.over && (g.state === 'turn' || g.state === 'banner') && (cw.fuseSelect || cw.id === 'concrete');
    opt.hidden = !showOpt;
    if (showOpt) opt.textContent = cw.fuseSelect ? `⏱ Timer ${c.fuse} s` : `↻ Rotate (${c.buildAngle}°)`;

    const on = bar.querySelector('.weapon.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },

  showPause(paused) {
    $('overlay').hidden = !paused;
    if (!paused) return;
    $('overlayTitle').textContent = 'Paused';
    $('overlayTitle').style.color = '';
    $('overlayText').textContent = 'Take a breather.';
    $('resumeBtn').hidden = false;
    $('fullscreenBtn').hidden = !Fullscreen.supported();
    $('rematchBtn').hidden = true;
  },

  showGameOver({ team, survivors, turns }) {
    const game = this.game;
    this.showSkip(false);
    $('optBtn').hidden = true;
    setTimeout(() => {
      if (this.game !== game) return; // a new match already started
      $('overlay').hidden = false;
      $('resumeBtn').hidden = true;
      $('fullscreenBtn').hidden = true;
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
