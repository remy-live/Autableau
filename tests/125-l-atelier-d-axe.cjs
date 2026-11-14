// L'ATELIER D'AXE : DES PONTS DE COULEUR SUR LA DROITE GRADUÉE.
//
//   « Un atelier d'axe avec des ponts colorés pour les fractions. Les
//     fractions sont traversées par le pont. Et des ponts automatiques
//     aussi. »  — « Arc, et oui [pour empiler une somme]. »
//
// L'axe mathématique existait déjà et savait tout faire d'un axe, sauf
// MONTRER UN MORCEAU. Or c'est toute la leçon : trois dixièmes, ce n'est pas
// un point, c'est la DISTANCE de zéro à trois dixièmes. Le point ne dit rien
// de la part ; l'arc la tient d'un bout à l'autre, et l'on voit que deux
// quarts et un demi couvrent le même chemin.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('L\'atelier d\'axe');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1400, height: 900 } });
    await tableauVierge(page);
    await page.waitForFunction(() => window.PluginManager && PluginManager.plugins.axeAtelier,
        { timeout: 20000 });

    const ouvrir = () => page.evaluate(() => {
        const bt = [...document.querySelectorAll('#plugins-grid .btn')]
            .find(x => (x.dataset.pluginKey || x.title || '') === "Atelier d'axe");
        if (bt) bt.click();
        return !!bt;
    });
    const scene = () => page.evaluate(() => {
        const f = document.getElementById('axa-fenetre');
        if (!f) return { absente: true };
        const svg = f.querySelector('#axa-scene svg');
        const vb = svg ? svg.getAttribute('viewBox').split(' ').map(Number) : null;
        return {
            grads: f.querySelectorAll('.axa-grad').length,
            ponts: f.querySelectorAll('.axa-pont').length,
            teintes: f.querySelectorAll('.axa-teinte').length,
            hauteur: vb ? vb[3] : null,
            etiquettes: [...f.querySelectorAll('.axa-pont text')].map(t => t.textContent),
            couleurs: [...f.querySelectorAll('.axa-pont path')].map(p => p.getAttribute('stroke')),
            liste: f.querySelector('#axa-liste').innerText.replace(/\s+/g, ' ').trim(),
            aide: f.querySelector('#axa-aide').textContent
        };
    });
    // ON CLIQUE COMME ON CLIQUE VRAIMENT : appui puis relâchement au même
    // endroit. La scène écoute le POINTEUR, et non le clic — c'est ce qui
    // permet de tirer un pont à la souris —, et un « click » fabriqué à la
    // main ne dirait rien de ce que fait le professeur.
    const centreDe = (i) => page.evaluate((k) => {
        const g = document.querySelectorAll('#axa-scene .axa-grad')[k];
        if (!g) return null;
        const r = g.getBoundingClientRect();
        return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
    }, i);
    const cliquerGraduation = async (i) => {
        const p = await centreDe(i);
        if (!p) return false;
        await page.mouse.click(p[0], p[1]);
        await page.waitForTimeout(120);
        return true;
    };

    // ------------------------------------------------------------------
    // 1. L'ATELIER S'OUVRE SUR UN AXE EN QUARTS.
    // ------------------------------------------------------------------
    r.verifie('l\'outil existe dans le tiroir', await ouvrir(), 'bouton introuvable');
    await page.waitForTimeout(700);
    const depart = await scene();
    r.egal('l\'axe s\'ouvre en quarts : cinq graduations', depart.grads, 5, JSON.stringify(depart));
    r.egal('aucun pont au départ', depart.ponts, 0, JSON.stringify(depart));
    r.egal('six teintes sont proposées', depart.teintes, 6, JSON.stringify(depart));

    // ------------------------------------------------------------------
    // 2. DEUX CLICS POSENT UN PONT, ET IL PORTE SA FRACTION.
    //
    //    C'est le geste de la craie : on montre d'où à où. Taper « 0-0,25 »
    //    dans un champ demanderait de savoir d'avance ce qu'on veut montrer,
    //    alors qu'on le cherche devant la classe.
    // ------------------------------------------------------------------
    await cliquerGraduation(0);
    await page.waitForTimeout(150);
    const enCours = await scene();
    r.verifie('le premier clic annonce qu\'il en attend un second',
        /arriv/i.test(enCours.aide), JSON.stringify(enCours.aide));
    await cliquerGraduation(1);
    await page.waitForTimeout(250);
    const unPont = await scene();
    r.egal('deux clics font un pont', unPont.ponts, 1, JSON.stringify(unPont));
    r.verifie('et le pont écrit sa fraction, empilée',
        unPont.etiquettes.join('/') === '1/4', JSON.stringify(unPont.etiquettes));
    r.verifie('la liste le reprend', /1\/4/.test(unPont.liste), JSON.stringify(unPont.liste));

    // ------------------------------------------------------------------
    // 3. LE MÊME BOUT DEUX FOIS RENONCE, ET UN CLIC SUR UN PONT L'ENLÈVE.
    // ------------------------------------------------------------------
    await cliquerGraduation(2);
    await page.waitForTimeout(120);
    await cliquerGraduation(2);
    await page.waitForTimeout(200);
    const renonce = await scene();
    r.egal('recliquer le même bout ne pose rien', renonce.ponts, 1, JSON.stringify(renonce));
    r.verifie('et l\'atelier attend de nouveau un départ',
        /départ/i.test(renonce.aide), JSON.stringify(renonce.aide));

    await page.evaluate(() => {
        const g = document.querySelector('#axa-scene .axa-pont');
        if (!g) return;
        const r = g.getBoundingClientRect();
        g.dispatchEvent(new PointerEvent('pointerdown',
            { bubbles: true, clientX: r.left + 4, clientY: r.top + 4 }));
    });
    await page.waitForTimeout(250);
    r.egal('un clic sur le pont l\'enlève', (await scene()).ponts, 0, '');

    // ------------------------------------------------------------------
    // 4. LA SOMME S'EMPILE D'UN GESTE.
    //
    //    « 1/4 + 1/4 + 1/2 » : trois ponts bout à bout depuis le début de
    //    l'axe, et l'on voit d'un coup qu'ils couvrent l'unité. C'est la
    //    figure que le professeur dessine le plus souvent, et c'était six
    //    clics — un de raté, et tout est à refaire.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        document.getElementById('axa-somme').value = '1/4 + 1/4 + 1/2';
        document.querySelector('[data-auto="somme"]').click();
    });
    await page.waitForTimeout(350);
    const somme = await scene();
    r.egal('la somme pose trois ponts', somme.ponts, 3, JSON.stringify(somme));
    r.verifie('et chacun porte son terme',
        somme.liste.replace(/✕/g, '').replace(/\s+/g, ' ').trim() === '1/4 1/4 1/2',
        JSON.stringify(somme.liste));
    const boutABout = await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier.etat.ponts.map(x => [x.a, x.b]);
        return { p, finit: p.length ? p[p.length - 1][1] : null };
    });
    r.verifie('ils se suivent bout à bout et finissent à 1',
        Math.abs(boutABout.finit - 1) < 1e-9
        && boutABout.p.every((b, i) => i === 0 || Math.abs(b[0] - boutABout.p[i - 1][1]) < 1e-9),
        JSON.stringify(boutABout));

    // DEUX COULEURS QUI ALTERNENT : une file de ponts de la même teinte se
    // compte mal — on perd le fil au sixième.
    //
    // ON LIT L'ÉTAT, ET NON L'ORDRE DU DESSIN. Le SVG écrit d'abord tous les
    // arcs du dessus, puis ceux du dessous : trois ponts alternés y
    // paraissent dans l'ordre 1, 3, 2, et deux voisins de la même couleur s'y
    // retrouvent côte à côte sans que rien ne soit faux.
    const teintes = await page.evaluate(() =>
        PluginManager.plugins.axeAtelier.etat.ponts.map(p => [p.couleur, p.cote]));
    r.verifie('deux couleurs alternent pour qu\'on les compte',
        teintes.length === 3 && teintes.every((t, i) => i === 0 || t[0] !== teintes[i - 1][0]),
        JSON.stringify(teintes));
    r.verifie('et ils passent au-dessus puis au-dessous',
        teintes.every((t, i) => i === 0 || t[1] !== teintes[i - 1][1]),
        JSON.stringify(teintes));

    // ------------------------------------------------------------------
    // 5. LES PONTS AUTOMATIQUES REMPLACENT, ILS NE S'AJOUTENT PAS.
    //
    //    « Automatique » veut dire « voilà la situation » : empiler une série
    //    sur la précédente donnerait un fouillis à défaire pont par pont.
    // ------------------------------------------------------------------
    await page.evaluate(() => document.querySelector('[data-auto="chaque"]').click());
    await page.waitForTimeout(350);
    const chaque = await scene();
    r.egal('« chaque graduation » pose quatre ponts sur un axe en quarts',
        chaque.ponts, 4, JSON.stringify(chaque));
    await page.evaluate(() => document.querySelector('[data-auto="entier"]').click());
    await page.waitForTimeout(300);
    r.egal('et « tout l\'axe » les remplace par un seul', (await scene()).ponts, 1, '');

    // ------------------------------------------------------------------
    // 6. DEUX PONTS QUI SE CHEVAUCHENT MONTENT D'UN ÉTAGE.
    //
    //    Se superposer serait illisible — et c'est justement quand on COMPARE
    //    deux écritures qu'on en pose deux au même endroit : trois dixièmes
    //    contre un cinquième.
    // ------------------------------------------------------------------
    const etages = await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier;
        p.etat.cote = 'haut';
        p.etat.ponts = [{ a: 0, b: 0.75, couleur: '#d63031', etiquette: 'rien', mot: '', cote: 'haut' }];
        p.rendre();
        const un = +document.querySelector('#axa-scene svg').getAttribute('viewBox').split(' ')[3];
        p.etat.ponts.push({ a: 0.25, b: 1, couleur: '#0984e3', etiquette: 'rien', mot: '', cote: 'haut' });
        p.rendre();
        const deux = +document.querySelector('#axa-scene svg').getAttribute('viewBox').split(' ')[3];
        // deux arcs qui ne se croisent pas, eux, tiennent sur un seul étage
        p.etat.ponts = [{ a: 0, b: 0.25, couleur: '#d63031', etiquette: 'rien', mot: '', cote: 'haut' },
                        { a: 0.5, b: 1, couleur: '#0984e3', etiquette: 'rien', mot: '', cote: 'haut' }];
        p.rendre();
        const cote = +document.querySelector('#axa-scene svg').getAttribute('viewBox').split(' ')[3];
        return { un, deux, cote };
    });
    r.verifie('deux ponts qui se chevauchent prennent deux étages',
        etages.deux > etages.un, JSON.stringify(etages));
    r.verifie('et deux ponts voisins n\'en prennent qu\'un',
        etages.cote === etages.un, JSON.stringify(etages));

    // ------------------------------------------------------------------
    // 7. L'AXE PEUT SE TAIRE, ET IL GARDE SES GRADUATIONS.
    //
    //    Sans les nombres, c'est la classe qui écrit — mais les traits
    //    restent : ce sont eux qui portent la question.
    // ------------------------------------------------------------------
    const muet = await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier;
        p.etat.ecriture = 'aucune';
        p.rendre();
        const f = document.getElementById('axa-fenetre');
        return { grads: f.querySelectorAll('.axa-grad').length,
                 textes: f.querySelectorAll('#axa-scene .axa-grad text').length };
    });
    r.egal('l\'axe muet garde ses graduations', muet.grads, 5, JSON.stringify(muet));
    r.egal('et n\'écrit plus un chiffre', muet.textes, 0, JSON.stringify(muet));

    // ------------------------------------------------------------------
    // 8. UN PAS MINUSCULE NE FIGE PAS LA PAGE.
    //
    //    « Début 0, Fin 100, Pas 0,001 » fabriquerait cent mille graduations,
    //    et le professeur ne saurait pas que c'est son pas qui a figé l'écran.
    // ------------------------------------------------------------------
    const beaucoup = await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier;
        const t0 = performance.now();
        p.etat.debut = 0; p.etat.fin = 100; p.etat.pas = 0.001; p.etat.ponts = [];
        p.rendre();
        return { grads: document.querySelectorAll('#axa-scene .axa-grad').length,
                 ms: Math.round(performance.now() - t0) };
    });
    r.verifie('un pas minuscule est borné, et le dessin reste instantané',
        beaucoup.grads <= 401 && beaucoup.ms < 3000, JSON.stringify(beaucoup));

    // ------------------------------------------------------------------
    // 9. LA FENÊTRE TIENT DANS L'ÉCRAN, SANS BLANC INUTILE.
    //
    //    La coquille commune des ateliers est haute de 720 pixels, ce qui
    //    convient à une carte. Un axe est large et plat : mesuré, il laissait
    //    440 pixels de blanc sous lui.
    // ------------------------------------------------------------------
    //
    //    ON MESURE LA FENÊTRE, ET NON LE BLANC SOUS L'AXE. Le premier
    //    contrôle écrit ici comparait le bas de l'axe au bas de sa colonne —
    //    et passait quoi qu'il arrive, parce que c'est le PANNEAU de droite,
    //    plus haut que l'axe, qui décide du bas des deux colonnes. Saboté, il
    //    ne bougeait pas d'un pixel. Ce qui change vraiment, c'est la hauteur
    //    de la fenêtre : 720 pixels imposés par la coquille commune, 516 une
    //    fois qu'elle prend la mesure de ce qu'elle contient.
    const forme = await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier;
        p.etat = p.etatNeuf(); p.rendre();
        const f = document.getElementById('axa-fenetre');
        const b = f.getBoundingClientRect();
        const pan = document.querySelector('.axa-panneau');
        const tete = document.querySelector('#axa-fenetre .atelier-tete').getBoundingClientRect().height;
        const pied = document.querySelector('#axa-fenetre .atelier-pied').getBoundingClientRect().height;
        return { hauteur: Math.round(b.height),
                 coquille: Math.round(Math.min(720, window.innerHeight * 0.94)),
                 reglages: Math.round(pan.scrollHeight + tete + pied),
                 dansLEcran: b.top >= 0 && b.bottom <= window.innerHeight };
    });
    r.verifie('la fenêtre tient dans l\'écran', forme.dansLEcran === true, JSON.stringify(forme));
    // LE PANNEAU N'EST PAS UNE RÉFÉRENCE : étiré, son « scrollHeight » suit la
    // fenêtre, et comparer l'un à l'autre revient à comparer une chose à
    // elle-même. On compare donc à la COQUILLE commune des ateliers, qui est
    // la hauteur imposée dont on voulait sortir.
    r.verifie('et elle est plus basse que la coquille commune des ateliers',
        forme.hauteur < forme.coquille - 40, JSON.stringify(forme)
        + ' — 756 px avant, pour un axe qui en demande 516');

    // ------------------------------------------------------------------
    // 10. POSÉ AU TABLEAU, ET REPRIS TEL QUEL.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier;
        p.etat.somme = '1/4 + 1/4 + 1/2';
        p.ponterAutomatiquement('somme');
        document.getElementById('axa-poser').click();
    });
    await page.waitForTimeout(900);
    r.egal('poser arme le tampon', await page.evaluate(() => mode), 'axe_atelier', '');
    await page.mouse.click(700, 500);
    await page.waitForTimeout(800);
    const pose = await page.evaluate(() => images.map(i => ({
        id: (i.pluginData || {}).id,
        ponts: ((i.pluginData || {}).state || {}).ponts ? i.pluginData.state.ponts.length : null,
        large: i.w > i.h
    })));
    r.egal('une image posée', pose.length, 1, JSON.stringify(pose));
    r.verifie('elle vient de l\'atelier d\'axe et garde ses trois ponts',
        pose[0] && pose[0].id === 'axeAtelier' && pose[0].ponts === 3 && pose[0].large === true,
        JSON.stringify(pose));

    const repris = await page.evaluate(() => {
        PluginManager.plugins.axeAtelier.edit(images[0]);
        return { ponts: document.querySelectorAll('#axa-scene .axa-pont').length,
                 ouverte: !!document.getElementById('axa-fenetre') };
    });
    r.verifie('la rouvrir retrouve ses ponts',
        repris.ouverte === true && repris.ponts === 3, JSON.stringify(repris));

    // ------------------------------------------------------------------
    // 10 bis. L'ÉTIQUETTE NE TRAVERSE PAS SON ARC.
    //
    //    « Les fractions sont écrites bizarrement, je trouve que ce n'est pas
    //    beau. » Et c'était pire : le dénominateur était posé SUR la courbe,
    //    qui lui passait au travers. L'étiquette se plaçait par rapport au
    //    point de contrôle de la Bézier ; or une cubique symétrique culmine
    //    aux TROIS QUARTS du chemin vers lui — seize pixels et demi au lieu
    //    de vingt-deux pour le premier étage, et les six manquants, c'était
    //    l'épaisseur du quatre.
    // ------------------------------------------------------------------
    // TROIS PONTS QUI SE CHEVAUCHENT, donc trois étages : c'est là que la
    // différence se voit. Sur un seul étage, viser le point de contrôle ou le
    // vrai sommet ne change que cinq pixels — sur le troisième, vingt-cinq.
    const croisement = await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier;
        p.etat = p.etatNeuf();
        p.etat.cote = 'haut';
        p.etat.ponts = [
            { a: 0, b: 0.75, couleur: '#d63031', etiquette: 'fraction', mot: '', cote: 'haut' },
            { a: 0.25, b: 1, couleur: '#0984e3', etiquette: 'fraction', mot: '', cote: 'haut' },
            { a: 0, b: 0.25, couleur: '#00b894', etiquette: 'fraction', mot: '', cote: 'haut' }
        ];
        p.rendre();
        const out = [];
        document.querySelectorAll('#axa-scene .axa-pont').forEach(g => {
            const path = g.querySelector('path');
            const textes = [...g.querySelectorAll('text')];
            if (!path || !textes.length) return;
            // le milieu d'une cubique symétrique EST son sommet
            const sommet = path.getPointAtLength(path.getTotalLength() / 2);
            const bas = path.getPointAtLength(0);
            const versLeHaut = sommet.y < bas.y;
            // le chiffre le plus PROCHE de l'arc : c'est lui qui la touchait
            let plusPres = Infinity;
            textes.forEach(t => {
                const b = t.getBBox();
                const e = versLeHaut ? sommet.y - (b.y + b.height) : b.y - sommet.y;
                if (e < plusPres) plusPres = e;
            });
            out.push(Math.round(plusPres));
        });
        return out;
    });
    r.egal('on mesure bien les trois étages', croisement.length, 3, JSON.stringify(croisement));
    r.verifie('aucune étiquette ne traverse son arc',
        croisement.every(e => e > 0), JSON.stringify(croisement) + ' — le dénominateur était DESSUS');
    // ET TOUJOURS À LA MÊME DISTANCE, QUEL QUE SOIT L'ÉTAGE. C'est ce que vaut
    // le vrai sommet : visé au point de contrôle, l'écart grandissait avec la
    // hauteur de l'arc — mesuré 4, 9 puis 18 pixels pour trois étages, là où
    // il vaut 4 partout. L'étiquette décollait de son pont.
    r.verifie('et toutes à la même distance de leur arc',
        Math.max.apply(null, croisement) - Math.min.apply(null, croisement) <= 2,
        JSON.stringify(croisement) + ' — 4, 9 puis 18 au point de contrôle');
    r.verifie('qui n\'est ni collée ni perdue dans le blanc',
        croisement.every(e => e >= 2 && e <= 10), JSON.stringify(croisement));

    // ------------------------------------------------------------------
    // 11. UN PONT SE TIRE À LA SOURIS.
    //
    //    « Il faudrait aussi pouvoir faire les ponts à la souris, en cliquant
    //    puis en relâchant sur la fin. » Les deux gestes coexistent : au
    //    tableau interactif on tire du doigt, mais un clic qui ne bouge pas
    //    doit rester un clic — c'est ainsi qu'on pose un pont très large sans
    //    traverser l'écran d'un trait.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        const p = PluginManager.plugins.axeAtelier;
        p.etat = p.etatNeuf(); p.rendre();
    });
    await page.waitForTimeout(250);
    const d0 = await centreDe(0), d2 = await centreDe(2);
    await page.mouse.move(d0[0], d0[1]);
    await page.mouse.down();
    await page.mouse.move((d0[0] + d2[0]) / 2, d0[1], { steps: 4 });
    await page.waitForTimeout(150);
    const pendant = await page.evaluate(() => ({
        provisoire: document.querySelectorAll('#axa-scene path[stroke-dasharray]').length,
        ponts: document.querySelectorAll('#axa-scene .axa-pont').length
    }));
    r.egal('pendant le glissement, l\'arc se montre en pointillé', pendant.provisoire, 1,
        JSON.stringify(pendant));
    r.egal('et il n\'est pas encore posé', pendant.ponts, 0, JSON.stringify(pendant));
    await page.mouse.move(d2[0], d2[1], { steps: 4 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const lache = await page.evaluate(() => ({
        ponts: document.querySelectorAll('#axa-scene .axa-pont').length,
        provisoire: document.querySelectorAll('#axa-scene path[stroke-dasharray]').length,
        liste: document.getElementById('axa-liste').innerText.replace(/\s+/g, ' ').trim()
    }));
    r.egal('relâché, le pont est posé', lache.ponts, 1, JSON.stringify(lache));
    r.egal('et le pointillé s\'efface', lache.provisoire, 0, JSON.stringify(lache));
    r.verifie('il va bien d\'un bout à l\'autre du glissement',
        /1\/2/.test(lache.liste), JSON.stringify(lache.liste));

    // ET LE CLIC-CLIC MARCHE TOUJOURS. Mesuré le jour où le glissement est
    // arrivé : l'appui posait un nouveau départ et écrasait celui du clic
    // précédent — deux clics ne donnaient plus aucun pont.
    await cliquerGraduation(3);
    await cliquerGraduation(4);
    await page.waitForTimeout(200);
    r.egal('deux clics posent encore un pont',
        await page.evaluate(() => document.querySelectorAll('#axa-scene .axa-pont').length), 2, '');

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
