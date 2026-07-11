document.addEventListener("click", (event) => {
  const boutonTrafic = event.target.closest("#trafic-toggle");
  const boutonFermer = event.target.closest(".trafic-details-fermer");
  const details = document.getElementById("trafic-details");

  if (!details) return;

  if (boutonTrafic) {
    const estOuvert = details.hidden;
    details.hidden = !estOuvert;
    boutonTrafic.setAttribute("aria-expanded", String(estOuvert));
  }

  if (boutonFermer) {
    details.hidden = true;
    document.getElementById("trafic-toggle")?.setAttribute("aria-expanded", "false");
  }
});
