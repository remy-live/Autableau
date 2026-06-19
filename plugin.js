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

const categoryIcons = {
    // ---------------------------------------------------------
    // MATIÈRES (Design ultra-lisible et explicite)
    // ---------------------------------------------------------
    
    'Mathematiques': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h6" />
        <path d="M7 4v6" />
        <path d="M4 17h6" />
        <path d="M14 4l6 6" />
        <path d="M20 4l-6 6" />
        <path d="M14 15h6" />
        <path d="M14 19h6" />
    </svg>`,
    
    'Histoire-Geographie': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        <path d="M2 12h20"/>
    </svg>`,
    
    'Francais': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>`,
    
    'Physique-Chimie': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 3h6"/>
        <path d="M10 3v3.5L4.6 16.6A2 2 0 0 0 6.3 20h11.4a2 2 0 0 0 1.7-3.4L14 6.5V3"/>
        <path d="M6 14h12"/>
    </svg>`,
    
    'SVT': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
        <path d="M2 22l8-8"/>
    </svg>`,

    // ---------------------------------------------------------
    // ARTS & ACTIVITÉS
    // ---------------------------------------------------------
    
    'Musique': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
    </svg>`,
    
    'Exercices': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>`,
    
    'Jeux': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="4"/>
        <path d="M6 12h4"/>
        <path d="M8 10v4"/>
        <circle cx="15" cy="13" r="1" fill="currentColor"/>
        <circle cx="18" cy="11" r="1" fill="currentColor"/>
    </svg>`,

    // ---------------------------------------------------------
    // GESTION & PROFESSEUR
    // ---------------------------------------------------------
    
    'Gestion': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1"/>
        <rect x="14" y="3" width="7" height="5" rx="1"/>
        <rect x="14" y="12" width="7" height="9" rx="1"/>
        <rect x="3" y="16" width="7" height="5" rx="1"/>
    </svg>`,
    
    'Autre': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="1" fill="currentColor"/>
        <circle cx="19" cy="12" r="1" fill="currentColor"/>
        <circle cx="5" cy="12" r="1" fill="currentColor"/>
    </svg>`,
    
    'Outils Profs': `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>`
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

// ==========================================
// 3. STUDIO MATHÉMATIQUES (MathLive WYSIWYG + LaTeX + Modèles)
// ==========================================
registerPlugin('mathFormulaTool', 'Mathematiques', {
    currentStamp: null, currentLatex: "",
    
    init: function() {
        // 1. Chargement de MathJax (Pour la génération du SVG vectoriel final sur le tableau)
        if (!window.MathJax) {
            window.MathJax = { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] }, svg: { fontCache: 'global' } };
            let scriptJax = document.createElement('script');
            scriptJax.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
            scriptJax.async = true;
            document.head.appendChild(scriptJax);
        }

        // 2. Chargement de MathLive (Pour le super éditeur visuel et le clavier virtuel)
        if (!customElements.get('math-field')) {
            let scriptLive = document.createElement('script');
            scriptLive.type = 'module';
            scriptLive.src = 'https://unpkg.com/mathlive?module';
            document.head.appendChild(scriptLive);
            
            // 🌟 CSS MAGIQUE : On dompte le clavier flottant de MathLive ! 🌟
            let kbStyle = document.createElement('style');
            kbStyle.innerHTML = `
                .ML__keyboard {
                    z-index: 100005 !important; /* Passe au-dessus du voile noir */
                    transform: scale(0.85); /* Réduit la taille globale */
                    transform-origin: bottom center;
                    box-shadow: 0 -10px 40px rgba(0,0,0,0.4) !important;
                }
            `;
            document.head.appendChild(kbStyle);
        }

        // 3. Création du bouton dans la barre d'outils
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'math'; btn.title = 'Formules Mathématiques';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6H8.5l6 6-6 6H18"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);
        
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('math');
            this.openStudio("\\frac{1}{2}", (stamp, latex) => {
                this.currentStamp = stamp; this.currentLatex = latex; 
                showToast("Formule prête ! (Cliquez pour poser, Échap pour annuler)"); draw();
            });
            e.stopPropagation();
        });
    },

    edit: function(imgObj) {
        this.openStudio(imgObj.pluginData.args, (stamp, latex) => {
            // FIX CACHE INTÉGRÉ ICI AUSSI
            if(typeof imageCache !== 'undefined') imageCache[stamp.src] = stamp.img;
            imgObj.src = stamp.src; imgObj.w = stamp.w; imgObj.h = stamp.h;
            imgObj.cw = stamp.w; imgObj.ch = stamp.h; imgObj.pluginData.args = latex;
            draw(); saveState();
        });
    },

    openStudio: function(initialLatex, onValidate) {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;justify-content:center;align-items:center;font-family:sans-serif;";
        
        const box = document.createElement('div');
        box.style.cssText = "width:650px;background:#fff;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.4);";
        
        box.innerHTML = `
            <div style="padding:15px 20px; background:#f8f9fa; border-bottom:1px solid #dfe6e9; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; color:#2d3436; font-size:18px;">✨ Éditeur de Formules</h3>
                
                <select id="math-presets" style="padding:6px 10px; border-radius:6px; border:1px solid #b2bec3; font-size:14px; background:#fff; cursor:pointer;">
                    <option value="">-- Modèles rapides --</option>
                    <option value="\\frac{1}{2}">Fraction simple (1/2)</option>
                    <option value="\\frac{a}{b}">Fraction à compléter</option>
                    <option value="a^2 + b^2 = c^2">Théorème de Pythagore</option>
                    <option value="\\pi \\times R^2">Aire d'un disque</option>
                    <option value="(a+b)^2 = a^2 + 2ab + b^2">Identité remarquable</option>
                    <option value="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}">Formule quadratique (Delta)</option>
                    <option value="\\lim_{x \\to \\infty} f(x)">Limite</option>
                    <option value="\\int_{a}^{b} f(x) dx">Intégrale</option>
                </select>
            </div>
            
            <div style="padding:20px; display:flex; flex-direction:column; gap:20px;">
                
                <div>
                    <label style="font-size:12px; font-weight:bold; color:#636e72; text-transform:uppercase;">1. Éditeur Visuel (Cliquez pour ouvrir le clavier)</label>
                    <math-field id="math-live-editor" locale="fr" style="font-size: 32px; padding: 16px; margin-top:8px; border: 2px solid #0984e3; border-radius: 8px; width: 100%; box-sizing: border-box; background:#f1f2f6; outline:none;"></math-field>
                </div>

                <div>
                    <label style="font-size:12px; font-weight:bold; color:#636e72; text-transform:uppercase;">2. Code LaTeX (Synchronisé)</label>
                    <textarea id="latex-input" rows="2" style="width:100%; margin-top:8px; padding:12px; border:1px solid #b2bec3; border-radius:8px; font-family:monospace; font-size:16px; background:#fff; box-sizing: border-box;"></textarea>
                </div>
            </div>
            
            <div style="padding:15px 20px; background:#f8f9fa; border-top:1px solid #dfe6e9; display:flex; justify-content:flex-end; gap:10px;">
                <button id="math-btn-cancel" style="padding:10px 20px; background:transparent; color:#636e72; border:1px solid #b2bec3; border-radius:6px; cursor:pointer; font-size:14px;">Annuler</button>
                <button id="math-btn-valid" style="padding:10px 20px; background:#0984e3; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px; box-shadow: 0 4px 6px rgba(9, 132, 227, 0.3);">Valider la Formule</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Récupération des éléments
        const mf = document.getElementById('math-live-editor');
        const latexInput = document.getElementById('latex-input');
        const presetsSelect = document.getElementById('math-presets');

        // Initialisation
        mf.value = initialLatex || "";
        latexInput.value = mf.value;

        // Initialisation
        mf.value = initialLatex || "";
        latexInput.value = mf.value;

        // 🌟 NOUVEAU : On force la norme française pour la multiplication ! 🌟
        customElements.whenDefined('math-field').then(() => {
            // 1. Force la croix sur la touche "x" du clavier virtuel
            if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.setKeycap) {
                window.mathVirtualKeyboard.setKeycap('[*]', { latex: '\\times' });
            }
            // 2. Force la croix si l'élève tape "*" sur son vrai clavier physique
            if (mf.inlineShortcuts) {
                mf.inlineShortcuts = { ...mf.inlineShortcuts, '*': '\\times' };
            }
        });
        // 🌟 SYNCHRONISATION 🌟
        
        // Clavier visuel -> LaTeX
        mf.addEventListener('input', () => {
            if (latexInput.value !== mf.value) {
                latexInput.value = mf.value;
                presetsSelect.value = ""; // Réinitialise la liste déroulante si on modifie à la main
            }
        });

        // LaTeX -> Clavier visuel
        latexInput.addEventListener('input', () => {
            if (mf.value !== latexInput.value) {
                mf.setValue(latexInput.value, {suppressChangeNotifications: true});
                presetsSelect.value = "";
            }
        });

        // Modèles rapides -> Clavier + LaTeX
        presetsSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                mf.setValue(e.target.value, {suppressChangeNotifications: true});
                latexInput.value = e.target.value;
                mf.focus(); // Ouvre le clavier virtuel automatiquement
            }
        });

        // --- Validation et création de l'image SVG ---
        document.getElementById('math-btn-cancel').onclick = () => document.body.removeChild(overlay);
        
        document.getElementById('math-btn-valid').onclick = () => {
            const finalLatex = latexInput.value;
            if (!finalLatex) return;

            // On demande à MathJax de générer un SVG silencieusement
            if (window.MathJax && window.MathJax.tex2svgPromise) {
                MathJax.tex2svgPromise(finalLatex).then(function (node) {
                    const svgEl = node.querySelector('svg');
                    if(!svgEl) return;
                    
                    // MathJax donne la taille en "ex" (unité typo). On convertit en pixels pour le tableau
                    const wEx = parseFloat(svgEl.getAttribute('width'));
                    const hEx = parseFloat(svgEl.getAttribute('height'));
                    const pxW = Math.round(wEx * 25); // Échelle x25 pour une belle netteté
                    const pxH = Math.round(hEx * 25);
                    
                    svgEl.setAttribute('width', pxW + 'px');
                    svgEl.setAttribute('height', pxH + 'px');
                    svgEl.setAttribute('xmlns', "http://www.w3.org/2000/svg");
                    svgEl.style.color = "#2d3436"; // Couleur de l'encre
                    
                    const svgString = new XMLSerializer().serializeToString(svgEl);
                    document.body.removeChild(overlay);
                    
                    let base64 = btoa(unescape(encodeURIComponent(svgString)));
                    const img = new Image();
                    img.onload = () => onValidate({ img: img, src: img.src, w: pxW, h: pxH }, finalLatex);
                    img.src = "data:image/svg+xml;base64," + base64;
                }).catch(function (err) {
                    alert("Erreur dans la syntaxe de la formule.");
                });
            } else {
                alert("Le moteur de rendu est encore en cours de chargement, veuillez patienter.");
            }
        };
        
        // Focus automatique
        setTimeout(() => mf.focus(), 100);
    },

    // --- Rendu fantôme et pose sur le tableau ---
    onPointerMove: function(rawPos) {
        if (mode === 'math' && this.currentStamp) { mouseLogicalPos = { x: rawPos.x, y: rawPos.y }; if(typeof draw==='function') draw(); return false; } return false;
    },
    
    onDraw: function(ctx) { 
        if (mode === 'math' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha = 0.8; 
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2, this.currentStamp.w, this.currentStamp.h); 
            ctx.globalAlpha = 1.0; 
        } 
    },
    
    onPointerDown: function(rawPos) { 
        if (mode === 'math' && this.currentStamp) { 
            // 🌟 LE CORRECTIF CRITIQUE POUR LE CACHE 🌟
            if (typeof imageCache !== 'undefined') {
                imageCache[this.currentStamp.src] = this.currentStamp.img;
            }
            
            images.push({ 
                id: nextId++, 
                x: rawPos.x - this.currentStamp.w/2, 
                y: rawPos.y - this.currentStamp.h/2, 
                w: this.currentStamp.w, 
                h: this.currentStamp.h, 
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, 
                src: this.currentStamp.src, z: globalZ++, 
                pluginData: {id:'mathFormulaTool', args:this.currentLatex} 
            }); 
            
            saveState(); setMode('pointer'); this.currentStamp = null; draw(); return true; 
        } 
        return false; 
    }
});
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
    
    // Liste des grandeurs disponible (centralisée pour éviter de répéter le code)
    magOptions: [
        { value: 'len', label: 'Longueurs' }, 
        { value: 'mass', label: 'Masses' }, 
        { value: 'cap', label: 'Capacités' }, 
        { value: 'area', label: 'Aires (²)' }, 
        { value: 'vol', label: 'Volumes (³)' }, 
        { value: 'num', label: 'Numération' }
    ],

    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'conversion'; btn.title = 'Tableau de Conversion';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #plugins-grid .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); 
            if(typeof setMode === 'function') setMode('conversion');
            
            openCustomPrompt("Tableau de Conversion", [
                { type: 'select', label: "Grandeur", value: "len", options: this.magOptions },
                { type: 'color', label: "Couleur", value: "#0984e3" }
            ], (res) => this.generateSVG(res[0], res[1]), 
               (res) => { 
                   createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { 
                       this.currentStamp = stamp; this.currentArgs = res; 
                       if(typeof showToast === 'function') showToast("📌 Tamponnez le tableau !"); 
                   }); 
               });
            e.stopPropagation();
        });
    },

    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier le Tableau", [
            { type: 'select', label: "Grandeur", value: args[0], options: this.magOptions },
            { type: 'color', label: "Couleur", value: args[1] }
        ], (res) => this.generateSVG(res[0], res[1]), 
           (res) => { 
               createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { 
                   imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; 
                   imgObj.pluginData.args=res; 
                   if(typeof draw === 'function') draw(); 
                   if(typeof saveState === 'function') saveState(); 
               }); 
           });
    },

    generateSVG: function(type, color, isExport=false) {
        let cols = [];
        let subCols = 1; // Nombre de sous-colonnes par unité (1 par défaut)

        // Définition des colonnes et des subdivisions
        if(type === 'len') cols = ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'];
        else if(type === 'mass') cols = ['kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg'];
        else if(type === 'cap') cols = ['kL', 'hL', 'daL', 'L', 'dL', 'cL', 'mL'];
        else if(type === 'num') cols = ['C', 'D', 'U', '1/10', '1/100', '1/1000'];
        else if(type === 'area') { cols = ['km²', 'hm²', 'dam²', 'm²', 'dm²', 'cm²', 'mm²']; subCols = 2; }
        else if(type === 'vol') { cols = ['km³', 'hm³', 'dam³', 'm³', 'dm³', 'cm³', 'mm³']; subCols = 3; }
        
        const colW = isExport ? 90 : 45;
        const rowH = isExport ? 45 : 25;
        const w = cols.length * colW; 
        const h = rowH * 4; 
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">`;
        
        // Fond et En-tête
        svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" fill-opacity="0.9" stroke="${color}" stroke-width="2"/>`;
        svg += `<rect x="0" y="0" width="${w}" height="${rowH}" fill="${color}" fill-opacity="0.15"/>`;
        
        // Lignes horizontales
        for(let i=1; i<=4; i++) {
            svg += `<line x1="0" y1="${i*rowH}" x2="${w}" y2="${i*rowH}" stroke="${color}" stroke-width="${i===1?2:1}"/>`;
        }
        
        // Colonnes et Sous-colonnes
        for(let i=0; i<cols.length; i++) {
            // Ligne verticale principale
            svg += `<line x1="${i*colW}" y1="0" x2="${i*colW}" y2="${h}" stroke="${color}" stroke-width="1"/>`;
            
            // Ligne rouge pour la virgule (Numération)
            if(type === 'num' && i===3) {
                svg += `<line x1="${i*colW}" y1="0" x2="${i*colW}" y2="${h}" stroke="#d63031" stroke-width="4"/>`; 
            }
            
            // Dessin des sous-colonnes (Aires et Volumes)
            if (subCols > 1) {
                let subW = colW / subCols;
                for(let j=1; j<subCols; j++) {
                    // Les pointillés commencent à `y1="${rowH}"` pour ne pas couper l'en-tête !
                    svg += `<line x1="${i*colW + j*subW}" y1="${rowH}" x2="${i*colW + j*subW}" y2="${h}" stroke="${color}" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"/>`;
                }
            }

            // Texte de l'unité
            svg += `<text x="${i*colW + colW/2}" y="${rowH/2 + (isExport?6:3)}" font-family="sans-serif" font-weight="bold" font-size="${isExport?18:10}" fill="${color}" text-anchor="middle">${cols[i]}</text>`;
        }
        
        return svg + `</svg>`;
    },

    onDraw: function(ctx) { 
        if(typeof mode !== 'undefined' && mode==='conversion' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha=0.5; 
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); 
            ctx.globalAlpha=1.0; 
        } 
    },

    onPointerDown: function(rawPos) { 
        if(typeof mode !== 'undefined' && mode==='conversion' && this.currentStamp) { 
            images.push({
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(), 
                x: rawPos.x-this.currentStamp.w/2, 
                y: rawPos.y-this.currentStamp.h/2, 
                w: this.currentStamp.w, 
                h: this.currentStamp.h, 
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, 
                src: this.currentStamp.src, 
                z: typeof globalZ !== 'undefined' ? globalZ++ : 1000, 
                pluginData: {id:'conversionTool', args:this.currentArgs}
            }); 
            if(typeof saveState === 'function') saveState(); 
            if(typeof setMode === 'function') setMode('pointer'); 
            
            document.querySelectorAll('#plugins-grid .btn').forEach(b => b.classList.remove('active'));
            
            this.currentStamp=null; 
            if(typeof draw === 'function') draw();
            return true; 
        } 
        return false; 
    }
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
   // Fonction qui génère le tampon avec les options choisies en VECTORIEL (SVG)
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
        
        tool.isStamp = true;
        
        // --- LA MAGIE EST ICI ---
        // 1. On demande à l'outil son code vectoriel pur
        const innerSVG = tool.toSVG();
        
        // 2. On l'encapsule dans une vraie balise SVG
        const fullSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${baseW}" height="${baseH}" viewBox="0 0 ${baseW} ${baseH}">${innerSVG}</svg>`;
        
        // 3. On génère une URL de données SVG au lieu d'un PNG !
        const dataURL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(fullSVG);
        
        stylesToRestore.forEach(r => r.obj[r.key] = r.val);
        
        return { dataURL: dataURL, w: baseW, h: baseH };
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
// ==========================================
// 10. STATISTIQUES (Clone Design Natif)
// ==========================================
registerPlugin('statTool', 'Mathematiques', {
    currentStamp: null, editingImage: null, state: { type: "bar", title: "Titre", color: "#3498db", rows: [{label:"A", val:10}, {label:"B", val:25}] },
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'stat'; btn.title = 'Graphique Statistique';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="10" width="4" height="10"/><rect x="11" y="4" width="4" height="16"/><rect x="17" y="14" width="4" height="6"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        const builderHTML = `
        <div id="stat-builder-modal" style="display:none; position:absolute; left:calc(50vw - 220px); border-radius:12px; top:15vh; width:440px; z-index:10001; background:#ffffff; border-radius:12px; box-shadow:0 15px 40px rgba(0,0,0,0.25); border:none; flex-direction:column; overflow:hidden; font-family:sans-serif;">
            <div id="stat-drag-handle" style="background:#1f2937; color:#ffffff; display:flex; align-items:center; padding:10px 24px; cursor:grab; font-weight:bold; font-size:13px; letter-spacing:0.3px;">Graphique Statistique</div>
            <div style="padding:24px; display:flex; flex-direction:column; gap:16px;">
                <div id="stat-preview" style="width:100%; height:110px; background:#f1f2f6; border:2px dashed #b2bec3; border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <select id="stat-type" class="prompt-input" style="flex:1; padding:10px; font-size:14px; border-radius:6px; border:1px solid #dfe6e9;"><option value="bar">Barres</option><option value="pie">Camembert</option><option value="line">Ligne</option></select>
                    <input type="text" id="stat-title" class="prompt-input" style="flex:2; padding:10px; font-size:14px; border-radius:6px; border:1px solid #dfe6e9;" placeholder="Titre">
                    <input type="color" id="stat-color" style="height:38px; width:38px; padding:0; border:none; cursor:pointer; border-radius:6px;">
                </div>
                <div id="stat-rows" style="display:flex; flex-direction:column; gap:6px; max-height:140px; overflow-y:auto; border:1px solid #dfe6e9; padding:8px; border-radius:8px; background:#f8f9fa;"></div>
                <button class="btn-action secondary" id="stat-btn-add" style="border:1px dashed #b2bec3; background:transparent; color:#2d3436; padding:8px; font-size:13px; border-radius:6px; cursor:pointer; font-weight:bold;">+ Ajouter une donnée</button>
                <div class="export-actions-grid" style="display:flex; margin-top:8px; gap:12px;">
                    <button class="btn-action secondary" id="stat-btn-cancel" style="flex:1; padding:12px; border-radius:8px; cursor:pointer; border:1px solid #b2bec3; background:transparent; font-size:14px; font-weight:bold; color:#636e72;">Annuler</button>
                    <button class="btn-action primary" id="stat-btn-ok" style="flex:1; background:#6c5ce7; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:bold; box-shadow:0 4px 10px rgba(108, 92, 231, 0.3);">Valider</button>
                </div>
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
            container.innerHTML += `<div style="display:flex; gap:6px; align-items:center;">
                <input type="text" value="${r.label}" class="prompt-input" oninput="pluginStatUpdate(${idx}, 'label', this.value)" style="flex:2; padding:6px; font-size:13px; border-radius:4px; border:1px solid #dfe6e9;">
                <input type="number" value="${r.val}" class="prompt-input" oninput="pluginStatUpdate(${idx}, 'val', this.value)" style="flex:1; padding:6px; font-size:13px; border-radius:4px; border:1px solid #dfe6e9;">
                <button style="border:none; background:transparent; cursor:pointer; color:#d63031; padding:0 6px; font-weight:bold; font-size:14px;" onclick="pluginStatRemove(${idx})">✕</button>
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
        <div id="prop-builder-modal" style="display:none; position:absolute;  border-radius:12px;left:calc(50vw - 210px); top:15vh; width:420px; z-index:10001; background:#ffffff; border-radius:10px; box-shadow:0 15px 40px rgba(0,0,0,0.3); border:1px solid #dfe6e9; flex-direction:column;">
            <div id="prop-drag-handle" style="background:#1f2937; color:#ffffff;  border-radius:12px 12px 0px 0px;display:flex; align-items:center; padding:10px 24px; cursor:grab; font-weight:bold; font-size:13px; letter-spacing:0.3px;">Tableau de Proportionnalité</div>
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

// ==========================================
// 15. KIT MONNAIE (Pièces et Billets - Centrage Parfait)
// ==========================================
registerPlugin('moneyTool', 'Mathematiques', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'money'; btn.title = 'Kit Monnaie';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`;
        grid.appendChild(btn);

        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('money');
            openCustomPrompt("Kit Monnaie", [
                { type: 'select', label: 'Type de monnaie', value: '1e', options: [
                    {value: '1c', label: '🟡 Pièce 1 centime'}, {value: '2c', label: '🟡 Pièce 2 centimes'}, {value: '5c', label: '🟡 Pièce 5 centimes'},
                    {value: '10c', label: '🟠 Pièce 10 centimes'}, {value: '20c', label: '🟠 Pièce 20 centimes'}, {value: '50c', label: '🟠 Pièce 50 centimes'},
                    {value: '1e', label: '🪙 Pièce 1 Euro'}, {value: '2e', label: '🪙 Pièce 2 Euros'},
                    {value: '5b', label: '💵 Billet 5 Euros'}, {value: '10b', label: '💵 Billet 10 Euros'}, {value: '20b', label: '💵 Billet 20 Euros'}, 
                    {value: '50b', label: '💵 Billet 50 Euros'}, {value: '100b', label: '💵 Billet 100 Euros'}
                ]}
            ], 
            (res) => this.getMoneySVG(res[0], false), 
            (res) => { 
                if (typeof createStampFromSVG === 'function') {
                    createStampFromSVG(this.getMoneySVG(res[0], true), (stamp) => { 
                        this.currentStamp = stamp; this.currentArgs = res; 
                        showToast("💸 Tamponnez l'argent sur le tableau ! (Échap pour arrêter)"); 
                    });
                }
            });
            e.stopPropagation();
        });
    },

    getMoneySVG: function(type, isExport=false) {
        let svg = '';
        const scale = isExport ? 2 : 1; 

        // Palettes de couleurs
        const copper = { fill: '#e67e22', border: '#d35400', text: '#fff' };
        const gold = { fill: '#f1c40f', border: '#f39c12', text: '#2d3436' };
        const silver = { fill: '#ecf0f1', border: '#bdc3c7', text: '#2d3436' };

        const drawCoin = (r, outerCol, innerCol, val, symbol, isBicolor = false) => {
            const sR = r * scale; const sW = sR*2;
            let cSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sW} ${sW}" width="${sW}" height="${sW}">`;
            cSvg += `<circle cx="${sR}" cy="${sR}" r="${sR-2}" fill="${outerCol.fill}" stroke="${outerCol.border}" stroke-width="4"/>`;
            if (isBicolor) cSvg += `<circle cx="${sR}" cy="${sR}" r="${sR*0.7}" fill="${innerCol.fill}" stroke="${innerCol.border}" stroke-width="2"/>`;
            
            // 🌟 LE CENTRAGE PARFAIT EST ICI : Utilisation de dominant-baseline="central" 🌟
            cSvg += `<text x="${sR}" y="${sR - (2*scale)}" font-family="sans-serif" font-weight="bold" font-size="${18*scale}" fill="${isBicolor?innerCol.text:outerCol.text}" text-anchor="middle" dominant-baseline="central">${val}</text>`;
            cSvg += `<text x="${sR}" y="${sR + (12*scale)}" font-family="sans-serif" font-weight="bold" font-size="${9*scale}" fill="${isBicolor?innerCol.text:outerCol.text}" text-anchor="middle" dominant-baseline="central">${symbol}</text>`;
            return cSvg + `</svg>`;
        };

        const drawBill = (color, val) => {
            const w = 140 * scale; const h = 75 * scale;
            let bSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
            bSvg += `<rect width="${w}" height="${h}" rx="6" fill="${color}" stroke="#2d3436" stroke-width="3"/>`;
            bSvg += `<rect x="${10*scale}" y="${10*scale}" width="${w - 20*scale}" height="${h - 20*scale}" rx="4" fill="#ffffff" fill-opacity="0.8" stroke="#2d3436" stroke-width="1.5" stroke-dasharray="4 2"/>`;
            
            // Centrage ajusté pour les billets également
            bSvg += `<text x="${20*scale}" y="${30*scale}" font-family="sans-serif" font-weight="bold" font-size="${24*scale}" fill="#2d3436" dominant-baseline="central">${val}</text>`;
            bSvg += `<text x="${w - 20*scale}" y="${h - 30*scale}" font-family="sans-serif" font-weight="bold" font-size="${24*scale}" fill="#2d3436" text-anchor="end" dominant-baseline="central">${val}</text>`;
            bSvg += `<text x="${w/2}" y="${h/2}" font-family="sans-serif" font-weight="bold" font-size="${38*scale}" fill="${color}" text-anchor="middle" dominant-baseline="central" opacity="0.4">€</text>`;
            return bSvg + `</svg>`;
        };

        // Distribution
        if (type === '1c') svg = drawCoin(25, copper, null, "1", "CENT");
        else if (type === '2c') svg = drawCoin(28, copper, null, "2", "CENT");
        else if (type === '5c') svg = drawCoin(32, copper, null, "5", "CENT");
        else if (type === '10c') svg = drawCoin(30, gold, null, "10", "CENT");
        else if (type === '20c') svg = drawCoin(34, gold, null, "20", "CENT");
        else if (type === '50c') svg = drawCoin(38, gold, null, "50", "CENT");
        else if (type === '1e') svg = drawCoin(36, gold, silver, "1", "EURO", true);
        else if (type === '2e') svg = drawCoin(40, silver, gold, "2", "EURO", true);
        else if (type === '5b') svg = drawBill('#b2bec3', "5");
        else if (type === '10b') svg = drawBill('#ff7675', "10");
        else if (type === '20b') svg = drawBill('#74b9ff', "20");
        else if (type === '50b') svg = drawBill('#e17055', "50");
        else if (type === '100b') svg = drawBill('#55efc4', "100");

        return svg;
    },

    onDraw: function(ctx) { 
        if(typeof mode !== 'undefined' && mode === 'money' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha = 0.7; 
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2); 
            ctx.globalAlpha = 1.0; 
        } 
    },
    
    onPointerDown: function(rawPos) { 
        if(typeof mode !== 'undefined' && mode === 'money' && this.currentStamp) { 
            if (typeof imageCache !== 'undefined') imageCache[this.currentStamp.src] = this.currentStamp.img;
            images.push({
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(), 
                x: rawPos.x - this.currentStamp.w/2, y: rawPos.y - this.currentStamp.h/2, 
                w: this.currentStamp.w, h: this.currentStamp.h, 
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, 
                src: this.currentStamp.src, z: typeof globalZ !== 'undefined' ? globalZ++ : 1000,
                pluginData: {id:'moneyTool', args:this.currentArgs}
            }); 
            if (typeof saveState === 'function') saveState(); 
            // On ne change pas de mode pour pouvoir tamponner plein de pièces de suite
            if (typeof draw === 'function') draw(); 
            return true; 
        } 
        return false; 
    }
});

