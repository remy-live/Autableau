// LA VISIONNEUSE SE PROJETTE, ET SA PHOTO S'ANNOTE.
//
// « Utilisant beaucoup la visionneuse, j'adorerais pouvoir projeter ma
// visionneuse directement sur le site, donc avoir une page avec l'accès direct
// à la visionneuse, et pouvoir faire des captures d'écran pour corriger des
// élèves en direct au tableau. »
//
// Deux gestes, et c'est tout : MONTRER, puis FIGER POUR CORRIGER.
//
// CE CHAPITRE SE JOUE AVEC UNE CAMÉRA FACTICE — « --use-fake-device-for-media-
// stream » —, qui rend une mire de 640 sur 480. On ne mesure donc pas la
// qualité de l'image, mais tout le reste : que la caméra soit demandée à
// l'ouverture et RENDUE à la fermeture, que la photo devienne un document du
// tableau, qu'elle soit projetée, et que le miroir s'applique aussi à la photo.
//
// LE VOYANT QUI RESTE ALLUMÉ est le vrai sujet de la moitié des contrôles.
// Dans une classe, une caméra qu'on croit éteinte et qui filme n'est pas un
// détail d'implémentation : c'est pourquoi on vérifie l'état des pistes, et pas
// seulement que le plein écran est refermé.
const { chromium } = require('playwright');
const { CHROMIUM, APP_URL, creerRapport } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La visionneuse se projette');

    // Ce chapitre a besoin de son propre navigateur : la caméra factice est un
    // drapeau de lancement, et le navigateur commun de la suite ne l'a pas.
    const nav = await chromium.launch({
        executablePath: CHROMIUM,
        args: ['--no-sandbox', '--use-fake-device-for-media-stream',
               '--use-fake-ui-for-media-stream']
    });
    const context = await nav.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ['camera']
    });
    const page = await context.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message || e)));
    await page.goto(APP_URL);
    await page.waitForFunction(() => typeof window.ouvrirLaVisionneuse === 'function',
        null, { timeout: 20000 });
    await page.waitForTimeout(600);

    // ON GARDE UNE PRISE SUR LE FLUX, et c'est tout l'objet de « __vu ».
    //
    // Premier contrôle que j'ai écrit : « plus aucune piste vive », lu sur
    // « video.srcObject ». Il passait AUSSI quand on retirait l'arrêt des
    // pistes — parce que la fermeture détache le flux de la vidéo, et qu'un
    // flux détaché n'a plus de pistes à montrer. Je mesurais « détaché », pas
    // « coupé » : exactement ce dont la classe se moque.
    //
    // On retient donc le MediaStream lui-même pendant qu'il est branché. Après
    // la fermeture, ses pistes doivent être « ended » : c'est cela, le voyant
    // qui s'éteint.
    const etat = () => page.evaluate(() => {
        const el = document.getElementById('visionneuse');
        const v = document.getElementById('vis-flux');
        if (v && v.srcObject) window.__vu = v.srcObject;
        const retenu = window.__vu ? window.__vu.getTracks() : [];
        return {
            ouverte: !!(el && !el.hidden),
            flux: !!(v && v.srcObject),
            pistesVives: v && v.srcObject
                ? v.srcObject.getTracks().filter(p => p.readyState === 'live').length : 0,
            // Les pistes du flux RETENU, qu'il soit encore branché ou non.
            retenuesVives: retenu.filter(p => p.readyState === 'live').length,
            retenues: retenu.length,
            largeur: v ? v.videoWidth : 0,
            mot: (document.getElementById('vis-mot') || {}).textContent || '',
            images: typeof images !== 'undefined' ? images.length : -1
        };
    });
    const oublierLeFluxRetenu = () => page.evaluate(() => { window.__vu = null; });

    // ------------------------------------------------------------------
    // 1. LE BOUTON EXISTE, ET IL N'EST PAS UN OUTIL DE TRACÉ.
    //    Un enseignant qui montre un cahier n'est pas en train de dessiner :
    //    s'il portait un « data-mode », prendre la visionneuse changerait
    //    l'outil en main et viderait la sélection.
    // ------------------------------------------------------------------
    const leBouton = await page.evaluate(() => {
        const b = document.getElementById('btn-visionneuse');
        if (!b) return null;
        const rr = b.getBoundingClientRect();
        // L'application déplace « title » vers « data-tooltip » : son
        // infobulle maison marche AU DOIGT, ce que « title » ne fait pas sur
        // un tableau tactile. C'est donc là qu'il faut lire le libellé.
        return { mode: b.dataset.mode || null,
                 titre: b.getAttribute('data-tooltip') || b.title || '',
                 // LA BARRE COURTE N'EFFACE PAS LA VISIONNEUSE. L'option
                 // « gestes du quotidien » cache tout ce qui suit la gomme et
                 // le pointeur laser — la géométrie et les instruments. La
                 // visionneuse est pourtant le geste le plus quotidien qui
                 // soit pour qui l'a demandée : elle est donc placée AVANT la
                 // coupure, et ne porte pas la marque « outil-en-plus ».
                 dansLesInstruments: b.classList.contains('outil-en-plus'),
                 visible: rr.width > 0 && rr.height > 0 };
    });
    r.verifie('le bouton de la visionneuse est dans la barre d\'outils',
        leBouton && leBouton.visible, JSON.stringify(leBouton));
    r.egal('et il n\'est pas un mode de tracé', leBouton && leBouton.mode, null,
        JSON.stringify(leBouton));
    r.verifie('son infobulle dit les deux choses qu\'il fait',
        leBouton && /projeter/i.test(leBouton.titre) && /photo/i.test(leBouton.titre),
        JSON.stringify(leBouton));
    r.egal('et la barre courte ne l\'efface pas : ce n\'est pas un instrument de géométrie',
        leBouton && leBouton.dansLesInstruments, false, JSON.stringify(leBouton));

    // RIEN N'EST DEMANDÉ AVANT QU'ON OUVRE. Une application de classe qui
    // allume la caméra au démarrage est une application qu'on n'ouvre plus.
    const auRepos = await etat();
    r.egal('au démarrage, la visionneuse est fermée et aucune caméra n\'est prise',
        { ouverte: auRepos.ouverte, flux: auRepos.flux }, { ouverte: false, flux: false },
        JSON.stringify(auRepos));

    // ------------------------------------------------------------------
    // 2. ON L'OUVRE : LA CAMÉRA ARRIVE, ET L'IMAGE AVEC.
    // ------------------------------------------------------------------
    await page.evaluate(() => document.getElementById('btn-visionneuse').click());
    await page.waitForFunction(() => {
        const v = document.getElementById('vis-flux');
        return !!(v && v.videoWidth > 0);
    }, null, { timeout: 15000 });
    const ouverte = await etat();
    r.egal('le plein écran s\'ouvre et la caméra donne une image',
        { ouverte: ouverte.ouverte, flux: ouverte.flux, aUneImage: ouverte.largeur > 0 },
        { ouverte: true, flux: true, aUneImage: true }, JSON.stringify(ouverte));
    r.egal('et plus rien à expliquer : le mot d\'attente a disparu', ouverte.mot, '',
        JSON.stringify(ouverte));
    r.verifie('la piste de la caméra est vive', ouverte.pistesVives >= 1,
        JSON.stringify(ouverte));

    // ------------------------------------------------------------------
    // 3. LE MIROIR : UNE PAGE DE CAHIER À L'ENVERS NE SE LIT PAS.
    //    Il doit s'appliquer à l'affichage ET à la photo — l'enseignant a
    //    retourné l'image parce qu'elle était illisible ; une photo qui
    //    reviendrait à l'envers lui rendrait le problème qu'il vient de régler.
    // ------------------------------------------------------------------
    const avantMiroir = await page.evaluate(() => ({
        classe: document.getElementById('vis-flux').classList.contains('en-miroir'),
        enfonce: document.getElementById('vis-miroir').getAttribute('aria-pressed')
    }));
    await page.evaluate(() => document.getElementById('vis-miroir').click());
    await page.waitForTimeout(150);
    const apresMiroir = await page.evaluate(() => ({
        classe: document.getElementById('vis-flux').classList.contains('en-miroir'),
        enfonce: document.getElementById('vis-miroir').getAttribute('aria-pressed'),
        garde: (() => { try { return localStorage.getItem('auTableau_visionneuse_miroir'); } catch (e) { return 'refusé'; } })()
    }));
    r.egal('le miroir retourne l\'image montrée',
        [avantMiroir.classe, apresMiroir.classe], [false, true],
        JSON.stringify([avantMiroir, apresMiroir]));
    r.egal('et le bouton dit qu\'il est mis', apresMiroir.enfonce, 'true',
        JSON.stringify(apresMiroir));
    r.egal('le réglage se garde pour les jours suivants', apresMiroir.garde, '1',
        JSON.stringify(apresMiroir));

    // LA PHOTO SUIT LE MIROIR — ET ON NE LE MESURE PAS SUR LA MIRE.
    //
    // Premier contrôle que j'ai écrit : comparer un pixel du bord gauche et du
    // bord droit de la mire factice, avec et sans miroir. Il passait AUSSI
    // quand on retirait le retournement du dessin — la mire est à peu près
    // symétrique à mi-hauteur, et elle bouge entre deux prises. Il ne mesurait
    // donc rien du tout.
    //
    // On donne donc à la visionneuse une image qu'on maîtrise : un flux tiré
    // d'un canevas, moitié rouge à gauche, moitié bleue à droite, immobile.
    // Retourné, le rouge doit passer à droite. C'est le vrai code qui tourne —
    // « photographierLaVisionneuse » lit la vidéo comme toujours —, c'est
    // seulement ce qu'elle regarde qui devient lisible.
    const deuxPhotos = await page.evaluate(async () => {
        const v = document.getElementById('vis-flux');
        const vrai = v.srcObject;
        const c = document.createElement('canvas');
        c.width = 240; c.height = 120;
        const g = c.getContext('2d');
        g.fillStyle = '#ff0000'; g.fillRect(0, 0, 120, 120);
        g.fillStyle = '#0000ff'; g.fillRect(120, 0, 120, 120);
        const faux = c.captureStream(5);
        v.srcObject = faux;
        try { await v.play(); } catch (e) { /* il jouera */ }
        await new Promise(ok => setTimeout(ok, 600));

        const lire = async () => {
            const p = photographierLaVisionneuse();
            if (!p) return null;
            const img = new Image();
            await new Promise(ok => { img.onload = ok; img.onerror = ok; img.src = p.src; });
            const cc = document.createElement('canvas');
            cc.width = img.width; cc.height = img.height;
            const gg = cc.getContext('2d');
            gg.drawImage(img, 0, 0);
            const px = (x) => {
                const d = gg.getImageData(x, Math.floor(img.height / 2), 1, 1).data;
                // Rouge ou bleu : le JPEG déplace les valeurs de quelques
                // unités, on ne compare donc pas des octets exacts.
                return d[0] > d[2] + 40 ? 'rouge' : (d[2] > d[0] + 40 ? 'bleu' : 'autre');
            };
            return { L: img.width, H: img.height,
                     gauche: px(6), droite: px(img.width - 7) };
        };

        const droit = await lire();                         // le miroir est mis au bloc 3
        document.getElementById('vis-miroir').click();      // on le remet droit
        await new Promise(ok => setTimeout(ok, 200));
        const sansMiroir = await lire();

        // On rebranche la vraie caméra, et l'on coupe le faux flux.
        v.srcObject = vrai;
        try { await v.play(); } catch (e) { /* il jouera */ }
        try { faux.getTracks().forEach(t => t.stop()); } catch (e) { /* déjà coupé */ }
        await new Promise(ok => setTimeout(ok, 300));
        return { enMiroir: droit, sansMiroir };
    });
    r.verifie('la photo a la taille de l\'image de la caméra, pas celle de l\'écran',
        deuxPhotos.sansMiroir && deuxPhotos.sansMiroir.L === 240
        && deuxPhotos.sansMiroir.H === 120, JSON.stringify(deuxPhotos));
    r.egal('sans miroir, le rouge est à gauche — comme la caméra le montre',
        [deuxPhotos.sansMiroir.gauche, deuxPhotos.sansMiroir.droite], ['rouge', 'bleu'],
        JSON.stringify(deuxPhotos));
    r.egal('ET LE MIROIR RETOURNE AUSSI LA PHOTO : le rouge passe à droite',
        [deuxPhotos.enMiroir.gauche, deuxPhotos.enMiroir.droite], ['bleu', 'rouge'],
        JSON.stringify(deuxPhotos));

    // ------------------------------------------------------------------
    // 4. LA PHOTO DEVIENT UN DOCUMENT DU TABLEAU, PROJETÉ.
    //    C'est tout l'intérêt : on ne réinvente pas l'annotation, on hérite du
    //    plein écran, du rail, des crayons et de l'enregistrement.
    // ------------------------------------------------------------------
    const avantPhoto = await page.evaluate(() => images.length);
    await page.evaluate(() => document.getElementById('vis-photo').click());
    await page.waitForTimeout(500);
    const posee = await page.evaluate(() => {
        const o = images[images.length - 1];
        return {
            images: images.length,
            aUnSrc: !!(o && o.src && o.src.startsWith('data:image')),
            estUnDocument: !!(o && typeof estUnDocumentPose === 'function' && estUnDocumentPose(o)),
            selectionnee: selectedItems.length === 1 && selectedItems[0].type === 'image'
                && !!o && selectedItems[0].id === o.id,
            projetee: typeof presentationEnCours !== 'undefined' && !!presentationEnCours,
            visionneuseFermee: document.getElementById('visionneuse').hidden,
            largeurEcran: window.innerWidth,
            boite: o ? [Math.round(o.w), Math.round(o.h)] : null
        };
    });
    r.egal('la photo est posée sur le tableau', posee.images, avantPhoto + 1,
        JSON.stringify(posee));
    r.verifie('c\'est une vraie image, avec son contenu', posee.aUnSrc, JSON.stringify(posee));
    r.egal('ET C\'EST UN DOCUMENT : elle hérite du plein écran, du rail et des crayons',
        posee.estUnDocument, true, JSON.stringify(posee));
    r.egal('elle est tenue en main — c\'est la sélection qui fait paraître sa barre',
        posee.selectionnee, true, JSON.stringify(posee));
    r.egal('et elle est PROJETÉE, prête à corriger devant la classe',
        posee.projetee, true, JSON.stringify(posee));

    // ------------------------------------------------------------------
    // 5. ET LA CAMÉRA EST RENDUE. On vient de figer ce qu'on voulait montrer ;
    //    laisser le flux ouvert poserait un plein écran par-dessus le tableau
    //    qu'on veut annoter, et laisserait le voyant allumé sur un appareil que
    //    plus personne ne regarde.
    // ------------------------------------------------------------------
    r.egal('le plein écran de la caméra s\'est refermé', posee.visionneuseFermee, true,
        JSON.stringify(posee));
    const apresPhoto = await etat();
    r.egal('le flux est détaché de la vidéo',
        apresPhoto.flux, false, JSON.stringify(apresPhoto));
    r.egal('ET LE VOYANT S\'ÉTEINT VRAIMENT : les pistes de la caméra sont coupées',
        { retenues: apresPhoto.retenues > 0, vives: apresPhoto.retenuesVives },
        { retenues: true, vives: 0 }, JSON.stringify(apresPhoto));

    // ------------------------------------------------------------------
    // 6. ON PEUT Y REVENIR, ET ÉCHAP REFERME — comme partout ailleurs.
    // ------------------------------------------------------------------
    await oublierLeFluxRetenu();
    await page.evaluate(() => document.getElementById('btn-visionneuse').click());
    await page.waitForFunction(() => {
        const v = document.getElementById('vis-flux');
        return !!(v && v.videoWidth > 0);
    }, null, { timeout: 15000 });
    const rouverte = await etat();
    r.verifie('on rouvre la visionneuse et la caméra revient',
        rouverte.ouverte && rouverte.pistesVives >= 1, JSON.stringify(rouverte));
    r.egal('le miroir a gardé le réglage de la dernière fois',
        await page.evaluate(() => document.getElementById('vis-flux').classList.contains('en-miroir')),
        false, 'remis droit au bloc 3');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const parEchap = await etat();
    r.egal('Échap referme la visionneuse ET COUPE la caméra',
        { ouverte: parEchap.ouverte, flux: parEchap.flux, vives: parEchap.retenuesVives },
        { ouverte: false, flux: false, vives: 0 }, JSON.stringify(parEchap));

    // ------------------------------------------------------------------
    // 7. L'ONGLET QU'ON QUITTE REND LA CAMÉRA. On passe à Pronote le temps de
    //    noter une absence, et le voyant restait allumé derrière.
    // ------------------------------------------------------------------
    await oublierLeFluxRetenu();
    await page.evaluate(() => document.getElementById('btn-visionneuse').click());
    await page.waitForFunction(() => {
        const v = document.getElementById('vis-flux');
        return !!(v && v.videoWidth > 0);
    }, null, { timeout: 15000 });
    await etat();                 // on prend la main sur le flux neuf
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    const enArrierePlan = await etat();
    r.egal('l\'onglet passé en arrière-plan COUPE la caméra',
        { ouverte: enArrierePlan.ouverte, vives: enArrierePlan.retenuesVives },
        { ouverte: false, vives: 0 }, JSON.stringify(enArrierePlan));

    // ------------------------------------------------------------------
    // 8. ET LA BARRE DÉJÀ RANGÉE PAR LE PROFESSEUR LA RÉCUPÈRE AU BON ENDROIT.
    //
    // C'est le seul vrai cas d'emploi de la migration, et le piège de tout
    // bouton neuf : l'ordre de la barre principale vient d'une LISTE
    // ENREGISTRÉE, et l'outil qu'elle ne connaît pas est ajouté AU BOUT du
    // rang. Or le bout du rang est exactement la part que l'option « gestes du
    // quotidien » efface. La visionneuse aurait disparu chez ceux qui ont
    // choisi la barre courte — c'est-à-dire chez les enseignants qui ne font
    // pas de géométrie, ceux-là mêmes qui montrent le plus de cahiers.
    //
    // On repart donc d'une barre d'hier, sans elle, et l'on vérifie qu'elle
    // revient AVANT la gomme — et une seule fois : ranger sa barre reste
    // l'affaire du professeur.
    // ------------------------------------------------------------------
    const CLE = 'auTableau_place_visionneuse_v1';
    await page.evaluate((cle) => {
        localStorage.removeItem(cle);
        localStorage.setItem('board_floating_toolbars', JSON.stringify([{
            id: 'system-toolbar-main', name: 'Outils', x: 20, y: 80, protected: true,
            items: ['pointer', 'freehand', 'text', 'eraser', 'laser', 'ruler', 'compass']
        }]));
    }, CLE);
    await page.reload();
    await page.waitForFunction(() => typeof window.ouvrirLaVisionneuse === 'function',
        null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const rangee = await page.evaluate(() => {
        const tb = JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]')
            .find(t => t.id === 'system-toolbar-main');
        const b = document.getElementById('btn-visionneuse');
        return { items: tb ? tb.items : null,
                 rang: tb ? tb.items.indexOf('btn-visionneuse') : -1,
                 gomme: tb ? tb.items.indexOf('eraser') : -1,
                 laser: tb ? tb.items.indexOf('laser') : -1,
                 instrument: b ? b.classList.contains('outil-en-plus') : null };
    });
    r.verifie('la visionneuse est entrée dans une barre qui ne la connaissait pas',
        rangee.rang >= 0, JSON.stringify(rangee));
    // ELLE SE POSE JUSTE APRÈS LA PAIRE GOMME + LASER, et non avant elle : la
    // paire est contiguë, le chapitre 9 la fige, et la visionneuse est nommée
    // parmi les derniers du quotidien — c'est donc ELLE qui devient la coupure
    // de la barre courte, et à cette place elle est gardée.
    r.verifie('JUSTE APRÈS LA GOMME ET LE LASER : la barre courte ne l\'efface donc pas',
        rangee.rang >= 0 && rangee.rang === Math.max(rangee.gomme, rangee.laser) + 1,
        JSON.stringify(rangee));
    r.egal('le bouton n\'est plus marqué comme un instrument de géométrie',
        rangee.instrument, false, JSON.stringify(rangee));

    // ET ELLE NE REFAIT PAS LE RANGEMENT CHAQUE MATIN. Le professeur qui la
    // déplace ailleurs doit la retrouver là où il l'a mise.
    await page.evaluate(() => {
        const barres = JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]')
            .map(t => t.id === 'system-toolbar-main'
                ? { ...t, items: t.items.filter(x => x !== 'btn-visionneuse').concat('btn-visionneuse') }
                : t);
        localStorage.setItem('board_floating_toolbars', JSON.stringify(barres));
    });
    await page.reload();
    await page.waitForFunction(() => typeof window.ouvrirLaVisionneuse === 'function',
        null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const laissee = await page.evaluate(() => {
        const tb = JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]')
            .find(t => t.id === 'system-toolbar-main');
        return { rang: tb ? tb.items.indexOf('btn-visionneuse') : -1,
                 dernier: tb ? tb.items.length - 1 : -2, items: tb ? tb.items : null };
    });
    r.egal('déplacée à la main par le professeur, elle y reste',
        laissee.rang, laissee.dernier, JSON.stringify(laissee));

    const propres = erreurs.filter(e => !/getUserMedia|mediaDevices|jsPDF|pdfjsLib|localforage/.test(e));
    r.verifie('aucune erreur de page', propres.length === 0, propres.join(' | '));
    await context.close();
    await nav.close();
    return r.bilan();
};
