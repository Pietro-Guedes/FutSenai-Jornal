(() => {
  "use strict";

  const SESSION_KEY = "jornal-futsenai-auth-session";
  const config = window.FUTSENAI_SUPABASE;
  const apiEndpoint = "/api/football";
  const season = new Date().getFullYear();
  const followedTeams = new Map();
  const status = document.querySelector("#football-status");
  const accountStatus = document.querySelector("#football-account-status");
  const teamPicker = document.querySelector("#football-team-picker");
  const followButton = document.querySelector("#football-follow-button");
  const loginButton = document.querySelector("#football-login-button");
  const favoritesContainer = document.querySelector("#football-favorites");
  const fixturesContainer = document.querySelector("#football-fixtures");
  const fixtureFilter = document.querySelector("#football-fixture-filter");
  const teamsById = new Map();
  let session = null;
  let teams = [];
  let fixtures = [];

  const statLabels = {
    "Shots on Goal": "Chutes no gol",
    "Shots off Goal": "Chutes para fora",
    "Total Shots": "Finalizações",
    "Blocked Shots": "Chutes bloqueados",
    "Shots insidebox": "Chutes na área",
    "Shots outsidebox": "Chutes fora da área",
    "Fouls": "Faltas",
    "Corner Kicks": "Escanteios",
    "Offsides": "Impedimentos",
    "Ball Possession": "Posse de bola",
    "Yellow Cards": "Cartões amarelos",
    "Red Cards": "Cartões vermelhos",
    "Goalkeeper Saves": "Defesas",
    "Total passes": "Passes",
    "Passes accurate": "Passes certos",
    "Passes %": "Precisão nos passes",
    "expected_goals": "Gols esperados"
  };
  const preferredStats = [
    "Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks",
    "Fouls", "Yellow Cards", "Red Cards", "Goalkeeper Saves"
  ];

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function readSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed.access_token === "string" &&
        typeof parsed.refresh_token === "string" && parsed.user &&
        typeof parsed.user.id === "string" ? parsed : null;
    } catch (error) {
      console.error("Não foi possível ler a conta para os times favoritos:", error);
      accountStatus.textContent = "Não foi possível ler sua sessão. Atualize a página e tente novamente.";
      return null;
    }
  }

  function updateAccountControls() {
    const signedIn = Boolean(session);
    accountStatus.textContent = signedIn
      ? "Seus favoritos ficam salvos na conta."
      : "Entre na sua conta para salvar seus times favoritos e sincronizá-los entre dispositivos.";
    loginButton.hidden = signedIn;
    teamPicker.disabled = !signedIn || !teams.length;
    followButton.disabled = !signedIn || !teams.length;
  }

  function handleAccountChange(nextSession) {
    session = nextSession && typeof nextSession.access_token === "string" &&
      nextSession.user && typeof nextSession.user.id === "string" ? nextSession : null;
    followedTeams.clear();
    updateAccountControls();
    if (session) {
      loadFavorites().catch(error => {
        console.error("Não foi possível carregar os times favoritos:", error);
        accountStatus.textContent = "Não foi possível carregar seus favoritos: " + error.message;
      });
    } else {
      renderFavorites();
    }
  }

  async function refreshSession() {
    if (!session || !session.refresh_token || !config || !config.url || !config.anonKey) return false;
    const response = await fetch(config.url.replace(/\/$/, "") + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== "string") {
      session = null;
      window.dispatchEvent(new CustomEvent("futsenai-auth-state-changed", { detail: null }));
      throw new Error(body.message || body.error_description || "Sua sessão expirou. Entre novamente.");
    }
    session = { ...session, ...body, user: body.user || session.user };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      throw new Error("Não foi possível salvar a sessão atualizada: " + error.message);
    }
    window.dispatchEvent(new CustomEvent("futsenai-auth-session-updated", { detail: session }));
    return true;
  }

  async function supabaseRequest(path, options) {
    if (!config || !config.url || !config.anonKey) {
      throw new Error("A conexão com o Supabase não está configurada.");
    }
    if (!session) throw new Error("Entre na sua conta para gerenciar times favoritos.");

    const send = () => fetch(config.url.replace(/\/$/, "") + "/rest/v1/" + path, {
      ...options,
      headers: {
        apikey: config.anonKey,
        Authorization: "Bearer " + session.access_token,
        ...(options && options.headers)
      }
    });
    let response = await send();
    if (response.status === 401 && await refreshSession()) response = await send();
    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        const body = text ? JSON.parse(text) : {};
        detail = body.message || body.details || body.hint || text;
      } catch {
        detail = text;
      }
      throw new Error("Supabase respondeu " + response.status +
        (response.status === 404
          ? ". Execute a versão atualizada de supabase-setup.sql."
          : detail ? ": " + detail : ""));
    }
    if (response.status === 204) return null;
    const body = await response.text();
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new Error("O Supabase respondeu com JSON inválido: " + error.message);
    }
  }

  async function fetchFootball(type, extra) {
    const params = new URLSearchParams({ type, season: String(season), ...(extra || {}) });
    let response;
    try {
      response = await fetch(apiEndpoint + "?" + params.toString());
    } catch (error) {
      throw new Error("Não foi possível acessar a função de jogos. Confira a publicação da pasta api/.");
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "A consulta de jogos respondeu com erro " + response.status + ".");
    return body;
  }

  function fillTeamSelectors() {
    const pickerOptions = [new Option("Escolha um time", "")];
    teams.forEach(team => pickerOptions.push(new Option(team.name, String(team.id))));
    teamPicker.replaceChildren(...pickerOptions);

    const filterOptions = [new Option("Todos os times", "all"), new Option("Só meus favoritos", "favorites")];
    teams.forEach(team => filterOptions.push(new Option(team.name, String(team.id))));
    fixtureFilter.replaceChildren(...filterOptions);
    fixtureFilter.disabled = false;
    updateAccountControls();
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Horário não disponível";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function createTeamLogo(team, className) {
    const image = createElement("img", className);
    image.alt = "";
    image.loading = "lazy";
    try {
      const url = new URL(team.logo);
      if (url.protocol !== "https:") return null;
      image.src = url.href;
    } catch {
      return null;
    }
    image.addEventListener("error", () => image.remove(), { once: true });
    return image;
  }

  function renderFixtures() {
    const selected = fixtureFilter.value;
    const selectedTeamId = Number(selected);
    let visibleFixtures = fixtures;
    if (selected === "favorites") {
      const favoriteIds = new Set(followedTeams.keys());
      visibleFixtures = fixtures.filter(fixture =>
        favoriteIds.has(fixture.teams.home.id) || favoriteIds.has(fixture.teams.away.id));
    } else if (selected !== "all" && Number.isInteger(selectedTeamId)) {
      visibleFixtures = fixtures.filter(fixture =>
        fixture.teams.home.id === selectedTeamId || fixture.teams.away.id === selectedTeamId);
    }

    if (!visibleFixtures.length) {
      const text = selected === "favorites" && !followedTeams.size
        ? "Siga um time para filtrar os jogos por seus favoritos."
        : "Nenhum próximo jogo encontrado para este filtro.";
      fixturesContainer.replaceChildren(createElement("p", "football-empty", text));
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleFixtures.forEach(fixture => {
      const card = createElement("article", "football-fixture");
      const kickoff = createElement("p", "football-fixture-time", formatDate(fixture.date));
      const home = createElement("div", "football-fixture-team");
      const homeLogo = createTeamLogo(fixture.teams.home, "football-team-logo");
      if (homeLogo) home.append(homeLogo);
      home.append(createElement("span", "", fixture.teams.home.name));
      if (fixture.goals.home !== null) {
        home.append(createElement("strong", "football-fixture-score", String(fixture.goals.home)));
      }
      const away = createElement("div", "football-fixture-team");
      const awayLogo = createTeamLogo(fixture.teams.away, "football-team-logo");
      if (awayLogo) away.append(awayLogo);
      away.append(createElement("span", "", fixture.teams.away.name));
      if (fixture.goals.away !== null) {
        away.append(createElement("strong", "football-fixture-score", String(fixture.goals.away)));
      }
      card.append(kickoff, home, away);
      if (fixture.round) card.append(createElement("p", "football-fixture-round", fixture.round));
      fragment.append(card);
    });
    fixturesContainer.replaceChildren(fragment);
  }

  function renderFavoriteCard(teamId, teamName) {
    const team = teamsById.get(teamId) || { id: teamId, name: teamName, logo: "" };
    const card = createElement("article", "football-favorite");
    const heading = createElement("div", "football-favorite-heading");
    const logo = createTeamLogo(team, "football-team-logo");
    if (logo) heading.append(logo);
    heading.append(createElement("span", "football-favorite-name", team.name));

    const removeButton = createElement("button", "football-remove", "Deixar de seguir");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", "Deixar de seguir " + team.name);
    removeButton.addEventListener("click", () => removeFavorite(team.id, card, removeButton));
    heading.append(removeButton);

    const lastButton = createElement("button", "football-last-button", "Ver partida anterior");
    lastButton.type = "button";
    const previousPanel = createElement("div", "football-previous");
    previousPanel.hidden = true;
    lastButton.addEventListener("click", () =>
      loadPreviousMatch(team, lastButton, previousPanel));
    card.append(heading, lastButton, previousPanel);
    return card;
  }

  function renderFavorites() {
    if (!followedTeams.size) {
      favoritesContainer.replaceChildren(createElement("p", "football-empty",
        session ? "Ainda não há times seguidos. Escolha um time acima para começar." :
          "Entre na sua conta e escolha quais times da Série A quer acompanhar."));
      renderFixtures();
      return;
    }

    const fragment = document.createDocumentFragment();
    followedTeams.forEach((teamName, teamId) => fragment.append(renderFavoriteCard(teamId, teamName)));
    favoritesContainer.replaceChildren(fragment);
    renderFixtures();
  }

  async function loadFavorites() {
    if (!session) {
      followedTeams.clear();
      renderFavorites();
      return;
    }
    const rows = await supabaseRequest("favorite_football_teams?select=team_id,team_name&order=created_at.asc");
    if (!Array.isArray(rows) || rows.some(row =>
      !row || !Number.isInteger(row.team_id) || typeof row.team_name !== "string")) {
      throw new Error("O Supabase retornou uma lista inválida de times favoritos.");
    }
    followedTeams.clear();
    rows.forEach(row => followedTeams.set(row.team_id, row.team_name));
    accountStatus.textContent = "Seus favoritos ficam salvos na conta.";
    renderFavorites();
  }

  async function addFavorite() {
    const teamId = Number(teamPicker.value);
    const team = teamsById.get(teamId);
    if (!session) {
      accountStatus.textContent = "Entre na sua conta para salvar seus times favoritos.";
      return;
    }
    if (!team) {
      accountStatus.textContent = "Escolha um time válido da lista.";
      return;
    }
    followButton.disabled = true;
    try {
      await supabaseRequest("favorite_football_teams?on_conflict=user_id%2Cteam_id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal"
        },
        body: JSON.stringify({ user_id: session.user.id, team_id: team.id, team_name: team.name })
      });
      await loadFavorites();
      accountStatus.textContent = team.name + " foi adicionado aos seus favoritos.";
      teamPicker.value = "";
    } catch (error) {
      accountStatus.textContent = "Não foi possível seguir o time: " + error.message;
      console.error("Não foi possível salvar o time favorito:", error);
    } finally {
      updateAccountControls();
    }
  }

  async function removeFavorite(teamId, card, button) {
    if (!session) return;
    button.disabled = true;
    try {
      await supabaseRequest("favorite_football_teams?user_id=eq." +
        encodeURIComponent(session.user.id) + "&team_id=eq." + encodeURIComponent(teamId), {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      followedTeams.delete(teamId);
      card.remove();
      accountStatus.textContent = "Time removido dos seus favoritos.";
      renderFavorites();
    } catch (error) {
      button.disabled = false;
      accountStatus.textContent = "Não foi possível deixar de seguir o time: " + error.message;
      console.error("Não foi possível remover o time favorito:", error);
    }
  }

  function renderPreviousMatch(fixture, panel) {
    if (!fixture) {
      panel.replaceChildren(createElement("p", "football-previous-meta", "Não encontramos uma partida anterior nesta temporada."));
      panel.hidden = false;
      return;
    }

    const previous = createElement("div");
    previous.append(createElement("p", "football-previous-title", "Partida anterior"));
    previous.append(createElement("p", "football-previous-match",
      fixture.teams.home.name + " " + (fixture.goals.home ?? "—") + " × " +
      (fixture.goals.away ?? "—") + " " + fixture.teams.away.name));
    previous.append(createElement("p", "football-previous-meta",
      formatDate(fixture.date) + (fixture.round ? " · " + fixture.round : "")));

    const statsButton = createElement("button", "football-stats-button", "Ver estatísticas da partida");
    statsButton.type = "button";
    const statsPanel = createElement("div", "football-stat-list");
    statsPanel.hidden = true;
    statsButton.addEventListener("click", () => loadStatistics(fixture, statsButton, statsPanel));
    previous.append(statsButton, statsPanel);
    panel.replaceChildren(previous);
    panel.hidden = false;
  }

  async function loadPreviousMatch(team, button, panel) {
    button.disabled = true;
    button.textContent = "Carregando partida…";
    panel.replaceChildren();
    panel.hidden = true;
    try {
      const data = await fetchFootball("last", { team: String(team.id) });
      if (!data || !Array.isArray(data.fixtures)) {
        throw new Error("A resposta do serviço não contém uma lista de partidas válida.");
      }
      renderPreviousMatch(data.fixtures[0] || null, panel);
      button.textContent = "Atualizar partida anterior";
    } catch (error) {
      panel.replaceChildren(createElement("p", "football-previous-meta", error.message));
      panel.hidden = false;
      button.textContent = "Tentar novamente";
      console.error("Não foi possível carregar a partida anterior:", error);
    } finally {
      button.disabled = false;
    }
  }

  function renderStatistics(data, fixture, panel) {
    if (!data || !Array.isArray(data.statistics) || data.statistics.length < 2) {
      panel.replaceChildren(createElement("p", "football-previous-meta",
        "As estatísticas detalhadas não estão disponíveis para esta partida."));
      panel.hidden = false;
      return;
    }
    const byTeam = new Map(data.statistics.map(item => [
      item.team.id,
      new Map(item.statistics.map(statistic => [statistic.type, statistic.value]))
    ]));
    const home = byTeam.get(fixture.teams.home.id);
    const away = byTeam.get(fixture.teams.away.id);
    if (!home || !away) {
      panel.replaceChildren(createElement("p", "football-previous-meta",
        "As estatísticas detalhadas não estão disponíveis para esta partida."));
      panel.hidden = false;
      return;
    }

    const available = preferredStats.filter(type => home.has(type) || away.has(type));
    if (!available.length) {
      panel.replaceChildren(createElement("p", "football-previous-meta",
        "A API não forneceu estatísticas para esta partida."));
      panel.hidden = false;
      return;
    }

    const fragment = document.createDocumentFragment();
    available.forEach(type => {
      const row = createElement("div", "football-stat-item");
      row.append(createElement("span", "", statLabels[type] || type));
      row.append(createElement("strong", "",
        String(home.get(type) ?? "—") + " · " + String(away.get(type) ?? "—")));
      fragment.append(row);
    });
    panel.replaceChildren(fragment);
    panel.hidden = false;
  }

  async function loadStatistics(fixture, button, panel) {
    button.disabled = true;
    button.textContent = "Carregando estatísticas…";
    try {
      const data = await fetchFootball("statistics", { fixture: String(fixture.id) });
      renderStatistics(data, fixture, panel);
      button.textContent = "Atualizar estatísticas";
    } catch (error) {
      panel.replaceChildren(createElement("p", "football-previous-meta", error.message));
      panel.hidden = false;
      button.textContent = "Tentar novamente";
      console.error("Não foi possível carregar estatísticas da partida:", error);
    } finally {
      button.disabled = false;
    }
  }

  async function loadLeagueData() {
    const results = await Promise.allSettled([
      fetchFootball("teams"),
      fetchFootball("fixtures")
    ]);

    if (results[0].status === "rejected") {
      setStatus("Não foi possível carregar os times: " + results[0].reason.message, true);
      teamPicker.replaceChildren(new Option("Times indisponíveis", ""));
      return;
    }

    const teamsResult = results[0].value.teams;
    if (!Array.isArray(teamsResult) || teamsResult.some(team =>
      !team || !Number.isInteger(team.id) || typeof team.name !== "string")) {
      setStatus("O serviço retornou uma lista de times inválida.", true);
      return;
    }
    teams = teamsResult;
    teamsById.clear();
    teams.forEach(team => teamsById.set(team.id, team));
    fillTeamSelectors();

    if (results[1].status === "rejected") {
      fixtures = [];
      renderFixtures();
      setStatus("Os times foram carregados, mas não foi possível buscar os próximos jogos: " +
        results[1].reason.message, true);
      return;
    }

    if (!Array.isArray(results[1].value.fixtures)) {
      setStatus("O serviço retornou uma lista de jogos inválida.", true);
      return;
    }
    fixtures = results[1].value.fixtures;
    renderFixtures();
    setStatus(teams.length + " times da Série A e " + fixtures.length + " próximos jogos carregados.");
  }

  loginButton.addEventListener("click", () => {
    const googleButton = document.querySelector("#google-signin-button");
    if (googleButton && !googleButton.disabled) {
      googleButton.click();
      return;
    }
    accountStatus.textContent = "Use o acesso à conta na seção Adivinhe o placar para entrar.";
    document.querySelector("#prediction-heading").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  followButton.addEventListener("click", addFavorite);
  fixtureFilter.addEventListener("change", renderFixtures);
  window.addEventListener("futsenai-auth-state-changed", event => handleAccountChange(event.detail));
  window.addEventListener("futsenai-auth-session-updated", event => {
    if (event.detail && typeof event.detail.access_token === "string") session = event.detail;
  });
  window.addEventListener("storage", event => {
    if (event.key === SESSION_KEY) handleAccountChange(readSession());
  });

  session = readSession();
  updateAccountControls();
  loadLeagueData().catch(error => {
    setStatus("Não foi possível carregar os dados da Série A: " + error.message, true);
    console.error("Não foi possível carregar os dados do widget de futebol:", error);
  });
  if (session) {
    loadFavorites().catch(error => {
      accountStatus.textContent = "Não foi possível carregar seus favoritos: " + error.message;
      console.error("Não foi possível carregar os times favoritos:", error);
    });
  } else {
    renderFavorites();
  }
})();
