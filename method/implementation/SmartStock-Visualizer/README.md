# SMARTSTOCK VISUALIZER

Version 2 locale : deux démonstrations médicales pédagogiques, exécutées par le **véritable moteur Anemone**, avec navigation sans rechargement et arrêt propre de SmartStock.

## Architecture

```text
Navigateur (HTML / CSS / JavaScript)
          │ commandes HTTP / snapshots SSE
Bridge Java, JVM persistante, 127.0.0.1
          │ appels directs au JAR externe
AnimBachSimulParser → ABBlackboard → ABSimulExec.run_one
```

Le Bridge ne calcule pas de prédécesseur et ne décide pas de la confirmation. Il charge les définitions Anemone et exécute l’AST Anemone. Un seul thread `anemone-owner` possède le Blackboard, l’AST et le moteur. Chaque pas produit un snapshot indépendant ; les connexions HTTP/SSE ne parcourent jamais directement la map mutable Anemone.

## Documentation et preuve du moteur

Commencer par **[notes/DOCUMENTATION-INDEX.txt](notes/DOCUMENTATION-INDEX.txt)** puis **[notes/ARCHITECTURE-SMARTSTOCK.txt](notes/ARCHITECTURE-SMARTSTOCK.txt)** : arborescence réelle, points d’appel Java, chemin des commandes et procédure de défense.

Les nouveaux tutoriels `anemone-scenarios/smartstock-procedure-datamatrix.txt` et `smartstock-procedure-temperature.txt` contiennent les définitions complètes pour reconstruire les scénarios manuellement dans la GUI Anemone. Les schémas correspondants donnent une vue rapide. Les originaux historiques restent intacts.

**Sidebar → SYSTÈME → Diagnostic moteur** appelle uniquement **GET `/api/diagnostics`**. Cette rubrique interroge toujours le vrai Bridge, même après un mode Demo. Elle n’a pas de source simulée.

Le diagnostic sépare :

- **Configuration** : chemin déclaré dans `bridge/bridge.properties`, qui peut différer du classpath choisi par IntelliJ ou un paramètre de lancement.
- **Runtime** : version JVM, headless effectif, `CodeSource`, ressource `.class` et chargeur des véritables classes chargées.
- **Sessions** : classes des instances, identité du Blackboard, ensembles/membres et nombre d’équations réellement lus, état courant, appels `run_one` et dernier AST avant/après avec son résultat.

Consulter cette page ne fait pas avancer les agents. Les compteurs mesurent les appels du Bridge à `run_one`, pas les récursions internes ou les primitives de la bibliothèque. Ils incluent les retours `false`, persistent après RESET et repartent à zéro au redémarrage JVM. Le dernier appel peut appartenir à la session précédant un RESET : son identifiant est conservé pour éviter toute confusion. Avant le premier agent, le moteur instancié est explicitement absent. Les deux sessions sont lues successivement, pas dans une transaction globale.

L’origine des classes, les vrais appels et les changements de store constituent ensemble la preuve technique ; un simple nom de classe ou le mode Demo ne suffit pas. Le diagnostic n’est pas un traçage exhaustif des opérations internes de la bibliothèque.

Tests supplémentaires : `node experiments/diagnostics-tests.mjs` (serveur démarré) et `node experiments/documentation-tests.mjs`. Ce dernier contrôle les archives par SHA-256, les blocs copiables et le relevé d’arborescence. Après un ajout de fichiers légitime, mettre à jour les rôles dans le guide puis utiliser `node experiments/documentation-tests.mjs --refresh-tree` pour rafraîchir le relevé réel.

Une instance de Blackboard persiste **par démonstration**. Stock et température possèdent chacun leur thread propriétaire, leur AST, leur moteur, leur session et leur historique SSE. Seul **RESET** crée une nouvelle session pour la démonstration concernée. `INITIALISER` est idempotent : il ne remet jamais silencieusement le stock à 40.

## DÉMONSTRATIONS

La sidebar permanente contient un registre de démonstrations. Le contenu principal change sans ouvrir une autre page. La sélection Anemone/Demo est conservée séparément pour chaque démonstration. Revenir sur une démonstration retrouve la session réelle persistante ou l’état Demo local, sans mélange des Blackboards.

### 01 — Gestion intelligente du stock

La Démo 1 conserve les contrôles poids, Data Matrix, RUN, pas à pas, reset, animations, journal et mode Demo autonome de la V1. Les routes V1 restent compatibles. Le scénario réel et la conservation de l’AST bloqué sont inchangés.

### 02 — Régulation intelligente de température

