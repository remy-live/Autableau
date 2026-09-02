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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