// ==========================================
// 16. GÉNÉRATEUR MATHODOKU (Fix du Cache)
// ==========================================
registerPlugin('mathodokuTool', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Mathodoku'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h18 M12 3v18" stroke-width="1" stroke-dasharray="2 2" stroke-opacity="0.7"/><path d="M12 3v9h9 M3 12h9v9" stroke-width="2.5"/><text x="7.5" y="8" font-size="6" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">+</text><text x="16.5" y="17" font-size="5" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">×</text></svg>`;
        grid.appendChild(btn);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCustomPrompt("Générer un Mathodoku", [
                { type: 'select', label: 'Taille de la grille', value: '4', options: [{value: '3', label: 'Petit (3x3)'}, {value: '4', label: 'Moyen (4x4)'}, {value: '5', label: 'Grand (5x5)'}] },
                { type: 'select', label: 'Difficulté', value: 'mixed', options: [{value: 'add', label: 'Additions & Soustractions (+, -)'}, {value: 'mixed', label: 'Toutes les opérations (+, -, ×, ÷)'}] },
                { type: 'select', label: 'Solution', value: 'hidden', options: [{value: 'none', label: 'Aucune'}, {value: 'hidden', label: 'Cachée (Gomme)'}, {value: 'visible', label: 'Visible'}] }
            ], 
            (res) => { 
                let svgs = this.generateMathodokuSVGs(parseInt(res[0]), res[1]);
                let html = `<div style="display:flex; gap:15px; width:100%; height:100%; justify-content:center; align-items:center;">`;
                html += `<img src="${svgs.puzzle}" style="max-height:110px; object-fit:contain; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.15);">`;
                if (res[2] === 'visible') html += `<img src="${svgs.sol}" style="max-height:110px; object-fit:contain; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.15);">`;
                else if (res[2] === 'hidden') html += `<img src="${svgs.cache}" style="max-height:110px; object-fit:contain; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.15);">`;
                return html + `</div>`;
            }, 
            (res) => { 
                showToast("⏳ Génération du Mathodoku...");
                setTimeout(() => this.buildMathodoku(parseInt(res[0]), res[1], res[2]), 50);
            });
        });
    },

    generateMathodokuSVGs: function(size, diff) {
        let grid = Array(size).fill(0).map(()=>Array(size).fill(0));
        const solveLatin = (r, c) => {
            if(r === size) return true;
            if(c === size) return solveLatin(r+1, 0);
            let nums = Array.from({length:size}, (_,i)=>i+1).sort(()=>Math.random()-0.5);
            for(let n of nums) {
                let valid = true;
                for(let i=0; i<c; i++) if(grid[r][i]===n) valid = false;
                for(let i=0; i<r; i++) if(grid[i][c]===n) valid = false;
                if(valid) { grid[r][c] = n; if(solveLatin(r, c+1)) return true; }
            }
            grid[r][c] = 0; return false;
        };
        solveLatin(0, 0);

        let cages = [];
        let visited = Array(size).fill(0).map(()=>Array(size).fill(false));
        for(let r=0; r<size; r++) {
            for(let c=0; c<size; c++) {
                if(!visited[r][c]) {
                    let cage = [{r,c}]; visited[r][c] = true;
                    let targetSize = Math.floor(Math.random() * (size > 3 ? 3 : 2)) + 1; 
                    let queue = [{r,c}];
                    while(queue.length > 0 && cage.length < targetSize) {
                        let curr = queue.shift();
                        let dirs = [[0,1], [1,0], [0,-1], [-1,0]].sort(()=>Math.random()-0.5);
                        for(let [dr, dc] of dirs) {
                            let nr = curr.r + dr, nc = curr.c + dc;
                            if(nr>=0 && nr<size && nc>=0 && nc<size && !visited[nr][nc]) {
                                visited[nr][nc] = true; cage.push({r:nr, c:nc}); queue.push({r:nr, c:nc});
                                if(cage.length >= targetSize) break;
                            }
                        }
                    }
                    cages.push(cage);
                }
            }
        }

        cages.forEach(cage => {
            let vals = cage.map(p => grid[p.r][p.c]);
            cage.sort((a,b) => (a.r*size+a.c) - (b.r*size+b.c));
            cage.labelPos = cage[0];

            if(cage.length === 1) { cage.op = ''; cage.target = vals[0]; } 
            else if(cage.length === 2) {
                let a = Math.max(vals[0], vals[1]), b = Math.min(vals[0], vals[1]);
                let ops = ['+', '-'];
                if (diff === 'mixed') { ops.push('×'); if (a % b === 0) ops.push('÷'); }
                cage.op = ops[Math.floor(Math.random() * ops.length)];
                if(cage.op==='+') cage.target = a+b; if(cage.op==='-') cage.target = a-b;
                if(cage.op==='×') cage.target = a*b; if(cage.op==='÷') cage.target = a/b;
            } else {
                let ops = ['+']; if (diff === 'mixed') ops.push('×');
                cage.op = ops[Math.floor(Math.random() * ops.length)];
                cage.target = vals.reduce((acc, v) => cage.op==='+' ? acc+v : acc*v);
            }
        });

        const w = 400; const cellW = w / size;
        const buildGridSVG = (showSol) => {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}">`;
            svg += `<rect width="${w}" height="${w}" fill="${showSol ? '#f1f2f6' : '#ffffff'}" stroke="#2d3436" stroke-width="6"/>`;

            svg += `<g stroke="#b2bec3" stroke-width="1" stroke-dasharray="4 2">`;
            for(let i=1; i<size; i++) {
                svg += `<line x1="${i*cellW}" y1="0" x2="${i*cellW}" y2="${w}"/>`;
                svg += `<line x1="0" y1="${i*cellW}" x2="${w}" y2="${i*cellW}"/>`;
            }
            svg += `</g>`;

            svg += `<g stroke="#2d3436" stroke-width="4" stroke-linecap="square">`;
            cages.forEach(cage => {
                cage.forEach(p => {
                    let isTop = !cage.find(c => c.r === p.r-1 && c.c === p.c);
                    let isBot = !cage.find(c => c.r === p.r+1 && c.c === p.c);
                    let isLft = !cage.find(c => c.r === p.r && c.c === p.c-1);
                    let isRgt = !cage.find(c => c.r === p.r && c.c === p.c+1);
                    
                    let x = p.c * cellW, y = p.r * cellW;
                    if(isTop) svg += `<line x1="${x}" y1="${y}" x2="${x+cellW}" y2="${y}"/>`;
                    if(isBot) svg += `<line x1="${x}" y1="${y+cellW}" x2="${x+cellW}" y2="${y+cellW}"/>`;
                    if(isLft) svg += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+cellW}"/>`;
                    if(isRgt) svg += `<line x1="${x+cellW}" y1="${y}" x2="${x+cellW}" y2="${y+cellW}"/>`;
                    
                    if (showSol) {
                        svg += `<text x="${x + cellW/2}" y="${y + cellW/2 + 3}" font-family="sans-serif" font-weight="bold" font-size="${size<5?36:28}" fill="#0984e3" stroke="none" text-anchor="middle" dominant-baseline="central">${grid[p.r][p.c]}</text>`;
                    }
                });
                svg += `<text x="${cage.labelPos.c * cellW + 6}" y="${cage.labelPos.r * cellW + 18}" font-family="sans-serif" font-weight="bold" font-size="15" fill="#2d3436" stroke="none">${cage.target} ${cage.op === '÷' ? ':' : cage.op}</text>`;
            });
            return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg + `</g></svg>`)));
        };

        // 🌟 CORRECTION DU CACHE AUSSI ICI 🌟
        let cache = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}"><rect width="${w}" height="${w}" fill="#b2bec3" stroke="#636e72" stroke-width="6"/><text x="${w/2}" y="${w/2-15}" font-family="sans-serif" font-weight="bold" font-size="28" fill="#2d3436" text-anchor="middle" dominant-baseline="central">Solution cachée</text><text x="${w/2}" y="${w/2+25}" font-family="sans-serif" font-size="18" fill="#2d3436" text-anchor="middle" dominant-baseline="central">Prenez la gomme !</text></svg>`;

        return { puzzle: buildGridSVG(false), sol: buildGridSVG(true), cache: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(cache))) };
    },

    buildMathodoku: function(size, diff, solType) {
        let svgs = this.generateMathodokuSVGs(size, diff);
        const w = 400;

        const loadImg = (b64, x, y) => {
            return new Promise(resolve => {
                let img = new Image();
                img.onload = () => {
                    if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                    images.push({ id: nextId++, x, y, w, h: w, cx:0, cy:0, cw:w, ch:w, src: img.src, z: globalZ++ });
                    resolve();
                };
                img.src = b64;
            });
        };

        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        let pX = logicalCenterX - (solType !== 'none' ? w + 20 : w/2);
        let pY = logicalCenterY - w/2;
        let sX = pX + w + 40;

        loadImg(svgs.puzzle, pX, pY).then(() => {
            if(solType !== 'none') return loadImg(svgs.sol, sX, pY);
        }).then(() => {
            if(solType === 'hidden') return loadImg(svgs.cache, sX, pY);
        }).then(() => {
            if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
            showToast("🧠 Mathodoku prêt !");
        });
    }
});

// ==============================================================================
// PACK MUSIQUE PREMIUM : PIANO 3 OCTAVES & MÉTRONOME LUMINEUX FLUIDE
// ==============================================================================

// --- MOTEUR AUDIO GLOBAL SÉCURISÉ ---
window.SharedAudioCtx = null;
window.initAudio = () => {
    if (!window.SharedAudioCtx) {
        window.SharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (window.SharedAudioCtx.state === 'suspended') window.SharedAudioCtx.resume();
    return window.SharedAudioCtx;
};

window.playTone = (freq, type = 'triangle', duration = 0.5, vol = 0.3) => {
    try {
        const ctx = window.initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.stop(ctx.currentTime + duration);
    } catch(e) { console.log("Audio non initialisé"); }
};

// ------------------------------------------------------------------------------
// 1. LE PIANO 3 OCTAVES (Génération mathématique)
// ------------------------------------------------------------------------------
registerPlugin('pianoTool', 'Musique', {
    activePianos: [],
    isPositionLocked: false,
    notes: [], // Sera rempli dynamiquement au démarrage

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Piano Virtuel'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18v12H3z"/><line x1="8" y1="6" x2="8" y2="14"/><line x1="12" y1="6" x2="12" y2="14"/><line x1="16" y1="6" x2="16" y2="14"/><line x1="3" y1="14" x2="21" y2="14"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.buildPiano(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);

        // --- GÉNÉRATION DYNAMIQUE DES 3 OCTAVES ---
        let whiteKeys = ['C','D','E','F','G','A','B'];
        let blackKeys = ['C#','D#','F#','G#','A#'];
        let baseFreqs = { 'C': 130.81, 'C#': 138.59, 'D': 146.83, 'D#': 155.56, 'E': 164.81, 'F': 174.61, 'F#': 185.00, 'G': 196.00, 'G#': 207.65, 'A': 220.00, 'A#': 233.08, 'B': 246.94 }; 

        let curX = 0; let wW = 40; let bW = 24;
        for (let oct = 3; oct <= 5; oct++) {
            let mult = Math.pow(2, oct - 3);
            for(let i=0; i<whiteKeys.length; i++) {
                this.notes.push({ name: whiteKeys[i]+oct, freq: baseFreqs[whiteKeys[i]] * mult, type: 'white', x: curX });
                let bName = whiteKeys[i] + '#' + oct;
                if (blackKeys.includes(whiteKeys[i] + '#')) {
                    this.notes.push({ name: bName, freq: baseFreqs[whiteKeys[i]+'#'] * mult, type: 'black', x: curX + wW - (bW/2) });
                }
                curX += wW;
            }
        }
        this.notes.push({ name: 'C6', freq: baseFreqs['C'] * 8, type: 'white', x: curX }); // Dernière touche

        window.pianoToggleLock = () => {
            this.isPositionLocked = !this.isPositionLocked;
            const lockBtn = document.getElementById('btn-piano-lock');
            if(lockBtn) {
                lockBtn.innerHTML = this.isPositionLocked ? "🔒 Verrouillé (Prêt à jouer)" : "🔓 Déverrouillé";
                lockBtn.style.background = this.isPositionLocked ? "#e74c3c" : "#f1f2f6";
                lockBtn.style.color = this.isPositionLocked ? "#fff" : "#2d3436";
            }
        };
    },

    generateSVG: function(activeNoteName = null) {
        let w = 880, h = 180;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svg += `<rect width="${w}" height="${h}" fill="#1e272e" rx="6" stroke="#2d3436" stroke-width="4"/>`;
        
        // Les Blanches
        this.notes.filter(n => n.type === 'white').forEach(n => {
            let fill = (activeNoteName === n.name) ? '#ffeaa7' : '#ffffff';
            svg += `<rect x="${n.x}" y="20" width="40" height="156" fill="${fill}" stroke="#2d3436" stroke-width="1.5" rx="3"/>`;
            if(n.name.includes('C')) { // Repère visuel sur les DO
                svg += `<text x="${n.x+20}" y="160" font-family="sans-serif" font-size="12" font-weight="bold" fill="#d63031" text-anchor="middle">${n.name}</text>`;
            }
        });
        // Les Noires
        this.notes.filter(n => n.type === 'black').forEach(n => {
            let fill = (activeNoteName === n.name) ? '#0984e3' : '#2d3436';
            svg += `<rect x="${n.x}" y="20" width="24" height="95" fill="${fill}" stroke="#000" stroke-width="2" rx="2"/>`;
        });
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg + `</svg>`)));
    },

    buildPiano: function() {
        let w = 880, h = 180; this.isPositionLocked = false;
        let img = new Image();
        img.onload = () => {
            let cx = (window.innerWidth/2 - panX)/zoom, cy = (window.innerHeight/2 - panY)/zoom;
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            let pId = nextId++;
            images.push({ id: pId, x: cx - w/2, y: cy - h/2, w: w, h: h, cx:0, cy:0, cw:w, ch:h, src: img.src, z: globalZ++ });
            this.activePianos.push(pId);
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw();
            this.createRemote();
            window.initAudio();
        };
        img.src = this.generateSVG();
    },

    createRemote: function() {
        if(document.getElementById('piano-remote')) document.getElementById('piano-remote').remove();
        const remote = document.createElement('div'); remote.id = 'piano-remote';
        remote.style.cssText = "position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); z-index:10005; display:flex; align-items:center; padding: 12px 20px; gap: 15px; border: 2px solid #1e272e; font-family:sans-serif;";
        remote.innerHTML = `
            <div style="font-weight:bold; font-size:14px; color:#1e272e;">🎹 PIANO 3 OCTAVES :</div>
            <button id="btn-piano-lock" onclick="pianoToggleLock()" style="padding:10px 18px; background:#f1f2f6; border:1px solid #ccc; border-radius:6px; cursor:pointer; font-weight:bold; font-size:14px; transition: all 0.2s;">🔓 Déverrouillé</button>
            <button onclick="document.getElementById('piano-remote').remove()" style="background:transparent; border:none; cursor:pointer; color:#e74c3c; font-weight:bold; font-size:16px; margin-left:10px;">X</button>
        `;
        document.body.appendChild(remote);
    },

    onPointerDown: function(rawPos) {
        if (this.activePianos.length === 0) return false;
        this.activePianos = this.activePianos.filter(id => images.some(img => img.id === id));

        for (let i = this.activePianos.length - 1; i >= 0; i--) {
            let pId = this.activePianos[i];
            let imgObj = images.find(img => img.id === pId);
            if (!imgObj) continue;

            if (rawPos.x >= imgObj.x && rawPos.x <= imgObj.x + imgObj.w &&
                rawPos.y >= imgObj.y && rawPos.y <= imgObj.y + imgObj.h) {
                
                let localX = (rawPos.x - imgObj.x) * (880 / imgObj.w);
                let localY = (rawPos.y - imgObj.y) * (180 / imgObj.h);
                if (localY < 20) return false;

                let clicked = null;
                if (localY < 115) { 
                    let blacks = this.notes.filter(n => n.type === 'black');
                    for (let b of blacks) { if (localX >= b.x && localX <= b.x + 24) { clicked = b; break; } }
                }
                if (!clicked) { 
                    let whites = this.notes.filter(n => n.type === 'white');
                    for (let w of whites) { if (localX >= w.x && localX <= w.x + 40) { clicked = w; break; } }
                }

                if (clicked) {
                    window.playTone(clicked.freq, 'sine', 0.6, 0.4);
                    const tImg = new Image();
                    tImg.onload = () => { if (typeof imageCache !== 'undefined') imageCache[tImg.src] = tImg; imgObj.src = tImg.src; if(typeof draw === 'function') draw(); };
                    tImg.src = this.generateSVG(clicked.name);

                    setTimeout(() => {
                        const rImg = new Image();
                        rImg.onload = () => { if (typeof imageCache !== 'undefined') imageCache[rImg.src] = rImg; imgObj.src = rImg.src; if(typeof draw === 'function') draw(); };
                        rImg.src = this.generateSVG();
                    }, 250);

                    if (this.isPositionLocked) return true; // Empêche le drag si verrouillé !
                }
            }
        }
        return false;
    }
});


// ------------------------------------------------------------------------------
// 2. LE MÉTRONOME DE BANDEAU À LED (Fermeture propre et complète)
// ------------------------------------------------------------------------------
registerPlugin('metronomeTool', 'Musique', {
    currentId: null,
    timerId: null, 
    bpm: 120,
    isPlaying: false,
    currentBeat: 0,

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Métronome LED'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.buildMetronome(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);

        window.metroBoxToggle = () => {
            this.isPlaying = !this.isPlaying;
            const btnPlay = document.getElementById('btn-metro-box-play');
            if(btnPlay) btnPlay.innerHTML = this.isPlaying ? "🛑 Stop" : "▶️ Lancer";
            if (this.isPlaying) this.start(); else this.stop();
        };

        window.metroBoxBPM = (val) => {
            this.bpm = parseInt(val);
            const display = document.getElementById('metro-box-val');
            if(display) display.innerHTML = this.bpm;
        };

        window.metroBoxClose = () => {
            this.stop(); 
            // 1. On ferme la télécommande
            if(document.getElementById('metro-box-remote')) document.getElementById('metro-box-remote').remove();
            
            // 2. 🌟 SUPPRESSION DU MÉTRONOME DU CANVAS 🌟
            const imgIndex = images.findIndex(img => img.id === this.currentId);
            if (imgIndex !== -1) {
                images.splice(imgIndex, 1); // Retire l'image du tableau
                if (typeof saveState === 'function') saveState(); // Sauvegarde l'historique
                if (typeof draw === 'function') draw(); // Rafraîchit l'écran immédiatement
            }
        };
    },

    generateSVG: function(activeBeat = 0) {
        let w = 400, h = 110;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svg += `<rect width="${w}" height="${h}" fill="#2d3436" rx="14" stroke="#636e72" stroke-width="3"/>`;
        
        for (let i = 1; i <= 4; i++) {
            let cx = 50 + (i - 1) * 100, cy = 55;
            let isActive = (activeBeat === i);
            let color = "#636e72", filter = "";
            if (isActive) {
                color = (i === 1) ? "#2ecc71" : "#00d2d3"; 
                filter = `filter="drop-shadow(0 0 12px ${color})"`;
            }
            svg += `<circle cx="${cx}" cy="${cy}" r="24" fill="${color}" stroke="#1e272e" stroke-width="3" ${filter}/>`;
            svg += `<text x="${cx}" y="${cy}" font-family="sans-serif" font-weight="bold" font-size="16" fill="#fff" text-anchor="middle" dominant-baseline="central">${i}</text>`;
        }
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg + `</svg>`)));
    },

    buildMetronome: function() {
        let w = 400, h = 110; this.stop(); this.currentBeat = 0;
        let img = new Image();
        img.onload = () => {
            let cx = (window.innerWidth/2 - panX)/zoom, cy = (window.innerHeight/2 - panY)/zoom;
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            this.currentId = nextId++;
            images.push({ id: this.currentId, x: cx - w/2, y: cy - h/2, w: w, h: h, cx:0, cy:0, cw:w, ch:h, src: img.src, z: globalZ++ });
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw();
            this.createRemote();
            window.initAudio();
        };
        img.src = this.generateSVG(0);
    },

    start: function() {
        if (this.timerId) clearTimeout(this.timerId);
        this.currentBeat = 1;
        this.pulse(this.currentBeat);
        this.scheduleNext();
    },

    scheduleNext: function() {
        if (!this.isPlaying) return;
        const ms = 60000 / this.bpm;
        this.timerId = setTimeout(() => {
            this.currentBeat = (this.currentBeat % 4) + 1;
            this.pulse(this.currentBeat);
            this.scheduleNext(); 
        }, ms);
    },

    pulse: function(beat) {
        let isFirst = (beat === 1);
        window.playTone(isFirst ? 900 : 600, 'square', 0.05, 0.4);

        let imgObj = images.find(img => img.id === this.currentId);
        if (imgObj) {
            const tempImg = new Image();
            tempImg.onload = () => { 
                if (typeof imageCache !== 'undefined') imageCache[tempImg.src] = tempImg;
                imgObj.src = tempImg.src; 
                if(typeof draw === 'function') draw(); 
            };
            tempImg.src = this.generateSVG(beat);
        } else {
            this.stop(); 
        }
    },

    stop: function() {
        this.isPlaying = false;
        if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
        
        let imgObj = images.find(img => img.id === this.currentId);
        if (imgObj) {
            const resetImg = new Image();
            resetImg.onload = () => { 
                if (typeof imageCache !== 'undefined') imageCache[resetImg.src] = resetImg; 
                imgObj.src = resetImg.src; 
                if(typeof draw === 'function') draw(); 
            };
            resetImg.src = this.generateSVG(0);
        }
    },

    createRemote: function() {
        if(document.getElementById('metro-box-remote')) document.getElementById('metro-box-remote').remove();
        const remote = document.createElement('div'); remote.id = 'metro-box-remote';
        remote.style.cssText = "position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); z-index:10005; display:flex; align-items:center; padding: 12px 20px; gap: 15px; border: 2px solid #636e72; font-family:sans-serif;";
        remote.innerHTML = `
            <div style="font-weight:bold; font-size:14px; color:#2d3436;">⏱️ RYTHME LED :</div>
            <span id="metro-box-val" style="font-size:22px; font-weight:900; color:#2d3436; min-width:40px; text-align:center;">${this.bpm}</span>
            <span style="font-size:12px; color:#636e72;">BPM</span>
            <input type="range" min="40" max="240" step="1" value="${this.bpm}" style="width:140px; cursor:pointer;" oninput="metroBoxBPM(this.value)">
            <button id="btn-metro-box-play" onclick="metroBoxToggle()" style="margin-left:10px; padding:10px 18px; background:#2ecc71; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:14px;">${this.isPlaying ? "🛑 Stop" : "▶️ Lancer"}</button>
            <button onclick="metroBoxClose()" style="margin-left:10px; background:transparent; border:none; cursor:pointer; color:#e74c3c; font-weight:bold; font-size:16px;">X</button>
        `;
        document.body.appendChild(remote);
    }
});

