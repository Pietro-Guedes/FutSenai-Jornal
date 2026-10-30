(() => {
  "use strict";

  const SESSION_KEY = "jornal-futsenai-auth-session";
  const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%237f1420'/%3E%3Cstop offset='1' stop-color='%23e64855'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='450' fill='url(%23g)'/%3E%3Crect x='120' y='70' width='560' height='260' rx='10' fill='none' stroke='white' stroke-opacity='.25' stroke-width='4'/%3E%3Cpath d='M400 70v260' stroke='white' stroke-opacity='.25' stroke-width='4'/%3E%3Ccircle cx='400' cy='200' r='58' fill='none' stroke='white' stroke-opacity='.25' stroke-width='4'/%3E%3Cpath d='m400 162 28 20-11 34h-34l-11-34z' fill='white' fill-opacity='.95'/%3E%3Ctext x='400' y='390' text-anchor='middle' font-family='Arial,sans-serif' font-size='25' font-weight='700' fill='white' fill-opacity='.95'%3EFUTSENAI%20%7C%20PLANT%C3%83O%20DO%20INTERVALO%3C/text%3E%3C/svg%3E";
  const feed = document.querySelector("#news-feed");
  const count = document.querySelector("#news-count");
  const message = document.querySelector("#feed-message");
  const articleLayer = document.querySelector("#article-layer");
  const likeRecords = new Map();
  const COMMENTS_REFRESH_INTERVAL_MS = 15000;
  let likedNewsIds = new Set();
  let authSession = null;
  let currentArticleId = null;
  let commentsRefreshTimer = null;
  let news = [];

  function readAuthSession() {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return stored && typeof stored.access_token === "string" &&
        typeof stored.refresh_token === "string" && stored.user &&
        typeof stored.user.id === "string" ? stored : null;
    } catch (error) {
      showMessage("Não foi possível ler sua sessão para as curtidas: " + error.message, true);
      return null;
    }
  }

  async function likeRequest(path, options) {
    const config = window.FUTSENAI_SUPABASE;
    if (!config || !config.url || !config.anonKey) {
      throw new Error("O Supabase não está configurado.");
    }

    const send = () => fetch(config.url.replace(/\/$/, "") + path, {
      ...options,
      headers: {
        apikey: config.anonKey,
        Authorization: "Bearer " + (authSession ? authSession.access_token : config.anonKey),
        ...(options && options.headers)
      }
    });
    let response = await send();
    if (response.status === 401 && authSession) {
      const refreshResponse = await fetch(config.url.replace(/\/$/, "") +
        "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: config.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: authSession.refresh_token })
      });
      const refreshed = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok || typeof refreshed.access_token !== "string") {
        throw new Error("Sua sessão expirou. Entre novamente para curtir notícias.");
      }
      authSession = refreshed;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(authSession));
      } catch (error) {
        throw new Error("Não foi possível atualizar sua sessão: " + error.message);
      }
      window.dispatchEvent(new CustomEvent("futsenai-auth-session-updated", { detail: authSession }));
      response = await send();
    }
    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        const body = text ? JSON.parse(text) : {};
        detail = body.message || body.msg || body.error_description || text;
      } catch {
        detail = text;
      }
      throw new Error("Supabase respondeu " + response.status + (detail ? ": " + detail : ""));
    }
    return text ? JSON.parse(text) : null;
  }

  function getLikeRecord(id) {
    return likeRecords.get(id) || [];
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
    const liked = likedNewsIds.has(id);
    const names = getLikeRecord(id);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.likeId = id;
    button.className = className + (liked ? " is-liked" : "");
    button.setAttribute("aria-pressed", String(liked));
    button.setAttribute("aria-label", liked ? "Remover sua curtida" : "Curtir esta notícia");
    button.textContent = (liked ? "♥ Curtido" : authSession ? "♡ Curtir" : "♡ Entrar para curtir") +
      " · " + names.length;
    return button;
  }

  function createLikeNames(id, className) {
    const summary = document.createElement("p");
    summary.dataset.likeNamesFor = id;
    summary.className = className;
    updateLikeNamesElement(summary, id);
    return summary;
  }

  function updateLikeNamesElement(element, id) {
    const names = getLikeRecord(id);
    element.textContent = names.length
      ? "Curtiram: " + names.join(", ")
      : "Ainda ninguém curtiu.";
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
    content.append(createLikeNames(item.id, "mt-2 text-xs leading-5 text-slate-500"));
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
    currentArticleId = item.id;

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
    const likeNames = document.querySelector("#article-like-names");
    if (likeNames) updateLikeNamesElement(likeNames, item.id);
    updateCommentFormState();
    loadArticleComments(item.id);
    if (commentsRefreshTimer !== null) window.clearInterval(commentsRefreshTimer);
    commentsRefreshTimer = window.setInterval(() => {
      if (!document.hidden && !articleLayer.classList.contains("hidden") && currentArticleId) {
        loadArticleComments(currentArticleId);
      }
    }, COMMENTS_REFRESH_INTERVAL_MS);

    articleLayer.classList.remove("hidden");
    articleLayer.classList.add("flex");
    articleLayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => document.querySelector("#close-article").focus());
  }

  function closeArticle() {
    if (commentsRefreshTimer !== null) {
      window.clearInterval(commentsRefreshTimer);
      commentsRefreshTimer = null;
    }
    articleLayer.classList.add("hidden");
    articleLayer.classList.remove("flex");
    articleLayer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("overflow-hidden");
  }

  function updateCommentFormState() {
    authSession = readAuthSession();
    const note = document.querySelector("#article-comment-auth-note");
    const submit = document.querySelector("#article-comment-form button[type='submit']");
    const input = document.querySelector("#article-comment-input");
    const signedIn = Boolean(authSession);
    note.textContent = signedIn
      ? "Seu apelido público aparecerá ao lado do comentário."
      : "Entre com Google e escolha um apelido para comentar.";
    input.disabled = !signedIn;
    submit.disabled = !signedIn;
  }

  function renderArticleComments(comments) {
    const list = document.querySelector("#article-comments-list");
    list.replaceChildren();
    if (!comments.length) {
      const empty = document.createElement("p");
      empty.className = "text-sm text-slate-500";
      empty.textContent = "Ainda não há comentários. Seja o primeiro!";
      list.append(empty);
      return;
    }

    comments.forEach(comment => {
      const card = document.createElement("article");
      card.className = "rounded-xl border border-slate-200 bg-slate-50 p-4";
      const header = document.createElement("div");
      header.className = "flex flex-wrap items-center justify-between gap-2";
      const author = document.createElement("p");
      author.className = "text-sm font-extrabold text-slate-800";
      author.textContent = comment.nickname;
      const date = document.createElement("time");
      date.className = "text-xs text-slate-500";
      date.dateTime = comment.created_at;
      date.textContent = formatDate(comment.created_at);
      header.append(author, date);
      const content = document.createElement("p");
      content.className = "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700";
      content.textContent = comment.content;
      card.append(header, content);
      if (authSession && authSession.user.id === comment.user_id) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "mt-3 text-xs font-bold text-slate-500 underline hover:text-red-700";
        remove.textContent = "Apagar meu comentário";
        remove.addEventListener("click", () => removeOwnComment(comment));
        card.append(remove);
      }
      list.append(card);
    });
  }

  async function loadArticleComments(newsId) {
    const list = document.querySelector("#article-comments-list");
    list.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "text-sm text-slate-500";
    loading.textContent = "Carregando comentários…";
    list.append(loading);
    try {
      const comments = await likeRequest("/rest/v1/rpc/get_news_comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_news_id: newsId })
      });
      if (!Array.isArray(comments) || comments.some(comment =>
        !comment || typeof comment.comment_id !== "number" ||
        typeof comment.news_id !== "string" ||
        (comment.user_id !== null && typeof comment.user_id !== "string") ||
        typeof comment.nickname !== "string" || typeof comment.content !== "string" ||
        typeof comment.created_at !== "string" || Number.isNaN(new Date(comment.created_at).getTime()))) {
        throw new Error("O banco retornou comentários fora do formato esperado.");
      }
      if (currentArticleId === newsId) renderArticleComments(comments);
    } catch (error) {
      if (currentArticleId !== newsId) return;
      list.replaceChildren();
      const failure = document.createElement("p");
      failure.className = "text-sm text-red-700";
      failure.textContent = "Não foi possível carregar os comentários: " + error.message;
      list.append(failure);
    }
  }

  async function removeOwnComment(comment) {
    if (!authSession || authSession.user.id !== comment.user_id) return;
    if (!window.confirm("Apagar seu comentário? Essa ação não pode ser desfeita.")) return;
    try {
      await likeRequest("/rest/v1/news_comments?comment_id=eq." +
        encodeURIComponent(comment.comment_id) + "&user_id=eq." +
        encodeURIComponent(authSession.user.id), { method: "DELETE" });
      await loadArticleComments(comment.news_id);
      showMessage("Seu comentário foi apagado.", false);
    } catch (error) {
      showMessage("Não foi possível apagar o comentário: " + error.message, true);
    }
  }

  document.querySelector("#article-comment-form").addEventListener("submit", async event => {
    event.preventDefault();
    authSession = readAuthSession();
    const input = document.querySelector("#article-comment-input");
    const content = input.value.trim();
    if (!authSession) {
      updateCommentFormState();
      showMessage("Entre com Google para comentar.", false);
      document.querySelector("#account-heading").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!currentArticleId || !content) {
      showMessage("Escreva um comentário antes de enviar.", true);
      return;
    }

    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const profiles = await likeRequest("/rest/v1/profiles?select=user_id&user_id=eq." +
        encodeURIComponent(authSession.user.id));
      if (!Array.isArray(profiles) || !profiles.length) {
        throw new Error("Escolha seu apelido público na área de palpites antes de comentar.");
      }
      await likeRequest("/rest/v1/news_comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          news_id: currentArticleId,
          user_id: authSession.user.id,
          content
        })
      });
      input.value = "";
      await loadArticleComments(currentArticleId);
      showMessage("Comentário publicado.", false);
    } catch (error) {
      showMessage("Não foi possível publicar o comentário: " + error.message, true);
    } finally {
      updateCommentFormState();
    }
  });

  window.addEventListener("futsenai-auth-session-updated", event => {
    authSession = event.detail && typeof event.detail.access_token === "string" ? event.detail : null;
    updateCommentFormState();
    if (currentArticleId) loadArticleComments(currentArticleId);
  });

  window.addEventListener("futsenai-auth-state-changed", event => {
    authSession = event.detail && typeof event.detail.access_token === "string" ? event.detail : null;
    updateCommentFormState();
    if (currentArticleId) loadArticleComments(currentArticleId);
    loadLikeRecords().then(renderNews).catch(error => {
      showMessage("Não foi possível atualizar as curtidas: " + error.message, true);
    });
  });

  async function toggleLike(id) {
    authSession = readAuthSession();
    if (!authSession) {
      showMessage("Entre com sua conta Google para curtir uma notícia.", false);
      document.querySelector("#account-heading").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      await loadLikeRecords();
      const profileRows = await likeRequest("/rest/v1/profiles?select=user_id&user_id=eq." +
        encodeURIComponent(authSession.user.id));
      if (!Array.isArray(profileRows) || !profileRows.length) {
        showMessage("Defina seu apelido público na área de palpites antes de curtir notícias.", false);
        document.querySelector("#nickname-form").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      const liked = likedNewsIds.has(id);
      const query = "?news_id=eq." + encodeURIComponent(id) +
        "&user_id=eq." + encodeURIComponent(authSession.user.id);
      if (liked) {
        await likeRequest("/rest/v1/news_likes" + query, { method: "DELETE" });
      } else {
        await likeRequest("/rest/v1/news_likes", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ news_id: id, user_id: authSession.user.id })
        });
      }
      await loadLikeRecords();
      renderNews();
      if (!articleLayer.classList.contains("hidden")) {
        const currentArticleId = document.querySelector("#article-like").dataset.likeId;
        if (currentArticleId) openArticle(currentArticleId);
      }
      message.classList.add("hidden");
    } catch (error) {
      showMessage("Não foi possível atualizar a curtida: " + error.message, true);
    }
  }

  async function loadLikeRecords() {
    authSession = readAuthSession();
    const rows = await likeRequest("/rest/v1/rpc/get_news_likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    if (!Array.isArray(rows) || rows.some(row =>
      !row || typeof row.news_id !== "string" || !Array.isArray(row.nicknames) ||
      row.nicknames.some(name => typeof name !== "string"))) {
      throw new Error("O banco retornou uma lista de curtidas inválida.");
    }
    likeRecords.clear();
    rows.forEach(row => likeRecords.set(row.news_id, row.nicknames));
    if (!authSession) {
      likedNewsIds = new Set();
      return;
    }
    const ownLikes = await likeRequest("/rest/v1/news_likes?select=news_id&user_id=eq." +
      encodeURIComponent(authSession.user.id));
    if (!Array.isArray(ownLikes) || ownLikes.some(row => !row || typeof row.news_id !== "string")) {
      throw new Error("O banco retornou suas curtidas em um formato inválido.");
    }
    likedNewsIds = new Set(ownLikes.map(row => row.news_id));
  }

  async function refreshLikeRecords() {
    try {
      await loadLikeRecords();
      renderNews();
    } catch (error) {
      showMessage("As notícias foram carregadas, mas não foi possível carregar as curtidas: " + error.message, true);
    }
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

    const config = window.FUTSENAI_SUPABASE;
    let remoteError = null;
    if (config && config.url && config.anonKey) {
      try {
        const response = await fetch(config.url.replace(/\/$/, "") +
          "/rest/v1/news?select=id,title,category,player,image,content,created_at&order=created_at.desc", {
          headers: { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey },
          cache: "no-store"
        });
        if (!response.ok) throw new Error("Supabase respondeu HTTP " + response.status);
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.some(item =>
          !item || typeof item.id !== "string" ||
          typeof item.title !== "string" ||
          typeof item.category !== "string" ||
          typeof item.player !== "string" ||
          typeof item.content !== "string" ||
          typeof item.created_at !== "string" ||
          Number.isNaN(new Date(item.created_at).getTime()) ||
          (item.image !== undefined && typeof item.image !== "string")
        )) {
          throw new Error("O banco retornou notícias fora do formato esperado.");
        }
        news = rows.map(item => ({
          id: item.id,
          title: item.title,
          category: item.category,
          player: item.player,
          image: item.image || "",
          content: item.content,
          createdAt: item.created_at
        }));
        if (news.length) {
          renderNews();
          await refreshLikeRecords();
          return;
        }
        remoteError = new Error("Ainda não há notícias no banco de dados.");
      } catch (error) {
        remoteError = error;
      }
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
      await refreshLikeRecords();
      if (remoteError) {
        showMessage("Exibindo noticias.json porque as notícias online não puderam ser carregadas. " +
          remoteError.message + " Importe o arquivo no painel administrativo para sincronizar o banco.", true);
      }
    } catch (error) {
      news = [];
      renderNews();
      showMessage("Não foi possível carregar as notícias publicadas. " +
        (remoteError ? "Banco: " + remoteError.message + ". " : "") +
        "Confira se o Supabase e noticias.json estão configurados. Detalhe: " + error.message, true);
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
