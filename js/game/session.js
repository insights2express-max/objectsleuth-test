// GAME LOOP, FORMATS & MODES, SETTINGS & SAVING (v16 = M3 + M4 + M5; SDD 8.04–8.10, OS-33: 5.x)
//
//   Play formats  Countdown (1–5 min presets, Untimed, Custom 1–30 whole minutes) · Personal Best (time)
//   Presentation  Standard (the list word) · Scrambled (its letters mixed) · Silhouette (the object's
//                 shape as it appears in the room) · Mixed (5 / 5 / 5, random order, fixed for the round)
//   Scoring       100 per Target Object × CHAL LVL (Low 1 · Medium 1.5 · High 2), figurative forms +50 %,
//                 revealed 0, finishing the round +500, Countdown +5 per second left (OS-33: 5.1)
//   Saving        the round in play (seed, settings, finds, score, time) is kept on the device and resumes
//                 after a reload; Personal Bests record score, time and the lighting they were set in.
// Nothing here animates: the timer is page text, updated once a second (zero-idle rule).
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('objectsleuth.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('objectsleuth.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem('objectsleuth.' + k); } catch (e) { /* ignore */ } },
};
export { store };

export const PRESENT = { standard: 'Standard', scrambled: 'Scrambled', silhouette: 'Silhouette', mixed: 'Mixed' };
export const FORMATS = { countdown: 'Countdown', pb: 'Personal Best' };
const DEFAULTS = { presentation: 'standard', chal: 'med', format: 'countdown', minutes: 3, custom: 10, ask: true };

