// Groundwork background graph.
// Draws the anonymised context-vault graph on a fixed canvas and flies a camera through it as the page scrolls.
// Each <section data-stop> declares what the camera does while that section is on screen:
//   data-stop="overview"   whole graph
//   data-stop="conflict"   the two conflicting "discount" notes in Revenue
//   data-stop="area"       one area,  data-area="Retention"
//   data-stop="areas"      several,   data-areas="Revenue,Retention,Acquisition"
//   data-stop="growth"     replays the vault being written, week by week (use on a tall section)
//   data-stop="quiet"      whole graph, dimmed behind dense text
//   data-stop="cta"        whole graph, slightly pulled back
// Optional: data-emphasis="types|tests", data-dim="0.35", data-hud="Title|Subtitle".

(async function () {
  const cv = document.getElementById("graph");
  if (!cv || !cv.getContext) return;
  let G;
  try { G = await (await fetch(cv.dataset.src)).json(); } catch { cv.remove(); return; }

  const N = G.n, X = Float32Array.from(G.x), Y = Float32Array.from(G.y);
  const T = Uint8Array.from(G.t), D = Uint8Array.from(G.d), C = Uint16Array.from(G.c), K = Uint16Array.from(G.k);
  const E = Uint16Array.from(G.e), EN = E.length / 2;
  const DOM = G.domains, DN = DOM.length;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const domIdx = name => DOM.findIndex(d => d.name === name.trim());

  // adjacency, hub note per area, overall hub
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < EN; i++) { adj[E[2 * i]].push(E[2 * i + 1]); adj[E[2 * i + 1]].push(E[2 * i]); }
  const hub = DOM.map((_, d) => { let b = -1; for (let i = 0; i < N; i++) if (D[i] === d && (b < 0 || K[i] > K[b])) b = i; return b; });
  let gHub = 0; for (let i = 1; i < N; i++) if (K[i] > K[gHub]) gHub = i;
  // area radius: 70th percentile distance from its centre, so a few outliers don't loosen the framing
  const domR = DOM.map((o, d) => { const ds = []; for (let i = 0; i < N; i++) if (D[i] === d) ds.push(Math.hypot(X[i] - o.x, Y[i] - o.y)); ds.sort((a, b) => a - b); return ds[Math.floor(ds.length * 0.7)] || o.r; });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); minY = Math.min(minY, Y[i]); maxY = Math.max(maxY, Y[i]); }
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2, spanX = maxX - minX, spanY = maxY - minY;

  // ---- canvas + viewport ----
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1, mobile = false;
  const focusPt = () => mobile ? [W * 0.5, H * 0.24] : [W * 0.665, H * 0.5];
  const fitZ = () => mobile ? Math.min(W * 1.05 / spanX, H * 0.42 / spanY) : Math.min(W * 0.6 / spanX, H * 0.94 / spanY);
  const viewBox = () => mobile ? [W * 0.9, H * 0.4] : [W * 0.46, H * 0.8];

  // ---- story stops ----
  const conflict = G.features.conflict;
  const REV = domIdx("Revenue");
  function camForAreas(ds) {
    if (ds.length === 1) { const o = DOM[ds[0]], [vw, vh] = viewBox(); return { x: o.x, y: o.y, z: Math.min(vw, vh) / (2 * domR[ds[0]] * 1.1) }; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const d of ds) { const o = DOM[d], r = domR[d]; x0 = Math.min(x0, o.x - r); x1 = Math.max(x1, o.x + r); y0 = Math.min(y0, o.y - r); y1 = Math.max(y1, o.y + r); }
    const [vw, vh] = viewBox();
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.min(vw * 1.15 / (x1 - x0), vh / (y1 - y0)) };
  }
  function camConflict() {
    const a = conflict[0], b = conflict[1], dist = Math.hypot(X[a] - X[b], Y[a] - Y[b]) || 40;
    const s = mobile ? W * 0.28 : Math.min(W, H) * 0.32;
    return { x: (X[a] + X[b]) / 2, y: (Y[a] + Y[b]) / 2, z: Math.min(s / dist, fitZ() * 9) };
  }
  const camAll = (k = 1) => () => ({ x: cx0, y: cy0, z: fitZ() * k });

  const stops = [...document.querySelectorAll("[data-stop]")].map(el => {
    const kind = el.dataset.stop, s = { el, kind, focus: null, dim: parseFloat(el.dataset.dim || "1"), emphasis: el.dataset.emphasis || "" };
    if (kind === "conflict") { s.cam = camConflict; s.focus = [REV]; s.conflict = true; }
    else if (kind === "area" || kind === "areas") {
      s.focus = (el.dataset.area || el.dataset.areas).split(",").map(domIdx).filter(d => d >= 0);
      s.cam = () => camForAreas(s.focus);
    }
    else if (kind === "growth") { s.cam = camAll(0.95); s.growth = true; }
    else if (kind === "quiet") { s.cam = camAll(1.05); if (!el.dataset.dim) s.dim = 0.4; }
    else if (kind === "cta") s.cam = camAll(0.9);
    else s.cam = camAll(1);
    const h = el.dataset.hud;
    if (h) s.hud = h.split("|");
    else if (s.focus && s.focus.length === 1) s.hud = [DOM[s.focus[0]].name, `${DOM[s.focus[0]].n} notes`];
    else if (s.focus) s.hud = [`${s.focus.length} areas`, `${s.focus.reduce((n, d) => n + DOM[d].n, 0)} notes`];
    else s.hud = ["Whole company", `${N} notes · ${DN} areas`];
    return s;
  });
  if (!stops.length) return;

  // Each stop holds the camera over a scroll range [h0, h1]; the camera flies between h1 of one stop and h0 of the next.
  function layout() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; mobile = W < 760;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const s of stops) {
      const r = s.el.getBoundingClientRect(), top = r.top + scrollY;
      if (s.growth) { s.h0 = top - H * 0.05; s.h1 = top + r.height - H * 1.15; }
      else if (r.height > H * 1.4) { s.h0 = top - H * 0.15; s.h1 = top + r.height - H * 0.85; }
      else s.h0 = s.h1 = top + r.height / 2 - H / 2;
      const c = s.el.querySelector(".copy"); s.textRight = c ? c.getBoundingClientRect().right : 0;
      s.camv = s.cam();
    }
  }

  // section dots
  const dotsEl = document.querySelector(".dots");
  if (dotsEl) stops.forEach(s => { const a = document.createElement("a"); a.href = "#" + s.el.id; a.setAttribute("aria-label", s.el.dataset.label || s.el.id); dotsEl.appendChild(a); });

  // ---- motion ----
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const ease = t => t * t * t * (t * (6 * t - 15) + 10);          // smootherstep: no jolt at either end
  function spring(p, target, omega, dt) {                           // critically damped spring, frame-rate independent
    const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, det = 1 / (f + dt * hoo);
    const x = (f * p.x + dt * p.v + dt * hoo * target) * det;
    p.v = (p.v + hoo * (target - p.x)) * det; p.x = x;
  }
  const scrollS = { x: scrollY, v: 0 };
  const camS = { x: { x: cx0, v: 0 }, y: { x: cy0, v: 0 }, lz: { x: 0, v: 0 } };

  let segI = 0, segT = 0, holdP = 0;
  function locate(s) {
    let i = 0; while (i < stops.length - 1 && s >= stops[i + 1].h0) i++;
    const st = stops[i];
    if (s <= st.h1 || i === stops.length - 1) { segI = i; segT = 0; holdP = st.h1 > st.h0 ? clamp01((s - st.h0) / (st.h1 - st.h0)) : 0; return; }
    segI = i; segT = ease(clamp01(((s - st.h1) / (stops[i + 1].h0 - st.h1) - 0.15) / 0.7)); holdP = 1;
  }
  function cameraTarget() {
    const A = stops[segI].camv, B = stops[Math.min(segI + 1, stops.length - 1)].camv, t = segT;
    const za = Math.log(A.z), zb = Math.log(B.z);
    const travel = Math.hypot(A.x - B.x, A.y - B.y) * Math.min(A.z, B.z) / Math.max(W, H);
    const dip = Math.min(0.5, travel * 0.4) * Math.sin(Math.PI * t);   // pull back mid-flight when travelling far
    return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, lz: za + (zb - za) * t + Math.log(1 - dip) };
  }

  // ---- pulses ----
  const pulses = [], hit = new Float32Array(N).fill(-1e9), hitCol = new Uint8Array(N);
  function bfs(a, b) {
    const prev = new Int32Array(N).fill(-1); prev[a] = a; const q = [a];
    for (let qi = 0; qi < q.length; qi++) { const u = q[qi]; if (u === b) break; for (const v of adj[u]) if (prev[v] < 0) { prev[v] = u; q.push(v); } }
    if (prev[b] < 0) return null; const p = [b]; while (p[p.length - 1] !== a) p.push(prev[p[p.length - 1]]); return p.reverse();
  }
  function walk(start, len, focus, reveal) {
    const p = [start];
    for (let i = 0; i < len; i++) { const nb = adj[p[p.length - 1]].filter(v => (!focus || focus.includes(D[v])) && C[v] <= reveal && !p.includes(v)); if (!nb.length) break; p.push(nb[(Math.random() * nb.length) | 0]); }
    return p;
  }
  const spawn = (path, speed, col, big) => { if (path && path.length > 1) pulses.push({ path, age: 0, speed, col, big }); };
  const hubOf = s => s.focus ? hub[s.focus[0]] : gHub;
  let travelled = "", ambientClock = 0;

  // ---- theme: every colour comes from design/tokens.css, re-read when the theme changes ----
  let COL, PULSE, EDGE, EDGE_A, OTHER_A, BG;
  function readTheme() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    COL = [v("--g-metric"), v("--g-decision"), v("--g-hub"), v("--g-other")];   // indexed by note type
    PULSE = v("--g-pulse"); EDGE = v("--g-edge"); EDGE_A = parseFloat(v("--g-edge-a")) || 0.08;
    OTHER_A = parseFloat(v("--g-other-a")) || 0.5; BG = v("--bg");
  }
  readTheme();
  addEventListener("themechange", readTheme);

  // ---- draw ----
  const fx = new Float32Array(N), fy = new Float32Array(N), domA = new Float32Array(DN);
  const hudName = document.getElementById("hud-name"), hudSub = document.getElementById("hud-sub");
  let last = performance.now(), clock = 0, primed = false;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;

    // 1. smooth the scroll itself, then derive everything from it
    if (reduced || !primed) { scrollS.x = scrollY; scrollS.v = 0; } else spring(scrollS, scrollY, 9, dt);
    locate(scrollS.x);
    const tgt = cameraTarget();
    if (reduced || !primed) { camS.x.x = tgt.x; camS.y.x = tgt.y; camS.lz.x = tgt.lz; primed = true; }
    else { spring(camS.x, tgt.x, 4.2, dt); spring(camS.y, tgt.y, 4.2, dt); spring(camS.lz, tgt.lz, 4.2, dt); }

    const a = stops[segI], b = stops[Math.min(segI + 1, stops.length - 1)];
    const mix = (va, vb) => va * (1 - segT) + vb * segT;
    const flag = (s, k) => s.emphasis === k ? 1 : 0;
    const typeEmph = mix(flag(a, "types"), flag(b, "types")), testsA = mix(flag(a, "tests"), flag(b, "tests"));
    const conflictA = mix(a.conflict ? 1 : 0, b.conflict ? 1 : 0), dim = mix(a.dim, b.dim);
    const textRight = mix(a.textRight, b.textRight);
    for (let d = 0; d < DN; d++) domA[d] = mix(!a.focus || a.focus.includes(d) ? 1 : 0.16, !b.focus || b.focus.includes(d) ? 1 : 0.16);
    // growth: rewind to week 0 on the way in, grow 0 → today across the section, stay full on the way out
    let reveal = G.days;
    if (a.growth) reveal = segT > 0 ? G.days : holdP * G.days;
    else if (b.growth && b !== a) reveal = G.days * (1 - segT);

    // 2. pulses: one travelling pulse per hop between different areas, plus ambient firing
    if (!reduced) {
      const key = segI + (segT > 0.1 && segT < 0.9 ? "go" : "");
      if (key.endsWith("go") && travelled !== key && hubOf(a) !== hubOf(b)) { spawn(bfs(hubOf(a), hubOf(b)), 2.4, 0, true); travelled = key; }
      if (segT < 0.05) travelled = "";
      const cur = segT < 0.5 ? a : b, every = testsA > 0.5 ? 0.14 : 0.85 / Math.max(0.4, dim);
      ambientClock += dt;
      if (ambientClock > every) {
        ambientClock = 0; let s, tries = 0;
        do { s = (Math.random() * N) | 0; tries++; } while (tries < 40 && ((cur.focus && !cur.focus.includes(D[s])) || C[s] > reveal || K[s] < 2));
        spawn(walk(s, testsA > 0.5 ? 3 : 4, cur.focus, reveal), testsA > 0.5 ? 4.5 : 2.6, testsA > 0.5 ? 1 : 0, false);
      }
    }

    // 3. project, with a slow breathing drift so the scene is never frozen
    const [fpx, fpy] = focusPt();
    const z = Math.exp(camS.lz.x) * (reduced ? 1 : 1 + 0.01 * Math.sin(clock * 0.35));
    const camX = camS.x.x + (reduced ? 0 : Math.sin(clock * 0.21) * 9 / z), camY = camS.y.x + (reduced ? 0 : Math.cos(clock * 0.17) * 6 / z);
    const zRel = z / fitZ();
    for (let i = 0; i < N; i++) { fx[i] = fpx + (X[i] - camX) * z; fy[i] = fpy + (Y[i] - camY) * z; }
    const mask = x => mobile ? 1 : 0.28 + 0.72 * ease(clamp01((x - (textRight - 260)) / 320));

    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    // edges in two batches: in focus, and background
    const edgeA = (EDGE_A + (zRel > 1.5 ? 0.05 : 0)) * dim;
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (let i = 0; i < EN; i++) {
        const u = E[2 * i], v = E[2 * i + 1];
        if (C[u] > reveal || C[v] > reveal) continue;
        if ((pass === 1) !== (domA[D[u]] > 0.6 && domA[D[v]] > 0.6)) continue;
        const x1 = fx[u], y1 = fy[u], x2 = fx[v], y2 = fy[v];
        if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) continue;
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      }
      ctx.strokeStyle = `rgba(${EDGE},${pass ? edgeA : EDGE_A * 0.3 * dim})`; ctx.lineWidth = pass ? 0.7 : 0.5; ctx.stroke();
    }
    // nodes
    const grow = 0.8 + 0.55 * Math.log2(1 + zRel);
    for (let i = 0; i < N; i++) {
      if (C[i] > reveal) continue;
      const x = fx[i], y = fy[i]; if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const appear = clamp01((reveal - C[i]) / 5), t = T[i], fa = domA[D[i]];
      const focusGrow = 1 + (grow - 1) * Math.max(0, (fa - 0.16) / 0.84);
      let r = Math.min(9, (1.1 + Math.sqrt(K[i]) * 0.3) * focusGrow) * (t === 2 ? 1.7 : 1) * ease(appear) * (0.55 + 0.45 * fa);
      if (t < 2) r *= 1 + typeEmph * 0.35;
      if (r < 0.2) continue;
      const m = mask(x) * dim;
      let al = fa * fa * (t === 3 ? OTHER_A - typeEmph * 0.3 : 0.95);
      const h = (now - hit[i]) / 1000;
      if (h < 1.1) { const g = ease(1 - h / 1.1); ctx.fillStyle = `rgba(${hitCol[i] ? COL[1] : PULSE},${0.22 * g * m})`; ctx.beginPath(); ctx.arc(x, y, r + 8 * g, 0, 6.283); ctx.fill(); al = Math.max(al, 0.55 + 0.45 * g); }
      ctx.fillStyle = `rgba(${COL[t]},${al * m})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    }
    // conflict: two definitions pulsing out of sync
    if (conflictA > 0.02) {
      ctx.font = "500 13px Synonym, system-ui, sans-serif";
      conflict.forEach((n, j) => {
        const ph = (clock / 1.8 + j * 0.5) % 1;
        ctx.strokeStyle = `rgba(${COL[0]},${conflictA * (1 - ease(ph)) * 0.9})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(fx[n], fy[n], 6 + ease(ph) * 34, 0, 6.283); ctx.stroke();
        ctx.fillStyle = `rgba(${PULSE},${conflictA})`; ctx.textAlign = j ? "left" : "right";
        ctx.fillText(j ? "discount · finance" : "discount · growth", fx[n] + (j ? 16 : -16), fy[n] - 12);
      });
      const [p, q] = conflict; ctx.setLineDash([4, 5]); ctx.strokeStyle = `rgba(${PULSE},${conflictA * 0.5})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(fx[p], fy[p]); ctx.lineTo(fx[q], fy[q]); ctx.stroke(); ctx.setLineDash([]);
    }
    // pulses: a soft head with a continuous fading tail along the edges
    const at = (P, s) => { const segs = P.path.length - 1, ss = Math.max(0, Math.min(segs, s)), ii = Math.min(Math.floor(ss), segs - 1), ff = ss - ii, u = P.path[ii], v = P.path[ii + 1]; return [fx[u] + (fx[v] - fx[u]) * ff, fy[u] + (fy[v] - fy[u]) * ff]; };
    ctx.lineCap = "round";
    for (let j = pulses.length - 1; j >= 0; j--) {
      const P = pulses[j]; P.age += dt;
      const s = P.age * P.speed, segs = P.path.length - 1;
      if (s >= segs + 0.8) { pulses.splice(j, 1); continue; }
      const reached = Math.min(segs, Math.floor(s));
      for (let k = 0; k <= reached; k++) if (hit[P.path[k]] < now - 990) { hit[P.path[k]] = now; hitCol[P.path[k]] = P.col; }
      const fade = (s > segs ? 1 - (s - segs) / 0.8 : 1) * Math.max(dim, 0.5), steps = 14;
      for (let k = 0; k < steps; k++) {
        const s0 = s - 0.7 * (k + 1) / steps, s1 = s - 0.7 * k / steps; if (s1 <= 0) break;
        const [x0, y0] = at(P, s0), [x1, y1] = at(P, s1), w = 1 - k / steps;
        ctx.strokeStyle = `rgba(${P.col ? COL[1] : PULSE},${0.85 * w * w * fade})`; ctx.lineWidth = (P.big ? 2.4 : 1.6) * w;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      const [hx, hy] = at(P, s), hr = P.big ? 2.8 : 2;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 5);
      const pc = P.col ? COL[1] : PULSE;
      g.addColorStop(0, `rgba(${pc},${0.35 * fade})`); g.addColorStop(1, `rgba(${pc},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, hr * 5, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(${pc},${0.95 * fade})`; ctx.beginPath(); ctx.arc(hx, hy, hr * 0.9, 0, 6.283); ctx.fill();
    }

    // 4. HUD + dots
    const cur = segT < 0.5 ? a : b;
    let name, sub;
    if (cur.growth) { let shown = 0; for (let i = 0; i < N; i++) if (C[i] <= reveal) shown++; name = `Week ${Math.floor(reveal / 7)}`; sub = `${shown} ${shown === 1 ? "note" : "notes"}`; }
    else [name, sub] = cur.hud;
    if (hudName && hudName.textContent !== name) hudName.textContent = name;
    if (hudSub && hudSub.textContent !== sub) hudSub.textContent = sub;
    if (dotsEl) { const on = stops.indexOf(cur); for (let i = 0; i < dotsEl.children.length; i++) dotsEl.children[i].classList.toggle("on", i === on); }

    requestAnimationFrame(frame);
  }

  addEventListener("resize", layout);
  // fonts change text heights, which moves every section; re-measure once they land
  if (document.fonts) document.fonts.ready.then(layout);
  layout();
  requestAnimationFrame(frame);
})();
