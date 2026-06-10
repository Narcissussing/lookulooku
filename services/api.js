import axios from "axios";

const IDFM_API_KEY = process.env.IDFM_API_KEY;
const IDFM_API_KEY2 = process.env.IDFM_API_KEY2;

const URLs = {
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
  const { data } = await idfmClient.get("/disruptions_bulk/disruptions/v2", {
    params: { LineRef: "STIF:Line::C01730:" },
  });
  return data;
}

export async function recupererMeteo(ville) {
  const { data } = await axios.get(`${URLs.OM}/forecast`, {
    params: {
      latitude: ville.latitude,
      longitude: ville.longitude,
      current:
        "temperature_2m,apparent_temperature,weather_code,precipitation,is_day",
      daily: "sunrise,sunset",
      timezone: "Europe/Paris",
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
