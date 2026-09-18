const STORAGE_KEY = "asset-compass-state-v3";
const THEME_KEY = "asset-compass-theme";
const AUTH_KEY = "asset-compass-auth-v1";
const ALL_OWNERS = "all";

const categories = [
  { name: "现金", color: "#2f6fb0" },
  { name: "基金", color: "#167a5b" },
  { name: "股票", color: "#b87916" },
  { name: "房产", color: "#7a5cbb" },
  { name: "债券", color: "#2b8b84" },
  { name: "其他", color: "#b5484d" }
];

const defaultPeople = [
  { id: "p1", name: "Levi" },
  { id: "p2", name: "Vicky" }
];

const emptyState = {
  people: defaultPeople,
  assets: []
};

let state = loadState();
let activeView = "overview";
let activeOwnerId = ALL_OWNERS;

const els = {
  authScreen: document.querySelector("#authScreen"),
  authForm: document.querySelector("#authForm"),
  authTitle: document.querySelector("#authTitle"),
  authUsername: document.querySelector("#authUsername"),
  authPassword: document.querySelector("#authPassword"),
  authSubmit: document.querySelector("#authSubmit"),
  authMessage: document.querySelector("#authMessage"),
  ownerSwitch: document.querySelector("#ownerSwitch"),
  totalValue: document.querySelector("#totalValue"),
  totalCost: document.querySelector("#totalCost"),
  totalProfit: document.querySelector("#totalProfit"),
  profitRate: document.querySelector("#profitRate"),
  totalChange: document.querySelector("#totalChange"),
  topCategory: document.querySelector("#topCategory"),
  categoryDonut: document.querySelector("#categoryDonut"),
  categoryList: document.querySelector("#categoryList"),
  assetList: document.querySelector("#assetList"),
  historyChart: document.querySelector("#historyChart"),
  historyRange: document.querySelector("#historyRange"),
  peopleList: document.querySelector("#peopleList"),
  toast: document.querySelector("#toast"),
  dialog: document.querySelector("#assetDialog"),
  form: document.querySelector("#assetForm")
};

init();

function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  fillCategoryOptions();
  fillOwnerOptions();
  bindEvents();
  prepareAuth();
  registerServiceWorker();
  render();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelector("#themeToggle").addEventListener("click", () => {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });
  document.querySelector("#lockButton").addEventListener("click", lockApp);

  document.querySelector("#addAssetButton").addEventListener("click", () => openAssetDialog());
  document.querySelector("#closeDialog").addEventListener("click", () => els.dialog.close());
  document.querySelector("#snapshotButton").addEventListener("click", saveSnapshot);
  document.querySelector("#exportButton").addEventListener("click", exportData);
  document.querySelector("#importInput").addEventListener("change", importData);
  document.querySelector("#resetButton").addEventListener("click", resetSample);
  document.querySelector("#deleteAssetButton").addEventListener("click", deleteCurrentAsset);

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAssetFromForm();
  });

  els.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAuthSubmit();
  });
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `${view}View`);
  });
  render();
}

function prepareAuth() {
  const hasAuth = Boolean(loadAuth());
  hideToast();
  els.authTitle.textContent = hasAuth ? "登录" : "设置登录";
  els.authSubmit.textContent = hasAuth ? "登录" : "保存并进入";
  els.authUsername.value = "";
  els.authPassword.value = "";
  els.authMessage.textContent = hasAuth ? "" : "首次使用需要设置账户名和密码。";

  if (sessionStorage.getItem("asset-compass-unlocked") === "1" && hasAuth) {
    unlockApp();
    return;
  }

  document.body.classList.add("locked");
  setTimeout(() => els.authUsername.focus(), 100);
}

