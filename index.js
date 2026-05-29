import "dotenv/config";
import express from "express";
import axios from "axios";

const app = express();
const port = 666;
const OW_API_KEY = process.env.OPENWEATHER_API_KEY;
const IDFM_API_KEY = process.env.IDFM_API_KEY; 
const OW_URL = "https://api.openweathermap.org/data/2.5";
const OM_URL = "https://api.open-meteo.com/v1/";

const villes = [
  {
    nom: "Trilport",
    ow: "Trilport,FR",
    latitude: 48.9568,
    longitude: 2.9508,
  },

  {
    nom: "Meaux",
    ow: "Meaux,FR",
    latitude: 48.9603,
    longitude: 2.8789,
  },
];
const heuresRecherchees = [
  // Aller — départ Trilport, on regarde la météo à Trilport
  {
    realHeure: "17h30",
    forecastHeure: "T18:00",
    villeIndex: 0,
    direction: "aller",
  },
  {
    realHeure: "18h30",
    forecastHeure: "T19:00",
    villeIndex: 0,
    direction: "aller",
  },
  {
    realHeure: "19h30",
    forecastHeure: "T20:00",
    villeIndex: 0,
    direction: "aller",
  },

  // Retour — départ Meaux, on regarde la météo à Meaux
  {
    realHeure: "20h30",
    forecastHeure: "T21:00",
    villeIndex: 1,
    direction: "retour",
  },
  {
    realHeure: "21h05",
    forecastHeure: "T21:00",
    villeIndex: 1,
    direction: "retour",
  },
];

app.set("view engine", "ejs");
app.use(express.static("public"));

async function recupererPrevisions(ville) {
  const { data } = await axios.get(OM_URL + "/forecast", {
    params: {
      latitude: ville.latitude,
      longitude: ville.longitude,
      hourly: "temperature_2m,precipitation,cloud_cover,weather_code",
      timezone: "Europe/Paris",
    },
  });

  return data;
}

async function recupererMeteo(ville) {
  const { data } = await axios.get(OW_URL + "/weather", {
    params: {
      q: ville.ow,
      appid: OW_API_KEY,
      units: "metric",
      lang: "fr",
    },
  });

  return data;
}

function evaluerCreneau(donnees) {
  // Convertir l'heure du créneau en timestamp pour comparer
  // (la chaîne est en heure locale Europe/Paris ; on la traite comme telle)
  // L'heure du créneau est en heure locale Europe/Paris
// (timezone du serveur de dev — à revoir si déploiement ailleurs)
  const creneauMs = new Date(donnees.heure).getTime();
  const sunriseMs = donnees.sunrise * 1000;
  const sunsetMs = donnees.sunset * 1000;
  const estJour = creneauMs >= sunriseMs && creneauMs <= sunsetMs;
  // Les 3 verdicts booléens
  const parapluie = donnees.precipitation > 0 || donnees.weather_code >= 51;
  const lunettes = donnees.cloud_cover < 30 && estJour;
  const couche = donnees.temperature < 15;
  // Un score : 0 = parfait, plus c'est haut, plus c'est mauvais
  let score = 0;
  if (parapluie) score += 2;
  if (couche) score += 1;
  // (lunettes ne pénalise pas — c'est juste un rappel pratique)

  // Le résumé textuel
  let resume;
  if (parapluie && couche) resume = "🌧️🥶 Évite — pluie et froid";
  else if (parapluie) resume = "🌧️ Parapluie obligatoire";
  else if (couche) resume = "🥶 Couvre-toi";
  else if (lunettes) resume = "☀️ Lunettes !";
  else resume = "✅ Tranquille";

  return {
    ...donnees, // garde les données brutes
    verdicts: { parapluie, lunettes, couche },
    resume,
    score,
  };
}

app.get("/", async (req, res) => {
  try {
    const meteos = await Promise.all(villes.map(recupererMeteo));
    const previsions = await Promise.all(villes.map(recupererPrevisions));
    const donneesMeteo = [];

    // On limite la recherche aux heures d'aujourd'hui pour éviter
    // de récupérer les mêmes heures d'un autre jour de la semaine
    const aujourdhui = new Date().toISOString().slice(0, 10);

    for (const heureRecherchee of heuresRecherchees) {
      const previsionVille = previsions[heureRecherchee.villeIndex];

      // Cible exacte : "2026-05-27T17:00" — pas n'importe quel 17h
      const cible = `${aujourdhui}${heureRecherchee.forecastHeure}`;

      const index = previsionVille.hourly.time.findIndex((t) => t === cible);

      if (index !== -1) {
        donneesMeteo.push({
          ville: villes[heureRecherchee.villeIndex].nom,
          direction: heureRecherchee.direction,
          realHeure: heureRecherchee.realHeure,
          heure: previsionVille.hourly.time[index],
          temperature: previsionVille.hourly.temperature_2m[index],
          precipitation: previsionVille.hourly.precipitation[index],
          cloud_cover: previsionVille.hourly.cloud_cover[index],
          weather_code: previsionVille.hourly.weather_code[index],
          // Heures de lever/coucher du soleil pour la ville concernée
          sunrise: meteos[heureRecherchee.villeIndex].sys.sunrise,
          sunset: meteos[heureRecherchee.villeIndex].sys.sunset,
        });
      } else {
        console.warn(
          `Heure ${cible} non trouvée pour ${villes[heureRecherchee.villeIndex].nom}.`,
        );
      }
    }
    // On enrichit chaque créneau avec verdicts, score et résumé
    const creneauxEvalues = donneesMeteo.map(evaluerCreneau);
    res.render("index.ejs", {
      meteos,
      creneaux: creneauxEvalues,
    });
  } catch (error) {
    console.error(error.message);

    res.render("index.ejs", {
      meteos: [],
      creneaux: [],
      erreur: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});


