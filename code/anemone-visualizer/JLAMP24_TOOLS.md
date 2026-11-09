# Blackboard interactif et outils JLAMP24

Cette extension conserve les deux démos, le diagnostic et l’éditeur de scénario
simple. Elle ajoute **Création de scénarios → Blackboard interactif** et cinq
vues Web. Aucun `Frame`, `InteractiveBlackboard` ni autre écran Swing n’est créé.
Les captures mentionnées dans la demande n’étaient pas jointes ; les couleurs et
les comportements viennent des sources locales, pas d’une comparaison visuelle
avec ces captures absentes.

## Façade et contexte

```mermaid
flowchart LR
  V[WorkbenchView Scala.js / Laminar] --> C[WorkbenchClient typé]
  C --> H[HTTP / SSE LocalServer]
  H --> F[WorkbenchFacade JVM]
  F --> J[Vrai JAR Anémone JLAMP24]
```

`WorkbenchClient.scala` expose des méthodes de commande et des DTO Scala
(`WorkbenchState`, `StoreTerm`, `InteractiveAction`, `ModelState`, etc.). Le JSON
dynamique est décodé dans ce client ; `WorkbenchView.scala` utilise les types Scala,
sans accès direct au moteur, au parseur ou à la sélection des pas exécutables.
Les démos existantes conservent leurs sessions HTTP/SSE et classes métier JVM.

`WorkbenchFacade.java` possède un `ABBlackboard`, un `ABSetOfScenes`, un parseur,
des AST distincts pour les agents interactif/autonome/MC et les adaptateurs moteur
par espace UUID. Les cinq outils partagent les déclarations et le store de cet
espace. Le verrou de l’espace sérialise les opérations et la recherche du Model
Checker. Les espaces personnels, l’éditeur simple et les démos sont séparés.

Le brouillon de chaque outil est conservé dans des `Var` Laminar pendant les
retours au Blackboard et les changements de rubrique SmartStock. Aucun texte
n’est soumis implicitement en naviguant. L’ouverture du Rule Checker recharge
ses règles, comme `init_rules` dans le constructeur natif.

**Importer le brouillon · espace neuf** copie explicitement les définitions et
l’agent de l’éditeur simple dans un nouvel espace : définitions soumises, agent
autonome analysé mais non exécuté. Le précédent espace Blackboard est libéré ;
la session et le brouillon de l’éditeur simple ne sont pas modifiés.
**Nouvel espace · store vide** remplace seulement le contexte Blackboard et garde
les brouillons. Rien n’est persisté après rechargement ou arrêt du serveur.

Le transport réutilise Host/Origin, le jeton HTTP existant et le serveur loopback.
Commandes : `POST /api/workbench/<opération>`, formulaire URL-encodé avec
`workspaceId` (sauf `create`). Observations :
`GET /api/workbench/events?workspaceId=<UUID>` ; snapshots `source=anemone`,
séquence et révision du store. Le client rejette les séquences anciennes et les
réponses d’un ancien contexte après un changement d’espace. Une panne est affichée
explicitement ; aucune source Demo n’existe dans ce client.

## Correspondance exhaustive des commandes

Chemins natifs relatifs à `src/main/scala/` dans l’installation JLAMP24.
Les méthodes ci-dessous sont celles du JAR utilisé, pas des réimplémentations.
`WorkbenchView` est la vue Scala.js pour toutes les lignes ; les noms de méthodes
client correspondent à `WorkbenchClient`. Le préfixe HTTP est `/api/workbench/`.

