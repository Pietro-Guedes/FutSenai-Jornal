"use strict";

const API_BASE_URL = "https://api.football-data.org/v4";
const BRAZIL_SERIE_A_CODE = "BSA";
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
    throw new Error("O football-data.org retornou dados inválidos de time.");
  }
  return {
    id: value.id,
    name: value.shortName || value.name,
    logo: typeof value.crest === "string" ? value.crest : ""
  };
}

function mapMatch(value) {
  if (!isObject(value) || !Number.isInteger(value.id) ||
    typeof value.utcDate !== "string" || typeof value.status !== "string" ||
    !isObject(value.homeTeam) || !isObject(value.awayTeam)) {
    throw new Error("O football-data.org retornou dados inválidos de partida.");
  }
  const score = isObject(value.score) && isObject(value.score.fullTime)
    ? value.score.fullTime
    : {};
  const timestamp = Date.parse(value.utcDate);
  return {
    id: value.id,
    date: value.utcDate,
    timestamp: Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null,
    status: {
      short: value.status,
      long: value.status
    },
    round: Number.isInteger(value.matchday) ? "Rodada " + value.matchday : "",
    teams: {
      home: mapTeam(value.homeTeam),
      away: mapTeam(value.awayTeam)
    },
    goals: {
      home: Number.isInteger(score.home) ? score.home : null,
      away: Number.isInteger(score.away) ? score.away : null
    }
  };
}

async function requestProvider(path, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      headers: { "X-Auth-Token": apiKey },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isObject(payload) && typeof payload.message === "string"
      ? payload.message
      : "O football-data.org respondeu com erro HTTP " + response.status + ".";
    throw new Error(message);
  }
  if (!isObject(payload)) {
    throw new Error("O football-data.org retornou uma resposta fora do formato esperado.");
  }
  return payload;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Método não permitido." });
    return;
  }

  const apiKey = process.env.FOOTBALL_DATA_TOKEN;
  if (!apiKey) {
    sendJson(res, 503, { error: "Configure FOOTBALL_DATA_TOKEN nas variáveis da Vercel." });
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
  if (type === "teams") {
    path = "/competitions/" + BRAZIL_SERIE_A_CODE + "/teams?season=" + season;
    cacheSeconds = 86400;
  } else if (type === "fixtures") {
    path = "/competitions/" + BRAZIL_SERIE_A_CODE + "/matches?season=" + season;
    cacheSeconds = 900;
  } else {
    sendJson(res, 400, { error: "Tipo de consulta de futebol desconhecido." });
    return;
  }

  try {
    const payload = await requestProvider(path, apiKey);
    if (type === "teams") {
      if (!Array.isArray(payload.teams)) {
        throw new Error("O football-data.org não retornou uma lista de times.");
      }
      const teams = payload.teams.map(mapTeam).sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"));
      sendJson(res, 200, { teams }, cacheSeconds);
      return;
    }
    if (!Array.isArray(payload.matches)) {
      throw new Error("O football-data.org não retornou uma lista de partidas.");
    }
    const fixtures = payload.matches.map(mapMatch).sort((left, right) =>
      (left.timestamp || 0) - (right.timestamp || 0));
    sendJson(res, 200, { fixtures }, cacheSeconds);
  } catch (error) {
    console.error("Não foi possível consultar o football-data.org:", error);
    sendJson(res, 502, { error: error.message || "Não foi possível carregar os dados de futebol." });
  }
};