registerPlugin('solidPatronTool', 'Mathematiques', {
    currentSolidId: null,
    tempParams: { type: 'cube', f: 0, color: '#0984e3' },

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Patrons de Solides'; 
       btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 4h4v4h4v4h-4v8h-4v-8H6V8h4V4z"/>
    <path d="M10 8h4 M10 12h4 M10 16h4 M10 8v4 M14 8v4"/>
</svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);

        // Slider interactif sur le Canvas (Fix d'effacement inclus)
        window.updateSolidCanvas = (val, id, type, color) => {
            const f = parseFloat(val);
            const imgObj = images.find(img => img.id === id);
            if (imgObj) {
                const b64 = this.generateSVG(type, f, color);
                const img = new Image();
                img.onload = () => { 
                    if (typeof imageCache !== 'undefined') imageCache[img.src] = img; // Sécurité anti-disparition
                    imgObj.src = img.src; 
                    if(typeof draw === 'function') draw(); 
                };
                img.src = b64;
            }
        };

        // Slider interactif dans la Modal
        window.updateSolidPreview = (val, type, color) => {
            const previewImg = document.getElementById('solid-preview-img');
            const hiddenInput = document.getElementById('solid-hidden-factor');
            if (previewImg && hiddenInput) {
                hiddenInput.value = val;
                previewImg.src = this.generateSVG(type, parseFloat(val), color);
            }
        };
    },

    openPrompt: function() {
        this.tempParams = { type: 'cube', f: 0, color: '#0984e3' };
        openCustomPrompt("Patron de Solide", [
            { type: 'select', label: 'Type de solide', value: 'cube', options: [
                {value:'cube', label:'Cube'}, {value:'pave', label:'Pavé Droit'}, 
                {value:'pyramide', label:'Pyramide (base carrée)'},
                {value:'prisme', label:'Prisme (base triangle)'}, {value:'cylindre', label:'Cylindre'}, {value:'cone', label:'Cône'}
            ]},
            { type: 'color', label: 'Couleur', value: '#0984e3' },
            { type: 'hidden', id: 'solid-hidden-factor', value: '0' }
        ], 
        (res) => {
            return `
                <div style="display:flex; flex-direction:column; align-items:center; gap:15px; width:100%;">
                    <div style="width:250px; height:220px; background:#f8f9fa; border-radius:8px; display:flex; justify-content:center; align-items:center; border:1px solid #ddd;">
                        <img id="solid-preview-img" src="${this.generateSVG(res[0], 0, res[1])}" style="max-width:90%; max-height:90%; object-fit:contain;">
                    </div>
                    <div style="width:100%; text-align:center;">
                        <label style="font-size:12px; font-weight:bold; color:#666; display:block; margin-bottom:5px;">TESTER LE DÉPLIEMENT</label>
                        <input type="range" min="0" max="1" step="0.01" value="0" style="width:80%; cursor:pointer;" oninput="updateSolidPreview(this.value, '${res[0]}', '${res[1]}')">
                    </div>
                </div>
            `;
        }, 
        (res) => {
            let finalFactor = parseFloat(document.getElementById('solid-hidden-factor')?.value || 0);
            this.buildOnCanvas(res[0], finalFactor, res[1]);
        });
    },

    // 🌟 MOTEUR GÉOMÉTRIQUE VECTORIEL INTERACTIF 🌟
    generateSVG: function(type, f, col) {
        const w = 500, h = 500, cx = 250, cy = 250;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        const o = 0.3 + (f * 0.4); 

        const drawPoly = (pts3, pts2) => {
            let pts = pts3.map((p, i) => `${p[0]*(1-f) + pts2[i][0]*f},${p[1]*(1-f) + pts2[i][1]*f}`).join(' ');
            return `<polygon points="${pts}" fill="${col}" fill-opacity="${o}" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
        };

        if (type === 'cube' || type === 'pave') {
            const W = type==='cube'?100:140, H = 100, D = 100;
            const f_tl=[200, 200], f_tr=[200+W, 200], f_br=[200+W, 200+H], f_bl=[200, 200+H];
            const b_tl=[200+30, 200-40], b_tr=[200+W+30, 200-40], b_br=[200+W+30, 200+H-40], b_bl=[200+30, 200+H-40];
            
            const pF = [[200, 200], [200+W, 200], [200+W, 200+H], [200, 200+H]];
            const pT = [[200, 200-D], [200+W, 200-D], [200+W, 200], [200, 200]];
            const pB = [[200, 200+H], [200+W, 200+H], [200+W, 200+H+D], [200, 200+H+D]];
            const pL = [[200-D, 200], [200, 200], [200, 200+H], [200-D, 200+H]];
            const pR = [[200+W, 200], [200+W+D, 200], [200+W+D, 200+H], [200+W, 200+H]];
            const pBa = [[200, 200-D-H], [200+W, 200-D-H], [200+W, 200-D], [200, 200-D]]; 

            svg += drawPoly([f_tl, f_tr, f_br, f_bl], pF); 
            svg += drawPoly([b_tl, b_tr, f_tr, f_tl], pT); 
            svg += drawPoly([f_bl, f_br, b_br, b_bl], pB); 
            svg += drawPoly([b_tl, f_tl, f_bl, b_bl], pL); 
            svg += drawPoly([f_tr, b_tr, b_br, f_br], pR); 
            svg += drawPoly([b_bl, b_br, b_tr, b_tl], pBa); 
        }
        else if (type === 'pyramide') {
            // 🌟 NOUVEAU : PYRAMIDE À BASE CARRÉE (Dépliement en Étoile exacte) 🌟
            const W = 100, H = 140, H_tri = 90;
            const v3_bl = [190, 320], v3_br = [270, 320], v3_tr = [310, 260], v3_tl = [230, 260];
            const apex3D = [250, 130];

            const pBase = [[200, 300], [300, 300], [300, 200], [200, 200]];
            const pBot  = [[200, 300], [300, 300], [250, 300+H_tri]];
            const pRight = [[300, 300], [300, 200], [300+H_tri, 250]];
            const pTop   = [[300, 200], [200, 200], [250, 200-H_tri]];
            const pLeft  = [[200, 200], [200, 300], [200-H_tri, 250]];

            svg += drawPoly([v3_bl, v3_br, v3_tr, v3_tl], pBase);  // Base carrée
            svg += drawPoly([v3_bl, v3_br, apex3D], pBot);        // Triangle Bas
            svg += drawPoly([v3_br, v3_tr, apex3D], pRight);       // Triangle Droit
            svg += drawPoly([v3_tr, v3_tl, apex3D], pTop);         // Triangle Haut
            svg += drawPoly([v3_tl, v3_bl, apex3D], pLeft);        // Triangle Gauche
        }
        else if (type === 'prisme') {
            const W = 100, H = 140, D = 86; 
            const f_tl=[200, 200], f_tr=[300, 200], f_br=[300, 340], f_bl=[200, 340];
            const a_t=[280, 150], a_b=[280, 290]; 
            
            const pF = [[200, 200], [300, 200], [300, 340], [200, 340]];
            const pTop = [[200, 200], [300, 200], [250, 200-D]];
            const pBot = [[200, 340], [300, 340], [250, 340+D]];
            const pL = [[100, 200], [200, 200], [200, 340], [100, 340]];
            const pR = [[300, 200], [400, 200], [400, 340], [300, 340]];

            svg += drawPoly([f_tl, f_tr, f_br, f_bl], pF);
            svg += drawPoly([f_tl, f_tr, a_t], pTop);
            svg += drawPoly([f_bl, f_br, a_b], pBot);
            svg += drawPoly([a_t, f_tl, f_bl, a_b], pL);
            svg += drawPoly([f_tr, a_t, a_b, f_br], pR);
        }
        else if (type === 'cylindre') {
            const R = 45, H = 140;
            const W2D = 2 * Math.PI * R; 
            const W3D = 2 * R;
            const curW = W3D * (1-f) + W2D * f;
            const ry3D = 18;
            const curRY = ry3D * (1-f) + R * f;
            const topY = cy - H/2, botY = cy + H/2;
            
            let path = `M ${cx - curW/2} ${topY} Q ${cx} ${topY + ry3D*(1-f)} ${cx + curW/2} ${topY} L ${cx + curW/2} ${botY} Q ${cx} ${botY + ry3D*(1-f)} ${cx - curW/2} ${botY} Z`;
            svg += `<path d="${path}" fill="${col}" fill-opacity="${o}" stroke="${col}" stroke-width="2.5"/>`;
            
            svg += `<ellipse cx="${cx}" cy="${topY - curRY*f}" rx="${R}" ry="${curRY}" fill="${col}" fill-opacity="${o}" stroke="${col}" stroke-width="2.5"/>`;
            svg += `<ellipse cx="${cx}" cy="${botY + curRY*f}" rx="${R}" ry="${curRY}" fill="${col}" fill-opacity="${o}" stroke="${col}" stroke-width="2.5"/>`;
        }
        else if (type === 'cone') {
            const R = 60, H = 150;
            const L = Math.sqrt(R*R + H*H); 
            const anglePatron = (R/L) * Math.PI * 2; 
            const apexY = cy - H/2, botY3D = cy + H/2;
            
            let curRy = 15*(1-f) + R*f;
            let curCy = botY3D*(1-f) + (apexY + L + R)*f;
            svg += `<ellipse cx="${cx}" cy="${curCy}" rx="${R}" ry="${curBaseRy = ry3D = curRy}" fill="${col}" fill-opacity="${o}" stroke="${col}" stroke-width="2.5"/>`;

            if (f < 0.01) { 
                svg += `<polygon points="${cx},${cy-H/2} ${cx-R},${cy+H/2} ${cx+R},${cy+H/2}" fill="${col}" fill-opacity="${o}" stroke="${col}" stroke-width="2.5"/>`;
            } else { 
                const a1 = (90 + anglePatron/2) * Math.PI/180;
                const a2 = (90 - anglePatron/2) * Math.PI/180;
                let curL = R*(1-f) + L*f;
                let x1 = cx + curL * Math.cos(a1), y1 = apexY + 160*(1-f) + curL * Math.sin(a1)*f;
                let x2 = cx + curL * Math.cos(a2), y2 = apexY + 160*(1-f) + curL * Math.sin(a2)*f;
                svg += `<path d="M ${cx} ${apexY} L ${x1} ${y1} A ${curL} ${curL} 0 ${(anglePatron > Math.PI && f > 0.8)?1:0} 0 ${x2} ${y2} Z" fill="${col}" fill-opacity="${o}" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
            }
        }

        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg + `</svg>`)));
    },

    buildOnCanvas: function(type, factor, color) {
        const b64 = this.generateSVG(type, factor, color);
        const img = new Image();
        img.onload = () => {
            const cx = (window.innerWidth/2 - panX)/zoom, cy = (window.innerHeight/2 - panY)/zoom;
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            
            this.currentSolidId = nextId++;
            images.push({ id: this.currentSolidId, x: cx - 250, y: cy - 250, w: 500, h: 500, cx:0, cy:0, cw:500, ch:500, src: img.src, z: globalZ++ });
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw();
            
            this.createCanvasRemote(this.currentSolidId, type, factor, color);
        };
        img.src = b64;
    },

    createCanvasRemote: function(id, type, factor, color) {
        if(document.getElementById('solid-patron-remote')) document.getElementById('solid-patron-remote').remove();
        const remote = document.createElement('div'); remote.id = 'solid-patron-remote';
        remote.style.cssText = "position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); z-index:10005; display:flex; align-items:center; padding: 12px 20px; gap: 15px; border: 2px solid #2d3436; font-family:sans-serif;";
        remote.innerHTML = `
            <div style="font-weight:bold; font-size:14px; color:#2d3436;">🧊 MANIPULATION :</div>
            <span style="font-size:12px; color:#636e72;">SOLIDE</span>
            <input type="range" min="0" max="1" step="0.01" value="${factor}" style="width:200px; cursor:pointer;" oninput="updateSolidCanvas(this.value, ${id}, '${type}', '${color}')">
            <span style="font-size:12px; color:#636e72;">PATRON</span>
            <button onclick="document.getElementById('solid-patron-remote').remove()" style="margin-left:15px; background:#f1f2f6; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; color:#e74c3c; font-weight:bold;">Fermer</button>
        `;
        document.body.appendChild(remote);
    }
});


// ------------------------------------------------------------------------------
// 132. GÉOMÉTRIE DU LABYRINTHE (Orthogonal & Hexagonal Fonctionnel et Résolu)
// ------------------------------------------------------------------------------
registerPlugin('mazeGeneratorTool', 'Jeux', {
    cachedData: null,

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Générateur de Labyrinthes'; 
      btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3v18h8" />
    <path d="M7 3h14v18h-5" />
    <path d="M11 3v5H7" />
    <path d="M3 12h13" />
    <path d="M11 12v5H7" />
    <path d="M16 6v12" />
</svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    
    openPrompt: function() {
        this.cachedData = null; 
        openCustomPrompt("Créer un Labyrinthe", [
            { type: 'select', label: 'Structure', value: 'orthogonal', options: [{value: 'orthogonal', label: 'Classique (Rectangle)'}, {value: 'hexagonal', label: 'Nid d\'Abeille (Hexagones)'}] },
            { type: 'select', label: 'Largeur (Colonnes)', value: '15', options: [{value: '10', label: '10'}, {value: '15', label: '15'}, {value: '20', label: '20'}] },
            { type: 'select', label: 'Hauteur (Lignes)', value: '10', options: [{value: '10', label: '10'}, {value: '15', label: '15'}, {value: '20', label: '20'}] },
            { type: 'select', label: 'Thème', value: 'classic', options: [{value: 'classic', label: 'Classique'}, {value: 'blueprint', label: 'Plan Bleu'}] },
            { type: 'select', label: 'Solution', value: 'hidden', options: [{value: 'none', label: 'Aucune'}, {value: 'hidden', label: 'Cachée (Gomme)'}, {value: 'visible', label: 'Visible'}] }
        ], 
        (res) => {
            let cols = parseInt(res[1]) || 15; let rows = parseInt(res[2]) || 10;
            this.cachedData = this.generateMazeData(res[0], cols, rows, res[3]);
            let html = `<div style="display:flex; gap:15px; width:100%; height:100%; justify-content:center; align-items:center;">`;
            html += `<img src="${this.cachedData.base}" style="max-height:110px; object-fit:contain; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.15));">`;
            if (res[4] === 'visible') html += `<img src="${this.cachedData.sol}" style="max-height:110px; object-fit:contain; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.15));">`;
            else if (res[4] === 'hidden') html += `<img src="${this.cachedData.cache}" style="max-height:110px; object-fit:contain; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.15));">`;
            return html + `</div>`;
        }, 
        (res) => {
            if(!this.cachedData) return;
            showToast("🌀 Insertion du labyrinthe...");
            setTimeout(() => this.buildMazeOnCanvas(res[4]), 50);
        });
    },

    generateMazeData: function(struct, cols, rows, theme) {
        let bg = theme==='blueprint'?'#0984e3':'#ffffff', wallColor = theme==='blueprint'?'#ffffff':'#2d3436', solColor = '#e74c3c';
        let w = 400, h = 400, baseSvg = '', solSvg = '';

        if (struct === 'orthogonal') {
            const cellW = 25; w = cols * cellW; h = rows * cellW;
            let maze = Array(rows).fill(0).map(() => Array(cols).fill(0).map(() => ({n:1, s:1, e:1, w:1, v:0})));
            let stack = [[0, 0]]; maze[0][0].v = 1;

            while(stack.length > 0) {
                let [r, c] = stack[stack.length - 1]; let unvisited = [];
                if(r > 0 && !maze[r-1][c].v) unvisited.push([r-1, c, 'n', 's']); if(r < rows-1 && !maze[r+1][c].v) unvisited.push([r+1, c, 's', 'n']);
                if(c > 0 && !maze[r][c-1].v) unvisited.push([r, c-1, 'w', 'e']); if(c < cols-1 && !maze[r][c+1].v) unvisited.push([r, c+1, 'e', 'w']);
                if(unvisited.length > 0) { let next = unvisited[Math.floor(Math.random() * unvisited.length)]; maze[r][c][next[2]] = 0; maze[next[0]][next[1]][next[3]] = 0; maze[next[0]][next[1]].v = 1; stack.push([next[0], next[1]]); } else stack.pop();
            }

            let queue = [{r:0, c:0, path: [[0,0]]}], visited = Array(rows).fill(0).map(() => Array(cols).fill(false)); visited[0][0] = true; let solutionPath = [];
            while(queue.length > 0) {
                let curr = queue.shift(); if(curr.r === rows-1 && curr.c === cols-1) { solutionPath = curr.path; break; }
                let cell = maze[curr.r][curr.c];
                if(!cell.n && !visited[curr.r-1][curr.c]) { visited[curr.r-1][curr.c] = true; queue.push({r:curr.r-1, c:curr.c, path: [...curr.path, [curr.r-1, curr.c]]}); }
                if(!cell.s && !visited[curr.r+1][curr.c]) { visited[curr.r+1][curr.c] = true; queue.push({r:curr.r+1, c:curr.c, path: [...curr.path, [curr.r+1, curr.c]]}); }
                if(!cell.w && !visited[curr.r][curr.c-1]) { visited[curr.r][curr.c-1] = true; queue.push({r:curr.r, c:curr.c-1, path: [...curr.path, [curr.r, curr.c-1]]}); }
                if(!cell.e && !visited[curr.r][curr.c+1]) { visited[curr.r][curr.c+1] = true; queue.push({r:curr.r, c:curr.c+1, path: [...curr.path, [curr.r, curr.c+1]]}); }
            }

            const drawSVG = (showSolution) => {
                let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}" rx="8"/>`;
                if (showSolution && solutionPath.length > 0) {
                    svg += `<polyline points="`; solutionPath.forEach(p => { svg += `${p[1]*cellW + cellW/2},${p[0]*cellW + cellW/2} `; }); svg += `" fill="none" stroke="${solColor}" stroke-width="${cellW/2.5}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
                }
                svg += `<g stroke="${wallColor}" stroke-width="3" stroke-linecap="round">`;
                for(let r=0; r<rows; r++) { for(let c=0; c<cols; c++) { let x = c * cellW, y = r * cellW; if(maze[r][c].n) svg += `<line x1="${x}" y1="${y}" x2="${x+cellW}" y2="${y}"/>`; if(maze[r][c].s) svg += `<line x1="${x}" y1="${y+cellW}" x2="${x+cellW}" y2="${y+cellW}"/>`; if(maze[r][c].e) svg += `<line x1="${x+cellW}" y1="${y}" x2="${x+cellW}" y2="${y+cellW}"/>`; if(maze[r][c].w) svg += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+cellW}"/>`; } }
                svg += `</g><rect x="1.5" y="2" width="${w-3}" height="${h-4}" fill="none" stroke="${wallColor}" stroke-width="4" rx="6"/><circle cx="${cellW/2}" cy="${cellW/2}" r="${cellW/3}" fill="#2ecc71"/><circle cx="${w - cellW/2}" cy="${h - cellW/2}" r="${cellW/3}" fill="#e74c3c"/></svg>`;
                return svg;
            };
            baseSvg = drawSVG(false); solSvg = drawSVG(true);
        } 
        else if (struct === 'hexagonal') {
            const R = 18; 
            const hDist = R * Math.sqrt(3); 
            const vDist = R * 1.5;
            w = Math.ceil(cols * hDist + hDist/2 + 20); 
            h = Math.ceil(rows * vDist + R/2 + 20);

            let maze = Array(rows).fill(0).map(() => Array(cols).fill(0).map(() => ({ walls: [1,1,1,1,1,1], v: 0 })));
            let stack = [[0, 0]]; maze[0][0].v = 1;

            const getHexNeighbors = (r, c) => {
                let n = []; let isOdd = r % 2 !== 0;
                let dirs = [];
                if (!isOdd) { // Ligne paire
                    dirs = [{dr: 1, dc: 0, w: 0, opp: 3}, {dr: 1, dc: -1, w: 1, opp: 4}, {dr: 0, dc: -1, w: 2, opp: 5}, {dr: -1, dc: -1, w: 3, opp: 0}, {dr: -1, dc: 0, w: 4, opp: 1}, {dr: 0, dc: 1, w: 5, opp: 2}];
                } else { // Ligne impaire
                    dirs = [{dr: 1, dc: 1, w: 0, opp: 3}, {dr: 1, dc: 0, w: 1, opp: 4}, {dr: 0, dc: -1, w: 2, opp: 5}, {dr: -1, dc: 0, w: 3, opp: 0}, {dr: -1, dc: 1, w: 4, opp: 1}, {dr: 0, dc: 1, w: 5, opp: 2}];
                }
                dirs.forEach(d => { let nr = r+d.dr, nc = c+d.dc; if(nr>=0 && nr<rows && nc>=0 && nc<cols) n.push({r:nr, c:nc, w:d.w, opp:d.opp}); });
                return n;
            };

            while(stack.length > 0) {
                let [r, c] = stack[stack.length - 1]; let neighbors = getHexNeighbors(r, c).filter(n => !maze[n.r][n.c].v);
                if(neighbors.length > 0) { let next = neighbors[Math.floor(Math.random() * neighbors.length)]; maze[r][c].walls[next.w] = 0; maze[next.r][next.c].walls[next.opp] = 0; maze[next.r][next.c].v = 1; stack.push([next.r, next.c]); } else stack.pop();
            }

            let queue = [{r:0, c:0, path: [[0,0]]}], visited = Array(rows).fill(0).map(() => Array(cols).fill(false)); visited[0][0] = true; let solutionPath = [];
            while(queue.length > 0) {
                let curr = queue.shift(); if(curr.r === rows-1 && curr.c === cols-1) { solutionPath = curr.path; break; }
                getHexNeighbors(curr.r, curr.c).forEach(n => { if(!maze[curr.r][curr.c].walls[n.w] && !visited[n.r][n.c]) { visited[n.r][n.c] = true; queue.push({r:n.r, c:n.c, path: [...curr.path, [n.r, n.c]]}); } });
            }

            const drawHexSVG = (showSolution) => {
                let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}" rx="12"/>`;
                
                if(showSolution && solutionPath.length > 0) {
                    svg += `<polyline points="`; solutionPath.forEach(p => { let cx = 10 + hDist/2 + p[1]*hDist + ((p[0]%2!==0)?hDist/2:0), cy = 10 + R + p[0]*vDist; svg += `${cx},${cy} `; }); svg += `" fill="none" stroke="${solColor}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
                }

                svg += `<g stroke="${wallColor}" stroke-width="3" stroke-linecap="round">`;
                for(let r=0; r<rows; r++) {
                    for(let c=0; c<cols; c++) {
                        let cx = 10 + hDist/2 + c*hDist + ((r%2!==0)?hDist/2:0), cy = 10 + R + r*vDist;
                        let pts = []; 
                        for(let i=0; i<6; i++) { 
                            let a = (30 + i*60) * Math.PI / 180; 
                            pts.push({x: cx+R*Math.cos(a), y: cy+R*Math.sin(a)}); 
                        }
                        for(let wIdx=0; wIdx<6; wIdx++) {
                            if(maze[r][c].walls[wIdx]) {
                                let p1 = pts[wIdx], p2 = pts[(wIdx+1)%6];
                                if(!((r===0 && c===0 && wIdx===3) || (r===rows-1 && c===cols-1 && wIdx===0))) { 
                                    svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>`; 
                                }
                            }
                        }
                    }
                }
                svg += `</g>`;
                
                let sX = 10 + hDist/2, sY = 10 + R;
                let eX = 10 + hDist/2 + (cols-1)*hDist + (((rows-1)%2!==0)?hDist/2:0), eY = 10 + R + (rows-1)*vDist;
                svg += `<circle cx="${sX-10}" cy="${sY-10}" r="6" fill="#2ecc71"/><circle cx="${eX+10}" cy="${eY+10}" r="6" fill="#e74c3c"/></svg>`;
                return svg;
            };
            baseSvg = drawHexSVG(false); solSvg = drawHexSVG(true);
        }

        let cacheSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#b2bec3" stroke="#636e72" stroke-width="6" rx="10"/><text x="${w/2}" y="${h/2 - 12}" font-family="sans-serif" font-weight="bold" font-size="${Math.min(32, w/6)}" fill="#2d3436" text-anchor="middle" dominant-baseline="central">Solution cachée</text><text x="${w/2}" y="${h/2 + 25}" font-family="sans-serif" font-size="${Math.min(18, w/10)}" fill="#2d3436" text-anchor="middle" dominant-baseline="central">Prenez la gomme !</text></svg>`;

        return {
            base: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(baseSvg))),
            sol: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(solSvg))),
            cache: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(cacheSvg))),
            w: w, h: h
        };
    },
    
    buildMazeOnCanvas: function(solType) {
        let data = this.cachedData; if(!data) return;

        const loadImg = (b64, x, y) => {
            return new Promise(resolve => {
                let img = new Image();
                img.onload = () => {
                    if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                    images.push({ id: nextId++, x, y, w: data.w, h: data.h, cx:0, cy:0, cw:data.w, ch:data.h, src: img.src, z: globalZ++ });
                    resolve();
                };
                img.src = b64;
            });
        };

        const cx = (window.innerWidth / 2 - panX) / zoom; const cy = (window.innerHeight / 2 - panY) / zoom;
        let pX = cx - (solType !== 'none' ? data.w + 20 : data.w/2), pY = cy - data.h/2;
        let sX = pX + data.w + 40;

        loadImg(data.base, pX, pY).then(() => { if(solType !== 'none') return loadImg(data.sol, sX, pY); }).then(() => { if(solType === 'hidden') return loadImg(data.cache, sX, pY); }).then(() => {
            if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
        });
    }
});


// ---------------------------------------------------------
// 218. JEU : LE MOT LE PLUS LONG (Tirage interactif V / C)
// ---------------------------------------------------------
registerPlugin('longestWordTool', 'Jeux', {
    currentLetters: [],
    currentWordGridId: null,

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Le Mot le Plus Long'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10a4 4 0 0 1 8 0v10 M4 15h8 M14 6v14M14 10h4a2 2 0 0 1 0 4h-4 M14 14h4a2 2 0 0 1 0 4h-4"/></svg>`;
        grid.appendChild(btn);

        btn.addEventListener('click', (e) => {
            e.stopPropagation(); if (typeof closeAllPopups === 'function') closeAllPopups();
            this.currentLetters = [];
            this.buildEmptyBoard();
            this.createGameRemote();
        });

        window.wordGamePickLetter = (type) => {
            if(this.currentLetters.length >= 9) { showToast("🛑 Déjà 9 lettres tirées !"); return; }
            const vowels = "AAAAAAAAAAEEEEEEEEEEEEEEEEIIIIIIIIIOOOOOOOOUUUUUUUY"; 
            const consonants = "BBCCCDDDDDFFFFGGHHJKLLLLLLLMMMMMNNNNNNNNPPPPQRRRRRRRRRSSSSSSSSSTTTTTTTTTVVWXZ";
            let pool = (type === 'vowel') ? vowels : consonants;
            let letter = pool[Math.floor(Math.random() * pool.length)];
            this.currentLetters.push(letter);
            this.updateBoard();
        };

        window.wordGameReset = () => {
            this.currentLetters = []; this.updateBoard();
            let timerEl = document.getElementById('wordgame-timer-display'); if(timerEl) timerEl.innerHTML = "30s";
        };

        window.wordGameStartTimer = () => {
            let sec = 30; const timerEl = document.getElementById('wordgame-timer-display'); const btn = document.getElementById('btn-wg-timer');
            if(!timerEl || btn.disabled) return;
            btn.disabled = true; btn.style.opacity = 0.5;
            let interval = setInterval(() => {
                sec--; if(timerEl) timerEl.innerHTML = sec + "s";
                if(sec <= 10) timerEl.style.color = "#e74c3c";
                if(sec <= 0) { clearInterval(interval); btn.disabled = false; btn.style.opacity = 1; timerEl.style.color = "#2d3436"; showToast("🔔 Temps écoulé ! À vos mots !"); }
            }, 1000);
        };
    },

    getBoardSVG: function() {
        let w = 720, h = 135;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svg += `<rect width="${w}" height="${h}" fill="#2d3436" rx="12" stroke="#dfe6e9" stroke-width="2.5"/>`;
        for(let i=0; i<9; i++) {
            let x = 15 + i * 78;
            let char = this.currentLetters[i] || "";
            svg += `<rect x="${x}" y="20" width="72" height="95" fill="#f1f2f6" rx="8" stroke="#b2bec3" stroke-width="1"/>`;
            if(char) {
                svg += `<text x="${x + 36}" y="67" font-family="sans-serif" font-weight="900" font-size="56" fill="#0984e3" text-anchor="middle" dominant-baseline="central">${char}</text>`;
            } else {
                svg += `<circle cx="${x+36}" cy="67" r="3" fill="#b2bec3"/>`;
            }
        }
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg + `</svg>`)));
    },

    buildEmptyBoard: function() {
        let w = 720, h = 135;
        let img = new Image();
        img.onload = () => {
            let cx = (window.innerWidth/2 - panX)/zoom, cy = (window.innerHeight/2 - panY)/zoom;
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            this.currentWordGridId = nextId++;
            images.push({ id: this.currentWordGridId, x: cx - w/2, y: cy - h/2 - 40, w: w, h: h, cx:0, cy:0, cw:w, ch:h, src: img.src, z: globalZ++ });
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw();
        };
        img.src = this.getBoardSVG();
    },

    updateBoard: function() {
        let imgObj = images.find(img => img.id === this.currentWordGridId);
        if (imgObj) {
            const img = new Image();
            img.onload = () => { 
                if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                imgObj.src = img.src; 
                if(typeof draw === 'function') draw(); 
            };
            img.src = this.getBoardSVG();
        }
    },

    createGameRemote: function() {
        if(document.getElementById('word-game-remote')) document.getElementById('word-game-remote').remove();
        const remote = document.createElement('div'); remote.id = 'word-game-remote';
        remote.style.cssText = "position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); z-index:10005; display:flex; align-items:center; padding: 10px 20px; gap: 12px; border: 2px solid #0984e3; font-family:sans-serif;";
        remote.innerHTML = `
            <div style="font-weight:bold; font-size:14px; color:#2d3436; margin-right:5px;">🔤 TIRAGE :</div>
            <button onclick="wordGamePickLetter('vowel')" style="padding:10px 16px; background:#0984e3; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:14px; box-shadow:0 2px 4px rgba(9,132,227,0.3);">🔵 Voyelle</button>
            <button onclick="wordGamePickLetter('consonant')" style="padding:10px 16px; background:#d63031; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:14px; box-shadow:0 2px 4px rgba(214,48,49,0.3);">🔴 Consonne</button>
            <div style="width:1px; height:35px; background:#ccc; margin:0 5px;"></div>
            <div id="wordgame-timer-display" style="font-size:24px; font-weight:bold; color:#2d3436; min-width:50px; text-align:center;">30s</div>
            <button id="btn-wg-timer" onclick="wordGameStartTimer()" style="padding:10px 14px; background:#2ecc71; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:14px;">⏳ Lancer</button>
            <button onclick="wordGameReset()" style="padding:8px; background:transparent; color:#636e72; border:none; cursor:pointer; text-decoration:underline; font-size:13px;">Effacer</button>
            <button onclick="document.getElementById('word-game-remote').remove()" style="padding:8px; background:transparent; color:#e74c3c; border:none; cursor:pointer; font-size:13px; font-weight:bold; margin-left:5px;">X</button>
        `;
        document.body.appendChild(remote);
    }
});




