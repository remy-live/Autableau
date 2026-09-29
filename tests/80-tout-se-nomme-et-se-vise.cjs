// TOUT SE NOMME, ET TOUT SE VISE
//
// Deux défauts trouvés en mesurant l'écran, pas en le regardant.
//
// 1. SOIXANTE-SEIZE BOUTONS SUR CENT UN N'AVAIENT AUCUN NOM. Ils en portent
//    pourtant un — « Page précédente », « Découper » —, écrit dans
//    « data-tooltip » parce que l'infobulle maison marche au doigt, ce que
//    « title » ne fait pas. Mais une technologie d'assistance ne lit pas cet
//    attribut-là : elle annonçait « bouton », et rien d'autre, pour les trois
//    quarts de l'interface. Le nom est désormais recopié dans « aria-label ».
//
// 2. TROIS COMMANDES PASSAIENT SOUS LE PLANCHER DU DOIGT : la pastille d'état
//    (19 × 19), le champ du titre (98 × 23), la poignée du tiroir (48 × 16).
//    Aucune n'avait autour d'elle la place qui aurait pu l'excuser — leur plus
//    proche voisin est à 4 px, 4 px et 0 px. Sur un tableau tactile de classe,
//    on vise cela avec un doigt.
//
// CE QUI REND CES DEUX CONTRÔLES UTILES, c'est qu'ils ne nomment rien : ils
// comptent. Un bouton ajouté demain sans nom, une cible rétrécie demain sous
// vingt-quatre pixels, et le compte cesse d'être zéro. C'est le seul genre de
// contrôle qui survive à ce qu'on n'a pas prévu.
const { creerRapport, ouvrirApp, fichePdf } = require('./harness.cjs');

// Le nom qu'une technologie d'assistance annonce : aria-label, puis title,
// puis le texte RENDU — un libellé masqué par la feuille de style ne
// s'annonce pas davantage qu'il ne se voit.
const SONDE = () => {
    const vu = (e) => {
        const q = e.getBoundingClientRect(), s = getComputedStyle(e);
        return q.width > 4 && q.height > 4 && s.visibility !== 'hidden'
            && s.display !== 'none' && +s.opacity > 0.05
            && q.right > 0 && q.left < innerWidth && q.bottom > 0 && q.top < innerHeight;
    };
    const mot = (t) => /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test((t || '').trim());
    const boutons = [...document.querySelectorAll('button, [role="button"]')].filter(vu);
    const nom = (e) => e.getAttribute('aria-label') || e.title
        || (mot(e.innerText) ? e.innerText.trim() : '');

    const cibles = [...document.querySelectorAll('button, [role="button"], input, select, a[href]')].filter(vu);
    const ecart = (a, b) => {
        const x = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
        const y = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
        return Math.hypot(x, y);
    };
    const petites = cibles.filter(e => {
        const q = e.getBoundingClientRect();
        return Math.min(q.width, q.height) < 24;
    }).map(e => {
        const q = e.getBoundingClientRect();
        let proche = Infinity;
        cibles.forEach(o => { if (o !== e) proche = Math.min(proche, ecart(q, o.getBoundingClientRect())); });
        return { id: e.id || '(' + (e.className || '').toString().split(' ')[0] + ')',
                 taille: Math.round(q.width) + '×' + Math.round(q.height),
                 voisin: Math.round(proche) };
    });
    return {
        combien: boutons.length,
        muets: boutons.filter(e => !nom(e)).map(e => e.id || '(sans id)'),
        // Une cible sous 24 px est tolérable si rien ne la serre : c'est
        // l'échappatoire d'espacement. Aucune des nôtres n'en profitait.
        tropPetites: petites.filter(p => p.voisin < 24)
    };
};

