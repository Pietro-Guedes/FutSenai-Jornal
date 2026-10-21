(() => {
  "use strict";

  const LIKE_KEY = "jornal-futsenai-curtidas";
  const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%237f1420'/%3E%3Cstop offset='1' stop-color='%23e64855'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='450' fill='url(%23g)'/%3E%3Crect x='120' y='70' width='560' height='260' rx='10' fill='none' stroke='white' stroke-opacity='.25' stroke-width='4'/%3E%3Cpath d='M400 70v260' stroke='white' stroke-opacity='.25' stroke-width='4'/%3E%3Ccircle cx='400' cy='200' r='58' fill='none' stroke='white' stroke-opacity='.25' stroke-width='4'/%3E%3Cpath d='m400 162 28 20-11 34h-34l-11-34z' fill='white' fill-opacity='.95'/%3E%3Ctext x='400' y='390' text-anchor='middle' font-family='Arial,sans-serif' font-size='25' font-weight='700' fill='white' fill-opacity='.95'%3EFUTSENAI%20%7C%20PLANT%C3%83O%20DO%20INTERVALO%3C/text%3E%3C/svg%3E";
  const feed = document.querySelector("#news-feed");
  const count = document.querySelector("#news-count");
  const message = document.querySelector("#feed-message");
  const articleLayer = document.querySelector("#article-layer");
  const likes = loadLikes();
  let news = [];

  function loadLikes() {
    try {
      const stored = JSON.parse(localStorage.getItem(LIKE_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored.filter(id => typeof id === "string") : []);
    } catch (error) {
      showMessage("Não foi possível carregar suas curtidas deste navegador: " + error.message, true);
      return new Set();
    }
  }

  function showMessage(text, isError) {
    message.textContent = text;
    message.classList.remove("hidden");
    message.className = "mb-5 rounded-xl border px-4 py-3 text-sm font-medium " +
      (isError ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-600");
  }

  function safeImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return FALLBACK_IMAGE;
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : FALLBACK_IMAGE;
    } catch {
      return FALLBACK_IMAGE;
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data não disponível";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }

  function badgeClass(category) {
    const styles = {
      BOMBA: "bg-red-100 text-red-800",
      VAR: "bg-rose-100 text-rose-800",
      PIPOCADA: "bg-red-50 text-red-700",
      TRANSFERÊNCIA: "bg-rose-200 text-rose-900",
      CHORO: "bg-pink-100 text-rose-800",
      CANELADA: "bg-slate-100 text-slate-700"
    };
    return styles[category] || "bg-red-100 text-red-800";
  }

  function createIcon(path) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("h-3.5", "w-3.5");
    const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathElement.setAttribute("d", path);
    svg.append(pathElement);
    return svg;
  }

  function makeLikeButton(id, className) {
    const liked = likes.has(id);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.likeId = id;
    button.className = className + (liked ? " is-liked" : "");
    button.setAttribute("aria-pressed", String(liked));
    button.setAttribute("aria-label", liked ? "Remover curtida" : "Curtir esta notícia");
    button.textContent = liked ? "♥ Curtido" : "♡ Curtir";
    return button;
  }

  function createCard(item) {
    const article = document.createElement("article");
    article.className = "news-card group overflow-hidden rounded-2xl border border-red-100 bg-white";

    const imageWrap = document.createElement("div");
    imageWrap.className = "cover-wrap relative h-48";
    const image = document.createElement("img");
    image.className = "cover-image";
    image.src = safeImageUrl(item.image);
    image.alt = "Imagem da notícia: " + item.title;
    image.loading = "lazy";
    image.addEventListener("error", () => { image.src = FALLBACK_IMAGE; }, { once: true });
    const badge = document.createElement("span");
    badge.className = "category-badge absolute left-4 top-4 rounded-md px-2.5 py-1.5 text-[10px] font-black " + badgeClass(item.category);
    badge.textContent = item.category;
    imageWrap.append(image, badge);

    const content = document.createElement("div");
    content.className = "flex min-h-[245px] flex-col p-5";
    const heading = document.createElement("h3");
    heading.className = "mb-2 text-lg font-black leading-snug tracking-tight";
    const titleButton = document.createElement("button");
    titleButton.type = "button";
    titleButton.className = "text-left text-slate-900 transition hover:text-red-700 focus:outline-none focus-visible:underline";
    titleButton.textContent = item.title;
    titleButton.setAttribute("aria-label", "Ler matéria: " + item.title);
    titleButton.addEventListener("click", () => openArticle(item.id));
    heading.append(titleButton);

    const player = document.createElement("p");
    player.className = "mb-3 flex items-center gap-2 text-xs font-bold text-red-700";
    player.append(createIcon("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"));
    player.append(document.createTextNode(item.player));

    const summary = document.createElement("p");
    summary.className = "mb-5 line-clamp-3 text-sm leading-6 text-slate-600";
    summary.textContent = item.content;

    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "mb-4 w-fit text-xs font-extrabold text-red-700 transition hover:text-red-900";
    readButton.textContent = "Ler matéria completa →";
    readButton.addEventListener("click", () => openArticle(item.id));

    const footer = document.createElement("div");
    footer.className = "mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-red-50 pt-3.5";
    const date = document.createElement("time");
    date.className = "text-[11px] font-medium text-slate-400";
    date.dateTime = item.createdAt;
    date.textContent = formatDate(item.createdAt);
    footer.append(date, makeLikeButton(item.id, "like-button text-xs font-extrabold text-red-700 transition hover:text-red-900"));
    content.append(heading, player, summary, readButton, footer);
    article.append(imageWrap, content);
    return article;
  }

  function renderNews() {
    const sortedNews = [...news].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    feed.replaceChildren();
    count.textContent = news.length + (news.length === 1 ? " publicação" : " publicações");
    sortedNews.forEach(item => feed.append(createCard(item)));
    if (!news.length) {
      const empty = document.createElement("p");
      empty.className = "col-span-full rounded-2xl border border-dashed border-red-200 bg-white px-6 py-12 text-center text-sm text-slate-500";
      empty.textContent = "Ainda não há notícias publicadas. Volte em breve para conferir as novidades do intervalo!";
      feed.append(empty);
    }
  }

  function openArticle(id) {
    const item = news.find(entry => entry.id === id);
    if (!item) return;

    const image = document.querySelector("#article-image");
    image.src = safeImageUrl(item.image);
    image.alt = "Imagem da matéria: " + item.title;
    image.onerror = () => { image.src = FALLBACK_IMAGE; };

    const category = document.querySelector("#article-category");
    category.className = "category-badge inline-block rounded-md px-2.5 py-1.5 text-[10px] font-black " + badgeClass(item.category);
    category.textContent = item.category;
    document.querySelector("#article-title").textContent = item.title;
    document.querySelector("#article-player").textContent = "⚽ " + item.player;
    const date = document.querySelector("#article-date");
    date.dateTime = item.createdAt;
    date.textContent = "Publicado em " + formatDate(item.createdAt);
    document.querySelector("#article-content").textContent = item.content;

    const likeButton = document.querySelector("#article-like");
    const currentLikeButton = makeLikeButton(item.id, likeButton.className.replace(" is-liked", ""));
    likeButton.dataset.likeId = item.id;
    likeButton.className = currentLikeButton.className;
    likeButton.setAttribute("aria-pressed", currentLikeButton.getAttribute("aria-pressed"));
    likeButton.setAttribute("aria-label", currentLikeButton.getAttribute("aria-label"));
    likeButton.textContent = currentLikeButton.textContent;

    articleLayer.classList.remove("hidden");
    articleLayer.classList.add("flex");
    articleLayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => document.querySelector("#close-article").focus());
  }

  function closeArticle() {
    articleLayer.classList.add("hidden");
    articleLayer.classList.remove("flex");
    articleLayer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("overflow-hidden");
  }

  function toggleLike(id) {
    const nextLikes = new Set(likes);
    if (nextLikes.has(id)) nextLikes.delete(id);
    else nextLikes.add(id);
    try {
      localStorage.setItem(LIKE_KEY, JSON.stringify([...nextLikes]));
    } catch (error) {
      showMessage("Não foi possível salvar sua curtida neste navegador: " + error.message, true);
      return;
    }
    likes.clear();
    nextLikes.forEach(likeId => likes.add(likeId));
    message.classList.add("hidden");
    document.querySelectorAll("[data-like-id]").forEach(button => {
      if (button.dataset.likeId !== id) return;
      const liked = likes.has(id);
      button.classList.toggle("is-liked", liked);
      button.setAttribute("aria-pressed", String(liked));
      button.setAttribute("aria-label", liked ? "Remover curtida" : "Curtir esta notícia");
      button.textContent = liked ? "♥ Curtido" : "♡ Curtir";
    });
  }

  async function loadPublishedNews() {
    if (window.location.protocol === "file:") {
      try {
        const stored = localStorage.getItem("jornal-futsenai-noticias");
        if (stored) {
          const parsed = JSON.parse(stored);
          const isValid = Array.isArray(parsed) && parsed.every(item =>
            item && typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.category === "string" &&
            typeof item.player === "string" &&
            typeof item.content === "string" &&
            typeof item.createdAt === "string" &&
            !Number.isNaN(new Date(item.createdAt).getTime())
          );
          if (!isValid) throw new Error("As notícias locais não estão no formato esperado.");
          news = parsed;
          renderNews();
          showMessage("Prévia local: os alunos verão o arquivo noticias.json publicado, não estas notícias salvas neste navegador.", false);
          return;
        }
      } catch (error) {
        showMessage("Não foi possível ler notícias locais: " + error.message, true);
      }
      news = [];
      renderNews();
      showMessage("Para carregar noticias.json nesta prévia local, abra o site com um servidor local ou publique-o em uma hospedagem.", true);
      return;
    }

    try {
      const response = await fetch("noticias.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Resposta HTTP " + response.status);
      const parsed = await response.json();
      if (!Array.isArray(parsed) || parsed.some(item =>
        !item || typeof item !== "object" ||
        typeof item.id !== "string" ||
        typeof item.title !== "string" ||
        typeof item.category !== "string" ||
        typeof item.player !== "string" ||
        typeof item.content !== "string" ||
        typeof item.createdAt !== "string" ||
        Number.isNaN(new Date(item.createdAt).getTime())
      )) {
        throw new Error("O arquivo noticias.json não tem o formato esperado.");
      }
      news = parsed;
      renderNews();
    } catch (error) {
      news = [];
      renderNews();
      showMessage("Não foi possível carregar as notícias publicadas. Confira se noticias.json está na mesma pasta do site e se ele foi enviado à hospedagem. Detalhe: " + error.message, true);
    }
  }

  document.querySelector("#close-article").addEventListener("click", closeArticle);
  document.querySelector("#back-to-news").addEventListener("click", closeArticle);
  articleLayer.addEventListener("click", event => {
    if (event.target === articleLayer) closeArticle();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !articleLayer.classList.contains("hidden")) closeArticle();
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-like-id]");
    if (button) toggleLike(button.dataset.likeId);
  });

  loadPublishedNews();
})();
