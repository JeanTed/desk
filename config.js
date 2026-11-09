/* ================================================================
   CONFIG DU DESK
   Réglages de départ. Le plus simple : bouton « Studio » dans le Desk.
   Tu peux aussi les modifier ici à la main (garde les guillemets et virgules).
   ================================================================ */
window.COCKPIT_CONFIG = {
  id: "damour",                  // identifiant interne (sauvegardes du navigateur)
  name: "DAMOUR GLOBAL",       // nom affiché en haut à gauche (texte tant qu'il n'y a pas de logo image)
  tagline: "",                   // sous-titre sous le nom (vide = aucun)
  accent: "#FF8A3D",             // couleur d'accent (toute l'interface suit)
  theme: "dark",                 // affichage au premier lancement : "dark" ou "light"
  beginner: false,               // true = boutons « ? » qui expliquent chaque module
  modules: {                     // false = module masqué
    plan: true, ctx: true, day: true, events: true, deriv: false, news: true,
    levels: true, opts: true, net: true
  },
  layout: null,                  // disposition des blocs (réglée avec le bouton « Disposition »)
  newsLang: "fr",                // "fr" = headlines traduites, "vo" = version originale
  data: "https://jeanted.github.io/desk"                       // adresse du site GitHub du Desk (robot : agenda, news futures, FinancialJuice, options, prix MNQ/MES)
};
