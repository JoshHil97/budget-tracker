/* Personal Budget & Savings Goals — vanilla JS, localStorage persistence.
   All currency GBP (£). No external dependencies. */
(function () {
  "use strict";

  const STORAGE_KEY = "budget-savings-app.v1";
  const ROOT_KEY = "budget-savings-app.profiles.v2";
  const SESSION_PROFILE_KEY = "budget-savings-app.activeProfile";
  const DATA_VERSION = 3;
  const APP_VERSION = "1.0.0";
  const RELEASE_DATE = "21 July 2026";
  const BACKUP_FORMAT = "budget-tracker-backup";
  const BACKUP_FORMAT_VERSION = 1;
  const RECOVERY_KEY = "budget-savings-app.recovery.latest";
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // Local budget files should be small; reject huge files before parsing to protect the browser.

  /* ---------- Defaults ---------- */
  // Neutral starter template. No personal data lives in the code — real
  // figures are entered by the user and kept only in their own browser.
  const DEFAULT_STATE = {
    income: 0,
    expenses: [
      { name: "Rent / Mortgage", budgeted: 0 },
      { name: "Transport", budgeted: 0 },
      { name: "Phone", budgeted: 0 },
      { name: "Internet / WiFi", budgeted: 0 },
      { name: "Groceries", budgeted: 0 },
      { name: "Subscriptions", budgeted: 0 },
      { name: "Personal care", budgeted: 0 },
      { name: "Personal allowance", budgeted: 0 },
    ].map((e) => ({ id: uid(), name: e.name, budgeted: e.budgeted, actual: 0 })),
    savings: [
      { name: "Emergency / High-Yield pot", budgeted: 0 },
      { name: "House Down Payment Fund", budgeted: 0 },
      { name: "Investing", budgeted: 0 },
    ].map((s) => ({ id: uid(), name: s.name, budgeted: s.budgeted, actual: 0 })),
    goals: [
      { name: "Emergency Fund", target: 0, current: 0, monthly: 0 },
      { name: "House Down Payment", target: 0, current: 0, monthly: 0 },
    ].map((g) => Object.assign({ id: uid() }, g)),
    debts: [],
    tithePct: 10,
    emergencyMonths: 3,
    monthlySavingsTarget: 0,
    sinkingFunds: [],
    transactions: [],
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
  function currentMonthId() { return todayISO().slice(0, 7); }
  function monthIdFromOffset(baseMonth, offset) {
    const [y, m] = String(baseMonth || currentMonthId()).split("-").map((x) => parseInt(x, 10));
    const d = new Date(y || new Date().getFullYear(), (m || 1) - 1, 1);
    d.setMonth(d.getMonth() + offset);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function validMonthId(monthId) { return /^\d{4}-\d{2}$/.test(String(monthId || "")); }
  function monthLabel(monthId, opts) {
    if (!validMonthId(monthId)) return "this month";
    const [y, m] = monthId.split("-").map((x) => parseInt(x, 10));
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", Object.assign({ month: "long", year: "numeric" }, opts || {}));
  }

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
  const CURRENCY_TOLERANCE = 0.005;
  function money(n) { return gbp.format(isFinite(n) ? n : 0); }
  function pct(n) { return `${Math.round(isFinite(n) ? n : 0)}%`; }

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
  let modalFocusReturn = null;

  function modalFocusable(modal) {
    return Array.from(modal.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      .filter((node) => !node.disabled && node.offsetParent !== null);
  }

  function openManagedModal(modalId, focusId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modalFocusReturn = document.activeElement;
    modal.hidden = false;
    const focusTarget = focusId ? document.getElementById(focusId) : modalFocusable(modal)[0];
    if (focusTarget) focusTarget.focus();
  }

  function closeManagedModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = true;
    const target = modalFocusReturn;
    modalFocusReturn = null;
    if (target && document.contains(target) && typeof target.focus === "function") {
      window.setTimeout(() => target.focus({ preventScroll: true }), 0);
    }
  }

  function visibleModal() {
    return ["dataModal", "rolloverModal", "confirmModal"]
      .map((id) => document.getElementById(id))
      .find((modal) => modal && !modal.hidden);
  }

  function closeVisibleModal(modal) {
    if (!modal) return;
    if (modal.id === "dataModal") closeDataModal();
    else if (modal.id === "rolloverModal") closeRollover();
    else closeConfirm();
  }

  function handleModalKeydown(e) {
    const modal = visibleModal();
    if (!modal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeVisibleModal(modal);
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = modalFocusable(modal);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function buttonVariantFor(label) {
    const text = cleanName(label).toLowerCase();
    if (/\b(delete|remove|reset|replace)\b/.test(text)) return "btn btn--danger";
    if (/\b(cancel|close)\b/.test(text)) return "btn";
    return "btn btn--primary";
  }

  function setActionButton(button, label) {
    button.textContent = label || "Confirm";
    button.className = buttonVariantFor(button.textContent);
  }

  function runButtonAction(button, busyText, action) {
    if (!button || button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (busyText) button.textContent = busyText;
    Promise.resolve()
      .then(action)
      .catch((e) => {
        setDataStatus(e.message || "The action could not be completed. Please try again.", "neg");
        notify("Action failed", "bad");
      })
      .finally(() => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = label;
      });
  }

  function openConfirm(title, body, actionLabel, onConfirm) {
    pendingConfirm = onConfirm;
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmBody").textContent = body;
    setActionButton(document.getElementById("confirmOkBtn"), actionLabel || "Delete");
    openManagedModal("confirmModal", "confirmCancelBtn");
  }

  function closeConfirm() {
    pendingConfirm = null;
    closeManagedModal("confirmModal");
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
  let activeMonth = "";
  let state = null;
  const viewPrefs = {
    goals: { sort: "completion", filter: "active" },
    sinking: { sort: "target", filter: "active" },
    debts: { sort: "balance", filter: "active" },
    analytics: { view: "spending", budgetSort: "actual", savingsFilter: "active", showZeroSpend: false },
  };

  function defaultsFor(profileId) {
    return structuredClone(profileId === "ayo" ? AYO_DEFAULT_STATE : DEFAULT_STATE);
  }

  function blankMonthFor(profileId, monthId, sourceState) {
    const base = defaultsFor(profileId);
    const source = sourceState || base;
    return {
      monthId,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      income: 0,
      incomeEntries: [],
      expenses: [],
      savings: [],
      goals: structuredClone(source.goals || base.goals || []),
      debts: structuredClone(source.debts || base.debts || []),
      tithePct: source.tithePct != null ? source.tithePct : base.tithePct,
      emergencyMonths: source.emergencyMonths != null ? source.emergencyMonths : base.emergencyMonths,
      monthlySavingsTarget: 0,
      sinkingFunds: structuredClone(source.sinkingFunds || base.sinkingFunds || []),
      transactions: [],
      history: source.history || [],
      appliedRecurring: {},
      monthNotes: [],
    };
  }

  function normaliseMonthlyState(monthState, profileId, monthId, sharedHistory) {
    const fallback = blankMonthFor(profileId, monthId, monthState || defaultsFor(profileId));
    const next = Object.assign(fallback, monthState || {});
    next.monthId = validMonthId(next.monthId) ? next.monthId : monthId;
    next.status = next.status || "draft";
    next.createdAt = next.createdAt || new Date().toISOString();
    next.updatedAt = next.updatedAt || next.createdAt;
    next.incomeEntries = Array.isArray(next.incomeEntries) ? next.incomeEntries : [];
    next.expenses = Array.isArray(next.expenses) ? next.expenses : [];
    next.savings = Array.isArray(next.savings) ? next.savings : [];
    next.goals = Array.isArray(next.goals) ? next.goals : [];
    next.debts = Array.isArray(next.debts) ? next.debts : [];
    next.sinkingFunds = Array.isArray(next.sinkingFunds) ? next.sinkingFunds : [];
    next.transactions = Array.isArray(next.transactions) ? next.transactions : [];
    next.history = sharedHistory;
    next.appliedRecurring = next.appliedRecurring || {};
    next.monthNotes = Array.isArray(next.monthNotes) ? next.monthNotes : [];
    return next;
  }

  function migrateProfileRecord(record, profileId) {
    if (!record) record = { passHash: "", state: defaultsFor(profileId) };
    const legacyState = Object.assign(defaultsFor(profileId), record.state || {});
    const monthId = validMonthId(record.activeMonth) ? record.activeMonth : currentMonthId();
    const sharedHistory = Array.isArray(record.history) ? record.history : (Array.isArray(legacyState.history) ? legacyState.history : []);

    if (!record.months || typeof record.months !== "object") {
      const migratedMonth = normaliseMonthlyState(Object.assign({}, legacyState, {
        monthId,
        status: legacyState.status || "draft",
        appliedRecurring: legacyState.appliedRecurring || {},
      }), profileId, monthId, sharedHistory);
      record.months = { [monthId]: migratedMonth };
      record.activeMonth = monthId;
    } else {
      record.activeMonth = validMonthId(record.activeMonth) ? record.activeMonth : monthId;
      Object.keys(record.months).forEach((id) => {
        record.months[id] = normaliseMonthlyState(record.months[id], profileId, id, sharedHistory);
      });
      if (!record.months[record.activeMonth]) {
        record.months[record.activeMonth] = blankMonthFor(profileId, record.activeMonth, legacyState);
        record.months[record.activeMonth].history = sharedHistory;
      }
    }

    record.recurringItems = Array.isArray(record.recurringItems) ? record.recurringItems : [];
    record.history = sharedHistory;
    record.state = record.months[record.activeMonth];
    record.dataVersion = DATA_VERSION;
    return record;
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
    try {
      localStorage.setItem(ROOT_KEY, JSON.stringify(root));
      return true;
    } catch (e) {
      console.warn("Failed to save profiles", e);
      setDataStatus("Browser storage is full or unavailable. Download a backup before making more changes.", "neg");
      notify("Data could not be saved", "bad");
      return false;
    }
  }

  function save() {
    if (!activeProfile || !root.profiles[activeProfile]) return;
    const record = profileRecord(activeProfile);
    if (state && activeMonth) {
      state.updatedAt = new Date().toISOString();
      record.months[activeMonth] = state;
      record.activeMonth = activeMonth;
      record.state = state;
      record.history = state.history || record.history || [];
    }
    saveRoot();
  }

  function activeRecord() {
    return activeProfile ? profileRecord(activeProfile) : null;
  }

  function switchMonth(monthId) {
    if (!validMonthId(monthId) || !activeProfile) return;
    save();
    const record = profileRecord(activeProfile);
    const source = state || record.state || defaultsFor(activeProfile);
    if (!record.months[monthId]) {
      record.months[monthId] = blankMonthFor(activeProfile, monthId, source);
      record.months[monthId].history = record.history || [];
    }
    activeMonth = monthId;
    record.activeMonth = monthId;
    state = record.months[monthId];
    record.state = state;
    saveRoot();
    renderAll();
    notify(`Budget for ${monthLabel(monthId, { month: "long", year: "numeric" })} opened`);
  }

  function activeMonthOffset() {
    const current = currentMonthId();
    if (!validMonthId(activeMonth)) return 0;
    const [ay, am] = activeMonth.split("-").map((x) => parseInt(x, 10));
    const [cy, cm] = current.split("-").map((x) => parseInt(x, 10));
    return (ay - cy) * 12 + (am - cm);
  }

  function monthHasPlan(monthState) {
    if (!monthState) return false;
    return num(monthState.income) > 0 ||
      (monthState.incomeEntries || []).some((i) => num(i.amount) > 0) ||
      (monthState.expenses || []).some((e) => cleanName(e.name) || num(e.budgeted) > 0 || num(e.actual) > 0) ||
      (monthState.savings || []).some((s) => cleanName(s.name) || num(s.budgeted) > 0 || num(s.actual) > 0) ||
      (monthState.transactions || []).some((tx) => num(tx.amount) > 0);
  }

  function monthStatusText() {
    const offset = activeMonthOffset();
    const pieces = [state && state.status === "completed" ? "Completed" : state && state.status === "saved" ? "Saved" : "Draft"];
    if (offset === 0) pieces.push("real current calendar month");
    else if (offset < 0) pieces.push("past budget");
    else pieces.push("future budget");
    return pieces.join(" · ");
  }

  function copyPlannedFrom(sourceMonth, targetMonth, mode) {
    const replace = mode === "replace";
    if (replace) {
      targetMonth.income = num(sourceMonth.income);
      targetMonth.incomeEntries = [];
      targetMonth.expenses = [];
      targetMonth.savings = [];
      targetMonth.monthlySavingsTarget = num(sourceMonth.monthlySavingsTarget);
    } else if (num(targetMonth.income) <= CURRENCY_TOLERANCE) {
      targetMonth.income = num(sourceMonth.income);
    }
    mergeNamedRows(targetMonth.expenses, sourceMonth.expenses, "budgeted", replace);
    mergeNamedRows(targetMonth.savings, sourceMonth.savings, "budgeted", replace);
    targetMonth.monthNotes = (targetMonth.monthNotes || []).concat({ id: uid(), text: `Planned data copied from ${monthLabel(sourceMonth.monthId)}.`, createdAt: new Date().toISOString() });
  }

  function mergeNamedRows(target, source, amountKey, replace) {
    (source || []).forEach((item) => {
      const name = cleanName(item.name);
      if (!name) return;
      const existing = target.find((row) => cleanName(row.name).toLowerCase() === name.toLowerCase());
      if (existing) {
        if (replace) existing[amountKey] = num(item[amountKey]);
        return;
      }
      target.push(Object.assign({}, item, { id: uid(), actual: 0 }));
    });
  }

  function eligibleRecurringItems(monthId) {
    const record = activeRecord();
    if (!record) return [];
    return (record.recurringItems || []).filter((item) => {
      if (item.status === "paused") return false;
      if (!validMonthId(item.start) || item.start > monthId) return false;
      if (item.end && validMonthId(item.end) && item.end < monthId) return false;
      if (item.frequency === "one-off") return item.start === monthId;
      return item.frequency === "monthly";
    });
  }

  function recurringStatus(item, monthId) {
    if (item.status === "paused") return "Paused";
    if (item.end && validMonthId(item.end) && item.end < (monthId || currentMonthId())) return "Ended";
    return "Active";
  }

  function nextEligibleMonth(item) {
    if (item.status === "paused") return "Paused";
    const base = currentMonthId();
    if (item.end && validMonthId(item.end) && item.end < base) return "Ended";
    if (item.frequency === "one-off") return item.start >= base ? monthLabel(item.start) : "Ended";
    return monthLabel(item.start > base ? item.start : base);
  }

  function applyRecurringToMonth(monthState, monthId) {
    const applied = monthState.appliedRecurring || {};
    let added = 0;
    eligibleRecurringItems(monthId).forEach((item) => {
      if (applied[item.id]) return;
      if (applyRecurringItem(monthState, item)) {
        applied[item.id] = { monthId, createdAt: new Date().toISOString() };
        added += 1;
      }
    });
    monthState.appliedRecurring = applied;
    if (added) monthState.monthNotes = (monthState.monthNotes || []).concat({ id: uid(), text: `${added} recurring item${added === 1 ? "" : "s"} added to ${monthLabel(monthId)}.`, createdAt: new Date().toISOString() });
    return added;
  }

  function applyRecurringItem(monthState, item) {
    const amount = num(item.amount);
    const name = cleanName(item.name);
    if (!name || amount <= CURRENCY_TOLERANCE) return false;
    if (item.type === "income") {
      if ((monthState.incomeEntries || []).some((entry) => entry.recurringId === item.id)) return false;
      monthState.incomeEntries = monthState.incomeEntries || [];
      monthState.incomeEntries.push({ id: uid(), recurringId: item.id, name, amount });
      monthState.income = sum(monthState.incomeEntries, "amount");
      return true;
    }
    if (item.type === "expense") {
      return upsertRecurringRow(monthState.expenses, item, "budgeted");
    }
    if (item.type === "savings") {
      return upsertRecurringRow(monthState.savings, item, "budgeted");
    }
    if (item.type === "sinking") {
      monthState.monthlySavingsTarget = num(monthState.monthlySavingsTarget) + amount;
      return true;
    }
    if (item.type === "debt") {
      const existing = (monthState.debts || []).find((d) => cleanName(d.name).toLowerCase() === name.toLowerCase());
      if (existing) existing.payment = amount;
      else monthState.debts.push({ id: uid(), name, originalBalance: 0, balance: amount, apr: 0, payment: amount });
      return true;
    }
    return false;
  }

  function upsertRecurringRow(rows, item, key) {
    const name = cleanName(item.name);
    if (rows.some((row) => row.recurringId === item.id)) return false;
    const existing = rows.find((row) => cleanName(row.name).toLowerCase() === name.toLowerCase());
    if (existing) {
      existing[key] = num(item.amount);
      existing.recurringId = item.id;
      return true;
    }
    rows.push({ id: uid(), recurringId: item.id, name, budgeted: num(item.amount), actual: 0 });
    return true;
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
    root.profiles[profileId] = migrateProfileRecord(root.profiles[profileId], profileId);
    return root.profiles[profileId];
  }

  function profileMeta(profileId) {
    return (PROFILES[profileId]) || {
      label: profileName(profileId),
      subtitle: "Imported private budget room.",
    };
  }

  function renderProfileButtons() {
    const grid = document.querySelector(".profile-grid");
    if (!grid) return;
    const ids = Object.keys(root.profiles || {});
    const ordered = Object.keys(PROFILES).concat(ids.filter((id) => !PROFILES[id]));
    grid.textContent = "";
    ordered.forEach((id) => {
      const meta = profileMeta(id);
      grid.appendChild(el("button", {
        class: "profile-card" + (id === "ayo" ? " profile-card--ayo" : ""),
        type: "button",
        "data-profile-login": id,
      }, [
        el("span", { class: "profile-card__name", text: meta.label }),
        el("span", { class: "profile-card__sub", text: meta.subtitle }),
      ]));
    });
  }

  function showAuth() {
    renderProfileButtons();
    document.getElementById("authScreen").hidden = false;
    document.getElementById("appShell").hidden = true;
    document.getElementById("authForm").hidden = true;
    document.getElementById("passcodeInput").value = "";
  }

  function showApp(profileId) {
    activeProfile = profileId;
    sessionStorage.setItem(SESSION_PROFILE_KEY, profileId);
    const record = profileRecord(profileId);
    activeMonth = record.activeMonth;
    state = record.state;
    saveRoot();
    document.getElementById("authScreen").hidden = true;
    document.getElementById("appShell").hidden = false;
    document.getElementById("profileSubtitle").textContent = profileMeta(profileId).subtitle;
    document.getElementById("versionLabel").textContent = `Version ${APP_VERSION}`;
    document.getElementById("releaseDateLabel").textContent = `Released ${RELEASE_DATE}`;
    renderAll();
  }

  function startLogin(profileId) {
    pendingProfile = profileId;
    const record = profileRecord(profileId);
    document.getElementById("authForm").hidden = false;
    document.getElementById("authProfileName").textContent = profileMeta(profileId).label;
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

  function clampPct(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function progressData(current, target) {
    const targetNum = num(target);
    const currentNum = Math.max(num(current), 0);
    const remaining = Math.max(targetNum - currentNum, 0);
    const pctComplete = targetNum > 0 ? clampPct((currentNum / targetNum) * 100) : 0;
    return { current: currentNum, target: targetNum, remaining, pct: pctComplete, complete: targetNum > 0 && currentNum + CURRENCY_TOLERANCE >= targetNum };
  }

  function progressComponent(label, progress, supportingText) {
    const text = progress.target > 0
      ? `${money(progress.current)} of ${money(progress.target)} ${label} — ${progress.pct}% complete`
      : `Add a target amount to track progress.`;
    return el("div", { class: "progress-block" }, [
      el("progress", {
        class: "progress-native",
        max: "100",
        value: String(progress.pct),
        "aria-label": text,
      }),
      el("div", { class: "progress" }, [
        el("span", { class: "progress__bar", style: `width:${progress.pct}%` }),
      ]),
      el("p", { class: "progress__label", text: supportingText ? `${text} ${supportingText}` : text }),
    ]);
  }

  function summaryMetric(label, value, hint) {
    return el("div", { class: "section-summary__item" }, [
      el("span", { class: "section-summary__label", text: label }),
      el("strong", { class: "section-summary__value", text: value }),
      hint ? el("span", { class: "section-summary__hint", text: hint }) : null,
    ].filter(Boolean));
  }

  function monthLabelFromOffset(months) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }

  function completionMonthFromMonthly(remaining, monthly) {
    if (num(remaining) <= CURRENCY_TOLERANCE || num(monthly) <= CURRENCY_TOLERANCE) return "";
    return monthLabelFromOffset(Math.ceil(num(remaining) / num(monthly)));
  }

  /* ---------- Renderers ---------- */
  function renderAll() {
    renderMonthPanel();
    renderDataManagement();
    renderOnboarding();
    renderRecurring();
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
    renderAnalytics();
    renderScripture();
  }

  function renderMonthPanel() {
    const title = document.getElementById("activeMonthTitle");
    const meta = document.getElementById("monthMeta");
    const input = document.getElementById("activeMonthInput");
    const notice = document.getElementById("monthNotice");
    if (!title || !meta || !input || !notice || !state) return;
    title.textContent = `Budget for ${monthLabel(activeMonth)}`;
    meta.textContent = monthStatusText();
    if (document.activeElement !== input) input.value = activeMonth;
    const notes = (state.monthNotes || []).slice(-2).map((n) => n.text);
    if (state.status === "completed" && activeMonthOffset() < 0) {
      notes.unshift("You are viewing a completed past budget. Edit carefully because changes may alter comparisons.");
    } else if (activeMonthOffset() < 0) {
      notes.unshift("You are editing a past budget.");
    } else if (!monthHasPlan(state)) {
      notes.unshift("This month has no plan yet. Apply recurring items or copy the previous month to get started.");
    }
    notice.textContent = notes.join(" ");
  }

  function recurringGroups() {
    return [
      ["income", "Income"],
      ["expense", "Expenses"],
      ["savings", "Savings"],
      ["sinking", "Sinking-fund contributions"],
      ["debt", "Debt payments"],
    ];
  }

  function renderRecurring() {
    const list = document.getElementById("recurringList");
    if (!list || !activeProfile) return;
    const record = activeRecord();
    const items = record.recurringItems || [];
    list.textContent = "";
    if (!items.length) {
      list.appendChild(emptyState("No recurring items yet", "Mark regular income and commitments as recurring to prepare future months faster.", "Add recurring item", () => document.getElementById("recurringName").focus()));
      return;
    }
    recurringGroups().forEach(([type, label]) => {
      const groupItems = items.filter((item) => item.type === type);
      if (!groupItems.length) return;
      list.appendChild(el("h4", { class: "recurring-group-title", text: label }));
      groupItems.forEach((item) => list.appendChild(renderRecurringItem(item)));
    });
  }

  function renderRecurringItem(item) {
    const status = recurringStatus(item, activeMonth);
    const amount = money(item.amount);
    return el("article", { class: "recurring-item recurring-item--" + status.toLowerCase() }, [
      el("div", { class: "recurring-item__main" }, [
        el("strong", { text: item.name || "Recurring item" }),
        el("span", { text: `${amount} · ${item.frequency === "one-off" ? "One-off" : "Monthly"} · Starts ${monthLabel(item.start)}` + (item.end ? ` · Ends ${monthLabel(item.end)}` : "") }),
        item.day ? el("span", { text: `Payment day ${Math.min(num(item.day), 31)}` }) : null,
        item.note ? el("span", { text: item.note }) : null,
      ].filter(Boolean)),
      el("div", { class: "recurring-item__meta" }, [
        el("span", { class: "status-pill", text: status }),
        el("span", { text: `Next: ${nextEligibleMonth(item)}` }),
      ]),
      el("div", { class: "recurring-item__actions" }, [
        el("button", { class: "btn btn--sm", type: "button", onclick: () => toggleRecurring(item) }, [item.status === "paused" ? "Resume" : "Pause"]),
        el("button", { class: "btn btn--sm", type: "button", onclick: () => loadRecurringForEdit(item) }, ["Edit"]),
        el("button", {
          class: "btn btn--sm btn--danger",
          type: "button",
          onclick: () => openConfirm(`Delete ${item.name || "this recurring item"}?`, "Future copies will stop. Existing monthly records will remain unchanged.", "Delete", () => {
            const record = activeRecord();
            record.recurringItems = (record.recurringItems || []).filter((x) => x.id !== item.id);
            saveRoot();
            renderRecurring();
            notify("Recurring item deleted");
          }),
        }, ["Delete"]),
      ]),
    ]);
  }

  function recurringValidation(item, existingId) {
    if (!cleanName(item.name)) return "Recurring item name is required.";
    const amountMsg = decimalValidation(String(item.amount), "Amount");
    if (amountMsg) return amountMsg;
    if (!["income", "expense", "savings", "sinking", "debt"].includes(item.type)) return "Choose a valid recurring type.";
    if (!["monthly", "one-off"].includes(item.frequency)) return "Choose a valid recurrence type.";
    const startMsg = monthValidation(item.start, "Start month", { allowPast: true });
    if (startMsg) return startMsg;
    if (item.end) {
      const endMsg = monthValidation(item.end, "End month", { allowPast: true });
      if (endMsg) return endMsg;
      if (item.end < item.start) return "End month cannot be before the start month.";
    }
    if (item.day && (num(item.day) < 1 || num(item.day) > 31)) return "Payment day must be between 1 and 31.";
    const record = activeRecord();
    const duplicate = (record.recurringItems || []).some((existing) =>
      existing.id !== existingId &&
      existing.type === item.type &&
      cleanName(existing.name).toLowerCase() === cleanName(item.name).toLowerCase() &&
      existing.frequency === item.frequency &&
      existing.start === item.start
    );
    return duplicate ? "A matching recurring item already exists." : "";
  }

  function recurringFormData() {
    return {
      type: document.getElementById("recurringType").value,
      name: cleanName(document.getElementById("recurringName").value),
      amount: Number(document.getElementById("recurringAmount").value),
      frequency: document.getElementById("recurringFrequency").value,
      start: document.getElementById("recurringStart").value,
      end: document.getElementById("recurringEnd").value,
      day: document.getElementById("recurringDay").value,
      note: cleanName(document.getElementById("recurringNote").value),
      status: "active",
    };
  }

  function resetRecurringForm() {
    const form = document.getElementById("recurringForm");
    if (!form) return;
    form.dataset.editing = "";
    form.reset();
    document.getElementById("recurringStart").value = activeMonth || currentMonthId();
    document.querySelector("#recurringForm button[type='submit']").textContent = "Add recurring item";
  }

  function loadRecurringForEdit(item) {
    document.getElementById("recurringType").value = item.type;
    document.getElementById("recurringName").value = item.name || "";
    document.getElementById("recurringAmount").value = item.amount || "";
    document.getElementById("recurringFrequency").value = item.frequency || "monthly";
    document.getElementById("recurringStart").value = item.start || activeMonth || currentMonthId();
    document.getElementById("recurringEnd").value = item.end || "";
    document.getElementById("recurringDay").value = item.day || "";
    document.getElementById("recurringNote").value = item.note || "";
    document.getElementById("recurringForm").dataset.editing = item.id;
    document.querySelector("#recurringForm button[type='submit']").textContent = "Save recurring item";
    scrollToSection("recurringSection", "#recurringName");
  }

  function saveRecurringFromForm(e) {
    e.preventDefault();
    const form = document.getElementById("recurringForm");
    const editing = form.dataset.editing || "";
    const item = recurringFormData();
    const message = recurringValidation(item, editing);
    const nameInput = document.getElementById("recurringName");
    setFieldError(nameInput, message);
    if (message) return;
    const record = activeRecord();
    if (editing) {
      const existing = (record.recurringItems || []).find((x) => x.id === editing);
      if (existing) Object.assign(existing, item, { updatedAt: new Date().toISOString() });
      notify("Recurring item updated");
    } else {
      record.recurringItems = record.recurringItems || [];
      record.recurringItems.push(Object.assign({ id: uid(), createdAt: new Date().toISOString() }, item));
      notify("Recurring item added");
    }
    saveRoot();
    resetRecurringForm();
    renderRecurring();
  }

  function toggleRecurring(item) {
    item.status = item.status === "paused" ? "active" : "paused";
    item.updatedAt = new Date().toISOString();
    saveRoot();
    renderRecurring();
    notify(item.status === "paused" ? "Recurring item paused" : "Recurring item resumed");
  }

  function openRollover(mode, targetMonth) {
    const record = activeRecord();
    if (!record) return;
    const target = validMonthId(targetMonth) ? targetMonth : monthIdFromOffset(activeMonth, 1);
    const existing = record.months[target];
    const previousId = monthIdFromOffset(target, -1);
    const previous = record.months[previousId];
    const recurringCount = eligibleRecurringItems(target).length;
    const canCopy = Boolean(previous);
    const options = document.getElementById("rolloverOptions");
    options.textContent = "";
    document.getElementById("rolloverTitle").textContent = mode === "copy" ? `Copy into ${monthLabel(target)}` : `Create ${monthLabel(target)} budget`;
    document.getElementById("rolloverBody").textContent = existing && monthHasPlan(existing)
      ? "This month already contains budget data. Choose whether to merge missing planned items or replace planned data. Actual transactions will not be copied."
      : "Review what should be copied before this month is created. Actual transactions and previous actual spending will not be copied.";
    [
      ["recurring", `Apply ${recurringCount} eligible recurring item${recurringCount === 1 ? "" : "s"}`, recurringCount > 0 && mode !== "copy"],
      ["previous", canCopy ? `Copy planned data from ${monthLabel(previousId)}` : "There is no previous monthly plan available to copy.", canCopy && mode === "copy"],
      ["replace", "Replace planned data in the target month", false],
    ].forEach(([id, label, checked]) => {
      const disabled = (id === "previous" && !canCopy) || (id === "recurring" && recurringCount === 0);
      options.appendChild(el("label", { class: "rollover-choice" }, [
        el("input", { type: "checkbox", value: id, checked: checked ? "true" : null, disabled: disabled ? "true" : null }),
        el("span", { text: label }),
      ]));
    });
    document.getElementById("rolloverModal").dataset.targetMonth = target;
    openManagedModal("rolloverModal", "rolloverCancelBtn");
  }

  function closeRollover() {
    closeManagedModal("rolloverModal");
  }

  function confirmRollover() {
    const modal = document.getElementById("rolloverModal");
    const targetId = modal.dataset.targetMonth;
    const record = activeRecord();
    if (!validMonthId(targetId) || !record) return;
    save();
    if (!record.months[targetId]) {
      record.months[targetId] = blankMonthFor(activeProfile, targetId, state);
      record.months[targetId].history = record.history || [];
    }
    const target = record.months[targetId];
    const selected = Array.from(document.querySelectorAll("#rolloverOptions input:checked")).map((i) => i.value);
    const replace = selected.includes("replace");
    if (selected.includes("previous")) {
      const previous = record.months[monthIdFromOffset(targetId, -1)];
      if (previous) copyPlannedFrom(previous, target, replace ? "replace" : "merge");
    }
    let recurringAdded = 0;
    if (selected.includes("recurring")) recurringAdded = applyRecurringToMonth(target, targetId);
    target.status = "draft";
    target.updatedAt = new Date().toISOString();
    activeMonth = targetId;
    record.activeMonth = targetId;
    record.state = target;
    state = target;
    save();
    closeRollover();
    renderAll();
    notify(`${monthLabel(targetId)} budget ready${recurringAdded ? ` with ${recurringAdded} recurring item${recurringAdded === 1 ? "" : "s"}` : ""}`);
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
      { id: "history", label: "Save this budget month", done: state.history.some((h) => h.monthId === activeMonth), action: sectionAction("historySection", "#saveSnapshotBtn") },
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
    renderInsights(t);
    renderMoneyTrail();
    renderAdvisor();
    renderAnalytics(t);
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

  function insight(id, type, priority, title, message, opts) {
    const options = opts || {};
    return Object.assign({ id, type, priority, title, message }, options);
  }

  function insightContext(totalsArg) {
    const t = totalsArg || totals();
    const txTotals = transactionTotalsByCategory();
    const txCounts = {};
    let uncategorisedTotal = 0;
    (state.transactions || []).forEach((tx) => {
      const amount = num(tx.amount);
      if (amount <= 0) return;
      const key = tx.category || "Uncategorised";
      txCounts[key] = (txCounts[key] || 0) + 1;
      if (!tx.category) uncategorisedTotal += amount;
    });

    const expenses = (state.expenses || []).map((e) => {
      const actual = expenseActual(e, txTotals);
      const budgeted = num(e.budgeted);
      return {
        name: e.name || "Unnamed category",
        budgeted,
        actual,
        diff: budgeted - actual,
        txCount: txCounts[e.name] || 0,
      };
    });
    const overCategories = expenses.filter((e) => e.actual - e.budgeted > CURRENCY_TOLERANCE).sort((a, b) => (b.actual - b.budgeted) - (a.actual - a.budgeted));
    const underCategories = expenses.filter((e) => e.budgeted - e.actual > CURRENCY_TOLERANCE && e.budgeted > 0).sort((a, b) => (b.budgeted - b.actual) - (a.budgeted - a.actual));
    const actualCategories = expenses.filter((e) => e.actual > CURRENCY_TOLERANCE).sort((a, b) => b.actual - a.actual);
    const plannedCategories = expenses.filter((e) => e.budgeted > CURRENCY_TOLERANCE).sort((a, b) => b.budgeted - a.budgeted);
    const totalOver = overCategories.reduce((acc, e) => acc + (e.actual - e.budgeted), 0);
    const totalUnder = Math.max(t.expBudgeted - t.expActual, 0);
    const mostTransactions = expenses.filter((e) => e.txCount > 0).sort((a, b) => b.txCount - a.txCount)[0];
    const lastHistory = sortedHistory().filter((h) => h.monthId !== activeMonth).slice(-1)[0] || null;

    return { t, expenses, overCategories, underCategories, actualCategories, plannedCategories, totalOver, totalUnder, txCounts, uncategorisedTotal, mostTransactions, lastHistory };
  }

  function buildInsights(totalsArg) {
    const ctx = insightContext(totalsArg);
    if (ctx.t.income <= CURRENCY_TOLERANCE) return insufficientDataInsights(ctx);
    return selectInsights([
      ...budgetInsights(ctx),
      ...allocationInsights(ctx),
      ...savingsInsights(ctx),
      ...spendingCategoryInsights(ctx),
      ...debtInsights(ctx),
      ...sinkingInsights(ctx),
      ...historyInsights(ctx),
      ...insufficientDataInsights(ctx),
    ]);
  }

  function selectInsights(items) {
    const seen = new Set();
    return items
      .filter(Boolean)
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5);
  }

  function budgetInsights(ctx) {
    const { t, overCategories, underCategories, totalOver, totalUnder } = ctx;
    const items = [];
    if (totalOver > CURRENCY_TOLERANCE) {
      items.push(insight(
        "budget-overall-over",
        "attention",
        20,
        "Spending is above plan",
        `You are ${money(totalOver)} over budget across ${overCategories.length} categor${overCategories.length === 1 ? "y" : "ies"}.`,
        { value: money(totalOver), actionLabel: "Review spending", actionTarget: "expensesSection", focusSelector: "input[aria-label='Actual']" }
      ));
    } else if (t.expBudgeted > 0 && Math.abs(t.expBudgeted - t.expActual) <= CURRENCY_TOLERANCE) {
      items.push(insight("budget-exact", "positive", 90, "Exactly on budget", "Actual category spending currently matches your planned category budget.", { value: money(t.expActual), actionLabel: "Review spending", actionTarget: "expensesSection" }));
    } else if (t.expBudgeted > 0 && totalUnder > CURRENCY_TOLERANCE) {
      items.push(insight("budget-under", "positive", 85, "Below planned spending", `You are ${money(totalUnder)} below your planned category spending.`, { value: money(totalUnder), actionLabel: "Review spending", actionTarget: "expensesSection" }));
    }

    const categoryOver = overCategories[0];
    if (categoryOver) {
      const overspend = categoryOver.actual - categoryOver.budgeted;
      const overPct = categoryOver.budgeted > CURRENCY_TOLERANCE ? `, which is ${pct((overspend / categoryOver.budgeted) * 100)} above plan` : "";
      items.push(insight(
        "category-overspend",
        "attention",
        21,
        `${categoryOver.name} is over budget`,
        `${categoryOver.name} is ${money(overspend)} over budget${overPct}.`,
        { value: money(overspend), actionLabel: "Review spending", actionTarget: "expensesSection" }
      ));
    }

    const categoryUnder = underCategories[0];
    if (!categoryOver && categoryUnder && categoryUnder.budgeted >= 50) {
      items.push(insight(
        "category-underspend",
        "neutral",
        95,
        `${categoryUnder.name} has budget remaining`,
        `You have ${money(categoryUnder.budgeted - categoryUnder.actual)} remaining in your ${categoryUnder.name} budget.`,
        { value: money(categoryUnder.budgeted - categoryUnder.actual), actionLabel: "Review spending", actionTarget: "expensesSection" }
      ));
    }
    return items;
  }

  function allocationInsights(ctx) {
    const { t } = ctx;
    if (t.income <= CURRENCY_TOLERANCE) return [];
    if (t.plannedCommitments - t.income > CURRENCY_TOLERANCE) {
      return [insight("commitments-over-income", "attention", 30, "Plan exceeds income", `Your planned commitments are ${money(t.plannedCommitments - t.income)} above your income, so the current plan is not sustainable.`, { value: money(t.plannedCommitments - t.income), actionLabel: "Allocate income", actionTarget: "planningGroup" })];
    }
    if (t.actualCashRemaining < -CURRENCY_TOLERANCE || t.unallocatedIncome < -CURRENCY_TOLERANCE) {
      const gap = Math.abs(Math.min(t.actualCashRemaining, t.unallocatedIncome));
      return [insight("negative-position", "attention", 10, "Income is under pressure", `Your commitments and actual outgoings exceed your income by ${money(gap)}.`, { value: money(gap), actionLabel: "Review plan", actionTarget: "planningGroup" })];
    }
    if (t.safeToSpend > CURRENCY_TOLERANCE && t.safeToSpend <= 50) {
      return [insight("low-safe-to-spend", "attention", 40, "Safe to spend is low", `You can spend up to ${money(t.safeToSpend)} without breaking your current plan.`, { value: money(t.safeToSpend), actionLabel: "Review plan", actionTarget: "planningGroup" })];
    }
    if (Math.abs(t.safeToSpend) <= CURRENCY_TOLERANCE && Math.abs(t.unallocatedIncome) <= CURRENCY_TOLERANCE) {
      return [insight("fully-allocated", "positive", 80, "Income fully allocated", "Every pound of your monthly income has been assigned.", { value: money(0), actionLabel: "Review plan", actionTarget: "summarySection" })];
    }
    if (t.unallocatedIncome > CURRENCY_TOLERANCE) {
      return [insight("unallocated-income", "neutral", 70, "Income not yet allocated", `You have ${money(t.unallocatedIncome)} that has not yet been assigned.`, { value: money(t.unallocatedIncome), actionLabel: "Allocate income", actionTarget: "planningGroup" })];
    }
    return [];
  }

  function savingsInsights(ctx) {
    const { t } = ctx;
    const items = [];
    const completed = (state.goals || []).find((g) => num(g.target) > 0 && num(g.current) + CURRENCY_TOLERANCE >= num(g.target));
    if (completed) {
      items.push(insight("goal-completed", "positive", 56, "Savings goal completed", `You completed your ${completed.name || "savings"} goal.`, { value: money(num(completed.target)), actionLabel: "View savings goal", actionTarget: "goalsSection" }));
    }

    const milestone = (state.goals || [])
      .filter((g) => num(g.target) > 0 && num(g.current) > 0)
      .map((g) => ({ goal: g, calc: goalCalc(g) }))
      .filter((x) => x.calc.pct >= 25)
      .sort((a, b) => b.calc.pct - a.calc.pct)[0];
    if (milestone && (!completed || milestone.goal.id !== completed.id)) {
      const mark = milestone.calc.pct >= 75 ? 75 : milestone.calc.pct >= 50 ? 50 : 25;
      items.push(insight("goal-milestone", "positive", 57, "Savings goal milestone", `${milestone.goal.name || "Savings goal"} has reached at least ${mark}% of its target.`, { value: pct(milestone.calc.pct), actionLabel: "View savings goal", actionTarget: "goalsSection" }));
    }

    if (t.income <= CURRENCY_TOLERANCE) {
      items.push(insight("savings-no-income", "neutral", 120, "Savings rate unavailable", "Add monthly income to calculate your savings rate.", { actionLabel: "Add income", actionTarget: "incomeSection", focusSelector: "#incomeInput" }));
    } else if (t.savBudgeted <= CURRENCY_TOLERANCE) {
      items.push(insight("no-savings-allocation", "neutral", 58, "No savings allocated", "You have not allocated any income to savings this month.", { actionLabel: "Add savings allocation", actionTarget: "savingsSection", focusSelector: "input[aria-label='Budgeted']" }));
    } else {
      const rate = (t.savBudgeted / t.income) * 100;
      items.push(insight("savings-rate", "positive", 55, "Savings rate calculated", `You have allocated ${money(t.savBudgeted)}, or ${pct(rate)} of your income, to savings.`, { value: pct(rate), actionLabel: "Review savings", actionTarget: "savingsSection" }));
    }
    return items;
  }

  function spendingCategoryInsights(ctx) {
    const { t, actualCategories, plannedCategories, mostTransactions, uncategorisedTotal } = ctx;
    const items = [];
    const largestActual = actualCategories[0];
    if (largestActual) {
      const share = t.expActual > CURRENCY_TOLERANCE ? ` It represents ${pct((largestActual.actual / t.expActual) * 100)} of recorded category spending.` : "";
      items.push(insight("largest-actual-category", "neutral", 100, "Largest actual category", `${largestActual.name} is your largest actual spending category at ${money(largestActual.actual)}.${share}`, { value: money(largestActual.actual), actionLabel: "Review spending", actionTarget: "moneyTrailSection" }));
    }
    const largestPlanned = plannedCategories[0];
    if (largestPlanned) {
      items.push(insight("largest-planned-category", "neutral", 112, "Largest planned category", `${largestPlanned.name} is your largest planned expense at ${money(largestPlanned.budgeted)}.`, { value: money(largestPlanned.budgeted), actionLabel: "Review budgets", actionTarget: "expensesSection" }));
    }
    if (mostTransactions && mostTransactions.txCount >= 2) {
      items.push(insight("most-transactions", "neutral", 105, "Most frequent category", `${mostTransactions.name} contains ${mostTransactions.txCount} transactions, more than any other category.`, { value: String(mostTransactions.txCount), actionLabel: "Review spending", actionTarget: "transactionsSection" }));
    }
    if (uncategorisedTotal > CURRENCY_TOLERANCE) {
      items.push(insight("uncategorised-spending", "attention", 22, "Uncategorised spending found", `You have ${money(uncategorisedTotal)} of uncategorised spending.`, { value: money(uncategorisedTotal), actionLabel: "Review transactions", actionTarget: "transactionsSection" }));
    }
    return items;
  }

  function debtInsights() {
    const debts = (state.debts || []);
    if (!debts.length) return [insight("no-debt-data", "neutral", 130, "No debt insights available", "No debt insights are available because no debts are being tracked.", { actionLabel: "Add debt", actionTarget: "debtSection", focusSelector: "input[aria-label='Debt name']" })];
    const active = debts.filter((d) => num(d.balance) > CURRENCY_TOLERANCE);
    const cleared = debts.find((d) => cleanName(d.name) && num(d.balance) <= CURRENCY_TOLERANCE);
    const highestApr = active.filter((d) => num(d.apr) > 0).sort((a, b) => num(b.apr) - num(a.apr))[0];
    const items = [];
    const totalDebt = active.reduce((acc, d) => acc + num(d.balance), 0);
    if (totalDebt > CURRENCY_TOLERANCE) {
      items.push(insight("total-debt", "neutral", 60, "Debt balance recorded", `You have ${money(totalDebt)} remaining across ${active.length} debt${active.length === 1 ? "" : "s"}.`, { value: money(totalDebt), actionLabel: "Review debt", actionTarget: "debtSection" }));
    }
    if (highestApr) {
      items.push(insight("highest-apr", "neutral", 61, "Highest recorded APR", `${highestApr.name || "A debt"} currently has the highest recorded APR at ${num(highestApr.apr).toFixed(1)}%.`, { value: `${num(highestApr.apr).toFixed(1)}%`, actionLabel: "Review debt", actionTarget: "debtSection" }));
    }
    const nearing = active.filter((d) => num(d.payment) > 0 && debtMonths(d.balance, d.apr, d.payment) !== Infinity).sort((a, b) => debtMonths(a.balance, a.apr, a.payment) - debtMonths(b.balance, b.apr, b.payment))[0];
    if (nearing && debtMonths(nearing.balance, nearing.apr, nearing.payment) <= 3) {
      items.push(insight("debt-nearing", "positive", 59, "Debt nearing completion", `${nearing.name || "A debt"} could be cleared within ${debtMonths(nearing.balance, nearing.apr, nearing.payment)} month${debtMonths(nearing.balance, nearing.apr, nearing.payment) === 1 ? "" : "s"} at the recorded payment.`, { value: payoffEstimateText(nearing), actionLabel: "Review debt", actionTarget: "debtSection" }));
    }
    if (cleared) {
      items.push(insight("debt-cleared", "positive", 51, "Debt cleared", `You cleared your ${cleared.name} balance.`, { value: money(0), actionLabel: "Review debt", actionTarget: "debtSection" }));
    }
    return items;
  }

  function sinkingInsights() {
    const funds = (state.sinkingFunds || []).filter((f) => cleanName(f.name) || num(f.cost) > 0 || num(f.saved) > 0);
    if (!funds.length) return [];
    const items = [];
    const completed = funds.find((f) => num(f.cost) > 0 && num(f.saved) + CURRENCY_TOLERANCE >= num(f.cost));
    if (completed) {
      items.push(insight("sinking-completed", "positive", 52, "Sinking fund completed", `${completed.name || "A sinking fund"} has reached its target amount.`, { value: money(num(completed.cost)), actionLabel: "Update sinking fund", actionTarget: "sinkingSection" }));
    }
    const behind = funds.map((f) => ({ fund: f, status: sinkingStatus(f) })).find((x) => x.status.key === "behind");
    if (behind) {
      items.push(insight("sinking-behind", "attention", 49, "Sinking fund behind schedule", `${behind.fund.name || "A sinking fund"} is ${behind.status.detail.toLowerCase()}`, { value: money(behind.status.progress.remaining), actionLabel: "Update sinking fund", actionTarget: "sinkingSection" }));
    }
    const missed = funds.find((f) => num(f.cost) > num(f.saved) && f.date && monthsUntilRaw(f.date) < 0);
    if (missed) {
      items.push(insight("sinking-missed", "attention", 50, "Sinking fund target passed", `${missed.name || "A sinking fund"} has passed its target month with ${money(num(missed.cost) - num(missed.saved))} still remaining.`, { value: money(num(missed.cost) - num(missed.saved)), actionLabel: "Update sinking fund", actionTarget: "sinkingSection" }));
    }
    const dated = funds.filter((f) => f.date && num(f.cost) > num(f.saved)).sort((a, b) => monthsUntilRaw(a.date) - monthsUntilRaw(b.date))[0];
    if (dated) {
      items.push(insight("next-sinking", "neutral", 110, "Next upcoming planned cost", `${dated.name || "A sinking fund"} is your next upcoming planned cost. It needs ${money(sinkingMonthly(dated))} per month.`, { value: money(sinkingMonthly(dated)), actionLabel: "Update sinking fund", actionTarget: "sinkingSection" }));
    }
    const largest = funds.slice().sort((a, b) => sinkingMonthly(b) - sinkingMonthly(a))[0];
    if (largest && sinkingMonthly(largest) > CURRENCY_TOLERANCE) {
      items.push(insight("largest-sinking", "neutral", 111, "Largest sinking fund contribution", `${largest.name || "A sinking fund"} requires ${money(sinkingMonthly(largest))} per month.`, { value: money(sinkingMonthly(largest)), actionLabel: "Update sinking fund", actionTarget: "sinkingSection" }));
    }
    return items;
  }

  function historyInsights(ctx) {
    const { t, lastHistory } = ctx;
    if (!lastHistory) return [insight("history-empty", "neutral", 140, "No month-on-month comparison yet", "Save at least two months to unlock month-on-month comparisons.", { actionLabel: "Save current month", actionTarget: "historySection", focusSelector: "#saveSnapshotBtn" })];
    const items = [];
    const spendDiff = t.expActual - num(lastHistory.expenses);
    if (Math.abs(spendDiff) > CURRENCY_TOLERANCE) {
      const previous = num(lastHistory.expenses);
      const pctText = previous > CURRENCY_TOLERANCE ? ` (${pct(Math.abs(spendDiff / previous) * 100)} ${spendDiff > 0 ? "higher" : "lower"})` : "";
      items.push(insight(
        "history-spending",
        spendDiff > 0 ? "attention" : "positive",
        spendDiff > 0 ? 92 : 91,
        spendDiff > 0 ? "Spending is higher than last saved month" : "Spending is lower than last saved month",
        spendDiff > 0
          ? `You have spent ${money(spendDiff)} more than the most recent saved month${pctText}.`
          : `You have spent ${money(Math.abs(spendDiff))} less than the most recent saved month${pctText}.`,
        { value: money(Math.abs(spendDiff)), actionLabel: "View history", actionTarget: "historySection" }
      ));
    }
    const savingsDiff = t.savActual - num(lastHistory.savings);
    if (Math.abs(savingsDiff) > CURRENCY_TOLERANCE) {
      items.push(insight(
        "history-savings",
        savingsDiff >= 0 ? "positive" : "neutral",
        93,
        "Savings changed since last saved month",
        savingsDiff >= 0 ? `Actual savings increased by ${money(savingsDiff)} compared with the most recent saved month.` : `Actual savings decreased by ${money(Math.abs(savingsDiff))} compared with the most recent saved month.`,
        { value: money(Math.abs(savingsDiff)), actionLabel: "View history", actionTarget: "historySection" }
      ));
    }
    const incomeDiff = t.income - num(lastHistory.income);
    if (Math.abs(incomeDiff) > CURRENCY_TOLERANCE) {
      items.push(insight("history-income", "neutral", 94, "Income changed since last saved month", incomeDiff >= 0 ? `Income is ${money(incomeDiff)} higher than the most recent saved month.` : `Income is ${money(Math.abs(incomeDiff))} lower than the most recent saved month.`, { value: money(Math.abs(incomeDiff)), actionLabel: "View history", actionTarget: "historySection" }));
    }
    return items;
  }

  function insufficientDataInsights(ctx) {
    const { t } = ctx;
    if (t.income <= CURRENCY_TOLERANCE) {
      return [insight("insufficient-income", "neutral", 5, "Add income for insights", "Add monthly income to generate personalised financial insights.", { actionLabel: "Add income", actionTarget: "incomeSection", focusSelector: "#incomeInput" })];
    }
    if (!(state.transactions || []).some((tx) => num(tx.amount) > 0)) {
      return [insight("insufficient-transactions", "neutral", 125, "Record spending for actual insights", "Record spending to compare actual costs with your budget.", { actionLabel: "Record spending", actionTarget: "transactionsSection", focusSelector: "input[aria-label='Amount']" })];
    }
    return [];
  }

  function renderInsights(totalsArg) {
    const container = document.getElementById("monthlyInsights");
    if (!container || !state) return;
    container.textContent = "";
    const items = buildInsights(totalsArg);
    if (!items.length) {
      container.appendChild(emptyState("Insights need more data", "Add income, budgets or spending to generate useful local insights.", "Add income", sectionAction("incomeSection", "#incomeInput")));
      return;
    }
    items.forEach((item) => {
      const statusText = item.type === "attention" ? "Attention required" : item.type === "positive" ? "Positive" : "Neutral";
      container.appendChild(el("article", { class: "insight insight--" + item.type, "aria-labelledby": "insight-" + item.id }, [
        el("div", { class: "insight__body" }, [
          el("span", { class: "insight__status", text: statusText }),
          el("h4", { id: "insight-" + item.id, text: item.title }),
          el("p", { text: item.message }),
        ]),
        el("div", { class: "insight__meta" }, [
          item.value ? el("strong", { class: "insight__value", text: item.value }) : null,
          item.actionLabel ? el("button", {
            class: "btn btn--sm",
            type: "button",
            onclick: sectionAction(item.actionTarget, item.focusSelector),
          }, [item.actionLabel]) : null,
        ].filter(Boolean)),
      ]));
    });
  }

  function renderAnalytics(totalsArg) {
    const panel = document.getElementById("analyticsPanel");
    if (!panel || !state) return;
    panel.textContent = "";
    const view = viewPrefs.analytics.view;
    document.querySelectorAll(".analytics-tab").forEach((btn) => {
      const active = btn.dataset.chartView === view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
      btn.setAttribute("tabindex", active ? "0" : "-1");
    });
    analyticsConfigs(view, totalsArg).forEach((config) => {
      try {
        panel.appendChild(renderChartCard(config));
      } catch (err) {
        console.error("Unable to render analytics card", config && config.title, err);
        panel.appendChild(el("div", { class: "chart-card" }, [
          el("div", { class: "analytics-card__head" }, [
            el("div", {}, [
              el("h4", { text: config && config.title ? config.title : "Analytics" }),
              el("p", { text: "This chart could not be displayed." }),
            ]),
          ]),
          emptyState("Chart unavailable", "The rest of your budget is still working. Try editing the related values or refreshing the page."),
        ]));
      }
    });
  }

  function analyticsConfigs(view, totalsArg) {
    if (view === "budget") return [budgetAnalyticsConfig(), cashFlowAnalyticsConfig(totalsArg)];
    if (view === "savings") return [savingsAnalyticsConfig()];
    if (view === "debt") return [debtAnalyticsConfig()];
    if (view === "trends") return [trendsAnalyticsConfig()];
    return [spendingAnalyticsConfig(totalsArg)];
  }

  function renderChartCard(config) {
    const children = [
      el("div", { class: "analytics-card__head" }, [
        el("div", {}, [
          el("h4", { text: config.title }),
          el("p", { text: config.description }),
        ]),
        config.controls || null,
      ].filter(Boolean)),
    ];
    if (config.empty) {
      children.push(emptyState(config.empty.title, config.empty.description, config.empty.actionText, config.empty.action));
      return el("div", { class: "chart-card" }, children.filter(Boolean));
    }
    children.push(el("p", { class: "chart-summary", text: config.summary }));
    children.push(config.visual);
    children.push(renderDataTable(config.columns, config.rows));
    return el("div", { class: "chart-card" }, children.filter(Boolean));
  }

  function renderDataTable(columns, rows) {
    const table = el("table", { class: "alloc-table analytics-table" }, [
      el("thead", {}, [el("tr", {}, columns.map((c) => el("th", { class: c.numeric ? "col-num" : "col-name", text: c.label })))]),
      el("tbody", {}, rows.map((row) => el("tr", {}, columns.map((c) => el("td", {
        class: c.numeric ? "col-num cell-calc" : "col-name",
        "data-label": c.label,
        text: row[c.key],
      }))))),
    ]);
    return el("div", { class: "table-wrap" }, [table]);
  }

  function barChart(rows, opts) {
    const options = Object.assign({ valueKey: "value", max: null, tone: "primary" }, opts || {});
    const max = options.max || Math.max(1, ...rows.map((r) => num(r[options.valueKey])));
    return el("div", { class: "bar-chart bar-chart--" + options.tone }, rows.map((row) => {
      const value = Math.max(num(row[options.valueKey]), 0);
      const width = max > 0 ? Math.min((value / max) * 100, 100) : 0;
      const detail = row.detail || row.valueLabel || money(value);
      return el("div", { class: "bar-row", tabindex: "0", title: `${row.label}: ${detail}`, "aria-label": `${row.label}: ${detail}` }, [
        el("div", { class: "bar-row__top" }, [
          el("span", { class: "bar-row__label", text: row.label }),
          el("span", { class: "bar-row__value", text: detail }),
        ]),
        el("div", { class: "bar-row__track" }, [el("span", { style: `width:${width}%` })]),
      ]);
    }));
  }

  function groupedBudgetChart(rows) {
    const max = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.actual)));
    return el("div", { class: "bar-chart bar-chart--grouped" }, rows.map((row) => {
      const plannedWidth = Math.min((row.planned / max) * 100, 100);
      const actualWidth = Math.min((row.actual / max) * 100, 100);
      return el("div", { class: "bar-row", tabindex: "0", title: `${row.label}: planned ${money(row.planned)}, actual ${money(row.actual)}`, "aria-label": `${row.label}: planned ${money(row.planned)}, actual ${money(row.actual)}, ${row.status}` }, [
        el("div", { class: "bar-row__top" }, [
          el("span", { class: "bar-row__label", text: row.label }),
          el("span", { class: row.diff < 0 ? "bar-row__value neg" : "bar-row__value pos", text: row.status }),
        ]),
        el("div", { class: "compare-bars" }, [
          el("span", { class: "compare-bars__label", text: "Planned" }),
          el("div", { class: "bar-row__track bar-row__track--planned" }, [el("span", { style: `width:${plannedWidth}%` })]),
          el("span", { class: "compare-bars__label", text: "Actual" }),
          el("div", { class: "bar-row__track" }, [el("span", { style: `width:${actualWidth}%` })]),
        ]),
      ]);
    }));
  }

  function allocationChart(t) {
    if (t.income <= CURRENCY_TOLERANCE) {
      return { empty: { title: "No income yet", description: "Add monthly income to visualise how this month is allocated.", actionText: "Add income", action: sectionAction("incomeSection", "#incomeInput") } };
    }
    const debtPayments = (state.debts || []).reduce((acc, d) => acc + num(d.payment), 0);
    const rows = [
      { label: "Tithe / Offering", value: t.tithe },
      { label: "Planned expenses", value: t.expBudgeted },
      { label: "Savings allocations", value: t.savBudgeted },
      { label: "Sinking funds", value: t.sinkingPlanned },
      { label: "Debt payments", value: debtPayments },
      { label: "Unallocated income", value: Math.max(t.unallocatedIncome, 0) },
    ].filter((row) => row.value > CURRENCY_TOLERANCE);
    const scaleBase = Math.max(t.income, rows.reduce((acc, row) => acc + row.value, 0), 1);
    const over = Math.max(t.plannedCommitments + debtPayments - t.income, 0);
    const summary = over > CURRENCY_TOLERANCE
      ? `Planned commitments exceed income by ${money(over)}.`
      : `${money(Math.max(t.unallocatedIncome, 0))} of income is not yet assigned.`;
    return {
      rows,
      visual: el("div", { class: "allocation-chart", "aria-label": "Current month income allocation" }, rows.map((row) => {
        const width = Math.max((row.value / scaleBase) * 100, 3);
        return el("span", { style: `width:${Math.min(width, 100)}%`, title: `${row.label}: ${money(row.value)}` }, [
          el("b", { text: row.label }),
          el("small", { text: money(row.value) }),
        ]);
      })),
      summary,
    };
  }

  function cashFlowAnalyticsConfig(totalsArg) {
    const t = totalsArg || totals();
    const chart = allocationChart(t);
    if (chart.empty) {
      return { title: "Current-month cash flow", description: "How this month's income has been assigned.", empty: chart.empty };
    }
    const incomeBase = Math.max(t.income, 1);
    const over = Math.max(t.plannedCommitments + (state.debts || []).reduce((acc, d) => acc + num(d.payment), 0) - t.income, 0);
    const rows = chart.rows.map((row) => ({
      allocation: row.label,
      amount: money(row.value),
      share: row.value > CURRENCY_TOLERANCE ? `${pct((row.value / incomeBase) * 100)} of income` : "0% of income",
    }));
    if (over > CURRENCY_TOLERANCE) {
      rows.push({ allocation: "Over-allocation", amount: money(over), share: "Above income" });
    }
    return {
      title: "Current-month cash flow",
      description: "How this month's income has been assigned.",
      summary: chart.summary,
      visual: chart.visual,
      columns: [{ key: "allocation", label: "Allocation" }, { key: "amount", label: "Amount", numeric: true }, { key: "share", label: "Share" }],
      rows,
    };
  }

  function spendingAnalyticsConfig(totalsArg) {
    const ctx = insightContext(totalsArg);
    const total = ctx.t.expActual + ctx.uncategorisedTotal;
    const expenseRows = (viewPrefs.analytics.showZeroSpend ? ctx.expenses : ctx.actualCategories)
      .map((row) => ({ label: row.name, value: row.actual }));
    const rows = expenseRows
      .concat(ctx.uncategorisedTotal > CURRENCY_TOLERANCE ? [{ label: "Uncategorised", value: ctx.uncategorisedTotal }] : [])
      .filter((row) => viewPrefs.analytics.showZeroSpend || row.value > CURRENCY_TOLERANCE)
      .sort((a, b) => b.value - a.value);
    const controls = el("label", { class: "chart-option" }, [
      el("input", { type: "checkbox", checked: viewPrefs.analytics.showZeroSpend ? "true" : null, onchange: (e) => { viewPrefs.analytics.showZeroSpend = e.target.checked; renderAnalytics(); } }),
      "Show zero values",
    ]);
    if (!rows.length || total <= CURRENCY_TOLERANCE) {
      return { title: "Spending by category", description: "Actual spending for the current month.", controls, empty: { title: "No spending recorded", description: "Record spending to see where your money is going.", actionText: "Record spending", action: sectionAction("transactionsSection", "input[aria-label='Amount']", "transactions") } };
    }
    const top = rows[0];
    return {
      title: "Spending by category",
      description: "Actual spending for the current month.",
      controls,
      summary: `${top.label} is the largest spending category at ${money(top.value)}, representing ${pct((top.value / total) * 100)} of recorded spending.`,
      visual: barChart(rows.map((row) => ({ label: row.label, value: row.value, detail: `${money(row.value)} · ${pct((row.value / total) * 100)}` }))),
      columns: [{ key: "category", label: "Category" }, { key: "actual", label: "Actual amount", numeric: true }, { key: "share", label: "Share", numeric: true }],
      rows: rows.map((row) => ({ category: row.label, actual: money(row.value), share: pct((row.value / total) * 100) })),
    };
  }

  function budgetAnalyticsConfig() {
    const ctx = insightContext();
    let rows = ctx.expenses.filter((row) => row.budgeted > CURRENCY_TOLERANCE || row.actual > CURRENCY_TOLERANCE).map((row) => {
      const diff = row.budgeted - row.actual;
      return {
        label: row.name,
        planned: row.budgeted,
        actual: row.actual,
        diff,
        status: diff < -CURRENCY_TOLERANCE ? `${money(Math.abs(diff))} over budget` : diff > CURRENCY_TOLERANCE ? `${money(diff)} remaining` : "On budget",
      };
    });
    const select = el("label", { class: "chart-select" }, [
      "Sort",
      el("select", { class: "input input--compact", onchange: (e) => { viewPrefs.analytics.budgetSort = e.target.value; renderAnalytics(); } }, [
        el("option", { value: "actual", text: "Largest actual spend" }),
        el("option", { value: "over", text: "Largest overspend" }),
        el("option", { value: "name", text: "Category name" }),
      ]),
    ]);
    select.querySelector("select").value = viewPrefs.analytics.budgetSort;
    if (!rows.length) {
      return { title: "Budget versus actual", description: "Compare category plans with recorded spending.", controls: select, empty: { title: "No budget comparison yet", description: "Add expense categories and record spending to compare your plan with actual costs.", actionText: "Add category", action: sectionAction("expensesSection", "input[aria-label='Category name']", "expenses") } };
    }
    if (viewPrefs.analytics.budgetSort === "over") rows.sort((a, b) => (a.diff - b.diff));
    else if (viewPrefs.analytics.budgetSort === "name") rows.sort((a, b) => a.label.localeCompare(b.label));
    else rows.sort((a, b) => b.actual - a.actual);
    const totalDiff = rows.reduce((acc, row) => acc + row.diff, 0);
    return {
      title: "Budget versus actual",
      description: "Compare category plans with recorded spending.",
      controls: select,
      summary: totalDiff < -CURRENCY_TOLERANCE ? `Actual spending is ${money(Math.abs(totalDiff))} above planned category totals.` : `Actual spending is ${money(totalDiff)} below planned category totals.`,
      visual: groupedBudgetChart(rows),
      columns: [{ key: "category", label: "Category" }, { key: "planned", label: "Planned", numeric: true }, { key: "actual", label: "Actual", numeric: true }, { key: "difference", label: "Difference", numeric: true }, { key: "status", label: "Status" }],
      rows: rows.map((row) => ({ category: row.label, planned: money(row.planned), actual: money(row.actual), difference: money(Math.abs(row.diff)), status: row.status })),
    };
  }

  function savingsAnalyticsConfig() {
    const goals = (state.goals || []).filter((g) => {
      const complete = goalCalc(g).complete;
      if (viewPrefs.analytics.savingsFilter === "active") return !complete;
      if (viewPrefs.analytics.savingsFilter === "completed") return complete;
      return true;
    });
    const filter = el("label", { class: "chart-select" }, [
      "Show",
      el("select", { class: "input input--compact", onchange: (e) => { viewPrefs.analytics.savingsFilter = e.target.value; renderAnalytics(); } }, [
        el("option", { value: "active", text: "Active" }),
        el("option", { value: "completed", text: "Completed" }),
        el("option", { value: "all", text: "All" }),
      ]),
    ]);
    filter.querySelector("select").value = viewPrefs.analytics.savingsFilter;
    if (!goals.length) {
      return { title: "Savings progress", description: "Tracked savings-goal balances only.", controls: filter, empty: { title: "No savings goals to visualise", description: "Create a savings goal to visualise progress.", actionText: "Create goal", action: sectionAction("goalsSection", "input[aria-label='Goal name']", "goals") } };
    }
    const totalTarget = sum(goals, "target");
    const totalSaved = sum(goals, "current");
    const combined = progressData(totalSaved, totalTarget);
    const rows = goals.map((g) => ({ label: g.name || "Savings goal", value: goalCalc(g).pct, saved: num(g.current), target: num(g.target) })).sort((a, b) => b.value - a.value);
    return {
      title: "Savings progress",
      description: "Tracked savings-goal balances only.",
      controls: filter,
      summary: `${money(totalSaved)} of ${money(totalTarget)} is saved across tracked goals, ${combined.pct}% complete.`,
      visual: el("div", { class: "chart-stack" }, [
        progressComponent("saved", combined, `${money(combined.remaining)} remaining across tracked goals.`),
        barChart(rows.map((row) => ({ label: row.label, value: row.value, detail: `${money(row.saved)} of ${money(row.target)} · ${row.value}%` })), { max: 100, tone: "progress" }),
      ]),
      columns: [{ key: "goal", label: "Goal" }, { key: "saved", label: "Saved", numeric: true }, { key: "target", label: "Target", numeric: true }, { key: "progress", label: "Progress", numeric: true }],
      rows: rows.map((row) => ({ goal: row.label, saved: money(row.saved), target: money(row.target), progress: `${row.value}%` })),
    };
  }

  function debtAnalyticsConfig() {
    const debts = (state.debts || []);
    const active = debts.filter((d) => num(d.balance) > CURRENCY_TOLERANCE).sort((a, b) => num(b.balance) - num(a.balance));
    if (!debts.length) {
      return { title: "Debt analytics", description: "Outstanding balances and repayment progress.", empty: { title: "No debts to visualise", description: "Add a debt to visualise outstanding balances.", actionText: "Add debt", action: sectionAction("debtSection", "input[aria-label='Debt name']", "debts") } };
    }
    const largest = active[0];
    const rows = debts
      .slice()
      .sort((a, b) => num(b.balance) - num(a.balance))
      .map((d) => ({ label: d.name || "Debt", value: num(d.balance), original: num(d.originalBalance), repaid: Math.max(num(d.originalBalance) - num(d.balance), 0), pctPaid: num(d.originalBalance) > 0 ? progressData(num(d.originalBalance) - num(d.balance), num(d.originalBalance)).pct : null }));
    const activeRows = rows.filter((row) => row.value > CURRENCY_TOLERANCE);
    return {
      title: "Debt analytics",
      description: "Outstanding balances and repayment progress.",
      summary: largest ? `Your largest recorded debt balance is ${money(num(largest.balance))} on ${largest.name || "a debt"}.` : "All tracked debts are currently cleared.",
      visual: el("div", { class: "chart-stack" }, [
        activeRows.length ? barChart(activeRows.map((row) => ({ label: row.label, value: row.value, detail: money(row.value) })), { tone: "debt" }) : el("p", { class: "empty-hint", text: "No active debt balances remain." }),
        rows.some((row) => row.pctPaid != null) ? barChart(rows.filter((row) => row.pctPaid != null).map((row) => ({ label: row.label, value: row.pctPaid, detail: `${money(row.repaid)} repaid · ${row.pctPaid}%` })), { max: 100, tone: "progress" }) : el("p", { class: "empty-hint", text: "Original balance required for repayment progress. Save monthly debt balances to unlock debt reduction trends." }),
      ]),
      columns: [{ key: "debt", label: "Debt" }, { key: "balance", label: "Current balance", numeric: true }, { key: "original", label: "Original balance", numeric: true }, { key: "repaid", label: "Repaid", numeric: true }, { key: "progress", label: "Progress" }],
      rows: rows.map((row) => ({ debt: row.label, balance: money(row.value), original: row.original > 0 ? money(row.original) : "Not entered", repaid: row.original > 0 ? money(row.repaid) : "—", progress: row.pctPaid == null ? "Original balance required" : `${row.pctPaid}% repaid` })),
    };
  }

  function trendsAnalyticsConfig() {
    const rows = sortedHistory().slice(-12);
    if (!rows.length) {
      return { title: "Monthly trends", description: "Saved monthly income, spending and savings.", empty: { title: "No saved months yet", description: "Save completed months to build a spending trend.", actionText: "Save current month", action: sectionAction("historySection", "#saveSnapshotBtn") } };
    }
    if (rows.length === 1) {
      return {
        title: "Monthly trends",
        description: "Saved monthly income, spending and savings.",
        summary: `${rows[0].label} has ${money(rows[0].expenses)} of actual spending saved. Save another month to unlock trends.`,
        visual: barChart([{ label: rows[0].label, value: num(rows[0].expenses), detail: money(rows[0].expenses) }], { tone: "trend" }),
        columns: trendColumns(),
        rows: trendRows(rows),
      };
    }
    const latest = rows[rows.length - 1];
    const previous = rows[rows.length - 2];
    const diff = num(latest.expenses) - num(previous.expenses);
    const max = Math.max(1, ...rows.map((r) => Math.max(num(r.income), num(r.expenses))));
    return {
      title: "Monthly trends",
      description: "Saved monthly income, spending and savings.",
      summary: diff > CURRENCY_TOLERANCE ? `Actual spending increased by ${money(diff)} compared with the previous saved month.` : `Actual spending decreased by ${money(Math.abs(diff))} compared with the previous saved month.`,
      visual: el("div", { class: "bar-chart bar-chart--grouped" }, rows.map((row) => {
        const incomeW = Math.min((num(row.income) / max) * 100, 100);
        const spendW = Math.min((num(row.expenses) / max) * 100, 100);
        const over = num(row.expenses) - num(row.income);
        return el("div", { class: "bar-row", tabindex: "0", "aria-label": `${row.label}: income ${money(row.income)}, actual spending ${money(row.expenses)}` }, [
          el("div", { class: "bar-row__top" }, [
            el("span", { class: "bar-row__label", text: row.label }),
            el("span", { class: over > CURRENCY_TOLERANCE ? "bar-row__value neg" : "bar-row__value", text: over > CURRENCY_TOLERANCE ? `${money(over)} over income` : money(num(row.income) - num(row.expenses)) + " difference" }),
          ]),
          el("div", { class: "compare-bars" }, [
            el("span", { class: "compare-bars__label", text: "Income" }),
            el("div", { class: "bar-row__track bar-row__track--planned" }, [el("span", { style: `width:${incomeW}%` })]),
            el("span", { class: "compare-bars__label", text: "Spending" }),
            el("div", { class: "bar-row__track" }, [el("span", { style: `width:${spendW}%` })]),
          ]),
        ]);
      })),
      columns: trendColumns(),
      rows: trendRows(rows),
    };
  }

  function sortedHistory() {
    return (state.history || []).slice().sort((a, b) => historyTime(a.monthId || a.label) - historyTime(b.monthId || b.label));
  }

  function historyTime(label) {
    if (validMonthId(label)) {
      const [y, m] = label.split("-").map((x) => parseInt(x, 10));
      return new Date(y, m - 1, 1).getTime();
    }
    const d = new Date("1 " + label);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function trendColumns() {
    return [{ key: "month", label: "Month" }, { key: "income", label: "Income", numeric: true }, { key: "spending", label: "Actual spending", numeric: true }, { key: "savings", label: "Monthly savings allocated", numeric: true }, { key: "difference", label: "Difference", numeric: true }];
  }

  function trendRows(rows) {
    return rows.map((row) => ({ month: row.label, income: money(row.income), spending: money(row.expenses), savings: money(row.savings), difference: money(num(row.income) - num(row.expenses)) }));
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
    renderGoalsSummary(items);
    const hasGoalProgress = items.some((g) => num(g.target) > 0 || num(g.current) > 0 || num(g.monthly) > 0);
    if (!items.length || !hasGoalProgress) {
      container.appendChild(emptyState("No savings goal targets yet", "Create a target for something you are working towards, such as an emergency fund or house deposit.", "Create savings goal", sectionAction("goalsSection", "input[aria-label='Goal name']", "goals")));
    }
    sortAndFilterGoals(items).forEach((g) => container.appendChild(makeGoalCard(g)));
  }

  function renderGoalsSummary(items) {
    const summary = document.getElementById("goalsSummary");
    if (!summary) return;
    const totalTarget = sum(items, "target");
    const totalSaved = sum(items, "current");
    const totalRemaining = items.reduce((acc, g) => acc + Math.max(num(g.target) - num(g.current), 0), 0);
    const completed = items.filter((g) => goalCalc(g).complete).length;
    summary.textContent = "";
    [
      summaryMetric("Target value", money(totalTarget)),
      summaryMetric("Saved", money(totalSaved)),
      summaryMetric("Remaining", money(totalRemaining)),
      summaryMetric("Completed", String(completed)),
    ].forEach((item) => summary.appendChild(item));
  }

  function sortAndFilterGoals(items) {
    const filter = viewPrefs.goals.filter;
    const sort = viewPrefs.goals.sort;
    return items
      .filter((g) => {
        const complete = goalCalc(g).complete;
        if (filter === "active") return !complete;
        if (filter === "completed") return complete;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const ca = goalCalc(a), cb = goalCalc(b);
        if (sort === "progress") return cb.pct - ca.pct;
        if (sort === "remaining") return cb.remaining - ca.remaining;
        if (sort === "name") return cleanName(a.name).localeCompare(cleanName(b.name));
        const ma = ca.months == null ? Infinity : ca.months;
        const mb = cb.months == null ? Infinity : cb.months;
        return ma - mb;
      });
  }

  function goalCalc(g) {
    const target = num(g.target), current = num(g.current), monthly = num(g.monthly);
    const progress = progressData(current, target);
    const remaining = progress.remaining;
    let months = null, date = null;
    if (remaining <= 0 && target > 0) { months = 0; }
    else if (monthly > 0 && remaining > 0) {
      months = Math.ceil(remaining / monthly);
      date = monthLabelFromOffset(months);
    }
    return { remaining, months, date, pct: progress.pct, complete: progress.complete };
  }

  function makeGoalCard(g) {
    const c = goalCalc(g);

    const name = el("input", {
      class: "goal__name editable", type: "text", value: g.name, "aria-label": "Goal name",
      oninput: (e) => {
        commitName(e.target, state.goals, g, "Savings goal", () => { renderInsights(); renderAdvisor(); });
        renderAnalytics();
      },
    });
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Delete goal", "aria-label": `Delete ${g.name || "savings"} goal`,
      onclick: () => {
        openConfirm(`Delete the ${g.name || "savings"} goal?`, "This removes the tracked savings goal, its target, current saved amount, monthly contribution, and progress calculation.", "Delete", () => {
          state.goals = state.goals.filter((x) => x.id !== g.id);
          save(); renderGoals(); renderInsights(); renderAdvisor(); renderAnalytics(); notify("Savings goal deleted");
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
              if (key === "target" && next <= 0) {
                setFieldError(e.target, "Target must be greater than £0.00.");
                return;
              }
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
              save(); refreshGoalCard(g, card); renderGoalsSummary(state.goals || []); renderInsights(); renderAdvisor(); renderSummary();
            },
          }),
        ]),
      ]);
    }

    const calcLine = el("div", { class: "goal__calc" });
    fillGoalCalc(calcLine, c);

    const progressWrap = el("div");
    fillGoalProgress(progressWrap, g, c);

    const card = el("div", { class: "goal", "data-id": g.id }, [
      el("div", { class: "goal__top" }, [name, del]),
      el("div", { class: "goal__inputs" }, [
        moneyField("Target", "target"),
        moneyField("Current saved", "current"),
        moneyField("Monthly contribution", "monthly"),
      ]),
      calcLine,
      milestoneList(c.pct),
      progressWrap,
    ]);
    card._calcLine = calcLine;
    card._progressWrap = progressWrap;
    return card;
  }

  function progressText(g, c) {
    return `${money(num(g.current))} of ${money(num(g.target))} saved — ${c.pct}% complete`;
  }

  function fillGoalCalc(node, c) {
    node.textContent = "";
    let monthsText;
    if (c.complete) monthsText = "Goal completed";
    else if (c.months == null) monthsText = "Add a monthly contribution to estimate completion.";
    else monthsText = `${c.months} month${c.months === 1 ? "" : "s"}`;
    node.appendChild(el("span", {}, ["Remaining: ", el("b", { text: money(c.remaining) })]));
    node.appendChild(el("span", {}, ["Contribution: ", el("b", { text: monthsText })]));
    if (c.date && !c.complete) {
      node.appendChild(el("span", {}, ["Estimated completion: ", el("b", { text: c.date })]));
    }
  }

  function milestoneList(progressPct) {
    return el("div", { class: "milestones", "aria-label": "Savings goal milestones" }, [
      ["Started", progressPct > 0],
      ["25%", progressPct >= 25],
      ["50%", progressPct >= 50],
      ["75%", progressPct >= 75],
      ["Complete", progressPct >= 100],
    ].map(([label, done]) => el("span", { class: done ? "is-hit" : "", text: label })));
  }

  function fillGoalProgress(node, g, c) {
    node.textContent = "";
    const progress = progressData(g.current, g.target);
    const supporting = c.complete
      ? "Goal completed."
      : c.date
        ? `At your current contribution, this goal could be completed by ${c.date}.`
        : "Add a monthly contribution to estimate completion.";
    node.appendChild(progressComponent("saved", progress, supporting));
  }

  function refreshGoalCard(g, card) {
    const c = goalCalc(g);
    fillGoalCalc(card._calcLine, c);
    fillGoalProgress(card._progressWrap, g, c);
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
    renderDebtSummary(items);
    if (!items.length) {
      body.appendChild(el("tr", {}, [el("td", { colspan: "8", "data-label": "" }, [
        emptyState("No debts being tracked", "Add a debt to calculate repayment progress and include payments in your monthly plan.", "Add debt", sectionAction("debtSection", "input[aria-label='Debt name']", "debts")),
      ])]));
    }
    sortAndFilterDebts(items).forEach((d) => body.appendChild(makeDebtRow(d)));
  }

  function renderDebtSummary(items) {
    const summary = document.getElementById("debtSummary");
    if (!summary) return;
    const active = items.filter((d) => num(d.balance) > CURRENCY_TOLERANCE);
    const cleared = items.filter((d) => cleanName(d.name) && num(d.balance) <= CURRENCY_TOLERANCE);
    const outstanding = active.reduce((acc, d) => acc + num(d.balance), 0);
    const payments = active.reduce((acc, d) => acc + num(d.payment), 0);
    const aprDebts = active.filter((d) => num(d.apr) > 0 && num(d.balance) > 0);
    const weightedApr = aprDebts.length ? aprDebts.reduce((acc, d) => acc + num(d.apr) * num(d.balance), 0) / aprDebts.reduce((acc, d) => acc + num(d.balance), 0) : null;
    summary.textContent = "";
    [
      summaryMetric("Outstanding", money(outstanding)),
      summaryMetric("Monthly payments", money(payments)),
      summaryMetric("Active debts", String(active.length)),
      summaryMetric("Cleared", String(cleared.length)),
      weightedApr == null ? null : summaryMetric("Weighted APR", `${weightedApr.toFixed(1)}%`, "Weighted by current balance"),
    ].filter(Boolean).forEach((item) => summary.appendChild(item));
  }

  function sortAndFilterDebts(items) {
    const filter = viewPrefs.debts.filter;
    const sort = viewPrefs.debts.sort;
    return items
      .filter((d) => {
        const cleared = cleanName(d.name) && num(d.balance) <= CURRENCY_TOLERANCE;
        if (filter === "active") return !cleared;
        if (filter === "completed") return cleared;
        return true;
      })
      .slice()
      .sort((a, b) => {
        if (sort === "apr") return num(b.apr) - num(a.apr);
        if (sort === "payoff") {
          const ma = debtMonths(a.balance, a.apr, a.payment);
          const mb = debtMonths(b.balance, b.apr, b.payment);
          return (ma == null || ma === Infinity ? 999999 : ma) - (mb == null || mb === Infinity ? 999999 : mb);
        }
        if (sort === "name") return cleanName(a.name).localeCompare(cleanName(b.name));
        return num(b.balance) - num(a.balance);
      });
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
            const message = decimalValidation(e.target.value, opts.label || "Amount", { required: key !== "originalBalance", max: key === "apr" ? 100 : 999999999 });
            if (message) { setFieldError(e.target, message); return; }
            const next = String(e.target.value).trim() ? Number(e.target.value) : 0;
            if (key === "payment" && num(d.balance) > 0 && next > num(d.balance)) {
              setFieldError(e.target, "Monthly payment cannot be higher than the outstanding balance.");
              return;
            }
            if (key === "originalBalance" && next > 0 && next < num(d.balance)) {
              setFieldError(e.target, "Original balance cannot be lower than the current balance.");
              return;
            }
            if (key === "balance" && next === 0) d.payment = 0;
            if (key === "balance" && num(d.payment) > next) {
              setFieldError(e.target, "Balance cannot be lower than the monthly payment already entered.");
              return;
            }
            if (key === "balance" && num(d.originalBalance) > 0 && next > num(d.originalBalance)) {
              setFieldError(e.target, "Balance cannot be higher than the original balance.");
              return;
            }
            d[key] = next;
            setFieldError(e.target, "");
          }
          save();
          payoffCell.textContent = payoffEstimateText(d);
          payoffCell.className = "col-num cell-calc " + payoffClass(d);
          progressCell.textContent = "";
          progressCell.appendChild(debtProgressNode(d));
          if (key === "apr") aprHint.textContent = num(d.apr) > 0 ? `${num(d.apr).toFixed(1)}% APR` : "APR not entered";
          renderDebtSummary(state.debts || []);
          renderInsights();
          renderAdvisor();
          renderAnalytics();
          if (key === "balance" && num(d.balance) === 0) renderDebts();
        },
      }, opts.attrs));
    }
    const name = input("name", { text: true, attrs: { type: "text", class: "cell-input cell-input--name editable", placeholder: "Card / loan", "aria-label": "Debt name" } });
    const original = input("originalBalance", { label: "Original balance", attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.01", class: "cell-input cell-input--num editable", placeholder: "Optional", "aria-label": "Original balance" } });
    const balance = input("balance", { label: "Balance", attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.01", class: "cell-input cell-input--num editable", placeholder: "0.00", "aria-label": "Balance" } });
    const apr = input("apr", { label: "APR", attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.1", class: "cell-input cell-input--num editable", placeholder: "0", "aria-label": "APR" } });
    const aprHint = el("span", { class: "logged-hint", text: num(d.apr) > 0 ? `${num(d.apr).toFixed(1)}% APR` : "APR not entered" });
    const payment = input("payment", { label: "Monthly payment", attrs: { type: "number", inputmode: "decimal", min: "0", step: "0.01", class: "cell-input cell-input--num editable", placeholder: "0.00", "aria-label": "Monthly payment" } });

    const payoffCell = el("td", { class: "col-num cell-calc " + payoffClass(d), "data-label": "Payoff" }, [payoffEstimateText(d)]);
    const progressCell = el("td", { class: "col-name debt-progress-cell", "data-label": "Progress" }, [debtProgressNode(d)]);
    const del = el("button", {
      class: "btn btn--icon", type: "button", title: "Delete debt", "aria-label": `Delete ${d.name || "debt"} debt record`,
      onclick: () => {
        openConfirm(`Delete the ${d.name || "debt"} debt record?`, "This removes the tracked debt record and payoff calculation. It does not alter historical transactions.", "Delete", () => {
          state.debts = state.debts.filter((x) => x.id !== d.id);
          save(); renderDebts(); renderInsights(); renderAdvisor(); renderAnalytics(); notify("Debt deleted");
        });
      },
    }, ["✕"]);

    return el("tr", {}, [
      el("td", { class: "col-name", "data-label": "Debt" }, [name]),
      el("td", { class: "col-num", "data-label": "Original" }, [original]),
      el("td", { class: "col-num", "data-label": "Balance" }, [balance]),
      el("td", { class: "col-num", "data-label": "APR %" }, [
        apr,
        aprHint,
      ]),
      el("td", { class: "col-num", "data-label": "Monthly" }, [payment]),
      payoffCell,
      progressCell,
      el("td", { class: "col-act", "data-label": "" }, [del]),
    ]);
  }

  function debtProgressNode(d) {
    const original = num(d.originalBalance);
    const balance = num(d.balance);
    if (balance <= CURRENCY_TOLERANCE) {
      return original > 0
        ? progressComponent("repaid", progressData(original - balance, original), "Debt cleared.")
        : el("p", { class: "progress__label", text: "Debt cleared. Add an original balance to show percentage repaid." });
    }
    if (original <= CURRENCY_TOLERANCE) {
      return el("p", { class: "progress__label", text: "Add an original balance to track percentage repaid." });
    }
    const repaid = Math.max(original - balance, 0);
    return progressComponent("repaid", progressData(repaid, original), `${money(balance)} remaining.`);
  }

  function payoffEstimateText(d) {
    if (num(d.balance) <= CURRENCY_TOLERANCE) return "Debt cleared";
    const m = debtMonths(d.balance, d.apr, d.payment);
    if (m == null) return "Add payment";
    if (m === Infinity) return "No payoff";
    return `${payoffText(d)} est.`;
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
    renderInsights();
    renderAnalytics();
    if (refreshAdvisor) renderAdvisor();
  }

  function renderSinking() {
    const body = document.getElementById("sinkingBody");
    body.textContent = "";
    const items = state.sinkingFunds || [];
    renderSinkingSummary(items);
    if (!items.length) {
      body.appendChild(el("tr", {}, [el("td", { colspan: "8", "data-label": "" }, [
        emptyState("No upcoming costs planned", "Prepare for known future expenses by saving towards them gradually.", "Add upcoming cost", sectionAction("sinkingSection", "input[aria-label='Total cost']", "sinking")),
      ])]));
    }
    sortAndFilterSinking(items).forEach((f) => body.appendChild(makeSinkingRow(f)));
    updateSinkingTotals();
  }

  function sinkingStatus(f) {
    const progress = progressData(f.saved, f.cost);
    const remaining = progress.remaining;
    const targetOffset = monthsUntilRaw(f.date);
    const requiredMonthly = sinkingMonthly(f);
    if (progress.complete) return { key: "completed", label: "Fund completed", detail: "Target amount has been reached.", requiredMonthly, progress };
    if (f.date && targetOffset < 0) return { key: "missed", label: "Target date passed", detail: `Target date has passed with ${money(remaining)} remaining.`, requiredMonthly, progress };
    if (!f.start || !f.date || num(f.cost) <= CURRENCY_TOLERANCE) {
      return { key: "unknown", label: "Schedule unavailable", detail: "Add start and target months to compare expected and actual progress.", requiredMonthly, progress };
    }
    const totalMonths = Math.max(monthsBetween(f.start, f.date), 1);
    const elapsedMonths = Math.max(Math.min(monthsBetween(f.start, monthsAheadISO(0)), totalMonths), 0);
    const expected = (num(f.cost) / totalMonths) * elapsedMonths;
    const variance = num(f.saved) - expected;
    if (variance > 5) return { key: "ahead", label: "Ahead of schedule", detail: `Ahead of schedule by ${money(variance)}.`, requiredMonthly, progress };
    if (variance < -5) return { key: "behind", label: "Behind schedule", detail: `${money(Math.abs(variance))} behind the amount expected by this month.`, requiredMonthly, progress };
    return { key: "track", label: "On track", detail: `On track for the ${formatMonth(f.date)} target.`, requiredMonthly, progress };
  }

  function monthsBetween(startIso, endIso) {
    if (!startIso || !endIso) return 0;
    const [sy, sm] = String(startIso).split("-").map((x) => parseInt(x, 10));
    const [ey, em] = String(endIso).split("-").map((x) => parseInt(x, 10));
    if (!sy || !sm || !ey || !em) return 0;
    return (ey - sy) * 12 + (em - sm) + 1;
  }

  function formatMonth(iso) {
    if (!iso || !/^\d{4}-\d{2}$/.test(String(iso))) return "target";
    const [y, m] = iso.split("-").map((x) => parseInt(x, 10));
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }

  function renderSinkingSummary(items) {
    const summary = document.getElementById("sinkingSummary");
    if (!summary) return;
    const statuses = items.map(sinkingStatus);
    const nearest = items.filter((f) => f.date && !sinkingStatus(f).progress.complete).sort((a, b) => monthsUntilRaw(a.date) - monthsUntilRaw(b.date))[0];
    summary.textContent = "";
    [
      summaryMetric("Target value", money(sum(items, "cost"))),
      summaryMetric("Saved", money(sum(items, "saved"))),
      summaryMetric("Still required", money(items.reduce((acc, f) => acc + Math.max(num(f.cost) - num(f.saved), 0), 0))),
      summaryMetric("On track", String(statuses.filter((s) => s.key === "track" || s.key === "ahead" || s.key === "completed").length)),
      summaryMetric("Behind", String(statuses.filter((s) => s.key === "behind" || s.key === "missed").length)),
      summaryMetric("Nearest target", nearest ? formatMonth(nearest.date) : "—"),
    ].forEach((item) => summary.appendChild(item));
  }

  function sortAndFilterSinking(items) {
    const filter = viewPrefs.sinking.filter;
    const sort = viewPrefs.sinking.sort;
    return items
      .filter((f) => {
        const complete = sinkingStatus(f).progress.complete;
        if (filter === "active") return !complete;
        if (filter === "completed") return complete;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const sa = sinkingStatus(a), sb = sinkingStatus(b);
        if (sort === "status") {
          const rank = { missed: 0, behind: 1, unknown: 2, track: 3, ahead: 4, completed: 5 };
          return rank[sa.key] - rank[sb.key];
        }
        if (sort === "required") return sb.requiredMonthly - sa.requiredMonthly;
        if (sort === "name") return cleanName(a.name).localeCompare(cleanName(b.name));
        return monthsUntilRaw(a.date) - monthsUntilRaw(b.date);
      });
  }

  function makeSinkingRow(f) {
    const monthlyCell = el("td", { class: "col-num cell-calc", "data-label": "/ month" }, [money(sinkingMonthly(f))]);
    const statusCell = el("td", { class: "col-name", "data-label": "Status" }, [sinkingStatusNode(f)]);
    const onEdit = () => {
      save();
      monthlyCell.textContent = money(sinkingMonthly(f));
      statusCell.textContent = "";
      statusCell.appendChild(sinkingStatusNode(f));
      renderSinkingSummary(state.sinkingFunds || []);
      updateSinkingTotals();
    };
    const name = el("input", {
      class: "cell-input cell-input--name editable", type: "text", value: f.name,
      placeholder: "Car insurance", "aria-label": "Fund name",
      oninput: (e) => { commitName(e.target, state.sinkingFunds, f, "Sinking fund", renderAnalytics); },
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
      class: "btn btn--icon", type: "button", title: "Delete fund", "aria-label": `Delete ${f.name || "sinking fund"} fund`,
      onclick: () => {
        openConfirm(`Delete the ${f.name || "sinking fund"} sinking fund?`, `This removes the tracked sinking-fund record and its ${money(sinkingMonthly(f))} monthly set-aside from planned commitments.`, "Delete", () => {
          state.sinkingFunds = state.sinkingFunds.filter((x) => x.id !== f.id);
          save(); renderSinking(); renderSummary(); renderInsights(); renderAnalytics(); notify("Sinking fund deleted");
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
      statusCell,
      el("td", { class: "col-act", "data-label": "" }, [del]),
    ]);
  }

  function sinkingStatusNode(f) {
    const status = sinkingStatus(f);
    const guidance = status.key === "behind" && status.requiredMonthly > CURRENCY_TOLERANCE
      ? ` To reach the target on time, contribute approximately ${money(status.requiredMonthly)} per month.`
      : "";
    return el("div", { class: "status-progress status-progress--" + status.key }, [
      el("strong", { text: status.label }),
      el("span", { text: status.detail + guidance }),
      progressComponent("saved", status.progress, `${money(status.progress.remaining)} remaining.`),
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

    sortedHistory().forEach((h) => {
      const del = el("button", {
        class: "btn btn--icon", type: "button", title: "Delete snapshot", "aria-label": "Delete snapshot",
        onclick: () => {
          openConfirm(`Delete ${h.label} snapshot?`, "This will remove this saved month from the history chart and trend table.", "Delete", () => {
            state.history = state.history.filter((x) => x.id !== h.id);
            save(); renderHistory(); renderAdvisor(); renderAnalytics(); notify("Snapshot deleted");
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
    const data = sortedHistory();
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
      save(); renderGoals(); renderInsights(); renderAnalytics(); notify("Savings goal added");
    } else if (listKey === "debts") {
      state.debts.push({ id: uid(), name: uniqueName(state.debts, "New debt"), originalBalance: 0, balance: 0, apr: 0, payment: 0 });
      save(); renderDebts(); renderInsights(); renderAnalytics(); notify("Debt added");
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

  function saveSnapshot(statusOverride) {
    const t = totals();
    const label = monthLabel(activeMonth, { month: "short", year: "numeric" });
    const status = statusOverride || "saved";
    const snap = {
      id: uid(), monthId: activeMonth, label,
      income: t.income, tithe: t.tithe, expenses: t.expActual, savings: t.savActual, leftover: t.leftover,
      plannedCommitments: t.plannedCommitments,
      status,
      savedAt: new Date().toISOString(),
    };
    const existing = state.history.findIndex((h) => (h.monthId || h.label) === activeMonth || h.label === label);
    if (existing >= 0) state.history[existing] = snap;
    else state.history.push(snap);
    state.status = status;
    save();
    renderHistory();
    renderOnboarding();
    renderInsights();
    renderAnalytics();
    renderMonthPanel();
    notify(status === "completed" ? "Month completed" : "Budget snapshot saved");
  }

  function completeMonth() {
    openConfirm(`Complete ${monthLabel(activeMonth)}?`, "This saves the month into history and marks it completed. You can still return to the month later to correct mistakes, but changes may alter comparisons.", "Complete month", () => {
      saveSnapshot("completed");
    });
  }

  /* ---------- Data backup, restore and CSV portability ---------- */
  let pendingDataAction = null;

  function profileName(profileId) {
    return (PROFILES[profileId] && PROFILES[profileId].label) || profileId || "Profile";
  }

  function profileStats(profileId, record) {
    const rec = record || profileRecord(profileId);
    const months = Object.values(rec.months || {});
    return {
      profiles: 1,
      months: months.length,
      transactions: months.reduce((acc, m) => acc + (m.transactions || []).length, 0),
      recurring: (rec.recurringItems || []).length,
      goals: months.reduce((acc, m) => acc + (m.goals || []).length, 0),
      sinking: months.reduce((acc, m) => acc + (m.sinkingFunds || []).length, 0),
      debts: months.reduce((acc, m) => acc + (m.debts || []).length, 0),
      range: monthRange(Object.keys(rec.months || {})),
    };
  }

  function monthRange(ids) {
    const valid = ids.filter(validMonthId).sort();
    if (!valid.length) return "No months";
    return valid[0] === valid[valid.length - 1] ? monthLabel(valid[0]) : `${monthLabel(valid[0])} to ${monthLabel(valid[valid.length - 1])}`;
  }

  function renderDataManagement() {
    const summary = document.getElementById("dataSummary");
    if (!summary || !activeProfile) return;
    const record = activeRecord();
    const stats = profileStats(activeProfile, record);
    let recovery = null;
    try { recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "null"); } catch (e) { recovery = null; }
    summary.textContent = "";
    [
      ["Active profile", profileName(activeProfile)],
      ["Monthly records", String(stats.months)],
      ["Transactions", String(stats.transactions)],
      ["Last backup", record.lastBackupAt ? new Date(record.lastBackupAt).toLocaleString("en-GB") : "No backup downloaded yet"],
      ["Data version", String(record.dataVersion || DATA_VERSION)],
      ["Recovery point", recovery ? new Date(recovery.createdAt).toLocaleString("en-GB") : "None"],
    ].forEach(([label, value]) => summary.appendChild(el("div", { class: "data-summary__item" }, [
      el("span", { class: "data-summary__label", text: label }),
      el("strong", { class: "data-summary__value", text: value }),
    ])));
  }

  function setDataStatus(message, type) {
    const node = document.getElementById("dataStatus");
    if (!node) return;
    node.textContent = message || "";
    node.className = "data-status" + (type ? " " + type : "");
  }

  function safeClone(value) {
    return JSON.parse(JSON.stringify(value, finiteReplacer));
  }

  function finiteReplacer(key, value) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Invalid number at ${key || "root"}.`);
    if (typeof value === "function") throw new Error(`Unsupported function at ${key || "root"}.`);
    return value;
  }

  function validateProfileData(record, label) {
    const errors = [];
    if (!record || typeof record !== "object") errors.push(`${label}: profile data is missing.`);
    const months = record && record.months;
    if (!months || typeof months !== "object" || Array.isArray(months)) errors.push(`${label}: monthly records are missing.`);
    Object.entries(months || {}).forEach(([monthId, month]) => {
      if (!validMonthId(monthId)) errors.push(`${label}: ${monthId} is not a valid month ID.`);
      if (!month || typeof month !== "object" || Array.isArray(month)) errors.push(`${label}: ${monthId} is not a valid monthly record.`);
      ["expenses", "savings", "goals", "debts", "sinkingFunds", "transactions", "history"].forEach((key) => {
        if (month && month[key] != null && !Array.isArray(month[key])) errors.push(`${label}: ${monthId} ${key} must be a list.`);
      });
    });
    try { JSON.stringify(record, finiteReplacer); } catch (e) { errors.push(`${label}: ${e.message}`); }
    return errors;
  }

  function createBackupEnvelope(scope) {
    if (!activeProfile || !root.profiles[activeProfile]) throw new Error("The active profile could not be found.");
    save();
    const selectedProfiles = scope === "all" ? root.profiles : { [activeProfile]: profileRecord(activeProfile) };
    Object.entries(selectedProfiles).forEach(([id, rec]) => {
      selectedProfiles[id] = migrateProfileRecord(rec, id);
      const errors = validateProfileData(selectedProfiles[id], profileName(id));
      if (errors.length) throw new Error(errors[0]);
    });
    return {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      scope: scope === "all" ? "all-profiles" : "current-profile",
      metadata: {
        dataVersion: DATA_VERSION,
        profileCount: Object.keys(selectedProfiles).length,
        activeProfile,
        activeMonth,
      },
      profiles: safeClone(selectedProfiles),
    };
  }

  function safeFilename(value) {
    return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "profile";
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadBackup() {
    const scope = document.getElementById("backupScope").value;
    const run = () => {
      try {
        const envelope = createBackupEnvelope(scope);
        const date = todayISO();
        const name = scope === "all" ? "all-profiles" : safeFilename(profileName(activeProfile));
        const json = JSON.stringify(envelope, null, 2);
        JSON.parse(json);
        downloadFile(`budget-tracker-${name}-${date}.json`, json, "application/json");
        const record = activeRecord();
        record.lastBackupAt = envelope.exportedAt;
        saveRoot();
        renderDataManagement();
        notify("Backup downloaded");
        setDataStatus("Backup created. Keep the downloaded JSON file somewhere secure.");
      } catch (e) {
        setDataStatus(e.message || "Backup could not be created.", "neg");
        notify("Backup failed", "bad");
      }
    };
    if (scope === "all") {
      openConfirm("Export all profiles?", "This downloads every locally stored profile on this browser. The file is not encrypted by the app.", "Download backup", run);
    } else run();
  }

  function readFileText(file, kind, onRead) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setDataStatus(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The import limit is 5 MB to protect browser performance.`, "neg");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onRead(String(reader.result || ""), file);
    reader.onerror = () => setDataStatus(`${kind} file could not be read.`, "neg");
    reader.readAsText(file);
  }

  function validateBackupEnvelope(envelope) {
    const errors = [], warnings = [];
    if (!envelope || typeof envelope !== "object") errors.push("Backup file is empty or invalid.");
    if (envelope && envelope.format !== BACKUP_FORMAT) errors.push("Missing or unsupported backup format identifier.");
    if (envelope && envelope.formatVersion > BACKUP_FORMAT_VERSION) errors.push("This backup was created by a newer version of the app and cannot be restored safely here.");
    if (envelope && envelope.formatVersion < BACKUP_FORMAT_VERSION) warnings.push("This older backup will be upgraded during import.");
    if (!envelope || !envelope.profiles || typeof envelope.profiles !== "object") errors.push("Backup does not contain profile data.");
    Object.entries((envelope && envelope.profiles) || {}).forEach(([id, rec]) => errors.push(...validateProfileData(rec, profileName(id))));
    return { valid: !errors.length, errors, warnings };
  }

  function restorePreview(envelope) {
    const profileIds = Object.keys(envelope.profiles || {});
    const stats = profileIds.map((id) => [id, profileStats(id, envelope.profiles[id])]);
    const rows = stats.map(([id, s]) => ({ profile: profileName(id), months: s.months, transactions: s.transactions, recurring: s.recurring, range: s.range }));
    return el("div", {}, [
      el("p", {}, ["Backup exported: ", el("b", { text: envelope.exportedAt ? new Date(envelope.exportedAt).toLocaleString("en-GB") : "Unknown" })]),
      el("p", {}, ["Format version: ", el("b", { text: String(envelope.formatVersion) }), " · Scope: ", el("b", { text: envelope.scope || "Unknown" })]),
      renderPreviewTable(["Profile", "Months", "Transactions", "Recurring", "Date range"], rows.map((r) => [r.profile, r.months, r.transactions, r.recurring, r.range])),
    ]);
  }

  function renderPreviewTable(headers, rows) {
    return el("table", { class: "preview-table" }, [
      el("thead", {}, [el("tr", {}, headers.map((h) => el("th", { text: h })))]),
      el("tbody", {}, rows.slice(0, 8).map((row) => el("tr", {}, row.map((cell, i) => el("td", { "data-label": headers[i], text: String(cell == null ? "" : cell) }))))),
    ]);
  }

  function openDataModal(title, bodyNodes, optionsNodes, confirmText, onConfirm) {
    pendingDataAction = onConfirm;
    document.getElementById("dataModalTitle").textContent = title;
    const body = document.getElementById("dataModalBody");
    const opts = document.getElementById("dataModalOptions");
    body.textContent = "";
    opts.textContent = "";
    (Array.isArray(bodyNodes) ? bodyNodes : [bodyNodes]).filter(Boolean).forEach((n) => body.appendChild(typeof n === "string" ? el("p", { text: n }) : n));
    (optionsNodes || []).forEach((n) => opts.appendChild(n));
    setActionButton(document.getElementById("dataModalConfirmBtn"), confirmText || "Confirm");
    openManagedModal("dataModal", "dataModalCancelBtn");
  }

  function closeDataModal() {
    pendingDataAction = null;
    closeManagedModal("dataModal");
  }

  function handleBackupFile(file) {
    if (!file) return;
    if (!/\.json$/i.test(file.name) && file.type && file.type !== "application/json") {
      setDataStatus("Choose a JSON backup file.", "neg");
      return;
    }
    readFileText(file, "Backup", (text) => {
      let envelope;
      try { envelope = JSON.parse(text); } catch (e) { setDataStatus("That file is not valid JSON.", "neg"); return; }
      const validation = validateBackupEnvelope(envelope);
      if (!validation.valid) {
        openDataModal("Backup cannot be restored", validation.errors.map((msg) => el("p", { text: msg })), [], "Close", closeDataModal);
        return;
      }
      const ids = Object.keys(envelope.profiles || {});
      const profileSelect = el("label", {}, ["Profile from backup", el("select", { id: "restoreProfileSelect", class: "input" }, ids.map((id) => el("option", { value: id, text: profileName(id) })))]);
      const strategy = el("label", {}, ["Restore strategy", el("select", { id: "restoreStrategy", class: "input" }, [
        el("option", { value: "merge-current", text: "Merge into current profile" }),
        el("option", { value: "replace-current", text: "Replace current profile" }),
        el("option", { value: "add-new", text: "Add as new local profile record" }),
        envelope.scope === "all-profiles" ? el("option", { value: "replace-all", text: "Replace all profiles" }) : null,
      ].filter(Boolean))]);
      const typed = el("label", {}, ["Type RESTORE to replace a profile, or REPLACE ALL to replace every profile", el("input", { id: "restoreConfirmText", class: "input", type: "text", placeholder: "Required for destructive restores" })]);
      openDataModal("Review backup restore", [restorePreview(envelope)].concat(validation.warnings.map((w) => el("p", { text: w }))), [profileSelect, strategy, typed], "Apply restore", () => applyRestore(envelope));
    });
  }

  function createRecoveryPoint(scope) {
    try {
      const payload = { createdAt: new Date().toISOString(), scope: scope || "all", root: safeClone(root) };
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      setDataStatus("There is not enough browser storage to create a recovery point safely.", "neg");
      return false;
    }
  }

  function applyRestore(envelope) {
    try {
      const strategy = document.getElementById("restoreStrategy").value;
      const selectedId = document.getElementById("restoreProfileSelect").value;
      const typed = cleanName(document.getElementById("restoreConfirmText").value).toUpperCase();
      if ((strategy === "replace-current" && typed !== "RESTORE") || (strategy === "replace-all" && typed !== "REPLACE ALL")) {
        setDataStatus(strategy === "replace-all" ? "Type REPLACE ALL before replacing every profile." : "Type RESTORE before replacing the current profile.", "neg");
        return;
      }
      if (!createRecoveryPoint(strategy)) return;
      const nextRoot = safeClone(root);
      if (strategy === "replace-all") {
        nextRoot.profiles = safeClone(envelope.profiles);
      } else if (strategy === "replace-current") {
        nextRoot.profiles[activeProfile] = safeClone(envelope.profiles[selectedId]);
        nextRoot.profiles[activeProfile].passHash = root.profiles[activeProfile].passHash;
      } else if (strategy === "add-new") {
        const newId = uniqueProfileId(selectedId);
        nextRoot.profiles[newId] = safeClone(envelope.profiles[selectedId]);
        nextRoot.profiles[newId].passHash = "";
      } else {
        mergeProfile(nextRoot.profiles[activeProfile], envelope.profiles[selectedId]);
      }
      Object.entries(nextRoot.profiles || {}).forEach(([id, rec]) => {
        const errors = validateProfileData(migrateProfileRecord(rec, id), profileName(id));
        if (errors.length) throw new Error(errors[0]);
      });
      root = nextRoot;
      if (!root.profiles[activeProfile]) activeProfile = Object.keys(root.profiles || {})[0] || "josh";
      const record = profileRecord(activeProfile);
      activeMonth = record.activeMonth;
      state = record.state;
      saveRoot();
      closeDataModal();
      renderAll();
      notify("Backup restored");
      setDataStatus("Restore complete. A recent local recovery point was created before the change.");
    } catch (e) {
      setDataStatus(e.message || "Restore could not be completed.", "neg");
      notify("Restore failed", "bad");
    }
  }

  function uniqueProfileId(base) {
    const clean = safeFilename(base || "imported");
    let id = clean || "imported";
    let i = 2;
    while (root.profiles[id]) id = `${clean}-${i++}`;
    return id;
  }

  function mergeProfile(target, imported) {
    target.months = target.months || {};
    Object.entries(imported.months || {}).forEach(([monthId, month]) => {
      if (!target.months[monthId]) target.months[monthId] = safeClone(month);
    });
    target.recurringItems = mergeById(target.recurringItems || [], imported.recurringItems || []);
    target.history = mergeById(target.history || [], imported.history || []);
  }

  function mergeById(existing, incoming) {
    const ids = new Set(existing.map((item) => item.id).filter(Boolean));
    const out = existing.slice();
    incoming.forEach((item) => { if (!item.id || !ids.has(item.id)) out.push(safeClone(item)); });
    return out;
  }

  function restoreRecoveryPoint() {
    let recovery = null;
    try { recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "null"); } catch (e) { recovery = null; }
    if (!recovery || !recovery.root) { setDataStatus("No recent local recovery point is available.", "neg"); return; }
    openConfirm("Restore recent local recovery point?", "This recovery point is stored only in this browser and may be removed if browser storage is cleared.", "Restore", () => {
      root = recovery.root;
      if (!root.profiles[activeProfile]) activeProfile = Object.keys(root.profiles || {})[0] || "josh";
      const record = profileRecord(activeProfile);
      activeMonth = record.activeMonth;
      state = record.state;
      saveRoot();
      renderAll();
      notify("Recovery point restored");
    });
  }

  function clearRecoveryPoint() {
    openConfirm("Remove recovery point?", "This deletes the latest local recovery point from this browser. Your current budget data will not be changed.", "Remove", () => {
      localStorage.removeItem(RECOVERY_KEY);
      renderDataManagement();
      setDataStatus("Recent local recovery point removed.");
      notify("Recovery point removed");
    });
  }

  function csvText(rows) {
    return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  }

  function csvCell(value) {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    let text = String(value == null ? "" : value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function scopedProfileMonths(scope) {
    const profiles = scope === "all-profiles" ? Object.entries(root.profiles || {}) : [[activeProfile, activeRecord()]];
    return profiles.flatMap(([profileId, rec]) => Object.entries(rec.months || {})
      .filter(([monthId]) => scope !== "current-month" || monthId === activeMonth)
      .map(([monthId, month]) => ({ profileId, rec, monthId, month })));
  }

  function exportCsv() {
    const type = document.getElementById("csvExportType").value;
    const scope = document.getElementById("csvScope").value;
    const rows = csvRows(type, scope);
    const filename = `budget-tracker-${type}-${scope}-${todayISO()}.csv`;
    downloadFile(filename, csvText(rows), "text/csv;charset=utf-8");
    notify("CSV exported");
    setDataStatus("CSV exports are for spreadsheets and reporting. Use JSON backup to preserve the complete app structure.");
  }

  function csvRows(type, scope) {
    const months = scopedProfileMonths(scope);
    if (type === "transactions") return [["Transaction ID", "Profile", "Month", "Date", "Description", "Category", "Amount", "Note", "Created date", "Updated date"]].concat(months.flatMap(({ profileId, monthId, month }) => (month.transactions || []).map((tx) => [tx.id, profileName(profileId), monthId, tx.date, tx.note || "", tx.category || "", num(tx.amount), tx.note || "", tx.createdAt || "", tx.updatedAt || ""])));
    if (type === "monthly-summary") return [["Month ID", "Month label", "Status", "Income", "Planned commitments", "Planned expenses", "Actual spending", "Savings allocations", "Sinking-fund contributions", "Planned debt payments", "Safe to spend", "Remaining budget", "Actual cash remaining", "Unallocated income", "Saved date"]].concat(months.map(({ monthId, month }) => monthSummaryRow(monthId, month)));
    if (type === "budget-actual") return [["Month", "Category ID", "Category name", "Planned amount", "Actual amount", "Difference", "Status", "Transaction count"]].concat(months.flatMap(({ monthId, month }) => budgetRows(monthId, month)));
    if (type === "recurring") return [["Profile", "ID", "Type", "Name", "Amount", "Frequency", "Start month", "End month", "Payment day", "Status", "Note"]].concat((scope === "all-profiles" ? Object.entries(root.profiles || {}) : [[activeProfile, activeRecord()]]).flatMap(([profileId, rec]) => (rec.recurringItems || []).map((item) => [profileName(profileId), item.id, item.type, item.name, num(item.amount), item.frequency, item.start, item.end || "", item.day || "", item.status || "active", item.note || ""])));
    if (type === "goals") return [["Profile", "Goal ID", "Name", "Target amount", "Saved amount", "Remaining amount", "Percentage complete", "Monthly contribution", "Estimated completion", "Status"]].concat(months.flatMap(({ profileId, month }) => (month.goals || []).map((g) => { const c = goalCalc(g); return [profileName(profileId), g.id, g.name, num(g.target), num(g.current), c.remaining, c.pct, num(g.monthly), c.date || "", c.complete ? "Complete" : "Active"]; })));
    if (type === "sinking") return [["Profile", "Fund ID", "Name", "Target amount", "Saved amount", "Remaining amount", "Start month", "Target month", "Required monthly contribution", "Planned monthly contribution", "Schedule status", "Percentage complete"]].concat(months.flatMap(({ profileId, month }) => (month.sinkingFunds || []).map((f) => { const s = sinkingStatusForMonth(f, month); return [profileName(profileId), f.id, f.name, num(f.cost), num(f.saved), s.progress.remaining, f.start || "", f.date || "", s.requiredMonthly, s.requiredMonthly, s.label, s.progress.pct]; })));
    return [["Profile", "Debt ID", "Name", "Original balance", "Current balance", "Amount repaid", "Percentage repaid", "APR", "Planned payment", "Estimated payoff", "Status"]].concat(months.flatMap(({ profileId, month }) => (month.debts || []).map((d) => { const original = num(d.originalBalance); const repaid = original > 0 ? Math.max(original - num(d.balance), 0) : ""; return [profileName(profileId), d.id, d.name, original || "", num(d.balance), repaid, original > 0 ? progressData(repaid, original).pct : "", num(d.apr), num(d.payment), payoffText(d), num(d.balance) <= CURRENCY_TOLERANCE ? "Cleared" : "Active"]; })));
  }

  function monthSummaryRow(monthId, month) {
    const old = state;
    state = month;
    let t;
    try { t = totals(); }
    finally { state = old; }
    const debtPayments = (month.debts || []).reduce((a, d) => a + num(d.payment), 0);
    return [monthId, monthLabel(monthId), month.status || "draft", t.income, t.plannedCommitments, t.expBudgeted, t.expActual, t.savBudgeted, t.sinkingPlanned, debtPayments, t.safeToSpend, t.remainingBudget, t.actualCashRemaining, t.unallocatedIncome, month.updatedAt || ""];
  }

  function budgetRows(monthId, month) {
    const txTotals = (month.transactions || []).reduce((acc, tx) => { const key = tx.category || "Uncategorised"; acc[key] = (acc[key] || 0) + num(tx.amount); return acc; }, {});
    return (month.expenses || []).map((e) => {
      const actual = num(e.actual) + num(txTotals[e.name]);
      const diff = num(e.budgeted) - actual;
      const txCount = (month.transactions || []).filter((tx) => tx.category === e.name).length;
      const status = num(e.budgeted) <= CURRENCY_TOLERANCE ? "No planned amount" : diff < -CURRENCY_TOLERANCE ? "Over budget" : diff > CURRENCY_TOLERANCE ? "Under budget" : "On budget";
      return [monthId, e.id, e.name, num(e.budgeted), actual, diff, status, txCount];
    });
  }

  function sinkingStatusForMonth(f, month) {
    const old = state;
    state = month;
    let status;
    try { status = sinkingStatus(f); }
    finally { state = old; }
    return status;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (quoted && ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === ",") { row.push(cell); cell = ""; }
      else if (!quoted && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => cleanName(c)));
  }

  function downloadTemplate() {
    const type = document.getElementById("csvImportType").value;
    const headers = type === "transactions" ? ["Date", "Description", "Category", "Amount", "Note"]
      : type === "expense-budgets" ? ["Month", "Category", "Planned amount"]
        : ["Type", "Name", "Amount", "Frequency", "Start month", "End month", "Payment day", "Note"];
    downloadFile(`budget-tracker-${type}-template.csv`, csvText([headers]), "text/csv;charset=utf-8");
  }

  function handleCsvFile(file) {
    if (!file) return;
    readFileText(file, "CSV", (text) => {
      const type = document.getElementById("csvImportType").value;
      const parsed = previewCsvImport(type, parseCsv(text), file.name);
      if (parsed.errors.length && !parsed.validRows.length) {
        openDataModal("CSV cannot be imported", parsed.errors.slice(0, 8).map((msg) => el("p", { text: msg })), [], "Close", closeDataModal);
        return;
      }
      const categoryChoice = el("label", {}, ["Unknown categories", el("select", { id: "csvCategoryChoice", class: "input" }, [
        el("option", { value: "uncategorised", text: "Import as uncategorised" }),
        el("option", { value: "create", text: "Create missing categories" }),
        el("option", { value: "skip", text: "Skip affected rows" }),
      ])]);
      const duplicateChoice = el("label", {}, ["Likely duplicates", el("select", { id: "csvDuplicateChoice", class: "input" }, [
        el("option", { value: "skip", text: "Skip likely duplicates" }),
        el("option", { value: "import", text: "Import them anyway" }),
      ])]);
      openDataModal("Review CSV import", csvImportSummary(parsed), [categoryChoice, duplicateChoice], "Import rows", () => applyCsvImport(parsed));
    });
  }

  function previewCsvImport(type, rows, filename) {
    const expected = type === "transactions" ? ["date", "description", "category", "amount", "note"]
      : type === "expense-budgets" ? ["month", "category", "planned amount"]
        : ["type", "name", "amount", "frequency", "start month", "end month", "payment day", "note"];
    const headers = (rows[0] || []).map((h) => cleanName(h).toLowerCase());
    const errors = [];
    expected.forEach((h) => { if (!headers.includes(h)) errors.push(`Missing column: ${h}`); });
    const body = errors.length ? [] : rows.slice(1);
    const knownCategories = new Set((state.expenses || []).map((e) => cleanName(e.name).toLowerCase()));
    const validRows = [], invalidRows = [], duplicates = [], unknownCategories = new Set();
    body.forEach((row, index) => {
      const item = Object.fromEntries(headers.map((h, i) => [h, cleanName(row[i])]));
      const line = index + 2;
      const issue = validateCsvRow(type, item);
      if (issue) invalidRows.push({ line, issue });
      else {
        if (type === "transactions" && item.category && !knownCategories.has(cleanName(item.category).toLowerCase())) unknownCategories.add(item.category);
        if (type === "transactions" && likelyDuplicateTx(item)) duplicates.push(line);
        validRows.push({ line, item });
      }
    });
    return { type, filename, errors, validRows, invalidRows, duplicates, unknownCategories: Array.from(unknownCategories) };
  }

  function validateCsvRow(type, item) {
    if (type === "transactions") {
      if (!isValidISODate(item.date)) return "Invalid date.";
      if (!item.description) return "Description is required.";
      return decimalValidation(item.amount, "Amount");
    }
    if (type === "expense-budgets") {
      if (!validMonthId(item.month)) return "Month must use YYYY-MM.";
      if (!item.category) return "Category is required.";
      return decimalValidation(item["planned amount"], "Planned amount");
    }
    const recurring = { type: item.type, name: item.name, amount: Number(item.amount), frequency: item.frequency, start: item["start month"], end: item["end month"], day: item["payment day"] };
    return recurringValidation(recurring, "");
  }

  function isValidISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }

  function likelyDuplicateTx(item) {
    const monthId = item.date.slice(0, 7);
    const month = activeRecord().months[monthId];
    if (!month) return false;
    return (month.transactions || []).some((tx) => tx.date === item.date && num(tx.amount) === num(item.amount) && cleanName(tx.note).toLowerCase() === cleanName(item.description).toLowerCase() && cleanName(tx.category).toLowerCase() === cleanName(item.category).toLowerCase());
  }

  function csvImportSummary(parsed) {
    return [
      el("p", {}, ["File: ", el("b", { text: parsed.filename }), " · Type: ", el("b", { text: parsed.type })]),
      el("p", { text: `${parsed.validRows.length} valid rows, ${parsed.invalidRows.length} invalid rows, ${parsed.duplicates.length} likely duplicates.` }),
      parsed.unknownCategories.length ? el("p", { text: `Unknown categories: ${parsed.unknownCategories.slice(0, 8).join(", ")}` }) : null,
      parsed.invalidRows.length ? el("p", { text: `First invalid row: line ${parsed.invalidRows[0].line}, ${parsed.invalidRows[0].issue}` }) : null,
      renderPreviewTable(["Line", "Sample"], parsed.validRows.slice(0, 5).map((r) => [r.line, Object.values(r.item).join(" · ")])),
    ].filter(Boolean);
  }

  function applyCsvImport(parsed) {
    if (!createRecoveryPoint("csv-import")) return;
    const categoryChoice = document.getElementById("csvCategoryChoice").value;
    const duplicateChoice = document.getElementById("csvDuplicateChoice").value;
    const nextRoot = safeClone(root);
    const rec = migrateProfileRecord(nextRoot.profiles[activeProfile], activeProfile);
    let imported = 0, skipped = 0, categoriesCreated = 0;
    parsed.validRows.forEach(({ item }) => {
      if (parsed.type === "transactions") {
        const monthId = item.date.slice(0, 7);
        const month = rec.months[monthId] || blankMonthFor(activeProfile, monthId, rec.state);
        rec.months[monthId] = month;
        const known = (month.expenses || []).find((e) => cleanName(e.name).toLowerCase() === cleanName(item.category).toLowerCase());
        let category = known ? known.name : item.category;
        if (!known && category) {
          if (categoryChoice === "skip") { skipped++; return; }
          if (categoryChoice === "create") { month.expenses.push({ id: uid(), name: category, budgeted: 0, actual: 0 }); categoriesCreated++; }
          else category = "";
        }
        if (duplicateChoice === "skip" && likelyDuplicateTxForMonth(month, item, category)) { skipped++; return; }
        month.transactions.push({ id: uid(), date: item.date, category, note: item.description || item.note || "", amount: Number(item.amount), createdAt: new Date().toISOString() });
        imported++;
      } else if (parsed.type === "expense-budgets") {
        const month = rec.months[item.month] || blankMonthFor(activeProfile, item.month, rec.state);
        rec.months[item.month] = month;
        const existing = month.expenses.find((e) => cleanName(e.name).toLowerCase() === cleanName(item.category).toLowerCase());
        if (existing) existing.budgeted = Number(item["planned amount"]);
        else month.expenses.push({ id: uid(), name: item.category, budgeted: Number(item["planned amount"]), actual: 0 });
        imported++;
      } else {
        rec.recurringItems = rec.recurringItems || [];
        rec.recurringItems.push({ id: uid(), type: item.type, name: item.name, amount: Number(item.amount), frequency: item.frequency, start: item["start month"], end: item["end month"], day: item["payment day"], note: item.note, status: "active", createdAt: new Date().toISOString() });
        imported++;
      }
    });
    nextRoot.profiles[activeProfile] = rec;
    root = nextRoot;
    const record = profileRecord(activeProfile);
    activeMonth = record.activeMonth;
    state = record.state;
    saveRoot();
    closeDataModal();
    renderAll();
    notify("CSV imported");
    setDataStatus(`${imported} rows imported, ${skipped} skipped, ${categoriesCreated} categories created. A recovery point was created first.`);
  }

  function likelyDuplicateTxForMonth(month, item, category) {
    return (month.transactions || []).some((tx) => tx.date === item.date && num(tx.amount) === num(item.amount) && cleanName(tx.note).toLowerCase() === cleanName(item.description || item.note).toLowerCase() && cleanName(tx.category).toLowerCase() === cleanName(category).toLowerCase());
  }

  function resetAll() {
    openConfirm(`Reset ${profileMeta(activeProfile).label}'s data?`, "This will restore this profile to the default budget and delete its current categories, goals, transactions, debts, sinking funds, and history. A recovery point will be created first.", "Reset", () => {
      if (!createRecoveryPoint("profile-reset")) return;
      const record = profileRecord(activeProfile);
      activeMonth = currentMonthId();
      state = normaliseMonthlyState(Object.assign(defaultsFor(activeProfile), { monthId: activeMonth, history: [] }), activeProfile, activeMonth, []);
      record.months = { [activeMonth]: state };
      record.activeMonth = activeMonth;
      record.state = state;
      record.history = state.history;
      record.recurringItems = [];
      saveRoot();
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
  document.getElementById("activeMonthInput").addEventListener("change", (e) => {
    const message = monthValidation(e.target.value, "Budget month", { allowPast: true });
    setFieldError(e.target, message);
    if (message) return;
    switchMonth(e.target.value);
  });
  document.getElementById("prevMonthBtn").addEventListener("click", () => switchMonth(monthIdFromOffset(activeMonth, -1)));
  document.getElementById("nextMonthBtn").addEventListener("click", () => switchMonth(monthIdFromOffset(activeMonth, 1)));
  document.getElementById("currentMonthBtn").addEventListener("click", () => switchMonth(currentMonthId()));
  document.getElementById("startNextMonthBtn").addEventListener("click", () => openRollover("next", monthIdFromOffset(activeMonth, 1)));
  document.getElementById("copyPreviousMonthBtn").addEventListener("click", () => openRollover("copy", activeMonth));
  document.getElementById("recurringForm").addEventListener("submit", saveRecurringFromForm);
  document.getElementById("rolloverCancelBtn").addEventListener("click", closeRollover);
  document.getElementById("rolloverConfirmBtn").addEventListener("click", confirmRollover);
  resetRecurringForm();
  [
    ["goalsSort", "goals", "sort", renderGoals],
    ["goalsFilter", "goals", "filter", renderGoals],
    ["sinkingSort", "sinking", "sort", renderSinking],
    ["sinkingFilter", "sinking", "filter", renderSinking],
    ["debtSort", "debts", "sort", renderDebts],
    ["debtFilter", "debts", "filter", renderDebts],
  ].forEach(([id, scope, key, render]) => {
    const control = document.getElementById(id);
    if (!control) return;
    control.value = viewPrefs[scope][key];
    control.addEventListener("change", (e) => {
      viewPrefs[scope][key] = e.target.value;
      render();
    });
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
  document.querySelectorAll(".analytics-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewPrefs.analytics.view = btn.dataset.chartView || "spending";
      renderAnalytics();
      btn.focus();
    });
    btn.addEventListener("keydown", (e) => {
      const tabs = Array.from(document.querySelectorAll(".analytics-tab"));
      const current = tabs.indexOf(e.currentTarget);
      let next = current;
      if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      else return;
      e.preventDefault();
      tabs[next].click();
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
  document.getElementById("saveSnapshotBtn").addEventListener("click", () => saveSnapshot());
  document.getElementById("completeMonthBtn").addEventListener("click", completeMonth);
  document.getElementById("resetBtn").addEventListener("click", resetAll);
  document.getElementById("authForm").addEventListener("submit", submitLogin);
  document.getElementById("authBackBtn").addEventListener("click", () => {
    pendingProfile = "";
    document.getElementById("authForm").hidden = true;
  });
  document.querySelector(".profile-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-profile-login]");
    if (btn) startLogin(btn.getAttribute("data-profile-login"));
  });
  document.getElementById("profileSwitchBtn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_PROFILE_KEY);
    activeProfile = "";
    activeMonth = "";
    state = null;
    showAuth();
  });
  document.getElementById("lockBtn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_PROFILE_KEY);
    activeProfile = "";
    activeMonth = "";
    state = null;
    showAuth();
  });
  document.addEventListener("keydown", handleModalKeydown);
  document.getElementById("downloadBackupBtn").addEventListener("click", (e) => {
    runButtonAction(e.currentTarget, "Preparing...", downloadBackup);
  });
  document.getElementById("restoreBackupBtn").addEventListener("click", () => document.getElementById("restoreBackupInput").click());
  document.getElementById("restoreBackupInput").addEventListener("change", (e) => {
    handleBackupFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("exportCsvBtn").addEventListener("click", (e) => {
    runButtonAction(e.currentTarget, "Exporting...", exportCsv);
  });
  document.getElementById("downloadTemplateBtn").addEventListener("click", (e) => {
    runButtonAction(e.currentTarget, "Preparing...", downloadTemplate);
  });
  document.getElementById("importCsvBtn").addEventListener("click", () => document.getElementById("csvImportInput").click());
  document.getElementById("csvImportInput").addEventListener("change", (e) => {
    handleCsvFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("restoreRecoveryBtn").addEventListener("click", restoreRecoveryPoint);
  document.getElementById("clearRecoveryBtn").addEventListener("click", clearRecoveryPoint);
  document.getElementById("dataModalCancelBtn").addEventListener("click", closeDataModal);
  document.getElementById("dataModal").addEventListener("click", (e) => {
    if (e.target.id === "dataModal") closeDataModal();
  });
  document.getElementById("dataModalConfirmBtn").addEventListener("click", () => {
    const action = pendingDataAction;
    if (action) runButtonAction(document.getElementById("dataModalConfirmBtn"), "Working...", action);
  });
  document.getElementById("confirmCancelBtn").addEventListener("click", closeConfirm);
  document.getElementById("confirmModal").addEventListener("click", (e) => {
    if (e.target.id === "confirmModal") closeConfirm();
  });
  document.getElementById("confirmOkBtn").addEventListener("click", () => {
    if (document.getElementById("confirmOkBtn").disabled) return;
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
