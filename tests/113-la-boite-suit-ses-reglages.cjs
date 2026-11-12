// LA BOÎTE SUIT SES RÉGLAGES, ET L'APERÇU SUIT SON DESSIN.
//
//   « Tout me va en mode serrée. »
//   « Les couleurs qui débordent, c'est normal ? »
//   « Quand tu fais l'aperçu de stat, ce n'est pas vraiment logique que la
//     taille de l'aperçu soit plus haute que la somme des hauteurs des
//     input. »
//
// Trois reproches, une seule cause : la boîte commune était écrite une fois
// pour toutes. Deux colonnes quelle que soit la fenêtre, 322 px de large quel
// que soit l'outil — 17 % d'un écran de 1920 —, et un aperçu haut de 140 px
// quel que soit le dessin.
//
// Mesuré avant : l'axe mathématique et ses douze réglages descendaient sur
// six rangées dans une colonne de 322 px ; une rangée de couleurs demande
// 242 px — sept ronds de 26 et six écarts de 10 — et n'en avait que 150, donc
// elle débordait de sa case et son libellé était écrasé à zéro ; et l'axe,
// dessin de 400 × 48, flottait au milieu d'une boîte presque carrée.
//
// Désormais trois règles, et rien par outil : le nombre de colonnes suit le
// nombre de réglages, la largeur de la boîte suit les colonnes, la hauteur de
// l'aperçu suit la forme du dessin — bornée par la hauteur des réglages.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// Quatre outils choisis pour leur NOMBRE de réglages, pas pour leur sujet :
// un seul, deux, six, douze. C'est la règle qu'on mesure, pas ces outils-là.
const ATTENDU = [
    { nom: 'Météo du Jour', colonnes: 1 },
    { nom: 'Horloge Pédagogique', colonnes: 2 },
    { nom: 'Tableau de Numération', colonnes: 3 },
    { nom: 'Axe Mathématique', colonnes: 4 }
];
// Ceux-là servent à la mesure des débordements et des aperçus : on en veut un
// très large (l'axe, 400 × 48), un très haut (le thermomètre, 80 × 250) et
// plusieurs qui portent des rangées de couleurs.
const POUR_LE_RESTE = ['Axe Mathématique', 'Thermomètre', 'Repère Cartésien',
    'Symétrie', 'Grille Boggle', 'Tableau de Numération'];

