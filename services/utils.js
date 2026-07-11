const MINUTE_EN_MS = 60000;

function obtenirPartiesDateParis(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
}

function obtenirOffsetParis(date) {
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find(({ type }) => type === "timeZoneName")
    ?.value.match(/GMT([+-])(\d{2}):(\d{2})/);

  return offset
    ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1)
    : 0;
}

function creerDateParis(year, month, day, hour, minute) {
  const dateUTC = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetEnMinutes = obtenirOffsetParis(dateUTC);

  return new Date(dateUTC.getTime() - offsetEnMinutes * MINUTE_EN_MS);
}

function dateLocaleParis(realHeure) {
  const { year, month, day } = obtenirPartiesDateParis();
  const [hour, minute] = realHeure.split("h").map(Number);
  return creerDateParis(year, month, day, hour, minute);
}

function dateISOParis(iso) {
  const [date, heure] = iso.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = heure.split(":").map(Number);
  return creerDateParis(year, month, day, hour, minute);
}

function dateAujourdhuiParis() {
  const { year, month, day } = obtenirPartiesDateParis();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extraireHoraires(visite) {
  const trajet = visite?.MonitoredVehicleJourney?.MonitoredCall;
  return trajet?.ExpectedDepartureTime ?? trajet?.ExpectedArrivalTime;
}

function nettoyerMessageTrafic(message) {
  const entites = {
    amp: "&",
    apos: "'",
    quot: '"',
    lt: "<",
    gt: ">",
    nbsp: " ",
    agrave: "à",
    acirc: "â",
    eacute: "é",
    egrave: "è",
    ecirc: "ê",
    euml: "ë",
    icirc: "î",
    iuml: "ï",
    ocirc: "ô",
    ugrave: "ù",
    uuml: "ü",
    ccedil: "ç",
  };

  return String(message)
    .replace(/<\s*br\s*\/?>/giu, "\n")
    .replace(/<\/p\s*>/giu, "\n\n")
    .replace(/<p(?:\s[^>]*)?>/giu, "")
    .replace(/<li(?:\s[^>]*)?>/giu, "• ")
    .replace(/<\/li\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/&#x([0-9a-f]+);/giu, (_, valeur) =>
      String.fromCodePoint(Number.parseInt(valeur, 16)),
    )
    .replace(/&#(\d+);/gu, (_, valeur) =>
      String.fromCodePoint(Number.parseInt(valeur, 10)),
    )
    .replace(/&([a-z]+);/giu, (_, nom) => entites[nom.toLowerCase()] ?? `&${nom};`)
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function construireDateLocale(realHeure) {
  return dateLocaleParis(realHeure);
}

// Transformer les perturbations en tableau de messages à afficher
export function extraireMessages(data) {
  const disruptions = data?.disruptions ?? [];

  return disruptions
    .filter((d) => {
      // Garder uniquement les perturbations Ligne P
      const sections = d.impactedSections ?? [];

      return sections.some(
        (s) => s.lineId?.toLowerCase() === "line:idfm:c01730",
      );
    })
    .filter((d) => d.applicationPeriods?.length > 0)
    .map((d) => {
      const section = d.impactedSections?.[0];

      return {
        texte: d.title || d.shortMessage || "Perturbation sur la ligne P",
        details:
          nettoyerMessageTrafic(
            d.description ||
              d.longMessage ||
              d.message ||
              d.shortMessage ||
              d.title ||
              "Aucun détail supplémentaire n'est disponible.",
          ),
        severity: d.severity,
        cause: d.cause,

        estAujourdhui: estActiveAujourdhui(d.applicationPeriods),
        concerneMonTrajet: concerneTrajet(d),

        debut: d.applicationPeriods[0].begin,
        fin: d.applicationPeriods[d.applicationPeriods.length - 1].end,

        trajet:
          section?.from?.name && section?.to?.name
            ? `${nettoyerNomArret(section.from.name)} ↔ ${nettoyerNomArret(section.to.name)}`
            : null,
      };
    });
}

// Transformer les données de passages en tableau de départs simples
export function extraireDeparts(data) {
  const deliveries = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery ?? [];
  const visites = deliveries.flatMap(
    (delivery) => delivery?.MonitoredStopVisit ?? [],
  );

  return visites.map((visite) => {
    const heure = extraireHoraires(visite);
    const destination =
      visite?.MonitoredVehicleJourney?.DestinationName?.[0]?.value
        ?.replace(/Ch.teau-Thierry/u, "Château-Thierry")
        ?.replace(/La Fert.-Milon/u, "La Ferté-Milon");

    return {
      destination,
      destinationCourte: raccourcirDestination(destination),
      direction: visite?.MonitoredVehicleJourney?.DirectionRef?.value,
      heure,
      heureFormatee: heure ? formaterHeure(heure) : undefined,
      dansXMin: heure ? minutesAvantDepart(heure) : undefined,
    };
  });
}

// Évaluer un créneau de départ selon les données météo et trafic
export function evaluerCreneau(donnees) {
  const creneauMs = dateISOParis(donnees.heure).getTime();
  const estJour =
    creneauMs >= donnees.sunrise * 1000 && creneauMs <= donnees.sunset * 1000;

  const parapluie = donnees.precipitation > 0 || donnees.weather_code >= 51;
  const lunettes = donnees.cloud_cover < 30 && estJour;
  const couche = donnees.temperature < 15;

  const score = Number(parapluie) * 2 + Number(couche);

  let resume;
  if (parapluie && couche) resume = "🌧️🥶 Défavorable";
  else if (parapluie) resume = "🌧️ Parapluie !";
  else if (couche) resume = "🥶 Couvre-toi";
  else if (lunettes) resume = "☀️ Lunettes !";
  else resume = "✅ Tranquille";

  return {
    ...donnees,
    verdicts: { parapluie, lunettes, couche },
    resume,
    score,
  };
}

// Formater une heure ISO en "17:30"
export function formaterHeure(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Calculer le nombre de minutes avant le départ
export function minutesAvantDepart(iso) {
  const depart = new Date(iso);
  return Math.round((depart.getTime() - Date.now()) / MINUTE_EN_MS);
}

export function raccourcirDestination(dest) {
  const raccourcis = {
    "Château-Thierry": "Ch.-Thierry",
    "La Ferté-Milon": "La Ferté",
  };
  return raccourcis[dest] ?? dest;
}

// Déterminer le statut d'un créneau selon les trains disponibles
export function determinerStatut(trains, realHeure) {
  if (trains.length > 0) return "ok";

  const maintenant = new Date();
  const heureCreneau = construireDateLocale(realHeure);

  return maintenant > heureCreneau ? "passe" : "attente";
}

// Trouver les trains disponibles après une heure de départ (format "17h30")
export function trouverTrainsPourCreneau(trains, realHeure) {
  const cible = construireDateLocale(realHeure).getTime();
  const borneMin = cible - 10 * MINUTE_EN_MS;
  const borneMax = cible + 10 * MINUTE_EN_MS;

  return trains.filter((train) => {
    const heureTrain = new Date(train.heure).getTime();
    return heureTrain >= borneMin && heureTrain <= borneMax;
  });
}

// Trouver les trains disponibles entre une heure de départ et un prochain créneau (format "17h30")
export function trouverTrainsEntre(trains, realHeure, prochainCreneau) {
  const debut = construireDateLocale(realHeure).getTime();

  if (!prochainCreneau) {
    return trains.filter((train) => new Date(train.heure).getTime() > debut);
  }

  const fin = construireDateLocale(prochainCreneau).getTime();

  return trains.filter((train) => {
    const heureTrain = new Date(train.heure).getTime();
    return heureTrain > debut && heureTrain <= fin;
  });
}

// Construire le tableau des données météo pour chaque créneau
export function construireDonneesMeteo(
  previsions,
  meteos,
  villes,
  heuresRecherchees,
) {
  const aujourdhui = dateAujourdhuiParis();
  const donneesMeteo = [];

  for (const heureRecherchee of heuresRecherchees) {
    const previsionVille = previsions[heureRecherchee.villeIndex];
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
        sunrise:
          new Date(
            meteos[heureRecherchee.villeIndex].daily.sunrise[0],
          ).getTime() / 1000,
        sunset:
          new Date(
            meteos[heureRecherchee.villeIndex].daily.sunset[0],
          ).getTime() / 1000,
      });
    } else {
      console.warn(
        `Heure ${cible} non trouvée pour ${villes[heureRecherchee.villeIndex].nom}.`,
      );
    }
  }

  return donneesMeteo;
}

