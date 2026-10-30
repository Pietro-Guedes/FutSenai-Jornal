(() => {
  "use strict";

  const config = window.FUTSENAI_SUPABASE;
  const SESSION_KEY = "jornal-futsenai-auth-session";
  const NEWS_ENDPOINT = "/rest/v1/news";
  const INTERACTION_RESOURCES = {
    polls: { endpoint: "/rest/v1/polls", form: "#poll-admin-form", list: "#poll-admin-list" },
    awards: { endpoint: "/rest/v1/weekly_awards", form: "#award-admin-form", list: "#award-admin-list" },
    matches: { endpoint: "/rest/v1/matches", form: "#match-admin-form", list: "#match-admin-list" }
  };
  const STORAGE_BUCKET = "news-images";
  const loginPanel = document.querySelector("#login-panel");
  const editorPanel = document.querySelector("#editor-panel");
  const signinForm = document.querySelector("#signin-form");
  const form = document.querySelector("#admin-form");
  const list = document.querySelector("#admin-news-list");
  const message = document.querySelector("#admin-message");
  const formTitle = document.querySelector("#form-title");
  const count = document.querySelector("#admin-count");
  const cancelEdit = document.querySelector("#cancel-edit");
  const imageFile = document.querySelector("#news-image-file");
  const imageStatus = document.querySelector("#news-image-status");
  let session = null;
  let news = [];
  let interactionRecords = { polls: [], awards: [], matches: [] };
  let selectedImageBlob = null;

  function showMessage(text, isError) {
    message.textContent = text;
    message.className = "mb-6 rounded-xl border px-4 py-3 text-sm font-semibold " +
      (isError ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800");
    message.classList.remove("hidden");
  }

  function ensureConfigured() {
    if (config && config.url && config.anonKey) return;
    throw new Error("O Supabase não está configurado. Confira supabase-config.js.");
  }

  function saveSession(nextSession) {
    session = nextSession;
    if (session && session.expires_in && !session.expires_at) {
      session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
    }
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function authRequest(path, body) {
    ensureConfigured();
    const response = await fetch(config.url.replace(/\/$/, "") + "/auth/v1/" + path, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });
    const text = await response.text();
    let result = {};
    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        result = { message: text };
      }
    }
    if (!response.ok) {
      throw new Error(result.msg || result.message || result.error_description || result.error || "Resposta HTTP " + response.status);
    }
    return result;
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) return false;
    try {
      saveSession(await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token }));
      return true;
    } catch (error) {
      saveSession(null);
      throw error;
    }
  }

  async function request(path, options) {
    ensureConfigured();
    const send = () => fetch(config.url.replace(/\/$/, "") + path, {
      ...options,
      headers: {
        apikey: config.anonKey,
        Authorization: "Bearer " + (session ? session.access_token : config.anonKey),
        ...(options && options.headers)
      }
    });
    let response = await send();
    if (response.status === 401 && session && await refreshSession()) response = await send();
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

  async function isNewsAdmin() {
    return request("/rest/v1/rpc/is_news_admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
  }

  function showLogin() {
    loginPanel.classList.remove("hidden");
    editorPanel.classList.add("hidden");
  }

  async function showEditor() {
    loginPanel.classList.add("hidden");
    editorPanel.classList.remove("hidden");
    document.querySelector("#account-status").textContent =
      "Conectado como " + (session.user.email || "editor autorizado");
    await loadNews();
    await loadInteractionRecords();
  }

  function validateNews(value) {
    return Array.isArray(value) && value.every(item =>
      item && typeof item === "object" &&
      typeof item.id === "string" && item.id.trim().length > 0 &&
      typeof item.title === "string" &&
      typeof item.category === "string" &&
      typeof item.player === "string" &&
      typeof item.content === "string" &&
      typeof (item.createdAt || item.created_at) === "string" &&
      !Number.isNaN(new Date(item.createdAt || item.created_at).getTime()) &&
      (item.image === undefined || typeof item.image === "string")
    );
  }

  async function loadNews() {
    count.textContent = "Carregando…";
    const result = await request(NEWS_ENDPOINT +
      "?select=id,title,category,player,image,content,created_at&order=created_at.desc");
    if (!Array.isArray(result)) throw new Error("O Supabase retornou uma lista de notícias inválida.");
    news = result.map(item => ({
      id: item.id,
      title: item.title,
      category: item.category,
      player: item.player,
      image: item.image || "",
      content: item.content,
      createdAt: item.created_at
    }));
    renderNews();
  }

  async function loadInteractionRecords() {
    const [polls, awards, matches] = await Promise.all([
      request(INTERACTION_RESOURCES.polls.endpoint +
        "?select=id,question,week_start,options,active&order=week_start.desc"),
      request(INTERACTION_RESOURCES.awards.endpoint +
        "?select=id,title,week_start,nominees,active&order=week_start.desc"),
      request(INTERACTION_RESOURCES.matches.endpoint +
        "?select=id,home_team,away_team,match_date,active,home_score,away_score&order=match_date.desc")
    ]);
    if (![polls, awards, matches].every(Array.isArray)) {
      throw new Error("O Supabase retornou dados inválidos para enquetes, prêmios ou jogos.");
    }
    interactionRecords = { polls, awards, matches };
    renderInteractionRecords();
  }

  async function resetActiveVotes() {
    const confirmed = window.confirm(
      "Apagar permanentemente os votos da enquete e dos prêmios ativos? " +
      "Os votos não poderão ser recuperados. Palpites de placar não serão alterados."
    );
    if (!confirmed) return;

    const button = document.querySelector("#reset-active-votes");
    button.disabled = true;
    try {
      const result = await request("/rest/v1/rpc/reset_active_votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (!result || !Number.isInteger(result.poll_votes_deleted) ||
          !Number.isInteger(result.award_votes_deleted)) {
        throw new Error("O Supabase retornou um resultado inesperado ao zerar os votos.");
      }
      showMessage(
        "Votos removidos: " + result.poll_votes_deleted + " da enquete e " +
        result.award_votes_deleted + " dos prêmios ativos.",
        false
      );
    } catch (error) {
      showMessage("Não foi possível zerar os votos: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  function renderInteractionRecords() {
    const recordConfig = {
      polls: {
        title: item => item.question,
        detail: item => item.options.join(" · ") + " | Semana de " + item.week_start
      },
      awards: {
        title: item => item.title,
        detail: item => item.nominees.join(" · ") + " | Semana de " + item.week_start
      },
      matches: {
        title: item => item.home_team + " × " + item.away_team,
        detail: item => "Jogo em " + item.match_date +
          (item.home_score !== null && item.away_score !== null
            ? " | Placar: " + item.home_score + " × " + item.away_score
            : "")
      }
    };

    Object.keys(INTERACTION_RESOURCES).forEach(key => {
      const container = document.querySelector(INTERACTION_RESOURCES[key].list);
      container.replaceChildren();
      const records = interactionRecords[key];
      if (!records.length) {
        const empty = document.createElement("p");
        empty.className = "rounded-lg border border-dashed border-slate-300 bg-white p-4 text-slate-500";
        empty.textContent = "Nenhum item cadastrado.";
        container.append(empty);
        return;
      }

      records.forEach(item => {
        const card = document.createElement("article");
        card.className = "rounded-lg border border-slate-200 bg-white p-3";
        const title = document.createElement("p");
        title.className = "font-bold text-slate-800";
        title.textContent = recordConfig[key].title(item);
        const detail = document.createElement("p");
        detail.className = "mt-1 text-xs leading-5 text-slate-500";
        detail.textContent = recordConfig[key].detail(item);
        const status = document.createElement("p");
        status.className = "mt-1 text-xs font-bold " + (item.active ? "text-green-700" : "text-slate-500");
        status.textContent = item.active ? "Ativo no site" : "Inativo";
        const actions = document.createElement("div");
        actions.className = "mt-2 flex gap-4";
        actions.append(
          createAction("Editar", () => editInteractionRecord(key, item), "text-red-700"),
          createAction(item.active ? "Desativar" : "Ativar",
            () => setInteractionActive(key, item), "text-slate-600")
        );
        card.append(title, detail, status, actions);
        container.append(card);
      });
    });
  }

  function editInteractionRecord(type, item) {
    const formElement = document.querySelector(INTERACTION_RESOURCES[type].form);
    const values = {
      ...item,
      options: item.options ? item.options.join("\n") : undefined,
      nominees: item.nominees ? item.nominees.join("\n") : undefined
    };
    Object.entries(values).forEach(([name, value]) => {
      const field = formElement.elements.namedItem(name);
      if (!field || value === undefined || value === null) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value;
    });
    formElement.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function setInteractionActive(type, item) {
    const resource = INTERACTION_RESOURCES[type];
    try {
      await request(resource.endpoint + "?id=eq." + encodeURIComponent(item.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ active: !item.active })
      });
      await loadInteractionRecords();
      showMessage(item.active
        ? "Item desativado; os votos ou palpites foram preservados."
        : "Item ativado no site.", false);
    } catch (error) {
      showMessage("Não foi possível alterar o status: " + error.message, true);
    }
  }

  function parseLineItems(value, label, min, max) {
    const items = value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (items.length < min || items.length > max) {
      throw new Error(label + (max === min ? " precisa ter " + min : " precisa ter entre " + min + " e " + max) +
        (min === 1 && max === 1 ? " item." : " itens, um por linha."));
    }
    if (new Set(items.map(item => item.toLocaleLowerCase())).size !== items.length) {
      throw new Error(label + " não pode ter itens repetidos.");
    }
    return items;
  }

  function bindInteractionForms() {
    const forms = [
      {
        type: "polls",
        form: document.querySelector(INTERACTION_RESOURCES.polls.form),
        build: data => ({
          id: String(data.get("id")) || crypto.randomUUID(),
          question: String(data.get("question")).trim(),
          options: parseLineItems(String(data.get("options")), "A enquete", 2, 20),
          week_start: String(data.get("week_start")),
          active: data.get("active") === "on"
        })
      },
      {
        type: "awards",
        form: document.querySelector(INTERACTION_RESOURCES.awards.form),
        build: data => ({
          id: String(data.get("id")) || crypto.randomUUID(),
          title: String(data.get("title")).trim(),
          nominees: parseLineItems(String(data.get("nominees")), "O prêmio", 2, 3),
          week_start: String(data.get("week_start")),
          active: data.get("active") === "on"
        })
      },
      {
        type: "matches",
        form: document.querySelector(INTERACTION_RESOURCES.matches.form),
        build: data => ({
          id: String(data.get("id")) || crypto.randomUUID(),
          home_team: String(data.get("home_team")).trim(),
          away_team: String(data.get("away_team")).trim(),
          match_date: String(data.get("match_date")),
          active: data.get("active") === "on"
        })
      }
    ];

    forms.forEach(({ type, form: formElement, build }) => {
      formElement.addEventListener("submit", async event => {
        event.preventDefault();
        if (!formElement.reportValidity()) return;
        const submit = formElement.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
          const record = build(new FormData(formElement));
          if (Object.entries(record).some(([key, value]) =>
            key !== "active" && (typeof value === "string" ? !value : Array.isArray(value) && value.some(item => !item)))) {
            throw new Error("Preencha todos os campos obrigatórios.");
          }
          await request(INTERACTION_RESOURCES[type].endpoint + "?on_conflict=id", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=minimal"
            },
            body: JSON.stringify(record)
          });
          formElement.reset();
          await loadInteractionRecords();
          showMessage("Item salvo. Alterações publicadas no site.", false);
        } catch (error) {
          showMessage("Não foi possível salvar: " + error.message, true);
        } finally {
          submit.disabled = false;
        }
      });
    });
  }

  function resetForm() {
    form.reset();
    selectedImageBlob = null;
    imageStatus.textContent = "JPG, PNG ou WebP. A imagem será enviada ao salvar.";
    document.querySelector("#news-id").value = "";
    formTitle.textContent = "Nova matéria";
    document.querySelector("#save-news").textContent = "Publicar matéria";
    cancelEdit.classList.add("hidden");
  }

  function startEdit(id) {
    const item = news.find(entry => entry.id === id);
    if (!item) return;
    document.querySelector("#news-id").value = item.id;
    document.querySelector("#news-title").value = item.title;
    document.querySelector("#news-category").value = item.category;
    document.querySelector("#news-player").value = item.player;
    document.querySelector("#news-image").value = item.image;
    document.querySelector("#news-content").value = item.content;
    selectedImageBlob = null;
    imageFile.value = "";
    imageStatus.textContent = item.image ? "A imagem atual será mantida, a menos que você escolha outra." : "JPG, PNG ou WebP. A imagem será enviada ao salvar.";
    formTitle.textContent = "Editar matéria";
    document.querySelector("#save-news").textContent = "Salvar alterações";
    cancelEdit.classList.remove("hidden");
    document.querySelector("#news-title").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function createAction(label, action, colorClass) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-xs font-extrabold " + colorClass + " hover:underline";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function renderNews() {
    list.replaceChildren();
    count.textContent = news.length + (news.length === 1 ? " matéria publicada" : " matérias publicadas");
    if (!news.length) {
      const empty = document.createElement("p");
      empty.className = "rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500";
      empty.textContent = "Ainda não há matérias no banco. Importe noticias.json ou crie a primeira notícia.";
      list.append(empty);
      return;
    }

    news.forEach(item => {
      const card = document.createElement("article");
      card.className = "admin-news-item rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
      const header = document.createElement("div");
      header.className = "flex items-start justify-between gap-3";
      const title = document.createElement("h3");
      title.className = "font-extrabold leading-snug text-slate-900";
      title.textContent = item.title;
      const category = document.createElement("span");
      category.className = "shrink-0 rounded bg-red-50 px-2 py-1 text-[10px] font-black text-red-800";
      category.textContent = item.category;
      header.append(title, category);
      const meta = document.createElement("p");
      meta.className = "mt-2 text-xs text-slate-500";
      meta.textContent = item.player + " · " +
        new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(item.createdAt));
      const excerpt = document.createElement("p");
      excerpt.className = "mt-2 line-clamp-2 text-sm leading-5 text-slate-600";
      excerpt.textContent = item.content;
      const actions = document.createElement("div");
      actions.className = "mt-3 flex gap-4 border-t border-slate-100 pt-3";
      actions.append(
        createAction("Editar", () => startEdit(item.id), "text-red-700"),
        createAction("Excluir", () => removeNews(item), "text-slate-500")
      );
      card.append(header, meta, excerpt, actions);
      list.append(card);
    });
  }

  async function removeNews(item) {
    if (!window.confirm('Excluir "' + item.title + '" do site?')) return;
    try {
      await request(NEWS_ENDPOINT + "?id=eq." + encodeURIComponent(item.id), { method: "DELETE" });
      if (document.querySelector("#news-id").value === item.id) resetForm();
      await loadNews();
      showMessage("Matéria excluída do site.", false);
    } catch (error) {
      showMessage("Não foi possível excluir a matéria: " + error.message, true);
    }
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível processar a imagem selecionada."));
      }, "image/jpeg", quality);
    });
  }

  async function compressImage(file) {
    const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!acceptedTypes.includes(file.type)) throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
    if (file.size > 12 * 1024 * 1024) throw new Error("A imagem original deve ter no máximo 12 MB.");

    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Este navegador não conseguiu processar a imagem.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let blob = await canvasToBlob(canvas, 0.82);
      if (blob.size > 700 * 1024) blob = await canvasToBlob(canvas, 0.65);
      if (blob.size > 700 * 1024) throw new Error("A imagem continua muito grande após a redução. Escolha uma imagem menor.");
      return blob;
    } finally {
      bitmap.close();
    }
  }

  async function uploadImage(blob) {
    const fileName = crypto.randomUUID() + ".jpg";
    const path = "/storage/v1/object/" + STORAGE_BUCKET + "/" + fileName;
    await request(path, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
      body: blob
    });
    return config.url.replace(/\/$/, "") + "/storage/v1/object/public/" + STORAGE_BUCKET + "/" + fileName;
  }

  function validateImageUrl(value) {
    if (!value) return;
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return;
    } catch {
      // Report malformed and unsupported URLs with the same actionable message.
    }
    throw new Error("Informe uma URL HTTP/HTTPS ou um caminho de imagem do site.");
  }

  imageFile.addEventListener("change", async () => {
    const file = imageFile.files[0];
    if (!file) return;
    imageStatus.textContent = "Reduzindo imagem…";
    try {
      selectedImageBlob = await compressImage(file);
      document.querySelector("#news-image").value = "";
      imageStatus.textContent = "Imagem pronta (" + Math.ceil(selectedImageBlob.size / 1024) + " KB). Será enviada ao salvar.";
    } catch (error) {
      selectedImageBlob = null;
      imageFile.value = "";
      imageStatus.textContent = "Não foi possível usar esta imagem.";
      showMessage("Não foi possível preparar a imagem: " + error.message, true);
    }
  });

  document.querySelector("#news-image").addEventListener("input", () => {
    selectedImageBlob = null;
    imageFile.value = "";
    imageStatus.textContent = "Será usada a URL informada.";
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const id = document.querySelector("#news-id").value;
    const existing = news.find(item => item.id === id);
    const title = document.querySelector("#news-title").value.trim();
    const player = document.querySelector("#news-player").value.trim();
    const content = document.querySelector("#news-content").value.trim();
    const imageUrl = document.querySelector("#news-image").value.trim();
    const saveButton = document.querySelector("#save-news");
    if (!title || !player || !content) {
      showMessage("Preencha o título, o aluno/turma e o conteúdo da matéria.", true);
      return;
    }
    try {
      validateImageUrl(imageUrl);
    } catch (error) {
      showMessage(error.message, true);
      return;
    }

    saveButton.disabled = true;
    try {
      let image = imageUrl || (existing ? existing.image : "");
      if (selectedImageBlob) image = await uploadImage(selectedImageBlob);
      const record = {
        id: existing ? existing.id : crypto.randomUUID(),
        title,
        category: document.querySelector("#news-category").value,
        player,
        image,
        content,
        created_at: existing ? existing.createdAt : new Date().toISOString()
      };
      await request(NEWS_ENDPOINT + "?on_conflict=id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(record)
      });
      resetForm();
      await loadNews();
      showMessage("Matéria publicada no site.", false);
    } catch (error) {
      showMessage("Não foi possível salvar a matéria: " + error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  });

  cancelEdit.addEventListener("click", resetForm);
  document.querySelector("#refresh-news").addEventListener("click", async () => {
    try {
      await loadNews();
      showMessage("Lista de notícias atualizada.", false);
    } catch (error) {
      showMessage("Não foi possível atualizar as notícias: " + error.message, true);
    }
  });

  document.querySelector("#import-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!validateNews(parsed)) throw new Error("O arquivo não contém uma lista de notícias válida.");
      const ids = new Set();
      const records = parsed.map(item => {
        if (ids.has(item.id)) throw new Error("O arquivo contém IDs de notícias repetidos.");
        ids.add(item.id);
        return {
          id: item.id,
          title: item.title,
          category: item.category,
          player: item.player,
          image: item.image || "",
          content: item.content,
          created_at: item.createdAt || item.created_at
        };
      });
      if (!records.length) throw new Error("O arquivo está vazio; nenhuma notícia foi importada.");
      await request(NEWS_ENDPOINT + "?on_conflict=id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(records)
      });
      resetForm();
      await loadNews();
      showMessage(records.length + (records.length === 1 ? " notícia importada." : " notícias importadas."), false);
    } catch (error) {
      showMessage("Não foi possível importar as notícias: " + error.message, true);
    } finally {
      event.target.value = "";
    }
  });

  signinForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = signinForm.querySelector('button[type="submit"]');
    const data = new FormData(signinForm);
    button.disabled = true;
    try {
      const nextSession = await authRequest("token?grant_type=password", {
        email: String(data.get("email")).trim(),
        password: String(data.get("password"))
      });
      saveSession(nextSession);
      if (!await isNewsAdmin()) {
        showLogin();
        showMessage("Esta conta não tem permissão para editar notícias. Peça ao responsável pelo site para autorizá-la.", true);
        return;
      }
      signinForm.reset();
      await showEditor();
      showMessage("Acesso autorizado. Suas alterações serão publicadas no site.", false);
    } catch (error) {
      showLogin();
      showMessage("Não foi possível entrar: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#signout-button").addEventListener("click", () => {
    saveSession(null);
    showLogin();
    showMessage("Você saiu da área administrativa.", false);
  });

  bindInteractionForms();
  document.querySelector("#reset-active-votes").addEventListener("click", resetActiveVotes);

  async function initialize() {
    try {
      ensureConfigured();
      const saved = localStorage.getItem(SESSION_KEY);
      if (!saved) return;
      session = JSON.parse(saved);
      if (!session || typeof session.access_token !== "string") {
        saveSession(null);
        return;
      }
      if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
        await refreshSession();
        if (!session) return;
      }
      if (!await isNewsAdmin()) {
        saveSession(null);
        return;
      }
      await showEditor();
    } catch (error) {
      showLogin();
      showMessage("Não foi possível carregar a área administrativa: " + error.message, true);
    }
  }

  initialize();
})();
