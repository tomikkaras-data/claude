// Obrazovky a ovládání.
'use strict';

const $ = s => document.querySelector(s);
const itemIcon = (it, K, cls = 'gun-img') => it.img ? `<img class="${cls}" src="${it.img}" alt="">` : skin(it, K)[1];
const heroName = (h, K) => h.main ? Store.state.name : skin(h, K)[0];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const UI = {
  filter: 'all',

  async init() {
    $('#btn-guest').onclick = () => {
      const name = $('#guest-name').value.trim() || 'Hrdina';
      const age = +document.querySelector('input[name=age]:checked').value;
      Store.guestStart(name, age); this.afterLogin();
    };
    $('#btn-guest-load').onclick = () => { if (Store.guestLoad()) this.afterLogin(); };
    if (Store.hasGuestSave()) $('#btn-guest-load').classList.remove('hidden');
    $('#file-load-login').onchange = e => this.loadFile(e, () => { Store.user = null; this.afterLogin(); });
    $('#btn-google').onclick = async () => {
      try { await Store.googleLogin(); this.afterLogin(); }
      catch (e) { this.toast(e.message); }
    };
    document.querySelectorAll('.kcard').forEach(b => b.onclick = () => {
      Store.state.kingdom = b.dataset.k; Store.changed(); this.enterMain();
    });
    document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => this.tab(b.dataset.tab));
    $('#modal').onclick = e => { if (e.target.id === 'modal') this.closeModal(); };
    $('#btn-save').onclick = () => { Store.save(); this.updateSaveBadge(); this.toast('💾 Uloženo do zařízení'); };
    $('#btn-attack').onclick = () => this.startAttack();
    $('#btn-speed').onclick = () => { Battle.speed = Battle.speed === 2 ? 1 : 2; $('#btn-speed').textContent = Battle.speed + '×'; };
    window.addEventListener('beforeunload', e => { if (Store.state && Store.isGuest && Store.dirty) { e.preventDefault(); e.returnValue = ''; } });

    Battle.init($('#map'));
    // mapa se přizpůsobí, když se změní výška panelu pod ní
    if (window.ResizeObserver) new ResizeObserver(() => { if (this.current === 'base') Battle.resize(); }).observe($('.map-wrap'));
    Battle.onSlot = i => this.slotMenu(i);
    Battle.onEnd = (win, wave, earned) => this.attackEnded(win, wave, earned);

    try {
      if (await Store.initFirebase()) {
        Store.fb.auth.onAuthStateChanged(async u => {
          if (u && !Store.state) {
            Store.user = u;
            const doc = await Store.fb.db.collection('players').doc(u.uid).get();
            Store.state = doc.exists ? migrate(doc.data()) : newState(u.displayName || 'Hrdina');
            this.afterLogin();
          }
        });
      } else $('#btn-google').title = 'Nastav Firebase v js/firebase-config.js';
    } catch (e) { console.warn(e); }
  },

  show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); },

  afterLogin() {
    Game.rollDay();
    if (!Store.state.kingdom) this.show('screen-kingdom'); else this.enterMain();
  },

  enterMain() {
    document.body.className = 'k-' + Store.state.kingdom;
    this.show('screen-main');
    this.refresh();
    this.tab(this.current || 'activities');
  },

  tab(name) {
    this.current = name;
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    if (name === 'base') { Battle.show(Store.state.kingdom); requestAnimationFrame(() => Battle.resize()); }
    if (typeof IsoMap !== 'undefined') IsoMap.updatePlaceBox();
    else if (Battle.mode !== 'fight') Battle.stop();
    this.render(name);
  },

  render(name) {
    ({ activities: () => this.renderActivities(), base: () => this.renderBase(), heroes: () => this.renderHeroes(),
       armory: () => this.renderArmory(), achievements: () => this.renderAchievements(), profile: () => this.renderProfile() })[name]();
  },

  refresh() {
    const s = Store.state, lvl = levelFromXp(s.xp), a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
    $('#hud-streak').textContent = s.streak;
    $('#hud-gold').textContent = s.gold;
    $('#hud-level').textContent = lvl;
    $('#hud-xp').style.width = ((s.xp - a) / (b - a) * 100) + '%';
    this.updateSaveBadge();
  },

  updateSaveBadge() { $('#btn-save').classList.toggle('hidden', !(Store.state && Store.isGuest && Store.dirty)); },

  toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2600);
  },

  modal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); },
  closeModal() { $('#modal').classList.add('hidden'); clearInterval(this._timer); },

  loadFile(e, then) {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { try { Store.importText(t); then(); this.toast('Hra načtena ✅'); } catch (err) { this.toast('Soubor nejde načíst: ' + err.message); } });
    e.target.value = '';
  },

  // ---------------- Aktivity ----------------
  renderActivities() {
    const s = Store.state; Game.rollDay();
    const days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'], now = new Date();
    let week = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const on = s.streak > 0 && s.lastDay && dayDiff(todayStr(d), s.lastDay) >= 0 && dayDiff(todayStr(d), s.lastDay) < s.streak;
      week += `<span class="${on ? 'on' : ''}">${days[(d.getDay() + 6) % 7]}</span>`;
    }
    const doneToday = s.lastDay === todayStr();
    let html = `<div class="today"><div class="flame">${doneToday ? '🔥' : '🕯️'}</div><div>
      <b>${doneToday ? `Série ${s.streak} – super!` : s.streak ? `Udrž sérii ${s.streak}! Splň dnes aspoň 1 úkol.` : 'Začni sérii splněním úkolu!'}</b>
      <div class="small">Dnes splněno: ${s.today.count} · bonus série +${Math.round((Game.streakMultiplier() - 1) * 100)} %</div>
      <div class="week">${week}</div></div></div>`;

    html += '<div class="filters">' + [['all', '✨ Vše'], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.icon + ' ' + c.name])]
      .map(([k, n]) => `<button data-f="${k}" class="${this.filter === k ? 'on' : ''}">${n}</button>`).join('') + '</div>';

    const list = ACTIVITIES.filter(a => a.age <= s.age && (this.filter === 'all' || a.cat === this.filter));
    const groups = [['⭐ Hlavní úkoly', a => a.key], ['⚡ Rychlovky (do 1 min)', a => !a.key && a.sec < 60], ['⏱️ Krátké (2–5 min)', a => !a.key && a.sec >= 60 && a.sec < 600], ['🏅 Velké výzvy (10 min+)', a => !a.key && a.sec >= 600]];
    for (const [title, f] of groups) {
      const g = list.filter(f); if (!g.length) continue;
      html += `<div class="group-title">${title}</div>`;
      for (const a of g) {
        const r = activityReward(a), done = s.today.ids.includes(a.id);
        html += `<div class="act ${done ? 'done' : ''}" data-id="${a.id}"><div class="ic">${CATEGORIES[a.cat].icon}</div>
          <div class="nm">${esc(a.name)}<div class="meta">${a.label || (a.daily ? '📅 celý den · 1× denně' : '⏱ ' + durationLabel(a.sec))}</div></div>
          <div class="rw">+${r.xp} XP<br>+${r.gold} 💰</div></div>`;
      }
    }
    const el = $('#tab-activities'); el.innerHTML = html;
    el.querySelectorAll('.filters button').forEach(b => b.onclick = () => { this.filter = b.dataset.f; this.renderActivities(); });
    el.querySelectorAll('.act').forEach(b => b.onclick = () => this.openActivity(ACTIVITIES.find(a => a.id === b.dataset.id)));
  },

  openActivity(a) {
    if (a.daily && Store.state.today.ids.includes(a.id)) return this.toast('Tohle už máš dnes splněné ✅ Zítra znovu!');
    const r = activityReward(a), withTimer = !a.daily && a.sec <= 600 && a.cat === 'fitness' || a.sec <= 300;
    const C = 2 * Math.PI * 80;
    this.modal(`<h3>${CATEGORIES[a.cat].icon} ${esc(a.name)}</h3>
      <p class="small">Odměna: +${r.xp} XP, +${r.gold} 💰 (+ bonus série)</p>
      ${withTimer ? `<div class="ring"><svg width="180" height="180"><circle cx="90" cy="90" r="80" stroke="rgba(255,255,255,.12)" stroke-width="12" fill="none"/>
        <circle id="ring" cx="90" cy="90" r="80" stroke="var(--accent)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
        <div class="timer" id="timer">${this.fmt(a.sec)}</div></div>
        <button class="btn big" id="act-start">▶️ Start</button>`
      : `<p>${a.daily ? 'Tohle platí na celý den – potvrď to večer s rodičem 🌙.' : 'Tohle je velká výzva! Až ji splníš, ať ti to potvrdí rodič 👨‍👩‍👧.'}</p>
        <label style="display:block;margin:10px 0"><input type="checkbox" id="parent-ok"> Rodič potvrzuje, že je splněno</label>`}
      <button class="btn big ${withTimer ? 'hidden' : ''}" id="act-done" ${withTimer ? '' : 'disabled'}>✅ Splněno!</button>
      <button class="btn ghost big" id="act-cancel">Zpět</button>`);
    $('#act-cancel').onclick = () => this.closeModal();
    $('#act-done').onclick = () => this.finishActivity(a);
    if (!withTimer) { $('#parent-ok').onchange = e => { $('#act-done').disabled = !e.target.checked; }; return; }
    $('#act-start').onclick = () => {
      $('#act-start').classList.add('hidden');
      const end = Date.now() + a.sec * 1000;
      this._timer = setInterval(() => {
        const left = Math.max(0, (end - Date.now()) / 1000);
        $('#timer').textContent = this.fmt(Math.ceil(left));
        $('#ring').style.strokeDashoffset = C * (left / a.sec);
        // tlačítko Hotovo se objeví po polovině času (dítě může být rychlejší)
        if (left <= a.sec / 2) $('#act-done').classList.remove('hidden');
        if (left <= 0) { clearInterval(this._timer); $('#timer').textContent = '🎉'; navigator.vibrate && navigator.vibrate(200); }
      }, 200);
    };
  },

  fmt(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); },

  finishActivity(a) {
    clearInterval(this._timer);
    const res = Game.completeActivity(a);
    this.showReward('🎉', 'Skvělá práce!', `+${res.xp} XP · +${res.gold} 💰`, res.notes);
    this.refresh(); this.renderActivities();
  },

  showReward(icon, title, nums, notes = []) {
    this.modal(`<div class="reward"><div class="big">${icon}</div><h3>${title}</h3><div class="nums">${nums}</div>
      ${notes.length ? '<ul>' + notes.map(n => `<li>${esc(n)}</li>`).join('') + '</ul>' : ''}
      <button class="btn big" id="rw-ok">Pokračovat</button></div>`);
    $('#rw-ok').onclick = () => this.closeModal();
  },

  // ---------------- Pevnost ----------------
  renderBase() {
    const s = Store.state, K = s.kingdom, kd = Game.kd();
    $('#base-title').textContent = KINGDOMS[K].icon + ' ' + KINGDOMS[K].name;
    const boss = kd.wave % 5 === 0;
    $('#base-wave').textContent = `Další útok: vlna ${kd.wave}${boss ? ' – ⚠️ BOSS: ' + KINGDOMS[K].bossName : ''} · ${KINGDOMS[K].enemy}`;
    const fight = Battle.mode === 'fight';
    $('#btn-attack').disabled = fight;
    if (Battle.iso) return this.renderIsoPanel();
    let html = '<div class="row-scroll">';
    for (const [id, b] of Object.entries(BASE_BUILDINGS)) {
      const lv = kd.base[id], cost = b.baseCost * (lv + 1), [n, ic] = skin(b, K), max = lv >= 5;
      html += `<button class="bcard" data-b="${id}" ${fight ? 'disabled' : ''}><div class="bi">${ic}</div><b>${n}</b>úr. ${lv}<br>${max ? 'MAX' : '⬆️ ' + cost + ' 💰'}</button>`;
    }
    html += '</div><p class="small" style="margin:6px 4px">Klepni na ＋ na mapě a postav věž nebo zátaras. Hrdiny pošli do boje v záložce Hrdinové.</p>';
    $('#base-panel').innerHTML = html;
    document.querySelectorAll('.bcard').forEach(c => c.onclick = () => this.baseBuildingMenu(c.dataset.b));
  },

  baseBuildingMenu(id) {
    const K = Store.state.kingdom, kd = Game.kd(), b = BASE_BUILDINGS[id], lv = kd.base[id], cost = b.baseCost * (lv + 1), [n, ic] = skin(b, K);
    this.modal(`<h3>${ic} ${n} (úroveň ${lv})</h3><p>${b.desc}</p>
      ${lv < 5 ? `<button class="btn big gold" id="bb-up">Vylepšit za ${cost} 💰</button>` : '<p>Maximální úroveň 🏆</p>'}
      <button class="btn ghost big" id="bb-x">Zavřít</button>`);
    $('#bb-x').onclick = () => this.closeModal();
    if (lv < 5) $('#bb-up').onclick = () => {
      if (!Game.spend(cost)) return;
      kd.base[id]++; Store.changed(); this.closeModal(); this.refresh(); this.renderBase(); Battle.setupDefenders();
      this.toast(`${n} vylepšeno na úroveň ${kd.base[id]}!`);
    };
  },

  slotMenu(i) {
    const s = Store.state, K = s.kingdom, kd = Game.kd(), cur = kd.slots[i], lvl = Game.level();
    if (cur) {
      const b = BUILDINGS[cur], [n, ic] = skin(b, K), refund = Math.round(b.cost / 2);
      this.modal(`<h3>${ic} ${n}</h3><p class="small">${b.desc}</p>
        <button class="btn danger big" id="sl-sell">Zbourat (+${refund} 💰)</button>
        <button class="btn ghost big" id="sl-x">Zavřít</button>`);
      $('#sl-sell').onclick = () => { kd.slots[i] = null; s.gold += refund; Store.changed(); this.afterBuild(); };
    } else {
      let html = '<h3>Postavit</h3>';
      for (const [id, b] of Object.entries(BUILDINGS)) {
        if (b.type === 'decor') continue;
        const [n, ic] = skin(b, K), locked = (b.lvl || 1) > lvl;
        const info = b.type === 'tower' ? `⚔️ ${b.dmg} · 🎯 ${b.range}` : `❤️ ${b.hp}`;
        html += `<div class="list-item"><div class="li">${ic}</div><div class="lt"><b>${n}</b><div class="small">${b.desc} · ${info}</div></div>
          ${locked ? `<span class="small">🔒 úr. ${b.lvl}</span>` : `<button class="btn small" data-build="${id}">${b.cost} 💰</button>`}</div>`;
      }
      html += '<button class="btn ghost big" id="sl-x">Zavřít</button>';
      this.modal(html);
      document.querySelectorAll('[data-build]').forEach(btn => btn.onclick = () => {
        const b = BUILDINGS[btn.dataset.build];
        if (!Game.spend(b.cost)) return;
        kd.slots[i] = btn.dataset.build; Store.changed(); this.afterBuild();
      });
    }
    $('#sl-x').onclick = () => this.closeModal();
  },

  // ---------------- Izometrická základna (Pustina) ----------------
  // Záložky Stavby / Dekorace / Malování jako ve vesnici Cave Man RPG.
  renderIsoPanel() {
    const K = Store.state.kingdom, kd = Game.kd(), lvl = Game.level(), fight = Battle.mode === 'fight', s = Store.state;
    const tabs = [['build', '🏗️ Stavby'], ['decor', '🌵 Dekorace'], ['paint', '🖌️ Malování']];
    let html = `<div class="iso-tabs">${tabs.map(([k, n]) => `<button data-itab="${k}" class="${IsoMap.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    if (fight) html += '<p class="small">Probíhá útok! Stavět můžeš, až bude po boji. ⚔️</p>';
    else if (IsoMap.tab === 'build') {
      html += '<div class="row-scroll iso-bar">';
      for (const [id, b] of Object.entries(BASE_BUILDINGS)) {
        const lv = kd.base[id], [n, ic] = skin(b, K), onMap = kd.iso.placed.some(p => p.id === id);
        const label = onMap ? `✔ úr. ${lv}` : `${b.baseCost} 💰`;
        html += `<button class="bcard" data-ib="${id}" ${!onMap && s.gold < b.baseCost ? 'disabled' : ''}><div class="bi">${ic}</div><b>${n}</b><small>${b.desc.split('.')[0]}</small><br>${label}</button>`;
      }
      for (const [id, b] of Object.entries(BUILDINGS)) {
        const [n, ic] = skin(b, K), locked = (b.lvl || 1) > lvl;
        const info = b.type === 'tower' ? `⚔️${b.dmg} 🎯${b.range}` : `❤️${b.hp} · jen na cestu`;
        html += `<button class="bcard" data-it="${id}" ${locked || s.gold < b.cost ? 'disabled' : ''}><div class="bi">${ic}</div><b>${n}</b><small>${info}</small><br>${locked ? '🔒 úr. ' + b.lvl : b.cost + ' 💰'}</button>`;
      }
      html += '</div><p class="small hint-line">Vyber stavbu – objeví se na volném místě. Přetáhni ji nebo klepni jinam, pak ✔. Klepnutím na stavbu na mapě ji posuneš, otočíš, vylepšíš nebo zbouráš.</p>';
    } else if (IsoMap.tab === 'decor') {
      const f = IsoMap.decorFilter;
      html += `<div class="filters iso-filters">${[['all', 'Vše'], ...ISO_DECOR_GROUPS].map(([k, n]) => `<button data-df="${k}" class="${f === k ? 'on' : ''}">${n}</button>`).join('')}</div><div class="decor-grid">`;
      for (const [id, d] of Object.entries(ISO_DECOR)) {
        if (f !== 'all' && d.group !== f) continue;
        html += `<button class="dcard" data-dc="${id}" ${s.gold < d.cost ? 'disabled' : ''} title="${d.name}"><span>${d.icon}</span><small>${d.name}</small><em>${d.cost} 💰</em></button>`;
      }
      html += '</div>';
    } else {
      html += `<div class="paint-row">${Object.entries(ISO_BRUSHES).map(([k, b]) => `<button class="brush ${IsoMap.brush === k ? 'on' : ''}" data-br="${k}"><span style="background:${b.color}"></span><small>${b.name}</small></button>`).join('')}</div>
        <div class="paint-row">${[1, 2, 3].map(n => `<button class="size ${IsoMap.brushSize === n ? 'on' : ''}" data-bs="${n}">${n}×${n}</button>`).join('')}
          <button class="size ${IsoMap.paintMode ? 'on' : ''}" id="pm-toggle">${IsoMap.paintMode ? '🖌️ Maluju' : '✋ Posouvám mapu'}</button>
          <button class="size danger" id="pm-clear">Smazat malování</button></div>
        <p class="small hint-line">Táhni prstem po zemi a maluj. Cestu zombíků přemalovat nejde. Mapu posuneš přepínačem ✋ nebo dvěma prsty.</p>`;
    }
    $('#base-panel').innerHTML = html;
    document.querySelectorAll('[data-itab]').forEach(b => b.onclick = () => { IsoMap.tab = b.dataset.itab; IsoMap.placing = null; IsoMap.updatePlaceBox(); this.renderBase(); });
    document.querySelectorAll('[data-ib]').forEach(c => c.onclick = () => {
      const id = c.dataset.ib, p = kd.iso.placed.find(q => q.id === id);
      if (p) IsoMap.pickUp({ kind: 'build', o: p });
      else IsoMap.startNew('build', id, BASE_BUILDINGS[id].baseCost);
    });
    document.querySelectorAll('[data-it]').forEach(c => c.onclick = () => IsoMap.startNew('build', c.dataset.it, BUILDINGS[c.dataset.it].cost));
    document.querySelectorAll('[data-dc]').forEach(c => c.onclick = () => IsoMap.startNew('decor', c.dataset.dc, ISO_DECOR[c.dataset.dc].cost));
    document.querySelectorAll('[data-df]').forEach(b => b.onclick = () => { IsoMap.decorFilter = b.dataset.df; this.renderBase(); });
    document.querySelectorAll('[data-br]').forEach(b => b.onclick = () => { IsoMap.brush = b.dataset.br; IsoMap.paintMode = true; this.renderBase(); });
    document.querySelectorAll('[data-bs]').forEach(b => b.onclick = () => { IsoMap.brushSize = +b.dataset.bs; this.renderBase(); });
    const tg = $('#pm-toggle'); if (tg) tg.onclick = () => { IsoMap.paintMode = !IsoMap.paintMode; this.renderBase(); };
    const cl = $('#pm-clear'); if (cl) cl.onclick = () => { if (confirm('Smazat všechno, co jsi namaloval(a)?')) IsoMap.clearPaint(); };
  },

  isoUpgrade() {
    const p = IsoMap.placing; if (!p) return;
    IsoMap.cancel();
    this.baseBuildingMenu(p.id);
  },

  afterBuild() { this.closeModal(); this.refresh(); Battle.setupDefenders(); },

  startAttack() {
    const kd = Game.kd();
    if (Battle.iso) { IsoMap.placing = null; IsoMap.updatePlaceBox(); }
    const built = Battle.iso ? kd.iso.placed.some(p => BUILDINGS[p.id]) : kd.slots.some(Boolean);
    if (!built && !kd.deployed.length) { this.toast('Nejdřív postav aspoň jednu věž! 🏹'); return; }
    Battle.startWave(kd.wave);
    this.renderBase();
    this.toast(kd.wave % 5 === 0 ? '⚠️ Blíží se BOSS!' : `⚔️ Vlna ${kd.wave} útočí!`);
  },

  attackEnded(win, wave, earned) {
    const notes = Game.battleResult(win, wave, earned);
    this.refresh(); this.renderBase();
    if (win) this.showReward(wave % 5 === 0 ? '👑' : '🏆', `Vlna ${wave} ubráněna!`, '', notes);
    else this.showReward('💔', 'Pevnost padla…', '', [...notes, 'Postav víc věží, vylepši hrdiny a zkus to znovu!']);
  },

  // ---------------- Hrdinové ----------------
  renderHeroes() {
    const s = Store.state, K = s.kingdom, kd = Game.kd(), lvl = Game.level(), cap = Game.heroCap();
    let html = `<p class="small">V boji může být ${kd.deployed.length}/${cap} hrdinů (víc míst dá ${skin(BASE_BUILDINGS.tavern, K)[0]}).</p>`;
    for (const h of HEROES) {
      const own = s.heroes[h.id], ic = skin(h, K)[1], n = heroName(h, K), st = Game.heroStats(h.id), dep = kd.deployed.includes(h.id);
      html += `<div class="hero ${own ? '' : 'locked'}"><div class="hero-top"><div class="portrait">${ic}</div><div style="flex:1">
        <b>${n}</b><span class="tag">${h.cls}</span>${dep ? '<span class="tag">⚔️ v boji</span>' : ''}
        <div class="small">${h.bio}</div>
        <div class="stats"><span>❤️ ${st.hp}</span><span>⚔️ ${st.dmg}</span><span>⏱️ ${st.rate} s</span><span>🎯 ${st.range}</span>${st.heal ? `<span>💚 ${st.heal}</span>` : ''}</div></div></div>`;
      if (own) {
        html += '<div class="equip">' + Object.entries(SLOTS).map(([slot, sn]) => {
          const it = ITEMS.find(i => i.id === own.equip[slot]);
          return `<button class="slot ${it ? 'full' : ''}" data-h="${h.id}" data-slot="${slot}"><span class="si">${it ? itemIcon(it, K, 'slot-img') : '➕'}</span>${it ? skin(it, K)[0] : sn}</button>`;
        }).join('') + '</div>';
        html += `<div class="hero-actions"><button class="btn small ${dep ? 'ghost' : ''}" data-dep="${h.id}">${dep ? 'Stáhnout z boje' : 'Poslat do boje'}</button></div>`;
      } else if (h.lvl > lvl) html += `<div class="hero-actions"><button class="btn small" disabled>🔒 Odemkne se na úrovni ${h.lvl}</button></div>`;
      else html += `<div class="hero-actions"><button class="btn small gold" data-hire="${h.id}">Najmout za ${h.cost} 💰</button></div>`;
      html += '</div>';
    }
    const el = $('#tab-heroes'); el.innerHTML = html;
    el.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => {
      const h = HEROES.find(x => x.id === b.dataset.hire);
      if (!Game.spend(h.cost)) return;
      s.heroes[h.id] = { equip: {} };
      if (kd.deployed.length < cap) kd.deployed.push(h.id);
      this.toast(`${skin(h, K)[0]} se přidal(a) k tvé pevnosti!`);
      Game.checkAchievements(); Store.changed(); this.refresh(); this.renderHeroes();
    });
    el.querySelectorAll('[data-dep]').forEach(b => b.onclick = () => {
      const id = b.dataset.dep, i = kd.deployed.indexOf(id);
      if (i >= 0) kd.deployed.splice(i, 1);
      else if (kd.deployed.length >= cap) return this.toast('Žádné volné místo. Vylepši ' + skin(BASE_BUILDINGS.tavern, K)[0] + '!');
      else kd.deployed.push(id);
      Store.changed(); this.renderHeroes();
    });
    el.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => this.equipMenu(b.dataset.h, b.dataset.slot));
  },

  equipMenu(heroId, slot) {
    const s = Store.state, K = s.kingdom, forge = Game.kd().base.forge, own = s.heroes[heroId];
    const describe = it => this.describeItem(it);
    let html = `<h3>${SLOTS[slot]} pro ${heroName(HEROES.find(h => h.id === heroId), K)}</h3>`;
    if (own.equip[slot]) html += `<button class="btn ghost small" id="unequip">Sundat</button>`;
    const inv = s.inventory.filter(id => ITEMS.find(i => i.id === id).slot === slot);
    html += '<div class="group-title">🎒 Batoh</div>';
    html += inv.length ? [...new Set(inv)].map(id => {
      const it = ITEMS.find(i => i.id === id), [n, ic] = skin(it, K), cnt = inv.filter(x => x === id).length;
      return `<div class="list-item"><div class="li">${itemIcon(it, K)}</div><div class="lt"><b>${n}</b> ${cnt > 1 ? '×' + cnt : ''}<div class="small">${describe(it)}</div></div><button class="btn small" data-eq="${id}">Nasadit</button></div>`;
    }).join('') : '<p class="small">Prázdno.</p>';
    html += `<div class="group-title">🛒 Obchod (${skin(BASE_BUILDINGS.forge, K)[0]} úr. ${forge})</div>`;
    for (const it of this.shopItems().filter(i => i.slot === slot)) {
      const [n] = skin(it, K), locked = it.forge > forge;
      html += `<div class="list-item"><div class="li">${itemIcon(it, K)}</div><div class="lt"><b>${n}</b><div class="small">${describe(it)}</div></div>
        ${locked ? `<span class="small">🔒 ${skin(BASE_BUILDINGS.forge, K)[0]} ${it.forge}</span>` : `<button class="btn small gold" data-buy="${it.id}">${it.cost} 💰</button>`}</div>`;
    }
    html += '<button class="btn ghost big" id="eq-x">Zavřít</button>';
    this.modal(html);
    const done = () => { Store.changed(); this.refresh(); this.renderHeroes(); this.equipMenu(heroId, slot); };
    $('#eq-x').onclick = () => this.closeModal();
    const un = $('#unequip');
    if (un) un.onclick = () => { s.inventory.push(own.equip[slot]); delete own.equip[slot]; done(); };
    document.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => {
      if (own.equip[slot]) s.inventory.push(own.equip[slot]);
      s.inventory.splice(s.inventory.indexOf(b.dataset.eq), 1);
      own.equip[slot] = b.dataset.eq; done();
    });
    document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const it = ITEMS.find(i => i.id === b.dataset.buy);
      if (!Game.spend(it.cost)) return;
      if (own.equip[slot]) s.inventory.push(own.equip[slot]);
      own.equip[slot] = it.id; this.toast(skin(it, K)[0] + ' nasazeno!'); done();
    });
  },

  // ---------------- Zbrojnice ----------------
  shopItems() { const K = Store.state.kingdom; return ITEMS.filter(i => !i.kingdom || i.kingdom === K); },

  describeItem(it) {
    if (it.gun) return `${it.caliber} · ⚔️ ${it.dmg} · ⏱️ ${it.rpm} ran/min · 🎯 ${it.meters} m${it.splash ? ' · 💥 plošně' : ''}${it.slow ? ' · 🐌 zpomaluje' : ''}`;
    return [it.dmg && `⚔️+${it.dmg}`, it.hp && `❤️+${it.hp}`, it.rate && `⚡+${it.rate * 100}%`].filter(Boolean).join(' ');
  },

  armoryFilter: 'all',
  renderArmory() {
    const s = Store.state, K = s.kingdom, forge = Game.kd().base.forge, forgeName = skin(BASE_BUILDINGS.forge, K)[0];
    const items = this.shopItems();
    const filters = [['all', '✨ Vše'], ['inv', `🎒 Batoh (${s.inventory.length})`]];
    if (K === 'apocalypse') filters.push(...Object.entries(GUN_CLASSES).map(([k, c]) => [k, c.icon + ' ' + c.name]));
    else filters.push(['weapon', '⚔️ Zbraně']);
    filters.push(['armor', '🧥 Oblečení'], ['trinket', '📿 Doplňky']);
    let html = `<p class="small">Kup výbavu a nasaď ji sobě nebo hrdinům. Lepší zboží odemkne ${forgeName} (teď úr. ${forge}).</p>
      <div class="filters">${filters.map(([k, n]) => `<button data-af="${k}" class="${this.armoryFilter === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;

    const f = this.armoryFilter;
    if (f === 'inv') {
      const ids = [...new Set(s.inventory)];
      html += ids.length ? ids.map(id => {
        const it = ITEMS.find(i => i.id === id), cnt = s.inventory.filter(x => x === id).length;
        return this.itemCard(it, K, `<button class="btn small" data-give="${id}">Nasadit</button>`, cnt);
      }).join('') : '<p class="small">Batoh je prázdný. Něco si kup! 🛒</p>';
      // co mají hrdinové na sobě
      html += '<div class="group-title">🦸 Na hrdinech</div>';
      for (const [hid, own] of Object.entries(s.heroes)) {
        const h = HEROES.find(x => x.id === hid);
        const gear = Object.values(own.equip).map(id => ITEMS.find(i => i.id === id)).filter(Boolean);
        html += `<div class="list-item"><div class="li">${skin(h, K)[1]}</div><div class="lt"><b>${esc(heroName(h, K))}</b><div class="small">${gear.map(g => skin(g, K)[0]).join(', ') || 'bez výbavy'}</div></div></div>`;
      }
    } else {
      const order = { weapon: 0, armor: 1, trinket: 2 };
      const list = items.filter(it => f === 'all' || it.cls === f || (!it.gun && it.slot === f) || (f === 'weapon' && it.slot === 'weapon')).sort((a, b) => order[a.slot] - order[b.slot]);
      const max = { dmg: Math.max(...list.map(i => i.dmg || 0), 1), dps: Math.max(...list.map(i => i.gun ? i.dmg / i.rate : 0), 1), range: 260 };
      for (const it of list) {
        const locked = it.forge > forge, owned = s.inventory.filter(x => x === it.id).length;
        const btn = locked ? `<span class="small">🔒 ${forgeName} ${it.forge}</span>` : `<button class="btn small gold" data-abuy="${it.id}" ${s.gold < it.cost ? 'disabled' : ''}>${it.cost} 💰</button>`;
        html += this.itemCard(it, K, btn, owned, max);
      }
    }
    const el = $('#tab-armory'); el.innerHTML = html;
    el.querySelectorAll('[data-af]').forEach(b => b.onclick = () => { this.armoryFilter = b.dataset.af; this.renderArmory(); });
    el.querySelectorAll('[data-abuy]').forEach(b => b.onclick = () => {
      const it = ITEMS.find(i => i.id === b.dataset.abuy);
      if (!Game.spend(it.cost)) return;
      s.inventory.push(it.id); Store.changed(); this.refresh();
      this.toast(`${skin(it, K)[0]} je v batohu! 🎒`);
      this.giveMenu(it.id);
    });
    el.querySelectorAll('[data-give]').forEach(b => b.onclick = () => this.giveMenu(b.dataset.give));
  },

  itemCard(it, K, action, owned = 0, max) {
    const bar = (label, v, m, txt) => `<div class="sbar"><span>${label}</span><i><b style="width:${Math.min(100, v / m * 100)}%"></b></i><em>${txt}</em></div>`;
    const ownedTag = owned ? `<span class="tag">🎒 ×${owned}</span>` : '';
    if (it.gun) {
      const bars = max ? bar('Poškození', it.dmg, Math.max(max.dmg, 30), it.dmg) + bar('Kadence', it.dmg / it.rate, max.dps, it.rpm + '/min') + bar('Dostřel', it.range, max.range, it.meters + ' m') : '';
      return `<div class="gun-card"><div class="gun-frame"><img src="${it.img}" alt="${esc(skin(it, K)[0])}" loading="lazy">${ownedTag}
          <span class="gun-cls">${GUN_CLASSES[it.cls].icon} ${GUN_CLASSES[it.cls].name}</span></div>
        <div class="gun-body"><div class="gun-meta">${it.caliber}${it.splash ? ' · 💥 plošně' : ''}${it.slow ? ' · 🐌 zpomaluje' : ''}</div>${bars}</div>
        <div class="gun-act">${action}</div></div>`;
    }
    return `<div class="gun-card plain"><div class="plain-pic">${skin(it, K)[1]}</div>
      <div class="gun-body"><b>${esc(skin(it, K)[0])}</b> ${ownedTag}<div class="gun-meta">${this.describeItem(it)}</div></div>
      <div class="gun-act">${action}</div></div>`;
  },

  giveMenu(itemId) {
    const s = Store.state, K = s.kingdom, it = ITEMS.find(i => i.id === itemId);
    let html = `<h3>Komu dát ${esc(skin(it, K)[0])}?</h3><div class="center">${itemIcon(it, K, 'gun-img huge')}</div>`;
    for (const hid of Object.keys(s.heroes)) {
      const h = HEROES.find(x => x.id === hid), cur = ITEMS.find(i => i.id === s.heroes[hid].equip[it.slot]);
      html += `<div class="list-item"><div class="li">${skin(h, K)[1]}</div><div class="lt"><b>${esc(heroName(h, K))}</b>
        <div class="small">teď: ${cur ? skin(cur, K)[0] : 'nic'}</div></div><button class="btn small" data-to="${hid}">Nasadit</button></div>`;
    }
    html += '<button class="btn ghost big" id="gv-x">Nechat v batohu</button>';
    this.modal(html);
    $('#gv-x').onclick = () => this.closeModal();
    document.querySelectorAll('[data-to]').forEach(b => b.onclick = () => {
      const own = s.heroes[b.dataset.to];
      if (own.equip[it.slot]) s.inventory.push(own.equip[it.slot]);
      s.inventory.splice(s.inventory.indexOf(it.id), 1);
      own.equip[it.slot] = it.id; Store.changed();
      this.closeModal(); this.toast(`${heroName(HEROES.find(h => h.id === b.dataset.to), K)} má ${skin(it, K)[0]}!`);
      this.renderArmory();
    });
  },

  // ---------------- Úspěchy ----------------
  renderAchievements() {
    const s = Store.state, got = ACHIEVEMENTS.filter(a => s.achievements[a.id]).length;
    $('#tab-achievements').innerHTML = `<h2 style="margin:4px 0 12px">🏆 Úspěchy ${got}/${ACHIEVEMENTS.length}</h2><div class="ach-grid">` +
      ACHIEVEMENTS.map(a => `<div class="ach ${s.achievements[a.id] ? '' : 'locked'}"><div class="ai">${a.icon}</div><b>${a.name}</b><div class="small">${a.desc}</div><div class="small">+${a.gold} 💰</div></div>`).join('') + '</div>';
  },

  // ---------------- Profil ----------------
  renderProfile() {
    const s = Store.state, other = s.kingdom === 'fantasy' ? 'apocalypse' : 'fantasy';
    const u = Store.user;
    $('#tab-profile').innerHTML = `
      <div class="card"><h3>👤 ${esc(s.name)}</h3>
        <div class="small">${u ? 'Přihlášen přes Google: ' + esc(u.email || '') + ' – postup se ukládá automaticky ☁️' : 'Host – postup ukládej ručně!'}</div>
        <div class="small">Věková skupina: ${s.age >= 10 ? '10+' : '6–9'} let</div></div>
      <div class="card"><h3>📊 Statistiky</h3><div class="statgrid">
        <div><b>${Game.level()}</b>Úroveň</div><div><b>${s.xp}</b>XP celkem</div>
        <div><b>${s.stats.done}</b>Splněných úkolů</div><div><b>${s.bestStreak}</b>Nejdelší série</div>
        <div><b>${s.stats.wins}</b>Ubráněných vln</div><div><b>${s.stats.bosses}</b>Poražených bossů</div></div></div>
      <div class="card"><h3>🗺️ Království</h3>
        <p class="small">Teď hraješ: ${KINGDOMS[s.kingdom].name}. Každé království má vlastní stavby a vlny, hrdinové a vybavení jsou společné.</p>
        <button class="btn" id="pf-switch">Přepnout na ${KINGDOMS[other].icon} ${KINGDOMS[other].name}</button></div>
      <div class="card"><h3>💾 Uložení hry</h3>
        ${u ? '' : '<button class="btn gold" id="pf-save">Uložit do zařízení</button>'}
        <button class="btn" id="pf-export">Stáhnout zálohu (soubor)</button>
        <label class="btn ghost" style="display:inline-block">Načíst ze souboru<input type="file" id="pf-import" accept=".json" hidden></label></div>
      <div class="card"><h3>⚙️ Nastavení</h3>
        <button class="btn ghost" id="pf-age">Změnit věk na ${s.age >= 10 ? '6–9' : '10+'}</button>
        <button class="btn danger" id="pf-logout">${u ? 'Odhlásit' : 'Ukončit hru'}</button></div>`;
    $('#pf-switch').onclick = () => { s.kingdom = other; Store.changed(); this.enterMain(); this.tab('base'); };
    if (!u) $('#pf-save').onclick = () => { Store.save(); this.updateSaveBadge(); this.toast('💾 Uloženo'); };
    $('#pf-export').onclick = () => { Store.exportFile(); if (!u) { Store.dirty = false; this.updateSaveBadge(); } };
    $('#pf-import').onchange = e => this.loadFile(e, () => this.enterMain());
    $('#pf-age').onclick = () => { s.age = s.age >= 10 ? 6 : 10; Store.changed(); this.renderProfile(); };
    $('#pf-logout').onclick = async () => {
      if (!u && Store.dirty && !confirm('Máš neuložený postup. Opravdu odejít?')) return;
      Battle.stop(); await Store.logout(); location.reload();
    };
  },
};

UI.init();
