// L'INSTRUMENT REVIENT SOUS LA MAIN
//
// « Je dessine au compas. Ça a marché une fois. Sur un pdf en plein écran j'ai
// recliqué sur le compas. D'abord il était loin, ce serait bien qu'on le voie
// tout de suite dans l'écran visible. Et aussi j'ai voulu redessiner avec le
// compas et le tracé n'est pas resté ; mais en bougeant le pdf après, c'est
// revenu. »
//
// DEUX PLAINTES, UNE SEULE CAUSE, et c'est la première qui fabrique la
// seconde.
//
// L'instrument n'était construit qu'à la PREMIÈRE activation, et il garde ses
// coordonnées de MONDE. Projeter une page change le zoom et le décalage du
// tableau — mesuré, le zoom passe de 1 à 1,98 : le compas posé au milieu de
// l'écran d'avant se retrouve n'importe où, et rallumer son bouton ne le
// ramenait pas, puisqu'il existait déjà.
//
// Là où il atterrit, on trace. Or pendant une projection UN VOILE À
// QUATRE-VINGT-QUATORZE POUR CENT couvre tout sauf la page. Mesuré : un trait
// rouge posé DANS la page se lit « #ff0000 » ; le même trait posé dans la
// marge se lit « #221517 », qui est la couleur du voile. Le tracé était bien
// là, et invisible. Bouger le PDF faisait passer le trou du voile par-dessus :
// « c'est revenu ».
//
// D'OÙ LA RÈGLE : on ramène l'instrument là où ce qu'on pose SE VERRA — le
// milieu de la page projetée quand il y en a une, le milieu de l'écran sinon.
// Et seulement s'il a disparu : « il reste où on l'a mis » vaut pour lui comme
// pour toutes les barres de cette application.
const { creerRapport, ouvrirApp, fichePdf } = require('./harness.cjs');

const INSTRUMENTS = ['compass', 'ruler', 'setsquare', 'protractor'];