| Vue / bouton | Méthode du client typé → opération JVM | Appel réel JLAMP24 / logique native de référence |
| --- | --- | --- |
| Blackboard / première ouverture | `open` → `create` | `new ABBlackboard`, `new ABSetOfScenes`, `new AnimBachSimulParser` ; contexte commun à la place des fenêtres créées par `ab_interact.scala:c_n_*` |
| Store / Tell | `tell` → `tell` | `parse_stinfo`, puis `ABBlackboard.tell` répété ; `ab_interact.scala:tell_on_store` |
| Store / Get | `get` → `get` | `parse_stinfo`, puis `ABBlackboard.get` répété ; `get_from_store` |
| Store / Clear | `clear` → `clear` | `ABBlackboard.clear_store` ; `clear_store` |
| Store / Filter | `filter` → `filter` | `parse_var_stinfo`, `ABBlackboard.selectedStoreContents` ; `filter_the_store` |
| Store / Unfilter | `unfilter` → `unfilter` | désactive le filtre d’affichage, `ABBlackboard.storeContents` ; `unfilter_the_store` |
| Ouvrir les cinq outils / Retour Blackboard | navigation Laminar | aucun `Frame` natif ; même UUID conservé. L’ouverture de Rule Checker appelle aussi `refreshRules` |
| Interactif / Submit | `submitInteractive` → `interactive-submit` | `parse_agent`, `ABSimulExec.simulAsType(AB_INTERACTIVE_SIMUL)`, `ag_first_steps` ; `agent_inter_interact.scala:parse_agent` |
| Interactif / Refresh | `refreshInteractive` → `interactive-refresh` | `ABSimulExec.ag_first_steps(agent, Nil)` ; `refresh_agent` |
| Interactif / commandes dynamiques | `interactiveStep` → `interactive-step` | chemins et nœuds `AB_Exec_*` produits par `ag_first_steps`, puis `run_selected` et nouveau `ag_first_steps` ; `execute_step` |
| Interactif / Abbrev | booléen de présentation | aucun pas moteur ; texte abrégé dérivé des nœuds AST natifs. Source : `abbrev_on_off` et `translate` |
| Autonome / Submit | `submitAutonomous` → `auto-submit` | `parse_agent`, `simulAsType(AB_AUTONOMOUS_SIMUL)` ; `agent_auto_interact.scala:parse_agent` |
| Autonome / Next | `next` → `auto-next` | `ABSimulExec.run_one` ; propagation des règles activées après succès, comme `execute_step` |
| Autonome / Run | `run` → `auto-run` | boucle bornée sur le même `run_one`, arrêt sur blocage/fin/limite ; adaptation de `execute_all` |
| Autonome / Abbrev | booléen de présentation | **extension de présentation Web** : la case native est créée mais n’a pas de gestionnaire dans `listenTo/reactions` |
| Définitions / Submit | `definitions` → `definitions` | `parse_prgm` ; `addDecls`, `addEqns`, `addSceneDecls`, `addProcDecls`, `addRuleDecls` ; affichage par les `PrettyPrinter*` natifs ; `ab_descriptions_interact.scala:parse_description` |
| MC / Submit agent | `submitModelAgent` → `model-agent` | `AnimBachSimulParser.parse_agent` ; `ab_model_checking_agent.scala:parse_agent` |
| MC / Submit formule | `submitFormula` → `model-formula` | `parse_formula`, `PrettyPrinterFormula.translate` ; `parse_formula` |
| MC / Model Check | `modelCheck` → `model-check` | `ABSimulCheckLTS.check_lts(15, agent, formule)` ; `model_check_formula` |
| MC / statut et trace affichée | résultat du `model-check` | booléen et liste de primitives retournés par `check_lts`, sans décision calculée dans le frontend |
| MC / Simulate trace | `simulateTrace` → `model-trace` | `ABSimulCheckLTS.exec_primitive` pour chaque `AB_AST_Primitive` retournée ; `st_execute_step` / `st_execute_all` |
| Règles / Refresh | `refreshRules` → `rules-refresh` | `ABRuleSimulExec.list_executable_rules` ; `ab_rules_interact.scala:refresh_rules` / `init_rules` |
| Règles / sélection | état radio Laminar | aucun pas moteur ; choisit un identifiant parmi les instances renvoyées par le moteur |
| Règles / Apply Selected Rule | `applyRule` → `rules-apply` | revalidation avec `list_executable_rules`, puis `exec_rule_selected` ; `apply_selected_rule` |
| Règles / Run Rules | `runRules` → `rules-run` | boucle native d’orchestration : `list_executable_rules`, choix aléatoire, `exec_rule_selected`, nouvelle liste ; adaptation de `run_rules` |
| Nouvel espace / import | `reset`, puis commandes typées d’import | nouveau contexte natif, anciens objets libérés ; aucun stock de démo copié |

