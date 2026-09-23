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
    // « DANS LA BARRE » SE MESURE, ET PAS PAR UN « display ». Ma première
    // version lisait « getComputedStyle(box).display » — qui disait « flex »
    // alors que la boîte vivait DANS LA PASTILLE, fermée, et sur un texte
    // qu'elle était haute de zéro pixel, écrasée par un groupe masqué. Un
    // réglage qu'on ne voit pas n'existe pas : on exige donc une boîte qui a
    // une hauteur, qui tient dans la barre, et la pastille CLOSE.
    const surLaBarre = () => page.evaluate(() => {
        const b = document.getElementById('stamp-opacity-box');
        if (!b) return 'absent';
        const r = b.getBoundingClientRect();
        const barre = document.getElementById('bar-style').getBoundingClientRect();
        if (getComputedStyle(b).display === 'none') return 'caché';
        if (document.getElementById('color-popover').classList.contains('visible')) return 'derrière la pastille';
        if (!(r.width > 10 && r.height >= 16)) return 'écrasé (' + Math.round(r.height) + ' px)';
        if (!(r.left >= barre.left - 1 && r.right <= barre.right + 1)) return 'hors de la barre';
        return 'sous la main';
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

    // ON REFERME LA PASTILLE : c'est précisément ce qu'on veut ne plus avoir à
    // ouvrir. Les sections précédentes l'ont laissée ouverte — sans ce
    // rangement, l'épreuve croirait tenir sa promesse alors qu'elle mesurerait
    // le curseur À TRAVERS le tiroir qu'on cherche à supprimer.
    const fermerLaPastille = () => page.evaluate(() => {
        const p = document.getElementById('color-popover');
        p.classList.remove('visible');
        // On EFFACE le style en ligne au lieu d'y écrire « none » : c'est la
        // classe « visible » qui commande, et un « display » posé à la main
        // gagnerait ensuite contre elle — la pastille refuserait de se
        // rouvrir, et l'épreuve accuserait le bouton.
        p.style.display = '';
    });
    await fermerLaPastille();
    await page.waitForTimeout(200);

    const idPoly = await poserUnPolygone();
    await page.waitForTimeout(250);
    r.egal('un polygone tenu, le curseur d\'opacité est sous la main, sans ouvrir la pastille',
        await surLaBarre(), 'sous la main');

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
    r.egal('un trait à main levée l\'a aussi', await surLaBarre(), 'sous la main');
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
    r.egal('un bloc de texte l\'a aussi', await surLaBarre(), 'sous la main');
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
    r.egal('rien de tenu, le curseur s\'efface', await surLaBarre(), 'caché');

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

    // ---------------------------------------------------------------
    // 8. LE CLIGNOTANT
    //
    // « Dans le couleur, on pourrait rajouter une option clignotante ? »
    // Clignoter, c'est faire battre l'opacité : le réglage était déjà à
    // moitié écrit. Ce que cette section tient, c'est surtout ce qu'on ne
    // voit pas en regardant l'écran — que ça ne coûte rien quand rien ne bat,
    // que ça ne part pas en stroboscope, et qu'un export n'attrape jamais
    // l'objet au creux de son fondu.
    // ---------------------------------------------------------------
    const poserUnTraitEpais = () => page.evaluate(() => {
        images.length = 0; polygons.length = 0; texts.length = 0;
        points.length = 0; freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        const f = { id: nextId++, points: [{ x: 60, y: 200 }, { x: 460, y: 200 }],
                    color: '#000000', width: 24, z: globalZ++ };
        freehands.push(f);
        selectedItems = [{ type: 'freehand', id: f.id }];
        updateStyleBarContext(); syncStyleWithSelection();
        return f.id;
    });
    const idBattant = await poserUnTraitEpais();
    await page.waitForTimeout(250);
    // L'interrupteur vit DANS la pastille de couleur — « dans le couleur, on
    // pourrait rajouter une option clignotante ? ». On la rouvre donc, après
    // l'avoir fermée plus haut pour éprouver le curseur d'opacité.
    await ouvrirLaPastille();
    await page.waitForTimeout(300);

    r.egal('un interrupteur « clignoter » paraît dès qu\'on tient quelque chose',
        await page.evaluate(() => {
            const b = document.getElementById('btn-clignote');
            return b ? { affiche: getComputedStyle(b).display !== 'none',
                         dit: b.textContent.trim() } : 'absent';
        }), { affiche: true, dit: '✨ Clignoter' });

    // RIEN NE TOURNE TANT QUE RIEN NE BAT. C'est la promesse qui permet à
    // l'application de rester légère sur les machines des salles de classe :
    // elle redessine à la demande, elle n'a pas de boucle permanente.
    r.egal('et rien ne tourne encore en arrière-plan',
        await page.evaluate(() => quelqueChoseClignote()), false);

    await page.click('#btn-clignote');
    await page.waitForTimeout(150);
    r.egal('appuyer le met à battre, et le bouton le dit',
        await page.evaluate((id) => {
            const b = document.getElementById('btn-clignote');
            return { bat: !!(freehands.find(f => f.id === id) || {}).clignote,
                     dit: b.textContent.trim(), allume: b.classList.contains('actif') };
        }, idBattant), { bat: true, dit: '✨ Arrêter', allume: true });

    // ÇA SE VOIT VRAIMENT : on échantillonne le même pixel pendant plus d'une
    // période. Lire « clignote: true » ne prouverait que l'interrupteur.
    const bat = await page.evaluate(async () => {
        const lire = () => ctx.getImageData(
            Math.round(260 * (canvas.width / canvas.clientWidth)),
            Math.round(200 * (canvas.height / canvas.clientHeight)), 1, 1).data[0];
        const pris = [];
        for (let i = 0; i < 16; i++) { await new Promise(k => setTimeout(k, 80)); pris.push(lire()); }
        return { min: Math.min(...pris), max: Math.max(...pris), combien: pris.length };
    });
    r.verifie('le trait bat réellement à l\'écran, sans qu\'on touche à rien',
        bat.max - bat.min > 60, JSON.stringify(bat));
    // ET IL NE DISPARAÎT JAMAIS TOUT À FAIT. Un objet qui s'efface pour de bon
    // se cherche du regard ; ce qu'on veut, c'est une respiration.
    r.verifie('mais il ne s\'éteint jamais complètement : c\'est un fondu, pas un éclat',
        bat.max < 250, JSON.stringify(bat));

    // UN EXPORT NE PREND JAMAIS L'OBJET AU CREUX DE SON FONDU. Sinon l'on
    // distribuerait aux élèves une flèche à moitié effacée, au hasard de
    // l'instant où l'on a appuyé.
    const exporte = await page.evaluate(() => {
        enTrainDExporter = true;
        const lire = () => { draw(); return ctx.getImageData(
            Math.round(260 * (canvas.width / canvas.clientWidth)),
            Math.round(200 * (canvas.height / canvas.clientHeight)), 1, 1).data[0]; };
        const pris = [lire(), lire(), lire()];
        enTrainDExporter = false;
        return pris;
    });
    r.egal('pendant un export, il est rendu à pleine encre, à chaque fois',
        exporte, [0, 0, 0]);

    await page.click('#btn-clignote');
    await page.waitForTimeout(400);
    r.egal('on l\'arrête du même bouton',
        await page.evaluate((id) => ({
            bat: !!(freehands.find(f => f.id === id) || {}).clignote,
            dit: document.getElementById('btn-clignote').textContent.trim(),
            enCours: quelqueChoseClignote()
        }), idBattant), { bat: false, dit: '✨ Clignoter', enCours: false });

    // ET LA BOUCLE S'ARRÊTE POUR DE BON : le pixel ne bouge plus.
    const apresLArret = await page.evaluate(async () => {
        const lire = () => ctx.getImageData(
            Math.round(260 * (canvas.width / canvas.clientWidth)),
            Math.round(200 * (canvas.height / canvas.clientHeight)), 1, 1).data[0];
        const pris = [];
        for (let i = 0; i < 8; i++) { await new Promise(k => setTimeout(k, 90)); pris.push(lire()); }
        return { min: Math.min(...pris), max: Math.max(...pris) };
    });
    r.egal('et le trait redevient immobile', apresLArret.max - apresLArret.min, 0);

    // ET LA BOUCLE EST VRAIMENT ARRÊTÉE, pas seulement invisible. Sabotée,
    // une boucle qui tourne pour rien redessine la MÊME image : les pixels
    // n'en disent rien, et la vérification ci-dessus passait. On regarde donc
    // la boucle elle-même. C'est toute la promesse — « ça ne coûte rien quand
    // rien ne clignote » — et une salle de classe tourne sur de vieilles
    // machines : une boucle oubliée, c'est le ventilateur qui part pour
    // l'heure entière.
    r.egal('et plus aucune image n\'est demandée en arrière-plan',
        await page.evaluate(() => battementEnCours), 0);

    // RIEN DE TENU, RIEN À FAIRE BATTRE : l'interrupteur s'efface.
    await page.evaluate(() => { selectedItems = []; updateStyleBarContext(); syncStyleWithSelection(); });
    await page.waitForTimeout(200);
    r.egal('sans sélection, l\'interrupteur s\'efface',
        await page.evaluate(() => getComputedStyle(document.getElementById('btn-clignote')).display), 'none');

    // ---------------------------------------------------------------
    // 9. L'OPACITÉ DE CE QU'ON VA TRACER
    //
    // « On n'a pas l'opacité pour le marqueur. » Le curseur ne paraissait que
    // sur une SÉLECTION — donc jamais quand on tient un outil, et l'on ne
    // pouvait pas choisir la transparence AVANT de tracer. C'est pourtant
    // l'ordre naturel, et pour un marqueur l'opacité n'est pas un ornement :
    // c'est ce qui fait qu'on lit le texte à travers.
    // ---------------------------------------------------------------
    await fermerLaPastille();
    await page.evaluate(() => {
        selectedItems = []; setMode('highlighter');
        updateStyleBarContext(); syncStyleWithSelection();
    });
    await page.waitForTimeout(250);
    r.egal('marqueur en main, sans rien de sélectionné, le curseur est là',
        await surLaBarre(), 'sous la main');
    r.verifie('et il annonce qu\'il règle ce qu\'on VA tracer',
        await page.evaluate(() => /tracer/i.test(document.getElementById('stamp-opacity-box').title || '')),
        await page.evaluate(() => document.getElementById('stamp-opacity-box').title));

    await tirerLeCurseurDeLaBarre(0.35);
    await page.waitForTimeout(250);
    r.egal('le tirer règle l\'encre à venir',
        await page.evaluate(() => activeStyle.strokeOpacity), 0.35);

    // ET LE TRAIT SUIVANT LA PORTE VRAIMENT. Régler un réglage que le tracé
    // n'écoute pas, c'est ce qu'on vient de corriger : on trace pour de bon.
    const traceApres = await page.evaluate(async () => {
        freehands.length = 0; panX = 0; panY = 0; zoom = 1;
        const b = document.getElementById('board').getBoundingClientRect();
        return { x: Math.round(b.left + 300), y: Math.round(b.top + 300) };
    });
    await page.mouse.move(traceApres.x, traceApres.y);
    await page.mouse.down();
    await page.mouse.move(traceApres.x + 120, traceApres.y + 30, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    r.egal('le trait qui suit naît avec cette transparence-là',
        await page.evaluate(() => (freehands[0] || {}).strokeOpacity !== undefined
            ? freehands[0].strokeOpacity : activeStyle.strokeOpacity), 0.35);

    // ---------------------------------------------------------------
    // 10. CE QUI EST PRIS SE VOIT — ET SON CADRE NE PÂLIT PAS
    //
    // « Comment je sais que le gribouillis et la ligne sont sélectionnés ?
    // Faut-il les mettre en surbrillance ou un cadre autour ? » Un trait pris
    // ne portait qu'un halo flou ; le bloc de texte à côté avait un cadre net.
    // Le même tableau parlait deux langues.
    //
    // Puis : « Attention, l'opacité ne doit pas concerner le cadre de
    // sélection. » Le cadre pâlissait avec l'objet — sur un texte estompé, ses
    // poignées devenaient invisibles, et l'on ne pouvait plus attraper ce
    // qu'on venait justement de rendre discret.
    // ---------------------------------------------------------------
    const cadre = await page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        freehands.length = 0; texts.length = 0; images.length = 0; points.length = 0;
        selectedItems = []; setMode('pointer');
        const f = { id: nextId++, points: [{ x: 200, y: 200 }, { x: 400, y: 260 }, { x: 300, y: 320 }],
                    color: '#e74c3c', width: 3, z: globalZ++, opacity: 0.1 };
        freehands.push(f);
        const lire = (x, y) => { const d = ctx.getImageData(
            Math.round(x * (canvas.width / canvas.clientWidth)),
            Math.round(y * (canvas.height / canvas.clientHeight)), 1, 1).data; return [d[0], d[1], d[2]]; };
        // Le bord haut du cadre attendu : la boîte va de 200 à 400, plus 7 px
        // de respiration, donc y = 193.
        const balayer = () => { const v = []; for (let x = 195; x <= 405; x += 2) v.push(lire(x, 193)); return v; };
        const violets = (v) => v.filter(c => c[2] > c[0] + 20).length;
        selectedItems = []; draw();
        const sans = violets(balayer());
        selectedItems = [{ type: 'freehand', id: f.id }]; draw();
        const avec = violets(balayer());
        return { sans, avec, boite: boiteDUnObjet('freehand', f) };
    });
    r.egal('un gribouillis non pris n\'a aucun cadre', cadre.sans, 0);
    r.verifie('pris, il en reçoit un, tracé sur toute sa boîte',
        cadre.avec > 20, JSON.stringify(cadre));
    r.egal('et la boîte épouse vraiment le tracé', cadre.boite,
        { x: 200, y: 200, w: 200, h: 120 });

    // LE CADRE RESTE À PLEINE ENCRE, MÊME SUR UN OBJET À DIX POUR CENT.
    const cadreDuTexte = await page.evaluate(() => {
        texts.length = 0; freehands.length = 0; selectedItems = [];
        const t = { id: nextId++, x: 300, y: 400, text: 'abc', content: 'abc',
                    color: '#e74c3c', fontSize: 40, z: globalZ++, opacity: 0.1 };
        texts.push(t);
        selectedItems = [{ type: 'text', id: t.id }];
        draw();
        const lire = (x, y) => { const d = ctx.getImageData(
            Math.round(x * (canvas.width / canvas.clientWidth)),
            Math.round(y * (canvas.height / canvas.clientHeight)), 1, 1).data; return [d[0], d[1], d[2]]; };
        const b = boiteDuTexte(t);
        const v = [];
        for (let x = Math.round(b.x); x < Math.round(b.x + b.w); x += 2) v.push(lire(x, Math.round(b.y)));
        return v.reduce((a, c) => (c[0] + c[1] + c[2] < a[0] + a[1] + a[2] ? c : a), [255, 255, 255]);
    });
    // #6c5ce7 vaut [108, 92, 231]. On tolère un pixel d'anticrénelage.
    r.verifie('le cadre d\'un texte à dix pour cent reste à pleine encre',
        Math.abs(cadreDuTexte[0] - 108) <= 6 && Math.abs(cadreDuTexte[1] - 92) <= 6
        && Math.abs(cadreDuTexte[2] - 231) <= 6, JSON.stringify(cadreDuTexte));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