Le slider et le champ numérique règlent une **entrée simulée**, de 15.0 à 35.0 °C au dixième. **APPLIQUER TEMPÉRATURE** transmet cette mesure au moteur. **RUN** exécute l’agent ; **PAS À PAS** permet d’observer les quatre étapes. Les ventilateurs représentent uniquement la puissance reçue ; leur accélération et ralentissement sont interpolés visuellement à partir de cette puissance, jamais de la température.

**SEUILS DE DÉMONSTRATION : paramètres pédagogiques configurables, pas des recommandations médicales ou pharmaceutiques.**

| Température | Ventilation |
|---|---:|
| < 22 °C | 0 % |
| 22 à < 24 °C | 25 % |
| 24 à < 26 °C | 50 % |
| 26 à < 28 °C | 75 % |
| ≥ 28 °C | 100 % |

La politique est centralisée dans **`config/temperature-policy.json`**. Pour changer plage, seuils, température initiale ou séquence automatique : modifier ce fichier, puis exécuter depuis la racine :

```powershell
node experiments/generate-temperature-scenario.mjs
```

Puis redémarrer SmartStock. Ce script de préparation génère les fichiers de scénario Anemone, les métadonnées et les paramètres d’affichage/Demo. Il ne s’exécute pas dans le Bridge et ne prend aucune décision pendant une requête. Les fichiers générés sont déjà fournis : Node.js n’est pas nécessaire pour démarrer l’application. Ne pas modifier les copies générées à la main. Le Bridge vérifie les empreintes de la politique et des définitions ; une politique modifiée sans régénération provoque un message explicite au démarrage.

#### Modèle réellement exécuté par Anemone

Les températures sont représentées par des atomes : `t270` signifie 27.0 °C. L’ensemble `Temperatures` contient les 201 valeurs de `t150` à `t350`. La table d’équations Anemone contient notamment `fan(t200)=0`, `fan(t230)=25`, `fan(t250)=50`, `fan(t270)=75` et `fan(t300)=100`.

L’agent connecté est :

```text
sum q in Temperatures: get(temperature(q));tell(temperature_current(q));tell(ventilation(fan(q)))
```

Les quatre pas observés :

1. Anemone développe le choix sur les valeurs de Temperatures.
2. Anemone sélectionne la branche dont le `get(temperature(q))` réussit et consomme la mesure.
3. Anemone publie `temperature_current(q)` pour conserver la mesure traitée.
4. Anemone résout `fan(q)` par ses équations et publie le vrai terme `ventilation(...)`.

Le Java ne classifie jamais la température et ne publie jamais `ventilation`. Il encode le dixième de degré, valide la plage, remplace les anciens termes de télémétrie lors d’une nouvelle mesure, exécute l’AST et lit la puissance dans le store. L’application refuse une nouvelle mesure en cours d’exécution/pause : terminer l’agent ou RESET avant de remplacer l’entrée.

La température affichée est la dernière mesure appliquée, conservée comme observation même si son terme d’entrée est consommé. Le Blackboard affiche exclusivement les termes encore présents ; au pas 2, il peut être vide. Le champ `fanPower` vaut `null` tant qu’Anemone n’a pas publié sa décision. Au démarrage et après RESET, la mesure initiale est 23.0 °C, sans décision fabriquée : utiliser RUN.

En mode Demo uniquement, **DÉMO AUTOMATIQUE** joue 20 → 23 → 25 → 27 → 30 → 24 °C. Cette source simule ses résultats sans aucun accès au Bridge et affiche en permanence **DEMO — DONNÉES SIMULÉES**.

## QUITTER L’APPLICATION

Le bouton en bas de la sidebar ouvre « Voulez-vous vraiment quitter SmartStock ? ».

- **ANNULER** ferme la confirmation, sans envoyer de requête d’arrêt.
- **QUITTER** envoie uniquement `POST /api/shutdown`, protégé par le jeton local et les contrôles Host/Origin. Aucune commande système ni argument libre n’est accepté.
- Les sources ferment leurs flux SSE, le serveur HTTP ferme ses connexions, les deux sessions s’arrêtent et la JVM SmartStock se termine normalement.
- Le frontend vérifie que le service n’est plus joignable, affiche **SMARTSTOCK EST ARRÊTÉ — Vous pouvez fermer cette fenêtre**, puis tente `window.close()`. Si le navigateur refuse, la page finale reste visible. Aucune protection navigateur n’est contournée.

