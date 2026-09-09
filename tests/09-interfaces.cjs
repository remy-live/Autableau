// Interfaces fournies : des configurations prêtes à l'emploi, par niveau et
// par usage, pour ne pas mettre 83 outils devant un collègue qui débute.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const ATTENDUES = [
    'Maternelle — grande section',
    'CP – CE1 (cycle 2)',
    'CE2 – CM2 (cycle 3)',
    'Collège',
    'Lycée',
    'Minimale — écrire et dessiner',
    'Conduite de classe',
    'Complète — tout sous la main'
];

// Charger une interface redémarre l'application. Attendre « 2,5 s » ne suffit
// pas : si la machine est chargée, on lisait encore l'ANCIENNE page, avec sa
// barre complète. On marque donc le document, et on attend qu'il ait disparu.
async function chargerInterface(page, id) {
    await page.evaluate((x) => { window.__avantRedemarrage = true; loadInterface(x); }, id);
    await page.waitForFunction(() => !window.__avantRedemarrage, { timeout: 20000 });
    await page.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    // Le démarrage réécrit les barres (migration, remise en place). Attendre
    // qu'elles « ne bougent plus » ne suffit pas : sur une machine lente, les
    // barres de l'interface PRÉCÉDENTE tiennent en place assez longtemps pour
    // paraître stables, et l'on mesurait alors l'état d'avant — 22 outils là
    // où l'interface demandée en a 5. On attend donc l'état ATTENDU, c'est-à-
    // dire les barres du modèle que l'on vient de charger.
    await page.waitForFunction((x) => {
        const modele = savedInterfaces.find(i => i.id === x);
        const voulues = (modele && modele.data && modele.data.toolbars) || [];
        const barres = getStoredFloatingToolbars();
        if (barres.length !== voulues.length) return false;
        const memes = voulues.every((b, k) => barres[k] && barres[k].id === b.id
            && (barres[k].items || []).length === (b.items || []).length);
        if (!memes) return false;
        // ... et qu'elles soient vraiment dessinées, s'il y en a
        return !voulues.length || document.querySelectorAll('#custom-bars-container > *').length > 0;
    }, id, { timeout: 20000, polling: 200 });
}

