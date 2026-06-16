// ==========================================
// ERGONOMIE GLOBALE DES PLUGINS (Touche Échap)
// ==========================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // On vérifie si le gestionnaire de plugins existe
        if (window.PluginManager && PluginManager.plugins) {
            let pluginCanceled = false;
            
            // On parcourt tous les outils pour vider la mémoire
            for (let key in PluginManager.plugins) {
                if (PluginManager.plugins[key].currentStamp) {
                    PluginManager.plugins[key].currentStamp = null; // On détruit le fantôme
                    pluginCanceled = true;
                }
            }
            
            // Si un tampon a été annulé, on nettoie l'interface
            if (pluginCanceled) {
                if (typeof setMode === 'function') setMode('pointer'); // Retour à la flèche
                if (typeof draw === 'function') draw(); // Efface le fantôme de l'écran
                if (typeof showToast === 'function') showToast("Tampon annulé");
            }
        }
    }
});

// ==========================================
// MOTEUR DE PLUGINS - AU TABLEAU !
// ==========================================

// ==========================================
// MOTEUR DE PLUGINS - AU TABLEAU !
// ==========================================

// Initialisation de sécurité du gestionnaire de plugins
if (typeof window.PluginManager === 'undefined') {
    window.PluginManager = {
        plugins: {},
        register: function(name, pluginObj) { this.plugins[name] = pluginObj; }
    };
}

