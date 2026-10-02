// LA FLÈCHE COURBE ET SON CADRE
//
// « J'aimerais bien une fonction dans les outils qui crée une flèche
// arrondie : premier point, bout de la flèche, ça montre quelque chose ;
// deuxième point, le point d'inflexion ; troisième point, le bout de la
// flèche, et on crée un cadre de la taille qu'on veut. On peut bouger le point
// accroché au cadre tout au long du cadre, et quand on clique pour
// sélectionner l'objet on peut bouger les points, dont le point d'inflexion. »
//
// C'est le geste qu'on fait vingt fois sur un polycopié : MONTRER un mot, et
// ÉCRIRE à côté pourquoi. Il se faisait jusqu'ici en trois objets — un trait,
// un cadre, un bloc de texte — qu'il fallait aligner à la main et redéplacer
// ensemble.
//
// DEUX MESURES PORTENT TOUT LE RESTE.
//
//   — LA COURBE PASSE PAR LE PLI, elle ne s'en approche pas. Un point
//     d'inflexion dont la courbe s'écarte ne sert à rien : on le pose sur un
//     mot pour le contourner, et le mot reste barré. Le contrôle mesure la
//     distance entre le pli et le milieu du tracé, et exige zéro.
//   — L'ATTACHE RESTE SUR LE BORD, où qu'aille le doigt. C'est ce que veut
//     dire « glisser tout le long du cadre » : elle n'entre pas dedans, elle
//     n'en sort pas, et elle survit à un agrandissement.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La flèche courbe et son cadre');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(() => typeof flecheDeLaLegende === 'function', { timeout: 20000 });
    await tableauVierge(page);

    const poser = async (pointe, pli, coin, bout) => {
        await page.evaluate(() => {
            texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
            legendeEnCours = null; isDrawingLegende = false;
            setMode('legende');
        });
        await page.mouse.click(pointe[0], pointe[1]);
        await page.mouse.click(pli[0], pli[1]);
        await page.mouse.move(coin[0], coin[1]);
        await page.mouse.down();
        await page.mouse.move(bout[0], bout[1], { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(220);
    };

    // ------------------------------------------------------------------
    // 1. L'OUTIL EXISTE, ET SON GESTE EST CELUI QUI A ÉTÉ DEMANDÉ
    // ------------------------------------------------------------------
    const bouton = await page.evaluate(() => {
        const b = document.querySelector('[data-mode="legende"]');
        if (!b) return { absent: true };
        b.click();
        // « title » a laissé la place à « data-tooltip » dans toute la page :
        // c'est l'infobulle maison, qui s'ouvre aussi au doigt.
        return { absent: false, titre: b.getAttribute('data-tooltip') || b.title, mode,
                 dessin: !!b.querySelector('svg') };
    });
    r.verifie('un outil « flèche courbe » vit dans la panoplie', !bouton.absent, JSON.stringify(bouton));
    r.egal('et le prendre met l\'application dans ce mode', bouton.mode, 'legende');
    r.verifie('son bouton porte un nom et un dessin',
        bouton.titre && bouton.titre.length > 3 && bouton.dessin, JSON.stringify(bouton));

    await poser([300, 250], [500, 200], [700, 400], [900, 500]);
    const nee = await page.evaluate(() => {
        const t = texts[0];
        if (!t) return { aucune: true, nb: texts.length };
        const f = flecheDeLaLegende(t);
        return { nb: texts.length, estUne: !!t.isLegende,
                 pointe: [t.pointeX, t.pointeY], pli: [t.pliX, t.pliY],
                 cadre: [Math.round(f.cadre.x), Math.round(f.cadre.y),
                         Math.round(f.cadre.w), Math.round(f.cadre.h)],
                 // L'attache naît là où le doigt a posé le cadre.
                 depart: [Math.round(f.depart.x), Math.round(f.depart.y)],
                 vide: t.content === '' };
    });
    r.egal('trois clics et un glissement font UN objet', nee.nb, 1);
    r.verifie('qui est bien une flèche courbe', nee.estUne, JSON.stringify(nee));
    r.egal('LE PREMIER CLIC EST LA POINTE', nee.pointe, [300, 250]);
    r.egal('LE DEUXIÈME EST LE PLI', nee.pli, [500, 200]);
    r.egal('ET LE TROISIÈME OUVRE LE CADRE, À LA TAILLE TIRÉE', nee.cadre, [700, 400, 200, 100]);
    r.egal('la flèche part du point où le cadre a été posé', nee.depart, [700, 400]);
    r.verifie('et le cadre naît vide : on y écrira d\'un double-clic', nee.vide);

    // ------------------------------------------------------------------
    // 2. LA COURBE PASSE PAR LE PLI
    //
    // Pas « près du pli » : par lui. On pose exprès un pli très écarté de la
    // droite qui joindrait les deux bouts — c'est le cas où une formule
    // approchée se trahit.
    // ------------------------------------------------------------------
    const parLePli = await page.evaluate(() => {
        const t = texts[0];
        const e = echantillonsDeLaFleche(t);
        const m = e[e.length >> 1];
        const f = flecheDeLaLegende(t);
        // La droite des deux bouts, pour dire que le pli en est VRAIMENT loin.
        const dDroite = (() => {
            const ax = f.depart.x, ay = f.depart.y, bx = f.pointe.x, by = f.pointe.y;
            const num = Math.abs((by - ay) * t.pliX - (bx - ax) * t.pliY + bx * ay - by * ax);
            return num / Math.hypot(bx - ax, by - ay);
        })();
        return { ecart: Math.round(Math.hypot(m.x - t.pliX, m.y - t.pliY)),
                 pliHorsDeLaDroite: Math.round(dDroite),
                 bouts: [Math.round(e[0].x), Math.round(e[0].y),
                         Math.round(e[e.length - 1].x), Math.round(e[e.length - 1].y)] };
    });
    r.verifie('le pli est bien loin de la droite des deux bouts',
        parLePli.pliHorsDeLaDroite > 60, JSON.stringify(parLePli));
    r.egal('ET LA COURBE PASSE EXACTEMENT PAR LUI', parLePli.ecart, 0);
    r.egal('elle part de l\'attache et finit sur la pointe', parLePli.bouts, [700, 400, 300, 250]);

    // ------------------------------------------------------------------
    // 3. LA FLÈCHE EST VRAIMENT PEINTE, ET ELLE S'ATTRAPE PAR SON TRACÉ
    //
    // On relit la toile : si le dessin et la géométrie se séparaient un jour,
    // ce contrôle tomberait.
    // ------------------------------------------------------------------
    const peinte = await page.evaluate(() => {
        const t = texts[0];
        const e = echantillonsDeLaFleche(t);
        const m = e[e.length >> 1];
        draw();
        const fond = (() => { const d = ctx.getImageData(40, 700, 1, 1).data; return [d[0], d[1], d[2]]; })();
        const lu = ctx.getImageData(Math.round(m.x) - 6, Math.round(m.y) - 6, 13, 13).data;
        let encre = 0;
        for (let i = 0; i < lu.length; i += 4) {
            if (Math.abs(lu[i] - fond[0]) + Math.abs(lu[i + 1] - fond[1])
                + Math.abs(lu[i + 2] - fond[2]) > 60) encre++;
        }
        setMode('pointer'); selectedItems = [];
        const pris = findObjectAt(m.x, m.y);
        return { encre, pris: pris && pris.type + '#' + pris.id, attendu: 'text#' + t.id,
                 loinDuCadre: Math.round(m.x) < Math.round(flecheDeLaLegende(t).cadre.x) - 20 };
    });
    r.verifie('LE MILIEU DU TRACÉ EST BIEN DE L\'ENCRE', peinte.encre > 5, JSON.stringify(peinte));
    r.verifie('et ce point-là est loin du cadre', peinte.loinDuCadre, JSON.stringify(peinte));
    r.egal('UN CLIC SUR LA FLÈCHE SÉLECTIONNE L\'OBJET', peinte.pris, peinte.attendu);

    // ------------------------------------------------------------------
    // 4. L'ATTACHE GLISSE LE LONG DU CADRE, ET N'EN SORT PAS
    //
    // « On peut bouger le point accroché au cadre tout au long du cadre. »
    // On vise quatre endroits très différents, dont deux franchement hors du
    // cadre : l'attache doit se poser sur le bord le plus proche, jamais
    // ailleurs.
    // ------------------------------------------------------------------
    const glisse = await page.evaluate(() => {
        const t = texts[0];
        const b = boiteDuTexte(t);
        const surLeBord = (p) => {
            const dx = Math.min(Math.abs(p.x - b.x), Math.abs(p.x - (b.x + b.w)));
            const dy = Math.min(Math.abs(p.y - b.y), Math.abs(p.y - (b.y + b.h)));
            const dedans = p.x >= b.x - 0.5 && p.x <= b.x + b.w + 0.5
                        && p.y >= b.y - 0.5 && p.y <= b.y + b.h + 0.5;
            return dedans && (dx < 0.5 || dy < 0.5);
        };
        const vises = [[b.x + b.w / 2, b.y - 300],          // très au-dessus
                       [b.x + b.w + 400, b.y + b.h / 2],    // très à droite
                       [b.x + b.w / 2, b.y + b.h / 2],      // en plein milieu
                       [b.x - 50, b.y + b.h + 50]];         // en bas à gauche
        return vises.map(([x, y]) => {
            t.ancre = abscisseDuContour(b, x, y);
            const p = flecheDeLaLegende(t).depart;
            return { vise: [Math.round(x), Math.round(y)],
                     pose: [Math.round(p.x), Math.round(p.y)], bord: surLeBord(p) };
        });
    });
    r.egal('L\'ATTACHE RESTE SUR LE CONTOUR, OÙ QU\'ON TIRE',
        glisse.filter(g => !g.bord), []);
    r.verifie('et elle change vraiment de place selon l\'endroit visé',
        new Set(glisse.map(g => g.pose.join(','))).size >= 3, JSON.stringify(glisse));

    // L'abscisse curviligne survit à l'agrandissement : c'est la raison même
    // de ne pas garder un point absolu.
    const apresAgrandissement = await page.evaluate(() => {
        // L'ATTACHE RETIENT SON CÔTÉ ET SA PLACE SUR CE CÔTÉ : « 1,25 », c'est
        // le bord droit, au quart. Un agrandissement ne doit rien y changer —
        // et compter en abscisse curviligne sur tout le périmètre le changeait,
        // de deux pour cent, parce que la marge du cadre ne grandit pas avec
        // lui.
        const t = texts[0];
        t.ancre = 1.25;
        const avant = flecheDeLaLegende(t);
        const sur = (f) => {
            const b = f.cadre, p = f.depart;
            if (Math.abs(p.y - b.y) < 0.5) return ['haut', (p.x - b.x) / b.w];
            if (Math.abs(p.x - (b.x + b.w)) < 0.5) return ['droite', (p.y - b.y) / b.h];
            if (Math.abs(p.y - (b.y + b.h)) < 0.5) return ['bas', (b.x + b.w - p.x) / b.w];
            return ['gauche', (b.y + b.h - p.y) / b.h];
        };
        const a = sur(avant);
        t.fixedWidth = t.fixedWidth * 2; t.fixedHeight = t.fixedHeight * 2;
        t.colWidth = t.fixedWidth;
        const apres = flecheDeLaLegende(t);
        const b2 = sur(apres);
        t.fixedWidth = t.fixedWidth / 2; t.fixedHeight = t.fixedHeight / 2;
        t.colWidth = t.fixedWidth;
        return { bordAvant: a[0], bordApres: b2[0],
                 partAvant: Math.round(a[1] * 100), partApres: Math.round(b2[1] * 100),
                 cadreAChange: Math.round(avant.cadre.w) !== Math.round(apres.cadre.w) };
    });
    r.verifie('le cadre a bien grandi', apresAgrandissement.cadreAChange,
        JSON.stringify(apresAgrandissement));
    r.egal('l\'attache est restée sur le même bord',
        apresAgrandissement.bordApres, apresAgrandissement.bordAvant);
    r.egal('ET AU MÊME ENDROIT DE CE BORD', apresAgrandissement.partApres,
        apresAgrandissement.partAvant);

    // ------------------------------------------------------------------
    // 5. LES TROIS POINTS SE SAISISSENT, ET SE VOIENT
    //
    // « Quand on clique pour sélectionner l'objet on peut bouger les points. »
    // Une poignée qu'aucun geste ne trouve n'existe pas.
    // ------------------------------------------------------------------
    const poignees = await page.evaluate(() => {
        const t = texts[0];
        t.ancre = 0;
        selectedItems = [{ type: 'text', id: t.id }];
        draw();
        const f = flecheDeLaLegende(t);
        const nom = (p) => getHandleAt(p.x, p.y, t, 'text');
        return { pointe: nom(f.pointe), pli: nom(f.pli), attache: nom(f.depart),
                 coin: nom({ x: f.cadre.x + f.cadre.w, y: f.cadre.y + f.cadre.h }),
                 nullePart: nom({ x: f.cadre.x - 400, y: f.cadre.y - 400 }) };
    });
    r.egal('la pointe se saisit', poignees.pointe, 'LEG_POINTE');
    r.egal('LE PLI AUSSI', poignees.pli, 'LEG_PLI');
    r.egal('et l\'attache également', poignees.attache, 'LEG_ANCRE');
    r.egal('le coin du cadre le redimensionne', poignees.coin, 'LEG_CADRE');
    r.egal('et ailleurs, rien ne se saisit', poignees.nullePart, null);

    // ------------------------------------------------------------------
    // 6. ON DÉPLACE L'ÉTIQUETTE : LA POINTE RESTE, LE PLI SUIT
    //
    // La pointe désigne une chose réelle — un mot, un chiffre — et doit
    // continuer de la désigner quand on pousse l'étiquette pour faire de la
    // place. Le pli, lui, ne désigne rien.
    // ------------------------------------------------------------------
    // ON TIRE VRAIMENT L'ÉTIQUETTE À LA SOURIS. Appliquer l'écart soi-même
    // dans le contrôle ne mesurerait rien : ce serait réécrire la règle au lieu
    // de la vérifier, et aucun sabotage de l'application ne la ferait tomber.
    const avantDeBouger = await page.evaluate(() => {
        const t = texts[0];
        t.ancre = 0;
        setMode('pointer');
        selectedItems = [{ type: 'text', id: t.id }];
        draw();
        const b = boiteDuTexte(t);
        return { x: t.x, y: t.y, pointe: [t.pointeX, t.pointeY], pli: [t.pliX, t.pliY],
                 // un point bien à l'intérieur du cadre, loin de toute poignée
                 prise: [Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)] };
    });
    await page.mouse.move(avantDeBouger.prise[0], avantDeBouger.prise[1]);
    await page.mouse.down();
    await page.mouse.move(avantDeBouger.prise[0] + 120, avantDeBouger.prise[1] + 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(220);
    const bouge = await page.evaluate(() => {
        const t = texts[0];
        return { x: t.x, y: t.y, pointe: [t.pointeX, t.pointeY], pli: [t.pliX, t.pliY] };
    });
    r.egal('l\'étiquette a bien suivi la souris',
        [Math.round(bouge.x - avantDeBouger.x), Math.round(bouge.y - avantDeBouger.y)], [120, 60]);
    r.egal('LA POINTE, ELLE, NE BOUGE PAS : elle désigne une chose réelle',
        bouge.pointe, avantDeBouger.pointe);
    r.egal('MAIS LE PLI SUIT, pour que la courbe garde sa forme',
        [Math.round(bouge.pli[0] - avantDeBouger.pli[0]), Math.round(bouge.pli[1] - avantDeBouger.pli[1])],
        [120, 60]);

    // ------------------------------------------------------------------
    // 7. UN SIMPLE CLIC DONNE QUAND MÊME UN CADRE
    //
    // Sans glissement, un cadre de zéro serait une étiquette invisible qu'on
    // ne retrouverait jamais.
    // ------------------------------------------------------------------
    await poser([300, 600], [420, 560], [600, 650], [600, 650]);
    const sansGlisser = await page.evaluate(() => {
        const t = texts[0];
        if (!t) return { aucune: true };
        const f = flecheDeLaLegende(t);
        return { l: Math.round(f.cadre.w), h: Math.round(f.cadre.h) };
    });
    // LA TAILLE EXACTE, et non « assez grand » : un cadre de zéro retombe de
    // toute façon sur la taille de secours d'un bloc vide — 150 sur 30 — et un
    // contrôle élastique passait donc même sans minimum à la création. Il ne
    // mesurait rien.
    // La LARGEUR est le discriminant : sans minimum à la création, le bloc vide
    // retombe sur sa taille de secours et le cadre fait 178. La hauteur, elle,
    // dépend de la hauteur d'une ligne vide — on la borne au lieu de la figer,
    // pour ne pas casser au premier changement de police.
    r.egal('UN CLIC SANS GLISSER DONNE LE CADRE MINIMUM', sansGlisser.l, 110,
        JSON.stringify(sansGlisser));
    r.verifie('et une hauteur d\'étiquette, pas davantage',
        sansGlisser.h >= 50 && sansGlisser.h <= 70, JSON.stringify(sansGlisser));

    // ------------------------------------------------------------------
    // 8. LE GESTE S'ABANDONNE, ET LA BARRE DIT CE QU'ELLE PEUT RÉGLER
    //
    // Trois clics engagés sans moyen de reculer, c'est un piège devant la
    // classe. Et l'outil ne pose aucun point : le réglage de leur forme
    // n'aurait rien à régler ici.
    // ------------------------------------------------------------------
    const abandon = await page.evaluate(async () => {
        texts.length = 0;
        setMode('legende');
        legendeEnCours = { pointeX: 10, pointeY: 10, pliX: 20, pliY: 20 };
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(ok => setTimeout(ok, 150));
        updateStyleBarContext();
        const bs = document.getElementById('btn-shape');
        const bar = document.getElementById('bar-style');
        return { enCours: legendeEnCours,
                 rienDePose: texts.length,
                 formeDesPoints: !!(bs && bs.getClientRects().length),
                 couleur: !!document.getElementById('btn-color-popover').getClientRects().length,
                 epaisseur: !!document.querySelector('#bar-style .slider-container').getClientRects().length,
                 classes: bar.className };
    });
    r.egal('ÉCHAP ABANDONNE LA FLÈCHE EN COURS', abandon.enCours, null);
    r.egal('sans rien laisser derrière', abandon.rienDePose, 0);
    r.verifie('la barre règle la couleur et l\'épaisseur du trait',
        abandon.couleur && abandon.epaisseur, JSON.stringify(abandon));
    r.verifie('et ne propose pas la forme des points, qu\'elle ne pose pas',
        !abandon.formeDesPoints, JSON.stringify(abandon));

    // ------------------------------------------------------------------
    // 9. ELLE SURVIT AU RECHARGEMENT, ET S'EXPORTE AVEC SA COURBE
    //
    // Une annotation qu'on retrouve droite au lieu de courbe, ou pas du tout,
    // ne vaut rien : c'est la séance d'après qui s'en sert.
    // ------------------------------------------------------------------
    await poser([300, 250], [500, 200], [700, 400], [900, 500]);
    const exporte = await page.evaluate(() => {
        const t = texts[0];
        const svg = (typeof generateSVGString === 'function')
            ? generateSVGString(getAutoBoundingBox(40), false) : null;
        if (svg === null) return { pasDExport: true };
        const f = flecheDeLaLegende(t);
        // La courbe doit sortir comme une QUADRATIQUE, avec le point de
        // contrôle du rendu : une droite entre les deux bouts passerait le
        // contrôle « il y a bien un trait », et serait fausse.
        const q = new RegExp('Q ' + Math.round(f.ctrl.x) + '(\\.\\d+)? ' + Math.round(f.ctrl.y));
        return { aUneCourbe: /M [\d.-]+ [\d.-]+ Q /.test(svg),
                 bonControle: q.test(svg.replace(/(\d+)\.\d+/g, '$1')),
                 aUnCadre: /<rect [^>]*rx=/.test(svg), taille: svg.length };
    });
    if (exporte.pasDExport) {
        r.verifie('l\'export SVG se mesure', false, 'aucune fonction d\'export trouvée');
    } else {
        r.verifie('L\'EXPORT ÉCRIT UNE COURBE, PAS UNE CORDE',
            exporte.aUneCourbe, JSON.stringify(exporte));
        r.verifie('avec le point de contrôle du rendu',
            exporte.bonControle, JSON.stringify(exporte));
        r.verifie('et le cadre part avec elle', exporte.aUnCadre, JSON.stringify(exporte));
    }

    // CE QUE LA SAUVEGARDE EMPORTE. Le vrai risque, pour un objet neuf, est que
    // l'écriture sur le disque ne connaisse pas ses champs et les laisse
    // tomber : on retrouverait une étiquette sans flèche. On relit donc ce qui
    // a été ÉCRIT, et non ce que la mémoire croit savoir.
    const ecrit = await page.evaluate(async () => {
        const t = texts[0];
        t.content = 'attention à la retenue';
        t.ancre = 1.4;
        saveState();
        // L'historique n'est pas la sauvegarde : « saveState » empile une étape
        // d'annulation, « saveAppLocal » écrit sur le disque.
        if (typeof saveAppLocal === 'function') await saveAppLocal(true);
        let brut = null;
        try { brut = await localforage.getItem(AUTO_SAVE_KEY); } catch (e) { return { refuse: true }; }
        const toutes = (brut && brut.pages || [])
            .flatMap(p => (p.texts || []).filter(x => x.isLegende));
        if (!toutes.length) return { aucune: true, pages: (brut && brut.pages || []).length };
        const l = toutes[0];
        return { combien: toutes.length,
                 pointe: [l.pointeX, l.pointeY], pli: [l.pliX, l.pliY],
                 ancre: l.ancre, content: l.content,
                 cadre: [l.fixedWidth, l.fixedHeight] };
    });
    r.egal('LA SAUVEGARDE EMPORTE LA FLÈCHE', ecrit.combien, 1, JSON.stringify(ecrit));
    r.egal('avec sa pointe', ecrit.pointe, [300, 250]);
    r.egal('SON PLI', ecrit.pli, [500, 200]);
    r.egal('son attache', ecrit.ancre, 1.4);
    r.egal('et ce qu\'on avait écrit dedans', ecrit.content, 'attention à la retenue');

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
