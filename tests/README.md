# Tests de non-régression

Petite suite qui pilote un vrai navigateur sur `index.html` et vérifie les
chemins critiques : ce sont ceux qui ont déjà cassé au moins une fois.

## Lancer

```bash
node tests/run.cjs            # toute la suite
node tests/run.cjs texte      # seulement les fichiers dont le nom contient « texte »
```

Il faut Playwright et un Chromium. Si le binaire n'est pas à l'emplacement par
défaut :

```bash
CHROMIUM_PATH=/chemin/vers/chromium node tests/run.cjs
```

La sortie liste chaque vérification, et le script rend un code de sortie non nul
dès qu'une seule échoue — utilisable tel quel dans une intégration continue.

## Ce qui est couvert

| Fichier | Vérifie |
|---|---|
| `01-texte.cjs` | repli du texte dans une colonne, listes à puces, titres, poignées (côtés = colonne, coins = échelle), repli automatique à la frappe, raccourcis `#` et `-` |
| `02-persistance.cjs` | coût d'une action, plafond de l'historique, historique absent des sauvegardes, mutualisation des images, rechargement complet, annuler/rétablir avec images, compatibilité des fichiers antérieurs |
| `03-tampons.cjs` | recoloration d'un tampon, épaisseur, opacité du remplissage, réédition au double-clic sans duplication |
| `04-formes-et-tactile.cjs` | reconnaissance losange / rectangle / parallélogramme / triangle / cercle, lasso et suppression au doigt, isolation d'un plugin fautif, fenêtres de plugins qui tiennent en 768×1024 |
| `05-wysiwyg.cjs` | ce qui est tapé est ce qui sort : nombre de lignes, largeur, espacement, couleurs et tailles comparés entre la zone de saisie et le rendu du tableau (couleur en cours de frappe, gras, mot agrandi, mot coloré, liste, titre, réédition) |
| `06-parcours.cjs` | chaque outil de dessin, raccourcis (Ctrl+Z/Y, Suppr, Espace, Échap), pages, gestes à deux doigts (déplacer, pincer), reprise de session après rechargement |
| `07-plugins.cjs` | les 81 plugins s'ouvrent sans erreur et tiennent dans un écran de tablette ; carte disponible hors connexion |
| `08-gestes-de-classe.cjs` | dupliquer (sommets recopiés, groupes, verrou, Ctrl+D, annulation), rideau (poignées, Échap, au doigt), projecteur (déplacement, diamètre) |
| `09-interfaces.cjs` | les huit interfaces fournies (niveaux, minimale, complète, conduite de classe) : outils existants, barres qui ne se recouvrent pas, chargement effectif, suppression puis remise |
| `10-fonds-et-libelles.cjs` | fonds « cahier » et « copie d'examen » (feuille blanche sur gris clair, marge tracée pour le cahier seulement, en-tête que le cahier n'a pas, aimant sur la bonne réglure), et les libellés sous les icônes : pastille à trois états, réglage mémorisé, bloc compact, et l'affichage par défaut qui ne bouge pas |
| `11-reglages.cjs` | astuce du jour (une par jour, désactivable), roue de la date (quatre formats, heure, titre écrit à la main respecté), panneau de la barre des plugins, rangées d'icônes équilibrées, panneau d'une barre flottante au-dessus des voisines |
| `12-equations-et-gestes.cjs` | équations ax + b = cx + d dans les deux générateurs (chaque réponse est vérifiée en résolvant l'équation), niveaux filtrés par classe, appui long sur Fonds / Axes / Classes, cadrage automatique sur la feuille |
| `13-generateurs-et-drive.cjs` | molette adoucie et ancrée sous le curseur, copie d'examen quadrillée en petits carreaux, pas des graduations des axes (0,1 à 100, mémorisé), réglages retenus par le générateur d'exercices sans passer en mode « mise à jour », feuille de questions flash à la taille du contenu et colonnes équilibrées en hauteur, l'explorateur de fichiers (fenêtre déplaçable, réductible et dimensionnable dont la géométrie est retenue ; sources ordinateur et Drive ; liste ou aperçus, recherche, tri ; navigation dans les dossiers), tout ce que le tableau sait ouvrir y étant proposé (y compris un .docx mal typé et les documents Google convertis) |
| `14-aimantation.cjs` | l'aimant à trois sources : sous-menu par appui long (mémorisé, jamais tout éteint), croisements segment/droite/cercle et cercle/cercle, point posé pile sur l'intersection, aimantation au bord de la règle, tracé à main levée laissé libre ; l'outil déplacé qui se cale (point, trait, cercle), règle et équerre qui s'alignent (parallèles et perpendiculaires), pointe du compas sur le zéro de la règle, écartement pris sur un point ou lu sur les graduations ; l'équerre presque parallèle qui se colle à une droite et glisse dessus ; les trois sources affichées dans la barre du bas ; un instrument attrapable en plein tracé sans perdre l'outil en cours ; le point d'intersection qui appartient aux deux objets et les suit ; la croix comme forme de point par défaut ; la pastille d'ouverture du compas et son arc qui ne s'efface pas quand on revient sur ses pas |
| `15-documents.cjs` | ouvrir un cours écrit ailleurs : .docx (compressé) et .odt (stocké) lus sans bibliothèque, titres / gras / italique / listes / tableau à plat, Markdown et texte brut, encodage Windows rattrapé, blocs posés en colonnes et coupés aux titres, fichier illisible sans dégât, et le Ctrl+V depuis Word ou LibreOffice qui pose un bloc de texte sur le tableau |
| `16-points-de-classe.cjs` | bonus / malus / annulation, points enregistrés avec la classe, affichage en deux totaux ou en solde, seuil réglable qui donne une étoile, avatars-monstres tirés au sort par élève et personnalisables, feuille des points posée au tableau, et l'option « au plus grand » des deux générateurs |

## Ajouter un test

Créer `tests/NN-sujet.cjs` qui exporte une fonction `async (browser)` et
renvoie `rapport.bilan()` :

```js
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Mon sujet');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ... piloter la page ...
    r.verifie('ce qui doit être vrai', condition, 'détail si ça échoue');
    r.egal('valeur attendue', obtenu, attendu);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
```

`ouvrirApp(browser, { tactile: true, viewport: { width: 768, height: 1024 } })`
donne une tablette. `tableauVierge(page)` remet le tableau à zéro entre deux cas.
