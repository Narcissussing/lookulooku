document.addEventListener("click", (event) => {
  const boutonTravaux = event.target.closest("#travaux-toggle");
  const listeTravaux = document.getElementById("travaux-liste");
  if (!boutonTravaux || !listeTravaux) return;

  boutonTravaux.classList.toggle("ouvert");
  listeTravaux.classList.toggle("ouvert");
  boutonTravaux.setAttribute(
    "aria-expanded",
    boutonTravaux.classList.contains("ouvert"),
  );
});
