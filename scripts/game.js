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

const coinsValue = document.getElementById("coinsValue");
const clickValue = document.getElementById("clickValue");
const perSecondValue = document.getElementById("perSecondValue");
const totalClicksValue = document.getElementById("totalClicksValue");
const breadValue = document.getElementById("breadValue");
const totalEarnedValue = document.getElementById("totalEarnedValue");

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
let currentUserEmail = "";
let lastSyncedScore = -1;
let syncTimer = null;

const upgradeDefinitions = [
  {
    id: "rolling_pin",
    name: "Rolo de massa melhor",
    description: "+1 moeda por clique.",
    baseCost: 15,
    costScale: 1.55,
    type: "click",
    value: 1
  },
  {
    id: "assistant_baker",
    name: "Ajudante de forno",
    description: "+1 moeda por segundo.",
    baseCost: 40,
    costScale: 1.6,
    type: "idle",
    value: 1
  },
  {
    id: "warm_oven",
    name: "Forno aquecido",
    description: "+3 moedas por clique.",
    baseCost: 120,
    costScale: 1.7,
    type: "click",
    value: 3
  },
  {
    id: "delivery_bike",
    name: "Entrega de bicicleta",
    description: "+4 moedas por segundo.",
    baseCost: 220,
    costScale: 1.75,
    type: "idle",
    value: 4
  },
  {
    id: "sweet_showcase",
    name: "Vitrine de doces",
    description: "+8 moedas por clique.",
    baseCost: 480,
    costScale: 1.85,
    type: "click",
    value: 8
  },
  {
    id: "night_shift",
    name: "Turno da noite",
    description: "+10 moedas por segundo.",
    baseCost: 900,
    costScale: 1.9,
    type: "idle",
    value: 10
  }
];

function createInitialState() {
  return {
    coins: 0,
    breads: 0,
    totalClicks: 0,
    totalEarned: 0,
    bestScore: 0,
    lastSavedAt: Date.now(),
    upgrades: Object.fromEntries(upgradeDefinitions.map((upgrade) => [upgrade.id, 0]))
  };
}

