"use strict";
module.exports = async function handler(req, res) {
  const site = "https://futsenaijornal.vercel.app";
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const urls = [site + "/"];
  if (base && key) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(base.replace(/\/$/, "") +
        "/rest/v1/news?select=id,created_at&published=eq.true&order=created_at.desc", {
        headers: { apikey: key, Authorization: "Bearer " + key }, signal: controller.signal
      });
      if (response.ok) {
        const rows = await response.json();
        rows.forEach(item => urls.push(site + "/noticia/" + encodeURIComponent(item.id)));
      }
    } catch (error) {
      console.error("Sitemap sem notícias dinâmicas:", error.message);
    } finally { clearTimeout(timeout); }
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(url => '<url><loc>' + url.replace(/&/g, "&amp;") + '</loc></url>').join("") +
    '</urlset>');
};
