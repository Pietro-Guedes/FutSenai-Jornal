"use strict";

const API_BASE_URL = "https://v3.football.api-sports.io";
const BRAZIL_SERIE_A_LEAGUE_ID = 71;
const REQUEST_TIMEOUT_MS = 10000;

function sendJson(res, status, body, cacheSeconds) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheSeconds
    ? "public, s-maxage=" + cacheSeconds + ", stale-while-revalidate=" + cacheSeconds
    : "no-store");
  res.status(status).json(body);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mapTeam(value) {
  if (!isObject(value) || !Number.isInteger(value.id) || typeof value.name !== "string") {
    throw new Error("A API de futebol retornou dados inválidos de time.");
  }
  return {
    id: value.id,
    name: value.name,
    logo: typeof value.logo === "string" ? value.logo : ""
  };
}

function mapFixture(value) {
  if (!isObject(value) || !isObject(value.fixture) ||
    !Number.isInteger(value.fixture.id) || typeof value.fixture.date !== "string" ||
    !isObject(value.fixture.status) || !isObject(value.teams) ||
    !isObject(value.teams.home) || !isObject(value.teams.away) ||
    !isObject(value.goals)) {
    throw new Error("A API de futebol retornou dados inválidos de partida.");
  }
  return {
    id: value.fixture.id,
    date: value.fixture.date,
    timestamp: Number.isFinite(value.fixture.timestamp) ? value.fixture.timestamp : null,
    status: {
      short: typeof value.fixture.status.short === "string" ? value.fixture.status.short : "",
      long: typeof value.fixture.status.long === "string" ? value.fixture.status.long : ""
    },
    round: isObject(value.league) && typeof value.league.round === "string" ? value.league.round : "",
    teams: {
      home: mapTeam(value.teams.home),
      away: mapTeam(value.teams.away)
    },
    goals: {
      home: Number.isInteger(value.goals.home) ? value.goals.home : null,
      away: Number.isInteger(value.goals.away) ? value.goals.away : null
    }
  };
}

async function requestProvider(path, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      headers: { "x-apisports-key": apiKey },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error("A API-Football respondeu com erro HTTP " + response.status + ".");
  }
  const payload = await response.json();
  if (!isObject(payload) || !Array.isArray(payload.response)) {
    throw new Error("A API-Football retornou uma resposta fora do formato esperado.");
  }
  if ((isObject(payload.errors) && Object.keys(payload.errors).length > 0) ||
    (Array.isArray(payload.errors) && payload.errors.length > 0)) {
    console.error("API-Football provider errors:", JSON.stringify(payload.errors));
    throw new Error("A API-Football informou um erro na consulta. Verifique a chave e os limites da conta.");
  }
  return payload.response;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Método não permitido." });
    return;
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    sendJson(res, 503, { error: "A chave da API-Football ainda não foi configurada na Vercel." });
    return;
  }

  const type = typeof req.query.type === "string" ? req.query.type : "";
  const season = Number(req.query.season);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(season) || season < currentYear - 1 || season > currentYear + 1) {
    sendJson(res, 400, { error: "A temporada informada é inválida." });
    return;
  }

  let path;
  let cacheSeconds;
  let resultType;
  if (type === "teams") {
    path = "/teams?league=" + BRAZIL_SERIE_A_LEAGUE_ID + "&season=" + season;
    cacheSeconds = 86400;
    resultType = "teams";
  } else if (type === "fixtures") {
    path = "/fixtures?league=" + BRAZIL_SERIE_A_LEAGUE_ID + "&season=" + season + "&next=20";
    cacheSeconds = 900;
    resultType = "fixtures";
  } else if (type === "last") {
    const teamId = Number(req.query.team);
    if (!Number.isInteger(teamId) || teamId < 1 || teamId > 1000000) {
      sendJson(res, 400, { error: "O time informado é inválido." });
      return;
    }
    path = "/fixtures?league=" + BRAZIL_SERIE_A_LEAGUE_ID + "&season=" + season +
      "&team=" + teamId + "&last=1";
    cacheSeconds = 900;
    resultType = "fixtures";
  } else if (type === "statistics") {
    const fixtureId = Number(req.query.fixture);
    if (!Number.isInteger(fixtureId) || fixtureId < 1 || fixtureId > 1000000000) {
      sendJson(res, 400, { error: "A partida informada é inválida." });
      return;
    }
    path = "/fixtures/statistics?fixture=" + fixtureId;
    cacheSeconds = 3600;
    resultType = "statistics";
  } else {
    sendJson(res, 400, { error: "Tipo de consulta de futebol desconhecido." });
    return;
  }

  try {
    const response = await requestProvider(path, apiKey);
    if (resultType === "teams") {
      const teams = response.map(item => mapTeam(item.team)).sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"));
      sendJson(res, 200, { teams }, cacheSeconds);
      return;
    }
    if (resultType === "fixtures") {
      const fixtures = response.map(mapFixture).sort((left, right) =>
        (left.timestamp || 0) - (right.timestamp || 0));
      sendJson(res, 200, { fixtures }, cacheSeconds);
      return;
    }

    const statistics = response.map(item => {
      const team = mapTeam(item.team);
      if (!Array.isArray(item.statistics)) {
        throw new Error("A API de futebol retornou estatísticas inválidas.");
      }
      return {
        team,
        statistics: item.statistics
          .filter(statistic => isObject(statistic) &&
            typeof statistic.type === "string" &&
            (typeof statistic.value === "string" || typeof statistic.value === "number" ||
              statistic.value === null))
          .map(statistic => ({ type: statistic.type, value: statistic.value }))
      };
    });
    sendJson(res, 200, { statistics }, cacheSeconds);
  } catch (error) {
    console.error("Não foi possível consultar a API-Football:", error);
    sendJson(res, 502, { error: error.message || "Não foi possível carregar os dados de futebol." });
  }
};
