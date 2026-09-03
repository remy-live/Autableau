// L'atelier cartes : le fond fourni avec l'application, la sélection des pays,
// les légendes, les notes que la classe verra, et la carte posée qui reste
// vivante — on passe dessus, elle répond.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Atelier cartes');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.PluginManager
        && PluginManager.plugins.mapTool && window.CARTE_MONDE, { timeout: 20000 });

    const carte = () => page.evaluate(() => PluginManager.plugins.mapTool && true);

    // --- LE FOND EST LÀ, ET IL EST COMPLET ---
    const fond = await page.evaluate(() => {
        const p = PluginManager.plugins.mapTool;
        const tous = p.monde();
        const parContinent = {};
        tous.forEach(x => { parContinent[x.c] = (parContinent[x.c] || 0) + 1; });
        const fr = tous.find(x => x.i === 'FR');
        const anneaux = p.anneauxDe(fr);
        return {
            pays: tous.length, parContinent,
            france: { nom: fr.n, continent: fr.c, anneaux: anneaux.length,
                      points: anneaux.reduce((s, a) => s + a.length, 0) },
            // Le cadrage ne doit pas englober les outre-mer, sinon montrer la
            // France recule jusqu'à tenir la Guyane dans le même écran.
            cadre: fr.f, tout: fr.b,
            aucunPointHorsDuGlobe: tous.every(x => p.anneauxDe(x).every(a =>
                a.every(q => Math.abs(q[0]) <= 181 && Math.abs(q[1]) <= 91))),
            aucunAnneauVide: tous.every(x => p.anneauxDe(x).every(a => a.length > 2))
        };
    });
    r.verifie('le fond de carte est livré avec l\'application', fond.pays > 180, String(fond.pays));
    r.verifie('les six continents y sont',
        ['Europe', 'Afrique', 'Asie', 'Amérique du Nord', 'Amérique du Sud', 'Océanie']
            .every(c => fond.parContinent[c] > 5), JSON.stringify(fond.parContinent));
    r.egal('la France est nommée en français et rangée en Europe',
        [fond.france.nom, fond.france.continent], ['France', 'Europe']);
    r.verifie('ses contours se décodent', fond.france.points > 100, JSON.stringify(fond.france));
    r.verifie('aucun contour ne sort du globe', fond.aucunPointHorsDuGlobe);
    r.verifie('aucun anneau vide : le séparateur ne coupe pas les contours',
        fond.aucunAnneauVide);
    r.verifie('le cadrage de la France s\'arrête à l\'Hexagone',
        fond.cadre[0] > -12 && fond.cadre[2] < 12, JSON.stringify(fond.cadre));
    r.verifie('mais sa boîte complète couvre bien l\'outre-mer',
        fond.tout[0] < -50, JSON.stringify(fond.tout));

    // --- LES PROJECTIONS ---
    const projections = await page.evaluate(() => {
        const p = PluginManager.plugins.mapTool;
        const plate = p.projeter(30, 60, 'plate');
        const rob = p.projeter(30, 60, 'robinson');
        // Robinson resserre les parallèles vers les pôles : à 60° de latitude,
        // un degré de longitude est plus court qu'à l'équateur.
        const equateur = p.projeter(30, 0, 'robinson');
        return { plate, rob, equateur,
                 hautEnHaut: p.projeter(0, 60, 'robinson')[1] < p.projeter(0, -60, 'robinson')[1] };
    });
    r.egal('la projection plate rend les degrés tels quels',
        projections.plate.map(v => Math.round(v)), [30, -60]);
    r.verifie('Robinson resserre les parallèles vers les pôles',
        projections.rob[0] < projections.equateur[0] * 0.95,
        JSON.stringify(projections));
    r.verifie('et le nord reste en haut', projections.hautEnHaut, JSON.stringify(projections));

    // --- L'ATELIER ---
    await page.evaluate(() => PluginManager.plugins.mapTool.ouvrir());
    await page.waitForSelector('#carte-fenetre', { timeout: 5000 });
    const atelier = await page.evaluate(() => ({
        chemins: document.querySelectorAll('#carte-dessin path[data-pays]').length,
        continents: Array.from(document.querySelectorAll('#carte-fond-choix option')).map(o => o.value),
        legendes: document.querySelectorAll('.carte-legende').length,
        compte: document.getElementById('carte-compte').textContent
    }));
    r.verifie('la carte du monde s\'affiche, cliquable', atelier.chemins > 180, String(atelier.chemins));
    r.verifie('on peut choisir un continent',
        atelier.continents.includes('Europe') && atelier.continents.includes('Afrique'),
        JSON.stringify(atelier.continents));
    r.egal('une légende est prête d\'emblée', atelier.legendes, 1);
    r.egal('et rien n\'est encore retenu', atelier.compte, 'Aucun pays retenu');

    // Cliquer un pays lui donne la légende choisie ; recliquer la lui retire.
    // On vise le MILIEU DE L'HEXAGONE : le centre de la boîte de la France,
    // outre-mer compris, tombe au large du Mali.
    const viser = (code) => page.evaluate((code) => {
        const p = PluginManager.plugins.mapTool;
        const svg = document.querySelector('#carte-dessin svg');
        const r = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const m = p.mesures(p.etat, vb.width);
        const c = p.centreEcran(p.monde().find(x => x.i === code), p.etat.projection, m.cadre, m.echelle, { x: 0, y: 0 });
        const k = r.width / vb.width;
        return { x: Math.round(r.left + c.x * k), y: Math.round(r.top + c.y * k) };
    }, code);

    let cible = await viser('FR');
    await page.mouse.click(cible.x, cible.y);
    const clic1 = await page.evaluate(() => ({
        retenus: PluginManager.plugins.mapTool.etat.legendes[0].pays.slice(),
        fiche: (document.querySelector('.carte-nom') || {}).textContent,
        compte: document.getElementById('carte-compte').textContent
    }));
    r.egal('cliquer la France la retient', clic1.retenus, ['FR']);
    r.verifie('et ouvre sa fiche', /France/.test(clic1.fiche || ''), clic1.fiche);
    r.egal('le compte suit', clic1.compte, '1 pays retenu');

    await page.mouse.click(cible.x, cible.y);
    const clic2 = await page.evaluate(() =>
        PluginManager.plugins.mapTool.etat.legendes[0].pays.slice());
    r.egal('recliquer la retire', clic2, []);

    // Une deuxième légende, et un pays n'appartient qu'à une seule
    const deuxLegendes = await page.evaluate(async () => {
        const p = PluginManager.plugins.mapTool;
        document.getElementById('carte-ajouter-legende').click();
        p.basculerPays(p.etat, 'FR');            // dans la deuxième
        const apres = { l1: p.etat.legendes[0].pays.slice(), l2: p.etat.legendes[1].pays.slice() };
        p.etat.legendeActive = 1;
        p.basculerPays(p.etat, 'FR');            // on la bascule dans la première
        return { apres, final: { l1: p.etat.legendes[0].pays.slice(), l2: p.etat.legendes[1].pays.slice() },
                 combien: p.etat.legendes.length };
    });
    r.egal('une deuxième légende s\'ajoute', deuxLegendes.combien, 2);
    r.egal('le pays va dans la légende choisie', deuxLegendes.apres, { l1: [], l2: ['FR'] });
    r.egal('et il n\'appartient jamais à deux légendes à la fois',
        deuxLegendes.final, { l1: ['FR'], l2: [] });

    // La recherche
    const recherche = await page.evaluate(() => {
        const champ = document.getElementById('carte-chercher');
        champ.value = 'bresil';                  // sans accent : doit répondre
        PluginManager.plugins.mapTool.rendre();
        const trouves = PluginManager.plugins.mapTool.paysCherches().map(p => p.i);
        champ.value = '';
        PluginManager.plugins.mapTool.rendre();
        return trouves;
    });
    r.egal('la recherche ignore les accents', recherche, ['BR']);

    // --- LA POSE ---
    const posee = await page.evaluate(async () => {
        const p = PluginManager.plugins.mapTool;
        p.etat.notes.FR = 'Capitale : Paris';
        p.etat.titre = 'Les frontières de 1914';
        images.length = 0;
        p.poser();
        await new Promise(r => setTimeout(r, 700));
        p.onPointerDown({ x: 0, y: 0 }, { pointerType: 'mouse' });
        const img = images[images.length - 1];
        return img ? {
            combien: images.length, id: img.pluginData.id,
            note: img.pluginData.args.notes.FR,
            titre: img.pluginData.args.titre,
            retenus: img.pluginData.args.legendes[0].pays,
            proportion: Math.round((img.w / img.h) * 100) / 100,
            source: (img.src || '').slice(0, 24),
            // les contours ne doivent PAS être recopiés dans le tampon
            poids: JSON.stringify(img.pluginData.args).length
        } : null;
    });
    r.egal('la carte se pose sur le tableau', posee && posee.combien, 1);
    r.egal('elle se reconnaît comme une carte', posee.id, 'mapTool');
    r.egal('elle emporte la note du professeur', posee.note, 'Capitale : Paris');
    r.egal('et son titre', posee.titre, 'Les frontières de 1914');
    r.egal('et les pays retenus', posee.retenus, ['FR']);
    r.verifie('c\'est bien une image', /^data:image\/svg/.test(posee.source), posee.source);
    r.verifie('elle est plus large que haute', posee.proportion > 1, String(posee.proportion));
    r.verifie('et le tableau ne grossit pas de cent kilo-octets par carte',
        posee.poids < 3000, posee.poids + ' octets');

    // --- LA CARTE POSÉE RESTE VIVANTE ---
    const vivante = await page.evaluate(() => {
        const p = PluginManager.plugins.mapTool;
        const img = images[images.length - 1];
        const proj = p.projectionPour(img);
        const fr = proj.contours.find(c => c.code === 'FR');
        const grand = fr.anneaux.slice().sort((a, b) => b.length - a.length)[0];
        let sx = 0, sy = 0;
        grand.forEach(q => { sx += q[0]; sy += q[1]; });
        const surLaFrance = { x: img.x + sx / grand.length, y: img.y + sy / grand.length };
        const trouve = p.paysSousLePoint(surLaFrance);
        return {
            code: trouve && trouve.code, nom: trouve && trouve.nom,
            surLaMer: p.paysSousLePoint({ x: img.x + 4, y: img.y + img.h - 4 }),
            horsCarte: p.paysSousLePoint({ x: img.x - 500, y: img.y - 500 }),
            pointDeLaFrance: surLaFrance
        };
    });
    r.egal('passer sur la France la reconnaît', [vivante.code, vivante.nom], ['FR', 'France']);
    r.egal('sur la mer, rien', vivante.surLaMer, null);
    r.egal('hors de la carte, rien non plus', vivante.horsCarte, null);

    // La fiche se dessine sans rien casser
    const fiche = await page.evaluate(() => {
        const p = PluginManager.plugins.mapTool;
        const img = images[images.length - 1];
        p.survol = { objId: img.id, code: 'FR', nom: 'France' };
        mouseLogicalPos = { x: img.x + 50, y: img.y + 50 };
        draw();
        const ok = true;
        p.survol = null; draw();
        return ok;
    });
    r.verifie('la fiche du pays se dessine sur le tableau', fiche);

    // Étirée sans garder ses proportions, la carte répond encore juste
    const etiree = await page.evaluate(() => {
        const p = PluginManager.plugins.mapTool;
        const img = images[images.length - 1];
        const proj = p.projectionPour(img);
        const fr = proj.contours.find(c => c.code === 'FR');
        const grand = fr.anneaux.slice().sort((a, b) => b.length - a.length)[0];
        let sx = 0, sy = 0; grand.forEach(q => { sx += q[0]; sy += q[1]; });
        // On l'étire en hauteur seulement
        img.h = img.h * 1.6;
        const proj2 = p.projectionPour(img);
        const fr2 = proj2.contours.find(c => c.code === 'FR');
        const grand2 = fr2.anneaux.slice().sort((a, b) => b.length - a.length)[0];
        let sx2 = 0, sy2 = 0; grand2.forEach(q => { sx2 += q[0]; sy2 += q[1]; });
        const trouve = p.paysSousLePoint({ x: img.x + sx2 / grand2.length, y: img.y + sy2 / grand2.length });
        img.h = img.h / 1.6;
        return { avant: Math.round(sy / grand.length), apres: Math.round(sy2 / grand2.length),
                 code: trouve && trouve.code };
    });
    r.verifie('étirée en hauteur, elle se relit en hauteur',
        etiree.apres > etiree.avant * 1.4, JSON.stringify(etiree));
    r.egal('et le pays sous le doigt est toujours le bon', etiree.code, 'FR');

    // --- LA RÉÉDITION ---
    const reedition = await page.evaluate(async () => {
        const p = PluginManager.plugins.mapTool;
        const img = images[images.length - 1];
        const avant = { largeur: Math.round(img.w), source: img.src };
        p.edit(img);
        const ouvert = !!document.getElementById('carte-fenetre');
        const retrouve = p.etat.notes.FR;

        // Une note ne se dessine pas sur la carte : elle ne s'affiche qu'au
        // survol. Le dessin doit donc rester le MÊME — refaire une image
        // identique pour rien alourdirait le tableau à chaque retouche.
        p.etat.notes.FR = 'Capitale : Paris (2,1 millions)';
        p.poser();
        await new Promise(r => setTimeout(r, 700));
        const apresNote = { source: img.src, note: img.pluginData.args.notes.FR };

        // Une couleur de légende, elle, change le dessin.
        p.edit(img);
        p.etat.legendes[0].couleur = '#d63031';
        p.poser();
        await new Promise(r => setTimeout(r, 700));

        return {
            ouvert, retrouve,
            memeObjet: images.length === 1,
            memeLargeur: Math.round(img.w) === avant.largeur,
            noteAJour: apresNote.note,
            dessinInchangeParLaNote: apresNote.source === avant.source,
            dessinChangeParLaCouleur: img.src !== apresNote.source
        };
    });
    r.verifie('un double-clic rouvre l\'atelier sur la carte', reedition.ouvert);
    r.egal('avec ce qu\'on y avait écrit', reedition.retrouve, 'Capitale : Paris');
    r.verifie('mettre à jour ne pose pas une deuxième carte', reedition.memeObjet,
        JSON.stringify(reedition));
    r.verifie('elle garde sa place et sa taille', reedition.memeLargeur, JSON.stringify(reedition));
    r.egal('la note est à jour', reedition.noteAJour, 'Capitale : Paris (2,1 millions)');
    r.verifie('une note ne redessine pas la carte : elle ne s\'affiche qu\'au survol',
        reedition.dessinInchangeParLaNote, JSON.stringify(reedition));
    r.verifie('une couleur de légende, si', reedition.dessinChangeParLaCouleur,
        JSON.stringify(reedition));

    // --- CHANGER DE FOND ---
    const continent = await page.evaluate(() => {
        const p = PluginManager.plugins.mapTool;
        p.ouvrir();
        p.etat.fond = 'Afrique';
        p.rendre();
        const chemins = document.querySelectorAll('#carte-dessin path[data-pays]').length;
        const m = p.mesures(p.etat, 640);
        p.fermer();
        return { chemins, largeurDuCadre: Math.round(m.cadre.x1 - m.cadre.x0) };
    });
    r.verifie('choisir l\'Afrique ne montre que l\'Afrique',
        continent.chemins > 40 && continent.chemins < 70, String(continent.chemins));
    r.verifie('et la carte se cadre dessus', continent.largeurDuCadre < 120,
        String(continent.largeurDuCadre));

    await page.evaluate(() => {
        const p = PluginManager.plugins.mapTool;
        p.fermer(); p.survol = null; p.currentStamp = null;
        images.length = 0; setMode('pointer'); draw();
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