module.exports = async function (browser) {
    const r = creerRapport('Interfaces');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof savedInterfaces !== 'undefined' && savedInterfaces.length > 0, { timeout: 20000 });

    const liste = await page.evaluate(() => savedInterfaces.filter(i => !i.deleted).map(i => i.name));
    ATTENDUES.forEach(nom => r.verifie(`interface « ${nom} » présente`, liste.includes(nom), liste.join(', ')));

    // Chaque outil cité doit correspondre à un bouton réel : un libellé mal
    // orthographié donnerait une barre avec un trou.
    const introuvables = await page.evaluate(() => {
        const manquants = [];
        savedInterfaces.forEach(i => {
            (i.data.toolbars || []).forEach(t => (t.items || []).forEach(item => {
                if (!getPluginSourceButton(item)) manquants.push(`${i.name} → ${item}`);
            }));
            (i.data.favorites || []).forEach(f => {
                if (!getPluginSourceButton(f)) manquants.push(`${i.name} (favori) → ${f}`);
            });
        });
        return manquants;
    });
    r.verifie('tous les outils cités existent', introuvables.length === 0, introuvables.slice(0, 5).join(' | '));

    // La barre principale garde l'identifiant système, sinon l'application la
    // reconstruit complète au démarrage suivant et le tri n'aurait servi à rien.
    const barrePrincipale = await page.evaluate(() =>
        savedInterfaces.every(i => (i.data.toolbars || []).some(t => t.id === 'system-toolbar-main')));
    r.verifie('chaque interface porte la barre principale du système', barrePrincipale);

    // Les barres ne doivent pas se recouvrir
    const chevauchements = await page.evaluate(() => {
        const mauvais = [];
        savedInterfaces.forEach(i => {
            const bs = i.data.toolbars || [];
            for (let a = 0; a < bs.length; a++) {
                for (let c = a + 1; c < bs.length; c++) {
                    if (Math.abs(bs[a].x - bs[c].x) < 100 && Math.abs(bs[a].y - bs[c].y) < 100) {
                        mauvais.push(`${i.name} : ${bs[a].id} et ${bs[c].id}`);
                    }
                }
            }
        });
        return mauvais;
    });
    r.verifie('les barres ne se posent pas l\'une sur l\'autre', chevauchements.length === 0, chevauchements.join(' | '));

    // Chargement d'une interface : le tableau redémarre avec la bonne panoplie
    await chargerInterface(page, 'iface_fournie_minimale');

    const minimale = await page.evaluate(() => {
        const barres = getStoredFloatingToolbars();
        const rendues = Array.from(document.querySelectorAll('#custom-bars-container > *'));
        return {
            nbBarres: barres.length,
            outils: barres[0] ? barres[0].items.length : 0,
            idPrincipale: barres[0] ? barres[0].id : null,
            rendues: rendues.length,
            favoris: JSON.parse(localStorage.getItem('board_favorites') || '[]').length,
            // Si le compte est faux, il faut savoir tout de suite si c'est
            // l'interface qui est mauvaise ou son chargement qui a été écrasé.
            modele: (() => {
                const i = savedInterfaces.find(x => x.id === 'iface_fournie_minimale');
                const b = i && i.data.toolbars && i.data.toolbars[0];
                return b ? b.id + ':' + b.items.length : 'introuvable';
            })()
        };
    });
    r.egal('« Minimale » ne pose qu\'une barre', minimale.nbBarres, 1);
    r.verifie('« Minimale » : cinq outils seulement', minimale.outils === 5, JSON.stringify(minimale));
    r.egal('la barre principale n\'est pas reconstruite', minimale.idPrincipale, 'system-toolbar-main');
    r.egal('« Minimale » : aucun favori imposé', minimale.favoris, 0);
    r.verifie('la barre est bien affichée', minimale.rendues >= 1, `${minimale.rendues} barre(s) rendue(s)`);

    // Une interface de niveau pose ses deux barres, garnies
    await chargerInterface(page, 'iface_fournie_college');
    await page.waitForTimeout(600);

    const college = await page.evaluate(() => {
        const rendues = Array.from(document.querySelectorAll('#custom-bars-container > *')).map(bar => {
            const b = bar.getBoundingClientRect();
            return { boutons: bar.querySelectorAll('.btn').length, x: b.x, y: b.y, w: b.width, h: b.height };
        });
        let seChevauchent = false;
        for (let i = 0; i < rendues.length; i++) {
            for (let j = i + 1; j < rendues.length; j++) {
                const a = rendues[i], c = rendues[j];
                if (!(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y)) seChevauchent = true;
            }
        }
        return { barres: rendues.length, boutons: rendues.map(b => b.boutons), seChevauchent,
                 favoris: JSON.parse(localStorage.getItem('board_favorites') || '[]').length };
    });
    r.egal('« Collège » pose deux barres', college.barres, 2);
    r.verifie('les deux barres sont garnies', college.boutons.every(n => n > 4), JSON.stringify(college.boutons));
    r.verifie('à l\'écran non plus, les barres ne se recouvrent pas', !college.seChevauchent);
    r.egal('« Collège » met ses outils en favoris', college.favoris, 9);

    // Supprimées puis remises
    const cycle = await page.evaluate(() => {
        switchDrawerTab('interfaces');       // le tiroir ne redessine que l'onglet actif
        savedInterfaces.forEach(i => { if (String(i.id).startsWith('iface_fournie_')) i.deleted = true; });
        localStorage.setItem('auTableau_interfaces_list', JSON.stringify(savedInterfaces));
        renderExplorerLists();
        const messageVide = document.getElementById('interfaces-container').innerText.trim();
        restaurerInterfacesFournies();
        return { messageVide, apres: savedInterfaces.filter(i => !i.deleted).length };
    });
    r.verifie('une fois supprimées, le tiroir propose de les remettre',
        /Remettre les interfaces fournies/.test(cycle.messageVide), cycle.messageVide);
    r.egal('elles reviennent toutes', cycle.apres, ATTENDUES.length);

    // =====================================================================
    // LA BARRE DU DOCUMENT : DES ICÔNES, ET RIEN QUE DES ICÔNES
    // Sept boutons portaient leur mot et la barre traversait l'écran — au
    // point qu'on a cru qu'il fallait la mettre debout. Le mot vit maintenant
    // dans l'infobulle : elle dit la même chose, et plus longuement, sans
    // rien coûter tant qu'on ne la demande pas.
    // =====================================================================
    const barreDoc = await page.evaluate(() => {
        const barre = document.getElementById('bar-document');
        const boutons = Array.from(barre.querySelectorAll('.doc-btn'));
        // UNE ICÔNE MUETTE EST UN RÉBUS. Puisqu'il n'y a plus de mot écrit,
        // chaque bouton DOIT porter de quoi se nommer.
        const muets = boutons.filter(b => !b.getAttribute('data-tooltip') && !b.getAttribute('title'))
            .map(b => b.id || b.className);
        // Et aucun ne doit être vide : une icône, ou au moins un caractère.
        const vides = boutons.filter(b => !b.querySelector('svg') && !b.textContent.trim())
            .map(b => b.id || b.className);
        // Plus un seul mot écrit dans la barre.
        const mots = boutons.filter(b => {
            const m = b.querySelector('span');
            return m && getComputedStyle(m).display !== 'none';
        }).map(b => b.id || (b.textContent || '').trim().slice(0, 20));
        return { combien: boutons.length, muets, vides, mots };
    });
    r.verifie('la barre du document a bien ses boutons', barreDoc.combien > 10, String(barreDoc.combien));
    r.egal('aucun mot écrit : il ne reste que les icônes', barreDoc.mots, []);
    r.egal('et pas une seule icône muette : chacune porte son infobulle',
        barreDoc.muets, []);
    r.egal('ni un seul bouton vide', barreDoc.vides, []);

    // =====================================================================
    // L'ENCOMBREMENT, EN DEUX OPTIONS
    // Ouvrir un polycopié empilait six surfaces autour de lui. On ne tranche
    // pas à la place du professeur : on lui donne les leviers, et rien ne
    // bouge tant qu'il ne les a pas demandés.
    // =====================================================================

    // D'ABORD L'ORDRE. La barre de gauche n'est pas « bar-tools » — celle-là
    // est masquée depuis longtemps par la feuille de style — mais une BARRE
    // FLOTTANTE, dont le contenu est retenu chez l'utilisateur. La gomme et le
    // pointeur laser sont des gestes du quotidien : ils passent sous le texte
    // et le post-it, dans le gabarit ET dans la barre déjà rangée.
    const ordre = await page.evaluate(() => {
        const gabarit = Array.from(
            document.querySelectorAll('#bar-tools .btn[data-mode]')).map(b => b.dataset.mode);
        // UNE INSTALLATION NEUVE : sans barre principale rangée, l'application
        // la refabrique d'après le gabarit. C'est ce chemin-là qu'on éprouve.
        saveStoredFloatingToolbars(getStoredFloatingToolbars().filter(t => t.id !== 'system-toolbar-main'));
        renderFloatingToolbars();
        const pool = document.querySelector('#system-toolbar-main .cwrap');
        const posee = Array.from(pool.children).map(b => b.dataset.dragSourceToolId);
        return { gabarit, posee };
    });
    r.egal('dans le gabarit, la gomme et le laser suivent le post-it',
        ordre.gabarit.slice(ordre.gabarit.indexOf('text'), ordre.gabarit.indexOf('text') + 4),
        ['text', 'postit', 'eraser', 'laser']);
    r.egal('et dans la barre posée sur le tableau, de même',
        ordre.posee.slice(ordre.posee.indexOf('text'), ordre.posee.indexOf('text') + 4),
        ['text', 'postit', 'eraser', 'laser']);

    // UNE BARRE DÉJÀ RANGÉE AUTREMENT est remontée une fois, et une seule :
    // ranger sa barre reste l'affaire du professeur.
    const remontee = await page.evaluate(() => {
        const ancien = ['btn-undo', 'pointer', 'freehand', 'text', 'postit',
                        'point', 'segment', 'circle', 'laser', 'eraser', 'ruler'];
        const barres = getStoredFloatingToolbars().map(tb =>
            tb.id === 'system-toolbar-main' ? { ...tb, items: ancien.slice() } : tb);
        saveStoredFloatingToolbars(barres);
        localStorage.removeItem('auTableau_ordre_quotidien_v1');
        const bougee = remonterLesGestesDuQuotidien();
        const apres = getStoredFloatingToolbars().find(t => t.id === 'system-toolbar-main').items;

        // Une seconde fois ne bouge plus rien, même si l'on rerange à la main.
        const rerange = getStoredFloatingToolbars().map(tb =>
            tb.id === 'system-toolbar-main' ? { ...tb, items: ancien.slice() } : tb);
        saveStoredFloatingToolbars(rerange);
        const encore = remonterLesGestesDuQuotidien();
        const final = getStoredFloatingToolbars().find(t => t.id === 'system-toolbar-main').items;
        return { bougee, apres, encore, final, ancien };
    });
    r.egal('une barre rangée à l\'ancienne voit ses deux gestes remonter',
        remontee.apres,
        ['btn-undo', 'pointer', 'freehand', 'text', 'postit', 'eraser', 'laser',
         'point', 'segment', 'circle', 'ruler']);
    r.egal('et rien n\'est perdu : les mêmes outils, dans le même ordre pour le reste',
        remontee.apres.slice().sort(), remontee.ancien.slice().sort());
    r.egal('on ne repasse pas derrière le professeur une seconde fois',
        { encore: remontee.encore, intact: remontee.final.join() === remontee.ancien.join() },
        { encore: false, intact: true });

    // L'OPTION « BARRE RÉDUITE », sur la vraie barre.
    const courte = await page.evaluate(() => {
        // Une barre connue : le bloc précédent l'a rangée autrement pour
        // éprouver la remontée, et l'on mesure ici une coupure, pas un héritage.
        const items = ['btn-undo', 'btn-redo', 'pointer', 'move', 'freehand', 'highlighter',
                       'text', 'postit', 'eraser', 'laser',
                       'point', 'segment', 'circle', 'ruler', 'compass'];
        saveStoredFloatingToolbars(getStoredFloatingToolbars().map(tb =>
            tb.id === 'system-toolbar-main' ? { ...tb, items: items.slice() } : tb));
        renderFloatingToolbars();
        const barre = document.getElementById('system-toolbar-main');
        const pool = barre.querySelector('.cwrap');
        const vus = () => Array.from(pool.children)
            .filter(b => b.getClientRects().length > 0)
            .map(b => b.dataset.dragSourceToolId);
        basculerLaBarreCourte(false);
        const avant = { n: vus().length, h: Math.round(barre.getBoundingClientRect().height) };

        basculerLaBarreCourte(true);
        const reduite = { n: vus().length, restants: vus(),
                          h: Math.round(barre.getBoundingClientRect().height),
                          retenu: localStorage.getItem('auTableau_barre_courte'),
                          allume: document.getElementById('rp-barre-courte').classList.contains('actif') };

        // LA POIGNÉE DU COIN : on tire, tout revient, et l'option s'éteint.
        const coin = barre.querySelector('.custom-resizer');
        const rc = coin.getBoundingClientRect();
        coin.dispatchEvent(new PointerEvent('pointerdown', {
            pointerId: 11, pointerType: 'mouse', isPrimary: true,
            clientX: rc.left + 4, clientY: rc.top + 4, bubbles: true, cancelable: true }));
        const rendue = { n: vus().length, h: Math.round(barre.getBoundingClientRect().height),
                         eteinte: localStorage.getItem('auTableau_barre_courte') === 'false',
                         allume: document.getElementById('rp-barre-courte').classList.contains('actif') };
        return { avant, reduite, rendue };
    });
    r.verifie('sans l\'option, toute la barre est là',
        courte.avant.n === 15, JSON.stringify(courte.avant));
    r.egal('réduite, il ne reste que les gestes du quotidien, gomme et laser compris',
        courte.reduite.restants,
        ['btn-undo', 'btn-redo', 'pointer', 'move', 'freehand', 'highlighter',
         'text', 'postit', 'eraser', 'laser']);
    r.verifie('et la barre raccourcit pour de bon',
        courte.reduite.h < courte.avant.h * 0.75, JSON.stringify(courte));
    r.egal('le réglage est allumé et retenu',
        { retenu: courte.reduite.retenu, allume: courte.reduite.allume },
        { retenu: 'true', allume: true });
    r.egal('tirer le coin ramène tout ET ÉTEINT l\'option',
        { n: courte.rendue.n, hauteur: courte.rendue.h === courte.avant.h,
          eteinte: courte.rendue.eteinte, allume: courte.rendue.allume },
        { n: courte.avant.n, hauteur: true, eteinte: true, allume: false });

    // L'OPTION « TIROIRS REFERMÉS TOUT SEULS ».
    const tiroirs = await page.evaluate(() => {
        const ouvrir = () => {
            const haut = document.getElementById('bar-plugins');
            const bas = document.getElementById('bottom-drawer');
            if (haut.classList.contains('closed')) togglePluginDrawer();
            if (bas.classList.contains('closed')) toggleBottomDrawer();
            return { haut: !haut.classList.contains('closed'), bas: !bas.classList.contains('closed') };
        };
        const etat = () => ({
            haut: !document.getElementById('bar-plugins').classList.contains('closed'),
            bas: !document.getElementById('bottom-drawer').classList.contains('closed')
        });
        const c = document.getElementById('board');
        const toucherLeTableau = () => c.dispatchEvent(new PointerEvent('pointerdown', {
            pointerId: 9, pointerType: 'mouse', isPrimary: true,
            clientX: 400, clientY: 300, bubbles: true, cancelable: true }));

        // SANS L'OPTION, RIEN NE BOUGE : c'est la moitié qui compte.
        basculerLesTiroirsAuto(false);
        ouvrir();
        toucherLeTableau();
        const sansOption = etat();

        const actif = basculerLesTiroirsAuto(true);
        const ouverts = ouvrir();
        toucherLeTableau();
        const apres = etat();
        // Le chevron doit dire la même chose que le tiroir.
        const chevron = {
            haut: document.getElementById('plugin-chev').innerHTML.includes('6 9 12 15 18 9'),
            bas: document.getElementById('bot-chev').innerHTML.includes('18 15 12 9 6 15')
        };
        return { sansOption, actif, ouverts, apres, chevron,
                 retenu: localStorage.getItem('auTableau_tiroirs_auto'),
                 allume: document.getElementById('rp-tiroirs-auto').classList.contains('actif') };
    });
    r.egal('sans l\'option, revenir au tableau ne referme rien',
        tiroirs.sansOption, { haut: true, bas: true });
    r.egal('avec l\'option, les deux tiroirs se referment dès qu\'on revient au tableau',
        { ouverts: tiroirs.ouverts, apres: tiroirs.apres },
        { ouverts: { haut: true, bas: true }, apres: { haut: false, bas: false } });
    r.verifie('et leurs chevrons disent la même chose qu\'eux',
        tiroirs.chevron.haut && tiroirs.chevron.bas, JSON.stringify(tiroirs.chevron));
    r.egal('le réglage est allumé et retenu',
        { retenu: tiroirs.retenu, allume: tiroirs.allume }, { retenu: 'true', allume: true });

    await page.evaluate(() => { basculerLesTiroirsAuto(false); basculerLaBarreCourte(false); });

    // =====================================================================
    // UNE CASE À COCHER EST UNE LIGNE, PAS UN CHAMP
    // Elle portait son libellé en petites majuscules AU-DESSUS d'un carré nu :
    // on devait deviner à quoi ce carré se rapportait, et seuls ses vingt
    // pixels se cliquaient. Le libellé entre dans la ligne, et toute la ligne
    // devient la cible — ce qui compte sur un écran qu'on touche du doigt.
    // =====================================================================
    const cases = await page.evaluate(async () => {
        let rendu = null;
        openCustomPrompt('Essai', [
            { type: 'checkbox', label: 'Première', value: false },
            { type: 'checkbox', label: 'Seconde', value: true }
        ], (res) => { rendu = res.slice(); return ''; }, () => {});

        const lignes = [...document.querySelectorAll('#custom-prompt-inputs .prompt-case')];
        const coche = (l) => l.querySelector('input[type="checkbox"]');
        const dedans = lignes.map(l => l.textContent.trim());
        // AUCUNE ÉTIQUETTE AU-DESSUS : le libellé est dans la ligne, une fois.
        const auDessus = [...document.querySelectorAll('#custom-prompt-inputs label')]
            .filter(l => !l.classList.contains('prompt-case')).map(l => l.textContent.trim());

        if (lignes.length < 2 || !coche(lignes[0])) return { n: lignes.length, dedans, auDessus };
        const avant = coche(lignes[0]).checked;
        // On clique le TEXTE, pas le carré.
        (lignes[0].querySelector('span') || lignes[0]).click();
        const apres = coche(lignes[0]).checked;
        const teintee = lignes[0].classList.contains('cochee');
        // Et l'aperçu a été prévenu du nouvel état.
        const vuParLApercu = rendu && rendu[0] === true;

        // La case déjà cochée s'ouvre teintée.
        const secondeTeintee = lignes[1].classList.contains('cochee');
        // Le carré est dessiné par nous : pas de cerclage noir du navigateur.
        const dessine = getComputedStyle(coche(lignes[0])).appearance === 'none';

        document.getElementById('custom-prompt-modal').style.display = 'none';
        return { n: lignes.length, dedans, auDessus, avant, apres, teintee,
                 vuParLApercu, secondeTeintee, dessine };
    });
    r.egal('le libellé est dans la ligne, et nulle part au-dessus',
        { n: cases.n, dedans: cases.dedans, auDessus: cases.auDessus },
        { n: 2, dedans: ['Première', 'Seconde'], auDessus: [] });
    r.egal('cliquer le texte coche la case, et la ligne se teinte',
        { avant: cases.avant, apres: cases.apres, teintee: cases.teintee },
        { avant: false, apres: true, teintee: true });
    r.verifie('l\'aperçu est prévenu du nouvel état', cases.vuParLApercu, String(cases.vuParLApercu));
    r.verifie('une case déjà cochée s\'ouvre teintée', cases.secondeTeintee, String(cases.secondeTeintee));
    r.verifie('et le carré est le nôtre, pas celui du navigateur', cases.dessine, String(cases.dessine));

    // =====================================================================
    // LES SURFACES FLOTTANTES SE DÉTACHENT DE CE QU'ELLES RECOUVRENT
    // Un filet gris très pâle suffisait tant qu'elles se posaient sur le fond
    // du tableau. Sur un polycopié blanc ouvert en grand, la barre disparais-
    // sait purement et simplement : on cherchait un bouton qu'on ne voyait
    // plus. Le contour est maintenant celui de l'encre — et sur fond sombre,
    // un trait clair, car le même noir s'y fondrait tout autant.
    // =====================================================================
    const SURFACES = ['#bar-style', '#system-toolbar-main', '#bande-morceaux', '#reglages-barre'];
    // La couleur du trait passe d'un thème à l'autre EN TROIS DIXIÈMES DE
    // SECONDE : lue à l'instant du changement, elle rend encore celle du
    // thème qu'on vient de quitter. C'est un piège de mesure, pas un défaut.
    const releverLesContours = () => page.evaluate((surfaces) => {
        // Le contraste d'un trait, en clarté : un gris à 0,88 se perd sur une
        // page blanche, une encre à 0,2 s'y voit.
        const clarte = (rgb) => {
            const n = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
            return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
        };
        const vu = {};
        surfaces.forEach(sel => {
            const e = document.querySelector(sel);
            if (!e) return;
            const st = getComputedStyle(e);
            vu[sel] = { couleur: st.borderTopColor, epaisseur: st.borderTopWidth,
                        // LE SECOND PIXEL EST UNE OMBRE SANS FLOU, hors du
                        // calcul de place : une vraie bordure de deux pixels
                        // agrandirait la barre d'autant, et celle du document
                        // recouvrait alors la première case d'une fiche.
                        liseré: /0px 0px 0px 1px/.test(st.boxShadow),
                        clarte: clarte(st.borderTopColor) };
        });
        return vu;
    }, SURFACES);

    const clair = await releverLesContours();
    await page.evaluate(() => document.body.classList.add('dark-mode'));
    await page.waitForTimeout(450);
    const sombre = await releverLesContours();
    await page.evaluate(() => document.body.classList.remove('dark-mode'));
    await page.waitForTimeout(450);
    const contours = { clair, sombre, attendues: SURFACES.length };
    const trouvees = Object.keys(contours.clair);
    r.egal('les quatre surfaces flottantes ont bien un contour',
        trouvees.length, contours.attendues);
    r.verifie('sur fond clair, leur trait est une ENCRE, pas un gris qui s\'efface',
        trouvees.every(s => contours.clair[s].clarte < 0.45),
        JSON.stringify(contours.clair));
    r.verifie('et sur fond sombre il s\'éclaircit, sinon il s\'y fondrait pareil',
        trouvees.every(s => contours.sombre[s].clarte > 0.45),
        JSON.stringify(contours.sombre));
    // DEUX PIXELS VISIBLES, ZÉRO PIXEL PRIS : le second est une ombre sans
    // flou. Une vraie bordure de deux pixels agrandissait la barre d'autant,
    // et celle du document, posée sur le haut d'une fiche, recouvrait alors
    // la première case à remplir.
    r.verifie('il se double d\'un liseré qui ne prend aucune place',
        trouvees.every(s => contours.clair[s].liseré),
        JSON.stringify(trouvees.map(s => [s, contours.clair[s].liseré])));
    r.verifie('et la bordure elle-même n\'a pas grossi',
        trouvees.every(s => parseFloat(contours.clair[s].epaisseur) <= 1),
        JSON.stringify(trouvees.map(s => contours.clair[s].epaisseur)));

    // =====================================================================
    // LE MENU DES RÉGLAGES NE S'ALLONGE PAS
    // Il comptait un titre par réglage ou presque — « Titre du tableau »,
    // « Annotations », « Documents », « Astuces » — et l'on parcourait plus
    // de titres que de choix. Ce qui se règle une fois pour toutes tient en
    // trois familles, plus ce qui sert à découvrir.
    // =====================================================================
    const reglages = await page.evaluate(() => {
        const popup = document.getElementById('reglages-barre');
        const titres = [...popup.querySelectorAll('.rp-titre')].map(t => t.textContent.trim());
        const choix = popup.querySelectorAll('.rp-choix').length;
        // Aucun choix ne traîne avant le premier titre : chacun appartient
        // à une rubrique, sinon la rubrique ne veut rien dire.
        const enfants = [...popup.children];
        const premierTitre = enfants.findIndex(e => e.classList.contains('rp-titre'));
        const orphelins = enfants.slice(0, premierTitre).filter(e => e.classList.contains('rp-choix')).length;
        return { titres, choix, orphelins };
    });
    r.verifie('quatre rubriques au plus, et plus de choix que de titres',
        reglages.titres.length <= 4 && reglages.choix > reglages.titres.length * 2,
        JSON.stringify(reglages));
    r.egal('et aucun réglage ne traîne hors d\'une rubrique', reglages.orphelins, 0);

    // L'OPTION DES CONTOURS. Le trait d'encre est le défaut — c'est celui qui
    // se voit de loin —, mais il se rend discret pour qui travaille le nez
    // sur l'écran.
    const option = await page.evaluate(() => {
        const lu = () => getComputedStyle(document.getElementById('bar-style')).borderTopColor;
        const clarte = (rgb) => {
            const n = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
            return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
        };
        const bouton = document.getElementById('rp-contours');
        const auDepart = { franc: clarte(lu()) < 0.45, allume: bouton.classList.contains('actif') };
        bouton.click();
        return { auDepart, bouton: !!bouton,
                 retenu: localStorage.getItem('auTableau_contours_doux'),
                 eteint: !bouton.classList.contains('actif'),
                 corps: document.body.classList.contains('contours-doux') };
    });
    await page.waitForTimeout(450);
    const doux = await page.evaluate(() => {
        const clarte = (rgb) => {
            const n = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
            return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
        };
        const c = clarte(getComputedStyle(document.getElementById('bar-style')).borderTopColor);
        basculerLesContours(true);
        return c;
    });
    r.egal('le contour franc est le défaut, et il est allumé dans les réglages',
        option.auDepart, { franc: true, allume: true });
    r.egal('on peut l\'adoucir, et le choix se retient',
        { retenu: option.retenu, eteint: option.eteint, corps: option.corps },
        { retenu: 'true', eteint: true, corps: true });
    r.verifie('adouci, le trait redevient un gris discret',
        doux > 0.45, String(doux));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
