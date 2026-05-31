import "dotenv/config";
import express from "express";
import axios from "axios";

import { recupererProchainsPassages, recupererMeteo, recupererPrevisions, recupererInfosTrafic } from "./services/api.js";
import { extraireDeparts, extraireMessages, evaluerCreneau, trouverTrainsPourCreneau, trouverTrainsEntre, determinerStatut } from "./services/utils.js";

const app = express();
const port = 666;

const OW_API_KEY = process.env.OPENWEATHER_API_KEY;
const IDFM_API_KEY = process.env.IDFM_API_KEY;


const OW_URL = "https://api.openweathermap.org/data/2.5";
const OM_URL = "https://api.open-meteo.com/v1/";
const IDFM_URL = "https://prim.iledefrance-mobilites.fr/marketplace";

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
  // Aller
  { realHeure: "17h30", forecastHeure: "T18:00", villeIndex: 0, direction: "aller" },
  { realHeure: "18h30", forecastHeure: "T19:00", villeIndex: 0, direction: "aller" },
  { realHeure: "19h30", forecastHeure: "T20:00", villeIndex: 0, direction: "aller" },

  // Retour
  { realHeure: "20h05", forecastHeure: "T20:00", villeIndex: 1, direction: "retour", prochainCreneau: "20h30" },
  { realHeure: "20h30", forecastHeure: "T21:00", villeIndex: 1, direction: "retour", prochainCreneau: "21h05" },
  { realHeure: "21h05", forecastHeure: "T21:00", villeIndex: 1, direction: "retour", prochainCreneau: null },
];

app.set("view engine", "ejs");
app.use(express.static("public"));

app.get("/", async (req, res) => {
  try {
    const passagesMeaux = await recupererProchainsPassages(
      "STIF:StopArea:SP:43161:",
    );

    const passagesTrilport = await recupererProchainsPassages(
      "STIF:StopArea:SP:47962:",
    );

    const departsMeaux = extraireDeparts(passagesMeaux);
    const departsTrilport = extraireDeparts(passagesTrilport);

    // Départs Trilport → Meaux / Paris
    const donneesMeteo = [];
    const departsTrilportDepart = departsTrilport
      .filter(
        (train) =>
          train.destination === "Meaux" || train.destination === "Paris Est",
      )
      .sort((a, b) => new Date(a.heure) - new Date(b.heure))
      .slice(0, 2);

    // Arrivées à Trilport depuis l'autre sens
    const arrivesTrilport = departsTrilport
      .filter(
        (train) =>
          train.destination === "Château-Thierry" ||
          train.destination === "La Ferté-Milon",
      )
      .sort((a, b) => new Date(a.heure) - new Date(b.heure))
      .slice(0, 2);

    const meteos = await Promise.all(villes.map(recupererMeteo));
    const previsions = await Promise.all(villes.map(recupererPrevisions));

    const infosTrafic = await recupererInfosTrafic();
    const messages = extraireMessages(infosTrafic);
    
    // Départs utiles depuis Meaux
    const departsRetour = departsMeaux
      .filter(
        (train) =>
          train.destination === "Château-Thierry" ||
          train.destination === "La Ferté-Milon",
      )
      .sort((a, b) => new Date(a.heure) - new Date(b.heure));

    // Départs utiles depuis Trilport
    const departsAller = departsTrilport
      .filter(
        (train) =>
          train.destination === "Meaux" || train.destination === "Paris Est",
      )
      .sort((a, b) => new Date(a.heure) - new Date(b.heure));

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
          prochainCreneau: heureRecherchee.prochainCreneau ?? null,
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
    const maintenant = new Date();
    let statutDeparts;
    if (departsTrilportDepart.length > 0) {
      statutDeparts = "ok";
    } else {
      // Vérifier si c'est trop tôt ou trop tard
      // Pour l'instant on n'a pas l'heure du premier train de la journée
      statutDeparts = "termine";
    }

    // On enrichit chaque créneau avec verdicts, score et résumé
    const creneauxEvalues = donneesMeteo.map(evaluerCreneau);
    // Associer les trains aux créneaux retour
    for (const creneau of creneauxEvalues) {
      if (creneau.direction === "retour") {
        creneau.trains = trouverTrainsEntre(
          departsRetour,
          creneau.realHeure,
          creneau.prochainCreneau,
        ).slice(0, 2);
        creneau.statutTrain = determinerStatut(
          creneau.trains,
          creneau.realHeure,
        );
      }
    }
    for (const creneau of creneauxEvalues) {
      if (creneau.direction === "aller") {
        creneau.trainsAller = trouverTrainsPourCreneau(
          departsAller,
          creneau.realHeure,
        ).slice(0, 2);
        creneau.statutTrain = determinerStatut(
          creneau.trainsAller,
          creneau.realHeure,
        );
      }
    }
    res.render("index.ejs", {
      meteos,
      creneaux: creneauxEvalues,
      departsRetour,

      departsTrilportDepart,
      arrivesTrilport,
      messages,
      statutDeparts,
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