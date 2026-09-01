// Ouvre les 80+ plugins, un par un, sur une tablette : aucun ne doit lever
// d'erreur ni ouvrir une fenêtre qui déborde de l'écran.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Plugins');
    const { context, page, erreurs } = await ouvrirApp(browser, {
        tactile: true, viewport: { width: 768, height: 1024 }
    });

    await page.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });

    const quarantaine = await page.evaluate(() => Object.keys(PluginManager.faulty || {}));
    r.verifie('aucun plugin en quarantaine au démarrage', quarantaine.length === 0, quarantaine.join(', '));

    const nb = await page.evaluate(() => document.querySelectorAll('#plugins-grid .btn').length);
    r.verifie('la grille contient bien tous les outils', nb > 70, `${nb} boutons`);

    const fautifs = [];
    const debordants = [];

    for (let i = 0; i < nb; i++) {
        const avant = erreurs.length;
        const nom = await page.evaluate((k) => {
            const b = document.querySelectorAll('#plugins-grid .btn')[k];
            b.style.display = 'flex';
            b.click();
            return b.dataset.pluginId || b.title || ('bouton ' + k);
        }, i);
        await page.waitForTimeout(500);

        const debord = await page.evaluate(() => {
            const dehors = [];
            document.querySelectorAll('div, dialog').forEach(el => {
                if (el.closest('#plugins-grid') || el.closest('#thumbnail-drawer')) return;
                // Le clavier mathématique de MathLive occupe toute la largeur
                // de l'écran par conception : ce n'est pas un débordement.
                if (el.className && String(el.className).startsWith('MLK__')) return;
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                if (!['fixed', 'absolute'].includes(cs.position)) return;
                if (parseInt(cs.zIndex || '0', 10) < 100) return;
                const b = el.getBoundingClientRect();
                if (b.width < 180 || b.height < 120) return;
                if (b.right > window.innerWidth + 4 || b.bottom > window.innerHeight + 4 || b.left < -4 || b.top < -4) {
                    dehors.push(`${el.id || el.className.toString().slice(0, 30)} ${Math.round(b.width)}x${Math.round(b.height)}`);
                }
            });
            return dehors;
        });

        if (erreurs.length > avant) fautifs.push(`${nom} : ${erreurs.slice(avant).join(' | ')}`);
        if (debord.length) debordants.push(`${nom} : ${debord.join(', ')}`);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        await page.evaluate(() => {
            document.querySelectorAll('.plugin-modal, .modal, .popup, [id$="-modal"], [id$="-window"]').forEach(el => {
                if (el.style) el.style.display = 'none';
            });
        });
        await page.waitForTimeout(100);
    }

    r.verifie(`les ${nb} plugins s'ouvrent sans erreur`, fautifs.length === 0, fautifs.slice(0, 6).join('  ///  '));
    r.verifie('aucune fenêtre de plugin ne déborde en 768×1024', debordants.length === 0, debordants.slice(0, 6).join('  ///  '));

    // Le tampon « carte » doit sortir sans connexion : les silhouettes sont
    // fournies avec l'application.
    const carte = await page.evaluate(() => new Promise(res => {
        const t = PluginManager.plugins.mapTool;
        if (!t || !t.fetchMap) return res(null);
        t.fetchMap('fr', '#0984e3', (svg) => res(svg ? { taille: svg.length, trace: /<path/i.test(svg) } : null));
    }));
    r.verifie('carte de France disponible hors connexion', !!carte && carte.trace, JSON.stringify(carte));

    // --- Laboratoire Électrique : les modèles de circuits ---
    // Chaque montage doit être fermé (tout composant alimenté), tenir dans la
    // fenêtre par défaut, et surtout : aucun fil ne doit traverser un
    // composant. Le tracé est en L, par le milieu ; mal placé, il coupe le
    // schéma en deux et le montage devient illisible.
    const circuits = await page.evaluate(async () => {
        const P = PluginManager.plugins['circuitTool'];
        P.state = { nodes: [], wires: [] };
        P.editingImage = null;
        P.saveHistory(true);
        P.createWidget();

        // Distance d'un point à un segment
        const dist = (px, py, x1, y1, x2, y2) => {
            const dx = x2 - x1, dy = y2 - y1;
            const l2 = dx * dx + dy * dy;
            let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
        };

        const bilans = [];
        for (const m of P.MODELES) {
            P.state = { nodes: [], wires: [] };     // pas de question posée si vide
            await P.poserModele(m.cle);
            const n = P.state.nodes;

            let traversees = 0;
            P.state.wires.forEach(w => {
                const a = n.find(x => x.id === w.from), b = n.find(x => x.id === w.to);
                if (!a || !b) return;
                const mx = (a.x + b.x) / 2;
                const segments = [[a.x, a.y, mx, a.y], [mx, a.y, mx, b.y], [mx, b.y, b.x, b.y]];
                n.forEach(c => {
                    if (c.id === a.id || c.id === b.id) return;
                    if (segments.some(s => dist(c.x, c.y, s[0], s[1], s[2], s[3]) < 25)) traversees++;
                });
            });

            bilans.push({
                cle: m.cle,
                composants: n.length,
                eteints: n.filter(c => !c.powered).length,
                traversees,
                largeur: Math.max(...n.map(c => c.x)) + 40,
                hauteur: Math.max(...n.map(c => c.y)) + 40,
                surLaGrille: n.every(c => c.x % 20 === 0 && c.y % 20 === 0),
                svg: document.getElementById('circ-svg-layer').innerHTML.length
            });
        }
        P.closeWidget();
        return bilans;
    });
    r.egal('six modèles de circuits sont proposés', circuits.length, 6);
    r.verifie('chaque modèle forme un circuit fermé, tout est alimenté',
        circuits.every(c => c.eteints === 0), JSON.stringify(circuits.filter(c => c.eteints)));
    r.verifie('aucun fil ne traverse un composant',
        circuits.every(c => c.traversees === 0),
        JSON.stringify(circuits.filter(c => c.traversees).map(c => [c.cle, c.traversees])));
    r.verifie('chaque montage tient dans la fenêtre par défaut',
        circuits.every(c => c.largeur <= 520 && c.hauteur <= 460),
        JSON.stringify(circuits.map(c => [c.cle, c.largeur, c.hauteur])));
    r.verifie('et se pose sur la grille de 20 px',
        circuits.every(c => c.surLaGrille));
    r.verifie('le schéma est bien dessiné', circuits.every(c => c.svg > 200));

    // Poser un modèle sur un circuit commencé demande d'abord confirmation
    const remplace = await page.evaluate(async () => {
        const P = PluginManager.plugins['circuitTool'];
        P.state = { nodes: [], wires: [] };
        P.editingImage = null; P.saveHistory(true); P.createWidget();
        await P.poserModele('serie');
        const avant = P.state.nodes.length;

        const p = P.poserModele('derivation');
        await new Promise(r => setTimeout(r, 40));
        const questionne = getComputedStyle(document.getElementById('confirm-modal')).display === 'flex';
        document.getElementById('confirm-cancel-btn').click();
        await p;
        const apresRefus = P.state.nodes.length;

        const p2 = P.poserModele('derivation');
        await new Promise(r => setTimeout(r, 40));
        document.getElementById('confirm-yes-btn').click();
        await p2;
        const apresAccord = P.state.nodes.map(n => n.type).sort().join(',');
        P.closeWidget();
        return { avant, questionne, apresRefus, apresAccord };
    });
    r.egal('le modèle « Série » pose ses quatre composants', remplace.avant, 4);
    r.verifie('remplacer un circuit commencé demande confirmation', remplace.questionne);
    r.egal('refuser laisse le circuit intact', remplace.apresRefus, 4);
    r.egal('accepter pose le nouveau montage', remplace.apresAccord, 'battery,bulb,bulb,switch');

    // Le tableau répond toujours après ce tour de piste
    const vivant = await page.evaluate(() => { try { draw(); return true; } catch (e) { return e.message; } });
    r.verifie('le tableau répond encore après tous les plugins', vivant === true, String(vivant));

    await context.close();
    return r.bilan();
};
