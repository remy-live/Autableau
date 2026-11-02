// LA LANGUETTE DES TIROIRS.
//
// « La languette des tiroirs mal intégrée. »
//
// Trois tiroirs, trois languettes : celle de la barre des plugins, celle du
// tiroir du bas, celle du tiroir des tableaux à droite. Chacune est la POIGNÉE
// de son tiroir, et doit donc se lire comme un morceau de lui. Mesuré, aucune
// ne l'était tout à fait :
//
// 1. CELLE DE LA BARRE DES PLUGINS GARDAIT UN GRIS PÂLE ÉCRIT EN DUR. Le
//    tiroir porte le trait d'encre — noir par défaut, et de la couleur qu'on
//    choisit dans l'apparence ; la languette, elle, restait à « #dfe6e9 » quoi
//    qu'on fasse. À l'écran : une barre cernée de noir, et sous elle un galet
//    gris qui coupait son trait.
//
// 2. LE TRAIT DU TIROIR PASSAIT SOUS LA LANGUETTE. Elle le chevauchait de
//    douze pixels, et comme elle est translucide, ce trait s'y voyait en pâle :
//    une ligne grise en travers de la poignée, et le beau trait noir
//    interrompu de part et d'autre. C'est ce qu'on photographie ici — la
//    différence se mesure en pixels, pas en relecture.
//
// 3. SON TRAIT ÉTAIT DEUX FOIS PLUS MAIGRE que celui du tiroir. Le trait franc
//    fait deux pixels : un de bordure, un d'ombre sans flou. Les languettes
//    n'avaient que la bordure.
//
// 4. ET LES TROIS NE COMPTAIENT PAS LEUR BORDURE DE LA MÊME FAÇON : celle du
//    haut est un « button », mis en « border-box » par la remise à zéro, les
//    deux autres des « div » restés en « content-box ». Pour la même consigne
//    — 48 pixels —, elles en faisaient 48 et 50.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La languette des tiroirs');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1400, height: 900 } });
    await tableauVierge(page);

    // Les trois languettes, et le tiroir de chacune. Le côté nommé est celui
    // par lequel elle tient à son tiroir.
    const LES_TROIS = [
        { nom: 'haut', tiroir: '#bar-plugins', languette: '#bar-plugins .drawer-toggle', cote: 'bas' },
        { nom: 'bas', tiroir: '#bottom-drawer', languette: '#bottom-drawer .drawer-toggle', cote: 'haut' },
        { nom: 'droite', tiroir: '#right-drawer', languette: '#right-drawer .drawer-toggle-v', cote: 'gauche' }
    ];

    const mesurer = () => page.evaluate((trois) => {
        const lire = (sel) => {
            const e = document.querySelector(sel);
            if (!e) return null;
            const s = getComputedStyle(e), q = e.getBoundingClientRect();
            // L'OMBRE SANS FLOU EST LE SECOND PIXEL DU TRAIT : « 0 0 0 1px ».
            // C'est elle qu'on cherche dans l'ombre du tiroir, et non le halo
            // flou qui la suit.
            const sansFlou = /(?:^|,\s*)rgba?\([^)]*\)\s+0px 0px 0px (\d+)px/.exec(s.boxShadow)
                || /(?:^|,\s*)0px 0px 0px (\d+)px/.exec(s.boxShadow);
            return {
                existe: true,
                boite: [q.x, q.y, q.width, q.height].map(v => Math.round(v * 100) / 100),
                fond: s.backgroundColor,
                flou: s.backdropFilter,
                // ON LIT LA COULEUR SUR UN CÔTÉ QUI A UNE BORDURE. Un côté sans
                // bordure garde la couleur du TEXTE : la languette du haut n'a
                // pas de bord supérieur, et lire là rendait son encre grise au
                // lieu de son trait — le contrôle se trompait de mesure, pas de
                // conclusion. Le bord gauche existe sur les six surfaces.
                bord: s.borderLeftColor,
                bordHaut: parseFloat(s.borderTopWidth),
                bordBas: parseFloat(s.borderBottomWidth),
                bordGauche: parseFloat(s.borderLeftWidth),
                anneau: sansFlou ? parseInt(sansFlou[1], 10) : 0
            };
        };
        const vide = { existe: false, boite: [0, 0, 0, 0], fond: null, flou: null, bord: null,
                       bordHaut: 0, bordBas: 0, bordGauche: 0, anneau: 0 };
        const out = {};
        trois.forEach(t => {
            const tiroir = lire(t.tiroir) || vide, languette = lire(t.languette) || vide;
            // L'ÉCART ENTRE LA LANGUETTE ET LA BOÎTE DE SON TIROIR. Il doit
            // valoir exactement l'anneau : la languette se pose alors au ras du
            // trait, sans mordre dessus ni laisser voir le tableau entre eux.
            let ecart = null;
            if (tiroir.existe && languette.existe) {
                if (t.cote === 'bas') ecart = languette.boite[1] - (tiroir.boite[1] + tiroir.boite[3]);
                else if (t.cote === 'haut') ecart = tiroir.boite[1] - (languette.boite[1] + languette.boite[3]);
                else ecart = tiroir.boite[0] - (languette.boite[0] + languette.boite[2]);
            }
            out[t.nom] = { tiroir, languette, ecart };
        });
        out.epaisseur = getComputedStyle(document.body).getPropertyValue('--contour-epaisseur').trim();
        out.contour = getComputedStyle(document.body).getPropertyValue('--contour').trim();
        return out;
    }, LES_TROIS);

    const vu = await mesurer();
    r.verifie('LES TROIS LANGUETTES SONT LÀ, et chacune avec son tiroir',
        LES_TROIS.every(t => vu[t.nom].languette.existe && vu[t.nom].tiroir.existe),
        JSON.stringify(LES_TROIS.map(t => [t.nom, vu[t.nom].languette.existe, vu[t.nom].tiroir.existe])));

    // 1. LE TRAIT DU TIROIR, ET PAS UN AUTRE.
    r.egal('CHAQUE LANGUETTE PORTE LE TRAIT DE SON TIROIR, de la même couleur',
        LES_TROIS.map(t => vu[t.nom].languette.bord),
        LES_TROIS.map(t => vu[t.nom].tiroir.bord),
        JSON.stringify(LES_TROIS.map(t => [t.nom, vu[t.nom].languette.bord, vu[t.nom].tiroir.bord])));

    // 3. ET DE LA MÊME ÉPAISSEUR. Le trait du tiroir fait sa bordure PLUS son
    //    ombre sans flou ; celui de la languette n'a que sa bordure, elle doit
    //    donc valoir les deux.
    // LE TRAIT DU TIROIR SE MESURE SUR LE CÔTÉ OÙ PEND LA LANGUETTE, et le
    // trait de la languette sur son côté libre : c'est le même trait qui court
    // de l'un à l'autre, et c'est là qu'une différence d'épaisseur se voit.
    const traitDuTiroir = (etat, cote) => (cote === 'bas' ? etat.bordBas
        : cote === 'haut' ? etat.bordHaut : etat.bordGauche) + etat.anneau;
    const traitLibre = (etat, cote) => cote === 'bas' ? etat.bordBas
        : cote === 'haut' ? etat.bordHaut : etat.bordGauche;
    const epaisseurs = LES_TROIS.map(t =>
        [t.nom, traitLibre(vu[t.nom].languette, t.cote), traitDuTiroir(vu[t.nom].tiroir, t.cote)]);
    r.verifie('ET ELLE LE PORTE DE LA MÊME ÉPAISSEUR : un pixel de bordure, un d\'ombre',
        epaisseurs.every(e => e[1] === e[2] && e[1] >= 2), JSON.stringify(epaisseurs));

    // 2. ELLE SE POSE AU RAS DU TRAIT, SANS MORDRE DESSUS.
    r.verifie('AUCUNE NE MORD SUR LE TRAIT DE SON TIROIR, ni ne s\'en écarte',
        LES_TROIS.every(t => Math.abs(vu[t.nom].ecart - vu[t.nom].tiroir.anneau) < 0.51),
        JSON.stringify(LES_TROIS.map(t => [t.nom, vu[t.nom].ecart, vu[t.nom].tiroir.anneau])));

    // 4. LA TAILLE ÉCRITE EST LA TAILLE OBTENUE.
    r.egal('LES TROIS FONT LA TAILLE QU\'ON LEUR A ÉCRITE, bordure comprise',
        LES_TROIS.map(t => vu[t.nom].languette.boite.slice(2)),
        [[48, 24], [48, 24], [18, 56]],
        JSON.stringify(LES_TROIS.map(t => [t.nom, vu[t.nom].languette.boite])));

    // LA MÊME MATIÈRE : même fond, même flou. La partie qui dépasse se pose sur
    // le tableau comme le tiroir lui-même ; sans le flou, elle y montrait le
    // dessin net là où le tiroir le montre fondu.
    r.egal('ET LA MÊME MATIÈRE QUE LUI : même fond, même flou',
        LES_TROIS.map(t => [vu[t.nom].languette.fond, vu[t.nom].languette.flou]),
        LES_TROIS.map(t => [vu[t.nom].tiroir.fond, vu[t.nom].tiroir.flou]),
        JSON.stringify(LES_TROIS.map(t => [t.nom, vu[t.nom].languette.fond, vu[t.nom].tiroir.fond,
                                           vu[t.nom].languette.flou, vu[t.nom].tiroir.flou])));

    // LA COULEUR CHOISIE DANS L'APPARENCE LES SUIT. C'est tout l'enjeu du gris
    // écrit en dur : « celui qui la veut bleue, ou assortie à son école, la
    // change dans l'apparence, et tout suit ». La languette du haut ne suivait
    // rien.
    const apresLaCouleur = await (async () => {
        await page.evaluate(() => document.body.style.setProperty('--contour', 'rgb(200, 30, 90)'));
        await page.waitForTimeout(120);
        const m = await mesurer();
        await page.evaluate(() => document.body.style.removeProperty('--contour'));
        await page.waitForTimeout(120);
        return m;
    })();
    r.egal('LA COULEUR DE CONTOUR CHOISIE LES SUIT TOUTES LES TROIS',
        LES_TROIS.map(t => apresLaCouleur[t.nom].languette.bord),
        LES_TROIS.map(() => 'rgb(200, 30, 90)'),
        JSON.stringify(LES_TROIS.map(t => [t.nom, apresLaCouleur[t.nom].languette.bord])));

    // ------------------------------------------------------------------
    // LE TRAIT COURT SANS RUPTURE : ON LE PHOTOGRAPHIE.
    //
    // C'est la mesure centrale, et la seule qui dise ce qu'on VOIT. Le trait du
    // tiroir passait sous la languette, qui est translucide : il s'y lisait à
    // huit pour cent, c'est-à-dire en gris très pâle. On compare donc le point
    // le plus sombre du trait SOUS la languette à celui du trait À CÔTÉ d'elle.
    // ------------------------------------------------------------------
    const BANDE = 6;
    const photo = async (nom) => {
        const t = LES_TROIS.find(k => k.nom === nom);
        const ou = await page.evaluate(([sel, selT, cote, bande]) => {
            // Le message d'accueil se pose juste sur la languette du bas : il
            // donnerait un noir qui n'est pas celui du trait.
            const c = document.getElementById('toast-container');
            if (c) c.innerHTML = '';
            const l = document.querySelector(sel), d = document.querySelector(selT);
            if (!l || !d) return null;
            const q = l.getBoundingClientRect(), p = d.getBoundingClientRect();
            // La bande photographiée : le trait du tiroir, et six pixels de
            // chaque côté. La languette y occupe les colonnes 80 à 80 + sa
            // largeur ; on en retire deux de chaque bord, qui sont sa propre
            // bordure vue de biais dans l'arrondi.
            const y = cote === 'bas' ? p.y + p.height - bande : p.y - bande;
            if (!isFinite(y)) return null;
            return { x: Math.round(q.x - 80), y: Math.round(y),
                     w: Math.round(q.width + 160), h: 2 * bande,
                     de: 82, a: 80 + Math.round(q.width) - 2, loin: 20 };
        }, [t.languette, t.tiroir, t.cote, BANDE]);
        if (!ou || ou.x < 0 || ou.y < 0) return { rien: true, sous: null, aCote: null };
        const png = await page.screenshot({ clip: { x: ou.x, y: ou.y, width: ou.w, height: ou.h } });
        return await page.evaluate(async ([b64, de, a, loin]) => {
            const img = new Image();
            await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko;
                img.src = 'data:image/png;base64,' + b64; });
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            const x = c.getContext('2d');
            x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            // Le point le plus sombre d'une colonne : c'est le trait.
            const colonne = (px) => {
                let noir = 255;
                for (let py = 0; py < c.height; py++) {
                    const i = (py * c.width + px) * 4;
                    noir = Math.min(noir, (d[i] + d[i + 1] + d[i + 2]) / 3);
                }
                return Math.round(noir);
            };
            // ON CHERCHE LE POINT LE PLUS PÂLE DU TRAIT SOUS LA LANGUETTE, et
            // non son milieu : la flèche de la languette est noire et tombe
            // justement au milieu. Mesurer là donnait du noir quoi qu'il
            // arrive — le contrôle passait même avec le trait effacé, ce que
            // deux sabotages ont montré. Si UNE SEULE colonne du trait pâlit
            // sous la poignée, le trait est rompu.
            let pale = 0;
            for (let px = de; px <= a && px < c.width; px++) pale = Math.max(pale, colonne(px));
            return { rien: false, sous: pale, aCote: colonne(loin) };
        }, [png.toString('base64'), ou.de, ou.a, ou.loin]);
    };

    const traitHaut = await photo('haut');
    const traitBas = await photo('bas');
    r.verifie('LE TRAIT COURT SOUS LA LANGUETTE DU HAUT AUSSI NOIR QU\'À CÔTÉ D\'ELLE',
        !traitHaut.rien && Math.abs(traitHaut.sous - traitHaut.aCote) <= 12 && traitHaut.aCote < 90,
        JSON.stringify(traitHaut));
    r.verifie('ET SOUS CELLE DU BAS DE MÊME',
        !traitBas.rien && Math.abs(traitBas.sous - traitBas.aCote) <= 12 && traitBas.aCote < 90,
        JSON.stringify(traitBas));

    // ------------------------------------------------------------------
    // ET ELLE RESTE CE PAR QUOI ON OUVRE LE TIROIR.
    //
    // « Le tiroir du haut se replie et se déplie par sa languette. » Une
    // poignée déplacée de quatorze pixels doit rester attrapable, et ouvrir ce
    // qu'elle annonce : c'est la seule chose qu'on lui demande de faire.
    // ------------------------------------------------------------------
    const ouvreSonTiroir = async (nom) => {
        const t = LES_TROIS.find(k => k.nom === nom);
        const avant = await page.evaluate((s) => {
            const d = document.querySelector(s);
            return d ? d.classList.contains('closed') || d.classList.contains('open') : null;
        }, t.tiroir);
        const b = await page.evaluate((s) => {
            const e = document.querySelector(s);
            if (!e) return null;
            const q = e.getBoundingClientRect();
            return { x: q.x + q.width / 2, y: q.y + q.height / 2,
                     dansLEcran: q.x >= 0 && q.y >= 0 && q.right <= innerWidth && q.bottom <= innerHeight };
        }, t.languette);
        if (!b) return { rien: true };
        await page.mouse.click(b.x, b.y);
        await page.waitForTimeout(600);
        const apres = await page.evaluate((s) => {
            const d = document.querySelector(s);
            return d ? d.classList.contains('closed') || d.classList.contains('open') : null;
        }, t.tiroir);
        return { dansLEcran: b.dansLEcran, change: avant !== apres, avant, apres };
    };
    const clicHaut = await ouvreSonTiroir('haut');
    const clicBas = await ouvreSonTiroir('bas');
    const clicDroite = await ouvreSonTiroir('droite');
    r.verifie('CHAQUE LANGUETTE EST ENTIÈREMENT DANS L\'ÉCRAN : on l\'attrape ou elle ne sert à rien',
        [clicHaut, clicBas, clicDroite].every(c => c.dansLEcran === true),
        JSON.stringify([clicHaut, clicBas, clicDroite]));
    r.verifie('ET UN CLIC DESSUS OUVRE OU REPLIE SON TIROIR',
        [clicHaut, clicBas, clicDroite].every(c => c.change === true),
        JSON.stringify([clicHaut, clicBas, clicDroite]));

    // ------------------------------------------------------------------
    // EN CONTOURS DISCRETS, LA RÈGLE TIENT ENCORE.
    //
    // Le trait discret n'a pas d'ombre sans flou : il ne fait qu'un pixel. La
    // languette doit alors en faire un aussi, et se décaler d'autant — sans
    // quoi on verrait le tableau par la fente entre elle et son tiroir.
    // ------------------------------------------------------------------
    await page.evaluate(() => document.body.classList.add('contours-doux'));
    await page.waitForTimeout(200);
    const doux = await mesurer();
    r.egal('EN CONTOURS DISCRETS, LE TRAIT N\'EST PLUS QUE D\'UN PIXEL', doux.epaisseur, '1px',
        JSON.stringify({ epaisseur: doux.epaisseur }));
    r.verifie('ET LA LANGUETTE LE SUIT, épaisseur comme position',
        LES_TROIS.every(t => traitLibre(doux[t.nom].languette, t.cote)
                === traitDuTiroir(doux[t.nom].tiroir, t.cote)
            && Math.abs(doux[t.nom].ecart - doux[t.nom].tiroir.anneau) < 0.51),
        JSON.stringify(LES_TROIS.map(t => [t.nom, traitLibre(doux[t.nom].languette, t.cote),
            traitDuTiroir(doux[t.nom].tiroir, t.cote), doux[t.nom].ecart, doux[t.nom].tiroir.anneau])));
    r.egal('et sa taille ne bouge pas d\'un pixel pour autant',
        LES_TROIS.map(t => doux[t.nom].languette.boite.slice(2)),
        [[48, 24], [48, 24], [18, 56]],
        JSON.stringify(LES_TROIS.map(t => [t.nom, doux[t.nom].languette.boite])));
    await page.evaluate(() => document.body.classList.remove('contours-doux'));

    // EN MODE SOMBRE, LA LANGUETTE DU HAUT SUIT SON TIROIR. C'est là qu'elle
    // avait sa seconde valeur écrite en dur.
    // LE FOND SE FOND EN DEUX DIXIÈMES DE SECONDE. Mesuré trop tôt, on lit une
    // teinte intermédiaire — « rgba(46, 53, 55, 0.95) » au lieu de « rgba(45,
    // 52, 54, 0.95) » — et le contrôle tombe sur un pixel de transition.
    await page.evaluate(() => document.body.classList.add('dark-mode'));
    await page.waitForTimeout(700);
    const sombre = await mesurer();
    r.egal('EN MODE SOMBRE AUSSI, chacune garde le trait et le fond de son tiroir',
        LES_TROIS.map(t => [sombre[t.nom].languette.bord, sombre[t.nom].languette.fond]),
        LES_TROIS.map(t => [sombre[t.nom].tiroir.bord, sombre[t.nom].tiroir.fond]),
        JSON.stringify(LES_TROIS.map(t => [t.nom, sombre[t.nom].languette.bord,
            sombre[t.nom].tiroir.bord, sombre[t.nom].languette.fond, sombre[t.nom].tiroir.fond])));
    await page.evaluate(() => document.body.classList.remove('dark-mode'));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
