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
    // L'ENCOMBREMENT, EN DEUX OPTIONS
    // Ouvrir un polycopié empilait six surfaces autour de lui. On ne tranche
    // pas à la place du professeur : on lui donne les leviers, et rien ne
    // bouge tant qu'il ne les a pas demandés.
    // =====================================================================

    // D'ABORD L'ORDRE DE LA BARRE. La gomme et le pointeur laser sont des
    // gestes du quotidien : ils passent sous le texte et le post-it, avec eux.
    const ordre = await page.evaluate(() => {
        const barre = document.getElementById('bar-tools');
        const modes = Array.from(barre.querySelectorAll('.btn[data-mode]')).map(b => b.dataset.mode);
        const suite = document.getElementById('outils-en-plus');
        return {
            modes,
            // Ce qui suit la gomme et le laser est dans l'enveloppe qui s'efface.
            dansLaSuite: Array.from(suite.querySelectorAll('.btn[data-mode],.btn[data-widget]'))
                .map(b => b.dataset.mode || b.dataset.widget),
            // Et rien de ce qui reste n'y est.
            gommeDehors: !suite.querySelector('[data-mode="eraser"]'),
            laserDehors: !suite.querySelector('[data-mode="laser"]')
        };
    });
    r.egal('la gomme et le pointeur laser sont remontés sous le post-it',
        ordre.modes.slice(ordre.modes.indexOf('text')),
        ['text', 'postit', 'eraser', 'laser', 'point', 'segment', 'demi-droite', 'droite',
         'curve', 'circle', 'polygon', 'rectangle']);
    r.verifie('et tout ce qui vient APRÈS eux est ce qui pourra s\'effacer',
        ordre.dansLaSuite[0] === 'point' && ordre.dansLaSuite.includes('compass')
        && ordre.gommeDehors && ordre.laserDehors, JSON.stringify(ordre));

    // L'OPTION « BARRE RÉDUITE ».
    const courte = await page.evaluate(() => {
        // « Masqué » se mesure DANS LA BARRE, en remontant jusqu'à elle : un
        // bouton rangé dans une enveloppe en display:none garde son propre
        // display calculé, et la barre elle-même n'est pas encore montrée à
        // ce stade du démarrage — tout paraîtrait masqué.
        const vu = (sel) => {
            const barre = document.getElementById('bar-tools');
            let el = document.querySelector(sel);
            if (!el) return false;
            while (el && el !== barre) {
                if (getComputedStyle(el).display === 'none') return false;
                el = el.parentElement;
            }
            return true;
        };
        basculerLaBarreCourte(false);
        const avant = { suite: vu('#outils-en-plus'), poignee: vu('#outils-poignee'),
                        gomme: vu('#bar-tools [data-mode="eraser"]') };

        const actif = basculerLaBarreCourte(true);
        const reduite = {
            actif,
            // Ce qui reste : jusqu'à la gomme et au laser.
            gomme: vu('#bar-tools [data-mode="eraser"]'),
            laser: vu('#bar-tools [data-mode="laser"]'),
            postit: vu('#bar-tools [data-mode="postit"]'),
            // Ce qui s'efface : la géométrie et les instruments.
            point: vu('#bar-tools [data-mode="point"]'),
            compas: vu('#bar-tools [data-widget="compass"]'),
            // Et la poignée paraît, puisqu'il y a quelque chose à retrouver.
            poignee: vu('#outils-poignee'),
            retenu: localStorage.getItem('auTableau_barre_courte'),
            allume: document.getElementById('rp-barre-courte').classList.contains('actif')
        };

        // LA POIGNÉE : on tire, tout revient — ET L'OPTION S'ÉTEINT.
        const p = document.getElementById('outils-poignee');
        const opt = (x, y) => ({ pointerId: 7, pointerType: 'mouse', isPrimary: true,
                                 clientX: x, clientY: y, bubbles: true, cancelable: true });
        const r0 = p.getBoundingClientRect();
        p.dispatchEvent(new PointerEvent('pointerdown', opt(r0.left + 5, r0.top + 5)));
        window.dispatchEvent(new PointerEvent('pointermove', opt(r0.left + 30, r0.top + 30)));
        window.dispatchEvent(new PointerEvent('pointerup', opt(r0.left + 30, r0.top + 30)));
        const tiree = {
            point: vu('#bar-tools [data-mode="point"]'),
            compas: vu('#bar-tools [data-widget="compass"]'),
            poignee: vu('#outils-poignee'),
            optionEteinte: localStorage.getItem('auTableau_barre_courte') === 'false',
            allume: document.getElementById('rp-barre-courte').classList.contains('actif')
        };
        return { avant, reduite, tiree };
    });
    r.egal('sans l\'option, toute la barre est là et la poignée ne paraît pas',
        { suite: courte.avant.suite, poignee: courte.avant.poignee }, { suite: true, poignee: false });
    r.egal('réduite, on garde tout jusqu\'à la gomme et au laser',
        { postit: courte.reduite.postit, gomme: courte.reduite.gomme, laser: courte.reduite.laser },
        { postit: true, gomme: true, laser: true });
    r.egal('et ce qui vient après s\'efface',
        { point: courte.reduite.point, compas: courte.reduite.compas }, { point: false, compas: false });
    r.egal('la poignée paraît, et le réglage est allumé et retenu',
        { poignee: courte.reduite.poignee, retenu: courte.reduite.retenu, allume: courte.reduite.allume },
        { poignee: true, retenu: 'true', allume: true });
    r.egal('tirer la poignée ramène tout ET ÉTEINT l\'option',
        { point: courte.tiree.point, compas: courte.tiree.compas, poignee: courte.tiree.poignee,
          eteinte: courte.tiree.optionEteinte, allume: courte.tiree.allume },
        { point: true, compas: true, poignee: false, eteinte: true, allume: false });

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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
