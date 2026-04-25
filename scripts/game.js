import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const bakeButton = document.getElementById("bakeButton");
const upgradesList = document.getElementById("upgradesList");
const offlineNote = document.getElementById("offlineNote");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardStatus = document.getElementById("leaderboardStatus");
const playerModal = document.getElementById("playerModal");
const playerForm = document.getElementById("playerForm");
const playerNameInput = document.getElementById("playerNameInput");
const playerError = document.getElementById("playerError");
const playerNameDisplay = document.getElementById("playerNameDisplay");
const renamePlayerButton = document.getElementById("renamePlayerButton");
const accountModeDisplay = document.getElementById("accountModeDisplay");
const playerHelpText = document.getElementById("playerHelpText");
const nicknameChoiceButton = document.getElementById("nicknameChoiceButton");
const googleChoiceButton = document.getElementById("googleChoiceButton");
const authChoiceGrid = document.getElementById("authChoiceGrid");
const backToAuthOptionsButton = document.getElementById("backToAuthOptionsButton");

const breadStockValue = document.getElementById("breadStockValue");
const clickValue = document.getElementById("clickValue");
const perSecondValue = document.getElementById("perSecondValue");
const totalClicksValue = document.getElementById("totalClicksValue");
const recipesValue = document.getElementById("recipesValue");
const upgradesCountValue = document.getElementById("upgradesCountValue");

const saveStorageKey = "leosite-bakery-save";
const playerNameStorageKey = "leosite-bakery-player-name";

const config = window.LEOSITE_SUPABASE_CONFIG || {};
const leaderboardTable = config.leaderboardTable || "leaderboard_entries";
const gameSavesTable = config.gameSavesTable || "game_saves";
const hasSupabaseConfig =
  typeof config.url === "string" &&
  typeof config.anonKey === "string" &&
  config.url.startsWith("https://") &&
  !config.url.includes("YOUR_PROJECT") &&
  !config.anonKey.includes("YOUR_SUPABASE");

let supabase = null;
let currentPlayerId = null;
let currentAuthMode = "guest";
let lastSyncedScore = null;
let syncTimer = null;
let nicknameNotice = "";

const upgradeDefinitions = [
  {
    id: "baker_hands",
    name: "M\u00e3os mais r\u00e1pidas",
    icon: "\u{1F956}",
    description: "+1 p\u00e3o por clique.",
    baseCost: 18,
    costScale: 1.8,
    type: "click",
    value: 1
  },
  {
    id: "french_bread",
    name: "P\u00e3o franc\u00eas",
    icon: "\u{1F950}",
    description: "+1 p\u00e3o por segundo com a receita mais cl\u00e1ssica da casa.",
    baseCost: 45,
    costScale: 1.72,
    type: "bread",
    value: 1
  },
  {
    id: "milk_bread",
    name: "P\u00e3o de leite",
    icon: "\u{1F35E}",
    description: "+3 p\u00e3es por segundo com uma receita macia e popular.",
    baseCost: 190,
    costScale: 1.8,
    type: "bread",
    value: 3
  },
  {
    id: "whole_bread",
    name: "P\u00e3o integral",
    icon: "\u{1F33E}",
    description: "+9 p\u00e3es por segundo com uma receita mais encorpada.",
    baseCost: 850,
    costScale: 1.9,
    type: "bread",
    value: 9
  },
  {
    id: "brioche",
    name: "Brioche",
    icon: "\u{1F9C8}",
    description: "+26 p\u00e3es por segundo com uma massa rica e delicada.",
    baseCost: 3800,
    costScale: 2.02,
    type: "bread",
    value: 26
  },
  {
    id: "sourdough",
    name: "P\u00e3o de fermenta\u00e7\u00e3o natural",
    icon: "\u{1F525}",
    description: "+80 p\u00e3es por segundo, mas custa bem mais para dominar.",
    baseCost: 18000,
    costScale: 2.18,
    type: "bread",
    value: 80
  }
];

function createInitialState() {
  return {
    breads: 0,
    totalClicks: 0,
    lastSavedAt: Date.now(),
    upgrades: Object.fromEntries(upgradeDefinitions.map((upgrade) => [upgrade.id, 0]))
  };
}