// 14. FRISE HISTORIQUE
registerPlugin('friseTool', 'Histoire-Geographie', {
    currentStamp: null, editingImage: null, state: { start: "1900", blocks: [{color:"#0984e3", end:"1950"}, {color:"#e74c3c", end:"2000"}] },
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'frise'; btn.title = 'Frise Historique';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="3,10 19,10 23,14 19,18 3,18" fill="currentColor" fill-opacity="0.2"/><line x1="8" y1="10" x2="8" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/></svg>`;
        document.getElementById('plugins-grid').appendChild(btn);

        const builderHTML = `
        <div id="frise-builder-modal" style="display:none; position:absolute; left:calc(50vw - 210px); top:15vh;border-radius:12px ; width:420px; z-index:10001; background:#ffffff; border-radius:10px; box-shadow:0 15px 40px rgba(0,0,0,0.3); border:1px solid #dfe6e9; flex-direction:column;">
            <div id="frise-drag-handle" style="background:#1f2937; color:#ffffff; display:flex;border-radius:12px 12px 0px 0px; align-items:center; padding:10px 24px; cursor:grab; font-weight:bold; font-size:13px; letter-spacing:0.3px;">Constructeur de Frise</div>
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

registerPlugin('trafficLightTool', 'Gestion', {
    currentStamp: null, currentArgs: null,
    
    // Liste combinée des feux et des panneaux pour les menus déroulants
    signOptions: [
        {value:'light_green', label:'🟢 Feu Vert (Autorisé)'},
        {value:'light_orange', label:'🟠 Feu Orange (Chuchotement)'},
        {value:'light_red', label:'🔴 Feu Rouge (Silence)'},
        {value:'light_off', label:'⚫ Feu Éteint'},
        {value:'sign_stop', label:'🛑 Panneau STOP'},
        {value:'sign_warning', label:'⚠️ Panneau Attention'},
        {value:'sign_forbidden', label:'⛔ Sens Interdit'},
        {value:'sign_yield', label:'🔻 Céder le passage'},
        {value:'sign_silence', label:'🔇 Panneau "Chut !"' }
    ],

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'traffic'; 
        btn.title = 'Signalisation (Feux & Panneaux)';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="4" ry="4"/>
            <circle cx="12" cy="7" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="17" r="2.5"/>
        </svg>`;
        grid.appendChild(btn);
        
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#bar-tools .btn, #plugins-grid .btn').forEach(b => b.classList.remove('active')); 
            btn.classList.add('active'); 
            if(typeof setMode === 'function') setMode('traffic');
            
            openCustomPrompt("Signalisation de Classe", [
                { type: 'select', label: "Modèle", value: "light_green", options: this.signOptions },
                { type: 'select', label: "Style (Feux)", value: "neon", options: [{value:'neon', label:'Moderne (Brillant)'}, {value:'classic', label:'Classique'}] }
            ], 
            (res) => this.genSVG(res), 
            (res) => { 
                this.createImage(this.genSVG(res, true), (s) => { 
                    this.currentStamp = s; this.currentArgs = res; 
                    if(typeof showToast === 'function') showToast("📌 Cliquez pour poser le panneau !"); 
                    if(typeof draw === 'function') draw(); 
                }); 
            });
            e.stopPropagation();
        });
    },

    edit: function(imgObj) {
        openCustomPrompt("Modifier la Signalisation", [
            { type: 'select', label: "Modèle", value: imgObj.pluginData.args[0], options: this.signOptions },
            { type: 'select', label: "Style (Feux)", value: imgObj.pluginData.args[1], options: [{value:'neon', label:'Moderne (Brillant)'}, {value:'classic', label:'Classique'}] }
        ], 
        (res) => this.genSVG(res), 
        (res) => { 
            this.createImage(this.genSVG(res, true), (s) => { 
                imgObj.src = s.src; imgObj.w = s.w; imgObj.h = s.h; imgObj.cw = s.w; imgObj.ch = s.h;
                imgObj.pluginData.args = res; 
                
                // 🔧 CORRECTION CACHE : On met à jour l'image en cache pour l'édition !
                if (typeof imageCache !== 'undefined') imageCache[s.src] = s.img;
                
                if(typeof draw === 'function') draw(); 
                if(typeof saveState === 'function') saveState(); 
            }); 
        });
    },

    genSVG: function(res, isExp=false) {
        let type = res[0]; 
        let style = res[1];

        // 🚦 CAS 1 : FEUX TRICOLORES
        if (type.startsWith('light_')) {
            let status = type.split('_')[1]; // green, orange, red, off
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
        } 
        
        // 🛑 CAS 2 : PANNEAUX DE SIGNALISATION
        else if (type.startsWith('sign_')) {
            let sign = type.split('_')[1]; // stop, warning, forbidden, yield, silence
            let size = isExp ? 200 : 100; // Les panneaux sont carrés
            
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">`;
            
            if (sign === 'stop') {
                svg += `<polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" fill="#e74c3c" stroke="#c0392b" stroke-width="2"/>`;
                svg += `<text x="50" y="60" font-family="sans-serif" font-weight="bold" font-size="26" fill="white" text-anchor="middle">STOP</text>`;
            } 
            else if (sign === 'warning') {
                svg += `<polygon points="50,15 90,85 10,85" fill="#f1c40f" stroke="#e74c3c" stroke-width="8" stroke-linejoin="round"/>`;
                svg += `<text x="50" y="73" font-family="sans-serif" font-weight="bold" font-size="45" fill="#2c3e50" text-anchor="middle">!</text>`;
            } 
            else if (sign === 'forbidden') {
                svg += `<circle cx="50" cy="50" r="42" fill="#e74c3c"/>`;
                svg += `<rect x="25" y="42" width="50" height="16" fill="white"/>`;
            } 
            else if (sign === 'yield') {
                svg += `<polygon points="10,15 90,15 50,85" fill="white" stroke="#e74c3c" stroke-width="8" stroke-linejoin="round"/>`;
            }
            else if (sign === 'silence') {
                svg += `<circle cx="50" cy="50" r="40" fill="white" stroke="#e74c3c" stroke-width="8"/>`;
                svg += `<text x="50" y="62" font-family="sans-serif" font-weight="bold" font-size="34" fill="#2c3e50" text-anchor="middle">Chut</text>`;
                svg += `<path d="M25,25 L75,75" stroke="#e74c3c" stroke-width="8"/>`;
            }
            
            svg += `</svg>`;
            return svg;
        }
    },

    createImage: function(svg, callback) {
        let base64 = btoa(unescape(encodeURIComponent(svg)));
        const img = new Image();
        img.onload = () => callback({ img: img, src: img.src, w: img.width, h: img.height });
        img.src = "data:image/svg+xml;base64," + base64;
    },

    onPointerMove: function(rawPos) {
        if (typeof mode !== 'undefined' && mode === 'traffic' && this.currentStamp) { 
            mouseLogicalPos = { x: rawPos.x, y: rawPos.y }; 
            if(typeof draw==='function') draw(); 
            return false; 
        } 
        return false;
    },

    onDraw: function(ctx) { 
        if (typeof mode !== 'undefined' && mode === 'traffic' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha = 0.8; 
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2, this.currentStamp.w, this.currentStamp.h); 
            ctx.globalAlpha = 1.0; 
        } 
    },

    onPointerDown: function(rawPos) { 
        if (typeof mode !== 'undefined' && mode === 'traffic' && this.currentStamp) { 
            
            // 🔧 LA CORRECTION EST ICI : On met l'image générée dans le cache de l'application !
            if (typeof imageCache !== 'undefined') {
                imageCache[this.currentStamp.src] = this.currentStamp.img;
            }
            
            images.push({ 
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(), 
                x: rawPos.x - this.currentStamp.w/2, 
                y: rawPos.y - this.currentStamp.h/2, 
                w: this.currentStamp.w, 
                h: this.currentStamp.h, 
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, 
                src: this.currentStamp.src, 
                z: typeof globalZ !== 'undefined' ? globalZ++ : 1000, 
                pluginData: {id:'trafficLightTool', args:this.currentArgs} 
            }); 
            
            if(typeof saveState === 'function') saveState(); 
            if(typeof setMode === 'function') setMode('pointer'); 
            
            // On désactive le bouton
            document.querySelectorAll('#plugins-grid .btn').forEach(b => b.classList.remove('active'));
            
            this.currentStamp = null; 
            if(typeof draw === 'function') draw(); 
            return true; 
        } 
        return false; 
    }
});


// ==========================================
// 2. ARBRE STUDIO (Fractions Vraies + Bug Cache Corrigé)
// ==========================================
registerPlugin('probabilityTreeTool', 'Mathematiques', {
    currentStamp: null, currentTreeData: null,
    init: function() {
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'probatree'; btn.title = 'Probabilité';
       btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 12h4"/>
    <path d="M8 12l4-6h4"/>
    <path d="M8 12l4 6h4"/>
    <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/>
</svg>`;
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
// 1. GÉNÉRATEUR D'EXERCICES : CALCULS
// ==========================================
registerPlugin('mathExerciseGenerator', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid');
        if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Calculs (Texte)'; 
        // Icône Calculatrice
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="16" y1="18" x2="16" y2="18"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Générer un exercice", [
            { type: 'select', label: 'Opération', value: 'mult', options: [{value: 'mult', label: 'Multiplications'}, {value: 'add', label: 'Additions'}, {value: 'sub', label: 'Soustractions'}, {value: 'div', label: 'Divisions'}] },
            { type: 'select', label: 'Quantité', value: '20', options: [{value: '10', label: '10 calculs'}, {value: '20', label: '20 calculs'}, {value: '30', label: '30 calculs'}] },
            { type: 'select', label: 'Minuteur', value: '0', options: [{value: '0', label: 'Libre'}, {value: '1', label: '1 minute'}, {value: '3', label: '3 minutes'}] }
        ], null, (res) => this.buildGrid(res[0], parseInt(res[1]), parseInt(res[2]))); // null = pas d'aperçu
    },
    buildGrid: function(type, count, timerMinutes) {
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const minSpacingX = 300; 
        const safeWidth = window.innerWidth - 260; 
        let actualCols = Math.floor(safeWidth / minSpacingX);
        if (actualCols > 4) actualCols = 4; 
        if (actualCols < 1) actualCols = 1; 
        
        const actualRows = Math.ceil(count / actualCols);
        const spacingX = Math.max(minSpacingX, safeWidth / actualCols); 
        const spacingY = 65;

        const gridWidth = (actualCols - 1) * spacingX + 200;
        const gridHeight = (actualRows - 1) * spacingY;
        const startX = logicalCenterX - (gridWidth / 2);
        const startY = logicalCenterY - (gridHeight / 2);
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

        for (let i = 0; i < count; i++) {
            let n1, n2, symbol;
            if (type === 'mult') { n1 = Math.floor(Math.random() * 8) + 2; n2 = Math.floor(Math.random() * 8) + 2; symbol = '×'; } 
            else if (type === 'add') { n1 = Math.floor(Math.random() * 89) + 11; n2 = Math.floor(Math.random() * 89) + 11; symbol = '+'; } 
            else if (type === 'sub') { n1 = Math.floor(Math.random() * 89) + 11; n2 = Math.floor(Math.random() * (n1 - 5)) + 2; symbol = '-'; } 
            else if (type === 'div') { n2 = Math.floor(Math.random() * 8) + 2; n1 = n2 * (Math.floor(Math.random() * 9) + 2); symbol = '÷'; }

            texts.push({
                id: nextId++, x: startX + (i % actualCols) * spacingX, y: startY + Math.floor(i / actualCols) * spacingY,
                content: `<b>${letters[i]})</b> ${n1} ${symbol} ${n2} = ........`,
                color: (typeof isDarkMode !== 'undefined' && isDarkMode) ? '#dfe6e9' : '#2d3436',
                fontSize: 24, fontFamily: 'sans-serif', align: 'left', locked: false, z: globalZ++
            });
        }
        this.launchTimer(timerMinutes);
        if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
    },
    launchTimer: function(m) {
        if(m<=0) return; document.getElementById('time-widget').classList.add('visible');
        document.querySelectorAll('.time-tab').forEach(t => t.classList.remove('active')); document.querySelector('.time-tab[data-tab="timer"]').classList.add('active');
        if (typeof timeMode !== 'undefined') timeMode = 'timer';
        document.getElementById('timer-m').value = m.toString().padStart(2, '0'); document.getElementById('timer-s').value = "00";
        document.getElementById('timer-inputs').style.display = 'flex'; document.getElementById('time-controls').style.display = 'flex'; document.getElementById('time-display').style.display = 'none';
        setTimeout(() => document.getElementById('btn-time-play').click(), 120);
    }
});

// ==========================================
// 2. GÉNÉRATEUR D'EXERCICES : CONVERSIONS
// ==========================================
registerPlugin('conversionExerciseGenerator', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Conversions'; 
        // Icône Règle
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="8" rx="1" /><path d="M6 8v3 M9 8v2 M12 8v3 M15 8v2 M18 8v3" stroke-width="1.5" /></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Conversions d'unités", [
            { type: 'select', label: 'Grandeur', value: 'len', options: [{value: 'len', label: 'Longueurs'}, {value: 'mass', label: 'Masses'}, {value: 'cap', label: 'Capacités'}] },
            { type: 'select', label: 'Quantité', value: '20', options: [{value: '10', label: '10 conversions'}, {value: '20', label: '20 conversions'}] },
            { type: 'select', label: 'Minuteur', value: '0', options: [{value: '0', label: 'Libre'}, {value: '1', label: '1 minute'}, {value: '3', label: '3 minutes'}] }
        ], null, (res) => this.buildGrid(res[0], parseInt(res[1]), parseInt(res[2]))); // null = pas d'aperçu
    },
    buildGrid: function(type, count, timerMinutes) {
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const minSpacingX = 350; 
        const safeWidth = window.innerWidth - 260; 
        let actualCols = Math.floor(safeWidth / minSpacingX);
        if (actualCols > 4) actualCols = 4; if (actualCols < 1) actualCols = 1;
        
        const actualRows = Math.ceil(count / actualCols);
        const spacingX = Math.max(minSpacingX, safeWidth / actualCols); 
        const spacingY = 65;

        const gridWidth = (actualCols - 1) * spacingX + 250;
        const gridHeight = (actualRows - 1) * spacingY;
        const startX = logicalCenterX - (gridWidth / 2);
        const startY = logicalCenterY - (gridHeight / 2);

        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        const units = { 'len': ['mm','cm','dm','m','dam','hm','km'], 'mass': ['mg','cg','dg','g','dag','hg','kg'], 'cap': ['mL','cL','dL','L','daL','hL'] };

        for (let i = 0; i < count; i++) {
            const list = units[type];
            let idx1 = Math.floor(Math.random() * list.length); let idx2 = Math.floor(Math.random() * list.length);
            while(idx1 === idx2) idx2 = Math.floor(Math.random() * list.length);
            let val = Math.floor(Math.random() * 999) + 1; if (Math.random() > 0.7) val = val / 10;

            texts.push({
                id: nextId++, x: startX + (i % actualCols) * spacingX, y: startY + Math.floor(i / actualCols) * spacingY,
                content: `<b>${letters[i]})</b> ${val} ${list[idx1]} = ........... ${list[idx2]}`,
                color: (typeof isDarkMode !== 'undefined' && isDarkMode) ? '#dfe6e9' : '#2d3436',
                fontSize: 24, fontFamily: 'sans-serif', align: 'left', locked: false, z: globalZ++
            });
        }
        PluginManager.plugins['mathExerciseGenerator'].launchTimer(timerMinutes);
        if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
    }
});

// ==========================================
// 3. GÉNÉRATEUR D'EXERCICES : ÉQUATIONS
// ==========================================
registerPlugin('equationExerciseGenerator', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = "Équations"; 
        // Icône Balance
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M7 21h10"/><path d="M5 8l-3 6h6L5 8zm14 0l-3 6h6l-3-6zM5 8h14"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Résolution d'équations", [
            { type: 'select', label: 'Niveau', value: 'add', options: [{value: 'add', label: 'Facile (x+a=b)'}, {value: 'mult', label: 'Moyen (ax=b)'}, {value: 'mixed', label: 'Avancé (ax+b=c)'}] },
            { type: 'select', label: 'Quantité', value: '10', options: [{value: '10', label: '10 équations'}, {value: '20', label: '20 équations'}] },
            { type: 'select', label: 'Minuteur', value: '0', options: [{value: '0', label: 'Libre'}, {value: '3', label: '3 minutes'}, {value: '5', label: '5 minutes'}] }
        ], null, (res) => this.buildGrid(res[0], parseInt(res[1]), parseInt(res[2]))); // null = pas d'aperçu
    },
    buildGrid: function(type, count, timerMinutes) {
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const minSpacingX = 380; 
        const safeWidth = window.innerWidth - 260; 
        let actualCols = Math.floor(safeWidth / minSpacingX);
        if (actualCols > 3) actualCols = 3; if (actualCols < 1) actualCols = 1;
        
        const actualRows = Math.ceil(count / actualCols);
        const spacingX = Math.max(minSpacingX, safeWidth / actualCols); 
        const spacingY = 65;

        const gridWidth = (actualCols - 1) * spacingX + 300;
        const gridHeight = (actualRows - 1) * spacingY;
        const startX = logicalCenterX - (gridWidth / 2);
        const startY = logicalCenterY - (gridHeight / 2);

        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

        for (let i = 0; i < count; i++) {
            let a, b, c, x, eqStr;
            if (type === 'add') { a = Math.floor(Math.random() * 20) + 1; x = Math.floor(Math.random() * 20) + 1; eqStr = `x + ${a} = ${x + a}`; } 
            else if (type === 'mult') { a = Math.floor(Math.random() * 9) + 2; x = Math.floor(Math.random() * 11) + 2; eqStr = `${a}x = ${a * x}`; } 
            else { a = Math.floor(Math.random() * 4) + 2; x = Math.floor(Math.random() * 10) + 1; b = Math.floor(Math.random() * 10) + 1; eqStr = `${a}x + ${b} = ${(a * x) + b}`; }

            texts.push({
                id: nextId++, x: startX + (i % actualCols) * spacingX, y: startY + Math.floor(i / actualCols) * spacingY,
                content: `<b>${letters[i]})</b> ${eqStr} &nbsp;➔&nbsp; x = ......`,
                color: (typeof isDarkMode !== 'undefined' && isDarkMode) ? '#dfe6e9' : '#2d3436',
                fontSize: 24, fontFamily: 'sans-serif', align: 'left', locked: false, z: globalZ++
            });
        }
        PluginManager.plugins['mathExerciseGenerator'].launchTimer(timerMinutes);
        if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
    }
});

// ==========================================
// GÉNÉRATEUR D'EXERCICES : CONJUGAISON FLASH
// ==========================================
registerPlugin('conjugationExerciseGenerator', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid');
        if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Conjugaison Flash'; 
        // Icône Édition / Stylo
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Conjugaison Flash", [
            { type: 'select', label: 'Temps', value: 'present', options: [{value: 'present', label: 'Présent'}, {value: 'imparfait', label: 'Imparfait'}, {value: 'futur', label: 'Futur Simple'}, {value: 'pcompose', label: 'Passé Composé'}] },
            { type: 'select', label: 'Quantité', value: '10', options: [{value: '10', label: '10 verbes'}, {value: '20', label: '20 verbes'}] },
            { type: 'select', label: 'Minuteur', value: '0', options: [{value: '0', label: 'Libre'}, {value: '3', label: '3 minutes'}, {value: '5', label: '5 minutes'}] }
        ], null, (res) => this.buildGrid(res[0], parseInt(res[1]), parseInt(res[2]))); // null = pas d'aperçu
    },
    buildGrid: function(tense, count, timerMinutes) {
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const minSpacingX = 400; 
        const safeWidth = window.innerWidth - 260; 
        
        let actualCols = Math.floor(safeWidth / minSpacingX);
        if (actualCols > 3) actualCols = 3; 
        if (actualCols < 1) actualCols = 1; 

        const actualRows = Math.ceil(count / actualCols);
        const spacingX = Math.max(minSpacingX, safeWidth / actualCols); 
        const spacingY = 65;

        const gridWidth = (actualCols - 1) * spacingX + 300;
        const gridHeight = (actualRows - 1) * spacingY;
        const startX = logicalCenterX - (gridWidth / 2);
        const startY = logicalCenterY - (gridHeight / 2);

        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        
        const verbs = ["Manger", "Finir", "Prendre", "Aller", "Faire", "Dire", "Pouvoir", "Vouloir", "Venir", "Voir", "Partir", "Écrire"];
        const pronouns = ["Je / J'", "Tu", "Il / Elle", "Nous", "Vous", "Ils / Elles"];
        const tensesLabels = { 'present': 'Présent', 'imparfait': 'Imparfait', 'futur': 'Futur', 'pcompose': 'Passé Comp.' };

        for (let i = 0; i < count; i++) {
            const v = verbs[Math.floor(Math.random() * verbs.length)];
            const p = pronouns[Math.floor(Math.random() * pronouns.length)];
            const t = tensesLabels[tense];

            texts.push({
                id: nextId++, 
                x: startX + (i % actualCols) * spacingX, 
                y: startY + Math.floor(i / actualCols) * spacingY,
                content: `<b>${letters[i]})</b> ${v} (${t}) ➔ ${p} ....................`,
                color: (typeof isDarkMode !== 'undefined' && isDarkMode) ? '#dfe6e9' : '#2d3436',
                fontSize: 24, fontFamily: 'sans-serif', align: 'left', locked: false, z: globalZ++
            });
        }
        
        if (PluginManager.plugins['mathExerciseGenerator']) {
            PluginManager.plugins['mathExerciseGenerator'].launchTimer(timerMinutes);
        }
        if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
    }
});

// ==========================================
// COMPOSANTS ÉLECTRIQUES (Labo Schémas)
// ==========================================
registerPlugin('electricComponentTool', 'Physique-Chimie', {
    currentStamp: null, currentArgs: null,
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Composants Électriques'; 
        // Icône Éclair
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); setMode('electric');
            openCustomPrompt("Composant Électrique", [
                { type: 'select', label: 'Composant', value: 'lampe', options: [{value:'lampe', label:'💡 Lampe'}, {value:'pile', label:'🔋 Pile / Générateur'}, {value:'int_ouvert', label:'🔓 Interrupteur Ouvert'}, {value:'int_ferme', label:'🔒 Interrupteur Fermé'}, {value:'moteur', label:'⚙️ Moteur'}, {value:'resistor', label:'⏹️ Résistance'}] },
                { type: 'color', label: 'Couleur du symbole', value: '#2d3436' }
            ], (res) => this.generateSVG(res[0], res[1]), // Aperçu SVG activé car c'est un tampon !
               (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { this.currentStamp = stamp; this.currentArgs = res; showToast("📌 Posez le composant électrique !"); }); });
            e.stopPropagation();
        });
    },
    edit: function(imgObj) {
        const args = imgObj.pluginData.args;
        openCustomPrompt("Modifier le Composant", [
            { type: 'select', label: 'Composant', value: args[0], options: [{value:'lampe', label:'Lampe'}, {value:'pile', label:'Pile'}, {value:'int_ouvert', label:'Interrupteur Ouvert'}, {value:'int_ferme', label:'Interrupteur Fermé'}, {value:'moteur', label:'Moteur'}, {value:'resistor', label:'Résistance'}] },
            { type: 'color', label: 'Couleur', value: args[1] }
        ], (res) => this.generateSVG(res[0], res[1]),
           (res) => { createStampFromSVG(this.generateSVG(res[0], res[1], true), (stamp) => { imgObj.src=stamp.src; imgObj.w=stamp.w; imgObj.h=stamp.h; imgObj.cw=stamp.w; imgObj.ch=stamp.h; imgObj.pluginData.args=res; draw(); saveState(); }); });
    },
    generateSVG: function(type, color, isExport=false) {
        const s = isExport ? 160 : 80; const cy = s/2; const sw = isExport ? 4 : 2;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${isExport?s:'100%'}" height="${isExport?s:'100%'}">`;
        
        // Bornes de raccordement universelles (gauche et droite)
        svg += `<g stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round">`;
        svg += `<line x1="0" y1="${cy}" x2="${s*0.25}" y2="${cy}" />`;
        svg += `<line x1="${s*0.75}" y1="${cy}" x2="${s}" y2="${cy}" />`;

        if (type === 'lampe') {
            svg += `<circle cx="${s/2}" cy="${cy}" r="${s*0.25}" />`;
            svg += `<line x1="${s*0.32}" y1="${cy-s*0.18}" x2="${s*0.68}" y2="${cy+s*0.18}" />`;
            svg += `<line x1="${s*0.32}" y1="${cy+s*0.18}" x2="${s*0.68}" y2="${cy-s*0.18}" />`;
        } else if (type === 'pile') {
            svg += `<line x1="${s*0.45}" y1="${cy-s*0.2}" x2="${s*0.45}" y2="${cy+s*0.2}" stroke-width="${sw*1.8}" />`; // Grande barre +
            svg += `<line x1="${s*0.55}" y1="${cy-s*0.1}" x2="${s*0.55}" y2="${cy+s*0.1}" stroke-width="${sw*3.5}" />`; // Petite barre -
        } else if (type === 'int_ouvert') {
            svg += `<circle cx="${s*0.25}" cy="${cy}" r="${sw*1.5}" fill="${color}" />`;
            svg += `<circle cx="${s*0.75}" cy="${cy}" r="${sw*1.5}" fill="${color}" />`;
            svg += `<line x1="${s*0.25}" y1="${cy}" x2="${s*0.68}" y2="${cy-s*0.2}" />`; // Le levier levé
        } else if (type === 'int_ferme') {
            svg += `<circle cx="${s*0.25}" cy="${cy}" r="${sw*1.5}" fill="${color}" />`;
            svg += `<circle cx="${s*0.75}" cy="${cy}" r="${sw*1.5}" fill="${color}" />`;
            svg += `<line x1="${s*0.25}" y1="${cy}" x2="${s*0.75}" y2="${cy}" />`;
        } else if (type === 'moteur') {
            svg += `<circle cx="${s/2}" cy="${cy}" r="${s*0.25}" />`;
            svg += `<text x="${s/2}" y="${cy}" font-family="sans-serif" font-weight="bold" font-size="${s*0.3}" fill="${color}" text-anchor="middle" dominant-baseline="central">M</text>`;
        } else if (type === 'resistor') {
            svg += `<rect x="${s*0.25}" y="${cy-s*0.12}" width="${s*0.5}" height="${s*0.24}" />`;
        }
        return svg + `</g></svg>`;
    },
    onDraw: function(ctx) { if(mode==='electric'&&this.currentStamp&&mouseLogicalPos){ ctx.globalAlpha=0.5; ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x-this.currentStamp.w/2, mouseLogicalPos.y-this.currentStamp.h/2); ctx.globalAlpha=1.0; } },
    onPointerDown: function(rawPos) { if(mode==='electric'&&this.currentStamp){ images.push({id:nextId++, x:rawPos.x-this.currentStamp.w/2, y:rawPos.y-this.currentStamp.h/2, w:this.currentStamp.w, h:this.currentStamp.h, cx:0, cy:0, cw:this.currentStamp.w, ch:this.currentStamp.h, src:this.currentStamp.src, z:globalZ++, pluginData:{id:'electricComponentTool', args:this.currentArgs}}); saveState(); setMode('pointer'); this.currentStamp=null; return true; } return false; }
});

