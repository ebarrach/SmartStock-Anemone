# Documentation et diagnostic Anemone

Validation du 20 octobre 2026 : six nouveaux TXT et diagnostic runtime, sans changement de logique métier.

## Preuve technique ajoutée

`GET /api/diagnostics` relève la JVM et l’origine `CodeSource`/ressource `.class` des classes réellement chargées. La configuration du fichier properties est présentée séparément. Chaque session est lue sur son thread propriétaire : classes des instances, ensemble/membres et équations chargés, snapshot actuel et dernier appel moteur.

Le compteur est incrémenté immédiatement avant l’appel effectif à `engine.run_one(ast)`. La trace conserve session, exécution, thread, date, AST avant, retour booléen et AST après. Les appels retournant `false` sont comptés. Les lectures du diagnostic ne modifient ni le store, ni la séquence, ni ce compteur.

Constats vérifiés par le test réel :

- classes chargées depuis une archive JAR, ressources `jar:...!/ab_...` ;
- ensemble Stock de 41 membres et 40 équations ;
- ensemble Temperatures de 201 membres et 201 équations ;
- moteur instancié explicitement absent avant le premier agent ;
- deux pas stock avec le poids seul : second retour `false`, continuation conservée ;
- reprise : AST `tell(stock(compresse,pred(40)))`, puis stock39 réellement lu ;
- température : AST `tell(ventilation(fan(t270)))`, puis ventilation75 réellement lue ;
- compteurs conservés après RESET et identifiants des anciennes traces distingués de la nouvelle session.

## Tests exécutés

Serveur temporaire dédié : `127.0.0.1:8092`.

| Vérification | Résultat |
|---|---|
| Compilation Java du Bridge, JAR externe inchangé | PASS |
| experiments/diagnostics-tests.mjs | PASS |
| experiments/api-tests.mjs — validations V1 réelles | PASS |
| experiments/data-source-tests.mjs | PASS |
| experiments/temperature-api-tests.mjs | PASS |
| experiments/temperature-demo-tests.mjs | PASS |
| experiments/documentation-tests.mjs | PASS |
| experiments/ui-contract-tests.mjs, incluant le diagnostic réel depuis un mode Demo | PASS |
| Fermeture HTTP/SSE et terminaison du processus | PASS, code de sortie 0 |

Le test d’interface utilise les véritables gestionnaires JavaScript, un double de DOM et un vrai transport HTTP/SSE. Le double a été complété avec l’API standard AbortController nécessaire au nouveau diagnostic. Ce n’est pas un contrôle graphique dans un navigateur.

## Cohérence documentaire

- Les originaux ont été lus intégralement, sans modification.
- Les blocs complets Stock/pred et Temperatures/fan ont été copiés des fichiers de définitions effectivement chargés, puis comparés automatiquement.
- Les agents copiables correspondent exactement aux scénarios connectés.
- Les nouveaux documents Data Matrix ne contiennent ni l’ancien événement ni l’ancien libellé de lecteur.
- Le relevé de l’arborescence est comparé au disque, avec les métadonnées Git et binaires générés volontairement non détaillés.
- Les procédures GUI distinguent leurs manipulations manuelles des exécutions headless validées ; le bouton de pas GUI est bien nommé Next dans les sources.

## Intégrité et limites

Les SHA-256 des deux TXT originaux, d’Anemone.bat et du JAR correspondent aux empreintes de référence conservées dans les validations précédentes. Aucun fichier de l’installation Anemone n’a été modifié. Aucun téléchargement ou installation de dépendance.

Le diagnostic instrumente les appels du Bridge ; il n’est pas un traçage exhaustif à l’intérieur de la bibliothèque, ni une attestation cryptographique du bytecode exécuté. Il expose les observations du processus et les résultats réels testés. Les deux sessions ne sont pas échantillonnées dans une transaction globale.

L’inventaire de contrôle visuel ne contenait aucun navigateur ni application accessible. Le rendu du nouveau panneau n’a donc pas été certifié visuellement ; ses contrôleurs ont été exécutés et testés. La validation visuelle utilisateur précédente des démonstrations reste distincte.

Le serveur temporaire a été arrêté par le test Quitter ; il ne reste pas en arrière-plan.
