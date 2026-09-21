// LA PAGE D'À CÔTÉ : LE TEXTE À GAUCHE, LES QUESTIONS À DROITE.
//
// « Et si on importe deux pages PDF côte à côte ? » La seconde place a été
// mesurée pour ce geste-là : un texte page 4, ses questions page 5, et une
// classe qui doit voir les deux en même temps. Elle n'acceptait jusqu'ici
// qu'un morceau découpé ; elle accueille maintenant une PAGE, celle qu'on lui
// désigne dans le volet — là où l'on regarde déjà les pages.
//
// CE CHAPITRE TIENT TROIS CHOSES :
//   1. le geste lui-même, et la page qui entre à la bonne échelle ;
//   2. les bords — une page ne se met pas à côté d'elle-même, un rang hors du
//      document se ramène dedans, et la place ne s'empile pas ;
//   3. la vignette du coin, qui ramène d'abord au document SEUL quand il y en
//      a deux à l'écran.
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La page d\'à côté');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function'
        && typeof poserLaPageACote === 'function', { timeout: 20000 });

    const octets = Array.from(petitPdf());

    const pose = await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; freehands.length = 0; texts.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(ok => setTimeout(ok, 1200));
        const doc = images[0];
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        presenterLeDocument();
        await new Promise(ok => setTimeout(ok, 400));
        return { pages: doc.pluginData.pages, page: doc.pluginData.page,
                 projete: presentationEnCours === doc.id };
    }, { octets });
    r.egal('le document a ses trois pages', pose.pages, 3);
    r.egal('on en projette la première', pose.page, 1);
    r.verifie('et c\'est bien lui qu\'on projette', pose.projete, JSON.stringify(pose));

    // ==================================================================
    // LE GESTE : UNE PAGE ENTIÈRE ENTRE DANS LA PLACE
    // ==================================================================
    const deuxPages = await page.evaluate(async () => {
        const doc = images[0];
        const avant = images.length;
        const fait = await poserLaPageACote(2);
        const voisin = objetVoisinDeLaPresentation();
        return {
            fait, avant, apres: images.length,
            place: presentationVoisine,
            voisinEstLeNouveau: !!voisin && voisin.id === presentationVoisine,
            sonRang: voisin ? voisin.pluginData.page : null,
            saCle: voisin ? voisin.pluginData.cle : null,
            saSource: voisin ? voisin.pluginData.source : null,
            entiere: voisin ? (voisin.cx === 0 && voisin.cy === 0) : null,
            // Une page entière atteint la hauteur de sa voisine : elle part
            // déjà de sa taille, le plafond des trois fois n'entre pas en jeu.
            memeHauteur: voisin ? Math.abs(voisin.h - doc.h) < 1 : null,
            aDroite: voisin ? voisin.x > doc.x + doc.w - 1 : null,
            // Sa forme est celle de la page rendue, et non celle du document.
            formeGardee: voisin ? Math.abs((voisin.w / voisin.h) - (voisin.cw / voisin.ch)) < 0.01 : null,
            source: voisin ? (voisin.src || '').slice(0, 10) : null
        };
    });
    r.verifie('la page 2 se pose à côté', deuxPages.fait, JSON.stringify(deuxPages));
    r.egal('un objet de plus sur le tableau', deuxPages.apres - deuxPages.avant, 1);
    r.verifie('et c\'est lui qui occupe la place', deuxPages.voisinEstLeNouveau, JSON.stringify(deuxPages));
    r.egal('il porte le rang de la page qu\'on a demandée', deuxPages.sonRang, 2);
    r.verifie('il garde la clé du PDF — il sait rentrer chez lui', !!deuxPages.saCle, JSON.stringify(deuxPages));
    r.egal('et il vient du document projeté', deuxPages.saSource, await page.evaluate(() => images[0].id));
    r.verifie('c\'est la page ENTIÈRE, et non un bout', deuxPages.entiere, JSON.stringify(deuxPages));
    r.verifie('elle a sa propre image de page', deuxPages.source === 'data:image', deuxPages.source);
    r.verifie('elle atteint la hauteur de sa voisine', deuxPages.memeHauteur, JSON.stringify(deuxPages));
    r.verifie('elle se met à sa droite', deuxPages.aDroite, JSON.stringify(deuxPages));
    r.verifie('et elle garde sa forme', deuxPages.formeGardee, JSON.stringify(deuxPages));

    // Le voile épargne les deux : sans cela on aurait posé une page derrière
    // un rideau noir.
    const voile = await page.evaluate(() => {
        const doc = images[0];
        const epargnes = boitesEpargneesParLeVoile(doc);
        const voisin = objetVoisinDeLaPresentation();
        return { combien: epargnes.length, contientLeVoisin: epargnes.indexOf(voisin) >= 0 };
    });
    r.verifie('le voile épargne la page d\'à côté', voile.contientLeVoisin, JSON.stringify(voile));

    // Et la vue embrasse les deux : la boîte des deux tient à l'écran.
    const cadre = await page.evaluate(() => {
        const doc = images[0];
        const voisin = objetVoisinDeLaPresentation();
        const toile = document.getElementById('board');
        const boite = { x: Math.min(doc.x, voisin.x), y: Math.min(doc.y, voisin.y) };
        boite.w = Math.max(doc.x + doc.w, voisin.x + voisin.w) - boite.x;
        boite.h = Math.max(doc.y + doc.h, voisin.y + voisin.h) - boite.y;
        return {
            largeur: boite.w * zoom, hauteur: boite.h * zoom,
            toileL: toile.clientWidth, toileH: toile.clientHeight
        };
    });
    r.verifie('les deux tiennent à l\'écran',
        cadre.largeur <= cadre.toileL + 1 && cadre.hauteur <= cadre.toileH + 1,
        JSON.stringify(cadre));
    r.verifie('et ils l\'occupent vraiment',
        cadre.largeur > cadre.toileL * 0.8 || cadre.hauteur > cadre.toileH * 0.8,
        JSON.stringify(cadre));

    // ------------------------------------------------------------------
    // ET C'EST UNE PAGE ENTIÈRE MÊME QUAND LA PRINCIPALE EST ROGNÉE.
    //
    // Une page projetée a souvent perdu son en-tête : on l'a coupé une fois
    // pour toutes. Celle qu'on met à côté, elle, arrive neuve — sa forme est
    // celle de la PAGE, pas celle du cadre de sa voisine. Sans un document
    // rogné, le sabotage « donne-lui la taille du principal » ne se voit pas :
    // dans un PDF régulier, les deux formes coïncident.
    // ------------------------------------------------------------------
    const rognee = await page.evaluate(async () => {
        const doc = images[0];
        const img = imageCache[doc.src];
        // On coupe la moitié de la hauteur : le cadre devient nettement plus
        // large que la page ne l'est.
        doc.cy = img.naturalHeight * 0.25;
        doc.ch = img.naturalHeight * 0.5;
        doc.h = doc.w * (doc.ch / doc.cw);
        const formeDuCadre = doc.w / doc.h;
        const formeDeLaPage = img.naturalWidth / img.naturalHeight;
        await poserLaPageACote(2);
        const v = objetVoisinDeLaPresentation();
        return {
            formeDuCadre, formeDeLaPage,
            formeDuVoisin: v ? v.w / v.h : null,
            formeDeSonImage: v ? v.cw / v.ch : null,
            entiere: v ? (v.cx === 0 && v.cy === 0 && v.ch > doc.ch * 1.5) : null
        };
    });
    r.verifie('le cadre rogné n\'a plus la forme de la page',
        Math.abs(rognee.formeDuCadre - rognee.formeDeLaPage) > 0.05,
        JSON.stringify(rognee));
    r.verifie('la page d\'à côté garde la forme de SA page',
        Math.abs(rognee.formeDuVoisin - rognee.formeDeSonImage) < 0.01,
        JSON.stringify(rognee));
    r.verifie('et non celle du cadre rogné de sa voisine',
        Math.abs(rognee.formeDuVoisin - rognee.formeDuCadre) > 0.05,
        JSON.stringify(rognee));
    r.verifie('elle est entière alors que l\'autre est coupée', rognee.entiere,
        JSON.stringify(rognee));

    // On rend au document sa page entière pour la suite du chapitre.
    await page.evaluate(() => {
        const doc = images[0];
        const img = imageCache[doc.src];
        doc.cy = 0; doc.ch = img.naturalHeight;
        doc.h = doc.w * (doc.ch / doc.cw);
        cadrerSurLesDeux(doc, objetVoisinDeLaPresentation());
    });

    // ==================================================================
    // LES BORDS
    // ==================================================================
    const bords = await page.evaluate(async () => {
        const doc = images[0];
        const occupantAvant = presentationVoisine;
        // Une page ne se met pas à côté d'elle-même.
        const elleMeme = await poserLaPageACote(doc.pluginData.page);
        const apresElleMeme = presentationVoisine;
        // Un rang hors du document se ramène dans le document.
        const trop = await poserLaPageACote(99);
        const rangTrop = objetVoisinDeLaPresentation().pluginData.page;
        const zero = await poserLaPageACote(0);
        const apresZero = objetVoisinDeLaPresentation().pluginData.page;
        return { occupantAvant, elleMeme, apresElleMeme, trop, rangTrop, zero, apresZero,
                 total: doc.pluginData.pages };
    });
    r.verifie('une page ne se met pas à côté d\'elle-même', bords.elleMeme === false, JSON.stringify(bords));
    r.egal('et la place garde son occupant', bords.apresElleMeme, bords.occupantAvant);
    r.verifie('un rang au-delà du document se ramène à la dernière page',
        bords.trop === true && bords.rangTrop === bords.total, JSON.stringify(bords));
    r.verifie('un rang nul ne pose rien', bords.zero === false, JSON.stringify(bords));
    r.egal('et la dernière page reste à côté', bords.apresZero, bords.total);

    // LA PLACE NE S'EMPILE PAS : une page en remplace une autre, elle ne se
    // pose pas par-dessus. Une page mise à côté est un passager, pas un
    // meuble — elle est entrée avec la place, elle s'en va avec elle.
    const remplace = await page.evaluate(async () => {
        const avant = presentationVoisine;
        const combienAvant = images.length;
        await poserLaPageACote(2);
        const apres = presentationVoisine;
        return { avant, apres, change: avant !== apres,
                 combienAvant, combienApres: images.length,
                 ancienneEncoreLa: !!getObjectById('image', avant),
                 pagesPosees: images.filter(o => o.pluginData && o.pluginData.pageEntiere).length };
    });
    r.verifie('poser une autre page change l\'occupant de la place', remplace.change,
        JSON.stringify(remplace));
    r.verifie('celle qui s\'en va quitte vraiment le tableau',
        remplace.ancienneEncoreLa === false, JSON.stringify(remplace));
    r.egal('le tableau ne s\'alourdit pas d\'un calque invisible',
        remplace.combienApres, remplace.combienAvant);
    r.egal('et il n\'y a jamais qu\'une page à côté', remplace.pagesPosees, 1);

    // ==================================================================
    // LE VOILE SE PEINT EN BANDES
    //
    // Il se creusait en « pair-impair », et ce remplissage a un défaut de
    // principe : DEUX RECTANGLES QUI SE CHEVAUCHENT S'ANNULENT — le voile se
    // peignait alors par-dessus ce qu'il devait montrer. Deux morceaux d'une
    // même page qui se recouvrent suffisaient.
    //
    // FONDRE LES BOÎTES QUI SE TOUCHENT NE VAUT RIEN NON PLUS : un morceau
    // posé dans la marge touche la page, leur réunion avale la marge entière,
    // et le voile s'y éteint — l'inverse exact du défaut qu'on corrigeait.
    // C'est le chapitre 56 qui l'a dit, et ce chapitre-ci le redit ici pour
    // que le piège ne se retende pas.
    //
    // On calcule donc CE QUI RESTE À PEINDRE, exactement.
    // ==================================================================
    const bandes = await page.evaluate(() => {
        // Combien de bandes recouvrent un point : 1 s'il est voilé, 0 s'il
        // est épargné. Jamais 2 — deux bandes qui se superposent assombriraient
        // le voile à cet endroit-là.
        const couvert = (bs, px, py) => bs.filter(b =>
            px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h).length;
        const ecran = { L: 1000, H: 600 };
        const page = { x: 200, y: 0, w: 400, h: 600 };

        const seule = bandesDuVoile(ecran.L, ecran.H, [page]);
        const memes = bandesDuVoile(ecran.L, ecran.H, [page, page,
            { x: 700, y: 100, w: 100, h: 100 }, { x: 700, y: 100, w: 100, h: 100 }]);
        // LE CAS DU CHAPITRE 56 : un morceau posé dans la marge, qui mord sur
        // la page. Le vide à sa gauche doit rester voilé.
        const marge = bandesDuVoile(ecran.L, ecran.H, [page, { x: 60, y: 250, w: 400, h: 100 }]);
        const rien = bandesDuVoile(ecran.L, ecran.H, []);
        // LES BORDS DE L'ÉCRAN. Un morceau traîné loin du tableau, ou à cheval
        // sur le bord : le voile ne peint que l'écran, et il le peint en
        // entier. Une bande qui déborde, c'est du travail perdu ; une bande
        // qui manque, c'est un trou de lumière au bord de l'image.
        const dehors = bandesDuVoile(ecran.L, ecran.H, [page, { x: 5000, y: 0, w: 100, h: 100 }]);
        const aCheval = bandesDuVoile(ecran.L, ecran.H, [page, { x: 900, y: 0, w: 400, h: 200 }]);
        // Et par le bas — un morceau qui dépasse sous l'écran se rogne comme
        // celui qui dépasse à droite.
        const parLeBas = bandesDuVoile(ecran.L, ecran.H, [page, { x: 700, y: 400, w: 100, h: 500 }]);
        const deborde = (bs) => bs.filter(b => b.x < 0 || b.y < 0
            || b.x + b.w > ecran.L || b.y + b.h > ecran.H).length;
        const aire = (bs) => bs.reduce((t, b) => t + b.w * b.h, 0);

        return {
            pageVoilee: couvert(seule, 100, 300), pageEpargnee: couvert(seule, 400, 300),
            dessus: couvert(seule, 400, -1) + couvert(seule, 400, 601),
            memesDedans: couvert(memes, 750, 150), memesAutour: couvert(memes, 650, 150),
            margeEpargnee: couvert(marge, 100, 300),   // dans le morceau
            margeVoilee: couvert(marge, 20, 300),      // à gauche du morceau
            margeHaut: couvert(marge, 100, 100),       // au-dessus du morceau
            pageTouteVoilee: couvert(rien, 400, 300),
            dehorsPage: couvert(dehors, 400, 300), dehorsMarge: couvert(dehors, 100, 300),
            dehorsDeborde: deborde(dehors), dehorsAire: aire(dehors),
            chevalDeborde: deborde(aCheval), chevalAire: aire(aCheval),
            // Le morceau à cheval déborde de 300 : seuls ses 100 pixels de
            // large qui sont à l'écran cessent d'être voilés.
            chevalAireAttendue: ecran.L * ecran.H - page.w * page.h - 100 * 200,
            chevalDedans: couvert(aCheval, 950, 100), chevalDessous: couvert(aCheval, 950, 300),
            basDeborde: deborde(parLeBas), basAire: aire(parLeBas),
            basAireAttendue: ecran.L * ecran.H - page.w * page.h - 100 * 200,
            basDedans: couvert(parLeBas, 750, 500), basAvant: couvert(parLeBas, 750, 300),
            // Et l'écran entier est couvert une fois, sauf les trous.
            aire: aire(seule),
            aireAttendue: ecran.L * ecran.H - page.w * page.h
        };
    });
    r.egal('la marge est voilée', bandes.pageVoilee, 1);
    r.egal('la page ne l\'est pas', bandes.pageEpargnee, 0);
    r.egal('et rien ne déborde de l\'écran', bandes.dessus, 0);
    r.egal('les bandes couvrent tout sauf la page, une seule fois',
        bandes.aire, bandes.aireAttendue);
    r.egal('un trou donné deux fois reste un trou', bandes.memesDedans, 0);
    r.egal('et ce qui l\'entoure reste voilé', bandes.memesAutour, 1);
    r.egal('un morceau qui mord sur la page est épargné', bandes.margeEpargnee, 0);
    r.egal('mais le vide à sa gauche reste voilé', bandes.margeVoilee, 1);
    r.egal('et le vide au-dessus de lui aussi', bandes.margeHaut, 1);
    r.egal('sans trou, tout est voilé', bandes.pageTouteVoilee, 1);
    r.egal('un trou hors de l\'écran ne change rien à la page', bandes.dehorsPage, 0);
    r.egal('ni à la marge', bandes.dehorsMarge, 1);
    r.egal('et il ne fait pas peindre hors de l\'écran', bandes.dehorsDeborde, 0);
    r.egal('l\'aire peinte reste celle de l\'écran moins la page',
        bandes.dehorsAire, bandes.aireAttendue);
    r.egal('un trou à cheval sur le bord est rogné, pas rejeté',
        bandes.chevalDedans, 0);
    r.egal('et ce qui est sous lui reste voilé', bandes.chevalDessous, 1);
    r.egal('sans rien peindre au-delà du bord', bandes.chevalDeborde, 0);
    r.egal('seule sa part visible cesse d\'être voilée',
        bandes.chevalAire, bandes.chevalAireAttendue);
    r.egal('un trou qui dépasse par le bas est épargné jusqu\'au bord',
        bandes.basDedans, 0);
    r.egal('et ce qui est au-dessus de lui reste voilé', bandes.basAvant, 1);
    r.egal('sans rien peindre sous l\'écran', bandes.basDeborde, 0);
    r.egal('et là aussi, seule sa part visible compte',
        bandes.basAire, bandes.basAireAttendue);

    // Hors projection, le geste n'a pas d'objet.
    const sansProjection = await page.evaluate(async () => {
        const garde = presentationEnCours;
        presentationEnCours = null;
        const fait = await poserLaPageACote(3);
        presentationEnCours = garde;
        return fait;
    });
    r.verifie('sans projection, rien ne se pose à côté', sansProjection === false, String(sansProjection));

    // ==================================================================
    // LE VOLET PORTE LE GESTE
    // ==================================================================
    const leVolet = await page.evaluate(async () => {
        const doc = images[0];
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        if (!document.getElementById('doc-volet').classList.contains('visible')) {
            document.getElementById('doc-volet-btn').click();
        }
        await new Promise(ok => setTimeout(ok, 300));
        majLeVolet();
        const liste = document.getElementById('dv-liste');
        return {
            items: liste.querySelectorAll('.dv-item').length,
            pages: liste.querySelectorAll('.dv-page').length,
            boutons: liste.querySelectorAll('.dv-acote').length,
            // Le « ⇔ » est À CÔTÉ de la vignette, jamais dedans : un bouton
            // ne se niche pas dans un bouton.
            dansUnBouton: !!liste.querySelector('.dv-page .dv-acote'),
            avecACote: liste.classList.contains('avec-acote'),
            courante: !!liste.querySelector('.dv-item.courante')
        };
    });
    r.egal('chaque page a son enveloppe', leVolet.items, 3);
    r.egal('et sa vignette', leVolet.pages, 3);
    r.egal('et son « ⇔ »', leVolet.boutons, 3);
    r.verifie('le « ⇔ » n\'est pas niché dans la vignette', leVolet.dansUnBouton === false,
        JSON.stringify(leVolet));
    r.verifie('la liste sait qu\'on projette ce document', leVolet.avecACote, JSON.stringify(leVolet));
    r.verifie('et la page qu\'on projette est marquée', leVolet.courante, JSON.stringify(leVolet));

    // On le VOIT — et pas sur la page qu'on projette déjà.
    const visibles = await page.evaluate(() => {
        const vu = (el) => {
            if (!el) return false;
            const s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden';
        };
        const courant = document.querySelector('#dv-liste .dv-item.courante .dv-acote');
        const autre = document.querySelector('#dv-liste .dv-item:not(.courante) .dv-acote');
        return { surLaCourante: vu(courant), surUneAutre: vu(autre) };
    });
    r.verifie('le « ⇔ » se voit sur les autres pages', visibles.surUneAutre, JSON.stringify(visibles));
    r.verifie('et pas sur celle qu\'on projette déjà', visibles.surLaCourante === false,
        JSON.stringify(visibles));

    // Le clic passe par le « ⇔ » et ne tourne pas la page principale.
    await page.click('#dv-liste .dv-item[data-item="3"] .dv-acote');
    await page.waitForFunction(() => {
        const v = objetVoisinDeLaPresentation();
        return !!v && v.pluginData.page === 3;
    }, undefined, { timeout: 8000 }).catch(() => { /* on dira l'état réel */ });
    const parLeClic = await page.evaluate(() => ({
        voisin: objetVoisinDeLaPresentation() ? objetVoisinDeLaPresentation().pluginData.page : null,
        principale: images[0].pluginData.page
    }));
    r.egal('cliquer le « ⇔ » met cette page à côté', parLeClic.voisin, 3);
    r.egal('et la page principale n\'a pas bougé', parLeClic.principale, 1);

    // Tandis que cliquer la vignette, lui, tourne bien la page.
    await page.click('#dv-liste .dv-page[data-page="2"]');
    await page.waitForFunction(() => images[0].pluginData.page === 2, undefined, { timeout: 8000 })
        .catch(() => { /* on dira l'état réel */ });
    r.egal('cliquer la vignette emmène toujours à la page',
        await page.evaluate(() => images[0].pluginData.page), 2);

    // ==================================================================
    // LA VIGNETTE DU COIN RAMÈNE D'ABORD AU DOCUMENT SEUL
    //
    // Quand il y en a deux à l'écran, la vignette montre le document qu'on
    // projette : c'est de lui que sort ce qui occupe la place. L'y ramener ne
    // ferait rien de visible. Ce qu'on demande, c'est de le retrouver SEUL.
    // ==================================================================
    const retour = await page.evaluate(async () => {
        const doc = images[0];
        // On tient l'occupant de la place, comme après « à côté ».
        selectedItems = [{ type: 'image', id: presentationVoisine }];
        majBarreDocument();
        const cible = documentOuRevenir();
        const placeAvant = presentationVoisine;
        const zoomADeux = zoom;
        const fait = await revenirAuDocumentDavant();
        return {
            visait: cible ? cible.doc.id : null, leDoc: doc.id, zoomADeux,
            placeAvant, placeApres: presentationVoisine,
            fait, projetteEncore: presentationEnCours === doc.id,
            pagePartie: !getObjectById('image', placeAvant)
        };
    });
    r.egal('la vignette vise bien le document projeté', retour.visait, retour.leDoc);
    r.verifie('la place était prise', retour.placeAvant !== null, JSON.stringify(retour));
    r.verifie('appuyer la libère', retour.fait === true && retour.placeApres === null,
        JSON.stringify(retour));
    r.verifie('et l\'on projette toujours le document', retour.projetteEncore, JSON.stringify(retour));
    r.verifie('la page d\'à côté s\'en va avec la place', retour.pagePartie, JSON.stringify(retour));

    // La page reprend alors toute la place : le zoom est celui d'une page
    // seule — et dans LE CADRAGE QU'ELLE AVAIT, pleine largeur ou page
    // entière, qu'on ne réécrit pas en dur.
    const seule = await page.evaluate(async () => {
        await new Promise(ok => setTimeout(ok, 150));
        const doc = images[0];
        const toile = document.getElementById('board');
        const pageEntiere = Math.min(toile.clientWidth / doc.w, toile.clientHeight / doc.h);
        const pleineLargeur = toile.clientWidth / doc.w;
        return { zoom, cadrage: cadrageDePresentation, pageEntiere, pleineLargeur,
                 attendu: cadrageDePresentation === 'largeur' ? pleineLargeur : pageEntiere };
    });
    r.verifie('et la page reprend l\'écran entier',
        Math.abs(seule.zoom - seule.attendu) < 0.02,
        `${seule.zoom.toFixed(3)} au lieu de ${seule.attendu.toFixed(3)} (${seule.cadrage})`);
    r.verifie('et la page y gagne : seule, elle est plus grande qu\'à deux',
        seule.zoom > retour.zoomADeux + 0.01,
        `${seule.zoom.toFixed(3)} contre ${retour.zoomADeux.toFixed(3)} à deux`);

    // Le « ⇔ » du volet s'en va avec la projection, et la page d'à côté aussi.
    const apresSortie = await page.evaluate(async () => {
        const doc = images[0];
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        presenterLeDocument();
        await new Promise(ok => setTimeout(ok, 200));
        await poserLaPageACote(3);
        const laPage = presentationVoisine;
        const avecPage = images.length;
        quitterLaPresentation();
        await new Promise(ok => setTimeout(ok, 150));
        const liste = document.getElementById('dv-liste');
        return { avecACote: liste.classList.contains('avec-acote'),
                 place: presentationVoisine, laPage,
                 partie: !getObjectById('image', laPage),
                 avecPage, apres: images.length };
    });
    r.verifie('quitter la projection retire le « ⇔ » du volet', apresSortie.avecACote === false,
        JSON.stringify(apresSortie));
    r.egal('et la place est libre', apresSortie.place, null);
    r.verifie('la page qu\'elle portait sort avec elle', apresSortie.partie, JSON.stringify(apresSortie));
    r.egal('le tableau retrouve son compte', apresSortie.apres, apresSortie.avecPage - 1);

    await page.evaluate(() => {
        presentationEnCours = null; presentationVoisine = null;
        images.length = 0; morceauxEnAttente = []; selectedItems = [];
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
