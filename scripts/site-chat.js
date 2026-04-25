(function () {
  const config = window.LEOSITE_SUPABASE_CONFIG || {};
  const hasChatConfig =
    typeof config.url === "string" &&
    typeof config.anonKey === "string" &&
    config.url.startsWith("https://") &&
    !config.url.includes("YOUR_PROJECT") &&
    !config.anonKey.includes("YOUR_SUPABASE");

  if (!hasChatConfig) {
    return;
  }

  const functionName = config.siteChatFunctionName || "site-chat";
  const endpoint = `${config.url}/functions/v1/${functionName}`;
  const pageContext = document.body.classList.contains("game-page") ? "game" : "home";
  const quickQuestions =
    pageContext === "game"
      ? [
          "Como funciona a Padaria dos Sonhos?",
          "Como eu salvo meu progresso?",
          "Como funciona o ranking?"
        ]
      : [
          "O que \u00e9 o LeoSite?",
          "Quais projetos existem aqui?",
          "O que \u00e9 a Padaria dos Sonhos?"
        ];

  let isOpen = false;
  let isSending = false;
  const messages = [];

  const root = document.createElement("section");
  root.className = "site-chat";
  root.setAttribute("aria-label", "Chat do site");

  root.innerHTML = `
    <div class="site-chat-panel" id="siteChatPanel" hidden>
      <div class="site-chat-header">
        <div class="site-chat-title">
          <strong>Assistente do LeoSite</strong>
          <p>Responde apenas sobre o site, os projetos e a Padaria dos Sonhos.</p>
        </div>
        <button class="site-chat-close" id="siteChatClose" type="button" aria-label="Fechar chat">&times;</button>
      </div>
      <div class="site-chat-chips" id="siteChatChips"></div>
      <div class="site-chat-messages" id="siteChatMessages" role="log" aria-live="polite"></div>
      <form class="site-chat-form" id="siteChatForm">
        <textarea
          class="site-chat-input"
          id="siteChatInput"
          rows="1"
          maxlength="400"
          placeholder="Pergunte algo sobre o site..."
        ></textarea>
        <button class="site-chat-send" id="siteChatSend" type="submit">Enviar</button>
      </form>
    </div>
    <button
      class="site-chat-launcher"
      id="siteChatLauncher"
      type="button"
      aria-label="Abrir chat do site"
      aria-expanded="false"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5v2.7"></path>
        <rect x="5" y="6.5" width="14" height="11" rx="4"></rect>
        <circle cx="9.25" cy="11.5" r="1.1" fill="currentColor" stroke="none"></circle>
        <circle cx="14.75" cy="11.5" r="1.1" fill="currentColor" stroke="none"></circle>
        <path d="M9.2 14.5c.8.7 1.7 1 2.8 1s2-.3 2.8-1"></path>
        <path d="M8 17.5v2M16 17.5v2M3.5 10.5h1.6M18.9 10.5h1.6"></path>
      </svg>
    </button>
  `;

  document.body.append(root);

  const panel = document.getElementById("siteChatPanel");
  const launcher = document.getElementById("siteChatLauncher");
  const closeButton = document.getElementById("siteChatClose");
  const chipsContainer = document.getElementById("siteChatChips");
  const messagesContainer = document.getElementById("siteChatMessages");
  const form = document.getElementById("siteChatForm");
  const input = document.getElementById("siteChatInput");
  const sendButton = document.getElementById("siteChatSend");

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    panel.hidden = !nextOpen;
    launcher.setAttribute("aria-expanded", String(nextOpen));

    if (nextOpen) {
      input.focus();
    }
  }

  function setSending(nextSending) {
    isSending = nextSending;
    input.disabled = nextSending;
    sendButton.disabled = nextSending;

    chipsContainer.querySelectorAll("button").forEach((chip) => {
      chip.disabled = nextSending;
    });
  }

  function scrollMessages() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function pushMessage(role, content, variant) {
    const message = { role, content };

    if (role === "user" || role === "assistant") {
      messages.push(message);
    }

    const item = document.createElement("article");
    item.className = `site-chat-message ${variant || (role === "user" ? "is-user" : "is-assistant")}`;
    item.textContent = content;
    messagesContainer.append(item);
    scrollMessages();
  }

  function replaceTypingMessage(content, variant) {
    const typingMessage = messagesContainer.querySelector('[data-typing="true"]');

    if (!typingMessage) {
      pushMessage("assistant", content, variant);
      return;
    }

    typingMessage.removeAttribute("data-typing");
    typingMessage.className = `site-chat-message ${variant || "is-assistant"}`;
    typingMessage.textContent = content;
    scrollMessages();
  }

  function showTyping() {
    const typingMessage = document.createElement("article");
    typingMessage.className = "site-chat-message is-status";
    typingMessage.dataset.typing = "true";
    typingMessage.textContent = "Pensando...";
    messagesContainer.append(typingMessage);
    scrollMessages();
  }

  async function sendQuestion(question) {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isSending) {
      return;
    }

    if (!isOpen) {
      setOpen(true);
    }

    pushMessage("user", trimmedQuestion);
    setSending(true);
    showTyping();
    input.value = "";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`
        },
        body: JSON.stringify({
          pageContext,
          path: window.location.pathname,
          messages: messages.slice(-10)
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fallbackMessage =
          payload.error ||
          "O chat ainda n\u00e3o est\u00e1 pronto. Falta publicar a fun\u00e7\u00e3o site-chat no Supabase.";
        replaceTypingMessage(fallbackMessage, "is-status");
        return;
      }

      replaceTypingMessage(
        payload.answer || "N\u00e3o consegui responder agora. Tente novamente em instantes."
      );
    } catch (error) {
      replaceTypingMessage(
        "N\u00e3o foi poss\u00edvel conectar o chat agora. Verifique a fun\u00e7\u00e3o no Supabase e tente novamente.",
        "is-status"
      );
    } finally {
      setSending(false);
    }
  }

  quickQuestions.forEach((question) => {
    const chip = document.createElement("button");
    chip.className = "site-chat-chip";
    chip.type = "button";
    chip.textContent = question;
    chip.addEventListener("click", () => {
      sendQuestion(question);
    });
    chipsContainer.append(chip);
  });

  launcher.addEventListener("click", () => {
    setOpen(!isOpen);
  });

  closeButton.addEventListener("click", () => {
    setOpen(false);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendQuestion(input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion(input.value);
    }
  });

  pushMessage(
    "assistant",
    pageContext === "game"
      ? "Oi! Posso explicar como funciona a Padaria dos Sonhos, o salvamento, o login e o ranking."
      : "Oi! Eu sou o assistente do LeoSite. Posso responder perguntas sobre o site e os projetos que est\u00e3o aqui."
  );
})();
