# DAMOUR GLOBAL · Desk Nasdaq 100

Tableau de bord de trading des futures **Nasdaq 100** : plan du jour, niveaux clés, options, contexte de marché (VIX, taux, dollar, poids lourds) et news en direct. Un seul fichier `index.html`, sans serveur ni clé API.

## Espaces
- **Plan Futures** : niveaux de la veille et de la nuit, murs d'options, max pain, annonces du jour, compte à rebours de l'ouverture US, contexte de marché.
- **Journée** : sessions, niveaux clés, options, agenda économique, dérivés.
- **News** : flux macro et tweets en direct.
- **Connexions** : état de chaque source de données.

## Données
Prix et niveaux : perpétuels OKX (US100, SPX). Options : robot GitHub (`options.py`, Yahoo Finance, Nasdaq 100 via QQQ). Contexte : scanner public de TradingView. Les données sont différées ; ce n'est pas un conseil en investissement.

## Modifier le Desk
Le guide pour l'agent IA est dans `CLAUDE.md`. On modifie les fichiers sources, puis `node build.mjs` régénère `index.html`.
