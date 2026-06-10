const boutonTravaux = document.getElementById("travaux-toggle");
const listeTravaux = document.getElementById("travaux-liste");

if (boutonTravaux && listeTravaux) {
  boutonTravaux.addEventListener("click", () => {
    listeTravaux.classList.toggle("ouvert");
  });
}