function normalizeGameState(rawState) {
  const baseState = createInitialState();
  const legacyBreads =
    typeof rawState?.breads === "number"
      ? rawState.breads
      : typeof rawState?.coins === "number"
        ? rawState.coins
        : 0;
  const legacyTotalClicks =
    typeof rawState?.totalClicks === "number"
      ? rawState.totalClicks
      : typeof rawState?.manualBakes === "number"
        ? rawState.manualBakes
        : 0;

  return {
    ...baseState,
    ...rawState,
    breads: legacyBreads,
    totalClicks: legacyTotalClicks,
    upgrades: {
      ...baseState.upgrades,
      ...(rawState?.upgrades || {})
    }
  };
}

function loadLocalBackup() {
  const rawSave = localStorage.getItem(saveStorageKey);

  if (!rawSave) {
    return createInitialState();
  }

  try {
    return normalizeGameState(JSON.parse(rawSave));
  } catch (error) {
    return createInitialState();
  }
}

let gameState = loadLocalBackup();

function getPlayerName() {
  return localStorage.getItem(playerNameStorageKey) || "";
}

function setPlayerName(name) {
  localStorage.setItem(playerNameStorageKey, name);
  updateAccountUi();
}

function setNicknameNotice(message = "") {
  nicknameNotice = message;
  updateAccountUi();
}

function updateAccountUi() {
  const storedName = getPlayerName();
  const finalName = storedName || (currentAuthMode === "google" ? "Defina seu nick" : "Convidado");

  if (playerNameDisplay) {
    playerNameDisplay.textContent = finalName;
  }

  if (accountModeDisplay) {
    accountModeDisplay.textContent =
          currentAuthMode === "google"
        ? "Google"
        : currentAuthMode === "nickname"
          ? "Apelido"
          : "N\u00e3o conectado";
  }

  if (playerHelpText) {
    if (nicknameNotice) {
      playerHelpText.textContent = nicknameNotice;
    } else {
      playerHelpText.textContent =
        currentAuthMode === "google"
          ? "Sua conta Google recupera o progresso, mas o nome p\u00fablico do jogo continua sendo seu nick."
          : currentAuthMode === "nickname"
            ? "Seu progresso est\u00e1 salvo no Supabase com conta an\u00f4nima e apelido."
            : "Escolha entre salvar com apelido ou entrar com Google.";
    }
  }

  if (renamePlayerButton) {
    renamePlayerButton.hidden = currentAuthMode === "guest";
  }
}

function showPlayerModal() {
  if (!playerModal) {
    return;
  }

  playerModal.hidden = false;
  showAuthOptions();
}

function hidePlayerModal() {
  if (!playerModal) {
    return;
  }

  playerModal.hidden = true;
}

function showAuthOptions() {
  if (authChoiceGrid) {
    authChoiceGrid.hidden = false;
  }

  if (playerForm) {
    playerForm.hidden = true;
  }

  if (playerError) {
    playerError.hidden = true;
  }
}

function showNicknameForm() {
  if (authChoiceGrid) {
    authChoiceGrid.hidden = true;
  }

  if (playerForm) {
    playerForm.hidden = false;
  }

  if (playerNameInput) {
    playerNameInput.value = getPlayerName();
    playerNameInput.focus();
    playerNameInput.select();
  }
}

function getUpgradeLevel(upgradeId) {
  return gameState.upgrades[upgradeId] || 0;
}

function buildCandidateName(baseName, attempt) {
  const maxLength = 24;

  if (attempt <= 1) {
    return baseName.slice(0, maxLength).trim();
  }

  const suffix = ` (${attempt})`;
  const availableLength = Math.max(1, maxLength - suffix.length);

  return `${baseName.slice(0, availableLength).trimEnd()}${suffix}`;
}

async function resolveUniquePlayerName(requestedName) {
  if (!supabase) {
    return requestedName;
  }

  const normalizedBaseName = requestedName.trim();

  for (let attempt = 1; attempt <= 99; attempt += 1) {
    const candidateName = buildCandidateName(normalizedBaseName, attempt);
    const { data, error } = await supabase
      .from(leaderboardTable)
      .select("player_id, player_name")
      .ilike("player_name", candidateName);

    if (error) {
      return candidateName;
    }

    const hasConflict = (data || []).some((entry) => entry.player_id !== currentPlayerId);

    if (!hasConflict) {
      return candidateName;
    }
  }

  return buildCandidateName(normalizedBaseName, Math.floor(Math.random() * 900) + 100);
}

