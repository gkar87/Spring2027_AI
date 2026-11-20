/* ==========================================================================
   CS 5700 — aiplay-core.js
   The algorithms behind the playgrounds, with no page code, so the same
   functions draw the explorers and compute the exercise answers. A plain
   script (not a module) so the pages open with a double-click from disk.
   cs5700-work/check_playgrounds.js runs these in Node and checks every
   exercise answer written into the pages.
   ========================================================================== */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ search -- */
  // grid: array of strings; '#' wall, '~' mud (step cost 3), 'S' start, 'G' goal.
  // Graph search; the goal is tested when a node is expanded; neighbours are
  // generated up, right, down, left; ties in the frontier go first in, first out.
  function parseGrid(rows) {
    let start = null, goal = null;
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === "S") start = [x, y];
      if (c === "G") goal = [x, y];
    }));
    return { rows, w: rows[0].length, h: rows.length, start, goal };
  }
  const MOVES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function stepCost(g, x, y) { return g.rows[y][x] === "~" ? 3 : 1; }
  function manhattan(g, x, y) { return Math.abs(x - g.goal[0]) + Math.abs(y - g.goal[1]); }

  // Returns the expansion trace: every event in order, then the result.
  function search(rows, algo) {
    const g = parseGrid(rows);
    const key = (x, y) => x + "," + y;
    const h = (x, y) => algo === "astar" ? manhattan(g, x, y)
      : algo === "astar2" ? 2 * manhattan(g, x, y)
      : algo === "greedy" ? manhattan(g, x, y) : 0;
    const prio = (cost, x, y) => algo === "bfs" ? 0 : algo === "greedy" ? h(x, y)
      : algo === "ucs" ? cost : cost + h(x, y);
    let counter = 0;
    const frontier = [{ x: g.start[0], y: g.start[1], cost: 0, parent: null, p: prio(0, g.start[0], g.start[1]), n: counter++ }];
    const best = new Map([[key(g.start[0], g.start[1]), 0]]);
    const expanded = new Map(); // key -> order
    const steps = [];
    while (frontier.length) {
      let bi = 0;
      for (let i = 1; i < frontier.length; i++) {
        const a = frontier[i], b = frontier[bi];
        if (a.p < b.p || (a.p === b.p && a.n < b.n)) bi = i;
      }
      const node = frontier.splice(bi, 1)[0];
      const k = key(node.x, node.y);
      if (expanded.has(k)) continue;
      expanded.set(k, expanded.size + 1);
      steps.push({ x: node.x, y: node.y, frontier: frontier.map(f => [f.x, f.y]) });
      if (node.x === g.goal[0] && node.y === g.goal[1]) {
        const path = [];
        for (let n = node; n; n = n.parent) path.unshift([n.x, n.y]);
        steps[steps.length - 1].frontier = frontier.map(f => [f.x, f.y]);
        return { grid: g, steps, expanded: expanded.size, path, cost: node.cost };
      }
      for (const [dx, dy] of MOVES) {
        const nx = node.x + dx, ny = node.y + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || g.rows[ny][nx] === "#") continue;
        const nk = key(nx, ny);
        if (expanded.has(nk)) continue;
        const c = node.cost + stepCost(g, nx, ny);
        if (algo !== "bfs" && algo !== "greedy" && best.has(nk) && best.get(nk) <= c) continue;
        if ((algo === "bfs" || algo === "greedy") && best.has(nk)) continue;
        best.set(nk, c);
        frontier.push({ x: nx, y: ny, cost: c, parent: node, p: prio(c, nx, ny), n: counter++ });
      }
      steps[steps.length - 1].frontier = frontier.map(f => [f.x, f.y]);
    }
    return { grid: g, steps, expanded: expanded.size, path: null, cost: Infinity };
  }

  /* --------------------------------------------------------------- MDP -- */
  // A grid MDP. cells: strings; '#' wall, '+' exit worth +1, '-' exit worth -1,
  // '.' ordinary. Moving into a wall or off the grid leaves you in place.
  // The intended move happens with probability 1 - noise; each perpendicular
  // move with noise / 2. Every move from an ordinary cell earns `living`.
  // Exit cells keep their value (+1 or -1); ordinary cells start at 0.
  const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const PERP = { N: ["E", "W"], S: ["E", "W"], E: ["N", "S"], W: ["N", "S"] };
  function mdpInit(rows) {
    return rows.map(r => [...r].map(c => c === "+" ? 1 : c === "-" ? -1 : 0));
  }
  function mdpQ(rows, V, x, y, a, gamma, noise, living) {
    const h = rows.length, w = rows[0].length;
    const go = d => {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      return (nx < 0 || ny < 0 || nx >= w || ny >= h || rows[ny][nx] === "#") ? [x, y] : [nx, ny];
    };
    let q = 0;
    for (const [d, p] of [[a, 1 - noise], [PERP[a][0], noise / 2], [PERP[a][1], noise / 2]]) {
      if (!p) continue;
      const [nx, ny] = go(d);
      q += p * (living + gamma * V[ny][nx]);
    }
    return q;
  }
  function mdpSweep(rows, V, gamma, noise, living) {
    let delta = 0;
    const out = V.map((r, y) => r.map((v, x) => {
      const c = rows[y][x];
      if (c !== ".") return v;
      const best = Math.max(...Object.keys(DIRS).map(a => mdpQ(rows, V, x, y, a, gamma, noise, living)));
      delta = Math.max(delta, Math.abs(best - v));
      return best;
    }));
    return { V: out, delta };
  }
  function mdpPolicy(rows, V, gamma, noise, living) {
    return V.map((r, y) => r.map((v, x) => {
      if (rows[y][x] !== ".") return null;
      let best = null, bq = -Infinity;
      for (const a of ["N", "E", "S", "W"]) {
        const q = mdpQ(rows, V, x, y, a, gamma, noise, living);
        if (q > bq + 1e-12) { bq = q; best = a; }
      }
      return best;
    }));
  }
  function mdpRun(rows, gamma, noise, living, sweeps) {
    let V = mdpInit(rows), delta = 0;
    for (let i = 0; i < sweeps; i++) ({ V, delta } = mdpSweep(rows, V, gamma, noise, living));
    return { V, delta };
  }

  /* ---------------------------------------------------- Bayes network -- */
  // vars: [{name, parents:[...], cpt:{ "": p } or { "TF": p, ... }}] in topological
  // order; cpt gives P(var = true | parents) keyed by the parents' values as T/F.
  function enumerate(vars, evidence) {
    const n = vars.length, post = {}, total = { p: 0 };
    vars.forEach(v => { post[v.name] = 0; });
    let rows = 0;
    for (let m = 0; m < (1 << n); m++) {
      const val = {};
      vars.forEach((v, i) => { val[v.name] = !!(m & (1 << (n - 1 - i))); });
      if (Object.keys(evidence).some(k => evidence[k] !== val[k])) continue;
      let p = 1;
      for (const v of vars) {
        const pt = v.cpt[v.parents.map(q => val[q] ? "T" : "F").join("")];
        p *= val[v.name] ? pt : 1 - pt;
      }
      rows++;
      total.p += p;
      vars.forEach(v => { if (val[v.name]) post[v.name] += p; });
    }
    const out = {};
    vars.forEach(v => { out[v.name] = total.p ? post[v.name] / total.p : NaN; });
    return { posterior: out, pEvidence: total.p, rows };
  }

  /* ------------------------------------------------------------- HMM -- */
  // Two hidden states [A, B]. prior [pA, pB]; T[i][j] = P(next j | now i);
  // E[i] = P(observation is "yes" | state i). obs: array of booleans.
  function hmmFilter(prior, T, E, obs) {
    let f = prior.slice();
    const out = [];
    for (const o of obs) {
      const pred = [0, 1].map(j => f[0] * T[0][j] + f[1] * T[1][j]);
      const w = [0, 1].map(j => pred[j] * (o ? E[j] : 1 - E[j]));
      const z = w[0] + w[1];
      f = w.map(x => x / z);
      out.push({ pred, weighted: w, filtered: f.slice() });
    }
    return out;
  }

  /* ------------------------------------------------------- attention -- */
  // One query against n keys. scale: divide by sqrt(d). visible: how many
  // leading keys the query may see (causal masking); the rest get weight 0.
  function attention(q, K, V, scale, visible) {
    const d = q.length, n = K.length, vis = visible == null ? n : visible;
    const scores = K.map(k => k.reduce((s, kj, j) => s + kj * q[j], 0));
    const scaled = scores.map(s => scale ? s / Math.sqrt(d) : s);
    const live = scaled.map((s, i) => i < vis ? s : -Infinity);
    const m = Math.max(...live);
    const ex = live.map(s => s === -Infinity ? 0 : Math.exp(s - m));
    const z = ex.reduce((a, b) => a + b, 0);
    const weights = ex.map(e => e / z);
    const out = V[0].map((_, j) => weights.reduce((s, w, i) => s + w * V[i][j], 0));
    return { scores, scaled, weights, out };
  }

  const api = { parseGrid, search, manhattan, mdpInit, mdpSweep, mdpPolicy, mdpRun, mdpQ, enumerate, hmmFilter, attention };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AICore = api;
})(this);
