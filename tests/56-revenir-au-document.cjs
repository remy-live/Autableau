// LE CHEMIN DU RETOUR, ET IL MONTRE OÙ IL MÈNE.
//
// « Quand je coupe dans un PDF et que je mets à côté, c'est relou de revenir au
// PDF — qui d'ailleurs ne devient qu'une image, on ne peut plus naviguer
// dedans. » Puis : « On pourrait mettre aussi une petite vignette à côté du
// plein écran pour revenir au document d'avant. »
//
// C'était exact, et mesuré : poser un morceau referme le plein écran (on ne
// pose pas à côté d'une page qu'on projette), le morceau devient le document
// tenu, et un morceau n'a pas de pages — les flèches s'en vont avec lui. Le
// retour demandait quatre gestes.
//
// LE BOUTON A D'ABORD ÉTÉ POSÉ AU MAUVAIS ENDROIT : dans la barre du document,
// qui paraît et disparaît avec la sélection. Elle n'est donc plus là au moment
// précis où l'on veut revenir — quand on vient de ranger ses morceaux et qu'on
// ne tient plus rien. C'est l'erreur que « Projeter » avait déjà faite avant
// lui, et pour laquelle il avait déménagé dans la barre du coin. La vignette
// l'y rejoint.
//
// ET LA SORTIE DE PLEIN ÉCRAN A ÉTÉ RESSERRÉE DEPUIS. « Quand je suis en plein
// écran, je découpe, je mets sur le côté, et ça me fait sortir du plein écran. »
// On en sortait dès que le morceau n'était pas ENTIÈREMENT sur la page, au motif
// qu'on ne pose pas à côté d'une page qu'on projette — ce qui était vrai tant
// que le voile de présentation couvrait la marge. Il épargne maintenant ce qu'on
// a tiré de la page projetée, et l'on ne quitte plus que si le morceau tombe
// HORS DE VUE.
//
// CE QUE CETTE SUITE TIENT :
//
//   — la vignette ne paraît que s'il y a où revenir, et elle PEINT sa
//     destination : un bouton qui montre où il mène n'a pas à être deviné ;
//   — posé dans la marge, on reste projeté ET le morceau s'y voit ; posé hors
//     de l'écran, on quitte pour le retrouver ; « Tout poser » quitte toujours ;
//   — un morceau rentre chez lui, à la page d'où il vient, projeté s'il l'était
//     au moment du découpage ;
//   — sinon elle rend le dernier document tenu, là où on l'a laissé — y
//     compris quand on ne tient plus rien, seul moment où l'on en a besoin ;
//   — un morceau taillé dans un morceau rentre jusqu'au PDF, pas chez son
//     voisin ;
//   — le document effacé, la vignette s'en va ;
//   — Alt+← fait le même geste, et Ctrl+Z, lui, continue de défaire ;
//   — et l'ancien bouton de la barre du document a bien disparu : deux chemins
//     vers le même endroit, c'est un de trop.
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Revenir au document d\'avant');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function'
        && typeof allerALaPage === 'function', { timeout: 20000 });

    const octets = Array.from(petitPdf());

    const poserLePdf = (n) => page.evaluate(async ({ octets, n }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; freehands.length = 0; texts.length = 0;
        if (typeof quitterLaPresentation === 'function') quitterLaPresentation();
        morceauxEnAttente = [];
        traceDesDocuments = [];
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1000));
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        if (n > 1) await allerALaPage(images[0], n);
        majBarreDocument();
        return images[0].id;
    }, { octets, n });

    const decouperEtPoser = (ou) => page.evaluate((ou) => {
        const src = images.find(i => i.pluginData && i.pluginData.id === 'pdfDoc') || images[0];
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: src.x + 20, y: src.y + 20 });
        poursuivreGesteDeDecoupe({ x: src.x + src.w * 0.6, y: src.y + src.h * 0.4 });
        finirGesteDeDecoupe();
        const m = morceauxEnAttente[morceauxEnAttente.length - 1];
        const objet = poserLeMorceau(m, ou || { x: src.x + src.w + 300, y: src.y + 100 });
        majBarreDocument();
        return objet.id;
    }, ou);

    const etat = () => page.evaluate(() => {
        const vu = (id) => {
            const e = document.getElementById(id);
            return !!e && getComputedStyle(e).display !== 'none';
        };
        const doc = documentDeLaBarre();
        const cible = documentOuRevenir();
        return {
            tenu: doc ? (doc.pluginData ? doc.pluginData.id : 'image') : null,
            feuilletable: doc ? estUnPdfFeuilletable(doc) : null,
            vignette: vu('btn-ecran-retour'),
            fleches: vu('doc-pages'),
            page: doc && doc.pluginData ? doc.pluginData.page : null,
            projette: !!presentationEnCours,
            versOu: cible ? ((cible.doc.pluginData ? cible.doc.pluginData.id : 'image')
                             + '#' + cible.doc.id + '@' + cible.page) : null
        };
    });

    // Une vignette peinte n'est pas un carré vide : on compte les pixels qui
    // ne sont pas transparents, et l'on regarde s'il y a autre chose que du
    // blanc — un fond blanc tout seul serait une page qu'on n'a pas su rendre.
    const vignettePeinte = () => page.evaluate(() => {
        const c = document.getElementById('vignette-retour');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let opaques = 0, encre = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 10) opaques++;
            if (d[i + 3] > 10 && (d[i] < 230 || d[i + 1] < 230 || d[i + 2] < 230)) encre++;
        }
        return { opaques, encre, total: c.width * c.height };
    });

    // ------------------------------------------------------------------
    // 1. ELLE NE PARAÎT QUE S'IL Y A OÙ REVENIR
    // ------------------------------------------------------------------
    await poserLePdf(1);
    const seul = await etat();
    r.verifie('un seul document tenu : nulle part où revenir, pas de vignette',
        seul.vignette === false && seul.versOu === null, JSON.stringify(seul));

    await decouperEtPoser();
    const surLeMorceau = await etat();
    r.verifie('sur le morceau posé, la vignette paraît et vise le PDF',
        surLeMorceau.tenu === 'morceau' && surLeMorceau.vignette === true
        && surLeMorceau.fleches === false
        && /^pdfDoc#\d+@1$/.test(surLeMorceau.versOu), JSON.stringify(surLeMorceau));

    // ELLE PEINT SA DESTINATION. C'est tout son intérêt : on voit où l'on va.
    const peinte = await vignettePeinte();
    r.verifie('et elle peint vraiment la page où elle mène',
        peinte.opaques > peinte.total * 0.5 && peinte.encre > 20, JSON.stringify(peinte));

    // ET ELLE MONTRE LA PAGE OÙ ELLE MÈNE, pas celle que le document affiche
    // en ce moment. Sans quoi la vignette mentirait exactement là où elle sert :
    // on découpe page 1, on continue à feuilleter jusqu'à la 3, et l'image du
    // retour annoncerait la 3 pour ramener à la 1.
    await poserLePdf(1);
    await decouperEtPoser();
    const montre = await page.evaluate(async () => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        await allerALaPage(pdf, 3);
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
        const cnv = document.getElementById('vignette-retour');
        const lu = cnv.getContext('2d').getImageData(0, 0, cnv.width, cnv.height).data;
        // La référence est peinte À PART, depuis le rendu de chaque page : se
        // servir de la fonction de l'application y recopierait ses propres
        // bugs, et le test ne mesurerait plus que sa propre cohérence.
        const d = documentsPdf.get(pdf.pluginData.cle);
        const ecart = (n) => new Promise(res => {
            const r = d.rendus.get(n);
            if (!r || !r.src) return res(null);
            const im = new Image();
            im.onload = () => {
                const t = document.createElement('canvas');
                t.width = cnv.width; t.height = cnv.height;
                const c = t.getContext('2d');
                const sw = pdf.cw || im.naturalWidth, sh = pdf.ch || im.naturalHeight;
                const k = Math.min(t.width / sw, t.height / sh);
                const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
                const x = Math.round((t.width - w) / 2), y = Math.round((t.height - h) / 2);
                c.fillStyle = '#ffffff'; c.fillRect(x, y, w, h);
                c.drawImage(im, pdf.cx || 0, pdf.cy || 0, sw, sh, x, y, w, h);
                const ref = c.getImageData(0, 0, t.width, t.height).data;
                let somme = 0;
                for (let i = 0; i < ref.length; i += 4) {
                    somme += Math.abs(ref[i] - lu[i]) + Math.abs(ref[i + 1] - lu[i + 1])
                           + Math.abs(ref[i + 2] - lu[i + 2]);
                }
                res(Math.round(somme / (ref.length / 4) * 100) / 100);
            };
            im.onerror = () => res(null);
            im.src = r.src;
        });
        return { versLa1: await ecart(1), versLa3: await ecart(3), pdfEstA: pdf.pluginData.page };
    });
    r.verifie('la vignette montre la page du morceau, et non celle que le PDF affiche',
        montre.pdfEstA === 3 && montre.versLa1 !== null && montre.versLa3 !== null
        && montre.versLa1 < montre.versLa3, JSON.stringify(montre));

    // Elle porte une infobulle : une image de quelques pixels reste un rébus
    // pour qui ne l'a jamais vue, et cette barre n'accepte pas les muets.
    const bulle = await page.evaluate(() => {
        const b = document.getElementById('btn-ecran-retour');
        return { texte: b.getAttribute('data-tooltip'), touche: b.getAttribute('data-raccourci') };
    });
    r.verifie('la vignette porte son infobulle et sa touche',
        !!bulle.texte && bulle.texte.length > 10 && bulle.touche === 'Alt+←',
        JSON.stringify(bulle));

    // ------------------------------------------------------------------
    // 2. UN MORCEAU RENTRE CHEZ LUI, À SA PAGE
    // C'est le cœur de la plainte : « on ne peut plus naviguer dedans ».
    // ------------------------------------------------------------------
    await poserLePdf(2);
    await decouperEtPoser();
    r.egal('le morceau retient la page dont il a été tiré',
        await page.evaluate(() => images.find(i => i.pluginData.id === 'morceau').pluginData.page), 2);

    // On feuillette ailleurs entre-temps : le retour doit REVENIR à la page du
    // morceau, et non laisser le document où on l'avait abandonné.
    await page.evaluate(async () => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        await allerALaPage(pdf, 3);
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
    });
    await page.evaluate(() => document.getElementById('btn-ecran-retour').click());
    await page.waitForTimeout(500);
    const rentre = await etat();
    r.verifie('la vignette rend le PDF, à la page du morceau, avec ses flèches',
        rentre.tenu === 'pdfDoc' && rentre.feuilletable === true
        && rentre.page === 2 && rentre.fleches === true, JSON.stringify(rentre));

    // ------------------------------------------------------------------
    // 3. COMME ON L'AVAIT LAISSÉ
    // ------------------------------------------------------------------
    await poserLePdf(2);
    await page.evaluate(async () => { presenterLeDocument(); await new Promise(res => setTimeout(res, 400)); });
    r.verifie('le PDF est bien projeté avant la découpe',
        (await etat()).projette === true, JSON.stringify(await etat()));

    // POSÉ DANS LA MARGE, ON RESTE EN PLEIN ÉCRAN.
    //
    // « Quand je suis en plein écran, je découpe, je mets sur le côté, et ça me
    // fait sortir du plein écran. » On en sortait parce que le voile de
    // présentation couvrait la marge : un morceau posé là aurait été invisible.
    // Il l'épargne maintenant — la page au milieu, l'exercice découpé à côté,
    // c'est la disposition qu'on cherche. Et l'on éprouve les DEUX : qu'on y
    // reste, et que le morceau se VOIT vraiment, sans quoi « on reste projeté »
    // ne dirait rien de bon.
    const dansLaMarge = await page.evaluate(async () => {
        const d = documentPresente();
        // Si la projection s'est déjà refermée, on le DIT plutôt que de buter
        // sur un document absent : un chapitre qui plante emporte ses trente
        // autres résultats avec lui, et l'on ne sait plus lequel se plaignait.
        if (!d) return { projette: false, clarteDuMorceau: -1, clarteDuVoile: -1,
                         pourquoi: 'la projection était déjà refermée' };
        // LA MARGE N'EXISTE QU'EN PAGE ENTIÈRE. En pleine largeur — le cadrage
        // par défaut désormais —, la page va d'un bord à l'autre de l'écran :
        // il n'y a tout simplement plus de côté où poser, et la question ne se
        // pose pas. On se met donc dans le cadrage où elle se pose.
        if (cadrageDePresentation !== 'page') presenterLeDocument();
        await new Promise(ok => setTimeout(ok, 300));
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: d.x + 20, y: d.y + 20 });
        poursuivreGesteDeDecoupe({ x: d.x + d.w * 0.5, y: d.y + d.h * 0.25 });
        finirGesteDeDecoupe();
        // « Sur le côté » : au milieu de l'écran en hauteur, contre le bord
        // gauche — donc bien à l'écran, et hors de la page.
        const m = poserLeMorceau(morceauxEnAttente[0], {
            x: (60 - panX) / zoom, y: (window.innerHeight / 2 - panY) / zoom
        });
        await new Promise(ok => setTimeout(ok, 300));
        draw();
        const sx = Math.round(panX + (m.x + m.w / 2) * zoom);
        const sy = Math.round(panY + (m.y + m.h / 2) * zoom);
        const p = ctx.getImageData(sx, sy, 1, 1).data;
        const v = ctx.getImageData(4, 4, 1, 1).data;
        return { projette: !!presentationEnCours, cadrage: cadrageDePresentation,
                 // La prémisse : il y a bien une marge à gauche de la page.
                 marge: Math.round(panX + d.x * zoom),
                 clarteDuMorceau: Math.round((p[0] + p[1] + p[2]) / 3),
                 clarteDuVoile: Math.round((v[0] + v[1] + v[2]) / 3) };
    });
    r.verifie('il y a bien une marge à gauche de la page',
        dansLaMarge.marge > 80, JSON.stringify(dansLaMarge));
    r.verifie('posé dans la marge, on reste en plein écran',
        dansLaMarge.projette === true, JSON.stringify(dansLaMarge));
    r.verifie('et le morceau s\'y voit : le voile l\'épargne',
        dansLaMarge.clarteDuMorceau > 200 && dansLaMarge.clarteDuVoile < 80,
        JSON.stringify(dansLaMarge));

    // L'EXCEPTION EST ÉTROITE, ET ELLE DOIT LE RESTER. Le voile n'épargne que
    // ce qui vient de la page projetée. Un morceau d'un AUTRE document traînant
    // sur le tableau resterait sinon allumé au milieu du noir pendant qu'on
    // projette — c'est la salle autour de l'écran, elle n'a pas à se montrer.
    const dAilleurs = await page.evaluate(async () => {
        const m = images.find(i => i.pluginData && i.pluginData.id === 'morceau');
        if (!m || !presentationEnCours) return 999;     // on le dit, on ne bute pas
        const vrai = m.pluginData.cle, vraiSrc = m.pluginData.source;
        m.pluginData.cle = 'pdf_dun_autre_cours';
        m.pluginData.source = -1;
        draw();
        const sx = Math.round(panX + (m.x + m.w / 2) * zoom);
        const sy = Math.round(panY + (m.y + m.h / 2) * zoom);
        const p = ctx.getImageData(sx, sy, 1, 1).data;
        m.pluginData.cle = vrai; m.pluginData.source = vraiSrc;
        draw();
        return Math.round((p[0] + p[1] + p[2]) / 3);
    });
    r.verifie('un morceau venu d\'un autre document, lui, reste sous le voile',
        dAilleurs < 80, String(dAilleurs));

    // ET « TOUT POSER » QUITTE TOUJOURS : il répand les morceaux sur tout le
    // tableau, bien au-delà de ce qu'on voit — il a besoin de la vue entière.
    const toutPoser = await page.evaluate(async () => {
        const d = documentPresente();
        if (!d) return { avant: false, apres: false, pourquoi: 'plus de projection avant même d\'essayer' };
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: d.x + 30, y: d.y + 30 });
        poursuivreGesteDeDecoupe({ x: d.x + d.w * 0.4, y: d.y + d.h * 0.3 });
        finirGesteDeDecoupe();
        const avant = !!presentationEnCours;
        poserTousLesMorceaux();
        await new Promise(ok => setTimeout(ok, 300));
        return { avant, apres: !!presentationEnCours };
    });
    r.egal('« Tout poser » quitte le plein écran, comme avant',
        toutPoser, { avant: true, apres: false });

    // MAIS POSÉ HORS DE VUE, ON QUITTE — sinon on ne saurait pas où il est allé.
    await poserLePdf(2);
    await page.evaluate(async () => { presenterLeDocument(); await new Promise(r => setTimeout(r, 400)); });
    await decouperEtPoser();
    const apresPose = await etat();
    r.verifie('posé hors de l\'écran, la projection se referme pour qu\'on le retrouve',
        apresPose.projette === false && apresPose.tenu === 'morceau', JSON.stringify(apresPose));

    await page.evaluate(() => document.getElementById('btn-ecran-retour').click());
    await page.waitForTimeout(600);
    const reprojete = await etat();
    r.verifie('et le retour re-projette le document, à sa page',
        reprojete.projette === true && reprojete.tenu === 'pdfDoc' && reprojete.page === 2,
        JSON.stringify(reprojete));

    await poserLePdf(1);
    await decouperEtPoser();
    await page.evaluate(() => document.getElementById('btn-ecran-retour').click());
    await page.waitForTimeout(400);
    const sansProjection = await etat();
    r.verifie('découpé sans projeter, le retour ne projette pas',
        sansProjection.projette === false && sansProjection.tenu === 'pdfDoc',
        JSON.stringify(sansProjection));

    await poserLePdf(1);
    await decouperEtPoser();
    const ramene = await page.evaluate(async () => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        panX = -8000; panY = -8000;                 // le document est loin derrière
        draw();
        const dehors = (o) => {
            const x = panX + o.x * zoom, y = panY + o.y * zoom;
            return x + o.w * zoom < 0 || y + o.h * zoom < 0
                || x > window.innerWidth || y > window.innerHeight;
        };
        const avant = dehors(pdf);
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
        document.getElementById('btn-ecran-retour').click();
        await new Promise(res => setTimeout(res, 400));
        return { avant, apres: dehors(pdf) };
    });
    r.verifie('le document parti de l\'écran y revient', ramene.avant && !ramene.apres,
        JSON.stringify(ramene));

    // ------------------------------------------------------------------
    // 4. ET SURTOUT : QUAND ON NE TIENT PLUS RIEN
    // C'est pour ce moment-là que la vignette a quitté la barre du document —
    // celle-ci s'en va avec la sélection, justement quand on en a besoin.
    // ------------------------------------------------------------------
    await poserLePdf(2);
    await decouperEtPoser();
    const maisLache = await page.evaluate(() => {
        clearSelection();
        majBarreDocument();
        const barre = document.getElementById('bar-document');
        return {
            barreDuDoc: barre.classList.contains('visible'),
            vignette: getComputedStyle(document.getElementById('btn-ecran-retour')).display !== 'none',
            versOu: (() => { const c = documentOuRevenir(); return c ? c.doc.pluginData.id : null; })()
        };
    });
    r.verifie('on lâche tout : la barre du document s\'en va, la vignette reste',
        maisLache.barreDuDoc === false && maisLache.vignette === true,
        JSON.stringify(maisLache));
    r.egal('et elle vise le dernier document tenu', maisLache.versOu, 'morceau');

    await page.evaluate(() => document.getElementById('btn-ecran-retour').click());
    await page.waitForTimeout(400);
    r.egal('un clic sur la vignette le reprend en main',
        (await etat()).tenu, 'morceau');

    // L'ALLER-RETOUR. Du morceau on va au PDF, du PDF on revient au morceau :
    // la vignette fait la navette entre les deux derniers.
    await page.evaluate(() => document.getElementById('btn-ecran-retour').click());
    await page.waitForTimeout(400);
    r.egal('du morceau, elle mène au PDF', (await etat()).tenu, 'pdfDoc');
    await page.evaluate(() => document.getElementById('btn-ecran-retour').click());
    await page.waitForTimeout(400);
    r.egal('et du PDF, elle ramène au morceau', (await etat()).tenu, 'morceau');

    // ET LA TRACE NE COMPTE CHAQUE DOCUMENT QU'UNE FOIS. Revenir deux fois au
    // même endroit n'est pas deux étapes : sinon un simple aller-retour entre
    // deux documents remplit la mémoire des derniers tenus, et les autres en
    // tombent — ceux-là mêmes qu'on aurait voulu retrouver.
    const trace = await page.evaluate(() => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        const m = images.find(i => i.pluginData.id === 'morceau');
        const tenir = (o) => { selectedItems = [{ type: 'image', id: o.id }]; majBarreDocument(); };
        tenir(pdf); tenir(m); tenir(pdf); tenir(m); tenir(pdf);
        return traceDesDocuments.map(e => e.id);
    });
    r.egal('cinq allers-retours ne laissent que deux étapes dans la trace',
        trace.length, 2);

    // ------------------------------------------------------------------
    // 5. LES CAS OÙ LE CHEMIN NE MÈNE PLUS NULLE PART
    // ------------------------------------------------------------------
    await poserLePdf(1);
    await decouperEtPoser();
    const sansSource = await page.evaluate(() => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        deleteObject('image', pdf.id);
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
        return {
            vignette: getComputedStyle(document.getElementById('btn-ecran-retour')).display,
            chemin: documentOuRevenir()
        };
    });
    r.egal('le document effacé, la vignette s\'en va', sansSource.vignette, 'none');
    r.egal('et le chemin ne mène plus nulle part', sansSource.chemin, null);
    r.egal('appelée quand même, elle refuse proprement',
        await page.evaluate(() => revenirAuDocumentDavant()), false);

    // SEUL UN MORCEAU A UNE MAISON. Le même PDF posé DEUX FOIS partage sa clé
    // avec son jumeau : sans cette règle, chaque exemplaire « reviendrait »
    // chez l'autre, ce qui ne veut rien dire.
    await poserLePdf(1);
    const pasUnMorceau = await page.evaluate(() => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        const jumeau = { ...pdf, id: nextId++, x: pdf.x + pdf.w + 60, z: globalZ++,
                         pluginData: { ...pdf.pluginData } };
        images.push(jumeau);
        const nue = { id: nextId++, x: 10, y: 10, w: 40, h: 40, src: pdf.src, z: globalZ++ };
        images.push(nue);
        return {
            duJumeau: documentSourceDuMorceau(jumeau),
            duPdf: documentSourceDuMorceau(pdf),
            dUneImage: documentSourceDuMorceau(nue)
        };
    });
    r.egal('ni un PDF posé deux fois, ni une image nue n\'ont de maison à retrouver',
        [pasUnMorceau.duJumeau, pasUnMorceau.duPdf, pasUnMorceau.dUneImage], [null, null, null]);

    // ------------------------------------------------------------------
    // 6. UN MORCEAU DE MORCEAU RENTRE JUSQU'AU PDF
    // ------------------------------------------------------------------
    await poserLePdf(3);
    await decouperEtPoser();
    const enDeuxFois = await page.evaluate(() => {
        const premier = images.find(i => i.pluginData && i.pluginData.id === 'morceau');
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: premier.x + 5, y: premier.y + 5 });
        poursuivreGesteDeDecoupe({ x: premier.x + premier.w * 0.5, y: premier.y + premier.h * 0.5 });
        finirGesteDeDecoupe();
        const second = poserLeMorceau(morceauxEnAttente[morceauxEnAttente.length - 1],
            { x: premier.x, y: premier.y + premier.h + 120 });
        const versOu = documentSourceDuMorceau(second);
        return {
            versOu: versOu ? (versOu.pluginData.id + '#' + versOu.id) : null,
            pdf: 'pdfDoc#' + images.find(i => i.pluginData.id === 'pdfDoc').id,
            page: second.pluginData.page
        };
    });
    r.verifie('un morceau taillé dans un morceau rentre au PDF, pas chez son voisin',
        enDeuxFois.versOu === enDeuxFois.pdf && enDeuxFois.page === 3,
        JSON.stringify(enDeuxFois));

    // ------------------------------------------------------------------
    // 7. LA TOUCHE, ET CELLE QU'ON NE DÉTOURNE PAS
    // ------------------------------------------------------------------
    await poserLePdf(2);
    await decouperEtPoser();
    await page.evaluate(() => document.getElementById('board').focus());
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForTimeout(500);
    const parLaTouche = await etat();
    r.verifie('Alt+← ramène au document, à sa page',
        parLaTouche.tenu === 'pdfDoc' && parLaTouche.page === 2, JSON.stringify(parLaTouche));

    // CTRL+Z DÉFAIT, ET RIEN D'AUTRE. S'il se mettait aussi à naviguer, on ne
    // saurait plus, en l'appuyant, si l'on efface son trait ou si l'on change
    // de page — or c'est le raccourci qu'on tape sans regarder.
    const ctrlZ = await page.evaluate(async () => {
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
        freehands.push({ id: nextId++, points: [{ x: 50, y: 50 }, { x: 90, y: 90 }],
                         color: '#000', width: 3, z: globalZ++ });
        saveState();
        return freehands.length;
    });
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    const apresCtrlZ = await page.evaluate(() => ({
        traits: freehands.length,
        tenu: (() => { const d = documentDeLaBarre(); return d ? d.pluginData.id : null; })()
    }));
    r.verifie('Ctrl+Z défait le trait et ne change pas de document',
        ctrlZ === 1 && apresCtrlZ.traits === 0 && apresCtrlZ.tenu === 'morceau',
        JSON.stringify({ ctrlZ, apresCtrlZ }));

    // ------------------------------------------------------------------
    // 8. ET L'ANCIEN BOUTON A BIEN DISPARU
    // Deux chemins vers le même endroit, c'est un de trop — et celui de la
    // barre du document n'était pas là quand on en avait besoin.
    // ------------------------------------------------------------------
    r.egal('plus de bouton de retour dans la barre du document',
        await page.evaluate(() => !!document.getElementById('doc-retour')), false);

    // ------------------------------------------------------------------
    // 9. SORTI SANS VISER, LE MORCEAU PART SUR SA PAGE — ET SAIT EN REVENIR
    //
    // « En faisant une découpe, cela s'est encore mis à côté plutôt que dans
    // une nouvelle page. » Il tombait au milieu de l'écran, c'est-à-dire sur le
    // document qu'on venait de découper. Un clic ne dit pas OÙ on le veut : il
    // dit qu'on veut le voir. Il part donc sur une page de tableau à lui, en
    // grand. Le geste qui VISE, lui, reste respecté — c'est tout le chapitre 3
    // ci-dessus, qui pose dans la marge sans quitter le plein écran.
    // ------------------------------------------------------------------
    await poserLePdf(2);
    const sansViser = await page.evaluate(async () => {
        const doc = images.find(i => i.pluginData && i.pluginData.id === 'pdfDoc');
        const pageAvant = currentPageIndex, pagesAvant = pages.length;
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: doc.x + 20, y: doc.y + 20 });
        poursuivreGesteDeDecoupe({ x: doc.x + doc.w * 0.5, y: doc.y + doc.h * 0.3 });
        finirGesteDeDecoupe();
        const taille = morceauxEnAttente[0].w;
        const m = poserLeMorceau(morceauxEnAttente[0], null);   // un clic : on ne vise pas
        await new Promise(ok => setTimeout(ok, 300));
        return {
            changeDePage: currentPageIndex !== pageAvant,
            pagesEnPlus: pages.length - pagesAvant,
            marquee: !!pages[currentPageIndex].pageDesMorceaux,
            documentReste: !images.some(i => i.pluginData && i.pluginData.id === 'pdfDoc'),
            agrandi: m.w > taille
        };
    });
    r.egal('sorti sans viser, il ouvre une page d\'exercices et s\'y rend',
        { page: sansViser.changeDePage, neuve: sansViser.pagesEnPlus, marquee: sansViser.marquee },
        { page: true, neuve: 1, marquee: true });
    r.verifie('le document reste sur la sienne, et le morceau s\'étale',
        sansViser.documentReste === true && sansViser.agrandi === true, JSON.stringify(sansViser));

    // LA VIGNETTE TRAVERSE LES PAGES. C'est ce que la page d'exercices coûtait :
    // le document n'est plus sur la page ouverte, et « revenir » ne trouvait
    // plus rien — la vignette s'éteignait au moment précis où elle sert.
    await page.evaluate(() => {
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
    });
    const depuisLaPage = await etat();
    r.verifie('depuis la page des exercices, la vignette vise encore le PDF',
        depuisLaPage.vignette === true && /^pdfDoc#\d+@2$/.test(depuisLaPage.versOu),
        JSON.stringify(depuisLaPage));

    const rentree = await page.evaluate(async () => {
        const pageAvant = currentPageIndex;
        await revenirAuDocumentDavant();
        await new Promise(ok => setTimeout(ok, 400));
        return { tourne: currentPageIndex !== pageAvant,
                 pageDuTableau: currentPageIndex,
                 doc: images.some(i => i.pluginData && i.pluginData.id === 'pdfDoc') };
    });
    r.verifie('et le retour tourne la page du tableau pour y aller',
        rentree.tourne === true && rentree.doc === true, JSON.stringify(rentree));

    // ET LA MÊME PAGE SE ROUVRE. On découpe un bout, on le pose, on revient au
    // polycopié, on en découpe un autre : une page neuve à chaque fois aurait
    // donné un tableau d'une page par morceau, et les exercices d'un même cours
    // n'auraient jamais été côte à côte.
    const second = await page.evaluate(async () => {
        const doc = images.find(i => i.pluginData && i.pluginData.id === 'pdfDoc');
        const pagesAvant = pages.length;
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: doc.x + 30, y: doc.y + doc.h * 0.5 });
        poursuivreGesteDeDecoupe({ x: doc.x + doc.w * 0.5, y: doc.y + doc.h * 0.75 });
        finirGesteDeDecoupe();
        poserLeMorceau(morceauxEnAttente[morceauxEnAttente.length - 1], null);
        await new Promise(ok => setTimeout(ok, 300));
        return { pagesEnPlus: pages.length - pagesAvant,
                 morceaux: images.filter(i => i.pluginData && i.pluginData.id === 'morceau').length };
    });
    r.egal('le second morceau rejoint le premier, sans ouvrir de page de plus',
        second, { pagesEnPlus: 0, morceaux: 2 });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