async function handleAuthSubmit() {
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;
  const auth = loadAuth();

  if (!username || !password) {
    els.authMessage.textContent = "请输入账户名和密码。";
    return;
  }

  if (!auth) {
    const salt = makeSalt();
    const passwordHash = await hashPassword(password, salt);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ username, salt, passwordHash }));
    sessionStorage.setItem("asset-compass-unlocked", "1");
    unlockApp();
    showToast("登录已设置");
    return;
  }

  const passwordHash = await hashPassword(password, auth.salt);
  if (username === auth.username && passwordHash === auth.passwordHash) {
    sessionStorage.setItem("asset-compass-unlocked", "1");
    unlockApp();
    return;
  }

  els.authPassword.value = "";
  els.authMessage.textContent = "账户名或密码不正确。";
}

function unlockApp() {
  document.body.classList.remove("locked");
  els.authMessage.textContent = "";
}

function lockApp() {
  sessionStorage.removeItem("asset-compass-unlocked");
  els.authPassword.value = "";
  hideToast();
  prepareAuth();
}

function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch (error) {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

function makeSalt() {
  const values = new Uint32Array(4);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16)).join("");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

async function hashPassword(password, salt) {
  const input = `${salt}:${password}`;
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return fallbackHash(input);
}

function fallbackHash(input) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

function render() {
  ensureActiveOwner();
  renderOwnerSwitch();
  renderPeopleList();
  const metrics = getMetrics(getVisibleAssets());
  renderHero(metrics);
  renderCategories(metrics);
  renderAssets();
  renderHistory();
}

function renderOwnerSwitch() {
  const totalValue = state.assets.reduce((sum, asset) => sum + asset.value, 0);
  const options = [
    { id: ALL_OWNERS, name: "合并", value: totalValue },
    ...state.people.map((person) => ({
      id: person.id,
      name: person.name,
      value: state.assets
        .filter((asset) => asset.ownerId === person.id)
        .reduce((sum, asset) => sum + asset.value, 0)
    }))
  ];

  els.ownerSwitch.innerHTML = options.map((option) => `
    <button class="owner-button ${activeOwnerId === option.id ? "is-active" : ""}" type="button" data-owner="${option.id}">
      <strong>${escapeHtml(option.name)}</strong>
      <span>${formatCompactMoney(option.value)}</span>
    </button>
  `).join("");

  els.ownerSwitch.querySelectorAll("[data-owner]").forEach((button) => {
    button.addEventListener("click", () => {
      activeOwnerId = button.dataset.owner;
      render();
    });
  });
}

function renderPeopleList() {
  els.peopleList.innerHTML = state.people.map((person, index) => {
    const total = state.assets
      .filter((asset) => asset.ownerId === person.id)
      .reduce((sum, asset) => sum + asset.value, 0);
    return `
      <div class="person-row">
        <div>
          <label for="person-${person.id}">第 ${index + 1} 个人</label>
          <input id="person-${person.id}" value="${escapeHtml(person.name)}" data-person-name="${person.id}" maxlength="12">
        </div>
        <span class="person-total">${formatCompactMoney(total)}</span>
      </div>
    `;
  }).join("");

  els.peopleList.querySelectorAll("[data-person-name]").forEach((input) => {
    input.addEventListener("input", () => {
      const nextName = input.value.trim() || "未命名";
      state.people = state.people.map((person) => (
        person.id === input.dataset.personName ? { ...person, name: nextName } : person
      ));
      persist();
      fillOwnerOptions();
      renderOwnerSwitch();
    });
  });
}

function renderHero(metrics) {
  els.totalValue.textContent = formatMoney(metrics.totalValue);
  els.totalCost.textContent = formatCompactMoney(metrics.totalCost);
  els.totalProfit.textContent = formatCompactMoney(metrics.totalProfit);
  els.totalProfit.classList.toggle("loss", metrics.totalProfit < 0);
  els.profitRate.textContent = formatPercent(metrics.profitRate);

  const changeClass = metrics.changeValue < 0 ? "trend-pill loss" : "trend-pill";
  els.totalChange.innerHTML = `
    <span class="${changeClass}">${metrics.changeValue >= 0 ? "+" : ""}${formatCompactMoney(metrics.changeValue)}</span>
    <span>较上次快照 ${metrics.changeRate >= 0 ? "+" : ""}${formatPercent(metrics.changeRate)}</span>
  `;

  const top = metrics.categories[0];
  els.topCategory.textContent = top ? `${top.name} ${formatPercent(top.ratio)}` : "暂无分布";
  els.categoryDonut.style.background = makeDonutGradient(metrics.categories);
}

