import { corsHeaders } from "../_shared/cors.ts";

type EdgeHandler = (request: Request) => Response | Promise<Response>;

declare const Deno: {
  serve: (handler: EdgeHandler) => void;
  env: {
    get: (name: string) => string | undefined;
  };
};

const siteGuide = `
Você é o assistente oficial do LeoSite.

Responda somente sobre:
- o LeoSite e a proposta do site
- os projetos e páginas publicados no site
- a Padaria dos Sonhos
- como jogar, salvar, entrar com Google, usar apelido, ranking e tema claro/escuro
- navegação entre home e jogo

Contexto atual do site:
- O LeoSite foi criado para reunir projetos, experimentos, páginas especiais, testes visuais e ideias variadas.
- A home explica a proposta do site e apresenta os destaques.
- O principal projeto atual é a Padaria dos Sonhos.
- A Padaria dos Sonhos é um idle clicker sobre uma padaria.
- No jogo, o usuário assa pães, compra receitas e melhorias, salva o progresso e pode aparecer na leaderboard online.
- O site tem tema claro/escuro.
- O progresso do jogo pode ser salvo com apelido ou conta Google usando Supabase.
- A leaderboard mostra a quantidade atual de pães.

Regras:
- Responda em português do Brasil.
- Seja curto, amigável e objetivo.
- Não invente funcionalidades que não existem.
- Se a pergunta fugir do site, diga educadamente que você só pode ajudar com o LeoSite e seus projetos.
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

function toGeminiContents(messages: Array<{ role: string; content: string }>) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
}

function getAssistantText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  if (!geminiApiKey) {
    return jsonResponse(
      { error: "Falta configurar GEMINI_API_KEY nos secrets da Edge Function." },
      500
    );
  }

  let body: { messages?: unknown; pageContext?: unknown; path?: unknown };

  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "Corpo da requisição inválido." }, 400);
  }

  const safeMessages = sanitizeMessages(body.messages);

  if (safeMessages.length === 0) {
    return jsonResponse({ error: "Envie pelo menos uma pergunta." }, 400);
  }

  const pageContext = typeof body.pageContext === "string" ? body.pageContext.slice(0, 50) : "site";
  const path = typeof body.path === "string" ? body.path.slice(0, 120) : "/";

  const messages = [
    {
      role: "user",
      content: `Contexto da página atual: ${pageContext}\nCaminho atual: ${path}`
    },
    ...safeMessages
  ];

  const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: siteGuide }]
      },
      contents: toGeminiContents(messages),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 220
      }
    })
  }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GEMINI_ERROR", errorText);

    return jsonResponse(
      {
        error: "A chamada para o Gemini falhou.",
        details: errorText.slice(0, 1000)
      },
      500
    );
  }

  const payload = await response.json();
  const answer = getAssistantText(payload);

  if (!answer) {
    return jsonResponse({ error: "O Gemini não retornou uma resposta válida." }, 500);
  }

  return jsonResponse({ answer });
});
