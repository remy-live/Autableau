# Mentions légales des bibliothèques fournies

« Au Tableau ! » embarque les bibliothèques ci-dessous plutôt que d'aller les
chercher sur Internet : l'application doit fonctionner en classe **sans
connexion**, et sans qu'aucune requête ne parte vers un service extérieur.

Toutes ces licences autorisent cette redistribution. Toutes exigent en
contrepartie que leurs mentions soient conservées : c'est l'objet de ce
fichier. Elles restent en vigueur pour ces bibliothèques, indépendamment de la
licence d'« Au Tableau ! » (voir `LICENSE`).

## Composition et rendu

| Bibliothèque | Version | Licence | Auteur |
|---|---|---|---|
| [MathJax](https://www.mathjax.org/) (`lib/mathjax`) | 3.2.2 | Apache-2.0 | The MathJax Consortium |
| [MathLive](https://cortexjs.io/mathlive/) (`lib/mathlive`) | 0.110.0 | MIT | Arno Gourdol / CortexJS |
| [D3](https://d3js.org/) (`lib/d3`) | 7.9.0 | ISC | Mike Bostock |

## Documents

| Bibliothèque | Version | Licence | Auteur |
|---|---|---|---|
| [pdf.js](https://mozilla.github.io/pdf.js/) (`lib/pdfjs`) | 3.11.174 | Apache-2.0 | Mozilla Foundation |
| [jsPDF](https://github.com/parallax/jsPDF) (`lib/jspdf`) | 2.5.1 | MIT | James Hall, yWorks GmbH |
| [pdf-lib](https://pdf-lib.js.org/) (`lib/pdf-lib`) | — | MIT | Andrew Dillon |
| [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (`lib/svg2pdf`) | — | MIT | yWorks GmbH |

## Stockage et divers

| Bibliothèque | Version | Licence | Auteur |
|---|---|---|---|
| [localForage](https://localforage.github.io/localForage/) (`lib/localforage`) | 1.10.0 | Apache-2.0 | Mozilla |
| `lib/qrcode/qrcode.min.js` | — | MIT | Générateur de QR codes ; l'en-tête du fichier minifié ne porte plus de mention d'auteur. À remplacer par une copie horodatée et attribuée à la prochaine mise à jour. |

## Polices

| Ressource | Licence | Auteur |
|---|---|---|
| [Nunito](https://fonts.google.com/specimen/Nunito) (`lib/fonts`) | SIL Open Font License 1.1 | Vernon Adams, Cyreal, Jacques Le Bailly |

## Données cartographiques

Le détail figure dans `lib/maps/LICENCES.md`. En résumé :

| Ressource | Licence | Auteur |
|---|---|---|
| Contours des pays — Natural Earth, via `world-atlas` | Domaine public | Natural Earth / Mike Bostock |
| Noms français, codes ISO, régions — `world-countries` | **ODbL 1.0** | Mohammed Le Doze |
| Silhouettes de pays — `mapsicon` | MIT | djaiss |

> **Attention à l'ODbL.** Les données reprises de `world-countries` restent
> sous licence ODbL 1.0, y compris à l'intérieur d'« Au Tableau ! ». Toute
> redistribution de ces données — ou d'une base qui en dérive — doit
> continuer de les proposer sous ODbL, avec mention de la source. La licence
> de l'application ne s'y substitue pas.

## Vérifier ce fichier

Les versions ci-dessus ont été relevées dans les fichiers eux-mêmes. En
remplaçant une bibliothèque, il faut mettre à jour la ligne correspondante :
une mention fausse vaut moins qu'une mention absente.
