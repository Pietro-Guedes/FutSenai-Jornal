(() => {
  "use strict";

  const config = window.FUTSENAI_SUPABASE;
  const message = document.querySelector("#interaction-message");
  const setupNote = document.querySelector("#interaction-setup-note");
  const pollContent = document.querySelector("#poll-content");
  const awardsContent = document.querySelector("#awards-content");
  const predictionContent = document.querySelector("#prediction-content");
  const voterKey = "jornal-futsenai-voter-id";
  let votingRefreshTimer = null;
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
    const response = await fetch(config.url.replace(/\/$/, "") + "/rest/v1/" + path, {
      ...options,
      headers: { ...headers, ...(options && options.headers) }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Supabase respondeu " + response.status + (detail ? ": " + detail : ""));
    }
    if (response.status === 204) return null;
    return response.json();
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

  function scheduleVotingRefresh(polls, awards) {
    if (votingRefreshTimer !== null) window.clearTimeout(votingRefreshTimer);
    const upcomingDeadlines = [...polls, ...awards]
      .map(item => votingDeadline(item.week_start))
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
    try {
      onSuccess();
    } catch (error) {
      showMessage("Voto registrado no Supabase, mas não foi possível salvar a escolha neste navegador: " + error.message, true);
      return;
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
    const chosen = localStorage.getItem("jornal-futsenai-poll-" + poll.id);
    const isClosed = weekIsOver(poll.week_start);
    renderOptions(container, poll.options, chosen, counts, async option => {
      try {
        await vote("submit_poll_vote", {
          p_poll_id: poll.id,
          p_voter_id: getVoterId(),
          p_option: option
        }, "Voto registrado! Você pode alterá-lo neste navegador.", () => {
          localStorage.setItem("jornal-futsenai-poll-" + poll.id, option);
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
      const chosen = localStorage.getItem("jornal-futsenai-award-" + award.id);
      const isClosed = weekIsOver(award.week_start);
      renderOptions(group, award.nominees, chosen, counts, async nominee => {
        try {
          await vote("submit_award_vote", {
            p_award_id: award.id,
            p_voter_id: getVoterId(),
            p_nominee: nominee
          }, "Voto no prêmio registrado! Você pode alterá-lo neste navegador.", () => {
            localStorage.setItem("jornal-futsenai-award-" + award.id, nominee);
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

  function renderPrediction(match, leaderboard) {
    const fragment = document.createDocumentFragment();
    const game = createElement("div", "rounded-xl bg-red-50 p-3 text-center");
    game.append(createElement("p", "text-[10px] font-black uppercase tracking-wider text-red-700", "Próximo jogo"));
    game.append(createElement("p", "mt-1 font-black text-slate-900", match.home_team + " × " + match.away_team));
    const matchDate = new Date(match.match_date + "T12:00:00");
    game.append(createElement("p", "mt-1 text-xs text-slate-600",
      new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(matchDate)));
    fragment.append(game);

    if (match.home_score !== null && match.away_score !== null) {
      fragment.append(createElement("p", "text-center text-sm font-bold text-slate-700",
        "Placar final: " + match.home_score + " × " + match.away_score));
      fragment.append(createElement("p", "text-center text-xs text-slate-500", "Palpites encerrados. Veja o ranking abaixo."));
    } else if (new Date(match.match_date + "T23:59:59") < new Date()) {
      fragment.append(createElement("p", "text-center text-sm font-bold text-slate-600", "Palpites encerrados para este jogo."));
    } else {
      const form = createElement("form", "space-y-3");
      const nicknameLabel = createElement("label", "block text-xs font-bold text-slate-700", "Seu apelido (aparece no ranking)");
      const nickname = createElement("input", "field w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm");
      nickname.maxLength = 24;
      nickname.required = true;
      nickname.autocomplete = "nickname";
      nickname.value = localStorage.getItem("jornal-futsenai-nickname") || "";
      nicknameLabel.append(nickname);
      form.append(nicknameLabel);

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
          const cleanNickname = nickname.value.trim();
          await vote("submit_prediction", {
            p_match_id: match.id,
            p_voter_id: getVoterId(),
            p_nickname: cleanNickname,
            p_home_score: Number(homeScore.value),
            p_away_score: Number(awayScore.value)
          }, "Palpite registrado! Você pode alterá-lo neste navegador até o jogo.", () => {
            localStorage.setItem("jornal-futsenai-nickname", cleanNickname);
          });
        } catch (error) {
          showMessage("Não foi possível registrar o palpite: " + error.message, true);
        } finally {
          submit.disabled = false;
        }
      });
      fragment.append(form);
    }

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

  async function loadInteractions() {
    const [polls, awards, matches, results] = await Promise.all([
      request("polls?select=id,question,week_start,options&active=eq.true&order=week_start.desc"),
      request("weekly_awards?select=id,title,week_start,nominees&active=eq.true&order=week_start.desc"),
      request("matches?select=id,home_team,away_team,match_date,home_score,away_score&active=eq.true&order=match_date.asc"),
      request("rpc/get_interaction_results", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    ]);
    scheduleVotingRefresh(polls, awards);
    const pollResults = results.polls || [];
    const awardResults = results.awards || [];
    if (polls.length) renderPoll(polls[0], pollResults.find(item => item.id === polls[0].id));
    else setLoading(pollContent, "Nenhuma enquete cadastrada nesta semana.");
    renderAwards(awards, awardResults);
    const nextMatch = matches.find(item => item.home_score === null && item.away_score === null) || matches[0];
    if (nextMatch) renderPrediction(nextMatch, results.leaderboard || []);
    else setLoading(predictionContent, "Nenhum jogo cadastrado. Cadastre o próximo jogo no Supabase.");
  }

  if (requireConfigured()) {
    loadInteractions().catch(error => {
      showMessage("Não foi possível carregar as interações: " + error.message, true);
      setLoading(pollContent, "Falha ao carregar.");
      setLoading(awardsContent, "Falha ao carregar.");
      setLoading(predictionContent, "Falha ao carregar.");
    });
  }
})();