function renderCategories(metrics) {
  if (!metrics.categories.length) {
    const ownerName = getOwnerName(activeOwnerId);
    els.categoryList.innerHTML = `
      <div class="empty-state">
        <strong>${activeOwnerId === ALL_OWNERS ? "还没有资产" : `${escapeHtml(ownerName)}还没有资产`}</strong>
        <span>先添加一笔现金、基金或股票，资产分布会自动生成。</span>
        <button class="primary-button" type="button" data-empty-add>新增资产</button>
      </div>
    `;
    els.categoryList.querySelector("[data-empty-add]").addEventListener("click", () => openAssetDialog());
    return;
  }

  els.categoryList.innerHTML = metrics.categories.map((item) => `
    <div class="category-row">
      <i class="category-swatch" style="background:${item.color}"></i>
      <div class="category-content">
        <div class="category-label">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${formatPercent(item.ratio)}</span>
        </div>
        <div class="bar"><span style="width:${Math.max(item.ratio, 1)}%;background:${item.color}"></span></div>
      </div>
      <strong>${formatCompactMoney(item.value)}</strong>
    </div>
  `).join("");
}

function renderAssets() {
  const assets = getVisibleAssets();
  if (!assets.length) {
    const ownerName = getOwnerName(activeOwnerId);
    els.assetList.innerHTML = `
      <div class="empty-state">
        <strong>${activeOwnerId === ALL_OWNERS ? "从第一笔资产开始" : `${escapeHtml(ownerName)}还没有资产`}</strong>
        <span>只需要填写名称、类别、市值和成本，之后不定期回来更新即可。</span>
        <button class="primary-button" type="button" data-empty-add>新增资产</button>
      </div>
    `;
    els.assetList.querySelector("[data-empty-add]").addEventListener("click", () => openAssetDialog());
    return;
  }

  els.assetList.innerHTML = assets
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((asset) => {
      const profit = asset.value + asset.income - asset.cost;
      const rate = asset.cost ? profit / asset.cost * 100 : 0;
      const profitClass = profit < 0 ? "profit loss" : "profit";
      const ownerName = getOwnerName(asset.ownerId);
      return `
        <article class="asset-card">
          <div class="asset-main">
            <div class="asset-title">
              <strong>${escapeHtml(asset.name)}</strong>
              <p class="asset-sub">${escapeHtml(ownerName)} · ${escapeHtml(asset.category)} · 更新于 ${escapeHtml(asset.updatedAt)}</p>
            </div>
            <div class="asset-value">
              <strong>${formatCompactMoney(asset.value)}</strong>
              <span class="${profitClass}">${profit >= 0 ? "+" : ""}${formatCompactMoney(profit)} · ${formatPercent(rate)}</span>
            </div>
          </div>
          <div class="asset-meta">
            <span class="chip">成本 ${formatCompactMoney(asset.cost)}</span>
            <span class="chip">预期 ${formatPercent(asset.expectedReturn)}</span>
          </div>
          <div class="asset-actions">
            <button class="secondary-button" type="button" data-edit="${asset.id}">编辑</button>
            <button class="text-button" type="button" data-update="${asset.id}">更新</button>
          </div>
        </article>
      `;
    }).join("");

  els.assetList.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openAssetDialog(button.dataset.edit));
  });
  els.assetList.querySelectorAll("[data-update]").forEach((button) => {
    button.addEventListener("click", () => openAssetDialog(button.dataset.update, true));
  });
}

