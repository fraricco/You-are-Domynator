// You Are Domynator - Task 1: foundations + static political map
// Subsequent tasks will add: time loop, views, combat, research, AI, polish.

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
    mouse: { x: 0, y: 0, on: null }
  };

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
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-root').classList.remove('hidden');
    fitCanvas();
    render();
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
    if (!state.selected) {
      info.className = 'info-empty';
      info.textContent = 'Click a country on the map.';
      return;
    }
    const c = COUNTRIES[state.selected];
    const cs = state.cstate[state.selected];
    const owner = COUNTRIES[cs.owner];
    info.className = '';
    info.innerHTML = `
      <div class="name">${flagMiniHtml(owner.flag)} ${c.name}</div>
      <div class="row"><span>Owner</span><b>${owner.name}</b></div>
      <div class="row"><span>Capital</span><b>${capitalName(c)}</b></div>
      <div class="row"><span>Troops</span><b>${cs.troops}</b></div>
      <div class="row"><span>Population</span><b>${c.pop} M</b></div>
      <div class="row"><span>GDP</span><b>$${c.gdp} B</b></div>
      <div class="row"><span>Oil</span><b>${c.oil}</b></div>
    `;
  }

  function capitalName(c) {
    // No explicit capital names in data yet; use country name + " (cap.)" placeholder.
    return c.name + ' capital';
  }

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

    // Selection highlight
    if (state.selected) {
      drawSelection(state.selected);
    }
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
    const cs = state.cstate[id];
    const owner = COUNTRIES[cs.owner];
    let fill = owner.color;
    if (cs.owner === state.player) {
      fill = brighten(owner.color, 0.15);
    }
    ctx.beginPath();
    pathPolygon(c.polygon);
    ctx.fillStyle = fill;
    ctx.fill();
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
    const isPlayerCap = state.cstate[id].owner === state.player && id === state.player;
    ctx.beginPath();
    ctx.arc(x, y, isPlayerCap ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isPlayerCap ? '#ffd700' : '#fff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    if (isPlayerCap) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,215,0,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
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

  // ---------- View tabs (placeholder for Task 2) ----------
  document.querySelectorAll('.view-tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.view-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.view = b.dataset.view;
      // Heatmap views land in Task 2; for now just re-render political.
      render();
    });
  });

  // ---------- Stub controls (real behavior in later tasks) ----------
  document.querySelectorAll('.speed button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.speed button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });

  // Expose minimal hooks for future tasks
  window.__game = { state, render };
})();
