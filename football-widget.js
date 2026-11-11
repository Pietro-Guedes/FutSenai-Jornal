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
  const standingsContainer = document.querySelector("#football-standings");
  const standingsStatus = document.querySelector("#football-standings-status");
  const standingsToggle = document.querySelector("#football-standings-toggle");
  const standingsContent = document.querySelector("#football-standings-content");
  const simulatorContainer = document.querySelector("#football-simulator");
  const simulatorStatus = document.querySelector("#football-simulator-status");
  const clearSimulationButton = document.querySelector("#football-simulator-clear");
  const roundLabel = document.querySelector("#football-round-label");
  const teamsById = new Map();
  const standingsByTeamId = new Map();
  const simulationScores = new Map();
  let session = null;
  let teams = [];
  let fixtures = [];
  let standings = [];
  let simulationFixtures = [];
  let standingsUpdatedAt = "";
  let botafogoPosition = null;
  let currentRound = null;
  let loadingLeagueData = false;

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

  function renderStandings(rows, simulatedCount) {
    const fragment = document.createDocumentFragment();
    rows.forEach(row => {
      const tr = createElement("tr", "football-standing-row");
      const team = createElement("th", "football-standing-team", "");
      team.scope = "row";
      const logo = createTeamLogo(row.team, "football-standing-logo");
      if (logo) team.append(logo);
      team.append(createElement("span", "", row.team.name));
      tr.append(
        createElement("td", "", String(row.position)),
        team,
        createElement("td", "football-standing-points", String(row.points)),
        createElement("td", "", String(row.playedGames)),
        createElement("td", "", String(row.won)),
        createElement("td", "", String(row.draw)),
        createElement("td", "", String(row.lost)),
        createElement("td", "", String(row.goalDifference))
      );
      fragment.append(tr);
    });
    standingsContainer.replaceChildren(fragment);
    standingsStatus.textContent = simulatedCount
      ? simulatedCount + (simulatedCount === 1 ? " placar simulado" : " placares simulados") +
        " · dados consultados às " + standingsUpdatedAt
      : "Dados consultados às " + standingsUpdatedAt + " · atualização a cada 15 min";
    standingsStatus.classList.remove("is-error");
  }

  function createSimulationInput(fixture, side, team) {
    const input = createElement("input", "football-simulation-score");
    input.type = "number";
    input.min = "0";
    input.max = "99";
    input.step = "1";
    input.inputMode = "numeric";
    input.setAttribute("aria-label", "Gols de " + team.name);
    input.dataset.fixtureId = String(fixture.id);
    input.dataset.teamSide = side;
    const savedScore = simulationScores.get(fixture.id);
    if (savedScore) input.value = savedScore[side];
    return input;
  }

  function renderSimulator(allFixtures) {
    simulationFixtures = allFixtures.filter(fixture =>
      ["SCHEDULED", "TIMED", "POSTPONED", "SUSPENDED"].includes(fixture.status.short));
    const fragment = document.createDocumentFragment();
    const rounds = new Map();
    simulationFixtures.forEach(fixture => {
      const round = Number.isInteger(fixture.matchday) ? fixture.matchday : null;
      if (!rounds.has(round)) rounds.set(round, []);
      rounds.get(round).push(fixture);
    });

    Array.from(rounds.entries()).forEach(entry => {
      const heading = entry[0] === null ? "Rodada a definir" : "Rodada " + entry[0];
      const roundSection = createElement("section", "football-simulation-round");
      roundSection.append(createElement("h4", "football-simulation-round-title", heading));
      const matchList = createElement("div", "football-simulation-round-matches");
      entry[1].forEach(fixture => {
        const card = createElement("article", "football-simulation-match");
        const homeScore = createSimulationInput(fixture, "home", fixture.teams.home);
        const awayScore = createSimulationInput(fixture, "away", fixture.teams.away);
        const scores = createElement("div", "football-simulation-scores");
        scores.append(homeScore, createElement("span", "football-simulation-separator", "×"), awayScore);
        card.append(
          createElement("p", "football-simulation-date", formatDate(fixture.date)),
          createElement("p", "football-simulation-teams",
            fixture.teams.home.name + " × " + fixture.teams.away.name),
          scores
        );
        matchList.append(card);
      });
      roundSection.append(matchList);
      fragment.append(roundSection);
    });

    if (!simulationFixtures.length) {
      fragment.append(createElement("p", "football-empty",
        "Não há jogos restantes disponíveis para simular."));
    }
    simulatorContainer.replaceChildren(fragment);
    clearSimulationButton.disabled = !simulationFixtures.length;
    applyScoreSimulation();
  }

  function applyScoreSimulation() {
    if (!standings.length) return;
    const projected = standings.map(row => ({ ...row }));
    const startingPositions = new Map(standings.map(row => [row.team.id, row.position]));
    const standingsById = new Map(projected.map(row => [row.team.id, row]));
    let simulatedCount = 0;

    simulationFixtures.forEach(fixture => {
      const score = simulationScores.get(fixture.id);
      if (!score || score.home === "" || score.away === "") return;
      const homeGoals = Number(score.home);
      const awayGoals = Number(score.away);
      if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) ||
        homeGoals < 0 || awayGoals < 0 || homeGoals > 99 || awayGoals > 99) return;
      const home = standingsById.get(fixture.teams.home.id);
      const away = standingsById.get(fixture.teams.away.id);
      if (!home || !away) return;

      simulatedCount += 1;
      home.playedGames += 1;
      away.playedGames += 1;
      home.goalsFor += homeGoals;
      home.goalsAgainst += awayGoals;
      away.goalsFor += awayGoals;
      away.goalsAgainst += homeGoals;
      home.goalDifference = home.goalsFor - home.goalsAgainst;
      away.goalDifference = away.goalsFor - away.goalsAgainst;

      if (homeGoals > awayGoals) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (homeGoals < awayGoals) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.draw += 1;
        away.draw += 1;
        home.points += 1;
        away.points += 1;
      }
    });

    projected.sort((left, right) =>
      right.points - left.points ||
      right.won - left.won ||
      right.goalDifference - left.goalDifference ||
      right.goalsFor - left.goalsFor ||
      startingPositions.get(left.team.id) - startingPositions.get(right.team.id));
    projected.forEach((row, index) => {
      row.position = index + 1;
    });
    renderStandings(projected, simulatedCount);
    simulatorStatus.textContent = simulatedCount
      ? simulatedCount + (simulatedCount === 1 ? " jogo simulado." : " jogos simulados.") +
        " A classificação foi recalculada."
      : simulationFixtures.length
        ? "Preencha os gols dos dois times para aplicar cada resultado."
        : "Não há jogos restantes disponíveis para simular.";
    simulatorStatus.classList.remove("is-error");
  }

  function renderFixtures() {
    const upcomingRoundCounts = new Map();
    fixtures.forEach(fixture => {
      if (!isUpcomingFixture(fixture) || !Number.isInteger(fixture.matchday)) return;
      upcomingRoundCounts.set(fixture.matchday,
        (upcomingRoundCounts.get(fixture.matchday) || 0) + 1);
    });
    const currentRoundEntry = Array.from(upcomingRoundCounts.entries()).reduce(
      (largest, entry) => largest === null || entry[1] > largest.count
        ? { matchday: entry[0], count: entry[1] }
        : largest,
      null
    );
    currentRound = currentRoundEntry ? currentRoundEntry.matchday : null;
    roundLabel.textContent = currentRound === null
      ? "Não há mais partidas programadas nesta temporada."
      : String(currentRound) + (hasDelayedFixtures() ? " + atrasados" : "");
    const visibleFixtures = fixtures.filter(fixture =>
      isUpcomingFixture(fixture) &&
      currentRound !== null &&
      Number.isInteger(fixture.matchday) &&
      fixture.matchday <= currentRound &&
      isImportantFixture(fixture));

    if (!visibleFixtures.length) {
      const message = currentRound === null
        ? "Não há próximos jogos programados."
        : "Não há jogos desta rodada envolvendo os times em destaque.";
      fixturesContainer.replaceChildren(createElement("p", "football-empty", message));
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleFixtures.forEach(fixture => {
      const card = createElement("article", "football-fixture");
      const kickoff = createElement("p", "football-fixture-time", formatDate(fixture.date));
      const importance = getFixtureImportance(fixture);
      const importanceLabels = [];
      if (importance.title) importanceLabels.push("Briga pelo título");
      if (importance.relegation) importanceLabels.push("Luta contra o rebaixamento");
      card.append(createElement("p", "football-fixture-importance", importanceLabels.join(" · ")));
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

  function getFixtureImportance(fixture) {
    const homePosition = standingsByTeamId.get(fixture.teams.home.id);
    const awayPosition = standingsByTeamId.get(fixture.teams.away.id);
    return {
      title: /palmeiras|flamengo/i.test(fixture.teams.home.name) ||
        /palmeiras|flamengo/i.test(fixture.teams.away.name),
      relegation: homePosition >= botafogoPosition ||
        awayPosition >= botafogoPosition
    };
  }

  function isImportantFixture(fixture) {
    const importance = getFixtureImportance(fixture);
    return importance.title || importance.relegation;
  }

  function isUpcomingFixture(fixture) {
    return ["SCHEDULED", "TIMED"].includes(fixture.status.short) &&
      Number.isFinite(fixture.timestamp) && fixture.timestamp >= Math.floor(Date.now() / 1000);
  }

  function hasDelayedFixtures() {
    return currentRound !== null && fixtures.some(fixture =>
      isUpcomingFixture(fixture) && Number.isInteger(fixture.matchday) &&
      fixture.matchday < currentRound);
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
      return;
    }

    const fragment = document.createDocumentFragment();
    followedTeams.forEach((teamName, teamId) => fragment.append(renderFavoriteCard(teamId, teamName)));
    favoritesContainer.replaceChildren(fragment);
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

    previous.append(createElement("p", "football-previous-meta",
      "A fonte gratuita informa o placar, mas não fornece estatísticas detalhadas da partida."));
    panel.replaceChildren(previous);
    panel.hidden = false;
  }

  async function loadPreviousMatch(team, button, panel) {
    button.disabled = true;
    button.textContent = "Carregando partida…";
    panel.replaceChildren();
    panel.hidden = true;
    try {
      const previousMatch = fixtures
        .filter(fixture => fixture.status.short === "FINISHED" &&
          fixture.timestamp < Math.floor(Date.now() / 1000) &&
          (fixture.teams.home.id === team.id || fixture.teams.away.id === team.id))
        .sort((left, right) => right.timestamp - left.timestamp)[0];
      renderPreviousMatch(previousMatch || null, panel);
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

  async function loadLeagueData() {
    if (loadingLeagueData) return;
    loadingLeagueData = true;
    try {
      const results = await Promise.allSettled([
        fetchFootball("teams"),
        fetchFootball("fixtures"),
        fetchFootball("standings")
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
        simulatorContainer.replaceChildren();
        simulatorStatus.textContent = "Não foi possível carregar os jogos para simular: " +
          results[1].reason.message;
        simulatorStatus.classList.add("is-error");
        clearSimulationButton.disabled = true;
        setStatus("Os times foram carregados, mas não foi possível buscar os próximos jogos: " +
          results[1].reason.message, true);
        return;
      }

      if (!Array.isArray(results[1].value.fixtures)) {
        simulatorContainer.replaceChildren();
        simulatorStatus.textContent = "O serviço retornou uma lista de jogos inválida.";
        simulatorStatus.classList.add("is-error");
        clearSimulationButton.disabled = true;
        setStatus("O serviço retornou uma lista de jogos inválida.", true);
        return;
      }
      if (results[2].status === "rejected") {
        fixtures = [];
        renderFixtures();
        standingsStatus.textContent = "Não foi possível carregar a classificação: " +
          results[2].reason.message;
        standingsStatus.classList.add("is-error");
        simulatorStatus.textContent = "A classificação é necessária para calcular a simulação.";
        simulatorStatus.classList.add("is-error");
        setStatus("Os times foram carregados, mas não foi possível consultar a classificação para destacar os jogos importantes: " +
          results[2].reason.message, true);
        return;
      }
      if (!Array.isArray(results[2].value.standings) ||
        results[2].value.standings.some(row =>
          !row || !Number.isInteger(row.position) || !row.team ||
          !Number.isInteger(row.team.id) || typeof row.team.name !== "string" ||
          !Number.isInteger(row.playedGames) || !Number.isInteger(row.won) ||
          !Number.isInteger(row.draw) || !Number.isInteger(row.lost) ||
          !Number.isInteger(row.points) || !Number.isInteger(row.goalsFor) ||
          !Number.isInteger(row.goalsAgainst) || !Number.isInteger(row.goalDifference))) {
        standingsStatus.textContent = "O serviço retornou uma classificação inválida.";
        standingsStatus.classList.add("is-error");
        simulatorStatus.textContent = "A classificação retornada é inválida para calcular a simulação.";
        simulatorStatus.classList.add("is-error");
        setStatus("O serviço retornou uma classificação inválida.", true);
        return;
      }
      standings = results[2].value.standings;
      standingsUpdatedAt = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date());
      renderStandings(standings, 0);
      fixtures = results[1].value.fixtures;
      standingsByTeamId.clear();
      standings.forEach(row => standingsByTeamId.set(row.team.id, row.position));
      renderSimulator(fixtures);
      const botafogo = results[2].value.standings.find(row =>
        /botafogo/i.test(row.team.name));
      if (!botafogo) {
        standingsStatus.textContent = "Não foi possível localizar o Botafogo na classificação.";
        standingsStatus.classList.add("is-error");
        setStatus("Não foi possível localizar o Botafogo na classificação para definir o início da zona de destaque.", true);
        return;
      }
      botafogoPosition = botafogo.position;
      renderFixtures();
      const importantCount = fixtures.filter(fixture =>
        isUpcomingFixture(fixture) &&
        currentRound !== null &&
        Number.isInteger(fixture.matchday) &&
        fixture.matchday <= currentRound &&
        isImportantFixture(fixture)).length;
      setStatus((currentRound === null ? "Nenhuma rodada futura." :
        "Rodada " + currentRound + (hasDelayedFixtures() ? " e jogos atrasados" : "")) +
        ": " + importantCount +
        " jogos do Palmeiras, do Flamengo e do Botafogo para baixo carregados.");
    } finally {
      loadingLeagueData = false;
    }
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
  standingsToggle.addEventListener("click", () => {
    const expanded = standingsToggle.getAttribute("aria-expanded") === "true";
    standingsToggle.setAttribute("aria-expanded", String(!expanded));
    standingsContent.hidden = expanded;
  });
  simulatorContainer.addEventListener("input", event => {
    const input = event.target;
    if (!input || typeof input.matches !== "function" ||
      !input.matches("input[data-fixture-id][data-team-side]")) return;
    const fixtureId = Number(input.dataset.fixtureId);
    const side = input.dataset.teamSide;
    if (!Number.isInteger(fixtureId) || !["home", "away"].includes(side)) return;
    const score = simulationScores.get(fixtureId) || { home: "", away: "" };
    score[side] = input.value;
    simulationScores.set(fixtureId, score);
    applyScoreSimulation();
  });
  clearSimulationButton.addEventListener("click", () => {
    simulationScores.clear();
    renderSimulator(fixtures);
  });
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
  window.setInterval(() => {
    loadLeagueData().catch(error => {
      setStatus("Não foi possível atualizar a rodada: " + error.message, true);
      console.error("Não foi possível atualizar os jogos da Série A:", error);
    });
  }, 15 * 60 * 1000);
})();
