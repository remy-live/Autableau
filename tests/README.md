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
