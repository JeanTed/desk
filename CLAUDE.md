# DAMOUR GLOBAL · Desk Nasdaq 100 — guide pour l'agent IA

Ce fichier explique le projet à un agent IA (Claude Code ou autre) pour qu'il puisse le modifier sans rien casser.
La personne qui te parle ne sait probablement pas coder : réponds en français simple, fais les modifications toi-même, puis vérifie-les.

## Ce qu'est le projet

Un tableau de bord de trading des futures **Nasdaq 100** (plan du jour, niveaux, options, contexte de marché, news), en **un seul fichier HTML** (`index.html`), sans serveur ni clé API.
Toutes les données sont lues directement depuis le navigateur sur des API publiques (OKX, Binance, Bybit, Bitget, Hyperliquid, Deribit, Coinbase, CoinGecko, TradingView, FinancialJuice, Tree of Alpha…).
Un petit robot GitHub (`robot.mjs`, `options.py`, `futpx.py`) publie toutes les 10 minutes ce que le navigateur ne peut pas lire lui-même : agenda économique, copie de FinancialJuice, et les **news futures** (liste `FUT` : Bloomberg, Investing.com, Maison Blanche, Réserve fédérale, CNBC, MarketWatch ; titres traduits en français ; fichier `data/futures.json`, affiché dans l'onglet « Futures » des News via `loadFutures` dans `core.js`). Pour ajouter un site : une ligne dans `FUT` (adresse du flux RSS). Mode application (PWA) : `manifest.webmanifest` et les icônes `icon-*.png` à la racine, copiés sur le site par le robot ; icônes tirées du logo Boucan Trading de Teddy (logo de l'en-tête : constante `LOGO` dans `core.js`).

## Règle d'or

