# SmartStock — démarrage local

Commandes PowerShell depuis la racine du dépôt. Trois terminaux séparés.

## Interface Scala.js / Laminar — revue sur 8094

La nouvelle interface est dans `code/anemone-visualizer/`. Elle réutilise le vrai
bridge JVM, les scénarios historiques, les visuels et la palette SmartStock.
Les interactions des deux démos, HTTP/SSE, la navigation et l’éditeur de scénarios
sont pilotés par Scala.js. Le Visualizer historique sur **8092** reste indépendant.

Compilation, depuis PowerShell :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\code\anemone-visualizer'
sbt fastLinkJS
```

Lancement, second terminal, avec JDK 8 dans le PATH :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone'
. .\carnet-de-bord\visualizer\anemone.local.ps1
Set-Location '.\code\anemone-visualizer'
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\start.ps1 -Port 8094
```

Le fichier du carnet garde le chemin personnel du JAR récupéré dans les diagnostics
8092 ; il est ignoré par Git. Sur une autre installation, définir `ANEMONE_JAR`
avec le vrai chemin absolu au lieu de charger ce fichier local.
Ouvrir **http://127.0.0.1:8094/**. Les classes Java compilées sont séparées par port.
Les instances préexistantes 8092/8093 restent intactes ; ne pas les arrêter ou les relancer pour ces tests.
Le bundle généré est ignoré : `sbt fastLinkJS` est requis sur une copie propre.
Node/npm servent seulement aux tests, pas au démarrage de l’application.

Tests, serveur 8094 démarré :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\code\anemone-visualizer'
$env:SMARTSTOCK_URL='http://127.0.0.1:8094'
npm.cmd ci --ignore-scripts
npm.cmd run test:workbench
npm.cmd run test:workbench-ui
npm.cmd run test:scenarios
npm.cmd test
```

`test:scenarios` utilise le vrai parseur JLAMP24. `npm.cmd test` exécute le bundle
Scala.js dans jsdom avec HTTP/SSE réels et distingue les sources Demo explicites.
L’éditeur possède des sessions JVM séparées des deux démos ; les erreurs du vrai
parseur sont affichées, sans parseur réécrit dans le navigateur.
Pour vérifier aussi l’arrêt réel par la nouvelle interface, lancer **en dernier** :

```powershell
$env:TEST_SHUTDOWN='1'
npm.cmd test
Remove-Item Env:TEST_SHUTDOWN
```

Relancer 8094 pour poursuivre la revue. Le test historique `ui-contract-tests.mjs`
arrête aussi réellement son serveur : le lancer en dernier sur une instance de test,
puis relancer celle-ci avant un autre test. Ne jamais cibler 8092/8093.

Détails du choix Scala.js/Laminar, versions, couleurs issues des sources Anémone,
limites de l’éditeur et protocole de validation :
[guide du nouveau Visualizer](../code/anemone-visualizer/README.md).
Dans **Création de scénarios → Blackboard interactif**, les outils Agent interactif,
Agent autonome, Définitions, Model Checker et Rule Checker partagent le même
contexte personnel. Retour au Blackboard conserve les brouillons et la session.
L’import du brouillon de l’éditeur simple crée explicitement un espace neuf.

[Correspondance de chaque bouton avec le vrai moteur JLAMP24](../code/anemone-visualizer/JLAMP24_TOOLS.md).
Les six vues, les démos, l’éditeur simple et le diagnostic ont une recette visuelle
Edge headless via capture contrôlée ; les captures restent locales dans le carnet. Les références annoncées dans la demande
n’étaient pas jointes : leur comparaison visuelle exacte reste à faire.
Les opérations graphiques Swing et les primitives dont le vérificateur natif est
un stub sont refusées explicitement. Aucun résultat n’est simulé dans ces outils.

## Démo web Anémone historique conservée

Le Visualizer complet est conservé dans `method/implementation/SmartStock-Visualizer/`.
Il fonctionne seul : aucun agent Scala, mobile, npm install ou serveur web séparé
n'est nécessaire. `code/anemone-bridge/` est la version canonique pour le service :
sa page `/` est une page API, pas l'interface complète du Visualizer.
Conserver les deux implémentations et utiliser des ports distincts si elles tournent ensemble.

Prérequis : JDK 8 (`java` et `javac` dans le PATH), navigateur moderne et vrai JAR
Anémone JLAMP24 externe. Node.js sert uniquement aux tests existants.
Dans PowerShell, depuis cette copie du dépôt :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone'
# Remplacer ce chemin par celui du vrai JAR fourni par l'équipe.
$env:ANEMONE_JAR='D:\chemin\vers\Anemone-JLAMP24\target\scala-2.12\root-assembly-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path -LiteralPath $env:ANEMONE_JAR -PathType Leaf)) { throw "JAR Anemone introuvable : $env:ANEMONE_JAR" }
Set-Location '.\method\implementation\SmartStock-Visualizer'
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\start.ps1 -Port 8092
```

