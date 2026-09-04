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

    // La carte doit sortir sans connexion : le fond du monde est livré avec
    // l'application, et rien n'est jamais demandé à un serveur.
    const carte = await page.evaluate(() => {
        const t = PluginManager.plugins.mapTool;
        if (!t) return null;
        const etat = t.etatNeuf();
        etat.fond = 'Europe';
        etat.legendes[0].pays = ['FR'];
        const fait = t.fabriquerSVG(etat, 600);
        return { pays: t.monde().length, trace: /<path/i.test(fait.svg),
                 couleur: fait.svg.includes('#0984e3'), taille: fait.svg.length };
    });
    r.verifie('le fond de carte du monde est fourni avec l\'application',
        !!carte && carte.pays > 180, JSON.stringify(carte));
    r.verifie('une carte se dessine sans rien demander au réseau',
        !!carte && carte.trace && carte.couleur, JSON.stringify(carte));

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

    // Le menu déroulant : changer de montage, et refuser sans rien casser
    const menu = await page.evaluate(async () => {
        const P = PluginManager.plugins['circuitTool'];
        P.state = { nodes: [], wires: [] };
        P.editingImage = null; P.saveHistory(true); P.createWidget();
        const liste = P.widgetEl.querySelector('#circ-modele-select');
        const choisir = async (cle, reponse) => {
            liste.value = cle;
            liste.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 40));
            const boite = document.getElementById('confirm-modal');
            const questionne = getComputedStyle(boite).display === 'flex';
            if (questionne) document.getElementById(reponse ? 'confirm-yes-btn' : 'confirm-cancel-btn').click();
            await new Promise(r => setTimeout(r, 60));
            return questionne;
        };

        const optionsEnTrop = liste.options.length - 1 - P.MODELES.length;
        const premier = await choisir('serie', true);           // circuit vide : pas de question
        const apresPremier = P.state.nodes.length;
        const resume = P.widgetEl.querySelector('#circ-modele-resume').textContent;

        const refus = await choisir('derivation', false);
        const apresRefus = { n: P.state.nodes.length, liste: liste.value };

        const accord = await choisir('derivation', true);
        const apresAccord = { types: P.state.nodes.map(n => n.type).sort().join(','), liste: liste.value };

        // On ajoute un composant : ce n'est plus le modèle, la liste le dit
        P.currentTool = 'add'; P.currentComponentType = 'resistor';
        P.onInputDown({ x: 700, y: 700 });
        const apresRetouche = { liste: liste.value, modele: P.modeleCourant };

        P.closeWidget();
        return { optionsEnTrop, premier, apresPremier, resume, refus, apresRefus, accord, apresAccord, apresRetouche };
    });
    r.egal('la liste ne propose que les modèles, plus « Circuit libre »', menu.optionsEnTrop, 0);
    r.verifie('sur un plan de travail vide, aucune question n\'est posée', menu.premier === false);
    r.egal('le premier choix pose ses quatre composants', menu.apresPremier, 4);
    r.verifie('la liste explique le montage choisi', /ampèremètre/.test(menu.resume), menu.resume);
    r.verifie('changer de montage demande confirmation', menu.refus === true);
    r.egal('refuser laisse le circuit intact', menu.apresRefus.n, 4);
    r.egal('et la liste revient sur le montage affiché', menu.apresRefus.liste, 'serie');
    r.egal('accepter pose le nouveau montage', menu.apresAccord.types, 'battery,bulb,bulb,switch');
    r.egal('la liste suit', menu.apresAccord.liste, 'derivation');
    r.egal('retoucher le circuit le fait repasser en « Circuit libre »', menu.apresRetouche.liste, '');
    r.egal('et le modèle courant est oublié', menu.apresRetouche.modele, null);

    // Mode « Actionner » : un clic sur l'interrupteur éteint tout le circuit
    const actionner = await page.evaluate(async () => {
        const P = PluginManager.plugins['circuitTool'];
        P.state = { nodes: [], wires: [] };
        P.editingImage = null; P.saveHistory(true); P.createWidget();
        await P.poserModele('del');
        const outilApresPose = P.currentTool;
        const aide = getComputedStyle(P.widgetEl.querySelector('#circ-aide-actionner')).display;

        const inter = P.state.nodes.find(n => n.type === 'switch');
        const del = P.state.nodes.find(n => n.type === 'led');
        const delAvant = del.powered;

        P.onInputDown({ x: inter.x, y: inter.y });          // on ouvre
        const ouvert = { inter: inter.closed, del: del.powered };
        const dessin = document.getElementById('circ-svg-layer').innerHTML;

        P.onInputDown({ x: inter.x, y: inter.y });          // on referme
        const referme = { inter: inter.closed, del: del.powered };

        // Un clic à côté ne bascule rien
        P.onInputDown({ x: inter.x + 200, y: inter.y + 200 });
        const aCote = inter.closed;

        // Le double-clic ne doit pas défaire le clic simple dans ce mode
        P.onInputDblClick({ x: inter.x, y: inter.y });
        const apresDouble = inter.closed;

        P.closeWidget();
        return { outilApresPose, aide, delAvant, ouvert, referme, aCote, apresDouble,
                 rougeQuandEteint: /#e74c3c/.test(dessin) };
    });
    r.egal('un modèle posé rend la main sur « Actionner »', actionner.outilApresPose, 'toggle');
    r.egal('avec sa consigne affichée', actionner.aide, 'block');
    r.verifie('la DEL est allumée au départ', actionner.delAvant === true);
    r.verifie('un clic ouvre l\'interrupteur et éteint la DEL',
        actionner.ouvert.inter === false && actionner.ouvert.del === false, JSON.stringify(actionner.ouvert));
    r.verifie('un second clic referme et rallume',
        actionner.referme.inter === true && actionner.referme.del === true, JSON.stringify(actionner.referme));
    r.verifie('cliquer à côté ne bascule rien', actionner.aCote === true);
    r.verifie('le double-clic ne défait pas le clic simple', actionner.apresDouble === true);

    // --- L'ÉCHIQUIER ---
    // Les pièces étaient des caractères Unicode (♞) posés dans un <text> :
    // elles dépendaient de la police du système. Ce sont maintenant six
    // dessins vectoriels, et le plateau reprend les couleurs d'AtoutMath.
    const echiquier = await page.evaluate(async () => {
        images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        const p = PluginManager.plugins.chessTool;
        p.currentDesign = 'ardoise';
        let dessins = 0; const vrai = window.draw;
        window.draw = function () { dessins++; return vrai.apply(this, arguments); };
        const t0 = performance.now();
        p.buildGame();
        await new Promise(r2 => { const a = () => images.length >= 33 ? r2() : setTimeout(a, 4); a(); });
        await new Promise(r2 => requestAnimationFrame(r2));
        window.draw = vrai;
        const sources = new Set(images.map(i => i.src));
        const texteDesSvg = images.map(i => decodeURIComponent(escape(atob(i.src.split(',')[1])))).join('');
        return {
            ms: Math.round(performance.now() - t0), dessins, poses: images.length,
            distincts: sources.size,
            glyphes: /[\u2654-\u265F]/.test(texteDesSvg),
            balisesTexte: (texteDesSvg.match(/<text/g) || []).length
        };
    });
    r.egal('l\'échiquier pose son plateau et ses 32 pièces', echiquier.poses, 33);
    r.egal('pour treize dessins seulement : un plateau, douze pièces',
        echiquier.distincts, 13);
    r.verifie('en deux repeintures, pas trente-trois',
        echiquier.dessins <= 4, JSON.stringify(echiquier));
    r.verifie('aucune pièce n\'est un caractère Unicode',
        !echiquier.glyphes, JSON.stringify(echiquier));
    r.egal('les seuls <text> restants sont les seize coordonnées',
        echiquier.balisesTexte, 16);

    // LISIBILITÉ. Une pièce noire sur une case sombre ne doit pas se réduire à
    // son filet : c'est ce qui arrivait au thème « Nuit », dont le camp noir et
    // la case sombre étaient deux nuances d'un même bleu-gris. On compte donc,
    // sur le tableau peint, les pixels d'une case qui diffèrent VRAIMENT de sa
    // couleur de fond : une pièce en couvre une bonne part, un filet presque rien.
    const lisibilite = await page.evaluate(async () => {
        const p = PluginManager.plugins.chessTool;
        const canvas = document.getElementById('board');
        const ctx = canvas.getContext('2d');
        const ech = window.devicePixelRatio || 1;
        const teinte = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

        const resultats = {};
        for (const nom of Object.keys(p.designs)) {
            images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
            p.currentDesign = nom;
            p.buildGame();
            await new Promise(r2 => { const a = () => images.length >= 33 ? r2() : setTimeout(a, 4); a(); });
            await new Promise(r2 => requestAnimationFrame(r2));
            const plateau = images[0];
            panX = 20 - plateau.x; panY = 20 - plateau.y;
            draw();
            await new Promise(r2 => requestAnimationFrame(r2));

            const d = p.designs[nom];
            const cellW = 60, pad = 30;
            // Une case occupée de chaque sorte : rangée 0 = noirs, rangée 7 = blancs ;
            // colonne 0 et colonne 1 donnent les deux teintes de case.
            const cases = { noirClair: [0, 0], noirSombre: [1, 0], blancSombre: [0, 7], blancClair: [1, 7] };
            const part = {};
            for (const [cle, [c, rg]] of Object.entries(cases)) {
                const fond = teinte((c + rg) % 2 === 0 ? d.claire : d.sombre);
                const x = (20 + pad + c * cellW + 8) * ech;
                const y = (20 + pad + rg * cellW + 8) * ech;
                const taille = Math.round((cellW - 16) * ech);
                const px = ctx.getImageData(Math.round(x), Math.round(y), taille, taille).data;
                let differents = 0, total = 0;
                for (let i = 0; i < px.length; i += 4) {
                    total++;
                    const dist = Math.abs(px[i] - fond[0]) + Math.abs(px[i + 1] - fond[1]) + Math.abs(px[i + 2] - fond[2]);
                    if (dist > 90) differents++;
                }
                part[cle] = Math.round(100 * differents / total);
            }
            resultats[nom] = part;
        }
        return resultats;
    });
    for (const [nom, part] of Object.entries(lisibilite)) {
        const faible = Object.entries(part).filter(([, v]) => v < 18);
        r.verifie(`thème « ${nom} » : les quatre cas de figure se voient`,
            faible.length === 0, JSON.stringify(part));
    }

    // Et la règle de palette qui va avec, énoncée franchement : la case CLAIRE
    // n'est jamais blanche, la case SOMBRE jamais de la couleur du camp noir.
    // C'est ce second écart qui manquait — le camp noir et la case sombre du
    // thème « Nuit » étaient deux nuances du même bleu-gris, et les pièces
    // noires s'y fondaient. On mesure les deux, chacun à sa mesure : une pièce
    // blanche se détache surtout par son filet, une pièce noire par sa masse.
    const palettes = await page.evaluate(() => {
        const p = PluginManager.plugins.chessTool;
        const t = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const ecart = (a2, b2) => {
            const [r1, g1, b1] = t(a2), [r2, g2, b2c] = t(b2);
            return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2c);
        };
        const res = {};
        for (const [nom, d] of Object.entries(p.designs)) {
            res[nom] = { clairVsBlanc: ecart(d.claire, d.blanc), sombreVsNoir: ecart(d.sombre, d.noir) };
        }
        return res;
    });
    for (const [nom, e] of Object.entries(palettes)) {
        r.verifie(`thème « ${nom} » : la case claire n'est pas blanche`,
            e.clairVsBlanc >= 40, JSON.stringify(e));
        r.verifie(`thème « ${nom} » : la case sombre n'est pas la couleur du camp noir`,
            e.sombreVsNoir >= 120, JSON.stringify(e));
    }

    await page.evaluate(() => { images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1; draw(); });

    // Le tableau répond toujours après ce tour de piste
    const vivant = await page.evaluate(() => { try { draw(); return true; } catch (e) { return e.message; } });
    r.verifie('le tableau répond encore après tous les plugins', vivant === true, String(vivant));

    // --- UNE FORMULE EST UNE FORMULE, ET RIEN D'AUTRE ---
    // Le traceur GARDE ses formules dans le tableau enregistré. Un fichier reçu
    // d'un collègue en apporte donc les siennes, et les rouvrir les compilait
    // avec « new Function » — sans filtrage. J'ai monté la chaîne entière avant
    // d'écrire ce test : le code du fichier s'exécutait, avec l'accès à tout ce
    // que la page possède, tableaux enregistrés et jetons compris.
    const formules = await page.evaluate(async () => {
        const tr = PluginManager.plugins.funcPlotter;
        const calcule = (e, x) => { const f = tr.compileExpr(e); return f ? +f(x, 0).toFixed(4) : null; };

        delete self.__preuve;
        const vignette = {
            id: nextId++, x: 100, y: 100, w: 200, h: 150, cx: 0, cy: 0, cw: 200, ch: 150,
            src: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"></svg>'),
            z: 1,
            pluginData: { id: 'funcPlotter',
                          funcs: [{ type: 'cart', expr: 'x+(self.__preuve=1)', show: true, color: '#000' }] }
        };
        images.push(vignette);
        try { tr.edit(vignette); } catch (e) { /* peu importe : ce qui compte est l'exécution */ }
        await new Promise(ok => setTimeout(ok, 350));
        const chaine = !!self.__preuve;
        delete self.__preuve;

        return {
            chaine,
            bonnes: { carre: calcule('x^2', 3), affine: calcule('2x+1', 4), racine: calcule('sqrt(x)', 9),
                      trigo: calcule('cos(2x)', 0), compose: calcule('3x^2-2x+1', 2),
                      arc: calcule('arcsin(x)', 0), expo: calcule('exp(x)', 0) },
            mauvaises: ['self.__preuve=1', "self[atob('eA==')]", 'fetch("/vol")', 'window.alert(1)',
                        'document.cookie', 'constructor.constructor("return 1")()', 'this.x']
                .filter(e => !!tr.compileExpr(e))
        };
    });
    r.verifie('un tableau reçu ne peut plus exécuter de code par ses formules',
        formules.chaine === false, JSON.stringify({ execute: formules.chaine }));
    r.egal('les vraies formules calculent toujours juste', formules.bonnes,
        { carre: 9, affine: 9, racine: 3, trigo: 1, compose: 9, arc: 0, expo: 1 });
    r.egal('et rien qui nomme autre chose ne se compile', formules.mauvaises, []);

    // --- UN NOM RESTE UN NOM ---
    // Les noms d'élèves et de tableaux traversaient du HTML sans échappement.
    // Ce n'est pas qu'une affaire de sûreté : « D'Amico » refermait la chaîne
    // d'un appel écrit dans un attribut et cassait le glisser-déposer.
    const noms = await page.evaluate(async () => {
        delete self.__xss;
        const piege = '<img src=x onerror="self.__xss=1">';
        const bac = document.createElement('div');
        document.body.appendChild(bac);
        bac.innerHTML = `<span>${echapperTexte(piege)}</span>`;
        await new Promise(ok => setTimeout(ok, 250));
        const execute = !!self.__xss;
        const lu = bac.textContent;
        bac.remove();
        delete self.__xss;
        const appel = echapperPourAppel("D'Amico");
        return { execute, lu, appel, protege: appel.indexOf('\\') >= 0 };
    });
    r.verifie('un nom qui contient du HTML ne s\'exécute pas', !noms.execute, JSON.stringify(noms));
    r.egal('et il reste lisible tel qu\'il a été écrit', noms.lu, '<img src=x onerror="self.__xss=1">');
    r.verifie('une apostrophe dans un nom ne casse plus l\'appel qui le porte',
        noms.protege, noms.appel);

    await context.close();
    return r.bilan();
};
