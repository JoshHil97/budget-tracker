/* Personal Budget & Savings Goals — vanilla JS, localStorage persistence.
   All currency GBP (£). No external dependencies. */
(function () {
  "use strict";

  const STORAGE_KEY = "budget-savings-app.v1";
  const ROOT_KEY = "budget-savings-app.profiles.v2";
  const SESSION_PROFILE_KEY = "budget-savings-app.activeProfile";

  /* ---------- Defaults ---------- */
  const DEFAULT_STATE = {
    income: 2022.64,
    expenses: [
      { name: "Transport", budgeted: 104 },
      { name: "Phone", budgeted: 60 },
      { name: "Internet / WiFi", budgeted: 35 },
      { name: "Subscriptions (Claude, ChatGPT +)", budgeted: 90 },
      { name: "Groceries (work + home)", budgeted: 217 },
      { name: "Takeaway (treat cap)", budgeted: 40 },
      { name: "Family support (Mum/Dad)", budgeted: 75 },
      { name: "Personal care (toiletries, perfume…)", budgeted: 30 },
      { name: "Cleaning", budgeted: 20 },
      { name: "Date night with Adedola (incl. transport)", budgeted: 150 },
      { name: "Spending on Adedola (buffer)", budgeted: 100 },
      { name: "Personal allowance (to live by)", budgeted: 260 },
    ].map((e) => ({ id: uid(), name: e.name, budgeted: e.budgeted, actual: 0 })),
    savings: [
      { name: "Emergency / High-Yield pot", budgeted: 500 },
      { name: "House Down Payment Fund", budgeted: 0 },
      { name: "Wedding Fund", budgeted: 0 },
      { name: "Investing", budgeted: 0 },
    ].map((s) => ({ id: uid(), name: s.name, budgeted: s.budgeted, actual: 0 })),
    goals: [
      { name: "Emergency Fund", target: 0, current: 0, monthly: 500 },
      { name: "House Down Payment", target: 0, current: 0, monthly: 0 },
      { name: "High-Yield Savings/Investing", target: 0, current: 0, monthly: 0 },
      { name: "Wedding Fund", target: 0, current: 0, monthly: 0 },
    ].map((g) => Object.assign({ id: uid() }, g)),
    debts: [
      { name: "Overdraft", balance: 1025, apr: 39.9, payment: 0 },
      { name: "Credit card", balance: 250, apr: 24.9, payment: 0 },
      { name: "Personal debt", balance: 200, apr: 0, payment: 0 },
      { name: "Owe a friend (this month)", balance: 50, apr: 0, payment: 0 },
      { name: "Friends payback (1st)", balance: 100, apr: 0, payment: 0 },
      { name: "Friends payback (rest)", balance: 600, apr: 0, payment: 0 },
    ].map((d) => Object.assign({ id: uid() }, d)),
    tithePct: 10,
    emergencyMonths: 3,
    monthlySavingsTarget: 0,
    sinkingFunds: [
      { id: uid(), name: "Germany trip (hotel + spend)", cost: 580, saved: 0, start: "", date: nextMonthISO() },
      { id: uid(), name: "Milan trip with Adedola (est.)", cost: 700, saved: 0, start: monthsAheadISO(1), date: monthsAheadISO(2) },
    ],
    transactions: [
      { id: uid(), date: todayISO(), category: "Transport", note: "Train / travel", amount: 0 },
      { id: uid(), date: todayISO(), category: "Groceries (work + home)", note: "Food shop", amount: 0 },
    ],
    history: [], // { id, label, income, tithe, expenses, savings, leftover }
  };

  const AYO_DEFAULT_STATE = Object.assign(structuredClone(DEFAULT_STATE), {
    income: 0,
    expenses: [
      { name: "Transport", budgeted: 0 },
      { name: "Food", budgeted: 0 },
      { name: "Phone", budgeted: 0 },
      { name: "Subscriptions", budgeted: 0 },
      { name: "Personal care", budgeted: 0 },
      { name: "Family / giving", budgeted: 0 },
      { name: "Fun money", budgeted: 0 },
    ].map((e) => ({ id: uid(), name: e.name, budgeted: e.budgeted, actual: 0 })),
    savings: [
      { name: "Emergency pot", budgeted: 0 },
      { name: "Travel / experiences", budgeted: 0 },
      { name: "Future home", budgeted: 0 },
      { name: "Investing", budgeted: 0 },
    ].map((s) => ({ id: uid(), name: s.name, budgeted: s.budgeted, actual: 0 })),
    goals: [
      { name: "Emergency Fund", target: 0, current: 0, monthly: 0 },
      { name: "Travel", target: 0, current: 0, monthly: 0 },
      { name: "Future Home", target: 0, current: 0, monthly: 0 },
    ].map((g) => Object.assign({ id: uid() }, g)),
    debts: [],
    sinkingFunds: [],
    transactions: [],
    history: [],
  });

  const PROFILES = {
    josh: { label: "Bayo", subtitle: "Giving first, debt down, future built." },
    ayo: { label: "Adedola", subtitle: "Private budget room." },
  };

  const SCRIPTURES = [
    { text: "The plans of the diligent lead surely to abundance.", ref: "Proverbs 21:5" },
    { text: "For where your treasure is, there your heart will be also.", ref: "Matthew 6:21" },
    { text: "Each of you should use whatever gift you have received to serve others.", ref: "1 Peter 4:10" },
    { text: "Commit your work to the Lord, and your plans will be established.", ref: "Proverbs 16:3" },
  ];

  /* ---------- Utilities ---------- */
  function uid() { return "id" + Math.random().toString(36).slice(2, 10); }

  // "YYYY-MM" for the first of the month n months from now.
  function monthsAheadISO(n) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function nextMonthISO() { return monthsAheadISO(1); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // Whole months from now to a "YYYY-MM" month (can be 0 or negative).
  function monthsUntilRaw(iso) {
    if (!iso) return 0;
    const parts = String(iso).split("-");
    const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (!y || !m) return 0;
    const now = new Date();
    return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  }
  // Same, floored at 1 (used to spread a cost over remaining months).
  function monthsUntil(iso) { return Math.max(monthsUntilRaw(iso), 1); }

  function avg(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0; }

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

  function cleanName(value) { return String(value || "").trim().replace(/\s+/g, " "); }

  function setFieldError(input, message) {
    input.classList.toggle("is-invalid", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");
    let msg = input.parentElement && input.parentElement.querySelector(":scope > .validation-msg");
    if (!msg && input.parentElement) {
      msg = el("div", { class: "validation-msg" });
      input.parentElement.appendChild(msg);
    }
    if (msg) {
      msg.textContent = message || "";
      msg.hidden = !message;
    }
  }

  function decimalValidation(value, label, opts) {
    const options = Object.assign({ required: true, max: 999999999 }, opts || {});
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return options.required ? `${label} is required.` : "";
    if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) return `${label} must be a valid amount with up to 2 decimal places.`;
    const valueNum = Number(raw);
    if (!Number.isFinite(valueNum)) return `${label} must be a valid number.`;
    if (valueNum < 0) return `${label} cannot be negative.`;
    if (valueNum > options.max) return `${label} is unusually high. Please enter less than ${money(options.max)}.`;
    return "";
  }

  function monthValidation(value, label, opts) {
    const options = Object.assign({ required: true, allowPast: false }, opts || {});
    const raw = String(value || "").trim();
    if (!raw) return options.required ? `${label} is required.` : "";
    if (!/^\d{4}-\d{2}$/.test(raw)) return `${label} must be a valid month.`;
    const m = monthsUntilRaw(raw);
    if (!options.allowPast && m < 0) return `${label} cannot be in a past month.`;
    return "";
  }

  function duplicateMessage(list, item, label) {
    const name = cleanName(item.name);
    if (!name) return `${label} name is required.`;
    const duplicate = list.some((x) => x.id !== item.id && cleanName(x.name).toLowerCase() === name.toLowerCase());
    return duplicate ? `${label} names must be unique.` : "";
  }

  function uniqueName(list, base) {
    const names = new Set(list.map((x) => cleanName(x.name).toLowerCase()).filter(Boolean));
    if (!names.has(base.toLowerCase())) return base;
    let i = 2;
    while (names.has(`${base} ${i}`.toLowerCase())) i += 1;
    return `${base} ${i}`;
  }

  function commitName(input, list, item, label, onValid) {
    const next = cleanName(input.value);
    const message = !next ? `${label} name is required.` : duplicateMessage(list, Object.assign({}, item, { name: next }), label);
    setFieldError(input, message);
    if (message) return false;
    item.name = next;
    if (onValid) onValid();
    save();
    return true;
  }

  function commitDecimal(input, target, key, label, opts, onValid) {
    const message = decimalValidation(input.value, label, opts);
    setFieldError(input, message);
    if (message) return false;
    target[key] = Number(input.value);
    if (onValid) onValid();
    save();
    refreshFinancials();
    return true;
  }

  function refreshFinancials() {
    if (!state) return;
    renderOnboarding();
    renderIncome();
    refreshTotals("expenses");
    refreshTotals("savings");
    updateSinkingTotals(false);
    renderSummary();
    renderMoneyTrail();
    renderAdvisor();
  }

  function notify(message, type) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    const toast = el("div", { class: "toast" + (type ? " toast--" + type : ""), text: message });
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }

  let pendingConfirm = null;

  function openConfirm(title, body, actionLabel, onConfirm) {
    pendingConfirm = onConfirm;
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmBody").textContent = body;
    document.getElementById("confirmOkBtn").textContent = actionLabel || "Delete";
    document.getElementById("confirmModal").hidden = false;
    document.getElementById("confirmCancelBtn").focus();
  }

  function closeConfirm() {
    pendingConfirm = null;
    document.getElementById("confirmModal").hidden = true;
  }

  function sectionAction(targetId, focusSelector, addKey) {
    return () => {
      if (addKey && !listForKey(addKey).length) addRow(addKey);
      scrollToSection(targetId, focusSelector);
    };
  }

  function listForKey(listKey) {
    if (!state) return [];
    if (listKey === "sinking") return state.sinkingFunds || [];
    if (listKey === "transactions") return state.transactions || [];
    if (listKey === "goals") return state.goals || [];
    if (listKey === "debts") return state.debts || [];
    return state[listKey] || [];
  }

  function scrollToSection(targetId, focusSelector) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const behaviour = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    target.scrollIntoView({ behavior: behaviour, block: "start" });
    window.setTimeout(() => {
      const focusTarget = focusSelector ? target.querySelector(focusSelector) : target.querySelector("input, select, button");
      if (focusTarget) {
        const focusable = /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(focusTarget.tagName) || focusTarget.hasAttribute("tabindex");
        if (!focusable) focusTarget.setAttribute("tabindex", "-1");
        focusTarget.focus({ preventScroll: true });
      }
    }, behaviour === "smooth" ? 280 : 0);
  }

  function emptyState(title, description, actionText, onAction) {
    return el("div", { class: "empty-state" }, [
      el("h4", { text: title }),
      el("p", { text: description }),
      actionText ? el("button", { class: "btn btn--sm", type: "button", onclick: onAction }, [actionText]) : null,
    ].filter(Boolean));
  }

  /* ---------- State ---------- */
  let root = loadRoot();
  let activeProfile = sessionStorage.getItem(SESSION_PROFILE_KEY) || "";
  let pendingProfile = "";
  let state = null;

  function defaultsFor(profileId) {
    return structuredClone(profileId === "ayo" ? AYO_DEFAULT_STATE : DEFAULT_STATE);
  }

  function loadRoot() {
    try {
      const rawRoot = localStorage.getItem(ROOT_KEY);
      if (rawRoot) return JSON.parse(rawRoot);
      const legacy = localStorage.getItem(STORAGE_KEY);
      const migratedBayo = legacy ? JSON.parse(legacy) : defaultsFor("josh");
      const freshRoot = {
        profiles: {
          josh: { passHash: "", state: Object.assign(defaultsFor("josh"), migratedBayo) },
          ayo: { passHash: "", state: defaultsFor("ayo") },
        },
      };
      localStorage.setItem(ROOT_KEY, JSON.stringify(freshRoot));
      return freshRoot;
    } catch (e) {
      console.warn("Failed to load profiles, using defaults", e);
      return { profiles: { josh: { passHash: "", state: defaultsFor("josh") }, ayo: { passHash: "", state: defaultsFor("ayo") } } };
    }
  }

  function saveRoot() {
    try { localStorage.setItem(ROOT_KEY, JSON.stringify(root)); }
    catch (e) { console.warn("Failed to save profiles", e); }
  }

  function save() {
    if (!activeProfile || !root.profiles[activeProfile]) return;
    root.profiles[activeProfile].state = state;
    saveRoot();
  }

  async function hashPasscode(passcode) {
    if (!window.crypto || !window.crypto.subtle) return "fallback:" + simpleHash("budget-room:" + passcode);
    const data = new TextEncoder().encode("budget-room:" + passcode);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function simpleHash(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function profileRecord(profileId) {
    if (!root.profiles) root.profiles = {};
    if (!root.profiles[profileId]) root.profiles[profileId] = { passHash: "", state: defaultsFor(profileId) };
    root.profiles[profileId].state = Object.assign(defaultsFor(profileId), root.profiles[profileId].state || {});
    if (!Array.isArray(root.profiles[profileId].state.transactions)) root.profiles[profileId].state.transactions = [];
    return root.profiles[profileId];
  }

  function showAuth() {
    document.getElementById("authScreen").hidden = false;
    document.getElementById("appShell").hidden = true;
    document.getElementById("authForm").hidden = true;
    document.getElementById("passcodeInput").value = "";
  }

  function showApp(profileId) {
    activeProfile = profileId;
    sessionStorage.setItem(SESSION_PROFILE_KEY, profileId);
    const record = profileRecord(profileId);
    state = record.state;
    document.getElementById("authScreen").hidden = true;
    document.getElementById("appShell").hidden = false;
    document.getElementById("profileSubtitle").textContent = PROFILES[profileId].subtitle;
    renderAll();
  }

  function startLogin(profileId) {
    pendingProfile = profileId;
    const record = profileRecord(profileId);
    document.getElementById("authForm").hidden = false;
    document.getElementById("authProfileName").textContent = PROFILES[profileId].label;
    document.getElementById("authPassLabel").textContent = record.passHash ? "Passcode" : "Create passcode";
    document.getElementById("authSubmitBtn").textContent = record.passHash ? "Unlock" : "Create & unlock";
    document.getElementById("authNote").textContent = "";
    document.getElementById("passcodeInput").value = "";
    document.getElementById("passcodeInput").focus();
    saveRoot();
  }

  async function submitLogin(e) {
    e.preventDefault();
    const note = document.getElementById("authNote");
    const passcode = document.getElementById("passcodeInput").value;
    if (!pendingProfile) return;
    if (passcode.length < 4) {
      note.textContent = "Use at least 4 characters.";
      return;
    }
    const record = profileRecord(pendingProfile);
    const hash = await hashPasscode(passcode);
    if (!record.passHash) {
      record.passHash = hash;
      saveRoot();
      showApp(pendingProfile);
      return;
    }
    if (record.passHash !== hash) {
      note.textContent = "That passcode didn't match.";
      return;
    }
    showApp(pendingProfile);
  }

  /* ---------- Derived totals ---------- */
  function sum(list, key) { return list.reduce((t, r) => t + num(r[key]), 0); }

  function transactionTotalsByCategory() {
    return (state.transactions || []).reduce((acc, tx) => {
      const key = tx.category || "Uncategorised";
      acc[key] = (acc[key] || 0) + num(tx.amount);
      return acc;
    }, {});
  }

  function expenseActual(item, txTotals) {
    const logged = txTotals || transactionTotalsByCategory();
    return num(item.actual) + num(logged[item.name]);
  }

  function totals() {
    const txTotals = transactionTotalsByCategory();
    const expBudgeted = sum(state.expenses, "budgeted");
    const expActual = state.expenses.reduce((total, item) => total + expenseActual(item, txTotals), 0);
    const savBudgeted = sum(state.savings, "budgeted");
    const savActual = sum(state.savings, "actual");
    const income = num(state.income);
    const tithe = income * (num(state.tithePct) / 100);
    const sinkingPlanned = state.sinkingFunds.reduce((total, f) => total + sinkingMonthly(f), 0);
    const plannedCommitments = tithe + expBudgeted + savBudgeted + sinkingPlanned;
    const actualSpending = expActual;
    const remainingBudget = expBudgeted - expActual;
    const actualCashRemaining = income - tithe - expActual - savActual;
    const unallocatedIncome = income - plannedCommitments;
    const safeToSpend = Math.max(Math.min(actualCashRemaining, unallocatedIncome), 0);
    return { income, tithe, expBudgeted, expActual, savBudgeted, savActual, sinkingPlanned, plannedCommitments, actualSpending, remainingBudget, actualCashRemaining, unallocatedIncome, safeToSpend, leftover: actualCashRemaining };
  }

  /* ---------- Renderers ---------- */
  function renderAll() {
    renderOnboarding();
    renderIncome();
    renderExpenses();
    renderSavings();
    renderSinking();
    renderSummary();
    renderGoals();
    renderDebts();
    renderHistory();
    renderAdvisor();
    renderTransactions();
    renderMoneyTrail();
    renderScripture();
  }

  function meaningfulDataExists() {
    return num(state.income) > 0 ||
      state.expenses.some((e) => num(e.budgeted) > 0 || num(e.actual) > 0) ||
      state.savings.some((s) => num(s.budgeted) > 0 || num(s.actual) > 0) ||
      state.sinkingFunds.some((f) => num(f.cost) > 0) ||
      state.transactions.some((tx) => num(tx.amount) > 0) ||
      state.history.length > 0;
  }

  function checklistItems() {
    return [
      { id: "income", label: "Add monthly income", done: num(state.income) > 0, action: sectionAction("incomeSection", "#incomeInput") },
      { id: "expense", label: "Create at least one expense category", done: state.expenses.some((e) => cleanName(e.name) && num(e.budgeted) > 0), action: sectionAction("expensesSection", "input[aria-label='Category name']", "expenses") },
      { id: "savings", label: "Allocate money towards savings", done: state.savings.some((s) => cleanName(s.name) && num(s.budgeted) > 0), action: sectionAction("savingsSection", "input[aria-label='Budgeted']", "savings") },
      { id: "sinking", label: "Add an upcoming cost or sinking fund", done: state.sinkingFunds.some((f) => cleanName(f.name) && num(f.cost) > 0), action: sectionAction("sinkingSection", "input[aria-label='Total cost']", "sinking") },
      { id: "transaction", label: "Record the first transaction", done: state.transactions.some((tx) => num(tx.amount) > 0), action: sectionAction("transactionsSection", "input[aria-label='Amount']", "transactions") },
      { id: "history", label: "Save the current month", done: state.history.length > 0, action: sectionAction("historySection", "#saveSnapshotBtn") },
    ];
  }

  function renderOnboarding() {
    const intro = document.getElementById("introPanel");
    if (intro) intro.hidden = meaningfulDataExists();

    const list = document.getElementById("checklistList");
    const status = document.getElementById("checklistStatus");
    const message = document.getElementById("checklistMessage");
    const body = document.getElementById("gettingStartedBody");
    const toggle = document.getElementById("checklistToggle");
    if (!list || !status || !message || !body || !toggle) return;

    const items = checklistItems();
    const complete = items.filter((item) => item.done).length;
    status.textContent = `${complete} of ${items.length} complete`;
    message.textContent = complete === items.length ? "Your budget is set up and ready to track." : "Complete these steps in order, or jump to the section you want to fill in first.";
    list.textContent = "";
    items.forEach((item) => {
      list.appendChild(el("li", { class: item.done ? "is-complete" : "" }, [
        el("span", { class: "checklist-list__mark", text: item.done ? "Done" : "Next" }),
        el("button", {
          class: "checklist-list__action",
          type: "button",
          disabled: item.done ? "true" : null,
          onclick: item.done ? null : item.action,
        }, [item.label]),
      ]));
    });
    if (complete === items.length && !body.dataset.autoCollapsed) {
      body.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      body.dataset.autoCollapsed = "true";
    } else if (complete !== items.length && body.dataset.autoCollapsed) {
      body.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      delete body.dataset.autoCollapsed;
    }
  }

  function renderIncome() {
    const input = document.getElementById("incomeInput");
    if (document.activeElement !== input) input.value = state.income || "";
    const tithe = document.getElementById("titheInput");
    if (document.activeElement !== tithe) tithe.value = (state.tithePct != null ? state.tithePct : "");
    document.getElementById("titheAmount").textContent = money(totals().tithe);
  }

  function makeAllocRow(item, listKey, withDiff) {
    const nameInput = el("input", {
      class: "cell-input cell-input--name editable", type: "text", value: item.name,
      "aria-label": "Category name",
      oninput: (e) => {
        const oldName = item.name;
        commitName(e.target, state[listKey], item, listKey === "expenses" ? "Expense category" : "Savings category", () => {
          if (listKey === "expenses") {
            state.transactions.forEach((tx) => { if (tx.category === oldName) tx.category = cleanName(e.target.value); });
            renderTransactions();
          }
        });
        refreshFinancials();
      },
    });
    const budgeted = el("input", {
      class: "cell-input cell-input--num editable", type: "number", inputmode: "decimal",
      min: "0", step: "0.01", value: item.budgeted || "", placeholder: "0.00", "aria-label": "Budgeted",
      oninput: (e) => {
        const message = decimalValidation(e.target.value, "Budgeted amount");
        if (message) { setFieldError(e.target, message); return; }
        const next = Number(e.target.value);
        const current = num(item.budgeted);
        const planned = (listKey === "expenses" ? sum(state.expenses, "budgeted") : sum(state.savings, "budgeted")) - current + next;
        if (state.income > 0 && planned > state.income) {
          setFieldError(e.target, `${listKey === "expenses" ? "Expense budgets" : "Savings allocations"} cannot be larger than monthly income.`);
          return;
        }
        if (listKey === "savings") {
          const availableForSavings = Math.max(num(state.income) - totals().tithe - sum(state.expenses, "budgeted"), 0);
          if (planned > availableForSavings) {
            setFieldError(e.target, `Savings allocations cannot be larger than available income (${money(availableForSavings)} after giving and expense budgets).`);
            return;
          }
        }
        item.budgeted = next;
        setFieldError(e.target, "");
        save();
        refreshFinancials();
      },
    });
    const actual = el("input", {
      class: "cell-input cell-input--num editable", type: "number", inputmode: "decimal",
      min: "0", step: "0.01", value: item.actual || "", placeholder: "0.00", "aria-label": "Actual",
      oninput: (e) => { commitDecimal(e.target, item, "actual", "Actual amount"); },
    });
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove", "aria-label": "Remove category",
      onclick: () => {
        const txCount = listKey === "expenses" ? (state.transactions || []).filter((tx) => tx.category === item.name).length : 0;
        const detail = txCount ? ` It has ${txCount} linked transaction${txCount === 1 ? "" : "s"}; those transactions will stay in the log as uncategorised history.` : " This will update totals immediately.";
        openConfirm(`Delete ${item.name || "this category"}?`, `This will delete the ${listKey === "expenses" ? "expense" : "savings"} category and remove it from budget calculations.${detail}`, "Delete", () => {
          state[listKey] = state[listKey].filter((x) => x.id !== item.id);
          if (listKey === "expenses") {
            state.transactions.forEach((tx) => { if (tx.category === item.name) tx.category = ""; });
          }
          save(); renderAll(); notify(`${listKey === "expenses" ? "Expense" : "Savings category"} deleted`);
        });
      },
    }, ["✕"]);

    const cells = [
      el("td", { class: "col-name", "data-label": "Category" }, [nameInput]),
      el("td", { class: "col-num", "data-label": "Budgeted" }, [budgeted]),
    ];
    const logged = expenseActual(item) - num(item.actual);
    cells.push(el("td", { class: "col-num", "data-label": "Actual" }, logged > 0 ? [
      actual,
      el("span", { class: "logged-hint", text: `+ ${money(logged)} logged` }),
    ] : [actual]));
    if (withDiff) {
      const diff = num(item.budgeted) - expenseActual(item);
      cells.push(el("td", { class: "col-num cell-calc " + diffClass(diff), "data-label": "Diff" }, [money(diff)]));
    }
    cells.push(el("td", { class: "col-act", "data-label": "" }, [del]));
    return el("tr", {}, cells);
  }

  // For expenses, "under budget" (budgeted >= actual) is good.
  function diffClass(diff) { return diff < 0 ? "neg" : "pos"; }

  function renderExpenses() {
    const body = document.getElementById("expensesBody");
    body.textContent = "";
    const items = state.expenses || [];
    const hasPlannedExpense = items.some((item) => num(item.budgeted) > 0 || num(item.actual) > 0);
    if (!items.length || !hasPlannedExpense) {
      body.appendChild(el("tr", {}, [el("td", { colspan: "5", "data-label": "" }, [
        emptyState("No expense budget entered yet", "Add regular costs such as rent, transport or groceries to begin planning your monthly spending.", "Add expense", sectionAction("expensesSection", "input[aria-label='Category name']", "expenses")),
      ])]));
    }
    items.forEach((item) => body.appendChild(makeAllocRow(item, "expenses", true)));
    refreshTotals("expenses");
  }

  function renderSavings() {
    const body = document.getElementById("savingsBody");
    body.textContent = "";
    const items = state.savings || [];
    const hasSavingsAllocation = items.some((item) => num(item.budgeted) > 0 || num(item.actual) > 0);
    if (!items.length || !hasSavingsAllocation) {
      body.appendChild(el("tr", {}, [el("td", { colspan: "4", "data-label": "" }, [
        emptyState("No monthly savings allocated", "Decide how much of this month’s income you want to put aside.", "Add savings allocation", sectionAction("savingsSection", "input[aria-label='Budgeted']", "savings")),
      ])]));
    }
    items.forEach((item) => body.appendChild(makeAllocRow(item, "savings", false)));
    refreshTotals("savings");
  }

  function refreshTotals(listKey) {
    if (listKey === "expenses") {
      const b = sum(state.expenses, "budgeted");
      const txTotals = transactionTotalsByCategory();
      const a = state.expenses.reduce((total, item) => total + expenseActual(item, txTotals), 0);
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
    document.getElementById("sumPlannedCommitments").textContent = money(t.plannedCommitments);
    document.getElementById("sumTithe").textContent = money(t.tithe);
    document.getElementById("sumExpenses").textContent = money(t.actualSpending);
    document.getElementById("sumSavings").textContent = money(t.savActual);
    document.getElementById("sumRemainingBudget").textContent = money(t.remainingBudget);
    document.getElementById("sumActualCashRemaining").textContent = money(t.actualCashRemaining);
    document.getElementById("sumUnallocatedIncome").textContent = money(t.unallocatedIncome);

    const lo = document.getElementById("sumLeftover");
    lo.textContent = money(t.safeToSpend);
    const loStat = document.getElementById("leftoverStat");
    loStat.classList.remove("pos-bg", "neg-bg");
    loStat.classList.add(t.unallocatedIncome < 0 ? "neg-bg" : "pos-bg");

    const sticky = document.getElementById("stickyLeftover");
    sticky.textContent = money(t.safeToSpend);
    sticky.className = "sticky-bar__value " + (t.unallocatedIncome < 0 ? "neg" : "pos");

    renderBreakdownChart(t);
    renderGuidance(t);
    renderMoneyTrail();
    renderAdvisor();
  }

  function renderGuidance(totalsArg) {
    const banner = document.getElementById("budgetGuidance");
    if (!banner || !state) return;
    const t = totalsArg || totals();
    let tone = "info";
    let text = "";

    if (t.income <= 0) {
      text = "Add monthly income first. The app can then check expenses, savings, sinking funds and debt against what is available.";
    } else if (t.plannedCommitments > t.income) {
      tone = "warn";
      text = `Planned commitments are ${money(t.plannedCommitments - t.income)} above monthly income. Reduce budgets, savings allocations, sinking funds or debt payments until the plan fits.`;
    } else if (t.unallocatedIncome > 0.005) {
      text = `You still have ${money(t.unallocatedIncome)} unallocated. Give it a job before the month runs away with it.`;
    } else {
      tone = "good";
      text = "Every pound of income has been assigned. Your budget is set up and ready to track.";
    }

    banner.hidden = false;
    banner.className = "guidance-banner guidance-banner--" + tone;
    banner.textContent = text;
  }

  /* ---------- Donut chart: expenses vs each savings category ---------- */
  function renderBreakdownChart(t) {
    const palette = ["#b91c1c", "#9a6b4f", "#b88733", "#7a3f52", "#0e7490", "#b45309", "#6f4e37", "#4d7c0f", "#c08457"];
    const segments = [];
    if (t.tithe > 0) segments.push({ label: "Tithe / Offering", value: t.tithe, color: "#7a3f52" });
    if (t.expActual > 0) segments.push({ label: "Expenses", value: t.expActual, color: "#b91c1c" });
    state.savings.forEach((s, i) => {
      if (num(s.actual) > 0) segments.push({ label: s.name || "Savings", value: num(s.actual), color: palette[(i + 1) % palette.length] });
    });
    const leftover = t.leftover;
    if (leftover > 0) segments.push({ label: "Left over", value: leftover, color: "#d8c9b6" });

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

  function renderScripture() {
    const i = activeProfile === "ayo" ? 1 : Math.abs(new Date().getDate() - 1) % SCRIPTURES.length;
    const verse = SCRIPTURES[i];
    document.getElementById("scriptureQuote").textContent = verse.text;
    document.getElementById("scriptureRef").textContent = verse.ref;
  }

  function renderMoneyTrail() {
    const insights = document.getElementById("moneyInsights");
    const trail = document.getElementById("trailList");
    if (!insights || !trail || !state) return;
    insights.textContent = "";
    trail.textContent = "";

    const t = totals();
    const expenseRows = state.expenses
      .map((e) => {
        const actual = expenseActual(e);
        return { name: e.name || "Unnamed", budgeted: num(e.budgeted), actual, diff: num(e.budgeted) - actual };
      })
      .filter((e) => e.actual > 0 || e.budgeted > 0)
      .sort((a, b) => b.actual - a.actual);
    const biggest = expenseRows[0];
    const over = expenseRows.filter((e) => e.diff < 0).sort((a, b) => a.diff - b.diff)[0];
    const trackedSpend = sum(state.transactions || [], "amount");
    const committed = t.tithe + t.expActual + t.savActual;

    [
      { label: "Committed", value: money(committed), tone: committed <= t.income ? "good" : "bad" },
      { label: "Logged purchases", value: money(trackedSpend), tone: trackedSpend > 0 ? "ink" : "muted" },
      { label: "Biggest category", value: biggest ? biggest.name : "None yet", tone: "gold" },
      { label: "Needs attention", value: over ? `${over.name} ${money(Math.abs(over.diff))} over` : "All within budget", tone: over ? "bad" : "good" },
    ].forEach((item) => {
      insights.appendChild(el("div", { class: "money-chip money-chip--" + item.tone }, [
        el("span", { class: "money-chip__label", text: item.label }),
        el("span", { class: "money-chip__value", text: item.value }),
      ]));
    });

    if (!expenseRows.length) {
      trail.appendChild(emptyState("Insights need spending data", "Add expense categories or record purchases before spending insights can be produced.", "Record spending", sectionAction("transactionsSection", "input[aria-label='Amount']", "transactions")));
      return;
    }

    const maxActual = Math.max(...expenseRows.map((e) => e.actual), 1);
    expenseRows.forEach((e) => {
      const pctIncome = t.income > 0 ? (e.actual / t.income) * 100 : 0;
      const pctWidth = Math.min((e.actual / maxActual) * 100, 100);
      trail.appendChild(el("div", { class: "trail-row" }, [
        el("div", { class: "trail-row__top" }, [
          el("span", { class: "trail-row__name", text: e.name }),
          el("span", { class: "trail-row__amount", text: `${money(e.actual)} · ${Math.round(pctIncome)}% income` }),
        ]),
        el("div", { class: "trail-row__bar" }, [el("span", { style: `width:${pctWidth}%` })]),
        el("div", { class: "trail-row__meta " + (e.diff < 0 ? "neg" : "pos"), text: e.diff < 0 ? `${money(Math.abs(e.diff))} over plan` : `${money(e.diff)} left in plan` }),
      ]));
    });
  }

  function renderTransactions() {
    const body = document.getElementById("transactionsBody");
    if (!body) return;
    body.textContent = "";
    const items = state.transactions || [];
    const hasRecordedSpending = items.some((tx) => num(tx.amount) > 0);
    if (!items.length || !hasRecordedSpending) {
      body.appendChild(el("tr", {}, [el("td", { colspan: "5", "data-label": "" }, [
        emptyState("No spending recorded", "Record purchases to compare your actual spending against your budget.", "Record spending", sectionAction("transactionsSection", "input[aria-label='Amount']", "transactions")),
      ])]));
    }
    items.forEach((tx) => body.appendChild(makeTransactionRow(tx)));
    refreshTotals("expenses");
  }

  function makeTransactionRow(tx) {
    const date = el("input", {
      class: "cell-input editable", type: "date", value: tx.date || todayISO(), "aria-label": "Date",
      oninput: (e) => {
        const message = e.target.value && !Number.isNaN(new Date(e.target.value).getTime()) ? "" : "Transaction date is required.";
        setFieldError(e.target, message);
        if (message) return;
        tx.date = e.target.value; save();
      },
    });
    const category = el("select", {
      class: "cell-input editable", "aria-label": "Category",
      onchange: (e) => { tx.category = e.target.value; save(); renderTransactions(); renderExpenses(); renderSummary(); },
    }, categoryOptions(tx.category));
    category.value = tx.category || (state.expenses[0] && state.expenses[0].name) || "";
    const note = el("input", {
      class: "cell-input editable", type: "text", value: tx.note || "", placeholder: "What was it?", "aria-label": "Note",
      oninput: (e) => { tx.note = e.target.value; save(); },
    });
    const amount = el("input", {
      class: "cell-input cell-input--num editable", type: "number", inputmode: "decimal",
      min: "0", step: "0.01", value: tx.amount || "", placeholder: "0.00", "aria-label": "Amount",
      oninput: (e) => { commitDecimal(e.target, tx, "amount", "Transaction amount", {}, () => { renderTransactions(); renderExpenses(); }); },
    });
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove spend", "aria-label": "Remove spend",
      onclick: () => {
        openConfirm("Delete transaction?", `This will delete ${money(tx.amount)} from ${tx.category || "uncategorised spending"} and update actual spending immediately.`, "Delete", () => {
          state.transactions = state.transactions.filter((x) => x.id !== tx.id);
          save(); renderTransactions(); renderExpenses(); renderSummary(); notify("Transaction deleted");
        });
      },
    }, ["✕"]);
    return el("tr", {}, [
      el("td", { class: "col-date", "data-label": "Date" }, [date]),
      el("td", { class: "col-name", "data-label": "Category" }, [category]),
      el("td", { class: "col-name", "data-label": "Note" }, [note]),
      el("td", { class: "col-num", "data-label": "Amount" }, [amount]),
      el("td", { class: "col-act", "data-label": "" }, [del]),
    ]);
  }

  function categoryOptions(current) {
    const names = state.expenses.map((exp) => exp.name).filter(Boolean);
    if (current && !names.includes(current)) names.unshift(current);
    return [el("option", { value: "", text: "Uncategorised" })].concat(names.map((name) => el("option", { value: name, text: name })));
  }

  /* ---------- Goals ---------- */
  function renderGoals() {
    const container = document.getElementById("goalsList");
    container.textContent = "";
    const items = state.goals || [];
    const hasGoalProgress = items.some((g) => num(g.target) > 0 || num(g.current) > 0 || num(g.monthly) > 0);
    if (!items.length || !hasGoalProgress) {
      container.appendChild(emptyState("No savings goal targets yet", "Create a target for something you are working towards, such as an emergency fund or house deposit.", "Create savings goal", sectionAction("goalsSection", "input[aria-label='Goal name']", "goals")));
    }
    items.forEach((g) => container.appendChild(makeGoalCard(g)));
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
      oninput: (e) => {
        commitName(e.target, state.goals, g, "Savings goal", () => { renderAdvisor(); });
      },
    });
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove goal", "aria-label": "Remove goal",
      onclick: () => {
        openConfirm(`Delete ${g.name || "this savings goal"}?`, "This will remove the goal, its target, current saved amount, monthly contribution, and progress calculation.", "Delete", () => {
          state.goals = state.goals.filter((x) => x.id !== g.id);
          save(); renderGoals(); renderAdvisor(); notify("Savings goal deleted");
        });
      },
    }, ["✕"]);

    function moneyField(label, key) {
      return el("label", { class: "goal__field" }, [
        el("span", { text: label }),
        el("span", { class: "input-money" }, [
          el("span", { class: "input-money__symbol", text: "£" }),
          el("input", {
            class: "input input--money editable", type: "number", inputmode: "decimal",
            min: "0", step: "0.01", value: g[key] || "", placeholder: "0.00", "aria-label": label,
            oninput: (e) => {
              const message = decimalValidation(e.target.value, label);
              if (message) { setFieldError(e.target, message); return; }
              const next = Number(e.target.value);
              if (key === "current" && num(g.target) > 0 && next > num(g.target)) {
                setFieldError(e.target, "Current saved cannot be higher than the target.");
                return;
              }
              if (key === "target" && next > 0 && num(g.current) > next) {
                setFieldError(e.target, "Target cannot be lower than the amount already saved.");
                return;
              }
              g[key] = next;
              setFieldError(e.target, "");
              save(); refreshGoalCard(g, card); renderAdvisor(); renderSummary();
            },
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
    const items = state.debts || [];
    if (!items.length) {
      body.appendChild(el("tr", {}, [el("td", { colspan: "6", "data-label": "" }, [
        emptyState("No debts being tracked", "Add a debt to calculate repayment progress and include payments in your monthly plan.", "Add debt", sectionAction("debtSection", "input[aria-label='Debt name']", "debts")),
      ])]));
    }
    items.forEach((d) => body.appendChild(makeDebtRow(d)));
  }

  function makeDebtRow(d) {
    function input(key, opts) {
      return el("input", Object.assign({
        class: "cell-input editable", value: d[key] || "",
        oninput: (e) => {
          if (opts.text) {
            const name = cleanName(e.target.value);
            setFieldError(e.target, name ? "" : "Debt name is required.");
            if (!name) return;
            d[key] = name;
          } else {
            const message = decimalValidation(e.target.value, opts.label || "Amount", { max: key === "apr" ? 100 : 999999999 });
            if (message) { setFieldError(e.target, message); return; }
            const next = Number(e.target.value);
            if (key === "payment" && num(d.balance) > 0 && next > num(d.balance)) {
              setFieldError(e.target, "Monthly payment cannot be higher than the outstanding balance.");
              return;
            }
            if (key === "balance" && next === 0) d.payment = 0;
            if (key === "balance" && num(d.payment) > next) {
              setFieldError(e.target, "Balance cannot be lower than the monthly payment already entered.");
              return;
            }
            d[key] = next;
            setFieldError(e.target, "");
          }
          save();
          payoffCell.textContent = payoffText(d);
          payoffCell.className = "col-num cell-calc " + payoffClass(d);
          renderAdvisor();
          if (key === "balance" && num(d.balance) === 0) renderDebts();
        },
      }, opts.attrs));
    }
    const name = input("name", { text: true, attrs: { type: "text", class: "cell-input cell-input--name editable", placeholder: "Card / loan", "aria-label": "Debt name" } });
    const balance = input("balance", { label: "Balance", attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.01", class: "cell-input cell-input--num editable", placeholder: "0.00", "aria-label": "Balance" } });
    const apr = input("apr", { label: "APR", attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.1", class: "cell-input cell-input--num editable", placeholder: "0", "aria-label": "APR" } });
    const payment = input("payment", { label: "Monthly payment", attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.01", class: "cell-input cell-input--num editable", placeholder: "0.00", "aria-label": "Monthly payment" } });

    const payoffCell = el("td", { class: "col-num cell-calc " + payoffClass(d), "data-label": "Payoff" }, [payoffText(d)]);
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove debt", "aria-label": "Remove debt",
      onclick: () => {
        openConfirm(`Delete ${d.name || "this debt"}?`, `This will remove the ${money(d.balance)} balance and its payoff calculation from the debt tracker.`, "Delete", () => {
          state.debts = state.debts.filter((x) => x.id !== d.id);
          save(); renderDebts(); renderAdvisor(); notify("Debt deleted");
        });
      },
    }, ["✕"]);

    return el("tr", {}, [
      el("td", { class: "col-name", "data-label": "Debt" }, [name]),
      el("td", { class: "col-num", "data-label": "Balance" }, [balance]),
      el("td", { class: "col-num", "data-label": "APR %" }, [apr]),
      el("td", { class: "col-num", "data-label": "Monthly" }, [payment]),
      payoffCell,
      el("td", { class: "col-act", "data-label": "" }, [del]),
    ]);
  }

  function payoffText(d) {
    const m = debtMonths(d.balance, d.apr, d.payment);
    if (m == null) return "—";
    if (m === 0) return "Cleared";
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

  /* ---------- Sinking funds (upcoming one-off costs) ---------- */
  function sinkingMonthly(f) {
    const remaining = Math.max(num(f.cost) - num(f.saved), 0);
    if (remaining <= 0) return 0;
    // If saving hasn't started yet (a future "from" month), nothing this month.
    if (f.start && monthsUntilRaw(f.start) > 0) return 0;
    return remaining / monthsUntil(f.date);
  }

  function updateSinkingTotals(refreshAdvisor = true) {
    const totalEl = document.getElementById("sinkingMonthlyTotal");
    if (totalEl) totalEl.textContent = money(state.sinkingFunds.reduce((tt, f) => tt + sinkingMonthly(f), 0));
    if (refreshAdvisor) renderAdvisor();
  }

  function renderSinking() {
    const body = document.getElementById("sinkingBody");
    body.textContent = "";
    const items = state.sinkingFunds || [];
    if (!items.length) {
      body.appendChild(el("tr", {}, [el("td", { colspan: "7", "data-label": "" }, [
        emptyState("No upcoming costs planned", "Prepare for known future expenses by saving towards them gradually.", "Add upcoming cost", sectionAction("sinkingSection", "input[aria-label='Total cost']", "sinking")),
      ])]));
    }
    items.forEach((f) => body.appendChild(makeSinkingRow(f)));
    updateSinkingTotals();
  }

  function makeSinkingRow(f) {
    const monthlyCell = el("td", { class: "col-num cell-calc", "data-label": "/ month" }, [money(sinkingMonthly(f))]);
    const onEdit = () => {
      save();
      monthlyCell.textContent = money(sinkingMonthly(f));
      updateSinkingTotals();
    };
    const name = el("input", {
      class: "cell-input cell-input--name editable", type: "text", value: f.name,
      placeholder: "Car insurance", "aria-label": "Fund name",
      oninput: (e) => { commitName(e.target, state.sinkingFunds, f, "Sinking fund"); },
    });
    const cost = el("input", {
      class: "cell-input cell-input--num editable", type: "number", inputmode: "decimal",
      min: "0", step: "0.01", value: f.cost || "", placeholder: "0.00", "aria-label": "Total cost",
      oninput: (e) => { commitDecimal(e.target, f, "cost", "Total cost", {}, onEdit); },
    });
    const saved = el("input", {
      class: "cell-input cell-input--num editable", type: "number", inputmode: "decimal",
      min: "0", step: "0.01", value: f.saved || "", placeholder: "0.00", "aria-label": "Saved so far",
      oninput: (e) => {
        const message = decimalValidation(e.target.value, "Saved so far");
        if (message) { setFieldError(e.target, message); return; }
        const next = Number(e.target.value);
        if (num(f.cost) > 0 && next > num(f.cost)) {
          setFieldError(e.target, "Saved so far cannot be higher than the total cost.");
          return;
        }
        f.saved = next; setFieldError(e.target, ""); onEdit();
      },
    });
    const start = el("input", {
      class: "cell-input editable", type: "month", value: f.start || "", "aria-label": "Start saving from", title: "Optional starting month",
      oninput: (e) => {
        const message = monthValidation(e.target.value, "Start month", { required: false, allowPast: true });
        if (message) { setFieldError(e.target, message); return; }
        if (f.date && e.target.value && e.target.value > f.date) {
          setFieldError(e.target, "Start month cannot be after the target month.");
          return;
        }
        f.start = e.target.value; setFieldError(e.target, ""); onEdit();
      },
    });
    const date = el("input", {
      class: "cell-input editable", type: "month", value: f.date || "", "aria-label": "Needed by", title: "Target month",
      oninput: (e) => {
        const message = monthValidation(e.target.value, "Target month", { required: true, allowPast: false });
        if (message) { setFieldError(e.target, message); return; }
        if (f.start && f.start > e.target.value) {
          setFieldError(e.target, "Target month cannot be before the start month.");
          return;
        }
        f.date = e.target.value; setFieldError(e.target, ""); onEdit();
      },
    });
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Remove fund", "aria-label": "Remove fund",
      onclick: () => {
        openConfirm(`Delete ${f.name || "this sinking fund"}?`, `This will remove its ${money(sinkingMonthly(f))} monthly set-aside from planned commitments.`, "Delete", () => {
          state.sinkingFunds = state.sinkingFunds.filter((x) => x.id !== f.id);
          save(); renderSinking(); renderSummary(); notify("Sinking fund deleted");
        });
      },
    }, ["✕"]);
    return el("tr", {}, [
      el("td", { class: "col-name", "data-label": "Fund" }, [name]),
      el("td", { class: "col-num", "data-label": "Total cost" }, [cost]),
      el("td", { class: "col-num", "data-label": "Saved" }, [saved]),
      el("td", { class: "col-num", "data-label": "From" }, [start]),
      el("td", { class: "col-num", "data-label": "By" }, [date]),
      monthlyCell,
      el("td", { class: "col-act", "data-label": "" }, [del]),
    ]);
  }

  /* ---------- Advisor: this month's plan ---------- */
  function findEmergencyGoal() {
    return state.goals.find((g) => /emergency/i.test(g.name || ""));
  }

  function sinkingSub() {
    const names = state.sinkingFunds.filter((f) => sinkingMonthly(f) > 0).map((f) => f.name || "fund");
    if (!names.length) return "upcoming one-off costs";
    return names.slice(0, 2).join(", ") + (names.length > 2 ? " +" + (names.length - 2) : "");
  }

  function renderAdvisor() {
    const statusEl = document.getElementById("planStatus");
    const listEl = document.getElementById("planList");
    const learnEl = document.getElementById("planLearn");
    if (!statusEl || !listEl) return;
    listEl.textContent = "";

    const bufferInput = document.getElementById("bufferInput");
    if (bufferInput && document.activeElement !== bufferInput) {
      bufferInput.value = state.emergencyMonths != null ? state.emergencyMonths : 3;
    }
    const savingsTargetInput = document.getElementById("savingsTargetInput");
    if (savingsTargetInput && document.activeElement !== savingsTargetInput) {
      savingsTargetInput.value = state.monthlySavingsTarget != null ? state.monthlySavingsTarget : "";
    }

    const t = totals();
    const income = t.income;
    const tithe = t.tithe;

    // Essentials estimate — from budget, tuned by history when available.
    const needsBudget = sum(state.expenses, "budgeted");
    const histExp = state.history.map((h) => num(h.expenses)).filter((x) => x > 0);
    const avgActual = avg(histExp);
    const needs = needsBudget > 0 ? needsBudget : avgActual;

    const emergencyMonths = num(state.emergencyMonths) || 3;
    const emg = findEmergencyGoal();
    const emgCurrent = emg ? num(emg.current) : 0;
    const emergencyTarget = Math.max(needs * emergencyMonths, emg ? num(emg.target) : 0);

    const savingsTarget = num(state.monthlySavingsTarget);
    const sinkReq = state.sinkingFunds.reduce((a, f) => a + sinkingMonthly(f), 0);

    // Debts, most expensive first — that's the order we attack them.
    const debts = state.debts
      .filter((d) => num(d.balance) > 0)
      .slice()
      .sort((a, b) => num(b.apr) - num(a.apr));
    const totalOwed = debts.reduce((a, d) => a + num(d.balance), 0);
    const debtTarget = debts.length ? (debts[0].name || "your debt") : "";

    // Waterfall: tithe -> essentials -> trip -> monthly savings -> debt blitz -> free.
    let rem = income;
    const titheAlloc = Math.min(rem, tithe); rem -= titheAlloc;
    const needsAlloc = Math.min(rem, needs); rem -= needsAlloc;
    const sinkAlloc = Math.min(rem, sinkReq); rem -= sinkAlloc;
    const savingsAlloc = Math.min(rem, savingsTarget); rem -= savingsAlloc;
    const debtAlloc = Math.min(rem, totalOwed); rem -= debtAlloc;
    const investAlloc = Math.max(rem, 0);

    const needsShort = needs - needsAlloc;
    const sinkShort = sinkReq - sinkAlloc;
    const savingsShort = savingsTarget - savingsAlloc;
    const debtMonthsLeft = debtAlloc > 0.005 ? Math.ceil(totalOwed / debtAlloc) : 0;

    const rows = [
      { label: "Tithe / Offering", sub: num(state.tithePct) + "% of income (flexible)", amount: titheAlloc, color: "#7a3f52", show: tithe > 0 },
      { label: "Essentials (needs)", sub: "bills + allowances", amount: needsAlloc, color: "#b91c1c", show: needs > 0 },
      { label: "Trip & sinking funds", sub: sinkingSub(), amount: sinkAlloc, color: "#b45309", show: sinkReq > 0 },
      { label: "Monthly savings", sub: emergencyTarget > 0 ? `into your pot · ${money(emgCurrent)} of ${money(emergencyTarget)} buffer` : "into your savings pot", amount: savingsAlloc, color: "#4d7c0f", show: savingsTarget > 0 },
      { label: "Debt payoff", sub: debtTarget ? `${debtTarget} first · ${money(totalOwed)} left` : "all clear", amount: debtAlloc, color: "#dc2626", show: totalOwed > 0 },
      { label: "Free / investing", sub: "spare to grow", amount: investAlloc, color: "#9a6b4f", show: income > 0 },
    ];

    rows.filter((r) => r.show).forEach((r) => {
      listEl.appendChild(el("li", { class: "plan-row" }, [
        el("span", { class: "plan-row__dot", style: `background:${r.color}` }),
        el("span", { class: "plan-row__label" }, [r.label, el("span", { class: "plan-row__sub", text: r.sub })]),
        el("span", { class: "plan-row__amt", text: money(r.amount) }),
      ]));
    });
    if (income > 0) {
      listEl.appendChild(el("li", { class: "plan-row plan-row--total" }, [
        el("span", { class: "plan-row__dot", style: "background:transparent" }),
        el("span", { class: "plan-row__label", text: "Total (income)" }),
        el("span", { class: "plan-row__amt", text: money(income) }),
      ]));
    }

    let status;
    if (income <= 0) status = { type: "idle", text: "Enter your monthly income above to see your personalised plan." };
    else if (needsShort > 0.005) status = { type: "warn", text: `⚠️ You're ${money(needsShort)} short on essentials after tithe. Trim spending or lower the tithe % temporarily — don't skip rent.` };
    else if (sinkShort > 0.005) status = { type: "warn", text: `⚠️ Essentials are covered, but you're ${money(sinkShort)}/mo short to hit your trip date. Push it back or free up cash.` };
    else if (savingsShort > 0.005) status = { type: "warn", text: `⚠️ Essentials are safe, but only ${money(savingsAlloc)} of your ${money(savingsTarget)} savings target fits this month.` };
    else if (totalOwed > 0) status = { type: "ok", text: `✅ Covered, ${money(savingsAlloc)} saved, and ${money(debtAlloc)} clears debt (${debtTarget} first) — debt-free in ~${debtMonthsLeft} month${debtMonthsLeft === 1 ? "" : "s"} at this pace.` };
    else if (investAlloc > 0.005) status = { type: "ok", text: `✅ Debt-free and covered — ${money(investAlloc)} is free to invest or grow this month.` };
    else status = { type: "ok", text: "✅ Every pound has a job and your essentials are safe this month." };
    statusEl.className = "plan-status " + status.type;
    statusEl.textContent = status.text;

    if (histExp.length >= 1) {
      learnEl.textContent = `Learning from ${histExp.length} saved month${histExp.length === 1 ? "" : "s"}: your essentials have averaged ${money(avgActual)}${needsBudget > 0 ? ` vs your ${money(needsBudget)} budget` : ""}.`;
    } else {
      learnEl.textContent = "";
    }
  }

  /* ---------- History ---------- */
  function renderHistory() {
    const body = document.getElementById("historyBody");
    const empty = document.getElementById("historyEmpty");
    body.textContent = "";
    empty.textContent = "";
    if (!state.history.length) {
      empty.style.display = "block";
      empty.appendChild(emptyState(
        "No monthly history yet",
        "Save a monthly snapshot when you are ready to compare income, spending and savings over time.",
        num(state.income) > 0 ? "Save current month" : "",
        saveSnapshot
      ));
    } else {
      empty.style.display = "none";
    }

    state.history.forEach((h) => {
      const del = el("button", {
        class: "btn btn--icon", type: "button", title: "Delete snapshot", "aria-label": "Delete snapshot",
        onclick: () => {
          openConfirm(`Delete ${h.label} snapshot?`, "This will remove this saved month from the history chart and trend table.", "Delete", () => {
            state.history = state.history.filter((x) => x.id !== h.id);
            save(); renderHistory(); renderAdvisor(); notify("Snapshot deleted");
          });
        },
      }, ["✕"]);
      body.appendChild(el("tr", {}, [
        el("td", { class: "col-name", "data-label": "Month", text: h.label }),
        el("td", { class: "col-num cell-calc", "data-label": "Income", text: money(h.income) }),
        el("td", { class: "col-num cell-calc", "data-label": "Expenses", text: money(h.expenses) }),
        el("td", { class: "col-num cell-calc", "data-label": "Savings", text: money(h.savings) }),
        el("td", { class: "col-num cell-calc " + (h.leftover < 0 ? "neg" : "pos"), "data-label": "Left over", text: money(h.leftover) }),
        el("td", { class: "col-act", "data-label": "" }, [del]),
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
      state[listKey].push({ id: uid(), name: uniqueName(state[listKey], "New category"), budgeted: 0, actual: 0 });
      save(); (listKey === "expenses" ? renderExpenses : renderSavings)(); renderSummary();
      notify(listKey === "expenses" ? "Expense added" : "Savings category added");
    } else if (listKey === "goals") {
      state.goals.push({ id: uid(), name: uniqueName(state.goals, "New goal"), target: 0, current: 0, monthly: 0 });
      save(); renderGoals(); notify("Savings goal added");
    } else if (listKey === "debts") {
      state.debts.push({ id: uid(), name: uniqueName(state.debts, "New debt"), balance: 0, apr: 0, payment: 0 });
      save(); renderDebts(); notify("Debt added");
    } else if (listKey === "sinking") {
      state.sinkingFunds.push({ id: uid(), name: uniqueName(state.sinkingFunds, "New fund"), cost: 0, saved: 0, start: "", date: nextMonthISO() });
      save(); renderSinking(); renderSummary(); notify("Sinking fund added");
    } else if (listKey === "transactions") {
      state.transactions.push({
        id: uid(),
        date: todayISO(),
        category: (state.expenses[0] && state.expenses[0].name) || "",
        note: "",
        amount: 0,
      });
      save(); renderTransactions(); renderSummary(); notify("Transaction added");
    }
    renderOnboarding();
  }

  function saveSnapshot() {
    const t = totals();
    const label = new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const snap = {
      id: uid(), label,
      income: t.income, tithe: t.tithe, expenses: t.expActual, savings: t.savActual, leftover: t.leftover,
    };
    // Replace an existing snapshot with the same label (same month) rather than duplicating.
    const existing = state.history.findIndex((h) => h.label === label);
    if (existing >= 0) state.history[existing] = snap;
    else state.history.push(snap);
    save();
    renderHistory();
    renderOnboarding();
    notify("Budget snapshot saved");
  }

  function resetAll() {
    openConfirm(`Reset ${PROFILES[activeProfile].label}'s data?`, "This will restore this profile to the default budget and delete its current categories, goals, transactions, debts, sinking funds, and history.", "Reset", () => {
      state = defaultsFor(activeProfile);
      save();
      renderAll();
      notify("Budget reset");
    });
  }

  /* ---------- Wiring ---------- */
  document.getElementById("incomeInput").addEventListener("input", (e) => {
    const message = decimalValidation(e.target.value, "Monthly income");
    if (message) { setFieldError(e.target, message); return; }
    const next = Number(e.target.value);
    const existingCommitments = totals().tithe + sum(state.expenses, "budgeted") + sum(state.savings, "budgeted") + state.sinkingFunds.reduce((total, f) => total + sinkingMonthly(f), 0);
    const currentTithe = state.income * (num(state.tithePct) / 100);
    const projectedCommitments = existingCommitments - currentTithe + (next * (num(state.tithePct) / 100));
    if (next > 0 && projectedCommitments > next) {
      setFieldError(e.target, `Monthly income cannot be lower than planned commitments (${money(projectedCommitments)}).`);
      return;
    }
    state.income = next;
    setFieldError(e.target, "");
    save(); renderOnboarding(); renderIncome(); renderSummary();
  });
  document.getElementById("titheInput").addEventListener("input", (e) => {
    const message = decimalValidation(e.target.value, "Tithe percentage", { max: 100 });
    if (message) { setFieldError(e.target, message); return; }
    state.tithePct = Number(e.target.value);
    setFieldError(e.target, "");
    save(); renderOnboarding(); renderIncome(); renderSummary();
  });
  document.getElementById("bufferInput").addEventListener("input", (e) => {
    const message = decimalValidation(e.target.value, "Safety buffer", { max: 12 });
    if (message) { setFieldError(e.target, message); return; }
    state.emergencyMonths = Number(e.target.value); setFieldError(e.target, ""); save(); renderAdvisor();
  });
  document.getElementById("savingsTargetInput").addEventListener("input", (e) => {
    const message = decimalValidation(e.target.value, "Monthly savings target");
    if (message) { setFieldError(e.target, message); return; }
    const next = Number(e.target.value);
    const available = Math.max(num(state.income) - totals().tithe - sum(state.expenses, "budgeted"), 0);
    if (next > available) {
      setFieldError(e.target, `Monthly savings target cannot exceed available income (${money(available)}).`);
      return;
    }
    state.monthlySavingsTarget = next; setFieldError(e.target, ""); save(); renderAdvisor(); renderSummary();
  });
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => addRow(btn.getAttribute("data-add")));
  });
  document.querySelectorAll(".section-nav a").forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetId = link.getAttribute("href").slice(1);
      const target = document.getElementById(targetId);
      if (!target) return;
      e.preventDefault();
      scrollToSection(targetId, "h2");
    });
  });
  document.getElementById("setupBudgetBtn").addEventListener("click", () => {
    scrollToSection("incomeSection", "#incomeInput");
  });
  document.getElementById("checklistToggle").addEventListener("click", () => {
    const body = document.getElementById("gettingStartedBody");
    const toggle = document.getElementById("checklistToggle");
    const nextHidden = !body.hidden;
    body.hidden = nextHidden;
    toggle.setAttribute("aria-expanded", String(!nextHidden));
  });
  document.getElementById("saveSnapshotBtn").addEventListener("click", saveSnapshot);
  document.getElementById("resetBtn").addEventListener("click", resetAll);
  document.getElementById("authForm").addEventListener("submit", submitLogin);
  document.getElementById("authBackBtn").addEventListener("click", () => {
    pendingProfile = "";
    document.getElementById("authForm").hidden = true;
  });
  document.querySelectorAll("[data-profile-login]").forEach((btn) => {
    btn.addEventListener("click", () => startLogin(btn.getAttribute("data-profile-login")));
  });
  document.getElementById("profileSwitchBtn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_PROFILE_KEY);
    activeProfile = "";
    state = null;
    showAuth();
  });
  document.getElementById("lockBtn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_PROFILE_KEY);
    activeProfile = "";
    state = null;
    showAuth();
  });
  document.getElementById("confirmCancelBtn").addEventListener("click", closeConfirm);
  document.getElementById("confirmModal").addEventListener("click", (e) => {
    if (e.target.id === "confirmModal") closeConfirm();
  });
  document.getElementById("confirmOkBtn").addEventListener("click", () => {
    const action = pendingConfirm;
    closeConfirm();
    if (action) action();
  });

  if (activeProfile && root.profiles && root.profiles[activeProfile] && root.profiles[activeProfile].passHash) {
    showApp(activeProfile);
  } else {
    showAuth();
  }
})();
