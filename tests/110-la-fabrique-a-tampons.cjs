// LA FABRIQUE À TAMPONS, ET LA FENÊTRE QUI NE ROGNE PLUS.
//
// « C'est un peu coupé. Rajoute bien plus de tampons, et des un peu fun.
//  Ajoute une fabrique à tampons. »
//
// LE ROGNAGE VENAIT DE DEUX CHOSES QUI S'ADDITIONNAIENT. La barre de titre
// commune réserve 34 px en haut et se pose PAR-DESSUS le contenu ; et chaque
// tampon est tourné de cinq degrés, si bien que ses coins montent au-dessus de
// sa boîte. Le haut de « FAUX ! » et de « VU » passait donc sous la barre.
//
// ET LA FENÊTRE NE SE BORNE PAS ELLE-MÊME. Un « max-height » posé sur elle est
// écrasé par « ramenerFenetreDansLecran », qui le remplace pour la garder dans
// l'écran — mesuré, la fenêtre faisait 846 px pour une borne demandée à 620.
// C'est donc le CORPS qui se borne et qui défile ; la borne de la fenêtre
// appartient à qui la pose, et on ne la lui dispute pas.
//
// LA FABRIQUE, elle, tient en deux champs : le mot, et sa couleur. Un
// formulaire de six réglages pour écrire « SUPER » serait plus long à remplir
// que le tampon n'est utile.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La fabrique à tampons');

    // ------------------------------------------------------------------
    // 1. LA FENÊTRE TIENT DANS L'ÉCRAN, ET NE ROGNE RIEN — Y COMPRIS SUR UN
    //    VIDÉOPROJECTEUR DE SALLE DE CLASSE.
    //
    //    1024 × 600 n'est pas un cas tordu : c'est ce que beaucoup de salles
    //    projettent, et c'est là que les fenêtres débordent.
    // ------------------------------------------------------------------
    for (const [l, h] of [[1024, 600], [1280, 800]]) {
        const { context, page, erreurs } = await ouvrirApp(browser,
            { viewport: { width: l, height: h } });
        await tableauVierge(page);
        // LA BARRE DE TITRE COMMUNE ARRIVE APRÈS COUP. Elle est posée par un
        // observateur qui regarde ce qui entre dans la page : mesurée dans la
        // foulée de l'ouverture, elle n'existe pas encore, et le contrôle qui
        // la cherchait trouvait « null » au lieu de la trouver vide.
        await page.evaluate(() => PluginManager.plugins.extremeStampTool.openWidget());
        await page.waitForTimeout(400);
        const m = await page.evaluate(() => {
            const p = PluginManager.plugins.extremeStampTool;
            if (!p) return null;
            const w = p.widgetEl;
            if (!w) return null;
            const rW = w.getBoundingClientRect();
            const corps = document.getElementById('es-corps');
            const premier = document.querySelector('.es-btn');
            const rP = premier ? premier.getBoundingClientRect() : null;
            const garder = document.getElementById('es-garder');
            const rG = garder ? garder.getBoundingClientRect() : null;
            return {
                dansLEcran: rW.top >= -1 && rW.bottom <= window.innerHeight + 1
                    && rW.left >= -1 && rW.right <= window.innerWidth + 1,
                hauteur: Math.round(rW.height),
                margeHaut: rP ? Math.round(rP.top - rW.top) : null,
                // CE QU'ON MESURE VRAIMENT : AUCUN TAMPON NE PASSE SOUS LA
                // BARRE DE TITRE.
                //
                // La première version comparait la marge haute à 34 px, la
                // hauteur de la barre. Elle ne mordait pas : en retirant les
                // dix pixels de marge qui corrigent le rognage, la marge
                // tombait à 44 et le contrôle passait encore. Un seuil écrit à
                // la main ne vaut que ce que vaut sa marge — on prend donc la
                // barre elle-même, là où elle est, et l'on regarde si un
                // tampon la recouvre. Les boîtes sont celles de l'écran,
                // rotation des cinq degrés comprise.
                sousLaBarre: (() => {
                    const barre = w.querySelector('.fen-tete');
                    if (!barre) return ['PAS DE BARRE'];
                    const rB = barre.getBoundingClientRect();
                    return Array.from(w.querySelectorAll('.es-btn')).filter(b => {
                        const r = b.getBoundingClientRect();
                        return r.top < rB.bottom && r.bottom > rB.top
                            && r.left < rB.right && r.right > rB.left;
                    }).map(b => (b.textContent || '').trim().slice(0, 14));
                })(),
                // ET LA FENÊTRE NE MANGE PAS LE TABLEAU. Sans borne sur son
                // corps, elle montait à 846 px sur un écran de 900 : un outil
                // de correction qui recouvre la copie qu'on corrige.
                partDeLEcran: Math.round(100 * rW.height / window.innerHeight),
                corpsDefile: corps ? corps.scrollHeight > corps.clientHeight + 2 : null,
                fabrique: !!document.getElementById('es-fabriquer'),
                caseDansLEcran: rG ? (rG.bottom <= window.innerHeight + 1) : null
            };
        });
        const ou = `${l}×${h}`;
        r.verifie(`à ${ou}, la fenêtre tient entière dans l'écran`,
            !!m && m.dansLEcran, JSON.stringify(m));
        r.egal(`à ${ou}, aucun tampon ne passe sous la barre de titre`,
            m ? m.sousLaBarre : null, [], JSON.stringify(m));
        r.verifie(`à ${ou}, la fenêtre laisse voir un cinquième du tableau`,
            !!m && m.partDeLEcran > 0 && m.partDeLEcran <= 80, JSON.stringify(m));
        r.egal(`à ${ou}, le corps défile au lieu de pousser la fenêtre`,
            m && m.corpsDefile, true, JSON.stringify(m));
        r.egal(`à ${ou}, la fabrique reste atteignable`, m && m.fabrique, true,
            JSON.stringify(m));
        r.egal(`à ${ou}, la case « garder » reste visible sous le défilement`,
            m && m.caseDansLEcran, true, JSON.stringify(m));
        r.verifie(`aucune erreur de page à ${ou}`, erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ------------------------------------------------------------------
    // La suite se joue sur un seul écran.
    // ------------------------------------------------------------------
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);
    await page.evaluate(() => PluginManager.plugins.extremeStampTool.openWidget());

    // ------------------------------------------------------------------
    // 2. LA FABRIQUE FAIT UN TAMPON, ET IL SE POSE COMME LES AUTRES.
    // ------------------------------------------------------------------
    const avant = await page.evaluate(() => PluginManager.plugins.extremeStampTool.stamps.length);
    const fait = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        const teinte = document.querySelector('.es-teinte[data-couleur="#6c5ce7"]');
        if (teinte) teinte.click();
        const champ = document.getElementById('es-mot');
        champ.value = 'tu assures';           // en minuscules, exprès
        document.getElementById('es-fabriquer').click();
        const dernier = p.perso[p.perso.length - 1] || null;
        return { perso: p.perso.length, dernier, total: p.stamps.length,
                 boutons: document.querySelectorAll('.es-btn').length,
                 champVide: (document.getElementById('es-mot').value || '') === '' };
    });
    r.egal('un tampon fabriqué s\'ajoute à la liste', fait.total, avant + 1,
        JSON.stringify(fait));
    r.egal('et la grille le montre', fait.boutons, avant + 1, JSON.stringify(fait));
    // ON ÉCRIT « tu assures », ON OBTIENT « TU ASSURES » : un tampon est en
    // capitales, et le lui demander à la main serait lui demander un détail
    // que la machine connaît.
    r.egal('son mot est mis en capitales tout seul',
        fait.dernier && fait.dernier.text, 'TU ASSURES', JSON.stringify(fait));
    r.egal('et il porte la couleur choisie', fait.dernier && fait.dernier.color, '#6c5ce7',
        JSON.stringify(fait));
    r.egal('le champ se vide, prêt pour le suivant', fait.champVide, true,
        JSON.stringify(fait));

    // IL SE POSE VRAIMENT. Un tampon qu'on fabrique et qui ne s'appose pas
    // serait une fabrique de décor.
    const posee = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        p.conserver = true;                 // on le garde, pour pouvoir le mesurer
        p.activeStamp = p.stamps.find(s => s.text === 'TU ASSURES');
        mode = 'extremeStampTool';
        const n = images.length;
        p.onPointerDown({ x: 400, y: 300 });
        const img = images[images.length - 1] || null;
        return { pose: images.length - n, largeur: img ? img.w : null,
                 compte: p.compteDe('TU ASSURES') };
    });
    r.egal('le tampon fabriqué se pose sur le tableau', posee.pose, 1,
        JSON.stringify(posee));
    r.egal('et il est compté comme les autres', posee.compte, 1, JSON.stringify(posee));

    // ------------------------------------------------------------------
    // 3. LE TAMPON S'ÉLARGIT POUR SON MOT.
    //
    //    La taille était figée à 200 × 80 pour tout le monde. Avec « SANS
    //    COMMENTAIRE », seize caractères à 40 px de Courier font près de
    //    quatre cents pixels : le mot sortait du cadre des deux côtés, et le
    //    cadre n'entourait plus rien.
    // ------------------------------------------------------------------
    const tailles = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        return { court: p.tailleDuTampon('VU'), long: p.tailleDuTampon('SANS COMMENTAIRE'),
                 tresLong: p.tailleDuTampon('ABCDEFGHIJKLMNOPQRSTUVWX') };
    });
    r.egal('un mot court garde la taille d\'avant : rien n\'a changé pour lui',
        tailles.court.w, 200, JSON.stringify(tailles));
    r.verifie('un mot long élargit le tampon',
        tailles.long.w > 400, JSON.stringify(tailles));
    r.verifie('et il grandit avec le mot, sans plafond qui le tranche',
        tailles.tresLong.w > tailles.long.w, JSON.stringify(tailles));
    r.egal('la hauteur, elle, ne bouge pas', [tailles.court.h, tailles.long.h], [80, 80],
        JSON.stringify(tailles));

    // ------------------------------------------------------------------
    // 4. ON NE FABRIQUE PAS DEUX FOIS LE MÊME MOT.
    //
    //    Les comptes sont tenus PAR TEXTE : un doublon ferait grimper les deux
    //    pastilles ensemble sans qu'on comprenne pourquoi.
    // ------------------------------------------------------------------
    const doublon = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        const n = p.stamps.length;
        const champ = document.getElementById('es-mot');
        champ.value = 'TU ASSURES';
        document.getElementById('es-fabriquer').click();
        const apresDoublon = p.stamps.length;
        // Et un mot vide ne fabrique rien non plus.
        champ.value = '   ';
        document.getElementById('es-fabriquer').click();
        return { n, apresDoublon, apresVide: p.stamps.length };
    });
    r.egal('un mot déjà pris ne fabrique rien', doublon.apresDoublon, doublon.n,
        JSON.stringify(doublon));
    r.egal('un mot vide non plus', doublon.apresVide, doublon.n, JSON.stringify(doublon));

    // UN TAMPON LIVRÉ NE SE DOUBLE PAS DAVANTAGE.
    const livre = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        const n = p.stamps.length;
        document.getElementById('es-mot').value = 'génie';
        document.getElementById('es-fabriquer').click();
        return { n, apres: p.stamps.length };
    });
    r.egal('et refabriquer un tampon livré ne le double pas',
        livre.apres, livre.n, JSON.stringify(livre));

    // ------------------------------------------------------------------
    // 5. CE QU'ON FABRIQUE SE JETTE ; CE QUI EST LIVRÉ, NON.
    //
    //    On peut défaire ce qu'on a fait. On ne peut pas amputer la boîte.
    // ------------------------------------------------------------------
    const croix = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        return {
            croix: document.querySelectorAll('.es-jeter').length,
            perso: p.perso.length,
            livres: p.TAMPONS_LIVRES.length
        };
    });
    r.egal('seul le tampon fabriqué porte sa croix', croix.croix, croix.perso,
        JSON.stringify(croix));
    r.verifie('et les tampons livrés n\'en ont aucune',
        croix.perso < croix.livres, JSON.stringify(croix));

    const jete = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        const n = p.stamps.length;
        // On l'arme d'abord : jeter le tampon qu'on tient doit aussi lâcher le
        // mode, sinon le tableau attend qu'on pose un tampon qui n'existe plus.
        p.activeStamp = p.perso[0];
        mode = 'extremeStampTool';
        document.querySelector('.es-jeter').click();
        return { n, apres: p.stamps.length, perso: p.perso.length,
                 tenu: !!p.activeStamp, mode: mode };
    });
    r.egal('la croix jette le tampon fabriqué', jete.apres, jete.n - 1,
        JSON.stringify(jete));
    r.egal('et elle lâche le tampon qu\'on tenait', jete.tenu, false, JSON.stringify(jete));
    r.verifie('le tableau n\'attend plus qu\'on pose un tampon disparu',
        jete.mode !== 'extremeStampTool', JSON.stringify(jete));

    // ------------------------------------------------------------------
    // 6. CE QU'ON FABRIQUE SURVIT À LA SÉANCE.
    // ------------------------------------------------------------------
    const garde = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        document.getElementById('es-mot').value = 'chef';
        document.getElementById('es-fabriquer').click();
        const ecrit = localStorage.getItem('auTableau_tampon_extreme_v1') || '';
        // On oublie tout en mémoire, comme au chargement d'une page neuve.
        p.perso = [];
        p.lireLesReglages();
        return { ecrit: /CHEF/.test(ecrit), relu: p.perso.map(t => t.text),
                 dansLaListe: p.stamps.some(t => t.text === 'CHEF') };
    });
    r.egal('le tampon fabriqué est écrit sur le disque', garde.ecrit, true,
        JSON.stringify(garde));
    r.egal('et il revient au démarrage suivant', garde.relu, ['CHEF'],
        JSON.stringify(garde));
    r.egal('dans la même liste que les autres', garde.dansLaListe, true,
        JSON.stringify(garde));

    // UN DISQUE ABÎMÉ NE CASSE PAS L'OUTIL. Ce qui vient du stockage est
    // étranger : on le relit comme tel.
    const abime = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        localStorage.setItem('auTableau_tampon_extreme_v1', JSON.stringify({
            conserver: true,
            perso: [{ text: 'BON' }, { text: '   ' }, { color: '#fff' },
                    null, { text: 'SALE', color: 'javascript:void(0)' }]
        }));
        p.perso = [];
        p.lireLesReglages();
        return { gardes: p.perso.map(t => ({ t: t.text, c: t.color })) };
    });
    r.egal('un tampon sans mot est écarté, et une couleur douteuse remplacée',
        abime.gardes, [{ t: 'BON', c: '#2d3436' }, { t: 'SALE', c: '#2d3436' }],
        JSON.stringify(abime));

    // ------------------------------------------------------------------
    // 7. LE TAMPON POSÉ N'EST PAS TRONQUÉ.
    //
    //    « Le tampon est un peu tronqué. » Il l'était : le cadre est peint
    //    INCLINÉ dans une toile taillée pour le cadre DROIT. Une boîte de
    //    200 × 80 tournée de 0,1 radian occupe 207 × 100 — le reste passait
    //    par-dessus bord.
    //
    //    ON NE CROIT PAS LE CALCUL SUR PAROLE : on peint le tampon et l'on
    //    COMPTE LES PIXELS QUI TOUCHENT LE BORD de la toile. Un seul pixel
    //    d'encre sur un bord, c'est un trait qui continuait dehors. Mesuré
    //    avant correction : 31 pour « VU », 75 pour « SANS COMMENTAIRE » — un
    //    tampon large dépasse davantage, puisque c'est sa largeur qui le fait
    //    monter en tournant.
    // ------------------------------------------------------------------
    const bords = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        const out = {};
        for (const mot of ['VU', 'ÉPIQUE', 'CHEF-D\'ŒUVRE', 'SANS COMMENTAIRE']) {
            const t = p.toileDuTampon(mot);
            const c = document.createElement('canvas'); c.width = t.w; c.height = t.h;
            const x = c.getContext('2d');
            x.translate(t.w / 2, t.h / 2); x.rotate(-p.INCLINAISON_TAMPON);
            p.dessinerLeTampon(x, { text: mot, color: '#6c5ce7' }, t.cadre.w, t.cadre.h);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 0; i < c.width; i++) {
                if (d[i * 4 + 3] > 20) n++;
                if (d[((c.height - 1) * c.width + i) * 4 + 3] > 20) n++;
            }
            for (let j = 0; j < c.height; j++) {
                if (d[(j * c.width) * 4 + 3] > 20) n++;
                if (d[(j * c.width + c.width - 1) * 4 + 3] > 20) n++;
            }
            out[mot] = { bord: n, toile: [t.w, t.h], cadre: [t.cadre.w, t.cadre.h] };
        }
        return out;
    });
    const coupes = Object.keys(bords).filter(m => bords[m].bord > 0);
    r.egal('aucun tampon ne touche le bord de sa toile : rien n\'est coupé',
        coupes, [], JSON.stringify(bords));
    // LA TOILE EST PLUS HAUTE QUE LE CADRE, et c'est la correction même : si
    // les deux faisaient la même hauteur, l'inclinaison déborderait.
    r.verifie('la toile est plus haute que le cadre, pour loger l\'inclinaison',
        Object.keys(bords).every(m => bords[m].toile[1] > bords[m].cadre[1]),
        JSON.stringify(bords));
    // Et un tampon large monte plus qu'un étroit : c'est sa largeur qui le
    // fait dépasser en tournant.
    r.verifie('et un tampon large demande une toile plus haute qu\'un étroit',
        bords['SANS COMMENTAIRE'].toile[1] > bords['VU'].toile[1],
        JSON.stringify({ large: bords['SANS COMMENTAIRE'].toile, court: bords['VU'].toile }));

    // L'IMAGE POSÉE PREND LA TAILLE DE LA TOILE. Garder celle du cadre
    // étirerait le dessin pour le faire entrer, et le tampon paraîtrait écrasé.
    const posee2 = await page.evaluate(() => {
        const p = PluginManager.plugins.extremeStampTool;
        p.conserver = true;
        p.activeStamp = p.stamps.find(s => s.text === 'ÉPIQUE');
        mode = 'extremeStampTool';
        p.onPointerDown({ x: 600, y: 400 });
        const img = images[images.length - 1];
        const t = p.toileDuTampon('ÉPIQUE');
        return { img: [img.w, img.h], toile: [t.w, t.h], cw: img.cw, ch: img.ch };
    });
    r.egal('l\'image posée a exactement la taille de sa toile',
        posee2.img, posee2.toile, JSON.stringify(posee2));
    r.egal('et son cadrage n\'étire rien', [posee2.cw, posee2.ch], posee2.toile,
        JSON.stringify(posee2));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
