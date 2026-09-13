<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tests sans interruption du bureau

Les tests automatisés ne doivent jamais ouvrir de fenêtre visible, activer Get It Jacob ou prendre le focus. Utiliser `scripts/background-reader.mjs`, qui démarre uniquement le serveur du paquet avec le helper interne et pilote Chrome headless. Ne pas lancer l’application principale via Electron, `open`, Computer Use ou un navigateur visible pour les tests. Les bibliothèques de test restent dans `work/`, séparées des documents de l’utilisateur.