// ==========================================
// 4. JEU : LE COMPTE EST BON (Correction "Zéro calcul inutile")
// ==========================================
registerPlugin('countdownGameTool', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Le Compte est Bon'; 
        // Icône Cible
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Le Compte est Bon", [
            { type: 'select', label: 'Cible', value: 'medium', options: [{value: 'easy', label: 'Facile (101 à 300)'}, {value: 'medium', label: 'Moyen (301 à 700)'}, {value: 'hard', label: 'Difficile (701 à 999)'}] },
            { type: 'select', label: 'Minuteur', value: '3', options: [{value: '0', label: 'Libre'}, {value: '1', label: '1 minute'}, {value: '3', label: '3 minutes'}] }
        ], null, (res) => this.generateGame(res[0], parseInt(res[1]))); // null = pas d'aperçu
    },
    
    // Le VRAI moteur (sans calculs fantômes)
    generateLogic: function(difficulty) {
        const officialPool = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,25,50,75,100];
        let plates = officialPool.sort(() => 0.5 - Math.random()).slice(0, 6);
        
        let target, steps = [];
        let attempts = 0;
        
        while(attempts < 2000) {
            attempts++;
            let currentPlates = [...plates];
            let currentSteps = [];
            let opsCount = Math.floor(Math.random() * 3) + 2; // 2 à 4 opérations utiles
            
            // Opération 1
            let idx1 = Math.floor(Math.random() * currentPlates.length);
            let a = currentPlates.splice(idx1, 1)[0];
            let idx2 = Math.floor(Math.random() * currentPlates.length);
            let b = currentPlates.splice(idx2, 1)[0];
            
            if (b > a) { let tmp = a; a = b; b = tmp; }
            
            let ops = ['+', '-'];
            if (a > 1 && b > 1) ops.push('*');
            if (b > 1 && a % b === 0) ops.push('/');
            
            let op = ops[Math.floor(Math.random() * ops.length)];
            let res = (op === '+') ? a+b : (op === '-' ? a-b : (op === '*' ? a*b : a/b));
            
            if (res <= 0 || res === a || res === b) continue;
            
            currentSteps.push(`${a} ${op === '*' ? '×' : (op === '/' ? '÷' : op)} ${b} = ${res}`);
            let accumulator = res; // On garde le résultat en mémoire !
            
            let isValid = true;
            // Suite des opérations : on FORCERA l'utilisation de l'accumulateur (la ligne précédente)
            for(let i=1; i<opsCount; i++) {
                if (currentPlates.length === 0) break;
                let idxNext = Math.floor(Math.random() * currentPlates.length);
                let nextVal = currentPlates.splice(idxNext, 1)[0];
                
                let v1 = accumulator;
                let v2 = nextVal;
                if (v2 > v1) { let t = v1; v1 = v2; v2 = t; }
                
                let nextOps = ['+', '-'];
                if (v1 > 1 && v2 > 1) nextOps.push('*');
                if (v2 > 1 && v1 % v2 === 0) nextOps.push('/');
                
                let nOp = nextOps[Math.floor(Math.random() * nextOps.length)];
                let nRes = (nOp === '+') ? v1+v2 : (nOp === '-' ? v1-v2 : (nOp === '*' ? v1*v2 : v1/v2));
                
                if (nRes <= 0 || nRes === v1 || nRes === v2) { isValid = false; break; }
                
                currentSteps.push(`${v1} ${nOp === '*' ? '×' : (nOp === '/' ? '÷' : nOp)} ${v2} = ${nRes}`);
                accumulator = nRes; // Mise à jour pour la prochaine ligne
            }
            
            if (!isValid) continue;
            
            let minT = difficulty === 'easy' ? 101 : (difficulty === 'medium' ? 301 : 701);
            let maxT = difficulty === 'easy' ? 300 : (difficulty === 'medium' ? 700 : 999);
            
            if (accumulator >= minT && accumulator <= maxT && currentSteps.length >= 2) {
                target = accumulator; steps = currentSteps; break;
            }
        }
        if (!target) return this.generateLogic(difficulty);
        return { plates, target, steps };
    },

    generateGame: function(difficulty, timerMinutes) {
        const game = this.generateLogic(difficulty);
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const w = 550, h = 300;
        let svgGame = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svgGame += `<rect x="175" y="20" width="200" height="100" rx="15" fill="#0984e3" stroke="#000" stroke-width="3"/>`;
        svgGame += `<text x="275" y="88" font-family="sans-serif" font-weight="bold" font-size="64" fill="#fff" text-anchor="middle">${game.target}</text>`;
        const pW = 70, pH = 70, gap = 15;
        const startX = (w - (6 * pW + 5 * gap)) / 2;
        game.plates.forEach((p, i) => {
            let x = startX + i * (pW + gap);
            svgGame += `<rect x="${x}" y="160" width="${pW}" height="${pH}" rx="8" fill="#f1c40f" stroke="#e67e22" stroke-width="4"/>`;
            svgGame += `<text x="${x + pW/2}" y="${160 + pH/2 + 10}" font-family="sans-serif" font-weight="bold" font-size="28" fill="#2d3436" text-anchor="middle">${p}</text>`;
        });
        svgGame += `</svg>`;

        const solW = 350, solH = 250;
        let svgSol = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${solW} ${solH}" width="${solW}" height="${solH}">`;
        svgSol += `<rect width="${solW}" height="${solH}" rx="12" fill="#f1f2f6" stroke="#0984e3" stroke-width="4"/>`;
        svgSol += `<text x="${solW/2}" y="40" font-family="sans-serif" font-weight="bold" font-size="24" fill="#0984e3" text-anchor="middle">Solution possible</text>`;
        game.steps.forEach((step, i) => {
            svgSol += `<text x="${solW/2}" y="${90 + i*35}" font-family="sans-serif" font-weight="bold" font-size="22" fill="#2d3436" text-anchor="middle">${step}</text>`;
        });
        svgSol += `</svg>`;

        let svgCache = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${solW} ${solH}" width="${solW}" height="${solH}">`;
        svgCache += `<rect width="${solW}" height="${solH}" rx="12" fill="#b2bec3" stroke="#636e72" stroke-width="4"/>`;
        svgCache += `<text x="${solW/2}" y="${solH/2 - 10}" font-family="sans-serif" font-weight="bold" font-size="24" fill="#2d3436" text-anchor="middle">Solution cachée</text>`;
        svgCache += `<text x="${solW/2}" y="${solH/2 + 25}" font-family="sans-serif" font-size="16" fill="#2d3436" text-anchor="middle">Prenez la gomme pour l'effacer !</text>`;
        svgCache += `</svg>`;

        // On charge les 3 images de manière séquentielle (Le Cache s'affiche SUR la Solution)
        const loadImg = (svgStr, x, y, w, h) => {
            return new Promise(resolve => {
                let img = new Image();
                img.onload = () => {
                    if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                    images.push({ id: nextId++, x, y, w, h, cx: 0, cy: 0, cw: w, ch: h, src: img.src, z: globalZ++ });
                    resolve();
                };
                img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr)));
            });
        };

        const gameX = logicalCenterX - 450; const gameY = logicalCenterY - 150;
        const solX = logicalCenterX + 150; const solY = logicalCenterY - 125;

        loadImg(svgGame, gameX, gameY, w, h).then(() => {
            return loadImg(svgSol, solX, solY, solW, solH);
        }).then(() => {
            return loadImg(svgCache, solX, solY, solW, solH);
        }).then(() => {
            if (PluginManager.plugins['mathExerciseGenerator']) PluginManager.plugins['mathExerciseGenerator'].launchTimer(timerMinutes);
            if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
            showToast("🎯 C'est parti ! Gommez le bloc gris pour voir la solution.");
        });
    }
});


// ==========================================
// 5. JEU : SUDOKU GÉNÉRATEUR (Fix du Cache)
// ==========================================
registerPlugin('sudokuGeneratorTool', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Grille de Sudoku'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18 M3 15h18 M9 3v18 M15 3v18" stroke-width="1.5" stroke-opacity="0.5"/><path d="M9 3v18 M15 3v18" stroke-width="2"/><text x="6" y="6.5" font-size="4" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">9</text><text x="12" y="12.5" font-size="4" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">5</text><text x="18" y="18.5" font-size="4" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">1</text></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    
    openPrompt: function() {
        openCustomPrompt("Générer un Sudoku", [
            { type: 'select', label: 'Niveau', value: '35', options: [{value: '30', label: 'Facile'}, {value: '45', label: 'Moyen'}, {value: '55', label: 'Difficile'}] },
            { type: 'select', label: 'Solution', value: 'hidden', options: [{value: 'none', label: 'Aucune'}, {value: 'hidden', label: 'Cachée (Gomme)'}, {value: 'visible', label: 'Visible'}] },
            { type: 'color', label: 'Couleur', value: '#2d3436' }
        ], 
        (res) => {
            let svgs = this.getPreviewSVGs(parseInt(res[0]), res[2]);
            let html = `<div style="display:flex; gap:15px; width:100%; height:100%; justify-content:center; align-items:center;">`;
            html += `<img src="${svgs.puzzle}" style="max-height:110px; object-fit:contain; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.15);">`;
            if (res[1] === 'visible') html += `<img src="${svgs.sol}" style="max-height:110px; object-fit:contain; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.15);">`;
            else if (res[1] === 'hidden') html += `<img src="${svgs.cache}" style="max-height:110px; object-fit:contain; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.15);">`;
            return html + `</div>`;
        }, 
        (res) => { 
            showToast("⏳ Génération de la grille...");
            setTimeout(() => this.generateSudoku(parseInt(res[0]), res[2], res[1]), 50);
        });
    },

    getPreviewSVGs: function(holes, color) {
        let grid = [[1,2,3,4,5,6,7,8,9],[4,5,6,7,8,9,1,2,3],[7,8,9,1,2,3,4,5,6],[2,3,4,5,6,7,8,9,1],[5,6,7,8,9,1,2,3,4],[8,9,1,2,3,4,5,6,7],[3,4,5,6,7,8,9,1,2],[6,7,8,9,1,2,3,4,5],[9,1,2,3,4,5,6,7,8]];
        let puzzle = JSON.parse(JSON.stringify(grid));
        let positions = Array.from({length: 81}, (_, i) => i).sort(() => Math.random() - 0.5);
        for(let i=0; i<holes; i++) puzzle[Math.floor(positions[i]/9)][positions[i]%9] = "";
        return this.buildSVGStrings(puzzle, grid, color);
    },

    buildSVGStrings: function(puzzle, grid, color) {
        const size = 450; const cellSize = size / 9;
        const drawGrid = (dataObj, isSolution) => {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
            svg += `<rect width="${size}" height="${size}" fill="${isSolution ? '#f1f2f6' : '#fff'}" stroke="${color}" stroke-width="6"/>`;
            for(let i=1; i<9; i++) {
                let sw = (i%3 === 0) ? 4 : 1;
                svg += `<line x1="${i*cellSize}" y1="0" x2="${i*cellSize}" y2="${size}" stroke="${color}" stroke-width="${sw}"/>`;
                svg += `<line x1="0" y1="${i*cellSize}" x2="${size}" y2="${i*cellSize}" stroke="${color}" stroke-width="${sw}"/>`;
            }
            for(let r=0; r<9; r++) {
                for(let c=0; c<9; c++) {
                    if(dataObj[r][c] !== "") {
                        let numCol = (isSolution && puzzle[r][c] === "") ? "#0984e3" : color;
                        svg += `<text x="${c*cellSize + cellSize/2}" y="${r*cellSize + cellSize/2 + 3}" font-family="sans-serif" font-weight="bold" font-size="28" fill="${numCol}" text-anchor="middle" dominant-baseline="central">${dataObj[r][c]}</text>`;
                    }
                }
            }
            return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg + `</svg>`)));
        };
        // 🌟 LE CORRECTIF D'ÉCHELLE DU CACHE EST ICI (width et height stricts) 🌟
        let cache = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#b2bec3" stroke="#636e72" stroke-width="6"/><text x="${size/2}" y="${size/2-15}" font-family="sans-serif" font-weight="bold" font-size="28" fill="#2d3436" text-anchor="middle" dominant-baseline="central">Solution cachée</text><text x="${size/2}" y="${size/2+25}" font-family="sans-serif" font-size="18" fill="#2d3436" text-anchor="middle" dominant-baseline="central">Prenez la gomme !</text></svg>`;
        return { puzzle: drawGrid(puzzle, false), sol: drawGrid(grid, true), cache: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(cache))) };
    },
    
    isValid: function(grid, r, c, k) {
        for (let i = 0; i < 9; i++) { if (grid[r][i] === k || grid[i][c] === k) return false; }
        let sr = Math.floor(r / 3) * 3, sc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { if (grid[sr + i][sc + j] === k) return false; } }
        return true;
    },
    countSolutions: function(grid) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (grid[r][c] === "") {
                    let count = 0;
                    for (let n = 1; n <= 9; n++) {
                        if (this.isValid(grid, r, c, n)) {
                            grid[r][c] = n; count += this.countSolutions(grid); grid[r][c] = "";
                            if (count > 1) return count; 
                        }
                    }
                    return count;
                }
            }
        }
        return 1; 
    },

    generateSudoku: function(holes, color, solType) {
        let grid = [[1,2,3, 4,5,6, 7,8,9], [4,5,6, 7,8,9, 1,2,3], [7,8,9, 1,2,3, 4,5,6], [2,3,4, 5,6,7, 8,9,1], [5,6,7, 8,9,1, 2,3,4], [8,9,1, 2,3,4, 5,6,7], [3,4,5, 6,7,8, 9,1,2], [6,7,8, 9,1,2, 3,4,5], [9,1,2, 3,4,5, 6,7,8]];
        let nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
        for(let r=0; r<9; r++) for(let c=0; c<9; c++) grid[r][c] = nums[grid[r][c] - 1];

        for(let block=0; block<3; block++) {
            let r1 = block*3 + Math.floor(Math.random()*3); let r2 = block*3 + Math.floor(Math.random()*3);
            let temp = grid[r1]; grid[r1] = grid[r2]; grid[r2] = temp;
        }

        let puzzle = JSON.parse(JSON.stringify(grid));
        let positions = Array.from({length: 81}, (_, i) => i).sort(() => Math.random() - 0.5);

        let removed = 0;
        for(let pos of positions) {
            if(removed >= holes) break;
            let r = Math.floor(pos / 9); let c = pos % 9;
            let backup = puzzle[r][c]; puzzle[r][c] = "";
            let copy = JSON.parse(JSON.stringify(puzzle));
            if(this.countSolutions(copy) !== 1) puzzle[r][c] = backup; else removed++;
        }

        let svgs = this.buildSVGStrings(puzzle, grid, color);

        const loadImg = (b64, x, y) => {
            return new Promise(resolve => {
                let img = new Image();
                img.onload = () => {
                    if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                    images.push({ id: nextId++, x, y, w: 450, h: 450, cx:0, cy:0, cw:450, ch:450, src: img.src, z: globalZ++ });
                    resolve();
                };
                img.src = b64;
            });
        };

        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        let pX = logicalCenterX - (solType !== 'none' ? 470 : 225);
        let pY = logicalCenterY - 225;
        let sX = pX + 490;

        loadImg(svgs.puzzle, pX, pY).then(() => {
            if(solType !== 'none') return loadImg(svgs.sol, sX, pY);
        }).then(() => {
            if(solType === 'hidden') return loadImg(svgs.cache, sX, pY);
        }).then(() => {
            if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
            showToast("🔢 Sudoku à solution unique généré !");
        });
    }
});

// ==========================================
// 6. GÉNÉRATEUR D'EXERCICES : ANGLES À MESURER
// ==========================================
registerPlugin('angleExerciseGenerator', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Angles à mesurer'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22L20 2"/><path d="M4 22H22"/><path d="M10 16a6 6 0 0 1 6-6"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Angles à mesurer", [
            { type: 'select', label: 'Type d\'angles', value: 'all', options: [{value: 'all', label: 'Aléatoires (Aigus et Obtus)'}, {value: 'aigu', label: 'Aigus uniquement (< 90°)'}, {value: 'obtus', label: 'Obtus uniquement (> 90°)'}] },
            { type: 'select', label: 'Quantité', value: '3', options: [{value: '2', label: '2 angles'}, {value: '3', label: '3 angles'}, {value: '4', label: '4 angles'}] }
        ], null, (res) => this.buildGrid(res[0], parseInt(res[1])));
    },
    
    getAngleSVG: function(angleDeg, baseRot) {
        const cx = 200, cy = 200, rLen = 170, aLen = 40; 
        const angleRad = angleDeg * (Math.PI / 180);
        
        const p1x = cx + Math.cos(baseRot) * rLen;
        const p1y = cy + Math.sin(baseRot) * rLen;
        const p2x = cx + Math.cos(baseRot + angleRad) * rLen;
        const p2y = cy + Math.sin(baseRot + angleRad) * rLen;
        const largeArc = angleDeg > 180 ? 1 : 0;
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">`;
        svg += `<rect width="400" height="400" fill="rgba(255,255,255,0.01)"/>`; 
        svg += `<path d="M ${cx} ${cy} L ${p1x} ${p1y} M ${cx} ${cy} L ${p2x} ${p2y}" stroke="#0984e3" stroke-width="3" stroke-linecap="round" fill="none"/>`;
        svg += `<path d="M ${cx+Math.cos(baseRot)*aLen} ${cy+Math.sin(baseRot)*aLen} A ${aLen} ${aLen} 0 ${largeArc} 1 ${cx+Math.cos(baseRot+angleRad)*aLen} ${cy+Math.sin(baseRot+angleRad)*aLen}" stroke="#0984e3" stroke-width="1.5" fill="none"/>`;
        svg += `</svg>`;
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },

    getCacheSVG: function() {
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 40" width="90" height="40">`;
        svg += `<rect width="90" height="40" rx="5" fill="#b2bec3" stroke="#636e72" stroke-width="2"/>`;
        svg += `<text x="45" y="25" font-family="sans-serif" font-size="16" fill="#2d3436" text-anchor="middle">Caché</text>`;
        svg += `</svg>`;
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },

    buildGrid: function(type, count) {
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const safeWidth = window.innerWidth - 260; 
        const spacingX = Math.min(380, safeWidth / count); 
        const startX = logicalCenterX - ((count - 1) * spacingX / 2);

        for (let i = 0; i < count; i++) {
            let angleDeg;
            if (type === 'aigu') angleDeg = Math.floor(Math.random() * 60) + 20; 
            else if (type === 'obtus') angleDeg = Math.floor(Math.random() * 60) + 100; 
            else angleDeg = Math.floor(Math.random() * 140) + 20; 

            const baseRot = Math.random() * Math.PI * 2; 
            const cx = startX + i * spacingX;
            const cy = logicalCenterY - 120; 

            const imgAngle = new Image();
            imgAngle.onload = () => {
                if (typeof imageCache !== 'undefined') imageCache[imgAngle.src] = imgAngle;
                images.push({ id: nextId++, x: cx - 200, y: cy - 200, w: 400, h: 400, cx:0, cy:0, cw:400, ch:400, src: imgAngle.src, z: globalZ++ });
                
                const solY = cy + 180; 
                
                // 1. Le texte natif (valeur)
                texts.push({ id: nextId++, x: cx - 25, y: solY, content: `<b>${angleDeg}°</b>`, color: '#2d3436', fontSize: 28, fontFamily: 'sans-serif', align: 'left', locked: true, z: globalZ++ });

                // 2. L'image du cache (Descendue de 23 pixels pour s'aligner parfaitement sur le texte !)
                const imgCache = new Image();
                imgCache.onload = () => {
                    if (typeof imageCache !== 'undefined') imageCache[imgCache.src] = imgCache;
                    // Coordonnée Y modifiée : solY - 5 (au lieu de solY - 28)
                    images.push({ id: nextId++, x: cx - 45, y: solY - 5, w: 90, h: 40, cx:0, cy:0, cw:90, ch:40, src: imgCache.src, z: globalZ++ });
                    if (typeof draw === 'function') draw();
                };
                imgCache.src = this.getCacheSVG();
            };
            imgAngle.src = this.getAngleSVG(angleDeg, baseRot);
        }
        
        if (typeof saveState === 'function') saveState();
        showToast(`📐 Sortez le rapporteur ! Gommez les blocs gris pour voir les valeurs.`);
    }
});

// ==========================================
// 7. JEU : LE PENDU (100% SVG Infaillible)
// ==========================================
registerPlugin('hangmanGameTool', 'Jeux', { 
    secretWord: "", displayWord: "", mistakes: 0, imageId: null, 
    
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Jeu du Pendu'; 
        
        // ICÔNE SPÉCIFIQUE : LA POTENCE
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h8 M8 20V4h8v3 M16 11v4 M14 13h4 M14 18l2-3 2 3"/><circle cx="16" cy="9" r="2"/></svg>`;
        
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Jeu du Pendu", [
            { type: 'select', label: 'Difficulté (si mot aléatoire)', value: 'easy', options: [{value: 'easy', label: 'Facile (4-6 lettres)'}, {value: 'medium', label: 'Moyen (7-9 lettres)'}, {value: 'hard', label: 'Difficile (10+ lettres)'}] },
            { type: 'text', label: 'OU tapez un mot caché :', value: '' }
        ], null, (res) => this.startGame(res[0], res[1]));
    },
    
    getGameSVG: function() {
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">`;
        svg += `<rect width="800" height="500" fill="rgba(255,255,255,0.01)"/>`; 

        let c = '#2d3436'; let w = 8;
        svg += `<g stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none">`;
        if(this.mistakes >= 1) svg += `<line x1="250" y1="320" x2="550" y2="320"/>`; 
        if(this.mistakes >= 2) svg += `<line x1="350" y1="320" x2="350" y2="50"/>`;  
        if(this.mistakes >= 3) svg += `<line x1="350" y1="50" x2="480" y2="50"/>`;   
        if(this.mistakes >= 4) svg += `<line x1="350" y1="120" x2="420" y2="50"/>`;  
        if(this.mistakes >= 5) svg += `<line x1="480" y1="50" x2="480" y2="100"/>`;  
        if(this.mistakes >= 6) svg += `<circle cx="480" cy="130" r="30"/>`;          
        if(this.mistakes >= 7) svg += `<line x1="480" y1="160" x2="480" y2="240"/>`; 
        if(this.mistakes >= 8) svg += `<line x1="480" y1="180" x2="440" y2="220"/>`; 
        if(this.mistakes >= 9) svg += `<line x1="480" y1="180" x2="520" y2="220"/>`; 
        if(this.mistakes >= 10) svg += `<line x1="480" y1="240" x2="440" y2="300"/>`;
        if(this.mistakes >= 11) svg += `<line x1="480" y1="240" x2="520" y2="300"/>`;
        svg += `</g>`;

        const letterW = Math.min(50, 700 / this.displayWord.length); 
        const startX = 400 - ((this.displayWord.length - 1) * letterW) / 2;

        for(let i=0; i<this.displayWord.length; i++) {
            let char = this.displayWord[i];
            if (char !== '_') {
                svg += `<text x="${startX + i*letterW}" y="420" font-family="sans-serif" font-weight="bold" font-size="48" fill="#0984e3" text-anchor="middle">${char}</text>`;
            }
            svg += `<line x1="${startX + i*letterW - 15}" y1="430" x2="${startX + i*letterW + 15}" y2="430" stroke="#0984e3" stroke-width="4" stroke-linecap="round"/>`;
        }
        svg += `</svg>`;
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },

    startGame: function(difficulty, customWord) {
        const dict = {
            easy: ["CHAT", "CHIEN", "ECOLE", "ARBRE", "FLEUR", "TABLE", "POMME", "ROUGE", "LIVRE", "PORTE", "SOURIS", "ECRAN", "OISEAU", "CRAIE", "STYLO"],
            medium: ["CARTABLE", "CAHIER", "MAISON", "VOITURE", "GARCON", "CHEVAL", "POISSON", "SOLEIL", "ETOILE", "PLUIE", "LUMIERE", "TABLEAU", "TROUSSE"],
            hard: ["PROFESSEUR", "DIRECTEUR", "RECREATION", "MATHEMATIQUES", "GEOMETRIE", "CONJUGAISON", "ORTHOGRAPHE", "DICTIONNAIRE", "CONSTITUTION"]
        };

        this.secretWord = customWord.trim().toUpperCase().replace(/[^A-Z]/g, '');
        if (this.secretWord.length < 2) {
            let list = dict[difficulty];
            this.secretWord = list[Math.floor(Math.random() * list.length)];
        }

        this.mistakes = 0;
        this.displayWord = Array(this.secretWord.length).fill("_");
        
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom; 
        const logicalCenterY = ((window.innerHeight - 300) / 2 - panY) / zoom; 

        this.imageId = nextId++;
        const img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: this.imageId, x: logicalCenterX - 400, y: logicalCenterY - 250, w: 800, h: 500, cx:0, cy:0, cw:800, ch:500, src: img.src, z: globalZ++ });
            draw(); saveState();
        };
        img.src = this.getGameSVG();

        this.createRemote();
        showToast("🪢 Jeu du pendu lancé !");
    },
    
    createRemote: function() {
        if(document.getElementById('hangman-remote')) document.getElementById('hangman-remote').remove();
        const remote = document.createElement('div');
        remote.id = 'hangman-remote';
        remote.style.cssText = "position:absolute; bottom:20px; left:50%; transform:translateX(-50%); width:600px; background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); z-index:10005; overflow:hidden; font-family:sans-serif;";
        
        let html = `<div style="background:#1e272e; color:#fff; padding:10px; text-align:center; font-weight:bold;">🎮 Télécommande Pendu (Cachée aux élèves)</div>`;
        html += `<div style="padding:15px;"><div id="hangman-keys" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:15px;">`;
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('').forEach(l => { html += `<button class="hangman-key" data-l="${l}" style="width:40px; height:40px; font-size:16px; font-weight:bold; border:2px solid #dfe6e9; border-radius:6px; background:#f1f2f6; cursor:pointer;">${l}</button>`; });
        html += `</div><div style="display:flex; gap:10px;"><button id="btn-hm-reveal" style="flex:1; padding:12px; background:#e74c3c; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Révéler la solution</button><button id="btn-hm-close" style="flex:1; padding:12px; background:#636e72; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Fermer et Nettoyer le tableau</button></div></div>`;
        remote.innerHTML = html;
        document.body.appendChild(remote);

        remote.querySelectorAll('.hangman-key').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                btn.disabled = true; btn.style.opacity = '0.2';
                let letter = btn.dataset.l;
                if (this.secretWord.includes(letter)) {
                    for(let i=0; i<this.secretWord.length; i++) if(this.secretWord[i] === letter) this.displayWord[i] = letter;
                    this.updateGameImage();
                    if (!this.displayWord.includes('_')) { showToast("🏆 Victoire !"); remote.querySelector('#hangman-keys').style.pointerEvents = 'none'; }
                } else {
                    this.mistakes++;
                    this.updateGameImage();
                    if (this.mistakes >= 11) {
                        this.displayWord = this.secretWord.split('');
                        this.updateGameImage();
                        showToast("💀 Pendu !"); remote.querySelector('#hangman-keys').style.pointerEvents = 'none';
                    }
                }
            });
        });
        remote.querySelector('#btn-hm-reveal').addEventListener('click', () => { this.displayWord = this.secretWord.split(''); this.updateGameImage(); });
        remote.querySelector('#btn-hm-close').addEventListener('click', () => { images = images.filter(i => i.id !== this.imageId); remote.remove(); draw(); saveState(); showToast("🧹 Tableau nettoyé !"); });
    },

    updateGameImage: function() {
        let imgObj = images.find(i => i.id === this.imageId);
        if(imgObj) {
            const img = new Image();
            img.onload = () => { if (typeof imageCache !== 'undefined') imageCache[img.src] = img; imgObj.src = img.src; draw(); saveState(); };
            img.src = this.getGameSVG();
        }
    }
});

// ==========================================
// 8. JEU : MOTS MÊLÉS EXPRESS
// ==========================================
registerPlugin('wordSearchGenerator', 'Jeux', { 
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Mots Mêlés'; 
        
        // ICÔNE SPÉCIFIQUE : GRILLE ET LOUPE
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M8 3v14 M13 3v14 M3 8h14 M3 13h14" /><circle cx="17" cy="17" r="4" fill="none"/><line x1="19.8" y1="19.8" x2="23" y2="23" /></svg>`;
        
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Mots Mêlés", [
            { type: 'text', label: 'Entrez jusqu\'à 6 mots (séparés par des virgules)', value: 'TABLEAU, CHAISE, CRAIE, ECOLE, STYLO' }
        ], null, (res) => {
            let input = res[0];
            let words = input.split(',').map(w => w.trim().toUpperCase().replace(/[^A-Z]/g, '')).filter(w => w.length > 2);
            if (words.length > 0) {
                showToast("⏳ Génération de la grille...");
                setTimeout(() => this.generateGrid(words.slice(0, 6)), 50);
            } else {
                showToast("Veuillez entrer des mots valides.");
            }
        });
    },
    generateGrid: function(words) {
        const size = 12; 
        let grid = Array(size).fill(null).map(() => Array(size).fill(''));
        
        words.forEach(word => {
            let placed = false; let attempts = 0;
            while(!placed && attempts < 200) {
                attempts++;
                let dir = Math.random() > 0.5 ? 'H' : 'V';
                let r = Math.floor(Math.random() * size);
                let c = Math.floor(Math.random() * size);
                
                if (dir === 'H' && c + word.length <= size) {
                    let ok = true;
                    for(let i=0; i<word.length; i++) if(grid[r][c+i] !== '' && grid[r][c+i] !== word[i]) ok = false;
                    if (ok) { for(let i=0; i<word.length; i++) grid[r][c+i] = word[i]; placed = true; }
                } 
                else if (dir === 'V' && r + word.length <= size) {
                    let ok = true;
                    for(let i=0; i<word.length; i++) if(grid[r+i][c] !== '' && grid[r+i][c] !== word[i]) ok = false;
                    if (ok) { for(let i=0; i<word.length; i++) grid[r+i][c] = word[i]; placed = true; }
                }
            }
        });

        const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for(let r=0; r<size; r++) for(let c=0; c<size; c++) if(grid[r][c] === '') grid[r][c] = alpha[Math.floor(Math.random() * alpha.length)];

        const w = 500, h = 500; const cellSize = w / size;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svg += `<rect width="${w}" height="${h}" fill="#f1f2f6" rx="10" stroke="#b2bec3" stroke-width="4"/>`;
        for(let r=0; r<size; r++) {
            for(let c=0; c<size; c++) {
                svg += `<text x="${c*cellSize + cellSize/2}" y="${r*cellSize + cellSize/2 + 8}" font-family="monospace" font-weight="bold" font-size="28" fill="#2d3436" text-anchor="middle">${grid[r][c]}</text>`;
            }
        }
        svg += `</svg>`;

        let base64 = btoa(unescape(encodeURIComponent(svg)));
        const img = new Image();
        img.onload = () => {
            const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
            const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: nextId++, x: logicalCenterX - w/2 - 120, y: logicalCenterY - h/2, w: w, h: h, cx: 0, cy: 0, cw: w, ch: h, src: img.src, z: globalZ++ });
            
            texts.push({
                id: nextId++, x: logicalCenterX + w/2 - 80, y: logicalCenterY - 120, 
                content: `<b>Mots à trouver :</b><br><br>` + words.map(w => `☐ ${w}`).join('<br><br>'), 
                color: '#2d3436', fontSize: 26, fontFamily: 'sans-serif', align: 'left', locked: true, z: globalZ++
            });

            if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
            showToast("🔎 Mots Mêlés prêts ! Prenez le surligneur jaune.");
        };
        img.src = "data:image/svg+xml;base64," + base64;
    }
});

