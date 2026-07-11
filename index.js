import "dotenv/config";
import express from "express";

import {
  recupererProchainsPassages,
  recupererDonneesMeteo,
  recupererInfosTrafic,
} from "./services/api.js";
import {
  extraireDeparts,
  extraireMessages,
  construireDonneesMeteo,
  enrichirCreneaux,
  filtrerDeparts,
  evaluerCreneau,
  formaterDatePerturbation,
  traduireCodeMeteo,
} from "./services/utils.js";

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.IDFM_API_KEY) {
  throw new Error("La variable d'environnement IDFM_API_KEY est requise.");
}

const villes = [
  {
    nom: "Trilport",
    latitude: 48.9568,
    longitude: 2.9508,
  },

  {
    nom: "Meaux",
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

// Construire les données météo pour les créneaux
let cacheMeteo = null;
let dernierAppelMeteo = null;
let requeteMeteoEnCours = null;
const DUREE_CACHE = 15 * 60 * 1000;

async function obtenirMeteo() {
  const maintenant = Date.now();
  if (cacheMeteo && maintenant - dernierAppelMeteo <= DUREE_CACHE) {
    return cacheMeteo;
  }

  if (!requeteMeteoEnCours) {
    requeteMeteoEnCours = Promise.all(villes.map(recupererDonneesMeteo))
      .then((donnees) => {
        cacheMeteo = {
          meteos: donnees,
          previsions: donnees,
        };
        dernierAppelMeteo = Date.now();
        return cacheMeteo;
      })
      .finally(() => {
        requeteMeteoEnCours = null;
      });
  }

  try {
    return await requeteMeteoEnCours;
  } catch (error) {
    if (cacheMeteo) return cacheMeteo;
    throw error;
  }
}

function resultatOuTableau(resultat) {
  return resultat.status === "fulfilled" ? extraireDeparts(resultat.value) : [];
}

function statutService(departs, disponible) {
  if (!disponible) return "indisponible";
  if (departs.length > 0) return "ok";

  const heureParis = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return heureParis < 5 ? "attente" : heureParis >= 23 ? "termine" : "attente";
}

app.get("/", async (req, res) => {
  try {
    const [resultatMeaux, resultatTrilport, resultatTrafic, resultatMeteo] =
      await Promise.allSettled([
        recupererProchainsPassages("STIF:StopArea:SP:43161:"),
        recupererProchainsPassages("STIF:StopArea:SP:47962:"),
        recupererInfosTrafic(),
        obtenirMeteo(),
      ]);

    const departsMeaux = resultatOuTableau(resultatMeaux);
    const departsTrilport = resultatOuTableau(resultatTrilport);
    const meauxDisponible = resultatMeaux.status === "fulfilled";
    const trilportDisponible = resultatTrilport.status === "fulfilled";

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
    const { meteos, previsions } =
      resultatMeteo.status === "fulfilled"
        ? resultatMeteo.value
        : { meteos: [], previsions: [] };
    const infosTrafic =
      resultatTrafic.status === "fulfilled"
        ? resultatTrafic.value
        : { disruptions: [] };
    const messages = extraireMessages(infosTrafic);

    // Déterminer le niveau d'alerte trafic
    const perturbations = messages.filter(
      (m) =>
        m.cause === "PERTURBATION" && m.estAujourdhui && m.concerneMonTrajet,
    );
    const texteAlerte = perturbations[0]?.texte ?? null;
    const detailAlerte = perturbations[0] ?? null;

    const informations = messages.filter(
      (m) => m.cause === "INFORMATION" && m.estAujourdhui,
    );

    let niveauTrafic =
      resultatTrafic.status === "fulfilled" ? "fluide" : "indisponible";
    const afficherAlerteCarte = perturbations.length > 0;
    if (perturbations.length > 0) {
      niveauTrafic = "alerte";
    } else if (informations.length > 0) {
      niveauTrafic = "info";
    }

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

    const donneesMeteo =
      meteos.length === villes.length && previsions.length === villes.length
        ? construireDonneesMeteo(previsions, meteos, villes, heuresRecherchees)
        : [];
    const statutDeparts = statutService(
      departsTrilportDepart,
      trilportDisponible,
    );
    const statutArrivees = statutService(arrivesTrilport, trilportDisponible);

    // On enrichit chaque créneau avec verdicts, score et résumé
    const creneauxEvalues = enrichirCreneaux(
      donneesMeteo.map(evaluerCreneau),
      departsAller,
      departsRetour,
    );
    for (const creneau of creneauxEvalues) {
      if (
        (creneau.direction === "aller" && !trilportDisponible) ||
        (creneau.direction === "retour" && !meauxDisponible)
      ) {
        creneau.statutTrain = "indisponible";
      }
    }
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

    const travauxFuturs = messages
      .filter((m) => m.cause === "TRAVAUX" && m.concerneMonTrajet)
      .sort((a, b) => a.debut.localeCompare(b.debut))
      .slice(0, 4);

    const prochaineTravaux = travauxFuturs[0];

    travauxFuturs.forEach((travaux) => {
      travaux.dateDebut =
        travaux.debut.slice(6, 8) + "/" + travaux.debut.slice(4, 6);

      travaux.dateFin = travaux.fin.slice(6, 8) + "/" + travaux.fin.slice(4, 6);
    });

    res.render("index.ejs", {
      meteos,
      creneaux: creneauxEvalues,
      departsRetour,
      departsTrilportDepart,
      arrivesTrilport,
      texteAlerte,
      detailAlerte,
      formaterDatePerturbation,
      statutDeparts,
      statutArrivees,
      traduireCodeMeteo,
      niveauTrafic,
      prochaineTravaux,
      travauxFuturs,
      afficherAlerteCarte,
    });
  } catch (error) {
    console.error(
      "Erreur API:",
      error.config?.url,
      error.response?.status,
      error.message,
    );

    res.render("index.ejs", {
      meteos: [],
      creneaux: [],
      texteAlerte: null,
      detailAlerte: null,
      erreur: error.message,
      niveauTrafic: "fluide",
      afficherAlerteCarte: false,
      prochaineTravaux: null,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