function getUpgradeCost(upgrade) {
  const level = getUpgradeLevel(upgrade.id);
  return Math.floor(upgrade.baseCost * upgrade.costScale ** level);
}

function getBreadsPerClick() {
  return 1 + getUpgradeLevel("baker_hands");
}

function getBreadsPerSecond() {
  return upgradeDefinitions.reduce((total, upgrade) => {
    if (upgrade.type !== "bread") {
      return total;
    }

    return total + upgrade.value * getUpgradeLevel(upgrade.id);
  }, 0);
}

function getUnlockedRecipes() {
  return (
    upgradeDefinitions.filter((upgrade) => upgrade.type === "bread" && getUpgradeLevel(upgrade.id) > 0).length + 1
  );
}

function getPurchasedUpgradesCount() {
  return upgradeDefinitions.reduce((total, upgrade) => total + getUpgradeLevel(upgrade.id), 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value >= 100 ? 0 : 1
  }).format(value);
}

function saveLocalBackup() {
  gameState.lastSavedAt = Date.now();
  localStorage.setItem(saveStorageKey, JSON.stringify(gameState));
}

function addBread(amount) {
  gameState.breads += amount;
}

function renderUpgrades() {
  if (!upgradesList) {
    return;
  }

  upgradesList.innerHTML = "";

  upgradeDefinitions.forEach((upgrade) => {
    const level = getUpgradeLevel(upgrade.id);
    const cost = getUpgradeCost(upgrade);
    const canBuy = gameState.breads >= cost;

    const card = document.createElement("article");
    card.className = `upgrade-card${canBuy ? "" : " is-locked"}`;

    const info = document.createElement("div");
    info.className = "upgrade-info";

    const topRow = document.createElement("div");
    topRow.className = "upgrade-top-row";

    const icon = document.createElement("span");
    icon.className = "upgrade-icon";
    icon.textContent = upgrade.icon;

    const textGroup = document.createElement("div");
    textGroup.className = "upgrade-text";

    const title = document.createElement("h4");
    title.textContent = `${upgrade.name} - N\u00edvel ${level}`;

    const text = document.createElement("p");
    text.textContent = `${upgrade.description} Custo: ${formatNumber(cost)} p\u00e3es.`;

    const button = document.createElement("button");
    button.className = "upgrade-buy";
    button.type = "button";
    button.textContent = "Comprar";
    button.disabled = !canBuy;
    button.addEventListener("click", () => buyUpgrade(upgrade.id));

    textGroup.append(title, text);
    topRow.append(icon, textGroup);
    info.append(topRow);
    card.append(info, button);
    upgradesList.append(card);
  });
}

function renderGame() {
  if (breadStockValue) {
    breadStockValue.textContent = formatNumber(gameState.breads);
  }

  if (clickValue) {
    clickValue.textContent = formatNumber(getBreadsPerClick());
  }

  if (perSecondValue) {
    perSecondValue.textContent = formatNumber(getBreadsPerSecond());
  }

  if (totalClicksValue) {
    totalClicksValue.textContent = formatNumber(gameState.totalClicks);
  }

  if (recipesValue) {
    recipesValue.textContent = formatNumber(getUnlockedRecipes());
  }

  if (upgradesCountValue) {
    upgradesCountValue.textContent = formatNumber(getPurchasedUpgradesCount());
  }

  renderUpgrades();
}

function spawnClickEffect(event, amount) {
  if (!bakeButton) {
    return;
  }

  const effect = document.createElement("span");
  const buttonRect = bakeButton.getBoundingClientRect();
  const fallbackX = buttonRect.width / 2;
  const fallbackY = buttonRect.height / 2;
  const offsetX = typeof event?.clientX === "number" ? event.clientX - buttonRect.left : fallbackX;
  const offsetY = typeof event?.clientY === "number" ? event.clientY - buttonRect.top : fallbackY;

  effect.className = "click-bread-effect";
  effect.textContent = amount > 1 ? `\u{1F956} +${amount}` : "\u{1F956}";
  effect.style.left = `${offsetX}px`;
  effect.style.top = `${offsetY}px`;

  bakeButton.append(effect);
  window.setTimeout(() => {
    effect.remove();
  }, 900);
}