module.exports = async function (browser) {
    const r = creerRapport('L\'instrument revient sous la main');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(() => typeof instrumentEnVue === 'function', { timeout: 20000 });
    await page.waitForTimeout(400);

    const bouton = (nom) => page.evaluate((n) =>
        document.querySelector('.btn[data-widget="' + n + '"]').click(), nom);
    const lire = (nom) => page.evaluate((n) => {
        const w = widgets[n];
        if (!w) return null;
        return { monde: { x: Math.round(w.x), y: Math.round(w.y) },
                 ecran: { x: Math.round(w.x * zoom + panX), y: Math.round(w.y * zoom + panY) },
                 enVue: instrumentEnVue(w) };
    }, nom);

    // ------------------------------------------------------------------
    // 1. POSÉ POUR LA PREMIÈRE FOIS, IL EST DANS L'ÉCRAN
    // ------------------------------------------------------------------
    await bouton('compass');
    await page.waitForTimeout(300);
    const pose = await lire('compass');
    r.verifie('le compas existe une fois le bouton allumé', !!pose, JSON.stringify(pose));
    r.egal('et il est dans l\'écran', pose.enVue, true, JSON.stringify(pose));

    // ------------------------------------------------------------------
    // 2. IL RESTE OÙ ON L'A MIS — tant qu'on l'y voit
    //
    // Ce contrôle est le garde-fou de l'autre : la règle n'est pas « le
    // compas retourne au milieu », c'est « le compas ne disparaît pas ». Un
    // instrument qu'on a placé sous une figure et qui saute au centre à
    // chaque allumage serait un défaut de plus, pas un de moins.
    // ------------------------------------------------------------------
    await page.evaluate(() => { widgets.compass.x += 120; widgets.compass.y -= 80; draw(); });
    const deplace = await lire('compass');
    await bouton('compass'); await page.waitForTimeout(200);
    await bouton('compass'); await page.waitForTimeout(300);
    const repris = await lire('compass');
    r.egal('déplacé de peu, il est toujours en vue', deplace.enVue, true, JSON.stringify(deplace));
    r.egal('ET IL NE BOUGE PAS QUAND ON LE REPREND', repris.monde, deplace.monde);

    // ------------------------------------------------------------------
    // 3. PERDU AU LOIN, IL REVIENT
    // ------------------------------------------------------------------
    await page.evaluate(() => { widgets.compass.x += 3000; draw(); });
    const perdu = await lire('compass');
    await bouton('compass'); await page.waitForTimeout(200);
    await bouton('compass'); await page.waitForTimeout(300);
    const revenu = await lire('compass');
    r.egal('éloigné de trois mille pixels, il n\'est plus en vue', perdu.enVue, false, JSON.stringify(perdu));
    r.egal('LE RALLUMER LE RAMÈNE', revenu.enVue, true, JSON.stringify(revenu));

    // ------------------------------------------------------------------
    // 4. ET CELA VAUT POUR LES QUATRE INSTRUMENTS
    //
    // Ils partagent un seul bouton et un seul chemin : les mesurer tous les
    // quatre coûte quatre lignes et empêche qu'on répare le compas seul.
    // ------------------------------------------------------------------
    for (const nom of INSTRUMENTS) {
        if (nom !== 'compass') { await bouton(nom); await page.waitForTimeout(250); }
        await page.evaluate((n) => { widgets[n].x -= 2500; draw(); }, nom);
        const avant = await lire(nom);
        await bouton(nom); await page.waitForTimeout(180);
        await bouton(nom); await page.waitForTimeout(280);
        const apres = await lire(nom);
        r.egal('« ' + nom +' » perdu revient en vue',
            { avant: avant.enVue, apres: apres.enVue }, { avant: false, apres: true });
        await bouton(nom); await page.waitForTimeout(150);   // on le range
    }

    // ------------------------------------------------------------------
    // 5. EN PROJECTION, IL REVIENT SUR LA PAGE — pas dans la marge
    //
    // C'est tout l'objet : la marge est sous le voile, et l'on y dessinerait
    // pour rien.
    // ------------------------------------------------------------------
    const octets = Array.from(fichePdf(3));
    await page.evaluate(async ({ octets }) => {
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'fiche.pdf', { type: 'application/pdf' }));
        await new Promise(ok => setTimeout(ok, 1500));
        selectedItems = [{ type: 'image', id: images[0].id }];
        // « page entière » : c'est le cadrage qui laisse des marges, donc le
        // seul où le voile a quelque chose à couvrir.
        presenterLeDocument('page');
    }, { octets });
    await page.waitForTimeout(1000);

    const cadre = await page.evaluate(() => {
        const d = getObjectById('image', presentationEnCours);
        return { x: Math.round(d.x * zoom + panX), y: Math.round(d.y * zoom + panY),
                 l: Math.round(d.w * zoom), h: Math.round(d.h * zoom),
                 ecran: { l: innerWidth, h: innerHeight } };
    });
    r.verifie('la page projetée laisse bien une marge de chaque côté',
        cadre.x > 20 && cadre.x + cadre.l < cadre.ecran.l - 20, JSON.stringify(cadre));

    // LE FAIT QUI JUSTIFIE TOUT LE RESTE, mesuré et non supposé : ce qu'on
    // pose dans la marge passe sous le voile. Si cette règle change un jour,
    // ce contrôle tombera — et ce sera le bon moment pour rouvrir la question.
    const encre = await page.evaluate(async ({ cadre }) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        setMode('freehand');
        activeStyle.strokeColor = '#ff0000'; activeStyle.lineWidth = 8;
        const trait = async (x0, y0, x1) => {
            const ev = (t, x, y) => canvas.dispatchEvent(new PointerEvent(t, {
                clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse',
                buttons: t === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
            ev('pointerdown', x0, y0);
            for (let i = 1; i <= 8; i++) ev('pointermove', x0 + (x1 - x0) * i / 8, y0);
            ev('pointerup', x1, y0);
            await attendre(200);
        };
        const y = cadre.y + Math.round(cadre.h / 2);
        await trait(cadre.x + 40, y, cadre.x + 160);          // dans la page
        const margeX = Math.round(cadre.x / 2) - 30;
        await trait(margeX, y, margeX + 60);                   // dans la marge
        await attendre(400);
        const g = document.getElementById('board').getContext('2d');
        const lireP = (x, yy) => { const d = g.getImageData(x, yy, 1, 1).data;
            return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); };
        return { traits: freehands.length,
                 dansLaPage: lireP(cadre.x + 100, y), dansLaMarge: lireP(margeX + 30, y) };
    }, { cadre });
    r.egal('deux traits ont bien été posés', encre.traits, 2, JSON.stringify(encre));
    r.egal('dans la page, l\'encre se voit', encre.dansLaPage, '#ff0000');
    r.verifie('DANS LA MARGE, LE VOILE LA COUVRE — c\'est pourquoi l\'instrument revient sur la page',
        encre.dansLaMarge !== '#ff0000', encre.dansLaMarge);

    // Et maintenant l'instrument : perdu dans la marge, il revient SUR la page.
    await page.evaluate(() => { setMode('pointer'); });
    await bouton('compass'); await page.waitForTimeout(250);
    await page.evaluate((x) => { widgets.compass.x = (x - panX) / zoom; draw(); },
        Math.max(10, Math.round(cadre.x / 2)));
    await bouton('compass'); await page.waitForTimeout(180);
    await bouton('compass'); await page.waitForTimeout(350);
    const surLaPage = await page.evaluate(() => {
        const w = widgets.compass;
        const d = getObjectById('image', presentationEnCours);
        const x = w.x * zoom + panX, y = w.y * zoom + panY;
        const px = d.x * zoom + panX, py = d.y * zoom + panY;
        return { x: Math.round(x), y: Math.round(y),
                 dedans: x > px && x < px + d.w * zoom && y > py && y < py + d.h * zoom };
    });
    r.egal('L\'INSTRUMENT REVIENT SUR LA PAGE PROJETÉE', surLaPage.dedans, true, JSON.stringify(surLaPage));

    // ------------------------------------------------------------------
    // 6. ET JAMAIS SOUS UNE BARRE : LÀ, LE COMPAS NE TRACE PAS DU TOUT
    //
    // Les barres sont posées PAR-DESSUS la toile. Un appui qui tombe sur
    // l'une d'elles ne parvient jamais au tableau — « if (e.target !== canvas)
    // return » est la toute première ligne du gestionnaire. Mesuré : mine du
    // compas en (700, 801), « elementFromPoint » rend un bouton de la barre de
    // style, et le geste entier ne crée AUCUN arc. Ce n'est pas un tracé raté,
    // c'est un geste qui n'existe pas.
    //
    // ET C'EST LA MINE QU'IL FAUT REGARDER, pas le centre : un compas se prend
    // par sa mine. Sa pointe sèche peut être au beau milieu de l'écran pendant
    // que la mine, à cent cinquante pixels de là, est sous la barre du bas.
    const sousLaBarre = await page.evaluate(() => {
        const b = document.getElementById('bar-style').getBoundingClientRect();
        const w = widgets.compass;
        // LA MINE VERS LE BAS, ET LE CENTRE BIEN AU MILIEU. C'est le seul
        // placement qui sépare les deux : un compas tourné vers le bas, dont
        // la pointe sèche est en plein écran et la mine, à cent cinquante
        // pixels de là, sous la barre. Le premier jet posait les DEUX sous la
        // barre — le contrôle passait alors même sans regarder la mine, et ne
        // mesurait donc rien.
        w.angle = Math.PI / 2;
        w.x = (b.left + b.width / 2 - panX) / zoom;
        w.y = (b.top + b.height / 2 - panY) / zoom - w.radius;
        draw();
        const m = w.toGlobal(w.radius, 0);
        const p = { x: Math.round(m.x * zoom + panX), y: Math.round(m.y * zoom + panY) };
        const el = document.elementFromPoint(p.x, p.y);
        // Le centre se juge sur LA MÊME place que la mine : le comparer à
        // l'écran entier ferait croire à une différence qui n'en est pas une.
        const r = rectangleUtileDeLaVue();
        const cx = w.x * zoom + panX, cy = w.y * zoom + panY;
        return { mine: p, sous: el ? (el.id || el.tagName) : null,
                 centre: { x: Math.round(cx), y: Math.round(cy) },
                 centreEnVue: cx > r.x1 + 40 && cx < r.x2 - 40 && cy > r.y1 + 40 && cy < r.y2 - 40,
                 enVue: instrumentEnVue(w), arcs: arcs.length };
    });
    r.verifie('la mine est bien tombée sur la barre, pas sur la toile',
        sousLaBarre.sous !== 'board' && sousLaBarre.sous !== 'CANVAS', JSON.stringify(sousLaBarre));
    // LE PIÈGE EN UNE LIGNE : le centre est parfaitement visible, et pourtant
    // l'instrument est inutilisable. Regarder le seul centre laissait passer
    // exactement ce cas-là.
    r.egal('son centre, lui, est en pleine place utile', sousLaBarre.centreEnVue, true, JSON.stringify(sousLaBarre));
    r.egal('ET L\'INSTRUMENT EST POURTANT DÉCLARÉ HORS D\'USAGE', sousLaBarre.enVue, false, JSON.stringify(sousLaBarre));

    // On essaie vraiment de tracer, à la souris : le geste ne donne rien.
    await page.mouse.move(sousLaBarre.mine.x, sousLaBarre.mine.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        const pt = await page.evaluate((a) => {
            const w = widgets.compass;
            const g = w.toGlobal(w.radius * Math.cos(a), w.radius * Math.sin(a));
            return { x: Math.round(g.x * zoom + panX), y: Math.round(g.y * zoom + panY) };
        }, -(i / 12) * 1.2);
        await page.mouse.move(pt.x, pt.y);
    }
    await page.mouse.up();
    await page.waitForTimeout(350);
    r.egal('le geste sous la barre ne trace rien — c\'est le défaut mesuré',
        await page.evaluate(() => arcs.length), sousLaBarre.arcs);

    // Et le rallumer remet la MINE sur la toile.
    await bouton('compass'); await page.waitForTimeout(200);
    await bouton('compass'); await page.waitForTimeout(350);
    const remise = await page.evaluate(() => {
        const w = widgets.compass;
        const m = w.toGlobal(w.radius, 0);
        const p = { x: Math.round(m.x * zoom + panX), y: Math.round(m.y * zoom + panY) };
        const el = document.elementFromPoint(p.x, p.y);
        return { mine: p, sous: el ? (el.id || el.tagName) : null, enVue: instrumentEnVue(w) };
    });
    r.egal('LA MINE REVIENT SUR LA TOILE', remise.sous, 'board', JSON.stringify(remise));
    r.egal('et l\'instrument est de nouveau utilisable', remise.enVue, true, JSON.stringify(remise));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
