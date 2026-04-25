# LeoSite

Site pessoal para reunir projetos, experimentos e paginas variadas.

## Chat de IA embutido

O widget do chat ja esta integrado no frontend e usa uma Supabase Edge Function para responder
somente sobre o proprio site.

### O que precisa configurar

1. Criar uma chave da Gemini API no Google AI Studio.
2. Salvar os secrets no Supabase:

```bash
supabase secrets set GEMINI_API_KEY=sua_chave_aqui GEMINI_MODEL=gemini-2.5-flash --project-ref ddsrwujpgnedozkljkpw
```

3. Publicar a Edge Function:

```bash
supabase functions deploy site-chat --project-ref ddsrwujpgnedozkljkpw
```

### Estrutura do chat

- Frontend: `scripts/site-chat.js`
- Estilos: `styles/chat.css`
- Funcao segura no Supabase: `supabase/functions/site-chat/index.ts`

### Observacao importante

Nao coloque a chave da Gemini API no frontend. O site chama apenas a Edge Function do Supabase.
