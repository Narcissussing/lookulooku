const MINUTE_EN_MS = 60000;

function extraireHoraires(visite) {
  const trajet = visite?.MonitoredVehicleJourney?.MonitoredCall;
  return trajet?.ExpectedDepartureTime ?? trajet?.ExpectedArrivalTime;
}

function construireDateLocale(realHeure) {
  const [heures, minutes] = realHeure.split("h").map(Number);
  const maintenant = new Date();

  return new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate(),
    heures,
    minutes,
  );
}

// Transformer les données de trafic en tableau de messages à afficher
export function extraireMessages(data) {
  const deliveries = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery ?? [];
  const messages = deliveries.flatMap(
    (delivery) => delivery?.InfoMessage ?? [],
  );

  return messages.map((msg) => {
    const texte = msg?.Content?.Message?.find(
      (m) => m.MessageType === "SHORT_MESSAGE",
    )?.MessageText?.value;

    return {
      texte,
      canal: msg?.InfoChannelRef?.value,
      valideJusqua: msg?.ValidUntilTime,
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
      visite?.MonitoredVehicleJourney?.DestinationName?.[0]?.value;

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
  const creneauMs = new Date(donnees.heure).getTime();
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
export function construireDonneesMeteo(previsions, meteos, villes, heuresRecherchees) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
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
        sunrise: meteos[heureRecherchee.villeIndex].sys.sunrise,
        sunset: meteos[heureRecherchee.villeIndex].sys.sunset,
      });
    } else {
      console.warn(`Heure ${cible} non trouvée pour ${villes[heureRecherchee.villeIndex].nom}.`);
    }
  }

  return donneesMeteo;
}

// Filtrer et trier les départs par destination
export function filtrerDeparts(trains, destinations, limite = null) {
  const resultat = trains
    .filter((train) => destinations.includes(train.destination))
    .sort((a, b) => new Date(a.heure) - new Date(b.heure));
  return limite ? resultat.slice(0, limite) : resultat;
}

// Associer les trains aux créneaux et calculer leur statut
export function enrichirCreneaux(creneaux, departsAller, departsRetour) {
  for (const creneau of creneaux) {
    if (creneau.direction === "aller") {
      creneau.trainsAller = trouverTrainsPourCreneau(departsAller, creneau.realHeure).slice(0, 2);
      creneau.statutTrain = determinerStatut(creneau.trainsAller, creneau.realHeure);
    } else if (creneau.direction === "retour") {
      creneau.trains = trouverTrainsEntre(departsRetour, creneau.realHeure, creneau.prochainCreneau).slice(0, 2);
      creneau.statutTrain = determinerStatut(creneau.trains, creneau.realHeure);
    }
  }
  return creneaux;
}