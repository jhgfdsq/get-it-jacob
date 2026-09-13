# Get It Jacob

Édition personnelle macOS Apple Silicon de [Get It](https://github.com/beltromatti/get-it), conservant son lecteur et son style visuel. Application locale, PDF à gauche, conversation à droite, connexion via l’abonnement ChatGPT.

## Utilisation

Ouvrir **Get It Jacob.app**, puis déposer un PDF. La préparation examine chaque page sous forme de texte et d’image, conserve les notes visuelles, puis initialise la première conversation avec le contexte complet. Le lecteur s’ouvre lorsque tout est prêt. Les scans sans texte sont acceptés.

Le numéro de la page visible est joint à chaque question. Une page mentionnée explicitement dans la question ou un passage sélectionné est prioritaire. La conversation existante est reprise entre les messages et après redémarrage.

Sélectionner un passage affiche **Discuter**, **Expliquer**, **Graphique** et **Diagramme**. Les deux premières actions préparent un message modifiable. Les visuels nécessitent une demande explicite et sont conservés dans l’onglet **Visuels**. Les graphiques affichent aussi leurs valeurs, unités et sources.

Après l’import, le défilement, la sélection et la réouverture ne déclenchent aucune analyse IA. Les anciens systèmes automatiques de détection, d’évaluation, de graphe de connaissances et de génération sont désactivés.

## Ce qui est conservé

Les PDF, leur texte original intégral, les notes de lecture de chaque page, les conversations, les visuels et les réglages résident dans `~/Library/Application Support/get-it-jacob`. Cette bibliothèque est indépendante de celle du logiciel d’origine.

La connexion existante est utilisée sans recopier ses identifiants dans le projet. Le moteur de lecture dispose d’un dossier de configuration et de conversation distinct, sans outils, plugins ou connecteurs de l’environnement de codage. Aucun moteur ancien n’est téléchargé automatiquement. Le moteur inclus dans cette construction locale est vérifié avant assemblage.

## Limites explicites

- 150 pages maximum par document. Un document très dense peut dépasser la fenêtre de contexte du modèle, auquel cas la préparation indique une erreur au lieu de masquer des pages manquantes.
- La préparation initiale utilise l’IA et l’abonnement. Les grands PDF peuvent prendre plusieurs minutes. Aucune durée universelle n’est garantie.
- Les notes visuelles sont des interprétations et peuvent contenir des erreurs. Les chiffres peu lisibles sont signalés. Le PDF original reste la référence.
- Un scan sans couche texte peut être discuté via la page courante, mais son texte ne peut pas être surligné dans le lecteur.
- Le contexte de conversation est réutilisé. Cela ne signifie pas que les messages suivants consomment zéro token.
- Cette construction personnelle est testée sur ce Mac Apple Silicon, avec signature locale. Elle n’est pas une distribution publique notarifiée pour tous les Mac.

## Développement

Node.js 22+ et npm. `npm ci`, `npm run test:reader`, `npm run lint`, `npm run build`.

Pour assembler localement, définir `GETIT_VERIFIED_CODEX_PATH` vers un exécutable officiel Codex récent signé OpenAI, puis lancer `npm run build:desktop:mac-arm`. Le script ne fournit pas de téléchargement de secours. La version obsolète 0.130.0 est refusée. Aucun identifiant, bibliothèque de test ou exécutable n’est inclus dans le dépôt Git.

Tests de protocole, préparation et schémas visuels : `npm run test:reader`. Créer le PDF fictif avec `node scripts/generate-reader-fixture.cjs`. Test navigateur sur serveur local avec API simulée : `node scripts/test-reader-browser.mjs`. Contrôle Mac complet connecté, consommant de l’IA : `node scripts/test-native.mjs`. Le contrôle natif et les essais de connexion réels nécessitent un environnement local connecté.

Le workflow de publication amont est archivé dans `docs/release-upstream.yml` et n’est pas exécuté par cette édition.

## Origine et licence

Dérivé du commit amont `ae0fa999f352b951ab8150fac5dcf9d7ab6fd9a4`, licence Apache 2.0. Voir `LICENSE`, `NOTICE` et le [README original conservé](docs/README-upstream.md). Les dépendances et moteurs conservent leurs licences respectives. Aucune affiliation ou approbation des auteurs d’origine ou d’OpenAI n’est revendiquée.