function normalizeGameState(rawState) {
  const baseState = createInitialState();

  return {
    ...baseState,
    ...rawState,
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
    const parsedSave = JSON.parse(rawSave);
    const normalized = normalizeGameState(parsedSave);

    if (typeof normalized.totalEarned !== "number") {
      normalized.totalEarned = parsedSave.coins || 0;
    }

    if (typeof normalized.bestScore !== "number") {
      normalized.bestScore = normalized.totalEarned;
    }

    return normalized;
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
          : "Nao conectado";
  }

  if (playerHelpText) {
    playerHelpText.textContent =
      currentAuthMode === "google"
        ? "Sua conta Google recupera o progresso, mas o nome publico do jogo continua sendo seu nick."
        : currentAuthMode === "nickname"
          ? "Seu progresso esta salvo no Supabase com conta anonima e apelido."
          : "Escolha entre salvar com apelido ou entrar com Google.";
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

function getUpgradeCost(upgrade) {
  const level = getUpgradeLevel(upgrade.id);
  return Math.floor(upgrade.baseCost * upgrade.costScale ** level);
}

function getCoinsPerClick() {
  let total = 1;

  upgradeDefinitions.forEach((upgrade) => {
    if (upgrade.type === "click") {
      total += upgrade.value * getUpgradeLevel(upgrade.id);
    }
  });

  return total;
}

function getCoinsPerSecond() {
  let total = 0;

  upgradeDefinitions.forEach((upgrade) => {
    if (upgrade.type === "idle") {
      total += upgrade.value * getUpgradeLevel(upgrade.id);
    }
  });

  return total;
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

function updateEarnings(amount) {
  gameState.coins += amount;
  gameState.totalEarned += amount;
  gameState.bestScore = Math.max(gameState.bestScore, gameState.totalEarned);
}

function renderUpgrades() {
  if (!upgradesList) {
    return;
  }

  upgradesList.innerHTML = "";

  upgradeDefinitions.forEach((upgrade) => {
    const level = getUpgradeLevel(upgrade.id);
    const cost = getUpgradeCost(upgrade);
    const canBuy = gameState.coins >= cost;

    const card = document.createElement("article");
    card.className = `upgrade-card${canBuy ? "" : " is-locked"}`;

    const info = document.createElement("div");
    const title = document.createElement("h4");
    const text = document.createElement("p");
    const button = document.createElement("button");

    title.textContent = `${upgrade.name} - Nv. ${level}`;
    text.textContent = `${upgrade.description} Custo: ${formatNumber(cost)} moedas.`;

    button.className = "upgrade-buy";
    button.type = "button";
    button.textContent = "Comprar";
    button.disabled = !canBuy;
    button.addEventListener("click", () => buyUpgrade(upgrade.id));

    info.append(title, text);
    card.append(info, button);
    upgradesList.append(card);
  });
}

function renderGame() {
  coinsValue.textContent = formatNumber(gameState.coins);
  clickValue.textContent = formatNumber(getCoinsPerClick());
  perSecondValue.textContent = formatNumber(getCoinsPerSecond());
  totalClicksValue.textContent = formatNumber(gameState.totalClicks);
  breadValue.textContent = formatNumber(gameState.breads);
  totalEarnedValue.textContent = formatNumber(gameState.totalEarned);
  renderUpgrades();
}

function bakeBread() {
  const perClick = getCoinsPerClick();

  updateEarnings(perClick);
  gameState.breads += 1;
  gameState.totalClicks += 1;

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

  if (gameState.coins < cost) {
    return;
  }

  gameState.coins -= cost;
  gameState.upgrades[upgradeId] = getUpgradeLevel(upgradeId) + 1;

  renderGame();
  saveLocalBackup();
  queueRemoteSync();
}

function applyOfflineProgress() {
  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - (gameState.lastSavedAt || now)) / 1000));
  const perSecond = getCoinsPerSecond();
  const cappedSeconds = Math.min(elapsedSeconds, 60 * 60 * 8);
  const offlineCoins = cappedSeconds * perSecond;

  if (offlineCoins > 0) {
    updateEarnings(offlineCoins);

    if (offlineNote) {
      offlineNote.textContent = `Enquanto voce esteve fora, a padaria produziu ${formatNumber(offlineCoins)} moedas em ${formatNumber(cappedSeconds)} segundos.`;
    }
  } else if (offlineNote) {
    offlineNote.textContent = "Seu progresso e salvo automaticamente.";
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
    meta.textContent = `${formatNumber(entry.best_score)} pontos`;

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
    setLeaderboardStatus("Nao foi possivel carregar o ranking agora.");
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

  const score = Math.floor(gameState.bestScore);

  if (!force && score <= lastSyncedScore) {
    return;
  }

  const payload = {
    player_id: currentPlayerId,
    player_name: playerName,
    auth_mode: currentAuthMode,
    best_score: score,
    breads_baked: Math.floor(gameState.breads),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(leaderboardTable)
    .upsert(payload, { onConflict: "player_id" });

  if (error) {
    setLeaderboardStatus("Falha ao enviar sua pontuacao.");
    return;
  }

  lastSyncedScore = score;
  setLeaderboardStatus("Sua pontuacao online foi sincronizada.");
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
    await saveRemoteProgress();
    return;
  }

  const remoteState = normalizeGameState(data.progress);
  const localUpdatedAt = gameState.lastSavedAt || 0;
  const remoteUpdatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;

  if (remoteUpdatedAt >= localUpdatedAt) {
    gameState = remoteState;
  }

  if (currentAuthMode === "nickname" && data.player_name) {
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
  currentUserEmail = user?.email || "";

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
renderGame();
updateAccountUi();

if (renamePlayerButton) {
  renamePlayerButton.addEventListener("click", () => {
    showPlayerModal();
    showNicknameForm();
  });
}

if (nicknameChoiceButton) {
  nicknameChoiceButton.addEventListener("click", () => {
    showNicknameForm();
  });
}

if (backToAuthOptionsButton) {
  backToAuthOptionsButton.addEventListener("click", () => {
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

    currentAuthMode = "nickname";
    setPlayerName(rawName);
    hidePlayerModal();
    await continueWithUser(activeUser);
  });
}

if (bakeButton) {
  bakeButton.addEventListener("click", bakeBread);
}

setInterval(() => {
  const perSecond = getCoinsPerSecond();

  if (perSecond > 0) {
    updateEarnings(perSecond);
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
