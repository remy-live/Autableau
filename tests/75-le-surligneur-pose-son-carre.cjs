// LE SURLIGNEUR POSE SON CARRÉ, ET SUIT LA LIGNE DU CRAYON
//
// « Pour le surligneur, si je clique et que je ne bouge pas, ça ne dessine
// pas ; je voudrais au moins que ça dessine le carré de base. Est-ce possible
// de linéariser le tracé comme le crayon ? »
//
// DEUX CHOSES, ET LA PREMIÈRE TENAIT EN UN POINT. Un trait d'un seul point
// était refusé partout : l'aperçu en direct ne le dessinait pas, et le
// relâchement le JETAIT au lieu de le poser. Poser le doigt sans bouger ne
// laissait donc rien — ni carré de surligneur, ni point de crayon. On aurait pu
// écrire l'exception aux trois endroits ; il valait mieux qu'elle n'existe pas.
// Le point de départ est posé DEUX FOIS : le trait a toujours au moins deux
// points, et tout ce qui le dessine, le mesure, l'exporte ou le retrouve marche
// sans rien savoir de ce cas.
//
// LA SECONDE EST UNE HISTOIRE DE LIGNE. Le crayon ne relie pas les points
// relevés : il fait passer une quadratique par les MILIEUX des segments, ce qui
// lui donne sa ligne posée là où le relevé, lui, tremble. Le surligneur
// traînait son nez carré sur les points BRUTS — le même geste donnait une ligne
// anguleuse à côté d'une ligne lisse. Il échantillonne maintenant la MÊME
// courbe.
//
// ON MESURE CE QUI EST PEINT, et non ce que le code se raconte : l'encre est
// relue sur le tableau lui-même.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le surligneur pose son carré');
    const { page, context, erreurs } = await ouvrirApp(browser, {});

    // Ce qui est peint dans un carré de côté 2r autour d'un point : combien de
    // pixels d'encre, et l'étendue de la tache.
    const outils = () => page.evaluate(() => {
        window.__epreuveSurligneur = {
            attendre: (ms) => new Promise(ok => setTimeout(ok, ms)),
            tracer: (pts) => {
                const cv = document.getElementById('board');
                cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true,
                    clientX: pts[0][0], clientY: pts[0][1], pointerId: 1, button: 0,
                    isPrimary: true, pressure: 0.5 }));
                for (let i = 1; i < pts.length; i++)
                    cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true,
                        clientX: pts[i][0], clientY: pts[i][1], pointerId: 1,
                        isPrimary: true, pressure: 0.5 }));
                const f = pts[pts.length - 1];
                cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true,
                    clientX: f[0], clientY: f[1], pointerId: 1, button: 0, isPrimary: true }));
            },
            // L'encre relue sur le tableau : le fond est blanc, tout ce qui s'en
            // écarte est de l'encre.
            encre: (x, y, l, h) => {
                const cv = document.getElementById('board');
                const d = cv.getContext('2d').getImageData(x * devicePixelRatio, y * devicePixelRatio,
                    l * devicePixelRatio, h * devicePixelRatio).data;
                const L = Math.round(l * devicePixelRatio);
                const masque = new Set();
                let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
                for (let j = 0; j < d.length; j += 4) {
                    if (d[j] < 245 || d[j + 1] < 245 || d[j + 2] < 245) {
                        const k = j / 4, px = k % L, py = Math.floor(k / L);
                        n++; masque.add(px + ',' + py);
                        if (px < minX) minX = px; if (px > maxX) maxX = px;
                        if (py < minY) minY = py; if (py > maxY) maxY = py;
                    }
                }
                return { n: Math.round(n / (devicePixelRatio * devicePixelRatio)),
                         l: n ? Math.round((maxX - minX + 1) / devicePixelRatio) : 0,
                         h: n ? Math.round((maxY - minY + 1) / devicePixelRatio) : 0,
                         masque: [...masque] };
            },
            effacer: () => {
                freehands.length = 0;
                if (typeof draw === 'function') draw();
            },
        };
        return true;
    });
    await outils();

    // ------------------------------------------------------------------
    // 1. ON CLIQUE SANS BOUGER, ET QUELQUE CHOSE EST POSÉ
    // ------------------------------------------------------------------
    const clic = await page.evaluate(async () => {
        const E = window.__epreuveSurligneur;
        const out = {};
        E.effacer();
        setMode('highlighter'); await E.attendre(80);
        boutDuSurligneur = 'carre';
        E.tracer([[500, 300]]);
        await E.attendre(250);
        out.traits = freehands.length;
        out.large = freehands.length ? Math.round(freehands[0].width) : 0;
        out.tache = E.encre(460, 260, 80, 80);
        delete out.tache.masque;

        E.effacer();
        setMode('freehand'); await E.attendre(80);
        E.tracer([[300, 300]]);
        await E.attendre(250);
        out.crayonTraits = freehands.length;
        out.crayon = E.encre(270, 270, 60, 60);
        delete out.crayon.masque;
        return out;
    });
    r.egal('un clic sans bouger pose bien un trait', clic.traits, 1, JSON.stringify(clic));
    r.verifie('et il peint quelque chose', clic.tache.n > 0, JSON.stringify(clic.tache));
    // LE CARRÉ DE BASE : aussi large que haut, et à la largeur du surligneur.
    r.egal('la tache est un carré', [clic.tache.l, clic.tache.h],
        [clic.large, clic.large], JSON.stringify(clic));
    r.verifie('et il est plein',
        clic.tache.n >= clic.large * clic.large * 0.95,
        clic.tache.n + ' pixels pour ' + clic.large + '×' + clic.large);
    // LE CRAYON AUSSI POSE SON POINT : la correction ne vaut pas que pour le
    // surligneur, puisqu'elle est au même endroit pour les deux.
    r.egal('le crayon aussi pose son point', clic.crayonTraits, 1, JSON.stringify(clic));
    r.verifie('et ce point est rond, pas carré',
        clic.crayon.n > 0 && clic.crayon.n < clic.crayon.l * clic.crayon.h * 0.9,
        JSON.stringify(clic.crayon));

    // ------------------------------------------------------------------
    // 2. LE SURLIGNEUR SUIT LA MÊME LIGNE QUE LE CRAYON
    // ------------------------------------------------------------------
    // ON NE COMPARE PAS DES FORMULES, ON COMPARE DEUX ENCRES. Le même geste est
    // fait au crayon puis au surligneur : le trait fin doit tenir ENTIÈREMENT
    // dans le large. Si le surligneur suivait une autre ligne — celle des
    // points bruts, qui coupe au plus court dans les virages — le crayon en
    // sortirait dans chaque courbe.
    const GESTE = [];
    for (let k = 0; k <= 40; k++) {
        GESTE.push([300 + k * 8, 300 + Math.round(70 * Math.sin(k / 3.2))]);
    }
    const suivi = await page.evaluate(async (geste) => {
        const E = window.__epreuveSurligneur;
        const BOITE = [280, 200, 380, 200];
        E.effacer();
        setMode('freehand'); await E.attendre(80);
        E.tracer(geste);
        await E.attendre(250);
        const fin = E.encre(BOITE[0], BOITE[1], BOITE[2], BOITE[3]);

        E.effacer();
        setMode('highlighter'); await E.attendre(80);
        boutDuSurligneur = 'carre';
        E.tracer(geste);
        await E.attendre(250);
        const large = E.encre(BOITE[0], BOITE[1], BOITE[2], BOITE[3]);

        const dedans = new Set(large.masque);
        const dehors = fin.masque.filter(p => !dedans.has(p)).length;
        return { finN: fin.n, largeN: large.n, dehors,
                 part: fin.masque.length ? dehors / fin.masque.length : 1 };
    }, GESTE);
    r.verifie('les deux gestes ont bien peint', suivi.finN > 200 && suivi.largeN > 2000,
        JSON.stringify(suivi));
    // CE CONTRÔLE DIT UNE VÉRITÉ SANS LA MESURER, et il faut le savoir : le
    // surligneur fait dix-huit pixels de large, et l'écart entre la ligne
    // brute et la ligne adoucie est plus petit que cela. Saboté en remettant
    // les points bruts, il reste vert. C'est celui d'en dessous qui mord.
    r.verifie('le trait du crayon tient entier dans celui du surligneur',
        suivi.part < 0.01,
        Math.round(suivi.part * 1000) / 10 + ' % du crayon dépasse (' + suivi.dehors + ' pixels)');

    // LÀ OÙ LES DEUX LIGNES DIFFÈRENT VRAIMENT : LE COIN.
    //
    // Une quadratique passée par les milieux de segments COUPE le coin d'un
    // angle vif — c'est ce qui fait la ligne posée du crayon. Le nez carré,
    // traîné sur les points bruts, allait au contraire jusqu'à la pointe. On
    // trace donc le même V des deux outils, et l'on regarde la pointe : ni
    // l'un ni l'autre ne doit y laisser d'encre. Mesuré avant la correction,
    // le surligneur y posait mille trois cent trente-huit pixels quand le
    // crayon n'y posait rien.
    const coin = await page.evaluate(async () => {
        const E = window.__epreuveSurligneur;
        const V = [[300, 200], [400, 400], [500, 200]];
        const POINTE = [385, 360, 30, 50];
        const lire = async (mode) => {
            E.effacer();
            setMode(mode); await E.attendre(80);
            if (mode === 'highlighter') boutDuSurligneur = 'carre';
            E.tracer(V);
            await E.attendre(250);
            const tout = E.encre(280, 180, 240, 240);
            const pointe = E.encre(POINTE[0], POINTE[1], POINTE[2], POINTE[3]);
            return { tout: tout.n, pointe: pointe.n };
        };
        return { crayon: await lire('freehand'), surligneur: await lire('highlighter') };
    });
    r.verifie('le V est bien tracé des deux outils',
        coin.crayon.tout > 100 && coin.surligneur.tout > 3000, JSON.stringify(coin));
    r.egal('le crayon ne va pas jusqu\'à la pointe', coin.crayon.pointe, 0, JSON.stringify(coin));
    r.egal('et le surligneur non plus, désormais', coin.surligneur.pointe, 0, JSON.stringify(coin));

    // ET LE TRAÇÉ EST ÉCHANTILLONNÉ, non posé sur les points bruts : quelques
    // points relevés donnent une ligne faite de beaucoup de petits pas.
    const echantillon = await page.evaluate(() => {
        const bruts = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }, { x: 300, y: 100 }];
        return { bruts: bruts.length,
                 lisses: pointsAdoucisDuTrait(bruts, 4).length,
                 chemins: sousCheminsDuNezCarre(bruts, 9).length };
    });
    r.verifie('le tracé est échantillonné le long de la courbe',
        echantillon.lisses > 4 * echantillon.bruts, JSON.stringify(echantillon));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
