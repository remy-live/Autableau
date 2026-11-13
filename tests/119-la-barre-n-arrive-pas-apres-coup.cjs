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
    const repos = await page.evaluate(async () => {
        const vrai = window.poserLeContourDesFenetres;
        let appels = 0;
        window.poserLeContourDesFenetres = function (...a) { appels++; return vrai.apply(this, a); };
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed; left:-9999px; top:0; width:30px; height:30px;';
        document.body.appendChild(d);
        await new Promise(k => setTimeout(k, 300));
        appels = 0;
        for (let i = 0; i < 50; i++) {
            d.style.opacity = String(0.5 + (i % 2) * 0.1);
            await new Promise(k => setTimeout(k, 4));
        }
        await new Promise(k => setTimeout(k, 300));
        d.remove();
        window.poserLeContourDesFenetres = vrai;
        return appels;
    });
    r.verifie('cinquante changements de style ne font pas cinquante relectures',
        repos < 20, repos + ' relectures pour cinquante changements');
    r.verifie('mais il en fait au moins une', repos >= 1, String(repos));

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

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