**Ce bouton arrête SmartStock, pas Windows ni l’ordinateur.** En page `file:` hors connexion, seule la démonstration locale est fermée ; le message final précise qu’aucun Bridge n’a été arrêté. Si l’arrêt HTTP échoue, l’interface indique l’erreur et ne prétend pas avoir fermé le service.

## Prérequis et JAR

- JDK 8 avec `java` et `javac` accessibles dans le PATH (testé avec Temurin 8u504).
- L’installation Anemone existante, sans aucune recompilation ni modification.
- Un navigateur moderne pour l’interface (JavaScript, Fetch, EventSource, AbortSignal.timeout).
- Node.js est **facultatif**, uniquement pour exécuter les tests automatisés fournis. Aucun `npm install`.

Chemin par défaut du vrai JAR, dans `bridge/bridge.properties` :

```text
D:/Users/Esteban BARRACHO/Downloads/anemone_jlamp24/Anemone-JLAMP24/target/scala-2.12/root-assembly-0.1.0-SNAPSHOT.jar
```

Pour un autre emplacement, modifier ce fichier, utiliser le paramètre `-AnemoneJar` des scripts, ou définir `ANEMONE_JAR` **dans la session PowerShell seulement**. Le JAR reste externe. Ne pas modifier `Anemone.bat` ni les scénarios `*-original.txt`.

Les scénarios connectés sont dans `anemone-scenarios/connected/`. `definitions.anemone` définit Stock et les 40 équations pred. `withdrawal.anemone` contient l’agent réel avec Data Matrix. La génération initiale du texte des équations est seulement une préparation de définitions : à l’exécution, le Bridge ne calcule ni `40 - 1` ni `39 - 1`.

## Démarrage

Depuis la racine du projet :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\start.ps1
```

Le script compile **uniquement le Bridge**, puis démarre Java en mode headless. L’option ExecutionPolicy ne s’applique qu’au processus démarré ; aucune configuration système n’est modifiée.

Ouvrir **http://127.0.0.1:8080/**. Arrêter avec **Ctrl+C** dans le terminal.

Autre port ou autre JAR :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\start.ps1 -Port 8090 -AnemoneJar "D:\chemin\Anemone.jar"
```

