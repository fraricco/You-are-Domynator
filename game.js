// You Are Domynator - Tasks 1-2
// T1: foundations + static political map
// T2: time loop, alt map views, HUD, monthly income/research
// Upcoming: combat, research effects, AI, polish.

(function () {
  'use strict';

  // ---------- State ----------
  const state = {
    started: false,
    player: null,                // country id
    view: 'political',
    selected: null,              // country id
    target: null,                // adjacent enemy country id (set on Task 3)
    cstate: {},                  // per-country dynamic state: { owner, troops }
    mouse: { x: 0, y: 0, on: null },
    // Task 2: time, resources
    date: { year: 2026, month: 1, day: 1 },
    speed: 1,                    // 0 paused, 1, 2, 5
    money: 0,
    research: 0,
    tech: { drones: 0, robots: 0, nukes: 0 },
    nukeStock: 0,
    log: []
  };

  const TECH_DEFS = {
    drones: {
      name: 'Drone Swarms',
      desc: '+10% attack power per level.',
      max: 5,
      cost: lvl => ({ money: 200 + lvl * 100, research: 30 + lvl * 20 })
    },
    robots: {
      name: 'Combat Robots',
      desc: '+15% attack, -5% attacker losses per level.',
      max: 5,
      cost: lvl => ({ money: 350 + lvl * 150, research: 50 + lvl * 30 })
    },
    nukes: {
      name: 'Nuclear Arsenal',
      desc: '+1 warhead per level. Strike wipes 80% of target troops.',
      max: 5,
      cost: lvl => ({ money: 1000 + lvl * 500, research: 200 + lvl * 100 })
    }
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function daysInMonth(y, m) {
    const d = [31,28,31,30,31,30,31,31,30,31,30,31];
    if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return 29;
    return d[m - 1];
  }

  // Precomputed ranges (filled at start)
  let GDP_MAX = 1, POP_MAX = 1;

  // ---------- Boot: nation picker ----------
  const picker = document.getElementById('nation-pick');
  Object.values(COUNTRIES)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      picker.appendChild(opt);
    });
  picker.value = 'ITA';

  document.getElementById('start-btn').addEventListener('click', () => startGame(picker.value));

  function startGame(playerId) {
    state.started = true;
    state.player = playerId;
    state.cstate = {};
    for (const id in COUNTRIES) {
      state.cstate[id] = { owner: id, troops: COUNTRIES[id].troops };
    }
    state.date = { year: 2026, month: 1, day: 1 };
    state.speed = 1;
    state.money = 500;
    state.research = 0;
    state.tech = { drones: 0, robots: 0, nukes: 0 };
    state.nukeStock = 0;
    state.log = [];
    state.ended = null;
    state.warWith = {};
    state.aiTickCounter = 0;
    state.effects = [];
    document.getElementById('endgame').classList.add('hidden');

    // Compute heatmap ranges
    GDP_MAX = 1; POP_MAX = 1;
    for (const id in COUNTRIES) {
      if (COUNTRIES[id].gdp > GDP_MAX) GDP_MAX = COUNTRIES[id].gdp;
      if (COUNTRIES[id].pop > POP_MAX) POP_MAX = COUNTRIES[id].pop;
    }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-root').classList.remove('hidden');
    fitCanvas();
    log(`${COUNTRIES[playerId].name} rises. Conquer the world.`, 'good');
    updateLegend();
    updateHUD();
    updateResearch();
    updateCountryPanel();
    render();
    startLoop();
  }

  // ---------- Canvas sizing ----------
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');

  function fitCanvas() {
    const wrap = document.getElementById('map-wrap');
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = 1600 * dpr;
    canvas.height = 900 * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', () => { if (state.started) { fitCanvas(); render(); } });

  // ---------- Mouse → country picking ----------
  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function canvasCoord(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (1600 / rect.width);
    const y = (evt.clientY - rect.top) * (900 / rect.height);
    return [x, y];
  }

  function findCountryAt(x, y) {
    for (const id in COUNTRIES) {
      if (pointInPolygon([x, y], COUNTRIES[id].polygon)) return id;
    }
    return null;
  }

  canvas.addEventListener('mousemove', evt => {
    const [x, y] = canvasCoord(evt);
    state.mouse.x = x; state.mouse.y = y;
    const id = findCountryAt(x, y);
    state.mouse.on = id;
    updateTooltip(evt, id);
  });
  canvas.addEventListener('mouseleave', () => {
    state.mouse.on = null;
    document.getElementById('tooltip').classList.add('hidden');
  });
  canvas.addEventListener('click', evt => {
    const [x, y] = canvasCoord(evt);
    const id = findCountryAt(x, y);
    if (id) {
      state.selected = id;
      updateCountryPanel();
      render();
    }
  });

  // ---------- Tooltip ----------
  function updateTooltip(evt, id) {
    const tt = document.getElementById('tooltip');
    if (!id) { tt.classList.add('hidden'); return; }
    const c = COUNTRIES[id];
    const cs = state.cstate[id];
    tt.innerHTML = `<div class="name">${c.name}</div>` +
      `<div>Owner: <b>${COUNTRIES[cs.owner].name}</b></div>` +
      `<div>Troops: <b>${cs.troops}</b></div>`;
    tt.style.left = (evt.clientX + 14) + 'px';
    tt.style.top = (evt.clientY + 14) + 'px';
    tt.classList.remove('hidden');
  }

  // ---------- Country info panel ----------
  function updateCountryPanel() {
    const info = document.getElementById('country-info');
    const actions = document.getElementById('country-actions');
    if (!state.selected) {
      info.className = 'info-empty';
      info.textContent = 'Click a country on the map.';
      actions.classList.add('hidden');
      actions.innerHTML = '';
      return;
    }
    const id = state.selected;
    const c = COUNTRIES[id];
    const cs = state.cstate[id];
    const owner = COUNTRIES[cs.owner];
    info.className = '';
    info.innerHTML = `
      <div class="name">${flagMiniHtml(owner.flag)} ${c.name}</div>
      <div class="row"><span>Owner</span><b>${owner.name}</b></div>
      <div class="row"><span>Troops</span><b>${cs.troops}</b></div>
      <div class="row"><span>Population</span><b>${c.pop} M</b></div>
      <div class="row"><span>GDP</span><b>$${c.gdp} B</b></div>
      <div class="row"><span>Oil</span><b>${c.oil}</b></div>
    `;

    actions.innerHTML = '';
    if (cs.owner === state.player) {
      actions.classList.remove('hidden');
      const recruitBtn = document.createElement('button');
      recruitBtn.textContent = `Recruit +50 troops ($25)`;
      recruitBtn.disabled = state.money < 25;
      recruitBtn.addEventListener('click', () => recruit(id));
      actions.appendChild(recruitBtn);

      const adj = ADJ[id] || [];
      const enemies = adj.filter(a => state.cstate[a].owner !== state.player);
      if (enemies.length) {
        const heading = document.createElement('div');
        heading.style.cssText = 'font-size:.7rem;color:#9aa6b8;margin-top:.5rem;letter-spacing:.12em;';
        heading.textContent = 'INVADE NEIGHBOR';
        actions.appendChild(heading);
        for (const eId of enemies) {
          const btn = document.createElement('button');
          btn.className = 'danger';
          const defT = state.cstate[eId].troops;
          btn.textContent = `${COUNTRIES[eId].name} · ${defT} def.`;
          btn.disabled = cs.troops <= 100;
          btn.addEventListener('click', () => invade(id, eId));
          actions.appendChild(btn);
        }
      }
    } else {
      // Foreign country: only the nuke option (if any warhead)
      if (state.nukeStock > 0) {
        actions.classList.remove('hidden');
        const btn = document.createElement('button');
        btn.className = 'danger';
        btn.textContent = `☢ Launch Nuke (${state.nukeStock} ready)`;
        btn.addEventListener('click', () => nuke(id));
        actions.appendChild(btn);
      } else {
        actions.classList.add('hidden');
      }
    }
  }

  // ---------- Research panel ----------
  function updateResearch() {
    const el = document.getElementById('research-list');
    if (!el) return;
    el.innerHTML = '';
    for (const key of ['drones', 'robots', 'nukes']) {
      const def = TECH_DEFS[key];
      const lvl = state.tech[key];
      const card = document.createElement('div');
      card.className = 'research-item';
      const pct = (lvl / def.max) * 100;
      const stockTag = key === 'nukes' ? ` · ${state.nukeStock} ready` : '';
      card.innerHTML = `
        <div class="top"><span class="name">${def.name}${stockTag}</span><span class="lvl">L${lvl}/${def.max}</span></div>
        <div class="desc">${def.desc}</div>
        <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
      `;
      if (lvl < def.max) {
        const cost = def.cost(lvl);
        const btn = document.createElement('button');
        btn.className = 'buy';
        btn.textContent = `Research L${lvl + 1} — $${cost.money}, ${cost.research} R`;
        btn.disabled = state.money < cost.money || state.research < cost.research;
        btn.addEventListener('click', () => buyTech(key));
        card.appendChild(btn);
      }
      el.appendChild(card);
    }
  }

  function buyTech(key) {
    const def = TECH_DEFS[key];
    const lvl = state.tech[key];
    if (lvl >= def.max) return;
    const cost = def.cost(lvl);
    if (state.money < cost.money || state.research < cost.research) {
      log('Not enough resources for research.', 'bad');
      return;
    }
    state.money -= cost.money;
    state.research -= cost.research;
    state.tech[key] = lvl + 1;
    if (key === 'nukes') state.nukeStock += 1;
    log(`Researched ${def.name} L${lvl + 1}.`, 'good');
    updateHUD(); updateResearch(); updateCountryPanel();
  }

  function nuke(id) {
    if (state.nukeStock <= 0) return;
    if (state.cstate[id].owner === state.player) return;
    state.warWith[state.cstate[id].owner] = true;
    state.nukeStock -= 1;
    const before = state.cstate[id].troops;
    state.cstate[id].troops = Math.max(0, Math.round(before * 0.2));
    const tc = COUNTRIES[id];
    addEffect({ type: 'nuke', x: tc.capital[0], y: tc.capital[1], ttl: 80 });
    log(`☢ Nuclear strike on ${COUNTRIES[id].name}: troops ${before} → ${state.cstate[id].troops}.`, 'bad');
    updateHUD(); updateResearch(); updateCountryPanel(); render();
    checkEndgame();
  }

  // ---------- AI ----------
  function aiTick() {
    const factions = {};
    for (const id in state.cstate) {
      const o = state.cstate[id].owner;
      if (o === state.player) continue;
      (factions[o] = factions[o] || []).push(id);
    }
    for (const owner in factions) {
      const territories = factions[owner];
      // Recruit pass: organic growth, weighted by GDP of territory
      for (const id of territories) {
        const c = COUNTRIES[id];
        if (Math.random() < 0.30) {
          state.cstate[id].troops += 20 + Math.floor(Math.random() * 30) + Math.floor(c.gdp / 600);
        }
      }
      // Attack pass: probability per territory; pick weakest adjacent
      for (const id of territories) {
        if (Math.random() > 0.10) continue;
        const adj = ADJ[id] || [];
        const targets = adj.filter(a => state.cstate[a].owner !== owner);
        if (!targets.length) continue;
        targets.sort((a, b) => state.cstate[a].troops - state.cstate[b].troops);
        const tgtId = targets[0];
        const N = state.cstate[id].troops - 50;
        if (N < 60) continue;
        const T = state.cstate[tgtId].troops;
        const ratio = N / Math.max(1, T);
        // AI is more cautious vs the player
        const minRatio = state.cstate[tgtId].owner === state.player ? 1.5 : 1.1;
        if (ratio < minRatio) continue;
        aiInvade(owner, id, tgtId, N);
      }
    }
  }

  function aiInvade(owner, srcId, tgtId, N) {
    const src = state.cstate[srcId];
    const tgt = state.cstate[tgtId];
    const T = tgt.troops;
    const atkRoll = N * (0.8 + Math.random() * 0.4);
    const defRoll = T * 1.25 * (0.8 + Math.random() * 0.4);
    const tgtWasPlayer = tgt.owner === state.player;
    src.troops -= N;
    if (atkRoll > defRoll) {
      const remaining = Math.max(15, Math.round((atkRoll - defRoll) * 0.5));
      tgt.owner = owner;
      tgt.troops = remaining;
      if (tgtWasPlayer) {
        state.warWith[owner] = true;
        const tc = COUNTRIES[tgtId];
        addEffect({ type: 'conquest', x: tc.cx, y: tc.cy, rgb: '239,68,68', ttl: 70 });
        log(`${COUNTRIES[owner].name} captured ${COUNTRIES[tgtId].name}!`, 'bad');
      }
    } else {
      const survivors = Math.max(15, Math.round((defRoll - atkRoll * 0.7) / 1.25));
      tgt.troops = survivors;
      if (tgtWasPlayer) {
        state.warWith[owner] = true;
        log(`Repelled ${COUNTRIES[owner].name}'s assault on ${COUNTRIES[tgtId].name}.`, 'good');
      }
    }
  }

  // ---------- Endgame ----------
  function checkEndgame() {
    if (state.ended) return;
    const t = territoryStats();
    if (t.pct >= 66.6) { state.ended = 'victory'; showEndgame(true, t); return; }
    let playerCount = 0;
    for (const id in state.cstate) if (state.cstate[id].owner === state.player) playerCount++;
    if (playerCount === 0 || state.cstate[state.player].owner !== state.player) {
      state.ended = 'defeat'; showEndgame(false, t);
    }
  }

  function showEndgame(victory, t) {
    state.speed = 0;
    document.querySelectorAll('.speed button').forEach(b =>
      b.classList.toggle('active', b.dataset.speed === '0'));
    const el = document.getElementById('endgame');
    el.classList.remove('hidden');
    el.classList.toggle('defeat', !victory);
    document.getElementById('end-title').textContent = victory ? 'VICTORY' : 'DEFEAT';
    document.getElementById('end-text').textContent = victory
      ? `You conquered ${t.pct.toFixed(1)}% of the conquerable world. Domynator achieved.`
      : `Your empire collapsed. Final territory: ${t.pct.toFixed(1)}%.`;
  }

  document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('endgame').classList.add('hidden');
    state.started = false;
    state.ended = null;
    document.getElementById('game-root').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
  });

  function flagMiniHtml(flag) {
    return `<span class="flag-mini" style="background:${flagCssGradient(flag)}"></span>`;
  }

  function flagCssGradient(flag) {
    if (!flag) return '#444';
    const cs = flag.colors;
    if (flag.type === 'h') {
      const stops = cs.map((c, i) => `${c} ${(i / cs.length) * 100}% ${((i + 1) / cs.length) * 100}%`).join(', ');
      return `linear-gradient(180deg, ${stops})`;
    }
    if (flag.type === 'v') {
      const stops = cs.map((c, i) => `${c} ${(i / cs.length) * 100}% ${((i + 1) / cs.length) * 100}%`).join(', ');
      return `linear-gradient(90deg, ${stops})`;
    }
    // 'block': horizontal stripes as a fallback
    const stops = cs.map((c, i) => `${c} ${(i / cs.length) * 100}% ${((i + 1) / cs.length) * 100}%`).join(', ');
    return `linear-gradient(180deg, ${stops})`;
  }

  // ---------- Rendering ----------
  function render() {
    if (!state.started) return;
    ctx.clearRect(0, 0, 1600, 900);

    // Ocean background
    drawOcean();

    // Countries: fill, border
    for (const id in COUNTRIES) {
      drawCountryFill(id);
    }
    for (const id in COUNTRIES) {
      drawCountryBorder(id);
    }

    // Capitals + flags + troop counts
    for (const id in COUNTRIES) {
      drawCapital(id);
      drawTerritoryFlag(id);
    }

    // Selection highlight + adjacent enemy markers
    if (state.selected) {
      const sel = state.cstate[state.selected];
      if (sel.owner === state.player) {
        const adj = ADJ[state.selected] || [];
        for (const eId of adj) {
          if (state.cstate[eId].owner !== state.player) drawTargetHighlight(eId);
        }
      }
      drawSelection(state.selected);
    }

    drawEffects();
  }

  // ---------- Effects ----------
  function addEffect(e) {
    state.effects.push(Object.assign({ age: 0, ttl: 60 }, e));
  }
  function tickEffects() {
    for (const e of state.effects) e.age += 1;
    if (state.effects.length) {
      state.effects = state.effects.filter(e => e.age < e.ttl);
    }
  }
  function drawEffects() {
    for (const e of state.effects) {
      const t = e.age / e.ttl;
      if (e.type === 'conquest') {
        ctx.beginPath();
        ctx.arc(e.x, e.y, 18 + t * 60, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${e.rgb || '255,215,0'}, ${(1 - t).toFixed(2)})`;
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.stroke();
      } else if (e.type === 'nuke') {
        const r = 8 + t * 110;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 90, 30, ${(0.45 * (1 - t)).toFixed(2)})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 240, 140, ${(0.7 * (1 - t)).toFixed(2)})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 80, ${(1 - t).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawTargetHighlight(id) {
    const c = COUNTRIES[id];
    ctx.save();
    ctx.beginPath();
    pathPolygon(c.polygon);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.restore();
  }

  function drawOcean() {
    const grd = ctx.createLinearGradient(0, 0, 0, 900);
    grd.addColorStop(0, '#0d2440');
    grd.addColorStop(1, '#08182b');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 1600, 900);

    // Subtle latitude lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 100; y < 900; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(1600, y);
      ctx.stroke();
    }
  }

  function drawCountryFill(id) {
    const c = COUNTRIES[id];
    ctx.beginPath();
    pathPolygon(c.polygon);
    ctx.fillStyle = fillForCountry(id);
    ctx.fill();
  }

  function fillForCountry(id) {
    const c = COUNTRIES[id];
    const cs = state.cstate[id];
    const owner = COUNTRIES[cs.owner];
    if (state.view === 'political') {
      return cs.owner === state.player ? brighten(owner.color, 0.2) : owner.color;
    }
    if (state.view === 'economy') {
      return heatmap(c.gdp, GDP_MAX, ['#0a2e1a', '#1f7a3f', '#9bd96b', '#fff59c']);
    }
    if (state.view === 'population') {
      return heatmap(c.pop, POP_MAX, ['#0a1a3e', '#1e3a8a', '#3b82f6', '#bfdbfe']);
    }
    if (state.view === 'oil') {
      return heatmap(c.oil, 100, ['#1a0a0a', '#5a2010', '#a83a10', '#f59e0b']);
    }
    if (state.view === 'diplomacy') {
      if (cs.owner === state.player) return '#22c55e';
      if (state.warWith && state.warWith[cs.owner]) return '#dc2626';
      return '#475569';
    }
    return owner.color;
  }

  function heatmap(value, max, stops) {
    const t = Math.min(1, Math.log10(1 + Math.max(0, value)) / Math.log10(1 + max));
    const seg = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(seg));
    return mixColor(stops[i], stops[i + 1], seg - i);
  }

  function parseHex(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }

  function mixColor(a, b, t) {
    const pa = parseHex(a), pb = parseHex(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function drawCountryBorder(id) {
    const c = COUNTRIES[id];
    ctx.beginPath();
    pathPolygon(c.polygon);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }

  function drawCapital(id) {
    const c = COUNTRIES[id];
    const [x, y] = c.capital;
    const ownedByPlayer = state.cstate[id].owner === state.player;
    const isHomeCapital = id === state.player;
    ctx.beginPath();
    ctx.arc(x, y, ownedByPlayer ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ownedByPlayer ? '#ffd700' : '#fff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    if (ownedByPlayer) {
      const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 300);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,215,0,${pulse.toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (isHomeCapital) {
      // Five-pointed star marker on the home capital
      drawStar(x, y - 14, 5, 6, 3, '#ffd700');
    }
  }

  function drawStar(cx, cy, points, outer, inner, fill) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = (i % 2 === 0) ? outer : inner;
      const a = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }

  function drawTerritoryFlag(id) {
    const c = COUNTRIES[id];
    const cs = state.cstate[id];
    const owner = COUNTRIES[cs.owner];
    // Flag rectangle scales slightly with country area
    const w = Math.max(20, Math.min(46, Math.sqrt(c.area) * 0.5));
    const h = w * 0.62;
    const x = c.cx - w / 2;
    const y = c.cy - h / 2;
    drawFlagRect(owner.flag, x, y, w, h);
    // Troop count label
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    const label = '' + cs.troops;
    ctx.strokeText(label, c.cx, y + h + 11);
    ctx.fillText(label, c.cx, y + h + 11);
  }

  function drawFlagRect(flag, x, y, w, h) {
    if (!flag) {
      ctx.fillStyle = '#888';
      ctx.fillRect(x, y, w, h);
    } else if (flag.type === 'v') {
      const n = flag.colors.length;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = flag.colors[i];
        ctx.fillRect(x + (w * i / n), y, w / n + 0.5, h);
      }
    } else if (flag.type === 'h') {
      const n = flag.colors.length;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = flag.colors[i];
        ctx.fillRect(x, y + (h * i / n), w, h / n + 0.5);
      }
    } else {
      // 'block' = simplified: top stripe, bottom stripe, center accent
      const n = flag.colors.length;
      ctx.fillStyle = flag.colors[0];
      ctx.fillRect(x, y, w, h / 2);
      ctx.fillStyle = flag.colors[Math.min(1, n - 1)];
      ctx.fillRect(x, y + h / 2, w, h / 2);
      if (n >= 3) {
        ctx.fillStyle = flag.colors[2];
        ctx.fillRect(x + w * 0.15, y + h * 0.3, w * 0.25, h * 0.4);
      }
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  function drawSelection(id) {
    const c = COUNTRIES[id];
    ctx.save();
    ctx.beginPath();
    pathPolygon(c.polygon);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd700';
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
  }

  function pathPolygon(poly) {
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }

  function brighten(hex, amount) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (!m) return hex;
    let r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ---------- View tabs ----------
  document.querySelectorAll('.view-tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.view-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.view = b.dataset.view;
      updateLegend();
      render();
    });
  });

  // ---------- Speed ----------
  document.querySelectorAll('.speed button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.speed button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.speed = parseInt(b.dataset.speed, 10);
    });
  });

  // ---------- Game loop ----------
  let lastFrame = 0;
  let dayAccum = 0;
  function startLoop() {
    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }
  function loop(ts) {
    if (!state.started) return;
    const dt = ts - lastFrame;
    lastFrame = ts;
    if (state.speed > 0 && !state.ended) {
      // 1x = 2 days/sec, 2x = 4 days/sec, 5x = 10 days/sec
      const daysPerSec = state.speed * 2;
      dayAccum += (dt / 1000) * daysPerSec;
      while (dayAccum >= 1) {
        advanceDay();
        dayAccum -= 1;
      }
      updateHUD();
      if (state.selected) updateCountryPanel();
    }
    tickEffects();
    render();
    requestAnimationFrame(loop);
  }

  function advanceDay() {
    const d = state.date;
    d.day += 1;
    if (d.day > daysInMonth(d.year, d.month)) {
      d.day = 1;
      d.month += 1;
      if (d.month > 12) { d.month = 1; d.year += 1; }
      advanceMonth();
    }
    state.aiTickCounter += 1;
    if (state.aiTickCounter >= 3) {
      state.aiTickCounter = 0;
      aiTick();
      checkEndgame();
    }
  }

  function advanceMonth() {
    let income = 0, research = 0;
    for (const id in state.cstate) {
      if (state.cstate[id].owner !== state.player) continue;
      const c = COUNTRIES[id];
      income += c.gdp * 0.04 + c.oil * 1.5 + c.pop * 0.4;
      research += 1 + c.gdp / 1500;
    }
    income = Math.round(income);
    research = Math.round(research * 10) / 10;
    state.money += income;
    state.research += research;
    if (state.selected) updateCountryPanel();
    updateResearch();
    log(`${MONTHS[state.date.month - 1]} ${state.date.year}: +$${income}  +${research} research`);
    checkEndgame();
  }

  // ---------- HUD ----------
  function updateHUD() {
    const d = state.date;
    document.getElementById('hud-date').textContent =
      `${MONTHS[d.month - 1]} ${String(d.day).padStart(2, '0')}, ${d.year}`;
    document.getElementById('hud-money').textContent = state.money.toLocaleString();
    document.getElementById('hud-research').textContent = state.research.toFixed(1);
    let troops = 0;
    for (const id in state.cstate) {
      if (state.cstate[id].owner === state.player) troops += state.cstate[id].troops;
    }
    document.getElementById('hud-troops').textContent = troops.toLocaleString();
    const t = territoryStats();
    document.getElementById('hud-territory').textContent = t.pct.toFixed(1) + '%';
  }

  function territoryStats() {
    const initialId = state.player;
    const initialArea = COUNTRIES[initialId].area;
    let owned = 0, conquered = 0;
    for (const id in state.cstate) {
      if (state.cstate[id].owner === state.player) {
        owned += COUNTRIES[id].area;
        if (id !== initialId) conquered += COUNTRIES[id].area;
      }
    }
    const conquerable = TOTAL_AREA - initialArea;
    return {
      pct: conquerable > 0 ? (conquered / conquerable) * 100 : 0,
      ownedArea: owned,
      conquered, conquerable
    };
  }

  // ---------- Legend ----------
  function updateLegend() {
    const el = document.getElementById('legend');
    const sw = (c, label) => `<div><span class="swatch" style="background:${c}"></span>${label}</div>`;
    let html = '';
    if (state.view === 'political') {
      html = `<div><b>Political</b></div>` +
        sw('#ffd700', 'Your nation (gold capital)') +
        sw('#888', 'Other nations (national colors)');
    } else if (state.view === 'economy') {
      html = `<div><b>GDP (log)</b></div>` +
        sw('#0a2e1a', 'Low') + sw('#1f7a3f', 'Mid') +
        sw('#9bd96b', 'High') + sw('#fff59c', 'Top');
    } else if (state.view === 'population') {
      html = `<div><b>Population (log)</b></div>` +
        sw('#0a1a3e', 'Low') + sw('#1e3a8a', 'Mid') +
        sw('#3b82f6', 'High') + sw('#bfdbfe', 'Top');
    } else if (state.view === 'oil') {
      html = `<div><b>Oil reserves</b></div>` +
        sw('#1a0a0a', 'None') + sw('#5a2010', 'Low') +
        sw('#a83a10', 'High') + sw('#f59e0b', 'Major');
    } else if (state.view === 'diplomacy') {
      html = `<div><b>Diplomacy</b></div>` +
        sw('#22c55e', 'Your territory') +
        sw('#dc2626', 'At war') +
        sw('#475569', 'Neutral');
    }
    el.innerHTML = html;
  }

  // ---------- Player actions ----------
  function recruit(id) {
    if (state.cstate[id].owner !== state.player) return;
    if (state.money < 25) { log('Not enough money to recruit.', 'bad'); return; }
    state.money -= 25;
    state.cstate[id].troops += 50;
    log(`Recruited 50 troops in ${COUNTRIES[id].name}.`);
    updateHUD(); updateCountryPanel(); render();
  }

  function invade(srcId, tgtId) {
    const src = state.cstate[srcId];
    const tgt = state.cstate[tgtId];
    if (src.owner !== state.player) return;
    if (tgt.owner === state.player) return;
    if (!ADJ[srcId] || !ADJ[srcId].includes(tgtId)) return;

    const garrison = 50;
    const N = src.troops - garrison;
    if (N < 50) { log(`Not enough troops in ${COUNTRIES[srcId].name} (need >100).`, 'bad'); return; }

    const T = tgt.troops;
    const tech = state.tech;
    const atkMult = 1 + 0.10 * tech.drones + 0.15 * tech.robots;
    const atkRoll = N * atkMult * (0.8 + Math.random() * 0.4);
    const defRoll = T * 1.25 * (0.8 + Math.random() * 0.4);

    const originalOwner = tgt.owner;
    state.warWith[originalOwner] = true;

    src.troops = garrison;
    if (atkRoll > defRoll) {
      const remaining = Math.max(20, Math.round((atkRoll - defRoll) / atkMult * 0.6));
      tgt.owner = state.player;
      tgt.troops = remaining;
      const tc = COUNTRIES[tgtId];
      addEffect({ type: 'conquest', x: tc.cx, y: tc.cy, rgb: '255,215,0', ttl: 70 });
      log(`Conquered ${COUNTRIES[tgtId].name}! ${remaining} troops occupy.`, 'good');
    } else {
      const survivors = Math.max(30, Math.round((defRoll - atkRoll * 0.7) / 1.25));
      tgt.troops = survivors;
      log(`Invasion of ${COUNTRIES[tgtId].name} repelled. Lost ${N} troops.`, 'bad');
    }
    // Robots reduce attacker losses on win or loss alike: refund some troops.
    if (state.tech.robots > 0) {
      const refund = Math.round(N * 0.05 * state.tech.robots);
      src.troops += refund;
    }
    updateHUD(); updateCountryPanel(); updateResearch(); render();
    checkEndgame();
  }

  // ---------- Log ----------
  function log(text, kind) {
    state.log.unshift({ text, kind, ts: `${MONTHS[state.date.month - 1]} ${state.date.day}` });
    if (state.log.length > 100) state.log.length = 100;
    const ul = document.getElementById('log');
    if (!ul) return;
    ul.innerHTML = state.log.slice(0, 30).map(e =>
      `<li class="${e.kind || ''}"><span class="ts">${e.ts}</span>${escapeHtml(e.text)}</li>`
    ).join('');
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  // Expose minimal hooks for future tasks
  window.__game = { state, render, log };
})();
