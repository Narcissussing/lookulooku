import "dotenv/config";
import express from "express";
import axios from "axios";

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
    realHeure: "20h05",
    forecastHeure: "T20:00",
    villeIndex: 1,
    direction: "retour",
  },
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

// Récupérer les infos trafic pour la Ligne P
async function recupererInfosTrafic() {
  const { data } = await axios.get(`${IDFM_URL}/general-message`, {
    headers: {
      apikey: IDFM_API_KEY,
    },
    params: {
      LineRef: "STIF:Line::C01730:",
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
  if (parapluie && couche) resume = "🌧️🥶 Défavorable";
  else if (parapluie) resume = "🌧️ Parapluie !";
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
    console.log("Messages de trafic :", messages);

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
    // Associer les trains aux créneaux retour
    for (const creneau of creneauxEvalues) {
      if (creneau.direction === "retour") {
        creneau.trains = trouverTrainsPourCreneau(
          departsRetour,
          creneau.realHeure,
        ).slice(0, 2);
        creneau.statutTrain = determinerStatut(creneau.trains, creneau.realHeure);
      }
    }
    for (const creneau of creneauxEvalues) {
      if (creneau.direction === "aller") {
        creneau.trainsAller = trouverTrainsPourCreneau(
          departsAller,
          creneau.realHeure,
        ).slice(0, 2);
        creneau.statutTrain = determinerStatut(creneau.trainsAller, creneau.realHeure);
      }
    }
    res.render("index.ejs", {
      meteos,
      creneaux: creneauxEvalues,
      departsRetour,

      departsTrilportDepart,
      arrivesTrilport,
      messages,
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

// Récupérer les prochains passages pour une zone d'arrêt
async function recupererProchainsPassages(monitoringRef) {
  const { data } = await axios.get(`${IDFM_URL}/stop-monitoring`, {
    headers: {
      apikey: IDFM_API_KEY,
    },
    params: {
      MonitoringRef: monitoringRef,
    },
  });
  return data;
}

function extraireDeparts(data) {
  // On transforme la réponse PRIM en format simple
  return data.Siri.ServiceDelivery.StopMonitoringDelivery.flatMap(
    (delivery) => delivery.MonitoredStopVisit,
  ).map((visite) => {
    const heure =
      visite.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime ??
      visite.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime;
    return {
      destination: visite.MonitoredVehicleJourney.DestinationName?.[0]?.value,
      destinationCourte: raccourcirDestination(
        visite.MonitoredVehicleJourney.DestinationName?.[0]?.value,
      ),
      direction: visite.MonitoredVehicleJourney.DirectionRef?.value,
      heure,
      heureFormatee: formaterHeure(heure),
      dansXMin: minutesAvantDepart(heure), // ← ajouter ici
    };
  });
}

function formaterHeure(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
// Trouver les trains disponibles après une heure de départ (format "17h30")
function trouverTrainsPourCreneau(trains, realHeure) {
  // Convertir "17h30" en Date locale (heure Paris si serveur en Paris)
  const [heures, minutes] = realHeure.split("h").map(Number);
  const maintenant = new Date();
  const cible = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate(),
    heures,
    minutes,
  );
  const borneMin = cible.getTime() - 10 * 60000;
  const borneMax = cible.getTime() + 10 * 60000;
  // new Date() compare toujours en millisecondes UTC — pas besoin de correction manuelle
  return trains.filter((train) => {
    const heureTrain = new Date(train.heure).getTime();
    return heureTrain >= borneMin && heureTrain <= borneMax;
  });
}
// Calculer le nombre de minutes avant le départ
function minutesAvantDepart(iso) {
  const maintenant = new Date();
  const depart = new Date(iso);
  return Math.round((depart - maintenant) / 60000);
}

// Transformer les données de trafic en tableau de messages à afficher
function extraireMessages(data) {
  const messages = data.Siri.ServiceDelivery.GeneralMessageDelivery.flatMap(
    (delivery) => delivery.InfoMessage,
  );
  return messages.map((msg) => {
    const texte = msg.Content.Message.find(
      (m) => m.MessageType === "SHORT_MESSAGE",
    )?.MessageText.value;
    return {
      texte,
      canal: msg.InfoChannelRef.value,
      valideJusqua: msg.ValidUntilTime,
    };
  });
}

function raccourcirDestination(dest) {
  const raccourcis = {
    "Château-Thierry": "Ch.-Thierry",
    "La Ferté-Milon": "La Ferté",
    "Paris Est": "Paris Est",
    Meaux: "Meaux",
  };
  return raccourcis[dest] ?? dest;
}

// Déterminer le statut d'un créneau selon les trains disponibles
function determinerStatut(trains, realHeure) {
  const maintenant = new Date();
  const [h, m] = realHeure.split("h").map(Number);
  const heureGym = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate(),
    h,
    m,
  );

  if (trains.length > 0) return "ok";
  if (maintenant > heureGym) return "passe";
  return "attente";
}
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
