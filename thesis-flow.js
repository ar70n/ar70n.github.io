// Live Hamiltonian flow of the simple pendulum, H(q, p) = p²/2 − cos q.
// Integrated with Störmer–Verlet; the region's boundary is refined adaptively by
// replaying the same discrete map, so the displayed area is that of the true image.
(() => {
  const canvas = document.getElementById("flow-canvas");
  const restart = document.getElementById("flow-restart");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");

  const STEP = 0.01;          // integrator step
  const SPEED = 1.4;          // simulated time units per second
  const Q0 = 0, P0 = 1.45;    // centre of the region of initial conditions
  const R = Math.sqrt(0.5542 / Math.PI);
  const N0 = 720;
  const MAX_GAP = 0.012;      // refine the boundary when neighbours drift further apart
  const MAX_POINTS = 16000;   // past this the boundary is no longer refined, so per-frame cost stays bounded
  const REFINE_BUDGET_MS = 4;  // time per frame for recomputing new boundary points
  const Q_RANGE = [-Math.PI, Math.PI];
  const P_RANGE = [-2.45, 2.45];
  const COLORS = ["#f3d65b", "#f59e6b", "#e9708a", "#c06bd6", "#8a7cf0", "#5fa8f5", "#5fd3c4"];
  const INK = "#141518";
  const TEXT = "rgba(240, 240, 234, .78)";
  const FAINT = "rgba(240, 240, 234, .42)";
  const SANS = "'Inter Tight', system-ui, sans-serif";
  const MONO = "ui-monospace, 'SFMono-Regular', Consolas, monospace";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let pts, thetas, tracers, steps, area0, energy0, unresolved;
  let layout, background, dpr = 1;
  let playing = !reduceMotion, visible = false, last = 0, acc = 0, frame = 0;

  function verlet(state) {
    state[1] -= 0.5 * STEP * Math.sin(state[0]);
    state[0] += STEP * state[1];
    state[1] -= 0.5 * STEP * Math.sin(state[0]);
  }

  function startOf(theta) {
    return [Q0 + R * Math.cos(theta), P0 + R * Math.sin(theta)];
  }

  function replay(theta, n) {
    const s = startOf(theta);
    for (let i = 0; i < n; i++) verlet(s);
    return s;
  }

  const energy = (s) => 0.5 * s[1] * s[1] - Math.cos(s[0]);

  function shoelace(list) {
    let sum = 0;
    for (let i = 0, n = list.length; i < n; i++) {
      const a = list[i], b = list[(i + 1) % n];
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
  }

  function reset() {
    thetas = Array.from({ length: N0 }, (_, k) => (2 * Math.PI * k) / N0);
    pts = thetas.map(startOf);
    tracers = [[Q0, P0]].concat([0, 1, 2, 3, 4, 5].map((k) => startOf((k * Math.PI) / 3 + Math.PI / 2)));
    steps = 0;
    acc = 0;
    unresolved = false;
    area0 = shoelace(pts);
    energy0 = energy(tracers[0]);
  }

  function refine() {
    // Each new point is replayed from t = 0, so cap the work per frame and finish on later frames
    const deadline = performance.now() + REFINE_BUDGET_MS;
    for (let i = 0; i < pts.length && performance.now() < deadline; ) {
      const j = (i + 1) % pts.length;
      const a = pts[i], b = pts[j];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > MAX_GAP) {
        if (pts.length >= MAX_POINTS - 1) {
          unresolved = true;
          break;
        }
        const t2 = j === 0 ? thetas[0] + 2 * Math.PI : thetas[j];
        const tm = 0.5 * (thetas[i] + t2);
        pts.splice(i + 1, 0, replay(tm, steps));
        thetas.splice(i + 1, 0, tm);
      } else {
        i++;
      }
    }
  }

  function advance(n) {
    for (let k = 0; k < n; k++) {
      for (const s of pts) verlet(s);
      for (const s of tracers) verlet(s);
      steps++;
    }
    refine();
  }

  // Layout: side by side on wide screens, stacked on narrow ones.
  function computeLayout(w, h) {
    const stacked = w < 560;
    const pad = Math.max(12, w * 0.02);
    if (stacked) {
      const topH = h * 0.36;
      return {
        w, h, stacked, pad,
        pend: { x: pad, y: pad + 18, w: w - 2 * pad, h: topH - pad - 18 },
        phase: { x: pad + 34, y: topH + 22, w: w - 2 * pad - 40, h: h - topH - 104 },
      };
    }
    // Medium widths keep the panels side by side but put the read-outs on two lines
    const compact = w < 860;
    const left = w * 0.3;
    return {
      w, h, stacked, compact, pad,
      pend: { x: pad, y: pad + 26, w: left - 2 * pad, h: h - 2 * pad - 70 },
      phase: { x: left + 46, y: pad + 30, w: w - left - 46 - pad, h: h - 2 * pad - (compact ? 108 : 92) },
    };
  }

  const qx = (q) => layout.phase.x + ((q - Q_RANGE[0]) / (Q_RANGE[1] - Q_RANGE[0])) * layout.phase.w;
  const py = (p) => layout.phase.y + ((P_RANGE[1] - p) / (P_RANGE[1] - P_RANGE[0])) * layout.phase.h;

  function curve(c, from, to, f, n = 160) {
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const q = from + ((to - from) * i) / n;
      const p = f(q);
      if (i === 0) c.moveTo(qx(q), py(p));
      else c.lineTo(qx(q), py(p));
    }
    c.stroke();
  }

  function drawBackground() {
    background = document.createElement("canvas");
    background.width = canvas.width;
    background.height = canvas.height;
    const c = background.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { phase } = layout;

    c.fillStyle = INK;
    c.fillRect(0, 0, layout.w, layout.h);
    c.strokeStyle = "rgba(255, 255, 255, .08)";
    c.strokeRect(phase.x, phase.y, phase.w, phase.h);

    c.save();
    c.beginPath();
    c.rect(phase.x, phase.y, phase.w, phase.h);
    c.clip();

    // Level sets of H inside and outside the separatrix
    c.lineWidth = 1;
    c.strokeStyle = "rgba(240, 240, 234, .16)";
    for (const e of [-0.8, -0.55, -0.3, -0.05, 0.25, 0.55, 0.8]) {
      const qm = Math.acos(-e);
      curve(c, -qm, qm, (q) => Math.sqrt(Math.max(0, 2 * (e + Math.cos(q)))));
      curve(c, -qm, qm, (q) => -Math.sqrt(Math.max(0, 2 * (e + Math.cos(q)))));
    }
    for (const e of [1.5, 2.2, 3.1]) {
      curve(c, -Math.PI, Math.PI, (q) => Math.sqrt(2 * (e + Math.cos(q))));
      curve(c, -Math.PI, Math.PI, (q) => -Math.sqrt(2 * (e + Math.cos(q))));
    }

    // Hamiltonian vector field X_H = J∇H = (p, −sin q)
    const cols = layout.stacked ? 13 : 22;
    const rows = layout.stacked ? 9 : 12;
    const len = Math.min(phase.w / cols, phase.h / rows) * 0.42;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const q = Q_RANGE[0] + ((i + 0.5) / cols) * (Q_RANGE[1] - Q_RANGE[0]);
        const p = P_RANGE[0] + ((j + 0.5) / rows) * (P_RANGE[1] - P_RANGE[0]);
        const vx = p * phase.w / (Q_RANGE[1] - Q_RANGE[0]);
        const vy = Math.sin(q) * phase.h / (P_RANGE[1] - P_RANGE[0]);
        const m = Math.hypot(vx, vy);
        if (m < 1e-9) continue;
        const ux = (vx / m) * len, uy = (vy / m) * len;
        const x = qx(q), y = py(p);
        c.strokeStyle = `rgba(240, 240, 234, ${0.14 + 0.2 * Math.min(1, Math.hypot(p, Math.sin(q)) / 2)})`;
        c.beginPath();
        c.moveTo(x - ux / 2, y - uy / 2);
        c.lineTo(x + ux / 2, y + uy / 2);
        const ax = x + ux / 2, ay = y + uy / 2, a = Math.atan2(uy, ux);
        c.lineTo(ax - 4 * Math.cos(a - 0.5), ay - 4 * Math.sin(a - 0.5));
        c.moveTo(ax, ay);
        c.lineTo(ax - 4 * Math.cos(a + 0.5), ay - 4 * Math.sin(a + 0.5));
        c.stroke();
      }
    }

    // Separatrix H = 1
    c.lineWidth = 1.6;
    c.strokeStyle = "#5fa8f5";
    curve(c, -Math.PI, Math.PI, (q) => 2 * Math.cos(q / 2));
    curve(c, -Math.PI, Math.PI, (q) => -2 * Math.cos(q / 2));
    c.restore();

    // Axes and labels
    c.fillStyle = FAINT;
    c.font = mathFont(13, false);
    c.textAlign = "center";
    c.textBaseline = "top";
    [["−π", -Math.PI], ["−π/2", -Math.PI / 2], ["0", 0], ["π/2", Math.PI / 2], ["π", Math.PI]].forEach(([t, q]) => {
      c.fillText(t, qx(q), phase.y + phase.h + 6);
    });
    c.textBaseline = "alphabetic";
    c.fillStyle = TEXT;
    rich(c, [["q", "it"], [" (angle)", "sans"]], phase.x + phase.w / 2, phase.y + phase.h + 34, "center");
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.fillStyle = FAINT;
    c.font = mathFont(13, false);
    [-2, -1, 0, 1, 2].forEach((p) => c.fillText(String(p).replace("-", "−"), phase.x - 8, py(p)));
    c.save();
    c.translate(phase.x - 32, phase.y + phase.h / 2);
    c.rotate(-Math.PI / 2);
    c.textBaseline = "alphabetic";
    c.fillStyle = TEXT;
    rich(c, [["p", "it"], [" (momentum)", "sans"]], 0, 0, "center");
    c.restore();

    c.textBaseline = "alphabetic";
    c.fillStyle = FAINT;
    const field = [["X", "it"], ["H", "sub"], [" = ", "up"], ["J", "it"], ["∇", "up"], ["H", "it"]];
    const title = layout.stacked
      ? [["Phase space (", "sans"], ["q", "it"], [", ", "sans"], ["p", "it"], [")", "sans"]]
      : layout.compact
        ? [["Phase space · arrows: ", "sans"], ...field]
        : [["Phase space · arrows: ", "sans"], ...field, ["  · curves: level sets of ", "sans"], ["H", "it"]];
    rich(c, title, phase.x, phase.y - 10, "left");
    c.font = `12px ${SANS}`;
    c.textAlign = "left";
    c.fillText(layout.stacked ? "Pendulums from the region" : "Pendulums started from the region", layout.pend.x, layout.pend.y - 10);
  }

  // Serif math type, so labels read like the formulas in the caption
  function mathFont(size, italic) {
    return `${italic ? "italic " : ""}${size}px "Cambria Math", Cambria, "STIX Two Text", "Times New Roman", serif`;
  }

  // Draws text runs: "sans" for prose, "it" for variables, "up" for symbols, "sub" for subscripts
  function rich(c, runs, x, y, align) {
    const fonts = { sans: `12px ${SANS}`, it: mathFont(14, true), up: mathFont(14, false), sub: mathFont(10, true) };
    const widths = runs.map(([text, kind]) => {
      c.font = fonts[kind];
      return c.measureText(text).width;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    c.textAlign = "left";
    runs.forEach(([text, kind], i) => {
      c.font = fonts[kind];
      c.fillText(text, cx, kind === "sub" ? y + 3.5 : y);
      cx += widths[i];
    });
  }

  function drawFrame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { phase, pend } = layout;

    // Region of initial conditions, transported by the flow
    ctx.save();
    ctx.beginPath();
    ctx.rect(phase.x, phase.y, phase.w, phase.h);
    ctx.clip();
    ctx.beginPath();
    // Skip points that would land within half a pixel of the last one drawn
    let lx = qx(pts[0][0]), ly = py(pts[0][1]);
    ctx.moveTo(lx, ly);
    for (let i = 1; i < pts.length; i++) {
      const x = qx(pts[i][0]), y = py(pts[i][1]);
      if (Math.abs(x - lx) + Math.abs(y - ly) > 0.5) {
        ctx.lineTo(x, y);
        lx = x;
        ly = y;
      }
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(243, 214, 91, .42)";
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#f3d65b";
    ctx.stroke();
    tracers.forEach((s, k) => {
      ctx.beginPath();
      ctx.arc(qx(s[0]), py(s[1]), k ? 3.2 : 4.4, 0, 2 * Math.PI);
      ctx.fillStyle = COLORS[k];
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    });
    ctx.restore();

    // The same states, seen as real pendulums
    const pivotX = pend.x + pend.w / 2;
    // Swings in the region reach about 140°, so leave room above the pivot as well as below
    const pivotY = pend.y + (layout.stacked ? pend.h * 0.42 : pend.h * 0.38);
    const L = Math.min(pend.w * 0.42, pend.h * 0.5);
    for (let k = tracers.length - 1; k >= 0; k--) {
      const q = tracers[k][0];
      const bx = pivotX + L * Math.sin(q), by = pivotY + L * Math.cos(q);
      ctx.strokeStyle = COLORS[k];
      ctx.globalAlpha = k ? 0.75 : 1;
      ctx.lineWidth = k ? 1.2 : 2;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by, k ? 5 : 7.5, 0, 2 * Math.PI);
      ctx.fillStyle = COLORS[k];
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 3, 0, 2 * Math.PI);
    ctx.fillStyle = "#f0f0ea";
    ctx.fill();

    // Read-outs
    const t = steps * STEP;
    const area = shoelace(pts);
    const e = energy(tracers[0]);
    ctx.font = `${layout.stacked ? 11.5 : 12.5}px ${MONO}`;
    ctx.fillStyle = TEXT;
    ctx.textBaseline = "alphabetic";
    const base = layout.h - layout.pad;
    const sign = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4);
    // Once the boundary is too long to resolve, a polygon area would be wrong: say so instead.
    const areaText = unresolved ? "too thin to resolve, restart" : `${area.toFixed(4)}  (start ${area0.toFixed(4)})`;
    if (layout.stacked) {
      ctx.textAlign = "left";
      ctx.fillText(`t = ${t.toFixed(1)}   H(centre) = ${sign(e)}`, layout.pad, base - 17);
      ctx.fillText(`Area = ${areaText}`, layout.pad, base);
    } else if (layout.compact) {
      ctx.textAlign = "left";
      ctx.fillText(`t = ${t.toFixed(1)}   H(centre) = ${sign(e)}  (start ${sign(energy0)})`, layout.pad, base - 17);
      ctx.fillText(`Area of the region = ${areaText}`, layout.pad, base);
    } else {
      const left = `t = ${t.toFixed(1).padStart(5, " ")}   H(centre) = ${sign(e)}  (start ${sign(energy0)})`;
      const right = `Area of the region = ${areaText}`;
      ctx.textAlign = "left";
      ctx.fillText(left, layout.pad, base);
      ctx.textAlign = "right";
      ctx.fillText(right, layout.w - layout.pad, base);
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    layout = computeLayout(w, h);
    drawBackground();
    drawFrame();
  }

  function tick(now) {
    frame = 0;
    if (!playing || !visible) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    acc += dt * SPEED;
    const n = Math.floor(acc / STEP);
    acc -= n * STEP;
    if (n) advance(n);
    drawFrame();
    frame = requestAnimationFrame(tick);
  }

  function run() {
    if (playing && visible && !frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  // With reduced motion the flow waits for a first click; after that the button restarts it.
  function updateButton() {
    restart.innerHTML = playing ? '<span aria-hidden="true">↺</span> Restart' : '<span aria-hidden="true">▶</span> Play';
  }

  reset();
  updateButton();
  restart.hidden = false;
  restart.addEventListener("click", () => {
    reset();
    playing = true;
    updateButton();
    if (layout) drawFrame();
    run();
  });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    run();
  }).observe(canvas);
})();