function bakeBread(event) {
  const perClick = getBreadsPerClick();

  addBread(perClick);
  gameState.totalClicks += 1;
  spawnClickEffect(event, perClick);

  renderGame();
  saveLocalBackup();
  queueRemoteSync();
}

function buyUpgrade(upgradeId) {
  const upgrade = upgradeDefinitions.find((item) => item.id === upgradeId);

  if (!upgrade) {
    return;
  }

  const cost = getUpgradeCost(upgrade);

  if (gameState.breads < cost) {
    return;
  }

  gameState.breads -= cost;
  gameState.upgrades[upgradeId] = getUpgradeLevel(upgradeId) + 1;

  renderGame();
  saveLocalBackup();
  queueRemoteSync();
}

function applyOfflineProgress() {
  if (offlineNote) {
    offlineNote.textContent = "Seu progresso \u00e9 salvo exatamente como voc\u00ea deixou.";
  }
}

function setLeaderboardStatus(message) {
  if (leaderboardStatus) {
    leaderboardStatus.textContent = message;
  }
}

function renderLeaderboard(entries = []) {
  if (!leaderboardList) {
    return;
  }

  leaderboardList.innerHTML = "";

  entries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-item";

    const position = document.createElement("span");
    position.className = "leaderboard-position";
    position.textContent = `#${index + 1}`;

    const info = document.createElement("div");
    info.className = "leaderboard-player";

    const name = document.createElement("strong");
    name.textContent = entry.player_name;

    const meta = document.createElement("span");
    meta.textContent = `${formatNumber(entry.best_score)} p\u00e3es`;

    info.append(name, meta);
    item.append(position, info);
    leaderboardList.append(item);
  });
}

async function loadLeaderboard() {
  if (!supabase) {
    setLeaderboardStatus("Configure o Supabase para ativar a leaderboard online.");
    renderLeaderboard([]);
    return;
  }

  setLeaderboardStatus("Atualizando leaderboard...");

  const { data, error } = await supabase
    .from(leaderboardTable)
    .select("player_name, best_score")
    .order("best_score", { ascending: false })
    .limit(10);

  if (error) {
    setLeaderboardStatus("N\u00e3o foi poss\u00edvel carregar o ranking agora.");
    renderLeaderboard([]);
    return;
  }

  renderLeaderboard(data || []);
  setLeaderboardStatus("Top padeiros da rodada.");
}