export function scramble(word, rnd = Math.random) {
  const one = (w) => {
    if (w.length < 3) return w.split('').reverse().join('');
    for (let k = 0; k < 8; k++) {
      const a = w.split('');
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      const s = a.join('');
      if (s !== w) return s;
    }
    return w.split('').reverse().join('');
  };
  return word.split(' ').map(one).join(' ').toUpperCase();
}
export const fmtTime = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export class Session {
  constructor(game) {
    this.game = game;           // { levels, lighting(): {preset, hours}, view(): name, restart(opts) }
    this.defaults = { ...DEFAULTS, ...store.get('defaults', {}) };
    this.round = null;
    this.pbs = store.get('pbs', {});
    this.buildUI();
    // the clock stops while the game is in the background (another app, a locked screen)
    document.addEventListener('visibilitychange', () => {
      const r = this.round;
      if (!r || r.ended) return;
      if (document.hidden && !r.paused) { r.elapsed = this.elapsed(); r.paused = true; this.save(); }
      else if (!document.hidden && r.paused) { r.startedAt = performance.now(); r.paused = false; }
    });
  }

  // ---------------------------------------------------------------- Per Scene Options (SDD 8.07)
  // Opens before each Scene Instance unless the player chose to use their saved defaults. Each section
  // has its own "make default" box (8.07.9). Resolves with the chosen options.
  askOptions(force = false) {
    const d = this.defaults;
    if (!force && !d.ask) return Promise.resolve({ ...d });
    const dlg = $('options');
    const set = (name, v) => dlg.querySelectorAll(`[name="${name}"]`).forEach((el) => { el.checked = el.value === String(v); });
    set('pres', d.presentation); set('chal', d.chal); set('fmt', d.format);
    $('opt-minutes').value = String(d.minutes);
    $('opt-custom').value = String(d.custom);
    $('opt-custom-row').hidden = d.minutes !== 'custom';
    for (const id of ['def-pres', 'def-chal', 'def-fmt']) $(id).checked = false;
    $('opt-skip').checked = !d.ask;
    dlg.hidden = false;
    return new Promise((resolve) => {
      this.optionsDone = () => {
        const val = (name) => (dlg.querySelector(`[name="${name}"]:checked`) || {}).value;
        const minutesSel = $('opt-minutes').value;
        const custom = Math.min(30, Math.max(1, Math.round(Number($('opt-custom').value) || 10)));
        const o = { presentation: val('pres') || d.presentation, chal: val('chal') || d.chal, format: val('fmt') || d.format,
          minutes: minutesSel === 'custom' || minutesSel === 'untimed' ? minutesSel : Number(minutesSel), custom };
        if ($('def-pres').checked) d.presentation = o.presentation;
        if ($('def-chal').checked) d.chal = o.chal;
        if ($('def-fmt').checked) { d.format = o.format; d.minutes = o.minutes; d.custom = o.custom; }
        d.ask = !$('opt-skip').checked;
        store.set('defaults', d);
        dlg.hidden = true;
        resolve(o);
      };
    });
  }

  // ---------------------------------------------------------------- a round
  // opts: { seed, presentation, chal, format, minutes, custom }; targets: the placed round
  begin(opts, targets, resume = null) {
    const list = targets.list;
    let seedRnd = (opts.seed ^ 0xabc) >>> 0 || 1;
    const rnd = () => { seedRnd ^= seedRnd << 13; seedRnd ^= seedRnd >>> 17; seedRnd ^= seedRnd << 5; return (seedRnd >>> 0) / 4294967296; };
    // presentation per Target Object (Mixed: equal shares, random order – fixed for the round, 8.06.10)
    const modes = list.map((_, i) => (opts.presentation === 'mixed' ? ['standard', 'scrambled', 'silhouette'][i % 3] : opts.presentation));
    if (opts.presentation === 'mixed') for (let i = modes.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [modes[i], modes[j]] = [modes[j], modes[i]]; }
    list.forEach((it, i) => {
      it.mode = modes[i];
      it.label = it.mode === 'scrambled' ? scramble(it.word, rnd) : it.word.charAt(0).toUpperCase() + it.word.slice(1);
    });
    const limit = opts.format === 'countdown' ? (opts.minutes === 'untimed' ? 0 : (opts.minutes === 'custom' ? opts.custom : opts.minutes) * 60) : 0;
    this.round = {
      opts, targets, limit, score: 0, found: [], revealed: [], ended: null,
      elapsed: resume ? resume.elapsed : 0, startedAt: performance.now(), paused: false,
    };
    if (resume) {
      this.round.score = resume.score;
      this.round.found = resume.found.slice();
      this.round.revealed = resume.revealed.slice();
    }
    this.hideEnd();
    this.updateHud();
    this.save();
  }
  elapsed() { const r = this.round; return r ? r.elapsed + (r.ended || r.paused ? 0 : (performance.now() - r.startedAt) / 1000) : 0; }
  left() { const r = this.round; return r && r.limit ? Math.max(0, r.limit - this.elapsed()) : null; }
  points(it) { return Math.round(100 * this.game.levels[this.round.opts.chal].mult * (it.form && !it.form.m ? 1.5 : 1)); }

  onFound(it, how) {
    const r = this.round;
    if (!r || r.ended) return;
    if (how === 'found') { r.score += this.points(it); r.found.push(it.def.id); this.flash(`+${this.points(it)}`); } else r.revealed.push(it.def.id);
    if (r.targets.list.every((t) => r.targets.resolved(t))) this.end('complete');
    this.updateHud();
    this.save();
  }

  // once a second (from the main loop's meter)
  tick() {
    const r = this.round;
    if (!r || r.ended) return;
    if (r.limit && this.left() <= 0) this.end('time');
    this.updateHud();
    if (Math.floor(this.elapsed()) % 10 === 0) this.save();
  }

  end(why) {
    const r = this.round;
    if (r.ended) return;
    r.elapsed = this.elapsed();
    r.ended = why;
    let bonus = 0;
    if (why === 'complete') { bonus = 500 + (r.limit ? 5 * Math.floor(Math.max(0, r.limit - r.elapsed)) : 0); r.score += bonus; }
    const key = this.pbKey(r.opts), old = this.pbs[key];
    const L = this.game.lighting();
    let best = false;
    if (why === 'complete' && (!old || r.score > old.score || (r.opts.format === 'pb' && r.elapsed < old.time))) {
      this.pbs[key] = { score: Math.max(r.score, old ? old.score : 0), time: Math.min(r.elapsed, old && old.time ? old.time : Infinity),
        date: new Date().toISOString().slice(0, 10), light: L.preset, hours: L.hours, view: this.game.view() };
      store.set('pbs', this.pbs);
      best = true;
    }
    this.save();
    this.showEnd(why, bonus, best, old);
    this.updateHud();
  }
  pbKey(o) { return ['study', o.chal, o.format, o.format === 'countdown' ? (o.minutes === 'custom' ? o.custom : o.minutes) : '', o.presentation].join('|'); }

  // ---------------------------------------------------------------- saving (M5)
  save() {
    const r = this.round;
    if (!r) return;
    store.set('round', { opts: r.opts, score: r.score, found: r.found, revealed: r.revealed, elapsed: this.elapsed(), ended: r.ended, avoid: r.opts.avoid || [] });
  }
  saved() { const s = store.get('round', null); return s && !s.ended && s.opts && s.opts.seed !== undefined ? s : null; }

  // ---------------------------------------------------------------- on screen
  buildUI() {
    $('opt-minutes').addEventListener('change', () => { $('opt-custom-row').hidden = $('opt-minutes').value !== 'custom'; });
    $('opt-start').addEventListener('click', () => this.optionsDone && this.optionsDone());
    $('end-restart').addEventListener('click', (e) => { e.stopPropagation(); this.hideEnd(); this.game.restart(); });
    $('endpop').addEventListener('click', () => this.hideEnd());                // tap anywhere: close (OS-26: 3.1.1)
    $('settings-btn').addEventListener('click', () => this.openSettings());
    $('set-close').addEventListener('click', () => { $('settings').hidden = true; });
    $('set-defaults').addEventListener('click', () => { $('settings').hidden = true; this.askOptions(true).then((o) => this.game.restart(o)); });
    $('set-clear').addEventListener('click', () => { if (confirm('Clear all Personal Bests?')) { this.pbs = {}; store.set('pbs', {}); this.renderPBs(); } });
  }
  updateHud() {
    const r = this.round;
    if (!r) return;
    $('hud-score').textContent = String(r.score);
    const t = r.limit ? this.left() : this.elapsed();
    $('hud-time').textContent = (r.limit ? '⏳ ' : '⏱️ ') + fmtTime(t);
    $('hud-time').classList.toggle('low', !!r.limit && t < 30 && !r.ended);
    $('hud-mode').textContent = `${FORMATS[r.opts.format]}${r.opts.format === 'countdown' ? ' · ' + (r.limit ? fmtTime(r.limit) : 'Untimed') : ''} · ${PRESENT[r.opts.presentation]}`;
  }
  flash(text) {
    const f = $('hud-flash');
    f.textContent = text; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
  }
  showEnd(why, bonus, best, old) {
    const r = this.round, all = r.targets.list.length;
    $('end-title').textContent = why === 'complete' ? 'Scene complete!' : "Time's up!";
    const lines = [
      `Score <b>${r.score}</b>` + (bonus ? ` <small>(incl. +${bonus} bonus)</small>` : ''),
      `Found <b>${r.found.length}</b> · revealed <b>${r.revealed.length}</b> · of ${all}`,
      `Time <b>${fmtTime(r.elapsed)}</b> · ${this.game.levels[r.opts.chal].label} · ${PRESENT[r.opts.presentation]}`,
    ];
    if (best) lines.push('🏆 <b>New Personal Best!</b>');
    else if (old) lines.push(`Personal Best: ${old.score}` + (old.time && isFinite(old.time) ? ` · ${fmtTime(old.time)}` : ''));
    $('end-body').innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
    $('endpop').hidden = false;
  }
  hideEnd() { $('endpop').hidden = true; }
  tease() { // "Close, but not this one." (OS-30: 1.1) – no points lost
    const t = $('tease');
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this.teaseTimer); this.teaseTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }
  openSettings() {
    this.renderPBs();
    $('settings').hidden = false;
  }
  renderPBs() {
    const rows = Object.entries(this.pbs).sort((a, b) => b[1].score - a[1].score).map(([k, v]) => {
      const [, chal, fmt, min, pres] = k.split('|');
      const light = v.light === 'auto' ? `Auto ${String(Math.floor(v.hours)).padStart(2, '0')}:${String(Math.floor((v.hours % 1) * 60)).padStart(2, '0')}` : v.light;
      return `<tr><td>${this.game.levels[chal] ? this.game.levels[chal].label : chal}</td><td>${FORMATS[fmt] || fmt}${min ? ' ' + (min === 'untimed' ? 'Untimed' : min + ' min') : ''}</td><td>${PRESENT[pres] || pres}</td><td><b>${v.score}</b></td><td>${v.time && isFinite(v.time) ? fmtTime(v.time) : '–'}</td><td>${light}</td><td>${v.date}</td></tr>`;
    });
    $('pb-table').innerHTML = rows.length ? `<tr><th>CHAL</th><th>Format</th><th>List</th><th>Score</th><th>Time</th><th>Lighting</th><th>Date</th></tr>${rows.join('')}` : '<tr><td>No Personal Bests yet – finish a Scene.</td></tr>';
  }
}
