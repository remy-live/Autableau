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
    // 6. CE QUI S'APPELLE DEPUIS LE RAIL — ET CE QUI N'A PLUS À ÊTRE SUR LA PAGE
    //
    // « Et si on veut retrouver les tiroirs et la barre d'outils ? » Ils ne sont
    // pas perdus, ils s'appellent : un onglet pour les outils, un pour les
    // morceaux. Et ce qui n'était là que pour servir de porte s'en va, puisque
    // la porte est maintenant dans le rail — le quai des outils (96 × 64 au coin
    // bas gauche) et la croix de sortie.
    // ------------------------------------------------------------------
    await page.evaluate(() => basculerLesBarresDeLaPresentation());
    await page.waitForTimeout(300);
    const appels = await page.evaluate(() => {
        const vu = (id) => {
            const e = document.getElementById(id);
            if (!e || e.hidden) return null;
            const s = getComputedStyle(e);
            if (s.display === 'none' || s.visibility === 'hidden') return null;
            const r = e.getBoundingClientRect();
            return (r.width > 3 && r.height > 3) ? [r.x, r.y, r.width, r.height].map(Math.round) : null;
        };
        const quai = document.getElementById('dock');
        return {
            etat: etatDuPleinEcran(),
            ongletDesOutils: vu('rail-outils'),
            // LE QUAI GARDE BIEN LA BARRE — c'est la prémisse : s'il était vide,
            // le contrôle d'en dessous passerait sans rien prouver.
            quaiTientLaBarre: !!quai && [...quai.querySelectorAll('.dock-item')]
                .some(i => i.dataset.targetId === 'system-toolbar-main'),
            quaiRange: !!quai && quai.classList.contains('range-par-le-rail'),
            quaiVu: vu('dock'),
            croixVue: vu('exit-focus-cross'),
            // Et la sortie du plein écran est bien DANS le rail : c'est elle qui
            // autorise la croix à s'effacer.
            sortieDansLeRail: (() => {
                const b = document.getElementById('doc-plein-ecran');
                if (!b) return false;
                const r = b.getBoundingClientRect();
                return r.width > 3 && r.x >= innerWidth - 80;
            })()
        };
    });
    r.verifie('L\'ONGLET DES OUTILS EST DANS LE RAIL : la porte est là où l\'on a le doigt',
        appels.ongletDesOutils !== null && appels.ongletDesOutils[0] >= 1328,
        JSON.stringify(appels.ongletDesOutils));
    r.verifie('le quai garde bien la barre des outils — sans quoi il n\'y aurait rien à ranger',
        appels.quaiTientLaBarre, JSON.stringify(appels));
    r.egal('LE QUAI N\'EST PLUS SUR LA PAGE : 96 × 64 au coin bas gauche pour une porte qu\'on allait chercher loin de là où l\'on regarde — l\'onglet du rail est cette porte',
        [appels.quaiRange, appels.quaiVu], [true, null], JSON.stringify(appels));
    // MAIS ON NE CACHE PAS UN QUAI QUI GARDE AUTRE CHOSE.
    //
    // Une fenêtre d'outil rangée là — une pyramide, une fraction, un atelier —
    // n'a pas d'autre porte que cette pastille : la cacher l'enfermerait
    // dehors, et devant une classe. L'onglet du rail ne rend que la barre des
    // outils ; il ne sait rien des autres. On compte donc ce que le quai tient,
    // et on ne l'efface que s'il ne tient que la barre.
    const quaiPartage = await page.evaluate(async () => {
        const quai = document.getElementById('dock');
        if (!quai) return null;
        const lire = () => {
            const s = getComputedStyle(quai);
            return { range: quai.classList.contains('range-par-le-rail'),
                     vu: s.display !== 'none' && quai.getBoundingClientRect().width > 3 };
        };
        // On y range une seconde chose, telle que le code en produit : une
        // pastille qui vise une autre barre que celle du système.
        const autre = document.createElement('div');
        autre.className = 'dock-item';
        autre.dataset.targetId = 'floating-essai';
        quai.appendChild(autre);
        poserLeRail();
        await new Promise(r2 => setTimeout(r2, 250));
        const aDeux = lire();
        autre.remove();
        poserLeRail();
        await new Promise(r2 => setTimeout(r2, 250));
        return { aDeux, seul: lire() };
    });
    r.egal('UN QUAI QUI GARDE AUTRE CHOSE RESTE : une fenêtre d\'outil rangée là n\'a pas d\'autre porte, et la cacher l\'enfermerait dehors devant une classe',
        quaiPartage && [quaiPartage.aDeux.range, quaiPartage.aDeux.vu], [false, true],
        JSON.stringify(quaiPartage));
    r.egal('et il se range de nouveau dès qu\'il ne garde plus que la barre',
        quaiPartage && [quaiPartage.seul.range, quaiPartage.seul.vu], [true, false],
        JSON.stringify(quaiPartage));

    r.verifie('LA SORTIE DU PLEIN ÉCRAN EST DANS LE RAIL, et c\'est ce qui autorise la croix à s\'effacer',
        appels.sortieDansLeRail, JSON.stringify(appels));
    r.egal('LA CROIX DE SORTIE S\'EFFACE AVEC ELLE : deux portes à deux coins opposés pour le même geste, c\'est une porte qu\'on cherche',
        appels.croixVue, null, JSON.stringify(appels));

    // ------------------------------------------------------------------
    // LE RAIL NE GARDE PAS CE QU'IL REND INUTILE
    //
    // « La barre à droite en PDF et les boutons me chagrinent encore un peu,
    // ainsi que les icônes en haut à droite. L'icône de page, je trouve qu'elle
    // prend de la place. »
    //
    // Compté dans l'application, PDF projeté : dix-huit boutons au bord — quinze
    // dans la barre du document, trois dans la bande du rail — et six au coin.
    // Trois retraits ne coûtent AUCUN geste de plus :
    //
    //   LE DOUBLON. « Montrer les outils par-dessus la page » existait deux fois,
    //   à cinquante pixels l'un de l'autre : dans la barre, et dans l'onglet du
    //   rail qui porte son mot.
    //
    //   LE RÉSIDU. « Mettre la barre debout, au bord droit » — dans le rail elle
    //   l'est par construction, le bouton ne pouvait plus rien faire.
    //
    //   LA SECONDE PAGINATION. ◀ 1/1 ▶ ＋ au coin, ce sont les pages du TABLEAU ;
    //   ▲ 1/6 ▼ dans le rail, celles du DOCUMENT. On ne feuillette pas son
    //   tableau pendant qu'on projette un PDF.
    //
    // Les trois sont des RETRAITS DE LA PROJECTION, non des suppressions : hors
    // d'elle, tout revient à sa place.
    // ------------------------------------------------------------------
    const compter = () => page.evaluate(() => {
        const vu = (e) => {
            if (!e || e.hidden) return false;
            const s = getComputedStyle(e);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return false;
            const r = e.getBoundingClientRect();
            return r.width > 3 && r.height > 3;
        };
        const boutons = (sel) => {
            const el = document.querySelector(sel);
            if (!el || !vu(el)) return 0;
            return [...el.querySelectorAll('button, .doc-btn, input, select')].filter(vu).length;
        };
        const coin = document.getElementById('barre-ecran');
        return {
            barre: boutons('#bar-document'),
            bande: boutons('#rail-bord'),
            coin: boutons('#barre-ecran'),
            largeurDuCoin: coin && vu(coin) ? Math.round(coin.getBoundingClientRect().width) : 0,
            doublon: vu(document.getElementById('doc-barres')),
            residu: vu(document.getElementById('bar-style-orienter')),
            pagesDuTableau: vu(document.getElementById('ecran-pages')),
            ongletDesOutils: vu(document.getElementById('rail-outils')),
            pagesDuDocument: vu(document.getElementById('doc-page-num')),
            // L'onglet des morceaux ne compte pas comme un meuble permanent :
            // il ne paraît que lorsqu'il y a quelque chose dedans, et il s'en
            // va avec le dernier morceau posé.
            ongletMorceaux: vu(document.getElementById('rail-morceaux'))
        };
    });
    const enProjetant = await compter();
    r.egal('LE DOUBLON N\'EST PLUS DANS LE RAIL : « montrer les outils par-dessus la page » existait deux fois, à cinquante pixels l\'un de l\'autre — l\'onglet qui porte son mot reste, l\'autre s\'en va',
        [enProjetant.doublon, enProjetant.ongletDesOutils], [false, true], JSON.stringify(enProjetant));
    r.egal('LE RÉSIDU NON PLUS : « mettre la barre debout, au bord droit » — dans le rail elle l\'est déjà, et un bouton qui ne fait rien apprend à ne plus regarder la barre',
        enProjetant.residu, false, JSON.stringify(enProjetant));
    // LA PAGINATION DU TABLEAU RESTE, ET C'EST UNE DEMANDE.
    //
    // Ce contrôle demandait d'abord qu'elle quitte le coin en projetant : « on
    // ne feuillette pas son tableau pendant qu'on projette un PDF ». La
    // prémisse était fausse, et c'est le chapitre 15 qui l'a dit, en portant la
    // demande d'origine : « il faudrait aussi pouvoir supprimer facilement une
    // page EN MODE PLEIN ÉCRAN (clic sur le numéro de page 2/3 et option pour
    // supprimer) ». Le rang du coin est la porte par laquelle on jette une page
    // d'exercices devant la classe, sans rendre les barres — et le ▶ tourne les
    // pages du tableau sans sortir de la projection.
    //
    // La place qu'elle prend se gagnera en resserrant son dessin, pas en lui
    // retirant son office.
    r.egal('LA PAGINATION DU TABLEAU RESTE AU COIN, MÊME EN PROJETANT : c\'est par son rang qu\'on jette une page d\'exercices devant la classe, sans rendre les barres',
        [enProjetant.pagesDuTableau, enProjetant.pagesDuDocument], [true, true],
        JSON.stringify(enProjetant));
    // ET LE COMPTE SE FAIT SUR CE QUI EST TOUJOURS LÀ.
    //
    // Deux fois corrigé, et les deux fois par la mesure. D'abord il comptait
    // l'onglet des morceaux, qui n'est pas un meuble permanent : il paraît avec
    // le premier découpage et s'en va avec le dernier morceau posé. Puis les
    // familles sont arrivées — le texte, le cache, la forme et le rognage ne
    // sont plus là qu'avec l'outil qui les appelle —, et seize est devenu
    // douze.
    //
    // L'histoire du bord, mesurée à chaque étape :
    //
    //   18   au départ, tout visible en permanence
    //   16   le doublon et le résidu retirés
    //   12   les familles repliées sur leur tête
    //
    // Ce contrôle est la sentinelle de ce chiffre-là : c'est par là qu'un bord
    // regrossit, un bouton à la fois.
    r.verifie('ET LE COMPTE Y EST : dix-huit boutons au bord au départ, seize après les retraits, douze depuis que chaque famille se replie sur sa tête',
        enProjetant.barre + enProjetant.bande - (enProjetant.ongletMorceaux ? 1 : 0) === 12,
        JSON.stringify(enProjetant));

    // ------------------------------------------------------------------
    // UN OUTIL PRIS MONTRE SA FAMILLE
    //
    // « Je me sers rarement simultanément du texte, du crayon. » Quatre
    // pastilles de tracé et quatre de découpe tenaient la place de huit, en
    // permanence, dans un rail de soixante-douze pixels.
    //
    // Les réunir derrière un bouton à déplier coûterait un appui de plus — et
    // justement sur « sélection ↔ crayon », qu'on alterne sans cesse en
    // annotant une page projetée. On fait donc l'inverse : les TÊTES de famille
    // restent visibles, et chaque famille ne paraît QUE PENDANT QU'ON S'EN
    // SERT. Le geste qui l'ouvre est celui qu'on allait faire de toute façon.
    //
    // « La forme de la découpe, c'est vraiment à la marge, mais il faut le
    // garder » : elle est gardée, et elle paraît au seul moment où elle sert.
    // ------------------------------------------------------------------
    const familles = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const vu = (id) => {
            const e = document.getElementById(id);
            if (!e || e.hidden) return false;
            const s = getComputedStyle(e);
            if (s.display === 'none' || s.visibility === 'hidden') return false;
            const r = e.getBoundingClientRect();
            return r.width > 3 && r.height > 3;
        };
        const etat = () => ({
            main: vu('doc-outil-main'), crayon: vu('doc-outil-crayon'),
            texte: vu('doc-outil-texte'), cache: vu('doc-outil-cache'),
            ciseaux: vu('doc-decouper'), forme: vu('doc-decoupe-forme'), rogner: vu('doc-rogner'),
            hauteur: Math.round(document.getElementById('bar-document').getBoundingClientRect().height)
        });
        annoterLeDocument('pointer'); majBarreDocument(); await attendre(250);
        const repos = etat();
        annoterLeDocument('freehand'); majBarreDocument(); await attendre(250);
        const auCrayon = etat();
        annoterLeDocument('pointer'); basculerLaDecoupe(true); majBarreDocument(); await attendre(250);
        const auxCiseaux = etat();
        basculerLaDecoupe(false); majBarreDocument(); await attendre(250);
        return { repos, auCrayon, auxCiseaux, retour: etat() };
    });
    r.egal('AU REPOS, LES TÊTES DE FAMILLE SEULES : la main, le crayon, les ciseaux — on alterne « sélection ↔ crayon » sans cesse, et cela doit rester un seul appui',
        [familles.repos.main, familles.repos.crayon, familles.repos.ciseaux,
         familles.repos.texte, familles.repos.cache, familles.repos.forme, familles.repos.rogner],
        [true, true, true, false, false, false, false], JSON.stringify(familles.repos));
    r.egal('PRENDRE LE CRAYON FAIT VENIR LE TEXTE ET LE CACHE : le geste qui ouvre la famille est celui qu\'on allait faire de toute façon — aucun appui ajouté',
        [familles.auCrayon.texte, familles.auCrayon.cache, familles.auCrayon.forme],
        [true, true, false], JSON.stringify(familles.auCrayon));
    r.egal('ARMER LES CISEAUX FAIT VENIR LA FORME ET LE ROGNAGE : « la forme de la découpe, c\'est vraiment à la marge, mais il faut le garder » — gardée, et montrée au seul moment où elle sert',
        [familles.auxCiseaux.forme, familles.auxCiseaux.rogner, familles.auxCiseaux.texte],
        [true, true, false], JSON.stringify(familles.auxCiseaux));
    r.egal('et la famille se referme avec l\'outil qu\'on repose',
        [familles.retour.texte, familles.retour.cache,
         familles.retour.forme, familles.retour.rogner],
        [false, false, false, false], JSON.stringify(familles.retour));
    r.verifie('LA BARRE Y GAGNE EN HAUTEUR, ET C\'EST LA MESURE QUI COMPTE : 547 px au départ, 487 après les retraits, moins de 400 maintenant',
        familles.repos.hauteur < 400 && familles.auCrayon.hauteur > familles.repos.hauteur,
        JSON.stringify({ repos: familles.repos.hauteur, auCrayon: familles.auCrayon.hauteur }));

    // ET CE SONT DES RETRAITS DE LA PROJECTION, NON DES SUPPRESSIONS.
    const auTableauEnsuite = await page.evaluate(async () => {
        quitterLaPresentation();
        majBarreDocument();
        if (typeof majLesPagesDeLEcran === 'function') majLesPagesDeLEcran();
        await new Promise(r2 => setTimeout(r2, 500));
        const vu = (id) => {
            const e = document.getElementById(id);
            if (!e || e.hidden) return false;
            const s = getComputedStyle(e);
            return s.display !== 'none' && e.getBoundingClientRect().width > 3;
        };
        return { pagesDuTableau: vu('ecran-pages'), residu: vu('bar-style-orienter') };
    });
    r.egal('HORS PROJECTION, LE BOUTON D\'ORIENTATION REVIENT : il est retiré du RAIL, non supprimé de l\'application — couchée, la barre a de nouveau le choix',
        [auTableauEnsuite.pagesDuTableau, auTableauEnsuite.residu], [true, true],
        JSON.stringify(auTableauEnsuite));
    await page.evaluate(() => presenterCeQuOnRegarde());
    await page.waitForTimeout(800);

    // ET L'ONGLET DES OUTILS FAIT LES DEUX GESTES — c'est la même question.
    const parLOnglet = await page.evaluate(async () => {
        const o = document.getElementById('rail-outils');
        const avant = etatDuPleinEcran();
        o.click();
        await new Promise(r2 => setTimeout(r2, 400));
        const pendant = etatDuPleinEcran();
        o.click();
        await new Promise(r2 => setTimeout(r2, 400));
        return { avant, pendant, apres: etatDuPleinEcran() };
    });
    r.egal('L\'ONGLET MONTRE LES OUTILS, ET LE MÊME LES RANGE : une seule question, un seul bouton',
        [parLOnglet.avant, parLOnglet.pendant, parLOnglet.apres], [1, 2, 1],
        JSON.stringify(parLOnglet));

    // ET DEMANDER LES OUTILS, C'EST LES OBTENIR — MÊME SI L'ON AVAIT RANGÉ SA
    // BARRE SOI-MÊME AVANT DE PROJETER.
    //
    // « Quand je clique sur outils quand je suis en pdf, je ne vois plus la
    // barre d'outil apparaître — celle avec le rapporteur, les traits, le
    // surligneur. » La faute était double. La fonction qui rend la barre ne la
    // rendait que si c'est LA PROJECTION qui l'avait rangée : bonne règle pour
    // la sortie — qui avait rangé sa barre lui-même la retrouve rangée, on ne
    // défait pas son ménage —, mais appliquée à la demande explicite « montre-
    // moi les outils », elle refusait de les montrer. Et le quai, qui restait
    // la porte de secours, est désormais caché par le rail : il ne restait plus
    // AUCUN chemin vers le rapporteur, devant une classe.
    //
    // On éprouve donc le chemin entier, et non le drapeau : la barre était-elle
    // à l'écran après l'appui ?
    const rangeeAvant = await page.evaluate(async () => {
        if (etatDuPleinEcran() === 2) basculerLesBarresDeLaPresentation();
        quitterLaPresentation();
        await new Promise(r2 => setTimeout(r2, 400));
        const vue = () => {
            const b = document.getElementById('system-toolbar-main');
            if (!b) return false;
            const s = getComputedStyle(b), q = b.getBoundingClientRect();
            return s.display !== 'none' && parseFloat(s.opacity) > 0.05 && q.width > 3;
        };
        // L'usager range SA barre, lui-même, avant de projeter.
        minimizeFloatingToolbar(document.getElementById('system-toolbar-main'));
        await new Promise(r2 => setTimeout(r2, 300));
        const rangee = vue();
        presenterCeQuOnRegarde();
        await new Promise(r2 => setTimeout(r2, 800));
        const enProjetant = vue();
        document.getElementById('rail-outils').click();
        await new Promise(r2 => setTimeout(r2, 700));
        return { rangee, enProjetant, apresLAppui: vue(), etat: etatDuPleinEcran() };
    });
    r.egal('la barre était bien rangée par l\'usager, et le reste en projetant — c\'est la prémisse',
        [rangeeAvant.rangee, rangeeAvant.enProjetant], [false, false],
        JSON.stringify(rangeeAvant));
    r.egal('DEMANDER LES OUTILS, C\'EST LES OBTENIR : même rangée à la main avant de projeter, la barre revient — sinon il ne reste aucun chemin vers le rapporteur, le quai étant caché par le rail',
        [rangeeAvant.apresLAppui, rangeeAvant.etat], [true, 2],
        JSON.stringify(rangeeAvant));
    await page.evaluate(() => { if (etatDuPleinEcran() === 2) basculerLesBarresDeLaPresentation(); });
    await page.waitForTimeout(350);

    // CACHER LE RAIL NE FAIT RIEN SURGIR.
    //
    // Ce contrôle demandait d'abord que la croix revienne quand le rail
    // s'efface, pour qu'il reste toujours une issue visible. « Cacher le rail
    // fait apparaître les outils » : on efface le rail POUR AVOIR UN ÉCRAN
    // PROPRE, et l'on voyait reparaître la croix et le quai. Un geste qui fait
    // le contraire de ce qu'il annonce est pire que pas de geste du tout.
    //
    // L'issue, alors, c'est la poignée — dix pixels au bord, qui portent le
    // rond des morceaux et rendent le rail d'un doigt —, et Échap, qui sort de
    // partout. On vérifie donc que la poignée est bien là, et que rien d'autre
    // n'est venu avec.
    await page.evaluate(() => basculerLeRailEfface(true));
    await page.waitForTimeout(300);
    const sansLeRail = await page.evaluate(() => {
        const e = document.getElementById('exit-focus-cross');
        const s = e ? getComputedStyle(e) : null;
        const r = e ? e.getBoundingClientRect() : null;
        // ON LIT CE QU'ON VOIT, non l'attribut : effacé, le rail est caché par
        // la feuille de style et garde son « hidden » à faux, puisqu'il est
        // toujours « en place » — c'est sa réserve qui ne se reprend pas.
        const b = document.getElementById('rail-bord');
        const sb = b ? getComputedStyle(b) : null;
        const q = document.getElementById('dock');
        const p2 = document.getElementById('rail-poignee');
        const vu = (x) => {
            if (!x || x.hidden) return false;
            const st = getComputedStyle(x);
            return st.display !== 'none' && x.getBoundingClientRect().width > 3;
        };
        return { croixVue: !!e && !e.hidden && s.display !== 'none' && r.width > 3,
                 quaiVu: vu(q), poigneeVue: vu(p2),
                 railVu: !!b && !b.hidden && sb.display !== 'none' };
    });
    r.egal('LE RAIL CACHÉ, RIEN NE SURGIT — ni la croix, ni le quai : on l\'efface pour avoir un écran propre',
        [sansLeRail.croixVue, sansLeRail.quaiVu, sansLeRail.railVu], [false, false, false],
        JSON.stringify(sansLeRail));
    r.verifie('et la poignée reste : c\'est elle la porte, et Échap sort toujours',
        sansLeRail.poigneeVue, JSON.stringify(sansLeRail));
    await page.evaluate(() => basculerLeRailEfface(false));
    await page.waitForTimeout(250);

    // LE TIROIR APPELÉ SORT DU BORD, JAMAIS DU BAS.
    const tiroirAppele = await page.evaluate(async () => {
        basculerLeTiroirDuRail(true);
        await new Promise(r2 => setTimeout(r2, 400));
        const e = document.getElementById('bande-morceaux');
        const r = e.getBoundingClientRect();
        return { boite: [r.x, r.y, r.width, r.height].map(Math.round),
                 colonne: e.classList.contains('contre-le-rail'),
                 // Collé au rail, et pas au bas de l'écran.
                 contreLeRail: Math.round(innerWidth - r.right),
                 sousLeBord: Math.round(innerHeight - r.bottom) };
    });
    r.verifie('LE TIROIR APPELÉ SORT CONTRE LE RAIL, à hauteur d\'épaule : il se posait encore au milieu du bas de l\'écran, c\'est-à-dire sur les derniers exercices',
        tiroirAppele.colonne && tiroirAppele.contreLeRail >= 72
        && tiroirAppele.contreLeRail <= 96 && tiroirAppele.sousLeBord > 120,
        JSON.stringify(tiroirAppele));
    r.verifie('et il se lit de haut en bas : une colonne de vignettes, non une barre en travers de la page',
        tiroirAppele.boite[3] > tiroirAppele.boite[2], JSON.stringify(tiroirAppele));

    // JUSTE LES MORCEAUX, ET LA PAGE.
    //
    // « J'ai pas compris, il faudrait juste voir les morceaux et choisir la
    // page. » Mesuré dans le panneau appelé : une barre de titre « ✂ 2
    // morceaux », PUIS un second titre identique juste dessous, les vignettes,
    // « Tout poser sur la page », un bouton « ⋯ », un bouton « ✕ », et une
    // phrase de onze mots. Huit choses à lire pour un geste qui en compte deux.
    //
    // Le titre de la fenêtre suffit. Le « ⋯ » dépliait le choix de la page —
    // c'est justement ce qu'on vient chercher, il est donc là d'emblée.
    // « Vider le tiroir » est rare et destructeur : il reste sur le tableau
    // ordinaire. Et la phrase redit ce que « 1/2 » montre.
    const dedansLeTiroir = await page.evaluate(async () => {
        basculerLeTiroirDuRail(true);
        await new Promise(r2 => setTimeout(r2, 400));
        const vu = (sel) => {
            const e = document.querySelector(sel);
            if (!e || e.hidden) return false;
            const s = getComputedStyle(e);
            return s.display !== 'none' && s.visibility !== 'hidden'
                && e.getBoundingClientRect().height > 3;
        };
        const b = document.getElementById('bande-morceaux');
        return {
            vignettes: b.querySelectorAll('.bm-vignette').length,
            choixDeLaPage: vu('#bm-replie') && vu('#bm-page'),
            secondTitre: vu('#bande-morceaux .bm-titre'),
            boutonDeplier: vu('#bm-plus'),
            boutonVider: vu('#bm-vider'),
            laPhrase: vu('#bm-explique'),
            largeur: Math.round(b.getBoundingClientRect().width),
            // ET LA MÊME LARGEUR D'UN APPEL À L'AUTRE : « je ne comprends pas
            // pourquoi ça se ragrandit ».
            largeurDeuxiemeAppel: await (async () => {
                basculerLeTiroirDuRail(false);
                await new Promise(r2 => setTimeout(r2, 300));
                basculerLeTiroirDuRail(true);
                await new Promise(r2 => setTimeout(r2, 350));
                return Math.round(document.getElementById('bande-morceaux')
                    .getBoundingClientRect().width);
            })()
        };
    });
    r.egal('LE TIROIR NE MONTRE QUE LES MORCEAUX ET LE CHOIX DE LA PAGE : « il faudrait juste voir les morceaux et choisir la page »',
        [dedansLeTiroir.vignettes, dedansLeTiroir.choixDeLaPage], [2, true],
        JSON.stringify(dedansLeTiroir));
    r.egal('et le reste s\'en va : le second titre, le bouton qui dépliait, le vidage, la phrase — huit choses à lire pour un geste qui en compte deux',
        [dedansLeTiroir.secondTitre, dedansLeTiroir.boutonDeplier,
         dedansLeTiroir.boutonVider, dedansLeTiroir.laPhrase],
        [false, false, false, false], JSON.stringify(dedansLeTiroir));
    r.egal('ET IL NE SE RAGRANDIT PAS : « je ne comprends pas pourquoi ça se ragrandit » — même largeur d\'un appel à l\'autre',
        dedansLeTiroir.largeurDeuxiemeAppel, dedansLeTiroir.largeur,
        JSON.stringify(dedansLeTiroir));

    // ET LE BOUTON DES OUTILS PORTE SON MOT. « L'icône montrer les outils
    // au-dessus de la page n'est pas clair. » Un « ⊞ » ne dit rien — c'est un
    // carré divisé, il vaut pour une grille, un tableau, un ajout. Un mot, si.
    const leMot = await page.evaluate(() => {
        const o = document.getElementById('rail-outils');
        if (!o) return null;
        const m = o.querySelector('.rail-mot');
        return { mot: m ? (m.textContent || '').trim() : '',
                 motVu: !!m && m.getBoundingClientRect().height > 3,
                 dessin: !!o.querySelector('svg'),
                 infobulle: o.getAttribute('data-tooltip') || '' };
    });
    r.verifie('LE BOUTON DES OUTILS PORTE SON MOT, et non un signe à deviner : dans un rail de 72 px, le mot tient sous le dessin',
        leMot && leMot.motVu && /outils/i.test(leMot.mot) && leMot.dessin,
        JSON.stringify(leMot));
    await page.evaluate(() => basculerLeTiroirDuRail(false));
    await page.waitForTimeout(250);

    // UNE PAGE QUI NE DÉBORDE QUE D'UN POUCE SE MONTRE ENTIÈRE.
    //
    // « Un PDF A4 en paysage a besoin d'être un peu scrollé. » La pleine
    // largeur est le bon défaut pour un polycopié DEBOUT : il déborde du double
    // en hauteur, et l'on descend comme dans un lecteur. Mais une A4 COUCHÉE
    // mesure, dans le cadre utile, neuf cent trente-neuf pixels de haut pour
    // neuf cents d'écran : trente-neuf de trop, et l'on doit défiler pour voir
    // le bas d'un document qui tenait presque. En page entière, la même fait
    // mille deux cent soixante-treize de large sur mille trois cent vingt-huit
    // disponibles — cinquante-cinq pixels de bande, et la page sous les yeux.
    const orientations = await page.evaluate(async () => {
        const essayer = async (w, h) => {
            if (presentationEnCours) quitterLaPresentation();
            images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
            const doc = { id: nextId++, x: 0, y: 0, w, h, cx: 0, cy: 0, cw: 1, ch: 1,
                          src: 'x', fileName: 'p.pdf', z: globalZ++,
                          pluginData: { id: 'pdfDoc', cle: 'o' + w, page: 1, pages: 1 } };
            images.push(doc);
            selectedItems = [{ type: 'image', id: doc.id }];
            majBarreDocument();
            presenterLeDocument();
            await new Promise(r2 => setTimeout(r2, 600));
            const cadre = cadreUtile();
            return { cadrage: cadrageDePresentation,
                     hauteurAffichee: Math.round(doc.h * zoom),
                     ecran: Math.round(cadre.H),
                     // Rien à défiler : la page entière tient dans l'écran.
                     entiere: doc.h * zoom <= cadre.H + 1 };
        };
        const couchee = await essayer(1189, 841);   // A4 paysage
        const debout = await essayer(841, 1189);    // A4 portrait
        if (presentationEnCours) quitterLaPresentation();
        images.length = 0; selectedItems = []; majBarreDocument();
        return { couchee, debout };
    });
    r.egal('UNE A4 COUCHÉE S\'OUVRE ENTIÈRE : pour trente-neuf pixels de débordement, on perdait la vue d\'ensemble et il fallait défiler',
        [orientations.couchee.cadrage, orientations.couchee.entiere], ['page', true],
        JSON.stringify(orientations.couchee));
    r.egal('ET UNE A4 DEBOUT GARDE LA PLEINE LARGEUR : elle déborde du double, et c\'est bien ainsi qu\'on lit un polycopié — on descend comme dans un lecteur',
        [orientations.debout.cadrage, orientations.debout.entiere], ['largeur', false],
        JSON.stringify(orientations.debout));

    // L'épreuve des orientations a vidé le tableau pour y poser ses deux pages
    // d'essai : on remet la scène du chapitre avant la suite, sans quoi les
    // sections qui suivent mesureraient un écran sans rien dessus.
    await poserLePoly();
    await page.evaluate(() => presenterCeQuOnRegarde());
    await page.waitForTimeout(900);

    // ------------------------------------------------------------------
    // 7. LE BORD, AU CHOIX — ET RETENU
    // ------------------------------------------------------------------
    await page.evaluate(() => { if (etatDuPleinEcran() === 2) basculerLesBarresDeLaPresentation(); });
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
