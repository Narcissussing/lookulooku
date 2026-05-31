import "dotenv/config";
import express from "express";

import {
  recupererProchainsPassages,
  recupererMeteo,
  recupererPrevisions,
  recupererInfosTrafic,
} from "./services/api.js";
import {
  extraireDeparts,
  extraireMessages,
  construireDonneesMeteo,
  enrichirCreneaux,
  filtrerDeparts,
  evaluerCreneau,
} from "./services/utils.js";

const app = express();
const port = 666;

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

  // Retour
  {
    realHeure: "20h05",
    forecastHeure: "T20:00",
    villeIndex: 1,
    direction: "retour",
    prochainCreneau: "20h30",
  },
  {
    realHeure: "20h30",
    forecastHeure: "T21:00",
    villeIndex: 1,
    direction: "retour",
    prochainCreneau: "21h05",
  },
  {
    realHeure: "21h05",
    forecastHeure: "T21:00",
    villeIndex: 1,
    direction: "retour",
    prochainCreneau: null,
  },
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
    const departsTrilportDepart = filtrerDeparts(
      departsTrilport,
      ["Meaux", "Paris Est"],
      2,
    );

    // Arrivées à Trilport depuis l'autre sens
    const arrivesTrilport = filtrerDeparts(
      departsTrilport,
      ["Château-Thierry", "La Ferté-Milon"],
      2,
    );

    const meteos = await Promise.all(villes.map(recupererMeteo));
    const previsions = await Promise.all(villes.map(recupererPrevisions));

    const infosTrafic = await recupererInfosTrafic();
    const messages = extraireMessages(infosTrafic);

    // Départs utiles depuis Meaux
    const departsRetour = filtrerDeparts(departsMeaux, [
      "Château-Thierry",
      "La Ferté-Milon",
    ]);

    // Départs utiles depuis Trilport
    const departsAller = filtrerDeparts(departsTrilport, [
      "Meaux",
      "Paris Est",
    ]);

    const donneesMeteo = construireDonneesMeteo(
      previsions,
      meteos,
      villes,
      heuresRecherchees,
    );
    let statutDeparts;
    if (departsTrilportDepart.length > 0) {
      statutDeparts = "ok";
    } else {
      // Vérifier si c'est trop tôt ou trop tard
      // Pour l'instant on n'a pas l'heure du premier train de la journée
      statutDeparts = "termine";
    }

    // On enrichit chaque créneau avec verdicts, score et résumé
    const creneauxEvalues = enrichirCreneaux(
      donneesMeteo.map(evaluerCreneau),
      departsAller,
      departsRetour,
    );
    // Marquer le meilleur créneau aller et retour
    for (const direction of ["aller", "retour"]) {
      const creneauxDirection = creneauxEvalues.filter(
        (c) => c.direction === direction,
      );
      const meilleur = creneauxDirection.reduce(
        (min, c) => (c.score < min.score ? c : min),
        creneauxDirection[0],
      );
      if (meilleur) meilleur.estMeilleur = true;
    }
    console.log(creneauxEvalues)
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
      messages: [],
      erreur: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