module.exports = async function (browser) {
    const r = creerRapport('La boîte suit ses réglages');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    const ouvrir = (nom) => page.evaluate((n) => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === n);
        if (!b) return false;
        b.click();
        return true;
    }, nom);
    const refermer = () => page.evaluate(() => {
        const c = document.getElementById('custom-prompt-cancel');
        if (c) c.click();
    });

    const mesurer = () => page.evaluate(() => {
        const mo = document.getElementById('custom-prompt-modal');
        if (!mo || getComputedStyle(mo).display === 'none') return null;
        const champs = document.getElementById('custom-prompt-inputs');
        const apercu = document.getElementById('custom-prompt-preview');
        const rb = mo.getBoundingClientRect();
        const rc = champs.getBoundingClientRect();
        const ra = apercu.getBoundingClientRect();

        // CE QUI DÉBORDE DE SA CASE, ET CE QUI EST ÉCRASÉ À ZÉRO. Les deux
        // vont ensemble : une rangée trop large pour sa colonne pousse son
        // contenu dehors ET rogne son libellé.
        let debordent = 0;
        Array.from(champs.children).forEach(case_ => {
            const rw = case_.getBoundingClientRect();
            case_.querySelectorAll('*').forEach(e => {
                const re = e.getBoundingClientRect();
                if (re.width > 0 && re.right > rw.right + 1.5) debordent++;
            });
            // (le libellé d'une rangée de couleur est AU-DESSUS d'elle, pas à
            // côté : il ne peut pas être rogné par sa largeur. Un contrôle sur
            // sa largeur ne distinguerait donc jamais rien — on compte ce qui
            // sort de la case, et cela suffit.)
        });

        // La forme du dessin, telle qu'il la déclare lui-même.
        let rapport = null;
        const svg = apercu.querySelector('svg[viewBox]');
        if (svg) {
            const v = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
            if (v.length === 4 && v[2] > 0 && v[3] > 0) rapport = v[2] / v[3];
        } else {
            const img = apercu.querySelector('img');
            if (img && img.naturalWidth > 0) rapport = img.naturalWidth / img.naturalHeight;
        }
        return {
            boite: [Math.round(rb.width), Math.round(rb.height)],
            colonnes: getComputedStyle(champs).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
            hReglages: Math.round(rc.height),
            apercu: [Math.round(ra.width), Math.round(ra.height)],
            rapport, debordent
        };
    });

    // ------------------------------------------------------------------
    // 1. LE NOMBRE DE COLONNES SUIT LE NOMBRE DE RÉGLAGES.
    // ------------------------------------------------------------------
    const colonnesVues = [];
    for (const att of ATTENDU) {
        if (!(await ouvrir(att.nom))) { colonnesVues.push({ nom: att.nom, vu: 'introuvable' }); continue; }
        await page.waitForTimeout(500);
        const m = await mesurer();
        colonnesVues.push({ nom: att.nom, vu: m ? m.colonnes : 'pas de boîte',
                            largeur: m ? m.boite[0] : 0, attendu: att.colonnes });
        await refermer();
        await page.waitForTimeout(200);
    }
    const fautives = colonnesVues.filter(x => x.vu !== x.attendu);
    r.egal('le nombre de colonnes suit le nombre de réglages', fautives.length, 0,
        JSON.stringify(colonnesVues));

    // ET LA BOÎTE S'ÉLARGIT AVEC ELLES : une boîte qui gagne des colonnes sans
    // gagner de largeur n'a rien gagné du tout.
    const largeurs = colonnesVues.map(x => x.largeur);
    const croissantes = largeurs.every((l, i) => i === 0 || l > largeurs[i - 1]);
    r.verifie('la largeur de la boîte croît avec le nombre de colonnes',
        croissantes, JSON.stringify(largeurs));

    // ------------------------------------------------------------------
    // 2. RIEN NE DÉBORDE DE SA CASE, AUCUN LIBELLÉ N'EST ÉCRASÉ.
    // ------------------------------------------------------------------
    const releve = [];
    for (const nom of POUR_LE_RESTE) {
        if (!(await ouvrir(nom))) continue;
        await page.waitForTimeout(500);
        const m = await mesurer();
        if (m) releve.push({ nom, m });
        await refermer();
        await page.waitForTimeout(200);
    }
    r.egal('les six boîtes se sont bien ouvertes', releve.length, POUR_LE_RESTE.length,
        releve.map(x => x.nom).join(', '));
    const quiDeborde = releve.filter(x => x.m.debordent > 0).map(x => x.nom + ':' + x.m.debordent);
    r.egal('rien ne déborde de sa case', quiDeborde.length, 0, quiDeborde.join(', '));

    // ------------------------------------------------------------------
    // 3. L'APERÇU PREND LA FORME DE CE QU'IL DESSINE.
    //
    //    Un dessin large se dessine large. On compare à ce que la forme
    //    commande, et non à un nombre écrit ici : c'est la règle qu'on
    //    mesure. Et l'on nomme les 140 px d'autrefois, pour que le contrôle
    //    tombe si la hauteur y revenait.
    // ------------------------------------------------------------------
    const large = releve.find(x => x.nom === 'Axe Mathématique');
    if (large && large.m.rapport) {
        const voulue = large.m.apercu[0] / large.m.rapport;
        const ecart = Math.abs(large.m.apercu[1] - voulue);
        r.verifie('l\'aperçu large prend la hauteur que sa forme commande',
            ecart <= 10,
            `dessin ${large.m.rapport.toFixed(2)}:1, aperçu ${large.m.apercu.join('×')}, `
            + `attendu ~${Math.round(voulue)} px`);
        r.verifie('et il n\'est plus haut de 140 px comme avant',
            Math.abs(large.m.apercu[1] - 140) > 20, String(large.m.apercu[1]));
    } else {
        r.verifie('l\'axe donne la forme de son dessin', false, JSON.stringify(large && large.m));
    }

    // UN DESSIN PLUS HAUT QUE LARGE NE S'ÉTIRE PAS SANS FIN : le thermomètre,
    // au rapport 0,32, demanderait 900 px de haut. La borne est la hauteur
    // des réglages — c'est la règle demandée, mot pour mot.
    const haut = releve.find(x => x.nom === 'Thermomètre');
    if (haut) {
        r.verifie('l\'aperçu ne dépasse pas la hauteur des réglages',
            haut.m.apercu[1] <= Math.max(118, haut.m.hReglages + 8),
            `aperçu ${haut.m.apercu[1]} px, réglages ${haut.m.hReglages} px`);
    } else {
        r.verifie('le thermomètre s\'ouvre', false, '');
    }

    // ------------------------------------------------------------------
    // 4. ET TOUT CELA TIENT SUR UN VIDÉOPROJECTEUR DE CLASSE.
    //
    //    Une boîte plus large n'a de sens que si elle tient encore sur
    //    1024 × 600 — avec son aperçu et son bouton sous les yeux, car ce
    //    sont les réglages qui défilent, et eux seuls.
    // ------------------------------------------------------------------
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.waitForTimeout(300);
    const petits = [];
    for (const nom of ['Axe Mathématique', 'Repère Cartésien', 'Tableau de Numération']) {
        if (!(await ouvrir(nom))) continue;
        await page.waitForTimeout(500);
        petits.push(await page.evaluate((n) => {
            const mo = document.getElementById('custom-prompt-modal');
            const rb = mo.getBoundingClientRect();
            const ra = document.getElementById('custom-prompt-preview').getBoundingClientRect();
            const ro = document.getElementById('custom-prompt-ok').getBoundingClientRect();
            const dedans = (r) => r.top >= -1 && r.bottom <= window.innerHeight + 1
                && r.left >= -1 && r.right <= window.innerWidth + 1;
            return { nom: n, boite: dedans(rb), apercu: dedans(ra), bouton: dedans(ro),
                     taille: [Math.round(rb.width), Math.round(rb.height)] };
        }, nom));
        await refermer();
        await page.waitForTimeout(200);
    }
    const dehors = petits.filter(x => !x.boite || !x.apercu || !x.bouton);
    r.egal('sur 1024 × 600, boîte, aperçu et bouton restent dans l\'écran',
        dehors.length, 0, JSON.stringify(petits));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
