// LE RAIL DE LA PROJECTION.
//
// « Je suis toujours chagriné par la place que ça prend pour le pdf et la
// découpe et la barre d'outils et les tiroirs » — puis, la plainte resserrée :
// « Non c'est surtout quand le PDF est en plein écran. »
//
// Mesuré avant d'y toucher, en projetant un polycopié dense et en découpant
// deux morceaux : TROIS surfaces s'empilaient au même endroit, en bas au milieu
// de l'écran —
//
//   les bulles           444 × 80  à 656 px du haut
//   le tiroir à morceaux 619 × 78  à 748
//   la barre du document 704 × 44  à 836
//
// soit une bande de DEUX CENT QUARANTE-QUATRE pixels, plus du quart de la
// hauteur, posée sur les derniers exercices — ceux qu'on n'a pas encore faits.
//
// Trois questions ont fermé les fausses pistes :
//
//   « Parfois quand c'est vertical on veut projeter sur toute la largeur. »
//   Les bandes noires d'une A4 debout ne sont donc pas un logement : elles
//   disparaissent.
//
//   « Comment on reste cohérent avec le reste ? » Le rail est toujours au même
//   bord et toujours large de 72 px ; c'est la page qui se pose dans ce qui
//   reste.
//
//   « Et si on veut retrouver les tiroirs et la barre d'outils ? » Ils
//   s'appellent depuis le rail, par le bord et jamais par le bas.
//
// Et : « quand on coupe des morceaux l'icône tiroir a un petit rond avec le
// nombre de morceaux » — ce rond est ce qui rend l'effacement sûr, et c'est à
// ce titre qu'il remplace les bulles du découpage.
//
// CE CHAPITRE MESURE, IL NE RELIT PAS. Chaque contrôle lit une boîte en pixels
// ou l'état de la vue, parce que c'est de pixels que la plainte parlait.
const { creerRapport, ouvrirApp, tableauVierge, polyDense } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le rail de la projection');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1400, height: 900 } });
    await tableauVierge(page);
    const octets = Array.from(await polyDense());

    // Ce qu'on regarde : les meubles, la vue, et la page telle qu'elle est à
    // l'écran. Tout en pixels de l'écran, comme la plainte.
    const mesurer = () => page.evaluate(() => {
        const vu = (e) => {
            if (!e || e.hidden) return false;
            const s = getComputedStyle(e);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return false;
            const q = e.getBoundingClientRect();
            return q.width > 3 && q.height > 3 && q.bottom > 0 && q.top < innerHeight
                && q.right > 0 && q.left < innerWidth;
        };
        const boite = (sel) => {
            const e = document.querySelector(sel);
            if (!e || !vu(e)) return null;
            const q = e.getBoundingClientRect();
            return [q.x, q.y, q.width, q.height].map(Math.round);
        };
        const doc = images[0] || null;
        return {
            etat: etatDuPleinEcran(),
            reserve: reserveDuRail(),
            cadre: cadreUtile(),
            vue: [Math.round(zoom * 1e6) / 1e6, Math.round(panX * 1e4) / 1e4, Math.round(panY * 1e4) / 1e4],
            page: doc ? [doc.x * zoom + panX, doc.y * zoom + panY, doc.w * zoom, doc.h * zoom].map(Math.round) : null,
            rail: boite('#rail-bord'),
            barre: boite('#bar-document'),
            barreClasses: (() => {
                const e = document.getElementById('bar-document');
                return e ? ['dans-le-rail', 'vertical'].filter(c => e.classList.contains(c)) : [];
            })(),
            tiroir: boite('#bande-morceaux'),
            onglet: boite('#rail-morceaux'),
            rond: (() => {
                const e = document.getElementById('rail-rond');
                const o = document.getElementById('rail-morceaux');
                return (o && !o.hidden && e) ? e.textContent : null;
            })(),
            poignee: boite('#rail-poignee'),
            rondDeLaPoignee: (() => {
                const e = document.getElementById('rail-poignee-rond');
                return (e && !e.hidden) ? e.textContent : null;
            })(),
            bulles: boite('#toast-container'),
            combienDeBulles: (() => {
                const c = document.getElementById('toast-container');
                return c ? c.children.length : 0;
            })(),
            // CE QUE DISENT LES BULLES, et non combien il y en a : la bulle du
            // découpage est celle qui doit se taire, pas celle qui annonce la
            // projection ni celle qui explique les ciseaux. Un contrôle qui
            // compte les bulles tombe sur la première qui passe.
            bullesDuDecoupage: (() => {
                const c = document.getElementById('toast-container');
                if (!c) return [];
                return [...c.children].map(e => e.textContent || '')
                    .filter(t => /Morceau (rangé|détouré)|Découpage terminé/.test(t));
            })(),
            morceaux: (typeof morceauxEnAttente !== 'undefined') ? morceauxEnAttente.length : -1
        };
    });

    const poserLePoly = () => page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'poly.pdf', { type: 'application/pdf' }));
        await new Promise(r2 => setTimeout(r2, 1200));
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
    }, { octets });

    // Deux morceaux découpés, comme dans la mesure d'origine.
    const decouperDeux = () => page.evaluate(async () => {
        const doc = images[0];
        basculerLaDecoupe(true);
        const tracer = (part) => {
            const q = { x: doc.x + doc.w * part.x, y: doc.y + doc.h * part.y,
                        l: doc.w * part.l, h: doc.h * part.h };
            decoupeGeste = { obj: doc, debut: { x: q.x, y: q.y }, rect: q };
            return finirGesteDeDecoupe();
        };
        tracer({ x: 0.08, y: 0.10, l: 0.80, h: 0.22 });
        tracer({ x: 0.08, y: 0.45, l: 0.80, h: 0.20 });
        basculerLaDecoupe(false);
        await new Promise(r2 => setTimeout(r2, 700));
    });

    const videLesBulles = () => page.evaluate(() => {
        const c = document.getElementById('toast-container');
        if (c) c.innerHTML = '';
    });

    // ------------------------------------------------------------------
    // 1. HORS PROJECTION, RIEN NE CHANGE
    // ------------------------------------------------------------------
    await poserLePoly();
    const auTableau = await mesurer();
    r.verifie('HORS PROJECTION, LE RAIL N\'EXISTE PAS : il est le meuble du plein écran, et un rail sur le tableau ordinaire serait un meuble de plus',
        auTableau.rail === null && auTableau.poignee === null, JSON.stringify([auTableau.rail, auTableau.poignee]));
    r.egal('ET IL NE RÉSERVE RIEN : le cadrage du tableau ordinaire est celui d\'avant, au pixel',
        [auTableau.reserve.gauche, auTableau.reserve.droite, auTableau.cadre.x, auTableau.cadre.L],
        [0, 0, 0, 1400], JSON.stringify(auTableau.cadre));

    // La bulle du découpage, elle, sert : hors projection il n'y a pas de rond
    // pour dire qu'un morceau est parti au tiroir.
    await videLesBulles();
    await decouperDeux();
    const bullesAuTableau = await mesurer();
    r.verifie('SUR LE TABLEAU, LA BULLE DU DÉCOUPAGE RESTE : sans rond, elle est le seul témoin qu\'un morceau est parti au tiroir',
        bullesAuTableau.bullesDuDecoupage.length > 0,
        JSON.stringify(bullesAuTableau.bullesDuDecoupage) + ' / ' + bullesAuTableau.combienDeBulles + ' bulles');
    r.verifie('et le tiroir des morceaux paraît de lui-même, comme avant',
        bullesAuTableau.tiroir !== null, JSON.stringify(bullesAuTableau.tiroir));

    // ------------------------------------------------------------------
    // 2. EN PROJECTION : LE RAIL, ET RIEN SUR LE BAS DE LA PAGE
    // ------------------------------------------------------------------
    await poserLePoly();
    await videLesBulles();
    await page.evaluate(() => presenterCeQuOnRegarde());
    await page.waitForTimeout(900);
    await decouperDeux();
    const projete = await mesurer();

    r.egal('EN PROJECTION, LE RAIL EST LÀ, LARGE DE 72 PX ET COLLÉ AU BORD DROIT : c\'est la bande qui n\'est à personne d\'autre',
        projete.rail && [projete.rail[0], projete.rail[2], projete.rail[1], projete.rail[3]],
        [1328, 72, 0, 900], JSON.stringify(projete.rail));

    r.egal('LA BARRE DU DOCUMENT S\'Y DRESSE — le rail n\'est pas un meuble de plus, c\'est elle debout : un rail parallèle aurait dupliqué quinze boutons',
        projete.barreClasses.slice().sort(), ['dans-le-rail', 'vertical'],
        JSON.stringify(projete.barreClasses));
    r.egal('et elle est collée au bord, large de 72 comme le rail : les vingt pixels de sa place debout laisseraient une bande vide, et la réserve ne vaudrait plus ce qu\'elle annonce',
        projete.barre && [projete.barre[0], projete.barre[2]], [1328, 72], JSON.stringify(projete.barre));

    r.verifie('LE TIROIR DES MORCEAUX NE S\'OUVRE PLUS TOUT SEUL : « quand je découpe un pdf, ça se met dans une barre qui cache un bout du pdf » — 619 px au bas de la page, pour un rangement dont on n\'avait pas besoin',
        projete.tiroir === null, JSON.stringify(projete.tiroir));

    r.egal('L\'ONGLET PORTE LE ROND, ET LE ROND PORTE LE COMPTE : « quand on coupe des morceaux l\'icône tiroir a un petit rond avec le nombre de morceaux »',
        [projete.rond, projete.morceaux], ['2', 2],
        JSON.stringify([projete.rond, projete.morceaux, projete.onglet]));

    r.verifie('LA BULLE DU DÉCOUPAGE SE TAÎT : le rond le dit déjà, et la bulle faisait 444 × 80 posés sur la page pour le répéter',
        projete.bullesDuDecoupage.length === 0, JSON.stringify(projete.bullesDuDecoupage));

    // LE BAS DE LA PAGE EST RENDU. C'est la mesure de la plainte : plus rien
    // d'empilé dans les deux cents derniers pixels, au milieu.
    const basDeLaPage = await page.evaluate(() => {
        const gene = [];
        document.querySelectorAll('#bande-morceaux, #bar-document, #bar-style, #toast-container,'
            + ' #bottom-drawer, .toolbar, .custom-toolbar').forEach(e => {
            if (e.hidden) return;
            const s = getComputedStyle(e);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return;
            const q = e.getBoundingClientRect();
            if (q.width < 4 || q.height < 4) return;
            // Au bas de l'écran, et pas collé à un bord latéral : c'est ce qui
            // tombait sur les derniers exercices.
            if (q.bottom < innerHeight - 220) return;
            if (q.right <= 80 || q.left >= innerWidth - 80) return;
            gene.push([e.id || ('.' + String(e.className).split(' ')[0]),
                       Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]);
        });
        return gene;
    });
    r.verifie('ET LE BAS DE LA PAGE EST RENDU : plus un seul meuble dans les 220 derniers pixels, là où s\'empilaient les 244 px mesurés',
        basDeLaPage.length === 0, JSON.stringify(basDeLaPage));

    r.verifie('LES BULLES QUI RESTENT MONTENT EN HAUT : « fin du document », « tracez un rectangle » — en bas elles couvraient 55 000 px² de l\'exercice le temps qu\'on les lise',
        projete.bulles === null || projete.bulles[1] < 120,
        JSON.stringify(projete.bulles));

    // ------------------------------------------------------------------
    // 3. LA RÉSERVE : LA PAGE SE POSE DANS CE QUI RESTE
    // ------------------------------------------------------------------
    r.egal('LE CADRE UTILE RETIRE LES 72 PX DU BORD CHOISI : tout le cadrage lisait l\'écran entier, et c\'est pour cela que les meubles se posaient SUR la page',
        [projete.reserve.gauche, projete.reserve.droite, projete.cadre.x, projete.cadre.L],
        [0, 72, 0, 1328], JSON.stringify([projete.reserve, projete.cadre]));

    r.verifie('LA PAGE NE VA PAS SOUS LE RAIL : « toute la largeur » veut dire toute la largeur QU\'ON A, et les 72 px sont pris sur sa marge, non sur un exercice',
        projete.page && projete.page[0] >= 0 && projete.page[0] + projete.page[2] <= 1329,
        JSON.stringify(projete.page));

    // ------------------------------------------------------------------
    // 4. EFFACER — ET LA PAGE QUI NE BOUGE PAS
    // ------------------------------------------------------------------
    const avant = projete.vue;
    await page.evaluate(() => basculerLeRailEfface(true));
    await page.waitForTimeout(300);
    const efface = await mesurer();

    r.verifie('EFFACÉ, IL NE RESTE QU\'UNE POIGNÉE DE 10 PX : « si on veut projeter le polycopié sans rien parasiter, il faut que ça puisse disparaître »',
        efface.poignee && efface.poignee[2] <= 12 && efface.rail === null && efface.barre === null,
        JSON.stringify([efface.poignee, efface.rail, efface.barre]));

    r.egal('ET LA POIGNÉE GARDE LE ROND : sans lui, découper puis effacer perdrait les morceaux sans prévenir — c\'est ce rond qui rend l\'effacement sûr',
        efface.rondDeLaPoignee, '2', JSON.stringify(efface.rondDeLaPoignee));

    r.egal('LA PAGE N\'A PAS BOUGÉ D\'UN PIXEL EN EFFAÇANT : ce que le rail réserve, il ne le reprend jamais — une page qui se redessine au milieu d\'une leçon est le défaut qu\'on soigne',
        efface.vue, avant, JSON.stringify([avant, efface.vue]));
    r.egal('la réserve tient donc, rail effacé ou non',
        [efface.reserve.gauche, efface.reserve.droite], [0, 72], JSON.stringify(efface.reserve));

    // ET ON FORCE UN RECADRAGE POUR LE MESURER VRAIMENT.
    //
    // Le contrôle d'au-dessus ne mesurait rien tout seul : effacer ne recadre
    // pas, donc la vue ne pouvait pas bouger, et il passait même en sabotant la
    // réserve. Repéré par un sabotage qui ne faisait rien tomber — un sabotage
    // muet dit que c'est le contrôle qui ne tient pas.
    //
    // La vraie promesse est que le cadre soit le MÊME, rail effacé ou non : on
    // recadre donc exprès, et la page doit retomber au pixel où elle était.
    // Qui rendrait les soixante-douze pixels à l'effacement verrait ici la page
    // sauter, exactement comme la classe la verrait sauter.
    await page.evaluate(() => recadrerLaPresentation());
    await page.waitForTimeout(250);
    const recadreEfface = await mesurer();
    r.egal('ET UN RECADRAGE, RAIL EFFACÉ, REPOSE LA PAGE AU MÊME PIXEL : le cadre utile ne dépend pas de ce qu\'on voit du rail',
        recadreEfface.vue, avant, JSON.stringify([avant, recadreEfface.vue]));

    // ------------------------------------------------------------------
    // 5. LES OUTILS PAR-DESSUS : LE RAIL S'EFFACE, LA PAGE NON
    // ------------------------------------------------------------------
    await page.evaluate(() => { basculerLeRailEfface(false); basculerLesBarresDeLaPresentation(); });
    await page.waitForTimeout(400);
    const avecBarres = await mesurer();
    // LE RAIL TIENT LA BARRE D'UN BOUT À L'AUTRE DE LA PROJECTION.
    //
    // Ce contrôle disait d'abord l'inverse — « l'état deux est une demande de
    // tout voir, le rail s'y efface » —, et c'était mon idée, non une demande.
    // La suite complète a dit ce qu'elle coûtait : « et montrer les outils ne
    // la déplace pas d'un pixel : c'était tout le reproche », obtenu 836 au
    // lieu de 229. La barre sautait du rail au bas de l'écran dès qu'on
    // demandait ses outils — mot pour mot le défaut dont on s'était plaint :
    // « pourquoi la barre du PDF va une fois en haut, une fois en bas, selon
    // qu'on mette les toolbars ou non ? ».
    r.egal('LE RAIL RESTE EN PLACE QUAND ON DEMANDE LES OUTILS : l\'état deux ajoute les AUTRES barres, il ne déménage pas celle-ci — on ne répare pas un meuble en faisant sauter un autre',
        [avecBarres.etat, avecBarres.rail && avecBarres.rail[0], avecBarres.rail && avecBarres.rail[2]],
        [2, 1328, 72], JSON.stringify([avecBarres.etat, avecBarres.rail]));
    r.egal('ET LA BARRE DU DOCUMENT N\'A PAS BOUGÉ D\'UN PIXEL EN CHANGEANT D\'ÉTAT : six cents pixels de saut pour un appui, c\'était tout le reproche',
        avecBarres.barre, projete.barre, JSON.stringify([projete.barre, avecBarres.barre]));
    r.egal('ET LA PAGE NE SAUTE PAS POUR AUTANT : la réserve ne regarde pas l\'état — elle a d\'abord suivi le rail, et demander ses outils recadrait la page devant la classe',
        [avecBarres.vue, avecBarres.reserve.droite], [avant, 72],
        JSON.stringify([avant, avecBarres.vue, avecBarres.reserve]));

    // ------------------------------------------------------------------
    // 6. LE BORD, AU CHOIX — ET RETENU
    // ------------------------------------------------------------------
    await page.evaluate(() => basculerLesBarresDeLaPresentation());
    await page.waitForTimeout(300);
    await page.evaluate(() => basculerLeBordDuRail('gauche'));
    await page.waitForTimeout(400);
    const aGauche = await mesurer();
    r.egal('AU BORD GAUCHE, LE RAIL EST AU BORD GAUCHE, de la même largeur : le bon bord dépend de la salle et de la main qui écrit, aucune valeur par défaut ne peut le savoir',
        aGauche.rail && [aGauche.rail[0], aGauche.rail[2]], [0, 72], JSON.stringify(aGauche.rail));
    r.egal('la barre s\'y dresse aussi, collée au bord gauche',
        aGauche.barre && [aGauche.barre[0], aGauche.barre[2]], [0, 72], JSON.stringify(aGauche.barre));
    r.egal('et la réserve change de côté avec lui',
        [aGauche.reserve.gauche, aGauche.reserve.droite, aGauche.cadre.x], [72, 0, 72],
        JSON.stringify([aGauche.reserve, aGauche.cadre]));
    r.verifie('LA PAGE SE RECADRE EN CHANGEANT DE BORD, et c\'est le seul geste du rail qui ait ce droit : on le demande explicitement',
        aGauche.page && aGauche.page[0] >= 72 && aGauche.page[0] + aGauche.page[2] <= 1401,
        JSON.stringify(aGauche.page));
    r.egal('LE CHOIX EST RETENU : on ne redemande pas son bord à chaque projection',
        await page.evaluate(() => localStorage.getItem('auTableau_rail_bord')), 'gauche', '');

    // ------------------------------------------------------------------
    // 7. SORTIR : LE RAIL S'EN VA, ET L'EFFACEMENT NE LUI SURVIT PAS
    // ------------------------------------------------------------------
    await page.evaluate(() => { basculerLeRailEfface(true); quitterLaPresentation(); majBarreDocument(); });
    await page.waitForTimeout(400);
    const sorti = await mesurer();
    r.egal('EN SORTANT, LE RAIL S\'EN VA ET SA RÉSERVE AVEC LUI : hors projection, la page a tout l\'écran',
        [sorti.etat, sorti.rail, sorti.poignee, sorti.reserve.gauche, sorti.reserve.droite],
        [0, null, null, 0, 0], JSON.stringify([sorti.etat, sorti.rail, sorti.poignee, sorti.reserve]));

    await page.evaluate(() => { presenterCeQuOnRegarde(); });
    await page.waitForTimeout(800);
    const deRetour = await mesurer();
    r.verifie('ET L\'EFFACEMENT NE SURVIT PAS À LA SORTIE : retrouver un écran sans rail à la projection suivante ressemblerait à une panne',
        deRetour.rail !== null && deRetour.poignee === null,
        JSON.stringify([deRetour.rail, deRetour.poignee]));

    // ------------------------------------------------------------------
    // 8. ET LE RAIL NE SURVIT PAS À LA PAGE QU'IL SERVAIT
    //
    // On sort d'une projection par la porte — « quitterLaPresentation » —, et
    // le rail s'en va avec elle. Mais on en sort aussi SANS passer par là : la
    // page projetée est supprimée, un retour en arrière l'emporte, et c'est
    // « documentPresente » qui remet le drapeau à zéro en constatant qu'il n'y
    // a plus rien à montrer. Personne alors n'a dit au rail de partir, et l'on
    // se retrouve devant un tableau ordinaire avec soixante-douze pixels de
    // mobilier au bord et aucune porte pour les faire disparaître.
    // ------------------------------------------------------------------
    await page.evaluate(() => { if (!presentationEnCours) presenterCeQuOnRegarde(); });
    await page.waitForTimeout(700);
    const avantLaDisparition = await mesurer();
    const apresLaDisparition = await page.evaluate(() => {
        // La page s'en va sans prévenir, et sans que personne sorte de la
        // projection : c'est le chemin de la suppression et de l'annulation.
        images.length = 0;
        selectedItems = [];
        // Le premier regard sur la projection constate le vide et baisse le
        // drapeau ; c'est là que le rail restait.
        const resteDeLaProjection = documentPresente();
        majBarreDocument();
        const bande = document.getElementById('rail-bord');
        const r = bande ? bande.getBoundingClientRect() : null;
        return {
            resteDeLaProjection,
            etat: etatDuPleinEcran(),
            cache: !bande || bande.hidden,
            // ET ON MESURE CE QU'ON VOIT, non ce que l'attribut annonce : une
            // règle de « display » dans la feuille de style peut battre
            // « hidden », et le rail se dire caché tout en restant au bord.
            vuALEcran: !!r && r.width > 3 && r.height > 3
                       && getComputedStyle(bande).display !== 'none'
        };
    });
    r.verifie('LA PAGE PROJETÉE ÉTAIT BIEN LÀ, RAIL COMPRIS',
        avantLaDisparition.rail !== null, JSON.stringify(avantLaDisparition.rail));
    r.egal('LE RAIL NE SURVIT PAS À LA PAGE QU\'IL SERVAIT : supprimée, annulée, la page s\'en va sans passer par la sortie — et le rail doit partir avec elle, sinon il reste au bord d\'un tableau ordinaire sans aucune porte pour l\'enlever',
        [apresLaDisparition.etat, apresLaDisparition.cache, apresLaDisparition.vuALEcran],
        [0, true, false], JSON.stringify(apresLaDisparition));

    await page.evaluate(() => { quitterLaPresentation(); basculerLeBordDuRail('droite'); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
