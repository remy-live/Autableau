// LE CURSEUR D'OPACITÉ SE VOIT ET S'ATTRAPE.
//
// « Il semble manquer le slider d'opacité. »
//
// Il était bien là — mais sans hauteur. Un curseur « appearance: none » sans
// hauteur voit sa boîte se réduire à celle de sa piste : QUATRE PIXELS. La
// pastille dépassait donc de sa propre boîte : on la voyait, mais la bande
// sensible à la souris faisait quatre pixels de haut, et le geste ratait une
// fois sur deux. Rien ne disait non plus où l'on en était — pas de nombre,
// pas d'unité —, si bien qu'on ne pouvait ni régler à la souris ni lire le
// réglage : le plus simple était d'en conclure qu'il n'existait pas.
//
// CE QUE CETTE SUITE TIENT :
//
//   — la boîte du curseur est assez haute pour qu'on l'attrape ;
//   — le tirer change vraiment l'opacité, et le pour cent suit ;
//   — taper un pour cent déplace le curseur et l'applique ;
//   — le nombre suit ce que montre le curseur : au changement d'onglet
//     contour/fond, et sur un tampon sélectionné ;
//   — un nombre hors bornes ou illisible ne casse rien.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const HAUTEUR_MINI = 16;   // en pixels : au-dessous, on ne l'attrape plus

