/* Personal Budget & Savings Goals — vanilla JS, localStorage persistence.
   All currency GBP (£). No external dependencies. */
(function () {
  "use strict";

  const STORAGE_KEY = "budget-savings-app.v1";

  /* ---------- Defaults ---------- */
  const DEFAULT_STATE = {
    income: 0,
    expenses: [
      "Rent/Mortgage", "Utilities", "Internet/Phone", "Groceries",
      "Transportation", "Insurance", "Subscriptions", "Dining Out",
      "Personal Care", "Entertainment", "Debt Minimum Payments", "Miscellaneous",
    ].map((name) => ({ id: uid(), name, budgeted: 0, actual: 0 })),
    savings: [
      "Emergency Fund", "High-Yield Savings/Investing", "House Down Payment Fund",
      "Wedding Fund", "Extra Debt Payoff",
    ].map((name) => ({ id: uid(), name, budgeted: 0, actual: 0 })),
    goals: [
      { name: "Emergency Fund", target: 0, current: 0, monthly: 0 },
      { name: "House Down Payment", target: 0, current: 0, monthly: 0 },
      { name: "High-Yield Savings/Investing", target: 0, current: 0, monthly: 0 },
      { name: "Wedding Fund", target: 0, current: 0, monthly: 0 },
      { name: "Debt Payoff", target: 0, current: 0, monthly: 0 },
    ].map((g) => Object.assign({ id: uid() }, g)),
    debts: [
      { id: uid(), name: "", balance: 0, apr: 0, payment: 0 },
    ],
    history: [], // { id, label, income, expenses, savings, leftover }
  };

  /* ---------- Utilities ---------- */
  function uid() { return "id" + Math.random().toString(36).slice(2, 10); }

  function num(v) {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  const gbp = new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  function money(n) { return gbp.format(isFinite(n) ? n : 0); }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2), attrs[k]);
        } else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  /* ---------- State ---------- */
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      // Shallow-merge to tolerate older/partial saves.
      return Object.assign(structuredClone(DEFAULT_STATE), parsed);
    } catch (e) {
      console.warn("Failed to load state, using defaults", e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn("Failed to save state", e); }
  }

  /* ---------- Derived totals ---------- */
  function sum(list, key) { return list.reduce((t, r) => t + num(r[key]), 0); }

  function totals() {
    const expBudgeted = sum(state.expenses, "budgeted");
    const expActual = sum(state.expenses, "actual");
    const savBudgeted = sum(state.savings, "budgeted");
    const savActual = sum(state.savings, "actual");
    const income = num(state.income);
    const leftover = income - expActual - savActual;
    return { income, expBudgeted, expActual, savBudgeted, savActual, leftover };
  }

  /* ---------- Renderers ---------- */
  function renderAll() {
    renderIncome();
    renderExpenses();
    renderSavings();
    renderSummary();
    renderGoals();
    renderDebts();
    renderHistory();
  }

  function renderIncome() {
    const input = document.getElementById("incomeInput");
    if (document.activeElement !== input) input.value = state.income || "";
  }

  function makeAllocRow(item, listKey, withDiff) {
    const nameInput = el("input", {
      class: "cell-input cell-input--name editable", type: "text", value: item.name,
      "aria-label": "Category name",
      oninput: (e) => { item.name = e.target.value; save(); },
    });
    const budgeted = el("input", {
      class: "cell-input cell-input--num editable", type: "number", inputmode: "decimal",
      min: "0", step: "0.01", value: item.budgeted || "", placeholder: "0.00", "aria-label": "Budgeted",
      oninput: (e) => { item.budgeted = num(e.target.value); save(); refreshTotals(listKey); renderSummary(); },
    });
    const actual = el("input", {
      class: "cell-input cell-input--num editable", type: "number", inputmode: "decimal",
      min: "0", step: "0.01", value: item.actual || "", placeholder: "0.00", "aria-label": "Actual",
      oninput: (e) => { item.actual = num(e.target.value); save(); refreshTotals(listKey); renderSummary(); },
    });
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove", "aria-label": "Remove category",
      onclick: () => {
        state[listKey] = state[listKey].filter((x) => x.id !== item.id);
        save(); renderAll();
      },
    }, ["✕"]);

    const cells = [
      el("td", { class: "col-name" }, [nameInput]),
      el("td", { class: "col-num" }, [budgeted]),
      el("td", { class: "col-num" }, [actual]),
    ];
    if (withDiff) {
      const diff = num(item.budgeted) - num(item.actual);
      cells.push(el("td", { class: "col-num cell-calc " + diffClass(diff) }, [money(diff)]));
    }
    cells.push(el("td", { class: "col-act" }, [del]));
    return el("tr", {}, cells);
  }

  // For expenses, "under budget" (budgeted >= actual) is good.
  function diffClass(diff) { return diff < 0 ? "neg" : "pos"; }

  function renderExpenses() {
    const body = document.getElementById("expensesBody");
    body.textContent = "";
    state.expenses.forEach((item) => body.appendChild(makeAllocRow(item, "expenses", true)));
    refreshTotals("expenses");
  }

  function renderSavings() {
    const body = document.getElementById("savingsBody");
    body.textContent = "";
    state.savings.forEach((item) => body.appendChild(makeAllocRow(item, "savings", false)));
    refreshTotals("savings");
  }

  function refreshTotals(listKey) {
    if (listKey === "expenses") {
      const b = sum(state.expenses, "budgeted");
      const a = sum(state.expenses, "actual");
      const d = b - a;
      document.getElementById("expBudgetedTotal").textContent = money(b);
      document.getElementById("expActualTotal").textContent = money(a);
      const dt = document.getElementById("expDiffTotal");
      dt.textContent = money(d);
      dt.className = "col-num " + diffClass(d);
    } else if (listKey === "savings") {
      document.getElementById("savBudgetedTotal").textContent = money(sum(state.savings, "budgeted"));
      document.getElementById("savActualTotal").textContent = money(sum(state.savings, "actual"));
    }
  }

  function renderSummary() {
    const t = totals();
    document.getElementById("sumIncome").textContent = money(t.income);
    document.getElementById("sumExpenses").textContent = money(t.expActual);
    document.getElementById("sumSavings").textContent = money(t.savActual);

    const lo = document.getElementById("sumLeftover");
    lo.textContent = money(t.leftover);
    const loStat = document.getElementById("leftoverStat");
    loStat.classList.remove("pos-bg", "neg-bg");
    loStat.classList.add(t.leftover < 0 ? "neg-bg" : "pos-bg");

    const sticky = document.getElementById("stickyLeftover");
    sticky.textContent = money(t.leftover);
    sticky.className = "sticky-bar__value " + (t.leftover < 0 ? "neg" : "pos");

    renderBreakdownChart(t);
  }

  /* ---------- Donut chart: expenses vs each savings category ---------- */
  function renderBreakdownChart(t) {
    const palette = ["#ef4444", "#14b8a6", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981", "#6366f1", "#f97316"];
    const segments = [];
    if (t.expActual > 0) segments.push({ label: "Expenses", value: t.expActual, color: "#ef4444" });
    state.savings.forEach((s, i) => {
      if (num(s.actual) > 0) segments.push({ label: s.name || "Savings", value: num(s.actual), color: palette[(i + 1) % palette.length] });
    });
    const leftover = t.leftover;
    if (leftover > 0) segments.push({ label: "Left over", value: leftover, color: "#cbd5e1" });

    const wrap = document.getElementById("breakdownChart");
    const legend = document.getElementById("breakdownLegend");
    wrap.textContent = "";
    legend.textContent = "";

    const total = segments.reduce((a, s) => a + s.value, 0);
    if (total <= 0) {
      wrap.appendChild(el("p", { class: "empty-hint", text: "Enter actual amounts to see the breakdown." }));
      return;
    }

    const size = 160, r = 62, cx = size / 2, cy = size / 2, stroke = 26, C = 2 * Math.PI * r;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", size); svg.setAttribute("height", size);
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

    let offset = 0;
    segments.forEach((s) => {
      const frac = s.value / total;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", s.color);
      circle.setAttribute("stroke-width", stroke);
      circle.setAttribute("stroke-dasharray", `${frac * C} ${C}`);
      circle.setAttribute("stroke-dashoffset", -offset * C);
      circle.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
      svg.appendChild(circle);
      offset += frac;

      legend.appendChild(el("li", {}, [
        el("span", { class: "legend__swatch", style: `background:${s.color}` }),
        el("span", { class: "legend__name", text: s.label }),
        el("span", { class: "legend__val", text: `${money(s.value)} · ${Math.round(frac * 100)}%` }),
      ]));
    });
    wrap.appendChild(svg);
  }

  /* ---------- Goals ---------- */
  function renderGoals() {
    const container = document.getElementById("goalsList");
    container.textContent = "";
    state.goals.forEach((g) => container.appendChild(makeGoalCard(g)));
  }

  function goalCalc(g) {
    const target = num(g.target), current = num(g.current), monthly = num(g.monthly);
    const remaining = Math.max(target - current, 0);
    let months = null, date = null;
    if (remaining <= 0 && target > 0) { months = 0; }
    else if (monthly > 0 && remaining > 0) {
      months = Math.ceil(remaining / monthly);
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + months);
      date = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    }
    const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    return { remaining, months, date, pct };
  }

  function makeGoalCard(g) {
    const c = goalCalc(g);

    const name = el("input", {
      class: "goal__name editable", type: "text", value: g.name, "aria-label": "Goal name",
      oninput: (e) => { g.name = e.target.value; save(); },
    });
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove goal", "aria-label": "Remove goal",
      onclick: () => { state.goals = state.goals.filter((x) => x.id !== g.id); save(); renderGoals(); },
    }, ["✕"]);

    function moneyField(label, key) {
      return el("label", { class: "goal__field" }, [
        el("span", { text: label }),
        el("span", { class: "input-money" }, [
          el("span", { class: "input-money__symbol", text: "£" }),
          el("input", {
            class: "input input--money editable", type: "number", inputmode: "decimal",
            min: "0", step: "0.01", value: g[key] || "", placeholder: "0.00", "aria-label": label,
            oninput: (e) => { g[key] = num(e.target.value); save(); refreshGoalCard(g, card); },
          }),
        ]),
      ]);
    }

    const calcLine = el("div", { class: "goal__calc" });
    fillGoalCalc(calcLine, c);

    const bar = el("div", { class: "progress__bar" });
    setBar(bar, c.pct);
    const progress = el("div", { class: "progress" }, [bar]);
    const progressLabel = el("span", { class: "progress__label", text: progressText(g, c) });

    const card = el("div", { class: "goal", "data-id": g.id }, [
      el("div", { class: "goal__top" }, [name, del]),
      el("div", { class: "goal__inputs" }, [
        moneyField("Target", "target"),
        moneyField("Current saved", "current"),
        moneyField("Monthly contribution", "monthly"),
      ]),
      calcLine, progress, progressLabel,
    ]);
    card._calcLine = calcLine;
    card._bar = bar;
    card._progressLabel = progressLabel;
    return card;
  }

  function progressText(g, c) {
    return `${money(num(g.current))} of ${money(num(g.target))} · ${Math.round(c.pct)}%`;
  }

  function fillGoalCalc(node, c) {
    node.textContent = "";
    let monthsText;
    if (c.months === 0) monthsText = "🎉 Goal reached";
    else if (c.months == null) monthsText = "—";
    else monthsText = `${c.months} month${c.months === 1 ? "" : "s"}`;
    node.appendChild(el("span", {}, ["Months remaining: ", el("b", { text: monthsText })]));
    node.appendChild(el("span", {}, ["Est. completion: ", el("b", { text: c.date || (c.months === 0 ? "Done" : "—") })]));
  }

  function setBar(bar, pct) {
    bar.style.width = pct + "%";
    // Green when at/near goal, amber mid, keeps a positive feel.
    bar.style.background = pct >= 100 ? "var(--c-good)" : pct >= 50 ? "var(--c-primary)" : "var(--c-warn)";
  }

  function refreshGoalCard(g, card) {
    const c = goalCalc(g);
    fillGoalCalc(card._calcLine, c);
    setBar(card._bar, c.pct);
    card._progressLabel.textContent = progressText(g, c);
  }

  /* ---------- Debts ---------- */
  // Months to pay off a balance at APR with fixed monthly payment.
  function debtMonths(balance, apr, payment) {
    balance = num(balance); payment = num(payment); apr = num(apr);
    if (balance <= 0) return 0;
    if (payment <= 0) return null;
    const r = apr / 100 / 12;
    if (r <= 0) return Math.ceil(balance / payment);
    // If payment doesn't cover monthly interest, it never pays off.
    if (payment <= balance * r) return Infinity;
    const n = -Math.log(1 - (balance * r) / payment) / Math.log(1 + r);
    return Math.ceil(n);
  }

  function renderDebts() {
    const body = document.getElementById("debtBody");
    body.textContent = "";
    state.debts.forEach((d) => body.appendChild(makeDebtRow(d)));
  }

  function makeDebtRow(d) {
    function input(key, opts) {
      return el("input", Object.assign({
        class: "cell-input editable", value: d[key] || "",
        oninput: (e) => {
          d[key] = opts.text ? e.target.value : num(e.target.value);
          save();
          payoffCell.textContent = payoffText(d);
          payoffCell.className = "col-num cell-calc " + payoffClass(d);
        },
      }, opts.attrs));
    }
    const name = input("name", { text: true, attrs: { type: "text", class: "cell-input cell-input--name editable", placeholder: "Card / loan", "aria-label": "Debt name" } });
    const balance = input("balance", { attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.01", class: "cell-input cell-input--num editable", placeholder: "0.00", "aria-label": "Balance" } });
    const apr = input("apr", { attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.1", class: "cell-input cell-input--num editable", placeholder: "0", "aria-label": "APR" } });
    const payment = input("payment", { attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.01", class: "cell-input cell-input--num editable", placeholder: "0.00", "aria-label": "Monthly payment" } });

    const payoffCell = el("td", { class: "col-num cell-calc " + payoffClass(d) }, [payoffText(d)]);
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove debt", "aria-label": "Remove debt",
      onclick: () => { state.debts = state.debts.filter((x) => x.id !== d.id); save(); renderDebts(); },
    }, ["✕"]);

    return el("tr", {}, [
      el("td", { class: "col-name" }, [name]),
      el("td", { class: "col-num" }, [balance]),
      el("td", { class: "col-num" }, [apr]),
      el("td", { class: "col-num" }, [payment]),
      payoffCell,
      el("td", { class: "col-act" }, [del]),
    ]);
  }

  function payoffText(d) {
    const m = debtMonths(d.balance, d.apr, d.payment);
    if (m == null) return "—";
    if (m === 0) return "Clear";
    if (m === Infinity) return "Never*";
    const yrs = Math.floor(m / 12), mo = m % 12;
    if (m < 12) return `${m} mo`;
    return `${yrs}y ${mo}m`;
  }
  function payoffClass(d) {
    const m = debtMonths(d.balance, d.apr, d.payment);
    if (m === Infinity) return "neg";
    if (m === 0) return "pos";
    return "";
  }

  /* ---------- History ---------- */
  function renderHistory() {
    const body = document.getElementById("historyBody");
    const empty = document.getElementById("historyEmpty");
    body.textContent = "";
    if (!state.history.length) { empty.style.display = "block"; }
    else { empty.style.display = "none"; }

    state.history.forEach((h) => {
      const del = el("button", {
        class: "btn btn--icon", type: "button", title: "Delete snapshot", "aria-label": "Delete snapshot",
        onclick: () => { state.history = state.history.filter((x) => x.id !== h.id); save(); renderHistory(); },
      }, ["✕"]);
      body.appendChild(el("tr", {}, [
        el("td", { class: "col-name", text: h.label }),
        el("td", { class: "col-num cell-calc", text: money(h.income) }),
        el("td", { class: "col-num cell-calc", text: money(h.expenses) }),
        el("td", { class: "col-num cell-calc", text: money(h.savings) }),
        el("td", { class: "col-num cell-calc " + (h.leftover < 0 ? "neg" : "pos"), text: money(h.leftover) }),
        el("td", { class: "col-act" }, [del]),
      ]));
    });

    renderHistoryChart();
  }

  function renderHistoryChart() {
    const wrap = document.getElementById("historyChart");
    wrap.textContent = "";
    const data = state.history;
    if (data.length < 2) {
      wrap.appendChild(el("p", { class: "empty-hint", text: data.length === 1 ? "Save another month to see the trend line." : "" }));
      return;
    }

    const W = 640, H = 220, pad = { l: 52, r: 12, t: 14, b: 28 };
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const maxV = Math.max(1, ...data.map((d) => Math.max(d.income, d.expenses, d.savings)));
    const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
    const x = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = (v) => pad.t + innerH - (v / maxV) * innerH;

    // gridlines + y labels
    for (let g = 0; g <= 4; g++) {
      const gv = (maxV / 4) * g;
      const gy = y(gv);
      svg.appendChild(mk(svgNS, "line", { x1: pad.l, y1: gy, x2: W - pad.r, y2: gy, stroke: "#e2e8f0", "stroke-width": 1 }));
      const lbl = mk(svgNS, "text", { x: pad.l - 6, y: gy + 4, "text-anchor": "end", "font-size": 10, fill: "#94a3b8" });
      lbl.textContent = "£" + Math.round(gv).toLocaleString("en-GB");
      svg.appendChild(lbl);
    }

    const series = [
      { key: "income", color: "var(--c-income)" },
      { key: "expenses", color: "var(--c-expense)" },
      { key: "savings", color: "var(--c-savings)" },
    ];
    series.forEach((s) => {
      const pts = data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ");
      svg.appendChild(mk(svgNS, "polyline", { points: pts, fill: "none", stroke: s.color, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      data.forEach((d, i) => svg.appendChild(mk(svgNS, "circle", { cx: x(i), cy: y(d[s.key]), r: 3, fill: s.color })));
    });

    // x labels
    data.forEach((d, i) => {
      const t = mk(svgNS, "text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 10, fill: "#64748b" });
      t.textContent = d.label;
      svg.appendChild(t);
    });

    wrap.appendChild(svg);
  }

  function mk(ns, tag, attrs) {
    const n = document.createElementNS(ns, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------- Actions ---------- */
  function addRow(listKey) {
    if (listKey === "expenses" || listKey === "savings") {
      state[listKey].push({ id: uid(), name: "New category", budgeted: 0, actual: 0 });
      save(); (listKey === "expenses" ? renderExpenses : renderSavings)();
    } else if (listKey === "goals") {
      state.goals.push({ id: uid(), name: "New goal", target: 0, current: 0, monthly: 0 });
      save(); renderGoals();
    } else if (listKey === "debts") {
      state.debts.push({ id: uid(), name: "", balance: 0, apr: 0, payment: 0 });
      save(); renderDebts();
    }
  }

  function saveSnapshot() {
    const t = totals();
    const label = new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const snap = {
      id: uid(), label,
      income: t.income, expenses: t.expActual, savings: t.savActual, leftover: t.leftover,
    };
    // Replace an existing snapshot with the same label (same month) rather than duplicating.
    const existing = state.history.findIndex((h) => h.label === label);
    if (existing >= 0) state.history[existing] = snap;
    else state.history.push(snap);
    save();
    renderHistory();
  }

  function resetAll() {
    if (!confirm("Reset ALL data back to defaults? This cannot be undone.")) return;
    state = structuredClone(DEFAULT_STATE);
    save();
    renderAll();
  }

  /* ---------- Wiring ---------- */
  document.getElementById("incomeInput").addEventListener("input", (e) => {
    state.income = num(e.target.value); save(); renderSummary();
  });
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => addRow(btn.getAttribute("data-add")));
  });
  document.getElementById("saveSnapshotBtn").addEventListener("click", saveSnapshot);
  document.getElementById("resetBtn").addEventListener("click", resetAll);

  renderAll();
})();
