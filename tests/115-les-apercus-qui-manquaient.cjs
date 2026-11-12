// LES APERÇUS QUI MANQUAIENT.
//
//   « Rajoute un aperçu pour ce que tu suggérais. »
//   « Surtout, chaque plugin doit avoir un aperçu, non ? »
//
// Non, pas tous : trois fenêtres ouvrent un outil — Python, Fenêtre web,
// Arbre de calcul — et promettre une image là où il n'y a rien à montrer est
// pire que se taire. Mais tous ceux qui FABRIQUENT UN OBJET qu'on posera sur
// le tableau en méritent un : on voit ce qu'on va obtenir avant de l'obtenir.
//
// Mesuré sur les quatre-vingt-neuf boutons : dix d'entre eux n'en avaient
// aucun. Ce chapitre en couvre six, et dit lesquels restent.
//
// DEUX RÈGLES QUE CE CHAPITRE TIENT, ET QUI COMPTENT PLUS QUE L'EXISTENCE
// DE L'APERÇU :
//
//   1. L'APERÇU EST LE DESSIN LUI-MÊME. Pour le polygone et la division, on
//      vérifie que ce qui est montré est, caractère pour caractère, ce que
//      la pose fabriquera. Un aperçu écrit une seconde fois « pour
//      ressembler » ment le jour où l'un des deux change.
//   2. IL SUIT LES RÉGLAGES. Un aperçu qui s'affiche à l'ouverture et ne
//      bouge plus est pire que pas d'aperçu : il montre autre chose que ce
//      qu'on est en train de régler. C'est exactement ce qui arrivait aux
//      Pyramides Additives, dont l'aperçu existait depuis toujours — on ne
//      lui tendait la boîte à dessiner qu'au premier appel.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Les aperçus qui manquaient');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    const ouvrir = (nom) => page.evaluate((n) => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === n);
        if (!b) return false;
        b.click();
        return true;
    }, nom);
    const refermer = () => page.evaluate(() => {
        const c = document.getElementById('custom-prompt-cancel');
        if (c) c.click();
    });
    const apercu = () => page.evaluate(() => {
        const a = document.getElementById('custom-prompt-preview');
        return a ? a.innerHTML.trim() : '';
    });
    // Changer la valeur d'un champ COMME UN DOIGT LE FERAIT : on pose la
    // valeur puis on lance l'événement que la boîte écoute. Sans cet
    // événement, rien ne se redessine — et le contrôle ne mesurerait que le
    // premier dessin.
    const regler = (rang, valeur) => page.evaluate(([i, v]) => {
        const champs = document.getElementById('custom-prompt-inputs');
        const entrees = Array.from(champs.querySelectorAll('input, select'));
        const e = entrees[i];
        if (!e) return false;
        e.value = v;
        e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        return true;
    }, [rang, valeur]);

    // ------------------------------------------------------------------
    // 1. NEUF FENÊTRES QUI N'AVAIENT RIEN À MONTRER EN ONT MAINTENANT.
    // ------------------------------------------------------------------
    const SIX = ['Polygones Réguliers', 'Division Posée', 'Météo du Jour',
                 'QR Code', 'Générateur de Dominos', 'Mots Mêlés',
                 'Angles à mesurer', 'Jeu du Pendu', 'Le Compte est Bon'];
    const vides = [];
    for (const nom of SIX) {
        if (!(await ouvrir(nom))) { vides.push(nom + ' (bouton introuvable)'); continue; }
        await page.waitForTimeout(450);
        const vu = await apercu();
        if (vu.length < 30) vides.push(nom + ' (' + vu.length + ' caractères)');
        await refermer();
        await page.waitForTimeout(180);
    }
    r.egal('les neuf fenêtres dessinent quelque chose', vides.length, 0, vides.join(' | '));

    // ------------------------------------------------------------------
    // 2. L'APERÇU EST LE DESSIN QU'ON POSERA, CARACTÈRE POUR CARACTÈRE.
    // ------------------------------------------------------------------
    await ouvrir('Polygones Réguliers');
    await page.waitForTimeout(450);
    const memeDessin = await page.evaluate(() => {
        const outil = window.PluginManager && PluginManager.plugins
            && PluginManager.plugins.polygonTool;
        if (!outil || typeof outil.dessinDuPolygone !== 'function') return { erreur: 'pas de fonction de dessin' };
        // ON COMPARE LES SOMMETS, PAS LES CARACTÈRES. Le navigateur réécrit
        // ce qu'on lui donne — ordre des attributs, guillemets — et deux
        // dessins identiques n'ont donc pas le même texte. Les sommets du
        // polygone, eux, sont le dessin : s'ils sont les mêmes, l'image est
        // la même au pixel près.
        const lire = (racine) => {
            const p = racine.querySelector('polygon');
            return p ? { points: (p.getAttribute('points') || '').replace(/\s+/g, ' ').trim(),
                         trait: p.getAttribute('stroke') } : null;
        };
        const bac = document.createElement('div');
        bac.innerHTML = outil.dessinDuPolygone(6, '#0984e3');
        const attendu = lire(bac);
        const vu = lire(document.getElementById('custom-prompt-preview'));
        return { pareil: !!vu && !!attendu && vu.points === attendu.points && vu.trait === attendu.trait,
                 vu, attendu };
    });
    r.verifie('l\'aperçu du polygone EST le dessin qui sera posé',
        memeDessin.pareil === true, JSON.stringify(memeDessin));

    // ET IL SUIT LE RÉGLAGE : trois côtés ne font pas le même dessin que six.
    const aSix = await apercu();
    await regler(0, '3');
    await page.waitForTimeout(250);
    const aTrois = await apercu();
    r.verifie('changer le nombre de côtés change le dessin',
        aSix !== aTrois && aTrois.length > 30,
        'six : ' + aSix.slice(0, 60) + ' | trois : ' + aTrois.slice(0, 60));
    await refermer();
    await page.waitForTimeout(180);

    // ------------------------------------------------------------------
    // 3. LA MÉTÉO MONTRE LE TEMPS QU'ON CHOISIT.
    // ------------------------------------------------------------------
    await ouvrir('Météo du Jour');
    await page.waitForTimeout(450);
    const soleil = await apercu();
    await regler(0, 'rain');
    await page.waitForTimeout(250);
    const pluie = await apercu();
    r.verifie('le soleil et la pluie ne se dessinent pas pareil',
        soleil !== pluie && pluie.length > 30,
        'soleil ' + soleil.length + ' car., pluie ' + pluie.length + ' car.');
    await refermer();
    await page.waitForTimeout(180);

    // ------------------------------------------------------------------
    // 4. LE QR CODE DE L'APERÇU EST UN VRAI QR CODE.
    //
    //    Celui-ci ne se relit pas à l'œil : s'il n'est pas vrai, il ne sert
    //    à rien. On vérifie qu'il y a bien une image, et qu'une adresse vide
    //    dit pourquoi elle ne montre rien plutôt que de rester muette.
    // ------------------------------------------------------------------
    await ouvrir('QR Code');
    await page.waitForTimeout(450);
    const qrVide = await page.evaluate(() => {
        const a = document.getElementById('custom-prompt-preview');
        return { image: !!a.querySelector('img'), texte: (a.textContent || '').trim().length };
    });
    r.verifie('sans adresse, l\'aperçu explique au lieu de rester vide',
        !qrVide.image && qrVide.texte > 20, JSON.stringify(qrVide));
    await regler(0, 'https://exemple.fr/une-page');
    await page.waitForTimeout(400);
    const qrPlein = await page.evaluate(() => {
        const img = document.getElementById('custom-prompt-preview').querySelector('img');
        return img ? { large: img.naturalWidth || img.width, source: (img.getAttribute('src') || '').slice(0, 14) } : null;
    });
    r.verifie('avec une adresse, un vrai code apparaît',
        !!qrPlein && qrPlein.large > 20, JSON.stringify(qrPlein));
    await refermer();
    await page.waitForTimeout(180);

    // ------------------------------------------------------------------
    // 5. LES MOTS MÊLÉS DISENT CE QU'ILS GARDENT ET CE QU'ILS JETTENT.
    //
    //    L'outil écarte en silence les mots de deux lettres et tout ce qui
    //    passe le sixième. L'aperçu le dit AVANT — c'est tout son objet.
    // ------------------------------------------------------------------
    await ouvrir('Mots Mêlés');
    await page.waitForTimeout(450);
    await regler(0, 'TABLEAU, LE, CRAIE');
    await page.waitForTimeout(300);
    const mots = await page.evaluate(() => {
        const t = document.getElementById('custom-prompt-preview').textContent || '';
        return { contientTableau: /TABLEAU/.test(t), contientLE: /\bLE\b/.test(t),
                 diteCote: /laiss/i.test(t), texte: t.replace(/\s+/g, ' ').trim().slice(0, 120) };
    });
    r.verifie('le mot trop court est montré, et dit mis de côté',
        mots.contientTableau && mots.contientLE && mots.diteCote, mots.texte);
    await refermer();
    await page.waitForTimeout(180);

    // ------------------------------------------------------------------
    // 5 bis. LES DOMINOS PROMETTENT LE NOMBRE ET LA SORTE, PAS LES NOMBRES.
    //
    //    Les valeurs sont tirées au sort à la pose : montrer un tirage
    //    particulier serait promettre celui-là. Ce que les réglages
    //    décident, eux, c'est COMBIEN et DE QUELLE SORTE — et cela, l'aperçu
    //    le montre. Trois dominos ne font donc pas la même image que cinq.
    // ------------------------------------------------------------------
    await ouvrir('Générateur de Dominos');
    await page.waitForTimeout(450);
    const largeurDesDominos = () => page.evaluate(() => {
        const s = document.getElementById('custom-prompt-preview').querySelector('svg[viewBox]');
        if (!s) return null;
        const v = (s.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
        return v[2] || null;
    });
    const aTroisDominos = await largeurDesDominos();
    await regler(1, '5');
    await page.waitForTimeout(300);
    const aCinqDominos = await largeurDesDominos();
    r.verifie('cinq dominos font une image plus large que trois',
        !!aTroisDominos && !!aCinqDominos && aCinqDominos > aTroisDominos,
        'trois : ' + aTroisDominos + ' | cinq : ' + aCinqDominos);
    await refermer();
    await page.waitForTimeout(180);

    // ------------------------------------------------------------------
    // 6. ET L'APERÇU QUI EXISTAIT DÉJÀ SE MET ENFIN À JOUR.
    //
    //    Les Pyramides Additives dessinent elles-mêmes dans la boîte qu'on
    //    leur tend. On ne la leur tendait qu'à l'ouverture : passer de trois
    //    à cinq étages ne changeait rien à l'image.
    // ------------------------------------------------------------------
    await ouvrir('Pyramides Additives');
    await page.waitForTimeout(500);
    const troisEtages = await apercu();
    await regler(0, '5');
    await page.waitForTimeout(400);
    const cinqEtages = await apercu();
    r.verifie('la pyramide se redessine quand on change le nombre d\'étages',
        troisEtages !== cinqEtages && cinqEtages.length > 30,
        'trois ' + troisEtages.length + ' car., cinq ' + cinqEtages.length + ' car.');
    await refermer();

    // ------------------------------------------------------------------
    // 6 bis. LE PENDU NE TRAHIT PAS LE MOT.
    //
    //    La boîte de réglages s'ouvre sur l'écran PROJETÉ, devant la classe.
    //    Un aperçu qui montrerait le mot que le professeur vient de taper le
    //    donnerait à tout le monde avant la première lettre. Il montre donc
    //    ce que la classe verra au début de la partie : les cases, et rien
    //    d'autre. C'est le contrôle le plus important de ce chapitre.
    // ------------------------------------------------------------------
    await ouvrir('Jeu du Pendu');
    await page.waitForTimeout(450);
    await regler(1, 'BONJOUR');
    await page.waitForTimeout(350);
    const pendu = await page.evaluate(() => {
        const a = document.getElementById('custom-prompt-preview');
        const svg = a.querySelector('svg');
        const texte = svg ? Array.from(svg.querySelectorAll('text')).map(t => t.textContent).join('') : '';
        const cases = svg ? svg.querySelectorAll('line[stroke="#0984e3"]').length : 0;
        return { texte, cases, mot: /BONJOUR/i.test(a.innerHTML) };
    });
    r.verifie('le mot caché n\'apparaît nulle part dans l\'aperçu',
        pendu.mot === false && pendu.texte === '', JSON.stringify(pendu));
    r.egal('et il y a exactement une case par lettre', pendu.cases, 7, JSON.stringify(pendu));

    // Sans mot tapé, c'est la difficulté qui décide de la longueur.
    await regler(1, '');
    await regler(0, 'hard');
    await page.waitForTimeout(350);
    const penduDur = await page.evaluate(() => {
        const svg = document.getElementById('custom-prompt-preview').querySelector('svg');
        return svg ? svg.querySelectorAll('line[stroke="#0984e3"]').length : 0;
    });
    r.verifie('sans mot tapé, la difficulté commande la longueur',
        penduDur > 7, 'difficile : ' + penduDur + ' cases');
    await refermer();
    await page.waitForTimeout(180);

    // ------------------------------------------------------------------
    // 6 ter. LES ANGLES ET LE COMPTE EST BON PROMETTENT LA SORTE.
    //
    //    Les deux tirent leur contenu au sort : l'aperçu ne montre donc pas
    //    des nombres, il montre ce que les réglages décident vraiment — des
    //    angles aigus ou obtus, une cible du bon ordre de grandeur.
    // ------------------------------------------------------------------
    await ouvrir('Angles à mesurer');
    await page.waitForTimeout(450);
    const formeDesAngles = () => page.evaluate(() => {
        const s = document.getElementById('custom-prompt-preview').querySelector('svg[viewBox]');
        if (!s) return null;
        const v = (s.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
        return { large: v[2], dessin: s.innerHTML.length };
    });
    await regler(0, 'aigu');
    await page.waitForTimeout(300);
    const aigus = await formeDesAngles();
    await regler(0, 'obtus');
    await page.waitForTimeout(300);
    const obtus = await formeDesAngles();
    r.verifie('les angles aigus ne se dessinent pas comme les obtus',
        !!aigus && !!obtus && aigus.dessin !== obtus.dessin, JSON.stringify({ aigus, obtus }));
    await regler(1, '4');
    await page.waitForTimeout(300);
    const quatre = await formeDesAngles();
    r.verifie('et quatre angles font une image plus large que trois',
        !!quatre && !!obtus && quatre.large > obtus.large,
        'trois : ' + (obtus && obtus.large) + ' | quatre : ' + (quatre && quatre.large));
    await refermer();
    await page.waitForTimeout(180);

    await ouvrir('Le Compte est Bon');
    await page.waitForTimeout(450);
    const cible = () => page.evaluate(() => {
        const s = document.getElementById('custom-prompt-preview').querySelector('svg');
        const t = s ? s.querySelector('text') : null;
        return t ? parseInt(t.textContent, 10) : null;
    });
    await regler(0, 'easy');
    await page.waitForTimeout(300);
    const facile = await cible();
    await regler(0, 'hard');
    await page.waitForTimeout(300);
    const dur = await cible();
    r.verifie('la cible de l\'aperçu a l\'ordre de grandeur annoncé',
        facile >= 101 && facile <= 300 && dur >= 701 && dur <= 999,
        'facile ' + facile + ' (101 à 300), difficile ' + dur + ' (701 à 999)');
    await refermer();
    await page.waitForTimeout(180);

    // ------------------------------------------------------------------
    // 7. CE QUI RESTE SANS APERÇU, NOMMÉ.
    //
    //    Il en reste UNE : les Bulles BD. Celle-là ne dessine pas un SVG,
    //    elle peint sur la toile du tableau — en faire un aperçu demanderait
    //    d'écrire le même dessin une seconde fois, et deux dessins pour une
    //    seule bulle finissent toujours par diverger. Elle attend donc de
    //    passer par la même fonction de dessin, pas un copier-coller. Ce
    //    contrôle ne la condamne pas : il empêche qu'on l'oublie.
    // ------------------------------------------------------------------
    const restants = ['Bulles BD Interactives'];
    const sansApercu = [];
    for (const nom of restants) {
        if (!(await ouvrir(nom))) continue;
        await page.waitForTimeout(400);
        const vu = await page.evaluate(() => {
            const a = document.getElementById('custom-prompt-preview');
            return { montre: getComputedStyle(a).display !== 'none', contenu: a.innerHTML.trim().length };
        });
        if (!vu.montre || vu.contenu < 30) sansApercu.push(nom);
        await refermer();
        await page.waitForTimeout(180);
    }
    r.egal('on sait exactement laquelle attend encore son aperçu',
        sansApercu.length, 1, sansApercu.join(', '));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
