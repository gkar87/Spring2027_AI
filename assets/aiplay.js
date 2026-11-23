/* ==========================================================================
   CS 5700 — aiplay.js
   The page side of the playgrounds: checked exercises and the explorers.
   The algorithms are in aiplay-core.js (load it first). Plain scripts, so
   every page opens with a double-click and needs no server or network.

   Exercises:  <div class="cell cell--ex" data-ex="id"> with inputs that carry
               data-answer (a number, or a select's option value) and an
               optional data-tol (absolute tolerance, default 0.005).
   Explorers:  <div class="explorer" data-explorer="search|mdp|bayes|hmm|attention">

   Accessibility: every result is text in a real table; every check and step
   is announced through a polite live region and carries a text mark
   (✓, ✗), so colour is never the only cue. Keyboard: every control is a
   native button, input or select.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.AICore;
  const STORE_KEY = "cs5700-playground:" + location.pathname;

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    return e;
  }
  const live = el("p", { class: "visually-hidden", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  document.body.appendChild(live);
  function announce(t) { live.textContent = ""; setTimeout(() => { live.textContent = t; }, 30); }
  const fx = (v, d) => (Math.abs(v) < 5e-13 ? 0 : v).toFixed(d == null ? 3 : d);
  function button(label, cls) { return el("button", { type: "button", class: "btn" + (cls ? " " + cls : "") }, label); }
  function message(kind, mark, text) {
    const m = el("div", { class: "out-msg out-msg--" + kind });
    m.appendChild(el("span", { class: "ico", "aria-hidden": "true" }, mark));
    m.appendChild(el("p", null, text));
    return m;
  }

  /* --------------------------------------------------------- exercises -- */
  let memory = [];  // used when the browser keeps no storage for this page
  function loadSolved() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || memory; } catch (e) { return memory; } }
  function saveSolved(a) { memory = a; try { localStorage.setItem(STORE_KEY, JSON.stringify(a)); } catch (e) { /* private mode */ } }
  const exs = [...document.querySelectorAll(".cell--ex[data-ex]")];
  const progressEl = document.getElementById("pg-progress");
  function progress() {
    const solved = loadSolved();
    exs.forEach(c => {
      const b = c.querySelector(".solved-badge");
      if (b) b.textContent = solved.includes(c.dataset.ex) ? "✓ Solved" : "";
    });
    if (progressEl) {
      progressEl.textContent = "Exercises solved: ";
      progressEl.appendChild(el("strong", null, exs.filter(c => solved.includes(c.dataset.ex)).length + " of " + exs.length));
    }
  }
  function parseNum(s) {
    s = String(s).trim().replace(/,/g, "").replace(/−/g, "-");
    const f = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (f) return parseFloat(f[1]) / parseFloat(f[2]);
    return s === "" || isNaN(Number(s)) ? NaN : Number(s);
  }
  function check(cell) {
    const label = (cell.querySelector(".cell-title") || {}).textContent || "Exercise";
    const inputs = [...cell.querySelectorAll("[data-answer]")];
    const out = cell.querySelector(".cell-out");
    out.textContent = "";
    const ok = inputs.map(inp => {
      if (inp.tagName === "SELECT") return inp.value === inp.dataset.answer;
      const v = parseNum(inp.value), want = Number(inp.dataset.answer);
      const tol = inp.dataset.tol != null ? Number(inp.dataset.tol) : 0.005;
      return !isNaN(v) && Math.abs(v - want) <= tol + 1e-9;
    });
    inputs.forEach((inp, i) => inp.setAttribute("aria-invalid", ok[i] ? "false" : "true"));
    const good = ok.filter(Boolean).length;
    if (good === inputs.length) {
      out.appendChild(message("ok", "✓", "Correct."));
      announce(label + ": correct.");
      const s = loadSolved();
      if (!s.includes(cell.dataset.ex)) { s.push(cell.dataset.ex); saveSolved(s); }
      progress();
    } else {
      const empty = inputs.some(inp => inp.tagName !== "SELECT" && inp.value.trim() === "");
      const t = "Not yet. " + (inputs.length > 1 ? good + " of " + inputs.length + " answers match. " : "")
        + (empty ? "Fill in every box. " : "")
        + "Numbers may be rounded to three decimal places, or written as a fraction like 9/11.";
      out.appendChild(message("no", "✗", t));
      announce(label + ": " + t);
    }
  }
  exs.forEach(cell => {
    const b = cell.querySelector(".btn--check");
    if (b) b.addEventListener("click", () => check(cell));
    cell.querySelectorAll("input").forEach(inp => inp.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); check(cell); }
    }));
  });
  progress();

  /* ------------------------------------------------------------ search -- */
  const ALGOS = { bfs: "Breadth-first search", ucs: "Uniform-cost search", greedy: "Greedy best-first (Manhattan)",
                  astar: "A* (Manhattan)", astar2: "A* (2 × Manhattan, inadmissible)" };
  const COLS = "ABCDEFGHIJKL";
  function searchExplorer(root) {
    const rows = root.dataset.grid.split("/");
    const ctl = el("div", { class: "ex-controls" });
    const lab = el("label", null, "Algorithm");
    const sel = el("select");
    for (const k in ALGOS) sel.appendChild(el("option", { value: k }, ALGOS[k]));
    lab.appendChild(sel);
    const bStep = button("Step", "btn--run"), bRun = button("Run to the goal"), bReset = button("Reset");
    ctl.append(lab, bStep, bRun, bReset);
    const say = el("p", { class: "ex-say", "aria-live": "polite" });
    const wrap = el("div", { class: "fig-scroll", tabindex: "0", role: "region", "aria-label": root.dataset.label || "Search grid" });
    const tbl = el("table", { class: "gridx" });
    wrap.appendChild(tbl);
    const stats = el("p", { class: "ex-stats" });
    root.append(ctl, say, wrap, stats);
    let trace, i;
    function reset() { trace = C.search(rows, sel.value); i = 0; draw(); say.textContent = ALGOS[sel.value] + ": press Step to expand the first node."; }
    function draw() {
      const g = trace.grid, exp = new Map(), front = new Set(), path = new Set();
      trace.steps.slice(0, i).forEach((s, k) => exp.set(s.x + "," + s.y, k + 1));
      if (i > 0) trace.steps[i - 1].frontier.forEach(([x, y]) => front.add(x + "," + y));
      const done = i === trace.steps.length && trace.path;
      if (done) trace.path.forEach(([x, y]) => path.add(x + "," + y));
      tbl.textContent = "";
      tbl.appendChild(el("caption", { class: "visually-hidden" },
        "Grid, columns A to " + COLS[g.w - 1] + ", rows 1 to " + g.h + ". Each square says what it is and when it was expanded."));
      const head = el("tr");
      head.appendChild(el("td", { "aria-hidden": "true", style: "border:0" }));
      for (let x = 0; x < g.w; x++) head.appendChild(el("th", { scope: "col" }, COLS[x]));
      tbl.appendChild(head);
      for (let y = 0; y < g.h; y++) {
        const tr = el("tr");
        tr.appendChild(el("th", { scope: "row" }, String(y + 1)));
        for (let x = 0; x < g.w; x++) {
          const c = g.rows[y][x], k = x + "," + y, td = el("td");
          const words = [];
          if (c === "#") { td.className = "wall"; words.push("wall"); }
          else {
            if (c === "~") { td.classList.add("mud"); words.push("mud, cost 3"); }
            if (c === "S") words.push("start");
            if (c === "G") words.push("goal");
            if (path.has(k)) { td.classList.add("path"); words.push("on the path"); }
            else if (exp.has(k)) { td.classList.add("exp"); }
            if (front.has(k) && !exp.has(k)) { td.classList.add("front"); words.push("in the frontier"); }
            if (i > 0 && trace.steps[i - 1].x === x && trace.steps[i - 1].y === y) td.classList.add("now");
          }
          const big = c === "S" ? "S" : c === "G" ? "G" : "";
          if (big) td.appendChild(el("span", { class: "big" }, big));
          if (exp.has(k)) td.appendChild(el("span", null, "#" + exp.get(k)));
          td.appendChild(el("span", { class: "visually-hidden" }, (exp.has(k) ? " expanded " + exp.get(k) + (words.length ? ", " : "") : " ") + words.join(", ")));
          tr.appendChild(td);
        }
        tbl.appendChild(tr);
      }
      stats.textContent = "";
      stats.append("Expanded: ", el("strong", null, String(i)), " · Frontier: ",
        el("strong", null, String(i ? trace.steps[i - 1].frontier.length : 1)));
      if (done) stats.append(" · Path cost: ", el("strong", null, String(trace.cost)),
        " · Path length: ", el("strong", null, (trace.path.length - 1) + " moves"));
      bStep.disabled = bRun.disabled = i >= trace.steps.length;
    }
    function step() {
      if (i >= trace.steps.length) return;
      i++;
      draw();
      const s = trace.steps[i - 1], name = COLS[s.x] + (s.y + 1);
      say.textContent = i === trace.steps.length && trace.path
        ? "Expanded the goal " + name + " as node " + i + ". Path cost " + trace.cost + "."
        : "Expanded " + name + " as node " + i + ". The frontier now holds " + s.frontier.length + ".";
    }
    bStep.addEventListener("click", step);
    bRun.addEventListener("click", () => { i = trace.steps.length; draw(); say.textContent = "Reached the goal after expanding " + i + " nodes; path cost " + trace.cost + "."; });
    bReset.addEventListener("click", reset);
    sel.addEventListener("change", reset);
    reset();
  }

  /* --------------------------------------------------------------- MDP -- */
  const ARROW = { N: "↑", E: "→", S: "↓", W: "←" }, AWORD = { N: "north", E: "east", S: "south", W: "west" };
  function mdpExplorer(root) {
    const rows = root.dataset.grid.split("/"), H = rows.length;
    const ctl = el("div", { class: "ex-controls" });
    const num = (label, v, step, min, max) => {
      const l = el("label", null, label);
      const inp = el("input", { type: "number", value: v, step, min, max });
      l.appendChild(inp); ctl.appendChild(l); return inp;
    };
    const d = root.dataset;
    const gam = num("Discount γ", d.gamma || "0.9", "0.05", "0", "1"), noi = num("Noise", d.noise || "0.2", "0.05", "0", "1"), liv = num("Living reward", d.living || "0", "0.01", "-5", "5");
    const bOne = button("One sweep", "btn--run"), bConv = button("Run until change < 0.001"), bReset = button("Reset values");
    ctl.append(bOne, bConv, bReset);
    const say = el("p", { class: "ex-say", "aria-live": "polite" });
    const wrap = el("div", { class: "fig-scroll", tabindex: "0", role: "region", "aria-label": root.dataset.label || "Grid world values" });
    const tbl = el("table", { class: "gridx" });
    wrap.appendChild(tbl);
    const stats = el("p", { class: "ex-stats" });
    root.append(ctl, say, wrap, stats);
    let V, k, delta;
    const p = () => [Number(gam.value), Number(noi.value), Number(liv.value)];
    function reset() { V = C.mdpInit(rows); k = 0; delta = null; draw(); say.textContent = "All ordinary squares start at 0. Press One sweep."; }
    function draw() {
      const pol = C.mdpPolicy(rows, V, ...p());
      tbl.textContent = "";
      tbl.appendChild(el("caption", { class: "visually-hidden" }, "Value of each square after " + k + " sweeps, with the greedy action."));
      const head = el("tr");
      head.appendChild(el("td", { "aria-hidden": "true", style: "border:0" }));
      for (let x = 0; x < rows[0].length; x++) head.appendChild(el("th", { scope: "col" }, "col " + (x + 1)));
      tbl.appendChild(head);
      for (let y = 0; y < H; y++) {
        const tr = el("tr");
        tr.appendChild(el("th", { scope: "row" }, "row " + (H - y)));
        for (let x = 0; x < rows[0].length; x++) {
          const c = rows[y][x], td = el("td");
          if (c === "#") { td.className = "wall"; td.textContent = "wall"; }
          else if (c === "+" || c === "-") {
            td.className = c === "+" ? "pos" : "neg";
            td.appendChild(el("span", { class: "big" }, c === "+" ? "+1" : "−1"));
            td.appendChild(el("span", null, "exit"));
          } else {
            td.appendChild(el("span", { class: "big" }, fx(V[y][x])));
            if (k > 0 && pol[y][x]) {
              td.appendChild(el("span", { "aria-hidden": "true" }, ARROW[pol[y][x]]));
              td.appendChild(el("span", { class: "visually-hidden" }, ", best move " + AWORD[pol[y][x]]));
            }
          }
          tr.appendChild(td);
        }
        tbl.appendChild(tr);
      }
      stats.textContent = "";
      stats.append("Sweeps: ", el("strong", null, String(k)));
      if (delta != null) stats.append(" · Largest change in the last sweep: ", el("strong", null, fx(delta, 4)));
    }
    function sweep() { const r = C.mdpSweep(rows, V, ...p()); V = r.V; delta = r.delta; k++; }
    bOne.addEventListener("click", () => { sweep(); draw(); say.textContent = "Sweep " + k + " done; the largest change was " + fx(delta, 4) + "."; });
    bConv.addEventListener("click", () => {
      do { sweep(); } while (delta >= 0.001 && k < 1000);
      draw(); say.textContent = "Stopped after " + k + " sweeps, when the largest change fell below 0.001.";
    });
    bReset.addEventListener("click", reset);
    [gam, noi, liv].forEach(inp => inp.addEventListener("change", reset));
    reset();
  }

  /* ---------------------------------------------------- Bayes network -- */
  const NETS = {
    sprinkler: [
      { name: "Cloudy", parents: [], cpt: { "": 0.5 } },
      { name: "Sprinkler", parents: ["Cloudy"], cpt: { T: 0.1, F: 0.5 } },
      { name: "Rain", parents: ["Cloudy"], cpt: { T: 0.8, F: 0.2 } },
      { name: "WetGrass", parents: ["Sprinkler", "Rain"], cpt: { TT: 0.99, TF: 0.9, FT: 0.9, FF: 0.0 } },
    ],
    alarm: [
      { name: "Burglary", parents: [], cpt: { "": 0.1 } },
      { name: "Earthquake", parents: [], cpt: { "": 0.2 } },
      { name: "Alarm", parents: ["Burglary", "Earthquake"], cpt: { TT: 0.95, TF: 0.9, FT: 0.3, FF: 0.01 } },
      { name: "Call", parents: ["Alarm"], cpt: { T: 0.9, F: 0.05 } },
    ],
    chain: [
      { name: "Storm", parents: [], cpt: { "": 0.2 } },
      { name: "PowerOut", parents: ["Storm"], cpt: { T: 0.6, F: 0.05 } },
      { name: "ServerDown", parents: ["PowerOut"], cpt: { T: 0.9, F: 0.02 } },
      { name: "Alert", parents: ["ServerDown"], cpt: { T: 0.95, F: 0.01 } },
    ],
  };
  function bayesExplorer(root) {
    const net = NETS[root.dataset.net];
    const ctl = el("div", { class: "ex-controls" });
    const sels = {};
    net.forEach(v => {
      const l = el("label", null, v.name);
      const s = el("select");
      [["", "not observed"], ["T", "observed true"], ["F", "observed false"]].forEach(([val, t]) => s.appendChild(el("option", { value: val }, t)));
      l.appendChild(s); ctl.appendChild(l); sels[v.name] = s;
      s.addEventListener("change", draw);
    });
    const bReset = button("Clear evidence");
    ctl.appendChild(bReset);
    const say = el("p", { class: "ex-say", "aria-live": "polite" });
    const tbl = el("table", { class: "bars" });
    root.append(ctl, say, tbl);
    function draw() {
      const ev = {};
      for (const n in sels) if (sels[n].value) ev[n] = sels[n].value === "T";
      const r = C.enumerate(net, ev);
      tbl.textContent = "";
      tbl.appendChild(el("caption", { class: "visually-hidden" }, "Probability that each variable is true, given the evidence."));
      const h = el("tr");
      ["Variable", "P(true | evidence)", ""].forEach(t => h.appendChild(el("th", { scope: "col" }, t)));
      tbl.appendChild(h);
      net.forEach(v => {
        const tr = el("tr"), pv = r.posterior[v.name];
        tr.appendChild(el("th", { scope: "row" }, v.name + (v.name in ev ? " (observed)" : "")));
        tr.appendChild(el("td", { class: "num" }, isNaN(pv) ? "–" : fx(pv)));
        const td = el("td"), bar = el("span", { class: "bar", "aria-hidden": "true" });
        bar.style.width = "calc(" + (isNaN(pv) ? 0 : pv) + " * var(--bar-max, 240px))";
        td.appendChild(bar); tr.appendChild(td); tbl.appendChild(tr);
      });
      const names = Object.keys(ev);
      say.textContent = r.pEvidence === 0
        ? "That evidence is impossible in this network: its probability is 0."
        : (names.length ? "Evidence: " + names.map(n => n + " = " + ev[n]).join(", ") + ". " : "No evidence. ")
          + "Enumeration summed " + r.rows + " of the " + 2 ** net.length + " rows of the joint; P(evidence) = " + fx(r.pEvidence, 4) + ".";
    }
    bReset.addEventListener("click", () => { for (const n in sels) sels[n].value = ""; draw(); });
    draw();
  }

  /* -------------------------------------------------------------- HMM -- */
  function hmmExplorer(root) {
    const prior = [0.5, 0.5], T = [[0.7, 0.3], [0.3, 0.7]], E = [0.9, 0.2];
    const ctl = el("div", { class: "ex-controls" });
    const bU = button("Day with umbrella", "btn--run"), bN = button("Day without umbrella", "btn--run"), bUndo = button("Undo a day"), bReset = button("Start over");
    ctl.append(bU, bN, bUndo, bReset);
    const say = el("p", { class: "ex-say", "aria-live": "polite" });
    const tbl = el("table", { class: "bars" });
    const wrap = el("div", { class: "fig-scroll", tabindex: "0", role: "region", "aria-label": "Belief by day" });
    wrap.appendChild(tbl);
    root.append(ctl, say, wrap);
    let obs = [];
    function draw() {
      const r = C.hmmFilter(prior, T, E, obs);
      tbl.textContent = "";
      tbl.appendChild(el("caption", { class: "visually-hidden" }, "Belief that it rains on each day."));
      const h = el("tr");
      ["Day", "Saw", "Predicted P(rain)", "Filtered P(rain)", ""].forEach(t => h.appendChild(el("th", { scope: "col" }, t)));
      tbl.appendChild(h);
      const r0 = el("tr");
      [["th", "0"], ["td", "–"], ["td", "–"], ["td", fx(prior[0])]].forEach(([t, s]) => r0.appendChild(el(t, t === "th" ? { scope: "row" } : (s !== "–" ? { class: "num" } : null), s)));
      r0.appendChild(el("td"));
      tbl.appendChild(r0);
      r.forEach((d, i) => {
        const tr = el("tr");
        tr.appendChild(el("th", { scope: "row" }, String(i + 1)));
        tr.appendChild(el("td", null, obs[i] ? "umbrella" : "no umbrella"));
        tr.appendChild(el("td", { class: "num" }, fx(d.pred[0])));
        tr.appendChild(el("td", { class: "num" }, fx(d.filtered[0])));
        const td = el("td"), bar = el("span", { class: "bar", "aria-hidden": "true" });
        bar.style.width = "calc(" + d.filtered[0] + " * var(--bar-max, 240px))";
        td.appendChild(bar); tr.appendChild(td); tbl.appendChild(tr);
      });
      const last = r[r.length - 1];
      say.textContent = obs.length ? "Day " + obs.length + ": P(rain) is " + fx(last.filtered[0]) + " after predicting " + fx(last.pred[0]) + "."
        : "Day 0: P(rain) = 0.5. Add a day.";
      bUndo.disabled = !obs.length;
      bU.disabled = bN.disabled = obs.length >= 12;
    }
    bU.addEventListener("click", () => { obs.push(true); draw(); });
    bN.addEventListener("click", () => { obs.push(false); draw(); });
    bUndo.addEventListener("click", () => { obs.pop(); draw(); });
    bReset.addEventListener("click", () => { obs = []; draw(); });
    draw();
  }

  /* -------------------------------------------------------- attention -- */
  function attentionExplorer(root) {
    const js = (k, dflt) => root.dataset[k] ? JSON.parse(root.dataset[k]) : dflt;
    const q0 = js("q", [2, 0]), K0 = js("k", [[1, 0], [0, 1], [1, 1]]), V0 = js("v", [[1, 0], [0, 1], [1, 1]]);
    const inputs = { q: [], K: [], V: [] };
    const mat = el("table", { class: "matrix" });
    mat.appendChild(el("caption", { class: "visually-hidden" }, "The query, keys and values. Edit any number."));
    const hr = el("tr");
    ["", "dim 1", "dim 2"].forEach(t => hr.appendChild(el("th", { scope: "col" }, t)));
    mat.appendChild(hr);
    const row = (label, vals, store) => {
      const tr = el("tr");
      tr.appendChild(el("th", { scope: "row" }, label));
      const r = vals.map((v, j) => {
        const inp = el("input", { type: "number", step: "0.5", value: String(v), "aria-label": label + ", dimension " + (j + 1) });
        const td = el("td"); td.appendChild(inp); tr.appendChild(td);
        inp.addEventListener("input", draw);
        return inp;
      });
      store.push(r);
      mat.appendChild(tr);
    };
    row("query q", q0, inputs.q);
    K0.forEach((k, i) => row("key k" + (i + 1), k, inputs.K));
    V0.forEach((v, i) => row("value v" + (i + 1), v, inputs.V));
    const ctl = el("div", { class: "ex-controls" });
    const sl = el("label", null, "Scaling");
    const scale = el("select");
    scale.append(el("option", { value: "1" }, "divide by √d (d = 2)"), el("option", { value: "0" }, "no scaling"));
    sl.appendChild(scale);
    const ml = el("label", null, "Causal mask: the query is token");
    const mask = el("select");
    mask.append(el("option", { value: "3" }, "3 (sees all three)"), el("option", { value: "2" }, "2 (sees tokens 1 and 2)"), el("option", { value: "1" }, "1 (sees only token 1)"));
    ml.appendChild(mask);
    const bReset = button("Reset numbers");
    ctl.append(sl, ml, bReset);
    [scale, mask].forEach(s => s.addEventListener("change", draw));
    const say = el("p", { class: "ex-say", "aria-live": "polite" });
    const tbl = el("table", { class: "bars" });
    const wrap = el("div", { class: "fig-scroll", tabindex: "0", role: "region", "aria-label": root.dataset.label || "Query, keys and values" });
    wrap.appendChild(mat);
    root.append(wrap, ctl, say, tbl);
    function val(inp) { const v = parseFloat(inp.value); return isNaN(v) ? 0 : v; }
    function draw() {
      const q = inputs.q[0].map(val), K = inputs.K.map(r => r.map(val)), V = inputs.V.map(r => r.map(val));
      const r = C.attention(q, K, V, scale.value === "1", Number(mask.value));
      tbl.textContent = "";
      tbl.appendChild(el("caption", { class: "visually-hidden" }, "Score, scaled score and attention weight for each key."));
      const h = el("tr");
      ["Key", "q · k", "Scaled", "Weight", ""].forEach(t => h.appendChild(el("th", { scope: "col" }, t)));
      tbl.appendChild(h);
      K.forEach((_, i) => {
        const tr = el("tr"), masked = i >= Number(mask.value);
        tr.appendChild(el("th", { scope: "row" }, "k" + (i + 1)));
        tr.appendChild(el("td", { class: "num" }, fx(r.scores[i])));
        tr.appendChild(el("td", { class: "num" }, masked ? "masked (−∞)" : fx(r.scaled[i])));
        tr.appendChild(el("td", { class: "num" }, fx(r.weights[i])));
        const td = el("td"), bar = el("span", { class: "bar", "aria-hidden": "true" });
        bar.style.width = "calc(" + r.weights[i] + " * var(--bar-max, 240px))";
        td.appendChild(bar); tr.appendChild(td); tbl.appendChild(tr);
      });
      say.textContent = "Output = Σ weight × value = [" + r.out.map(v => fx(v)).join(", ") + "].";
    }
    bReset.addEventListener("click", () => {
      inputs.q[0].forEach((inp, j) => { inp.value = q0[j]; });
      inputs.K.forEach((r, i) => r.forEach((inp, j) => { inp.value = K0[i][j]; }));
      inputs.V.forEach((r, i) => r.forEach((inp, j) => { inp.value = V0[i][j]; }));
      scale.value = "1"; mask.value = "3"; draw();
    });
    draw();
  }

  const EXPLORERS = { search: searchExplorer, mdp: mdpExplorer, bayes: bayesExplorer, hmm: hmmExplorer, attention: attentionExplorer };
  document.querySelectorAll("[data-explorer]").forEach(root => {
    const f = EXPLORERS[root.dataset.explorer];
    if (f) f(root);
  });
})();
