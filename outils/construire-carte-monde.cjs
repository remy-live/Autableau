#!/usr/bin/env node
// Fabrique le fond de carte livré avec l'application (lib/maps/monde.js).
//
// On ne le fabrique QU'UNE FOIS, ici, et le résultat est versionné : en classe
// il n'y a pas toujours de connexion, et une carte qui dépend d'un serveur
// distant est une carte qui manquera le jour où l'on en a besoin.
//
//   node outils/construire-carte-monde.cjs <dossier-des-paquets>
//
// Sources (à installer côté développement seulement) :
//   world-atlas      — géométrie Natural Earth, DOMAINE PUBLIC
//   topojson-client  — décodage du TopoJSON (ISC)
//   world-countries  — noms français, codes ISO, régions (ODbL)
//
// Le format écrit est décrit en bas de ce fichier.
const fs = require('fs');
const path = require('path');

const racine = process.argv[2] || '/tmp/geo';
const lire = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const topo = lire(path.join(racine, 'world-atlas-2.0.2/package/countries-50m.json'));
const topojson = require(path.join(racine, 'topojson-client-3.1.0/package/dist/topojson-client.js'));
const nations = lire(path.join(racine, 'world-countries-5.0.0/package/countries.json'));

// --- 1. Les continents, tels qu'on les enseigne en France ---
// « Americas » d'un côté de l'Atlantique ne dit rien à un élève de sixième :
// on sépare le Nord et le Sud, et l'Amérique centrale rejoint le Nord.
function continentDe(pays) {
    const r = pays.region, sr = pays.subregion || '';
    if (r === 'Europe') return 'Europe';
    if (r === 'Africa') return 'Afrique';
    if (r === 'Oceania') return 'Océanie';
    if (r === 'Antarctic') return 'Antarctique';
    if (r === 'Asia') return 'Asie';
    if (r === 'Americas') {
        if (/South America/i.test(sr)) return 'Amérique du Sud';
        return 'Amérique du Nord';
    }
    return 'Autre';
}

// Ce que Natural Earth connaît et que la table des pays ignore : territoires
// disputés ou non reconnus. On les nomme plutôt que de les perdre.
const A_LA_MAIN = {
    '-99': null,                                    // plusieurs, traités par nom
    'Kosovo': { code: 'XK', nom: 'Kosovo', continent: 'Europe' },
    'Somaliland': { code: 'XS', nom: 'Somaliland', continent: 'Afrique' },
    'N. Cyprus': { code: 'XN', nom: 'Chypre du Nord', continent: 'Asie' },
    'Northern Cyprus': { code: 'XN', nom: 'Chypre du Nord', continent: 'Asie' }
};

const parNumero = new Map();
nations.forEach(p => {
    if (p.ccn3) parNumero.set(String(Number(p.ccn3)), p);
});

// --- 2. Simplification (Douglas-Peucker) ---
// Le trait d'un pays n'a pas besoin de mille points pour être reconnaissable
// au tableau : on garde la forme, on jette ce que l'œil ne verra pas.
function distanceAuSegment(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplifier(points, tolerance) {
    if (points.length < 3) return points;
    let pire = 0, index = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const d = distanceAuSegment(points[i], points[0], points[points.length - 1]);
        if (d > pire) { pire = d; index = i; }
    }
    if (pire <= tolerance) return [points[0], points[points.length - 1]];
    return simplifier(points.slice(0, index + 1), tolerance)
        .slice(0, -1)
        .concat(simplifier(points.slice(index), tolerance));
}

// --- 3. Encodage compact ---
// Coordonnées en centièmes de degré (≈ 1 km), écarts successifs, écrits dans
// l'alphabet des polylignes : deux à trois caractères par point au lieu d'une
// quinzaine en JSON. Le décodeur tient en quinze lignes côté navigateur.
function encoderNombre(v, sortie) {
    let n = v < 0 ? ~(v << 1) : (v << 1);
    while (n >= 0x20) {
        sortie.push(String.fromCharCode((0x20 | (n & 0x1f)) + 63));
        n >>= 5;
    }
    sortie.push(String.fromCharCode(n + 63));
}

// Le séparateur d'anneaux doit être HORS de l'alphabet des polylignes, qui
// occupe les codes 63 à 126 — « | » (124) en fait partie, et coupait les
// contours en plein milieu. « ; » (59) est en dehors.
const SEPARATEUR = ';';

function encoderAnneau(points) {
    const sortie = [];
    let x = 0, y = 0;
    points.forEach(p => {
        const px = Math.round(p[0] * 100), py = Math.round(p[1] * 100);
        encoderNombre(px - x, sortie); encoderNombre(py - y, sortie);
        x = px; y = py;
    });
    return sortie.join('');
}

