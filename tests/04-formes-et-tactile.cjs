// Reconnaissance de formes, suppression d'une sélection au doigt,
// isolation des erreurs de plugins et tenue des fenêtres sur tablette.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Formes, tactile et robustesse');

    // --- Reconnaissance de formes ---
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.evaluate(() => {
            setMode('freehand');
            window.__t = [];
            const o = window.showToast;
            window.showToast = (m) => { window.__t.push(m); return o && o(m); };
        });

        const tracer = async (pts) => {
            await page.evaluate(() => {
                points.length = 0; rectangles.length = 0; polygons.length = 0; circles.length = 0;
                freehands.length = 0; segments.length = 0; window.__t = []; draw();
            });
            await page.mouse.move(pts[0][0], pts[0][1]);
            await page.mouse.down();
            for (let i = 1; i < pts.length; i++) {
                const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
                for (let t = 0; t <= 1.0001; t += 0.06) {
                    await page.mouse.move(x0 + (x1 - x0) * t + (Math.random() - 0.5) * 3, y0 + (y1 - y0) * t + (Math.random() - 0.5) * 3);
                }
            }
            await page.waitForTimeout(900); // la reconnaissance attend un stylet immobile
            await page.mouse.up();
            await page.waitForTimeout(200);
            return page.evaluate(() => (window.__t || []).join('|'));
        };

        const cx = 640, cy = 430;
        r.verifie('losange reconnu', /Losange/.test(await tracer([[cx, cy - 160], [cx + 110, cy], [cx, cy + 160], [cx - 110, cy], [cx, cy - 160]])));
        r.verifie('losange aplati reconnu', /Losange/.test(await tracer([[cx, cy - 80], [cx + 190, cy], [cx, cy + 80], [cx - 190, cy], [cx, cy - 80]])));
        r.verifie('rectangle toujours reconnu', /Rectangle/.test(await tracer([[cx - 160, cy - 100], [cx + 160, cy - 100], [cx + 160, cy + 100], [cx - 160, cy + 100], [cx - 160, cy - 100]])));
        r.verifie('parallélogramme non aplati en rectangle', /Quadrilat/.test(await tracer([[cx - 120, cy - 90], [cx + 180, cy - 90], [cx + 120, cy + 90], [cx - 180, cy + 90], [cx - 120, cy - 90]])));
        r.verifie('triangle toujours reconnu', /Triangle/.test(await tracer([[cx, cy - 150], [cx + 150, cy + 130], [cx - 150, cy + 130], [cx, cy - 150]])));
        r.verifie('cercle toujours reconnu', /Cercle/.test(await tracer(Array.from({ length: 25 }, (_, i) => { const a = i / 24 * Math.PI * 2; return [cx + 140 * Math.cos(a), cy + 140 * Math.sin(a)]; }))));
        r.verifie('formes : aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // --- Suppression d'une sélection au doigt (tablette) ---
    {
        const { context, page, erreurs } = await ouvrirApp(browser, { tactile: true, viewport: { width: 768, height: 1024 } });
        const cdp = await context.newCDPSession(page);
        await page.evaluate(() => {
            points.push({ id: nextId++, x: -200, y: -220, name: 'A', color: '#2d3436', z: globalZ++ });
            points.push({ id: nextId++, x: -100, y: -120, name: 'B', color: '#2d3436', z: globalZ++ });
            texts.push({ id: nextId++, x: -180, y: -60, content: 'Zone', fontSize: 30, color: '#0984e3', align: 'left', z: globalZ++ });
            setMode('pointer'); draw();
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 220, id: 1 }] });
        for (const [x, y] of [[200, 300], [300, 400], [450, 520]]) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
            await page.waitForTimeout(40);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(300);

        const sel = await page.evaluate(() => ({
            n: selectedItems.length,
            menu: document.getElementById('quick-edit-menu').classList.contains('visible')
        }));
        r.egal('lasso au doigt : 3 objets sélectionnés', sel.n, 3);
        r.verifie('lasso au doigt : menu rapide affiché', sel.menu);

        const box = await page.locator('#btn-quick-delete').boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 }] });
        await page.waitForTimeout(60);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(300);
        const apres = await page.evaluate(() => ({ pts: points.length, txt: texts.length }));
        r.egal('corbeille au doigt : tout est supprimé', [apres.pts, apres.txt], [0, 0]);
        r.verifie('tactile : aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // --- Un plugin fautif ne doit pas figer le tableau ---
    {
        const { context, page } = await ouvrirApp(browser);
        const filet = await page.evaluate(() => {
            PluginManager.plugins.__casse = { onDraw: () => { throw new Error('panne simulée'); } };
            let ok = true;
            try { draw(); draw(); } catch (e) { ok = false; }
            points.push({ id: nextId++, x: 0, y: 0, color: '#000', z: globalZ++ });
            draw();
            return { renduOk: ok, quarantaine: !!PluginManager.faulty.__casse, tableauVivant: points.length === 1 };
        });
        r.verifie('plugin fautif : le rendu continue', filet.renduOk);
        r.verifie('plugin fautif : mis en quarantaine', filet.quarantaine);
        r.verifie('plugin fautif : le tableau reste utilisable', filet.tableauVivant);
        await context.close();
    }

    // --- Fenêtres de plugins : rien ne déborde sur tablette ---
    {
        const { context, page } = await ouvrirApp(browser, { tactile: true, viewport: { width: 768, height: 1024 } });
        const debordements = await page.evaluate(async () => {
            const dodo = (ms) => new Promise(res => setTimeout(res, ms));
            const connus = new Set(Array.from(document.body.children));
            const hors = [];
            for (const btn of Array.from(document.querySelectorAll('#plugins-grid .btn'))) {
                try { btn.click(); } catch (e) { continue; }
                await dodo(280);
                for (const el of Array.from(document.body.children)) {
                    if (connus.has(el)) continue;
                    const cs = getComputedStyle(el), rc = el.getBoundingClientRect();
                    if (cs.display !== 'none' && rc.width > 120 && rc.height > 120) {
                        if (rc.left < -1 || rc.top < -1 || rc.right > window.innerWidth + 1 || rc.bottom > window.innerHeight + 1) {
                            hors.push((btn.getAttribute('data-tooltip') || btn.title || '?') + ` ${Math.round(rc.width)}x${Math.round(rc.height)}`);
                        }
                    }
                    el.style.display = 'none';
                    connus.add(el);
                }
                if (typeof cancelPendingStamps === 'function') cancelPendingStamps();
                setMode('pointer');
            }
            return hors;
        });
        r.verifie('aucune fenêtre ne déborde en 768x1024', debordements.length === 0, debordements.join(' | '));
        await context.close();
    }

    return r.bilan();
};
