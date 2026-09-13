# Contrôle de l’édition personnelle

Contrôles du 13 septembre 2026 sur Mac Apple Silicon. Ils portent sur des documents fictifs de test, sans document personnel.

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
