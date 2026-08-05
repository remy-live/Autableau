# Scratch Blocks — Plugin autonome

Générateur d'algorithmes façon Scratch, extrait d'Autableau (`plugin.js`) pour être réutilisable dans n'importe quel projet web.

## Contenu

| Fichier | Rôle |
|---|---|
| `scratch-plugin.js` | Le plugin complet : shim de compatibilité + classe `ScratchInterpreter` + widget `scratchBlocksTool` |
| `index.html` | Page de démo autonome (ouvrir dans un navigateur, aucun serveur requis) |

## Fonctionnalités

- Palette de blocs par catégories (Mouvement, Apparence, Sons, Événements, Contrôle, Capteurs, Opérateurs, Variables, Stylo)
- Espace de travail avec glisser-déposer et emboîtement des blocs (snap)
- Interpréteur intégré avec aperçu animé (fenêtre « Aperçu » déplaçable, exécution pas à pas ou continue, vitesse réglable)
- Styles d'affichage : Standard, Niveaux de gris, Noir & blanc (pour photocopie)
- Modèles d'algorithmes prêts à l'emploi
- Export de l'algorithme en image (mode tampon dans l'appli hôte)

## Utilisation autonome (n'importe quelle page web)

```html
<script src="scratch-plugin.js"></script>
<script>
    // Ouvre l'éditeur (fenêtre flottante ajoutée à document.body)
    PluginManager.plugins.scratchBlocksTool.openWidget();
</script>
```

C'est tout : aucune dépendance externe, aucun framework, aucun serveur.

## Intégration dans une application hôte (type Autableau)

Le shim en tête de `scratch-plugin.js` ne définit `PluginManager`, `registerPlugin`, `createStampFromSVG` et `imageCache` **que s'ils n'existent pas déjà**. Si votre application les fournit, ils sont utilisés tels quels.

Le plugin détecte automatiquement (via `typeof`) les points d'intégration facultatifs de l'hôte et les ignore s'ils sont absents :

- `setMode(mode)` — changement d'outil actif (mode tampon `scratchBlocksTool`)
- `draw()` — redessin du canvas principal
- `saveState()` — sauvegarde de l'historique (undo/redo)
- `showToast(msg)` — notifications
- `images`, `imageCache`, `nextId`, `globalZ`, `mouseLogicalPos`, `mode` — état du tableau pour poser l'algorithme en tampon

Sans ces fonctions, l'éditeur reste pleinement utilisable ; seule la fonction « Tamponner » (poser l'algorithme sur un tableau) est inopérante.

Si un élément `#plugins-grid` existe dans la page, `init()` y ajoute automatiquement un bouton d'ouverture de l'outil.

## Origine

Code extrait tel quel des lignes 17866–19834 de `plugin.js` d'Autableau (sections « PLUGIN : SCRATCH BLOCKS » et classe `ScratchInterpreter`), sans modification — seul le shim d'en-tête a été ajouté.
