import axios from "axios";

const OW_API_KEY = process.env.OPENWEATHER_API_KEY;
const IDFM_API_KEY = process.env.IDFM_API_KEY;

const URLs = {
  OW: "https://api.openweathermap.org/data/2.5",
  OM: "https://api.open-meteo.com/v1/",
  IDFM: "https://prim.iledefrance-mobilites.fr/marketplace",
};

// Créer un client IDFM avec les headers par défaut
const idfmClient = axios.create({
  baseURL: URLs.IDFM,
  headers: { apikey: IDFM_API_KEY },
});

// Récupérer les prochains passages pour une zone d'arrêt
export async function recupererProchainsPassages(monitoringRef) {
  const { data } = await idfmClient.get("/stop-monitoring", {
    params: { MonitoringRef: monitoringRef },
  });
  return data;
}

// Récupérer les infos trafic pour la Ligne P
export async function recupererInfosTrafic() {
  const { data } = await idfmClient.get("/general-message", {
    params: { LineRef: "STIF:Line::C01730:" },
  });
  return data;
}

// Récupérer la météo actuelle
export async function recupererMeteo(ville) {
  const { data } = await axios.get(`${URLs.OW}/weather`, {
    params: {
      q: ville.ow,
      appid: OW_API_KEY,
      units: "metric",
      lang: "fr",
    },
  });
  return data;
}

// Récupérer les prévisions météorologiques
export async function recupererPrevisions(ville) {
  const { data } = await axios.get(`${URLs.OM}/forecast`, {
    params: {
      latitude: ville.latitude,
      longitude: ville.longitude,
      hourly: "temperature_2m,precipitation,cloud_cover,weather_code",
      timezone: "Europe/Paris",
    },
  });
  return data;
}
