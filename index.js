import "dotenv/config";
import express from "express";
import axios from "axios";

const app = express();
const port = 666;
const OW_API_KEY = process.env.OPENWEATHER_API_KEY;
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
        });
      } else {
        console.warn(
          `Heure ${cible} non trouvée pour ${villes[heureRecherchee.villeIndex].nom}.`,
        );
      }
    }
    console.log(donneesMeteo);
    res.render("index.ejs", {
      meteos,
      donneesMeteo,
    });
  } catch (error) {
    console.error(error.message);

    res.render("index.ejs", {
      meteos: [],
      donneesMeteo: [],
      erreur: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
