(() => {
  "use strict";

  const DATA_URL = "https://futsenai-score.vercel.app/data/futsenai.json";
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const status = document.querySelector("#score-promo-status");
  const slideLink = document.querySelector("#score-promo-slide");
  const slideLabel = document.querySelector("#score-promo-label");
  const slideValue = document.querySelector("#score-promo-value");
  const slideDetail = document.querySelector("#score-promo-detail");
  const slideCounter = document.querySelector("#score-promo-counter");
  const scoreUrl = "https://futsenai-score.vercel.app";
  let slides = [];
  let currentSlide = 0;

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

  function renderCurrentSlide() {
    if (!slides.length) return;
    const slide = slides[currentSlide];
    slideLink.href = scoreUrl + slide.path;
    slideLabel.textContent = slide.label;
    slideValue.textContent = slide.value;
    slideValue.classList.toggle("score-promo-value-list", Array.isArray(slide.value));
    if (Array.isArray(slide.value)) {
      slideValue.replaceChildren(...slide.value.map(value => {
        const row = document.createElement("span");
        row.textContent = value;
        return row;
      }));
    }
    slideDetail.textContent = slide.detail;
    slideCounter.textContent = (currentSlide + 1) + " / " + slides.length;
    slideLink.setAttribute("aria-label", "Abrir " + slide.label.toLowerCase() + " no FutSENAI Score em uma nova aba");
  }

  function changeSlide(direction) {
    if (!slides.length) return;
    currentSlide = (currentSlide + direction + slides.length) % slides.length;
    renderCurrentSlide();
  }

  function render(data) {
    const scores = getScores(data.matches, data.goals);
    const summary = summarize(data);
    const recentResults = summary.recentMatches.map(match => {
      const score = scores.get(match.id);
      const teams = match.opponent_type === "second_year" ? "3º A × 2º Ano" : "Vermelho × Branco";
      return formatDate(match.played_on) + " · " + teams + " · " + score.A + " × " + score.B;
    });
    const streak = summary.bestStreak && summary.bestStreak.best > 0
      ? summary.bestStreak.best + (summary.bestStreak.best === 1 ? " vitória" : " vitórias")
      : "Aguardando";

    slides = [
      {
        label: "Últimos resultados",
        value: recentResults.length ? recentResults : "Ainda não há partidas",
        detail: "Placares mais recentes da turma.",
        path: "/#/partidas"
      },
      {
        label: "Artilheiro do momento",
        value: summary.topScorer ? summary.topScorer.player.name : "Ainda sem gols",
        detail: summary.topScorer
          ? summary.topScorer.goals + (summary.topScorer.goals === 1 ? " gol marcado · ranking completo" : " gols marcados · ranking completo")
          : "A artilharia começa com o próximo jogo.",
        path: "/#/estatisticas"
      },
      {
        label: "Maior sequência de vitórias",
        value: streak,
        detail: summary.bestStreak && summary.bestStreak.best > 0
          ? summary.bestStreak.player.name + " · recorde individual"
          : "A próxima vitória abre a sequência.",
        path: "/#/estatisticas"
      },
      {
        label: "Gols registrados",
        value: String(data.goals.length),
        detail: data.matches.length + (data.matches.length === 1 ? " partida registrada" : " partidas registradas"),
        path: "/#/estatisticas"
      }
    ];
    currentSlide %= slides.length;
    renderCurrentSlide();

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
      slides = [{
        label: "Estatísticas do FutSENAI Score",
        value: "Ver no site",
        detail: "Os dados não puderam ser carregados agora.",
        path: "/"
      }];
      currentSlide = 0;
      renderCurrentSlide();
      console.error("Não foi possível atualizar o resumo do FutSENAI Score:", error);
    }
  }

  document.querySelector("#score-promo-prev").addEventListener("click", () => changeSlide(-1));
  document.querySelector("#score-promo-next").addEventListener("click", () => changeSlide(1));
  document.querySelector(".score-promo-carousel").addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") changeSlide(-1);
    if (event.key === "ArrowRight") changeSlide(1);
  });

  loadStats();
  window.setInterval(() => {
    if (document.visibilityState === "visible") loadStats();
  }, REFRESH_INTERVAL_MS);
})();