`WorkbenchFacade` expose dans chaque snapshot la liste des appels instrumentés.
Cette liste aide à lire le chemin d’exécution ; les tests contrôlent aussi les
changements réels du store, les diagnostics et l’origine runtime des classes.

## Sémantique retenue après lecture des sources

- **Multiplicités** : le natif fait une boucle `1 to n`. Si `n <= 0`, aucune
  opération ; pour `Get`, les occurrences disponibles sont retirées même s’il en
  manque pour atteindre `n`. Il n’y a pas de retrait transactionnel tout-ou-rien.
  La façade adapte seulement la saisie entière et limite les répétitions à 1000.
- **Filtres** : liste de motifs natifs, par exemple `t(?X,3), u(9)`, analysée par
  `parse_var_stinfo`. La correspondance est entièrement faite par
  `selectedStoreContents` / `matchFilters` dans le JAR. Aucun terme n’est supprimé.
  Un filtre invalide conserve le précédent filtre actif. Tell/Get réaffichent
  la sélection. Les actions d’agent/règle/trace réaffichent le store complet,
  comme `InteractiveBlackboard.redisplay_store`, en conservant le filtre pour
  les Tell/Get suivants. L’interface indique cette différence.
- **Interactif** : les boutons ne sont pas une liste de primitives inventée.
  Le moteur marque l’AST via `ag_first_steps` ; l’adaptateur extrait les chemins
  marqués et `run_selected` exécute le chemin choisi. Refresh recalcule les
  disponibilités. Un chemin périmé est refusé après mutation du store.
  Le contexte initial de refresh est initialisé, au lieu du `res_agent` nul
  possible dans la fenêtre native avant le premier pas.
- **Définitions** : ordre et types du vrai `parse_prgm` : `set`/`eset`, `map`,
  `eqn`, `scene`, `proc`, `rule`. `map` est seulement un mot-clé dans la grammaire
  livrée ; `_2` n’est pas chargé par l’interface native. La façade l’indique.
  Les déclarations s’ajoutent au contexte sans vider le store. Les erreurs de
  syntaxe ne remplacent pas les précédentes valeurs analysées. Un échec lors du
  chargement de plusieurs déclarations peut laisser les ajouts déjà appliqués,
  comme dans le chargeur natif ; ce chargement n’est pas une transaction.
- **Model Checker** : le constructeur reçoit le même Blackboard et les mêmes
  scènes que les autres outils. `ab_simulator_mc.scala:check_lts` copie le store
  courant, explore en le modifiant temporairement, puis le rétablit via
  `bb.set_store(c_init_store)`. L’adaptateur sérialise l’espace et garantit aussi
  cette restauration si une exception survient. Il ne clone pas le contexte de
  définitions et n’invente pas un autre algorithme. **Simulate trace** applique
  la liste retournée au store courant partagé, sans réinitialisation implicite.
  Le statut natif « Formula not established » reste un résultat borné, pas une
  preuve d’impossibilité universelle. Next/Until utilisent la profondeur 15 ;
  Reach emploie la constante interne native `mc_depth = 5000`, même si 15 est passé.
- **Règles** : les définitions et l’activation sont distinctes.
  `ABBlackboard.tellr(nom)` active et instancie la règle. Seul le JAR calcule les
  préconditions et les instances applicables. Le post-effet est exécuté par
  `exec_rule_selected`. Run Rules conserve le choix aléatoire natif.

## Adaptations headless et limites explicites