Ouvrir **http://127.0.0.1:8092/** ; conserver le mode **ANEMONE — MOTEUR RÉEL**.
Ne pas ouvrir directement `web/index.html` : une URL `file:` sélectionne le mode Demo.
Arrêter avec `Ctrl+C` ou le bouton de fermeture de l'application.
`ANEMONE_JAR` est prioritaire sur le chemin historique de `bridge/bridge.properties`.
Ne pas recopier ce chemin personnel dans une nouvelle configuration.

Le script compile le bridge avec `javac -cp $AnemoneJar`, puis lance
`java -cp <bridge/build/classes>;<JAR> smartstock.Main` avec `smartstock.root`
calculé depuis le dossier du script. `Main.java` crée les deux sessions moteur,
puis `LocalServer` sert `web/`, HTTP et SSE sur loopback.
`GET /api/diagnostics` expose `runtime.loadedClasses[].codeSource` et
`classResource` pour vérifier l'origine des classes réellement chargées ;
le chemin du fichier properties seul ne prouve pas quel JAR est utilisé.

Preuves des appels directs au moteur dans `bridge/src/main/java/smartstock/anemone/`
(chemins relatifs à chaque implémentation) :

| Parcours | Visualizer historique | Bridge canonique |
| --- | --- | --- |
| Stock | `AnemoneSession.java` : `parse_prgm(definitions)` ligne 81, `parse_agent(agentSource)` ligne 107, `engine.run_one(ast)` ligne 123 | mêmes appels lignes 94, 120, 136 |
| Température | `TemperatureEngineSession.java` : `parse_prgm(definitions)` ligne 105, `parse_agent(agent)` ligne 117, `engine.run_one(ast)` ligne 129 | mêmes appels lignes 109, 122, 134 |

Les deux sessions instancient `ab_parser.AnimBachSimulParser`, injectent déclarations
et équations dans `ABBlackboard` avec `addDecls`/`addEqns`, analysent les termes avec
`parse_stinfo`, puis exécutent `ABSimulExec`. Il n'y a pas d'analyse de sortie console.
La version canonique étend le stock initial à 0..1000 et les équations thermiques
avec `previous(p)`/hystérésis ; ses modèles et certains nombres de pas diffèrent.
Les tests historiques doivent donc cibler le serveur historique.

