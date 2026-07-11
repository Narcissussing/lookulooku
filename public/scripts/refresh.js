// Met à jour le tableau de bord toutes les 60 secondes sans recharger l'iPad.
let miseAJourEnCours = false;

async function rafraichirTableauDeBord() {
  if (miseAJourEnCours) return;

  const tableauActuel = document.getElementById("dashboard-content");
  if (!tableauActuel) return;

  miseAJourEnCours = true;

  const travauxOuverts = document
    .getElementById("travaux-toggle")
    ?.classList.contains("ouvert");
  const traficOuvert = !document.getElementById("trafic-details")?.hidden;

  try {
    const response = await fetch("/", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const documentMisAJour = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    const nouveauTableau = documentMisAJour.getElementById("dashboard-content");
    if (!nouveauTableau) throw new Error("Tableau de bord introuvable");

    tableauActuel.replaceWith(nouveauTableau);

    if (travauxOuverts) {
      const boutonTravaux = document.getElementById("travaux-toggle");
      const listeTravaux = document.getElementById("travaux-liste");
      boutonTravaux?.classList.add("ouvert");
      boutonTravaux?.setAttribute("aria-expanded", "true");
      listeTravaux?.classList.add("ouvert");
    }

    if (traficOuvert) {
      const boutonTrafic = document.getElementById("trafic-toggle");
      const detailsTrafic = document.getElementById("trafic-details");
      if (boutonTrafic && detailsTrafic) {
        detailsTrafic.hidden = false;
        boutonTrafic.setAttribute("aria-expanded", "true");
      }
    }
  } catch (error) {
    console.warn("Mise à jour du tableau de bord impossible :", error.message);
  } finally {
    miseAJourEnCours = false;
  }
}

setInterval(rafraichirTableauDeBord, 1 * 60 * 1000);