function renderHistory() {
  const points = getPortfolioHistory(getVisibleAssets());
  const context = els.historyChart.getContext("2d");
  const width = els.historyChart.width;
  const height = els.historyChart.height;
  context.clearRect(0, 0, width, height);

  if (points.length < 2) {
    els.historyRange.textContent = "暂无曲线";
    context.fillStyle = getCssVar("--muted");
    context.font = "26px -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText("保存两次快照后显示资产曲线", 110, height / 2);
    return;
  }

  els.historyRange.textContent = `${points[0].date} 至 ${points[points.length - 1].date}`;
  const values = points.map((point) => point.value);
  const min = Math.min(...values) * 0.985;
  const max = Math.max(...values) * 1.015;
  const plot = {
    left: 62,
    right: width - 24,
    top: 28,
    bottom: height - 48
  };

  context.lineWidth = 1;
  context.strokeStyle = getCssVar("--line");
  context.fillStyle = getCssVar("--muted");
  context.font = "24px -apple-system, BlinkMacSystemFont, sans-serif";

  for (let i = 0; i < 4; i += 1) {
    const y = plot.top + (plot.bottom - plot.top) * i / 3;
    context.beginPath();
    context.moveTo(plot.left, y);
    context.lineTo(plot.right, y);
    context.stroke();
  }

  const coords = points.map((point, index) => {
    const x = plot.left + (plot.right - plot.left) * index / (points.length - 1);
    const y = plot.bottom - ((point.value - min) / (max - min || 1)) * (plot.bottom - plot.top);
    return { x, y };
  });

  const gradient = context.createLinearGradient(0, plot.top, 0, plot.bottom);
  gradient.addColorStop(0, "rgba(47, 111, 176, 0.28)");
  gradient.addColorStop(1, "rgba(47, 111, 176, 0)");

  context.beginPath();
  coords.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineTo(plot.right, plot.bottom);
  context.lineTo(plot.left, plot.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  coords.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineWidth = 5;
  context.lineCap = "round";
  context.strokeStyle = getCssVar("--blue");
  context.stroke();

  coords.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fillStyle = getCssVar("--surface");
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = getCssVar("--blue");
    context.stroke();
  });

  context.fillStyle = getCssVar("--muted");
  context.fillText(formatCompactMoney(max), 0, plot.top + 8);
  context.fillText(formatCompactMoney(min), 0, plot.bottom + 8);
  context.fillText(points[0].date.slice(5), plot.left, height - 12);
  context.fillText(points[points.length - 1].date.slice(5), plot.right - 58, height - 12);
}

function openAssetDialog(id = "", quickUpdate = false) {
  const asset = state.assets.find((item) => item.id === id);
  const defaultOwnerId = activeOwnerId === ALL_OWNERS ? state.people[0].id : activeOwnerId;
  document.querySelector("#dialogTitle").textContent = asset ? (quickUpdate ? "更新资产" : "编辑资产") : "新增资产";
  document.querySelector("#assetId").value = asset?.id || "";
  fillOwnerOptions();
  document.querySelector("#assetOwner").value = asset?.ownerId || defaultOwnerId;
  document.querySelector("#assetName").value = asset?.name || "";
  document.querySelector("#assetCategory").value = asset?.category || "基金";
  document.querySelector("#assetValue").value = asset?.value ?? "";
  document.querySelector("#assetCost").value = asset?.cost ?? "";
  document.querySelector("#assetIncome").value = asset?.income ?? "";
  document.querySelector("#assetReturn").value = asset?.expectedReturn ?? "";
  document.querySelector("#assetNote").value = asset?.note || "";
  document.querySelector("#deleteAssetButton").style.visibility = asset ? "visible" : "hidden";
  els.dialog.showModal();
  document.querySelector(quickUpdate ? "#assetValue" : "#assetName").focus();
}

