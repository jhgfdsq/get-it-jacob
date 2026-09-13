# Get It Jacob

Édition personnelle macOS Apple Silicon de [Get It](https://github.com/beltromatti/get-it), conservant son lecteur et son style visuel. Application locale, PDF à gauche, conversation à droite, connexion via l’abonnement ChatGPT.

## Utilisation

Ouvrir **Get It Jacob.app**, puis déposer un PDF. Le lecteur et son serveur interne ne présentent qu’une seule icône dans le Dock. La préparation extrait le texte intégral sur le Mac, repère localement les pages contenant des images ou des tracés et ne convertit en images que ces pages. Un seul chargement initialise ensuite la première conversation avec tout le texte et les images sources, dans l’ordre de leurs pages. Le lecteur s’ouvre lorsque tout est prêt. Les scans sans texte sont acceptés.

Le numéro de la page visible est joint à chaque question. Une page mentionnée explicitement dans la question ou un passage sélectionné est prioritaire. La conversation existante est reprise entre les messages et après redémarrage.

Faites glisser la séparation centrale pour ajuster les largeurs du PDF et du chat. Double-cliquez dessus pour revenir à la disposition initiale. Le bouton de panneau en haut à gauche du chat masque ou réaffiche la liste des discussions. Ces choix sont conservés au redémarrage.

La barre du lecteur reste visible en haut. **Discuter** ajoute le passage sélectionné au brouillon du chat. **Créer un visuel** regroupe **Graphique** et **Diagramme**. Ces actions restent grisées sans sélection de texte. La navigation, le zoom et l’ajustement à la largeur sont regroupés dans la même barre. Les visuels nécessitent une demande explicite et sont conservés dans l’onglet **Visuels**.

**Capturer** reste disponible sans sélection de texte : tracer une zone sur une page, déplacer ou redimensionner le cadre, puis choisir **Ajouter au chat**. Les captures s’accumulent en vignettes numérotées dans le brouillon. Chaque vignette peut être agrandie ou retirée. La question et toutes les captures restantes sont envoyées ensemble uniquement au clic sur **Envoyer**. Aucun appel IA n’est effectué à la capture ou à son ajout.

Les brouillons sont distincts par conversation et enregistrés avec le document, y compris les envois interrompus. Ils survivent au redémarrage de l’application. Réessayer un envoi déjà enregistré récupère sa réponse sans doubler la demande.

Après l’import, le défilement, la sélection et la réouverture ne déclenchent aucune analyse IA. Les anciens systèmes automatiques de détection, d’évaluation, de graphe de connaissances et de génération sont désactivés.

## Ce qui est conservé

Les PDF, leur texte original intégral, l’index local et les images sources des pages visuelles, les captures, les brouillons, les conversations, les visuels et les réglages résident dans `~/Library/Application Support/get-it-jacob`. Cette bibliothèque est indépendante de celle du logiciel d’origine.

La connexion existante est utilisée sans recopier ses identifiants dans le projet. Le moteur de lecture dispose d’un dossier de configuration et de conversation distinct, sans outils, plugins ou connecteurs de l’environnement de codage. Aucun moteur ancien n’est téléchargé automatiquement. Le moteur inclus dans cette construction locale est vérifié avant assemblage.

## Limites explicites

- Aucune limite imposée au nombre de pages, y compris au-delà de 200 pages. Chaque fichier peut peser jusqu’à 80 Mo. Un document très dense peut dépasser la fenêtre de contexte du modèle, auquel cas la préparation indique une erreur au lieu de masquer des pages manquantes.
- L’indexation est locale. Le chargement initial du contexte utilise l’IA et l’abonnement une fois par document. Sa durée dépend du volume et du service. Aucune durée universelle n’est garantie.
- Les images sont fournies comme sources, sans rédiger de commentaire IA pour chaque page à l’import. Leur interprétation se fait dans le chat et peut contenir des erreurs. Le PDF original reste la référence.
- Une capture est délimitée sur une seule page. Plusieurs pages peuvent être jointes dans des captures distinctes. Limite de 24 captures par message, 12 Mo par image.
- Un scan sans couche texte peut être discuté via la page courante, mais son texte ne peut pas être surligné dans le lecteur.
- Le contexte de conversation est réutilisé. Cela ne signifie pas que les messages suivants consomment zéro token.
- Cette construction personnelle est testée sur ce Mac Apple Silicon, avec signature locale. Elle n’est pas une distribution publique notarifiée pour tous les Mac.

## Développement

Node.js 22+ et npm. `npm ci`, `npm run test:reader`, `npm run lint`, `npm run build`.

Pour assembler localement, définir `GETIT_VERIFIED_CODEX_PATH` vers un exécutable officiel Codex récent signé OpenAI, puis lancer `npm run build:desktop:mac-arm`. Le script ne fournit pas de téléchargement de secours. La version obsolète 0.130.0 est refusée. Aucun identifiant, bibliothèque de test ou exécutable n’est inclus dans le dépôt Git.

Tests de captures, géométrie, persistance et reprise : `npm run test:captures`. Après le test natif de trois pages, `node scripts/test-capture-browser.mjs` contrôle les interactions sans IA, et `node scripts/test-capture-native.mjs` vérifie un véritable envoi de deux images avec ChatGPT.

Tests de protocole, préparation et schémas visuels : `npm run test:reader`. Régression des grands documents, avec un vrai PDF de 205 pages et une IA simulée : `npx tsx scripts/test-long-pdf.ts`. Créer le PDF fictif avec `node scripts/generate-reader-fixture.cjs`. Test navigateur sur serveur local avec API simulée : `node scripts/test-reader-browser.mjs`. Contrôle du serveur Mac empaqueté dans un navigateur sans fenêtre, consommant de l’IA : `node scripts/test-native.mjs`. Le contrôle natif et les essais de connexion réels nécessitent un environnement local connecté.

Le workflow de publication amont est archivé dans `docs/release-upstream.yml` et n’est pas exécuté par cette édition.

## Origine et licence

Dérivé du commit amont `ae0fa999f352b951ab8150fac5dcf9d7ab6fd9a4`, licence Apache 2.0. Voir `LICENSE`, `NOTICE` et le [README original conservé](docs/README-upstream.md). Les dépendances et moteurs conservent leurs licences respectives. Aucune affiliation ou approbation des auteurs d’origine ou d’OpenAI n’est revendiquée.

Les tests automatisés utilisent exclusivement `scripts/background-reader.mjs` et Chrome headless. Ils ne lancent pas l’application principale, n’ouvrent aucune fenêtre visible et ne prennent pas le focus.
