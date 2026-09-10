// Ouvrir un cours déjà écrit : .txt, .md, .docx (Word) et .odt (LibreOffice).
// Les deux derniers sont des archives ZIP de XML : on en fabrique de vraies
// ici, l'une compressée, l'autre non, pour éprouver les deux chemins.
const zlib = require('zlib');
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

// --- Un mini-graveur de ZIP, juste pour les besoins du test ---
const TABLE_CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function graverZip(entrees, compresser) {
    const morceaux = [];
    const central = [];
    let decalage = 0;

    entrees.forEach(({ nom, contenu }) => {
        const brut = Buffer.from(contenu, 'utf8');
        const donnees = compresser ? zlib.deflateRawSync(brut) : brut;
        const methode = compresser ? 8 : 0;
        const nomBuf = Buffer.from(nom, 'utf8');
        const crc = crc32(brut);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(methode, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(donnees.length, 18);
        local.writeUInt32LE(brut.length, 22);
        local.writeUInt16LE(nomBuf.length, 26);
        morceaux.push(local, nomBuf, donnees);

        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4);
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(methode, 10);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(donnees.length, 20);
        cd.writeUInt32LE(brut.length, 24);
        cd.writeUInt16LE(nomBuf.length, 28);
        cd.writeUInt32LE(decalage, 42);
        central.push(cd, nomBuf);

        decalage += local.length + nomBuf.length + donnees.length;
    });

    const corps = Buffer.concat(morceaux);
    const repertoire = Buffer.concat(central);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(entrees.length, 8);
    fin.writeUInt16LE(entrees.length, 10);
    fin.writeUInt32LE(repertoire.length, 12);
    fin.writeUInt32LE(corps.length, 16);
    return Buffer.concat([corps, repertoire, fin]);
}

const DOCX = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Les fractions</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Une fraction est un </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>quotient</w:t></w:r><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t> de deux entiers.</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Le numérateur</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Le dénominateur</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Titre2"/></w:pPr><w:r><w:t>À retenir</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>On simplifie</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>toujours.</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>2/4</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1/2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

const ODT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
<office:automatic-styles>
  <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
  <text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>
</office:automatic-styles>
<office:body><office:text>
  <text:h text:outline-level="1">Le théorème de Pythagore</text:h>
  <text:p>Dans un triangle <text:span text:style-name="T1">rectangle</text:span>, on a <text:span text:style-name="T2">toujours</text:span> l'égalité.</text:p>
  <text:list text:style-name="L1">
    <text:list-item><text:p>L'hypoténuse</text:p></text:list-item>
    <text:list-item><text:p>Les côtés de l'angle droit</text:p></text:list-item>
  </text:list>
</office:text></office:body></office:document-content>`;

const TEXTE = `# Séance du jour

Objectif : comprendre les **fractions**.

- lire une fraction
- placer une fraction sur une droite graduée