async function syncLeaderboard(force = false) {
  const playerName = getPlayerName();

  if (!supabase || !currentPlayerId || !playerName) {
    return;
  }

  const score = Math.floor(gameState.breads);

  if (!force && score === lastSyncedScore) {
    return;
  }

  const payload = {
    player_id: currentPlayerId,
    player_name: playerName,
    auth_mode: currentAuthMode,
    best_score: score,
    breads_baked: score,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(leaderboardTable)
    .upsert(payload, { onConflict: "player_id" });

  if (error) {
    setLeaderboardStatus("Falha ao enviar sua pontua\u00e7\u00e3o.");
    return;
  }

  lastSyncedScore = score;
  setLeaderboardStatus("Sua pontua\u00e7\u00e3o online foi sincronizada.");
  await loadLeaderboard();
}

async function loadRemoteSave() {
  if (!supabase || !currentPlayerId) {
    return;
  }

  const { data, error } = await supabase
    .from(gameSavesTable)
    .select("progress, player_name, updated_at")
    .eq("user_id", currentPlayerId)
    .maybeSingle();

  if (error) {
    return;
  }

  if (!data?.progress) {
    const { data: leaderboardEntry } = await supabase
      .from(leaderboardTable)
      .select("player_name")
      .eq("player_id", currentPlayerId)
      .maybeSingle();

    if (leaderboardEntry?.player_name) {
      setPlayerName(leaderboardEntry.player_name);
    }

    await saveRemoteProgress();
    return;
  }

  const remoteState = normalizeGameState(data.progress);
  const localUpdatedAt = gameState.lastSavedAt || 0;
  const remoteUpdatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;

  if (remoteUpdatedAt >= localUpdatedAt) {
    gameState = remoteState;
  }

  if (data.player_name) {
    setPlayerName(data.player_name);
  }

  renderGame();
  saveLocalBackup();
}

async function saveRemoteProgress() {
  const playerName = getPlayerName();

  if (!supabase || !currentPlayerId || !playerName) {
    return;
  }

  await supabase
    .from(gameSavesTable)
    .upsert(
      {
        user_id: currentPlayerId,
        player_name: playerName,
        auth_mode: currentAuthMode,
        progress: gameState,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
}

function queueRemoteSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = window.setTimeout(async () => {
    await saveRemoteProgress();
    await syncLeaderboard();
  }, 900);
}

function getDisplayNameFromUser(user) {
  return user?.user_metadata?.full_name || user?.email || "Conta Google";
}

async function continueWithUser(user) {
  currentPlayerId = user?.id || null;
  currentAuthMode = user?.is_anonymous ? "nickname" : "google";

  updateAccountUi();
  await loadRemoteSave();
  updateAccountUi();
  await syncLeaderboard(true);

  if (!getPlayerName()) {
    showPlayerModal();
    showNicknameForm();

    if (playerNameInput && currentAuthMode === "google") {
      const suggestedName = getDisplayNameFromUser(user).split("@")[0].trim();
      playerNameInput.value = suggestedName;
      playerNameInput.focus();
      playerNameInput.select();
    }
  }
}

async function initSupabase() {
  if (!hasSupabaseConfig) {
    setLeaderboardStatus("Preencha o arquivo supabase-config.js para liberar o ranking online.");
    renderLeaderboard([]);
    updateAccountUi();
    return;
  }

  supabase = createClient(config.url, config.anonKey);
  await loadLeaderboard();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    await continueWithUser(user);
  } else {
    updateAccountUi();
    showPlayerModal();
  }
}

renderGame();
saveLocalBackup();
applyOfflineProgress();
updateAccountUi();

if (renamePlayerButton) {
  renamePlayerButton.addEventListener("click", () => {
    setNicknameNotice("");
    showPlayerModal();
    showNicknameForm();
  });
}

if (nicknameChoiceButton) {
  nicknameChoiceButton.addEventListener("click", () => {
    setNicknameNotice("");
    showNicknameForm();
  });
}

if (backToAuthOptionsButton) {
  backToAuthOptionsButton.addEventListener("click", () => {
    setNicknameNotice("");
    showAuthOptions();
  });
}

if (googleChoiceButton) {
  googleChoiceButton.addEventListener("click", async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href
      }
    });
  });
}

if (playerForm) {
  playerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(playerForm);
    const rawName = String(formData.get("playerName") || "").trim();

    if (rawName.length < 2 || rawName.length > 24) {
      if (playerError) {
        playerError.hidden = false;
      }
      return;
    }

    if (playerError) {
      playerError.hidden = true;
    }

    setNicknameNotice("");

    if (!supabase) {
      return;
    }

    const {
      data: { user: existingUser }
    } = await supabase.auth.getUser();

    let activeUser = existingUser;

    if (!activeUser) {
      const { error } = await supabase.auth.signInAnonymously();

      if (error) {
        return;
      }

      const {
        data: { user: anonymousUser }
      } = await supabase.auth.getUser();

      activeUser = anonymousUser;
    }

    currentPlayerId = activeUser?.id || currentPlayerId;
    currentAuthMode = activeUser?.is_anonymous ? "nickname" : "google";
    const uniqueName = await resolveUniquePlayerName(rawName);

    setPlayerName(uniqueName);

    if (uniqueName !== rawName) {
      setNicknameNotice(`Esse nome j\u00e1 existia. Seu apelido foi salvo como ${uniqueName}.`);
    }

    hidePlayerModal();
    await continueWithUser(activeUser);
  });
}

if (bakeButton) {
  bakeButton.addEventListener("click", bakeBread);
}

setInterval(() => {
  const breadsPerSecond = getBreadsPerSecond();

  if (breadsPerSecond > 0) {
    addBread(breadsPerSecond);
    renderGame();
  }
}, 1000);

setInterval(async () => {
  saveLocalBackup();
  await saveRemoteProgress();
  await syncLeaderboard();
}, 5000);

window.addEventListener("beforeunload", () => {
  saveLocalBackup();
  saveRemoteProgress();
  syncLeaderboard(true);
});

initSupabase();
