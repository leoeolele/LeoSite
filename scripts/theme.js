const themeToggle = document.getElementById("themeToggle");
const themeStorageKey = "leosite-theme";

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(themeStorageKey);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;

  if (themeToggle) {
    const nextThemeLabel = theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
    themeToggle.setAttribute("aria-label", nextThemeLabel);
    themeToggle.setAttribute("title", nextThemeLabel);
  }
}

applyTheme(getPreferredTheme());

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.body.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);
    localStorage.setItem(themeStorageKey, nextTheme);
  });
}
