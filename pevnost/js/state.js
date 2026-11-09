// Stav hráče, odměny, série, ukládání (Google účet přes Firebase nebo host).
'use strict';

const GUEST_KEY = 'pevnost.guest.v1';

function todayStr(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayDiff(a, b) {
  return Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
}

function newKingdomState() {
  return { base: { hall: 1, forge: 0, tavern: 1, mine: 0 }, slots: Array(10).fill(null), wave: 1, deployed: [] };
}

function newState(name = 'Hrdina', age = 10) {
  return {
    v: 1, name, age,
    xp: 0, gold: 50,
    streak: 0, bestStreak: 0, lastDay: null,
    today: { date: todayStr(), count: 0, ids: [] },
    stats: { done: 0, cat: {}, bosses: 0, bestWave: 0, wins: 0, losses: 0 },
    achievements: {},
    kingdom: null,
    kingdoms: { fantasy: newKingdomState(), apocalypse: newKingdomState() },
    heroes: {},     // id -> { equip: {weapon, armor, trinket} }
    inventory: [],  // item ids
    history: [],
    updated: Date.now(),
  };
}

const Store = {
  state: null,
  user: null,        // Firebase user nebo null (host)
  dirty: false,      // host: neuložené změny
  fb: null,

  get isGuest() { return !this.user; },

  // ---- Firebase (volitelné) ----
  async initFirebase() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey) return false;
    const load = src => new Promise((ok, err) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = err; document.head.appendChild(s);
    });
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await load(base + 'firebase-app-compat.js');
    await load(base + 'firebase-auth-compat.js');
    await load(base + 'firebase-firestore-compat.js');
    firebase.initializeApp(cfg);
    this.fb = { auth: firebase.auth(), db: firebase.firestore() };
    return true;
  },

  async googleLogin() {
    if (!this.fb) throw new Error('Přihlášení přes Google není nastavené (chybí js/firebase-config.js).');
    const provider = new firebase.auth.GoogleAuthProvider();
    const res = await this.fb.auth.signInWithPopup(provider);
    this.user = res.user;
    const doc = await this.fb.db.collection('players').doc(this.user.uid).get();
    if (doc.exists) this.state = migrate(doc.data());
    else {
      this.state = newState(this.user.displayName ? this.user.displayName.split(' ')[0] : 'Hrdina');
      await this.save();
    }
    return this.state;
  },

  async logout() {
    if (this.fb) await this.fb.auth.signOut();
    this.user = null; this.state = null; this.dirty = false;
  },

  // ---- Host ----
  guestStart(name, age) {
    this.user = null;
    this.state = newState(name, age);
    this.dirty = true;
  },
  hasGuestSave() { try { return !!localStorage.getItem(GUEST_KEY); } catch { return false; } },
  guestLoad() {
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (!raw) return false;
      this.state = migrate(JSON.parse(raw)); this.user = null; this.dirty = false;
      return true;
    } catch { return false; }
  },

  // Účet: automaticky do cloudu. Host: jen když klikne na „Uložit“.
  changed() {
    this.state.updated = Date.now();
    if (this.user) this.save();
    else { this.dirty = true; UI.updateSaveBadge(); }
  },

  async save() {
    if (this.user && this.fb) {
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        this.fb.db.collection('players').doc(this.user.uid).set(JSON.parse(JSON.stringify(this.state)))
          .catch(e => UI.toast('Uložení selhalo: ' + e.message));
      }, 600);
    } else {
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(this.state)); } catch {}
      this.dirty = false;
    }
  },

  exportFile() {
    const blob = new Blob([JSON.stringify(this.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pevnost-' + this.state.name + '-' + todayStr() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importText(text) {
    const s = migrate(JSON.parse(text));
    if (typeof s.xp !== 'number') throw new Error('Neplatný soubor');
    this.state = s;
    if (this.user) this.save(); else this.dirty = true;
  },
};

function migrate(s) {
  const d = newState(s.name, s.age);
  const out = Object.assign(d, s);
  out.stats = Object.assign(d.stats, s.stats || {});
  out.kingdoms = Object.assign(newState().kingdoms, s.kingdoms || {});
  return out;
}

// ---------- Herní logika ----------
const Game = {
  rollDay() {
    const s = Store.state, t = todayStr();
    if (s.today.date !== t) s.today = { date: t, count: 0, ids: [] };
    // série přerušena, pokud poslední aktivní den byl předevčírem nebo dříve
    if (s.lastDay && dayDiff(s.lastDay, t) > 1) s.streak = 0;
  },

  streakMultiplier() {
    const st = Store.state.streak;
    return 1 + Math.min(0.5, st * 0.05); // +5 % za každý den, max +50 %
  },

  completeActivity(act) {
    const s = Store.state;
    this.rollDay();
    const lvlBefore = levelFromXp(s.xp);
    const base = activityReward(act);
    const repeat = s.today.ids.filter(i => i === act.id).length;
    const fade = repeat >= 3 ? 0.25 : 1; // proti „farmení“ stejné aktivity
    const mult = this.streakMultiplier() * fade;
    let xp = Math.round(base.xp * mult), gold = Math.round(base.gold * mult);
    const notes = [];

    if (s.lastDay !== todayStr()) {
      s.streak = (s.lastDay && dayDiff(s.lastDay, todayStr()) === 1) ? s.streak + 1 : 1;
      s.lastDay = todayStr();
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      const bonus = 10 + s.streak * 5;
      gold += bonus; xp += bonus;
      notes.push(`🔥 Série ${s.streak} ${s.streak === 1 ? 'den' : s.streak < 5 ? 'dny' : 'dní'}! +${bonus} bonus`);
      if (s.streak % 7 === 0) { gold += 100; notes.push('🎁 Týdenní truhla: +100 zlaťáků'); }
    }
    if (fade < 1) notes.push('Tohle už dnes bylo 3×, zkus něco jiného 😉');

    s.xp += xp; s.gold += gold;
    s.today.count++; s.today.ids.push(act.id);
    s.stats.done++; s.stats.cat[act.cat] = (s.stats.cat[act.cat] || 0) + 1;
    s.history.unshift({ id: act.id, t: Date.now(), xp, gold });
    s.history.length = Math.min(s.history.length, 100);

    const lvlAfter = levelFromXp(s.xp);
    if (lvlAfter > lvlBefore) notes.push(`⬆️ Nová úroveň ${lvlAfter}!`);
    notes.push(...this.checkAchievements());
    Store.changed();
    return { xp, gold, notes };
  },

  checkAchievements() {
    const s = Store.state, out = [];
    for (const a of ACHIEVEMENTS) {
      if (!s.achievements[a.id] && a.cond(s)) {
        s.achievements[a.id] = Date.now();
        s.gold += a.gold; s.xp += a.gold;
        out.push(`${a.icon} Úspěch: ${a.name} (+${a.gold} 💰)`);
      }
    }
    return out;
  },

  level() { return levelFromXp(Store.state.xp); },
  kd() { return Store.state.kingdoms[Store.state.kingdom]; },

  spend(n) {
    if (Store.state.gold < n) { UI.toast('Nemáš dost zlaťáků 💰 — splň nějakou aktivitu!'); return false; }
    Store.state.gold -= n; return true;
  },

  heroStats(id) {
    const h = HEROES.find(x => x.id === id), own = Store.state.heroes[id] || { equip: {} };
    const st = { hp: h.hp, dmg: h.dmg, range: h.range, rate: h.rate, splash: h.splash || 0, slow: h.slow || 0, heal: h.heal || 0 };
    for (const slot in own.equip) {
      const it = ITEMS.find(i => i.id === own.equip[slot]);
      if (!it) continue;
      st.hp += it.hp || 0; st.dmg += it.dmg || 0;
      if (it.rate) st.rate *= (1 - it.rate);
    }
    return st;
  },

  heroCap() { return 1 + this.kd().base.tavern; },

  battleResult(win, wave, earned) {
    const s = Store.state, kd = this.kd();
    const notes = [];
    if (win) {
      const mine = 1 + kd.base.mine * 0.1;
      const gold = Math.round((20 + wave * 6 + earned) * mine), xp = 15 + wave * 4;
      s.gold += gold; s.xp += xp; s.stats.wins++;
      if (wave % 5 === 0) s.stats.bosses++;
      s.stats.bestWave = Math.max(s.stats.bestWave, wave);
      kd.wave = wave + 1;
      notes.push(`+${gold} 💰  +${xp} XP`);
    } else {
      // ztráta zlata a XP, ale nikdy pod začátek aktuální úrovně
      const lossGold = Math.round(s.gold * 0.15);
      const floor = xpForLevel(levelFromXp(s.xp));
      const lossXp = Math.min(10 + wave * 3, s.xp - floor);
      s.gold -= lossGold; s.xp -= lossXp; s.stats.losses++;
      notes.push(`-${lossGold} 💰  -${lossXp} XP`);
    }
    notes.push(...this.checkAchievements());
    Store.changed();
    return notes;
  },
};
