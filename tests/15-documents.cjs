// Ouvrir un cours déjà écrit : .txt, .md, .docx (Word) et .odt (LibreOffice).
// Les deux derniers sont des archives ZIP de XML : on en fabrique de vraies
// ici, l'une compressée, l'autre non, pour éprouver les deux chemins.
const zlib = require('zlib');
const { creerRapport, ouvrirApp } = require('./harness.cjs');

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

// Un PDF de trois pages, écrit à la main : aucune dépendance à installer.
function petitPdf() {
    const pages = ['Page une', 'Page deux', 'Page trois'];
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    pages.forEach((t, i) => {
        objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`);
        const flux = `BT /F1 24 Tf 40 150 Td (${t}) Tj ET`;
        objs.push(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
    });
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(p => { out += String(p).padStart(10, '0') + ' 00000 n \n'; });
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

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
        const b = document.getElementById('barre-document');
        return {
            visible: b.classList.contains('visible'),
            info: document.getElementById('doc-info').innerText,
            menuRange: document.getElementById('quick-edit-menu').classList.contains('visible'),
            sousLeCadre: parseFloat(b.style.top) > panY + images[0].y * zoom
        };
    });
    r.verifie('la barre du document apparaît sous le cadre', barre.visible && barre.sousLeCadre, JSON.stringify(barre));
    r.egal('elle affiche la page courante sur le total', barre.info, '2/3');
    r.verifie('et le menu rapide ordinaire s\'efface', !barre.menuRange, JSON.stringify(barre));

    const fleches = await page.evaluate(async () => {
        document.getElementById('doc-suiv').click();
        await new Promise(r => setTimeout(r, 500));
        const apres = document.getElementById('doc-info').innerText;
        document.getElementById('doc-prec').click();
        await new Promise(r => setTimeout(r, 500));
        return { apres, retour: document.getElementById('doc-info').innerText };
    });
    r.egal('▶ de la barre tourne la page', fleches.apres, '3/3');
    r.egal('◀ de la barre revient', fleches.retour, '2/3');

    const modes = await page.evaluate(() => {
        const cadre = document.getElementById('doc-mode-cadre');
        const pageB = document.getElementById('doc-mode-page');
        const depart = cadre.classList.contains('actif') && !pageB.classList.contains('actif');
        pageB.click();
        const bascule = pageB.classList.contains('actif') && !cadre.classList.contains('actif') && modeDocument === 'page';
        return { depart, bascule };
    });
    r.verifie('le mode « Cadre » est celui de départ, et il se voit', modes.depart, JSON.stringify(modes));
    r.verifie('le mode « Page » s\'allume et éteint l\'autre', modes.bascule, JSON.stringify(modes));

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
        const opa = document.getElementById('doc-opacite');
        opa.value = '0.4';
        opa.dispatchEvent(new Event('input', { bubbles: true }));
        const apresOpacite = images[0].opacity;

        document.getElementById('doc-grille').click();
        const sous = { actif: images[0].sousLaGrille, allume: document.getElementById('doc-grille').classList.contains('actif') };
        document.getElementById('doc-grille').click();

        document.getElementById('doc-verrou').click();
        const verrou = { actif: images[0].locked, allume: document.getElementById('doc-verrou').classList.contains('actif') };
        document.getElementById('doc-verrou').click();
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
        const cle = images[0].pluginData.cle;
        document.getElementById('doc-fermer').click();
        return {
            images: images.length,
            oublie: !documentsPdf.has(cle),
            barre: document.getElementById('barre-document').classList.contains('visible')
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
            barre: document.getElementById('barre-document').classList.contains('visible'),
            fleches: document.getElementById('doc-pages').style.display,
            proportions: !!document.getElementById('doc-proportions'),
            rogner: !!document.getElementById('doc-rogner'),
            dupliquer: !!document.getElementById('doc-dupliquer'),
            fermer: document.getElementById('doc-fermer').title
        };
    });
    r.verifie('une image ordinaire se règle avec la même barre', surImageOrdinaire.barre, JSON.stringify(surImageOrdinaire));
    r.egal('mais sans les flèches de page', surImageOrdinaire.fleches, 'none');
    r.verifie('proportions, rognage et duplication y sont repris du menu rapide',
        surImageOrdinaire.proportions && surImageOrdinaire.rogner && surImageOrdinaire.dupliquer,
        JSON.stringify(surImageOrdinaire));
    r.egal('et ✕ dit qu\'il retire l\'image', surImageOrdinaire.fermer, "Retirer l'image");

    const repris = await page.evaluate(() => {
        const o = images[images.length - 1];
        document.getElementById('doc-proportions').click();
        const sansRatio = o.ratioLocked === false && !document.getElementById('doc-proportions').classList.contains('actif');
        document.getElementById('doc-proportions').click();
        document.getElementById('doc-rogner').click();
        const rogne = { actif: !!o.isCropping, libre: o.ratioLocked === false };
        document.getElementById('doc-rogner').click();
        const avant = images.length;
        document.getElementById('doc-dupliquer').click();
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
    r.verifie('un PDF posé s\'ajuste d\'abord en rognant',
        !!parDefaut.pdf && parDefaut.pdf.rogne, JSON.stringify(parDefaut));
    r.verifie('une image importée aussi',
        !!parDefaut.image && parDefaut.image.rogne, JSON.stringify(parDefaut));
    r.verifie('et les proportions sont libérées, sinon rogner ne servirait à rien',
        parDefaut.pdf.ratio === false && parDefaut.image.ratio === false, JSON.stringify(parDefaut));

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
        const bouton = document.getElementById('doc-entiere');
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
            seRetire: getComputedStyle(document.getElementById('doc-entiere')).display === 'none'
        };
    });
    r.verifie('« page entière » est proposé quand le document est rogné', retourEntier.propose, JSON.stringify(retourEntier));
    r.verifie('il remet toute la page dans le cadre', retourEntier.entier, JSON.stringify(retourEntier));
    r.verifie('en gardant la place prise sur le tableau', retourEntier.cadreGarde, JSON.stringify(retourEntier));
    r.verifie('et sans déformer la page', retourEntier.proportion, JSON.stringify(retourEntier));
    r.verifie('une fois entière, le bouton s\'efface', retourEntier.seRetire, JSON.stringify(retourEntier));

    // Une page d'un autre format ne reprend pas le découpage de la précédente
    const autreFormat = await page.evaluate(async () => {
        const o = images[0];
        const nat = imageCache[o.src];
        o.cy = nat.naturalHeight * 0.3; o.ch = nat.naturalHeight * 0.7;
        o.pluginData.pageRognee = true;
        // on fait croire à la page suivante qu'elle est à l'italienne
        const vrai = window.dessinerPagePdf;
        window.dessinerPagePdf = async (doc, n) => {
            const r = await vrai(doc, n);
            return { src: r.src, l: r.h, h: r.l };      // format inversé
        };
        await feuilleterPdf(o, 1);
        await new Promise(r => setTimeout(r, 600));
        window.dessinerPagePdf = vrai;
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

    // --- LA BARRE DU DOCUMENT SE REPLIE ET SE DÉPLACE ---
    // Un PDF qui remplit l'écran passe SOUS la barre : le bas de la page
    // devenait illisible. On la range, ou on la met ailleurs.
    const barreDoc = await page.evaluate(() => {
        localStorage.removeItem('auTableau_barre_document');
        barreDocPosee = null; barreDocRepliee = false;
        ['points', 'segments', 'circles', 'rectangles', 'texts', 'freehands',
         'curves', 'polygons', 'images', 'arcs'].forEach(c => { if (window[c]) window[c].length = 0; });
        panX = 0; panY = 0; zoom = 1;
        const c = document.getElementById('board');
        // Un document qui occupe tout l'écran : le cas qui pose problème
        images.push({ id: nextId++, x: 0, y: 0, w: c.clientWidth, h: c.clientHeight,
            cx: 0, cy: 0, cw: 800, ch: 1100, src: '', z: globalZ++,
            pluginData: { id: 'pdfDoc', cle: 'z', page: 1, pages: 3 } });
        // setMode vide la sélection : on choisit APRÈS, sinon la barre n'a
        // aucun document à accompagner.
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        const barre = document.getElementById('barre-document');
        const r = barre.getBoundingClientRect();
        const doc = images[0];
        return {
            visible: barre.classList.contains('visible'),
            // Elle mord bien sur le bas du document : c'est le problème
            recouvreLeBas: r.bottom > (doc.y + doc.h) * zoom + panY - 60,
            aUnePrise: !!document.getElementById('doc-prise'),
            aUnBoutonReplier: !!document.getElementById('doc-replier')
        };
    });
    r.verifie('la barre s\'affiche sous le document', barreDoc.visible);
    r.verifie('et elle mord sur le bas de la page quand le document remplit l\'écran',
        barreDoc.recouvreLeBas, JSON.stringify(barreDoc));
    r.verifie('elle porte une poignée', barreDoc.aUnePrise);
    r.verifie('et un bouton pour la replier', barreDoc.aUnBoutonReplier);

    const repli = await page.evaluate(() => {
        document.getElementById('doc-replier').click();
        const barre = document.getElementById('barre-document');
        const pastille = document.getElementById('doc-pastille');
        const apresRepli = { barre: barre.classList.contains('visible'),
                             pastille: pastille.classList.contains('visible'),
                             memoire: JSON.parse(localStorage.getItem('auTableau_barre_document') || '{}') };
        pastille.click();
        return { apresRepli, rouverte: barre.classList.contains('visible'),
                 pastilleRangee: !pastille.classList.contains('visible') };
    });
    r.verifie('repliée, il ne reste qu\'une pastille',
        !repli.apresRepli.barre && repli.apresRepli.pastille, JSON.stringify(repli.apresRepli));
    r.verifie('le repli est retenu d\'une séance à l\'autre', repli.apresRepli.memoire.repliee === true,
        JSON.stringify(repli.apresRepli.memoire));
    r.verifie('la pastille la rouvre', repli.rouverte && repli.pastilleRangee, JSON.stringify(repli));

    // On la déplace par sa poignée. On ne présume pas d'où elle part : on
    // relève sa place, on tire d'une distance connue vers l'espace libre, et
    // l'on vérifie qu'elle a suivi d'autant.
    const depart = await page.evaluate(() => {
        const barre = document.getElementById('barre-document');
        const b = document.getElementById('doc-prise').getBoundingClientRect();
        const r = barre.getBoundingClientRect();
        const place = window.innerHeight - r.bottom;
        const delta = place > 200 ? 160 : -160;      // vers où il y a de la place
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2),
                 haut: Math.round(r.top), delta };
    });
    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    await page.mouse.move(depart.x, depart.y + depart.delta, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const deplacee = await page.evaluate(() => {
        const r = document.getElementById('barre-document').getBoundingClientRect();
        return { haut: Math.round(r.top), pose: barreDocPosee && Math.round(barreDocPosee.y),
                 memoire: JSON.parse(localStorage.getItem('auTableau_barre_document') || '{}'),
                 dansEcran: r.top >= 0 && r.bottom <= window.innerHeight + 1
                     && r.left >= 0 && r.right <= window.innerWidth + 1 };
    });
    r.verifie('la poignée la déplace, d\'autant qu\'on a tiré',
        deplacee.pose !== null && Math.abs(deplacee.haut - (depart.haut + depart.delta)) <= 12,
        JSON.stringify({ depart, deplacee }));
    r.verifie('sans jamais la laisser sortir de l\'écran', deplacee.dansEcran, JSON.stringify(deplacee));
    r.verifie('et la position retenue est elle aussi dans l\'écran',
        deplacee.memoire.pos && deplacee.memoire.pos.y >= 0
        && deplacee.memoire.pos.y <= 800, JSON.stringify(deplacee.memoire));

    // Le document bouge : la barre déplacée ne court plus après lui
    const fidele = await page.evaluate(() => {
        const avant = document.getElementById('barre-document').getBoundingClientRect().top;
        panY -= 120; majBarreDocument();
        const apres = document.getElementById('barre-document').getBoundingClientRect().top;
        panY += 120; majBarreDocument();
        return { avant: Math.round(avant), apres: Math.round(apres) };
    });
    r.egal('déplacée, elle reste où on l\'a mise', fidele.apres, fidele.avant);

    // Le double-clic sur la poignée la remet sous le document
    const priseApres = await page.evaluate(() => {
        const b = document.getElementById('doc-prise').getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    });
    await page.mouse.dblclick(priseApres.x, priseApres.y);
    await page.waitForTimeout(250);
    const remise = await page.evaluate(() => ({
        pose: barreDocPosee,
        haut: Math.round(document.getElementById('barre-document').getBoundingClientRect().top),
        memoire: JSON.parse(localStorage.getItem('auTableau_barre_document') || '{}')
    }));
    r.egal('le double-clic sur la poignée défait le déplacement', remise.pose, null);
    r.egal('elle retrouve la place que le document lui donne', remise.haut, depart.haut);
    r.verifie('et l\'oubli du déplacement est retenu', remise.memoire.pos === null,
        JSON.stringify(remise.memoire));

    // --- ÉCRIRE ET DESSINER SUR LE DOCUMENT EN PLEIN ÉCRAN ---
    // En Focus toutes les barres d'outils sont effacées : sans de quoi écrire
    // dans la barre du document, on ne peut ni annoter un PDF projeté, ni y
    // poser une étiquette sans quitter le plein écran.
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
    r.egal('hors Focus, la barre du document n\'offre pas d\'outils : les vraies barres sont là',
        outilsDoc.horsFocus, 'none');
    r.verifie('en Focus, elle en offre', outilsDoc.enFocus === 'contents', outilsDoc.enFocus);
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
        const barre = document.getElementById('barre-document');
        return {
            mode,
            selection: selectedItems.length,
            barreVisible: barre.classList.contains('visible'),
            crayonActif: document.getElementById('doc-outil-crayon').classList.contains('actif'),
            cadre: getComputedStyle(document.getElementById('doc-modes')).display,
            dupliquer: getComputedStyle(document.getElementById('doc-dupliquer')).display,
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
        barreVisible: document.getElementById('barre-document').classList.contains('visible'),
        docRetenu: docEnAnnotation !== null
    }));
    r.egal('on écrit bien sur le document', apresTrait.traits, 1);
    r.verifie('et la barre est toujours là après le trait',
        apresTrait.barreVisible && apresTrait.docRetenu, JSON.stringify(apresTrait));

    // Ce qui reste dans la barre agit toujours sur la page qu'on annote
    const agitEncore = await page.evaluate(() => {
        const o = document.getElementById('doc-opacite');
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
        const b = document.getElementById('bar-style');
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
            barreVisible: document.getElementById('barre-document').classList.contains('visible'),
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

    // Quitter le Focus : les vraies barres reviennent, la mémoire s'efface
    const sortie = await page.evaluate(() => {
        document.getElementById('doc-outil-crayon').click();
        toggleFocusMode();
        return {
            docRetenu: docEnAnnotation,
            groupe: getComputedStyle(document.getElementById('doc-annoter')).display,
            barreVisible: document.getElementById('barre-document').classList.contains('visible')
        };
    });
    r.egal('en quittant le Focus, la page annotée est oubliée', sortie.docRetenu, null);
    r.egal('le groupe d\'outils se range', sortie.groupe, 'none');
    r.verifie('et la barre s\'en va avec, plus rien n\'étant sélectionné', !sortie.barreVisible,
        JSON.stringify(sortie));

    await page.evaluate(() => {
        localStorage.removeItem('auTableau_barre_document');
        barreDocPosee = null; barreDocRepliee = false;
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        setMode('pointer');
        images.length = 0; freehands.length = 0; selectedItems = []; panX = 0; panY = 0;
        majBarreDocument(); draw();
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
