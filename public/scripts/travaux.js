const boutonTravaux = document.getElementById("travaux-toggle");
const listeTravaux = document.getElementById("travaux-liste");

if (boutonTravaux && listeTravaux) {
  boutonTravaux.addEventListener("click", () => {
    boutonTravaux.classList.toggle("ouvert");
    listeTravaux.classList.toggle("ouvert");
  });
}