function saveAssetFromForm() {
  const id = document.querySelector("#assetId").value || makeId();
  const existing = state.assets.find((asset) => asset.id === id);
  const today = new Date().toISOString().slice(0, 10);
  const nextAsset = {
    id,
    ownerId: document.querySelector("#assetOwner").value,
    name: document.querySelector("#assetName").value.trim(),
    category: document.querySelector("#assetCategory").value,
    value: readNumber("#assetValue"),
    cost: readNumber("#assetCost"),
    income: readNumber("#assetIncome"),
    expectedReturn: readNumber("#assetReturn"),
    note: document.querySelector("#assetNote").value.trim(),
    updatedAt: today,
    history: existing?.history ? [...existing.history] : []
  };

  upsertHistory(nextAsset, today);

  if (existing) {
    state.assets = state.assets.map((asset) => asset.id === id ? nextAsset : asset);
  } else {
    state.assets = [...state.assets, nextAsset];
  }

  persist();
  els.dialog.close();
  render();
  showToast("已保存资产");
}

function deleteCurrentAsset() {
  const id = document.querySelector("#assetId").value;
  if (!id) return;
  const asset = state.assets.find((item) => item.id === id);
  if (!asset) return;
  const confirmed = confirm(`删除「${asset.name}」？`);
  if (!confirmed) return;
  state.assets = state.assets.filter((item) => item.id !== id);
  persist();
  els.dialog.close();
  render();
  showToast("已删除资产");
}

function saveSnapshot() {
  const today = new Date().toISOString().slice(0, 10);
  const visibleIds = new Set(getVisibleAssets().map((asset) => asset.id));
  if (!visibleIds.size) {
    showToast("当前没有可保存的资产");
    return;
  }
  state.assets = state.assets.map((asset) => {
    if (!visibleIds.has(asset.id)) return asset;
    const next = { ...asset, history: [...(asset.history || [])], updatedAt: today };
    upsertHistory(next, today);
    return next;
  });
  persist();
  render();
  showToast("快照已保存");
}