`ABRuleSimulExec.run_bb_rules` rappelle `InteractiveBlackboard.redisplay_store`
via Swing. Il n’est donc **jamais appelé** ici. Son orchestration et celle de
`InteractiveRuleAgent.run_rules` sont adaptées en une petite boucle autour des
mêmes méthodes moteur `list_executable_rules` / `exec_rule_selected` ; aucun
matching de règle, post-effet ni vérificateur n’est recodé.
La propagation des règles de l’agent autonome passe par cette même adaptation.
Les temporisations et threads d’animation Swing sont remplacés par HTTP/SSE.

Les primitives de scènes graphiques et de création de processus natifs
(`AB_Prim_Type_Scene`, `AB_Prim_Type_Proc`, post-effets de règle `AB_SPC_ELM`)
sont refusées avec une erreur explicite : leurs chemins appellent l’affichage
Java. Les **déclarations** de scènes et les appels de procédure ordinaires comme
`Paint` sont acceptés. Aucun rendu graphique de scène n’est présenté comme réalisé.

Dans `ABSimulCheckLTS`, `exec_multi_primitive`, `exec_proc_primitive` et
`exec_rule_primitive` sont des stubs (`true` / « To be implemented »).
La façade refuse ces primitives pour le MC plutôt que de présenter ce retour
comme une vérification. L’éditeur simple historique conserve son propre périmètre
et n’est pas annoncé comme un adaptateur graphique complet de JLAMP24.

Les Run sont limités à 1..100 appels par commande ; une limite atteinte est
annoncée, jamais affichée comme une fin. Le maximum d’espaces est 16, le corps
HTTP 64 Kio, chaque source 32768 caractères, une trace simulée 1000 primitives.
Ces limites ne bornent pas le temps interne d’un appel natif ni une récursion
pathologique : c’est un laboratoire local de scénarios de confiance.

## Validation reproductible

Voir `method/DEMARRAGE.md` pour les commandes depuis la racine. Tests du module,
serveur de test **8094** démarré et vrai JAR configuré :

```powershell
$env:SMARTSTOCK_URL='http://127.0.0.1:8094'
npm.cmd run test:workbench
npm.cmd run test:workbench-ui
npm.cmd run test:scenarios
npm.cmd test
```

- `workbench-api-tests.mjs` : multiplicité/filtre, pas interactifs, agents
  autonomes, définitions (dont scène déclarée), procédures, formules Reach/Next/
  Until, trace native, limites de capacités, règles et isolation.
- `workbench-ui-tests.mjs` : **bundle Scala.js compilé** dans jsdom avec HTTP/SSE
  réels, tous les boutons et retours, champs invalides, brouillons, import et
  changement de contexte. Aucune simulation de moteur.
- Les tests existants du Visualizer restent présents. Leurs contrôles Demo sont
  distingués des tests JAR. Les scripts qui arrêtent le serveur sont exécutés
  en dernier sur l’instance de test, jamais sur 8093.
- Recette Edge headless via capture navigateur contrôlée : panneau bleu, agent
  interactif avec commande disponible, agent autonome après Next/Run, définitions
  soumises, MC avec résultat et trace, Rule Checker avec règle activée sélectionnée.
  La recette couvre aussi le retrait 40→39, la ventilation 75→0, le diagnostic
  et l’éditeur simple. La saisie attend le snapshot initial pour éviter une
  course de chargement ; ce cas est testé avec réponse HTTP initiale retardée.
  Captures et relevés restent dans `carnet-de-bord/visualizer/tools/` (ignoré).

Les captures absentes de la demande restent nécessaires pour une comparaison
pixel à pixel avec ces références. Aucun JAR ni source d’interpréteur tiers n’est incorporé.


Résultat de la passe finale : `sbt fastLinkJS`, quatre scripts du module et sept
scripts historiques réussis, contrôle thermique canonique réussi, dix captures
Edge conservées localement sans erreur de console dans les parcours finaux.
L’instance 8094 a ensuite été relancée pour la revue ; les identifiants, séquences
et compteurs de l’instance préexistante 8093 sont restés identiques.