// Filtrer et trier les départs par destination
export function filtrerDeparts(trains, destinations, limite = null) {
  const resultat = trains
    .filter(
      (train) =>
        destinations.includes(train.destination) && train.dansXMin >= -2,
    )
    .sort((a, b) => new Date(a.heure) - new Date(b.heure));
  return limite ? resultat.slice(0, limite) : resultat;
}

// Associer les trains aux créneaux et calculer leur statut
export function enrichirCreneaux(creneaux, departsAller, departsRetour) {
  for (const creneau of creneaux) {
    if (creneau.direction === "aller") {
      creneau.trainsAller = trouverTrainsPourCreneau(
        departsAller,
        creneau.realHeure,
      ).slice(0, 2);
      creneau.statutTrain = determinerStatut(
        creneau.trainsAller,
        creneau.realHeure,
      );
    } else if (creneau.direction === "retour") {
      creneau.trains = trouverTrainsEntre(
        departsRetour,
        creneau.realHeure,
        creneau.prochainCreneau,
      ).slice(0, 2);
      creneau.statutTrain = determinerStatut(creneau.trains, creneau.realHeure);
    }
  }
  return creneaux;
}

// Traduire un code météo WMO en description française
export function traduireCodeMeteo(code) {
  const descriptions = {
    0: "☀️ ensoleillé",
    1: "🌤️ peu nuageux",
    2: "⛅ partiellement nuageux",
    3: "☁️ couvert",
    45: "🌫️ brouillard",
    48: "🌫️❄️ brouillard givrant",
    51: "🌦️ bruine légère",
    53: "🌦️ bruine",
    55: "🌧️ bruine dense",
    61: "🌧️ pluie légère",
    63: "🌧️🌧️ pluie",
    65: "🌧️🌧️🌧️ forte pluie",
    71: "🌨️ neige légère",
    73: "🌨️🌨️ neige",
    75: "❄️❄️❄️ forte neige",
    80: "🌦️ averses légères",
    81: "🌧️ averses",
    82: "⛈️ fortes averses",
    95: "⛈️ orage",
    96: "⛈️🌨️ orage avec grêle",
    99: "⛈️⛈️ orage violent",
  };
  return descriptions[code] ?? "conditions variables";
}

