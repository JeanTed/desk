# DAMOUR GLOBAL · Desk Nasdaq 100 — guide pour l'agent IA

Ce fichier explique le projet à un agent IA (Claude Code ou autre) pour qu'il puisse le modifier sans rien casser.
La personne qui te parle ne sait probablement pas coder : réponds en français simple, fais les modifications toi-même, puis vérifie-les.

## Ce qu'est le projet

Un tableau de bord de trading des futures **Nasdaq 100** (plan du jour, niveaux, options, contexte de marché, news), en **un seul fichier HTML** (`index.html`), sans serveur ni clé API.
Toutes les données sont lues directement depuis le navigateur sur des API publiques (OKX, Binance, Bybit, Bitget, Hyperliquid, Deribit, Coinbase, CoinGecko, TradingView, FinancialJuice, Tree of Alpha…).
Un petit robot GitHub (`robot.mjs`) publie toutes les 10 minutes ce que le navigateur ne peut pas lire lui-même : agenda économique, copie de FinancialJuice, et les **news futures** (liste `FUT` : Bloomberg, Investing.com, Trading Economics, Maison Blanche, Réserve fédérale, CNBC, MarketWatch ; titres traduits en français ; fichier `data/futures.json`, affiché dans l'onglet « Futures » des News via `loadFutures` dans `core.js`). Pour ajouter un site : une ligne dans `FUT` (adresse du flux RSS).

## Règle d'or

- **On modifie les fichiers sources** (`page.html`, les `.js`, les `.css`, `config.js`), jamais `index.html` à la main : il est généré.
- Tous les fichiers sont à la racine du dossier (pas de sous-dossier : l'envoi de fichiers par le site GitHub ne garde pas les dossiers). Garde cette organisation.
- Après chaque modification : `node build.mjs`. Le script assemble `page.html`, les `.js` et les `.css` dans `index.html` et vérifie que le JavaScript est valide. S'il affiche une erreur, corrige-la avant de continuer.
- Pour voir le résultat : `node serve.mjs` puis ouvrir http://localhost:5173 (ou ouvrir `index.html` directement dans le navigateur).
- Après une modification visible, ouvre la page et vérifie qu'il n'y a pas d'erreur dans la console du navigateur.

## Carte des fichiers sources

| Fichier | Rôle |
|---|---|
| `config.js` | Réglages de départ : nom, sous-titre, couleur d'accent, thème, cryptos suivies, blocs affichés, adresse du robot (`data`). |
| `page.html` | Squelette de la page : barre du haut, un `<section class="mod" data-mod="…">` par bloc, fenêtres (Studio, alertes, calculateur…). |
| `style.css` | Style de base. Couleurs du thème sombre dans `:root[data-theme="dark"]`, du thème clair dans `:root[data-theme="light"]`. |
| `worlds.css` | Accueil, espaces, grille des blocs (12 colonnes), responsive, et les retouches récentes (en fin de fichier : ce sont elles qui l'emportent). |
| `core.js` | Le cœur : état partagé `CK.S`, utilitaires `CK.u` (formatage, `esc`, `safeUrl`), réseau (`fetchJSON`, `fetchText`, journal `CK.NET`), prix en direct (WebSocket), signaux (`FDEF`), agenda (`EV_FR` = traductions), news, graphiques TradingView, logo (`LOGO`), démarrage (`CK.boot`). |
| `layout.js` | Les espaces (`VIEWS`) et leurs blocs (`DEFAULTS` : ordre et largeur `w` de 1 à 12 colonnes), noms des blocs (`NAMES`), mode « Disposition ». |
| `worlds.js` | Écran d'accueil et couleur de chaque espace (`W`). |
| `day.js` | Frise « Journée de trading » : sessions, annonces, funding. |
| `signals.js` | Liste des signaux (familles dans `FAM`) et leurs explications. |
| `liqmap.js` | Carte des liquidations. |
| `plan.js` | **Plan du jour Nasdaq 100** (niveaux de la veille/nuit, murs d'options, annonces, ouverture US) et **Contexte de marché** (VIX, VXN, taux, dollar, futures, poids lourds via le scanner TradingView). |
| `pos.js` | Dérivés agrégés (open interest, funding, ratios). |
| `extra.js` | Niveaux clés, options Deribit, carnet d'ordres agrégé, alertes flash des news, corrélations. |
| `screener.js` | Screener (préréglages dans `PRESETS`, colonnes dans `COLS`). |
| `ui.js` | Studio, alertes de prix, calculateur de position, palette de commandes (Ctrl+K). |
| `net.js` | Espace « Connexions » : état en direct de chaque source (liste `SRC`). |
| `veille.js` | **L'espace « Agent »** : affichage de la lecture du marché écrite par l'agent (`lectureHTML`, `actifCol`, `jauge`, `etat`), mise à jour en direct (`majLive`), lectures précédentes (`histo`), onglets Bilan (`viewBilan`) et Conso IA (`viewConso`), cartes BTC/ETH/SOL/dollar avec graphiques et niveaux (`card`, `cardUSD`, `niveaux`), indicateur TradingView (`PINE_AUTO`). |
| `desk-news-worker.js` | **Le relais Cloudflare** (code de l'agent et des news Telegram). Il ne tourne pas dans le navigateur : il se déploie sur Cloudflare Workers (voir plus bas). Aucune clé dedans : elles sont des secrets Cloudflare. |
| `options.py` | **Robot des options sur indices** (Python, sur GitHub, à la suite de `robot.mjs`) : lit les chaînes d'options du Nasdaq 100 (via l'ETF `QQQ`, strikes convertis en points) et du S&P 500 (`^SPX`) sur Yahoo Finance avec la bibliothèque `yfinance`, calcule open interest, put/call, max pain et murs, publie `data/options.json`. Si Yahoo refuse, l'ancienne version est gardée. Affiché dans le bloc Options (`extra.js`, `loadOptionsIdx`). |
| `niveaux-desk.pine` | L'indicateur TradingView « Niveaux Desk » (Pine v5), copié par le bouton « Indicateur TradingView » du Desk. |
| `agent-manuel.md` | Ancien manuel de l'agent, **plus utilisé** (l'agent actuel a sa méthode dans le relais). Ne pas le modifier. |
| `sound.js` | Ambiances sonores et sons d'interface. |
| `bg.js` | Fond animé. |

Tout le code partage l'objet global `window.CK`. Chaque fichier est une fonction auto-exécutée qui ajoute son module (`CK.day`, `CK.map`, `CK.layout`…).

## Espaces actuels et code désactivé

Espaces visibles : Plan Futures, Journée, News, Connexions. Les espaces Signaux, Screener, Liquidations et Agent, ainsi que les blocs crypto (carnet d'ordres, corrélations, top mouvements), ont été retirés de l'affichage (`modules` à `false` dans `config.js`, absents de `VIEWS0`/`DEFAULTS` dans `layout.js`) ; leur code reste dans les fichiers mais n'est plus démarré. La section suivante décrit l'ancien agent : elle ne s'applique plus.

## L'ancien agent IA (espace retiré)

L'agent tourne sur un relais Cloudflare commun à tous les utilisateurs (`desk-news-worker.js`). Toutes les minutes, il mesure le marché (OKX, TradingView, news Telegram et Tree of Alpha, agenda) et calcule des faits (liquidations, levier, tendance, niveaux). Toutes les 30 min, juste après l'ouverture de l'Europe et de Wall Street, et tout de suite sur un événement fort (purge, gros mouvement, news majeure), une IA gratuite (Gemini, puis Groq en secours) écrit une **lecture du marché** : ce qui se passe, pourquoi, et pour chaque actif un scénario haussier et un baissier (déclencheur à au moins 0,2 % du prix, objectif à au moins 0,4 % au-delà). Le relais vérifie chaque prix cité et remplace un scénario absurde par celui du Desk.

Il suit ensuite chaque scénario comme un trade : déclenché sur une clôture 15 min au-delà du niveau, réussi si l'objectif est touché avant le stop (le niveau d'en face), noté dans le Bilan 4 h après.

Le Desk (`veille.js`) affiche :
1. la lecture en cours : titre, une ligne par actif avec le prix en direct, une jauge (le prix entre support et résistance), une phrase d'état, puis « Pourquoi », « À surveiller », « Tout change si » ;
2. les lectures précédentes, repliées ;
3. des cartes BTC, ETH, SOL et dollar avec graphiques et niveaux ;
4. les onglets « Bilan » (réussites et stops) et « Conso IA ».

Personne n'a de clé à mettre : les clés sont des secrets du relais, jamais dans le code, le Desk ou GitHub.

**Recettes**
- *Changer l'affichage de la lecture* : `lectureHTML`, `actifCol` et `jauge` dans `veille.js`, et les styles `.g13…` en fin de `worlds.css`.
- *Changer la fréquence des appels au relais* : `tgDelai()` dans `core.js` (version publique : toutes les 3 min si l'Agent ou les News sont à l'écran).
- *Avoir ton propre agent* (autres règles, autres actifs) : crée un Worker sur Cloudflare (offre gratuite), colle `desk-news-worker.js`, ajoute un espace KV nommé `DESK`, la liaison Workers AI nommée `AI`, le secret `GEMINI_KEY` (clé gratuite sur aistudio.google.com) et `GROQ_KEY` en option (console.groq.com), puis un déclencheur Cron `* * * * *`. Mets ensuite l'adresse de ton Worker dans `TG_URL` (`core.js`).

## Les news (espace « News »)

- Onglet **Tout** : toutes les sources réunies, une couleur par catégorie (`NCAT` et `newsRich` dans `core.js`, styles `.nr…` dans `worlds.css`).
- Onglet **X** : les tweets des gros comptes via Tree of Alpha (`wireParse` : listes `WACC`, `WVIP`, `WTRUMP`, `WONCH`, `WMAC` dans `core.js`) et les comptes « insiders » relayés par Telegram (liste `CHAINES` dans `desk-news-worker.js`, groupes dans `TGC` de `core.js`). Trump est aussi suivi sur Truth Social.
- Onglets Macro (FinancialJuice), Crypto et Articles.
- *Ajouter une chaîne Telegram publique* : l'ajouter dans `CHAINES` du relais (nom de la chaîne `t.me/s/NOM`), puis lui donner un groupe dans `TGC` (`core.js`).

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

**Ajouter une crypto dans la barre du haut.** `watchlist` dans `config.js` (symboles OKX, ex. "AVAX").

**Ajouter un signal.** Ajouter une entrée dans `FDEF` (`core.js`) sur le modèle des autres, puis sa clé dans `FAM` (`signals.js`) et son explication dans `CTX` (`signals.js`).

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