module.exports = async function (browser) {
    const r = creerRapport('Tout se nomme, et tout se vise');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1440, height: 900 } });
    await page.waitForFunction(() => typeof nommerLesBoutons === 'function', { timeout: 20000 });
    await page.waitForTimeout(400);

    // ------------------------------------------------------------------
    // 1. SUR LE TABLEAU NU
    // ------------------------------------------------------------------
    const nu = await page.evaluate(SONDE);
    r.verifie('il y a bien des boutons à mesurer', nu.combien > 40, String(nu.combien));
    r.egal('AUCUN BOUTON VISIBLE N\'EST SANS NOM', nu.muets, []);
    r.egal('aucune cible n\'est à la fois trop petite et serrée', nu.tropPetites, []);

    // ------------------------------------------------------------------
    // 2. ET AVEC UN DOCUMENT EN MAIN, où trois barres de plus paraissent
    // ------------------------------------------------------------------
    const octets = Array.from(fichePdf(3));
    await page.evaluate(async ({ octets }) => {
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'fiche.pdf', { type: 'application/pdf' }));
        await new Promise(ok => setTimeout(ok, 1500));
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); draw();
    }, { octets });
    await page.waitForTimeout(900);
    const avecDoc = await page.evaluate(SONDE);
    r.verifie('le document fait paraître d\'autres boutons',
        avecDoc.combien > nu.combien, nu.combien + ' → ' + avecDoc.combien);
    r.egal('eux non plus ne sont pas sans nom', avecDoc.muets, []);
    r.egal('et aucune de leurs cibles n\'est trop petite', avecDoc.tropPetites, []);

    // ------------------------------------------------------------------
    // 3. LE NOM EST LA TÊTE DE L'INFOBULLE, PAS LA PHRASE ENTIÈRE
    //
    // « Découper : tracez un rectangle dessus, le morceau part dans le tiroir
    // en bas. Les ciseaux restent pris — Échap les repose » est une phrase
    // d'aide. L'entendre à chaque passage serait pire que de n'entendre rien.
    // ------------------------------------------------------------------
    const noms = await page.evaluate(() => {
        const n = (id) => {
            const e = document.getElementById(id);
            return e ? (e.getAttribute('aria-label') || e.title || '') : '(absent)';
        };
        return { decouper: n('doc-decouper'), precedente: n('doc-prec'),
                 dupliquer: n('btn-quick-duplicate'),
                 tete: typeof teteDuNom === 'function'
                     ? teteDuNom('Découper : tracez un rectangle dessus. Échap les repose') : null };
    });
    r.egal('la tête d\'une phrase d\'aide en fait un nom', noms.tete, 'Découper');
    r.egal('les ciseaux s\'appellent « Découper »', noms.decouper, 'Découper');
    r.egal('la flèche s\'appelle « Page précédente »', noms.precedente, 'Page précédente');
    // ET LA TOUCHE N'EST PAS LE NOM : « Dupliquer (Ctrl+D) » n'est pas un nom.
    r.egal('et la touche ne s\'invite pas dans le nom', noms.dupliquer, 'Dupliquer');

    // ------------------------------------------------------------------
    // 4. UN BOUTON QUI MONTRE UN MOT GARDE SON MOT
    //
    // Lui coller un aria-label REMPLACERAIT ce qu'on lit à l'écran au lieu de
    // s'y ajouter : on entendrait autre chose que ce qui est écrit.
    // ------------------------------------------------------------------
    const garde = await page.evaluate(async () => {
        const boite = document.createElement('div');
        boite.style.cssText = 'position:fixed;left:10px;top:200px;z-index:99999';
        boite.innerHTML =
            '<button id="essai-avec-mot" data-tooltip="Aide longue : et sa suite">Enregistrer</button>'
            + '<button id="essai-sans-mot" data-tooltip="Aide longue : et sa suite">◀</button>'
            + '<button id="essai-deja-nomme" aria-label="Son vrai nom" data-tooltip="Autre chose"></button>';
        document.body.appendChild(boite);
        // Le guetteur travaille au prochain tour de boucle.
        await new Promise(ok => setTimeout(ok, 60));
        const lu = (id) => document.getElementById(id).getAttribute('aria-label');
        const sortie = { avecMot: lu('essai-avec-mot'), sansMot: lu('essai-sans-mot'),
                         dejaNomme: lu('essai-deja-nomme') };
        boite.remove();
        return sortie;
    });
    r.egal('un bouton qui montre un mot n\'est pas renommé', garde.avecMot, null);
    // UN BOUTON POSÉ APRÈS COUP EST NOMMÉ LUI AUSSI : c'est tout l'intérêt de
    // récolter dans la page au lieu de tenir une liste d'endroits à visiter.
    r.egal('un bouton qui ne montre qu\'un signe reçoit son nom', garde.sansMot, 'Aide longue');
    r.egal('et un nom déjà posé n\'est jamais écrasé', garde.dejaNomme, 'Son vrai nom');

    // ------------------------------------------------------------------
    // 5. « ◀ » N'EST PAS UN MOT
    //
    // Le premier jet regardait « le bouton a-t-il du texte », et une flèche en
    // est. Il regarde maintenant s'il y a une lettre ou un chiffre.
    // ------------------------------------------------------------------
    const signes = await page.evaluate(async () => {
        const b = document.createElement('button');
        b.id = 'essai-signe';
        b.setAttribute('data-tooltip', 'Page suivante');
        b.textContent = '▶';
        document.body.appendChild(b);
        await new Promise(ok => setTimeout(ok, 60));
        const a = b.getAttribute('aria-label');
        b.remove();
        return a;
    });
    r.egal('une flèche seule ne nomme pas son bouton', signes, 'Page suivante');

    // ------------------------------------------------------------------
    // 6. ON NOMME UNE FOIS PAR IMAGE, ET NON À CHAQUE REMUEMENT
    //
    // Savoir si un bouton MONTRE un mot demande de lire son texte rendu et de
    // regarder s'il est à l'écran : le navigateur n'y répond qu'en recalculant
    // la mise en page. Fait au fil des mutations, cela force un recalcul à
    // chaque remuement — et une barre qui se refait en pose des dizaines
    // d'affilée. Mesuré : le chapitre « Tout voir » passait six fois sur six,
    // et s'est mis à tomber une fois sur six, le temps s'étant déplacé juste
    // assez pour qu'un morceau arrive après le cadrage qui devait le contenir.
    //
    // Le report ne se voit pas à l'œil : ce contrôle est le seul endroit qui
    // l'exige. Sans lui, rien n'empêcherait de renommer au fil de l'eau et de
    // rendre ce temps-là à l'insu de tous.
    const report = await page.evaluate(async () => {
        const b = document.createElement('button');
        b.setAttribute('data-tooltip', 'Encore un bouton');
        document.body.appendChild(b);
        // APRÈS LE TOUR DE MICROTÂCHES, et non dans la foulée : le guetteur ne
        // s'éveille qu'à ce moment-là, si bien que lire aussitôt ne mesurait
        // rien du tout — la version qui renomme au fil de l'eau passait le
        // contrôle sans broncher.
        await Promise.resolve(); await Promise.resolve();
        const tout_de_suite = b.getAttribute('aria-label');
        await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
        const apres = b.getAttribute('aria-label');
        b.remove();
        return { tout_de_suite, apres };
    });
    r.egal('un bouton neuf n\'est pas nommé dans la foulée', report.tout_de_suite, null);
    r.egal('mais il l\'est au rendu suivant', report.apres, 'Encore un bouton');

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
