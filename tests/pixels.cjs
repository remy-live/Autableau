// LIRE LES VRAIS PIXELS
//
// Toutes nos mesures de lisibilité lisent les couleurs DÉCLARÉES : la couleur
// du texte, celle du fond, et le rapport entre les deux. C'est juste tant que
// ce qui est peint est ce qui est déclaré.
//
// L'afficheur de la calculatrice a rompu ce contrat. Son résultat est découpé
// en points — c'est ce qui lui donne l'allure d'une matrice de calculatrice —
// et le découpage se fait APRÈS la couleur : la feuille de style dit toujours
// « presque noir sur vert pâle », mais la moitié de l'encre n'est plus peinte.
// Un défaut de lisibilité s'y logerait sans qu'aucune épreuve ne puisse le
// voir, et un défaut qu'aucune épreuve ne peut voir est le pire qu'on puisse
// poser.
//
// On décode donc l'image elle-même. Node sait déjà décompresser ; il ne
// manquait que la lecture du format, qui tient en quarante lignes.
const zlib = require('zlib');

// Un PNG : huit octets de signature, puis des morceaux nommés. On ne lit que
// ceux dont on a besoin — la taille, et les données.
function lirePng(donnees) {
    if (donnees.length < 8 || donnees.readUInt32BE(0) !== 0x89504e47) throw new Error('ce n\'est pas un PNG');
    let i = 8, large = 0, haut = 0, profondeur = 0, type = 0, entrelace = 0;
    const blocs = [];
    while (i < donnees.length) {
        const taille = donnees.readUInt32BE(i);
        const nom = donnees.toString('ascii', i + 4, i + 8);
        const corps = donnees.slice(i + 8, i + 8 + taille);
        if (nom === 'IHDR') {
            large = corps.readUInt32BE(0); haut = corps.readUInt32BE(4);
            profondeur = corps[8]; type = corps[9]; entrelace = corps[12];
        } else if (nom === 'IDAT') blocs.push(corps);
        else if (nom === 'IEND') break;
        i += taille + 12;
    }
    if (profondeur !== 8) throw new Error('profondeur non gérée : ' + profondeur);
    if (entrelace !== 0) throw new Error('image entrelacée : non gérée');
    const canaux = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
    if (!canaux) throw new Error('type de couleur non géré : ' + type);

    const brut = zlib.inflateSync(Buffer.concat(blocs));
    const parLigne = large * canaux;
    const pixels = Buffer.alloc(haut * parLigne);
    // CHAQUE LIGNE PORTE SON FILTRE, et se lit à partir de la précédente.
    for (let y = 0; y < haut; y++) {
        const filtre = brut[y * (parLigne + 1)];
        const source = y * (parLigne + 1) + 1;
        const sortie = y * parLigne;
        for (let x = 0; x < parLigne; x++) {
            const val = brut[source + x];
            const a = x >= canaux ? pixels[sortie + x - canaux] : 0;
            const b = y > 0 ? pixels[sortie - parLigne + x] : 0;
            const c = (x >= canaux && y > 0) ? pixels[sortie - parLigne + x - canaux] : 0;
            let ajout = 0;
            if (filtre === 1) ajout = a;
            else if (filtre === 2) ajout = b;
            else if (filtre === 3) ajout = (a + b) >> 1;
            else if (filtre === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                ajout = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            pixels[sortie + x] = (val + ajout) & 0xff;
        }
    }
    return { large, haut, canaux, pixels };
}

const lineaire = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const luminance = (r, v, b) => 0.2126 * lineaire(r) + 0.7152 * lineaire(v) + 0.0722 * lineaire(b);
const contraste = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// CE QU'ON MESURE SUR UNE IMAGE DE TEXTE :
//   — le FOND, qui est la couleur la plus fréquente ;
//   — l'ENCRE, prise sur les pixels les plus sombres, car c'est le cœur du
//     trait qui porte la lecture ;
//   — la COUVERTURE, la part de l'image que l'encre occupe : c'est elle qui
//     dit si un découpage en points a rongé les signes ou seulement dessiné
//     leur grain.
function mesurerLeTexte(donneesPng) {
    const { large, haut, canaux, pixels } = lirePng(donneesPng);
    const lums = [];
    const compte = new Map();
    for (let y = 0; y < haut; y++) {
        for (let x = 0; x < large; x++) {
            const p = (y * large + x) * canaux;
            const l = luminance(pixels[p], pixels[p + 1], pixels[p + 2]);
            lums.push(l);
            const cle = (pixels[p] >> 3) + ',' + (pixels[p + 1] >> 3) + ',' + (pixels[p + 2] >> 3);
            compte.set(cle, (compte.get(cle) || 0) + 1);
        }
    }
    let fondCle = null, fondCombien = 0;
    for (const [cle, n] of compte) if (n > fondCombien) { fondCombien = n; fondCle = cle; }
    const [fr, fv, fb] = fondCle.split(',').map(n => (Number(n) << 3) + 4);
    const lumFond = luminance(fr, fv, fb);

    const tries = lums.slice().sort((a, b) => a - b);
    // Le cœur du trait : le centile le plus sombre, moyenné, pour ne pas
    // dépendre d'un pixel isolé.
    const combienSombres = Math.max(1, Math.round(tries.length * 0.01));
    const lumEncre = tries.slice(0, combienSombres).reduce((s, v) => s + v, 0) / combienSombres;

    // Est encre tout pixel nettement plus sombre que le fond.
    const seuil = lumFond - (lumFond - lumEncre) * 0.4;
    const encrePixels = lums.filter(l => l < seuil).length;

    return {
        large, haut,
        fond: [fr, fv, fb],
        contrasteDuCoeur: contraste(lumEncre, lumFond),
        couverture: encrePixels / lums.length,
    };
}

module.exports = { lirePng, mesurerLeTexte, luminance, contraste };