// ==========================================
// 9. GÉNÉRATEUR : PYRAMIDES ADDITIVES (Briques vides)
// ==========================================
registerPlugin('pyramidGeneratorTool', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Pyramides Additives'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 22h20L12 2z"/><path d="M12 2v20"/><path d="M7 12h10"/><path d="M4.5 17h15"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    
    getPyramidSVG: function(levels, isPreview = false) {
        const brickW = 120;
        const brickH = 60;
        const w = levels * brickW;
        const h = levels * brickH;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isPreview ? '100%' : w}" height="${isPreview ? '100%' : h}">`;
        
        for(let row = 0; row < levels; row++) {
            let cols = levels - row;
            let startX = (w - cols * brickW) / 2;
            let currentY = h - (row + 1) * brickH;

            for(let col = 0; col < cols; col++) {
                let currentX = startX + col * brickW;
                svg += `<rect x="${currentX}" y="${currentY}" width="${brickW}" height="${brickH}" fill="#f8f9fa" stroke="#0984e3" stroke-width="3" rx="4"/>`;
                
                if (isPreview) {
                    svg += `<text x="${currentX + brickW/2}" y="${currentY + 38}" font-family="sans-serif" font-weight="bold" font-size="24" fill="#b2bec3" text-anchor="middle">?</text>`;
                }
            }
        }
        svg += `</svg>`;
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },

    openPrompt: function() {
        openCustomPrompt("Pyramides Additives", [
            { type: 'select', label: 'Taille', value: '3', options: [{value: '3', label: '3 Étages (6 briques)'}, {value: '4', label: '4 Étages (10 briques)'}, {value: '5', label: '5 Étages (15 briques)'}] },
            { type: 'select', label: 'Type', value: 'add', options: [{value: 'add', label: 'Additions (Base remplie)'}, {value: 'holes', label: 'À trous (Mélangé)'}] }
        ], 
        (res, previewContainer) => {
            if (previewContainer) {
                const svg = this.getPyramidSVG(parseInt(res[0]), true);
                previewContainer.innerHTML = `<div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; padding:10px; box-sizing:border-box;">
                    <img src="${svg}" style="max-width:100%; max-height:100%; object-fit:contain;">
                </div>`;
            }
        }, 
        (res) => this.buildPyramid(parseInt(res[0]), res[1]));
    },
    
    buildPyramid: function(levels, type) {
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const brickW = 120;
        const brickH = 60;
        const w = levels * brickW;
        const h = levels * brickH;

        const startX = logicalCenterX - w / 2;
        const startY = logicalCenterY - h / 2;

        let pyramidVals = [];
        let base = [];
        for(let i=0; i<levels; i++) base.push(Math.floor(Math.random() * 15) + 1);
        pyramidVals.push(base);
        
        for(let i=1; i<levels; i++) {
            let row = [];
            for(let j=0; j<pyramidVals[i-1].length - 1; j++) {
                row.push(pyramidVals[i-1][j] + pyramidVals[i-1][j+1]);
            }
            pyramidVals.push(row);
        }

        let visible = Array(levels).fill(null).map((_, i) => Array(levels - i).fill(type === 'add' ? false : true));
        if (type === 'add') {
            visible[0] = Array(levels).fill(true); 
        } else {
            for(let i=0; i<levels; i++) {
                for(let j=0; j<visible[i].length; j++) {
                    if (Math.random() > 0.6) visible[i][j] = false;
                }
            }
            visible[levels-1][0] = true; 
            visible[0][0] = true; 
        }

        const img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: nextId++, x: startX, y: startY, w: w, h: h, cx:0, cy:0, cw:w, ch:h, src: img.src, z: globalZ++ });

            for(let row=0; row<levels; row++) {
                let cols = levels - row;
                let rowStartX = startX + (w - cols * brickW) / 2;
                let currentY = startY + h - (row + 1) * brickH;

                for(let col=0; col<cols; col++) {
                    let currentX = rowStartX + col * brickW;
                    let val = pyramidVals[row][col];
                    
                    if (visible[row][col]) {
                        texts.push({ id: nextId++, x: currentX + brickW/2, y: currentY + 16, content: `<b>${val}</b>`, color: '#2d3436', fontSize: 28, fontFamily: 'sans-serif', align: 'center', textAlign: 'center', locked: true, z: globalZ++ });
                    }
                    // Les briques cachées restent 100% vides !
                }
            }
            if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
            showToast("🔺 Pyramide prête ! Utilisez le Crayon ou l'outil Texte pour remplir.");
        };
        img.src = this.getPyramidSVG(levels, false);
    }
});



// ==========================================
// 11. GÉNÉRATEUR : DOMINOS
// ==========================================
registerPlugin('dominoGeneratorTool', 'Exercices', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Générateur de Dominos'; 
        // Icône Domino
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Générer des Dominos", [
            { type: 'select', label: 'Objectif', value: 'random', options: [{value: 'random', label: 'Aléatoire'}, {value: 'doubles', label: 'Les Doubles'}, {value: 'comp10', label: 'Compléments à 10'}] },
            { type: 'select', label: 'Quantité', value: '3', options: [{value: '3', label: '3 dominos'}, {value: '5', label: '5 dominos'}] }
        ], null, (res) => this.buildDominos(res[0], parseInt(res[1])));
    },

    getDominoSVG: function(val1, val2) {
        const drawDots = (val, offsetY) => {
            let dots = "";
            let positions = [];
            if(val === 1) positions = [[50,50]];
            if(val === 2) positions = [[25,25], [75,75]];
            if(val === 3) positions = [[25,25], [50,50], [75,75]];
            if(val === 4) positions = [[25,25], [75,25], [25,75], [75,75]];
            if(val === 5) positions = [[25,25], [75,25], [50,50], [25,75], [75,75]];
            if(val === 6) positions = [[25,25], [75,25], [25,50], [75,50], [25,75], [75,75]];
            
            positions.forEach(p => {
                dots += `<circle cx="${p[0]}" cy="${p[1] + offsetY}" r="8" fill="#2d3436"/>`;
            });
            return dots;
        };

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200" width="100" height="200">`;
        svg += `<rect width="100" height="200" rx="10" fill="#f1f2f6" stroke="#2d3436" stroke-width="4"/>`;
        svg += `<line x1="0" y1="100" x2="100" y2="100" stroke="#2d3436" stroke-width="4"/>`;
        svg += drawDots(val1, 0);
        svg += drawDots(val2, 100);
        svg += `</svg>`;
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },

    buildDominos: function(type, count) {
        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        
        const spacingX = 150;
        const startX = logicalCenterX - ((count - 1) * spacingX / 2);

        for (let i = 0; i < count; i++) {
            let v1, v2;
            if (type === 'doubles') {
                v1 = Math.floor(Math.random() * 6) + 1;
                v2 = v1;
            } else if (type === 'comp10') {
                v1 = Math.floor(Math.random() * 5) + 2; // 2 à 6
                v2 = 10 - v1; 
                if (v2 > 6) { v1 = 4; v2 = 6; } // max 6 points sur un dé normal
            } else {
                v1 = Math.floor(Math.random() * 7); // 0 à 6
                v2 = Math.floor(Math.random() * 7);
            }

            const img = new Image();
            img.onload = () => {
                if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                images.push({ id: nextId++, x: startX + i * spacingX - 50, y: logicalCenterY - 100, w: 100, h: 200, cx:0, cy:0, cw:100, ch:200, src: img.src, z: globalZ++ });
                
                // Petit cache gris optionnel pour le résultat total sous le domino !
                const totalY = logicalCenterY + 140;
                texts.push({ id: nextId++, x: startX + i * spacingX, y: totalY, content: `<b>${v1+v2}</b>`, color: '#2d3436', fontSize: 28, fontFamily: 'sans-serif', align: 'center', textAlign: 'center', locked: true, z: globalZ++ });
                rectangles.push({ id: nextId++, x: startX + i * spacingX - 30, y: totalY - 25, w: 60, h: 35, fillColor: '#b2bec3', fillOpacity: 1, strokeColor: '#636e72', strokeWidth: 1.5, lineDash: 'solid', z: globalZ++ });

                if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
            };
            img.src = this.getDominoSVG(v1, v2);
        }
        showToast(`🎲 Dominos générés !`);
    }
});

// ==========================================
// 13. EXERCICE : SYMÉTRIE AXIALE (Aperçu et Tampon Natifs)
// ==========================================
registerPlugin('symmetryGeneratorTool', 'Exercices', {
    currentStamp: null, currentArgs: null,
    
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.mode = 'symmetry'; btn.title = 'Symétrie sur quadrillage'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M12 6c-3 0-6 2-6 5s3 5 6 5"/><path d="M12 6c3 0 6 2 6 5s-3 5-6 5"/><path d="M6 11l-4 2 4 2"/><path d="M18 11l4 2-4 2"/></svg>`;
        grid.appendChild(btn);

        btn.addEventListener('click', (e) => {
            // Activation du bouton et du mode "symmetry"
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active')); 
            btn.classList.add('active'); 
            if (typeof setMode === 'function') setMode('symmetry');

            openCustomPrompt("Symétrie", [
                { type: 'select', label: 'Modèle', value: 'space', options: [
                    {value: 'space', label: '🚀 Vaisseau'}, {value: 'house', label: '🏠 Maison'}, {value: 'robot', label: '🤖 Robot'},
                    {value: 'butterfly', label: '🦋 Papillon'}, {value: 'tree', label: '🌲 Sapin'}, {value: 'castle', label: '🏰 Château'}, {value: 'fish', label: '🐟 Poisson'}
                ]}
            ], 
            // 🌟 3ème paramètre (APERÇU) : On retourne juste le SVG brut comme pour la fraction !
            (res) => this.getSymmetrySVG(res[0], false), 
            
            // 🌟 4ème paramètre (ACTION) : Création du tampon natif !
            (res) => { 
                if (typeof createStampFromSVG === 'function') {
                    createStampFromSVG(this.getSymmetrySVG(res[0], true), (stamp) => { 
                        this.currentStamp = stamp; 
                        this.currentArgs = res; 
                        showToast("🦋 Tamponnez l'exercice sur le tableau !"); 
                    });
                }
            });
            e.stopPropagation();
        });
    },

    // Génération du SVG Brut
    getSymmetrySVG: function(model, isExport=false) {
        const cellSize = 35;
        const cols = 16;
        const rows = 12;
        const w = cols * cellSize; // 560
        const h = rows * cellSize; // 420

        // Si isExport=false (Aperçu dans la modale), on met width="100%" height="100%"
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport ? w : '100%'}" height="${isExport ? h : '100%'}">`;
        
        svg += `<rect width="${w}" height="${h}" fill="#ffffff" stroke="#b2bec3" stroke-width="2"/>`;

        svg += `<g stroke="#b2bec3" stroke-width="1" opacity="0.6">`;
        for(let r=1; r<rows; r++) svg += `<line x1="0" y1="${r*cellSize}" x2="${w}" y2="${r*cellSize}"/>`;
        for(let c=1; c<cols; c++) if(c !== 8) svg += `<line x1="${c*cellSize}" y1="0" x2="${c*cellSize}" y2="${h}"/>`;
        svg += `</g>`;

        svg += `<line x1="${8*cellSize}" y1="0" x2="${8*cellSize}" y2="${h}" stroke="#d63031" stroke-width="4"/>`;

        let pts = []; let extras = '';
        if (model === 'space') pts = [[8,1], [6,3], [6,5], [4,5], [4,8], [6,8], [6,10], [3,11], [8,11]];
        else if (model === 'house') { pts = [[8,2], [3,6], [4,6], [4,11], [8,11]]; extras += `<rect x="${5*cellSize}" y="${7*cellSize}" width="${2*cellSize}" height="${2*cellSize}" fill="none" stroke="#0984e3" stroke-width="3"/>`; }
        else if (model === 'robot') { pts = [[8,2], [5,2], [5,4], [3,4], [3,6], [5,6], [5,10], [8,10]]; extras += `<rect x="${6*cellSize}" y="${4*cellSize}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#0984e3" stroke-width="3"/>`; }
        else if (model === 'butterfly') pts = [[8,1], [6,2], [4,4], [5,6], [8,7], [6,9], [6,11], [8,10]];
        else if (model === 'tree') pts = [[8,1], [5,4], [7,4], [4,8], [7,8], [7,12], [8,12]];
        else if (model === 'castle') pts = [[8,3], [6,3], [6,5], [4,5], [4,3], [2,3], [2,11], [8,11]];
        else if (model === 'fish') pts = [[8,4], [6,2], [2,4], [2,8], [6,10], [8,8], [6,6], [8,6]];

        if(pts.length > 0) {
            let pathD = `M ${pts[0][0]*cellSize} ${pts[0][1]*cellSize} `;
            for(let i=1; i<pts.length; i++) pathD += `L ${pts[i][0]*cellSize} ${pts[i][1]*cellSize} `;
            svg += `<path d="${pathD}" stroke="#0984e3" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
        }
        svg += extras + `</svg>`;
        return svg;
    },

    // 🌟 HOOKS NATIFS DE TON APPLICATION 🌟
    onDraw: function(ctx) { 
        if(typeof mode !== 'undefined' && mode === 'symmetry' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) { 
            ctx.globalAlpha = 0.6; // Fantôme semi-transparent
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2); 
            ctx.globalAlpha = 1.0; 
        } 
    },
    
    onPointerDown: function(rawPos) { 
        if(typeof mode !== 'undefined' && mode === 'symmetry' && this.currentStamp) { 
            images.push({
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(), 
                x: rawPos.x - this.currentStamp.w/2, 
                y: rawPos.y - this.currentStamp.h/2, 
                w: this.currentStamp.w, 
                h: this.currentStamp.h, 
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, 
                src: this.currentStamp.src, 
                z: typeof globalZ !== 'undefined' ? globalZ++ : 1000
            }); 
            if (typeof saveState === 'function') saveState(); 
            if (typeof setMode === 'function') setMode('pointer'); // Retour au mode sélection après le clic
            this.currentStamp = null; 
            return true; // Bloque le dessin du crayon
        } 
        return false; 
    }
});
// ==========================================
// 12. GÉNÉRATEUR : TABLEAU DE NUMÉRATION GÉANT (Lignes dynamiques)
// ==========================================
registerPlugin('cduGeneratorTool', 'Mathematiques', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Tableau de Numération'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 11h20 M8 6v12 M16 6v12"/><text x="5" y="8.5" font-size="4" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">C</text><text x="12" y="8.5" font-size="4" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">D</text><text x="19" y="8.5" font-size="4" font-weight="bold" font-family="sans-serif" stroke="none" fill="currentColor" text-anchor="middle" dominant-baseline="central">U</text></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    
    openPrompt: function() {
        openCustomPrompt("Tableau de Numération", [
            { type: 'select', label: 'Format du tableau', value: 'full', options: [{value: 'full', label: 'Complet (Millièmes)'}, {value: 'int', label: 'Entiers uniquement'}] },
            { type: 'select', label: 'Nombre de lignes', value: '3', options: [{value: '1', label: '1 ligne'}, {value: '2', label: '2 lignes'}, {value: '3', label: '3 lignes'}, {value: '5', label: '5 lignes'}, {value: '8', label: '8 lignes'}, {value: '10', label: '10 lignes'}] }
        ], 
        (res) => `<div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; padding:10px;"><img src="${this.getCDUSvg(res[0], res[1])}" style="max-width:100%; max-height:110px; object-fit:contain; border-radius:4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>`, 
        (res) => this.buildCDUTable(res[0], res[1]));
    },
    
    getCDUSvg: function(format, rowsStr) {
        const rows = parseInt(rowsStr) || 3;
        const hasDecimals = (format !== 'int');
        const numCols = hasDecimals ? 12 : 9;
        const w = numCols * 70;
        const rowH = 60;
        const h = 120 + (rows * rowH); // Hauteur dynamique selon le nombre de lignes

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svg += `<rect x="0" y="0" width="630" height="${h}" fill="#e3f2fd" stroke="#2d3436" stroke-width="4"/>`;
        if (hasDecimals) svg += `<rect x="630" y="0" width="210" height="${h}" fill="#fff3e0" stroke="#2d3436" stroke-width="4"/>`;
        
        // En-têtes horizontaux
        svg += `<line x1="0" y1="40" x2="${w}" y2="40" stroke="#2d3436" stroke-width="2"/>`;
        svg += `<line x1="0" y1="80" x2="${w}" y2="80" stroke="#2d3436" stroke-width="2"/>`;
        
        // Lignes horizontales des cellules
        for(let r=0; r<=rows; r++) {
            let y = 120 + r * rowH;
            let sw = (r === 0 || r === rows) ? 2 : 1; 
            svg += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#2d3436" stroke-width="${sw}"/>`;
        }

        // Séparateurs verticaux principaux
        svg += `<line x1="210" y1="40" x2="210" y2="${h}" stroke="#2d3436" stroke-width="3"/>`;
        svg += `<line x1="420" y1="40" x2="420" y2="${h}" stroke="#2d3436" stroke-width="3"/>`;
        if (hasDecimals) svg += `<line x1="630" y1="0" x2="630" y2="${h}" stroke="#e74c3c" stroke-width="6"/>`;

        // Séparateurs fins C D U
        for(let i=1; i<numCols; i++) {
            if(i%3 !== 0) svg += `<line x1="${i*70}" y1="80" x2="${i*70}" y2="${h}" stroke="#2d3436" stroke-width="1" stroke-dasharray="4 4"/>`;
        }

        svg += `<text x="315" y="28" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0984e3" text-anchor="middle">PARTIE ENTIÈRE</text>`;
        if (hasDecimals) svg += `<text x="735" y="28" font-family="sans-serif" font-size="20" font-weight="bold" fill="#e67e22" text-anchor="middle">PARTIE DÉCIMALE</text>`;
        
        svg += `<text x="105" y="68" font-family="sans-serif" font-size="18" fill="#2d3436" text-anchor="middle">Millions</text>`;
        svg += `<text x="315" y="68" font-family="sans-serif" font-size="18" fill="#2d3436" text-anchor="middle">Milliers</text>`;
        // "Unités simples" devient "Unités"
        svg += `<text x="525" y="68" font-family="sans-serif" font-size="18" fill="#2d3436" text-anchor="middle">Unités</text>`;

        const cdu = ['C','D','U', 'C','D','U', 'C','D','U', 'd','c','m'];
        const cols = ['#2980b9','#2980b9','#2980b9', '#27ae60','#27ae60','#27ae60', '#2d3436','#2d3436','#2d3436', '#d35400','#d35400','#d35400'];
        for(let i=0; i<numCols; i++) {
            svg += `<text x="${i*70 + 35}" y="108" font-family="sans-serif" font-size="20" font-weight="bold" fill="${cols[i]}" text-anchor="middle">${cdu[i]}</text>`;
        }
        svg += `</svg>`;
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },

    buildCDUTable: function(format, rowsStr) {
        const rows = parseInt(rowsStr) || 3;
        const hasDecimals = (format !== 'int');
        const numCols = hasDecimals ? 12 : 9;
        const w = numCols * 70; 
        const h = 120 + (rows * 60);

        const logicalCenterX = (window.innerWidth / 2 - panX) / zoom;
        const logicalCenterY = (window.innerHeight / 2 - panY) / zoom;
        const startX = logicalCenterX - (w / 2); 
        const startY = logicalCenterY - (h / 2); // Le tableau se centre parfaitement peu importe sa hauteur

        const img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: nextId++, x: startX, y: startY, w: w, h: h, cx:0, cy:0, cw:w, ch:h, src: img.src, z: globalZ++ });
            
            // Fini les petits points générés automatiquement !
            if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw();
        };
        img.src = this.getCDUSvg(format, rowsStr);
        showToast("🧮 Tableau généré !");
    }
});


// ==============================================================================
// MÉGA-PACK ENSEIGNANT MIS À JOUR : PLUGINS ÉPURÉS & INTERACTIFS
// ==============================================================================

// ---------------------------------------------------------
// 6. TANGRAM INTERACTIF (Catégorie: Jeux + Nouvelle Icône)
// ---------------------------------------------------------
registerPlugin('tangramTool', 'Jeux', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Jeu de Tangram'; 
        // Icône Tangram stylisée et unique
     btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18"/>
    <path d="M3 3l18 18"/>
    <path d="M21 3l-9 9"/>
    <path d="M3 12l9 9"/>
    <path d="M12 21l9-9"/>
    <path d="M7.5 16.5l4.5-4.5"/>
</svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.buildTangram(); });
        grid.appendChild(btn);
    },
    buildTangram: function() {
        const cx = (window.innerWidth / 2 - panX) / zoom;
        const cy = (window.innerHeight / 2 - panY) / zoom;
        const s = 200; 
        const pieces = [
            { pts: `0,0 ${s},0 ${s/2},${s/2}`, col: '#e74c3c' }, 
            { pts: `0,0 ${s/2},${s/2} 0,${s}`, col: '#3498db' }, 
            { pts: `${s},${s} ${s},0 ${s/2},${s/2}`, col: '#2ecc71' }, 
            { pts: `${s/2},${s/2} ${s},${s/2} ${s*0.75},${s*0.75}`, col: '#f1c40f' }, 
            { pts: `${s/2},${s/2} ${s/2},${s} ${s*0.25},${s*0.75}`, col: '#9b59b6' }, 
            { pts: `${s/2},${s/2} ${s*0.75},${s*0.75} ${s/2},${s} ${s*0.25},${s*0.75}`, col: '#e67e22' }, 
            { pts: `0,${s} ${s/2},${s} ${s*0.75},${s*0.75} ${s*0.25},${s*0.75}`, col: '#1abc9c' } 
        ];
        
        pieces.forEach((p, i) => {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><polygon points="${p.pts}" fill="${p.col}" stroke="#2d3436" stroke-width="2"/></svg>`;
            let img = new Image();
            img.onload = () => {
                if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                images.push({ id: nextId++, x: cx - s/2 + (Math.random()*60 - 30), y: cy - s/2 + (Math.random()*60 - 30), w: s, h: s, cx:0, cy:0, cw:s, ch:s, src: img.src, z: globalZ++ });
                if (i === pieces.length - 1) { if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw(); showToast("🔺 Pièces de Tangram prêtes !"); }
            };
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
        });
    }
});

// ---------------------------------------------------------
// 8. DIVISION POSÉE (Nouvelle Icône de Potence très claire)
// ---------------------------------------------------------
registerPlugin('divisionTool', 'Mathematiques', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Division Posée'; 
        // Icône Potence mathématique standard
       btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/>
</svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Division Posée", [
            { type: 'number', label: 'Dividende', value: Math.floor(Math.random()*900)+100 },
            { type: 'number', label: 'Diviseur', value: Math.floor(Math.random()*8)+2 },
            { type: 'color', label: 'Couleur', value: '#2d3436' }
        ], null, (res) => this.buildDivision(res[0], res[1], res[2]));
    },
    buildDivision: function(dividende, diviseur, color) {
        let w = 250, h = 250;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svg += `<text x="10" y="45" font-family="sans-serif" font-weight="bold" font-size="34" fill="${color}" letter-spacing="6">${dividende}</text>`;
        svg += `<text x="145" y="45" font-family="sans-serif" font-weight="bold" font-size="34" fill="${color}">${diviseur}</text>`;
        svg += `<line x1="130" y1="10" x2="130" y2="${h-10}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
        svg += `<line x1="130" y1="55" x2="240" y2="55" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
        svg += `</svg>`;
        
        let img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: nextId++, x: (window.innerWidth/2 - panX)/zoom - w/2, y: (window.innerHeight/2 - panY)/zoom - h/2, w: w, h: h, cx:0, cy:0, cw:w, ch:h, src: img.src, z: globalZ++ });
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw(); showToast("➗ Gabarit de division généré !");
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    }
});

// ---------------------------------------------------------
// 13. POLYGONES RÉGULIERS
// ---------------------------------------------------------
registerPlugin('polygonTool', 'Mathematiques', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Polygones Réguliers'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Polygone Régulier", [
            { type: 'select', label: 'Côtés', value: '6', options: [{value:'3', label:'Triangle'}, {value:'5', label:'Pentagone'}, {value:'6', label:'Hexagone'}, {value:'8', label:'Octogone'}, {value:'10', label:'Décagone'}] },
            { type: 'color', label: 'Couleur', value: '#0984e3' }
        ], null, (res) => this.buildPolygon(parseInt(res[0]), res[1]));
    },
    buildPolygon: function(sides, color) {
        let s = 300, r = 140, cx = 150, cy = 150;
        let pts = "";
        for(let i=0; i<sides; i++) {
            let angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
            pts += `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)} `;
        }
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><polygon points="${pts.trim()}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="4" stroke-linejoin="round"/></svg>`;
        
        let img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: nextId++, x: (window.innerWidth/2 - panX)/zoom - s/2, y: (window.innerHeight/2 - panY)/zoom - s/2, w: s, h: s, cx:0, cy:0, cw:s, ch:s, src: img.src, z: globalZ++ });
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw(); showToast(`💠 Polygone à ${sides} côtés généré !`);
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    }
});

// ---------------------------------------------------------
// 23. BOGGLE (Nouvelle Icône + Bouton Remélanger Intégré)
// ---------------------------------------------------------
registerPlugin('boggleTool', 'Francais', {
    lastLetters: '',
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Grille Boggle'; 
        // Magnifique icône de dé de lettres unique
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><text x="6.5" y="7.5" font-size="5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle" dominant-baseline="central">B</text></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
        
        // Expose la fonction globalement pour le bouton de la modale
        window.boggleToolRemix = (size) => {
            const alpha = "EEEEEAAAAAIIIIIOOOONNNNRRRRTTTTSSSSLLLLUUUUDDDMMMGGGBBCCPPFFHHVVYYJQKWXZ";
            let txt = ""; for(let i=0; i<size*size; i++) txt += alpha[Math.floor(Math.random() * alpha.length)];
            this.lastLetters = txt;
            const previewImg = document.getElementById('boggle-preview-img');
            if (previewImg) previewImg.src = this.getBoggleSVG(size, txt);
        };
    },
    getBoggleSVG: function(size, letters) {
        let s = 400, cs = s / size;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">`;
        svg += `<rect width="${s}" height="${s}" fill="#2d3436" rx="12"/>`;
        for(let r=0; r<size; r++) {
            for(let c=0; c<size; c++) {
                let char = letters[r*size + c] || "A";
                svg += `<rect x="${c*cs + 4}" y="${r*cs + 4}" width="${cs-8}" height="${cs-8}" fill="#f1f2f6" rx="8"/>`;
                svg += `<text x="${c*cs + cs/2}" y="${r*cs + cs/2}" font-family="sans-serif" font-weight="bold" font-size="${size>4?32:44}" fill="#d63031" text-anchor="middle" dominant-baseline="central">${char}</text>`;
            }
        }
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg + `</svg>`)));
    },
    openPrompt: function() {
        // Force un tirage initial
        const size = 4;
        const alpha = "EEEEEAAAAAIIIIIOOOONNNNRRRRTTTTSSSSLLLLUUUUDDDMMMGGGBBCCPPFFHHVVYYJQKWXZ";
        this.lastLetters = ""; for(let i=0; i<16; i++) this.lastLetters += alpha[Math.floor(Math.random() * alpha.length)];

        openCustomPrompt("Grille de Boggle", [
            { type: 'select', label: 'Taille', value: '4', options: [{value:'3', label:'3x3 (9 dés)'}, {value:'4', label:'4x4 (16 dés)'}, {value:'5', label:'5x5 (25 dés)'}] }
        ], 
        // Zone d'aperçu dynamique avec bouton "Remélanger" fonctionnel
        (res) => {
            let sz = parseInt(res[0]);
            if (this.lastLetters.length !== sz*sz) {
                this.lastLetters = ""; for(let i=0; i<sz*sz; i++) this.lastLetters += alpha[Math.floor(Math.random() * alpha.length)];
            }
            return `<div style="display:flex; flex-direction:column; align-items:center; gap:10px; width:100%;">
                <img id="boggle-preview-img" src="${this.getBoggleSVG(sz, this.lastLetters)}" style="max-height:110px; object-fit:contain; border-radius:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <button type="button" class="btn-action secondary" style="padding:5px 12px; font-size:13px; font-weight:bold; cursor:pointer;" onclick="boggleToolRemix(parseInt(document.querySelector('.prompt-input').value))">🎲 Remélanger</button>
            </div>`;
        },
        (res) => this.buildBoggle(parseInt(res[0])));
    },
    buildBoggle: function(size) {
        let s = 400;
        let img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: nextId++, x: (window.innerWidth/2 - panX)/zoom - s/2, y: (window.innerHeight/2 - panY)/zoom - s/2, w: s, h: s, cx:0, cy:0, cw:s, ch:s, src: img.src, z: globalZ++ });
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw(); showToast("🎲 Grille de dés lancée !");
        };
        img.src = this.getBoggleSVG(size, this.lastLetters);
    }
});