module.exports = async function (browser) {
    const r = creerRapport('Opacité');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    const ouvrirLaPastille = () => page.evaluate(() => {
        const p = document.getElementById('color-popover');
        if (getComputedStyle(p).display === 'none') document.getElementById('btn-color-popover').click();
    });

    const lire = () => page.evaluate(() => ({
        curseur: parseFloat(document.getElementById('opacity-slider').value),
        nombre: document.getElementById('opacity-num').value,
        trait: activeStyle.strokeOpacity,
        fond: activeStyle.fillOpacity
    }));

    await ouvrirLaPastille();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------
    // 1. On peut l'attraper
    // ---------------------------------------------------------------
    const boite = await page.evaluate(() => {
        const s = document.getElementById('opacity-slider');
        const b = s.getBoundingClientRect();
        const p = document.getElementById('color-popover').getBoundingClientRect();
        return {
            h: Math.round(b.height), l: Math.round(b.width),
            x: b.x, y: b.y,
            dedans: b.top >= p.top - 1 && b.bottom <= p.bottom + 1
        };
    });
    r.verifie('la bande sensible du curseur fait au moins seize pixels de haut',
        boite.h >= HAUTEUR_MINI, boite.h + ' px');
    r.verifie('le curseur tient dans la fenêtre de la pastille', boite.dedans, JSON.stringify(boite));

    const pourCent = await page.evaluate(() => {
        const n = document.getElementById('opacity-num');
        const b = n.getBoundingClientRect();
        return { present: !!n, l: Math.round(b.width), unite: !!document.querySelector('.opacity-pc') };
    });
    r.verifie('le pour cent se lit à côté, avec son unité',
        pourCent.present && pourCent.unite && pourCent.l >= 30, JSON.stringify(pourCent));

    // ---------------------------------------------------------------
    // 2. Le tirer règle l'opacité, et le nombre suit
    // ---------------------------------------------------------------
    await page.mouse.move(boite.x + boite.l * 0.5, boite.y + boite.h / 2);
    await page.mouse.down();
    await page.mouse.move(boite.x + boite.l * 0.3, boite.y + boite.h / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const tire = await lire();
    r.verifie('tirer le curseur descend l\'opacité du trait',
        tire.trait < 0.5 && tire.trait > 0.05, JSON.stringify(tire));
    r.verifie('et le pour cent dit exactement la même chose',
        Number(tire.nombre) === Math.round(tire.curseur * 100), JSON.stringify(tire));

    // ---------------------------------------------------------------
    // 3. Taper un pour cent déplace le curseur et l'applique
    // ---------------------------------------------------------------
    const taper = (v) => page.evaluate((v) => {
        const n = document.getElementById('opacity-num');
        n.value = v;
        n.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);

    await taper(40);
    await page.waitForTimeout(150);
    const tape = await lire();
    r.egal('taper 40 pose l\'opacité à 0,40',
        { curseur: tape.curseur, trait: tape.trait }, { curseur: 0.4, trait: 0.4 });

    // Hors bornes : on rabat, on ne casse pas.
    await taper(250);
    await page.waitForTimeout(150);
    const trop = await lire();
    r.egal('au-delà de cent, on rabat à cent', { curseur: trop.curseur, trait: trop.trait },
        { curseur: 1, trait: 1 });

    await taper(-30);
    await page.waitForTimeout(150);
    const sous = await lire();
    r.egal('au-dessous de zéro, on rabat à zéro', { curseur: sous.curseur, trait: sous.trait },
        { curseur: 0, trait: 0 });

    // Un champ vidé ne doit pas poser une opacité « pas un nombre ».
    await taper('');
    await page.waitForTimeout(150);
    const vide = await lire();
    r.verifie('un champ vidé laisse l\'opacité où elle est',
        Number.isFinite(vide.trait) && vide.trait === 0, JSON.stringify(vide));

    await taper(100);
    await page.waitForTimeout(150);

    // ---------------------------------------------------------------
    // 4. Le nombre suit ce que montre le curseur
    // ---------------------------------------------------------------
    await page.evaluate(() => { activeStyle.fillOpacity = 0.2; });
    await page.evaluate(() => document.querySelector('.popover-tab[data-target="fill"]').click());
    await page.waitForTimeout(200);
    const surLeFond = await lire();
    r.egal('l\'onglet « Fond » montre l\'opacité du fond, en toutes lettres',
        { curseur: surLeFond.curseur, nombre: surLeFond.nombre }, { curseur: 0.2, nombre: '20' });

    await page.evaluate(() => document.querySelector('.popover-tab[data-target="stroke"]').click());
    await page.waitForTimeout(200);
    const surLeTrait = await lire();
    r.egal('et l\'onglet « Contour » celle du trait',
        { curseur: surLeTrait.curseur, nombre: surLeTrait.nombre }, { curseur: 1, nombre: '100' });

    // Un tampon sélectionné : le curseur règle SON opacité, et le nombre aussi.
    // On le prend à la souris, comme on le ferait : c'est ce clic qui rend la
    // main au tableau — un curseur qui garde le focus ne se laisse pas
    // rafraîchir, et c'est voulu (on ne réécrit pas sous les doigts).
    const cible = await page.evaluate(async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70">'
            + '<rect width="120" height="70" fill="#3498db"/></svg>';
        images.length = 0; selectedItems = []; panX = 300; panY = 400; zoom = 1;
        setMode('pointer');
        const st = await new Promise(ok => createStampFromSVG(svg, ok));
        images.push({ id: nextId++, x: 0, y: 0, w: st.w, h: st.h, cx: 0, cy: 0,
            cw: st.w, ch: st.h, src: st.src, z: globalZ++, opacity: 0.35 });
        draw();
        return { x: panX + st.w / 2, y: panY + st.h / 2 };
    });
    await page.mouse.click(cible.x, cible.y);
    await page.waitForTimeout(350);
    await ouvrirLaPastille();
    await page.waitForTimeout(250);
    const surLeTampon = await page.evaluate(() => ({
        curseur: parseFloat(document.getElementById('opacity-slider').value),
        nombre: document.getElementById('opacity-num').value,
        libelle: document.querySelector('#color-popover .opacity-container').firstChild.textContent
    }));
    r.egal('un tampon sélectionné, le nombre montre SON opacité',
        { curseur: surLeTampon.curseur, nombre: surLeTampon.nombre }, { curseur: 0.35, nombre: '35' });
    r.verifie('et le libellé le dit', /tampon/i.test(surLeTampon.libelle), surLeTampon.libelle);

    // ---------------------------------------------------------------
    // 6. IL NE SERT PLUS QU'AUX TAMPONS
    //
    // « J'ai l'impression qu'il manque le slider d'opacité sur la plupart des
    // outils (polygone entre autres). » Il manquait pour de bon : le curseur
    // de la BARRE ne paraissait que sur une sélection d'images, et pour tout
    // le reste il fallait ouvrir la pastille puis choisir entre « Contour » et
    // « Fond » — deux réglages pour une seule idée. « opacity » est devenu le
    // facteur de l'objet, quel qu'il soit.
    // ---------------------------------------------------------------
    const surLaBarre = () => page.evaluate(() => {
        const b = document.getElementById('stamp-opacity-box');
        return b ? getComputedStyle(b).display : '?';
    });
    const tirerLeCurseurDeLaBarre = (v) => page.evaluate((val) => {
        const c = document.getElementById('stamp-opacity');
        c.value = String(val);
        c.dispatchEvent(new Event('input', { bubbles: true }));
        c.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);

    const poserUnPolygone = () => page.evaluate(() => {
        images.length = 0; polygons.length = 0; texts.length = 0; points.length = 0;
        setMode('pointer');
        const a = { id: nextId++, x: 100, y: 100 }, b = { id: nextId++, x: 200, y: 100 },
              c = { id: nextId++, x: 150, y: 200 };
        points.push(a, b, c);
        const po = { id: nextId++, points: [a.id, b.id, c.id], color: '#e74c3c', width: 3,
                     isFilled: true, fillColor: '#e74c3c', fillOpacity: 0.2, isClosed: true, z: globalZ++ };
        polygons.push(po);
        selectedItems = [{ type: 'polygon', id: po.id }];
        updateStyleBarContext(); syncStyleWithSelection();
        return po.id;
    });

    const idPoly = await poserUnPolygone();
    await page.waitForTimeout(250);
    r.egal('un polygone tenu, le curseur d\'opacité est DANS la barre', await surLaBarre(), 'flex');

    await tirerLeCurseurDeLaBarre(0.4);
    await page.waitForTimeout(250);
    r.egal('le tirer rend le polygone translucide',
        await page.evaluate((id) => (polygons.find(p => p.id === id) || {}).opacity, idPoly), 0.4);

    // Le réglage fin du fond n'a pas disparu : il se multiplie avec celui de
    // l'objet, si bien qu'un contour plein sur un fond léger garde son allure.
    r.egal('et les deux réglages fins sont intacts',
        await page.evaluate((id) => { const p = polygons.find(x => x.id === id) || {};
            return { fond: p.fillOpacity, rempli: p.isFilled }; }, idPoly),
        { fond: 0.2, rempli: true });

    // CE QU'ON EXPORTE EST CE QU'ON VOIT. Sans cela, un polygone estompé au
    // tableau revenait opaque dans le SVG distribué aux élèves.
    r.verifie('l\'export SVG emporte l\'opacité de l\'objet',
        await page.evaluate(() => /<g opacity="0\.4">/.test(generateSVGString({ x: 0, y: 0, w: 400, h: 400 }, false))));

    // UN TRAIT À MAIN LEVÉE N'A NI FOND NI CONTOUR À RÉGLER : sans opacité
    // d'objet, il n'en avait aucune. C'est pourtant l'outil qu'on prend le plus.
    const idTrait = await page.evaluate(() => {
        const f = { id: nextId++, points: [{ x: 300, y: 300 }, { x: 380, y: 360 }],
                    color: '#000', width: 4, z: globalZ++ };
        freehands.push(f);
        selectedItems = [{ type: 'freehand', id: f.id }];
        updateStyleBarContext(); syncStyleWithSelection();
        return f.id;
    });
    await page.waitForTimeout(250);
    r.egal('un trait à main levée l\'a aussi', await surLaBarre(), 'flex');
    await tirerLeCurseurDeLaBarre(0.55);
    await page.waitForTimeout(250);
    r.egal('et il s\'estompe',
        await page.evaluate((id) => (freehands.find(f => f.id === id) || {}).opacity, idTrait), 0.55);

    // UN TEXTE AUSSI : un énoncé qu'on estompe derrière sa correction.
    const idTexte = await page.evaluate(() => {
        const t = { id: nextId++, x: 50, y: 420, text: 'Bonjour', content: 'Bonjour',
                    color: '#000', fontSize: 20, z: globalZ++ };
        texts.push(t);
        selectedItems = [{ type: 'text', id: t.id }];
        updateStyleBarContext(); syncStyleWithSelection();
        return t.id;
    });
    await page.waitForTimeout(250);
    r.egal('un bloc de texte l\'a aussi', await surLaBarre(), 'flex');
    await tirerLeCurseurDeLaBarre(0.3);
    await page.waitForTimeout(250);
    r.egal('et il s\'estompe également',
        await page.evaluate((id) => (texts.find(t => t.id === id) || {}).opacity, idTexte), 0.3);

    // PENDANT QU'ON TIRE, ET PAS SEULEMENT APRÈS. Un curseur qui n'agit qu'au
    // lâcher se règle à l'aveugle : on vise une transparence qu'on ne voit
    // qu'une fois le doigt levé. Les épreuves ci-dessus envoyaient « input »
    // ET « change », si bien que le second couvrait le premier — sabotée, la
    // conduite en direct passait inaperçue. Ici, « input » tout seul.
    await page.evaluate((id) => {
        const t = texts.find(x => x.id === id); if (t) delete t.opacity;
        selectedItems = [{ type: 'text', id }];
        updateStyleBarContext(); syncStyleWithSelection();
        const c = document.getElementById('stamp-opacity');
        c.value = '0.65';
        c.dispatchEvent(new Event('input', { bubbles: true }));   // SANS « change »
    }, idTexte);
    await page.waitForTimeout(250);
    r.egal('le seul « input » suffit : l\'objet pâlit pendant qu\'on tire',
        await page.evaluate((id) => (texts.find(t => t.id === id) || {}).opacity, idTexte), 0.65);

    // MAIS PAS QUAND ON NE TIENT RIEN : la barre ne montre pas un réglage qui
    // n'agirait sur personne.
    await page.evaluate(() => { selectedItems = []; updateStyleBarContext(); syncStyleWithSelection(); });
    await page.waitForTimeout(250);
    r.egal('rien de tenu, le curseur s\'efface', await surLaBarre(), 'none');

    // ---------------------------------------------------------------
    // 7. ET SURTOUT : ÇA SE VOIT.
    //
    // Les épreuves ci-dessus lisent « obj.opacity ». Ranger un nombre dans un
    // objet ne prouve rien : ce qu'on promet, c'est que l'ENCRE pâlit. On lit
    // donc le pixel peint, une fois plein et une fois estompé.
    // ---------------------------------------------------------------
    const pixels = await page.evaluate(() => {
        images.length = 0; polygons.length = 0; texts.length = 0;
        points.length = 0; freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        // Un trait épais et bien noir, droit sous un point qu'on sait viser.
        const trait = { id: nextId++, points: [{ x: 60, y: 200 }, { x: 460, y: 200 }],
                        color: '#000000', width: 24, z: globalZ++ };
        freehands.push(trait);
        const lire = () => {
            draw();
            const d = ctx.getImageData(Math.round(260 * (canvas.width / canvas.clientWidth)),
                                       Math.round(200 * (canvas.height / canvas.clientHeight)), 1, 1).data;
            return [d[0], d[1], d[2]];
        };
        const fond = (() => { freehands.length = 0; const f = lire(); freehands.push(trait); return f; })();
        const plein = lire();
        trait.opacity = 0.35;
        const estompe = lire();
        // Distance au fond : pleine, elle est grande ; estompée, elle fond.
        const ecart = (c) => Math.abs(c[0] - fond[0]) + Math.abs(c[1] - fond[1]) + Math.abs(c[2] - fond[2]);
        return { fond, plein, estompe, ecartPlein: ecart(plein), ecartEstompe: ecart(estompe) };
    });
    r.verifie('le trait plein couvre vraiment le fond',
        pixels.ecartPlein > 120, JSON.stringify(pixels));
    r.verifie('et l\'opacité de l\'objet le fait PÂLIR à l\'écran, pas seulement dans ses données',
        pixels.ecartEstompe < pixels.ecartPlein * 0.6 && pixels.ecartEstompe > 5,
        JSON.stringify(pixels));

    // UN OBJET TRANSLUCIDE NE DÉTEINT PAS SUR SES VOISINS : le voile se rend
    // au suivant, sans quoi tout ce qui se dessine après lui pâlirait.
    const voisin = await page.evaluate(() => {
        // Le translucide D'ABORD (z plus bas), l'opaque ENSUITE : c'est
        // l'ordre où un voile oublié déteindrait.
        freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        freehands.push({ id: nextId++, points: [{ x: 60, y: 140 }, { x: 460, y: 140 }],
                         color: '#000000', width: 24, z: 1, opacity: 0.2 });
        const apres = { id: nextId++, points: [{ x: 60, y: 300 }, { x: 460, y: 300 }],
                        color: '#000000', width: 24, z: 2 };
        freehands.push(apres);
        const lire = (y) => {
            draw();
            const d = ctx.getImageData(Math.round(260 * (canvas.width / canvas.clientWidth)),
                                       Math.round(y * (canvas.height / canvas.clientHeight)), 1, 1).data;
            return [d[0], d[1], d[2]];
        };
        const dessine = lire(300);
        freehands.splice(0, 1);                 // le translucide s'en va
        const seul = lire(300);
        return { derriereLeTranslucide: dessine, toutSeul: seul };
    });
    r.egal('le voile est rendu au suivant : l\'objet d\'après garde sa couleur pleine',
        voisin.derriereLeTranslucide, voisin.toutSeul);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
