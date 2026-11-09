# Validation VERSION 2 — 20 octobre 2026

## Modèle retenu après inspection des sources Anemone

Les sources `ab_parser.scala` (eqnSpec/eqnDecl), `ab_struct_info.scala` (ab_simplify) et `ab_simulator.scala` (stinfo_simplify et run_one) confirment l’analyse et la résolution d’équations sur des termes structurés. Aucune comparaison numérique nouvelle n’est supposée.

La configuration pédagogique produit un ensemble discret de 201 températures au dixième et 201 équations Anemone. Le générateur est un outil de préparation, absent du chemin de requête. L’agent utilise le vrai `sum`, `get` et `tell`. Java ne choisit pas de puissance ; le frontend réel ne classifie pas la température.

Preuve expérimentale obtenue pour 27 °C :

```text
Pas 1 : temperature(t270) [1], choix développé par Anemone
Pas 2 : store vide, temperature(t270) consommé
Pas 3 : temperature_current(t270) [1]
        AST restant : tell(ventilation(fan(t270)))
Pas 4 : temperature_current(t270) [1], ventilation(75) [1]
```

## Tests exécutés

Compilation Java avec le JDK 8 et le JAR externe : PASS.

Serveur temporaire utilisé : 127.0.0.1:8092, distinct du port de présentation par défaut.

| Test | Résultat |
|---|---|
| experiments/api-tests.mjs : validations V1 A–I, vrai moteur, SSE, protections | PASS |
| experiments/data-source-tests.mjs : Demo stock sans réseau et indisponibilité réelle explicite | PASS |
| Initialisation température, fanPower inconnu avant exécution | PASS |
| 15 / 20 / 21.9 °C → 0 % | PASS |
| 22 / 23.9 °C → 25 % | PASS |
| 24 / 25.9 °C → 50 % | PASS |
| 26 / 27.9 °C → 75 % | PASS |
| 28 / 30 / 35 °C → 100 % | PASS |
| Retour 24 puis 20 °C sur la même session | PASS |
| Pas à pas : mesure consommée, AST fan(t270), résultat ventilation(75) | PASS |
| Entrée rejetée pendant une pause, plage/précision/arguments contrôlés | PASS |
| Session, séquence et Blackboard stock inchangés pendant les tests température | PASS |
| RESET et SSE température indépendants | PASS |
| experiments/temperature-demo-tests.mjs : montée/descente simulées sans réseau | PASS |
| Navigation réelle 01 → 02 → 01 et stock39 conservé | PASS, contrats DOM |
| Contrôles réels température depuis les gestionnaires UI → ventilation75 | PASS, contrats DOM |
| Deux modes Demo, automatique température jusqu’à 24 °C / 50 %, état stock préservé | PASS, contrats DOM |
| Quitter annulé : aucune requête d’arrêt, Bridge toujours joignable | PASS, contrats DOM + HTTP |
| Quitter confirmé : SSE fermé, Bridge inaccessible, page finale, tentative window.close | PASS, contrats DOM + HTTP |
| Route d’arrêt refusée sans POST/jeton, avec origine étrangère ou argument | PASS |
| Sortie du processus Java après arrêt HTTP | PASS, code 0 |

Les tests DOM exécutent les vrais scripts de l’application avec un petit double des API DOM et un vrai transport vers le Bridge. Ils ne prétendent pas reproduire le rendu d’un navigateur. Leur horloge accélère uniquement les temporisations visuelles ; le délai de fermeture HTTP est conservé.

## Intégrité

Empreintes vérifiées identiques aux références V1 : Anemone.bat, les deux scénarios originaux et le JAR externe. Aucun fichier de l’installation Anemone n’a été modifié ; aucune dépendance téléchargée ou installée.

Aucune commande système d’arrêt n’existe dans le chemin de fermeture : CountDownLatch, HttpServer.stop et arrêt des exécuteurs Java seulement. Le serveur temporaire s’est terminé normalement.

## Limites

La V1 conserve sa validation visuelle utilisateur. Pour la V2, l’inventaire de contrôle navigateur était vide ; aucune capture ou validation graphique supplémentaire n’a été possible. La fermeture réelle de l’onglet dépend du navigateur. La page finale sert de repli normal, sans contournement.

Les deux sessions restent en mémoire uniquement. Les limites métier de la V1 (consommation anticipée et absence de pred(0)) sont inchangées. Les seuils de température sont des paramètres de démonstration, pas une recommandation médicale.
