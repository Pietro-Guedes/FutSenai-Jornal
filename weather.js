(() => {
  "use strict";

  const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
  const button = document.querySelector("#weather-button");
  const status = document.querySelector("#weather-status");
  const result = document.querySelector("#weather-result");
  const conditionIcon = document.querySelector("#weather-condition-icon");
  const temperature = document.querySelector("#weather-temperature");
  const condition = document.querySelector("#weather-condition");
  const details = document.querySelector("#weather-details");

  const weatherDescriptions = {
    0: { label: "Céu limpo", icon: "☀️" },
    1: { label: "Predominantemente limpo", icon: "🌤️" },
    2: { label: "Parcialmente nublado", icon: "⛅" },
    3: { label: "Nublado", icon: "☁️" },
    45: { label: "Neblina", icon: "🌫️" },
    48: { label: "Neblina com geada", icon: "🌫️" },
    51: { label: "Garoa leve", icon: "🌦️" },
    53: { label: "Garoa moderada", icon: "🌦️" },
    55: { label: "Garoa intensa", icon: "🌧️" },
    56: { label: "Garoa congelante leve", icon: "🌧️" },
    57: { label: "Garoa congelante intensa", icon: "🌧️" },
    61: { label: "Chuva leve", icon: "🌦️" },
    63: { label: "Chuva moderada", icon: "🌧️" },
    65: { label: "Chuva intensa", icon: "🌧️" },
    66: { label: "Chuva congelante leve", icon: "🌧️" },
    67: { label: "Chuva congelante intensa", icon: "🌧️" },
    71: { label: "Neve leve", icon: "🌨️" },
    73: { label: "Neve moderada", icon: "🌨️" },
    75: { label: "Neve intensa", icon: "❄️" },
    77: { label: "Grãos de neve", icon: "❄️" },
    80: { label: "Pancadas de chuva leves", icon: "🌦️" },
    81: { label: "Pancadas de chuva moderadas", icon: "🌧️" },
    82: { label: "Pancadas de chuva intensas", icon: "⛈️" },
    85: { label: "Pancadas de neve leves", icon: "🌨️" },
    86: { label: "Pancadas de neve intensas", icon: "❄️" },
    95: { label: "Trovoada", icon: "⛈️" },
    96: { label: "Trovoada com granizo leve", icon: "⛈️" },
    99: { label: "Trovoada com granizo intenso", icon: "⛈️" }
  };

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Este navegador não oferece acesso à localização."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 600000,
        timeout: 12000
      });
    });
  }

  function locationErrorMessage(error) {
    if (error.code === 1) {
      return "A localização não foi autorizada. Permita o acesso no navegador e tente novamente.";
    }
    if (error.code === 2) {
      return "Não foi possível determinar sua localização. Verifique o serviço de localização e tente novamente.";
    }
    if (error.code === 3) {
      return "A localização demorou para responder. Tente novamente.";
    }
    return error.message || "Não foi possível acessar a localização.";
  }

  async function loadWeather(latitude, longitude) {
    const url = new URL(WEATHER_URL);
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      timezone: "auto"
    }).toString();

    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error("Não foi possível consultar o serviço de clima. Verifique sua conexão e tente novamente.");
    }
    if (!response.ok) {
      throw new Error("O serviço de clima respondeu com erro " + response.status + ".");
    }

    const data = await response.json();
    const current = data && data.current;
    if (!current || !Number.isFinite(current.temperature_2m) ||
      !Number.isFinite(current.apparent_temperature) ||
      !Number.isFinite(current.relative_humidity_2m) ||
      !Number.isFinite(current.wind_speed_10m) ||
      !Number.isInteger(current.weather_code)) {
      throw new Error("O serviço de clima retornou dados em formato inesperado.");
    }

    const description = weatherDescriptions[current.weather_code];
    if (!description) {
      throw new Error("O serviço de clima retornou uma condição desconhecida.");
    }

    conditionIcon.textContent = description.icon;
    temperature.textContent = Math.round(current.temperature_2m) + "°C";
    condition.textContent = description.label;
    details.textContent = "Sensação " + Math.round(current.apparent_temperature) +
      "° · Umidade " + Math.round(current.relative_humidity_2m) +
      "% · Vento " + Math.round(current.wind_speed_10m) + " km/h";
    result.hidden = false;
    status.textContent = "Condições atuais da sua região";
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Consultando…";
    status.textContent = "Aguardando permissão de localização…";

    try {
      const position = await getCurrentPosition();
      status.textContent = "Buscando o clima da sua região…";
      await loadWeather(position.coords.latitude, position.coords.longitude);
    } catch (error) {
      status.textContent = locationErrorMessage(error);
      console.error("Não foi possível carregar o clima local:", error);
    } finally {
      button.disabled = false;
      button.textContent = result.hidden ? "Tentar novamente" : "Atualizar clima";
    }
  });
})();
