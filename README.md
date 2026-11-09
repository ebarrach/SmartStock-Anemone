# Anémone Visualizer

Application locale dédiée à la visualisation du vrai moteur **Anémone JLAMP24**.
Frontend Scala.js/Laminar, bridge JVM HTTP/SSE, espaces de scénarios isolés,
Blackboard interactif et cinq outils : agents interactif/autonome, définitions,
Model Checker et Rule Checker. Les démos stock et température illustrent le moteur.

## Dépendance Anémone

Après un clone, fournir soi-même le vrai JAR obtenu auprès de son ayant droit :

```text
code/Anémone/root-assembly-0.1.0-SNAPSHOT.jar
```

Le JAR est **local et ignoré par Git** : ses droits de redistribution ne sont pas
établis. Aucun téléchargement ni moteur de remplacement n’est fourni. Le lanceur
le trouve relativement à son propre dossier, quel que soit le dossier courant.
`ANEMONE_JAR` ou `-AnemoneJar` permettent une surcharge explicite facultative.
Le Diagnostic moteur affiche le **CodeSource réellement chargé**, distinct de
la configuration. La configuration locale du carnet n’est pas nécessaire.

## Démarrage PowerShell

Prérequis : `java` et `javac` du JDK 8 dans le PATH, sbt et un navigateur moderne.
Node/npm servent aux tests ; aucune dépendance npm n’est nécessaire pour servir
l’interface. La compilation Scala.js sur JDK 8 fonctionne avec un avertissement
de dépréciation de cette version de Java.

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\code\anemone-visualizer'
sbt fastLinkJS
# Pour vérifier le chemin par défaut, sans surcharge héritée du terminal :
$env:ANEMONE_JAR=''
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\start.ps1 -Port 8095
```

Ouvrir **http://127.0.0.1:8095/**. Choisir un port libre ; ne pas arrêter les autres
instances. Arrêt de cette instance : Ctrl+C ou son bouton Quitter.
Le bridge et ses modèles sont maintenant dans ce module ; aucun chemin externe
vers un ancien projet n’est utilisé. Les classes générées sont séparées par port.
Les scripts PowerShell contenant l’accent sont enregistrés en UTF-8 avec BOM pour
Windows PowerShell 5.1 ; chemins et arguments contenant des espaces sont transmis
comme des arguments distincts.

## Tests avec le vrai moteur

Lancer une **instance de test séparée** sur 8096, même commande avec `-Port 8096`.
Dans un autre terminal :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\code\anemone-visualizer'
npm.cmd ci --ignore-scripts
$env:SMARTSTOCK_URL='http://127.0.0.1:8096'
npm.cmd run test:all
```

La suite conserve onze scripts : quatre suites Scala.js/scénarios/Blackboard et
sept contrôles historiques. **Le dernier contrat UI ferme uniquement l’instance
ciblée par SMARTSTOCK_URL.** Les tests de moteur, de trace et de règles utilisent
le vrai JAR. Les tests des sources Demo simulées sont séparés et explicitement nommés.
Les anciens contrôleurs JS ne sont conservés que dans `experiments/fixtures/legacy-web/`.

Sans serveur ni JAR : `npm.cmd run test:offline` vérifie les sources Demo, les
modèles/documentation et les chemins ; cela ne prouve pas le fonctionnement du moteur.

## Architecture

```text
Scala.js/Laminar → WorkbenchClient typé → HTTP/SSE → WorkbenchFacade JVM → JLAMP24
Démo stock/température → sessions moteur JVM distinctes → même vrai JAR
```

Les entrées, la navigation et l’affichage sont côté navigateur. Le bridge adapte
les erreurs et les états ; grammaire, exécution, filtrage et vérificateurs restent
dans JLAMP24. Les cinq outils d’un espace partagent son Blackboard ; les autres
espaces et les démos restent isolés. Les brouillons survivent à la navigation,
pas au rechargement de la page ou au redémarrage du serveur.

[Outils et appels JLAMP24](code/anemone-visualizer/JLAMP24_TOOLS.md) ·
[Attribution native](code/anemone-visualizer/JLAMP24_NOTICE.md) ·
[Arborescence](structure.txt).
Pour actualiser cette dernière : `node code/anemone-visualizer/experiments/update-structure.mjs`.

Les primitives qui ouvrent des fenêtres Java et les stubs du vérificateur natif
sont refusés explicitement. Run est borné en appels, pas en durée interne d’un
appel natif. Aucun résultat simulé ne remplace le mode moteur réel.