function createStampFromSVG(svgStr, callback) {
    const svgData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    const img = new Image();
    img.onload = () => { imageCache[svgData] = img; callback({ img: img, src: svgData, w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = svgData;
}

// ------------------------------------------
// SYSTÈME D'ONGLETS AUTOMATIQUE (ICÔNES)
// ------------------------------------------
const categoryIcons = {
    'Mathematiques': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>`,
    'Histoire-Geographie': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
    'Francais': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
    'Physique-Chimie': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2h6"/><path d="M10 2v5.5L4 18.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-3.5L14 7.5V2"/></svg>`,
    'Musique': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
};



let activeCategory = 'Mathematiques'; // Matière ouverte par défaut

function registerPlugin(name, category, pluginObj) {
    const originalInit = pluginObj.init;
    pluginObj.init = function() {
        const grid = document.getElementById('plugins-grid');
        
        // 1. Création de la barre d'onglets si elle n'existe pas
        let tabContainer = document.getElementById('plugin-tabs');
        if (!tabContainer && grid) {
            tabContainer = document.createElement('div');
            tabContainer.id = 'plugin-tabs';
            tabContainer.style.display = 'flex';
            tabContainer.style.flexWrap = 'wrap'; // Permet de passer à la ligne
            tabContainer.style.gap = '4px'; // Espacement réduit
            tabContainer.style.marginBottom = '12px';
            tabContainer.style.justifyContent = 'center';
            tabContainer.style.borderBottom = '1px solid #dfe6e9';
            tabContainer.style.paddingBottom = '10px';
            
            // ASTUCE : On force la barre globale à s'affiner !
            const barPlugins = document.getElementById('bar-plugins');
            if (barPlugins) {
                barPlugins.style.maxWidth = '110px'; 
                barPlugins.style.minWidth = '110px';
            }
            
            grid.parentNode.insertBefore(tabContainer, grid);
        }

        // 2. Ajout de l'onglet s'il n'existe pas encore
        if (!window.pluginTabsCategories) window.pluginTabsCategories = {};
        if (!window.pluginTabsCategories[category] && tabContainer) {
            window.pluginTabsCategories[category] = true;
            const tabBtn = document.createElement('button');
            tabBtn.className = 'btn';
            tabBtn.title = category;
            // Boutons plus petits pour bien s'emboîter
            tabBtn.style.width = '28px'; 
            tabBtn.style.height = '28px';
            tabBtn.style.padding = '4px';
            tabBtn.innerHTML = categoryIcons[category] || `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
            
            if (category === activeCategory) tabBtn.classList.add('active');
            
            tabBtn.addEventListener('click', () => {
                tabContainer.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
                tabBtn.classList.add('active');
                activeCategory = category;
                
                // N'affiche que les outils de l'onglet actif
                document.querySelectorAll('#plugins-grid .btn').forEach(b => {
                    if (b.dataset.category === category) b.style.display = 'flex';
                    else b.style.display = 'none';
                });
            });
            tabContainer.appendChild(tabBtn);
        }

        // 3. Exécution de l'init et assignation de la catégorie au bouton
        if (originalInit) {
            originalInit.call(this);
            const btns = grid.querySelectorAll('.btn');
            if (btns.length > 0) {
                const newBtn = btns[btns.length - 1]; // Le dernier bouton ajouté
                newBtn.dataset.category = category;
                newBtn.style.display = (category === activeCategory) ? 'flex' : 'none';
            }
        }
    };
    PluginManager.register(name, pluginObj);
}

// ==========================================
// CATÉGORIE : MATHÉMATIQUES
// ==========================================

// 1. FRACTIONS VISUELLES
registerPlugin('fractionTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'fraction'; btn.title = 'Fraction Visuelle';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10V2z" fill="currentColor" fill-opacity="0.3"></path></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('fraction');
            openCustomPrompt("Dessiner une Fraction", [
                { type: 'number', label: "Numérateur", value: "3" }, { type: 'number', label: "Dénominateur", value: "5" },
                { type: 'select', label: "Représentation", value: "pie", options: [{ value: 'pie', label: 'Camembert' }, { value: 'rect', label: 'Bande Rectangulaire' }, { value: 'poly', label: 'Polygone Régulier' }, { value: 'tokens', label: 'Jetons' }] },
                { type: 'color', label: "Couleur", value: activeStyle.strokeColor || '#6c5ce7' }
            ], (res) => this.generateSVG(res[0], res[1], res[2], res[3]), 
               (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], res[2], res[3], true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez la fraction !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier la Fraction", [
            { type: 'number', label: "Numérateur", value: args[0] }, { type: 'number', label: "Dénominateur", value: args[1] },
            { type: 'select', label: "Représentation", value: args[2], options: [{ value: 'pie', label: 'Camembert' }, { value: 'rect', label: 'Bande Rectangulaire' }, { value: 'poly', label: 'Polygone Régulier' }, { value: 'tokens', label: 'Jetons' }] },
            { type: 'color', label: "Couleur", value: args[3] }
        ], (res) => this.generateSVG(res[0], res[1], res[2], res[3]), 
           (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], res[2], res[3], true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(nStr, dStr, type, color, isExport=false) {
        let num = parseInt(nStr)||1; let den = parseInt(dStr)||2; if(den<1) den=1; if(num>den) num=den; if(!color) color='#6c5ce7';
        const s = isExport ? 200 : 100; 
        if (type === 'rect') {
            const w = isExport ? 400 : 200; const h = isExport ? 60 : 30; const step = w/den;
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
            for(let i=0; i<den; i++) svg += `<rect x="${i*step}" y="0" width="${step}" height="${h}" fill="${i<num?color:'none'}" fill-opacity="${i<num?'0.4':'1'}" stroke="${color}" stroke-width="2"/>`;
            return svg + `</svg>`;
        } else if (type === 'tokens') {
            const w = isExport ? 400 : 200; const h = isExport ? 60 : 30;
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
            const r = Math.min(w/(den*2.5), h/2.5); const step = w/den;
            for(let i=0; i<den; i++) svg += `<circle cx="${(i*step)+(step/2)}" cy="${h/2}" r="${r}" fill="${i<num?color:'none'}" fill-opacity="${i<num?'0.4':'1'}" stroke="${color}" stroke-width="2"/>`;
            return svg + `</svg>`;
        } else if (type === 'poly') {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${isExport?s:'100%'}" height="${isExport?s:'100%'}">`;
            const cx = s/2, cy = s/2, r = s/2 - 4; let pts = "";
            for(let i=0; i<den; i++) pts += `${cx+r*Math.cos((i*2*Math.PI)/den - Math.PI/2)},${cy+r*Math.sin((i*2*Math.PI)/den - Math.PI/2)} `;
            svg += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>`;
            for(let i=0; i<den; i++) svg += `<path d="M ${cx} ${cy} L ${cx+r*Math.cos((i*2*Math.PI)/den-Math.PI/2)} ${cy+r*Math.sin((i*2*Math.PI)/den-Math.PI/2)} L ${cx+r*Math.cos(((i+1)*2*Math.PI)/den-Math.PI/2)} ${cy+r*Math.sin(((i+1)*2*Math.PI)/den-Math.PI/2)} Z" fill="${i<num?color:'none'}" fill-opacity="${i<num?'0.4':'1'}" stroke="${color}" stroke-width="1.5"/>`;
            return svg + `</svg>`;
        } else {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${isExport?s:'100%'}" height="${isExport?s:'100%'}">`;
            const cx = s/2, cy = s/2, r = s/2 - 2;
            if(den === 1) svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${num===1?color:'none'}" fill-opacity="${num===1?'0.4':'1'}" stroke="${color}" stroke-width="2"/>`;
            else for(let i=0; i<den; i++) {
                const sA = (i*2*Math.PI)/den - Math.PI/2, eA = ((i+1)*2*Math.PI)/den - Math.PI/2;
                svg += `<path d="M ${cx} ${cy} L ${cx+r*Math.cos(sA)} ${cy+r*Math.sin(sA)} A ${r} ${r} 0 ${(2*Math.PI/den)>Math.PI?1:0} 1 ${cx+r*Math.cos(eA)} ${cy+r*Math.sin(eA)} Z" fill="${i<num?color:'none'}" fill-opacity="${i<num?'0.4':'1'}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
            }
            return svg + `</svg>`;
        }
    },
    onDraw: function(ctx) { if(mode==='fraction'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='fraction'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'fractionTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 2. MATÉRIEL BASE 10
registerPlugin('base10Tool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'base10'; btn.title = 'Matériel Base 10';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('base10');
            openCustomPrompt("Matériel Base 10", [
                { type: 'number', label: "Centaines", value: "1" }, { type: 'number', label: "Dizaines", value: "3" }, { type: 'number', label: "Unités", value: "5" },
                { type: 'color', label: "Couleur", value: "#f39c12" }
            ], (res) => this.generateSVG(res[0], res[1], res[2], res[3]), 
               (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], res[2], res[3], true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez les blocs !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier Base 10", [
            { type: 'number', label: "Centaines", value: args[0] }, { type: 'number', label: "Dizaines", value: args[1] }, { type: 'number', label: "Unités", value: args[2] }, { type: 'color', label: "Couleur", value: args[3] }
        ], (res) => this.generateSVG(res[0], res[1], res[2], res[3]), 
           (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], res[2], res[3], true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(cStr, dStr, uStr, color, isExport=false) {
        let c=parseInt(cStr)||0, d=parseInt(dStr)||0, u=parseInt(uStr)||0; const uS = isExport?20:10, space = isExport?10:5;
        let totalW = (c*uS*10) + (c*space) + (d*uS) + (d*space) + (u*uS) + (u*space); if(totalW===0) totalW=uS; const h = uS*10; 
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${h}" width="${isExport?totalW:'100%'}" height="${isExport?h:'100%'}">`;
        let curX = 0;
        for(let i=0; i<c; i++) {
            svg += `<rect x="${curX}" y="0" width="${uS*10}" height="${uS*10}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="1.5"/>`;
            for(let j=1; j<10; j++) { svg += `<line x1="${curX+j*uS}" y1="0" x2="${curX+j*uS}" y2="${uS*10}" stroke="${color}" stroke-width="0.5"/><line x1="${curX}" y1="${j*uS}" x2="${curX+uS*10}" y2="${j*uS}" stroke="${color}" stroke-width="0.5"/>`; }
            curX += (uS*10) + space;
        }
        for(let i=0; i<d; i++) {
            svg += `<rect x="${curX}" y="0" width="${uS}" height="${uS*10}" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="1.5"/>`;
            for(let j=1; j<10; j++) svg += `<line x1="${curX}" y1="${j*uS}" x2="${curX+uS}" y2="${j*uS}" stroke="${color}" stroke-width="0.5"/>`;
            curX += uS + space;
        }
        for(let i=0; i<u; i++) { svg += `<rect x="${curX}" y="${h-uS}" width="${uS}" height="${uS}" fill="${color}" stroke="${color}" stroke-width="1.5"/>`; curX += uS + space; }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='base10'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='base10'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'base10Tool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 3. TABLEAU DE CONVERSION
registerPlugin('conversionTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'conversion'; btn.title = 'Tableau de Conversion';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('conversion');
            openCustomPrompt("Tableau de Conversion", [
                { type: 'select', label: "Grandeur", value: "len", options: [{ value: 'len', label: 'Longueurs' }, { value: 'mass', label: 'Masses' }, { value: 'cap', label: 'Capacités' }, { value: 'num', label: 'Numération' }] },
                { type: 'color', label: "Couleur", value: "#0984e3" }
            ], (res) => this.generateSVG(res[0], res[1]), 
               (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez le tableau !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier le Tableau", [
            { type: 'select', label: "Grandeur", value: args[0], options: [{ value: 'len', label: 'Longueurs' }, { value: 'mass', label: 'Masses' }, { value: 'cap', label: 'Capacités' }, { value: 'num', label: 'Numération' }] },
            { type: 'color', label: "Couleur", value: args[1] }
        ], (res) => this.generateSVG(res[0], res[1]), 
           (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(type, color, isExport=false) {
        let cols = [];
        if(type === 'len') cols = ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'];
        else if(type === 'mass') cols = ['kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg'];
        else if(type === 'cap') cols = ['kL', 'hL', 'daL', 'L', 'dL', 'cL', 'mL'];
        else if(type === 'num') cols = ['C', 'D', 'U', '1/10', '1/100', '1/1000'];
        const w = cols.length * (isExport ? 90 : 45); const h = (isExport ? 45 : 25) * 4; 
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}"><rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" fill-opacity="0.9" stroke="${color}" stroke-width="2"/><rect x="0" y="0" width="${w}" height="${isExport?45:25}" fill="${color}" fill-opacity="0.15"/>`;
        for(let i=1; i<=4; i++) svg += `<line x1="0" y1="${i*(isExport?45:25)}" x2="${w}" y2="${i*(isExport?45:25)}" stroke="${color}" stroke-width="${i===1?2:1}"/>`;
        for(let i=0; i<cols.length; i++) {
            svg += `<line x1="${i*(isExport?90:45)}" y1="0" x2="${i*(isExport?90:45)}" y2="${h}" stroke="${color}" stroke-width="1"/>`;
            if(type === 'num' && i===3) svg += `<line x1="${i*(isExport?90:45)}" y1="0" x2="${i*(isExport?90:45)}" y2="${h}" stroke="#d63031" stroke-width="4"/>`; 
            svg += `<text x="${i*(isExport?90:45) + (isExport?45:22.5)}" y="${(isExport?22.5:12.5) + (isExport?6:3)}" font-family="sans-serif" font-weight="bold" font-size="${isExport?18:10}" fill="${color}" text-anchor="middle">${cols[i]}</text>`;
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='conversion'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='conversion'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'conversionTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 4. SOLIDES 3D
registerPlugin('solidTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'solid'; btn.title = 'Solides 3D';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('solid');
            openCustomPrompt("Solides de Géométrie", [
                { type: 'select', label: "Type de Solide", value: "pave", options: [{value:'cube', label:'Cube'},{value:'pave', label:'Pavé Droit'},{value:'prisme', label:'Prisme (Triangle)'},{value:'cylindre', label:'Cylindre'},{value:'cone', label:'Cône'},{value:'pyrcarree', label:'Pyramide (Carrée)'},{value:'pyrtri', label:'Pyramide (Triangle)'},{value:'sphere', label:'Sphère'}] },
                { type: 'color', label: "Couleur", value: activeStyle.strokeColor || "#0984e3" }
            ], (res) => this.generateSVG(res[0], res[1]), 
               (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez le solide !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier le Solide", [
            { type: 'select', label: "Type", value: args[0], options: [{value:'cube', label:'Cube'},{value:'pave', label:'Pavé Droit'},{value:'prisme', label:'Prisme'},{value:'cylindre', label:'Cylindre'},{value:'cone', label:'Cône'},{value:'pyrcarree', label:'Pyramide Carrée'},{value:'pyrtri', label:'Pyramide Triangle'},{value:'sphere', label:'Sphère'}] },
            { type: 'color', label: "Couleur", value: args[1] }
        ], (res) => this.generateSVG(res[0], res[1]), 
           (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { imgObj.src=stamp.src; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(type, color, isExport=false) {
        const s = isExport ? 300 : 150; let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${isExport?s:'100%'}" height="${isExport?s:'100%'}">`;
        const c = color; const sw = isExport ? 3 : 2; const swD = isExport ? 2 : 1.5;
        if (type === 'cube' || type === 'pave') {
            const w = type === 'cube' ? s*0.45 : s*0.55; const h = type === 'cube' ? s*0.45 : s*0.35;
            const dx = s*0.2; const dy = s*0.15; const x0 = s*0.15; const y0 = s*0.45;
            svg += `<path d="M ${x0+dx} ${y0-dy} L ${x0+dx+w} ${y0-dy} L ${x0+dx+w} ${y0-dy+h}" fill="none" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${x0+dx}" y1="${y0-dy}" x2="${x0+dx}" y2="${y0-dy+h}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${x0}" y1="${y0+h}" x2="${x0+dx}" y2="${y0-dy+h}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${x0+dx}" y1="${y0-dy+h}" x2="${x0+dx+w}" y2="${y0-dy+h}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
            svg += `<polygon points="${x0},${y0} ${x0+dx},${y0-dy} ${x0+dx+w},${y0-dy} ${x0+w},${y0}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
            svg += `<polygon points="${x0+w},${y0} ${x0+dx+w},${y0-dy} ${x0+dx+w},${y0-dy+h} ${x0+w},${y0+h}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
        } else if (type === 'prisme') {
            const w = s*0.5, h = s*0.4, dx = s*0.2, dy = s*0.15, x0 = s*0.2, y0 = s*0.6;
            svg += `<line x1="${x0+dx}" y1="${y0-dy}" x2="${x0+w/2+dx}" y2="${y0-h-dy}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${x0+dx}" y1="${y0-dy}" x2="${x0+w+dx}" y2="${y0-dy}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${x0}" y1="${y0}" x2="${x0+dx}" y2="${y0-dy}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<polygon points="${x0},${y0} ${x0+w/2},${y0-h} ${x0+w},${y0}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
            svg += `<polygon points="${x0+w/2},${y0-h} ${x0+w/2+dx},${y0-h-dy} ${x0+w+dx},${y0-dy} ${x0+w},${y0}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
            svg += `<line x1="${x0+w/2+dx}" y1="${y0-h-dy}" x2="${x0+dx}" y2="${y0-dy}" stroke="none"/>`; 
        } else if (type === 'cylindre') {
            const rx = s*0.3, ry = s*0.1, cx = s/2, cyTop = s*0.25, cyBot = s*0.75;
            svg += `<path d="M ${cx-rx} ${cyBot} A ${rx} ${ry} 0 0 1 ${cx+rx} ${cyBot}" fill="none" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<path d="M ${cx+rx} ${cyBot} A ${rx} ${ry} 0 0 1 ${cx-rx} ${cyBot}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
            svg += `<ellipse cx="${cx}" cy="${cyTop}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
            svg += `<line x1="${cx-rx}" y1="${cyTop}" x2="${cx-rx}" y2="${cyBot}" stroke="${c}" stroke-width="${sw}"/>`;
            svg += `<line x1="${cx+rx}" y1="${cyTop}" x2="${cx+rx}" y2="${cyBot}" stroke="${c}" stroke-width="${sw}"/>`;
        } else if (type === 'cone') {
            const rx = s*0.35, ry = s*0.12, cx = s/2, cyBot = s*0.8, apexY = s*0.1;
            svg += `<path d="M ${cx-rx} ${cyBot} A ${rx} ${ry} 0 0 1 ${cx+rx} ${cyBot}" fill="none" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<path d="M ${cx+rx} ${cyBot} A ${rx} ${ry} 0 0 1 ${cx-rx} ${cyBot}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
            svg += `<line x1="${cx}" y1="${apexY}" x2="${cx-rx}" y2="${cyBot}" stroke="${c}" stroke-width="${sw}"/>`;
            svg += `<line x1="${cx}" y1="${apexY}" x2="${cx+rx}" y2="${cyBot}" stroke="${c}" stroke-width="${sw}"/>`;
        } else if (type === 'pyrcarree') {
            const apexX = s/2, apexY = s*0.1, w = s*0.6, dx = s*0.2, dy = s*0.15, x0 = s*0.15, y0 = s*0.7;
            svg += `<line x1="${x0+dx}" y1="${y0-dy}" x2="${x0+w+dx}" y2="${y0-dy}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${x0+dx}" y1="${y0-dy}" x2="${x0}" y2="${y0}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${apexX}" y1="${apexY}" x2="${x0+dx}" y2="${y0-dy}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<polygon points="${apexX},${apexY} ${x0},${y0} ${x0+w},${y0}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
            svg += `<polygon points="${apexX},${apexY} ${x0+w},${y0} ${x0+w+dx},${y0-dy}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
            svg += `<line x1="${x0}" y1="${y0}" x2="${x0+w}" y2="${y0}" stroke="${c}" stroke-width="${sw}"/>`;
        } else if (type === 'pyrtri') {
            const apexX = s/2, apexY = s*0.1, x0 = s*0.2, y0 = s*0.8, x1 = s*0.8, y1 = s*0.8, x2 = s*0.5, y2 = s*0.6;
            svg += `<line x1="${x0}" y1="${y0}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<line x1="${apexX}" y1="${apexY}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
            svg += `<polygon points="${apexX},${apexY} ${x0},${y0} ${x1},${y1}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
            svg += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${c}" stroke-width="${sw}"/>`;
        } else if (type === 'sphere') {
            const cx = s/2, cy = s/2, r = s*0.4;
            svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
            svg += `<path d="M ${cx-r} ${cy} A ${r} ${r*0.25} 0 0 0 ${cx+r} ${cy}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
            svg += `<path d="M ${cx-r} ${cy} A ${r} ${r*0.25} 0 0 1 ${cx+r} ${cy}" fill="none" stroke="${c}" stroke-width="${swD}" stroke-dasharray="5,5"/>`;
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='solid'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='solid'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'solidTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 5. AXE MATHÉMATIQUE
registerPlugin('axeTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'axe_math'; btn.title = 'Axe Mathématique';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="12" x2="22" y2="12"></line><line x1="6" y1="8" x2="6" y2="16"></line><line x1="12" y1="8" x2="12" y2="16"></line><line x1="18" y1="8" x2="18" y2="16"></line><polygon points="22,12 18,9 18,15" fill="currentColor"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('axe_math');
            openCustomPrompt("Axe Mathématique", [
                { type: 'number', label: "Min", value: "0" }, { type: 'number', label: "Max", value: "10" }, { type: 'number', label: "Pas", value: "1" },
                { type: 'select', label: "Graduations", value: "no", options: [{value:'no', label:'Non'},{value:'yes', label:'Oui (Millimètres)'}] },
                { type: 'select', label: "Flèches", value: "right", options: [{value:'right', label:'À droite'},{value:'both', label:'Des deux côtés'}] },
                { type: 'color', label: "Couleur", value: "#2d3436" }
            ], (res) => this.generateSVG(res[0],res[1],res[2],res[3],res[4],res[5]), 
               (res) => { createStampFromSVG(this.generateSVG(res[0],res[1],res[2],res[3],res[4],res[5], true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez l'axe !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier l'Axe Mathématique", [
            { type: 'number', label: "Min", value: args[0] }, { type: 'number', label: "Max", value: args[1] }, { type: 'number', label: "Pas", value: args[2] },
            { type: 'select', label: "Graduations", value: args[3], options: [{value:'no', label:'Non'},{value:'yes', label:'Oui'}] },
            { type: 'select', label: "Flèches", value: args[4], options: [{value:'right', label:'À droite'},{value:'both', label:'Des deux côtés'}] },
            { type: 'color', label: "Couleur", value: args[5] }
        ], (res) => this.generateSVG(res[0],res[1],res[2],res[3],res[4],res[5]), 
           (res) => { createStampFromSVG(this.generateSVG(res[0],res[1],res[2],res[3],res[4],res[5], true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(minStr, maxStr, stepStr, hasSub, arrows, color, isExport=false) {
        let min=parseFloat(minStr)||0; let max=parseFloat(maxStr)||10; let step=parseFloat(stepStr)||1; if(step<=0) step=1; if(max<=min) max=min+step;
        const w = isExport ? 900 : 400, h = isExport ? 100 : 60, mX = isExport ? 40 : 20, y = h/2;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        svg += `<line x1="${mX}" y1="${y}" x2="${w-mX}" y2="${y}" stroke="${color}" stroke-width="2"/>`;
        if(arrows === 'both') svg += `<polygon points="${mX},${y} ${mX+12},${y-6} ${mX+12},${y+6}" fill="${color}"/>`;
        svg += `<polygon points="${w-mX},${y} ${w-mX-12},${y-6} ${w-mX-12},${y+6}" fill="${color}"/>`;
        const pxPerUnit = (w - (mX * 2) - 40) / (max - min); const startX = mX + 20;
        if(hasSub === 'yes') {
            for(let val=min; val<=max+0.0001; val+=step/10) {
                if (Math.abs((val-min)%step) > 0.0001) svg += `<line x1="${startX+((val-min)*pxPerUnit)}" y1="${y-4}" x2="${startX+((val-min)*pxPerUnit)}" y2="${y+4}" stroke="${color}" stroke-width="1"/>`;
            }
        }
        for(let val=min; val<=max+0.0001; val+=step) {
            const x = startX+((val-min)*pxPerUnit);
            svg += `<line x1="${x}" y1="${y-8}" x2="${x}" y2="${y+8}" stroke="${color}" stroke-width="2"/>`;
            svg += `<text x="${x}" y="${y+25}" font-family="sans-serif" font-weight="bold" font-size="${isExport?16:10}" fill="${color}" text-anchor="middle">${Number.isInteger(val)?val:parseFloat(val.toFixed(2))}</text>`;
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='axe_math'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='axe_math'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'axeTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 6. REPÈRE CARTÉSIEN
registerPlugin('repereTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'repere'; btn.title = 'Repère Cartésien';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><polygon points="22,12 18,9 18,15" fill="currentColor"/><polygon points="12,2 9,6 15,6" fill="currentColor"/><circle cx="16" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('repere');
            openCustomPrompt("Repère Cartésien", [
                { type: 'number', label: "X Min", value: "-5" }, { type: 'number', label: "X Max", value: "5" },
                { type: 'number', label: "Y Min", value: "-5" }, { type: 'number', label: "Y Max", value: "5" },
                { type: 'number', label: "Pas", value: "1" },
                { type: 'select', label: "Grille ?", value: "yes", options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] },
                { type: 'select', label: "Nombres ?", value: "yes", options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] },
                { type: 'color', label: "Couleur", value: "#2d3436" }
            ], (res) => this.generateSVG(res), 
               (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez le repère !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier le Repère", [
            { type: 'number', label: "X Min", value: args[0] }, { type: 'number', label: "X Max", value: args[1] },
            { type: 'number', label: "Y Min", value: args[2] }, { type: 'number', label: "Y Max", value: args[3] },
            { type: 'number', label: "Pas", value: args[4] },
            { type: 'select', label: "Grille", value: args[5], options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] },
            { type: 'select', label: "Nombres", value: args[6], options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] },
            { type: 'color', label: "Couleur", value: args[7] }
        ], (res) => this.generateSVG(res), 
           (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(res, isExport=false) {
        let xMin = parseFloat(res[0])||-5, xMax = parseFloat(res[1])||5;
        let yMin = parseFloat(res[2])||-5, yMax = parseFloat(res[3])||5;
        let step = parseFloat(res[4])||1; if(step<=0) step=1;
        if(xMax<=xMin) xMax=xMin+step; if(yMax<=yMin) yMax=yMin+step;
        const showGrid = res[5]==='yes', showNums = res[6]==='yes', color = res[7]||'#2d3436';

        const scale = isExport ? 40 : 20; const padding = isExport ? 30 : 15;
        const w = (xMax - xMin) * scale + padding * 2;
        const h = (yMax - yMin) * scale + padding * 2;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        
        const orgX = padding + (0 - xMin) * scale; const orgY = padding + (yMax - 0) * scale;
        if (showGrid) {
            svg += `<g stroke="${color}" stroke-opacity="0.2" stroke-width="1">`;
            for(let x=xMin; x<=xMax; x+=step) { const px = padding + (x - xMin) * scale; svg += `<line x1="${px}" y1="${padding}" x2="${px}" y2="${h-padding}" />`; }
            for(let y=yMin; y<=yMax; y+=step) { const py = padding + (yMax - y) * scale; svg += `<line x1="${padding}" y1="${py}" x2="${w-padding}" y2="${py}" />`; }
            svg += `</g>`;
        }
        svg += `<g stroke="${color}" stroke-width="2">`;
        if (orgY >= padding && orgY <= h - padding) {
            svg += `<line x1="${padding}" y1="${orgY}" x2="${w-padding+10}" y2="${orgY}" />`;
            svg += `<polygon points="${w-padding+10},${orgY} ${w-padding+2},${orgY-4} ${w-padding+2},${orgY+4}" fill="${color}" stroke="none"/>`;
            for(let x=xMin; x<=xMax; x+=step) {
                const px = padding + (x - xMin) * scale; svg += `<line x1="${px}" y1="${orgY-4}" x2="${px}" y2="${orgY+4}" />`;
                if(showNums && x !== 0) svg += `<text x="${px}" y="${orgY+15}" font-family="sans-serif" font-size="${isExport?12:8}" fill="${color}" stroke="none" text-anchor="middle">${Number.isInteger(x)?x:parseFloat(x.toFixed(2))}</text>`;
            }
        }
        if (orgX >= padding && orgX <= w - padding) {
            svg += `<line x1="${orgX}" y1="${h-padding}" x2="${orgX}" y2="${padding-10}" />`;
            svg += `<polygon points="${orgX},${padding-10} ${orgX-4},${padding-2} ${orgX+4},${padding-2}" fill="${color}" stroke="none"/>`;
            for(let y=yMin; y<=yMax; y+=step) {
                const py = padding + (yMax - y) * scale; svg += `<line x1="${orgX-4}" y1="${py}" x2="${orgX+4}" y2="${py}" />`;
                if(showNums && y !== 0) svg += `<text x="${orgX-8}" y="${py+3}" font-family="sans-serif" font-size="${isExport?12:8}" fill="${color}" stroke="none" text-anchor="end">${Number.isInteger(y)?y:parseFloat(y.toFixed(2))}</text>`;
            }
        }
        if(showNums && orgX >= padding && orgX <= w - padding && orgY >= padding && orgY <= h - padding) {
            svg += `<text x="${orgX-6}" y="${orgY+12}" font-family="sans-serif" font-size="${isExport?12:8}" fill="${color}" stroke="none" text-anchor="end">0</text>`;
        }
        svg += `</g></svg>`; return svg;
    },
    onDraw: function(ctx) { if(mode==='repere'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='repere'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'repereTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});


// 7. TAMPONS D'INSTRUMENTS (Aperçu, Options sur mesure, 4 outils natifs)
registerPlugin('instrumentTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    
    // Fonction qui génère le tampon avec les options choisies
    getToolData: function(type, dim1, dim2, grads) {
        let tool; let baseW = 600, baseH = 600;
        let d1 = parseInt(dim1); let d2 = parseInt(dim2);
        
        // Sauvegarde des styles pour cacher les graduations temporairement
        const stylesToRestore = [];
        const hideGrads = (toolKey) => {
             if(grads === 'no' && window.ToolStyle && ToolStyle[toolKey] && ToolStyle[toolKey].graduations) {
                 const g = ToolStyle[toolKey].graduations;
                 stylesToRestore.push({obj: g, key: 'color', val: g.color});
                 stylesToRestore.push({obj: g, key: 'strokeOpacity', val: g.strokeOpacity});
                 g.color = "transparent"; g.strokeOpacity = 0;
             }
        };

        if (type === 'rule') { 
            if(isNaN(d1) || d1 < 50) d1 = 400; 
            tool = new RulerWidget(20, 20); tool.width = d1; tool.height = 60; 
            baseW = d1 + 40; baseH = 100; hideGrads('ruler');
        } else if (type === 'square') { 
            if(isNaN(d1) || d1 < 50) d1 = 300; if(isNaN(d2) || d2 < 50) d2 = 200; 
            tool = new SetSquareWidget(20, 20); tool.width = d1; tool.height = d2; 
            baseW = d1 + 40; baseH = d2 + 40; hideGrads('setSquare');
        } else if (type === 'compass') { 
            if(isNaN(d1) || d1 < 20) d1 = 150; if(isNaN(d2) || d2 < 50) d2 = 320; 
            const currentLegLength = Math.max(d2, (d1 / 2) + 20);
            const compassH = Math.sqrt(currentLegLength ** 2 - (d1 / 2) ** 2);
            tool = new CompassWidget(40, compassH + 40); tool.radius = d1; tool.legLength = d2;
            baseW = d1 + 80; baseH = compassH + 80; 
        } else if (type === 'prot') { 
            if(isNaN(d1) || d1 < 50) d1 = 180; 
            tool = new ProtractorWidget(d1 + 20, d1 + 20); tool.radius = d1; 
            baseW = (d1 * 2) + 40; baseH = d1 + 60; hideGrads('protractor');
        }
        
        const canvas = document.createElement('canvas'); canvas.width = baseW; canvas.height = baseH;
        const ctx = canvas.getContext('2d');
        
        // ---> L'AJOUT EST ICI : On indique au widget qu'il est dessiné en tant que tampon
        tool.isStamp = true;
        
        tool.draw(ctx);
        stylesToRestore.forEach(r => r.obj[r.key] = r.val);
        return { dataURL: canvas.toDataURL("image/png"), w: baseW, h: baseH };
    },

    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'instrument'; btn.title = 'Tampon Instruments';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('instrument');
            openCustomPrompt("Tampon Instrument", [
                { type: 'select', label: "Instrument", value: "rule", options: [{value:'rule', label:'Règle'},{value:'square', label:'Équerre'},{value:'compass', label:'Compas'},{value:'prot', label:'Rapporteur'}]},
                { type: 'number', label: "Dimension 1 (Long. / Rayon / Écart)", value: "300" },
                { type: 'number', label: "Dimension 2 (Larg. / Branches)", value: "200" },
                { type: 'select', label: "Graduations ?", value: "yes", options: [{value:'yes', label:'Avec'}, {value:'no', label:'Sans'}] }
            ], 
            (res) => { const data = this.getToolData(res[0], res[1], res[2], res[3]); return `<img src="${data.dataURL}" style="max-width:100%; max-height:100px; object-fit:contain; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.1));">`; },
            (res) => { 
                const data = this.getToolData(res[0], res[1], res[2], res[3]); const img = new Image();
                img.onload = () => { imageCache[data.dataURL] = img; this.currentStamp = { img: img, src: data.dataURL, w: data.w, h: data.h }; this.currentArgs = res; showToast("📌 Posez l'instrument !"); draw(); };
                img.src = data.dataURL;
            }); e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier l'Instrument", [
            { type: 'select', label: "Instrument", value: args[0] || 'rule', options: [{value:'rule', label:'Règle'},{value:'square', label:'Équerre'},{value:'compass', label:'Compas'},{value:'prot', label:'Rapporteur'}]},
            { type: 'number', label: "Dimension 1", value: args[1] || "300" }, { type: 'number', label: "Dimension 2", value: args[2] || "200" },
            { type: 'select', label: "Graduations ?", value: args[3] || "yes", options: [{value:'yes', label:'Avec'}, {value:'no', label:'Sans'}] }
        ], 
        (res) => { const data = this.getToolData(res[0], res[1], res[2], res[3]); return `<img src="${data.dataURL}" style="max-width:100%; max-height:100px; object-fit:contain; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.1));">`; },
        (res) => { 
            const data = this.getToolData(res[0], res[1], res[2], res[3]); const img = new Image();
            img.onload = () => { imageCache[data.dataURL] = img; imgObj.src = data.dataURL; imgObj.w = data.w; imgObj.h = data.h; imgObj.cw = data.w; imgObj.ch = data.h; imgObj.pluginData.args = res; draw(); saveState(); };
            img.src = data.dataURL;
        });
    },
    onDraw: function(ctx) { if(mode==='instrument'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='instrument'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'instrumentTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; draw(); return true; } return false; }
});

// 8. HORLOGE PÉDAGOGIQUE (Simplifiée sans les minutes)
registerPlugin('clockTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'clock'; btn.title = 'Horloge Pédagogique';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('clock');
            const now = new Date();
            openCustomPrompt("Horloge", [
                { type: 'number', label: "Heures", value: now.getHours() }, 
                { type: 'number', label: "Minutes", value: now.getMinutes() },
                { type: 'color', label: "Couleur", value: "#2d3436" }
            ], (res) => this.generateSVG(res[0], res[1], res[2]), 
               (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], res[2], true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez l'horloge !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier l'Horloge", [
            { type: 'number', label: "Heures", value: args[0] }, { type: 'number', label: "Minutes", value: args[1] }, { type: 'color', label: "Couleur", value: args[2] }
        ], (res) => this.generateSVG(res[0], res[1], res[2]), 
           (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], res[2], true), (stamp) => { imgObj.src=stamp.src; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(hStr, mStr, color, isExport=false) {
        let h = parseInt(hStr)||0; let m = parseInt(mStr)||0; const s = isExport ? 300 : 150; const cx = s/2, cy = s/2, r = s/2 - 10;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${isExport?s:'100%'}" height="${isExport?s:'100%'}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="${color}" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="4" fill="${color}"/>`;
        for(let i=0; i<60; i++) {
            const a = (i*6 - 90)*(Math.PI/180); const isHour = i%5===0;
            svg += `<line x1="${cx + (isHour?r-12:r-6)*Math.cos(a)}" y1="${cy + (isHour?r-12:r-6)*Math.sin(a)}" x2="${cx + r*Math.cos(a)}" y2="${cy + r*Math.sin(a)}" stroke="${color}" stroke-width="${isHour?3:1}"/>`;
            if(isHour) svg += `<text x="${cx + (r-28)*Math.cos(a)}" y="${cy + (r-28)*Math.sin(a) + 5}" font-family="sans-serif" font-weight="bold" font-size="${isExport?20:10}" fill="${color}" text-anchor="middle">${i===0?12:i/5}</text>`;
        }
        svg += `<line x1="${cx}" y1="${cy}" x2="${cx + (r*0.5)*Math.cos((((h%12)+m/60)*30 - 90)*Math.PI/180)}" y2="${cy + (r*0.5)*Math.sin((((h%12)+m/60)*30 - 90)*Math.PI/180)}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
        svg += `<line x1="${cx}" y1="${cy}" x2="${cx + (r*0.8)*Math.cos((m*6 - 90)*Math.PI/180)}" y2="${cy + (r*0.8)*Math.sin((m*6 - 90)*Math.PI/180)}" stroke="#d63031" stroke-width="3" stroke-linecap="round"/></svg>`;
        return svg;
    },
    onDraw: function(ctx) { if(mode==='clock'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='clock'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'clockTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 9. THERMOMÈTRE
registerPlugin('thermoTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'thermo'; btn.title = 'Thermomètre';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('thermo');
            openCustomPrompt("Thermomètre", [
                { type: 'number', label: "T° Min", value: "-20" }, { type: 'number', label: "T° Max", value: "40" },
                { type: 'number', label: "T° Affichée", value: "15" },
                { type: 'select', label: "Afficher nombres ?", value: "yes", options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] }
            ], (res) => this.generateSVG(res), 
               (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez le thermomètre !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier le Thermomètre", [
            { type: 'number', label: "T° Min", value: args[0] }, { type: 'number', label: "T° Max", value: args[1] },
            { type: 'number', label: "T° Affichée", value: args[2] },
            { type: 'select', label: "Nombres ?", value: args[3], options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] }
        ], (res) => this.generateSVG(res), 
           (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(res, isExport=false) {
        let min = parseInt(res[0])||-20, max = parseInt(res[1])||40, cur = parseInt(res[2])||15;
        if(max <= min) max = min + 10;
        if(cur < min) cur = min; if(cur > max) cur = max;
        const showNums = res[3] === 'yes';

        const scale = isExport ? 6 : 3; const tubeW = isExport ? 30 : 15; const bulbR = isExport ? 30 : 15; const padding = isExport ? 40 : 20;
        const range = max - min; const tubeH = range * scale;
        const w = (isExport ? 160 : 80); const h = tubeH + bulbR*2 + padding*2; const cx = w/2;
        const yTop = padding; const yBot = padding + tubeH; 

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        const liquidH = (cur - min) * scale;
        svg += `<rect x="${cx - tubeW/2 + 2}" y="${yBot - liquidH}" width="${tubeW - 4}" height="${liquidH + bulbR*0.8}" fill="#e74c3c" />`;
        svg += `<circle cx="${cx}" cy="${yBot + bulbR*0.8}" r="${bulbR - 2}" fill="#e74c3c" />`;
        svg += `<path d="M ${cx - tubeW/2} ${yTop} A ${tubeW/2} ${tubeW/2} 0 0 1 ${cx + tubeW/2} ${yTop} L ${cx + tubeW/2} ${yBot} A ${bulbR} ${bulbR} 0 1 1 ${cx - tubeW/2} ${yBot} Z" fill="none" stroke="#2d3436" stroke-width="3"/>`;
        svg += `<g stroke="#2d3436" stroke-width="2">`;
        for(let val = min; val <= max; val++) {
            const py = yBot - (val - min) * scale;
            if (val % 10 === 0) {
                svg += `<line x1="${cx + tubeW/2}" y1="${py}" x2="${cx + tubeW/2 + 10}" y2="${py}" stroke-width="2"/>`;
                if(showNums) svg += `<text x="${cx + tubeW/2 + 15}" y="${py + 4}" font-family="sans-serif" font-size="${isExport?14:8}" fill="#2d3436">${val}</text>`;
            } else if (val % 5 === 0) { svg += `<line x1="${cx + tubeW/2}" y1="${py}" x2="${cx + tubeW/2 + 6}" y2="${py}" stroke-width="1.5"/>`; } 
            else { svg += `<line x1="${cx + tubeW/2}" y1="${py}" x2="${cx + tubeW/2 + 3}" y2="${py}" stroke-width="1"/>`; }
        }
        svg += `</g></svg>`; return svg;
    },
    onDraw: function(ctx) { if(mode==='thermo'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='thermo'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'thermoTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 10. STATISTIQUES
registerPlugin('statTool', 'Mathematiques', {
    currentStamp: null, editingImage: null, state: { type: "bar", title: "Titre", color: "#3498db", rows: [{label:"A", val:10}, {label:"B", val:25}] },
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'stat'; btn.title = 'Graphique Statistique';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="10" width="4" height="10"/><rect x="11" y="4" width="4" height="16"/><rect x="17" y="14" width="4" height="6"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        const builderHTML = `
        <div id="stat-builder-modal" style="display:none; position:absolute; left:calc(50vw - 210px); top:15vh; width:420px; z-index:10001; background:#ffffff; border-radius:10px; box-shadow:0 15px 40px rgba(0,0,0,0.3); border:1px solid #dfe6e9; flex-direction:column;">
            <div id="stat-drag-handle" style="height:30px; background:#1e272e; color:#fff; display:flex; align-items:center; padding:0 12px; cursor:grab; font-weight:bold; font-size:12px;">Constructeur de Graphique</div>
            <div style="padding:12px; display:flex; flex-direction:column; gap:8px;">
                <div id="stat-preview" style="width:100%; height:110px; background:#f1f2f6; border:2px dashed #b2bec3; border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <select id="stat-type" class="prompt-input" style="flex:1; padding:6px;"><option value="bar">Barres</option><option value="pie">Camembert</option><option value="line">Ligne</option></select>
                    <input type="text" id="stat-title" class="prompt-input" style="flex:2; padding:6px;" placeholder="Titre">
                    <input type="color" id="stat-color" style="height:30px; width:30px; padding:0; border:none; cursor:pointer;">
                </div>
                <div id="stat-rows" style="display:flex; flex-direction:column; gap:4px; max-height:100px; overflow-y:auto; border:1px solid #dfe6e9; padding:4px; border-radius:6px; background:#f8f9fa;"></div>
                <button class="btn-action secondary" id="stat-btn-add" style="border:1px dashed #b2bec3; background:transparent; color:#2d3436; padding:4px; font-size:12px;">+ Ajouter ligne</button>
                <div class="export-actions-grid" style="display:flex; margin-top:2px;"><button class="btn-action secondary" id="stat-btn-cancel" style="flex:1; padding:6px;">Annuler</button><button class="btn-action primary" id="stat-btn-ok" style="flex:1; background:#6c5ce7; padding:6px;">Valider</button></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', builderHTML);
        
        const modal = document.getElementById('stat-builder-modal'); const handle = document.getElementById('stat-drag-handle');
        let isDrag = false, startX, startY;
        handle.addEventListener('mousedown', (e) => { isDrag=true; startX=e.clientX-modal.offsetLeft; startY=e.clientY-modal.offsetTop; });
        window.addEventListener('mousemove', (e) => { if(isDrag) { modal.style.left=(e.clientX-startX)+'px'; modal.style.top=(e.clientY-startY)+'px'; }});
        window.addEventListener('mouseup', () => isDrag=false);

        document.getElementById('stat-type').addEventListener('change', (e) => { this.state.type = e.target.value; this.renderPreview(); });
        document.getElementById('stat-title').addEventListener('input', (e) => { this.state.title = e.target.value; this.renderPreview(); });
        document.getElementById('stat-color').addEventListener('input', (e) => { this.state.color = e.target.value; this.renderPreview(); });
        document.getElementById('stat-btn-add').addEventListener('click', () => { this.state.rows.push({ label: "Nom", val: 10 }); this.renderRowsUI(); });
        document.getElementById('stat-btn-cancel').addEventListener('click', () => { modal.style.display = 'none'; this.editingImage = null; });
        document.getElementById('stat-btn-ok').addEventListener('click', () => {
            modal.style.display = 'none';
            createStampFromSVG(this.generateSVG(true), (stamp) => {
                if (this.editingImage) {
                    this.editingImage.src = stamp.src; this.editingImage.w = stamp.w; this.editingImage.h = stamp.h; this.editingImage.cw = stamp.w; this.editingImage.ch = stamp.h;
                    this.editingImage.pluginData.state = JSON.parse(JSON.stringify(this.state)); this.editingImage = null; draw(); saveState();
                } else { this.currentStamp = stamp; this.currentState = JSON.parse(JSON.stringify(this.state)); showToast("📌 Tamponnez le graphique !"); }
            });
        });

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('stat');
            this.editingImage = null; modal.style.display = 'flex'; this.renderRowsUI(); e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        this.editingImage = imgObj; this.state = JSON.parse(JSON.stringify(imgObj.pluginData.state));
        if(!this.state.type) this.state.type = 'bar'; 
        document.getElementById('stat-builder-modal').style.display = 'flex'; this.renderRowsUI();
    },
    renderRowsUI: function() {
        document.getElementById('stat-type').value = this.state.type || 'bar';
        document.getElementById('stat-title').value = this.state.title; document.getElementById('stat-color').value = this.state.color;
        const container = document.getElementById('stat-rows'); container.innerHTML = '';
        this.state.rows.forEach((r, idx) => {
            container.innerHTML += `<div style="display:flex; gap:5px; align-items:center;">
                <input type="text" value="${r.label}" class="prompt-input" oninput="pluginStatUpdate(${idx}, 'label', this.value)" style="flex:2; padding:2px 4px; font-size:12px;">
                <input type="number" value="${r.val}" class="prompt-input" oninput="pluginStatUpdate(${idx}, 'val', this.value)" style="flex:1; padding:2px 4px; font-size:12px;">
                <button style="border:none; background:transparent; cursor:pointer; color:#d63031; padding:0 4px;" onclick="pluginStatRemove(${idx})">✕</button>
            </div>`;
        });
        window.pluginStatRemove = (idx) => { this.state.rows.splice(idx, 1); this.renderRowsUI(); };
        window.pluginStatUpdate = (idx, key, val) => { this.state.rows[idx][key] = (key==='val'?parseFloat(val)||0:val); this.renderPreview(); };
        this.renderPreview();
    },
    renderPreview: function() { document.getElementById('stat-preview').innerHTML = this.generateSVG(false); },
    generateSVG: function(isExport=false) {
        const w = isExport ? 600 : 300, h = isExport ? 400 : 200, mX = isExport?40:20, mY = isExport?50:25;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        svg += `<text x="${w/2}" y="${mY/2}" font-family="sans-serif" font-weight="bold" font-size="${isExport?20:12}" fill="#2d3436" text-anchor="middle">${this.state.title}</text>`;
        
        const num = this.state.rows.length; if(num===0) return svg + `</svg>`;
        
        if (this.state.type === 'pie') {
            const cx = w/2, cy = h/2 + 10, r = Math.min(w, h)/2 - (isExport?40:20);
            const total = this.state.rows.reduce((s, r) => s + r.val, 0);
            if (total > 0) {
                let curAng = -Math.PI/2;
                const colors = [this.state.color, '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c'];
                this.state.rows.forEach((rObj, i) => {
                    const sliceAng = (rObj.val/total) * 2 * Math.PI; const eAng = curAng + sliceAng; const largeArc = sliceAng > Math.PI ? 1 : 0;
                    const x1 = cx + r*Math.cos(curAng), y1 = cy + r*Math.sin(curAng); const x2 = cx + r*Math.cos(eAng), y2 = cy + r*Math.sin(eAng);
                    const midAng = curAng + sliceAng/2; const tx = cx + (r*0.6)*Math.cos(midAng), ty = cy + (r*0.6)*Math.sin(midAng);
                    const col = colors[i % colors.length];
                    if (sliceAng >= 2*Math.PI - 0.001) { svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" fill-opacity="0.8" stroke="#fff" stroke-width="2"/>`; } 
                    else { svg += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${col}" fill-opacity="0.8" stroke="#fff" stroke-width="2"/>`; }
                    svg += `<text x="${tx}" y="${ty}" font-family="sans-serif" font-weight="bold" font-size="${isExport?14:8}" fill="#fff" text-anchor="middle">${rObj.label}</text>`;
                    svg += `<text x="${tx}" y="${ty+(isExport?15:10)}" font-family="sans-serif" font-size="${isExport?12:7}" fill="#fff" text-anchor="middle">${rObj.val}</text>`;
                    curAng = eAng;
                });
            }
        } else {
            svg += `<line x1="${mX}" y1="${mY}" x2="${mX}" y2="${h-mY}" stroke="#2d3436" stroke-width="2"/><line x1="${mX}" y1="${h-mY}" x2="${w-10}" y2="${h-mY}" stroke="#2d3436" stroke-width="2"/>`;
            const max = Math.max(...this.state.rows.map(r=>r.val), 1);
            const usableW = w - mX - 20, usableH = h - (mY*2);
            
            if (this.state.type === 'bar') {
                const barW = Math.min((usableW / num) - (isExport?10:5), isExport?80:40);
                this.state.rows.forEach((r, i) => {
                    const barH = (r.val / max) * usableH; const x = mX + 10 + i * (usableW/num) + ((usableW/num - barW)/2); const y = h - mY - barH;
                    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${this.state.color}" fill-opacity="0.8" stroke="${this.state.color}" stroke-width="2"/>`;
                    svg += `<text x="${x+barW/2}" y="${y-5}" font-family="sans-serif" font-weight="bold" font-size="${isExport?14:8}" fill="#2d3436" text-anchor="middle">${r.val}</text>`;
                    svg += `<text x="${x+barW/2}" y="${h-mY+(isExport?20:12)}" font-family="sans-serif" font-size="${isExport?14:8}" fill="#2d3436" text-anchor="middle">${r.label}</text>`;
                });
            } else if (this.state.type === 'line') {
                let pts = [];
                this.state.rows.forEach((r, i) => {
                    const x = mX + 20 + i * (usableW/(num||1)); const y = h - mY - ((r.val / max) * usableH); pts.push(`${x},${y}`);
                    svg += `<circle cx="${x}" cy="${y}" r="${isExport?6:3}" fill="${this.state.color}"/>`;
                    svg += `<text x="${x}" y="${y-10}" font-family="sans-serif" font-weight="bold" font-size="${isExport?14:8}" fill="#2d3436" text-anchor="middle">${r.val}</text>`;
                    svg += `<text x="${x}" y="${h-mY+(isExport?20:12)}" font-family="sans-serif" font-size="${isExport?14:8}" fill="#2d3436" text-anchor="middle">${r.label}</text>`;
                });
                svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${this.state.color}" stroke-width="${isExport?3:2}"/>`;
            }
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='stat'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='stat'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'statTool', state:this.currentState}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 11. TABLEAU DE PROPORTIONNALITÉ
registerPlugin('propTableTool', 'Mathematiques', {
    currentStamp: null, editingImage: null, state: { t1: "Grandeur 1", t2: "Grandeur 2", coef: "", cols: [{v1:"2",v2:"6"},{v1:"5",v2:"15"}] },
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'proptable'; btn.title = 'Tableau de Proportionnalité';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="9" y1="6" x2="9" y2="18"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        const builderHTML = `
        <div id="prop-builder-modal" style="display:none; position:absolute; left:calc(50vw - 210px); top:15vh; width:420px; z-index:10001; background:#ffffff; border-radius:10px; box-shadow:0 15px 40px rgba(0,0,0,0.3); border:1px solid #dfe6e9; flex-direction:column;">
            <div id="prop-drag-handle" style="height:30px; background:#1e272e; color:#fff; display:flex; align-items:center; padding:0 12px; cursor:grab; font-weight:bold; font-size:12px;">Tableau de Proportionnalité</div>
            <div style="padding:12px; display:flex; flex-direction:column; gap:8px;">
                <div id="prop-preview" style="width:100%; height:90px; background:#f1f2f6; border:2px dashed #b2bec3; border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="text" id="prop-t1" class="prompt-input" style="flex:1; padding:6px;" placeholder="Ligne 1">
                    <input type="text" id="prop-t2" class="prompt-input" style="flex:1; padding:6px;" placeholder="Ligne 2">
                    <input type="text" id="prop-coef" class="prompt-input" style="width:50px; padding:6px;" placeholder="× 3">
                </div>
                <div id="prop-cols" style="display:flex; gap:5px; overflow-x:auto; border:1px solid #dfe6e9; padding:4px; border-radius:6px; background:#f8f9fa;"></div>
                <button class="btn-action secondary" id="prop-btn-add" style="border:1px dashed #b2bec3; background:transparent; color:#2d3436; padding:4px; font-size:12px;">+ Colonne</button>
                <div class="export-actions-grid" style="display:flex; margin-top:2px;"><button class="btn-action secondary" id="prop-btn-cancel" style="flex:1; padding:6px;">Annuler</button><button class="btn-action primary" id="prop-btn-ok" style="flex:1; background:#6c5ce7; padding:6px;">Valider</button></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', builderHTML);
        
        const modal = document.getElementById('prop-builder-modal'); const handle = document.getElementById('prop-drag-handle');
        let isDrag = false, startX, startY;
        handle.addEventListener('mousedown', (e) => { isDrag=true; startX=e.clientX-modal.offsetLeft; startY=e.clientY-modal.offsetTop; });
        window.addEventListener('mousemove', (e) => { if(isDrag) { modal.style.left=(e.clientX-startX)+'px'; modal.style.top=(e.clientY-startY)+'px'; }});
        window.addEventListener('mouseup', () => isDrag=false);

        document.getElementById('prop-t1').addEventListener('input', (e) => { this.state.t1 = e.target.value; this.renderPreview(); });
        document.getElementById('prop-t2').addEventListener('input', (e) => { this.state.t2 = e.target.value; this.renderPreview(); });
        document.getElementById('prop-coef').addEventListener('input', (e) => { this.state.coef = e.target.value; this.renderPreview(); });
        document.getElementById('prop-btn-add').addEventListener('click', () => { this.state.cols.push({ v1: "", v2: "" }); this.renderColsUI(); });
        document.getElementById('prop-btn-cancel').addEventListener('click', () => { modal.style.display = 'none'; this.editingImage = null; });
        document.getElementById('prop-btn-ok').addEventListener('click', () => {
            modal.style.display = 'none';
            createStampFromSVG(this.generateSVG(true), (stamp) => {
                if (this.editingImage) {
                    this.editingImage.src = stamp.src; this.editingImage.w = stamp.w; this.editingImage.h = stamp.h; this.editingImage.cw = stamp.w; this.editingImage.ch = stamp.h;
                    this.editingImage.pluginData.state = JSON.parse(JSON.stringify(this.state)); this.editingImage = null; draw(); saveState();
                } else { this.currentStamp = stamp; this.currentState = JSON.parse(JSON.stringify(this.state)); showToast("📌 Tamponnez le tableau !"); }
            });
        });

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('proptable');
            this.editingImage = null; modal.style.display = 'flex'; this.renderColsUI(); e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        this.editingImage = imgObj; this.state = JSON.parse(JSON.stringify(imgObj.pluginData.state));
        document.getElementById('prop-builder-modal').style.display = 'flex'; this.renderColsUI();
    },
    renderColsUI: function() {
        document.getElementById('prop-t1').value = this.state.t1; document.getElementById('prop-t2').value = this.state.t2; document.getElementById('prop-coef').value = this.state.coef;
        const container = document.getElementById('prop-cols'); container.innerHTML = '';
        this.state.cols.forEach((c, idx) => {
            container.innerHTML += `<div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
                <button style="border:none; background:transparent; cursor:pointer; color:#d63031; font-size:10px; padding:0;" onclick="pluginPropRemove(${idx})">✕</button>
                <input type="text" value="${c.v1}" class="prompt-input" oninput="pluginPropUpdate(${idx}, 'v1', this.value)" style="width:40px; text-align:center; padding:2px; font-size:12px;">
                <input type="text" value="${c.v2}" class="prompt-input" oninput="pluginPropUpdate(${idx}, 'v2', this.value)" style="width:40px; text-align:center; padding:2px; font-size:12px;">
            </div>`;
        });
        window.pluginPropRemove = (idx) => { this.state.cols.splice(idx, 1); this.renderColsUI(); };
        window.pluginPropUpdate = (idx, key, val) => { this.state.cols[idx][key] = val; this.renderPreview(); };
        this.renderPreview();
    },
    renderPreview: function() { document.getElementById('prop-preview').innerHTML = this.generateSVG(false); },
    generateSVG: function(isExport=false) {
        const cols = Math.max(this.state.cols.length, 1); const color = "#2d3436";
        const titleW = isExport ? 200 : 100; const cellW = isExport ? 100 : 50; const rowH = isExport ? 60 : 30;
        const w = titleW + (cols * cellW) + (this.state.coef ? (isExport?80:40) : 0); const h = rowH * 2;
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        svg += `<rect x="0" y="0" width="${titleW+(cols*cellW)}" height="${h}" fill="#ffffff" fill-opacity="0.9" stroke="${color}" stroke-width="2"/>`;
        svg += `<line x1="0" y1="${rowH}" x2="${titleW+(cols*cellW)}" y2="${rowH}" stroke="${color}" stroke-width="2"/>`;
        svg += `<line x1="${titleW}" y1="0" x2="${titleW}" y2="${h}" stroke="${color}" stroke-width="2"/>`;
        for(let i=1; i<cols; i++) svg += `<line x1="${titleW + i*cellW}" y1="0" x2="${titleW + i*cellW}" y2="${h}" stroke="${color}" stroke-width="1"/>`;
        
        const fs = isExport ? 16 : 10;
        svg += `<text x="${titleW/2}" y="${rowH/2 + fs/3}" font-family="sans-serif" font-weight="bold" font-size="${fs}" fill="${color}" text-anchor="middle">${this.state.t1}</text>`;
        svg += `<text x="${titleW/2}" y="${rowH + rowH/2 + fs/3}" font-family="sans-serif" font-weight="bold" font-size="${fs}" fill="${color}" text-anchor="middle">${this.state.t2}</text>`;
        
        this.state.cols.forEach((c, i) => {
            svg += `<text x="${titleW + i*cellW + cellW/2}" y="${rowH/2 + fs/3}" font-family="sans-serif" font-size="${fs+2}" fill="#0984e3" text-anchor="middle">${c.v1}</text>`;
            svg += `<text x="${titleW + i*cellW + cellW/2}" y="${rowH + rowH/2 + fs/3}" font-family="sans-serif" font-size="${fs+2}" fill="#0984e3" text-anchor="middle">${c.v2}</text>`;
        });

        if (this.state.coef) {
            const arrX = titleW + cols*cellW + (isExport?15:5);
            svg += `<path d="M ${arrX} ${rowH/2} C ${arrX+(isExport?40:20)} ${rowH/2}, ${arrX+(isExport?40:20)} ${rowH+rowH/2}, ${arrX} ${rowH+rowH/2}" fill="none" stroke="#e74c3c" stroke-width="2"/>`;
            svg += `<polygon points="${arrX},${rowH+rowH/2} ${arrX+(isExport?10:5)},${rowH+rowH/2-(isExport?5:3)} ${arrX+(isExport?10:5)},${rowH+rowH/2+(isExport?5:3)}" fill="#e74c3c"/>`;
            svg += `<text x="${arrX+(isExport?45:22)}" y="${rowH + fs/3}" font-family="sans-serif" font-weight="bold" font-size="${fs}" fill="#e74c3c" text-anchor="start">${this.state.coef}</text>`;
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='proptable'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='proptable'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'propTableTool', state:this.currentState}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 12. DÉS À JOUER
registerPlugin('diceTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'dice'; btn.title = 'Dés à jouer';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('dice');
            openCustomPrompt("Dés à Jouer", [
                { type: 'number', label: "Dé 1 (1-6)", value: Math.floor(Math.random()*6)+1 },
                { type: 'number', label: "Dé 2 (Opt)", value: "" }, { type: 'number', label: "Dé 3 (Opt)", value: "" },
                { type: 'color', label: "Couleur", value: "#2d3436" }
            ], (res) => this.generateSVG(res), 
               (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez les dés !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier les Dés", [
            { type: 'number', label: "Dé 1", value: args[0] }, { type: 'number', label: "Dé 2", value: args[1] }, { type: 'number', label: "Dé 3", value: args[2] }, { type: 'color', label: "Couleur", value: args[3] }
        ], (res) => this.generateSVG(res), 
           (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(res, isExport=false) {
        let vals = [parseInt(res[0]), parseInt(res[1]), parseInt(res[2])].filter(v => !isNaN(v) && v >= 1 && v <= 6);
        if(vals.length === 0) vals = [1];
        const color = res[3] || "#2d3436";
        
        const s = isExport ? 60 : 30; const gap = isExport ? 10 : 5; const p = isExport ? 4 : 2; 
        const w = (s * vals.length) + (gap * (vals.length - 1)) + p*2; const h = s + p*2;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        const drawDot = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${s*0.08}" fill="${color}"/>`;

        vals.forEach((v, i) => {
            const x = p + i * (s + gap); const y = p;
            svg += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s*0.15}" fill="#ffffff" stroke="${color}" stroke-width="${isExport?3:1.5}"/>`;
            const p1 = s*0.25, p2 = s*0.5, p3 = s*0.75;
            if(v===1 || v===3 || v===5) svg += drawDot(x+p2, y+p2); 
            if(v!==1) { svg += drawDot(x+p1, y+p1); svg += drawDot(x+p3, y+p3); } 
            if(v===4 || v===5 || v===6) { svg += drawDot(x+p3, y+p1); svg += drawDot(x+p1, y+p3); } 
            if(v===6) { svg += drawDot(x+p1, y+p2); svg += drawDot(x+p3, y+p2); } 
        });
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='dice'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='dice'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'diceTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// 13. CIBLE DE PROBABILITÉS
registerPlugin('targetTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'target'; btn.title = 'Cible (Probas)';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('target');
            openCustomPrompt("Créer une Cible", [
                { type: 'text', label: "Scores (Centre -> Ext, ex: 10,5,0,-5)", value: "10, 5, 0, -5" },
                { type: 'color', label: "Couleur", value: "#e74c3c" },
                { type: 'select', label: "Bicolore ?", value: "yes", options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] }
            ], (res) => this.generateSVG(res), 
               (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Tamponnez la cible !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier la Cible", [
            { type: 'text', label: "Scores", value: args[0] }, { type: 'color', label: "Couleur", value: args[1] },
            { type: 'select', label: "Bicolore ?", value: args[2], options: [{value:'yes', label:'Oui'},{value:'no', label:'Non'}] }
        ], (res) => this.generateSVG(res), 
           (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(res, isExport=false) {
        let scores = res[0].split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
        if (scores.length === 0) scores = [10, 5, 0, -5];
        const color = res[1] || "#e74c3c"; const isBicolor = res[2] === 'yes';
        
        const rings = scores.length; const s = isExport ? 300 : 150; const h = s; 
        const cx = s/2, cy = s/2; const maxR = s/2 - 5; const step = maxR / rings;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${h}" width="${isExport?s:'100%'}" height="${isExport?s:'100%'}">`;
        
        for (let i = rings - 1; i >= 0; i--) {
            const r = (i + 1) * step; const score = scores[i];
            const isColPri = isBicolor ? (i % 2 === 0) : false;
            const fill = isBicolor ? (isColPri ? color : "#ffffff") : "#ffffff";
            const opacity = isBicolor ? "1" : "0.1";
            svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" fill-opacity="${opacity}" stroke="${color}" stroke-width="2"/>`;
            
            const textColor = (isBicolor && isColPri) ? "#ffffff" : color;
            if (isExport) {
                if (i === 0) svg += `<text x="${cx}" y="${cy + 5}" font-family="sans-serif" font-weight="bold" font-size="14" fill="${textColor}" text-anchor="middle">${score}</text>`;
                else svg += `<text x="${cx}" y="${cy - r + step/2 + 4}" font-family="sans-serif" font-weight="bold" font-size="12" fill="${textColor}" text-anchor="middle">${score}</text>`;
            }
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='target'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='target'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'targetTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});


// ==========================================
// CATÉGORIE : HISTOIRE-GÉOGRAPHIE
// ==========================================

// 14. FRISE HISTORIQUE
registerPlugin('friseTool', 'Histoire-Geographie', {
    currentStamp: null, editingImage: null, state: { start: "1900", blocks: [{color:"#0984e3", end:"1950"}, {color:"#e74c3c", end:"2000"}] },
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'frise'; btn.title = 'Frise Historique';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="3,10 19,10 23,14 19,18 3,18" fill="currentColor" fill-opacity="0.2"/><line x1="8" y1="10" x2="8" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        const builderHTML = `
        <div id="frise-builder-modal" style="display:none; position:absolute; left:calc(50vw - 210px); top:15vh; width:420px; z-index:10001; background:#ffffff; border-radius:10px; box-shadow:0 15px 40px rgba(0,0,0,0.3); border:1px solid #dfe6e9; flex-direction:column;">
            <div id="frise-drag-handle" style="height:30px; background:#1e272e; color:#fff; display:flex; align-items:center; padding:0 12px; cursor:grab; font-weight:bold; font-size:12px;">Constructeur de Frise</div>
            <div style="padding:12px; display:flex; flex-direction:column; gap:8px;">
                <div id="frise-preview" style="width:100%; height:90px; background:#f1f2f6; border:2px dashed #b2bec3; border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label style="font-size:12px; font-weight:bold;">Début :</label>
                    <input type="text" id="frise-start" class="prompt-input" style="width:80px; padding:6px;">
                </div>
                <div id="frise-blocks" style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px;"></div>
                <button class="btn-action secondary" id="frise-btn-add" style="border:1px dashed #b2bec3; background:transparent; color:#2d3436; padding:4px; font-size:12px;">+ Ajouter une période</button>
                <div class="export-actions-grid" style="display:flex; margin-top:2px;"><button class="btn-action secondary" id="frise-btn-cancel" style="flex:1; padding:6px;">Annuler</button><button class="btn-action primary" id="frise-btn-ok" style="flex:1; background:#6c5ce7; padding:6px;">Valider</button></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', builderHTML);
        
        const modal = document.getElementById('frise-builder-modal'); const handle = document.getElementById('frise-drag-handle');
        let isDrag = false, startX, startY;
        handle.addEventListener('mousedown', (e) => { isDrag=true; startX=e.clientX-modal.offsetLeft; startY=e.clientY-modal.offsetTop; });
        window.addEventListener('mousemove', (e) => { if(isDrag) { modal.style.left=(e.clientX-startX)+'px'; modal.style.top=(e.clientY-startY)+'px'; }});
        window.addEventListener('mouseup', () => isDrag=false);

        document.getElementById('frise-start').addEventListener('input', (e) => { this.state.start = e.target.value; this.renderPreview(); });
        document.getElementById('frise-btn-add').addEventListener('click', () => { 
            this.state.blocks.push({ color: ['#0984e3', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'][this.state.blocks.length % 5], end: "Date" });
            this.renderBlocksUI(); 
        });
        document.getElementById('frise-btn-cancel').addEventListener('click', () => { modal.style.display = 'none'; this.editingImage = null; });
        document.getElementById('frise-btn-ok').addEventListener('click', () => {
            modal.style.display = 'none';
            createStampFromSVG(this.generateSVG(true), (stamp) => {
                if (this.editingImage) {
                    this.editingImage.src = stamp.src; this.editingImage.w = stamp.w; this.editingImage.h = stamp.h; this.editingImage.cw = stamp.w; this.editingImage.ch = stamp.h;
                    this.editingImage.pluginData.state = JSON.parse(JSON.stringify(this.state)); this.editingImage = null; draw(); saveState();
                } else { this.currentStamp = stamp; this.currentState = JSON.parse(JSON.stringify(this.state)); showToast("📌 Tamponnez la frise !"); }
            });
        });

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('frise');
            this.editingImage = null; modal.style.display = 'flex'; this.renderBlocksUI(); e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        this.editingImage = imgObj; this.state = JSON.parse(JSON.stringify(imgObj.pluginData.state));
        document.getElementById('frise-builder-modal').style.display = 'flex'; this.renderBlocksUI();
    },
    renderBlocksUI: function() {
        document.getElementById('frise-start').value = this.state.start;
        const container = document.getElementById('frise-blocks'); container.innerHTML = '';
        this.state.blocks.forEach((b, index) => {
            container.innerHTML += `<div style="min-width: 100px; border:1px solid #dfe6e9; padding:6px; border-radius:6px; background:#f8f9fa; display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-size:10px; font-weight:bold;">Période ${index+1}</span><button style="border:none; background:transparent; cursor:pointer; color:#d63031; padding:0;" onclick="pluginFriseRemove(${index})">✕</button></div>
                <div style="display:flex; gap:4px;">
                    <input type="color" value="${b.color}" onchange="pluginFriseUpdate(${index}, 'color', this.value)" style="width:24px; height:24px; border:none; cursor:pointer; padding:0;">
                    <input type="text" value="${b.end}" class="prompt-input" oninput="pluginFriseUpdate(${index}, 'end', this.value)" placeholder="Fin" style="padding:4px; font-size:11px; flex:1;">
                </div>
            </div>`;
        });
        window.pluginFriseRemove = (idx) => { this.state.blocks.splice(idx, 1); this.renderBlocksUI(); };
        window.pluginFriseUpdate = (idx, key, val) => { this.state.blocks[idx][key] = val; this.renderPreview(); };
        this.renderPreview();
    },
    renderPreview: function() { document.getElementById('frise-preview').innerHTML = this.generateSVG(false); },
    generateSVG: function(isExport=false) {
        const w = isExport ? 1000 : 440, h = isExport ? 150 : 100, mX = isExport ? 40 : 15, arrowW = isExport ? 40 : 20, thick = isExport ? 40 : 20, yTop = (h/2) - (thick/2), usableW = w - (mX*2) - arrowW;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        svg += `<polygon points="${mX},${yTop} ${mX+usableW},${yTop} ${mX+usableW},${yTop-10} ${mX+usableW+arrowW},${h/2} ${mX+usableW},${yTop+thick+10} ${mX+usableW},${yTop+thick} ${mX},${yTop+thick}" fill="none" stroke="#2d3436" stroke-width="2" stroke-linejoin="round"/>`;
        if(this.state.blocks.length > 0) {
            const stepPx = usableW / this.state.blocks.length;
            this.state.blocks.forEach((b, i) => {
                const x = mX + (i*stepPx); svg += `<rect x="${x}" y="${yTop}" width="${stepPx}" height="${thick}" fill="${b.color}" fill-opacity="0.4"/>`;
                svg += `<line x1="${x+stepPx}" y1="${yTop}" x2="${x+stepPx}" y2="${yTop+thick+10}" stroke="#2d3436" stroke-width="2"/>`;
                svg += `<text x="${x+stepPx}" y="${yTop+thick+25}" font-family="sans-serif" font-weight="bold" font-size="${isExport?16:11}" fill="#2d3436" text-anchor="middle">${b.end}</text>`;
            });
        }
        svg += `<line x1="${mX}" y1="${yTop}" x2="${mX}" y2="${yTop+thick+10}" stroke="#2d3436" stroke-width="2"/><text x="${mX}" y="${yTop+thick+25}" font-family="sans-serif" font-weight="bold" font-size="${isExport?16:11}" fill="#2d3436" text-anchor="middle">${this.state.start}</text></svg>`;
        return svg;
    },
    onDraw: function(ctx) { if(mode==='frise'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='frise'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'friseTool', state:this.currentState}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});


// ==========================================
// CATÉGORIE : FRANÇAIS
// ==========================================

// 15. NOUVEAU : LIGNES D'ÉCRITURE
registerPlugin('writingLinesTool', 'Francais', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'writingLines'; btn.title = "Lignes d'écriture";
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('writingLines');
            openCustomPrompt("Lignes d'écriture", [
                { type: 'select', label: "Type", value: "seyes", options: [{value:'seyes', label:'Seyès (Grands carreaux)'}, {value:'double', label:'Double ligne'}] },
                { type: 'number', label: "Nombre de blocs", value: "3" },
                { type: 'select', label: "Largeur", value: "1200", options: [{value:'800', label:'Petite (800px)'}, {value:'1200', label:'Page (1200px)'}, {value:'2000', label:'Très longue (2000px)'}] },
                { type: 'color', label: "Couleur", value: "#0984e3" }
            ], (res) => this.generateSVG(res), 
               (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Posez les lignes !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier les lignes", [
            { type: 'select', label: "Type", value: args[0], options: [{value:'seyes', label:'Seyès'}, {value:'double', label:'Double ligne'}] },
            { type: 'number', label: "Nombre de blocs", value: args[1] },
            { type: 'select', label: "Largeur", value: args[2], options: [{value:'800', label:'Petite'}, {value:'1200', label:'Page'}, {value:'2000', label:'Très longue'}] },
            { type: 'color', label: "Couleur", value: args[3] }
        ], (res) => this.generateSVG(res), 
           (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(res, isExport=false) {
        let type = res[0]; let count = parseInt(res[1])||3; let wOption = parseInt(res[2])||1200; let color = res[3]||'#0984e3';
        let hLine = 40; let w = isExport ? wOption : 400; let h = count * hLine + 20;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        for(let i=0; i<count; i++) {
            let y = 10 + i*hLine;
            if(type === 'seyes') {
                svg += `<line x1="0" y1="${y+30}" x2="${w}" y2="${y+30}" stroke="${color}" stroke-width="2"/>`; 
                svg += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${color}" stroke-opacity="0.3" stroke-width="1"/>`;
                svg += `<line x1="0" y1="${y+10}" x2="${w}" y2="${y+10}" stroke="${color}" stroke-opacity="0.3" stroke-width="1"/>`;
                svg += `<line x1="0" y1="${y+20}" x2="${w}" y2="${y+20}" stroke="${color}" stroke-opacity="0.3" stroke-width="1"/>`;
            } else { 
                svg += `<line x1="0" y1="${y+10}" x2="${w}" y2="${y+10}" stroke="${color}" stroke-width="1"/>`;
                svg += `<line x1="0" y1="${y+30}" x2="${w}" y2="${y+30}" stroke="${color}" stroke-width="2"/>`;
            }
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='writingLines'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='writingLines'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'writingLinesTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});


// ==========================================
// CATÉGORIE : PHYSIQUE-CHIMIE
// ==========================================

// 16. NOUVEAU : VERRERIE (Bécher, Erlenmeyer)
// ==========================================
// 16. VERRERIE (Version blindée avec Masque de Découpe)
// ==========================================
registerPlugin('beakerTool', 'Physique-Chimie', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'beaker'; btn.title = 'Verrerie';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 2h6"/><path d="M10 2v5.5L4 18.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-3.5L14 7.5V2"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('beaker');
            openCustomPrompt("Verrerie", [
                { type: 'select', label: "Type", value: "becher", options: [{value:'becher', label:'Bécher'}, {value:'erlen', label:'Erlenmeyer'}, {value:'tube', label:'Tube à essai'}, {value:'ballon', label:'Ballon à fond plat'}] },
                { type: 'number', label: "Niveau Liquide (%)", value: "50" },
                { type: 'select', label: "Graduations", value: "yes", options: [{value:'yes', label:'Oui'}, {value:'no', label:'Non'}] },
                { type: 'color', label: "Couleur Liquide", value: "#0984e3" }
            ], (res) => this.generateSVG(res), 
               (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Posez la verrerie !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier la Verrerie", [
            { type: 'select', label: "Type", value: args[0], options: [{value:'becher', label:'Bécher'}, {value:'erlen', label:'Erlenmeyer'}, {value:'tube', label:'Tube à essai'}, {value:'ballon', label:'Ballon'}] },
            { type: 'number', label: "Niveau (%)", value: args[1] },
            { type: 'select', label: "Graduations", value: args[2], options: [{value:'yes', label:'Oui'}, {value:'no', label:'Non'}] },
            { type: 'color', label: "Couleur", value: args[3] }
        ], (res) => this.generateSVG(res), 
           (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(res, isExport=false) {
        let type = res[0]; let lvl = parseInt(res[1])||50; let grads = res[2]==='yes'; let color = res[3]||'#0984e3';
        if(lvl < 0) lvl = 0; if(lvl > 100) lvl = 100;
        let s = isExport ? 200 : 100; let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${isExport?s:'100%'}" height="${isExport?s:'100%'}">`;
        let basY = s*0.9;
        
        // Définition des masques internes exacts pour bloquer les débordements
        svg += `<defs>`;
        svg += `<clipPath id="clip-becher"><path d="M ${s*0.2} ${s*0.1} L ${s*0.2} ${basY} L ${s*0.8} ${basY} L ${s*0.8} ${s*0.1} Z"/></clipPath>`;
        svg += `<clipPath id="clip-erlen"><path d="M ${s*0.4} ${s*0.1} L ${s*0.4} ${s*0.3} L ${s*0.15} ${basY} L ${s*0.85} ${basY} L ${s*0.6} ${s*0.3} L ${s*0.6} ${s*0.1} Z"/></clipPath>`;
        svg += `<clipPath id="clip-tube"><path d="M ${s*0.4} ${s*0.1} L ${s*0.4} ${basY-s*0.1} A ${s*0.1} ${s*0.1} 0 0 0 ${s*0.6} ${basY-s*0.1} L ${s*0.6} ${s*0.1} Z"/></clipPath>`;
        svg += `<clipPath id="clip-ballon"><path d="M ${s*0.4} ${s*0.1} L ${s*0.4} ${s*0.4} A ${s*0.3} ${s*0.3} 0 1 0 ${s*0.6} ${s*0.4} L ${s*0.6} ${s*0.1} Z"/></clipPath>`;
        svg += `</defs>`;

        const drawGrads = (startX, w, startY, h) => {
            if(!grads) return ""; let g = ""; const step = h/5;
            for(let i=1; i<5; i++) g += `<line x1="${startX}" y1="${startY+i*step}" x2="${startX+w}" y2="${startY+i*step}" stroke="#2d3436" stroke-width="2"/>`;
            return g;
        };

        if(type === 'becher') {
            let liquidH = (lvl/100) * (s*0.8);
            if(lvl > 0) svg += `<rect x="0" y="${basY-liquidH}" width="${s}" height="${liquidH}" fill="${color}" fill-opacity="0.6" clip-path="url(#clip-becher)"/>`;
            svg += `<path d="M ${s*0.15} ${s*0.1} L ${s*0.2} ${s*0.1} L ${s*0.2} ${basY} L ${s*0.8} ${basY} L ${s*0.8} ${s*0.1} L ${s*0.85} ${s*0.1}" fill="none" stroke="#2d3436" stroke-width="4" stroke-linejoin="round"/>`;
            svg += drawGrads(s*0.2, s*0.1, s*0.1, s*0.8);
        } else if(type === 'erlen') {
            let liquidH = (lvl/100) * (s*0.7);
            if(lvl > 0) svg += `<rect x="0" y="${basY-liquidH}" width="${s}" height="${liquidH}" fill="${color}" fill-opacity="0.6" clip-path="url(#clip-erlen)"/>`;
            svg += `<path d="M ${s*0.35} ${s*0.1} L ${s*0.4} ${s*0.1} L ${s*0.4} ${s*0.3} L ${s*0.15} ${basY} L ${s*0.85} ${basY} L ${s*0.6} ${s*0.3} L ${s*0.6} ${s*0.1} L ${s*0.65} ${s*0.1}" fill="none" stroke="#2d3436" stroke-width="4" stroke-linejoin="round"/>`;
        } else if(type === 'tube') {
            let liquidH = (lvl/100) * (s*0.8);
            if(lvl > 0) svg += `<rect x="0" y="${basY-liquidH}" width="${s}" height="${liquidH+s*0.2}" fill="${color}" fill-opacity="0.6" clip-path="url(#clip-tube)"/>`;
            svg += `<path d="M ${s*0.35} ${s*0.1} L ${s*0.4} ${s*0.1} L ${s*0.4} ${basY-s*0.1} A ${s*0.1} ${s*0.1} 0 0 0 ${s*0.6} ${basY-s*0.1} L ${s*0.6} ${s*0.1} L ${s*0.65} ${s*0.1}" fill="none" stroke="#2d3436" stroke-width="4"/>`;
            svg += drawGrads(s*0.4, s*0.05, s*0.1, s*0.7);
        } else if(type === 'ballon') {
            let liquidH = (lvl/100) * (s*0.7);
            if(lvl > 0) svg += `<rect x="0" y="${basY-liquidH}" width="${s}" height="${liquidH+s*0.2}" fill="${color}" fill-opacity="0.6" clip-path="url(#clip-ballon)"/>`;
            svg += `<path d="M ${s*0.4} ${s*0.1} L ${s*0.4} ${s*0.4} A ${s*0.3} ${s*0.3} 0 1 0 ${s*0.6} ${s*0.4} L ${s*0.6} ${s*0.1}" fill="none" stroke="#2d3436" stroke-width="4"/>`;
            svg += `<line x1="${s*0.35}" y1="${basY}" x2="${s*0.65}" y2="${basY}" stroke="#2d3436" stroke-width="4"/>`;
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='beaker'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='beaker'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'beakerTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});


// ==========================================
// CATÉGORIE : MUSIQUE
// ==========================================

// 17. NOUVEAU : PORTÉE MUSICALE (Tablatures + Largeur)
// ==========================================
// 17. PORTÉE MUSICALE (Tablatures + Largeur)
// ==========================================
registerPlugin('musicStaffTool', 'Musique', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'musicStaff'; btn.title = 'Portée Musicale';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('musicStaff');
            openCustomPrompt("Portée Musicale", [
                { type: 'select', label: "Type", value: "sol", options: [
                    {value:'sol', label:'Clé de Sol'}, 
                    {value:'fa', label:'Clé de Fa'}, 
                    {value:'tab6', label:'Tab. Guitare (6)'}, 
                    {value:'tab7', label:'Tab. Guitare (7)'}, 
                    {value:'tab4', label:'Tab. Basse (4)'}, 
                    {value:'tab5', label:'Tab. Basse (5)'}, 
                    {value:'none', label:'Simple (5 lignes)'}
                ] },
                { type: 'select', label: "Largeur", value: "1200", options: [{value:'800', label:'Petite (800px)'}, {value:'1200', label:'Page (1200px)'}, {value:'2000', label:'Très longue (2000px)'}] },
                { type: 'color', label: "Couleur", value: "#2d3436" }
            ], (res) => this.generateSVG(res), 
               (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Posez la portée !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier la Portée", [
            { type: 'select', label: "Type", value: args[0], options: [
                {value:'sol', label:'Clé de Sol'}, 
                {value:'fa', label:'Clé de Fa'}, 
                {value:'tab6', label:'Tab. Guitare (6)'}, 
                {value:'tab7', label:'Tab. Guitare (7)'}, 
                {value:'tab4', label:'Tab. Basse (4)'}, 
                {value:'tab5', label:'Tab. Basse (5)'}, 
                {value:'none', label:'Simple (5 lignes)'}
            ] },
            { type: 'select', label: "Largeur", value: args[1], options: [{value:'800', label:'Petite'}, {value:'1200', label:'Page'}, {value:'2000', label:'Très longue'}] },
            { type: 'color', label: "Couleur", value: args[2] }
        ], (res) => this.generateSVG(res), 
           (res) => { createStampFromSVG(this.generateSVG(res, true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(res, isExport=false) {
        let type = res[0]; let wOption = parseInt(res[1])||1200; let color = res[2]||'#2d3436';
        let w = isExport ? wOption : 400; let h = isExport ? 150 : 75;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        let space = isExport ? 20 : 10;
        
        let linesCount = 5;
        // Détecte automatiquement le nombre de cordes (4, 5, 6 ou 7)
        if (type.startsWith('tab')) linesCount = parseInt(type.replace('tab', ''));
        
        let startY = isExport ? 30 : 15;
        let staffHeight = (linesCount - 1) * space;
        
        for(let i=0; i<linesCount; i++) { 
            svg += `<line x1="0" y1="${startY + i*space}" x2="${w}" y2="${startY + i*space}" stroke="${color}" stroke-width="2"/>`; 
        }
        
        if (type === 'sol') {
            svg += `<text x="${isExport?20:10}" y="${startY + space*3 + (isExport?15:8)}" font-size="${h*0.8}" font-family="serif" fill="${color}">𝄞</text>`;
        } else if (type === 'fa') {
            svg += `<text x="${isExport?20:10}" y="${startY + space*2 + (isExport?10:5)}" font-size="${h*0.7}" font-family="serif" fill="${color}">𝄢</text>`;
        } else if (type.startsWith('tab')) {
            // NOUVEAU : Centrage dynamique selon la hauteur réelle de la portée !
            let cx = isExport ? 25 : 12.5;
            let cy = startY + staffHeight / 2;
            let delta = staffHeight / 3.2; // Espacement vertical des lettres ajusté au nombre de cordes
            let fontSize = isExport ? 26 : 13;
            let textStyles = `font-size="${fontSize}" font-family="sans-serif" font-weight="bold" fill="${color}" text-anchor="middle" dominant-baseline="central"`;
            
            svg += `<text x="${cx}" y="${cy - delta}" ${textStyles}>T</text>`;
            svg += `<text x="${cx}" y="${cy}" ${textStyles}>A</text>`;
            svg += `<text x="${cx}" y="${cy + delta}" ${textStyles}>B</text>`;
            svg += `<line x1="${isExport?50:25}" y1="${startY}" x2="${isExport?50:25}" y2="${startY + staffHeight}" stroke="${color}" stroke-width="2"/>`; // Barre verticale
        }
        return svg + `</svg>`;
    },
    onDraw: function(ctx) { if(mode==='musicStaff'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='musicStaff'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'musicStaffTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});


// ==========================================
// 19. CARTES GÉOGRAPHIQUES (Version de Débogage Ultime)
// ==========================================
// ==========================================
// 19. CARTES GÉOGRAPHIQUES (Version Infaillible)
// ==========================================
// ==========================================
// 19. CARTES GÉOGRAPHIQUES (Intégration Native Parfaite)
// ==========================================
registerPlugin('mapTool', 'Histoire-Geographie', {
    currentStamp: null, currentArgs: null,
    
    // Le constructeur parfait de SVG
    fetchMap: function(code, color, callback) {
        fetch(`https://raw.githubusercontent.com/djaiss/mapsicon/master/all/${code}/vector.svg`)
            .then(r => { if(!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
            .then(svgText => {
                let svgMatch = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
                let innerContent = svgMatch ? svgMatch[1] : "";
                let viewBoxMatch = svgText.match(/viewBox="([^"]+)"/i);
                let viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 1024 1024";
                
                // Nettoyage et coloration
                innerContent = innerContent.replace(/fill="[^"]*"/ig, "");
                innerContent = innerContent.replace(/stroke="[^"]*"/ig, "");
                
                let cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="${viewBox}">
                    <g fill="${color}" stroke="#2d3436" stroke-width="10">
                        ${innerContent}
                    </g>
                </svg>`;
                callback(cleanSvg);
            }).catch(err => {
              //  console.error("[MAP] Erreur réseau:", err);
                callback(null);
            });
    },

    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'map'; btn.title = 'Cartes Géographiques';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        // TOUCHE ECHAP POUR ANNULER
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mode === 'map') {
                this.currentStamp = null;
                setMode('pointer');
                showToast("Tampon annulé");
                draw();
            }
        });

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); 
            
            openCustomPrompt("Cartes du Monde", [
                { type: 'select', label: "Pays", value: "fr", options: [
                    {value:'fr', label:'France'}, {value:'gb', label:'Royaume-Uni'}, {value:'de', label:'Allemagne'},
                    {value:'es', label:'Espagne'}, {value:'it', label:'Italie'}, {value:'us', label:'États-Unis'},
                    {value:'cn', label:'Chine'}, {value:'jp', label:'Japon'}, {value:'br', label:'Brésil'},
                    {value:'za', label:'Afrique du Sud'}, {value:'au', label:'Australie'}
                ] },
                { type: 'color', label: "Couleur", value: "#0984e3" }
            ], 
            (res) => { // Prévisualisation
                const previewBox = document.getElementById('custom-prompt-preview');
                if(previewBox) previewBox.innerHTML = '<div style="text-align:center; padding:20px;">Chargement...</div>';
                this.fetchMap(res[0], res[1], (svg) => {
                    if(svg && previewBox) previewBox.innerHTML = svg.replace(/width="400" height="400"/, 'width="100%" height="100%"');
                });
                return ""; 
            },
            (res) => { // Validation
                showToast("⏳ Chargement de la carte...");
                this.fetchMap(res[0], res[1], (svg) => {
                    if(svg) {
                        const img = new Image();
                        img.onload = () => {
                            this.currentStamp = { img: img, src: img.src, w: 400, h: 400 }; 
                            this.currentArgs = res; 
                            setMode('map'); 
                            showToast("📌 Tampon prêt ! (Échap pour annuler)"); 
                            draw(); // Force le premier affichage
                        };
                        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
                    } else showToast("❌ Erreur de réseau");
                });
            });
            e.stopPropagation();
        });
    },

    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier la Carte", [
            { type: 'select', label: "Pays", value: args[0], options: [{value:'fr', label:'France'}, {value:'gb', label:'UK'}, {value:'de', label:'Allemagne'}, {value:'es', label:'Espagne'}] },
            { type: 'color', label: "Couleur", value: args[1] }
        ], 
        (res) => {
            const previewBox = document.getElementById('custom-prompt-preview');
            this.fetchMap(res[0], res[1], (svg) => {
                if(svg && previewBox) previewBox.innerHTML = svg.replace(/width="400" height="400"/, 'width="100%" height="100%"');
            });
            return "Chargement...";
        }, 
        (res) => { 
            this.fetchMap(res[0], res[1], (svg) => {
                if(svg) {
                    const img = new Image();
                    img.onload = () => {
                        imgObj.src = img.src; imgObj.w = 400; imgObj.h = 400; imgObj.cw = 400; imgObj.ch = 400; imgObj.pluginData.args = res; 
                        draw(); saveState();
                    };
                    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
                }
            });
        });
    },

    // LA CLÉ EST LÀ : on force le rafraîchissement au mouvement de la souris
    onPointerMove: function(rawPos, e) {
        if (mode === 'map' && this.currentStamp) {
            // Mémorisation de la position pour le fantôme
            mouseLogicalPos = { x: rawPos.x, y: rawPos.y };
            draw(); // Réveille le tableau !
            return false; // On renvoie false pour ne pas bloquer le reste des écouteurs
        }
        return false;
    },

    onDraw: function(ctx) { 
        if (mode === 'map' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha = 0.5; 
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - 200, mouseLogicalPos.y - 200, 400, 400); 
            ctx.globalAlpha = 1.0; 
        } 
    },
    
onPointerDown: function(rawPos) { 
   // console.log("[DEBUG] Clic détecté. Mode actuel :", mode);
    
    // On vérifie si on est bien dans le mode du plugin et qu'on a un tampon
    if (this.currentStamp) { 
     //   console.log("[DEBUG] Tampon trouvé, tentative de pose...");

        // 1. Mise en cache forcée (La clé du problème)
        if (typeof imageCache !== 'undefined') {
            imageCache[this.currentStamp.src] = this.currentStamp.img;
       //     console.log("[DEBUG] Image injectée dans imageCache");
        }
        
        // 2. Enregistrement
        images.push({ 
            id: nextId++, 
            x: rawPos.x - this.currentStamp.w/2, 
            y: rawPos.y - this.currentStamp.h/2, 
            w: this.currentStamp.w, h: this.currentStamp.h, 
            cx: 0, cy: 0, 
            cw: this.currentStamp.w, ch: this.currentStamp.h, 
            src: this.currentStamp.src, 
            z: globalZ++, 
            pluginData: {id: 'probatree', args: this.currentTreeData} // ou 'trafficLightTool'
        }); 
        
        // 3. Nettoyage et mise à jour
        this.currentStamp = null;
        saveState(); 
        setMode('pointer'); 
        
        // 4. Force le redessin
        draw(); 
    //    console.log("[DEBUG] Tampon posé avec succès.");
        return true; 
    } 
  //  console.log("[DEBUG] Aucun tampon actif, clic ignoré par le plugin.");
    return false; 
}
});

// ==========================================
// 1. FEU TRICOLORE (Design Moderne / Néon)
// ==========================================
registerPlugin('trafficLightTool', 'Francais', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'traffic'; btn.title = 'Feu Tricolore';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="4" ry="4"/><circle cx="12" cy="7" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="17" r="2.5"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);
        
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('traffic');
            openCustomPrompt("Feu de Comportement", [
                { type: 'select', label: "Allumer le feu", value: "green", options: [
                    {value:'red', label:'🔴 Rouge (Stop / Silence)'}, 
                    {value:'orange', label:'🟠 Orange (Chuchotement)'}, 
                    {value:'green', label:'🟢 Vert (Autorisé)'},
                    {value:'off', label:'⚫ Éteint'}
                ]},
                { type: 'select', label: "Style", value: "neon", options: [{value:'neon', label:'Moderne (Brillant)'}, {value:'classic', label:'Classique'}] }
            ], 
            (res) => this.genSVG(res), 
            (res) => { 
                this.createImage(this.genSVG(res, true), (s) => { 
                    this.currentStamp = s; this.currentArgs = res; showToast("Feu prêt ! (Échap pour annuler)"); draw(); 
                }); 
            });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        openCustomPrompt("Modifier le Feu", [
            { type: 'select', label: "Statut", value: imgObj.pluginData.args[0], options: [{value:'red', label:'🔴 Rouge'}, {value:'orange', label:'🟠 Orange'}, {value:'green', label:'🟢 Vert'}, {value:'off', label:'⚫ Éteint'}] },
            { type: 'select', label: "Style", value: imgObj.pluginData.args[1], options: [{value:'neon', label:'Moderne (Brillant)'}, {value:'classic', label:'Classique'}] }
        ], 
        (res) => this.genSVG(res), 
        (res) => { 
            this.createImage(this.genSVG(res, true), (s) => { 
                imgObj.src = s.src; imgObj.pluginData.args = res; draw(); saveState(); 
            }); 
        });
    },
    genSVG: function(res, isExp=false) {
        let status = res[0]; let style = res[1];
        let w = isExp ? 120 : 60; let h = isExp ? 320 : 160;
        
        let cRed = status === 'red' ? '#ff4757' : '#2f3542';
        let cOrg = status === 'orange' ? '#ffa502' : '#2f3542';
        let cGrn = status === 'green' ? '#2ed573' : '#2f3542';
        
        let glowR = (status === 'red' && style === 'neon') ? `filter="drop-shadow(0px 0px 15px ${cRed})"` : '';
        let glowO = (status === 'orange' && style === 'neon') ? `filter="drop-shadow(0px 0px 15px ${cOrg})"` : '';
        let glowG = (status === 'green' && style === 'neon') ? `filter="drop-shadow(0px 0px 15px ${cGrn})"` : '';

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 320" width="${isExp?w:'100%'}" height="${isExp?h:'100%'}">
            <rect x="10" y="10" width="100" height="300" rx="20" fill="#1e272e" stroke="#57606f" stroke-width="4"/>
            <circle cx="60" cy="65" r="35" fill="${cRed}" ${glowR}/>
            <circle cx="60" cy="160" r="35" fill="${cOrg}" ${glowO}/>
            <circle cx="60" cy="255" r="35" fill="${cGrn}" ${glowG}/>
        </svg>`;
    },
    createImage: function(svg, callback) {
        let base64 = btoa(unescape(encodeURIComponent(svg)));
        const img = new Image();
        img.onload = () => callback({ img: img, src: img.src, w: img.width, h: img.height });
        img.src = "data:image/svg+xml;base64," + base64;
    },
    onPointerMove: function(rawPos) {
        if (mode === 'traffic' && this.currentStamp) { mouseLogicalPos = { x: rawPos.x, y: rawPos.y }; if(typeof draw==='function') draw(); return false; } return false;
    },
    onDraw: function(ctx) { 
        if (mode === 'traffic' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha = 0.8; 
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2, this.currentStamp.w, this.currentStamp.h); 
            ctx.globalAlpha = 1.0; 
        } 
    },
    onPointerDown: function(rawPos) { 
        if (mode === 'traffic' && this.currentStamp) { 
            images.push({ id: nextId++, x: rawPos.x - this.currentStamp.w/2, y: rawPos.y - this.currentStamp.h/2, w: this.currentStamp.w, h: this.currentStamp.h, cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, src: this.currentStamp.src, z: globalZ++, pluginData: {id:'trafficLightTool', args:this.currentArgs} }); 
            saveState(); setMode('pointer'); this.currentStamp = null; draw(); return true; 
        } return false; 
    }
});


// ==========================================
// 2. ARBRE STUDIO (Fractions Vraies + Bug Cache Corrigé)
// ==========================================
registerPlugin('probabilityTreeTool', 'Mathematiques', {
    currentStamp: null, currentTreeData: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'probatree'; btn.title = 'Arbre Studio';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22v-5M5 12H2v-5h3zM22 12h-3v-5h3zM12 17c-3.8 0-7-3.2-7-7V7h14v3c0 3.8-3.2 7-7 7z"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);
        
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('probatree');
            this.openStudio(null, (stamp, treeData) => {
                this.currentStamp = stamp; this.currentTreeData = treeData; 
                showToast("Arbre généré ! (Échap pour annuler)"); draw();
            });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        this.openStudio(imgObj.pluginData.args, (stamp, treeData) => {
            // CORRECTION CACHE ICI AUSSI
            if(typeof imageCache !== 'undefined') imageCache[stamp.src] = stamp.img;
            
            imgObj.src = stamp.src; imgObj.w = stamp.w; imgObj.h = stamp.h;
            imgObj.cw = stamp.w; imgObj.ch = stamp.h; imgObj.pluginData.args = treeData;
            draw(); saveState();
        });
    },

    openStudio: function(initialData, onValidate) {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;justify-content:center;align-items:center;";
        
        const box = document.createElement('div');
        box.style.cssText = "width:90%;height:85%;background:#fff;border-radius:12px;display:flex;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.4); font-family:sans-serif;";
        
        box.innerHTML = `
            <div style="width:300px; background:#f8f9fa; border-right:1px solid #dfe6e9; padding:20px; display:flex; flex-direction:column; gap:15px;">
                <h3 style="margin:0; color:#2d3436; font-size:18px;">🌳 Arbre Studio</h3>
                <div id="tree-sel-none" style="color:#636e72; font-size:13px; margin-top:20px; text-align:center; padding: 20px; border: 2px dashed #b2bec3; border-radius: 8px;">
                    Cliquez sur un nœud de l'arbre pour le modifier.
                </div>
                
                <div id="tree-sel-panel" style="display:none; flex-direction:column; gap:12px;">
                    <div>
                        <label style="font-size:12px; font-weight:bold; color:#636e72;">Nom de l'événement</label>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="tree-inp-name" style="flex:1; padding:8px; border:1px solid #b2bec3; border-radius:4px; font-size:14px;">
                            <button id="tree-btn-bar" style="padding:8px 12px; border:1px solid #b2bec3; background:#fff; border-radius:4px; cursor:pointer; font-weight:bold;" title="Événement contraire">A̅</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:bold; color:#636e72;">Probabilité (ex: 1/3, p)</label>
                        <input type="text" id="tree-inp-prob" placeholder="Utilisez / pour une vraie fraction" style="width:100%; padding:8px; border:1px solid #b2bec3; border-radius:4px; box-sizing:border-box; font-size:14px;">
                    </div>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button id="tree-btn-add" style="flex:1; padding:10px; background:#00b894; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">+ Enfant</button>
                        <button id="tree-btn-del" style="flex:1; padding:10px; background:#d63031; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Supprimer</button>
                    </div>
                </div>
                
                <div style="flex:1"></div>
                <button id="tree-btn-valid" style="padding:14px; background:#0984e3; color:white; border:none; border-radius:6px; font-size:16px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 6px rgba(9, 132, 227, 0.3);">✅ Terminer l'Arbre</button>
                <button id="tree-btn-cancel" style="padding:10px; background:transparent; color:#636e72; border:1px solid #b2bec3; border-radius:6px; font-size:14px; cursor:pointer;">Annuler</button>
            </div>
            <div style="flex:1; background:#ffffff; position:relative; overflow:hidden;" id="tree-canvas-container">
                <svg id="tree-svg-workspace" width="100%" height="100%"><g id="tree-svg-group" transform="translate(50, 50)"></g></svg>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        let tree = initialData ? JSON.parse(JSON.stringify(initialData)) : {
            id: 1, name: 'Départ', prob: '', bar: false, children: [
                { id: 2, name: 'S', prob: '1/4', bar: false, children: [] },
                { id: 3, name: 'S', prob: '3/4', bar: true, children: [] }
            ]
        };
        
        let nextNodeId = 100;
        function updateNextId(n) { if(n.id >= nextNodeId) nextNodeId = n.id + 1; n.children.forEach(updateNextId); }
        updateNextId(tree);

        let selectedId = null;

        const selNone = document.getElementById('tree-sel-none');
        const selPanel = document.getElementById('tree-sel-panel');
        const inpName = document.getElementById('tree-inp-name');
        const inpProb = document.getElementById('tree-inp-prob');
        const btnBar = document.getElementById('tree-btn-bar');
        const btnAdd = document.getElementById('tree-btn-add');
        const btnDel = document.getElementById('tree-btn-del');
        const svgGroup = document.getElementById('tree-svg-group');
        const svgWorkspace = document.getElementById('tree-svg-workspace');

        function findNode(n, id) { if (n.id === id) return n; for (let c of n.children) { let res = findNode(c, id); if (res) return res; } return null; }
        function deleteNode(n, id) { let idx = n.children.findIndex(c => c.id === id); if (idx > -1) { n.children.splice(idx, 1); return true; } for (let c of n.children) { if (deleteNode(c, id)) return true; } return false; }

        function updateUI() {
            if (!selectedId) { selNone.style.display = 'block'; selPanel.style.display = 'none'; return; }
            const node = findNode(tree, selectedId);
            if (!node) return;
            selNone.style.display = 'none'; selPanel.style.display = 'flex';
            inpName.value = node.name;
            inpProb.value = node.prob;
            btnBar.style.background = node.bar ? '#dfe6e9' : '#fff';
            btnDel.style.display = (node.id === 1) ? 'none' : 'block';
            inpName.disabled = (node.id === 1);
            inpProb.disabled = (node.id === 1);
            btnBar.disabled = (node.id === 1);
        }

        inpName.oninput = () => { let n = findNode(tree, selectedId); if(n) { n.name = inpName.value; render(); } };
        inpProb.oninput = () => { let n = findNode(tree, selectedId); if(n) { n.prob = inpProb.value; render(); } };
        btnBar.onclick = () => { let n = findNode(tree, selectedId); if(n) { n.bar = !n.bar; updateUI(); render(); } };
        btnAdd.onclick = () => { let n = findNode(tree, selectedId); if(n) { n.children.push({id: nextNodeId++, name:'A', prob:'p', bar:false, children:[]}); render(); } };
        btnDel.onclick = () => { if(selectedId !== 1) { deleteNode(tree, selectedId); selectedId = null; updateUI(); render(); } };

        function layout(n, depth, counter) {
            if (!n.children || n.children.length === 0) {
                n.x = depth * 220; n.y = counter.val * 100; counter.val++;
            } else {
                n.children.forEach(c => layout(c, depth+1, counter));
                n.x = depth * 220; n.y = (n.children[0].y + n.children[n.children.length-1].y) / 2;
            }
        }

        function render() {
            let counter = { val: 0 };
            layout(tree, 0, counter);
            svgGroup.innerHTML = '';
            
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            function getBounds(n) { if(n.x<minX) minX=n.x; if(n.x>maxX) maxX=n.x; if(n.y<minY) minY=n.y; if(n.y>maxY) maxY=n.y; n.children.forEach(getBounds); }
            getBounds(tree);
            const wBox = svgWorkspace.clientWidth; const hBox = svgWorkspace.clientHeight;
            const offsetX = (wBox - (maxX - minX))/2 - minX;
            const offsetY = (hBox - (maxY - minY))/2 - minY;
            svgGroup.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

            function drawLinks(n) {
                n.children.forEach(c => {
                    const midX = (n.x + c.x)/2; const midY = (n.y + c.y)/2;
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute('d', `M ${n.x} ${n.y} C ${midX} ${n.y}, ${midX} ${c.y}, ${c.x} ${c.y}`);
                    path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#2d3436'); path.setAttribute('stroke-width', '3');
                    svgGroup.appendChild(path);

                    if (c.prob) {
                        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        
                        // 🌟 LOGIQUE DES VRAIES FRACTIONS 🌟
                        if (c.prob.includes('/')) {
                            const parts = c.prob.split('/');
                            const num = parts[0]; const den = parts[1];
                            const w = Math.max(num.length, den.length) * 10 + 16;
                            const h = 40;
                            
                            bg.setAttribute('x', midX - w/2); bg.setAttribute('y', midY - h/2);
                            bg.setAttribute('width', w); bg.setAttribute('height', h);
                            bg.setAttribute('fill', '#ffffff'); bg.setAttribute('rx', '6');
                            svgGroup.appendChild(bg);
                            
                            // Numérateur
                            const tNum = document.createElementNS("http://www.w3.org/2000/svg", "text");
                            tNum.setAttribute('x', midX); tNum.setAttribute('y', midY - 8);
                            tNum.setAttribute('text-anchor', 'middle'); tNum.setAttribute('font-family', 'sans-serif'); tNum.setAttribute('font-size', '14px'); tNum.setAttribute('fill', '#0984e3');
                            tNum.textContent = num;
                            svgGroup.appendChild(tNum);
                            
                            // Trait de fraction
                            const bar = document.createElementNS("http://www.w3.org/2000/svg", "line");
                            bar.setAttribute('x1', midX - w/2 + 6); bar.setAttribute('y1', midY); 
                            bar.setAttribute('x2', midX + w/2 - 6); bar.setAttribute('y2', midY);
                            bar.setAttribute('stroke', '#0984e3'); bar.setAttribute('stroke-width', '2');
                            svgGroup.appendChild(bar);
                            
                            // Dénominateur
                            const tDen = document.createElementNS("http://www.w3.org/2000/svg", "text");
                            tDen.setAttribute('x', midX); tDen.setAttribute('y', midY + 14);
                            tDen.setAttribute('text-anchor', 'middle'); tDen.setAttribute('font-family', 'sans-serif'); tDen.setAttribute('font-size', '14px'); tDen.setAttribute('fill', '#0984e3');
                            tDen.textContent = den;
                            svgGroup.appendChild(tDen);
                            
                        } else {
                            // Affichage normal si ce n'est pas une fraction
                            const w = c.prob.length * 10 + 16;
                            bg.setAttribute('x', midX - w/2); bg.setAttribute('y', midY - 14);
                            bg.setAttribute('width', w); bg.setAttribute('height', 28);
                            bg.setAttribute('fill', '#ffffff'); bg.setAttribute('rx', '6');
                            svgGroup.appendChild(bg);
                            
                            const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
                            txt.setAttribute('x', midX); txt.setAttribute('y', midY);
                            txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
                            txt.setAttribute('font-family', 'sans-serif'); txt.setAttribute('font-size', '16px'); txt.setAttribute('fill', '#0984e3');
                            txt.textContent = c.prob;
                            svgGroup.appendChild(txt);
                        }
                    }
                    drawLinks(c);
                });
            }
            function drawNodes(n) {
                const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                g.style.cursor = 'pointer';
                g.onclick = (e) => { e.stopPropagation(); selectedId = n.id; updateUI(); render(); };
                
                if (selectedId === n.id) {
                    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    halo.setAttribute('cx', n.x); halo.setAttribute('cy', n.y); halo.setAttribute('r', '24');
                    halo.setAttribute('fill', 'none'); halo.setAttribute('stroke', '#0984e3'); halo.setAttribute('stroke-width', '2'); halo.setAttribute('stroke-dasharray', '4,2');
                    g.appendChild(halo);
                }

                const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                c.setAttribute('cx', n.x); c.setAttribute('cy', n.y); c.setAttribute('r', n.id===1?'6':'18');
                c.setAttribute('fill', n.id===1?'#2d3436':'#ffffff');
                if(n.id!==1) { c.setAttribute('stroke', '#2d3436'); c.setAttribute('stroke-width', '3'); }
                g.appendChild(c);

                if (n.id !== 1) {
                    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    t.setAttribute('x', n.x); t.setAttribute('y', n.y);
                    t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
                    t.setAttribute('font-family', 'sans-serif'); t.setAttribute('font-size', '18px'); t.setAttribute('font-weight', 'bold'); t.setAttribute('fill', '#2d3436');
                    if(n.bar) t.setAttribute('text-decoration', 'overline');
                    t.textContent = n.name;
                    g.appendChild(t);
                }
                svgGroup.appendChild(g);
                n.children.forEach(drawNodes);
            }
            drawLinks(tree); drawNodes(tree);
        }

        svgWorkspace.onclick = () => { selectedId = null; updateUI(); render(); };
        
        document.getElementById('tree-btn-cancel').onclick = () => document.body.removeChild(overlay);
        document.getElementById('tree-btn-valid').onclick = () => {
            selectedId = null; render();
            
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            function getBounds(n) { if(n.x<minX) minX=n.x; if(n.x>maxX) maxX=n.x; if(n.y<minY) minY=n.y; if(n.y>maxY) maxY=n.y; n.children.forEach(getBounds); }
            getBounds(tree);
            
            const padding = 40;
            const finalW = maxX - minX + padding*2;
            const finalH = maxY - minY + padding*2;
            
            let exportSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX-padding} ${minY-padding} ${finalW} ${finalH}" width="${finalW}" height="${finalH}">`;
            exportSvg += svgGroup.innerHTML;
            exportSvg += `</svg>`;
            
            document.body.removeChild(overlay);
            
            let base64 = btoa(unescape(encodeURIComponent(exportSvg)));
            const img = new Image();
            img.onload = () => onValidate({ img: img, src: img.src, w: finalW, h: finalH }, tree);
            img.src = "data:image/svg+xml;base64," + base64;
        };

        updateUI();
        setTimeout(render, 50);
    },
    
    onPointerMove: function(rawPos) {
        if (mode === 'probatree' && this.currentStamp) { mouseLogicalPos = { x: rawPos.x, y: rawPos.y }; if(typeof draw==='function') draw(); return false; } return false;
    },
    onDraw: function(ctx) { 
        if (mode === 'probatree' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha = 0.8; 
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2, this.currentStamp.w, this.currentStamp.h); 
            ctx.globalAlpha = 1.0; 
        } 
    },
    onPointerDown: function(rawPos) { 
        if (mode === 'probatree' && this.currentStamp) { 
            // 🌟 LE FIX DU BUG EST ICI 🌟 : On donne l'image en direct au système de cache du script principal
            if (typeof imageCache !== 'undefined') {
                imageCache[this.currentStamp.src] = this.currentStamp.img;
            }
            
            images.push({ id: nextId++, x: rawPos.x - this.currentStamp.w/2, y: rawPos.y - this.currentStamp.h/2, w: this.currentStamp.w, h: this.currentStamp.h, cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, src: this.currentStamp.src, z: globalZ++, pluginData: {id:'probabilityTreeTool', args:this.currentTreeData} }); 
            saveState(); setMode('pointer'); this.currentStamp = null; draw(); return true; 
        } 
        return false; 
    }
});

// ==========================================
// ÉCOUTEUR GLOBAL : DOUBLE CLIC POUR ÉDITER
// ==========================================
canvas.addEventListener('dblclick', (e) => {
    if (typeof selectedItems !== 'undefined' && selectedItems.length === 1 && selectedItems[0].type === 'image') {
        const imgObj = getObjectById('image', selectedItems[0].id);
        if (imgObj && imgObj.pluginData && imgObj.pluginData.id) {
            const plugin = PluginManager.plugins[imgObj.pluginData.id];
            if (plugin && plugin.edit) { plugin.edit(imgObj); e.preventDefault(); e.stopPropagation(); }
        }
    }
});
