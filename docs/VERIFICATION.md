# Contrôle de l’édition personnelle

Contrôles du 13 septembre 2026 sur Mac Apple Silicon. Les contrôles initiaux portent sur des documents fictifs. La mise à jour 1.0.2 inclut aussi un essai sur le PDF signalé par l’utilisateur, conservé uniquement dans les données locales ignorées par Git.

- Compilation production Next.js et TypeScript réussies.
- ESLint : zéro erreur. Des avertissements non bloquants restent dans le code hérité.
- Tests de protocole : réponses progressives avant la fin, contexte repris, changement de page, concurrence, arrêt, erreur et absence de relance automatique.
- Tests de préparation : couverture de toutes les pages, refus des résultats incomplets/dupliqués, reprise après interruption, annulation/suppression sans recréation du document, initialisation du chat avant ouverture.
- Navigateur : sélection réelle à zoom 110 %, suivi de page, passage conservé dans le message, absence de requête IA spontanée, retry gardant la page de départ.
- Graphiques et diagrammes : structures déclaratives validées, unités et sources, valeurs connues du PDF retrouvées, arêtes de diagramme distinctes et flèches visibles.
- Connexion réelle ChatGPT : sur un PDF fictif de trois pages (texte, graphique, scan), préparation de 47,8 secondes. Premier texte des deux réponses suivantes à 2,8 et 2,9 secondes. Ce petit essai ne garantit pas les mêmes délais sur tout document.

Contrôle natif de l’application assemblée : import avec ouverture automatique en 49,6 secondes, question saisie dans l’interface sur la page scannée, réponse complète en 3,6 secondes avec les valeurs attendues. Réouverture après arrêt : conversation conservée, PDF affiché, zéro appel IA spontané et zéro erreur navigateur. La signature complète du paquet et celle du moteur ont été vérifiées.

## Incident du moteur d’origine

Le test d’aide de l’ancien exécutable npm Codex 0.130.0 a déclenché un blocage macOS. Ce moteur a été exclu de l’édition personnelle. Le binaire de remplacement provient du runtime officiel déjà installé et utilisé sur ce Mac, version `0.154.0-alpha.6.2`, signature OpenAI OpCo LLC vérifiée. Sa signature est conservée lors de l’assemblage. Aucune protection macOS n’a été désactivée et aucun fichier bloqué n’a été restauré.

## Mise à jour 1.0.1