// Formater une date IDFM (YYYYMMDDTHHMMSS) dans le fuseau de Paris
export function formaterDatePerturbation(date) {
  if (!date) return null;

  const correspondance = date.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!correspondance) return date;

  const [, year, month, day, hour, minute] = correspondance.map(Number);
  return creerDateParis(year, month, day, hour, minute).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Arrêts qui concernent le trajet Trilport ↔ Meaux ↔ Paris
const ARRETS_TRAJET = [
  "meaux",
  "trilport",
  "château-thierry",
  "la ferté-milon",
  "paris est",
  "gare de l'est",
];

// Vérifier si une perturbation est active aujourd'hui
function estActiveAujourdhui(periodes) {
  const aujourdhui = dateAujourdhuiParis().replace(/-/g, "");
  return periodes.some((p) => {
    const debut = p.begin?.slice(0, 8) ?? "00000000";
    const fin = p.end?.slice(0, 8) ?? "99999999";
    return debut <= aujourdhui && fin >= aujourdhui;
  });
}

// Vérifier si une perturbation concerne le trajet
function concerneTrajet(disruption) {
  const texte = JSON.stringify(disruption.impactedSections ?? []).toLowerCase();
  return ARRETS_TRAJET.some((arret) => texte.includes(arret));
}

// Nettoyer le nom d'un arrêt en supprimant les parenthèses et leur contenu
function nettoyerNomArret(nom) {
  return nom?.replace(/\s*\(.*?\)/g, "").trim();
}
