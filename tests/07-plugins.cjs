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

    // Le tableau répond toujours après ce tour de piste
    const vivant = await page.evaluate(() => { try { draw(); return true; } catch (e) { return e.message; } });
    r.verifie('le tableau répond encore après tous les plugins', vivant === true, String(vivant));

    await context.close();
    return r.bilan();
};