Le lancement d’origine réutilisait l’exécutable de l’application principale pour le serveur PDF. Le chargement du rendu natif l’enregistrait comme une deuxième application Dock (politique AppKit regular). Le serveur utilise désormais le helper Electron interne déjà configuré LSUIElement. Contrôle par NSWorkspace au démarrage et pendant le chat : une seule application regular, Get It Jacob, et un serveur accessory sans icône. La politique est décrite dans la [documentation Apple LSUIElement](https://developer.apple.com/documentation/bundleresources/information-property-list/lsuielement).

La limite de 150 pages a été retirée. Régression avec PDF réel de 205 pages : import, extraction complète, rendu de 205 pages et préparation en 69 lots avec IA simulée, contexte complet avant ready. Aucun appel IA externe dans ce test. Un PDF corrompu reste refusé. La limite de 80 Mo par fichier reste indépendante du nombre de pages.

Le contrôle natif de 205 pages vérifie aussi l’admission par l’interface installable, la progression de 205 pages, puis annule explicitement la préparation de test. Les tests du chat natif utilisent un PDF distinct de 3 pages avec une vraie réponse IA.


## Mise à jour 1.0.2 : import local et contexte unique

Le blocage sur Situational Awareness provenait du parcours antérieur : rendu de toutes les pages en PNG, puis appels IA successifs par trois pages pour rédiger des notes exhaustives. Pour 165 pages, cela représentait 55 appels avant le chargement final. Les tests antérieurs de 205 pages simulaient l’IA et ne mesuraient donc pas cette latence réelle.

Le nouveau parcours conserve tout le texte extrait, inspecte localement les opérations de dessin du PDF, rend uniquement les pages visuelles en JPEG qualité 90 à 2200 pixels, puis initialise une conversation avec le texte complet et les images sources. Aucune note IA par page n’est demandée. Le statut « indexées » désigne une couverture des sources et ne prétend pas que toutes les images ont fait l’objet d’une interprétation exhaustive.

Essai réel du 13 septembre 2026 sur le fichier de 165 pages et 21 371 840 octets : 314 998 caractères extraits, 37 pages contenant des visuels et 128 pages sans rendu nécessaire. Inspection seule : 1,54 seconde. Inspection et rendu local des images : 14,05 secondes. Les 37 JPEG occupent 14,23 Mo, contre 24,97 Mo en PNG. Les chiffres et légendes du graphique de la page 8 ont été contrôlés sur le rendu JPEG.

Import complet dans une bibliothèque isolée, avec un nouveau document et un nouveau préfixe de contexte : 37,899 secondes, dont 19,085 secondes pour l’unique chargement IA. Le même parcours utilisant des PNG avait pris 78,659 secondes. Il s’agit de mesures ponctuelles, dépendantes du réseau, du modèle et du contenu. Les 37 pages visuelles ne désignent pas 37 graphiques sémantiques.

Une question réelle sur le graphique de la page affichée a retrouvé la référence GPT-4, l’échelle logarithmique et la bande de projection bleue à partir du contexte déjà initialisé. Réponse en 46,873 secondes sur ce document long : la correction de l’import ne garantit pas une réponse immédiate sur toutes les questions. L’assertion du test a été corrigée pour accepter le trait d’union insécable de la réponse, puis la réponse persistée a été vérifiée sans nouvel appel.

Régressions : classification de pages textuelles, images, scans, tableaux, courbes vectorielles et traits simples, rendu JPEG, annulation, suppression, reprise après échec du chargement initial, migration des conversations anciennes et correspondance image/page. PDF de 205 pages visuelles : tous les textes et 205 images dans un seul contexte simulé, fichier corrompu toujours refusé. TypeScript et compilation production réussis, ESLint zéro erreur (20 avertissements hérités).

Contrôle du paquet 1.0.2 en Chrome headless : préparation du PDF fictif de trois pages en 7,380 secondes, réponse correcte à la question sur le scan en 4,832 secondes, zéro erreur navigateur et zéro appel IA à la réouverture. NSWorkspace ne détecte aucun processus de test ayant une icône Dock. Le seul serveur du paquet est un helper interne avec politique accessory.

Application 1.0.2 installée dans Applications sans ouverture. Reprise du document utilisateur interrompu : 165 pages prêtes en 33,265 secondes, 37 pages visuelles, messages existants préservés, ancien état sauvegardé. Le lecteur est accessible après la reprise, sans appel IA spontané et sans application Dock de test.


## Mise à jour 1.0.3 : menus et captures pour le chat

Barre permanente hors du défilement PDF, Discuter et Créer un visuel regroupant Graphique/Diagramme. Actions texte désactivées sans sélection réelle, sélection effacée hors document. Navigation, zoom, ajustement largeur et libellés français. Réglages limités à apparence et profondeur des réponses. Compte limité à connexion, utilisation et déconnexion, avec erreurs et fermeture explicites.

Capture d’une zone d’une page à partir du rendu PDF, sans capture du bureau. Cadre déplaçable avec huit poignées, Annuler et Échap. Rendu recadré haute résolution indépendant du zoom écran, aperçu agrandissable, numérotation monotone, retrait individuel et accumulation. Les pixels sont validés côté serveur avant leur stockage local. Aucun appel IA à cette étape.

Contrôles unitaires : plusieurs images sur un contexte existant, restauration des captures historiques si le contexte doit être recréé, séparation par document, refus de chemins et images invalides, corps et dimensions bornés, nomenclature concurrente, enregistrement atomique des brouillons. Une image PNG tronquée a servi de contre-exemple et est rejetée sans attendre le décodeur. Une réponse déjà enregistrée est récupérée par son identifiant de requête sans nouvel appel IA ni doublon.

Contrôle navigateur sur le serveur empaqueté : sélection réelle au zoom, barre fixe pendant défilement, dessin/redimensionnement/déplacement du cadre, deux captures de pages distinctes, vignettes et aperçu, menus, apparence, réglage des réponses, conservation par conversation, réouverture du brouillon, annulation, retrait et envoi unique question+images. Une coupure simulée puis rechargement conserve le message, les captures, la page et l’identifiant lors de Réessayer. Une capture ajoutée pendant un envoi reste dans le brouillon suivant. Redémarrage complet du serveur et du navigateur sur un autre port : brouillon et captures retrouvés sans appel IA. Rendus contrôlés visuellement à 1280 × 820 et 1440 × 960.

Contrôle réel ChatGPT : deux images synthétiques, dont les noms et chiffres ne sont ni dans le PDF ni dans la question, ont été transmises dans un contexte déjà chargé. Le modèle a retrouvé les deux projets et leurs capacités. L’ajout des images avait laissé la conversation inchangée. La répétition du même envoi a récupéré la réponse sans doublon. Les valeurs de contrôle sont renouvelées pour chaque test.

Régression du lecteur empaqueté : PDF de trois pages comprenant un scan préparé en 7,516 secondes, réponse correcte sur le scan en 3,692 secondes, réouverture sans appel IA ni erreur navigateur. Compilation production et TypeScript réussis, ESLint zéro erreur et 20 avertissements hérités. Tous les essais sont exécutés via le helper interne et Chrome headless, sans fenêtre visible, sans activation de l’application principale et sans application Dock de test.

La version 1.0.3 installée a été contrôlée à son tour en arrière-plan : barre présente, action texte désactivée sans sélection, capture active et brouillon visuel restauré. Aucun envoi implicite. Les quatre fichiers JSON des documents utilisateur ont conservé leur empreinte SHA-256 lors du remplacement.
