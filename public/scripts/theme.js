// =========================================================
// LOOKULOOKU — bascule de thème (Bureau ↔ Cinéma)
// =========================================================

// On lit le thème stocké, sinon "bureau" par défaut
const themeActuel = localStorage.getItem("theme") || "bureau";
document.documentElement.setAttribute("data-theme", themeActuel);

// On déclare le bouton AVANT d'utiliser la fonction qui le lit
const bouton = document.querySelector(".theme-toggle");

// On met à jour l'icône au chargement
mettreAJourBouton(themeActuel);

// Au clic, on bascule entre les deux thèmes
bouton.addEventListener("click", () => {
  const courant = document.documentElement.getAttribute("data-theme");
  const nouveau = courant === "bureau" ? "cinema" : "bureau";

  document.documentElement.setAttribute("data-theme", nouveau);
  localStorage.setItem("theme", nouveau);
  mettreAJourBouton(nouveau);
});

// Met à jour l'icône et le label du bouton selon le thème actif
function mettreAJourBouton(theme) {
  bouton.textContent = theme === "bureau" ? "🎬" : "📖";
  bouton.setAttribute(
    "aria-label",
    theme === "bureau" ? "Passer en mode Cinéma" : "Passer en mode Bureau"
  );
}