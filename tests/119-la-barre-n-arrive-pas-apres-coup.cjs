// LA BARRE COMMUNE N'ARRIVE PAS APRÈS COUP.
//
//   « Quand on ouvre une fenêtre, la barre de titre se met en noir, puis
//     après ça devient ce que l'on a modifié, comme s'il y avait la vieille
//     fenêtre puis la nouvelle. »
//
// C'était exactement cela. La fenêtre s'affichait avec SON bandeau — souvent
// sombre —, et la barre commune ne venait que plus tard. Mesuré sur les
// quatre-vingt-neuf outils : dix fenêtres montraient leur bandeau de 46 à
// 212 millisecondes avant de recevoir la barre. Évolutions Successives 212,
// Pixel Studio 202, le Tableau de Proportionnalité 166.
//
// LA CAUSE TENAIT EN UN MOT : l'attente était posée AVANT le travail. Le
// veilleur qui regarde les changements de style s'accorde cent vingt
// millisecondes de repos, et pour une bonne raison — une animation lui ferait
// relire la page cent fois par seconde. Mais rien n'obligeait à faire
// attendre le PREMIER lot. Il est traité tout de suite ; le repos ne vaut que
// pour ceux qui suivent.
//
// CE CHAPITRE NE CHRONOMÈTRE PAS. Une mesure en millisecondes dépend de la
// machine, et tomberait un jour de malchance. On mesure le MÉCANISME : une
// boîte qui a la forme d'une fenêtre et qu'on montre doit porter sa barre à
// l'image suivante — pas dans cent vingt millisecondes.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La barre n\'arrive pas après coup');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    // ------------------------------------------------------------------
    // 1. MONTRÉE, ELLE PORTE SA BARRE À L'IMAGE SUIVANTE.
    //
    //    On pose une fenêtre d'essai CACHÉE — elle ne doit rien recevoir,
    //    car on ne mesure pas ce qu'on ne voit pas — puis on la montre sans
    //    ajouter le moindre nœud, ce qui est le cas de la moitié des outils :
    //    leur fenêtre dort déjà dans la page.
    // ------------------------------------------------------------------
    const essai = await page.evaluate(async () => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed; left:120px; top:120px; width:420px; height:320px;'
            + ' background:#ffffff; border-radius:10px; display:none; z-index:200000;';
        d.innerHTML = '<div style="height:40px; background:#1e272e; color:#fff; display:flex;'
            + ' align-items:center; padding:0 10px;"><span style="flex:1">Fenêtre d\'essai</span>'
            + '<button class="close">✕</button></div>'
            + '<div style="padding:20px">un contenu quelconque</div>';
        document.body.appendChild(d);
        // on laisse l'ajout se traiter : cachée, elle ne doit rien recevoir
        await new Promise(k => setTimeout(k, 260));
        const cachee = { barre: !!d.querySelector('.fen-tete') };

        d.style.display = 'block';
        await new Promise(k => requestAnimationFrame(k));
        const uneImage = { barre: !!d.querySelector('.fen-tete'),
                           contour: d.classList.contains('contour-fenetre') };
        // et si l'on attendait vraiment, ce serait là que ça arriverait
        await new Promise(k => setTimeout(k, 400));
        const apresLAttente = { barre: !!d.querySelector('.fen-tete') };
        d.remove();
        return { cachee, uneImage, apresLAttente };
    });

    r.verifie('cachée, elle ne reçoit rien — on n\'habille pas ce qu\'on ne voit pas',
        essai.cachee.barre === false, JSON.stringify(essai));
    r.verifie('montrée, elle porte sa barre dès l\'image suivante',
        essai.uneImage.barre === true, JSON.stringify(essai));
    r.verifie('et son contour avec',
        essai.uneImage.contour === true, JSON.stringify(essai));
    r.verifie('la barre n\'attend pas le repos du veilleur',
        essai.uneImage.barre === essai.apresLAttente.barre, JSON.stringify(essai));

    // ------------------------------------------------------------------
    // 2. ET LE VEILLEUR SE REPOSE TOUJOURS.
    //
    //    Traiter le premier lot tout de suite ne doit pas vouloir dire
    //    travailler à chaque changement de style : une animation en lance des
    //    dizaines par seconde. On en déclenche cinquante d'affilée et l'on
    //    compte combien de fois le travail est fait. Sans repos, ce serait
    //    cinquante ; avec, une poignée.
    // ------------------------------------------------------------------
    // ON COMPTE LES PASSES, PAS LES ÉLÉMENTS.
    //
    // Une passe peut toucher plusieurs éléments d'un coup — c'est justement
    // ce qu'on veut, les traiter ensemble. Ce que le repos borne, c'est le
    // NOMBRE DE FOIS où l'on relit la page : au plus une par image. Compter
    // les éléments mélangeait les deux et donnait un chiffre qu'on ne savait
    // pas lire (mesuré : 30, 30, puis 46 au repos, pour un même code).
    //
    // ET UNE PASSE SE RECONNAÎT À LA RAFALE, PAS À L'HORLOGE. Ce chapitre a
    // longtemps découpé le temps en tranches de seize millisecondes et
    // compté les tranches occupées. Ce chiffre ne mesurait rien : saboté —
    // le repos retiré —, il passait de 15 à 16, là où le travail, lui,
    // doublait. Il comptait le temps écoulé. Les deux bornes d'images, elles
    // aussi, étaient estimées à « durée ÷ 16 », c'est-à-dire soixante images
    // par seconde : ni un écran à 120 Hz ni un navigateur sans écran ne s'y
    // tiennent, et le contrôle tombait un jour de malchance sur une erreur
    // d'arithmétique. On compte donc les vraies images, et les vraies
    // rafales.
    const repos = await page.evaluate(async () => {
        const vrai = window.poserLeContourDesFenetres;
        let quand = [];
        window.poserLeContourDesFenetres = function (...a) { quand.push(performance.now()); return vrai.apply(this, a); };
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed; left:-9999px; top:0; width:30px; height:30px;';
        document.body.appendChild(d);
        await new Promise(k => setTimeout(k, 300));
        quand = [];
        // ON COMPTE LES VRAIES IMAGES, ON NE LES ESTIME PLUS.
        //
        // « durée ÷ 16 » suppose soixante images par seconde. Ce n'est vrai ni
        // d'un écran à 120 Hz ni d'un navigateur sans écran, qui les rend
        // aussi vite qu'il peut. Mesuré en pleine suite : 17 passes pour 14
        // images ESTIMÉES — et le contrôle tombait sur une erreur
        // d'arithmétique, pas sur un défaut. Un compteur branché sur les
        // images elles-mêmes ne se trompe sur aucune machine.
        let images = 0;
        let compte = true;
        const tic = () => { if (!compte) return; images++; requestAnimationFrame(tic); };
        requestAnimationFrame(tic);
        for (let i = 0; i < 50; i++) {
            d.style.opacity = String(0.5 + (i % 2) * 0.1);
            await new Promise(k => setTimeout(k, 4));
        }
        await new Promise(k => setTimeout(k, 300));
        compte = false;
        d.remove();
        window.poserLeContourDesFenetres = vrai;
        // UNE PASSE EST UNE RAFALE D'APPELS, et non une tranche de seize
        // millisecondes. Compter les tranches ne mesurait RIEN : saboté — le
        // repos retiré, cinquante relectures au lieu de vingt-quatre — le
        // chiffre passait de 15 à 16. Il comptait le temps écoulé, pas le
        // travail fait. Deux appels séparés de moins de deux millisecondes
        // sont le même passage ; mesuré, cela donne 24 au repos contre 51
        // sans repos, et les trois mesures de chaque côté ne bougent pas.
        let passes = 0;
        quand.forEach((t, i) => { if (i === 0 || t - quand[i - 1] > 2) passes++; });
        return { passes, appels: quand.length, images };
    });
    r.verifie('cinquante changements de style ne font pas cinquante relectures',
        repos.passes <= repos.images + 2,
        repos.passes + ' passes pour ' + repos.images + ' images et cinquante changements'
        + ' (' + repos.appels + ' éléments relus)');
    r.verifie('mais il en fait au moins une', repos.passes >= 1, JSON.stringify(repos));

    // ------------------------------------------------------------------
    // 3. SUR UN VRAI OUTIL, LA FENÊTRE ET SA BARRE ARRIVENT ENSEMBLE.
    //
    //    Le Tableau de Proportionnalité était le plus lent des quarante-sept
    //    à recevoir sa barre : 166 millisecondes de bandeau nu. La borne est
    //    large exprès — on ne chronomètre pas une machine, on empêche le
    //    retour d'un défaut qui se comptait en dixièmes de seconde.
    // ------------------------------------------------------------------
    const vrai = await page.evaluate(async () => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Tableau de Proportionnalité');
        if (!b) return { erreur: 'bouton introuvable' };
        const avant = document.querySelectorAll('.fen-tete').length;
        const t0 = performance.now();
        b.click();
        let vue = null, barree = null;
        for (let i = 0; i < 60 && barree === null; i++) {
            await new Promise(k => requestAnimationFrame(k));
            const f = document.getElementById('prop-builder-modal');
            if (f && f.getClientRects().length && vue === null) vue = Math.round(performance.now() - t0);
            if (document.querySelectorAll('.fen-tete').length > avant) barree = Math.round(performance.now() - t0);
        }
        return { vue, barree, nu: (vue !== null && barree !== null) ? barree - vue : null };
    });
    r.verifie('la fenêtre du Tableau de Proportionnalité reçoit sa barre tout de suite',
        vrai.nu !== null && vrai.nu <= 80,
        JSON.stringify(vrai) + ' — 166 ms avant la correction');

    // ------------------------------------------------------------------
    // 4. ET ON NE LA VOIT JAMAIS NUE, PAS MÊME UNE IMAGE.
    //
    //    C'est la vraie demande : « j'ai toujours le même effet de la fenêtre
    //    avec le titre noir, puis après ça devient de la bonne couleur. »
    //    Quatre-vingts millisecondes de tolérance ne la satisfont pas — une
    //    seule image suffit à voir le bandeau noir.
    //
    //    LA CAUSE N'ÉTAIT NI LE VEILLEUR NI SON REPOS : toute fenêtre
    //    attendait DEUX images avant d'être jugée, attente prévue pour celles
    //    qu'on bâtit repliées et imposée à toutes. Mesuré au jalon : à
    //    17,6 ms la fenêtre faisait déjà 422 × 356 et passait tous les tests ;
    //    sa barre n'arrivait qu'à 22,4 ms.
    //
    //    On regarde donc à la PREMIÈRE image où la fenêtre se voit : elle doit
    //    déjà porter sa barre.
    const jamaisNue = await page.evaluate(async () => {
        document.querySelectorAll('[data-equipee="1"]').forEach(f => {
            if (!f.getClientRects().length) return;
            const x = f.querySelector('.fen-fermer');
            if (x) x.click(); else f.style.display = 'none';
        });
        await new Promise(k => setTimeout(k, 300));
        const cible = document.getElementById('prop-builder-modal');
        if (!cible) return { erreur: 'fenêtre absente' };
        // ON LA REND VRAIMENT VIERGE. « equipee » ne suffit pas : la marque
        // d'attente, elle aussi, raccourcit le chemin la fois suivante — et
        // le contrôle mesurait alors une fenêtre déjà à moitié habillée.
        cible.style.display = 'none';
        delete cible.dataset.equipee;
        delete cible.dataset.fenAttente;
        delete cible.dataset.fenetreDefilableX;
        delete cible.dataset.fenetreDefilableY;
        const vieille = cible.querySelector(':scope > .fen-tete');
        if (vieille) vieille.remove();
        cible.classList.remove('fen-titree');
        cible.classList.remove('contour-fenetre');
        await new Promise(k => setTimeout(k, 300));

        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Tableau de Proportionnalité');
        if (!b) return { erreur: 'bouton introuvable' };
        b.click();
        const images = [];
        for (let i = 0; i < 6; i++) {
            await new Promise(k => requestAnimationFrame(k));
            images.push({
                montree: getComputedStyle(cible).display !== 'none',
                barre: !!cible.querySelector(':scope > .fen-tete')
            });
        }
        // la première image où on la voit
        const vue = images.find(x => x.montree);
        return { images, premiereVue: vue || null };
    });
    r.verifie('à la première image où on la voit, elle porte déjà sa barre',
        !!jamaisNue.premiereVue && jamaisNue.premiereVue.barre === true,
        JSON.stringify(jamaisNue));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