- **On modifie les fichiers sources** (`page.html`, les `.js`, les `.css`, `config.js`), jamais `index.html` à la main : il est généré.
- Tous les fichiers sont à la racine du dossier (pas de sous-dossier : l'envoi de fichiers par le site GitHub ne garde pas les dossiers). Garde cette organisation.
- Après chaque modification : `node build.mjs`. Le script assemble `page.html`, les `.js` et les `.css` dans `index.html` et vérifie que le JavaScript est valide. S'il affiche une erreur, corrige-la avant de continuer.
- Pour voir le résultat : `node serve.mjs` puis ouvrir http://localhost:5173 (ou ouvrir `index.html` directement dans le navigateur).
- Après une modification visible, ouvre la page et vérifie qu'il n'y a pas d'erreur dans la console du navigateur.

## Carte des fichiers sources

| Fichier | Rôle |
|---|---|
| `config.js` | Réglages de départ : nom, sous-titre, couleur d'accent, thème, blocs affichés, adresse du robot (`data`). |
| `page.html` | Squelette de la page : barre du haut, un `<section class="mod" data-mod="…">` par bloc, fenêtres (Studio, alertes, calculateur…). |
| `style.css` | Style de base. Couleurs du thème sombre dans `:root[data-theme="dark"]`, du thème clair dans `:root[data-theme="light"]`. |
| `worlds.css` | Accueil, espaces, grille des blocs (12 colonnes), responsive, et les retouches récentes (en fin de fichier : ce sont elles qui l'emportent). |
| `core.js` | Le cœur : état partagé `CK.S`, utilitaires `CK.u` (formatage, `esc`, `safeUrl`), réseau (`fetchJSON`, `fetchText`, journal `CK.NET`), prix en direct (WebSocket), signaux (`FDEF`), agenda (`EV_FR` = traductions), news, graphiques TradingView, logo (`LOGO`), démarrage (`CK.boot`). |
| `layout.js` | Les espaces (`VIEWS`) et leurs blocs (`DEFAULTS` : ordre et largeur `w` de 1 à 12 colonnes), noms des blocs (`NAMES`), mode « Disposition ». |
| `worlds.js` | Écran d'accueil et couleur de chaque espace (`W`). |
| `day.js` | Frise « Journée de trading » : sessions, annonces, funding. |
| `plan.js` | **Plan du jour Nasdaq 100** (niveaux de la veille/nuit, murs d'options, annonces, ouverture US) et **Contexte de marché** (VIX, VXN, taux, dollar, futures, poids lourds via le scanner TradingView). |
| `pos.js` | Dérivés des perpétuels OKX du Nasdaq 100 et du S&P 500 (open interest, funding), avec le prix et la valeur du point MNQ/MES. |
| `extra.js` | Niveaux clés, options des indices (robot), alertes flash des news FinancialJuice. |
| `ui.js` | Studio, alertes de prix, calculateur de position, palette de commandes (Ctrl+K). |
| `net.js` | Espace « Connexions » : état en direct de chaque source (liste `SRC`). |
| `options.py` | **Robot des options sur indices** (Python, sur GitHub, à la suite de `robot.mjs`) : lit les chaînes d'options du Nasdaq 100 (via l'ETF `QQQ`, strikes convertis en points) et du S&P 500 (`^SPX`) sur Yahoo Finance avec la bibliothèque `yfinance`, calcule open interest, put/call, max pain et murs, publie `data/options.json`. Si Yahoo refuse, l'ancienne version est gardée. Affiché dans le bloc Options (`extra.js`, `loadOptionsIdx`). |
| `futpx.py` | **Robot des contrats MNQ, MES, YM (Dow) et RTY (Russell)** (Python, sur GitHub, après `options.py`) : lit les bougies de 15 min des contrats `MNQ=F` et `MES=F` sur Yahoo Finance (yfinance), calcule les mêmes niveaux que le Desk (ouvertures, veille, semaine, sessions Tokyo/Londres/New York) et l'écart avec le perpétuel OKX au même moment, publie `data/futpx.json` (dont `S` : ouverture, plus haut, plus bas, dernier prix, clôture veille et volume de la séance Globex 18 h–17 h New York, affichés par `futHTML`). YM et RTY : niveaux seuls (pas de perpétuel OKX), affichés par `dowHTML` dans le Contexte. Le Desk s'en sert tant qu'il a moins de 45 min (`CK.fut.fresh`), sinon il revient à l'estimation par l'écart contrat/indice. |
| `briefing.mjs` | **Lecture du jour** (Node, sur GitHub, après `futpx.py`) : Gemini (offre gratuite, secret GitHub `GEMINI_KEY`) lit les titres des dernières heures (`futures.json`, `fj.json`), l'agenda, les prix du jour (TradingView) et les corrélations, et écrit `data/briefing.json` (biais, titre, résumé, points, risques). Un appel par heure au plus ; sans clé, l'étape ne fait rien. Affichée dans le Contexte de marché (`briefHTML` dans `plan.js`). `futpx.py` calcule aussi les corrélations (`corr` dans `futpx.json`, affichées par `corrHTML`). |
| `sentiment.mjs` | **Sentiment des news** (Node, sur GitHub, avant `briefing.mjs`) : Alpha Vantage `NEWS_SENTIMENT` (clé gratuite, secret GitHub `ALPHAVANTAGE_KEY`, ≈ 25 appels/jour : un appel toutes les 2 h au plus) → `data/sentiment.json` (score moyen, répartition, titres). Sans clé, rien ne change. Affiché par `sentiHTML` dans `plan.js` (Contexte) et donné à Gemini dans `briefing.mjs`. |
| `resultats.py` | **Dates des résultats trimestriels** des poids lourds (Python, sur GitHub, après `futpx.py`) : Yahoo Finance (yfinance), liste `VALEURS` → `data/resultats.json` (date, BPA attendu), recalcul toutes les 6 h. Affiché par `resHTML` dans `plan.js` (Contexte, sous les poids lourds, 60 jours). |
| `marche.py` | **Robot « marché »** (Python, sur GitHub, après `resultats.py`), 4 parties indépendantes écrites dans `data/marche.json` : `cot` (positionnement des fonds, rapport TFF de la CFTC, API publique `publicreporting.cftc.gov`, codes de marché dans `COT_MARCHES`), `fng` (indice Peur & Cupidité et put/call, données publiques de CNN), `auctions` (adjudications du Trésor, `fiscaldata.treasury.gov`), `breadth` (largeur de marché Nasdaq 100 / S&P 500 via yfinance ; liste NDX dans `NDX`, liste S&P lue sur Wikipédia). Chaque partie garde sa dernière version si la source échoue ; état dans `meta.json` (`marche_cot`, `marche_fng`, `marche_auctions`, `marche_breadth`). Affichage : `cotHTML`, `fngHTML`, `brdHTML`, `aucHTML` dans `plan.js` (Contexte). Sources gratuites sans clé, usage personnel : CNN et Wikipédia ne sont pas des API officielles et peuvent changer. |
| `niveaux-desk.pine` | L'indicateur TradingView « Niveaux Desk » (Pine v5), copié par le bouton « Indicateur TradingView » du Desk. |
| `sound.js` | Ambiances sonores et sons d'interface. |
| `bg.js` | Fond animé. |

Tout le code partage l'objet global `window.CK`. Chaque fichier est une fonction auto-exécutée qui ajoute son module (`CK.day`, `CK.map`, `CK.layout`…).

## Contrats micro MNQ et MES

`CK.fut` (début de `core.js`) décrit MNQ (base NDX, 2 $ le point) et MES (base SPX, 5 $ le point), tick 0,25. Leurs niveaux = niveaux de l'indice + écart contrat/indice (`CK.fut.info`) : mesuré avec les futures NQ/ES de TradingView (`CK.fut.rows`, rempli par `loadCtx` dans `plan.js`), sinon estimé par le coût de portage jusqu'au prochain trimestriel. Quand le robot Yahoo est à jour (`futpx.py`), les niveaux MNQ/MES sont ceux du vrai contrat et l'écart vient du robot. Les boutons MNQ/MES existent dans Plan Futures, Contexte, Niveaux clés, Options et Dérivés, et le calculateur de position raisonne en contrats (MNQ, MES, NQ, ES) ; les données restent chargées sur NDX/SPX. Colonnes « Points » et « $ / contrat » dans les listes de niveaux.

## Espaces actuels

Espaces visibles : Plan Futures, Journée, News, Connexions. Il n'y a plus aucune crypto dans le Desk : le code des espaces Signaux, Screener, Liquidations et Agent, des blocs crypto (carnet d'ordres, corrélations, top mouvements, alertes de prix) et du relais Cloudflare de Captain Trading a été supprimé. Les sources restantes : OKX (perpétuels des indices US100 et SPX, uniquement pour le prix en direct), TradingView (contexte), FinancialJuice, Tree of Alpha (filtré, voir News) et le robot GitHub.

## Les news (espace « News »)

- Onglet **Tout** : toutes les sources réunies, une couleur par catégorie (`NCAT` et `newsRich` dans `core.js`, styles `.nr…` dans `worlds.css`).
- Onglet **X** : les tweets des gros comptes via Tree of Alpha (`wireParse` : listes `WACC`, `WVIP`, `WTRUMP`, `WONCH`, `WMAC` dans `core.js`). Trump est aussi suivi sur Truth Social. Tout titre qui parle de crypto est écarté par `CRYPTO_RE` (`core.js`, fonction `newsList`).
- Onglet Macro (FinancialJuice).

## Studio et espaces

Le bouton « Studio » permet de choisir les espaces affichés sur l'accueil (`espaces` dans `DEF` de `core.js`, liste `W0` de `worlds.js`, `VIEWS0` de `layout.js`). Un espace décoché disparaît de l'accueil, du menu et de la page.

## Recettes courantes

**Changer les couleurs.** Couleur d'accent : `accent` dans `config.js`. Palette complète : les variables (`--bg`, `--text`, `--up`, `--down`…) dans `style.css`. Couleur d'un espace : `col` dans la liste `W` de `worlds.js`.

**Déplacer, élargir ou retirer un bloc dans un espace.** Modifier `DEFAULTS` dans `layout.js` : l'ordre des blocs suit `y` puis `x`, la largeur est `w` (12 = pleine largeur). Augmenter aussi la constante `LAYV` (ex. "9" → "10") pour que les navigateurs oublient l'ancienne disposition enregistrée.

**Ajouter un bloc.**
1. Dans `page.html`, ajouter une section sur le modèle des autres :
   `<section class="mod" data-mod="monbloc"><header class="mhd"><span class="mno"></span><h2>Titre</h2></header><div class="card"><div id="monbloc"></div></div></section>`
2. Dans `layout.js`, ajouter `monbloc` dans `NAMES`, `MIN` et dans `DEFAULTS` de l'espace voulu.
3. Dans `core.js`, ajouter `monbloc:true` dans `modules` de `DEF`.
4. Écrire le code du bloc dans un fichier existant (ou un nouveau fichier `monbloc.js`, à ajouter dans la liste `JS` de `build.mjs`) et le démarrer depuis `CK.boot` dans `core.js`.


**Traduire une annonce de l'agenda.** Ajouter une ligne `[/texte anglais/i,"Texte français"]` au début de `EV_FR` dans `core.js`.

## Règles à respecter

- **Sécurité** : tout texte venu de l'extérieur (news, API) passe par `esc()` avant d'être inséré dans la page, et tout lien externe par `safeUrl()`. Ne jamais insérer une donnée externe brute dans `innerHTML`.
- **Pas de clé API dans le code** : le fichier est public. N'utilise que des sources qui marchent sans clé et qui autorisent les appels depuis un navigateur (en-tête CORS). Si une API refuse (erreur CORS), il faudra passer par le robot GitHub.
- **Pas de `</script>` ni de `</style>`** dans le JavaScript ou le CSS (le script de construction le refuse).
- **Noms de classes CSS** : préfère des noms précis (`monbloc-ligne`) aux noms génériques (`.past`, `.pin`, `.now`) déjà utilisés ailleurs, pour éviter les conflits.
- **Stockage navigateur** : passe par `CK.ls()` / `CK.lsj()` (préfixe commun, erreurs gérées).
- Les textes visibles sont en français.

## Le robot (optionnel)

Ici, `data` dans `config.js` pointe vers le site GitHub Pages de Teddy (`https://jeanted.github.io/desk`), qui publie les fichiers du robot.
Pour avoir ton propre robot : mets ce dossier sur ton GitHub, active GitHub Pages (Settings → Pages → Source : GitHub Actions), puis remplace `data` par `https://TON-PSEUDO.github.io/NOM-DU-DEPOT`. Le fichier `.github/workflows/desk.yml` fait tourner `robot.mjs` toutes les 10 minutes.
Le même fichier lance ensuite `options.py` (options Nasdaq 100 et S&P 500, Yahoo Finance, usage personnel) ; si cette étape échoue, le Desk est publié quand même. Les options des indices ne s'affichent que si `data` pointe vers **ton** robot : le robot de Captain Trading n'a pas ce fichier.
