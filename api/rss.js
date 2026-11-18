"use strict";
module.exports = async function handler(req, res) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) {
    res.status(503).setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send("Feed temporariamente indisponível.");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base.replace(/\/$/, "") +
      "/rest/v1/news?select=id,title,category,player,author,content,created_at&published=eq.true&order=created_at.desc&limit=50", {
      headers: { apikey: key, Authorization: "Bearer " + key }, signal: controller.signal
    });
    if (!response.ok) throw new Error("Falha ao consultar notícias.");
    const rows = await response.json();
    const esc = value => String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
    const items = rows.map(item => '<item><title>' + esc(item.title) +
      '</title><link>https://futsenaijornal.vercel.app/noticia/' + encodeURIComponent(item.id) +
      '</link><guid isPermaLink="true">https://futsenaijornal.vercel.app/noticia/' + encodeURIComponent(item.id) +
      '</guid><description>' + esc(item.content) + '</description><pubDate>' +
      new Date(item.created_at).toUTCString() + '</pubDate></item>').join("");
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>' +
      '<title>Jornal FutSenai</title><link>https://futsenaijornal.vercel.app/</link>' +
      '<description>Notícias, futebol e resenha do intervalo.</description>' + items +
      '</channel></rss>');
  } catch (error) {
    res.status(502).send("Não foi possível gerar o feed agora.");
  } finally { clearTimeout(timeout); }
};
