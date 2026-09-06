// L'atelier frises : les modèles de périodes historiques, les quatre styles,
// l'échelle du temps — et les voies, parce que l'Égypte, la Grèce et Rome ne
// se suivent pas : elles coexistent.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Atelier frises');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.PluginManager && PluginManager.plugins.friseTool,
        { timeout: 20000 });

    // --- LES MODÈLES ---
    const modeles = await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        return {
            combien: p.MODELES.length,
            noms: p.MODELES.map(m => m.cle),
            // Chaque modèle doit tenir debout : des périodes, des dates
            // croissantes, une couleur, un style connu.
            bancals: p.MODELES.filter(m =>
                !m.periodes.length
                || m.periodes.some(x => !(x.fin > x.debut) || !x.nom || !/^#/.test(x.couleur))
                || !p.STYLES.some(s => s.cle === m.style)).map(m => m.cle),
            styles: p.STYLES.map(s => s.cle),
            // Les dates de l'usage scolaire
            moyenAge: (() => {
                const m = p.MODELES.find(x => x.cle === 'grandes-periodes');
                const ma = m.periodes.find(x => x.nom === 'Moyen Âge');
                return [ma.debut, ma.fin];
            })()
        };
    });
    r.verifie('il y a des modèles prêts à poser', modeles.combien >= 7, String(modeles.combien));
    r.verifie('dont les grandes périodes, le XXe siècle et la Révolution',
        ['grandes-periodes', 'xxe', 'revolution', 'antiquite', 'moyen-age'].every(c => modeles.noms.includes(c)),
        JSON.stringify(modeles.noms));
    r.egal('aucun modèle bancal', modeles.bancals, []);
    r.egal('quatre styles', modeles.styles, ['fleche', 'bandeau', 'ruban', 'jalons']);
    r.egal('le Moyen Âge va de 476 à 1492', modeles.moyenAge, [476, 1492]);

    // --- LES ANNÉES AVANT NOTRE ÈRE ---
    const annees = await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        return { avant: p.anneeEnClair(-3300), court: p.anneeEnClair(-52, true), apres: p.anneeEnClair(1492) };
    });
    r.egal('« -3300 » s\'écrit en clair', annees.avant, '3300 av. J.-C.');
    r.egal('et en court quand la place manque', annees.court, '52 av.');
    r.egal('une année de notre ère reste nue', annees.apres, '1492');

    // --- L'ÉCHELLE DU TEMPS ---
    // C'était le défaut de l'ancienne frise : chaque période avait la même
    // largeur, si bien que la Grande Guerre (quatre ans) occupait autant que
    // la guerre froide (quarante-quatre ans).
    const echelle = await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        const etat = p.etatDuModele('xxe');
        const large = (mode) => {
            etat.echelle = mode;
            const plan = p.placer(etat, 1000);
            const trouve = (nom) => plan.cases.find(c => c.p.nom === nom);
            return {
                guerre14: Math.round(trouve('Première Guerre mondiale').l),
                froide: Math.round(trouve('Guerre froide').l)
            };
        };
        return { proportionnelle: large('proportionnelle'), egale: large('egale') };
    });
    r.verifie('à l\'échelle, la guerre froide est bien plus large que 14-18',
        echelle.proportionnelle.froide > echelle.proportionnelle.guerre14 * 5,
        JSON.stringify(echelle.proportionnelle));
    r.egal('en cases égales, elles font la même largeur',
        echelle.egale.froide, echelle.egale.guerre14);

    // --- LES VOIES ---
    const voies = await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        const antiquite = p.etatDuModele('antiquite');       // Égypte, Grèce, Rome : simultanées
        const grandes = p.etatDuModele('grandes-periodes');
        grandes.echelle = 'proportionnelle';                 // successives
        const planA = p.placer(antiquite, 1000);
        const planG = p.placer(grandes, 1000);
        // Deux périodes d'une même voie ne doivent jamais se recouvrir
        const chevauche = (plan) => {
            for (let i = 0; i < plan.cases.length; i++) {
                for (let j = i + 1; j < plan.cases.length; j++) {
                    const a = plan.cases[i], b = plan.cases[j];
                    if (a.voie !== b.voie) continue;
                    if (a.x < b.x + b.l - 0.6 && b.x < a.x + a.l - 0.6) return `${a.p.nom} / ${b.p.nom}`;
                }
            }
            return null;
        };
        return {
            antiquite: planA.voies, grandes: planG.voies,
            chevauchementA: chevauche(planA), chevauchementG: chevauche(planG),
            voieDeRome: (planA.cases.find(c => c.p.nom === 'Rome') || {}).voie
        };
    });
    r.verifie('trois civilisations simultanées occupent trois voies',
        voies.antiquite === 3, String(voies.antiquite));
    r.egal('des périodes qui se suivent tiennent sur une seule voie', voies.grandes, 1);
    r.egal('et sur une voie, rien ne se recouvre jamais',
        [voies.chevauchementA, voies.chevauchementG], [null, null]);
    r.verifie('Rome n\'est pas sur la voie de l\'Égypte', voies.voieDeRome > 0,
        String(voies.voieDeRome));

    // --- LES ÉTIQUETTES NE SE MARCHENT PAS DESSUS ---
    const etiquettes = await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        const etat = p.etatDuModele('revolution');
        const evs = etat.evenements.slice().sort((a, b) => a.annee - b.annee);
        const plan = p.placer(etat, 1000);
        const L = 1100, marge = Math.round(L * 0.035);
        const pile = p.empilerLesEtiquettes(evs, (e) => marge + plan.position(e.annee), L);
        // On refait le calcul des boîtes pour vérifier qu'aucune paire d'un
        // même rang ne se chevauche.
        const boites = evs.map((e, i) => {
            const texte = p.anneeEnClair(e.annee, true) + ' · ' + e.libelle;
            const large = texte.length * 6.8 + 12;
            const x = marge + plan.position(e.annee);
            const a = p.ancrageDe(x, L);
            const g = a.ancre === 'start' ? a.x : (a.ancre === 'end' ? a.x - large : x - large / 2);
            return { rang: pile.rang[i], g, d: g + large, texte };
        });
        let collision = null;
        for (let i = 0; i < boites.length && !collision; i++) {
            for (let j = i + 1; j < boites.length; j++) {
                if (boites[i].rang !== boites[j].rang) continue;
                if (boites[i].g < boites[j].d && boites[j].g < boites[i].d) {
                    collision = boites[i].texte + ' / ' + boites[j].texte;
                }
            }
        }
        return { rangs: pile.rangs, collision, combien: evs.length };
    });
    r.verifie('quatre événements serrés s\'empilent sur plusieurs rangs',
        etiquettes.rangs > 1 && etiquettes.rangs <= etiquettes.combien, String(etiquettes.rangs));
    r.egal('et aucune étiquette n\'en recouvre une autre', etiquettes.collision, null);

    // --- LES QUATRE STYLES ---
    const styles = await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        const etat = p.etatDuModele('xxe');
        const faits = {};
        ['fleche', 'bandeau', 'ruban', 'jalons'].forEach(s => {
            etat.style = s;
            const f = p.fabriquerSVG(etat, 1200);
            // Aucune coordonnée ne doit sortir de l'image. On lit le nombre
            // par sa capture : nettoyer la chaîne à coups de replace gardait
            // le « 1 » de « x1 » et lisait 1242,9 pour 242,9.
            const xs = [];
            const motif = /\sx1?="(-?\d+(?:\.\d+)?)"/g;
            let m;
            while ((m = motif.exec(f.svg)) !== null) xs.push(parseFloat(m[1]));
            faits[s] = {
                hauteur: f.hauteur,
                aDesCouleurs: /#d63031/.test(f.svg),
                aUneFleche: /<polygon/.test(f.svg),
                aDesArrondis: /rx="(1[0-9]|2[0-9])"/.test(f.svg),
                horsCadre: xs.filter(v => v < -1 || v > 1201).length,
                empreinte: f.svg.length
            };
        });
        return faits;
    });
    ['fleche', 'bandeau', 'ruban', 'jalons'].forEach(s => {
        r.verifie(`le style « ${s} » se dessine avec les couleurs des périodes`,
            styles[s].aDesCouleurs, JSON.stringify(styles[s]));
        r.egal(`et rien ne sort de l'image (${s})`, styles[s].horsCadre, 0);
    });
    r.verifie('les quatre styles donnent quatre dessins différents',
        new Set(['fleche', 'bandeau', 'ruban', 'jalons'].map(s => styles[s].empreinte)).size === 4,
        JSON.stringify(Object.keys(styles).map(s => styles[s].empreinte)));
    r.verifie('le ruban est arrondi, le bandeau non',
        styles.ruban.aDesArrondis && !styles.bandeau.aDesArrondis,
        JSON.stringify({ ruban: styles.ruban.aDesArrondis, bandeau: styles.bandeau.aDesArrondis }));
    r.verifie('la flèche et les jalons ont une pointe',
        styles.fleche.aUneFleche && styles.jalons.aUneFleche);

    // --- L'ATELIER ---
    await page.evaluate(() => PluginManager.plugins.friseTool.ouvrir());
    await page.waitForSelector('#frise-fenetre', { timeout: 5000 });
    const atelier = await page.evaluate(() => ({
        apercu: !!document.querySelector('#frise-apercu svg'),
        modeles: document.querySelectorAll('#frise-modele option').length,
        periodes: document.querySelectorAll('#frise-periodes .frise-ligne').length,
        evenements: document.querySelectorAll('#frise-evenements .frise-ligne').length,
        compte: document.getElementById('frise-compte').textContent
    }));
    r.verifie('l\'aperçu se dessine', atelier.apercu);
    r.verifie('les modèles sont proposés', atelier.modeles >= 8, String(atelier.modeles));
    r.egal('les cinq grandes périodes sont là', atelier.periodes, 5);
    r.egal('avec leurs quatre repères', atelier.evenements, 4);
    r.verifie('le compte dit les bornes', /de 6000 av\. J\.-C\. à 2030/.test(atelier.compte),
        atelier.compte);

    // Changer de modèle, ajouter, retirer
    const manipuler = await page.evaluate(() => {
        const fond = document.getElementById('frise-fond');
        const choix = fond.querySelector('#frise-modele');
        choix.value = 'revolution';
        choix.dispatchEvent(new Event('change', { bubbles: true }));
        const apresModele = document.querySelectorAll('#frise-periodes .frise-ligne').length;
        fond.querySelector('#frise-ajouter-periode').click();
        const apresAjout = document.querySelectorAll('#frise-periodes .frise-ligne').length;
        fond.querySelector('[data-retirer-periode="0"]').click();
        const apresRetrait = document.querySelectorAll('#frise-periodes .frise-ligne').length;
        return { apresModele, apresAjout, apresRetrait };
    });
    r.egal('changer de modèle change les périodes', manipuler.apresModele, 3);
    r.egal('on en ajoute une', manipuler.apresAjout, 4);
    r.egal('on en retire une', manipuler.apresRetrait, 3);

    // --- LA POSE ET LA RÉÉDITION ---
    const posee = await page.evaluate(async () => {
        const p = PluginManager.plugins.friseTool;
        images.length = 0;
        p.ouvrir();
        p.etat = p.etatDuModele('grandes-periodes');
        p.poser();
        await new Promise(r => setTimeout(r, 600));
        p.onPointerDown({ x: 0, y: 0 });
        const img = images[images.length - 1];
        return img ? {
            combien: images.length, id: img.pluginData.id,
            periodes: img.pluginData.state.periodes.length,
            style: img.pluginData.state.style,
            proportion: Math.round((img.w / img.h) * 10) / 10
        } : null;
    });
    r.egal('la frise se pose', posee && posee.combien, 1);
    r.egal('elle se reconnaît comme une frise', posee.id, 'friseTool');
    r.egal('avec ses cinq périodes', posee.periodes, 5);
    r.verifie('et elle est bien plus large que haute', posee.proportion > 3,
        String(posee.proportion));

    const reeditee = await page.evaluate(async () => {
        const p = PluginManager.plugins.friseTool;
        const img = images[images.length - 1];
        const avant = img.src;
        p.edit(img);
        const ouvert = !!document.getElementById('frise-fenetre');
        const repris = p.etat.periodes.length;
        p.etat.style = 'jalons';
        p.poser();
        await new Promise(r => setTimeout(r, 600));
        return { ouvert, repris, memeObjet: images.length === 1,
                 dessinChange: img.src !== avant, style: img.pluginData.state.style };
    });
    r.verifie('un double-clic rouvre l\'atelier sur la frise', reeditee.ouvert);
    r.egal('avec ses périodes', reeditee.repris, 5);
    r.verifie('mettre à jour ne pose pas une deuxième frise', reeditee.memeObjet,
        JSON.stringify(reeditee));
    r.verifie('changer de style redessine', reeditee.dessinChange, JSON.stringify(reeditee));
    r.egal('et le style est retenu', reeditee.style, 'jalons');

    // Une frise de l'ancienne version se reprend au lieu de se perdre
    const ancienne = await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        const faux = {
            id: 999, x: 0, y: 0, w: 100, h: 20, cx: 0, cy: 0, cw: 100, ch: 20, src: '',
            pluginData: { id: 'friseTool', state: { start: '1900', blocks: [
                { color: '#0984e3', end: '1950' }, { color: '#e74c3c', end: '2000' }] } }
        };
        p.edit(faux);
        const reprise = p.etat.periodes.map(x => [x.debut, x.fin, x.couleur]);
        p.fermer();
        return reprise;
    });
    r.egal('une frise de l\'ancienne version est reprise, pas perdue',
        ancienne, [[1900, 1950, '#0984e3'], [1950, 2000, '#e74c3c']]);

    // =====================================================================
    // ON TRAVAILLE SUR LA FRISE, PAS À CÔTÉ
    // Le nom d'une période se tapait dans un champ large de six caractères,
    // coincé entre la couleur et deux années. On l'écrit maintenant là où on
    // le lit, et l'on tire les frontières à la main.
    // =====================================================================
    const surLaFrise = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        const F = PluginManager.plugins.friseTool;
        F.ouvrir(F.etatDuModele('vide'));
        await attendre(400);
        const zone = document.getElementById('frise-apercu');
        // Sans repères sur l'aperçu, rien de tout cela n'existe : on le dit
        // dans la ligne qui le concerne plutôt que d'emporter la suite.
        if (!zone.querySelector('rect[data-periode="0"]')) return { sansReperes: true };

        // 1. Écrire le nom sur la période
        zone.querySelector('rect[data-periode="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await attendre(200);
        const champ = zone.querySelector('.frise-saisie');
        if (!champ) return { sansChamp: true };
        const surLaBande = (() => {
            const b = zone.querySelector('rect[data-periode="0"]').getBoundingClientRect();
            const c = champ.getBoundingClientRect();
            return c.left >= b.left - 6 && c.right <= b.right + 12
                && c.top >= b.top - 20 && c.bottom <= b.bottom + 20;
        })();
        champ.value = 'Belle Époque';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        champ.dispatchEvent(new Event('blur'));
        await attendre(250);
        const nom = F.etat.periodes[0].nom;
        const dansLePanneau = document.querySelector('#frise-periodes .frise-nom').value;

        // 2. Tirer la frontière de 1950 vers la droite
        const avant = [F.etat.periodes[0].fin, F.etat.periodes[1].debut];
        const svg = zone.querySelector('svg');
        const poignee = [...zone.querySelectorAll('[data-frontiere]')]
            .find(el => el.dataset.frontiere === '1950');
        if (!poignee) return { sansPoignee: true };
        const b = svg.getBoundingClientRect();
        const large = svg.viewBox.baseVal.width;
        const versX = (annee) => {
            const rep = svg.querySelector('#frise-repere');
            const marge = Number(rep.dataset.marge), utile = Number(rep.dataset.utile);
            const d = Number(rep.dataset.debut), f = Number(rep.dataset.fin);
            const x = marge + ((annee - d) / (f - d)) * utile;
            return b.left + x * (b.width / large);
        };
        const cibleX = versX(1980);
        poignee.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: versX(1950), clientY: b.top + 20 }));
        window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cibleX, clientY: b.top + 20 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cibleX, clientY: b.top + 20 }));
        await attendre(300);
        const apres = [F.etat.periodes[0].fin, F.etat.periodes[1].debut];

        // 3. La hauteur des bandes
        const hauteurDe = () => Number((zone.querySelector('svg').getAttribute('height') || 0));
        const h1 = hauteurDe();
        const curseur = document.getElementById('frise-hauteur');
        curseur.value = '120';
        curseur.dispatchEvent(new Event('input', { bubbles: true }));
        await attendre(200);
        const h2 = hauteurDe();
        const bande = zone.querySelector('rect[data-periode="0"]');
        const epaisseur = Number(bande.getAttribute('height'));
        const taille = Number(zone.querySelector('text[data-periode="0"]').getAttribute('font-size'));

        // 4. En cases égales, pas de frontière à tirer
        document.getElementById('frise-echelle').value = 'egale';
        document.getElementById('frise-echelle').dispatchEvent(new Event('change', { bubbles: true }));
        await attendre(250);
        const enCasesEgales = zone.querySelectorAll('[data-frontiere]').length;

        // 5. L'image posée n'a pas besoin des repères
        const posee = F.fabriquerSVG(F.etat, 1200).svg;
        F.fermer();
        return {
            surLaBande, nom, dansLePanneau, avant, apres, h1, h2, epaisseur, taille,
            enCasesEgales, reperesDansLImage: /data-periode|data-frontiere/.test(posee)
        };
    });
    r.verifie('le champ de saisie se pose SUR la période cliquée', surLaFrise.surLaBande,
        JSON.stringify(surLaFrise));
    r.egal('ce qu\'on y tape devient le nom de la période', surLaFrise.nom, 'Belle Époque');
    r.egal('et le panneau de droite le reprend', surLaFrise.dansLePanneau, 'Belle Époque');
    r.egal('tirer la frontière déplace les deux dates qui se touchaient',
        { avant: surLaFrise.avant, apres: surLaFrise.apres },
        { avant: [1950, 1950], apres: [1980, 1980] });
    r.verifie('la hauteur des bandes se règle, et la frise grandit avec',
        surLaFrise.h2 > surLaFrise.h1 && surLaFrise.epaisseur === 120,
        JSON.stringify({ h1: surLaFrise.h1, h2: surLaFrise.h2, e: surLaFrise.epaisseur }));
    r.verifie('le nom grossit avec la bande', surLaFrise.taille > 15, String(surLaFrise.taille));
    r.egal('en cases égales, aucune frontière ne se tire — la largeur ne dit plus la durée',
        surLaFrise.enCasesEgales, 0);
    r.verifie('et l\'image posée au tableau ne porte aucun repère de travail',
        !surLaFrise.reperesDansLImage);

    await page.evaluate(() => {
        const p = PluginManager.plugins.friseTool;
        p.fermer(); p.currentStamp = null;
        images.length = 0; setMode('pointer'); draw();
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
