# Façade et outils Anémone JLAMP24

```text
WorkbenchView.scala (Laminar) → WorkbenchClient.scala (DTO Scala typés)
→ LocalServer.java (HTTP/SSE) → WorkbenchFacade.java → vrai JAR JLAMP24
```

Les sources Java, les modèles et la configuration sont locaux au module.
Chaque espace UUID possède son parseur, ses AST, son Blackboard et ses scènes.
Les cinq outils partagent ce contexte, séparé de l’éditeur simple et des démos.
Le verrou d’espace sérialise les opérations, y compris la recherche du MC.

## Boutons et appels réels

Les opérations HTTP sont des POST `/api/workbench/<opération>` avec le jeton
existant et `workspaceId` ; observations sur `GET /api/workbench/events?workspaceId=...`.
Le client décode les snapshots typés et écarte les réponses d’un ancien espace.

| Vue / commande | Opération de façade | Appel JLAMP24 |
| --- | --- | --- |
| Ouverture Blackboard | `create` | nouveaux `ABBlackboard`, `ABSetOfScenes`, `AnimBachSimulParser` |
| Tell / Get | `tell` / `get` | `parse_stinfo`, répétitions de `ABBlackboard.tell/get` |
| Clear | `clear` | `ABBlackboard.clear_store` |
| Filter | `filter` | `parse_var_stinfo`, `selectedStoreContents` |
| Unfilter | `unfilter` | désactivation du filtre, `storeContents` |
| Ouvrir un outil / Retour | navigation Laminar | aucun pas ni fenêtre Java, même espace conservé |
| Agent interactif / Submit | `interactive-submit` | `parse_agent`, `simulAsType(AB_INTERACTIVE_SIMUL)`, `ag_first_steps` |
| Agent interactif / Refresh | `interactive-refresh` | `ag_first_steps` |
| Agent interactif / commande disponible | `interactive-step` | `run_selected` sur le chemin marqué par le moteur, puis `ag_first_steps` |
| Agent autonome / Submit | `auto-submit` | `parse_agent`, `simulAsType(AB_AUTONOMOUS_SIMUL)` |
| Agent autonome / Next | `auto-next` | `run_one` ; propagation des règles activées après succès |
| Agent autonome / Run | `auto-run` | boucle bornée sur `run_one` |
| Abbrev | présentation de l’AST | aucun pas moteur ; la case autonome native était sans gestionnaire, ici extension d’affichage |
| Définitions / Submit | `definitions` | `parse_prgm`, `addDecls`, `addEqns`, `addSceneDecls`, `addProcDecls`, `addRuleDecls`, `PrettyPrinter*` |
| MC / Submit agent | `model-agent` | `parse_agent` |
| MC / Submit formule | `model-formula` | `parse_formula`, `PrettyPrinterFormula.translate` |
| MC / Model Check | `model-check` | `ABSimulCheckLTS.check_lts(15, agent, formule)` |
| MC / statut et trace | résultat de `model-check` | booléen et primitives retournés par le JAR |
| MC / Simulate trace | `model-trace` | `ABSimulCheckLTS.exec_primitive` pour chaque primitive retournée |
| Règles / Refresh et ouverture | `rules-refresh` | `ABRuleSimulExec.list_executable_rules` |
| Règles / sélection | état radio Laminar | aucun pas moteur |
| Apply Selected Rule | `rules-apply` | `list_executable_rules`, puis `exec_rule_selected` |
| Run Rules | `rules-run` | mêmes méthodes, choix aléatoire et boucle bornée |
| Nouvel espace / import du brouillon | `release`, `create`, soumissions | contexte neuf ; aucun stock de démo copié |
| Éditeur simple / valider | `/api/scenarios/validate` | `parse_prgm`, `parse_agent`, contexte propre |
| Éditeur simple / pas ou séquence | `/api/scenarios/step` ou `run` | `ABSimulExec.run_one` |
| Démo stock / poids, DataMatrix | `/api/events/weight`, `datamatrix` | `parse_stinfo`, `ABBlackboard.tell` ; retrait décidé par `run_one` |
| Démo température / appliquer, Run | `/api/temperature/apply`, `run` | termes transmis au Blackboard ; `run_one` décide la puissance |
| Diagnostic / Actualiser | `/api/diagnostics` | origine CodeSource des classes, store et instrumentation ; aucun pas exécuté |

## Sémantique et limites natives

- Tell/Get répètent l’opération ; multiplicité ≤ 0 : aucun effet. Get retire les
  occurrences disponibles, sans transaction tout-ou-rien. Limite Web : 1000.
- Le filtre natif (`t(?X,3), u(9)`) modifie l’affichage, jamais le store. Une erreur
  garde le filtre précédent. Les agents/règles/traces réaffichent le store complet
  comme `redisplay_store` natif, en conservant le filtre pour les Tell/Get suivants.
- `ag_first_steps` marque les commandes interactives ; l’adaptateur expose leurs
  chemins sans recalculer leur disponibilité. Un chemin périmé exige Refresh.
  Les brouillons et valeurs analysées sont distincts ; une erreur ne remplace pas
  la dernière valeur valide.
- Types de définitions : `set`/`eset`, `map`, `eqn`, `scene`, `proc`, `rule`.
  `map` est seulement un mot-clé dans la grammaire livrée, sans chargement natif.
  Les déclarations s’ajoutent au contexte ; un chargement composite n’est pas une
  transaction. Les appels de procédure ordinaires et déclarations de scène sont acceptés.
- Le MC partage les définitions et le store de l’espace. `check_lts` explore en
  modifiant des copies du store, puis le restaure avec `set_store` ; la façade
  garantit aussi cette restauration en cas d’exception. Simulate trace applique
  les primitives au store courant partagé, sans réinitialisation implicite.
  « Formula not established » reste un résultat borné, pas une preuve universelle.
  Next/Until utilisent 15 ; Reach emploie sa borne interne native 5000.
- Une règle déclarée doit être activée avec `tellr(nom)`. Seul JLAMP24 calcule ses
  instances et préconditions. `run_bb_rules` appelle Swing : son orchestration est
  adaptée autour de `list_executable_rules/exec_rule_selected`, sans matching recodé.
- Primitives ouvrant des fenêtres Java, processus Swing et stubs MC
  `exec_multi_primitive`, `exec_proc_primitive`, `exec_rule_primitive` : refus explicite.
  Aucun écran Java ni faux résultat de vérification n’est présenté.
- Run : 1..100 appels par commande ; trace : 1000 primitives ; 16 espaces ; corps
  HTTP 64 Kio et source 32768 caractères. Le temps interne d’un appel natif n’est
  pas borné. Les contextes sont en mémoire ; redémarrage/rechargement : état perdu.

Les couleurs et comportements proviennent des sources JLAMP24 inspectées :
`ab_interact.scala`, `agent_inter_interact.scala`, `agent_auto_interact.scala`,
`ab_descriptions_interact.scala`, `ab_model_checking_agent.scala`, `ab_rules_interact.scala`.
Les couleurs natives sont adaptées au style du Visualizer. Voir [la notice](JLAMP24_NOTICE.md).
