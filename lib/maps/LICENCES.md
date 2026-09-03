# Fond de carte du monde (`monde.js`)

Fabriqué par `outils/construire-carte-monde.cjs`. Ne pas retoucher à la main.

## Géométrie — Natural Earth, **domaine public**

Contours des pays à l'échelle 1:50 000 000, repris du paquet
[`world-atlas`](https://github.com/topojson/world-atlas) (Mike Bostock),
lui-même dérivé de [Natural Earth](https://www.naturalearthdata.com/).

> Natural Earth est dans le domaine public. Aucune permission n'est nécessaire
> pour l'utiliser, y compris à des fins commerciales.

Les contours ont été simplifiés (Douglas-Peucker, tolérance 0,04°) et
quantifiés au centième de degré : la silhouette reste juste à l'écran d'une
classe, le fichier tient en 124 Ko.

## Noms français, codes ISO et régions — `world-countries`, ODbL

[`world-countries`](https://github.com/mledoze/countries) (Mohammed Le Doze),
sous licence **ODbL 1.0**. Seuls sont reprises, pour chaque pays : le code
ISO 3166-1 alpha-2, le nom français usuel, et la région d'appartenance.

## Silhouettes de pays (`maps.js`)

Paquet [mapsicon](https://github.com/djaiss/mapsicon), licence MIT.
