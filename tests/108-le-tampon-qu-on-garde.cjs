// LE TAMPON QU'ON GARDE, ET CELUI QU'ON COMPTE.
//
// « Serait-il possible de conserver les tampons comme "Génial !" au lieu de
//  les faire disparaître ? »
//
// Elle parlait du « Tampon Extrême » et de son GÉNIE : on le pose sur le
// travail d'un élève, et deux secondes et demie plus tard l'écran est secoué,
// soixante éclats partent, et l'image est RETIRÉE du tableau. C'est tout
// l'intérêt de l'outil — mais elle s'en sert pour corriger, et ce qu'on appose
// sur la copie d'un élève doit rester sur la copie de l'élève.
//
// L'EXPLOSION RESTE LE DÉFAUT, et ce chapitre le fige. Un outil nommé
// « Extrême », rangé dans « Détente », ne devient pas sage parce qu'on lui
// ajoute un réglage : qui l'ouvre pour la première fois doit voir ce qu'il est
// venu chercher. La case se coche une fois et se retient.
//
// ET LE COMPTEUR : « VU » posé trente fois dans l'heure, c'est trente copies
// regardées. Le chiffre existait dans le geste, il n'était écrit nulle part.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le tampon qu\'on garde');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    const CLE = 'auTableau_tampon_extreme_v1';
    const ouvrir = () => page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        if (!p) return null;
        p.openWidget();
        const c = document.getElementById('es-conserver');
        return {
            fenetre: !!p.widgetEl,
            conserver: !!p.conserver,
            caseLa: !!c, caseCochee: c ? !!c.checked : null,
            total: ((document.getElementById('es-total') || {}).textContent || '').trim(),
            pastilles: document.querySelectorAll('.es-compte').length,
            raz: !!document.getElementById('es-raz'),
            tampons: Array.from(document.querySelectorAll('.es-btn'))
                .map(b => (b.childNodes[0] || {}).textContent || '')
        };
    });

    // Poser un tampon par le vrai chemin du plugin, celui que le tableau
    // appelle quand le doigt touche l'écran.
    const poser = (texte) => page.evaluate((texte) => {
        const p = PluginManager.plugins.extremeStampTool;
        if (!p) return null;
        p.activeStamp = p.stamps.find(s => s.text === texte) || p.stamps[0];
        mode = 'extremeStampTool';
        const avant = images.length;
        const pris = p.onPointerDown({ x: 400, y: 300 });
        return { pris: !!pris, avant, apres: images.length, compte: p.compteDe(texte) };
    }, texte);

    // ------------------------------------------------------------------
    // 1. LA FENÊTRE PORTE SES QUATRE TAMPONS, LA CASE ET LE COMPTEUR.
    // ------------------------------------------------------------------
    const neuve = await ouvrir();
    r.verifie('la fenêtre du tampon s\'ouvre', !!neuve, 'plugin introuvable');
    // LES QUATRE D'ORIGINE SONT TOUJOURS LÀ, ET EN TÊTE.
    //
    // La première version de ce contrôle figeait la liste ENTIÈRE à ces
    // quatre-là, et elle est tombée le jour où seize autres ont été ajoutés —
    // à juste titre : ce qu'on exige n'est pas qu'il y en ait quatre, c'est
    // qu'une enseignante qui cherche son GÉNIE ne doive pas le retrouver au
    // milieu d'une foule.
    r.egal('les quatre tampons d\'origine ouvrent toujours la liste',
        neuve ? neuve.tampons.slice(0, 4).map(t => t.trim()) : null,
        ['FAUX !', 'VU', 'GÉNIE', 'HÉRÉSIE'], JSON.stringify(neuve));
    r.verifie('et il y en a bien davantage — « rajoute bien plus de tampons »',
        !!neuve && neuve.tampons.length >= 20, String(neuve && neuve.tampons.length));
    // « GÉNIAL ! » EST LÀ PARCE QU'ELLE L'A ÉCRIT : elle demandait de garder
    // « les tampons comme "Génial !" » alors que celui du logiciel s'appelle
    // GÉNIE. Le mot qu'elle avait en tête n'existait pas.
    r.verifie('dont le « GÉNIAL ! » qu\'elle avait en tête',
        !!neuve && neuve.tampons.some(t => t.trim() === 'GÉNIAL !'),
        JSON.stringify(neuve && neuve.tampons));
    r.egal('la case « garder » est là, et décochée au premier jour',
        neuve ? [neuve.caseLa, neuve.caseCochee] : null, [true, false],
        JSON.stringify(neuve));
    r.egal('chaque tampon porte sa pastille de compte',
        neuve ? neuve.pastilles : null, neuve ? neuve.tampons.length : null,
        JSON.stringify(neuve));
    r.verifie('et le total dit qu\'on n\'a rien posé',
        !!neuve && /aucun/i.test(neuve.total), JSON.stringify(neuve));

    // ------------------------------------------------------------------
    // 2. PAR DÉFAUT, IL ÉCLATE ENCORE. C'est l'outil qu'on est venu chercher.
    // ------------------------------------------------------------------
    const parDefaut = await poser('GÉNIE');
    r.egal('le tampon se pose', parDefaut && [parDefaut.pris, parDefaut.apres - parDefaut.avant],
        [true, 1], JSON.stringify(parDefaut));
    await page.waitForTimeout(3200);
    const apresExplosion = await page.evaluate(() => images.length);
    r.egal('et deux secondes et demie plus tard, il a éclaté',
        apresExplosion, 0, String(apresExplosion));

    // ------------------------------------------------------------------
    // 3. LA CASE COCHÉE, IL RESTE — ET RIEN N'EXPLOSE.
    //
    //    Secouer l'écran puis laisser le tampon en place promettrait une
    //    explosion qui n'arrive pas. On vérifie donc les deux : l'image reste,
    //    ET aucun éclat n'est lancé.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        p.openWidget();
        const c = document.getElementById('es-conserver');
        c.checked = true;
        c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const coche = await page.evaluate(() => ({
        drapeau: !!PluginManager.plugins.extremeStampTool.conserver,
        ecrit: localStorage.getItem('auTableau_tampon_extreme_v1')
    }));
    r.egal('cocher la case arme le mode « on garde »', coche.drapeau, true,
        JSON.stringify(coche));
    r.verifie('et le choix est écrit, pour la séance suivante',
        /"conserver":true/.test(coche.ecrit || ''), String(coche.ecrit));

    const garde = await poser('GÉNIE');
    r.egal('le tampon se pose toujours', garde && garde.apres - garde.avant, 1,
        JSON.stringify(garde));
    await page.waitForTimeout(3200);
    const reste = await page.evaluate(() => ({
        images: images.length,
        eclats: PluginManager.plugins.extremeStampTool.particles.length
    }));
    r.egal('TROIS SECONDES PLUS TARD, IL EST TOUJOURS LÀ', reste.images, 1,
        JSON.stringify(reste));
    r.egal('et aucun éclat n\'a été lancé : rien ne promet une explosion',
        reste.eclats, 0, JSON.stringify(reste));

    // ------------------------------------------------------------------
    // 4. LE COMPTEUR COMPTE LES POSES, GARDÉES COMME ÉCLATÉES.
    //
    //    C'est le geste de l'enseignante qu'on dénombre, pas le sort du
    //    tampon : une copie regardée l'est, qu'on ait fait exploser le
    //    tableau ou non.
    // ------------------------------------------------------------------
    const apresDeux = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        p.openWidget();
        return { genie: p.compteDe('GÉNIE'), total: p.totalDesComptes(),
                 pastille: ((document.querySelector('.es-compte[data-idx="2"]') || {}).textContent || '').trim(),
                 mot: ((document.getElementById('es-total') || {}).textContent || '').trim() };
    });
    r.egal('deux poses, dont une éclatée : le compteur dit deux',
        apresDeux.genie, 2, JSON.stringify(apresDeux));
    r.egal('la pastille du tampon le montre', apresDeux.pastille, '2',
        JSON.stringify(apresDeux));
    r.verifie('et le total l\'écrit en toutes lettres',
        /2 tampons posés/.test(apresDeux.mot), apresDeux.mot);

    // Un autre tampon se compte à part : c'est le détail qui sert en classe.
    await poser('VU');
    const separes = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        return { vu: p.compteDe('VU'), genie: p.compteDe('GÉNIE'), total: p.totalDesComptes() };
    });
    r.egal('chaque tampon tient son propre compte',
        [separes.vu, separes.genie, separes.total], [1, 2, 3], JSON.stringify(separes));

    // ------------------------------------------------------------------
    // 5. LE COMPTE SURVIT AU RECHARGEMENT, ET LA REMISE À ZÉRO L'EFFACE.
    // ------------------------------------------------------------------
    const ecrit = await page.evaluate(() => localStorage.getItem('auTableau_tampon_extreme_v1'));
    r.verifie('les comptes sont écrits sur le disque',
        /"GÉNIE":2/.test(ecrit || '') && /"VU":1/.test(ecrit || ''), String(ecrit));

    const relu = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        // On oublie tout en mémoire, comme au chargement d'une page neuve.
        p.comptes = {}; p.conserver = false;
        p.lireLesReglages();
        return { genie: p.compteDe('GÉNIE'), conserver: !!p.conserver };
    });
    r.egal('et relus au démarrage, ils reviennent — la case aussi',
        [relu.genie, relu.conserver], [2, true], JSON.stringify(relu));

    const apresRaz = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        p.openWidget();
        document.getElementById('es-raz').click();
        return { total: p.totalDesComptes(),
                 mot: ((document.getElementById('es-total') || {}).textContent || '').trim(),
                 pastille: ((document.querySelector('.es-compte[data-idx="2"]') || {}).textContent || '').trim(),
                 conserver: !!p.conserver };
    });
    r.egal('la remise à zéro efface les comptes', apresRaz.total, 0, JSON.stringify(apresRaz));
    r.verifie('et le total le dit', /aucun/i.test(apresRaz.mot), apresRaz.mot);
    r.egal('la pastille se tait plutôt que d\'afficher un zéro',
        apresRaz.pastille, '', JSON.stringify(apresRaz));
    // ELLE N'EFFACE QUE LES COMPTES. Décocher la case au passage obligerait à
    // la recocher à chaque remise à zéro, pour un geste qui n'a rien à voir.
    r.egal('mais elle ne décoche pas la case', apresRaz.conserver, true,
        JSON.stringify(apresRaz));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