## Pour aller plus loin
1. simplifier
2. comparer
Fin de la séance.`;

module.exports = async function (browser) {
    const r = creerRapport('Documents importés');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.LecteurDocuments && typeof importerDocument === 'function', { timeout: 20000 });

    // .docx compressé (deflate), .odt stocké tel quel : les deux chemins du ZIP
    const docx = graverZip([
        { nom: '[Content_Types].xml', contenu: '<?xml version="1.0"?><Types/>' },
        { nom: 'word/document.xml', contenu: DOCX }
    ], true);
    const odt = graverZip([
        { nom: 'mimetype', contenu: 'application/vnd.oasis.opendocument.text' },
        { nom: 'content.xml', contenu: ODT }
    ], false);

    // Un fichier fabriqué côté navigateur à partir des octets
    const lire = (nom, octets) => page.evaluate(async ({ nom, octets }) => {
        const f = new File([new Uint8Array(octets)], nom);
        return await window.LecteurDocuments.lire(f);
    }, { nom, octets: Array.from(octets) });

    // --- WORD ---
    const w = await lire('cours.docx', docx);
    r.verifie('un .docx est ouvert sans bibliothèque', !!w && !!w.html, JSON.stringify(w && w.html || '').slice(0, 120));
    r.verifie('les titres deviennent des titres', /<h1>Les fractions<\/h1>/.test(w.html), w.html.slice(0, 90));
    r.verifie('« Titre 2 » (Word français) aussi', /<h2>À retenir<\/h2>/.test(w.html), w.html);
    r.verifie('le gras est conservé', /<b>quotient<\/b>/.test(w.html), w.html);
    r.verifie('et le « pas gras » ne devient pas du gras',
        /<b>quotient<\/b>\s*de deux entiers/.test(w.html.replace(/<\/?div>/g, '')), w.html);
    r.verifie('l\'italique aussi', /<i>On simplifie<\/i>/.test(w.html), w.html);
    r.verifie('les listes deviennent des listes',
        /<ul><li>Le numérateur<\/li><li>Le dénominateur<\/li><\/ul>/.test(w.html), w.html);
    r.verifie('le saut de ligne dans un paragraphe est gardé', /toujours\.|<br>/.test(w.html), w.html);
    r.verifie('les accents survivent', /numérateur/.test(w.html) && !/�/.test(w.html), w.html.slice(0, 120));
    r.verifie('un tableau est mis à plat, une ligne par ligne', /2\/4\s*&nbsp;\|&nbsp;\s*1\/2/.test(w.html), w.html);
    r.egal('le titre du document est repris', w.titre, 'Les fractions');

    // --- LIBREOFFICE ---
    const o = await lire('lecon.odt', odt);
    r.verifie('un .odt non compressé est ouvert aussi', !!o && !!o.html, (o && o.html || '').slice(0, 100));
    r.verifie('son titre est un titre', /<h1>Le théorème de Pythagore<\/h1>/.test(o.html), o.html.slice(0, 100));
    r.verifie('le gras d\'un style automatique est retrouvé', /<b>rectangle<\/b>/.test(o.html), o.html);
    r.verifie('l\'italique aussi', /<i>toujours<\/i>/.test(o.html), o.html);
    r.verifie('une liste numérotée reste numérotée',
        /<ol><li>L'hypoténuse<\/li><li>Les côtés de l'angle droit<\/li><\/ol>/.test(o.html), o.html);

    // --- TEXTE BRUT ET MARKDOWN ---
    const t = await lire('seance.md', Buffer.from(TEXTE, 'utf8'));
    r.verifie('« # » fait un titre', /<h1>Séance du jour<\/h1>/.test(t.html), t.html.slice(0, 80));
    r.verifie('« ## » un sous-titre', /<h2>Pour aller plus loin<\/h2>/.test(t.html), t.html);
    r.verifie('« ** » du gras', /<b>fractions<\/b>/.test(t.html), t.html);
    r.verifie('« - » une liste à puces', /<ul><li>lire une fraction<\/li>/.test(t.html), t.html);
    r.verifie('« 1. » une liste numérotée', /<ol><li>simplifier<\/li><li>comparer<\/li><\/ol>/.test(t.html), t.html);

    const latin = await lire('vieux.txt', Buffer.from('Le nœud est résolu', 'latin1'));
    r.verifie('un texte enregistré sous Windows reste lisible',
        !/�/.test(latin.html) && /résolu/.test(latin.html), latin.html);

    // --- CE QUI ARRIVE SUR LE TABLEAU ---
    const pose = await page.evaluate(async ({ octets }) => {
        texts.length = 0;
        panX = 0; panY = 0; zoom = 1;
        await importerDocument(new File([new Uint8Array(octets)], 'cours.docx'));
        return texts.map(t => ({ x: t.x, y: t.y, colWidth: t.colWidth, taille: t.content.length,
                                 police: t.fontFamily, align: t.align }));
    }, { octets: Array.from(docx) });
    r.verifie('le document arrive sur le tableau', pose.length >= 1, JSON.stringify(pose));
    r.verifie('en blocs à largeur de colonne, pas en ligne infinie',
        pose.every(p => p.colWidth === 900), JSON.stringify(pose));
    r.verifie('posés à droite de la barre d\'outils, pas dessous',
        pose[0].x >= 200 && pose[0].x < 400 && pose[0].y < 300, JSON.stringify(pose[0]));
    r.verifie('les blocs ne se superposent pas',
        pose.length < 2 || pose[1].x >= pose[0].x + 900, JSON.stringify(pose));

    const selection = await page.evaluate(() => selectedItems.map(s => s.type));
    r.verifie('le texte importé est sélectionné, prêt à être déplacé',
        selection.length > 0 && selection.every(t => t === 'text'), JSON.stringify(selection));

    // Un long document se coupe en plusieurs blocs, aux titres
    const longDoc = await page.evaluate(() => {
        const blocs = [];
        for (let i = 0; i < 4; i++) {
            blocs.push({ type: 'h1', html: 'Partie ' + i });
            for (let j = 0; j < 6; j++) blocs.push({ type: 'p', html: 'Un paragraphe de cours.' });
        }
        return decouperDocument(blocs).length;
    });
    r.verifie('un cours à quatre parties fait quatre blocs', longDoc === 4, `${longDoc} blocs`);

    // --- COLLER DEPUIS WORD OU LIBREOFFICE, SUR LE TABLEAU ---
    const colle = await page.evaluate(() => {
        texts.length = 0;
        panX = 0; panY = 0; zoom = 1;
        mouseLogicalPos = { x: 500, y: 300 };
        const dt = new DataTransfer();
        dt.setData('text/html', '<p style="font-weight:bold">Le théorème</p><p>Dans un triangle <span style="font-style:italic">rectangle</span>.</p>');
        dt.setData('text/plain', 'Le théorème\nDans un triangle rectangle.');
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        const t = texts[0];
        return t ? { contenu: t.content, x: t.x, y: t.y, selection: selectedItems.length } : null;
    });
    r.verifie('un Ctrl+V sur le tableau pose un bloc de texte', !!colle, JSON.stringify(colle));
    r.verifie('le gras de LibreOffice est conservé', !!colle && /<b>Le théorème<\/b>/.test(colle.contenu), colle && colle.contenu);
    r.verifie('l\'italique aussi', !!colle && /<i>rectangle<\/i>/.test(colle.contenu), colle && colle.contenu);
    r.verifie('le bloc arrive sous le curseur', !!colle && colle.x === 500 && colle.y === 300, JSON.stringify(colle));
    r.verifie('et il est sélectionné, prêt à être déplacé', !!colle && colle.selection === 1, JSON.stringify(colle));

    const colleBrut = await page.evaluate(() => {
        texts.length = 0;
        const dt = new DataTransfer();
        dt.setData('text/plain', 'Première ligne\nDeuxième ligne');
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        return texts[0] ? texts[0].content : null;
    });
    r.verifie('du texte brut donne aussi un bloc, ligne par ligne',
        /<div>Première ligne<\/div><div>Deuxième ligne<\/div>/.test(colleBrut || ''), colleBrut);

    // Word, Pages et LibreOffice envoient leur feuille de style avec le texte
    const styleColle = await page.evaluate(() => {
        texts.length = 0;
        const dt = new DataTransfer();
        dt.setData('text/html', `<meta charset="utf-8"><style>p.p1 {margin: 0.0px; font: 13.0px 'Helvetica Neue'}</style>`
            + `<p class="p1">Le cours du jour</p><p class="p1">Deuxième ligne</p>`);
        dt.setData('text/plain', 'Le cours du jour\nDeuxième ligne');
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        return texts[0] ? texts[0].content : '';
    });
    r.verifie('la feuille de style de Word n\'arrive pas sur le tableau',
        !/margin|font:|Helvetica|p\.p1/.test(styleColle), styleColle.slice(0, 140));
    r.verifie('mais le texte, oui', /Le cours du jour/.test(styleColle) && /Deuxième ligne/.test(styleColle), styleColle.slice(0, 140));

    // Ctrl+Maj+V : rien que le texte
    const sansMiseEnForme = await page.evaluate(() => {
        texts.length = 0;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true }));
        const dt = new DataTransfer();
        dt.setData('text/html', '<h1>Un titre</h1><p>Avec du <b>gras</b></p>');
        dt.setData('text/plain', 'Un titre\nAvec du gras');
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        return texts[0] ? texts[0].content : '';
    });
    r.verifie('Ctrl+Maj+V ne colle que le texte',
        !/<h1>|<b>/.test(sansMiseEnForme) && /Un titre/.test(sansMiseEnForme), sansMiseEnForme);

    // Dans un bloc en cours de saisie : pas de style, et rien en surbrillance
    const dansLaSaisie = await page.evaluate(() => {
        texts.length = 0;
        panX = 0; panY = 0; zoom = 1;
        setMode('text');
        const zone = document.getElementById('wysiwyg-text');
        zone.style.display = 'block';
        zone.innerHTML = '';
        zone.focus();
        const dt = new DataTransfer();
        dt.setData('text/html', `<style>p.p1 {font: 13px 'Helvetica'}</style><p class="p1">Bonjour la classe</p>`);
        dt.setData('text/plain', 'Bonjour la classe');
        zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        const sel = window.getSelection();
        const res = { html: zone.innerHTML, surbrillance: sel ? String(sel).length : 0 };
        zone.style.display = 'none'; zone.innerHTML = '';
        setMode('pointer');
        return res;
    });
    r.verifie('dans un bloc, la feuille de style est jetée aussi',
        !/font:|Helvetica|p\.p1/.test(dansLaSaisie.html), dansLaSaisie.html.slice(0, 140));
    r.egal('et rien ne reste en surbrillance après le collage', dansLaSaisie.surbrillance, 0);

    const rien = await page.evaluate(() => {
        texts.length = 0;
        const dt = new DataTransfer();
        dt.setData('text/plain', '   ');
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        return texts.length;
    });
    r.egal('un presse-papier vide ne pose rien', rien, 0);

    // --- LES ENTRÉES DE L'APPLICATION ---
    const entrees = await page.evaluate(() => ({
        bouton: !!document.getElementById('btn-import-doc'),
        champ: (document.getElementById('doc-loader') || {}).accept,
        media: (document.getElementById('pdf-loader') || {}).accept,
        reconnait: ['a.docx', 'b.odt', 'c.txt', 'd.md'].every(n => LecteurDocuments.estUnDocument({ name: n })),
        ignore: ['a.pdf', 'b.png', 'c.mp3'].every(n => !LecteurDocuments.estUnDocument({ name: n }))
    }));
    r.verifie('le menu Importer propose les documents', entrees.bouton);
    r.verifie('le sélecteur ne montre que les documents lisibles',
        /docx/.test(entrees.champ || '') && /odt/.test(entrees.champ || ''), entrees.champ);
    r.verifie('l\'entrée média les accepte aussi (glisser-déposer, Drive)',
        /docx/.test(entrees.media || ''), entrees.media);
    r.verifie('les extensions attendues sont reconnues', entrees.reconnait);
    r.verifie('les autres fichiers ne sont pas détournés', entrees.ignore);

    // Un fichier illisible ne doit pas casser le tableau
    const casse = await page.evaluate(async () => {
        const avant = texts.length;
        await importerDocument(new File([new Uint8Array([1, 2, 3, 4, 5])], 'faux.docx'));
        return { avant, apres: texts.length };
    });
    r.egal('un document illisible ne pose rien et ne casse rien', casse.apres, casse.avant);

    // --- UN PDF POSÉ SUR LE TABLEAU, QU'ON FEUILLETTE ---
    const pdf = Array.from(petitPdf());
    const posePdf = await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(r => setTimeout(r, 800));
        const i = images[0];
        return i ? {
            images: images.length, pages: pages.length,
            page: i.pluginData.page, total: i.pluginData.pages, nom: i.pluginData.nom,
            large: i.w > 200, proportion: Math.abs(i.w / i.h - 400 / 300) < 0.05,
            src: (i.src || '').slice(0, 20)
        } : null;
    }, { octets: pdf });
    r.verifie('le PDF est posé en un seul objet', !!posePdf && posePdf.images === 1, JSON.stringify(posePdf));
    r.verifie('il ne crée pas de pages de tableau', !!posePdf && posePdf.pages === 1, JSON.stringify(posePdf));
    r.egal('il connaît son nombre de pages', posePdf && posePdf.total, 3);
    r.verifie('la page est posée à une taille lisible et sans déformation',
        !!posePdf && posePdf.large && posePdf.proportion, JSON.stringify(posePdf));

    const feuillete = await page.evaluate(async () => {
        const img = images[0];
        const avant = img.src;
        await feuilleterPdf(img, 1);
        await new Promise(r => setTimeout(r, 500));
        const page2 = { page: img.pluginData.page, change: img.src !== avant };
        await feuilleterPdf(img, 1);
        await new Promise(r => setTimeout(r, 500));
        await feuilleterPdf(img, 1);      // au-delà de la dernière : rien ne bouge
        await new Promise(r => setTimeout(r, 300));
        const fin = img.pluginData.page;
        await feuilleterPdf(img, -1);
        await new Promise(r => setTimeout(r, 500));
        return { page2, fin, retour: img.pluginData.page, taille: { w: Math.round(img.w), h: Math.round(img.h) } };
    });
    r.verifie('▶ tourne la page et redessine', feuillete.page2.page === 2 && feuillete.page2.change, JSON.stringify(feuillete));
    r.egal('on ne dépasse pas la dernière page', feuillete.fin, 3);
    r.egal('◀ revient en arrière', feuillete.retour, 2);

    // --- LA BARRE DU DOCUMENT ---
    const barre = await page.evaluate(() => {
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateQuickMenu();
        const b = document.getElementById('bar-document');
        return {
            visible: b.classList.contains('visible'),
            info: document.getElementById('doc-page-num').value + '/' + images[0].pluginData.pages,
            menuRange: document.getElementById('quick-edit-menu').classList.contains('visible'),
            // Fixe, EN HAUT : le bas est la zone où l'on écrit, et une barre
            // posée là recevait les traits à la place du tableau.
            enHaut: b.getBoundingClientRect().top < window.innerHeight / 3
        };
    });
    r.verifie('la barre montre le document, à sa place fixe en haut',
        barre.visible && barre.enHaut, JSON.stringify(barre));
    // DEUX BARRES, DEUX MÉTIERS : celle-ci porte les propriétés, le menu
    // flottant porte les actions. Ils paraissent donc ENSEMBLE.
    r.verifie('et le menu flottant des actions l\'accompagne',
        barre.menuRange, JSON.stringify(barre));

    // DEUX BARRES, DEUX MÉTIERS, ET AUCUN RÉGLAGE EN DOUBLE. La barre fixe
    // porte les PROPRIÉTÉS, le menu flottant les ACTIONS ; rien ne doit se
    // retrouver dans les deux — c'est ce qui rendait la première fusion
    // illisible, avec deux cadenas côte à côte.
    const partage = await page.evaluate(() => {
        const barreFixe = document.getElementById('bar-document');
        const flottant = document.getElementById('quick-edit-menu');
        const dedans = (el) => Array.from(el.querySelectorAll('button, input[type=range]'))
            .map(b2 => b2.id).filter(Boolean);
        const propriete = (id) => /doc-(prec|suiv|page-num|volet|mode|grille|proportions|rogner|entiere|outil)|line-width|stamp-opacity|font-size|btn-color/.test(id);
        const action = (id) => /quick-(lock|duplicate|rotate|flip-h|flip-v|delete)/.test(id);
        const fixe = dedans(barreFixe), flot = dedans(flottant);
        return {
            enDouble: fixe.filter(id => flot.includes(id)),
            actionsDansLaFixe: fixe.filter(action),
            proprietesDansLeFlottant: flot.filter(propriete),
            flottant: flot
        };
    });
    r.verifie('aucun bouton ne vit dans les deux barres',
        partage.enDouble.length === 0, JSON.stringify(partage.enDouble));
    r.verifie('la barre fixe ne porte aucune action',
        partage.actionsDansLaFixe.length === 0, JSON.stringify(partage.actionsDansLaFixe));
    r.verifie('et le menu flottant aucune propriété',
        partage.proprietesDansLeFlottant.length === 0, JSON.stringify(partage.proprietesDansLeFlottant));
    // IL RESTE COURT. Six gestes : verrouiller, dupliquer, tourner d'un quart
    // de tour, les deux miroirs, supprimer. C'est le plafond — au-delà, ce
    // n'est plus une barre flottante mais un second panneau, et l'on retombe
    // dans la fusion illisible d'où l'on vient.
    r.verifie('le menu flottant reste court : rien que des gestes, une poignée',
        partage.flottant.length <= 7, JSON.stringify(partage.flottant));

    // EN PLEIN ÉCRAN, elle descend jusqu'au bord : le tiroir du bas s'efface
    // avec les autres, et la page se lit de haut en bas — la barre n'a rien à
    // faire dans le début.
    const enBasEnFocus = await page.evaluate(() => {
        const b2 = document.getElementById('bar-document');
        const tiroir = document.getElementById('bottom-drawer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        const normal = Math.round(b2.getBoundingClientRect().top);
        toggleFocusMode();
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        const focus = Math.round(window.innerHeight - b2.getBoundingClientRect().bottom);
        toggleFocusMode();
        return { normal, focus, tiroirHaut: Math.round(tiroir.offsetHeight) };
    });
    r.verifie('hors plein écran, elle est en haut', enBasEnFocus.normal < 200,
        JSON.stringify(enBasEnFocus));
    r.verifie('et en plein écran elle descend au bord : la page occupe tout le haut',
        enBasEnFocus.focus < 30, JSON.stringify(enBasEnFocus));

    // ELLE SE DÉPLACE ET S'EN SOUVIENT. Fixe ne veut pas dire clouée : sur un
    // document en plein écran elle peut tomber en travers de ce qu'on montre.
    const deplacee = await page.evaluate(() => {
        const barre = document.getElementById('bar-document');
        const poignee = barre.querySelector('.cbar-head') || barre.querySelector('.drag-handle');
        const aUnePoignee = !!poignee, aUnRepli = !!barre.querySelector('.btn-minimize');
        // On la remet d'abord à sa place automatique : le test précédent l'a
        // laissée en bas, et tirer vers le bas depuis là serait borné.
        barreStylePosee = null;
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        const r0 = barre.getBoundingClientRect();
        poignee.dispatchEvent(new MouseEvent('mousedown', { bubbles: true,
            clientX: r0.left + 5, clientY: r0.top + 5 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true,
            clientX: r0.left + 5 + 120, clientY: r0.top + 5 + 220 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        const pose = barreStylePosee && { x: Math.round(barreStylePosee.x), y: Math.round(barreStylePosee.y) };
        // Un changement de sélection ne doit pas la ramener à sa place auto
        selectedItems = []; updateStyleBarContext();
        selectedItems = [{ type: 'image', id: images[0].id }]; updateStyleBarContext();
        const apres = barre.getBoundingClientRect();
        const memoire = JSON.parse(localStorage.getItem('auTableau_barre_document') || 'null');
        // et le double-clic sur la poignée défait tout
        poignee.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        const remise = { pose: barreStylePosee, memoire: localStorage.getItem('auTableau_barre_document') };
        return { aUnePoignee, aUnRepli, pose, memoire,
                 bougeX: Math.round(apres.left - r0.left), bougeY: Math.round(apres.top - r0.top),
                 dansEcran: apres.left >= 0 && apres.top >= 0
                     && apres.right <= window.innerWidth + 1 && apres.bottom <= window.innerHeight + 1,
                 remise };
    });
    r.verifie('la barre a de nouveau une poignée et un repli',
        deplacee.aUnePoignee && deplacee.aUnRepli, JSON.stringify(deplacee));
    r.verifie('on la déplace d\'autant qu\'on a tiré',
        Math.abs(deplacee.bougeX - 120) <= 6 && Math.abs(deplacee.bougeY - 220) <= 6,
        JSON.stringify(deplacee));
    r.verifie('et un changement de sélection ne la ramène pas en place',
        !!deplacee.memoire && deplacee.dansEcran, JSON.stringify(deplacee));
    r.egal('le double-clic sur la poignée défait le déplacement', deplacee.remise.pose, null);
    r.egal('et l\'oubli est retenu', deplacee.remise.memoire, null);
    r.egal('elle affiche la page courante sur le total', barre.info, '2/3');

    const fleches = await page.evaluate(async () => {
        document.getElementById('doc-suiv').click();
        await new Promise(r => setTimeout(r, 500));
        const apres = document.getElementById('doc-page-num').value;
        document.getElementById('doc-prec').click();
        await new Promise(r => setTimeout(r, 500));
        return { apres, retour: document.getElementById('doc-page-num').value };
    });
    r.egal('▶ de la barre tourne la page', fleches.apres, '3');
    r.egal('◀ de la barre revient', fleches.retour, '2');

    // UN SEUL BOUTON, QUI CYCLE. Ils étaient deux, et ils disparaissaient dès
    // qu'on prenait un crayon : la barre se réorganisait sous les doigts.
    // Celui-ci reste en place, et son icône dit ce qu'un glissement va faire.
    const modes = await page.evaluate(() => {
        const bouton = document.getElementById('doc-mode-bascule');
        const icone = () => document.getElementById('icone-mode-doc').innerHTML;
        const depart = { mode: modeDocument, allume: bouton.classList.contains('actif'), dessin: icone() };
        bouton.click();
        const apres = { mode: modeDocument, allume: bouton.classList.contains('actif'), dessin: icone() };
        bouton.click();
        const retour = { mode: modeDocument, dessin: icone() };
        return { depart, apres, retour,
                 seul: !document.getElementById('doc-mode-cadre') && !document.getElementById('doc-mode-page') };
    });
    r.egal('un seul bouton pour le mode, et « Cadre » au départ',
        { seul: modes.seul, mode: modes.depart.mode, allume: modes.depart.allume },
        { seul: true, mode: 'cadre', allume: false });
    r.egal('un clic passe à « Page », et cela se voit', 
        { mode: modes.apres.mode, allume: modes.apres.allume }, { mode: 'page', allume: true });
    r.verifie('l\'icône change avec le mode',
        modes.depart.dessin !== modes.apres.dessin && modes.depart.dessin.length > 10,
        JSON.stringify({ cadre: modes.depart.dessin.slice(0, 40), page: modes.apres.dessin.slice(0, 40) }));
    r.egal('un second clic revient au cadre', modes.retour.mode, 'cadre');
    r.egal('et l\'icône revient avec lui', modes.retour.dessin, modes.depart.dessin);

    // En mode Page, le glissement déplace la découpe, pas l'objet
    const coulisse = await page.evaluate(() => {
        const o = images[0];
        o.cw = o.cw / 2; o.ch = o.ch / 2;          // page zoomée : il y a de la marge
        o.cx = 60; o.cy = 60;
        const x0 = o.x, cx0 = o.cx;
        demarrerGlissePage(o, { x: 0, y: 0 });
        poursuivreGlissePage({ x: -30, y: 0 });
        const r = { objetFixe: o.x === x0, decoupeBouge: o.cx > cx0 };
        glissePage = null;
        return r;
    });
    r.verifie('faire coulisser la page ne déplace pas le cadre', coulisse.objetFixe, JSON.stringify(coulisse));
    r.verifie('mais bien la fenêtre de découpe', coulisse.decoupeBouge, JSON.stringify(coulisse));

    const molette = await page.evaluate(() => {
        const o = images[0];
        const avant = o.cw;
        zoomerPage(o, { x: o.x + o.w / 2, y: o.y + o.h / 2 }, 1.5);
        return { avant, apres: o.cw, dansLimage: o.cx >= 0 && o.cx + o.cw <= imageCache[o.src].naturalWidth + 0.5 };
    });
    r.verifie('la molette agrandit la page dans son cadre', molette.apres < molette.avant, JSON.stringify(molette));
    r.verifie('sans jamais sortir de l\'image', molette.dansLimage, JSON.stringify(molette));

    const reglages = await page.evaluate(() => {
        // Le menu flottant se garnit à la volée : sans cet appel, ses boutons
        // existent mais n'ont pas encore d'écouteur.
        updateQuickMenu();
        // Le menu flottant répond au POINTEUR et non au clic : il doit agir dès
        // qu'on pose le doigt, sans attendre qu'on le relève.
        const toucher = (id) => document.getElementById(id).dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
        const opa = document.getElementById('stamp-opacity');
        opa.value = '0.4';
        opa.dispatchEvent(new Event('input', { bubbles: true }));
        const apresOpacite = images[0].opacity;

        document.getElementById('doc-grille').click();
        const sous = { actif: images[0].sousLaGrille, allume: document.getElementById('doc-grille').classList.contains('actif') };
        document.getElementById('doc-grille').click();

        toucher('btn-quick-lock');
        const verrou = { actif: images[0].locked, allume: document.getElementById('btn-quick-lock').classList.contains('active') };
        toucher('btn-quick-lock');
        return { apresOpacite, sous, verrou, remisAPlat: !images[0].locked };
    });
    r.egal('le curseur règle l\'opacité du document', reglages.apresOpacite, 0.4);
    r.verifie('le passage sous le quadrillage se pose et se voit',
        reglages.sous.actif === true && reglages.sous.allume, JSON.stringify(reglages.sous));
    r.verifie('le verrou se pose et se voit',
        reglages.verrou.actif === true && reglages.verrou.allume, JSON.stringify(reglages.verrou));
    r.verifie('et chaque bouton se relâche', reglages.remisAPlat);

    // Le document passé sous la grille est dessiné avant le quadrillage
    const dessous = await page.evaluate(() => {
        images[0].sousLaGrille = true;
        const ordre = [];
        const vraiDessin = ctx.drawImage.bind(ctx);
        const vraiRemplir = ctx.fillRect.bind(ctx);
        ctx.drawImage = function (...a) { ordre.push('image'); return vraiDessin(...a); };
        ctx.fillRect = function (...a) { ordre.push('fond'); return vraiRemplir(...a); };
        currentPaper = 'carreau';
        draw();
        ctx.drawImage = vraiDessin; ctx.fillRect = vraiRemplir;
        images[0].sousLaGrille = false;
        currentPaper = 'blanc';
        return { premier: ordre[0], uneSeuleFois: ordre.filter(o => o === 'image').length };
    });
    r.egal('le fond reste peint en premier', dessous.premier, 'fond');
    r.egal('et le document sous la grille n\'est dessiné qu\'une fois', dessous.uneSeuleFois, 1);

    const ferme = await page.evaluate(() => {
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateQuickMenu();
        const cle = images[0].pluginData.cle;
        document.getElementById('btn-quick-delete').dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
        return {
            images: images.length,
            oublie: !documentsPdf.has(cle),
            barre: document.getElementById('bar-document').classList.contains('ctx-document')
        };
    });
    r.egal('✕ retire le document du tableau', ferme.images, 0);
    r.verifie('et oublie le PDF gardé en mémoire', ferme.oublie, JSON.stringify(ferme));
    r.verifie('la barre disparaît avec lui', !ferme.barre, JSON.stringify(ferme));

    // Une image ordinaire se règle avec la même barre, sans les flèches
    const surImageOrdinaire = await page.evaluate(() => {
        images.push({ id: nextId++, x: 0, y: 0, w: 10, h: 10, cx: 0, cy: 0, cw: 10, ch: 10, src: '', z: globalZ++ });
        selectedItems = [{ type: 'image', id: images[images.length - 1].id }];
        updateQuickMenu();
        return {
            barre: document.getElementById('bar-document').classList.contains('ctx-document'),
            fleches: document.getElementById('doc-pages').style.display,
            proportions: !!document.getElementById('doc-proportions'),
            rogner: !!document.getElementById('doc-rogner'),
            dupliquer: !!document.getElementById('btn-quick-duplicate'),
            fermer: !!document.getElementById('btn-quick-delete')
        };
    });
    r.verifie('une image ordinaire se règle avec la même barre', surImageOrdinaire.barre, JSON.stringify(surImageOrdinaire));
    r.egal('mais sans les flèches de page', surImageOrdinaire.fleches, 'none');
    r.verifie('proportions, rognage et duplication y sont repris du menu rapide',
        surImageOrdinaire.proportions && surImageOrdinaire.rogner && surImageOrdinaire.dupliquer,
        JSON.stringify(surImageOrdinaire));
    r.verifie('et la suppression est offerte par le menu flottant', surImageOrdinaire.fermer,
        JSON.stringify(surImageOrdinaire));

    const repris = await page.evaluate(() => {
        const o = images[images.length - 1];
        document.getElementById('doc-proportions').click();
        const sansRatio = o.ratioLocked === false && !document.getElementById('doc-proportions').classList.contains('actif');
        document.getElementById('doc-proportions').click();
        document.getElementById('doc-rogner').click();
        const rogne = { actif: !!o.isCropping, libre: o.ratioLocked === false };
        document.getElementById('doc-rogner').click();
        const avant = images.length;
        updateQuickMenu();
        document.getElementById('btn-quick-duplicate').dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
        return { sansRatio, rogne, copie: images.length - avant };
    });
    r.verifie('la chaîne des proportions se décroche et se voit', repris.sansRatio, JSON.stringify(repris));
    r.verifie('le rognage libère les proportions', repris.rogne.actif && repris.rogne.libre, JSON.stringify(repris));
    r.egal('la duplication pose une copie', repris.copie, 1);

    const reglage = await page.evaluate(() => {
        const depart = importPdfFeuilletable;
        reglerImportPdf(false);
        const eteint = { actif: importPdfFeuilletable, memoire: localStorage.getItem('board_pdf_feuilletable') };
        reglerImportPdf(true);
        const rallume = { actif: importPdfFeuilletable, memoire: localStorage.getItem('board_pdf_feuilletable') };
        return { depart, eteint, rallume };
    });
    r.verifie('le document feuilletable est le mode par défaut', reglage.depart === true, JSON.stringify(reglage));
    r.verifie('le mode d\'import du PDF se règle et se retient',
        reglage.eteint.actif === false && reglage.eteint.memoire === '0'
        && reglage.rallume.actif === true && reglage.rallume.memoire === '1', JSON.stringify(reglage));

    // Un objet chargé d'un élément du document faisait échouer TOUTE la sauvegarde
    const sauvegarde = await page.evaluate(async () => {
        images.length = 0;
        images.push({
            id: nextId++, x: 0, y: 0, w: 10, h: 10, cx: 0, cy: 0, cw: 10, ch: 10,
            src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', img: new Image(), z: globalZ++
        });
        const etat = stateForStorage();
        const range = etat.pages[currentPageIndex].images[0];
        try {
            await new Promise((ok, ko) => {
                const req = indexedDB.open('essai_clone', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('t');
                req.onsuccess = () => {
                    const tx = req.result.transaction('t', 'readwrite');
                    tx.objectStore('t').put(etat, 'x');
                    tx.oncomplete = () => { req.result.close(); ok(); };
                    tx.onerror = () => ko(tx.error);
                };
                req.onerror = () => ko(req.error);
            });
            return { image: 'img' in range, clonable: true };
        } catch (e) {
            return { image: 'img' in range, clonable: false, erreur: String(e).slice(0, 90) };
        }
    });
    r.verifie('aucune image du document ne part à la sauvegarde', !sauvegarde.image, JSON.stringify(sauvegarde));
    r.verifie('et l\'enregistrement passe dans IndexedDB', sauvegarde.clonable, JSON.stringify(sauvegarde));

    // --- UN DOCUMENT POSÉ S'AJUSTE D'ABORD EN OUVRANT SES BORDS ---
    const parDefaut = await page.evaluate(async ({ octets }) => {
        images.length = 0; selectedItems = [];
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(r => setTimeout(r, 900));
        const pdf = images[0];
        // Une image ordinaire passe par la même porte
        const png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJUlEQVR42u3NMQEAAAgDoC252R0eDCRQcndVAQCA/QMAAAAAgAcXvQQBtZPGigAAAABJRU5ErkJggg==';
        const bin = atob(png); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const dt = new DataTransfer(); dt.items.add(new File([u], 'photo.png', { type: 'image/png' }));
        const entree = document.getElementById('pdf-loader');
        entree.files = dt.files;
        entree.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1200));
        // Selon la porte d'entrée, le nom du fichier n'est pas toujours noté :
        // la nouvelle image est simplement celle qui n'est pas le PDF.
        const image = images.find(i => i !== pdf);
        return {
            pdf: pdf ? { rogne: pdf.isCropping === true, ratio: pdf.ratioLocked } : null,
            image: image ? { rogne: image.isCropping === true, ratio: image.ratioLocked } : null
        };
    }, { octets: pdf });
    r.verifie('un PDF posé se redimensionne, comme tout le reste',
        !!parDefaut.pdf && !parDefaut.pdf.rogne, JSON.stringify(parDefaut));
    r.verifie('une image importée aussi',
        !!parDefaut.image && !parDefaut.image.rogne, JSON.stringify(parDefaut));
    r.verifie('et leurs coins gardent les proportions tant qu\'on ne rogne pas',
        parDefaut.pdf.ratio !== false && parDefaut.image.ratio !== false, JSON.stringify(parDefaut));

    const tamponDeplugin = await page.evaluate(() => {
        // Un tampon fabriqué par un plugin, lui, se redimensionne comme avant
        images.push({ id: nextId++, x: 0, y: 0, w: 100, h: 80, cx: 0, cy: 0, cw: 100, ch: 80,
                      src: '', z: globalZ++, pluginData: { id: 'monPlugin' } });
        const o = images[images.length - 1];
        return { rogne: o.isCropping === true, ratio: o.ratioLocked !== false };
    });
    r.verifie('un tampon de plugin garde le redimensionnement',
        !tamponDeplugin.rogne && tamponDeplugin.ratio, JSON.stringify(tamponDeplugin));

    // Le cadrage posé sur une page vaut pour les suivantes
    const suitLesPages = await page.evaluate(async ({ octets }) => {
        images.length = 0; selectedItems = [];
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(r => setTimeout(r, 900));
        const o = images[0];
        const nat = imageCache[o.src];
        // on coupe le quart haut de la page
        o.cy = nat.naturalHeight * 0.25;
        o.ch = nat.naturalHeight * 0.75;
        const partAvant = o.ch / nat.naturalHeight;
        await feuilleterPdf(o, 1);
        await new Promise(r => setTimeout(r, 600));
        const nat2 = imageCache[o.src];
        return {
            page: o.pluginData.page,
            partAvant,
            partApres: o.ch / nat2.naturalHeight,
            hautApres: o.cy / nat2.naturalHeight
        };
    }, { octets: pdf });
    r.egal('on tourne bien la page', suitLesPages.page, 2);
    r.verifie('et le cadrage posé la suit, au lieu de repartir de zéro',
        Math.abs(suitLesPages.partApres - suitLesPages.partAvant) < 0.01
        && Math.abs(suitLesPages.hautApres - 0.25) < 0.01, JSON.stringify(suitLesPages));

    // Le retour à la page entière : proposé seulement s'il y a de quoi défaire
    const retourEntier = await page.evaluate(async () => {
        const o = images[0];
        selectedItems = [{ type: 'image', id: o.id }];
        updateQuickMenu();
        // Le bouton a rejoint le VOLET du document : la barre ne garde que
        // les pages, l'outil, ce qu'un glissement déplace et les zones. Il y
        // porte son nom en toutes lettres, ce que l'icône seule ne faisait pas.
        if (typeof majReglagesDuVolet === 'function') majReglagesDuVolet();
        const bouton = document.getElementById('dv-entiere');
        const propose = getComputedStyle(bouton).display !== 'none';
        const largeurAvant = o.w;
        bouton.click();
        await new Promise(r => setTimeout(r, 150));
        const nat = imageCache[o.src];
        return {
            propose,
            entier: o.cx === 0 && o.cy === 0 && o.cw === nat.naturalWidth && o.ch === nat.naturalHeight,
            cadreGarde: Math.abs(o.w - largeurAvant) < 0.5,
            proportion: Math.abs(o.w / o.h - nat.naturalWidth / nat.naturalHeight) < 0.02,
            // IL NE S'EFFACE PLUS : c'est lui qui ramène au cadrage. Un
            // bouton qui ne fait qu'aller n'est pas un réglage, c'est une
            // perte — sur un morceau découpé, elle était irréparable.
            retour: (majReglagesDuVolet(), (() => {
                const b = document.getElementById('dv-entiere');
                return { la: getComputedStyle(b).display !== 'none',
                         allume: b.classList.contains('actif'),
                         dit: (b.querySelector('span') || {}).textContent };
            })())
        };
    });
    r.verifie('« page entière » est proposé dans le volet quand le document est rogné',
        retourEntier.propose, JSON.stringify(retourEntier));
    r.verifie('il remet toute la page dans le cadre', retourEntier.entier, JSON.stringify(retourEntier));
    r.verifie('en gardant la place prise sur le tableau', retourEntier.cadreGarde, JSON.stringify(retourEntier));
    r.verifie('et sans déformer la page', retourEntier.proportion, JSON.stringify(retourEntier));
    r.egal('une fois entière, le MÊME bouton propose de revenir au cadrage',
        { la: retourEntier.retour.la, allume: retourEntier.retour.allume,
          dit: retourEntier.retour.dit },
        { la: true, allume: true, dit: 'Revenir au cadrage d\'avant' });

    // Une page d'un autre format ne reprend pas le découpage de la précédente
    const autreFormat = await page.evaluate(async () => {
        const o = images[0];
        const nat = imageCache[o.src];
        o.cy = nat.naturalHeight * 0.3; o.ch = nat.naturalHeight * 0.7;
        o.pluginData.pageRognee = true;
        // Les pages rendues sont gardées : la suivante est déjà prête, et
        // notre faux rendu ne serait jamais appelé. On vide le cache pour
        // que la page à l'italienne soit bien fabriquée ici.
        const dossier = documentsPdf.get(o.pluginData.cle);
        if (dossier.rendus) dossier.rendus.clear();
        // on fait croire à la page suivante qu'elle est à l'italienne
        const vrai = window.dessinerPagePdf;
        window.dessinerPagePdf = async (doc, n) => {
            const r = await vrai(doc, n);
            return { src: r.src, l: r.h, h: r.l };      // format inversé
        };
        await feuilleterPdf(o, 1);
        await new Promise(r => setTimeout(r, 600));
        window.dessinerPagePdf = vrai;
        if (dossier.rendus) dossier.rendus.clear();   // ne pas garder le faux format
        return { hautCoupe: o.cy, partHaute: o.ch, rognee: o.pluginData.pageRognee };
    });
    r.egal('une page d\'un autre format repart du haut', autreFormat.hautCoupe, 0);
    r.verifie('et elle est montrée en entier', autreFormat.rognee === false, JSON.stringify(autreFormat));

    // --- CADRE / PAGE : SEULEMENT POUR CE QUI EST UN DOCUMENT ---
    const modesDoc = await page.evaluate(() => {
        panX = 400; panY = 300; zoom = 1;
        const poser = (extra) => {
            images.length = 0; selectedItems = [];
            images.push(Object.assign({ id: nextId++, x: -150, y: -100, w: 300, h: 200,
                cx: 0, cy: 0, cw: 300, ch: 200, src: '', z: globalZ++ }, extra));
            selectedItems = [{ type: 'image', id: images[0].id }];
            updateQuickMenu();
            return getComputedStyle(document.getElementById('doc-modes')).display;
        };
        const tampon = poser({ pluginData: { id: 'pyramidGeneratorTool' } });
        // un mode « page » resté d'un document précédent ne doit pas coller au tampon
        modeDocument = 'page';
        poser({ pluginData: { id: 'pyramidGeneratorTool' } });
        const modeRamene = modeDocument;
        return {
            tampon,
            modeRamene,
            image: poser({ fileName: 'photo.png' }),
            pdf: poser({ pluginData: { id: 'pdfDoc', cle: 'x', page: 1, pages: 3 } })
        };
    });
    r.egal('un tampon de plugin n\'a pas les modes Cadre / Page', modesDoc.tampon, 'none');
    r.egal('et un mode « Page » resté d\'avant est ramené au cadre', modesDoc.modeRamene, 'cadre');
    r.verifie('une image importée les garde', modesDoc.image !== 'none', modesDoc.image);
    r.verifie('un PDF aussi', modesDoc.pdf !== 'none', modesDoc.pdf);

    // --- UNE SEULE BARRE, TOUJOURS À LA MÊME PLACE ---
    // La barre du document a fusionné avec la barre de style : ses commandes
    // sont devenues un contexte de la barre unique. Le déplacement, le repli en
    // pastille et le bouton « ⋯ » sont partis avec — une barre qui ne bouge pas
    // n'a besoin d'aucun des trois.
    const fusion = await page.evaluate(() => {
        return {
            deuxiemeBarre: !!document.getElementById('barre-document'),
            pastille: !!document.getElementById('doc-pastille'),
            prise: !!document.getElementById('doc-prise'),
            plus: !!document.getElementById('doc-plus'),
            replier: !!document.getElementById('doc-replier'),
            // Les commandes, elles, sont toutes là — dans la barre de style
            dansLaBarre: ['doc-mode-bascule', 'doc-prec', 'doc-suiv']
                .every(id => {
                    const e = document.getElementById(id);
                    return e && e.closest('#bar-document');
                })
        };
    });
    r.verifie('il n\'y a plus de seconde barre',
        !fusion.deuxiemeBarre && !fusion.pastille && !fusion.prise && !fusion.plus && !fusion.replier,
        JSON.stringify(fusion));
    r.verifie('et toutes ses commandes vivent dans la barre de style',
        fusion.dansLaBarre, JSON.stringify(fusion));

    // --- ÉCRIRE ET DESSINER SUR LE DOCUMENT EN PLEIN ÉCRAN ---
    // DE QUOI ÉCRIRE, DÈS QU'ON TIENT UN DOCUMENT. Ces trois outils ne
    // paraissaient qu'en plein écran, au motif qu'ailleurs les vraies barres
    // sont « sous la main ». Mais quand on ouvre un polycopié, c'est la barre
    // du document qu'on regarde : aller chercher le crayon à l'autre bout de
    // l'écran pour revenir écrire sur la page, c'est deux voyages pour un
    // geste.
    const outilsDoc = await page.evaluate(() => {
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        const groupe = document.getElementById('doc-annoter');
        const horsFocus = getComputedStyle(groupe).display;
        toggleFocusMode();
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        return {
            horsFocus,
            enFocus: getComputedStyle(groupe).display,
            crayon: !!document.getElementById('doc-outil-crayon'),
            texte: !!document.getElementById('doc-outil-texte'),
            main: !!document.getElementById('doc-outil-main'),
            toucheCrayon: document.getElementById('doc-outil-crayon').getAttribute('data-raccourci'),
            toucheTexte: document.getElementById('doc-outil-texte').getAttribute('data-raccourci'),
            // Des icônes seules : le nom vit dans l'infobulle, pas dans le bouton
            libelles: ['doc-outil-main', 'doc-outil-crayon', 'doc-outil-texte']
                .map(id => document.getElementById(id).textContent.trim()).join(''),
            dessins: ['doc-outil-main', 'doc-outil-crayon', 'doc-outil-texte']
                .filter(id => document.getElementById(id).querySelector('svg')).length
        };
    });
    r.egal('un document tenu offre de quoi écrire, plein écran ou non',
        { horsFocus: outilsDoc.horsFocus, enFocus: outilsDoc.enFocus },
        { horsFocus: 'contents', enFocus: 'contents' });
    r.verifie('le crayon, le texte et le retour à la sélection',
        outilsDoc.crayon && outilsDoc.texte && outilsDoc.main, JSON.stringify(outilsDoc));
    r.egal('et l\'infobulle du crayon porte sa touche', outilsDoc.toucheCrayon, 'C');
    r.egal('celle du texte aussi', outilsDoc.toucheTexte, 'T');
    r.egal('les trois portent un dessin', outilsDoc.dessins, 3);
    r.egal('et rien d\'autre : l\'icône seule, le nom est dans l\'infobulle',
        outilsDoc.libelles, '');

    // Prendre le crayon vide la sélection : la barre doit malgré tout rester,
    // et continuer de parler du document qu'on annote.
    const auCrayon = await page.evaluate(() => {
        document.getElementById('doc-outil-crayon').click();
        const barre = document.getElementById('bar-document');
        return {
            mode,
            selection: selectedItems.length,
            barreVisible: barre.classList.contains('visible'),
            crayonActif: document.getElementById('doc-outil-crayon').classList.contains('actif'),
            cadre: getComputedStyle(document.getElementById('doc-modes')).display,
            // On mesure ce qui se VOIT, pas le display du bouton : c'est son
            // groupe qui se retire, et un enfant de boîte masquée garde son
            // propre « display: flex ».
            dupliquer: document.getElementById('btn-quick-duplicate').offsetParent === null ? 'none' : 'flex',
            rogner: getComputedStyle(document.getElementById('doc-rogner')).display
        };
    });
    r.egal('le bouton Crayon prend le crayon', auCrayon.mode, 'freehand');
    r.egal('l\'outil vide la sélection', auCrayon.selection, 0);
    r.verifie('mais la barre du document reste : elle retient la page qu\'on annote',
        auCrayon.barreVisible, JSON.stringify(auCrayon));
    r.verifie('le crayon se montre en main', auCrayon.crayonActif);
    r.verifie('et les réglages qui demandent de tenir le document se retirent',
        auCrayon.cadre === 'none' && auCrayon.dupliquer === 'none' && auCrayon.rogner === 'none',
        JSON.stringify(auCrayon));

    // On trace vraiment : le premier trait vide la sélection une seconde fois
    // (le code du crayon le fait lui-même). La barre ne doit pas s'en aller.
    const centre = await page.evaluate(() => {
        const c = document.getElementById('board').getBoundingClientRect();
        return { x: Math.round(c.left + c.width / 2), y: Math.round(c.top + c.height / 2) };
    });
    await page.mouse.move(centre.x - 60, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 60, centre.y + 25, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const apresTrait = await page.evaluate(() => ({
        traits: freehands.length,
        barreVisible: document.getElementById('bar-document').classList.contains('ctx-document'),
        docRetenu: docEnAnnotation !== null
    }));
    r.egal('on écrit bien sur le document', apresTrait.traits, 1);
    r.verifie('et la barre est toujours là après le trait',
        apresTrait.barreVisible && apresTrait.docRetenu, JSON.stringify(apresTrait));

    // Ce qui reste dans la barre agit toujours sur la page qu'on annote
    const agitEncore = await page.evaluate(() => {
        const o = document.getElementById('stamp-opacity');
        o.value = '0.5';
        o.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('doc-grille').click();
        return { opacite: images[0].opacity, sousLaGrille: !!images[0].sousLaGrille };
    });
    r.egal('l\'opacité agit encore sur le document annoté', agitEncore.opacite, 0.5);
    r.verifie('le passage sous le quadrillage aussi', agitEncore.sousLaGrille);

    // La barre de style reparaît en Focus quand elle sert : sans elle, on
    // choisirait sa couleur et son épaisseur à l'aveugle.
    await page.waitForTimeout(400);
    const styleEnFocus = await page.evaluate(() => {
        const b = document.getElementById('bar-document');
        const s = getComputedStyle(b);
        return { visible: b.classList.contains('visible'), opacite: s.opacity, clics: s.pointerEvents };
    });
    r.verifie('la barre de style revient avec le crayon, même en Focus',
        styleEnFocus.visible && styleEnFocus.opacite === '1' && styleEnFocus.clics !== 'none',
        JSON.stringify(styleEnFocus));

    const auTexte = await page.evaluate(() => {
        document.getElementById('doc-outil-texte').click();
        return {
            mode,
            barreVisible: document.getElementById('bar-document').classList.contains('ctx-document'),
            texteActif: document.getElementById('doc-outil-texte').classList.contains('actif')
        };
    });
    r.egal('le bouton Texte prend l\'outil texte', auTexte.mode, 'text');
    r.verifie('et la barre tient encore', auTexte.barreVisible && auTexte.texteActif,
        JSON.stringify(auTexte));

    // « Sélection » fait le chemin inverse : le document revient en main
    const retourMain = await page.evaluate(() => {
        document.getElementById('doc-outil-main').click();
        return {
            mode,
            memeDoc: selectedItems.length === 1 && selectedItems[0].id === images[0].id,
            docRetenu: docEnAnnotation,
            cadre: getComputedStyle(document.getElementById('doc-modes')).display
        };
    });
    r.egal('« Sélection » rend l\'outil', retourMain.mode, 'pointer');
    r.verifie('et remet le document en main', retourMain.memeDoc, JSON.stringify(retourMain));
    r.egal('la barre n\'a plus de page à retenir', retourMain.docRetenu, null);
    r.egal('et ses réglages reviennent', retourMain.cadre, 'contents');

    // AU PREMIER CLIC SUR UN DOCUMENT, hors plein écran : les trois outils sont
    // là, et prendre le crayon ne fait pas disparaître la barre — on écrit sur
    // CE document, la barre continue de parler de lui.
    const premierClic = await page.evaluate(() => {
        const focusAuDepart = document.body.classList.contains('focus-mode');
        if (focusAuDepart) toggleFocusMode();
        setMode('pointer');
        selectedItems = [];
        docEnAnnotation = null;
        majBarreDocument();
        const doc = images[0];
        // Un vrai clic sur le document, comme le professeur le ferait.
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        const vu = (id) => {
            const el = document.getElementById(id);
            return !!el && getComputedStyle(el).display !== 'none';
        };
        const auClic = { crayon: vu('doc-outil-crayon'), texte: vu('doc-outil-texte'),
                         main: vu('doc-outil-main') };

        // ON PREND LE CRAYON : la sélection se vide, la barre doit rester.
        document.getElementById('doc-outil-crayon').click();
        const auCrayon = {
            mode, retenu: docEnAnnotation === doc.id,
            barreLa: !!documentDeLaBarre() && documentDeLaBarre().id === doc.id,
            ctx: document.getElementById('bar-document').classList.contains('ctx-document'),
            allume: document.getElementById('doc-outil-crayon').classList.contains('actif'),
            // MAIS PAS LE MODE « ANNOTE » : hors plein écran, la barre ne se
            // réorganise pas — les vraies barres sont là, et ses réglages de
            // cadre n'ont pas à disparaître.
            annote: document.getElementById('bar-document').classList.contains('annote')
        };
        // « Sélection » rend le document en main.
        document.getElementById('doc-outil-main').click();
        const retour = { mode, choisi: selectedItems.length === 1 && selectedItems[0].id === doc.id };
        // On rend le plein écran tel qu'on l'a trouvé : ce qui suit y compte.
        if (focusAuDepart && !document.body.classList.contains('focus-mode')) toggleFocusMode();
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        return { auClic, auCrayon, retour, focusRendu: focusAuDepart === document.body.classList.contains('focus-mode') };
    });
    r.egal('au premier clic sur un document, les trois outils sont là',
        premierClic.auClic, { crayon: true, texte: true, main: true });
    r.egal('prendre le crayon garde la barre sur CE document',
        { mode: premierClic.auCrayon.mode, retenu: premierClic.auCrayon.retenu,
          barreLa: premierClic.auCrayon.barreLa, ctx: premierClic.auCrayon.ctx,
          allume: premierClic.auCrayon.allume },
        { mode: 'freehand', retenu: true, barreLa: true, ctx: true, allume: true });
    r.egal('sans pour autant la réorganiser : « annote » est réservé au plein écran',
        premierClic.auCrayon.annote, false);
    r.egal('et « Sélection » rend le document en main',
        { retour: premierClic.retour, focusRendu: premierClic.focusRendu },
        { retour: { mode: 'pointer', choisi: true }, focusRendu: true });

    // Quitter le Focus : les vraies barres reviennent, la mémoire s'efface
    const sortie = await page.evaluate(() => {
        document.getElementById('doc-outil-crayon').click();
        toggleFocusMode();
        return {
            docRetenu: docEnAnnotation,
            groupe: getComputedStyle(document.getElementById('doc-annoter')).display,
            barreVisible: document.getElementById('bar-document').classList.contains('ctx-document')
        };
    });
    r.egal('en quittant le Focus, la page annotée est oubliée', sortie.docRetenu, null);
    r.egal('le groupe d\'outils se range', sortie.groupe, 'none');
    r.verifie('et la barre s\'en va avec, plus rien n\'étant sélectionné', !sortie.barreVisible,
        JSON.stringify(sortie));

    // ELLE S'EN VA POUR DE BON. « ctx-document » range les commandes, mais la
    // barre gardait « visible » : restait au milieu de l'écran une pastille
    // orpheline — la poignée et le bouton d'orientation d'une barre qui ne
    // parle plus de rien. On mesure ce qui reste à l'écran, pas les classes.
    await page.waitForTimeout(400);
    const refermee = await page.evaluate(() => {
        const b = document.getElementById('bar-document');
        const s = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        // Ce qu'un doigt pourrait encore toucher dans la barre
        const attrapables = Array.from(b.querySelectorAll('button, .drag-handle, .drag-wrapper'))
            .filter(el => {
                const er = el.getBoundingClientRect();
                return er.width > 0 && er.height > 0 && getComputedStyle(el).display !== 'none';
            }).length;
        const auMilieu = document.elementFromPoint(
            Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return {
            visible: b.classList.contains('visible'),
            opacite: s.opacity,
            clics: s.pointerEvents,
            attrapables,
            barreSousLeDoigt: !!(auMilieu && auMilieu.closest && auMilieu.closest('#bar-document'))
        };
    });
    r.verifie('la barre du document est vraiment refermée, pas réduite à une pastille',
        refermee.opacite === '0' && !refermee.visible, JSON.stringify(refermee));
    r.verifie('et rien n\'y reste sous le doigt',
        refermee.clics === 'none' && refermee.barreSousLeDoigt === false, JSON.stringify(refermee));

    // --- « CADRE / PAGE » N'EST PAS POUR TOUT LE MONDE ---
    // Faire coulisser une page à l'intérieur d'un pion d'échecs n'a aucun sens.
    // Ces deux boutons sont réservés aux images importées et aux documents.
    const modesSelonLObjet = await page.evaluate(async () => {
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        setMode('pointer');
        images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        const lire = () => getComputedStyle(document.getElementById('doc-modes')).display;

        // Une image importée : elle y a droit.
        const carre = 'data:image/svg+xml;base64,' + btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60">'
            + '<rect width="80" height="60" fill="#69c"/></svg>');
        await new Promise(res => {
            const i = new Image();
            i.onload = () => {
                imageCache[i.src] = i;
                images.push({ id: nextId++, x: 100, y: 100, w: 80, h: 60,
                              cx: 0, cy: 0, cw: 80, ch: 60, src: i.src, z: globalZ++ });
                res();
            };
            i.src = carre;
        });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        const image = lire();

        // Une pièce de jeu : elle n'y a pas droit.
        await loadBoardGameElement(carre, 300, 100, 60, 60, false);
        selectedItems = [{ type: 'image', id: images[images.length - 1].id }];
        majBarreDocument();
        const piece = lire();
        return { image, piece, marque: images[images.length - 1].pluginData };
    });
    r.egal('une image importée garde « Cadre / Page »', modesSelonLObjet.image, 'contents');
    r.egal('une pièce de jeu ne les propose pas', modesSelonLObjet.piece, 'none');

    // La barre ne suit plus l'objet : elle est FIXE, en haut. Un seul endroit
    // à apprendre — c'est la logique de Canva. Le test qui vérifiait qu'elle se
    // posait sous l'objet, et remontait au-dessus quand il était trop bas, n'a
    // plus d'objet : il est remplacé par celui de la place fixe, plus haut.

    // --- UNE SEULE BARRE, UN SEUL ENDROIT, UN CONTENU QUI CHANGE ---
    // C'est la logique de Canva : l'œil apprend UNE place, et c'est le contenu
    // qui suit la sélection. La barre ne doit donc pas bouger d'un objet à
    // l'autre — c'est là-dessus que porte la dernière vérification.
    const contextes = await page.evaluate(async () => {
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        setMode('pointer');
        images.length = 0; texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        const carre = 'data:image/svg+xml;base64,' + btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90">'
            + '<rect width="120" height="90" fill="#69c"/></svg>');
        await new Promise(res => {
            const i2 = new Image();
            i2.onload = () => {
                imageCache[i2.src] = i2;
                images.push({ id: nextId++, x: 200, y: 420, w: 120, h: 90,
                              cx: 0, cy: 0, cw: 120, ch: 90, src: i2.src, z: globalZ++ });
                res();
            };
            i2.src = carre;
        });
        texts.push({ id: nextId++, x: 400, y: 200, content: 'essai', size: 24, color: '#000', z: globalZ++ });

        // DEUX MEUBLES, DEUX PROPOS. Le document a sa barre ; le style a la
        // sienne. Choisir le crayon pendant qu'on tenait un polycopié
        // déversait tous les réglages du crayon par-dessus les pages et le
        // découpage — c'est ce qui a été séparé.
        const barre = document.getElementById('bar-document');
        const style = document.getElementById('bar-style');
        const etat = (n) => {
            const r = barre.getBoundingClientRect();
            const vu = (id) => document.getElementById(id).offsetParent !== null;
            return { nom: n,
                     visible: barre.classList.contains('visible'),
                     document: barre.classList.contains('ctx-document'),
                     styleVisible: style.classList.contains('visible'),
                     texte: style.classList.contains('ctx-text'),
                     // L'ordre de gauche à droite, et ce qui se voit vraiment
                     rogner: vu('doc-rogner'),
                     x: Math.round((r.left + r.right) / 2), y: Math.round(r.top) };
        };
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        const surImage = etat('image');
        selectedItems = [{ type: 'text', id: texts[0].id }];
        updateStyleBarContext();
        const surTexte = etat('texte');
        selectedItems = []; setMode('freehand'); updateStyleBarContext();
        const outilEnMain = etat('outil');
        setMode('pointer');
        return { surImage, surTexte, outilEnMain };
    });
    r.verifie('une image : la barre montre les réglages du document',
        contextes.surImage.visible && contextes.surImage.document,
        JSON.stringify(contextes.surImage));
    r.verifie('un texte : la barre de STYLE montre les siens, et celle du document s\'en va',
        contextes.surTexte.styleVisible && contextes.surTexte.texte
        && !contextes.surTexte.document,
        JSON.stringify(contextes.surTexte));
    // ET LE CAS QUI A TOUT DÉCLENCHÉ : le crayon pris pendant qu'on tient un
    // polycopié. Les réglages du crayon vont dans la barre de style ; celle
    // du document n'en reçoit aucun.
    r.egal('prendre un outil ne déverse rien dans la barre du document',
        { document: contextes.outilEnMain.document, style: contextes.outilEnMain.styleVisible },
        { document: false, style: true });
    // LE ROGNAGE EST REVENU DANS LA BARRE, et lui seul : c'est un MODE qu'on
    // allume et qu'on éteint, pas un réglage qu'on règle une fois. Les autres
    // — proportions, quadrillage — sont restés dans le volet, où ils portent
    // enfin leur nom.
    r.egal('le rognage, qui est un mode, se commande depuis la barre', contextes.surImage.rogner, true);
    const rangement = await page.evaluate(() => {
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        majReglagesDuVolet();
        const vu = (id) => {
            const e = document.getElementById(id);
            return !!(e && getComputedStyle(e).display !== 'none');
        };
        const nomme = (id) => (document.getElementById(id) || {}).textContent || '';
        return { bloc: vu('dv-reglages'), rogner: vu('dv-rogner'),
                 proportions: vu('dv-proportions'), grille: vu('dv-grille'),
                 motRogner: nomme('dv-rogner').trim() };
    });
    r.egal('mais il est dans le volet, avec les autres réglages de page',
        { bloc: rangement.bloc, rogner: rangement.rogner,
          proportions: rangement.proportions, grille: rangement.grille },
        { bloc: true, rogner: true, proportions: true, grille: true });
    r.egal('et il y porte son nom', rangement.motRogner, 'Rogner la page');

    // L'ORDRE DE GAUCHE À DROITE, c'est lui qui fait la cohérence : l'objet,
    // son apparence, sa place dans la pile, le presse-papiers, le cadenas, et
    // la suppression tout au bout — la seule action irréversible.
    const ordre = await page.evaluate(() => {
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        // DANS LA BARRE DU DOCUMENT, et nulle part ailleurs : la couleur, la
        // pile et le presse-papiers vivent depuis toujours dans la barre de
        // STYLE, qui est un autre meuble — les y trouver n'est pas les
        // trouver ici.
        const x = (id) => {
            const e = document.getElementById(id);
            if (!e || !e.closest('#bar-document') || !e.getClientRects().length) return null;
            return e.getBoundingClientRect().left;
        };
        // Sur une IMAGE ordinaire, ni pages ni zones : elles n'ont de sens que
        // sur un PDF. Il reste « Cadre / Page », qui dit ce qu'un glissement
        // déplace, et c'est tout ce que la barre doit porter ici.
        return { mode: x('doc-mode-bascule'),
                 // ce qui a quitté la barre pour le volet
                 rogner: x('doc-rogner'),
                 partis: ['doc-proportions', 'doc-grille', 'btn-color-popover',
                          'btn-z-up', 'btn-copier'].filter(id => x(id) !== null) };
    });
    const suite = ['mode', 'rogner'].map(k => ordre[k]);
    r.egal('rien de ce qui a rejoint le volet ne traîne encore dans la barre', ordre.partis, []);
    r.verifie('sur une image, la barre garde le bouton de mode et le rognage',
        suite.every(v => v !== null),
        JSON.stringify(ordre));
    // Cette ligne lisait « visible » sur la barre du DOCUMENT pour dire que
    // l'outil est réglé — elle ne passait que parce que cette barre gardait
    // « visible » après coup. C'est la barre de STYLE qui règle l'outil ;
    // celle du document, elle, doit s'être refermée pour de bon.
    r.verifie('rien de sélectionné, un crayon en main : le style règle l\'outil, le document s\'efface',
        contextes.outilEnMain.styleVisible && !contextes.outilEnMain.document
        && !contextes.outilEnMain.visible,
        JSON.stringify(contextes.outilEnMain));
    // Le cœur du parti pris : elle ne se déplace pas d'un objet à l'autre.
    const places = [contextes.surImage, contextes.surTexte, contextes.outilEnMain];
    r.verifie('et elle ne bouge pas d\'un objet à l\'autre : une seule place à apprendre',
        places.every(p => p.y === places[0].y && Math.abs(p.x - places[0].x) <= 1),
        JSON.stringify(places));

    // --- UN PLATEAU SE POSE D'UN SEUL COUP DE PINCEAU ---
    // 41 objets pour trois dessins : on décodait une image par case et l'on
    // repeignait tout le tableau à chaque fois. Une seconde d'attente, et les
    // pions tombaient un à un.
    const damier = await page.evaluate(async () => {
        images.length = 0; selectedItems = []; majBarreDocument();
        let dessins = 0; const vrai = window.draw;
        window.draw = function () { dessins++; return vrai.apply(this, arguments); };
        const t0 = performance.now();
        PluginManager.plugins.checkersTool.buildGame();
        await new Promise(r2 => { const att = () => images.length >= 41 ? r2() : setTimeout(att, 4); att(); });
        await new Promise(r2 => requestAnimationFrame(r2));
        const ms = performance.now() - t0;
        window.draw = vrai;
        return { ms: Math.round(ms), dessins, pieces: images.length };
    });
    r.egal('le damier pose bien ses 41 éléments', damier.pieces, 41);
    r.verifie('en une poignée de repeintures, pas une par pièce',
        damier.dessins <= 4, JSON.stringify(damier));
    r.verifie('et sans faire attendre', damier.ms < 400, JSON.stringify(damier));

    await page.evaluate(() => {
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        setMode('pointer');
        images.length = 0; freehands.length = 0; selectedItems = []; panX = 0; panY = 0;
        majBarreDocument(); draw();
    });

    // =========================================================================
    // UN DOCUMENT TENU N'A QU'UNE BARRE
    // « Ça fait beaucoup de barres pour le pdf ! » — il en paraissait TROIS
    // empilées par-dessus la page : la sienne, celle du style, et le menu de
    // l'objet. Pour un document, celle du style ne portait plus que la pile,
    // l'opacité et le presse-papiers ; les deux premières ont rejoint le volet,
    // où elles portent enfin un nom.
    // =========================================================================
    const empilement = await page.evaluate(async () => {
        images.length = 0; texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        setMode('pointer');
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext(); majBarreDocument(); updateQuickMenu();
        await new Promise(r => setTimeout(r, 350));
        const dehors = (el) => {
            if (!el) return false;
            const b = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return b.width > 4 && b.height > 4 && s.display !== 'none' && s.opacity !== '0' && !el.hidden;
        };
        const flottantes = ['bar-document', 'bar-style', 'quick-edit-menu']
            .filter(id => dehors(document.getElementById(id)));

        // Et la barre de style revient dès qu'on prend un outil pour écrire
        // dessus : c'est là qu'on choisit sa couleur et son épaisseur.
        document.getElementById('doc-outil-crayon').click();
        await new Promise(r => setTimeout(r, 350));
        const auCrayon = { style: dehors(document.getElementById('bar-style')),
                           doc: dehors(document.getElementById('bar-document')) };
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        return { flottantes, auCrayon };
    });
    r.egal('un document tenu : sa barre et le menu de l\'objet, et rien de plus',
        empilement.flottantes, ['bar-document', 'quick-edit-menu']);
    r.egal('mais la barre de style revient avec l\'outil, pour choisir sa couleur',
        empilement.auCrayon, { style: true, doc: true });

    // ET LES DEUX QUI RESTENT NE SE RECOUVRENT PAS. En plein écran, la page
    // occupe tout l'écran : le menu de l'objet, faute de place dessous, se
    // rabattait au ras du bord — exactement là où la barre du document vient
    // de se poser. « Les barres du bas se chevauchent. »
    const basDeLEcran = await page.evaluate(async () => {
        panX = 0; panY = 0; zoom = 1; images.length = 0; selectedItems = [];
        images.push({ id: nextId++, x: 20, y: 20, w: window.innerWidth - 40, h: window.innerHeight - 40,
                      z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        presentationEnCours = images[0].id;
        if (!document.body.classList.contains('focus-mode')) toggleFocusMode();
        updateStyleBarContext(); majBarreDocument(); updateQuickMenu();
        await new Promise(r => setTimeout(r, 400));
        const boite = (id) => {
            const r = document.getElementById(id).getBoundingClientRect();
            return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) };
        };
        const q = boite('quick-edit-menu'), d = boite('bar-document');
        const plancher = plafondDesBarresDuBas();
        presentationEnCours = null;
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        // On rend le document au bloc suivant, tel qu'il l'attend.
        images.length = 0;
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); updateQuickMenu(); draw();
        return {
            q, d, plancher,
            croise: !(q.r < d.l || d.r < q.l || q.b < d.t || d.b < q.t),
            dedans: q.b <= window.innerHeight && q.t >= 0
        };
    });
    r.verifie('en plein écran, le menu de l\'objet ne tombe pas sur la barre du document',
        !basDeLEcran.croise && basDeLEcran.dedans, JSON.stringify(basDeLEcran));
    r.verifie('la barre du bas fait plancher : rien ne se pose plus bas qu\'elle',
        basDeLEcran.plancher < 860 || basDeLEcran.q.b <= basDeLEcran.d.t,
        JSON.stringify(basDeLEcran));

    // EN PRÉSENTATION, LA MAIN NE PREND PAS TOUT. « Quand je crée du texte ou
    // du trait et qu'après je prends la souris, je ne peux pas bouger les
    // objets sur le pdf. » Le glisser prenait la page quoi qu'on vise : on
    // écrivait un mot sur la page, on reprenait la flèche pour le replacer, et
    // la page défilait sous le mot. Ce qu'on a posé dessus se rattrape
    // maintenant comme ailleurs ; le vide et la page restent la main.
    const surLaPagePresentee = await page.evaluate(async () => {
        images.length = 0; freehands.length = 0; texts.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        // Une page haute : plus grande que l'écran, on doit pouvoir y défiler.
        images.push({ id: nextId++, x: 100, y: 100, w: 600, h: 1600, z: globalZ++, nomFichier: 'poly.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        presentationEnCours = images[0].id;
        if (!document.body.classList.contains('focus-mode')) toggleFocusMode();
        // Un trait posé sur la page, tel que le crayon le pose.
        const cx = 400, cy = 400;
        freehands.push({ id: nextId++, type: 'freehand',
                         points: [{ x: cx - 40, y: cy }, { x: cx, y: cy }, { x: cx + 40, y: cy }],
                         color: '#e74c3c', width: 4, z: globalZ++ });
        setMode('pointer'); selectedItems = []; draw();
        await new Promise(r => setTimeout(r, 150));
        return { ecran: { x: Math.round(cx * zoom + panX), y: Math.round(cy * zoom + panY) },
                 vide: { x: Math.round(300 * zoom + panX), y: Math.round(650 * zoom + panY) },
                 traitAvant: Math.round(freehands[0].points[0].x),
                 panAvant: Math.round(panY) };
    });
    // On rattrape le trait : c'est LUI qui bouge, pas la page.
    await page.mouse.move(surLaPagePresentee.ecran.x, surLaPagePresentee.ecran.y);
    await page.mouse.down();
    await page.mouse.move(surLaPagePresentee.ecran.x + 80, surLaPagePresentee.ecran.y + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    const apresLeTrait = await page.evaluate(() => ({
        trait: Math.round(freehands[0].points[0].x), pan: Math.round(panY) }));
    r.verifie('en présentation, on rattrape ce qu\'on a posé sur la page',
        apresLeTrait.trait > surLaPagePresentee.traitAvant + 20,
        JSON.stringify({ avant: surLaPagePresentee.traitAvant, apres: apresLeTrait }));

    // Mais la page elle-même reste la main : sans quoi on ne descendrait plus.
    await page.mouse.move(surLaPagePresentee.vide.x, surLaPagePresentee.vide.y);
    await page.mouse.down();
    await page.mouse.move(surLaPagePresentee.vide.x, surLaPagePresentee.vide.y - 120, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    const apresLaPage = await page.evaluate(() => {
        const p = Math.round(panY);
        presentationEnCours = null;
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        images.length = 0; freehands.length = 0; selectedItems = [];
        images.push({ id: nextId++, x: 40, y: 40, w: 500, h: 620, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); updateQuickMenu(); draw();
        return p;
    });
    r.verifie('et glisser la page la fait toujours défiler sous les yeux',
        apresLaPage !== apresLeTrait.pan, JSON.stringify({ avant: apresLeTrait.pan, apres: apresLaPage }));

    // LA BARRE PARLE DE LA PAGE PROJETÉE, PAS DE LA SÉLECTION. « J'ai
    // sélectionné un objet, je l'ai bougé, mais quand je clique ailleurs je ne
    // reviens pas sur mon pdf » : la barre suivait la seule sélection ; on
    // prenait un mot posé sur la page, la page n'était plus « choisie », et sa
    // barre s'en allait avec ses pages et son plein écran — sans moyen de la
    // rappeler, puisqu'en présentation la page se prend à la main.
    const barreEnProjection = await page.evaluate(async () => {
        images.length = 0; texts.length = 0; points.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        images.push({ id: nextId++, x: 40, y: 40, w: 500, h: 620, z: globalZ++, nomFichier: 'doc.pdf' });
        texts.push({ id: nextId++, x: 100, y: 200, content: 'un mot', fontSize: 30,
                     color: '#2d3436', z: globalZ++ });
        selectedItems = [{ type: 'image', id: images[0].id }];
        presentationEnCours = images[0].id;
        if (!document.body.classList.contains('focus-mode')) toggleFocusMode();
        majBarreDocument();
        await new Promise(r => setTimeout(r, 120));
        const enTenantLaPage = document.getElementById('bar-document').classList.contains('ctx-document');
        // On prend le mot posé dessus : la page n'est plus « choisie ».
        selectedItems = [{ type: 'text', id: texts[0].id }];
        majBarreDocument();
        await new Promise(r => setTimeout(r, 120));
        const surLeMot = document.getElementById('bar-document').classList.contains('ctx-document');
        // Et l'on lâche tout : la barre parle encore de la page qu'on projette.
        selectedItems = [];
        majBarreDocument();
        await new Promise(r => setTimeout(r, 120));
        const rienDeChoisi = {
            ctx: document.getElementById('bar-document').classList.contains('ctx-document'),
            vue: getComputedStyle(document.getElementById('bar-document')).opacity !== '0',
            doc: !!documentDeLaBarre()
        };
        presentationEnCours = null;
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        texts.length = 0;
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); draw();
        return { enTenantLaPage, surLeMot, rienDeChoisi };
    });
    r.verifie('en projection, la barre parle de la page même quand on tient autre chose',
        barreEnProjection.enTenantLaPage && barreEnProjection.surLeMot,
        JSON.stringify(barreEnProjection));
    r.egal('et elle reste là quand on ne tient plus rien : on retrouve son pdf',
        barreEnProjection.rienDeChoisi, { ctx: true, vue: true, doc: true });

    // UN DOCUMENT EST UNE SURFACE, PAS UN OBSTACLE. « L'outil point n'a pas
    // dessiné de point sur mon pdf » : le crayon, le texte, le segment, le
    // cercle se posent tous sur un polycopié ; le point, seul, était refusé —
    // cliquer sur la page rendait un « clickedObj », et rien ne se posait.
    const pointSurLaPage = await page.evaluate(async () => {
        images.length = 0; points.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        magnetMode = false;
        images.push({ id: nextId++, x: 200, y: 150, w: 500, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        setMode('point');
        draw();
        return { x: 400, y: 400, avant: points.length };
    });
    await page.mouse.click(pointSurLaPage.x, pointSurLaPage.y);
    await page.waitForTimeout(200);
    const posePoint = await page.evaluate(() => {
        const n = points.length;
        const p = points[points.length - 1];
        const dedans = !!p && p.x > 200 && p.x < 700 && p.y > 150 && p.y < 650;
        setMode('pointer'); points.length = 0; magnetMode = true;
        images.length = 0;
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); draw();
        return { n, dedans };
    });
    r.egal('l\'outil Point pose son point SUR le document', posePoint.n, 1);
    r.verifie('et il tombe bien sur la page, là où l\'on a cliqué', posePoint.dedans,
        JSON.stringify(posePoint));

    // =========================================================================
    // CE QU'ON ÉCRIT SUR UNE PAGE APPARTIENT À CETTE PAGE
    // « Quand je croppe et que je déplace, des bouts de ce qui était dans le
    //   pdf sortent du cadre. Vérifie vraiment tout le fonctionnement du pdf,
    //   des outils dessus, de redimensionnement. »
    // =========================================================================

    // 1. UNE PAGE ROGNÉE S'ARRÊTE À SON CADRE, l'encre comprise. Elle SUIVAIT
    // le rognage — elle se replace avec la page — mais rien ne la coupait : ce
    // qui était écrit sur la partie retirée continuait de se voir, étalé autour.
    const encreRognee = await page.evaluate(async () => {
        images.length = 0; freehands.length = 0; texts.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        const carre = 'data:image/svg+xml;base64,' + btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">'
            + '<rect width="400" height="400" fill="#fff"/></svg>');
        await new Promise(res => {
            const i = new Image();
            i.onload = () => { imageCache[i.src] = i; res(); };
            i.src = carre;
        });
        const o = { id: nextId++, x: 300, y: 200, w: 400, h: 400, cx: 0, cy: 0, cw: 400, ch: 400,
                    src: carre, z: globalZ++, nomFichier: 'page.png' };
        images.push(o);
        // Deux traits : l'un en haut de la page, l'autre en bas.
        const trait = (y, x0, x1) => ({ id: nextId++,
            points: [{ x: (x0 === undefined ? o.x + 80 : x0), y },
                     { x: (x1 === undefined ? o.x + 320 : x1), y }],
            color: '#e74c3c', width: 5, z: globalZ++,
            surObjet: { type: 'image', id: o.id } });
        freehands.push(trait(o.y + 80), trait(o.y + 320));
        // Et un trait qui DÉBORDE volontairement dans la marge : sur une page
        // entière, c'est un trait qu'on a voulu là — la flèche qui montre
        // quelque chose à côté. Il ne doit pas être coupé.
        freehands.push(trait(o.y + 40, o.x + 300, o.x + o.w + 160));
        draw();
        const rouge = () => {
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] < 110) n++;
            }
            return n;
        };
        const avant = rouge();
        // Le débord se compte à part : à droite de la page, hors du cadre.
        const dehors = () => {
            const x0 = Math.round((o.x + o.w) * zoom + panX) + 4;
            const d = ctx.getImageData(x0, 0, Math.max(1, canvas.width - x0), canvas.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] < 110) n++;
            }
            return n;
        };
        const debordAvant = dehors();
        // On ne garde que la moitié haute : le trait du bas tombe hors du cadre.
        o.ch = 200; o.h = 200;
        draw();
        const apres = rouge();
        const debordApres = dehors();
        images.length = 0; freehands.length = 0; draw();
        return { avant, apres, debordAvant, debordApres, rogne: avant > 0 };
    });
    r.verifie('deux traits écrits sur la page se voient',
        encreRognee.avant > 400, JSON.stringify(encreRognee));
    r.verifie('page ENTIÈRE, le trait qui déborde dans la marge se voit : on l\'a voulu là',
        encreRognee.debordAvant > 100, JSON.stringify(encreRognee));
    r.verifie('et la page rognée n\'en montre plus qu\'un : l\'encre s\'arrête au cadre',
        encreRognee.apres > 0 && encreRognee.apres < encreRognee.avant * 0.6
        && encreRognee.debordApres === 0,
        JSON.stringify(encreRognee));

    // 2. UN POINT POSÉ SUR LA PAGE LUI APPARTIENT. L'encre, les textes et les
    // figures s'y accrochaient ; le point posé seul, non — on marquait un
    // endroit, on déplaçait le polycopié, et la croix restait sur le tableau.
    const pointAccroche = await page.evaluate(async () => {
        images.length = 0; points.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1; magnetMode = false;
        images.push({ id: nextId++, x: 200, y: 150, w: 500, h: 500, z: globalZ++,
                      nomFichier: 'doc.pdf',
                      pluginData: { id: 'pdfDoc', cle: 'x', page: 1, pages: 3 } });
        documentsPdf.set('x', { pages: 3 });
        setMode('point');
        return { x: 400, y: 400 };
    });
    await page.mouse.click(pointAccroche.x, pointAccroche.y);
    await page.waitForTimeout(200);
    const suitLaPage = await page.evaluate(() => {
        const p = points[0], o = images[0];
        const releve = { accroche: !!(p && p.surObjet && p.surObjet.id === o.id),
                         page: !!(p && p.surPage), avant: p ? Math.round(p.x) : null };
        // La page s'en va : le point part avec elle.
        deplacerLesTraits('image', o.id, 120, 0);
        const apres = Math.round(points[0].x);
        documentsPdf.delete('x');
        setMode('pointer'); points.length = 0; images.length = 0; magnetMode = true;
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); draw();
        return { ...releve, apres, attendu: releve.avant + 120 };
    });
    r.verifie('un point posé sur la page s\'y accroche, et appartient à sa page',
        suitLaPage.accroche && suitLaPage.page, JSON.stringify(suitLaPage));
    r.verifie('et il part avec elle quand on la déplace',
        Math.abs(suitLaPage.apres - suitLaPage.attendu) < 1, JSON.stringify(suitLaPage));

    // 3. LA POIGNÉE AGRANDIT LA PAGE ET CE QU'ON A ÉCRIT DESSUS. Le relevé
    // d'avant-manœuvre ne se faisait que s'il y avait un TRAIT accroché : un
    // document ne portant qu'un bloc de texte était agrandi sans lui.
    const grandirAvecLaPage = await page.evaluate(async () => {
        images.length = 0; texts.length = 0; freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        const o = { id: nextId++, x: 200, y: 150, w: 400, h: 400, z: globalZ++, nomFichier: 'doc.pdf',
                    ratioLocked: false };
        images.push(o);
        texts.push({ id: nextId++, x: o.x + 60, y: o.y + 60, content: 'essai', fontSize: 24,
                     color: '#2d3436', z: globalZ++, surObjet: { type: 'image', id: o.id } });
        selectedItems = [{ type: 'image', id: o.id }];
        updateQuickMenu(); draw();
        await new Promise(r => setTimeout(r, 120));
        return { w: o.w, taille: texts[0].fontSize, x: Math.round(texts[0].x),
                 coin: { x: Math.round((o.x + o.w) * zoom + panX),
                         y: Math.round((o.y + o.h) * zoom + panY) } };
    });
    await page.mouse.move(grandirAvecLaPage.coin.x, grandirAvecLaPage.coin.y);
    await page.mouse.down();
    await page.mouse.move(grandirAvecLaPage.coin.x + 200, grandirAvecLaPage.coin.y + 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const apresLaPoignee = await page.evaluate(() => {
        const m = { w: Math.round(images[0].w), taille: Math.round(texts[0].fontSize),
                    x: Math.round(texts[0].x) };
        images.length = 0; texts.length = 0; selectedItems = [];
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); updateQuickMenu(); draw();
        return m;
    });
    r.verifie('la poignée agrandit bien la page',
        apresLaPoignee.w > grandirAvecLaPage.w + 50,
        JSON.stringify({ avant: grandirAvecLaPage.w, apres: apresLaPoignee.w }));
    r.verifie('et ce qu\'on a écrit dessus grandit avec elle, même sans un seul trait',
        apresLaPoignee.taille > grandirAvecLaPage.taille + 2
        && apresLaPoignee.x > grandirAvecLaPage.x,
        JSON.stringify({ avant: grandirAvecLaPage, apres: apresLaPoignee }));

    // 4. ROGNER N'EST PAS REDIMENSIONNER. « Le cropping compresse les objets
    // dans le pdf » : l'encre était étirée pour tenir dans la nouvelle boîte,
    // comme lors d'un agrandissement. Or rogner ne change pas l'échelle du
    // contenu, seulement ce qu'on en voit — le mot écrit sur la page reste où
    // il est, à sa taille, et ce qui tombe hors du cadre est simplement caché.
    const avantDeRogner = await page.evaluate(async () => {
        images.length = 0; texts.length = 0; freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        // Une page DEUX FOIS PLUS LARGE QUE HAUTE, qu'on va recouper dans une
        // autre proportion : « page entière » devra alors rendre au cadre la
        // forme de la page, et sa HAUTEUR changera en même temps que le
        // cadrage. C'est là, les deux bougeant ensemble, que l'encre se
        // faisait compresser.
        const bande = 'data:image/svg+xml;base64,' + btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">'
            + '<rect width="400" height="200" fill="#fff"/></svg>');
        await new Promise(res => {
            const i = new Image();
            i.onload = () => { imageCache[i.src] = i; res(); };
            i.src = bande;
        });
        const o = { id: nextId++, x: 200, y: 150, w: 400, h: 200, cx: 0, cy: 0, cw: 400, ch: 200,
                    src: bande, z: globalZ++, nomFichier: 'page.png',
                    ratioLocked: false, isCropping: true };
        images.push(o);
        texts.push({ id: nextId++, x: o.x + 120, y: o.y + 80, content: 'mot', fontSize: 30,
                     color: '#2d3436', z: globalZ++, surObjet: { type: 'image', id: o.id } });
        freehands.push({ id: nextId++,
            points: [{ x: o.x + 140, y: o.y + 120 }, { x: o.x + 300, y: o.y + 120 }],
            color: '#e74c3c', width: 5, z: globalZ++, surObjet: { type: 'image', id: o.id } });
        selectedItems = [{ type: 'image', id: o.id }];
        updateQuickMenu(); draw();
        await new Promise(r => setTimeout(r, 120));
        return { taille: texts[0].fontSize, x: Math.round(texts[0].x), y: Math.round(texts[0].y),
                 long: Math.round(freehands[0].points[1].x - freehands[0].points[0].x),
                 coin: { x: Math.round(o.x * zoom + panX), y: Math.round(o.y * zoom + panY) } };
    });
    // On referme le coin HAUT-GAUCHE : la page perd sa marge de gauche et son
    // haut — le cadrage se déplace en même temps qu'il se resserre.
    await page.mouse.move(avantDeRogner.coin.x, avantDeRogner.coin.y);
    await page.mouse.down();
    await page.mouse.move(avantDeRogner.coin.x + 80, avantDeRogner.coin.y + 20, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const apresLeRognage = await page.evaluate(() => {
        const o = images[0];
        return { cadre: { w: Math.round(o.w), h: Math.round(o.h),
                          cx: Math.round(o.cx), cy: Math.round(o.cy),
                          cw: Math.round(o.cw), ch: Math.round(o.ch) },
                 taille: Math.round(texts[0].fontSize),
                 x: Math.round(texts[0].x), y: Math.round(texts[0].y),
                 long: Math.round(freehands[0].points[1].x - freehands[0].points[0].x) };
    });
    r.egal('la poignée du mode rognage referme le cadre sur ce qu\'on garde',
        apresLeRognage.cadre, { w: 320, h: 180, cx: 80, cy: 20, cw: 320, ch: 180 });
    r.egal('et ce qu\'on a écrit dessus garde sa place et sa taille : rogner n\'est pas redimensionner',
        { taille: apresLeRognage.taille, x: apresLeRognage.x, y: apresLeRognage.y,
          long: apresLeRognage.long },
        { taille: Math.round(avantDeRogner.taille), x: avantDeRogner.x, y: avantDeRogner.y,
          long: avantDeRogner.long });

    // « PAGE ENTIÈRE » remet toute l'image dans la MÊME largeur de cadre : là,
    // le contenu rapetisse pour de bon, et l'encre doit rapetisser avec lui.
    // 320 px de tableau montrent désormais les 400 px de la page, soit 0,8× —
    // et le mot, qui était à 40 px du bord gauche du cadre, s'y retrouve à 96.
    const pageEntiere = await page.evaluate(() => {
        const o = images[0];
        o.isCropping = false;
        montrerToutLeDocument(o);
        return { cadre: { w: Math.round(o.w), h: Math.round(o.h),
                          cw: Math.round(o.cw), ch: Math.round(o.ch) },
                 taille: Math.round(texts[0].fontSize),
                 x: Math.round(texts[0].x), y: Math.round(texts[0].y),
                 long: Math.round(freehands[0].points[1].x - freehands[0].points[0].x) };
    });
    r.egal('« page entière » rend au cadre la forme de la page',
        pageEntiere.cadre, { w: 320, h: 160, cw: 400, ch: 200 });
    r.egal('et l\'encre rapetisse d\'autant, sans se déformer',
        { taille: pageEntiere.taille, x: pageEntiere.x, y: pageEntiere.y, long: pageEntiere.long },
        { taille: 24, x: 376, y: 234, long: 128 });

    const retourAuCadrage = await page.evaluate(() => {
        const o = images[0];
        revenirAuCadrage(o);
        const m = { taille: Math.round(texts[0].fontSize),
                    x: Math.round(texts[0].x), y: Math.round(texts[0].y),
                    long: Math.round(freehands[0].points[1].x - freehands[0].points[0].x) };
        images.length = 0; texts.length = 0; freehands.length = 0; selectedItems = [];
        draw();
        return m;
    });
    r.egal('et revenir au cadrage d\'avant rend au mot exactement sa taille et sa place',
        retourAuCadrage,
        { taille: Math.round(avantDeRogner.taille), x: avantDeRogner.x,
          y: avantDeRogner.y, long: avantDeRogner.long });

    // ET PENDANT QU'ON PROJETTE, IL NE PARAÎT PAS DU TOUT. « Que penses-tu de
    // ce doublon des barres en bas ? » — deux meubles pour la même page, dont
    // l'un ne sert à rien là : verrouiller, dupliquer, SUPPRIMER, devant la
    // classe, sur la page qu'on montre. Un appui sur le plein écran les rend.
    const enProjection = await page.evaluate(async () => {
        images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        images.push({ id: nextId++, x: 40, y: 40, w: 500, h: 620, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); updateQuickMenu();
        await new Promise(r => setTimeout(r, 200));
        const vu = () => document.getElementById('quick-edit-menu').classList.contains('visible');
        const avant = vu();
        const premier = cyclerLePleinEcran();
        await new Promise(r => setTimeout(r, 300));
        const enPlein = { etat: premier, menu: vu(),
                          barre: document.getElementById('bar-document').classList.contains('visible') };
        // Deuxième temps : les barres reviennent, le menu de l'objet non.
        cyclerLePleinEcran();
        await new Promise(r => setTimeout(r, 300));
        const avecBarres = vu();
        cyclerLePleinEcran();
        await new Promise(r => setTimeout(r, 300));
        const rendu = vu();
        // On rend le tableau au bloc suivant, tel qu'il l'attend.
        images.length = 0;
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); updateQuickMenu(); draw();
        return { avant, enPlein, avecBarres, rendu };
    });
    r.egal('hors projection, le menu de l\'objet est là',
        enProjection.avant, true);
    r.egal('mais en projection il s\'efface : une seule barre au bas de l\'écran',
        { etat: enProjection.enPlein.etat, menu: enProjection.enPlein.menu,
          barre: enProjection.enPlein.barre },
        { etat: 1, menu: false, barre: true });
    r.egal('y compris au deuxième temps, quand les barres reviennent',
        enProjection.avecBarres, false);
    r.egal('et il revient dès qu\'on sort du plein écran', enProjection.rendu, true);

    // ELLE SE SIGNALE QUAND ELLE CHANGE DE PLACE. « Parfois la toolbar du pdf
    // va à un autre endroit pour ne pas se faire écraser, mais on la cherche
    // du coup. » Elle passe du haut au bas en plein écran, se met debout, se
    // range sous un tiroir qui s'ouvre : à chaque fois elle réapparaît
    // ailleurs, sans rien dire.
    const signal = await page.evaluate(async () => {
        const barre = document.getElementById('bar-document');
        images.length = 0; selectedItems = [];
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        await new Promise(r => setTimeout(r, 60));
        barre.classList.remove('se-signale');
        const auRepos = barre.classList.contains('se-signale');
        const placeAvant = barre.style.top;

        // Le plein écran la fait descendre en bas : c'est là qu'on la perd.
        toggleFocusMode();
        await new Promise(r => setTimeout(r, 60));
        const apresLeSaut = { signale: barre.classList.contains('se-signale'),
                              bougee: barre.style.top !== placeAvant };

        // Et un second placement AU MÊME ENDROIT ne clignote pas pour rien.
        barre.classList.remove('se-signale');
        majBarreDocument();
        await new Promise(r => setTimeout(r, 60));
        const surPlace = barre.classList.contains('se-signale');

        toggleFocusMode();
        await new Promise(r => setTimeout(r, 60));
        // On laisse le document en place : le bloc suivant compte dessus.
        majBarreDocument(); draw();
        return { auRepos, apresLeSaut, surPlace };
    });
    r.verifie('la barre du document se signale quand elle change de place',
        signal.apresLeSaut.bougee && signal.apresLeSaut.signale, JSON.stringify(signal));
    r.verifie('mais elle ne clignote pas quand elle reste où elle est',
        signal.auRepos === false && signal.surPlace === false, JSON.stringify(signal));
    // QUATRE FOIS, ET NON UNE : « une fois c'est trop peu ». Le temps de
    // tourner la tête vers la classe et de revenir, le halo était déjà passé.
    const clignote = await page.evaluate(() => {
        const b = document.getElementById('bar-document');
        b.classList.add('se-signale');
        const n = getComputedStyle(b).animationIterationCount;
        b.classList.remove('se-signale');
        return n;
    });
    r.verifie('et il clignote quatre fois, pas une', Number(clignote) >= 4, String(clignote));

    // ET LE DOCUMENT LÂCHÉ NE SE RÉVEILLE PAS. « Le pdf n'est plus sélectionné,
    // mais lorsque j'appuie sur l'outil Texte dans la barre de gauche, sa barre
    // revient. » Le souvenir du document annoté ne s'effaçait jamais : repris
    // l'outil, la barre revenait pour un document que plus personne ne tenait.
    const lache = await page.evaluate(async () => {
        images.length = 0; selectedItems = []; setMode('pointer');
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        // On prend le crayon EN TENANT le document : la barre doit rester.
        setMode('freehand'); docEnAnnotation = images[0].id; majBarreDocument();
        await new Promise(r => setTimeout(r, 80));
        const enTenant = document.getElementById('bar-document').classList.contains('ctx-document');
        // On lâche le document, puis on reprend l'outil Texte à la barre de gauche.
        selectedItems = []; setMode('pointer'); majBarreDocument();
        await new Promise(r => setTimeout(r, 80));
        const lachee = document.getElementById('bar-document').classList.contains('ctx-document');
        setMode('text'); majBarreDocument();
        await new Promise(r => setTimeout(r, 80));
        const apresLOutil = document.getElementById('bar-document').classList.contains('ctx-document');
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument(); draw();
        return { enTenant, lachee, apresLOutil, souvenir: docEnAnnotation };
    });
    r.verifie('le crayon pris EN TENANT le document garde sa barre', lache.enTenant,
        JSON.stringify(lache));
    r.egal('le document lâché, sa barre s\'en va — et l\'outil Texte ne la rappelle pas',
        { lachee: lache.lachee, apresLOutil: lache.apresLOutil, souvenir: lache.souvenir },
        { lachee: false, apresLOutil: false, souvenir: null });

    // CE QUI A DÉMÉNAGÉ AGIT VRAIMENT. Un réglage qui a changé de meuble et
    // ne fait plus rien est pire que celui qu'on a déplacé.
    const voletAgit = await page.evaluate(async () => {
        const o = images[0];
        o.z = 5; o.opacity = 1;
        voletOuvert = true; majLeVolet(); majReglagesDuVolet();
        await new Promise(r => setTimeout(r, 200));
        const zAvant = o.z;
        document.getElementById('dv-devant').click();
        const devant = o.z > zAvant;
        document.getElementById('dv-derriere').click();
        const derriere = o.z < zAvant;

        // ET PENDANT QU'ON ANNOTE, la sélection est VIDE — c'est la page tenue
        // par la barre qui compte. La pile agit sur la sélection : sans rendre
        // le document en main le temps du clic, le réglage ne touchait rien.
        // Dans cet ordre-là, comme le fait « annoterLeDocument » : l'outil
        // d'abord, le souvenir ensuite — car prendre un outil SANS document en
        // main efface justement ce souvenir.
        selectedItems = [];
        setMode('freehand');
        docEnAnnotation = o.id;
        o.z = 5;
        document.getElementById('dv-devant').click();
        const enAnnotant = o.z > 5;
        docEnAnnotation = null; setMode('pointer');
        selectedItems = [{ type: 'image', id: o.id }];

        // Et l'opacité : on rend la page transparente pour écrire par-dessus.
        const c = document.getElementById('dv-opacite');
        c.value = '0.4';
        c.dispatchEvent(new Event('input', { bubbles: true }));
        const opacite = o.opacity;
        // Le curseur dit la sienne quand on rouvre le volet sur cette page.
        o.opacity = 0.7; majReglagesDuVolet();
        const relu = parseFloat(c.value);
        o.opacity = 1; c.value = '1';
        voletOuvert = false; majLeVolet();
        images.length = 0; selectedItems = []; majBarreDocument(); draw();
        return { devant, derriere, enAnnotant, opacite, relu };
    });
    r.verifie('« Mettre devant » et « Mettre derrière » agissent depuis le volet',
        voletAgit.devant && voletAgit.derriere, JSON.stringify(voletAgit));
    r.verifie('y compris pendant qu\'on annote la page, sélection vide',
        voletAgit.enAnnotant, JSON.stringify(voletAgit));
    r.egal('et l\'opacité de la page s\'y règle, et s\'y relit',
        { pose: voletAgit.opacite, relu: voletAgit.relu }, { pose: 0.4, relu: 0.7 });

    // =========================================================================
    // PRENDRE UN OUTIL RANGE LES CISEAUX
    // Le découpage accapare le geste sur le document : tant qu'il est armé, le
    // clic taille un morceau au lieu de dessiner. On prenait le crayon, on
    // croyait dessiner, et l'on découpait — rien ne disait qu'il fallait
    // d'abord ressortir par Échap.
    // =========================================================================
    const ciseaux = await page.evaluate(() => {
        images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        setMode('pointer');
        images.push({ id: nextId++, x: 200, y: 150, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        basculerLaDecoupe(true);
        const arme = decoupeActive;
        // Un morceau pris ne désarme PAS : on découpe rarement un seul exercice.
        prendreUnMorceau(images[0], { x: 220, y: 180, l: 150, h: 120 }, true);
        const apresUnMorceau = decoupeActive;
        // Mais prendre un outil, si.
        setMode('freehand');
        const apresLeCrayon = decoupeActive;
        // La retouche des zones accapare le même geste, et se range pareil.
        basculerEditionDesZones(true);
        const zonesArmees = zonesEdition;
        setMode('text');
        const zonesApres = zonesEdition;
        setMode('pointer');
        if (typeof viderLeTiroirDesMorceaux === 'function') viderLeTiroirDesMorceaux();
        images.length = 0; selectedItems = []; majBarreDocument(); draw();
        return { arme, apresUnMorceau, apresLeCrayon, zonesArmees, zonesApres };
    });
    r.verifie('les ciseaux restent armés d\'un morceau à l\'autre',
        ciseaux.arme === true && ciseaux.apresUnMorceau === true, JSON.stringify(ciseaux));
    r.verifie('mais prendre le crayon les range : on dessine, on ne découpe plus',
        ciseaux.apresLeCrayon === false, JSON.stringify(ciseaux));
    r.verifie('et la retouche des zones se range de la même façon',
        ciseaux.zonesArmees === true && ciseaux.zonesApres === false, JSON.stringify(ciseaux));

    // =========================================================================
    // ROGNER EST UN MODE QU'ON ALLUME, PAS UN ÉTAT CACHÉ
    // Un document arrivait EN ROGNAGE sans que rien ne le dise : ses poignées
    // ne redimensionnaient donc pas, et rien à l'écran ne l'expliquait. Il se
    // conduit maintenant comme tout le reste, et le bouton ✂ fait le mode.
    // =========================================================================
    const octetsPdf = Array.from(petitPdf());
    // LA VUE REMONTE, UNE FOIS LE DOCUMENT POSÉ. Au milieu de l'écran, son coin
    // bas-droit tombe DERRIÈRE LE TIROIR DU BAS, qui court sur toute la
    // largeur : le clic va au tiroir, et la poignée ne bouge pas. C'est un
    // piège de mesure, pas un défaut du tableau — mais il tenait à trois pixels
    // près, et le moindre bouton ajouté au tiroir le faisait basculer. On
    // remonte donc la vue APRÈS la pose, pour ne rien changer à l'endroit où le
    // document atterrit.
    const poserLeDoc = () => page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1200));
        setMode('pointer'); selectObject({ type: 'image', id: images[0].id }); majBarreDocument();
        panY = -160; draw();
        const d = images[0];
        return { x: d.x, y: d.y, w: d.w, h: d.h, cw: d.cw, ch: d.ch, rognage: d.isCropping === true };
    }, { octets: octetsPdf });
    const tailleDoc = () => page.evaluate(() => {
        const d = images[0];
        return {
            x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h),
            cx: Math.round(d.cx), cy: Math.round(d.cy), cw: Math.round(d.cw), ch: Math.round(d.ch)
        };
    });
    // ON DONNE LA POIGNÉE EN COORDONNÉES DU TABLEAU, et la souris s'y rend.
    // Elles se confondaient tant que la vue était à l'origine ; on la remonte
    // maintenant (voir « poserLeDoc »), et la conversion doit être faite.
    const tirerLaPoignee = async (lx, ly, ddx, ddy) => {
        const p = await page.evaluate(([x, y]) => ({ x: panX + x * zoom, y: panY + y * zoom }), [lx, ly]);
        await page.mouse.move(p.x, p.y); await page.mouse.down();
        await page.mouse.move(p.x + ddx, p.y + ddy, { steps: 10 }); await page.mouse.up();
        await page.waitForTimeout(150);
    };

    let doc = await poserLeDoc();
    r.verifie('un document posé se redimensionne, il n\'est pas en rognage', !doc.rognage);

    await tirerLaPoignee(doc.x + doc.w, doc.y + doc.h, 120, 40);
    const agrandi = await tailleDoc();
    r.verifie('le coin agrandit sans déformer',
        agrandi.w > doc.w + 50 && Math.abs(agrandi.w / agrandi.h - doc.w / doc.h) < 0.01,
        `${doc.w}x${doc.h} → ${agrandi.w}x${agrandi.h}`);
    r.egal('et il ne rogne rien au passage',
        { cw: agrandi.cw, ch: agrandi.ch }, { cw: doc.cw, ch: doc.ch });

    doc = await poserLeDoc();
    await tirerLaPoignee(doc.x + doc.w, doc.y + doc.h / 2, 200, 0);
    const deforme = await tailleDoc();
    r.verifie('le côté seul déforme : la largeur change, la hauteur non',
        deforme.w > doc.w + 100 && deforme.h === doc.h,
        `${doc.w}x${doc.h} → ${deforme.w}x${deforme.h}`);

    // --- Le bouton ✂, dans la barre, allume le mode ---
    doc = await poserLeDoc();
    const boutonRogner = await page.evaluate(() => {
        const e = document.getElementById('doc-rogner');
        const b = e.getBoundingClientRect();
        return { visible: b.width > 0 && b.height > 0, actif: e.classList.contains('actif') };
    });
    r.verifie('le ✂ est dans la barre, éteint', boutonRogner.visible && !boutonRogner.actif,
        JSON.stringify(boutonRogner));

    await page.click('#doc-rogner');
    await page.waitForTimeout(200);
    const allume = await page.evaluate(() => ({
        rognage: images[0].isCropping === true,
        ratioLocked: images[0].ratioLocked,
        boutonActif: document.getElementById('doc-rogner').classList.contains('actif')
    }));
    r.egal('cliquer le ✂ entre en rognage, et le bouton s\'allume',
        allume, { rognage: true, ratioLocked: false, boutonActif: true });

    await tirerLaPoignee(doc.x + doc.w, doc.y + doc.h, -150, -100);
    const rogne = await tailleDoc();
    r.verifie('en rognage, le coin referme le cadrage',
        rogne.cw < doc.cw - 50 && rogne.ch < doc.ch - 50,
        `cadrage ${doc.cw}x${doc.ch} → ${rogne.cw}x${rogne.ch}`);

    // Tiré très au-delà des bords, le cadrage s'arrête à la page entière
    await tirerLaPoignee(rogne.x + rogne.w, rogne.y + rogne.h, 500, 500);
    const borne = await tailleDoc();
    r.egal('tiré bien au-delà, il s\'arrête à la page entière',
        { cx: borne.cx, cy: borne.cy, cw: borne.cw, ch: borne.ch, w: borne.w, h: borne.h },
        { cx: 0, cy: 0, cw: doc.cw, ch: doc.ch, w: doc.w, h: doc.h });

    // Le bord gauche aussi : sans bornage côté par côté, il filait vers la gauche
    await tirerLaPoignee(borne.x, borne.y + borne.h / 2, -400, 0);
    const borneGauche = await tailleDoc();
    r.egal('le bord gauche s\'arrête lui aussi, sans déplacer le document',
        { x: borneGauche.x, w: borneGauche.w, cx: borneGauche.cx, cw: borneGauche.cw },
        { x: doc.x, w: doc.w, cx: 0, cw: doc.cw });

    // --- On le VOIT : la page entière en fantôme, des équerres orange ---
    await tirerLaPoignee(borneGauche.x + borneGauche.w, borneGauche.y + borneGauche.h, -200, -150);
    const vu = await page.evaluate(() => {
        const compter = () => {
            const c = document.getElementById('board');
            const g = c.getContext('2d');
            const d = g.getImageData(0, 0, c.width, c.height).data;
            let orange = 0;
            for (let i = 0; i < d.length; i += 4) {
                // l'orange du rognage : beaucoup de rouge, du vert moyen, peu de bleu
                if (d[i + 3] > 40 && d[i] > 200 && d[i + 1] > 80 && d[i + 1] < 190 && d[i + 2] < 90) orange++;
            }
            return orange;
        };
        draw();
        const enRognage = compter();
        basculerLeRognage(images[0], false);
        draw();
        const sorti = compter();
        basculerLeRognage(images[0], true);
        draw();
        return { enRognage, sorti };
    });
    r.verifie('le rognage se voit à l\'écran, et cesse de se voir quand on en sort',
        vu.enRognage > 300 && vu.sorti < vu.enRognage / 4,
        `${vu.enRognage} points orange en rognage, ${vu.sorti} hors rognage`);

    // --- Échap en sort, et rend les proportions ---
    await page.evaluate(() => document.getElementById('board').focus());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    r.egal('Échap termine le rognage et rend les proportions',
        await page.evaluate(() => ({ rognage: images[0].isCropping === true, ratioLocked: images[0].ratioLocked })),
        { rognage: false, ratioLocked: true });

    // Une image ordinaire, elle, n'a pas changé de comportement.
    const ordinaire = await page.evaluate(async () => {
        images.length = 0;
        const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#39c"/></svg>');
        const im = new Image(); im.src = src; imageCache[src] = im;
        await new Promise(res => { im.onload = res; im.onerror = res; });
        images.push({ id: nextId++, x: 200, y: 200, w: 200, h: 100, cx: 0, cy: 0, cw: 200, ch: 100, src, z: globalZ++ });
        setMode('pointer'); selectObject({ type: 'image', id: images[0].id }); draw();
        return { x: 200, y: 200, w: 200, h: 100 };
    });
    await tirerLaPoignee(ordinaire.x + ordinaire.w, ordinaire.y + ordinaire.h, 100, 50);
    const apresOrdinaire = await tailleDoc();
    r.egal('une image ordinaire garde son redimensionnement proportionnel',
        { w: apresOrdinaire.w, h: apresOrdinaire.h }, { w: 300, h: 150 });

    // =========================================================================
    // LES RÉGLAGES DE LA PAGE RESTENT ATTEIGNABLES SANS PAGINATION
    // Le bouton du volet était rangé DANS le groupe des pages. Un scan, ou un
    // PDF rouvert d'un tableau enregistré, n'en a pas : le bouton partait avec
    // elles, et rogner, proportions et quadrillage devenaient introuvables.
    // =========================================================================
    const visibles = () => page.evaluate(() => {
        const visible = el => { if (!el) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        return {
            voletBtn: visible(document.getElementById('doc-volet-btn')),
            pagination: visible(document.getElementById('doc-prec'))
        };
    });
    const ouvrirLeVolet = async () => {
        // Un bouton absent doit se lire dans la ligne qui le concerne, pas
        // faire attendre trente secondes puis emporter toute la suite.
        if (!(await visibles()).voletBtn) return { volet: false, reglages: [], recherche: false, liste: false };
        await page.click('#doc-volet-btn');
        await page.waitForTimeout(350);
        return page.evaluate(() => {
            const visible = el => { if (!el) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
            return {
                volet: visible(document.getElementById('doc-volet')),
                reglages: Array.from(document.querySelectorAll('.dv-reglage')).filter(visible).map(b => b.id),
                recherche: visible(document.getElementById('dv-chercher')),
                liste: visible(document.getElementById('dv-liste'))
            };
        });
    };
    const fermerLeVolet = () => page.evaluate(() => { voletOuvert = false; majLeVolet(); });

    await poserLeDoc();
    let etatBarre = await visibles();
    let ouvert = await ouvrirLeVolet();
    r.verifie('un PDF feuilletable montre sa pagination ET le bouton du volet',
        etatBarre.voletBtn && etatBarre.pagination, JSON.stringify(etatBarre));
    // SIX RÉGLAGES, et non plus trois : la pile et l'opacité sont arrivées de
    // la barre de style, qui s'efface désormais quand on tient un document —
    // il en paraissait trois empilées par-dessus la page.
    r.egal('son volet porte ses réglages, avec la recherche et les vignettes',
        { r: ouvert.reglages, ch: ouvert.recherche, li: ouvert.liste },
        { r: ['dv-rogner', 'dv-proportions', 'dv-grille', 'dv-devant', 'dv-derriere', 'dv-opacite-boite'],
          ch: true, li: true });
    await fermerLeVolet();

    // Un PDF rouvert d'un tableau enregistré : la pagination n'existe plus.
    await page.evaluate(() => { documentsPdf.clear(); majBarreDocument(); });
    etatBarre = await visibles();
    ouvert = await ouvrirLeVolet();
    r.verifie('sans pagination, le bouton du volet reste',
        etatBarre.voletBtn && !etatBarre.pagination, JSON.stringify(etatBarre));
    r.egal('et ses réglages sont là, la liste des pages en moins',
        { r: ouvert.reglages, ch: ouvert.recherche, li: ouvert.liste },
        { r: ['dv-rogner', 'dv-proportions', 'dv-grille', 'dv-devant', 'dv-derriere', 'dv-opacite-boite'],
          ch: false, li: false });
    await fermerLeVolet();

    // Un scan importé : ni pages ni recherche, mais les mêmes réglages.
    await page.evaluate(async () => {
        images.length = 0;
        const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#eee"/></svg>');
        const im = new Image(); im.src = src; imageCache[src] = im;
        await new Promise(res => { im.onload = res; im.onerror = res; });
        images.push({ id: nextId++, x: 100, y: 100, w: 300, h: 400, cx: 0, cy: 0, cw: 300, ch: 400, src, z: globalZ++, isCropping: true, ratioLocked: false });
        setMode('pointer'); selectObject({ type: 'image', id: images[0].id }); majBarreDocument(); draw();
    });
    etatBarre = await visibles();
    ouvert = await ouvrirLeVolet();
    r.verifie('un scan importé donne accès au volet, lui aussi', etatBarre.voletBtn, JSON.stringify(etatBarre));
    r.egal('avec les mêmes réglages', ouvert.reglages,
        ['dv-rogner', 'dv-proportions', 'dv-grille', 'dv-devant', 'dv-derriere', 'dv-opacite-boite']);

    if (ouvert.reglages.includes('dv-proportions')) {
        await page.click('#dv-proportions');
        await page.waitForTimeout(150);
    }
    r.egal('et le réglage agit vraiment sur le document tenu',
        await page.evaluate(() => images[0].ratioLocked), true);

    await page.evaluate(() => { images.length = 0; selectedItems = []; majBarreDocument(); draw(); });
    await page.waitForTimeout(200);
    r.verifie('rien de tenu : le bouton du volet s\'en va',
        !(await visibles()).voletBtn);

    // =====================================================================
    // PRENDRE UN MORCEAU
    // Deux exercices côte à côte, pris dans le même poly : il fallait
    // dupliquer le document, rogner chaque copie, aligner à l'œil. On trace un
    // rectangle, le morceau se pose à côté.
    // =====================================================================
    const morceaux = await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'poly.pdf', { type: 'application/pdf' }));
        await new Promise(r => setTimeout(r, 900));
        const doc = images[0];
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        const boutonAvant = getComputedStyle(document.getElementById('doc-decouper')).display;
        const tiroirAvant = document.getElementById('bande-morceaux').hidden;

        basculerLaDecoupe(true);
        const allume = document.getElementById('doc-decouper').classList.contains('actif');

        const tracer = (part) => {
            const r = { x: doc.x + doc.w * part.x, y: doc.y + doc.h * part.y,
                        l: doc.w * part.l, h: doc.h * part.h };
            decoupeGeste = { obj: doc, debut: { x: r.x, y: r.y }, rect: r };
            return finirGesteDeDecoupe();
        };
        const m1 = tracer({ x: 0.08, y: 0.10, l: 0.80, h: 0.22 });
        const m2 = tracer({ x: 0.08, y: 0.45, l: 0.80, h: 0.20 });

        // Un simple clic ne fabrique rien
        decoupeGeste = { obj: doc, debut: { x: doc.x + 10, y: doc.y + 10 },
                         rect: { x: doc.x + 10, y: doc.y + 10, l: 1, h: 1 } };
        const rien = finirGesteDeDecoupe();

        // Ni un frôlement sur un tableau très dézoomé : soixante unités de plan
        // n'y font que neuf pixels sous le doigt, ce n'est pas un rectangle.
        const zoomAvant = zoom;
        zoom = 0.15;
        decoupeGeste = { obj: doc, debut: { x: doc.x + 10, y: doc.y + 10 },
                         rect: { x: doc.x + 10, y: doc.y + 10, l: 60, h: 60 } };
        const frolement = finirGesteDeDecoupe();
        zoom = zoomAvant;

        basculerLaDecoupe(false);
        return {
            boutonAvant, allume, tiroirAvant,
            eteint: !document.getElementById('doc-decouper').classList.contains('actif'),
            // LE TABLEAU N'A PAS BOUGÉ : les morceaux sont au tiroir.
            surLeTableau: images.length,
            auTiroir: morceauxEnAttente.length,
            tiroirVisible: !document.getElementById('bande-morceaux').hidden,
            compte: document.getElementById('bm-compte').textContent,
            vignettes: document.querySelectorAll('#bm-rail .bm-vignette').length,
            rien: !!rien, frolement: !!frolement,
            memeSource: !!(m1 && m2 && m1.src === doc.src),
            cadrages: !!(m1 && m2 && Math.round(m1.cy) !== Math.round(m2.cy)),
            partiel: !!(m1 && m1.cw < doc.cw && m1.ch < doc.ch),
            provenance: m1 && { nom: m1.nom, page: m1.page },
            docIntact: { w: Math.round(doc.w), cw: Math.round(doc.cw) }
        };
    }, { octets: pdf });
    r.verifie('le bouton Découper paraît sur un document tenu',
        morceaux.boutonAvant !== 'none', String(morceaux.boutonAvant));
    r.egal('il s\'allume et s\'éteint', { allume: morceaux.allume, eteint: morceaux.eteint },
        { allume: true, eteint: true });
    r.egal('le tiroir ne paraît que lorsqu\'il a quelque chose dedans',
        { avant: morceaux.tiroirAvant, apres: morceaux.tiroirVisible }, { avant: true, apres: true });
    r.egal('deux rectangles tracés vont au tiroir, pas sur le tableau',
        { tableau: morceaux.surLeTableau, tiroir: morceaux.auTiroir }, { tableau: 1, tiroir: 2 });
    r.egal('et le tiroir les montre et les compte',
        { compte: morceaux.compte, vignettes: morceaux.vignettes }, { compte: '2', vignettes: 2 });
    r.egal('un simple clic ne fabrique rien', morceaux.rien, false);
    r.egal('ni un frôlement sur un tableau dézoomé', morceaux.frolement, false);
    r.verifie('un morceau montre la même page, cadrée autrement',
        morceaux.memeSource && morceaux.cadrages && morceaux.partiel, JSON.stringify(morceaux));
    r.egal('le morceau sait de quel fichier et de quelle page il vient',
        morceaux.provenance, { nom: 'poly.pdf', page: 1 });
    r.verifie('le document source n\'a pas bougé',
        morceaux.docIntact.w > 0 && morceaux.docIntact.cw > 0, JSON.stringify(morceaux.docIntact));

    // SORTIR DU TIROIR : on lâche le morceau là où on le veut.
    const sortieDuTiroir = await page.evaluate(async () => {
        const avant = { tableau: images.length, tiroir: morceauxEnAttente.length };
        const m = morceauxEnAttente[0];
        if (!m) return { vide: true, avant, apres: avant, centre: null, memeCadrage: false, estUnMorceau: false };
        const pose = poserLeMorceau(m, { x: 500, y: 400 });
        return {
            avant,
            apres: { tableau: images.length, tiroir: morceauxEnAttente.length },
            centre: { x: Math.round(pose.x + pose.w / 2), y: Math.round(pose.y + pose.h / 2) },
            memeCadrage: pose.cx === m.cx && pose.cw === m.cw,
            estUnMorceau: pose.pluginData.id === 'morceau'
        };
    });
    r.egal('sortir un morceau le retire du tiroir et le pose sur le tableau',
        { tableau: sortieDuTiroir.apres.tableau, tiroir: sortieDuTiroir.apres.tiroir },
        { tableau: sortieDuTiroir.avant.tableau + 1, tiroir: sortieDuTiroir.avant.tiroir - 1 });
    r.egal('il se pose là où on le lâche', sortieDuTiroir.centre, { x: 500, y: 400 });
    r.verifie('avec le cadrage qu\'on lui a découpé',
        sortieDuTiroir.memeCadrage && sortieDuTiroir.estUnMorceau, JSON.stringify(sortieDuTiroir));

    // « TOUT POSER » : les exercices étalés, aussi grands que la place le
    // permet — c'est tout l'intérêt, un exercice au quart de sa page ne se lit
    // pas depuis le fond de la classe.
    const rangee = await page.evaluate(async () => {
        const doc = images.find(o => o.pluginData && o.pluginData.id === 'pdfDoc');
        // On repart d'un tiroir vide : ce qui restait du bloc précédent
        // fausserait le compte.
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        basculerLaDecoupe(true);
        [0.05, 0.35, 0.65].forEach(p => {
            const r = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * p, l: doc.w * 0.25, h: doc.h * 0.2 };
            decoupeGeste = { obj: doc, debut: { x: r.x, y: r.y }, rect: r };
            finirGesteDeDecoupe();
        });
        basculerLaDecoupe(false);
        const tailleDOrigine = morceauxEnAttente.map(m => m.w);
        const avant = images.length;
        const combien = poserTousLesMorceaux();
        const poses = images.filter(o => o.pluginData && o.pluginData.id === 'morceau').slice(-3);
        if (poses.length < 3) return { manque: true };

        // Le cadre visible, en coordonnées du tableau.
        const cadre = { x1: (0 - panX) / zoom, y1: (0 - panY) / zoom,
                        x2: (window.innerWidth - panX) / zoom, y2: (window.innerHeight - panY) / zoom };
        let croise = false;
        for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) {
            const a = poses[i], b = poses[j];
            if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) croise = true;
        }
        const dedans = poses.every(o => o.x >= cadre.x1 - 1 && o.y >= cadre.y1 - 1
            && o.x + o.w <= cadre.x2 + 1 && o.y + o.h <= cadre.y2 + 1);
        const boite = {
            x1: Math.min(...poses.map(o => o.x)), y1: Math.min(...poses.map(o => o.y)),
            x2: Math.max(...poses.map(o => o.x + o.w)), y2: Math.max(...poses.map(o => o.y + o.h))
        };
        return {
            combien, ajoutes: images.length - avant,
            tiroirVide: morceauxEnAttente.length === 0,
            cache: document.getElementById('bande-morceaux').hidden,
            croise, dedans,
            // Ils ont bien grandi, et tous du même facteur : deux exercices
            // d'une même page gardent leur taille l'un par rapport à l'autre.
            agrandis: poses.every((o, i) => o.w > tailleDOrigine[i] * 1.05),
            memeFacteur: (() => {
                const f = poses.map((o, i) => o.w / tailleDOrigine[i]);
                return Math.max(...f) - Math.min(...f) < 0.01;
            })(),
            // « Le plus de place possible » : une des deux dimensions est prise
            // presque entièrement, sinon on pouvait encore agrandir.
            remplit: Math.max((boite.x2 - boite.x1) / (cadre.x2 - cadre.x1),
                              (boite.y2 - boite.y1) / (cadre.y2 - cadre.y1)),
            // …sauf quand le plafond d'agrandissement s'y oppose : un exercice
            // ne dépasse pas TROIS FOIS sa taille imprimée. Depuis qu'un
            // document mesure sa vraie taille — une A4 fait 29,7 cm sur le
            // tableau —, ce plafond veut enfin dire quelque chose : avant, il
            // se comptait à partir d'une page rétrécie pour tenir dans
            // l'écran, et dépendait donc de la taille de la fenêtre.
            auPlafond: Math.max(...poses.map((o, i) => o.w / tailleDOrigine[i])) >= MORCEAU_AGRANDI_MAX - 0.001
        };
    });
    r.egal('« tout poser » vide le tiroir sur le tableau',
        { combien: rangee.combien, ajoutes: rangee.ajoutes, vide: rangee.tiroirVide, cache: rangee.cache },
        { combien: 3, ajoutes: 3, vide: true, cache: true });
    r.verifie('aucun morceau n\'en recouvre un autre, et tous tiennent dans l\'écran',
        rangee.croise === false && rangee.dedans === true, JSON.stringify(rangee));
    r.verifie('ils sont agrandis, tous du même facteur',
        rangee.agrandis && rangee.memeFacteur, JSON.stringify(rangee));
    r.verifie('et la place est prise, sauf à buter sur les trois fois la taille imprimée',
        rangee.remplit > 0.9 || rangee.auPlafond, JSON.stringify(rangee));

    // ILS NE TOMBENT PAS SUR LE DOCUMENT. C'est le défaut qu'on m'a signalé :
    // « Tout poser » remplissait l'ÉCRAN, c'est-à-dire la place exacte du
    // document qu'on venait de découper. Les morceaux se posaient dessus, et
    // le geste avait l'air d'avoir échoué.
    const aCote = await page.evaluate(async () => {
        const doc = images.find(o => o.pluginData && o.pluginData.id === 'pdfDoc');
        // On repart d'un tableau qui ne contient QUE le document.
        images.length = 0; images.push(doc);
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        basculerLaDecoupe(true);
        [0.1, 0.4, 0.7].forEach(p => {
            const r = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * p, l: doc.w * 0.3, h: doc.h * 0.2 };
            decoupeGeste = { obj: doc, debut: { x: r.x, y: r.y }, rect: r };
            finirGesteDeDecoupe();
        });
        basculerLaDecoupe(false);
        poserTousLesMorceaux();
        const poses = images.filter(o => o.pluginData && o.pluginData.id === 'morceau');
        if (poses.length < 3) return { manque: true };
        const chevauche = poses.some(o => o.x < doc.x + doc.w && doc.x < o.x + o.w
            && o.y < doc.y + doc.h && doc.y < o.y + o.h);
        // ET ON LES VOIT : la vue est allée les chercher.
        const cadre = { x1: (0 - panX) / zoom, y1: (0 - panY) / zoom,
                        x2: (window.innerWidth - panX) / zoom, y2: (window.innerHeight - panY) / zoom };
        const visibles = poses.every(o => o.x >= cadre.x1 - 1 && o.y >= cadre.y1 - 1
            && o.x + o.w <= cadre.x2 + 1 && o.y + o.h <= cadre.y2 + 1);
        return {
            chevauche, visibles,
            aDroite: poses.every(o => o.x >= doc.x + doc.w),
            // Le document n'a pas bougé d'un pouce.
            docIntact: doc.x === 0 || true,
            // Et le lot est tenu : on peut le déplacer d'un geste.
            tenus: selectedItems.length === 3
                && selectedItems.every(it => poses.some(o => o.id === it.id))
        };
    });
    r.verifie('les morceaux ne se posent PAS sur le document qu\'on vient de découper',
        aCote.chevauche === false && aCote.aDroite === true, JSON.stringify(aCote));
    r.verifie('et la vue va les chercher : on les voit tous',
        aCote.visibles, JSON.stringify(aCote));
    r.verifie('ils sont posés ET tenus, pour les redéplacer d\'un geste',
        aCote.tenus, JSON.stringify(aCote));

    // La disposition n'est pas décidée d'avance : trois exercices LARGES ET
    // COURTS — le cas ordinaire d'un polycopié — s'empilent, ils ne se rangent
    // pas en ligne. C'est ce qui les rend le plus gros.
    const empiles = await page.evaluate(async () => {
        const doc = images.find(o => o.pluginData && o.pluginData.id === 'pdfDoc');
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        basculerLaDecoupe(true);
        [0.05, 0.35, 0.65].forEach(p => {
            const r = { x: doc.x, y: doc.y + doc.h * p, l: doc.w, h: doc.h * 0.12 };
            decoupeGeste = { obj: doc, debut: { x: r.x, y: r.y }, rect: r };
            finirGesteDeDecoupe();
        });
        basculerLaDecoupe(false);
        poserTousLesMorceaux();
        const poses = images.filter(o => o.pluginData && o.pluginData.id === 'morceau').slice(-3);
        if (poses.length < 3) return { lignes: 0 };
        return { lignes: [...new Set(poses.map(o => Math.round(o.y)))].length,
                 colonnes: [...new Set(poses.map(o => Math.round(o.x)))].length };
    });
    r.egal('trois exercices larges et courts s\'empilent, un par ligne',
        { lignes: empiles.lignes, colonnes: empiles.colonnes }, { lignes: 3, colonnes: 1 });

    // Mais on n'agrandit pas sans fin : un timbre-poste étiré à tout l'écran
    // n'est plus lisible, il est gros.
    const timbre = await page.evaluate(async () => {
        const doc = images.find(o => o.pluginData && o.pluginData.id === 'pdfDoc');
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        basculerLaDecoupe(true);
        const r = { x: doc.x + doc.w * 0.4, y: doc.y + doc.h * 0.4, l: doc.w * 0.05, h: doc.h * 0.03 };
        decoupeGeste = { obj: doc, debut: { x: r.x, y: r.y }, rect: r };
        const m = finirGesteDeDecoupe();
        basculerLaDecoupe(false);
        if (!m) return { rate: true };
        const large = m.w;
        poserTousLesMorceaux();
        const pose = images.filter(o => o.pluginData && o.pluginData.id === 'morceau').slice(-1)[0];
        return { facteur: pose.w / large };
    });
    r.verifie('un tout petit morceau n\'est pas agrandi au-delà du net',
        timbre.facteur > 1 && timbre.facteur <= 3.001, JSON.stringify(timbre));

    // =====================================================================
    // ⌁ REPÉRER LES EXERCICES
    // Ce qui sépare deux exercices se voit : une bande de page restée blanche.
    // On la cherche, et tous les blocs partent au tiroir d'un coup.
    // =====================================================================
    const repere = await page.evaluate(async () => {
        // Une page fabriquée : trois pavés d'encre séparés par du blanc franc,
        // et à l'intérieur de chacun des lignes serrées — l'espace entre deux
        // lignes ne doit PAS passer pour une séparation.
        const c = document.createElement('canvas');
        c.width = 800; c.height = 1100;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 1100);
        g.fillStyle = '#111';
        const pave = (haut) => {
            for (let i = 0; i < 6; i++) g.fillRect(80, haut + i * 22, 620, 9);
        };
        pave(90); pave(430); pave(780);
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = url; });
        imageCache[url] = img;

        panX = 0; panY = 0; zoom = 1;
        images.length = 0; morceauxEnAttente = []; majLeTiroirDesMorceaux();
        const doc = { id: nextId++, x: 100, y: 60, w: 400, h: 550,
                      cx: 0, cy: 0, cw: 800, ch: 1100, src: url,
                      fileName: 'exos.png', z: globalZ++, ratioLocked: true };
        images.push(doc);
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();

        const boutonVisible = getComputedStyle(document.getElementById('doc-reperer')).display !== 'none';
        const pris = repererLesExercices();
        const blocs = morceauxEnAttente.slice().sort((a, b) => a.cy - b.cy);
        return {
            boutonVisible, pris,
            auTiroir: morceauxEnAttente.length,
            surLeTableau: images.length,
            tiroirVisible: !document.getElementById('bande-morceaux').hidden,
            // Chaque bloc tient dans sa bande de page, et n'empiète pas sur
            // la suivante.
            separes: blocs.length === 3 && blocs.every((b, i) =>
                i === 0 || b.cy > blocs[i - 1].cy + blocs[i - 1].ch),
            // Et resserré : les marges blanches de la page ne voyagent pas
            // avec l'exercice.
            resserres: blocs.every(b => b.cx > 40 && b.cx + b.cw < 760),
            hauteurs: blocs.map(b => Math.round(b.ch))
        };
    });
    r.verifie('le bouton Repérer paraît sur un document tenu', repere.boutonVisible, JSON.stringify(repere));
    r.egal('trois pavés séparés par du blanc donnent trois morceaux, au tiroir',
        { pris: repere.pris, tiroir: repere.auTiroir, tableau: repere.surLeTableau, visible: repere.tiroirVisible },
        { pris: 3, tiroir: 3, tableau: 1, visible: true });
    r.verifie('chacun tient dans sa bande, sans mordre sur la suivante',
        repere.separes, JSON.stringify(repere));
    r.verifie('et il est resserré sur l\'encre, marges de la page comprises',
        repere.resserres, JSON.stringify(repere));

    // Une page d'un seul tenant n'a rien à repérer : on le dit plutôt que de
    // ranger la page entière au tiroir.
    const unSeul = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 800; c.height = 400;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 400);
        g.fillStyle = '#111';
        for (let i = 0; i < 10; i++) g.fillRect(60, 40 + i * 30, 660, 12);
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = url; });
        imageCache[url] = img;
        images.length = 0; morceauxEnAttente = []; majLeTiroirDesMorceaux();
        const doc = { id: nextId++, x: 0, y: 0, w: 400, h: 200, cx: 0, cy: 0, cw: 800, ch: 400,
                      src: url, fileName: 'bloc.png', z: globalZ++ };
        images.push(doc);
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        const pris = repererLesExercices();
        return { pris, tiroir: morceauxEnAttente.length };
    });
    r.egal('un texte d\'un seul tenant ne part pas au tiroir',
        { pris: unSeul.pris, tiroir: unSeul.tiroir }, { pris: 0, tiroir: 0 });

    // UN POLYCOPIÉ EN COLONNES. Lu seulement en travers, il donnerait des
    // bandes contenant la moitié de deux exercices. La gouttière du milieu se
    // voit aussi bien que les blancs horizontaux : on coupe dedans.
    const colonnes = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 800; c.height = 600;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 600);
        g.fillStyle = '#111';
        // Deux colonnes séparées par une gouttière franche, deux blocs chacune.
        [[60, 340], [460, 740]].forEach(([x1, x2]) => {
            [60, 380].forEach(haut => {
                for (let i = 0; i < 5; i++) g.fillRect(x1, haut + i * 26, x2 - x1, 10);
            });
        });
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = url; });
        imageCache[url] = img;
        images.length = 0; morceauxEnAttente = []; majLeTiroirDesMorceaux();
        const doc = { id: nextId++, x: 0, y: 0, w: 800, h: 600, cx: 0, cy: 0, cw: 800, ch: 600,
                      src: url, fileName: 'colonnes.png', z: globalZ++ };
        images.push(doc);
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        const pris = repererLesExercices();
        const b = morceauxEnAttente.slice();
        return {
            pris,
            // Aucun morceau ne traverse la gouttière : ils sont d'un côté ou
            // de l'autre, jamais à cheval.
            aucunACheval: b.every(m => m.cx + m.cw <= 400 || m.cx >= 400),
            gauche: b.filter(m => m.cx < 400).length,
            droite: b.filter(m => m.cx >= 400).length
        };
    });
    r.egal('un polycopié en deux colonnes donne quatre morceaux, deux par colonne',
        { pris: colonnes.pris, gauche: colonnes.gauche, droite: colonnes.droite },
        { pris: 4, gauche: 2, droite: 2 });
    r.verifie('et aucun ne se met à cheval sur la gouttière',
        colonnes.aucunACheval, JSON.stringify(colonnes));

    // JETER UN MORCEAU : le repérage en range parfois un de trop.
    const jete = await page.evaluate(async () => {
        const doc = images[0];
        morceauxEnAttente = [];
        [0.1, 0.4, 0.7].forEach(p => {
            prendreUnMorceau(doc, { x: doc.x, y: doc.y + doc.h * p, l: doc.w * 0.8, h: doc.h * 0.2 }, true);
        });
        majLeTiroirDesMorceaux();
        const avant = morceauxEnAttente.length;
        const croix = document.querySelectorAll('#bm-rail .bm-jeter').length;
        const vise = morceauxEnAttente[1].id;
        document.querySelector(`#bm-rail .bm-jeter[data-id="${vise}"]`).click();
        return {
            avant, croix, apres: morceauxEnAttente.length,
            restants: morceauxEnAttente.map(m => m.id),
            jete: vise,
            vignettes: document.querySelectorAll('#bm-rail .bm-vignette').length,
            compte: document.getElementById('bm-compte').textContent
        };
    });
    r.egal('chaque vignette porte sa croix', { croix: jete.croix, avant: jete.avant }, { croix: 3, avant: 3 });
    r.verifie('la croix ne jette que celui-là',
        jete.apres === 2 && !jete.restants.includes(jete.jete)
        && jete.vignettes === 2 && jete.compte === '2', JSON.stringify(jete));

    // =====================================================================
    // UN MORCEAU EST UN DOCUMENT, ET « PAGE ENTIÈRE » FAIT L'ALLER-RETOUR
    // Rangé parmi les tampons de plugins, un morceau perdait toute la barre du
    // document. Et « page entière » ouvrait son cadre sur la page sans retour :
    // on voulait jeter un œil au reste, on y restait.
    // =====================================================================
    const allerRetour = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 600; c.height = 800;
        const g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 600, 800);
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = url; });
        imageCache[url] = img;
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; morceauxEnAttente = []; majLeTiroirDesMorceaux();
        const doc = { id: nextId++, x: 0, y: 0, w: 300, h: 400, cx: 0, cy: 0, cw: 600, ch: 800,
                      src: url, fileName: 'p.png', z: globalZ++,
                      pluginData: { id: 'pdfDoc', cle: 'zz', page: 1, pages: 3 } };
        images.push(doc);
        documentsPdf.set('zz', { pages: 3 });
        selectedItems = [{ type: 'image', id: doc.id }];
        basculerLaDecoupe(true);
        const rr = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * 0.1, l: doc.w * 0.4, h: doc.h * 0.2 };
        decoupeGeste = { obj: doc, debut: { x: rr.x, y: rr.y }, rect: rr };
        finirGesteDeDecoupe();
        poserTousLesMorceaux();
        const m = images.find(o => o.pluginData && o.pluginData.id === 'morceau');
        selectedItems = [{ type: 'image', id: m.id }];
        majBarreDocument();

        const vu = (id) => {
            const el = document.getElementById(id);
            return !!el && getComputedStyle(el).display !== 'none';
        };
        const enMain = {
            reconnu: estUnDocumentPose(m),
            plein: vu('doc-plein-ecran'),
            modes: vu('doc-modes'),
            // Le bouton de la barre est masqué sur un document allégé : c'est
            // le VOLET qui porte ce réglage, et c'est de là qu'on l'ouvre.
            entiere: vu('dv-entiere')
        };
        const decoupe = { cx: m.cx, cy: m.cy, cw: m.cw, ch: m.ch, w: m.w, h: m.h };

        // ALLER : la page entière.
        document.getElementById('dv-entiere').click();
        const ouvert = {
            cw: m.cw, ch: m.ch,
            entierePage: Math.abs(m.cw - 600) < 1 && Math.abs(m.ch - 800) < 1,
            boutonLa: vu('dv-entiere'),
            revient: document.getElementById('dv-entiere').classList.contains('actif'),
            dit: (document.getElementById('dv-entiere').querySelector('span') || {}).textContent
        };
        // RETOUR : le morceau, tel qu'il était.
        document.getElementById('dv-entiere').click();
        const revenu = {
            memeCadrage: Math.abs(m.cx - decoupe.cx) < 0.5 && Math.abs(m.cy - decoupe.cy) < 0.5
                && Math.abs(m.cw - decoupe.cw) < 0.5 && Math.abs(m.ch - decoupe.ch) < 0.5,
            memeTaille: Math.abs(m.w - decoupe.w) < 0.5 && Math.abs(m.h - decoupe.h) < 0.5,
            revient: document.getElementById('dv-entiere').classList.contains('actif')
        };

        // ET PRÉSENTER UN MORCEAU NE LE DÉFAIT PAS : son cadrage EST le
        // découpage.
        presenterLeDocument();
        const presente = { cw: m.cw, ch: m.ch,
                           intact: Math.abs(m.cw - decoupe.cw) < 0.5 && Math.abs(m.ch - decoupe.ch) < 0.5 };
        quitterLaPresentation();
        return { enMain, decoupe, ouvert, revenu, presente };
    });
    r.egal('un morceau est reconnu comme un document, et garde toute sa barre',
        { reconnu: allerRetour.enMain.reconnu, plein: allerRetour.enMain.plein,
          entiere: allerRetour.enMain.entiere },
        { reconnu: true, plein: true, entiere: true });
    r.verifie('« page entière » ouvre bien le cadre sur toute la page',
        allerRetour.ouvert.entierePage, JSON.stringify(allerRetour.ouvert));
    r.verifie('et le bouton reste là, en disant qu\'il ramène au morceau',
        allerRetour.ouvert.boutonLa && allerRetour.ouvert.revient
        && /morceau/.test(allerRetour.ouvert.dit || ''), JSON.stringify(allerRetour.ouvert));
    r.verifie('le retour rend le morceau tel qu\'il était, cadrage ET taille',
        allerRetour.revenu.memeCadrage && allerRetour.revenu.memeTaille
        && !allerRetour.revenu.revient, JSON.stringify(allerRetour.revenu));
    r.verifie('et présenter un morceau ne l\'ouvre pas en pleine page',
        allerRetour.presente.intact, JSON.stringify(allerRetour.presente));

    // =====================================================================
    // LA BARRE DU DOCUMENT, DEBOUT
    // Un tableau est en 16/9, une page en 1/1,41 : les colonnes latérales sont
    // perdues d'avance, la hauteur est ce qui manque. Elle n'était pas
    // montrable tant que sept boutons y écrivaient leur nom ; les libellés
    // partis dans les infobulles, elle tient en quatre-vingts pixels.
    // =====================================================================
    const debout = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 600; c.height = 800;
        const g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 600, 800);
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = url; });
        imageCache[url] = img;
        images.length = 0;
        const doc = { id: nextId++, x: 0, y: 0, w: 300, h: 400, cx: 0, cy: 0, cw: 600, ch: 800,
                      src: url, fileName: 'p.png', z: globalZ++,
                      pluginData: { id: 'pdfDoc', cle: 'zz', page: 2, pages: 9 } };
        images.push(doc);
        documentsPdf.set('zz', { pages: 9 });
        selectedItems = [{ type: 'image', id: doc.id }];

        const mesure = () => {
            updateStyleBarContext();
            const b = document.getElementById('bar-document');
            const rb = b.getBoundingClientRect();
            const pagination = document.getElementById('doc-pages').getBoundingClientRect();
            // Les boutons de la barre, la pagination mise à part : elle est une
            // ligne à elle seule.
            const dansLaPagination = new Set(
                Array.from(document.querySelectorAll('#doc-pages *')));
            const boutons = Array.from(b.querySelectorAll('.doc-btn'))
                .filter(e => !dansLaPagination.has(e) && e.getClientRects().length > 0)
                .map(e => { const q = e.getBoundingClientRect();
                            return { c: Math.round(q.left + q.width / 2),
                                     l: Math.round(q.left), r: Math.round(q.right),
                                     t: Math.round(q.top), b: Math.round(q.bottom) }; });
            return {
                w: Math.round(rb.width), h: Math.round(rb.height),
                gauche: Math.round(rb.left), droite: Math.round(rb.right),
                milieu: Math.round(rb.top + rb.height / 2),
                sens: getComputedStyle(b).flexDirection,
                nBoutons: boutons.length,
                // TOUS SUR LA MÊME COLONNE : c'est ce qui manquait. Chaque
                // contexte est un « groupe » qui est lui-même une rangée, et
                // les boutons restaient alignés à l'intérieur.
                colonnes: [...new Set(boutons.map(e => e.c))].length,
                deborde: boutons.some(e => e.l < rb.left - 1 || e.r > rb.right + 1
                                           || e.t < rb.top - 1 || e.b > rb.bottom + 1),
                paginationEnLigne: getComputedStyle(document.getElementById('doc-pages')).flexDirection,
                paginationDedans: pagination.right <= rb.right + 1 && pagination.left >= rb.left - 1,
                defile: b.scrollHeight > b.clientHeight + 1
            };
        };
        basculerLOrientationDeLaBarre(false);
        const plat = mesure();
        basculerLOrientationDeLaBarre(true);
        const dressee = mesure();
        const retenu = localStorage.getItem('auTableau_barre_debout');
        // LE PIÈGE : la liste des classes est réécrite à chaque sélection.
        selectedItems = []; updateStyleBarContext();
        selectedItems = [{ type: 'image', id: doc.id }]; updateStyleBarContext();
        const survit = document.getElementById('bar-document').classList.contains('vertical');
        basculerLOrientationDeLaBarre(false);
        const recouchee = mesure();
        return { plat, dressee, retenu, survit, recouchee,
                 ecran: { L: window.innerWidth, H: window.innerHeight } };
    });
    r.egal('à plat, la barre est une ligne', debout.plat.sens, 'row');
    r.egal('debout, elle devient une colonne', debout.dressee.sens, 'column');
    r.verifie('et TOUS ses boutons tiennent sur une seule colonne',
        debout.dressee.nBoutons > 5 && debout.dressee.colonnes === 1,
        JSON.stringify(debout.dressee));
    r.verifie('rien ne déborde d\'elle, et rien n\'exige de défiler',
        !debout.dressee.deborde && !debout.dressee.defile, JSON.stringify(debout.dressee));
    r.verifie('elle est étroite, rangée au bord DROIT et centrée en hauteur',
        debout.dressee.w < 140 && (debout.ecran.L - debout.dressee.droite) < 40
        && debout.dressee.gauche > debout.ecran.L / 2
        && Math.abs(debout.dressee.milieu - debout.ecran.H / 2) < 3,
        JSON.stringify({ d: debout.dressee, e: debout.ecran }));
    r.egal('mais « ◀ 2 /9 ▶ » reste une ligne, et tient dans la colonne',
        { sens: debout.dressee.paginationEnLigne, dedans: debout.dressee.paginationDedans },
        { sens: 'row', dedans: true });
    r.egal('le choix est retenu, et un changement de sélection ne la recouche pas',
        { retenu: debout.retenu, survit: debout.survit }, { retenu: 'true', survit: true });
    r.egal('la bascule inverse la remet à plat', debout.recouchee.sens, 'row');

    // LE BOUTON DIT OÙ LA BARRE IRA VRAIMENT. À plat elle se pose EN HAUT
    // d'ordinaire — le bas est la zone où l'on écrit — mais EN BAS dès qu'un
    // document occupe l'écran, car la page se lit de haut en bas. Le bouton
    // promettait « en haut » dans les deux cas, et l'on cherchait ensuite la
    // barre là où elle n'était pas.
    const promesse = await page.evaluate(() => {
        const b = document.getElementById('bar-style-orienter');
        const lire = () => b.title;
        const ouEst = () => {
            const r = document.getElementById('bar-document').getBoundingClientRect();
            return (r.top + r.bottom) / 2 < window.innerHeight / 2 ? 'en haut' : 'en bas';
        };
        basculerLOrientationDeLaBarre(true);       // debout : c'est là que le
                                                   // bouton promet le retour
        document.body.classList.remove('focus-mode');
        updateStyleBarContext();
        const surLeTableau = lire();
        basculerLOrientationDeLaBarre(false);
        const vraimentSurLeTableau = ouEst();

        basculerLOrientationDeLaBarre(true);
        document.body.classList.add('focus-mode');
        updateStyleBarContext();
        const enPleinEcran = lire();
        basculerLOrientationDeLaBarre(false);
        const vraimentEnPleinEcran = ouEst();

        document.body.classList.remove('focus-mode');
        updateStyleBarContext();
        return { surLeTableau, vraimentSurLeTableau, enPleinEcran, vraimentEnPleinEcran };
    });
    // LA RÉGLETTE DE TAILLE N'EST PLUS JAMAIS EN TRAVERS D'UNE COLONNE. Elle
    // vit dans la barre de STYLE, et celle-ci ne se met plus debout : le
    // problème ne se contourne pas, il n'existe plus. C'est la barre du
    // document qui pivote, et elle ne porte aucune réglette.
    const reglette = await page.evaluate(() => {
        basculerLOrientationDeLaBarre(true);
        selectedItems = [];
        setMode('text');
        updateStyleBarContext();
        const etat = {
            styleDebout: document.getElementById('bar-style').classList.contains('vertical'),
            regletteDansLeStyle: !!document.querySelector('#bar-style #font-size'),
            regletteDansLeDoc: !!document.querySelector('#bar-document input[type="range"]'),
            // Et elle reste dans sa barre, sans déborder.
            deborde: (() => {
                const b = document.getElementById('bar-style').getBoundingClientRect();
                const n = document.getElementById('font-size-num').getBoundingClientRect();
                return Math.round(n.right - b.right) > 0 || Math.round(b.left - n.left) > 0;
            })()
        };
        basculerLOrientationDeLaBarre(false);
        setMode('pointer');
        return etat;
    });
    r.egal('la réglette de taille vit dans la barre de style, qui ne se met jamais debout',
        reglette,
        { styleDebout: false, regletteDansLeStyle: true, regletteDansLeDoc: false, deborde: false });

    // SEULE LA BARRE DU DOCUMENT SE MET DEBOUT. Celle de style, qui change de
    // contenu à chaque sélection, resterait introuvable si elle pivotait —
    // et c'est elle qui recevait, par-dessus les pages et le découpage, tous
    // les réglages de l'outil qu'on venait de prendre.
    const seuleLaSienne = await page.evaluate(() => {
        basculerLOrientationDeLaBarre(true);
        selectedItems = [{ type: 'image', id: images[0].id }];
        setMode('freehand');
        updateStyleBarContext();
        const etat = {
            docDebout: document.getElementById('bar-document').classList.contains('vertical'),
            styleDebout: document.getElementById('bar-style').classList.contains('vertical'),
            outilsDansLeDoc: document.querySelectorAll(
                '#bar-document .group-line, #bar-document .group-text, #bar-document #btn-color-popover').length,
            documentDansLeStyle: document.querySelectorAll('#bar-style .group-document').length
        };
        basculerLOrientationDeLaBarre(false);
        setMode('pointer');
        return etat;
    });
    r.egal('seule la barre du document se met debout, et les deux ne se mélangent pas',
        seuleLaSienne,
        { docDebout: true, styleDebout: false, outilsDansLeDoc: 0, documentDansLeStyle: 0 });

    // ET ELLES NE SE POSENT PAS L'UNE SUR L'AUTRE. Séparées, elles visent la
    // même place — au milieu, en haut. Celle du document la garde, c'est elle
    // qu'on tient ; l'autre se range juste en dessous.
    const cote = await page.evaluate(() => {
        const doc = document.getElementById('bar-document');
        const style = document.getElementById('bar-style');
        const mesure = () => {
            const d = doc.getBoundingClientRect(), s = style.getBoundingClientRect();
            return {
                deuxVisibles: doc.classList.contains('visible') && style.classList.contains('visible'),
                chevauche: !(d.bottom <= s.top || s.bottom <= d.top
                             || d.right <= s.left || s.right <= d.left),
                styleSousLeDoc: Math.round(s.top - d.bottom)
            };
        };
        basculerLOrientationDeLaBarre(false);
        selectedItems = [{ type: 'image', id: images[0].id }];
        setMode('freehand');
        updateStyleBarContext();
        const aPlat = mesure();
        // En plein écran, le document prend le bas : l'autre se range dessus.
        document.body.classList.add('focus-mode');
        updateStyleBarContext();
        const d2 = doc.getBoundingClientRect(), s2 = style.getBoundingClientRect();
        const enFocus = {
            chevauche: !(d2.bottom <= s2.top || s2.bottom <= d2.top
                         || d2.right <= s2.left || s2.right <= d2.left),
            // Et elle est AU-DESSUS, dans l'écran : posée en dessous elle
            // sortirait par le bas, ce qui ne chevauche rien mais ne se voit
            // pas non plus.
            auDessus: Math.round(d2.top - s2.bottom),
            dansLEcran: s2.top >= 0 && s2.bottom <= window.innerHeight + 1
        };
        document.body.classList.remove('focus-mode');
        setMode('pointer');
        updateStyleBarContext();
        return { aPlat, enFocus };
    });
    r.egal('les deux barres à plat ne se recouvrent pas : l\'une se range sous l\'autre',
        { deux: cote.aPlat.deuxVisibles, chevauche: cote.aPlat.chevauche,
          dessous: cote.aPlat.styleSousLeDoc >= 0 && cote.aPlat.styleSousLeDoc <= 20 },
        { deux: true, chevauche: false, dessous: true });
    r.egal('et pas davantage en plein écran, où le document prend le bas',
        { chevauche: cote.enFocus.chevauche, dansLEcran: cote.enFocus.dansLEcran,
          auDessus: cote.enFocus.auDessus >= 0 && cote.enFocus.auDessus <= 20 },
        { chevauche: false, dansLEcran: true, auDessus: true });

    r.egal('le bouton promet le bord où la barre se posera VRAIMENT',
        { promis: [promesse.surLeTableau, promesse.enPleinEcran],
          tenu: [promesse.vraimentSurLeTableau, promesse.vraimentEnPleinEcran] },
        { promis: ['Coucher la barre, en haut', 'Coucher la barre, en bas'],
          tenu: ['en haut', 'en bas'] });

    // =====================================================================
    // ON NE POSE PAS À CÔTÉ D'UNE PAGE QU'ON PROJETTE
    // En présentation, le pourtour est peint sombre PAR-DESSUS tout le reste,
    // et la vue est bornée à la page : un morceau posé à côté tombait dans le
    // noir, hors d'atteinte.
    // =====================================================================
    const enPlein = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 600; c.height = 800;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 800);
        g.fillStyle = '#111';
        for (let i = 0; i < 20; i++) g.fillRect(50, 30 + i * 36, 500, 12);
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = url; });
        imageCache[url] = img;
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; morceauxEnAttente = []; majLeTiroirDesMorceaux();
        const doc = { id: nextId++, x: 0, y: 0, w: 300, h: 400, cx: 0, cy: 0, cw: 600, ch: 800,
                      src: url, fileName: 'poly.png', z: globalZ++,
                      pluginData: { id: 'pdfDoc', cle: 'zz', page: 1, pages: 1 } };
        images.push(doc);
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();

        basculerLaDecoupe(true);
        const rr = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * 0.1, l: doc.w * 0.4, h: doc.h * 0.2 };
        decoupeGeste = { obj: doc, debut: { x: rr.x, y: rr.y }, rect: rr };
        finirGesteDeDecoupe();
        basculerLaDecoupe(false);

        presenterLeDocument();
        const enPresentation = !!presentationEnCours;
        poserTousLesMorceaux();
        const apres = !!presentationEnCours;
        const m = images.find(o => o.pluginData && o.pluginData.id === 'morceau');
        const cadre = { x1: (0 - panX) / zoom, y1: (0 - panY) / zoom,
                        x2: (window.innerWidth - panX) / zoom, y2: (window.innerHeight - panY) / zoom };
        return {
            enPresentation, apres,
            // Posé à côté du document, et VU : la vue a pu aller le chercher.
            aCote: !!m && m.x >= doc.x + doc.w,
            visible: !!m && m.x >= cadre.x1 - 1 && m.x + m.w <= cadre.x2 + 1
                     && m.y >= cadre.y1 - 1 && m.y + m.h <= cadre.y2 + 1
        };
    });
    r.egal('la présentation était bien en cours', enPlein.enPresentation, true);
    r.egal('poser à côté en sort : sinon les morceaux tombent dans le noir',
        enPlein.apres, false);
    r.verifie('et ils sont posés à côté, sous les yeux',
        enPlein.aCote && enPlein.visible, JSON.stringify(enPlein));

    // Mais un morceau lâché SUR la page projetée s'y voit très bien : on ne
    // coupe pas la présentation pour cela.
    const surLaPage = await page.evaluate(() => {
        const doc = images.find(o => o.pluginData && o.pluginData.id === 'pdfDoc');
        images.length = 0; images.push(doc);
        morceauxEnAttente = [];
        basculerLaDecoupe(true);
        const rr = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * 0.1, l: doc.w * 0.3, h: doc.h * 0.1 };
        decoupeGeste = { obj: doc, debut: { x: rr.x, y: rr.y }, rect: rr };
        const m = finirGesteDeDecoupe();
        basculerLaDecoupe(false);
        presenterLeDocument();
        const avant = !!presentationEnCours;
        // Lâché au milieu de la page.
        poserLeMorceau(m, { x: doc.x + doc.w / 2, y: doc.y + doc.h / 2 });
        return { avant, apres: !!presentationEnCours };
    });
    r.egal('un morceau lâché sur la page projetée ne coupe pas la présentation',
        { avant: surLaPage.avant, apres: surLaPage.apres }, { avant: true, apres: true });

    // LE BOUTON DIT OÙ ÇA VA. « Poser à côté » ment sur une page vierge.
    const libelle = await page.evaluate(() => {
        quitterLaPresentation();
        const b = document.getElementById('bm-ranger');
        images.length = 0; texts.length = 0; freehands.length = 0;
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        const surPageVierge = b.textContent.trim();
        images.push({ id: nextId++, x: 0, y: 0, w: 100, h: 100, src: 'x', z: globalZ++ });
        majLeTiroirDesMorceaux();
        const surPageOccupee = b.textContent.trim();
        // Et il suit un changement de page, sans qu'on touche au tiroir.
        const combienDePages = pages.length;
        pages.push(createNewPage());
        loadPage(pages.length - 1);
        const apresPageNeuve = b.textContent.trim();
        // On rend les pages telles qu'on les a trouvées : ce qui suit compte
        // les siennes.
        loadPage(0);
        pages.length = combienDePages;
        updatePageUI();
        return { surPageVierge, surPageOccupee, apresPageNeuve, pagesRendues: pages.length === combienDePages };
    });
    r.egal('sur une page vierge, le bouton dit simplement « Poser »',
        libelle.surPageVierge, '⇥ Poser');
    r.egal('là où il y a déjà quelque chose, il dit « Poser à côté »',
        libelle.surPageOccupee, '⇥ Poser à côté');
    r.egal('et il suit le changement de page tout seul',
        { libelle: libelle.apresPageNeuve, rendues: libelle.pagesRendues },
        { libelle: '⇥ Poser', rendues: true });

    // =====================================================================
    // CE QU'ON A JETÉ NE REVIENT PAS
    // « ⌁ Repérer » relit la page et retrouve évidemment les mêmes blocs : on
    // jetait le bandeau d'en-tête, on relançait le repérage, il était là de
    // nouveau. Et les ciseaux restaient armés après la pose, si bien que le
    // clic suivant retaillait au lieu de choisir.
    // =====================================================================
    const jete2 = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 800; c.height = 1100;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 1100);
        g.fillStyle = '#111';
        const pave = (haut) => { for (let i = 0; i < 6; i++) g.fillRect(80, haut + i * 22, 620, 9); };
        pave(90); pave(430); pave(780);
        const url = c.toDataURL('image/png');
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = url; });
        imageCache[url] = img;
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; morceauxEnAttente = []; majLeTiroirDesMorceaux();
        const doc = { id: nextId++, x: 100, y: 60, w: 400, h: 550, cx: 0, cy: 0, cw: 800, ch: 1100,
                      src: url, fileName: 'exos.png', z: globalZ++ };
        images.push(doc);
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();

        const premier = repererLesExercices();
        // On en jette un, puis on relance le repérage sur la MÊME page.
        const vise = morceauxEnAttente[1].id;
        jeterLeMorceau(vise);
        const apresJet = morceauxEnAttente.length;
        const second = repererLesExercices();
        const apresSecond = morceauxEnAttente.length;

        // Et vider le tiroir vaut jet, lui aussi.
        viderLeTiroirDesMorceaux();
        const troisieme = repererLesExercices();
        return { premier, apresJet, second, apresSecond, troisieme,
                 tiroir: morceauxEnAttente.length };
    });
    r.egal('le repérage trouve les trois blocs', jete2.premier, 3);
    r.egal('on en jette un : il en reste deux', jete2.apresJet, 2);
    r.egal('relancer le repérage ne ramène pas celui qu\'on a jeté',
        { nouveaux: jete2.second, tiroir: jete2.apresSecond }, { nouveaux: 0, tiroir: 2 });
    r.egal('et vider le tiroir vaut jet : plus rien ne revient',
        { nouveaux: jete2.troisieme, tiroir: jete2.tiroir }, { nouveaux: 0, tiroir: 0 });

    // POSER TERMINE LE DÉCOUPAGE, et le curseur dit quand les ciseaux sont armés.
    const finDeDecoupe = await page.evaluate(() => {
        const doc = images.find(o => o.pluginData === undefined || o.pluginData.id !== 'morceau');
        const canevas = document.getElementById('board');
        morceauxEnAttente = [];
        basculerLaDecoupe(true);
        updateCursor();
        const arme = { actif: decoupeActive, croix: canevas.classList.contains('cursor-crosshair'),
                       main: canevas.classList.contains('cursor-grab') };
        const rr = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * 0.1, l: doc.w * 0.4, h: doc.h * 0.15 };
        decoupeGeste = { obj: doc, debut: { x: rr.x, y: rr.y }, rect: rr };
        finirGesteDeDecoupe();
        const avantPose = decoupeActive;
        poserTousLesMorceaux();
        updateCursor();
        const apres = { actif: decoupeActive, croix: canevas.classList.contains('cursor-crosshair') };
        // ET ON PEUT ENFIN LE PRENDRE : le clic ne retaille plus.
        const m = images.find(o => o.pluginData && o.pluginData.id === 'morceau');
        selectedItems = [];
        setMode('pointer');
        const pos = { x: m.x + m.w / 2, y: m.y + m.h / 2 };
        canevas.dispatchEvent(new PointerEvent('pointerdown', {
            pointerId: 21, pointerType: 'mouse', isPrimary: true, buttons: 1,
            clientX: pos.x * zoom + panX, clientY: pos.y * zoom + panY,
            bubbles: true, cancelable: true }));
        canevas.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 21, pointerType: 'mouse', isPrimary: true,
            clientX: pos.x * zoom + panX, clientY: pos.y * zoom + panY,
            bubbles: true, cancelable: true }));
        return { arme, avantPose, apres,
                 choisi: selectedItems.length === 1 && selectedItems[0].id === m.id,
                 morceaux: images.filter(o => o.pluginData && o.pluginData.id === 'morceau').length };
    });
    r.egal('ciseaux armés, le curseur est une croix — pas une main',
        { croix: finDeDecoupe.arme.croix, main: finDeDecoupe.arme.main }, { croix: true, main: false });
    r.egal('ils restent armés tant qu\'on découpe', finDeDecoupe.avantPose, true);
    r.egal('poser les repose, et le curseur cesse d\'annoncer un tracé',
        { actif: finDeDecoupe.apres.actif, croix: finDeDecoupe.apres.croix },
        { actif: false, croix: false });
    r.verifie('et le morceau posé se laisse enfin prendre, sans être retaillé',
        finDeDecoupe.choisi && finDeDecoupe.morceaux === 1, JSON.stringify(finDeDecoupe));

    // LE RETOUR EN ARRIÈRE EST GRATUIT : un morceau n'est qu'un cadrage sur la
    // page entière, donc le rognage le retaille — et peut lui rendre ce qu'on
    // lui a coupé de trop.
    const retaille = await page.evaluate(async () => {
        poserTousLesMorceaux();
        const morceau = images.find(o => o.pluginData && o.pluginData.id === 'morceau');
        if (!morceau) return { enRognage: false, plusGrand: false, aucun: true };
        selectedItems = [{ type: 'image', id: morceau.id }];
        majBarreDocument();
        const avant = { ch: morceau.ch, cy: morceau.cy };
        basculerLeRognage(morceau, true);
        const enRognage = !!morceau.isCropping;
        // On rend au morceau cent pixels de page vers le bas
        morceau.ch = Math.min(morceau.ch + 100, 100000);
        basculerLeRognage(morceau, false);
        return { enRognage, avant, apres: { ch: morceau.ch }, plusGrand: morceau.ch > avant.ch };
    });
    r.verifie('un morceau se remet en rognage', retaille.enRognage, JSON.stringify(retaille));
    r.verifie('et peut reprendre du terrain sur la page', retaille.plusGrand, JSON.stringify(retaille));

    // =====================================================================
    // AGRANDI, IL RÉCLAME UNE PAGE PLUS FINE
    // Un morceau posé trois fois plus grand montrait trois fois les mêmes
    // pixels : on projetait du flou. Il porte maintenant la clé de son
    // document et sait redemander SA page, rendue à la finesse qu'il faut.
    // =====================================================================
    const finesse = await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; selectedItems = [];
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'poly.pdf', { type: 'application/pdf' }));
        await new Promise(r => setTimeout(r, 900));
        const doc = images[0];
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();

        basculerLaDecoupe(true);
        const rect = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * 0.1, l: doc.w * 0.3, h: doc.h * 0.2 };
        decoupeGeste = { obj: doc, debut: { x: rect.x, y: rect.y }, rect };
        const m = finirGesteDeDecoupe();
        basculerLaDecoupe(false);
        if (!m) return { rate: true };
        const cleAuTiroir = !!m.cle;

        // ON REGARDE DE PRÈS. Posé au zoom 1, un morceau agrandi trois fois
        // tombe pile sur ce que la qualité de base fournit — il ne manque
        // rien, il n'y a rien à observer, et la mesure dépendrait alors du
        // réglage de qualité qu'un bloc précédent a pu changer. Au zoom 3, il
        // manque des pixels quelle que soit la finesse de départ.
        zoom = 3;
        poserTousLesMorceaux();
        const morceau = images.find(o => o.pluginData && o.pluginData.id === 'morceau');
        if (!morceau) return { rate: true };
        const avant = {
            cw: morceau.cw, memeSrc: morceau.src === doc.src,
            // Combien de pixels d'écran pour un pixel de la page : au-dessus
            // de 1, on étire.
            finesse: (morceau.w * zoom) / morceau.cw
        };
        // PERSONNE NE LE DEMANDE À LA MAIN. L'affinage part tout seul de la
        // pose, après le délai qui laisse le geste se poser.
        await new Promise(r => setTimeout(r, 1400));
        const apres = {
            cw: morceau.cw, memeSrc: morceau.src === doc.src,
            finesse: (morceau.w * zoom) / morceau.cw
        };
        return { cleAuTiroir, cle: !!morceau.pluginData.cle, avant, apres,
                 agrandi: morceau.w / m.w };
    }, { octets: pdf });
    r.verifie('la clé du document voyage avec le morceau, du tiroir au tableau',
        finesse.cleAuTiroir && finesse.cle, JSON.stringify(finesse));
    r.verifie('posé agrandi, il réclame plus de pixels qu\'il n\'en a',
        finesse.agrandi > 1.5 && finesse.avant.finesse > 1.15, JSON.stringify(finesse));
    r.verifie('la page est redemandée plus fine TOUTE SEULE, et il en a assez',
        finesse.apres.cw > finesse.avant.cw * 1.1
        && finesse.apres.finesse < finesse.avant.finesse, JSON.stringify(finesse));
    // Six morceaux d'un poly ne pèsent pas six pages : c'est tout l'intérêt du
    // partage, et affiner ne doit pas le rompre.
    r.verifie('et le document le suit sur la MÊME image : on n\'en garde pas deux',
        finesse.avant.memeSrc && finesse.apres.memeSrc, JSON.stringify(finesse));

    // ET L'INVERSE, QUI EST LE VRAI PIÈGE : le document reste montré petit à
    // côté du morceau agrandi. Ils partagent la même page rendue — affiner
    // pour le document, qui n'a besoin de rien, ramenait la page à sa taille
    // modeste et rendait flou le morceau d'à côté.
    const partageDeLaPage = await page.evaluate(async () => {
        const doc = images.find(o => o.pluginData && o.pluginData.id === 'pdfDoc');
        const morceau = images.find(o => o.pluginData && o.pluginData.id === 'morceau');
        if (!doc || !morceau) return { rate: true };
        const besoin = { doc: (doc.w * zoom) / doc.cw, morceau: (morceau.w * zoom) / morceau.cw };
        const avant = { cw: morceau.cw, src: morceau.src };
        const change = await affinerLaPage(doc);
        const img = imageCache[doc.src];
        const dansLImage = !!img && doc.cx + doc.cw <= (img.naturalWidth || 0) + 1
            && doc.cy + doc.ch <= (img.naturalHeight || 0) + 1;
        return { besoin, avant: { cw: avant.cw }, apres: { cw: morceau.cw },
                 memeSrc: morceau.src === doc.src, change, dansLImage,
                 cadre: { cw: Math.round(doc.cw), ch: Math.round(doc.ch),
                          NW: img && img.naturalWidth, NH: img && img.naturalHeight } };
    });
    r.verifie('le document montré petit est bien le moins exigeant des deux',
        partageDeLaPage.besoin.doc < partageDeLaPage.besoin.morceau, JSON.stringify(partageDeLaPage));
    r.verifie('et affiner pour lui ne rend pas flou le morceau agrandi d\'à côté',
        partageDeLaPage.apres.cw >= partageDeLaPage.avant.cw - 0.5 && partageDeLaPage.memeSrc,
        JSON.stringify(partageDeLaPage));
    // L'affinage redimensionne l'image ET le cadrage : s'ils se désaccordent,
    // le document montre une région qui n'existe plus, et tout ce qu'on y
    // découpe ensuite tombe dans le vide.
    r.verifie('et le cadrage du document reste dans son image',
        partageDeLaPage.dansLImage, JSON.stringify(partageDeLaPage.cadre));

    // =====================================================================
    // CHANGER DE PAGE DEPUIS LE TIROIR
    // Découper sur la page 1, coller sur la page 2 : c'est le geste de qui
    // refait une fiche d'exercices.
    // =====================================================================
    const pagesDuTiroir = await page.evaluate(() => {
        // On repose la vue : les deux blocs précédents regardaient la page de
        // très près pour mesurer sa finesse, et un zoom laissé en l'air
        // changerait la taille des morceaux qu'on découpe ici.
        zoom = 1;
        const doc = images.find(o => o.pluginData && o.pluginData.id === 'pdfDoc');
        images.length = 0; images.push(doc);
        morceauxEnAttente = []; majLeTiroirDesMorceaux();
        basculerLaDecoupe(true);
        [0.15, 0.5].forEach(p => {
            const r = { x: doc.x + doc.w * 0.1, y: doc.y + doc.h * p, l: doc.w * 0.3, h: doc.h * 0.18 };
            decoupeGeste = { obj: doc, debut: { x: r.x, y: r.y }, rect: r };
            finirGesteDeDecoupe();
        });
        basculerLaDecoupe(false);
        const pagesAvant = pages.length;
        const surLaUne = images.length;
        const libelleAvant = document.getElementById('bm-page').textContent;

        document.getElementById('bm-page-plus').click();
        const neuve = {
            pages: pages.length - pagesAvant,
            derniere: currentPageIndex === pages.length - 1,
            vide: images.length === 0,
            // LE TIROIR TRAVERSE : il n'appartient à aucune page.
            tiroir: morceauxEnAttente.length,
            visible: !document.getElementById('bande-morceaux').hidden,
            libelle: document.getElementById('bm-page').textContent
        };

        poserTousLesMorceaux();
        const posee = { ici: images.filter(o => o.pluginData && o.pluginData.id === 'morceau').length,
                        tiroir: morceauxEnAttente.length };

        document.getElementById('bm-page-prec').click();
        const revenu = { index: currentPageIndex,
                         morceaux: images.filter(o => o.pluginData && o.pluginData.id === 'morceau').length,
                         doc: images.filter(o => o.pluginData && o.pluginData.id === 'pdfDoc').length,
                         libelle: document.getElementById('bm-page').textContent };
        // ET PAR L'AUTRE BOUT : la pagination du tiroir du bas change la page
        // elle aussi, celle du tiroir à morceaux ne doit pas mentir.
        document.getElementById('btn-next-page').click();
        const parLAutreBout = { index: currentPageIndex,
                                libelle: document.getElementById('bm-page').textContent,
                                bas: document.getElementById('page-indicator').innerText };
        return { pagesAvant, surLaUne, libelleAvant, neuve, posee, revenu, parLAutreBout };
    });
    r.egal('＋ ouvre une page vierge et s\'y rend',
        { pages: pagesDuTiroir.neuve.pages, derniere: pagesDuTiroir.neuve.derniere,
          vide: pagesDuTiroir.neuve.vide },
        { pages: 1, derniere: true, vide: true });
    r.egal('le tiroir traverse le changement de page, vignettes comprises',
        { tiroir: pagesDuTiroir.neuve.tiroir, visible: pagesDuTiroir.neuve.visible },
        { tiroir: 2, visible: true });
    r.verifie('et sa pagination suit celle du tableau',
        pagesDuTiroir.neuve.libelle !== pagesDuTiroir.libelleAvant
        && pagesDuTiroir.neuve.libelle.startsWith(String(pagesDuTiroir.pagesAvant + 1)),
        JSON.stringify(pagesDuTiroir));
    r.egal('« Poser à côté » les pose sur la page où l\'on est',
        { ici: pagesDuTiroir.posee.ici, tiroir: pagesDuTiroir.posee.tiroir }, { ici: 2, tiroir: 0 });
    r.egal('et la page d\'avant est restée ce qu\'elle était : le document, sans les morceaux',
        { morceaux: pagesDuTiroir.revenu.morceaux, doc: pagesDuTiroir.revenu.doc },
        { morceaux: 0, doc: 1 });
    r.egal('changer de page par la pagination du bas met à jour celle du tiroir',
        { tiroir: pagesDuTiroir.parLAutreBout.libelle, bas: pagesDuTiroir.parLAutreBout.bas },
        { tiroir: '2/2', bas: '2/2' });

    await page.evaluate(() => {
        basculerLaDecoupe(false);
        images.length = 0; selectedItems = []; majBarreDocument(); draw();
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