function upsertHistory(asset, date) {
  const point = {
    date,
    value: asset.value,
    cost: asset.cost,
    income: asset.income
  };
  const index = asset.history.findIndex((item) => item.date === date);
  if (index >= 0) asset.history[index] = point;
  else asset.history.push(point);
  asset.history.sort((a, b) => a.date.localeCompare(b.date));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `asset-compass-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("导出已开始");
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.assets)) throw new Error("missing assets");
    state = normalizeState(imported);
    activeOwnerId = ALL_OWNERS;
    persist();
    fillOwnerOptions();
    render();
    showToast("导入完成");
  } catch (error) {
    showToast("导入失败，请检查 JSON");
  } finally {
    event.target.value = "";
  }
}

function resetSample() {
  if (!confirm("清空当前浏览器里的所有资产数据？")) return;
  state = cloneState(emptyState);
  activeOwnerId = ALL_OWNERS;
  fillOwnerOptions();
  persist();
  render();
  showToast("已清空数据");
}

function getVisibleAssets() {
  if (activeOwnerId === ALL_OWNERS) return state.assets;
  return state.assets.filter((asset) => asset.ownerId === activeOwnerId);
}

function getOwnerName(ownerId) {
  if (ownerId === ALL_OWNERS) return "合并";
  return state.people.find((person) => person.id === ownerId)?.name || "未命名";
}

function ensureActiveOwner() {
  if (activeOwnerId === ALL_OWNERS) return;
  if (!state.people.some((person) => person.id === activeOwnerId)) {
    activeOwnerId = ALL_OWNERS;
  }
}

function getMetrics(assets) {
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
  const totalCost = assets.reduce((sum, asset) => sum + asset.cost, 0);
  const totalIncome = assets.reduce((sum, asset) => sum + asset.income, 0);
  const totalProfit = totalValue + totalIncome - totalCost;
  const profitRate = totalCost ? totalProfit / totalCost * 100 : 0;
  const byCategory = new Map();

  assets.forEach((asset) => {
    byCategory.set(asset.category, (byCategory.get(asset.category) || 0) + asset.value);
  });

  const categoryMetrics = categories
    .map((category) => ({
      ...category,
      value: byCategory.get(category.name) || 0,
      ratio: totalValue ? (byCategory.get(category.name) || 0) / totalValue * 100 : 0
    }))
    .filter((category) => category.value > 0)
    .sort((a, b) => b.value - a.value);

  const history = getPortfolioHistory(assets);
  const previous = history.length > 1 ? history[history.length - 2].value : totalValue;
  const changeValue = totalValue - previous;
  const changeRate = previous ? changeValue / previous * 100 : 0;

  return {
    totalValue,
    totalCost,
    totalIncome,
    totalProfit,
    profitRate,
    categories: categoryMetrics,
    changeValue,
    changeRate
  };
}

function getPortfolioHistory(assets) {
  const dates = [...new Set(assets.flatMap((asset) => (asset.history || []).map((point) => point.date)))].sort();
  return dates.map((date) => ({
    date,
    value: assets.reduce((sum, asset) => {
      const history = [...(asset.history || [])].sort((a, b) => a.date.localeCompare(b.date));
      const point = history.filter((item) => item.date <= date).at(-1);
      return sum + (point?.value || 0);
    }, 0)
  }));
}

function makeDonutGradient(items) {
  if (!items.length) return "conic-gradient(var(--line) 0 100%)";
  let start = 0;
  const parts = items.map((item) => {
    const end = start + item.ratio;
    const segment = `${item.color} ${start}% ${end}%`;
    start = end;
    return segment;
  });
  return `conic-gradient(${parts.join(", ")})`;
}

function fillCategoryOptions() {
  document.querySelector("#assetCategory").innerHTML = categories.map((category) => (
    `<option value="${category.name}">${category.name}</option>`
  )).join("");
}

function fillOwnerOptions() {
  document.querySelector("#assetOwner").innerHTML = state.people.map((person) => (
    `<option value="${person.id}">${escapeHtml(person.name)}</option>`
  )).join("");
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.assets)) return normalizeState(saved);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return cloneState(emptyState);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState(raw) {
  const people = normalizePeople(raw.people);
  return {
    people,
    assets: Array.isArray(raw.assets) ? raw.assets.map((asset) => normalizeAsset(asset, people)) : []
  };
}

function normalizePeople(people) {
  if (!Array.isArray(people) || people.length < 2) return cloneState(defaultPeople);
  return people.slice(0, 2).map((person, index) => ({
    id: String(person.id || defaultPeople[index]?.id || `p${index + 1}`),
    name: normalizePersonName(person.name, index)
  }));
}

function normalizePersonName(name, index) {
  const legacyDefaults = ["我", "对方"];
  const rawName = String(name || "").trim();
  if (!rawName || rawName === legacyDefaults[index]) {
    return defaultPeople[index]?.name || `成员${index + 1}`;
  }
  return rawName;
}

function normalizeAsset(asset, people = state.people) {
  const today = new Date().toISOString().slice(0, 10);
  const fallbackOwner = people[0]?.id || "p1";
  const ownerId = people.some((person) => person.id === asset.ownerId) ? asset.ownerId : fallbackOwner;
  return {
    id: String(asset.id || makeId()),
    ownerId,
    name: String(asset.name || "未命名资产"),
    category: categories.some((category) => category.name === asset.category) ? asset.category : "其他",
    value: Number(asset.value) || 0,
    cost: Number(asset.cost) || 0,
    income: Number(asset.income) || 0,
    expectedReturn: Number(asset.expectedReturn) || 0,
    note: String(asset.note || ""),
    updatedAt: String(asset.updatedAt || today),
    history: Array.isArray(asset.history) ? asset.history.map((point) => ({
      date: String(point.date || today),
      value: Number(point.value) || 0,
      cost: Number(point.cost) || 0,
      income: Number(point.income) || 0
    })) : []
  };
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
}

function readNumber(selector) {
  return Number(document.querySelector(selector).value) || 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

function formatCompactMoney(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(abs >= 1000000 ? 1 : 2)}万`;
  return `${sign}¥${abs.toFixed(0)}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getCssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function hideToast() {
  clearTimeout(showToast.timer);
  els.toast.classList.remove("show");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // The app still works without offline caching, for example when opened as file://.
    });
  });
}

function cloneState(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