Dans un **second terminal**, serveur Visualizer démarré, tests existants :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\method\implementation\SmartStock-Visualizer'
$env:SMARTSTOCK_URL='http://127.0.0.1:8092'
node experiments/api-tests.mjs
node experiments/temperature-api-tests.mjs
node experiments/diagnostics-tests.mjs
node experiments/ui-contract-tests.mjs
```

Le test stock vérifie poids seul bloqué, DataMatrix tardif, retrait **40 → 39**,
puis **39 → 38**, déduplication et SSE. Le test température vérifie les puissances
**0/25/50/75/100**, les seuils, la descente et l'isolation des deux Blackboards.
Ces tests modifient les sessions de démonstration ; ne pas les lancer sur le bridge
réservé à l'agent. Les tests UI utilisent un DOM de test, pas une recette navigateur.

Contrôles sans moteur, depuis le même dossier :

```powershell
node experiments/data-source-tests.mjs
node experiments/temperature-demo-tests.mjs
node experiments/documentation-tests.mjs
```

Les deux premiers valident uniquement les sources Demo et la gestion d’indisponibilité,
jamais le JAR. Le contrôle documentaire initialement bloqué par une ancienne
arborescence a été corrigé et conserve ses assertions. Le JAR externe a été retrouvé
via les classes chargées sur 8092, puis utilisé pour reproduire les parcours réels
sur l’instance de test 8093. Son chemin reste dans le carnet local.
Depuis la racine, `python code/anemone-bridge/generate_thermal.py --check` vérifie
les équations canoniques, distinctes des modèles historiques de la démo.

## 1. Anemone — JDK 8

Prérequis : `java` et `javac` du JDK 8 dans le `PATH`, JAR Anemone fourni par l’équipe.

```powershell
cd code/anemone-bridge
$env:ANEMONE_JAR='D:/chemin/vers/root-assembly-0.1.0-SNAPSHOT.jar'
./bridge/start.ps1 -Port 8092
```

## 2. Agent/API — JDK 21 et sbt

```powershell
cd code/smartstock-agent
$env:SMARTSTOCK_ANEMONE_URL='http://127.0.0.1:8092'
sbt assembly
java -jar target/scala-2.13/smartstock-agent.jar --demo
```

- `--demo` : initialise un stockage vide avec des données simulées ; omettre pour le mode sans initialisation fictive.
- Stockage : `code/smartstock-agent/data/inventory.json` avec ces commandes.
- Autre stockage : définir `SMARTSTOCK_DATA` avant de lancer l’agent.
- État : <http://127.0.0.1:8081/api/v1/health>.
- Stock et alertes : <http://127.0.0.1:8081/api/v1/snapshot>.
- Sans Anemone : consultation disponible, aucun retrait automatique simulé en remplacement.

## 3. Mobile — Node ≥ 22.11, npm, SDK Android

```powershell
cd code/mobile-app
npm ci
npm start
```

Dans un autre terminal, même dossier :

```powershell
npm run android
```

Dans `code/mobile-app/app.json`, définir `apiBaseUrl` puis relancer l’application :

| Mode | Valeur |
| --- | --- |
| Données simulées locales | `null` |
| Émulateur Android, API du poste hôte | `"http://10.0.2.2:8081"` |
| Téléphone physique | URL HTTPS accessible de l’agent sur le réseau local |

Le transport HTTP de développement dépend de la configuration native Android.
Mode API : actualisation toutes les 5 s, bouton **Actualiser**, erreur visible et **Réessayer**.
iOS : macOS, Xcode et CocoaPods requis ; voir [mobile](../code/mobile-app/README.md).

## 4. Passerelle — Python 3

```powershell
python code/gateway/emitter.py --database "$env:TEMP/smartstock-events.sqlite" --demo
python code/gateway/emitter.py --database "$env:TEMP/smartstock-events.sqlite" --replay
```

Sans ces options : entrée JSONL sur stdin. [Déploiement Pi 3 Model B](../code/gateway/README.md).

## 5. Tests

```powershell
# Racine du dépôt
python -m pip install -r code/connectivity/requirements-test.txt
python -m unittest discover -s code/connectivity -v
python -m unittest discover -s code/gateway -v
python code/anemone-bridge/generate_thermal.py --check
```

Dans `code/smartstock-agent/`, bridge démarré :

```powershell
$env:SMARTSTOCK_ANEMONE_URL='http://127.0.0.1:8092'
sbt scalafmtCheckAll test assembly
```

Dans `code/mobile-app/` :

```powershell
npm run format:check
npm run lint -- --max-warnings 0
npm run typecheck
npm test -- --runInBand
```

Test complet API + Anemone, agent lancé avec `--demo` :

```powershell
python code/tools/integration_smoke.py --url http://127.0.0.1:8081
```

Ce test modifie le jeu de démonstration. Arrêt des services : `Ctrl+C` dans leurs terminaux.
Les capteurs, le BLE et la ventilation physique nécessitent une recette sur matériel.
Les guides officiels dans `doc/` seront rédigés par l’équipe en LaTeX.
