import { corsHeaders } from "../_shared/cors.ts";

const siteGuide = `
Voce e o assistente oficial do LeoSite.

Responda somente sobre:
- o LeoSite e a proposta do site
- os projetos e paginas publicados no site
- a Padaria dos Sonhos
- como jogar, salvar, entrar com Google, usar apelido, ranking e tema claro/escuro
- navegacao entre home e jogo

Contexto atual do site:
- O LeoSite foi criado para reunir projetos, experimentos, paginas especiais, testes visuais e ideias variadas.
- A home explica a proposta do site e apresenta os destaques.
- O principal projeto atual e a Padaria dos Sonhos.
- A Padaria dos Sonhos e um idle clicker sobre uma padaria.
- No jogo, o usuario assa paes, compra receitas e melhorias, salva o progresso e pode aparecer na leaderboard online.
- O site tem tema claro/escuro.
- O progresso do jogo pode ser salvo com apelido ou conta Google usando Supabase.
- A leaderboard mostra a quantidade atual de paes.

Regras:
- Responda em portugues do Brasil.
- Seja curto, amigavel e objetivo.
- Nao invente funcionalidades que nao existem.
- Se a pergunta fugir do site, diga educadamente que voce so pode ajudar com o LeoSite e seus projetos.
`.trim();

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function sanitizeMessages(messages: unknown) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message === "object")
    .map((message) => {
      const role = message.role === "assistant" ? "assistant" : "user";
      const content = typeof message.content === "string" ? message.content.trim().slice(0, 1000) : "";

      return { role, content };
    })
    .filter((message) => message.content.length > 0)
    .slice(-10);
}

function getAssistantText(payload: any) {
  const choice = payload?.choices?.[0]?.message?.content;

  if (typeof choice === "string") {
    return choice.trim();
  }

  if (Array.isArray(choice)) {
    const textParts = choice
      .map((item) => (item?.type === "text" ? item.text : ""))
      .filter(Boolean);

    return textParts.join("\n").trim();
  }

  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openAiKey) {
    return jsonResponse(
      { error: "Falta configurar OPENAI_API_KEY nos secrets da Edge Function." },
      500
    );
  }

  let body: { messages?: unknown; pageContext?: unknown; path?: unknown };

  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "Corpo da requisicao invalido." }, 400);
  }

  const safeMessages = sanitizeMessages(body.messages);

  if (safeMessages.length === 0) {
    return jsonResponse({ error: "Envie pelo menos uma pergunta." }, 400);
  }

  const pageContext = typeof body.pageContext === "string" ? body.pageContext.slice(0, 50) : "site";
  const path = typeof body.path === "string" ? body.path.slice(0, 120) : "/";

  const messages = [
    {
      role: "system",
      content: `${siteGuide}\n\nContexto da pagina atual: ${pageContext}\nCaminho atual: ${path}`
    },
    ...safeMessages
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.4-nano",
      messages,
      max_completion_tokens: 220
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    return jsonResponse(
      {
        error: "A chamada para a IA falhou.",
        details: errorText.slice(0, 500)
      },
      500
    );
  }

  const payload = await response.json();
  const answer = getAssistantText(payload);

  if (!answer) {
    return jsonResponse({ error: "A IA nao retornou uma resposta valida." }, 500);
  }

  return jsonResponse({ answer });
});