// ---------------------------------------------------------
// 40. PETIT BAC (Mémoire + Télécommande de relance au tableau)
// ---------------------------------------------------------
registerPlugin('petitBacTool', 'Francais', {
    // 🌟 MÉMOIRE LOCALE DES CATÉGORIES 🌟
    lastCategories: 'Prénom, Animal, Fruit/Légume, Ville, Métier',
    currentBacId: null,

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Petit Bac'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="15" cy="15" r="2" fill="currentColor" stroke="none"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);

        window.petitBacRollLetter = () => {
            const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            const randomLetter = alpha[Math.floor(Math.random() * alpha.length)];
            const displayEl = document.getElementById('petitbac-letter-display');
            const inputEl = document.getElementById('petitbac-hidden-letter');
            if (displayEl && inputEl) {
                displayEl.innerHTML = randomLetter;
                inputEl.value = randomLetter;
                displayEl.style.transform = "scale(1.2)";
                setTimeout(() => displayEl.style.transform = "scale(1)", 150);
            }
        };
    },
    openPrompt: function() {
        const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const initialLetter = alpha[Math.floor(Math.random() * alpha.length)];

        openCustomPrompt("Jeu du Petit Bac", [
            // 🌟 ON UTILISE LA MÉMOIRE POUR PRÉ-REMPLIR LE CHAMP 🌟
            { type: 'text', label: 'Catégories (séparées par virgules)', value: this.lastCategories },
            { type: 'hidden', id: 'petitbac-hidden-letter', value: initialLetter }
        ], 
        (res) => {
            return `<div style="display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; padding: 5px 0;">
                <div style="font-size:12px; font-weight:bold; color:#636e72;">LETTRE SÉLECTIONNÉE</div>
                <div id="petitbac-letter-display" style="font-size:36px; font-weight:900; color:#e74c3c; font-family:sans-serif; transition: transform 0.15s ease; min-height:42px; line-height:1;">${initialLetter}</div>
                <button type="button" class="btn-action secondary" style="padding:6px 14px; font-size:13px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:6px; border-radius:6px;" onclick="petitBacRollLetter()">🎲 Tirer une lettre</button>
            </div>`;
        }, 
        (res) => {
            // 🌟 ON SAUVEGARDE CE QUE LE PROF A TAPÉ DANS LA MÉMOIRE 🌟
            this.lastCategories = res[0]; 
            const finalLetter = document.getElementById('petitbac-hidden-letter')?.value || initialLetter;
            this.buildBac(res[0], finalLetter);
        });
    },
    
    // Externalisation du SVG pour pouvoir le regénérer facilement
    getBacSVG: function(catsStr, letter) {
        let cats = catsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
        if(cats.length === 0) cats = ["Prénom", "Animal", "Ville"];
        
        let colW = 180, headerH = 60, rowH = 65, totalRows = 4;
        let titleH = 80; 
        
        let w = cats.length * colW;
        let h = headerH + (totalRows * rowH);
        let totalH = titleH + h; 
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${totalH}" width="${w}" height="${totalH}">`;
        
        svg += `<text x="${w/2}" y="50" font-family="sans-serif" font-weight="bold" font-size="46" fill="#e74c3c" text-anchor="middle">BAC : Lettre [ ${letter} ]</text>`;
        
        svg += `<rect x="0" y="${titleH}" width="${w}" height="${h}" fill="#fff" stroke="#2d3436" stroke-width="4"/>`;
        svg += `<rect x="0" y="${titleH}" width="${w}" height="${headerH}" fill="#e3f2fd" stroke="#2d3436" stroke-width="2"/>`;
        
        cats.forEach((c, i) => {
            svg += `<line x1="${i*colW}" y1="${titleH}" x2="${i*colW}" y2="${totalH}" stroke="#2d3436" stroke-width="2"/>`;
            svg += `<text x="${i*colW + colW/2}" y="${titleH + headerH/2}" font-family="sans-serif" font-weight="bold" font-size="18" fill="#0984e3" text-anchor="middle" dominant-baseline="central">${c}</text>`;
        });
        
        for(let r=1; r<=totalRows; r++) {
            svg += `<line x1="0" y1="${titleH + headerH + r*rowH}" x2="${w}" y2="${titleH + headerH + r*rowH}" stroke="#b2bec3" stroke-width="1" stroke-dasharray="4 4"/>`;
        }
        svg += `</svg>`;

        return { svgStr: svg, w: w, h: totalH };
    },

    buildBac: function(catsStr, letter) {
        let data = this.getBacSVG(catsStr, letter);
        
        let img = new Image();
        img.onload = () => {
            let cx = (window.innerWidth/2 - panX)/zoom;
            let cy = (window.innerHeight/2 - panY)/zoom;
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            
            this.currentBacId = nextId++;
            images.push({ id: this.currentBacId, x: cx - data.w/2, y: cy - data.h/2, w: data.w, h: data.h, cx:0, cy:0, cw:data.w, ch:data.h, src: img.src, z: globalZ++ });
            
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw(); 
            showToast(`📝 Grille Petit Bac prête (Lettre ${letter}) !`);
            
            // 🌟 APPARITION DE LA TÉLÉCOMMANDE SUR LE CANVAS 🌟
            this.createRemote(catsStr);
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data.svgStr)));
    },

    createRemote: function(catsStr) {
        // Supprime l'ancienne télécommande s'il y en a une
        if(document.getElementById('petitbac-remote')) document.getElementById('petitbac-remote').remove();
        
        const remote = document.createElement('div');
        remote.id = 'petitbac-remote';
        remote.style.cssText = "position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); z-index:10005; overflow:hidden; font-family:sans-serif; display:flex; align-items:center; padding: 8px 15px; gap: 15px; border: 2px solid #0984e3;";
        
        let html = `
            <div style="font-weight:bold; color:#2d3436; font-size:16px;">📝 Petit Bac actif</div>
            <button id="btn-pb-reroll" style="padding:10px 20px; background:#e74c3c; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:16px; box-shadow:0 4px 6px rgba(231, 76, 60, 0.3); transition: transform 0.1s;">🎲 Tirer une nouvelle lettre</button>
            <button id="btn-pb-close" style="padding:8px; background:transparent; color:#636e72; border:none; border-radius:6px; cursor:pointer; font-size:14px; text-decoration:underline;">Fermer</button>
        `;
        remote.innerHTML = html;
        document.body.appendChild(remote);

        // Action: Relancer la lettre directement sur le canvas
        remote.querySelector('#btn-pb-reroll').addEventListener('click', () => {
            const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            const newLetter = alpha[Math.floor(Math.random() * alpha.length)];
            
            let data = this.getBacSVG(catsStr, newLetter);
            let imgObj = images.find(i => i.id === this.currentBacId);
            
            if(imgObj) {
                const img = new Image();
                img.onload = () => { 
                    if (typeof imageCache !== 'undefined') imageCache[img.src] = img; 
                    imgObj.src = img.src; 
                    draw(); saveState(); 
                    showToast(`Nouvelle lettre : ${newLetter} !`);
                    
                    // Petit effet d'animation sur le bouton pour montrer que ça a marché
                    const btn = remote.querySelector('#btn-pb-reroll');
                    btn.style.transform = 'scale(0.95)';
                    setTimeout(() => btn.style.transform = 'scale(1)', 100);
                };
                img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data.svgStr)));
            } else {
                // Si l'image a été supprimée manuellement par le prof (outil poubelle)
                showToast("La grille a été supprimée du tableau.");
                remote.remove();
            }
        });

        // Action: Fermer la télécommande
        remote.querySelector('#btn-pb-close').addEventListener('click', () => { 
            remote.remove(); 
        });
    }
});

registerPlugin('weatherTool', 'Gestion', {
    currentStamp: null,
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Météo du Jour'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v2"/>
            <path d="m4.93 4.93 1.41 1.41"/>
            <path d="M20 12h2"/>
            <path d="m19.07 4.93-1.41 1.41"/>
            <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/>
            <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>
        </svg>`;
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            this.openPrompt(); 
            if (typeof closeAllPopups === 'function') closeAllPopups(); 
        });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Météo du Jour", [
            { type: 'select', label: 'Temps', value: 'sun', options: [{value:'sun', label:'☀️ Soleil'}, {value:'cloud', label:'☁️ Nuageux'}, {value:'rain', label:'🌧️ Pluie'}, {value:'snow', label:'❄️ Neige'}] }
        ], null, (res) => {
            document.querySelectorAll('#bar-tools .btn, #plugins-grid .btn').forEach(b => b.classList.remove('active'));
            this.buildWeather(res[0]);
        });
    },
    buildWeather: function(type) {
        let s = 150;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">`;
        if (type === 'sun') {
            svg += `<circle cx="75" cy="75" r="40" fill="#f1c40f" stroke="#f39c12" stroke-width="4"/>`;
            for(let i=0; i<8; i++) { let a = i * Math.PI/4; svg += `<line x1="${75+50*Math.cos(a)}" y1="${75+50*Math.sin(a)}" x2="${75+65*Math.cos(a)}" y2="${75+65*Math.sin(a)}" stroke="#f1c40f" stroke-width="5" stroke-linecap="round"/>`; }
        } else if (type === 'cloud') {
            svg += `<path d="M 40 100 Q 20 100 20 80 Q 20 50 60 50 Q 70 20 100 40 Q 130 30 130 60 Q 140 60 140 80 Q 140 100 110 100 Z" fill="#dfe6e9" stroke="#b2bec3" stroke-width="4"/>`;
        } else if (type === 'rain') {
            svg += `<path d="M 40 80 Q 20 80 20 60 Q 20 30 60 30 Q 70 0 100 20 Q 130 10 130 40 Q 140 40 140 60 Q 140 80 110 80 Z" fill="#636e72" stroke="#2d3436" stroke-width="4"/>`;
            svg += `<line x1="50" y1="95" x2="42" y2="120" stroke="#0984e3" stroke-width="4" stroke-linecap="round"/>`;
            svg += `<line x1="80" y1="105" x2="72" y2="130" stroke="#0984e3" stroke-width="4" stroke-linecap="round"/>`;
            svg += `<line x1="110" y1="95" x2="102" y2="120" stroke="#0984e3" stroke-width="4" stroke-linecap="round"/>`;
        } else if (type === 'snow') {
            svg += `<path d="M 40 80 Q 20 80 20 60 Q 20 30 60 30 Q 70 0 100 20 Q 130 10 130 40 Q 140 40 140 60 Q 140 80 110 80 Z" fill="#ecf0f1" stroke="#b2bec3" stroke-width="4"/>`;
            svg += `<circle cx="50" cy="100" r="4" fill="#74b9ff"/><circle cx="80" cy="112" r="4" fill="#74b9ff"/><circle cx="110" cy="100" r="4" fill="#74b9ff"/>`;
        }
        svg += `</svg>`;
        
        let img = new Image();
        img.onload = () => {
            this.currentStamp = { img: img, w: s, h: s, src: img.src };
            if (typeof setMode === 'function') setMode('weatherStamp');
            if (typeof showToast === 'function') showToast("📌 Cliquez pour placer la météo");
            if (typeof draw === 'function') draw();
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },
    onDraw: function(ctx) {
        if (typeof mode !== 'undefined' && mode === 'weatherStamp' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) {
            ctx.save();
            ctx.globalAlpha = 0.6; // Fantôme translucide
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2);
            ctx.restore();
        }
    },
    onPointerDown: function(rawPos) {
        if (typeof mode !== 'undefined' && mode === 'weatherStamp' && this.currentStamp) {
            if (typeof imageCache !== 'undefined') imageCache[this.currentStamp.src] = this.currentStamp.img;
            images.push({ 
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(), 
                x: rawPos.x - this.currentStamp.w/2, 
                y: rawPos.y - this.currentStamp.h/2, 
                w: this.currentStamp.w, 
                h: this.currentStamp.h, 
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h, 
                src: this.currentStamp.src, 
                z: typeof globalZ !== 'undefined' ? globalZ++ : 1000 
            });
            if(typeof saveState === 'function') saveState(); 
            if(typeof setMode === 'function') setMode('pointer'); 
            this.currentStamp = null; 
            if(typeof draw === 'function') draw();
            return true;
        }
        return false;
    }
});

registerPlugin('postitTool', 'Gestion', {
    currentStamp: null,
    
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; 
        btn.title = 'Déposer un Post-It'; 
        
        // 🎨 NOUVELLE ICÔNE 100% Noir & Blanc (Line-Art avec coin plié)
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16v10.5L14.5 20H4z"/>
            <path d="M14.5 14.5V20l5.5-5.5z"/>
            <line x1="8" y1="9" x2="16" y2="9"/>
            <line x1="8" y1="13" x2="14" y2="13"/>
        </svg>`;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('#bar-tools .btn, #plugins-grid .btn').forEach(b => b.classList.remove('active')); 
            btn.classList.add('active'); 
            
            if (typeof setMode === 'function') setMode('postit'); // Passe la souris en mode Post-it
            
            // 🌟 Génération du Post-It
            let s = 250;
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">`;
            svg += `<defs><filter id="p-shd"><feDropShadow dx="2" dy="5" stdDeviation="4" flood-opacity="0.25"/></filter></defs>`;
            svg += `<rect x="10" y="10" width="${s-20}" height="${s-20}" fill="#ffeaa7" filter="url(#p-shd)"/>`;
            svg += `<polygon points="${s-10},${s-40} ${s-40},${s-10} ${s-10},${s-10}" fill="#000" opacity="0.12"/>`; // Pli réaliste
            svg += `<path d="M ${s-40} ${s-10} Q ${s-25} ${s-25} ${s-10} ${s-40}" fill="none" stroke="#e5d443" stroke-width="1"/>`;
            svg += `</svg>`;
            
            // 🔧 CORRECTION : On charge l'image directement sans fonction externe !
            const b64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
            let img = new Image();
            img.onload = () => {
                // Dès que l'image est chargée, on crée le tampon fantôme
                this.currentStamp = { img: img, w: s, h: s, src: img.src };
                if (typeof showToast === 'function') showToast("📌 Cliquez sur le tableau pour coller le Post-It !");
                if (typeof draw === 'function') draw(); // Force l'apparition immédiate sous la souris
            };
            img.src = b64;
        });

        grid.appendChild(btn);
    },
    
    // Dessine le fantôme translucide sous le curseur
    onDraw: function(ctx) {
        if(typeof mode !== 'undefined' && mode === 'postit' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) {
            ctx.save();
            ctx.globalAlpha = 0.7; // Transparence du fantôme
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2); 
            ctx.restore();
        }
    },
    
    // Dépose l'image définitive au clic
    onPointerDown: function(rawPos) {
        if(typeof mode !== 'undefined' && mode === 'postit' && this.currentStamp) {
            if (typeof imageCache !== 'undefined') imageCache[this.currentStamp.src] = this.currentStamp.img;
            
            images.push({ 
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(), 
                x: rawPos.x - this.currentStamp.w/2, 
                y: rawPos.y - this.currentStamp.h/2, 
                w: this.currentStamp.w, 
                h: this.currentStamp.h, 
                cx: 0, cy: 0, 
                cw: this.currentStamp.w, 
                ch: this.currentStamp.h, 
                src: this.currentStamp.src, 
                z: typeof globalZ !== 'undefined' ? globalZ++ : 1000 
            });
            
            if (typeof saveState === 'function') saveState();
            if (typeof setMode === 'function') setMode('pointer'); // Retour à la flèche de sélection
            
            // On désactive le bouton
            document.querySelectorAll('#plugins-grid .btn').forEach(b => b.classList.remove('active'));
            
            this.currentStamp = null; // Détruit le tampon
            if(typeof draw === 'function') draw(); // Redessine la page sans le fantôme
            return true;
        }
        return false;
    }
});

// ---------------------------------------------------------
// 72. CALENDRIER MULTI-FORMATS (Interface Google Agenda + Choix Date)
// ---------------------------------------------------------
registerPlugin('calendarTool', 'Autre', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Calendrier & Affichages'; 
       btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <path d="M16 2v4"/>
    <path d="M8 2v4"/>
    <path d="M3 10h18"/>
    <rect x="6.5" y="14" width="3" height="3" rx="1" fill="currentColor" stroke="none"/>
    <rect x="10.5" y="14" width="3" height="3" rx="1" fill="currentColor" stroke="none"/>
    <rect x="14.5" y="14" width="3" height="3" rx="1" fill="currentColor" stroke="none"/>
</svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth().toString();

        openCustomPrompt("Générateur de Calendrier", [
            { type: 'select', label: 'Vue agenda', value: 'month', options: [{value:'day', label:'Journée (Emploi du temps)'}, {value:'week', label:'Semaine (7 colonnes)'}, {value:'month', label:'Mois complet (Grille)'}, {value:'year', label:'Aperçu Annuel (12 Mois)'}] },
            { type: 'select', label: 'Mois cible', value: currentMonth, options: [{value:'0', label:'Janvier'},{value:'1', label:'Février'},{value:'2', label:'Mars'},{value:'3', label:'Avril'},{value:'4', label:'Mai'},{value:'5', label:'Juin'},{value:'6', label:'Juillet'},{value:'7', label:'Août'},{value:'8', label:'Septembre'},{value:'9', label:'Octobre'},{value:'10', label:'Novembre'},{value:'11', label:'Décembre'}] },
            { type: 'number', label: 'Année', value: currentYear },
            { type: 'select', label: 'Style de couleur', value: '#0984e3', options: [{value:'#0984e3', label:'🔵 Bleu Google Agenda'}, {value:'#e74c3c', label:'🔴 Rouge Éduc'}, {value:'#2ecc71', label:'🟢 Vert Thème'}, {value:'#9b59b6', label:'🟣 Violet Rituels'}, {value:'#2d3436', label:'⚫ Ardoise'}] },
            { type: 'select', label: 'Options d\'écriture', value: 'yes', options: [{value:'yes', label:'Ajouter des lignes d\'écriture'}, {value:'no', label:'Gabarit épuré / blanc'}] }
        ], 
        // 🌟 APERÇU LIVE TECHNIQUE UNIQUE ET PROPRE 🌟
        (res) => {
            const view = res[0];
            const monthIdx = parseInt(res[1]) || 0;
            const yearNum = parseInt(res[2]) || currentYear;
            const themeCol = res[3];
            const linesOpt = res[4] === 'yes';
            
            const svgData = this.getCalendarSVGString(view, monthIdx, yearNum, themeCol, linesOpt, true);
            return `<div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; padding:5px;">
                <img src="${svgData}" style="max-width:100%; max-height:115px; object-fit:contain; border-radius:6px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); border: 1px solid #dfe6e9;">
            </div>`;
        }, 
        (res) => {
            const view = res[0];
            const monthIdx = parseInt(res[1]) || 0;
            const yearNum = parseInt(res[2]) || currentYear;
            const themeCol = res[3];
            const linesOpt = res[4] === 'yes';
            this.buildCalendarTarget(view, monthIdx, yearNum, themeCol, linesOpt);
        });
    },

    getCalendarSVGString: function(view, month, year, color, hasLines, isPreview = false) {
        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        let w = 550, h = 420;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        svg += `<rect width="${w}" height="${h}" fill="#ffffff" stroke="#2d3436" stroke-width="4" rx="8"/>`;
        svg += `<rect width="${w}" height="50" fill="${color}" rx="6"/>`;
        
        let titleText = `${monthNames[month].toUpperCase()} ${year}`;
        if(view === 'year') titleText = `ANNÉE ${year}`;
        if(view === 'day') titleText = `AGENDA DU JOUR - ${year}`;

        svg += `<text x="${w/2}" y="25" font-family="sans-serif" font-weight="bold" font-size="18" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${titleText}</text>`;
        
        if (view === 'day') {
            svg += `<text x="25" y="85" font-family="sans-serif" font-weight="bold" font-size="16" fill="${color}">Notes et Emploi du Temps :</text>`;
            for(let i=0; i<8; i++) {
                let y = 125 + i*34;
                svg += `<text x="30" y="${y}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#636e72" dominant-baseline="central">${8+i}h00</text>`;
                svg += `<line x1="85" y1="${y}" x2="${w-25}" y2="${y}" stroke="${hasLines?'#b2bec3':'#dfe6e9'}" stroke-width="1" ${hasLines?'':'stroke-dasharray="2 2"'}/>`;
            }
        } 
        else if (view === 'week') {
            const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
            let colW = w / 7;
            days.forEach((day, i) => {
                svg += `<rect x="${i*colW}" y="50" width="${colW}" height="30" fill="#f1f2f6" stroke="#b2bec3" stroke-width="1"/>`;
                svg += `<text x="${i*colW + colW/2}" y="65" font-family="sans-serif" font-weight="bold" font-size="12" fill="#2d3436" text-anchor="middle" dominant-baseline="central">${day}</text>`;
                if (hasLines) {
                    for(let l=0; l<6; l++) svg += `<line x1="${i*colW + 4}" y1="${110 + l*45}" x2="${(i+1)*colW - 4}" y2="${110 + l*45}" stroke="#dfe6e9" stroke-width="1"/>`;
                }
                if (i > 0) svg += `<line x1="${i*colW}" y1="50" x2="${i*colW}" y2="${h}" stroke="#2d3436" stroke-width="1.5"/>`;
            });
        } 
        else if (view === 'month') {
            const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
            let cw = w / 7, ch = (h - 80) / 5;
            days.forEach((day, i) => {
                svg += `<rect x="${i*cw}" y="50" width="${cw}" height="30" fill="#f1f2f6" stroke="#b2bec3" stroke-width="1"/>`;
                svg += `<text x="${i*cw + cw/2}" y="65" font-family="sans-serif" font-weight="bold" font-size="14" fill="#2d3436" text-anchor="middle" dominant-baseline="central">${day}</text>`;
            });
            let daysInMonth = new Date(year, month + 1, 0).getDate();
            let firstDay = new Date(year, month, 1).getDay(); if (firstDay === 0) firstDay = 7;
            let curR = 0, curC = firstDay - 1;
            for (let i = 1; i <= daysInMonth; i++) {
                let x = curC * cw, y = 80 + curR * ch;
                svg += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="#ffffff" stroke="#b2bec3" stroke-width="1"/>`;
                svg += `<text x="${x + 6}" y="${y + 12}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#636e72" text-anchor="start">${i}</text>`;
                if (hasLines) {
                    svg += `<line x1="${x+4}" y1="${y+ch-10}" x2="${x+cw-4}" y2="${y+ch-10}" stroke="#f1f2f6" stroke-width="1"/>`;
                }
                curC++; if (curC > 6) { curC = 0; curR++; }
            }
        } 
        else if (view === 'year') {
            let mw = w / 4, mh = (h - 50) / 3;
            const shortMonths = ["Janv", "Févr", "Mars", "Avril", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
            for(let i=0; i<12; i++) {
                let cx = (i % 4) * mw, cy = 50 + Math.floor(i / 4) * mh;
                svg += `<rect x="${cx+4}" y="${cy+4}" width="${mw-8}" height="${mh-8}" fill="#f8f9fa" stroke="#b2bec3" stroke-width="1" rx="4"/>`;
                svg += `<rect x="${cx+4}" y="${cy+4}" width="${mw-8}" height="22" fill="${color}" rx="2"/>`;
                svg += `<text x="${cx + mw/2}" y="${cy+15}" font-family="sans-serif" font-weight="bold" font-size="11" fill="#ffffff" text-anchor="middle">${shortMonths[i]}</text>`;
            }
        }
        svg += `</svg>`;
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },

    buildCalendarTarget: function(view, month, year, color, hasLines) {
        let w = 550, h = 420;
        let img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ id: nextId++, x: (window.innerWidth/2 - panX)/zoom - w/2, y: (window.innerHeight/2 - panY)/zoom - h/2, w: w, h: h, cx:0, cy:0, cw:w, ch:h, src: img.src, z: globalZ++ });
            if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw(); showToast("📅 Support d'agenda inséré avec succès !");
        };
        img.src = this.getCalendarSVGString(view, month, year, color, hasLines, false);
    }
});

// ---------------------------------------------------------
// 88. GENERATEUR DE QR CODE (Catégorie: Autre)
// ---------------------------------------------------------
registerPlugin('qrCodeTool', 'Autre', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Générer un QR Code'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openPrompt(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        grid.appendChild(btn);
    },
    openPrompt: function() {
        openCustomPrompt("Créer un QR Code", [
            { type: 'text', label: 'Adresse web (URL)', value: 'https://' }
        ], null, (res) => {
            if (!res[0] || res[0] === 'https://') return;
            showToast("⏳ Génération du QR Code...");
            let s = 300;
            let img = new Image();
            img.crossOrigin = "Anonymous"; 
            img.onload = () => {
                if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                images.push({ id: nextId++, x: (window.innerWidth/2 - panX)/zoom - s/2, y: (window.innerHeight/2 - panY)/zoom - s/2, w: s, h: s, cx:0, cy:0, cw:s, ch:s, src: img.src, z: globalZ++ });
                if(typeof saveState === 'function') saveState(); if(typeof draw === 'function') draw(); showToast("📱 QR Code importé au tableau !");
            };
            img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&data=${encodeURIComponent(res[0])}&margin=10`;
        });
    }
});

// ==============================================================================
// FIN DU MÉGA-PACK ENSEIGNANT RESTRUCTURÉ
// ==============================================================================

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

// ==============================================================================
// PACK JEUX DE PLATEAU V2 (Correction du bug d'affichage des Échecs)
// ==============================================================================

// --- FONCTION UTILITAIRE SÉCURISÉE ---
window.loadBoardGameElement = (b64, x, y, w, h, isLocked = false) => {
    return new Promise(resolve => {
        let img = new Image();
        img.onload = () => {
            if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
            images.push({ 
                id: nextId++, x: x, y: y, w: w, h: h, 
                cx: 0, cy: 0, cw: w, ch: h, 
                src: img.src, z: globalZ++, 
                locked: isLocked 
            });
            if(typeof draw === 'function') draw();
            resolve();
        };
        // Sécurité : si l'image plante, on débloque la suite quand même
        img.onerror = () => {
            console.error("Erreur de chargement d'un élément du jeu.");
            resolve(); 
        };
        img.src = b64;
    });
};
// ==============================================================================
// PLUGIN : JEU D'ÉCHECS MULTI-INSTANCES & MULTI-DESIGNS
// ==============================================================================

