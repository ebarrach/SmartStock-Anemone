# Validation de la version 1 — 19 octobre 2026

## Environnement réellement utilisé

- JDK Temurin 1.8.0_504, compilation du Bridge avec javac.
- Vrai JAR externe root-assembly-0.1.0-SNAPSHOT.jar (Scala 2.12.8).
- Serveur Java sur 127.0.0.1:8080, démarré aussi via bridge/start.ps1.
- Aucun téléchargement, aucune installation, aucune recompilation d’Anemone.

## Résultats automatisés

`node experiments/api-tests.mjs` : PASS

- A : stock initial réel 40.
- B : poids seul, pas de confirmation, poids consommé et continuation conservée.
- C : Data Matrix seul, pas de confirmation, stock inchangé.
- D : Data Matrix ajouté après blocage, reprise de l’AST, stock 39.
- E : second retrait sur la même session, stock 38, multiplicité de confirmation 2.
- F : état HTTP cohérent avec termes et multiplicités du Blackboard.
- I : RESET crée une nouvelle session à 40.
- INITIALISER après stock38 conserve stock38.
- Déduplication HTTP, pas à pas, refus des commandes sans jeton ou d’origine étrangère.
- Fichiers hors du répertoire web non exposés.
- Ressources frontend servies ; SSE contient stock39, stock38 et stock temporairement absent.

`node experiments/data-source-tests.mjs` : PASS

- G : Demo exécute 40 → 39 → 38 avec réseau interdit ; testé également alors que le serveur était arrêté.
- H : Anemone signale l’indisponibilité sans produire un état simulé.
- Une nouvelle identité JVM permet de reprendre avec une séquence repartie à 1.
- Les trois fichiers JavaScript passent la vérification syntaxique.

## Limite de vérification visuelle

Le contrôle navigateur a été tenté. Le navigateur intégré était indisponible et l’inventaire des navigateurs exposés était vide. Aucun rendu, clic ou animation dans un navigateur réel n’a donc été certifié. Les tests des sources de données ne remplacent pas cette inspection visuelle.

## Intégrité des références

Empreintes SHA-256 identiques avant/après développement :

| Fichier | SHA-256 |
|---|---|
| Anemone.bat | DD9DE4D50D182DDF3ACFB8044C467EA698CB9477DFD529B5D59716D0B43C1E01 |
| smartstock-procedure-original.txt | 213E03C7EC85BBEB12C0101D545D72E66994F8F33E359D4C588E93F8BF5E4A87 |
| smartstock-schema-original.txt | 0C61933B85E644A2ECC654FFD9D65A216EF0D2E34CC76BA2B237EDC740C0507A |
| JAR Anemone externe | CC64E3CF8F3FF6E00CFF4D593FEEE7B02B2AA64A1BAB39824EEE5C9D3226881B |

La version ne revendique ni persistance disque, ni validation de stock nul, ni correction de la consommation anticipée, ni intégration à un capteur physique.
