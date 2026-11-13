// L'ÉPINGLE : GARDER UNE BOÎTE DE RÉGLAGES OUVERTE.
//
//   « On ne peut ouvrir qu'un plugin à la fois. »
//   « Dans les paramètres, dans le tiroir des plugins, tu mets une ligne qui
//     ouvre une modale et où pour l'épinglage. »
//
// Ce n'était pas un oubli : la boîte des réglages est UN SEUL élément de la
// page, rempli à neuf par chacun des quarante-deux outils qui s'en servent.
// Ouvrir le deuxième effaçait le premier, et rien ne le disait.
//
// L'ÉPINGLE NE CLONE RIEN. On détache la boîte VIVANTE — ses champs gardent
// donc leurs fonctions, leur aperçu et leur bouton « Créer », puisque ce sont
// les mêmes éléments — et l'on pose une boîte neuve derrière elle pour l'outil
// suivant. Le coût du rangement retombe sur la seule fenêtre qu'on a choisi de
// garder, et non sur celui qui n'a rien demandé.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('L\'épingle des boîtes de réglages');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1400, height: 900 } });
    await tableauVierge(page);

    const ouvrir = (nom) => page.evaluate((n) => {
        const bt = [...document.querySelectorAll('#plugins-grid .btn')]
            .find(x => (x.dataset.pluginKey || x.title || '') === n);
        if (bt) bt.click();
        return !!bt;
    }, nom);
    const boites = () => page.evaluate(() => [...document.querySelectorAll('[data-boite-reglages="1"]')]
        .filter(e => e.getClientRects().length)
        .map(e => {
            const b = e.getBoundingClientRect();
            return {
                id: e.id,
                titre: (e.querySelector('[id^="custom-prompt-title"]') || {}).innerText || '',
                epinglee: e.dataset.epinglee === '1',
                barre: !!e.querySelector('.fen-tete'),
                z: getComputedStyle(porteurDeLEtage(e)).zIndex,
                place: [Math.round(b.left), Math.round(b.top)]
            };
        }));
    const epingler = () => page.evaluate(() => {
        const e = document.getElementById('custom-prompt-epingler');
        if (!e) return false;
        e.click();
        return true;
    });

    // ------------------------------------------------------------------
    // 1. SANS ÉPINGLE, LA RÈGLE D'AVANT TIENT TOUJOURS.
    //
    //    Ouvrir un second outil remplace le premier. C'est voulu : garder
    //    tout ce qu'on ouvre encombrerait l'écran de celui qui n'a rien
    //    demandé.
    // ------------------------------------------------------------------
    await ouvrir('Fraction Visuelle');
    await page.waitForTimeout(800);
    const une = await boites();
    r.egal('un outil ouvre une boîte', une.length, 1, JSON.stringify(une));
    r.verifie('et c\'est la sienne', une[0] && une[0].titre.includes('Fraction'),
        JSON.stringify(une));

    await ouvrir('Matériel Base 10');
    await page.waitForTimeout(800);
    const remplacee = await boites();
    r.egal('sans épingle, le second outil remplace le premier', remplacee.length, 1,
        JSON.stringify(remplacee));
    r.verifie('et c\'est le second qu\'on voit',
        remplacee[0] && remplacee[0].titre.includes('Base 10'), JSON.stringify(remplacee));

    // ------------------------------------------------------------------
    // 2. ÉPINGLÉE, ELLE RESTE — ET DEVIENT UNE FENÊTRE ORDINAIRE.
    //
    //    Elle perd ses identifiants — c'est par eux que le prochain outil
    //    trouve la boîte à remplir —, cesse d'être une « question » au sens
    //    du système de fenêtres, et reçoit donc tout ce que reçoit une
    //    fenêtre : la barre commune, sa croix, sa place dans l'empilement.
    //    Rien de cela n'est écrit pour elle : il suffit qu'elle en ait la
    //    forme.
    // ------------------------------------------------------------------
    r.verifie('la boîte porte une épingle', await epingler(), 'bouton introuvable');
    await page.waitForTimeout(600);
    await ouvrir('Fraction Visuelle');
    await page.waitForTimeout(800);
    const deux = await boites();
    r.egal('épinglée, elle laisse la place à une seconde', deux.length, 2,
        JSON.stringify(deux));
    const laPinnee = deux.find(b => b.epinglee);
    const laVivante = deux.find(b => !b.epinglee);
    r.verifie('l\'épinglée garde son outil et son titre',
        !!laPinnee && laPinnee.titre.includes('Base 10'), JSON.stringify(deux));
    r.verifie('la vivante porte le nouveau',
        !!laVivante && laVivante.titre.includes('Fraction'), JSON.stringify(deux));
    r.verifie('l\'épinglée a reçu la barre commune des fenêtres',
        !!laPinnee && laPinnee.barre === true, JSON.stringify(deux));
    r.verifie('et elle a changé de nom : le prochain outil ne la remplira plus',
        !!laPinnee && laPinnee.id !== 'custom-prompt-modal', JSON.stringify(deux));

    // ------------------------------------------------------------------
    // 3. LA NEUVE NAÎT EN DÉCALÉ.
    //
    //    MESURÉ SUR LA PREMIÈRE VERSION : les deux boîtes se posaient au même
    //    endroit, au pixel près. L'outil suivant recouvrait entièrement celui
    //    qu'on venait d'épingler, et l'épingle ne servait donc à rien de ce
    //    qu'on lui demande.
    // ------------------------------------------------------------------
    r.verifie('la boîte neuve ne se pose pas sur l\'épinglée',
        !!laPinnee && !!laVivante
        && laVivante.place[0] > laPinnee.place[0]
        && laVivante.place[1] > laPinnee.place[1],
        JSON.stringify([laPinnee && laPinnee.place, laVivante && laVivante.place]));
    r.verifie('et elle laisse voir sa barre de titre, qui porte son nom',
        !!laPinnee && !!laVivante && (laVivante.place[1] - laPinnee.place[1]) >= 24,
        'décalage de ' + (laVivante && laPinnee ? laVivante.place[1] - laPinnee.place[1] : '?') + ' px');

    // ------------------------------------------------------------------
    // 4. DEUX ÉPINGLÉES S'EMPILENT COMME DEUX FENÊTRES.
    //
    //    « Quand on clique sur une fenêtre, elle devrait aller devant. »
    //    C'est le système commun qui s'en charge : une seule bande, et l'on
    //    renumérote au lieu d'empiler toujours plus haut.
    // ------------------------------------------------------------------
    await epingler();
    await page.waitForTimeout(600);
    const avant = await boites();
    const derriere = avant.slice().sort((a, b) => parseInt(a.z, 10) - parseInt(b.z, 10))[0];
    const pt = await page.evaluate((id) => {
        const f = document.getElementById(id);
        const b = f.getBoundingClientRect();
        for (let dy = 6; dy < b.height; dy += 8)
            for (const dx of [12, 40]) {
                const x = Math.round(b.left + dx), y = Math.round(b.top + dy);
                const e = document.elementFromPoint(x, y);
                if (e && f.contains(e) && !e.closest('button, input, select')) return [x, y];
            }
        return null;
    }, derriere.id);
    r.verifie('on peut viser la fenêtre de derrière', !!pt,
        'aucun point de « ' + derriere.id + ' » n\'est atteignable');
    if (pt) {
        await page.mouse.click(pt[0], pt[1]);
        await page.waitForTimeout(350);
    }
    const apres = await boites();
    const laMeme = apres.find(b => b.id === derriere.id);
    r.verifie('un clic sur celle de derrière la fait passer devant',
        !!laMeme && apres.every(b => parseInt(b.z, 10) <= parseInt(laMeme.z, 10)),
        JSON.stringify({ avant, apres }));

    // ------------------------------------------------------------------
    // 5. « CRÉER » SUR UNE ÉPINGLÉE POSE SON OBJET À ELLE.
    //
    //    LE PIÈGE EST ICI, et il a fallu le mesurer pour le voir : les
    //    quarante-deux outils arment leur mode AVANT d'ouvrir la boîte.
    //    Épinglée, elle survit à l'ouverture d'un autre outil, qui pose SON
    //    mode par-dessus. « Créer » fabriquait alors le tampon de la fraction
    //    pendant que le tableau attendait un matériel base 10 : le clic
    //    suivant ne posait rien du tout, ni l'un ni l'autre. Deux outils
    //    cassés pour un seul geste.
    // ------------------------------------------------------------------
    await page.evaluate(() => { images.length = 0; draw(); });
    const epinglees = (await boites()).filter(b => b.epinglee);
    const fraction = epinglees.find(b => b.titre.includes('Fraction'));
    r.verifie('une fraction est bien épinglée', !!fraction,
        JSON.stringify(epinglees.map(b => b.titre)));
    if (fraction) {
        await ouvrir('Matériel Base 10');          // un autre outil prend le mode
        await page.waitForTimeout(800);
        const modeAvant = await page.evaluate(() => mode);
        await page.evaluate((id) => {
            document.getElementById(id).querySelector('[id^="custom-prompt-ok"]').click();
        }, fraction.id);
        await page.waitForTimeout(700);
        const modeApres = await page.evaluate(() => mode);
        r.verifie('valider une épinglée réarme SON outil',
            modeAvant !== modeApres && modeApres === 'fraction',
            'mode « ' + modeAvant + ' » puis « ' + modeApres + ' »');
        await page.mouse.click(1050, 640);
        await page.waitForTimeout(800);
        const pose = await page.evaluate(() => images.map(i => (i.pluginData || {}).id));
        r.verifie('et le tampon posé est bien le sien',
            pose.length === 1 && pose[0] === 'fractionTool', JSON.stringify(pose));
        const toujoursLa = (await boites()).some(b => b.id === fraction.id);
        r.verifie('une épinglée reste ouverte après « Créer »', toujoursLa === true,
            JSON.stringify(await boites()));
    }

    // ------------------------------------------------------------------
    // 6. SA CROIX NE REFERME QUE LA SIENNE.
    // ------------------------------------------------------------------
    const avantCroix = await boites();
    const aFermer = avantCroix.find(b => b.epinglee);
    if (aFermer) {
        await page.evaluate((id) => {
            const f = document.getElementById(id);
            const x = f.querySelector('.fen-fermer, [id^="custom-prompt-fermer"]');
            if (x) x.click();
        }, aFermer.id);
        await page.waitForTimeout(500);
        const apresCroix = await boites();
        r.verifie('la croix d\'une épinglée la referme',
            !apresCroix.some(b => b.id === aFermer.id), JSON.stringify(apresCroix));
        r.egal('et les autres restent', apresCroix.length, avantCroix.length - 1,
            JSON.stringify({ avantCroix, apresCroix }));
    }

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
