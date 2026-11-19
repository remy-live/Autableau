// PYTHON SUR LE TABLEAU.
//
// « On pourrait envisager un compilateur Python inline ? »
// « On pourrait intégrer skulpt.org ??? »
//
// Le programme s'exécute DANS la page — le cadre vers un autre site marchait,
// mais le code écrit devant la classe ne partait pas avec la séance, et une
// salle dont le pare-feu bloque ce site-là n'avait plus rien.
//
// ET LE MOTEUR EST MAINTENANT DANS L'APPLICATION. Il ne l'était pas : « je ne
// veux pas les embarquer hors ligne, ça fait trop gros ; quand on le charge, on
// appelle les CDN. » C'était juste — Brython pèse 6,1 Mo. Skulpt en fait 947
// Ko, six fois et demie moins, et le calcul change avec le poids. Python au
// tableau était la seule pièce de l'application qui demandait le réseau ; elle
// ne le demande plus, et c'est la première chose que ce chapitre éprouve.
//
// CE QU'ON Y A GAGNÉ EN CHEMIN : « input() », qui demande la valeur dans une
// boîte à nous au lieu de refuser, et la tortue, dont le tracé se pose au
// tableau comme un objet qu'on déplace et qu'on annote.
//
// ET CE QUI EST ÉPROUVÉ ICI, c'est ce qui est À NOUS : on ne juge pas la
// conformité du Python de Skulpt, on vérifie qu'un programme de classe tourne,
// que ses erreurs se lisent, qu'une boucle sans fin ne prend pas le tableau en
// otage, et que rien ne part vers l'extérieur.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Python sur le tableau');

    // ==================================================================
    // 1. CE QUI NE DEMANDE NI MOTEUR NI RÉSEAU
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof ouvrirUneFenetrePython === 'function'
            && typeof executerDuPython === 'function', { timeout: 20000 });
        // RIEN NE DOIT PARTIR VERS L'EXTÉRIEUR, de tout le chapitre. On compte
        // ici ce qui n'est ni un fichier du dossier, ni une donnée en ligne.
        const dehors = [];
        page.on('request', (req) => {
            const u = req.url();
            if (!/^(file|data|blob|about):/.test(u)) dehors.push(u);
        });

        // --- la lecture des « import »
        // --- la fenêtre est un post-it d'un mode de plus
        const ouverte = await page.evaluate(() => {
            const f = ouvrirUneFenetrePython({ code: 'print("bonjour")\n' });
            const el = document.querySelector('.html-postit.en-python');
            return {
                mode: f.mode, code: f.code,
                dansLaListe: htmlPostits.some(p => p.id === f.id),
                dom: !!el,
                codeAffiche: el && el.querySelector('.py-code').value,
                noteCachee: el && getComputedStyle(el.querySelector('.html-postit-body')).display,
                cadreWebCache: el && getComputedStyle(el.querySelector('.html-postit-web')).display,
                pythonVu: el && getComputedStyle(el.querySelector('.html-postit-python')).display,
                bouton: el && !!el.querySelector('.py-lancer'),
                // Il se déplace, se réduit, se ferme comme les autres : ce
                // sont les boutons du post-it, non réécrits.
                gestesDuPostit: el && ['.btn-min-postit', '.btn-close-postit', '.btn-ancre-postit']
                    .every(s => !!el.querySelector(s))
            };
        });
        r.egal('la fenêtre s\'ouvre en mode « python », dans la liste des post-its',
            { mode: ouverte.mode, dansLaListe: ouverte.dansLaListe, dom: ouverte.dom },
            { mode: 'python', dansLaListe: true, dom: true });
        r.egal('le programme demandé est posé dans l\'éditeur',
            ouverte.codeAffiche, 'print("bonjour")\n');
        r.egal('la note libre et le cadre web s\'effacent, Python paraît',
            { note: ouverte.noteCachee, web: ouverte.cadreWebCache, py: ouverte.pythonVu },
            { note: 'none', web: 'none', py: 'flex' });
        r.verifie('elle garde les gestes du post-it : réduire, fermer, ancrer',
            ouverte.gestesDuPostit && ouverte.bouton, JSON.stringify(ouverte));

        // --- le programme et sa sortie partent avec le tableau
        const garde = await page.evaluate(() => {
            const f = htmlPostits.find(p => p.mode === 'python');
            f.code = 'x = 1\nif x:\n    print("oui")\n';
            f.sortie = 'oui\n';
            saveState();
            const etat = JSON.stringify(stateForStorage());
            return { code: etat.includes('if x:'), sortie: etat.includes('oui') };
        });
        r.egal('le programme et ce qu\'il a affiché partent avec le tableau',
            garde, { code: true, sortie: true });

        const apresRechargement = await page.evaluate(async () => {
            // Le tour que fait un changement de page, et que ferait une
            // réouverture : on passe par du texte, on vide, on remet.
            const copie = JSON.parse(JSON.stringify(htmlPostits));
            htmlPostits = [];
            renderHtmlPostits();
            const pendant = document.querySelectorAll('.html-postit.en-python').length;
            htmlPostits = copie;
            renderHtmlPostits();
            await new Promise(ok => setTimeout(ok, 150));
            const f = htmlPostits.find(p => p.mode === 'python');
            const el = document.querySelector('.html-postit.en-python');
            return { pendant, retrouve: !!f, code: f && f.code,
                     dansLEditeur: el && el.querySelector('.py-code').value,
                     sortieVue: el && el.querySelector('.py-sortie').textContent };
        });
        r.egal('elle s\'en va avec sa page', apresRechargement.pendant, 0);
        r.verifie('la séance rouverte retrouve le programme dans son éditeur',
            apresRechargement.retrouve
            && apresRechargement.dansLEditeur === 'x = 1\nif x:\n    print("oui")\n',
            JSON.stringify(apresRechargement));
        r.egal('et la sortie est encore là, sans avoir à relancer',
            apresRechargement.sortieVue, 'oui\n');

        // --- la tabulation indente
        const tab = await page.evaluate(async () => {
            const el = document.querySelector('.html-postit.en-python');
            const champ = el.querySelector('.py-code');
            champ.value = 'for i in range(3):\n';
            champ.dispatchEvent(new Event('input'));
            champ.focus();
            champ.selectionStart = champ.selectionEnd = champ.value.length;
            const touche = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            champ.dispatchEvent(touche);
            await new Promise(ok => setTimeout(ok, 50));
            const f = htmlPostits.find(p => p.mode === 'python');
            return { valeur: champ.value, garde: f.code, curseur: champ.selectionStart,
                     // LE GESTE DU NAVIGATEUR EST BIEN REPRIS. Poser quatre
                     // espaces ne suffit pas : sans « preventDefault », la
                     // touche fait AUSSI son office et le curseur part sur le
                     // bouton « Exécuter » — on écrit alors une boucle et l'on
                     // sort du champ au moment de lui donner un corps.
                     repris: touche.defaultPrevented,
                     toujoursDedans: document.activeElement === champ };
        });
        r.verifie('et la touche ne fait plus AUSSI sortir du champ',
            tab.repris, String(tab.repris));
        r.egal('la tabulation pose quatre espaces au lieu de sauter au bouton suivant',
            { v: tab.valeur, c: tab.curseur, dedans: tab.toujoursDedans },
            { v: 'for i in range(3):\n    ', c: 'for i in range(3):\n    '.length, dedans: true });
        r.egal('et l\'indentation est retenue avec le reste', tab.garde, 'for i in range(3):\n    ');

        // --- copier / coller
        const presse = await page.evaluate(async () => {
            const el = document.querySelector('.html-postit.en-python');
            const f = htmlPostits.find(p => p.mode === 'python');
            f.code = 'def f():\n    return 1\n';
            el.querySelector('.py-code').value = f.code;
            let copie = null;
            const vrai = navigator.clipboard && navigator.clipboard.writeText;
            navigator.clipboard.writeText = async (t) => { copie = t; };
            el.querySelector('.btn-copier-postit').click();
            await new Promise(ok => setTimeout(ok, 120));
            if (vrai) navigator.clipboard.writeText = vrai;
            return { copie };
        });
        r.egal('copier rend le PROGRAMME, pas la note vide restée derrière',
            presse.copie, 'def f():\n    return 1\n');

        const colle = await page.evaluate(async () => {
            const el = document.querySelector('.html-postit.en-python');
            const f = htmlPostits.find(p => p.mode === 'python');
            f.code = '';
            el.querySelector('.py-code').value = '';
            const vrai = navigator.clipboard.readText;
            navigator.clipboard.readText = async () => 'for i in range(3):\n    print(i)\n\nprint("fin")\n';
            el.querySelector('.btn-coller-postit').click();
            await new Promise(ok => setTimeout(ok, 150));
            navigator.clipboard.readText = vrai;
            return { code: htmlPostits.find(p => p.mode === 'python').code,
                     champ: el.querySelector('.py-code').value };
        });
        r.verifie('coller garde l\'indentation — sans quoi les boucles perdent leur corps',
            /\n    print\(i\)/.test(colle.code), JSON.stringify(colle.code));
        r.verifie('et garde la ligne vide entre deux blocs',
            /\n\nprint\("fin"\)/.test(colle.code), JSON.stringify(colle.code));
        r.egal('ce qui est collé se voit dans l\'éditeur', colle.champ, colle.code);

        // --- LE REDESSIN D'UNE FENÊTRE DÉJÀ POSÉE
        // Le tableau se redessine à chaque coup de molette, à chaque zoom, au
        // retour d'une annulation. La fenêtre existe alors déjà : c'est le
        // chemin le plus fréquent, et le seul que les vérifications d'ouverture
        // ne touchent pas — elles, elles voient un élément tout neuf.
        const redessin = await page.evaluate(async () => {
            const f = htmlPostits.find(p => p.mode === 'python');
            const el = document.querySelector('.html-postit.en-python');
            const memeElement = el;
            // On lâche le champ : une vérification précédente y a laissé le
            // curseur, et l'on ne réécrit pas sous les doigts de qui tape —
            // c'est justement ce qu'on éprouve deux mesures plus bas.
            el.querySelector('.py-code').blur();
            // Ce qu'une annulation fait : l'objet change, la page se redessine.
            f.code = 'print("après annulation")\n';
            f.sortie = 'après annulation\n';
            renderHtmlPostits();
            await new Promise(ok => setTimeout(ok, 100));
            const apres = document.querySelector('.html-postit.en-python');
            return {
                memeElement: apres === memeElement,
                code: apres && apres.querySelector('.py-code').value,
                sortie: apres && apres.querySelector('.py-sortie').textContent,
                classe: apres && apres.classList.contains('en-python'),
                // Et l'on n'écrase PAS ce qu'on est en train de taper : la
                // fenêtre se redessine pendant qu'on écrit son programme.
                pendantLaFrappe: (() => {
                    const champ = apres.querySelector('.py-code');
                    champ.focus();
                    champ.value = 'je tape encore';
                    f.code = 'venu d’ailleurs';
                    renderHtmlPostits();
                    const garde = champ.value;
                    champ.blur();
                    return garde;
                })()
            };
        });
        r.verifie('une fenêtre déjà posée est bien la même après un redessin',
            redessin.memeElement && redessin.classe, JSON.stringify(redessin));
        r.egal('et son programme et sa sortie suivent l\'objet',
            { c: redessin.code, s: redessin.sortie },
            { c: 'print("après annulation")\n', s: 'après annulation\n' });
        r.egal('mais on n\'écrase pas le champ sous les doigts de qui écrit',
            redessin.pendantLaFrappe, 'je tape encore');

        // ET RIEN N'EST PARTI DEHORS. C'est le cœur du changement : ouvrir
        // la fenêtre, écrire, coller, exécuter — aucune requête ne sort.
        r.egal('rien n\'est allé chercher quoi que ce soit dehors', dehors.slice(), []);
        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 2. PYTHON EST DANS L'APPLICATION, PAS SUR INTERNET
    //
    // C'est tout le changement. On le prouve deux fois : rien ne sort, et
    // tout marche AVEC LE RÉSEAU COUPÉ — une salle sans wifi, un portable
    // en mode avion, le pare-feu d'un collège.
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof executerDuPython === 'function', { timeout: 20000 });
        const dehors = [];
        page.on('request', (req) => {
            const u = req.url();
            if (!/^(file|data|blob|about):/.test(u)) dehors.push(u);
        });

        await context.setOffline(true);
        const horsLigne = await page.evaluate(() =>
            executerDuPython('for i in range(3):\n    print(i * i)\n'));
        r.egal('un programme tourne RÉSEAU COUPÉ', horsLigne.sortie, '0\n1\n4\n');
        r.egal('et sans erreur', horsLigne.erreur, null);

        const avecImport = await page.evaluate(() =>
            executerDuPython('import math\nprint(round(math.pi, 3))\n'));
        r.egal('la bibliothèque standard est là aussi, hors ligne',
            avecImport.sortie, '3.142\n');
        await context.setOffline(false);

        r.egal('et rien n\'est parti vers l\'extérieur', dehors.slice(), []);
        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 3. LE PROGRAMME S'EXÉCUTE VRAIMENT, ET SES ERREURS SE LISENT
    //
    // Un programme d'élève a le droit de planter : c'est même ce qu'on lui
    // apprend à lire. Ce qu'on éprouve, c'est que le message porte LE NOM de
    // l'erreur — le mot qu'on apprend à chercher — et LA BONNE LIGNE.
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof executerDuPython === 'function', { timeout: 20000 });
        const faire = (code, o) => page.evaluate(
            ([c, opt]) => executerDuPython(c, opt), [code, o || {}]);

        const accents = await faire('eleve = "Zoé"\nprint(f"Bonjour {eleve} !")\n');
        r.egal('les accents traversent le programme', accents.sortie, 'Bonjour Zoé !\n');

        const faute = await faire('a = 1\nb = 0\nprint(a / b)\n');
        r.verifie('l\'erreur porte son nom',
            /ZeroDivisionError/.test(faute.erreur || ''), JSON.stringify(faute));
        r.verifie('ET LA BONNE LIGNE — la troisième, celle que l\'élève a écrite',
            /\(ligne 3\)/.test(faute.erreur || ''),
            JSON.stringify(faute) + ' — décalée de six lignes du temps où un préambule précédait le programme');

        const avant = await faire('print("avant")\nprint(1 / 0)\n');
        r.egal('ce qui a été affiché AVANT l\'erreur est gardé', avant.sortie, 'avant\n');
        r.verifie('et l\'erreur est dite quand même', /ZeroDivisionError/.test(avant.erreur || ''),
            JSON.stringify(avant));

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 4. UNE BOUCLE SANS FIN NE PREND PAS LE TABLEAU EN OTAGE
    //
    // C'est la faute la plus fréquente de l'année : on oublie d'incrémenter
    // le compteur. Si le tableau gèle, le cours s'arrête — et il GELAIT :
    // mesuré sur deux secondes de boucle sans fin, zéro battement d'horloge
    // dans la page, rien ne répond, pas même le bouton « Arrêter ».
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof executerDuPython === 'function', { timeout: 20000 });

        const pouls = await page.evaluate(async () => {
            let battements = 0;
            const horloge = setInterval(() => { battements++; }, 20);
            const t = Date.now();
            const promesse = executerDuPython('i = 0\nwhile True:\n    i += 1\n', { limite: 1500 });
            const r = await promesse;
            clearInterval(horloge);
            return { battements, erreur: r.erreur, tropLong: !!r.tropLong, ms: Date.now() - t };
        });
        r.verifie('LE TABLEAU RESPIRE PENDANT QU\'UN PROGRAMME TOURNE',
            pouls.battements > 30,
            pouls.battements + ' battements en une seconde et demie — zéro quand les boucles n\'étaient pas interruptibles');
        r.verifie('et la boucle sans fin finit par s\'arrêter d\'elle-même',
            pouls.tropLong === true, JSON.stringify(pouls));
        r.verifie('et au bout du temps demandé, non de celui de la maison',
            pouls.ms < 5000, pouls.ms + ' ms pour une limite de 1500');
        r.verifie('le message dit ce qui s\'est passé, et en combien de temps',
            /2 secondes/.test(pouls.erreur || '') && /boucle sans fin/.test(pouls.erreur || ''),
            JSON.stringify(pouls.erreur));

        // ET « ARRÊTER » RÉPOND TOUT DE SUITE, sans attendre la limite.
        const arret = await page.evaluate(async () => {
            const t = Date.now();
            const promesse = executerDuPython('while True:\n    pass\n');
            setTimeout(() => arreterLePython(), 300);
            const r = await promesse;
            return { ms: Date.now() - t, erreur: r.erreur, arrete: !!r.arrete };
        });
        r.verifie('« Arrêter » coupe le programme en moins d\'une seconde',
            arret.arrete === true && arret.ms < 1000, JSON.stringify(arret));
        r.egal('et le dit comme un arrêt, non comme une faute', arret.erreur, 'Programme arrêté.');

        // LA LIMITE DE LA MAISON EST GÉNÉREUSE : un calcul d'une seconde et
        // demie, parfaitement légitime, ne doit pas être coupé.
        const longMaisHonnete = await page.evaluate(async () => {
            const t = Date.now();
            const r = await executerDuPython('s = 0\nfor i in range(120000):\n    s += i\nprint(s)\n');
            return { ms: Date.now() - t, sortie: r.sortie, erreur: r.erreur };
        });
        r.verifie('un calcul long mais honnête va jusqu\'au bout',
            longMaisHonnete.sortie === '7199940000\n' && !longMaisHonnete.erreur,
            JSON.stringify(longMaisHonnete));

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 5. « input() » DEMANDE DANS UNE BOÎTE À NOUS
    //
    // L'ancien moteur ouvrait celle du NAVIGATEUR, bannie de toute
    // l'application : elle n'a ni notre habillage ni le mode nuit, et sur
    // vidéoprojecteur elle s'affiche avec l'adresse du site en gros. On
    // refusait donc « input() » tout court.
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof executerDuPython === 'function', { timeout: 20000 });

        const promesse = page.evaluate(() =>
            executerDuPython('n = input("Ton nombre ?")\nprint("le double de", n, "est", int(n) * 2)\n'));
        await page.waitForTimeout(1200);
        const boite = await page.evaluate(() => {
            const m = document.getElementById('custom-prompt-modal');
            const t = m && m.querySelector('h3, .prompt-titre, #custom-prompt-title');
            return { ouverte: !!(m && m.getClientRects().length),
                     titre: t ? t.textContent.trim() : null };
        });
        r.verifie('une boîte DU TABLEAU s\'ouvre', boite.ouverte === true, JSON.stringify(boite));
        r.egal('et elle porte l\'invite du programme', boite.titre, 'Ton nombre ?');

        await page.evaluate(() => {
            const c = document.querySelector('#custom-prompt-modal input[type=text]');
            if (c) { c.value = '21'; c.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        // ON CLIQUE PAR LE CODE, et non par la souris : si la boîte ne
        // s'ouvre pas, un clic de souris attend trente secondes et fait
        // PLANTER la vérification, là où elle doit simplement tomber.
        await page.evaluate(() => {
            const b = document.getElementById('custom-prompt-ok');
            if (b) b.click();
        });
        const rendu = await promesse;
        r.egal('la valeur donnée revient au programme',
            rendu.sortie, 'le double de 21 est 42\n');

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 6. LA TORTUE DESSINE, ET SON TRACÉ VA AU TABLEAU
    //
    // C'est tout l'intérêt de l'avoir ICI plutôt que sur un autre site : le
    // dessin devient un objet du tableau, qu'on déplace, qu'on agrandit et
    // sur lequel on écrit au crayon — « regardez l'angle, là ».
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof ouvrirUneFenetrePython === 'function', { timeout: 20000 });

        r.egal('un programme qui n\'importe pas la tortue ne dessine pas',
            await page.evaluate(() => leCodeDessine('print(1)')), false);
        r.egal('« import turtle », si',
            await page.evaluate(() => leCodeDessine('import turtle\nt = turtle.Turtle()')), true);

        await page.evaluate(() => {
            images.length = 0;
            ouvrirUneFenetrePython({ code: 'import turtle\nt = turtle.Turtle()\nt.speed(0)\n'
                + 'for i in range(4):\n    t.forward(70)\n    t.left(90)\n' });
        });
        await page.waitForTimeout(500);
        r.egal('la zone de tracé reste cachée tant qu\'on n\'a pas lancé',
            await page.evaluate(() => document.querySelector('.py-tortue').hidden), true);

        await page.evaluate(() => {
            const b = document.querySelector('.py-lancer');
            if (b) b.click();
        });
        await page.waitForTimeout(2500);
        const trace = await page.evaluate(() => ({
            zone: !document.querySelector('.py-tortue').hidden,
            poser: !document.querySelector('.py-poser').hidden,
            encre: laTortueADessine(document.querySelector('.py-tortue')),
            sortie: document.querySelector('.py-sortie').textContent
        }));
        r.verifie('la tortue a dessiné, et la zone s\'ouvre',
            trace.zone && trace.encre, JSON.stringify(trace));
        // ET LA FENÊTRE NE DIT PAS QUE LE PROGRAMME EST MUET. Vu à l'essai :
        // « (le programme n'a rien affiché) » sous une rosace de trente-six
        // branches qu'on venait de regarder se tracer.
        r.verifie('elle ne prétend pas que le programme n\'a rien affiché',
            !/rien affiché/.test(trace.sortie || ''), JSON.stringify(trace.sortie));
        r.verifie('et l\'on propose de poser le dessin au tableau',
            trace.poser === true, JSON.stringify(trace));

        await page.evaluate(() => {
            const b = document.querySelector('.py-poser');
            if (b) b.click();
        });
        await page.waitForTimeout(400);
        const pose = await page.evaluate(() => {
            const z = document.querySelector('.py-tortue');
            const toile = z.querySelector('canvas');
            return images.map(i => ({
                plugin: (i.pluginData || {}).id, l: Math.round(i.w), h: Math.round(i.h),
                image: /^data:image\/png/.test(i.src || ''),
                zone: { l: toile ? toile.width : 0, h: toile ? toile.height : 0 }
            }));
        });
        r.egal('le tracé est un objet du tableau', pose.length, 1, JSON.stringify(pose));
        r.verifie('une vraie image, à la taille où elle a été tracée',
            pose[0] && pose[0].image && pose[0].l > 50 && pose[0].h > 50, JSON.stringify(pose));
        // ON POSE LE DESSIN, PAS LA TOILE. Vu à l'essai : une rosace arrivait au
        // tableau dans tout le rectangle blanc de la zone de tracé — on déplaçait
        // et l'on agrandissait surtout du vide.
        r.verifie('ET IL EST RECADRÉ SUR SON ENCRE, non sur la zone entière',
            pose[0] && pose[0].l < pose[0].zone.l - 40 && pose[0].h < pose[0].zone.h - 40,
            JSON.stringify(pose) + ' — toute la zone de tracé avant le recadrage');

        // ET UN DESSIN DE TAILLE ORDINAIRE N'EST PAS COUPÉ.
        //
        // Vu à l'essai : la zone de tracé se contentait de son minimum — 616
        // pixels de large pour 180 de haut — et tout ce qui dépassait deux
        // cents pixels y était tranché. Un carré de deux cent quarante, c'est
        // le premier exercice de tortue de l'année.
        await page.evaluate(async () => {
            const o = htmlPostits.find(h => h.mode === 'python');
            o.w = 620; o.h = 560;
            renderHtmlPostits();
            await new Promise(k => setTimeout(k, 150));
            const p2 = htmlPostits.find(h => h.mode === 'python');
            p2.code = 'import turtle\nt = turtle.Turtle()\nt.speed(0)\nt.hideturtle()\n'
                + 't.penup()\nt.goto(-120, -120)\nt.pendown()\n'
                + 'for i in range(4):\n    t.forward(240)\n    t.left(90)\n';
            document.querySelector('.py-code').value = p2.code;
        });
        await page.evaluate(() => {
            const b = document.querySelector('.py-lancer');
            if (b) b.click();
        });
        await page.waitForTimeout(2500);
        const carre = await page.evaluate(() => {
            const c = recadrerSurLEncre(aplatirLeDessin(document.querySelector('.py-tortue')));
            const toile = document.querySelector('.py-tortue canvas');
            return { dessin: c ? { l: c.width, h: c.height } : null,
                     zone: toile ? { l: toile.width, h: toile.height } : null };
        });
        r.verifie('un carré de 240 pixels tient dans la zone, sans être coupé',
            carre.dessin && carre.dessin.h >= 240 && carre.dessin.h <= 290,
            JSON.stringify(carre) + ' — tranché à 180 quand la zone gardait sa hauteur minimale');

        // ON RELANCE LE MÊME PROGRAMME, et il doit dessiner de nouveau.
        //
        // La tortue garde son module en mémoire, et avec lui la toile de la
        // fois d'avant — une toile qui n'est plus dans la page, puisqu'on
        // repart d'un tracé blanc. Sans l'oubli de ce module, la deuxième
        // exécution dessinait dans le vide : la zone restait blanche et l'on
        // croyait le programme muet. Or corriger puis relancer, c'est
        // exactement ce qu'on fait devant une classe.
        await page.evaluate(() => {
            const b = document.querySelector('.py-lancer');
            if (b) b.click();
        });
        await page.waitForTimeout(2500);
        r.verifie('ET LA DEUXIÈME EXÉCUTION DESSINE AUSSI',
            await page.evaluate(() => laTortueADessine(document.querySelector('.py-tortue'))),
            'zone restée blanche — le module gardait la toile de la fois d\'avant');

        // ET UN PROGRAMME QUI IMPORTE LA TORTUE SANS RIEN TRACER ne propose
        // pas de poser une page blanche au tableau.
        await page.evaluate(() => {
            const o = htmlPostits.find(h => h.mode === 'python');
            o.code = 'import turtle\nt = turtle.Turtle()\n';
            document.querySelector('.py-code').value = o.code;
        });
        await page.evaluate(() => {
            const b = document.querySelector('.py-lancer');
            if (b) b.click();
        });
        await page.waitForTimeout(2000);
        r.egal('rien de tracé, rien à poser',
            await page.evaluate(() => document.querySelector('.py-poser').hidden), true);

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 7. LE PROGRAMME ÉCRIT À LA MAIN AU TABLEAU SE LANCE
    //
    // On écrit le programme pendant le cours, dans un texte, comme le reste
    // de la leçon. Le bouton ne paraît que si ce texte EST un programme :
    // sous chaque titre et chaque consigne, il encombrerait la barre.
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof executerLeTexteDuTableau === 'function', { timeout: 20000 });

        const lu = await page.evaluate(() => ({
            boucle: leTexteEstDuPython('for i in range(3):\n    print(i)'),
            unPrint: leTexteEstDuPython('print("bonjour")'),
            fonction: leTexteEstDuPython('def double(x):\n    return 2 * x'),
            lecon: leTexteEstDuPython('Il est important de relire la consigne.'),
            titre: leTexteEstDuPython('Exercice 4 : les boucles'),
            vide: leTexteEstDuPython('   ')
        }));
        r.verifie('une boucle, un print, une fonction : ce sont des programmes',
            lu.boucle && lu.unPrint && lu.fonction, JSON.stringify(lu));
        r.verifie('une consigne française n\'en est pas un, « important » ou non',
            lu.lecon === false && lu.titre === false && lu.vide === false, JSON.stringify(lu));

        const marche = await page.evaluate(async () => {
            texts.length = 0; htmlPostits.length = 0;
            const t = { id: nextId++, type: 'text', x: 100, y: 100,
                        content: 'for i in range(3):\n    print(i * i)',
                        color: '#000', fontSize: 24, fontFamily: 'Roboto', z: globalZ++ };
            texts.push(t);
            selectedItems = [{ type: 'text', id: t.id }];
            updateStyleBarContext();
            const barre = document.getElementById('bar-style').classList.contains('ctx-python');
            const visible = !!document.querySelector('.group-python').getClientRects().length;
            const f = executerLeTexteDuTableau();
            await new Promise(k => setTimeout(k, 2500));
            const el = document.querySelector('.html-postit[data-id="' + f.id + '"]');
            return { barre, visible, code: f.code,
                     sortie: el ? el.querySelector('.py-sortie').textContent : null,
                     texteIntact: texts[0].content };
        });
        r.verifie('le bouton paraît dans la barre pour un texte qui est un programme',
            marche.barre && marche.visible, JSON.stringify(marche));
        r.egal('il emmène le programme dans une fenêtre',
            marche.code, 'for i in range(3):\n    print(i * i)');
        r.egal('et l\'exécute', marche.sortie, '0\n1\n4\n');
        // LE TEXTE DU TABLEAU EST LA TRACE DE LA LEÇON : on ne le remplace pas
        // par la fenêtre, et corriger dans la fenêtre ne défait pas ce qui a
        // été écrit devant la classe.
        r.egal('le texte écrit au tableau n\'a pas bougé',
            marche.texteIntact, 'for i in range(3):\n    print(i * i)');

        const consigne = await page.evaluate(() => {
            const t = { id: nextId++, type: 'text', x: 100, y: 400,
                        content: 'Exercice 4 : recopier le programme ci-dessus.',
                        color: '#000', fontSize: 24, fontFamily: 'Roboto', z: globalZ++ };
            texts.push(t);
            selectedItems = [{ type: 'text', id: t.id }];
            updateStyleBarContext();
            return document.getElementById('bar-style').classList.contains('ctx-python');
        });
        r.egal('et il ne paraît pas sous une consigne', consigne, false);

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    return r.bilan();
};
