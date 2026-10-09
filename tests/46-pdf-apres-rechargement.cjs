// LE PDF RESTE NET APRÈS UN RECHARGEMENT, ET APRÈS UNE ANNULATION.
//
// « Quand un tableau se remet après rechargement, on a plus le pdf
// visiblement car le zoom se pixelise assez vite. »
//
// Le document était bien là : « reprendreLesPdfDuTableau » le rouvrait, avec
// ses pages, sa recherche et ses vignettes. Ce qui manquait, c'était le
// REDESSIN. L'affinage ne visait que le document « de la barre » — celui
// qu'on tient, qu'on projette ou qu'on annote — et au rechargement, rien
// n'est tenu : on rouvrait sa séance, on zoomait sur l'exercice, et la page
// restait à la finesse où elle avait été enregistrée. Le même silence valait
// pendant qu'on écrivait au crayon à côté d'un document qu'on n'avait pas
// choisi, et au retour d'une annulation — un état de l'historique porte le
// « src » qu'avait l'image au moment où il a été pris.
//
// CE QUE CETTE SUITE TIENT :
//
//   — le fichier du PDF part avec le tableau, et le tableau rouvert redonne
//     un vrai document sous la même clé ;
//   — sans rien tenir en main, un coup de zoom refait la page nette ;
//   — le rechargement lui-même la refait nette, sans qu'on touche au zoom ;
//   — on n'affine que ce qui est À L'ÉCRAN, et jamais plus de quatre pages ;
//   — annuler ne laisse pas la page dans sa version grossière.
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le PDF après rechargement');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function'
        && typeof affinerCeQuOnRegarde === 'function', { timeout: 20000 });

    const octets = Array.from(petitPdf());

    // ------------------------------------------------------------------
    // 1. LE TABLEAU EMPORTE LE FICHIER, ET LE REND
    // ------------------------------------------------------------------
    const pose = await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; texts.length = 0; freehands.length = 0; selectedItems = [];
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(ok => setTimeout(ok, 1200));
        const img = images[0];
        return { cle: img.pluginData.cle, aLeFichier: !!img.pluginData.pdfRef,
                 documents: documentsPdf.size };
    }, { octets });
    r.verifie('le PDF est posé, et son fichier part avec le tableau',
        pose.aLeFichier && pose.documents === 1, JSON.stringify(pose));

    // On enregistre, on oublie tout — comme un rechargement de la page —, on
    // remet. C'est le trajet exact du bug.
    const rouvert = await page.evaluate(async () => {
        // LA PAGE EST MONTRÉE EN GRAND AVANT D'ÊTRE ENREGISTRÉE, et son rendu
        // est resté celui de l'ouverture : c'est exactement l'état d'un
        // tableau qu'on retrouve le lendemain sur le vidéoprojecteur de la
        // salle d'à côté — grand, et pixelisé.
        const doc = images[0];
        montrerToutLeDocument(doc);
        doc.x = 10; doc.y = 10;
        doc.w = 1500; doc.h = 1500 * (doc.ch / doc.cw);
        panX = 0; panY = 0; zoom = 1;
        selectedItems = []; if (typeof docEnAnnotation !== 'undefined') docEnAnnotation = null;
        const avant = imageCache[doc.src].naturalWidth;
        const large = Math.round(doc.w);
        const etat = stateForStorage();
        // Le fichier du PDF doit être DANS ce qu'on enregistre : sans lui, on
        // ne rouvrirait qu'une photo de la première page.
        const refs = Object.keys(etat.assets || {});
        const cle = images[0].pluginData.cle;
        const ref = images[0].pluginData.pdfRef;
        // On perd tout ce qui vivait en mémoire, documents ouverts compris.
        documentsPdf.clear();
        images.length = 0; draw();
        restoreState(JSON.parse(JSON.stringify(etat)));
        await new Promise(ok => setTimeout(ok, 1500));
        // On laisse le temps à l'affinage de la vue de faire son travail :
        // il est temporisé, comme après un zoom.
        await new Promise(ok => setTimeout(ok, 2000));
        return { fichierEnregistre: refs.includes(ref),
                 documentRouvert: documentsPdf.has(cle),
                 pages: images[0] && images[0].pluginData.pages,
                 memeCle: images[0] && images[0].pluginData.cle === cle,
                 avant, large,
                 apres: images[0] ? imageCache[images[0].src].naturalWidth : 0 };
    });
    r.verifie('le fichier lui-même est dans la sauvegarde',
        rouvert.fichierEnregistre, JSON.stringify(rouvert));
    r.verifie('et la page rouverte se refait nette TOUTE SEULE, sans toucher au zoom',
        rouvert.apres > rouvert.avant,
        JSON.stringify({ avant: rouvert.avant, apres: rouvert.apres, large: rouvert.large }));
    r.egal('et le tableau rouvert redonne un vrai document, sous la même clé',
        { rouvert: rouvert.documentRouvert, pages: rouvert.pages, cle: rouvert.memeCle },
        { rouvert: true, pages: 3, cle: true });

    // ------------------------------------------------------------------
    // 2. SANS RIEN TENIR EN MAIN, LA PAGE SE REFAIT NETTE
    // C'est le cœur du bug : au rechargement, la sélection est vide, aucun
    // document n'est projeté ni annoté — « documentDeLaBarre() » ne rend rien,
    // et l'affinage ne visait que celui-là.
    // ------------------------------------------------------------------
    const aVide = await page.evaluate(async () => {
        const img = images[0];
        setMode('pointer');
        selectedItems = [];
        if (typeof docEnAnnotation !== 'undefined') docEnAnnotation = null;
        if (typeof presentationEnCours !== 'undefined') presentationEnCours = null;
        majBarreDocument();
        // Personne ne tient ce document : c'est l'état d'un tableau rouvert.
        const tenu = typeof documentDeLaBarre === 'function' ? !!documentDeLaBarre() : null;
        // On le montre grand : la page réclame alors bien plus de pixels
        // qu'elle n'en a.
        //
        // QUATRE MILLE DEUX CENTS, ET NON DEUX MILLE HUIT CENTS. La page
        // enregistrée fait trois mille pixels de large : montrée sur 2800 elle
        // en a DE RESTE, et le scénario ne disait plus ce que son titre
        // annonce — il passait seulement parce que les étapes précédentes
        // laissaient, à l'époque, une page plus grossière. On fixe donc le
        // décor au lieu de dépendre de ce qui précède.
        montrerToutLeDocument(img);
        img.w = 4200; img.h = 4200 * (img.ch / img.cw);
        panX = 0; panY = 0; zoom = 1; img.x = 10; img.y = 10;
        const d = documentsPdf.get(img.pluginData.cle);
        // ON MESURE L'IMAGE QU'ON REGARDE, en pixels : c'est ce que voit
        // l'enseignant. Le registre des rendus dit ce qui a été CALCULÉ, ce
        // qui n'est pas la même chose.
        const avant = imageCache[img.src].naturalWidth;
        const registre = !!(d && d.rendus);
        const demande = finesseDemandee(img);
        const combien = affinerCeQuOnRegarde();
        await new Promise(ok => setTimeout(ok, 1500));
        const apres = imageCache[images[0].src].naturalWidth;
        return { tenu, registre, demande: Math.round(demande * 100) / 100, combien, avant, apres };
    });
    r.egal('personne ne tient le document : c\'est l\'état d\'un tableau rouvert',
        aVide.tenu, false);
    r.verifie('montré en grand, il réclame plus de pixels que la page n\'en a',
        aVide.demande > 1.2, JSON.stringify(aVide));
    r.egal('une page est quand même visée', aVide.combien, 1);
    r.egal('et le document rouvert a bien son registre de pages rendues',
        aVide.registre, true);
    r.verifie('et elle est redessinée plus finement, sans qu\'on la tienne',
        aVide.apres > aVide.avant, JSON.stringify(aVide));

    // Et le geste réel : un coup de molette suffit, sans rien sélectionner.
    const molette = await page.evaluate(async () => {
        const img = images[0];
        selectedItems = []; docEnAnnotation = null;
        montrerToutLeDocument(img);
        img.w = 1200; img.h = 1200 * (img.ch / img.cw);
        img.x = 10; img.y = 10; panX = 0; panY = 0; zoom = 1;
        await affinerLaPage(img);                       // on repart d'une page ajustée
        await new Promise(ok => setTimeout(ok, 400));
        const avant = imageCache[images[0].src].naturalWidth;
        const cv = document.getElementById('board');
        for (let i = 0; i < 11; i++) {
            // Sur le tableau, c'est Ctrl + molette qui zoome : sans Ctrl, la
            // molette fait défiler, comme dans tous les éditeurs.
            cv.dispatchEvent(new WheelEvent('wheel', {
                deltaY: -100, ctrlKey: true, clientX: 200, clientY: 200,
                bubbles: true, cancelable: true }));
        }
        await new Promise(ok => setTimeout(ok, 2000));
        return { avant, apres: imageCache[images[0].src].naturalWidth,
                 zoom: Math.round(zoom * 100) / 100 };
    });
    r.verifie('la molette a bien zoomé', molette.zoom > 1.5, JSON.stringify(molette));
    r.verifie('et la page a suivi en finesse, sans sélection ni main',
        molette.apres > molette.avant, JSON.stringify(molette));

    // ------------------------------------------------------------------
    // 3. ON N'AFFINE QUE CE QU'ON REGARDE
    // Une page hors-champ n'a pas besoin d'être nette, et quarante pages
    // affinées d'un coup feraient ramer pour rien.
    // ------------------------------------------------------------------
    const cadrees = await page.evaluate(() => {
        const modele = images[0];
        const copie = (dx, page) => {
            const o = JSON.parse(JSON.stringify({ ...modele, img: undefined }));
            o.id = nextId++; o.x = dx; o.y = 10; o.w = 300; o.h = 400;
            o.pluginData = { ...modele.pluginData, page };
            return o;
        };
        images.length = 0;
        panX = 0; panY = 0; zoom = 1;
        images.push(copie(10, 1));                       // à l'écran
        images.push(copie(-5000, 2));                    // loin à gauche
        images.push(copie(window.innerWidth + 500, 3));  // loin à droite
        draw();
        const vues = pagesSousLesYeux();
        return { combien: vues.length, x: vues.map(o => Math.round(o.x)),
                 plafond: PAGES_AFFINEES_A_LA_FOIS };
    });
    r.egal('seule la page à l\'écran est visée',
        { combien: cadrees.combien, x: cadrees.x }, { combien: 1, x: [10] });

    // Le plafond : autant de pages qu'on veut à l'écran, quatre à la fois.
    const plafond = await page.evaluate(() => {
        const modele = images[0];
        images.length = 0;
        panX = 0; panY = 0; zoom = 1;
        for (let i = 0; i < 9; i++) {
            const o = JSON.parse(JSON.stringify({ ...modele, img: undefined }));
            o.id = nextId++; o.x = 10 + i * 20; o.y = 10; o.w = 120; o.h = 160;
            // Des pages DIFFÉRENTES : les objets qui partagent un rendu ne
            // comptent que pour un, c'est la règle du partage.
            o.pluginData = { ...modele.pluginData, page: 1 + (i % 3), cle: modele.pluginData.cle + i };
            documentsPdf.set(o.pluginData.cle, documentsPdf.get(modele.pluginData.cle));
            images.push(o);
        }
        draw();
        return pagesSousLesYeux().length;
    });
    r.egal('et l\'on n\'en refait jamais plus de quatre à la fois', plafond, 4);

    // ET SIX MORCEAUX D'UNE MÊME PAGE NE COMPTENT QUE POUR UN : ils partagent
    // le même rendu — c'est ce partage qui fait que six exercices découpés
    // dans un poly ne pèsent pas six pages. Celui qui réclame le plus de
    // finesse tire les autres avec lui.
    const partage = await page.evaluate(() => {
        const modele = images[0];
        images.length = 0;
        panX = 0; panY = 0; zoom = 1;
        for (let i = 0; i < 6; i++) {
            const o = JSON.parse(JSON.stringify({ ...modele, img: undefined }));
            o.id = nextId++; o.x = 10 + i * 30; o.y = 10;
            // Le PLUS EXIGEANT est le dernier : c'est lui qu'on doit viser.
            o.w = 100 + i * 60; o.h = o.w * (o.ch / o.cw);
            o.pluginData = { ...modele.pluginData, page: 1 };
            images.push(o);
        }
        draw();
        const vues = pagesSousLesYeux();
        return { combien: vues.length, large: vues.length ? Math.round(vues[0].w) : 0,
                 plusLarge: Math.round(Math.max(...images.map(o => o.w))) };
    });
    r.egal('six morceaux d\'une même page ne visent qu\'un seul rendu',
        partage.combien, 1);
    r.egal('et c\'est le plus exigeant qui est visé : il tire les autres avec lui',
        partage.large, partage.plusLarge);

    // ------------------------------------------------------------------
    // 4. ANNULER NE LAISSE PAS LA PAGE FLOUE
    // Un état de l'historique porte le « src » qu'avait l'image au moment où
    // il a été pris : si la page a été affinée depuis, revenir en arrière la
    // ramène à sa version grossière.
    // ------------------------------------------------------------------
    const annulation = await page.evaluate(async ({ octets }) => {
        // On repart d'un tableau propre, avec le seul document.
        images.length = 0;
        documentsPdf.forEach((v, k) => { if (k !== [...documentsPdf.keys()][0]) documentsPdf.delete(k); });
        panX = 0; panY = 0; zoom = 1; selectedItems = []; docEnAnnotation = null;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)],
            'cours.pdf', { type: 'application/pdf' }));
        await new Promise(ok => setTimeout(ok, 1200));
        const img = images[0];
        montrerToutLeDocument(img);
        // LA PAGE EST DÉJÀ MONTRÉE EN GRAND : c'est le « src » qui recule à
        // l'annulation, pas la taille du bloc. Sans cela, annuler ramènerait
        // AUSSI la petite taille, la page grossière conviendrait, et l'on ne
        // mesurerait rien du tout.
        img.w = 1400; img.h = 1400 * (img.ch / img.cw); img.x = 10; img.y = 10;
        saveState();                                     // l'état GROSSIER entre dans l'historique
        const grossier = imageCache[img.src].naturalWidth;
        await affinerLaPage(img);                        // la page devient nette
        await new Promise(ok => setTimeout(ok, 800));
        const net = imageCache[images[0].src].naturalWidth;
        saveState();
        // Et l'on annule : l'état repris porte le « src » grossier.
        undo();
        const justeApres = imageCache[images[0].src].naturalWidth;
        // …mais la vue se refait nette toute seule.
        await new Promise(ok => setTimeout(ok, 2000));
        return { grossier, net, justeApres,
                 rendu: imageCache[images[0].src].naturalWidth,
                 large: Math.round(images[0].w) };
    }, { octets });
    r.verifie('affiner a bien rendu la page plus nette',
        annulation.net > annulation.grossier, JSON.stringify(annulation));
    r.verifie('annuler la ramène d\'abord à sa version grossière',
        annulation.justeApres <= annulation.grossier, JSON.stringify(annulation));
    r.verifie('mais la page se refait nette toute seule, sans qu\'on touche au zoom',
        annulation.rendu > annulation.justeApres, JSON.stringify(annulation));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
