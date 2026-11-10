// LE COMPAS S'OUVRE JUSQU'AU BORD, PAS AU-DELÀ — ET IL LE DIT.
//
// « Des trait de compas qui ne veulent pas se faire car ils atteignent une
// sorte de limite. »
//
// La limite était le BORD DE L'ÉCRAN, et elle était muette. Mesuré sur un
// écran de 1280 de large, compas au centre :
//
//   écartement 450 → mine à 1090, l'arc se fait ;
//   écartement 600 → mine à 1240, l'arc se fait encore ;
//   écartement 800 → mine à 1440, HORS DE L'ÉCRAN, aucun arc.
//
// Un compas se prend par sa MINE : il n'y avait plus rien sous le doigt.
// « getHitZone » répondait pourtant encore « trace » — le compas se croyait
// saisissable —, et l'arc ne se faisait jamais. Rien ne le disait, et l'on
// réessayait en croyant mal viser.
//
// ON NE DÉPLACE PAS LA POINTE POUR RATTRAPER LA MINE : c'est la tentation, et
// c'est faux. En géométrie la pointe est posée sur un point précis — un
// sommet, un milieu —, et la bouger ruine la construction en cours. La pointe
// reste où l'enseignant l'a mise.
//
// On borne donc l'écartement à ce que la place utile permet, mine comprise.
// La limite devient celle du TABLEAU — physique, et qu'on comprend —, la mine
// reste sous le doigt, et le chemin vers un plus grand cercle est dit :
// dézoomer. En coordonnées du tableau le cercle n'a plus de plafond du tout.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le compas s\'ouvre jusqu\'au bord');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    await page.evaluate(() => {
        const b = document.querySelector('.btn[data-widget="compass"]');
        if (b) b.click();
    });
    await page.waitForTimeout(300);
    r.verifie('le compas est posé sur le tableau',
        await page.evaluate(() => !!(widgets && widgets.compass)));

    // Le compas, pointe posée à gauche pour laisser de la course à la mine.
    const poser = (rayon) => page.evaluate((rr) => {
        const w = widgets.compass;
        w.x = (300 - panX) / zoom; w.y = (400 - panY) / zoom;
        w.radius = rr; w.angle = 0;
        if (typeof draw === 'function') draw();
        const POIGNEE = 30;
        const g = w.toGlobal(w.radius + POIGNEE, -35);   // la pastille ↔
        return { poignee: [g.x * zoom + panX, g.y * zoom + panY] };
    }, rayon);

    const ouDonc = () => page.evaluate(() => {
        const w = widgets.compass;
        const mx = w.x + w.radius * Math.cos(w.angle);
        const my = w.y + w.radius * Math.sin(w.angle);
        const ex = mx * zoom + panX, ey = my * zoom + panY;
        return {
            rayon: Math.round(w.radius),
            mine: [Math.round(ex), Math.round(ey)],
            dansLEcran: ex >= 0 && ex <= window.innerWidth && ey >= 0 && ey <= window.innerHeight,
            plafond: Math.round(plafondDeLOuvertureDuCompas(w))
        };
    });

    // ------------------------------------------------------------------
    // 1. ON TIRE LA PASTILLE ↔ BIEN AU-DELÀ DU BORD DROIT.
    //    C'est le geste de l'enseignant qui veut un grand cercle : il ouvre,
    //    il ouvre, et avant le correctif le compas devenait muet sans un mot.
    // ------------------------------------------------------------------
    const depart = await poser(150);
    await page.mouse.move(depart.poignee[0], depart.poignee[1]);
    await page.mouse.down();
    for (let x = depart.poignee[0]; x <= 1280 + 500; x += 40) {
        await page.mouse.move(x, depart.poignee[1]);
    }
    await page.mouse.up();
    await page.waitForTimeout(180);

    const grandOuvert = await ouDonc();
    r.verifie('tiré loin dehors, le compas s\'est VRAIMENT ouvert (pas bloqué à son départ)',
        grandOuvert.rayon > 600, JSON.stringify(grandOuvert));
    r.egal('ET LA MINE EST RESTÉE DANS L\'ÉCRAN — c\'est par elle qu\'on trace',
        grandOuvert.dansLEcran, true, JSON.stringify(grandOuvert));
    r.verifie('l\'écartement s\'est arrêté au plafond de la place, pas avant',
        Math.abs(grandOuvert.rayon - grandOuvert.plafond) <= 2, JSON.stringify(grandOuvert));

    // ------------------------------------------------------------------
    // 2. ET L'ARC SE FAIT À CET ÉCARTEMENT MAXIMAL. C'est la plainte
    //    elle-même : « le trait ne veut pas se faire ». On trace un tiers de
    //    tour en tournant le doigt PRÈS DU CENTRE — le compas se mène par
    //    l'angle, on n'a pas à suivre le cercle.
    // ------------------------------------------------------------------
    const tracer = async (degres) => {
        const d = await page.evaluate(() => {
            arcs.length = 0;
            const w = widgets.compass;
            const mx = w.x + w.radius * Math.cos(w.angle);
            const my = w.y + w.radius * Math.sin(w.angle);
            return { cx: w.x * zoom + panX, cy: w.y * zoom + panY,
                     mx: mx * zoom + panX, my: my * zoom + panY };
        });
        await page.mouse.move(d.mx, d.my);
        await page.mouse.down();
        for (let a = 0; a <= degres; a += 6) {
            const t = a * Math.PI / 180;
            await page.mouse.move(d.cx + 70 * Math.cos(t), d.cy + 70 * Math.sin(t));
        }
        await page.mouse.up();
        await page.waitForTimeout(140);
        return page.evaluate(() => ({
            combien: arcs.length,
            degres: arcs.length ? Math.round((arcs[0].endAngle - arcs[0].startAngle) * 180 / Math.PI) : null,
            rayon: arcs.length ? Math.round(arcs[0].radius) : null
        }));
    };
    const arc = await tracer(120);
    // Le dernier pas du doigt dépasse d'un degré ou deux la consigne : on
    // mesure que l'arc EST FAIT et qu'il fait le tour, pas la précision de
    // la souris de Playwright.
    r.verifie('L\'ARC SE FAIT au plus grand écartement, et il fait le tour demandé',
        arc.combien === 1 && Math.abs(arc.degres - 120) <= 3, JSON.stringify(arc));
    r.verifie('et il a bien le rayon du compas, pas un autre',
        arc.rayon !== null && Math.abs(arc.rayon - grandOuvert.rayon) <= 2,
        JSON.stringify([arc, grandOuvert.rayon]));

    // ------------------------------------------------------------------
    // 3. LE PETIT COMPAS N'EST PAS GÊNÉ. La borne ne doit toucher que ce qui
    //    sortait : un écartement ordinaire se règle au pixel comme avant.
    // ------------------------------------------------------------------
    const p2 = await poser(150);
    await page.mouse.move(p2.poignee[0], p2.poignee[1]);
    await page.mouse.down();
    await page.mouse.move(p2.poignee[0] + 100, p2.poignee[1], { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const petit = await ouDonc();
    r.verifie('un écartement qui tient dans l\'écran n\'est pas borné',
        petit.rayon >= 240 && petit.rayon <= 262 && petit.rayon < petit.plafond,
        JSON.stringify(petit));

    // ------------------------------------------------------------------
    // 4. LE PLAFOND EST CELUI DE L'ÉCRAN, DONC IL SUIT LE GROSSISSEMENT.
    //    C'est ce qui rend la phrase « dézoomez pour un plus grand cercle »
    //    vraie : à moitié de grossissement, le plafond double en coordonnées
    //    du tableau. Le cercle n'a pas de limite ; l'écran en a une.
    // ------------------------------------------------------------------
    const plafonds = await page.evaluate(() => {
        const w = widgets.compass;
        w.x = (300 - panX) / zoom; w.y = (400 - panY) / zoom; w.angle = 0;
        const unAZoom1 = plafondDeLOuvertureDuCompas(w);
        const z = zoom;
        zoom = 0.5;
        w.x = (300 - panX) / zoom; w.y = (400 - panY) / zoom;
        const unADemiZoom = plafondDeLOuvertureDuCompas(w);
        zoom = z;
        return [Math.round(unAZoom1), Math.round(unADemiZoom)];
    });
    r.verifie('dézoomer de moitié double le plafond du cercle sur le tableau',
        Math.abs(plafonds[1] - 2 * plafonds[0]) <= 4, JSON.stringify(plafonds));

    // ------------------------------------------------------------------
    // 5. UN COMPAS DÉJÀ TROP OUVERT SE REFERME QUAND ON LE REDEMANDE.
    //    Un tableau rouvert sur un écran plus petit, ou un grossissement pris
    //    après l'ouverture : la mine est dehors et rien ne la ramène. Le
    //    bouton de l'instrument, qui le remet sous la main, doit rendre un
    //    instrument DONT ON PEUT SE SERVIR.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        widgets.compass.radius = 2000;          // bien au-delà de tout écran
        widgets.compass.angle = 0;
        widgets.compass.x = (300 - panX) / zoom;
        widgets.compass.y = (400 - panY) / zoom;
    });
    const avantRappel = await ouDonc();
    r.egal('posé à 2000 d\'écartement, la mine est bien hors de l\'écran',
        avantRappel.dansLEcran, false, JSON.stringify(avantRappel));

    // On éteint puis rallume : c'est le geste « rends-moi mon compas ».
    await page.evaluate(() => {
        const b = document.querySelector('.btn[data-widget="compass"]');
        b.click(); b.click();
    });
    await page.waitForTimeout(300);
    const apresRappel = await ouDonc();
    r.egal('redemandé, il revient avec sa mine SOUS LA MAIN',
        apresRappel.dansLEcran, true, JSON.stringify(apresRappel));
    const arcApres = await tracer(90);
    r.verifie('et il trace', arcApres.combien === 1 && Math.abs(arcApres.degres - 90) <= 3,
        JSON.stringify(arcApres));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