registerPlugin('chessTool', 'Jeux', {
    currentDesign: 'premium', 

    designs: {
        'premium': { name: 'Sauge Premium (3D)', light: '#eeeed2', dark: '#769656', ui: '#2f3640', text: '#ecf0f1', hasShadow: true },
        'flat': { name: 'Flat Color', light: '#ecf0f1', dark: '#27ae60', ui: '#2c3e50', text: '#ecf0f1', hasShadow: false },
        'minimalist': { name: 'Minimalist N&B', light: '#ffffff', dark: '#dcdde1', ui: '#2d3436', text: '#dfe6e9', hasShadow: false },
        'retro': { name: 'Retro Terminal', light: '#1e272e', dark: '#000000', ui: '#0fb9b1', text: '#ffffff', hasShadow: false }
    },

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Jeu d\'Échecs (Clic Droit pour designs)'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 20h16"/>
            <path d="M12 2v6"/>
            <path d="M9 5h6"/>
            <path d="M5 20l-2-9 4 2 5-6 5 6 4-2-2 9z"/>
        </svg>`;      
        
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            this.buildGame(); 
            if (typeof closeAllPopups === 'function') closeAllPopups(); 
        });

        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openDesignPopover(btn);
        });

        grid.appendChild(btn);
        this.createDesignPopover();
    },

    createDesignPopover: function() {
        if (document.getElementById('chess-design-popover')) return;
        const pop = document.createElement('div');
        pop.id = 'chess-design-popover';
        pop.style.cssText = 'position:fixed; background:rgba(255,255,255,0.98); border:1px solid #dfe6e9; border-radius:12px; padding:8px; box-shadow:0 6px 20px rgba(0,0,0,0.15); display:none; flex-direction:column; gap:4px; z-index:10000; backdrop-filter:blur(10px);';
        
        Object.keys(this.designs).forEach(key => {
            const d = this.designs[key];
            const dBtn = document.createElement('button');
            dBtn.style.cssText = 'background:none; border:none; padding:8px 12px; text-align:left; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; color:#2d3436; display:flex; align-items:center; gap:8px; transition: 0.1s;';
            dBtn.innerHTML = `<div style="width:16px; height:16px; border-radius:4px; background:${d.dark}; border:1px solid ${d.light};"></div> ${d.name}`;
            
            dBtn.addEventListener('mouseover', () => dBtn.style.background = '#f1f2f6');
            dBtn.addEventListener('mouseout', () => dBtn.style.background = 'none');
            dBtn.addEventListener('click', () => {
                this.currentDesign = key;
                if (typeof showToast === 'function') showToast(`🎨 Design échecs : ${d.name}`);
                pop.style.display = 'none';
            });
            pop.appendChild(dBtn);
        });

        document.body.appendChild(pop);
        window.addEventListener('click', () => pop.style.display = 'none');
    },

    openDesignPopover: function(anchorBtn) {
        const pop = document.getElementById('chess-design-popover'); if (!pop) return;
        if (typeof closeAllPopups === 'function') closeAllPopups(); 
        const rect = anchorBtn.getBoundingClientRect();
        pop.style.display = 'flex';
        pop.style.left = `${rect.left + rect.width / 2}px`;
        pop.style.transform = 'translateX(-50%)';
        pop.style.bottom = `${window.innerHeight - rect.top + 8}px`; 
    },

    buildGame: async function() {
        const d = this.designs[this.currentDesign];
        if (typeof showToast === 'function') showToast(`⏳ Installation échiquier (${d.name})...`);
        
        const cellW = 60; const pad = 30; 
        const w = cellW * 8 + pad * 2; const h = cellW * 8 + pad * 2;
        const cx = (window.innerWidth/2 - panX)/zoom - w/2;
        const cy = (window.innerHeight/2 - panY)/zoom - h/2;

        let boardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        boardSvg += `<defs><filter id="b-shadow"><feDropShadow dx="3" dy="8" stdDeviation="6" flood-opacity="0.3"/></filter></defs>`;
        
        boardSvg += `<rect x="5" y="5" width="${w-10}" height="${h-10}" fill="${d.ui}" rx="12" ${d.hasShadow ? 'filter="url(#b-shadow)"' : ''}/>`;
        boardSvg += `<rect x="20" y="20" width="${w-40}" height="${h-40}" fill="${d.text}" rx="4"/>`;

        for(let r=0; r<8; r++) {
            for(let c=0; c<8; c++) {
                let col = (r+c)%2 === 0 ? d.light : d.dark;
                boardSvg += `<rect x="${pad + c*cellW}" y="${pad + r*cellW}" width="${cellW}" height="${cellW}" fill="${col}"/>`;
            }
        }
        
        const letters = ['A','B','C','D','E','F','G','H'];
        const numbers = ['8','7','6','5','4','3','2','1'];
        boardSvg += `<g font-family="sans-serif" font-size="14" font-weight="bold" fill="${d.text}" text-anchor="middle">`;
        for(let i=0; i<8; i++) {
            boardSvg += `<text x="${pad + i*cellW + cellW/2}" y="${h - 8}">${letters[i]}</text>`;
            boardSvg += `<text x="15" y="${pad + i*cellW + cellW/2 + 5}">${numbers[i]}</text>`;
        }
        boardSvg += `</g></svg>`;
        
        let boardB64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(boardSvg)));
        
        // FALSE : Le plateau n'est pas verrouillé, on peut le sélectionner et le supprimer !
        await loadBoardGameElement(boardB64, cx, cy, w, h, false); 

        const pieceOrder = ['♜','♞','♝','♛','♚','♝','♞','♜'];
        const getPieceSVG = (char, isWhite) => {
            let fill = isWhite ? '#ffffff' : (d.hasShadow ? '#1e272e' : d.text);
            let stroke = isWhite ? '#2d3436' : (d.hasShadow ? '#ecf0f1' : d.ui);
            
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cellW} ${cellW}" width="${cellW}" height="${cellW}">`;
            svg += `<defs><filter id="p-shadow"><feDropShadow dx="2" dy="4" stdDeviation="3" flood-opacity="0.4"/></filter></defs>`;
            svg += `<text x="50%" y="54%" font-family="sans-serif" font-size="48" fill="${fill}" stroke="${stroke}" stroke-width="1.5" text-anchor="middle" dominant-baseline="central" ${d.hasShadow ? 'filter="url(#p-shadow)"' : ''}>${char}</text>`;
            svg += `</svg>`;
            return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
        };

        for(let c=0; c<8; c++) {
            loadBoardGameElement(getPieceSVG(pieceOrder[c], false), cx + pad + c*cellW, cy + pad + 0*cellW, cellW, cellW, false); 
            loadBoardGameElement(getPieceSVG('♟', false), cx + pad + c*cellW, cy + pad + 1*cellW, cellW, cellW, false); 
            loadBoardGameElement(getPieceSVG('♟', true), cx + pad + c*cellW, cy + pad + 6*cellW, cellW, cellW, false);  
            loadBoardGameElement(getPieceSVG(pieceOrder[c], true), cx + pad + c*cellW, cy + pad + 7*cellW, cellW, cellW, false);  
        }
        
        if(typeof saveState === 'function') saveState();
    }
});

// ------------------------------------------------------------------------------
// JEU DE DAMES PREMIUM (10x10 avec Pions Résine 3D)
// ------------------------------------------------------------------------------


if (typeof window.loadBoardGameElement === 'undefined') {
    window.loadBoardGameElement = (b64, x, y, w, h, isLocked = false) => {
        return new Promise(resolve => {
            let img = new Image();
            img.onload = () => {
                if (typeof imageCache !== 'undefined') imageCache[img.src] = img;
                images.push({ 
                    id: nextId++, x: x, y: y, w: w, h: h, 
                    cx: 0, cy: 0, cw: w, ch: h, 
                    src: img.src, z: globalZ++, 
                    locked: isLocked 
                });
                if(typeof draw === 'function') draw();
                resolve();
            };
            img.onerror = () => { resolve(); };
            img.src = b64;
        });
    };
}

// ------------------------------------------------------------------------------
// JEU DE DAMES (Multi-Designs & Déverrouillé)
// ------------------------------------------------------------------------------

registerPlugin('checkersTool', 'Jeux', {
    currentDesign: 'premium', 

    designs: {
        'premium': { name: 'Sauge Premium (Bois)', light: '#d4c4b7', dark: '#34495e', pW: '#ffffff', pR: '#ff7675', is3D: true, border: '#2a1b12' },
        'classic': { name: 'Classique', light: '#fdfbf7', dark: '#2d3436', pW: '#ffffff', pR: '#d63031', is3D: false, border: '#1e272e' },
        'minimalist': { name: 'Minimaliste', light: '#ffffff', dark: '#dfe6e9', pW: '#ffffff', pR: '#2d3436', is3D: false, border: '#b2bec3' }
    },

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; 
        btn.title = 'Jeu de Dames (Clic droit pour styles)'; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M12 3v18"/>
            <path d="M3 12h18"/>
            <circle cx="7.5" cy="16.5" r="2.5" fill="currentColor"/>
            <circle cx="16.5" cy="7.5" r="2.5" fill="currentColor"/>
        </svg>`;
        
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.buildGame(); if (typeof closeAllPopups === 'function') closeAllPopups(); });
        btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.openDesignPopover(btn); });
        
        grid.appendChild(btn);
        this.createDesignPopover();
    },

    createDesignPopover: function() {
        if (document.getElementById('checkers-design-popover')) return;
        const pop = document.createElement('div');
        pop.id = 'checkers-design-popover';
        pop.style.cssText = 'position:fixed; background:rgba(255,255,255,0.98); border:1px solid #dfe6e9; border-radius:12px; padding:8px; box-shadow:0 6px 20px rgba(0,0,0,0.15); display:none; flex-direction:column; gap:4px; z-index:10000; backdrop-filter:blur(10px);';
        
        Object.keys(this.designs).forEach(key => {
            const d = this.designs[key];
            const dBtn = document.createElement('button');
            dBtn.style.cssText = 'background:none; border:none; padding:8px 12px; text-align:left; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; color:#2d3436; display:flex; align-items:center; gap:8px; transition: 0.1s;';
            dBtn.innerHTML = `<div style="width:16px; height:16px; border-radius:4px; background:${d.dark}; border:1px solid ${d.light};"></div> ${d.name}`;
            
            dBtn.addEventListener('mouseover', () => dBtn.style.background = '#f1f2f6');
            dBtn.addEventListener('mouseout', () => dBtn.style.background = 'none');
            dBtn.addEventListener('click', () => {
                this.currentDesign = key;
                if (typeof showToast === 'function') showToast(`🎨 Design Dames : ${d.name}`);
                pop.style.display = 'none';
            });
            pop.appendChild(dBtn);
        });

        document.body.appendChild(pop);
        window.addEventListener('click', () => pop.style.display = 'none');
    },

    openDesignPopover: function(anchorBtn) {
        const pop = document.getElementById('checkers-design-popover'); if (!pop) return;
        if (typeof closeAllPopups === 'function') closeAllPopups(); 
        const rect = anchorBtn.getBoundingClientRect();
        pop.style.display = 'flex';
        pop.style.left = `${rect.left + rect.width / 2}px`;
        pop.style.transform = 'translateX(-50%)';
        pop.style.bottom = `${window.innerHeight - rect.top + 8}px`; 
    },

    buildGame: async function() {
        const d = this.designs[this.currentDesign];
        if (typeof showToast === 'function') showToast(`⏳ Déploiement du damier (${d.name})...`);
        const cellW = 54; const pad = 20; 
        const w = cellW * 10 + pad * 2; const h = cellW * 10 + pad * 2;
        const cx = (window.innerWidth/2 - panX)/zoom - w/2;
        const cy = (window.innerHeight/2 - panY)/zoom - h/2;

        let boardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
        
        if (d.is3D) {
            boardSvg += `<defs>
                <filter id="d-shadow"><feDropShadow dx="3" dy="8" stdDeviation="6" flood-opacity="0.3"/></filter>
                <linearGradient id="wood" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#4a3b32"/><stop offset="100%" stop-color="#2a1b12"/>
                </linearGradient>
            </defs>`;
            boardSvg += `<rect x="5" y="5" width="${w-10}" height="${h-10}" fill="url(#wood)" rx="10" filter="url(#d-shadow)"/>`; 
        } else {
            boardSvg += `<rect x="5" y="5" width="${w-10}" height="${h-10}" fill="${d.border}" rx="8"/>`; 
        }
        
        boardSvg += `<rect x="${pad-2}" y="${pad-2}" width="${cellW*10+4}" height="${cellW*10+4}" fill="${d.light}" rx="2"/>`; 

        for(let r=0; r<10; r++) {
            for(let c=0; c<10; c++) {
                let col = (r+c)%2 === 0 ? d.light : d.dark;
                boardSvg += `<rect x="${pad + c*cellW}" y="${pad + r*cellW}" width="${cellW}" height="${cellW}" fill="${col}"/>`;
            }
        }
        boardSvg += `</svg>`;
        let boardB64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(boardSvg)));
        
        // FALSE = déverrouillé, prêt à être sélectionné et supprimé
        await loadBoardGameElement(boardB64, cx, cy, w, h, false);

        const getPawnSVG = (isWhite) => {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cellW} ${cellW}" width="${cellW}" height="${cellW}">`;
            let baseColor = isWhite ? d.pW : d.pR;
            
            if (d.is3D) {
                svg += `<defs>
                    <filter id="pawn-shadow"><feDropShadow dx="1.5" dy="3.5" stdDeviation="2.5" flood-opacity="0.5"/></filter>
                    <radialGradient id="gradW" cx="35%" cy="30%" r="70%">
                        <stop offset="0%" stop-color="#ffffff"/>
                        <stop offset="100%" stop-color="#bdc3c7"/>
                    </radialGradient>
                    <radialGradient id="gradR" cx="35%" cy="30%" r="70%">
                        <stop offset="0%" stop-color="#ff7675"/>
                        <stop offset="100%" stop-color="#c0392b"/>
                    </radialGradient>
                </defs>`;
                let grad = isWhite ? "url(#gradW)" : "url(#gradR)";
                let stroke = isWhite ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.3)";
                
                svg += `<circle cx="${cellW/2}" cy="${cellW/2}" r="${cellW*0.42}" fill="${grad}" filter="url(#pawn-shadow)"/>`;
                svg += `<circle cx="${cellW/2}" cy="${cellW/2}" r="${cellW*0.30}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
                svg += `<circle cx="${cellW/2}" cy="${cellW/2}" r="${cellW*0.18}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
                svg += `<circle cx="${cellW/2}" cy="${cellW/2}" r="${cellW*0.08}" fill="${stroke}" />`;
            } else {
                let strokeC = isWhite ? '#b2bec3' : '#ffffff';
                svg += `<circle cx="${cellW/2}" cy="${cellW/2}" r="${cellW*0.4}" fill="${baseColor}" stroke="${strokeC}" stroke-width="2"/>`;
                svg += `<circle cx="${cellW/2}" cy="${cellW/2}" r="${cellW*0.25}" fill="none" stroke="${strokeC}" stroke-width="1.5" stroke-dasharray="4,4"/>`;
            }
            
            svg += `</svg>`;
            return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
        };

        const whitePawnB64 = getPawnSVG(true);
        const redPawnB64 = getPawnSVG(false);

        for(let r=0; r<10; r++) {
            for(let c=0; c<10; c++) {
                if((r+c)%2 !== 0) {
                    if(r < 4) {
                        loadBoardGameElement(redPawnB64, cx + pad + c*cellW, cy + pad + r*cellW, cellW, cellW, false);
                    } else if (r > 5) {
                        loadBoardGameElement(whitePawnB64, cx + pad + c*cellW, cy + pad + r*cellW, cellW, cellW, false);
                    }
                }
            }
        }
        if(typeof saveState === 'function') saveState();
    }
});

registerPlugin('geometryStampTool', 'Mathematiques', {
    currentStamp: null,
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn';
        btn.title = 'Figures Géométriques';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/>
            <circle cx="16.5" cy="6.5" r="3.5"/>
            <polygon points="12,21 21,21 16.5,12"/>
        </svg>`;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('#bar-tools .btn, #plugins-grid .btn').forEach(b => b.classList.remove('active')); 
            btn.classList.add('active');
            if(typeof setMode === 'function') setMode('geomStamp');
            
            openCustomPrompt("Figures Géométriques", [
                { type: 'select', label: 'Figure', value: 'square', options: [
                    {value:'square', label:'🟥 Carré'},
                    {value:'rect', label:'▭ Rectangle'},
                    {value:'rhombus', label:'♢ Losange'},
                    {value:'para', label:'▱ Parallélogramme'},
                    {value:'trap', label:'⏢ Trapèze'},
                    {value:'tri_eq', label:'△ Triangle Équilatéral'},
                    {value:'tri_iso', label:'△ Triangle Isocèle'},
                    {value:'tri_rect', label:'⊿ Triangle Rectangle'},
                    {value:'circle', label:'◯ Cercle'}
                ]},
                { type: 'color', label: 'Couleur', value: '#2d3436' }
            ], null, (res) => { this.buildShape(res[0], res[1]); });
        });
        grid.appendChild(btn);
    },
    
    buildShape: function(shape, color) {
        let s = 200; // Taille généreuse pour le tableau
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">`;
        let style = `fill="transparent" stroke="${color}" stroke-width="4" stroke-linejoin="round"`;
        let codeStyle = `fill="none" stroke="#e74c3c" stroke-width="3"`; // Le codage mathématique en rouge

        if (shape === 'square') {
            svg += `<rect x="40" y="40" width="120" height="120" ${style}/>`;
            // 4 Angles droits
            svg += `<path d="M40,60 h20 v-20 M160,60 h-20 v-20 M160,140 h-20 v20 M40,140 h20 v20" ${codeStyle}/>`;
            // Traits d'égalité
            svg += `<line x1="90" y1="30" x2="110" y2="50" ${codeStyle}/><line x1="90" y1="150" x2="110" y2="170" ${codeStyle}/>`;
            svg += `<line x1="30" y1="90" x2="50" y2="110" ${codeStyle}/><line x1="150" y1="90" x2="170" y2="110" ${codeStyle}/>`;
        } else if (shape === 'rect') {
            svg += `<rect x="20" y="60" width="160" height="80" ${style}/>`;
            svg += `<path d="M20,80 h20 v-20 M180,80 h-20 v-20 M180,120 h-20 v20 M20,120 h20 v20" ${codeStyle}/>`;
            svg += `<line x1="100" y1="50" x2="100" y2="70" ${codeStyle}/><line x1="100" y1="130" x2="100" y2="150" ${codeStyle}/>`;
            svg += `<line x1="15" y1="95" x2="25" y2="95" ${codeStyle}/><line x1="15" y1="105" x2="25" y2="105" ${codeStyle}/>`;
            svg += `<line x1="175" y1="95" x2="185" y2="95" ${codeStyle}/><line x1="175" y1="105" x2="185" y2="105" ${codeStyle}/>`;
        } else if (shape === 'rhombus') {
            svg += `<polygon points="100,20 160,100 100,180 40,100" ${style}/>`;
            svg += `<line x1="60" y1="50" x2="80" y2="70" ${codeStyle}/><line x1="120" y1="50" x2="140" y2="70" ${codeStyle}/>`;
            svg += `<line x1="60" y1="150" x2="80" y2="130" ${codeStyle}/><line x1="120" y1="150" x2="140" y2="130" ${codeStyle}/>`;
        } else if (shape === 'para') {
            svg += `<polygon points="60,40 180,40 140,160 20,160" ${style}/>`;
        } else if (shape === 'trap') {
            svg += `<polygon points="60,40 140,40 180,160 20,160" ${style}/>`;
        } else if (shape === 'tri_eq') {
            svg += `<polygon points="100,30 170,151 30,151" ${style}/>`;
            svg += `<line x1="55" y1="85" x2="75" y2="95" ${codeStyle}/>`;
            svg += `<line x1="145" y1="85" x2="125" y2="95" ${codeStyle}/>`;
            svg += `<line x1="95" y1="141" x2="95" y2="161" ${codeStyle}/>`;
        } else if (shape === 'tri_iso') {
            svg += `<polygon points="100,30 150,170 50,170" ${style}/>`;
            svg += `<line x1="65" y1="95" x2="85" y2="105" ${codeStyle}/>`;
            svg += `<line x1="135" y1="95" x2="115" y2="105" ${codeStyle}/>`;
        } else if (shape === 'tri_rect') {
            svg += `<polygon points="40,40 40,160 160,160" ${style}/>`;
            svg += `<path d="M40,140 h20 v20" ${codeStyle}/>`;
        } else if (shape === 'circle') {
            svg += `<circle cx="100" cy="100" r="80" ${style}/>`;
            svg += `<path d="M90,100 h20 M100,90 v20" ${codeStyle}/>`;
        }
        svg += `</svg>`;

        let img = new Image();
        img.onload = () => {
            this.currentStamp = { img: img, w: s, h: s, src: img.src };
            if (typeof showToast === 'function') showToast("📌 Cliquez pour placer la figure");
            if (typeof draw === 'function') draw();
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    },
    
    onDraw: function(ctx) {
        if (typeof mode !== 'undefined' && mode === 'geomStamp' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) {
            ctx.save(); ctx.globalAlpha = 0.6;
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2);
            ctx.restore();
        }
    },
    
    onPointerDown: function(rawPos) {
        if (typeof mode !== 'undefined' && mode === 'geomStamp' && this.currentStamp) {
            if (typeof imageCache !== 'undefined') imageCache[this.currentStamp.src] = this.currentStamp.img;
            images.push({
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(),
                x: rawPos.x - this.currentStamp.w/2, y: rawPos.y - this.currentStamp.h/2,
                w: this.currentStamp.w, h: this.currentStamp.h,
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h,
                src: this.currentStamp.src, z: typeof globalZ !== 'undefined' ? globalZ++ : 1000
            });
            if(typeof saveState === 'function') saveState();
            if(typeof setMode === 'function') setMode('pointer');
            document.querySelectorAll('#plugins-grid .btn').forEach(b => b.classList.remove('active'));
            this.currentStamp = null;
            if(typeof draw === 'function') draw();
            return true;
        }
        return false;
    }
});

registerPlugin('arrowTool', 'Mathematiques', {
    currentStamp: null,
    
    arrowStyles: [
        { id: 'straight', label: '1. Standard (Pleine)' },
        { id: 'block', label: '2. Massive (Bloc)' },
        { id: 'curved', label: '3. Courbée' },
        { id: 'dashed', label: '4. Pointillés' },
        { id: 'double', label: '5. Double Sens' },
        { id: 'zigzag', label: '6. Zig-Zag' },
        { id: 'split', label: '7. Bifurcation' },
        { id: 'hand', label: '8. Main Levée' }
    ],

    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Fabrique à Flèches';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); document.querySelectorAll('#bar-tools .btn, #plugins-grid .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
            if(typeof setMode === 'function') setMode('arrowStamp');
            this.openLivePreview();
        });
        grid.appendChild(btn);
    },

    openLivePreview: function() {
        let currentStyle = 'straight'; let currentColor = '#e74c3c';

        const modal = document.createElement('div'); modal.className = 'live-modal-backdrop';
        let html = `
            <div class="live-modal-box" style="width: 500px;">
                <div class="live-modal-header">↗️ La Fabrique à Flèches</div>
                <div class="live-modal-body">
                    <div class="live-modal-preview" id="arrow-preview-container"></div>
                    <div class="live-modal-controls" style="width: 200px;">
                        <div class="control-group">
                            <label>Style de Flèche</label>
                            <select id="arrow-style-select">
                                ${this.arrowStyles.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
                            </select>
                        </div>
                        <div class="control-group">
                            <label>Couleur</label>
                            <input type="color" id="arrow-color" value="#e74c3c" style="width: 100%; height: 40px;">
                        </div>
                    </div>
                </div>
                <div class="live-modal-footer">
                    <button class="btn-action secondary" id="btn-arrow-cancel">Annuler</button>
                    <button class="btn-action primary" id="btn-arrow-validate">Créer la Flèche</button>
                </div>
            </div>`;
        modal.innerHTML = html; document.body.appendChild(modal);

        const previewDiv = document.getElementById('arrow-preview-container');
        const updatePreview = () => { previewDiv.innerHTML = this.generateSVG(currentStyle, currentColor); };

        document.getElementById('arrow-style-select').addEventListener('change', (e) => { currentStyle = e.target.value; updatePreview(); });
        document.getElementById('arrow-color').addEventListener('input', (e) => { currentColor = e.target.value; updatePreview(); });

        document.getElementById('btn-arrow-cancel').addEventListener('click', () => { document.body.removeChild(modal); });
        document.getElementById('btn-arrow-validate').addEventListener('click', () => {
            const finalSVG = this.generateSVG(currentStyle, currentColor, true);
            let img = new Image();
            img.onload = () => {
                this.currentStamp = { img: img, w: 200, h: 100, src: img.src };
                if (typeof showToast === 'function') showToast("📌 Cliquez pour placer la flèche !");
                document.body.removeChild(modal);
            };
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(finalSVG)));
        });
        updatePreview();
    },

    generateSVG: function(style, color, isExport = false) {
        let w = 200; let h = 100; // Format rectangulaire adapté aux flèches
        let path = '';
        let strokeConf = `fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"`;
        
        // Flèches dessinées horizontalement de gauche à droite
        if (style === 'straight') { path = `<path d="M20,50 L180,50 M140,20 L180,50 L140,80" ${strokeConf}/>`; }
        else if (style === 'block') { path = `<polygon points="20,35 120,35 120,15 180,50 120,85 120,65 20,65" fill="${color}" stroke="#2d3436" stroke-width="4" stroke-linejoin="round"/>`; }
        else if (style === 'curved') { path = `<path d="M20,80 Q100,10 180,50 M140,20 L180,50 L135,70" ${strokeConf}/>`; }
        else if (style === 'dashed') { path = `<path d="M20,50 L180,50" fill="none" stroke="${color}" stroke-width="10" stroke-dasharray="15 15"/><path d="M140,20 L180,50 L140,80" ${strokeConf}/>`; }
        else if (style === 'double') { path = `<path d="M20,50 L180,50 M140,20 L180,50 L140,80 M60,20 L20,50 L60,80" ${strokeConf}/>`; }
        else if (style === 'zigzag') { path = `<path d="M20,50 L70,20 L120,80 L180,50 M140,20 L180,50 L150,80" ${strokeConf}/>`; }
        else if (style === 'split') { path = `<path d="M20,50 L100,50 L160,20 M100,50 L160,80 M130,10 L160,20 L145,45 M130,90 L160,80 L145,55" ${strokeConf}/>`; }
        else if (style === 'hand') { path = `<path d="M20,55 Q100,45 175,52 M135,20 Q150,40 175,52 M130,80 Q150,65 175,52" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`; }

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${isExport?w:'100%'}" height="${isExport?h:'100%'}">${path}</svg>`;
        return svg;
    },

    onDraw: function(ctx) {
        if (typeof mode !== 'undefined' && mode === 'arrowStamp' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) {
            ctx.save(); ctx.globalAlpha = 0.8;
            ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w/2, mouseLogicalPos.y - this.currentStamp.h/2);
            ctx.restore();
        }
    },
    
    onPointerDown: function(rawPos) {
        if (typeof mode !== 'undefined' && mode === 'arrowStamp' && this.currentStamp) {
            if (typeof imageCache !== 'undefined') imageCache[this.currentStamp.src] = this.currentStamp.img;
            images.push({
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(),
                x: rawPos.x - this.currentStamp.w/2, y: rawPos.y - this.currentStamp.h/2,
                w: this.currentStamp.w, h: this.currentStamp.h,
                cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h,
                src: this.currentStamp.src, z: typeof globalZ !== 'undefined' ? globalZ++ : 1000
            });
            if(typeof saveState === 'function') saveState();
            if(typeof setMode === 'function') setMode('pointer');
            document.querySelectorAll('#plugins-grid .btn').forEach(b => b.classList.remove('active'));
            this.currentStamp = null;
            if(typeof draw === 'function') draw();
            return true;
        }
        return false;
    }
});



registerPlugin('nativeBubbleTool', 'Autre', {
    init: function() {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Bulles BD Interactives';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); document.querySelectorAll('#bar-tools .btn, #plugins-grid .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
            
            // Ouvre le menu pour choisir le style
            openCustomPrompt("Créer une Bulle", [
                { type: 'select', label: 'Style de Bulle', value: 'oval', options: [
                    {value:'oval', label:'💬 Ovale (Parole)'},
                    {value:'rect', label:'💬 Rectangle'},
                    {value:'cloud', label:'💭 Nuage (Pensée)'},
                    {value:'shout', label:'💥 Cri (Explosion)'},
                    {value:'whisper', label:'🤫 Murmure (Pointillés)'}
                ]},
                { type: 'color', label: 'Couleur', value: '#2d3436' }
            ], null, (res) => {
                this.activeStyle = res[0];
                this.activeColor = res[1];
                if(typeof setMode === 'function') setMode('place_bubble');
                if(typeof showToast === 'function') showToast("📌 Cliquez sur le tableau pour poser la bulle !");
            });
        });
        grid.appendChild(btn);
    },

    onPointerDown: function(rawPos) {
        if (typeof mode !== 'undefined' && mode === 'place_bubble') {
            const textObj = {
                id: typeof nextId !== 'undefined' ? nextId++ : Date.now(),
                type: 'text',
                x: rawPos.x, y: rawPos.y,
                content: "Écrivez ici...",
                color: this.activeColor || '#2d3436',
                fontSize: typeof activeStyle !== 'undefined' ? activeStyle.fontSize : 24,
                
                isBubble: true,
                bubbleShape: this.activeStyle || 'oval',
                bubblePad: 25, // Taille/Padding par défaut
                tailX: rawPos.x - 70, 
                tailY: rawPos.y + 120, 
                fillColor: '#ffffff',
                borderWidth: 3,
                
                z: typeof globalZ !== 'undefined' ? globalZ++ : 1000
            };
            
            if (typeof texts !== 'undefined') texts.push(textObj);
            if (typeof selectedItems !== 'undefined') selectedItems = [{type: 'text', id: textObj.id}];
            
            if (typeof saveState === 'function') saveState();
            if (typeof setMode === 'function') setMode('pointer');
            document.querySelectorAll('#plugins-grid .btn').forEach(b => b.classList.remove('active'));
            
            if (typeof draw === 'function') draw();
            return true; 
        }
        return false;
    }
});

// =========================================================
// CONVERSION DES "TITLE" EN BEAUX TOOLTIPS
// =========================================================
setTimeout(() => {
    document.querySelectorAll('#plugins-grid .btn').forEach(btn => {
        if (btn.title) {
            // On transfère le texte vers notre attribut personnalisé
            btn.setAttribute('data-tooltip', btn.title);
            // On supprime l'attribut natif pour que le navigateur ne l'affiche plus
            btn.removeAttribute('title'); 
        }
    });
}, 500); // Petit délai pour s'assurer que les plugins sont bien chargés