// --- 3 bis. L'ANTIMÉRIDIEN ---
// Un pays à cheval sur le 180e méridien — la Russie par la Tchoukotka, les
// Fidji — a des anneaux qui passent de +180° à -180° d'un point au suivant.
// Tracé tel quel, le trait traverse toute la carte pour recoller ses deux
// bords : une bande en travers du nord, un trait en travers du Pacifique.
// On coupe donc l'anneau à l'endroit du saut. Les deux morceaux restent à
// leur place — l'un au bord droit de la carte, l'autre au bord gauche — ce
// qui est exactement ce que montre un planisphère.
function couperALAntimeridien(anneau) {
    const morceaux = [];
    let courant = [anneau[0]];
    for (let i = 1; i < anneau.length; i++) {
        if (Math.abs(anneau[i][0] - anneau[i - 1][0]) > 180) {
            morceaux.push(courant);
            courant = [];
        }
        courant.push(anneau[i]);
    }
    morceaux.push(courant);
    return morceaux.filter(m => m.length >= 4);
}

// --- 4. Conversion ---
const geo = topojson.feature(topo, topo.objects.countries);
const TOLERANCE = 0.04;         // en degrés : ~4 km, invisible au tableau
const AIRE_MINIMALE = 0.02;     // les cailloux de deux pixels alourdissent pour rien

const pays = [];
let pointsAvant = 0, pointsApres = 0;

geo.features.forEach(f => {
    const nomAnglais = (f.properties && f.properties.name) || '';
    let fiche = parNumero.get(String(Number(f.id)));
    let code, nom, continent;
    if (fiche) {
        code = fiche.cca2;
        nom = (fiche.translations && fiche.translations.fra && fiche.translations.fra.common)
            || fiche.name.common;
        continent = continentDe(fiche);
    } else if (A_LA_MAIN[nomAnglais]) {
        ({ code, nom, continent } = A_LA_MAIN[nomAnglais]);
    } else {
        console.warn('  ignoré (pas de fiche) :', f.id, nomAnglais);
        return;
    }

    const anneaux = [];
    const polygones = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    polygones.forEach(poly => {
        // On ne garde que le contour extérieur : les lacs et les enclaves
        // ne changent pas la silhouette qu'on montre à la classe.
        const anneau = poly[0];
        pointsAvant += anneau.length;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        anneau.forEach(p => {
            x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
            y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        });
        if ((x1 - x0) * (y1 - y0) < AIRE_MINIMALE) return;
        // On coupe AVANT de simplifier : un saut de 360° ferait passer
        // Douglas-Peucker pour un détail à conserver, et l'on garderait le
        // trait en travers en jetant la côte autour.
        couperALAntimeridien(anneau).forEach(morceau => {
            const simple = simplifier(morceau, TOLERANCE);
            if (simple.length < 4) return;
            pointsApres += simple.length;
            anneaux.push(simple);
        });
    });
    if (!anneaux.length) return;

    // Deux boîtes, et ce n'est pas un luxe. « b » couvre tout le pays : elle
    // sert à savoir vite si le doigt peut être dessus. « f » ne couvre que le
    // plus grand morceau : c'est elle qui cadre. Sans cela, montrer la France
    // reculait jusqu'à tenir la Guyane et la Réunion dans le même écran, et
    // l'Hexagone devenait un timbre-poste au milieu de l'Atlantique.
    const boite = (liste) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        liste.forEach(p => {
            x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
            y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        });
        return [x0, y0, x1, y1];
    };
    const arrondi = (v) => Math.round(v * 100) / 100;
    const tout = boite([].concat(...anneaux));
    const plusGrand = anneaux.slice().sort((a, b) => b.length - a.length)[0];
    const cadre = boite(plusGrand);

    pays.push({
        i: code, n: nom, c: continent,
        b: tout.map(arrondi),
        f: cadre.map(arrondi),
        p: anneaux.map(encoderAnneau).join(SEPARATEUR)
    });
});

pays.sort((a, b) => a.n.localeCompare(b.n, 'fr'));

const entete = `// FOND DE CARTE DU MONDE — fourni avec l'application.
// En classe il n'y a pas toujours de connexion : une carte qui dépend d'un
// serveur distant est une carte qui manquera le jour où l'on en a besoin.
//
// Géométrie : Natural Earth 1:50m, DOMAINE PUBLIC, via le paquet world-atlas.
// Noms français, codes ISO et régions : world-countries (ODbL).
// Fabriqué par outils/construire-carte-monde.cjs — ne pas retoucher à la main.
//
// FORMAT
//   i  code ISO 3166-1 alpha-2
//   n  nom français
//   c  continent (tel qu'on l'enseigne : les deux Amériques séparées)
//   b  [ouest, sud, est, nord] en degrés — tout le pays, outre-mer compris
//   f  la même chose pour le plus grand morceau seulement : c'est elle qui
//      cadre, sinon montrer la France reculait jusqu'à la Guyane
//   p  contours : anneaux séparés par « ; », chacun encodé en polyligne
//      (écarts successifs en centièmes de degré). Voir decoderAnneau().
`;

const sortie = entete + 'window.CARTE_MONDE = ' + JSON.stringify({ pays }) + ';\n';
const cible = path.join(__dirname, '..', 'lib', 'maps', 'monde.js');
fs.writeFileSync(cible, sortie);

console.log(`${pays.length} pays écrits dans ${path.relative(process.cwd(), cible)}`);
console.log(`points : ${pointsAvant} → ${pointsApres}`);
console.log(`taille : ${(sortie.length / 1024).toFixed(0)} Ko`);
const continents = {};
pays.forEach(p => { continents[p.c] = (continents[p.c] || 0) + 1; });
console.log('continents :', JSON.stringify(continents));
