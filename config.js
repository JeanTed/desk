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
  watchlist: [],                 // cryptos suivies dans la barre du haut (vide : indices et macro seulement)
  modules: {                     // false = module masqué
    plan: true, ctx: true, day: true, events: true, deriv: true, news: true,
    levels: true, opts: true, net: true,
    map: false, liq: false, movers: false, screener: false, book: false, corr: false, veille: false
  },
  layout: null,                  // disposition des blocs (réglée avec le bouton « Disposition »)
  moversMarket: "spot",          // top mouvements par défaut : "spot" ou "perp"
  moversMinVolume: 2000000,      // volume 24h minimum (en $) pour apparaître dans les tops
  liqMin: 25000,                 // liquidations affichées à partir de ce montant (en $)
  screenerPreset: "compression", // préréglage du screener au lancement
  screenerMax: 150,              // nombre de coins analysés (les plus liquides d'OKX)
  newsLang: "fr",                // "fr" = headlines traduites, "vo" = version originale
  data: "https://jeanted.github.io/desk"                       // adresse du site GitHub du Desk (robot : agenda, news crypto, FinancialJuice)
};
