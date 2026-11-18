"use strict";

const SITE = "https://futsenaijornal.vercel.app";
const FALLBACK_IMAGE = SITE + "/og-image.svg";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

module.exports = async function handler(req, res) {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id || id.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).send("Identificador de notícia inválido.");
    return;
  }
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) {
    res.status(503).send("Página temporariamente indisponível. Configure o acesso público ao Supabase na Vercel.");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base.replace(/\/$/, "") +
      "/rest/v1/news?select=id,title,category,player,image,content,created_at&published=eq.true&id=eq." +
      encodeURIComponent(id), {
      headers: { apikey: key, Authorization: "Bearer " + key },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Não foi possível consultar a notícia.");
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]) {
      res.status(404).send("Notícia não encontrada.");
      return;
    }
    const item = rows[0];
    const title = escapeHtml(item.title);
    const description = escapeHtml(String(item.content || "").replace(/\s+/g, " ").slice(0, 180));
    const image = /^https:\/\//i.test(item.image || "") ? item.image : FALLBACK_IMAGE;
    const url = SITE + "/noticia/" + encodeURIComponent(item.id);
    const date = item.created_at ? new Date(item.created_at).toISOString() : "";
    const body = escapeHtml(item.content).replace(/\r?\n/g, "<br>");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    res.status(200).send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | Jornal FutSenai</title><meta name="description" content="${description}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${url}"><meta property="og:type" content="article">
<meta property="article:published_time" content="${escapeHtml(date)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${escapeHtml(image)}">
<link rel="canonical" href="${url}"><link rel="stylesheet" href="/style.css"></head>
<body class="bg-slate-50 text-slate-900"><main style="max-width:850px;margin:3rem auto;padding:1.5rem;background:white;border-radius:1rem">
<a href="/" style="color:#b42318;font-weight:800">← Jornal FutSenai</a>
<p style="margin-top:2rem;color:#b42318;font-weight:900;text-transform:uppercase">${escapeHtml(item.category)}</p>
<h1 style="font-size:2rem;font-weight:900;line-height:1.15">${title}</h1>
<p style="color:#667085">Por ${escapeHtml(item.player)} · <time datetime="${escapeHtml(date)}">${date ? new Intl.DateTimeFormat("pt-BR",{dateStyle:"long",timeStyle:"short"}).format(new Date(date)) : "Data não disponível"}</time></p>
${item.image ? '<img src="' + escapeHtml(image) + '" alt="" style="width:100%;max-height:480px;object-fit:contain;margin:1.5rem 0">' : ""}
<p style="white-space:pre-wrap;line-height:1.8">${body}</p>
<p style="margin-top:2rem"><a href="/?noticia=${encodeURIComponent(item.id)}" style="color:#b42318;font-weight:800">Abrir no portal para curtir e comentar</a></p>
</main></body></html>`);
  } catch (error) {
    res.status(502).send("Não foi possível carregar esta notícia. Tente novamente mais tarde.");
  } finally {
    clearTimeout(timeout);
  }
};
