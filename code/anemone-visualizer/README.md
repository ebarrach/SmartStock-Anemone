# Visualizer Anémone — interface Scala.js

Interface active : `src/main/scala/smartstock/Main.scala`, compilée avec Scala.js
1.22.0, Scala 2.13.18 et Laminar 17.2.1 (sbt 1.10.7). Laminar fournit la navigation
et l’éditeur réactif ; Scala.js gère aussi tous les événements des deux démos,
leurs états, les commandes HTTP, SSE, la reconnexion, les journaux et la fermeture.
Le HTML et les styles des armoires restent ceux du Visualizer conservé.
Aucun contrôleur historique `app.js`, `temperature.js` ou `shell.js` n’est chargé.

Choix : Laminar fonctionne directement dans le navigateur, sans React, bundler npm
ou serveur Node en production. La frontière HTTP conserve Scala 2.12 et le vrai
parseur JLAMP24 dans sa JVM JDK 8 ; le frontend Scala 2.13 ne charge pas son JAR.
Références : [Scala.js](https://www.scala-js.org/doc/tutorial/basic/),
[Laminar](https://laminar.dev/documentation).
Les versions sont fixées dans `build.sbt` et `project/` ; `package-lock.json`
fixe uniquement les dépendances des tests DOM. Le bundle généré est ignoré par Git
et doit être recompilé après extraction ou modification des sources.

## Lancement PowerShell

Les instances préexistantes sur 8092/8093 peuvent rester ouvertes ; utiliser 8094 pour cette extension. Dans un premier terminal :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\code\anemone-visualizer'
sbt fastLinkJS
```

Dans un deuxième terminal, JDK 8 (`java`, `javac`) dans le PATH :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone'
# Configuration personnelle locale créée lors de cette session, ignorée par Git.
. .\carnet-de-bord\visualizer\anemone.local.ps1
Set-Location '.\code\anemone-visualizer'
powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\start.ps1 -Port 8094
```

Sur une autre machine, remplacer le chargement du fichier local par
`$env:ANEMONE_JAR='CHEMIN_ABSOLU_DU_VRAI_JAR_JLAMP24'` dans ce terminal.
Ouvrir **http://127.0.0.1:8094/**. Aucun npm install n’est nécessaire au lancement.
La compilation a été vérifiée sous Temurin 8u504 ; Scala.js avertit que JDK 8
est déprécié. Pour la compilation frontend, préférer JDK 17+ lors d’une mise à jour
future ; le bridge existant conserve son JDK 8.
Arrêt : Ctrl+C dans le terminal de 8094 ou bouton Quitter de cette interface.

`bridge/start.ps1` utilise un répertoire de classes séparé dans ce module et
compile les sources Java historiques sans modifier le processus déjà sur 8092.
`smartstock.root` pointe vers les modèles historiques, `smartstock.web` vers notre
interface compilée. Les modèles canoniques sous `code/anemone-bridge/` et leurs
extensions produit sont conservés séparément.

## Scénarios utilisateur

L’onglet **Création de scénarios** contient les modèles vide, retrait et température.
Les modèles de démo ajoutent dans l’agent les `tell` nécessaires à leur état initial ;
ils ne copient aucun état mutable des démos. Charger un modèle remplace le brouillon.
Les brouillons restent présents pendant la navigation, mais ne sont pas persistés
après rechargement du navigateur. Valider repart d’un Blackboard vide.
Modifier les sources désactive l’exécution jusqu’à une nouvelle validation.

Exemple sans définitions :

```text
tell(custom(ok));get(custom(ok));tell(result(done))
```

Un pas produit `custom(ok)` ; la séquence complète produit `result(done)`.
`get(absent)` se bloque en conservant sa continuation. `tell(` remonte
`java.lang.IllegalStateException: Error in parsing agent: ...` du vrai parseur.
Aucun parseur Scala.js n’est utilisé.

`ScenarioWorkspace.java` possède, par session UUID, son propre
`AnimBachSimulParser`, `ABBlackboard`, `ABSetOfScenes`, AST et `ABSimulExec`.
`parse_prgm` fournit les déclarations/équations/scènes/procédures/règles ;
`parse_agent` construit l’AST ; seul `run_one` avance l’exécution. Une validation
échouée ne remplace pas le précédent état valide. Les erreurs conservent le message
et le type d’exception du JAR, avec la phase et la classe du parseur dans l’API.

API locale protégée par les contrôles Host/Origin et le jeton existant :

- `GET /api/scenarios/templates` : modèles versionnés.
- `POST /api/scenarios/validate` : formulaire `definitions`, `agent`, `sessionId` optionnel.
- `POST /api/scenarios/step` : formulaire `sessionId`.
- `POST /api/scenarios/run` : formulaire `sessionId`, `steps` (1..100).
- `POST /api/scenarios/release` : libération d’une session utilisateur.

Limites : corps 64 Kio, sources 32768 caractères, 16 sessions simultanées,
1000 appels `run_one` par validation. Charger un nouveau modèle libère l’ancien
contexte d’édition. Les données restent en mémoire dans cette JVM. Une séquence
bornée limite le nombre d’appels moteur, **pas** le temps interne d’un appel ni sa
récursion : cet éditeur est un laboratoire local de scénarios de confiance,
pas un bac à sable pour du code hostile. Les primitives GUI restent soumises au
mode headless de la JVM ; aucune scène graphique Swing n’est reproduite sur le Web.

Couleurs de l’éditeur : valeurs lues dans les sources locales JLAMP24,
`ab_descriptions_interact.scala` (descriptions RGB 255/204/255),
`agent_inter_interact.scala` (agent RGB 255/176/176),
`ab_interact.scala` (Current store RGB 219/242/255).
Les repères descriptions / agent / store, soumission et exécution pas à pas sont
repris. L’application Swing originale n’a pas pu être affichée ; la disposition
Web n’est donc pas présentée comme une reproduction fidèle de son écran.
Le reste de la palette et des visuels SmartStock est conservé.

## Validation

Serveur **8094** démarré ; ne jamais diriger les tests mutables vers 8092 :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\code\anemone-visualizer'
$env:SMARTSTOCK_URL='http://127.0.0.1:8094'
npm.cmd ci --ignore-scripts
npm.cmd run test:scenarios
npm.cmd test
```

`test:scenarios` vérifie le vrai parseur, agents/définitions invalides, modèles,
exécution bornée, sessions distinctes, absence de modification des deux démos,
protection du jeton et libération des contextes.
`npm.cmd test` charge **le bundle Scala.js compilé**, les événements Laminar et le HTML
dans jsdom ; HTTP et SSE interrogent le vrai moteur. Les adaptations EventSource
et dialog portent sur les API du DOM de test, jamais sur les décisions moteur.
Il vérifie stock 40→39 après blocage/reprise, ventilation 75→0, retour entre les
démos, scénario personnalisé et erreurs, modèle existant et isolation, diagnostic,
la panne/reprise HTTP/SSE sans simulation de remplacement, ainsi que l’annulation de Quitter. Il vérifie séparément les sources Demo conservées
et l’automatique de température. Ce contrôle DOM ne certifie pas le rendu navigateur.
Les tests de ce module refusent explicitement le port 8092.

La non-régression historique reste applicable. Depuis son dossier :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\method\implementation\SmartStock-Visualizer'
$env:SMARTSTOCK_URL='http://127.0.0.1:8094'
node experiments/api-tests.mjs
node experiments/temperature-api-tests.mjs
node experiments/diagnostics-tests.mjs
node experiments/data-source-tests.mjs
node experiments/temperature-demo-tests.mjs
node experiments/documentation-tests.mjs
# EN DERNIER : ce contrat historique arrête réellement 8094.
node experiments/ui-contract-tests.mjs
```

Le contrat UI historique conserve ses contrôleurs JS et son DOM de test : sa réussite
ne prouve pas la migration Scala.js. Les nouvelles interactions sont couvertes par
`npm.cmd test`. Après avoir relancé 8094, vérifier aussi la fermeture Scala.js **en dernier** :

```powershell
Set-Location 'D:\Projects\Java\SmartStock-Anemone\code\anemone-visualizer'
$env:SMARTSTOCK_URL='http://127.0.0.1:8094'
$env:TEST_SHUTDOWN='1'
npm.cmd test
Remove-Item Env:TEST_SHUTDOWN
```

Cette variante confirme la fermeture SSE, l’inaccessibilité de la JVM, la page
finale et la tentative `window.close`. Relancer ensuite 8094 pour la revue.
Le contrôle documentaire décrit les fichiers versionnables (Git), indépendamment
des fichiers IDE et des sorties de build ; aucune assertion n’a été retirée.

## Résultats du socle avant extension Blackboard (9 novembre 2026)

- Référence historique sur 8093 avant modification : six scripts passent ;
  le contrôle documentaire initialement périmé a été corrigé et passe aussi.
- Nouvelle instance : sept scripts historiques et le test des scénarios
  utilisateur passent avec le vrai JAR. Les fermetures sont testées en dernier.
- Bundle Scala.js dans jsdom : stock 40→39 après blocage/reprise, ventilation
  75→0, scénario personnalisé, erreurs du parseur pour agent/définitions,
  isolation, panne/reprise HTTP/SSE et arrêt réel confirmés.
- Simulation : sources Demo explicites, automatique thermique et conservation
  de leur état à la navigation vérifiées séparément.
- Diagnostics 8092 avant/après : mêmes identifiants moteur/session, séquences
  et compteurs `run_one`. L’instance personnelle n’a pas été modifiée.
- La recette visuelle initialement bloquée par le contrôle natif est désormais
  réalisée via Edge headless et capture contrôlée ; voir l’extension ci-dessous.

Le chemin du JAR, les relevés 8092 et le script de régression restent dans
le carnet local ignoré par Git.

## Extension Blackboard interactif

Dans **Création de scénarios**, ouvrir **Blackboard interactif**. Les cinq outils
conservent leurs brouillons au retour et partagent un store personnel. Leurs
couleurs proviennent des sources locales JLAMP24 ; aucun écran Swing n’est ouvert.
Voir [la façade, les boutons et leur sémantique native](JLAMP24_TOOLS.md) pour
le tableau exhaustif vue / client typé / opération HTTP / méthode du JAR, les
adaptations headless, la sémantique du Model Checker et les limites du moteur.

```powershell
$env:SMARTSTOCK_URL='http://127.0.0.1:8094'
npm.cmd run test:workbench
npm.cmd run test:workbench-ui
```

La recette visuelle des six vues, des deux démos, de l’éditeur simple et du diagnostic
est faite dans Edge headless via capture contrôlée. Les captures restent dans le
carnet local ignoré. La saisie de température attend le premier snapshot moteur
pour éviter qu’une réponse d’initialisation tardive écrase une saisie rapide.
