(() => {
  "use strict";

  const config = window.FUTSENAI_SUPABASE;
  const message = document.querySelector("#interaction-message");
  const setupNote = document.querySelector("#interaction-setup-note");
  const pollContent = document.querySelector("#poll-content");
  const awardsContent = document.querySelector("#awards-content");
  const predictionContent = document.querySelector("#prediction-content");
  const scoreAdminContent = document.querySelector("#score-admin-content");
  const authForms = document.querySelector("#auth-forms");
  const signinForm = document.querySelector("#signin-form");
  const legacyAuthToggle = document.querySelector("#legacy-auth-toggle");
  const nicknameForm = document.querySelector("#nickname-form");
  const googleSigninButton = document.querySelector("#google-signin-button");
  const signoutButton = document.querySelector("#signout-button");
  const accountStatus = document.querySelector("#account-status");
  const voterKey = "jornal-futsenai-voter-id";
  const sessionKey = "jornal-futsenai-auth-session";
  let votingRefreshTimer = null;
  let session = null;
  let profile = null;
  let isScoreAdmin = false;
  const headers = config && config.url && config.anonKey
    ? { apikey: config.anonKey, Authorization: "Bearer " + config.anonKey }
    : null;

  function showMessage(text, isError) {
    message.textContent = text;
    message.className = "mb-5 rounded-xl border px-4 py-3 text-sm font-medium " +
      (isError ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800");
    message.classList.remove("hidden");
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setLoading(element, text) {
    element.replaceChildren(createElement("p", "text-sm text-slate-500", text));
  }

  function requireConfigured() {
    if (headers) return true;
    setupNote.classList.remove("hidden");
    setLoading(pollContent, "Configure o Supabase para carregar a enquete.");
    setLoading(awardsContent, "Configure o Supabase para carregar os prêmios.");
    setLoading(predictionContent, "Configure o Supabase para carregar os jogos.");
    return false;
  }

  async function request(path, options) {
    const send = () => fetch(config.url.replace(/\/$/, "") + "/rest/v1/" + path, {
      ...options,
      headers: {
        ...headers,
        Authorization: "Bearer " + (session ? session.access_token : config.anonKey),
        ...(options && options.headers)
      }
    });
    let response = await send();
    if (response.status === 401 && session && await refreshSession()) response = await send();
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Supabase respondeu " + response.status + (detail ? ": " + detail : ""));
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function authRequest(path, body, accessToken) {
    const response = await fetch(config.url.replace(/\/$/, "") + "/auth/v1/" + path, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: "Bearer " + accessToken } : {})
      },
      body: JSON.stringify(body || {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.msg || result.message || result.error_description || result.error || "Resposta HTTP " + response.status);
    }
    return result;
  }

  async function completeAuthRedirect() {
    if (!window.location.hash) return false;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const authType = params.get("type");
    if (!accessToken || !refreshToken || (authType && authType !== "signup" && authType !== "bearer")) return false;

    const response = await fetch(config.url.replace(/\/$/, "") + "/auth/v1/user", {
      headers: { apikey: config.anonKey, Authorization: "Bearer " + accessToken }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Não foi possível concluir a autenticação: " + detail);
    }
    const user = await response.json();
    const expiresIn = Number(params.get("expires_in")) || 3600;
    saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: params.get("token_type") || "bearer",
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      user
    });
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    await setAccount(session);
    showMessage(profile
      ? (authType === "signup"
        ? "E-mail confirmado. Sua conta está conectada; já pode enviar palpites."
        : "Login com Google efetuado. Seus palpites e pontos estão ligados a esta conta.")
      : "Login com Google efetuado. Escolha um apelido público para concluir a configuração da conta.", false);
    return true;
  }

  function signInWithGoogle() {
    if (!config || !config.url || !config.anonKey) {
      showMessage("O Supabase não está configurado.", true);
      return;
    }
    const authorizeUrl = new URL(config.url.replace(/\/$/, "") + "/auth/v1/authorize");
    authorizeUrl.searchParams.set("provider", "google");
    authorizeUrl.searchParams.set("redirect_to", window.location.origin + window.location.pathname + window.location.search);
    window.location.assign(authorizeUrl.href);
  }

  function saveSession(nextSession) {
    session = nextSession;
    if (session && session.expires_in && !session.expires_at) {
      session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
    }
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  }

  window.addEventListener("futsenai-auth-session-updated", event => {
    if (event.detail && typeof event.detail.access_token === "string") {
      saveSession(event.detail);
    }
  });

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

  async function restoreSession() {
    if (await completeAuthRedirect()) return;
    const saved = localStorage.getItem(sessionKey);
    if (!saved) return;
    try {
      session = JSON.parse(saved);
      if (!session || typeof session.access_token !== "string") {
        saveSession(null);
        return;
      }
      if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
        await refreshSession();
      }
    } catch (error) {
      saveSession(null);
      showMessage("Sua sessão expirou. Entre novamente para fazer palpites.", true);
    }
  }

  async function setAccount(sessionData) {
    saveSession(sessionData);
    profile = null;
    isScoreAdmin = false;
    if (session) {
      const profiles = await request("profiles?select=nickname&user_id=eq." + encodeURIComponent(session.user.id));
      profile = profiles[0] || null;
      if (profile) {
        isScoreAdmin = await request("rpc/is_score_admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
      }
    }
    updateAccountUI();
    window.dispatchEvent(new CustomEvent("futsenai-auth-state-changed", { detail: session }));
  }

  function updateAccountUI() {
    const signedIn = Boolean(session && profile);
    const needsNickname = Boolean(session && !profile);
    authForms.classList.toggle("hidden", signedIn || needsNickname);
    nicknameForm.classList.toggle("hidden", !needsNickname);
    signoutButton.classList.toggle("hidden", !session);
    accountStatus.classList.toggle("hidden", !signedIn);
    accountStatus.textContent = signedIn ? "Conectado como " + profile.nickname : "";
    document.querySelector("#account-heading").textContent = signedIn
      ? "Palpites salvos na sua conta"
      : needsNickname
        ? "Defina seu apelido público"
        : "Entre para salvar seus palpites e pontos";
  }

  function getVoterId() {
    let voterId = localStorage.getItem(voterKey);
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem(voterKey, voterId);
    }
    return voterId;
  }

  function votingDeadline(value) {
    const friday = new Date(value + "T00:00:00Z");
    friday.setUTCDate(friday.getUTCDate() + 4);
    return new Date(friday.toISOString().slice(0, 10) + "T15:30:00-03:00").getTime();
  }

  function weekIsOver(value) {
    return Date.now() >= votingDeadline(value);
  }

  function predictionDeadline(value) {
    return new Date(value + "T11:00:00-03:00").getTime();
  }

  function scheduleVotingRefresh(polls, awards, matches) {
    if (votingRefreshTimer !== null) window.clearTimeout(votingRefreshTimer);
    const upcomingDeadlines = [...polls, ...awards]
      .map(item => votingDeadline(item.week_start))
      .concat(matches
        .filter(match => match.home_score === null && match.away_score === null)
        .map(match => predictionDeadline(match.match_date)))
      .filter(deadline => deadline > Date.now());
    votingRefreshTimer = null;
    if (!upcomingDeadlines.length) return;

    const delay = Math.min(...upcomingDeadlines) - Date.now();
    votingRefreshTimer = window.setTimeout(() => {
      votingRefreshTimer = null;
      loadInteractions().catch(error => {
        showMessage("Não foi possível atualizar o encerramento das votações: " + error.message, true);
      });
    }, delay);
  }

  function renderOptions(container, options, selected, counts, onChoose, isClosed) {
    const maxVotes = Math.max(0, ...options.map(option => Number(counts[option]) || 0));
    const total = options.reduce((sum, option) => sum + (Number(counts[option]) || 0), 0);
    options.forEach(option => {
      const votes = Number(counts[option]) || 0;
      const percentage = total ? Math.round(votes / total * 100) : 0;
      const button = createElement("button", "interaction-option");
      button.type = "button";
      button.setAttribute("aria-pressed", String(selected === option));
      button.disabled = isClosed;
      if (!isClosed) button.addEventListener("click", () => onChoose(option));
      if (selected === option) button.classList.add("is-selected");
      else if (maxVotes > 0 && votes === maxVotes) button.classList.add("is-leading");
      button.append(createElement("span", "interaction-option-indicator", selected === option ? "✓" : ""));
      button.append(createElement("span", "interaction-option-label", option));
      if (selected !== null || total > 0) {
        button.append(createElement("span", "interaction-option-stats", votes + " · " + percentage + "%"));
      }
      container.append(button);
    });
  }

  async function vote(endpoint, body, successText, onSuccess) {
    await request("rpc/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (onSuccess) {
      try {
        onSuccess();
      } catch (error) {
        showMessage("Voto registrado no Supabase, mas não foi possível salvar a escolha neste navegador: " + error.message, true);
        return;
      }
    }
    showMessage(successText, false);
    try {
      await loadInteractions();
    } catch (error) {
      showMessage("Voto registrado, mas não foi possível atualizar os resultados: " + error.message, true);
    }
  }

  function renderPoll(poll, result) {
    const container = createElement("div", "space-y-3");
    container.append(createElement("p", "font-bold leading-6 text-slate-800", poll.question));
    const counts = result && result.counts ? result.counts : {};
    const voteKey = "jornal-futsenai-poll-" + poll.id;
    const hasVotes = Object.values(counts).some(total => Number(total) > 0);
    let chosen = hasVotes ? localStorage.getItem(voteKey) : null;
    if (!hasVotes) {
      try {
        localStorage.removeItem(voteKey);
      } catch (error) {
        showMessage("Os votos foram zerados, mas não foi possível limpar a escolha salva neste navegador: " + error.message, true);
      }
    }
    const isClosed = weekIsOver(poll.week_start);
    renderOptions(container, poll.options, chosen, counts, async option => {
      try {
        await vote("submit_poll_vote", {
          p_poll_id: poll.id,
          p_voter_id: getVoterId(),
          p_option: option
        }, "Voto registrado! Você pode alterá-lo neste navegador.", () => {
          localStorage.setItem(voteKey, option);
        });
      } catch (error) {
        showMessage("Não foi possível registrar o voto: " + error.message, true);
      }
    }, isClosed);
    container.append(createElement("p", "text-xs text-slate-500",
      isClosed ? "Enquete encerrada; confira o resultado final." :
        chosen ? "Seu voto está registrado; os resultados são compartilhados." : "Escolha uma opção para ver o resultado."));
    pollContent.replaceChildren(container);
  }

  function renderAwards(awards, results) {
    if (!awards.length) {
      setLoading(awardsContent, "Nenhum prêmio cadastrado nesta semana.");
      return;
    }
    const fragment = document.createDocumentFragment();
    awards.forEach(award => {
      const group = createElement("div", "border-t border-red-50 pt-4 first:border-0 first:pt-0");
      group.append(createElement("h4", "mb-3 font-extrabold text-slate-800", award.title));
      const stats = results.find(item => item.id === award.id);
      const counts = stats && stats.counts ? stats.counts : {};
      const voteKey = "jornal-futsenai-award-" + award.id;
      const hasVotes = Object.values(counts).some(total => Number(total) > 0);
      const chosen = hasVotes ? localStorage.getItem(voteKey) : null;
      if (!hasVotes) {
        try {
          localStorage.removeItem(voteKey);
        } catch (error) {
          showMessage("Os votos foram zerados, mas não foi possível limpar a escolha salva neste navegador: " + error.message, true);
        }
      }
      const isClosed = weekIsOver(award.week_start);
      renderOptions(group, award.nominees, chosen, counts, async nominee => {
        try {
          await vote("submit_award_vote", {
            p_award_id: award.id,
            p_voter_id: getVoterId(),
            p_nominee: nominee
          }, "Voto no prêmio registrado! Você pode alterá-lo neste navegador.", () => {
            localStorage.setItem(voteKey, nominee);
          });
        } catch (error) {
          showMessage("Não foi possível registrar o voto: " + error.message, true);
        }
      }, isClosed);
      const votes = award.nominees.map(nominee => [nominee, Number(counts[nominee]) || 0]);
      const highest = Math.max(0, ...votes.map(item => item[1]));
      const leaders = votes.filter(item => item[1] === highest && highest > 0).map(item => item[0]);
      const status = highest
        ? (weekIsOver(award.week_start) ? "Vencedor: " : "Liderando: ") + leaders.join(" e ") + " (" + highest + (highest === 1 ? " voto)" : " votos)")
        : "Ainda sem votos.";
      group.append(createElement("p", "mt-2 text-xs font-bold text-red-700", status));
      fragment.append(group);
    });
    awardsContent.replaceChildren(fragment);
  }

  function renderPrediction(match, leaderboard, myPrediction, matches) {
    const fragment = document.createDocumentFragment();
    const game = createElement("div", "rounded-xl bg-red-50 p-3 text-center");
    game.append(createElement("p", "text-[10px] font-black uppercase tracking-wider text-red-700", "Próximo jogo"));
    game.append(createElement("p", "mt-1 font-black text-slate-900", match.home_team + " × " + match.away_team));
    const matchDate = new Date(match.match_date + "T12:00:00");
    game.append(createElement("p", "mt-1 text-xs text-slate-600",
      new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(matchDate)));
    game.append(createElement("p", "mt-1 text-xs font-semibold text-red-700",
      "Palpites até as 11h (horário de Brasília), no dia do jogo."));
    fragment.append(game);

    if (match.home_score !== null && match.away_score !== null) {
      fragment.append(createElement("p", "text-center text-sm font-bold text-slate-700",
        "Placar final: " + match.home_score + " × " + match.away_score));
      fragment.append(createElement("p", "text-center text-xs text-slate-500", "Palpites encerrados. Veja o ranking abaixo."));
    } else if (Date.now() >= predictionDeadline(match.match_date)) {
      fragment.append(createElement("p", "text-center text-sm font-bold text-slate-600", "Palpites encerrados para este jogo."));
    } else if (!session || !profile) {
      fragment.append(createElement("p", "text-center text-sm leading-6 text-slate-600",
        "Entre ou crie uma conta abaixo para enviar um palpite e somar pontos na liga."));
    } else {
      const form = createElement("form", "space-y-3");
      const scores = createElement("div", "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2");
      const homeLabel = createElement("label", "block min-w-0 text-center text-xs font-bold text-slate-600", match.home_team);
      const awayLabel = createElement("label", "block min-w-0 text-center text-xs font-bold text-slate-600", match.away_team);
      const homeScore = createElement("input", "interaction-score-field field mt-1 w-full rounded-lg border border-slate-200 px-2 py-2.5 text-center text-lg font-black");
      const awayScore = createElement("input", "interaction-score-field field mt-1 w-full rounded-lg border border-slate-200 px-2 py-2.5 text-center text-lg font-black");
      [homeScore, awayScore].forEach((input, index) => {
        input.type = "number";
        input.min = "0";
        input.max = "99";
        input.required = true;
        input.setAttribute("aria-label", "Gols previstos para " + (index === 0 ? match.home_team : match.away_team));
      });
      if (myPrediction) {
        homeScore.value = myPrediction.home_score;
        awayScore.value = myPrediction.away_score;
      }
      homeLabel.append(homeScore);
      awayLabel.append(awayScore);
      scores.append(homeLabel, createElement("span", "mb-3 font-black text-slate-400", "×"), awayLabel);
      form.append(scores);

      const submit = createElement("button", "w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-red-700", "Enviar palpite");
      submit.type = "submit";
      form.append(submit);
      form.addEventListener("submit", async event => {
        event.preventDefault();
        submit.disabled = true;
        try {
          await vote("submit_prediction", {
            p_match_id: match.id,
            p_home_score: Number(homeScore.value),
            p_away_score: Number(awayScore.value)
            }, "Palpite registrado na sua conta! Você pode alterá-lo até as 11h do dia do jogo.");
        } catch (error) {
          showMessage("Não foi possível registrar o palpite: " + error.message, true);
        } finally {
          submit.disabled = false;
        }
      });
      fragment.append(form);
    }

    renderScoreAdmin(match, matches);
    fragment.append(createElement("h4", "border-t border-red-50 pt-3 font-extrabold text-slate-800", "Ranking dos palpites"));
    if (!leaderboard.length) {
      fragment.append(createElement("p", "text-xs text-slate-500", "O ranking aparece depois que o primeiro jogo tiver placar final."));
    } else {
      const list = createElement("ol", "space-y-2");
      leaderboard.slice(0, 5).forEach((entry, index) => {
        list.append(createElement("li", "flex justify-between gap-2 text-xs text-slate-700",
          (index + 1) + ". " + entry.nickname + " — " + entry.points + (entry.points === 1 ? " ponto" : " pontos")));
      });
      fragment.append(list);
    }
    predictionContent.replaceChildren(fragment);
  }

  function renderScoreAdmin(match, matches) {
    if (!isScoreAdmin) {
      scoreAdminContent.classList.add("hidden");
      scoreAdminContent.replaceChildren();
      return;
    }
    scoreAdminContent.classList.remove("hidden");
    const form = createElement("form", "space-y-3");
    form.append(createElement("h4", "font-extrabold text-slate-900", "⚙ Registrar placar final"));
    form.append(createElement("p", "text-xs leading-5 text-slate-500", "Área restrita à conta administradora."));

    const matchSelect = createElement("select", "field w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm");
    matchSelect.setAttribute("aria-label", "Jogo para registrar o placar");
    matches.forEach(item => {
      const option = createElement("option", "", item.home_team + " × " + item.away_team + " — " + item.match_date);
      option.value = item.id;
      option.selected = item.id === match.id;
      matchSelect.append(option);
    });
    form.append(matchSelect);

    const scores = createElement("div", "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2");
    const homeLabel = createElement("label", "block min-w-0 text-center text-xs font-bold text-slate-600", match.home_team);
    const awayLabel = createElement("label", "block min-w-0 text-center text-xs font-bold text-slate-600", match.away_team);
    const homeScore = createElement("input", "interaction-score-field field mt-1 w-full rounded-lg border border-slate-200 px-2 py-2.5 text-center text-lg font-black");
    const awayScore = createElement("input", "interaction-score-field field mt-1 w-full rounded-lg border border-slate-200 px-2 py-2.5 text-center text-lg font-black");
    [homeScore, awayScore].forEach((input, index) => {
      input.type = "number";
      input.min = "0";
      input.max = "99";
      input.required = true;
      input.setAttribute("aria-label", "Placar final de " + (index === 0 ? match.home_team : match.away_team));
      input.value = (index === 0 ? match.home_score : match.away_score) ?? "";
    });
    homeLabel.append(homeScore);
    awayLabel.append(awayScore);
    scores.append(homeLabel, createElement("span", "mb-3 font-black text-slate-400", "×"), awayLabel);
    form.append(scores);

    matchSelect.addEventListener("change", () => {
      const selectedMatch = matches.find(item => item.id === matchSelect.value);
      if (!selectedMatch) return;
      homeLabel.firstChild.textContent = selectedMatch.home_team;
      awayLabel.firstChild.textContent = selectedMatch.away_team;
      homeScore.setAttribute("aria-label", "Placar final de " + selectedMatch.home_team);
      awayScore.setAttribute("aria-label", "Placar final de " + selectedMatch.away_team);
      homeScore.value = selectedMatch.home_score ?? "";
      awayScore.value = selectedMatch.away_score ?? "";
    });

    const submit = createElement("button", "w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-slate-700", "Salvar placar final");
    submit.type = "submit";
    form.append(submit);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await request("rpc/set_match_result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_match_id: matchSelect.value,
            p_home_score: Number(homeScore.value),
            p_away_score: Number(awayScore.value)
          })
        });
        showMessage("Placar final salvo. A liga foi atualizada.", false);
        await loadInteractions();
      } catch (error) {
        showMessage("Não foi possível salvar o placar: " + error.message, true);
      } finally {
        submit.disabled = false;
      }
    });
    scoreAdminContent.replaceChildren(form);
  }

  function bindAccountForms() {
    legacyAuthToggle.addEventListener("click", () => {
      const isExpanded = legacyAuthToggle.getAttribute("aria-expanded") === "true";
      legacyAuthToggle.setAttribute("aria-expanded", String(!isExpanded));
      signinForm.classList.toggle("hidden", isExpanded);
      legacyAuthToggle.textContent = isExpanded
        ? "Já tem conta antiga? Entrar com e-mail"
        : "Ocultar acesso com e-mail";
    });

    googleSigninButton.addEventListener("click", signInWithGoogle);

    nicknameForm.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = nicknameForm.querySelector('button[type="submit"]');
      const nickname = String(new FormData(nicknameForm).get("nickname")).trim();
      submit.disabled = true;
      try {
        await request("rpc/set_my_nickname", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_nickname: nickname })
        });
        await setAccount(session);
        nicknameForm.reset();
        showMessage("Apelido salvo. Sua conta está pronta para enviar palpites.", false);
        await loadInteractions();
      } catch (error) {
        showMessage("Não foi possível salvar o apelido: " + error.message, true);
      } finally {
        submit.disabled = false;
      }
    });

    signinForm.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = signinForm.querySelector('button[type="submit"]');
      const data = new FormData(signinForm);
      submit.disabled = true;
      try {
        const result = await authRequest("token?grant_type=password", {
          email: String(data.get("email")).trim(),
          password: String(data.get("password"))
        });
        await setAccount(result);
        signinForm.reset();
        showMessage("Login efetuado. Seus palpites e pontos estão ligados a esta conta.", false);
        await loadInteractions();
      } catch (error) {
        saveSession(null);
        profile = null;
        isScoreAdmin = false;
        updateAccountUI();
        showMessage("Não foi possível entrar: " + error.message, true);
      } finally {
        submit.disabled = false;
      }
    });

    signoutButton.addEventListener("click", async () => {
      try {
        if (session) await authRequest("logout", {}, session.access_token);
      } catch (error) {
        showMessage("Não foi possível encerrar a sessão no Supabase: " + error.message, true);
        return;
      }
      saveSession(null);
      profile = null;
      isScoreAdmin = false;
      updateAccountUI();
      window.dispatchEvent(new CustomEvent("futsenai-auth-state-changed", { detail: null }));
      showMessage("Você saiu da conta. A enquete e os prêmios continuam disponíveis sem login.", false);
      await loadInteractions();
    });
  }

  async function loadInteractions() {
    const [polls, awards, matches, results] = await Promise.all([
      request("polls?select=id,question,week_start,options,created_at&active=eq.true&order=week_start.desc,created_at.desc,id.desc"),
      request("weekly_awards?select=id,title,week_start,nominees&active=eq.true&order=week_start.desc"),
      request("matches?select=id,home_team,away_team,match_date,home_score,away_score&active=eq.true&order=match_date.asc"),
      request("rpc/get_interaction_results", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    ]);
    scheduleVotingRefresh(polls, awards, matches);
    const pollResults = results.polls || [];
    const awardResults = results.awards || [];
    if (polls.length) renderPoll(polls[0], pollResults.find(item => item.id === polls[0].id));
    else setLoading(pollContent, "Nenhuma enquete cadastrada nesta semana.");
    renderAwards(awards, awardResults);
    const nextMatch = matches.find(item => item.home_score === null && item.away_score === null) || matches[0];
    if (session && profile) {
      isScoreAdmin = await request("rpc/is_score_admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
    } else {
      isScoreAdmin = false;
    }
    if (nextMatch) {
      const ownPredictions = session
        ? await request("predictions?select=home_score,away_score&match_id=eq." + encodeURIComponent(nextMatch.id) +
          "&account_id=eq." + encodeURIComponent(session.user.id))
        : [];
      renderPrediction(nextMatch, results.leaderboard || [], ownPredictions[0] || null, matches);
    }
    else setLoading(predictionContent, "Nenhum jogo cadastrado. Cadastre o próximo jogo no Supabase.");
  }

  bindAccountForms();
  updateAccountUI();
  if (requireConfigured()) {
    restoreSession().then(async () => {
      if (session) {
        try {
          await setAccount(session);
        } catch (error) {
          saveSession(null);
          profile = null;
          isScoreAdmin = false;
          updateAccountUI();
          showMessage("Não foi possível recuperar sua conta: " + error.message, true);
        }
      }
      await loadInteractions();
    }).catch(error => {
      showMessage("Não foi possível carregar as interações: " + error.message, true);
      setLoading(pollContent, "Falha ao carregar.");
      setLoading(awardsContent, "Falha ao carregar.");
      setLoading(predictionContent, "Falha ao carregar.");
    });
  }
})();
