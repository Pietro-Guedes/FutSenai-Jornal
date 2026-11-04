(() => {
  "use strict";

  const DATA_URL = "https://futsenai-score.vercel.app/data/futsenai.json";
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const resultsContainer = document.querySelector("#score-promo-results");
  const status = document.querySelector("#score-promo-status");
  const scorerName = document.querySelector("#score-promo-scorer");
  const scorerGoals = document.querySelector("#score-promo-scorer-goals");
  const streakCount = document.querySelector("#score-promo-streak");
  const streakPlayer = document.querySelector("#score-promo-streak-player");

  function validateData(data) {
    return data && Array.isArray(data.players) && Array.isArray(data.matches) &&
      Array.isArray(data.match_players) && Array.isArray(data.goals) &&
      data.players.every(player => Number.isInteger(player.id) && typeof player.name === "string") &&
      data.matches.every(match =>
        Number.isInteger(match.id) && /^\d{4}-\d{2}-\d{2}$/.test(match.played_on) &&
        (match.opponent_type === "classmates" || match.opponent_type === "second_year")) &&
      data.match_players.every(participant =>
        Number.isInteger(participant.match_id) && Number.isInteger(participant.player_id) &&
        (participant.team_side === "A" || participant.team_side === "B")) &&
      data.goals.every(goal =>
        Number.isInteger(goal.match_id) && (goal.team_side === "A" || goal.team_side === "B"));
  }

  function getScores(matches, goals) {
    const scores = new Map(matches.map(match => [match.id, { A: 0, B: 0 }]));
    goals.forEach(goal => {
      const score = scores.get(goal.match_id);
      if (score) score[goal.team_side]++;
    });
    return scores;
  }

  function summarize(data) {
    const scores = getScores(data.matches, data.goals);
    const playersById = new Map(data.players.map(player => [player.id, player]));
    const matchesById = new Map(data.matches.map(match => [match.id, match]));
    const recentMatches = data.matches.slice()
      .sort((left, right) => right.played_on.localeCompare(left.played_on) || right.id - left.id)
      .slice(0, 3);
    const scorerTotals = new Map();

    data.goals.forEach(goal => {
      if (goal.goal_type !== "normal" || !playersById.has(goal.player_id)) return;
      scorerTotals.set(goal.player_id, (scorerTotals.get(goal.player_id) || 0) + 1);
    });

    const topScorer = [...scorerTotals]
      .map(([playerId, goals]) => ({ player: playersById.get(playerId), goals }))
      .sort((left, right) =>
        right.goals - left.goals || left.player.name.localeCompare(right.player.name, "pt-BR"))[0];

    const streaks = data.players.map(player => {
      let current = 0;
      let best = 0;
      const appearances = data.match_players
        .filter(participant => participant.player_id === player.id)
        .map(participant => ({
          participant,
          match: matchesById.get(participant.match_id)
        }))
        .filter(appearance => appearance.match)
        .sort((left, right) =>
          left.match.played_on.localeCompare(right.match.played_on) || left.match.id - right.match.id);

      appearances.forEach(({ participant, match }) => {
        const score = scores.get(match.id);
        const won = participant.team_side === "A" ? score.A > score.B : score.B > score.A;
        current = won ? current + 1 : 0;
        best = Math.max(best, current);
      });

      return { player, best };
    }).sort((left, right) =>
      right.best - left.best || left.player.name.localeCompare(right.player.name, "pt-BR"));

    return { recentMatches, topScorer, bestStreak: streaks[0] };
  }

  function formatDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
      .format(new Date(year, month - 1, day));
  }

  function renderResults(matches, scores) {
    resultsContainer.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "score-promo-placeholder";
      empty.textContent = "Ainda não há partidas registradas.";
      resultsContainer.append(empty);
      return;
    }

    matches.forEach(match => {
      const row = document.createElement("div");
      const teams = document.createElement("span");
      const score = document.createElement("span");
      const date = document.createElement("span");
      const matchScore = scores.get(match.id);

      row.className = "score-promo-match";
      teams.className = "score-promo-match-teams";
      teams.textContent = match.opponent_type === "second_year" ? "3º A × 2º Ano" : "Time Vermelho × Time Branco";
      score.className = "score-promo-match-score";
      score.textContent = matchScore.A + " × " + matchScore.B;
      row.append(teams, score);

      date.className = "score-promo-match-date";
      date.textContent = formatDate(match.played_on);
      resultsContainer.append(row, date);
    });
  }

  function render(data) {
    const scores = getScores(data.matches, data.goals);
    const summary = summarize(data);
    renderResults(summary.recentMatches, scores);

    if (summary.topScorer) {
      scorerName.textContent = summary.topScorer.player.name;
      scorerGoals.textContent = summary.topScorer.goals +
        (summary.topScorer.goals === 1 ? " gol marcado" : " gols marcados");
    } else {
      scorerName.textContent = "Ainda sem gols";
      scorerGoals.textContent = "A artilharia começa com o próximo jogo.";
    }

    if (summary.bestStreak && summary.bestStreak.best > 0) {
      streakCount.textContent = summary.bestStreak.best +
        (summary.bestStreak.best === 1 ? " vitória" : " vitórias");
      streakPlayer.textContent = summary.bestStreak.player.name + " · recorde individual";
    } else {
      streakCount.textContent = "Aguardando";
      streakPlayer.textContent = "A próxima vitória abre a sequência.";
    }

    status.textContent = "Estatísticas atualizadas";
  }

  async function loadStats() {
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("O FutSENAI Score respondeu com erro " + response.status + ".");
      const data = await response.json();
      if (!validateData(data)) throw new Error("Os dados públicos do FutSENAI Score estão em formato inesperado.");
      render(data);
    } catch (error) {
      status.textContent = "Não foi possível carregar as estatísticas agora.";
      resultsContainer.replaceChildren();
      const unavailable = document.createElement("p");
      unavailable.className = "score-promo-placeholder";
      unavailable.textContent = "Abra o FutSENAI Score para ver os resultados e estatísticas atualizados.";
      resultsContainer.append(unavailable);
      scorerName.textContent = "Ver no site";
      scorerGoals.textContent = "";
      streakCount.textContent = "Ver no site";
      streakPlayer.textContent = "";
      console.error("Não foi possível atualizar o resumo do FutSENAI Score:", error);
    }
  }

  loadStats();
  window.setInterval(() => {
    if (document.visibilityState === "visible") loadStats();
  }, REFRESH_INTERVAL_MS);
})();