Compilation seule :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\build.ps1
```

Aucune dépendance téléchargée. HTTP est fourni par le JDK. `smartstock.state.Json` encode uniquement les maps/listes/valeurs simples des snapshots, avec échappement des chaînes ; les objets Scala ne sont jamais sérialisés par réflexion.

## IntelliJ IDEA

1. Ouvrir ce dossier ; le module Java et la bibliothèque externe `Anemone` sont déclarés.
2. Dans **Project Structure → Project SDK**, sélectionner le JDK 8 local, par exemple `C:\Program Files\Eclipse Adoptium\jdk-8.0.504.1-hotspot` si aucun SDK n’est encore sélectionné.
3. Vérifier **Libraries → Anemone** si le JAR a changé d’emplacement. Le chemin IntelliJ est indépendant du fichier `bridge.properties` utilisé par les scripts.
4. Choisir la configuration **SmartStock — Anemone réel**, puis Run ou Debug.
5. Ouvrir http://127.0.0.1:8080/. Le répertoire de travail doit rester la racine du projet.

La compilation IntelliJ ne modifie pas Anemone. La JVM utilise le classpath du module. Les propriétés `smartstock.root` et `smartstock.port` permettent d’ajuster racine et port.

## Mode Anemone — moteur réel

Mode par défaut via HTTP. `AnemoneDataSource` utilise exclusivement le Bridge : aucun calcul de stock ni confirmation simulée. Si le moteur ne répond plus, une erreur explicite est affichée. Les dernières données éventuellement visibles sont des observations précédentes, pas une nouvelle simulation. La lecture HTTP est retentée périodiquement et SSE tente de se reconnecter.

### Boutons

| Bouton | Action |
|---|---|
| INITIALISER | Confirmer l’initialisation déjà effectuée, conserver le stock |
| CAPTEUR POIDS | Publier une occurrence réelle de `poids_change(compresse)` |
| DATA MATRIX | Publier une occurrence réelle de `datamatrix_detecte(compresse)` |
| RUN | Analyser un nouvel agent si nécessaire, ou reprendre l’AST bloqué ; exécuter par pas |
| PAS À PAS | Un seul appel réel à `run_one` ; désactivé pendant RUN |
| DÉMO AUTOMATIQUE | Disponible exclusivement en mode Demo |
| RESET | Nouvelle session explicite, définitions rechargées, stock 40 |

Les appels moteur de RUN sont espacés de 220 ms pour rendre les états observables. Le stock `39` ou `38` affiché provient toujours du terme créé par Anemone. Entre le `get` de l’ancien stock et le `tell` du nouveau, `stock` vaut `null` et l’interface affiche `…`.

## Mode Demo — données simulées

`DemoDataSource` est totalement indépendant du Bridge. Le bandeau indique en permanence **DEMO — DONNÉES SIMULÉES** ; le panneau s’appelle **Blackboard simulé**.

Pour une démonstration sans serveur, ouvrir directement `web/index.html` dans le navigateur : le mode Demo est sélectionné explicitement au chargement d’une URL `file:`. Les scripts classiques et assets relatifs fonctionnent sans serveur ni import de modules. Choisir Anemone dans ce contexte affiche une indisponibilité ; cela ne déclenche jamais de résultats Anemone fabriqués.

**DÉMO AUTOMATIQUE** joue le récit de Deborah, les deux capteurs et la mise à jour simulée avec temporisations. Une seconde démonstration continue de 39 à 38. RESET remet la simulation à 40. Cette simulation est la seule source contenant un calcul local de diminution ; elle n’est jamais utilisée par le mode Anemone.

## Blackboard actuel et journal visuel

- **Blackboard actuel** : uniquement les termes encore présents, avec leurs multiplicités réelles en mode Anemone.
- **Indicateurs des capteurs** : observations mémorisées pendant le retrait, même après consommation des événements.
- **Journal** : historique borné des snapshots reçus. Ce n’est pas le contenu actuel du store.
- **Agent restant** : AST retourné par Anemone, accessible sous le Blackboard.

Les boîtes de l’illustration ne représentent pas une boîte par unité : le compteur est la valeur exacte. Le motif Data Matrix est illustratif, non destiné au décodage. Aucune connexion à un capteur physique n’est fournie.

## API locale

| Méthode | Route |
|---|---|
| GET | `/api/state` |
| POST | `/api/initialize` |
| POST | `/api/events/weight` |
| POST | `/api/events/datamatrix` |
| POST | `/api/run` |
| POST | `/api/step` |
| POST | `/api/reset` |
| GET | `/api/events` (SSE) |

### Routes V2

Les routes stock V1 ci-dessus restent disponibles ; leurs alias `/api/stock/...` accèdent exactement à la même session.

| Méthode | Route | Action |
|---|---|---|
| GET | `/api/temperature/state` | Snapshot température indépendant |
| GET | `/api/temperature/events` | Flux SSE température indépendant |
| POST | `/api/temperature/initialize` | Initialisation idempotente |
| POST | `/api/temperature/apply?value=27.0` | Appliquer une mesure validée au dixième |
| POST | `/api/temperature/run` | Exécuter le vrai moteur |
| POST | `/api/temperature/step` | Un pas réel |
| POST | `/api/temperature/reset` | Nouvelle session température seulement |
| POST | `/api/shutdown` | Arrêt contrôlé de SmartStock uniquement |

Le snapshot température contient `source`, `demoId`, `sessionId`, `engineInstanceId`, `sequence`, `temperature`, `temperaturePresent`, `fanPower`, `executionStatus`, `executionStep`, `blackboard`, `observations` et `remainingAgent`. Le jeton de commande s’obtient dans GET state. Les POST température utilisent les mêmes en-têtes et la même déduplication bornée que le stock, avec une signature incluant la valeur appliquée.

Les POST n’acceptent aucun corps. Les commandes de démonstration demandent `X-SmartStock-Token` (champ `csrfToken` de GET state) et un `X-Command-Id` unique ; l’arrêt demande uniquement le jeton. Les 512 derniers identifiants des commandes de démonstration sont dédupliqués ; réutiliser un identifiant avec une autre opération est refusé. Cette protection est bornée, pas une garantie durable d’exécution unique après redémarrage.

Le serveur écoute **127.0.0.1 uniquement**, contrôle Host/Origin et ne fournit aucune opération de fichier arbitraire, de code libre ou de commande système. Seules les ressources HTML/CSS/JS/SVG sous `web/` sont servies. CSP interdit scripts externes et intégration en frame. Le service est prévu pour une démonstration locale, pas pour un déploiement public.

Chaque snapshot contient source, sessionId, engineInstanceId, sequence, stock, stockStatus, weightPresent, dataMatrixPresent, confirmationMultiplicity, observations, executionId, executionStatus, executionStep, remainingAgent, blackboard et un message d’observation.

SSE conserve 128 snapshots pour reprise par Last-Event-ID, envoie un heartbeat toutes les 10 secondes et borne les clients/queues. Un client trop lent est resynchronisé ; le frontend signale les séquences manquantes. GET state reste opérationnel sans SSE. Ni un arrêt du serveur ni une reconnexion ne sont assimilés à une simulation.

## Consommation anticipée et reprise

Le scénario historique n’est pas atomique. Exemple vérifié : POIDS → RUN consomme le poids, puis s’arrête sur le Data Matrix absent. Le Bridge conserve **le même AST restant**. DATA MATRIX → RUN reprend cette continuation et peut terminer `40 → 39`. Il ne recrée pas un agent au début pour cette reprise.

En cas d’erreur moteur, la session est marquée en erreur ; aucune annulation artificielle des effets déjà produits n’est effectuée. RESET permet de repartir explicitement.

## Limites connues

- Persistance en mémoire uniquement : un arrêt de JVM perd la session ; le démarrage initialise à 40.
- Pas de correction silencieuse de la consommation anticipée, d’identification de retrait physique ou de corrélation temporelle entre capteurs.
- Les clics distincts de capteurs peuvent publier plusieurs occurrences ; seul le double traitement du même identifiant HTTP est dédupliqué.
- `pred(0)` n’est pas défini. Ne pas présenter cette version comme une gestion validée de stock nul ; le scénario Anemone devra être renforcé pour cette limite.
- Un seul produit et un seul agent courant par session. Limite de sécurité de 256 appels moteur par exécution.
- Le journal serveur et les snapshots SSE sont bornés ; une déconnexion prolongée peut perdre des étapes visuelles.
- La V1 a été validée visuellement par l’utilisateur. Pour la V2, aucun navigateur n’était exposé par l’outil de contrôle : le rendu et les nouvelles animations restent à vérifier visuellement sur le PC de présentation. Les tests des gestionnaires JavaScript ne sont pas une validation graphique.

## Tests

Démarrer le Bridge, puis depuis la racine :

```powershell
node experiments/api-tests.mjs
node experiments/data-source-tests.mjs
node experiments/temperature-api-tests.mjs
node experiments/temperature-demo-tests.mjs
```

Définir `SMARTSTOCK_URL` pour les tests : les tests V1 utilisent 8080 par défaut et les tests V2 8092 pour isoler la session de développement. Par exemple `$env:SMARTSTOCK_URL='http://127.0.0.1:8080'`.

**À exécuter en dernier** : `node experiments/ui-contract-tests.mjs`. Ce test exécute les vrais gestionnaires JavaScript avec un double de DOM minimal et le vrai Bridge : navigation, contrôles réels, modes simulés, annulation et confirmation Quitter. Il termine le serveur de test par l’API et vérifie sa fermeture. Il ne certifie pas le rendu CSS ni le comportement exact du navigateur.

Le test API réinitialise sa session de démonstration et la laisse à 40. Il vérifie le vrai moteur, l’AST bloqué repris, deux retraits sur le même Blackboard, les multiplicités, le pas à pas, SSE et les protections locales. Pour un autre port : définir `SMARTSTOCK_URL` dans la session de test.

Les tests des sources exécutent Demo avec le réseau interdit et Anemone avec un Bridge indisponible : ils vérifient l’indépendance et l’absence de repli silencieux. Ils ne remplacent pas une inspection du rendu dans un navigateur.

## Démonstration au professeur

1. Démarrer Java ; vérifier le bandeau **ANEMONE — MOTEUR RÉEL**.
2. RESET : montrer `stock(compresse,40)`.
3. CAPTEUR POIDS, puis RUN : montrer l’attente, le stock inchangé et la continuation conservée.
4. DATA MATRIX, puis RUN : montrer la confirmation et `40 → 39`.
5. Ajouter les deux événements puis utiliser PAS À PAS pour montrer consommation, `sum`, `pred(39)` et `39 → 38`.
6. Montrer les deux confirmations dans le store et distinguer journal historique / état actuel.
7. Passer explicitement en Demo, montrer le bandeau simulé et lancer DÉMO AUTOMATIQUE.

8. Choisir **02 Régulation température**, garder Anemone, appliquer 27.0 °C puis PAS À PAS : montrer `fan(t270)` dans l’AST, puis `ventilation(75)` et les ventilateurs.
9. Appliquer 20.0 °C puis RUN pour montrer l’arrêt réel à 0 %, sans recréer la session.
10. Passer la température en Demo et lancer sa séquence automatique ; rappeler que les seuils sont pédagogiques.
11. QUITTER L’APPLICATION : montrer ANNULER, puis confirmer QUITTER pour fermer le Bridge et afficher la page finale.

Les fichiers historiques et le JAR original restent inchangés.
