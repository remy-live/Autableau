// ============================================================================
// SCRATCH BLOCKS — Plugin autonome (extrait d'Autableau)
// ----------------------------------------------------------------------------
// Générateur d'algorithmes façon Scratch : palette de blocs, espace de travail
// avec emboîtement (snap), interpréteur intégré (ScratchInterpreter) avec
// aperçu animé, export SVG/PNG et mode tampon.
//
// Utilisation autonome :
//   1. Inclure ce fichier : <script src="scratch-plugin.js"></script>
//   2. Ouvrir le widget  : PluginManager.plugins.scratchBlocksTool.openWidget()
//
// Utilisation dans une appli hôte (type Autableau) :
//   Le shim ci-dessous ne définit registerPlugin / PluginManager /
//   createStampFromSVG que s'ils n'existent pas déjà. Si l'hôte les fournit,
//   ils sont utilisés tels quels. Les intégrations facultatives (setMode,
//   draw, saveState, showToast, images, imageCache…) sont détectées via
//   typeof et simplement ignorées si absentes.
// ============================================================================

// --- Shim de compatibilité (no-op si l'hôte fournit déjà ces objets) ---
if (typeof window.PluginManager === 'undefined') {
    window.PluginManager = {
        plugins: {},
        register: function (name, pluginObj) { this.plugins[name] = pluginObj; }
    };
}

if (typeof window.imageCache === 'undefined') {
    window.imageCache = {};
}

if (typeof window.registerPlugin === 'undefined') {
    window.registerPlugin = function (name, category, pluginObj) {
        PluginManager.register(name, pluginObj);
        // Si une grille de boutons existe (comme dans Autableau), on initialise
        // le bouton de l'outil ; sinon on utilisera openWidget() directement.
        if (document.getElementById('plugins-grid') && typeof pluginObj.init === 'function') {
            pluginObj.init();
        }
    };
}

if (typeof window.createStampFromSVG === 'undefined') {
    window.createStampFromSVG = function (svgStr, callback) {
        const svgData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
        const img = new Image();
        img.onload = () => {
            imageCache[svgData] = img;
            callback({ img: img, src: svgData, w: img.naturalWidth, h: img.naturalHeight });
        };
        img.src = svgData;
    };
}

// ==========================================
// PLUGIN : SCRATCH BLOCKS (Générateur d'algorithmes)
// ==========================================
class ScratchInterpreter {
    constructor(canvas, plugin) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.plugin = plugin;
        this.isRunning = false;

        this.panX = 0;
        this.panY = 0;
        this.zoom = 1;

        this.sprite = { x: 0, y: 0, dir: 90, visible: true, say: null, sayTime: 0 };
        this.pen = { down: false, color: '#0984e3', size: 2 };
        this.vars = {};
        this.penPaths = [];
        this.currentPath = null;

        this.catSVG = `data:image/svg+xml;utf8,<svg width="96px" height="101px" viewBox="0 0 96 101" version="1.1" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <g>
    <title>costume1.1</title>
    <desc>Created with Sketch.</desc>
    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
      <g id="costume1" transform="translate(-13.000000, -10.000000)">
        <g id="costume1.1" transform="translate(13.000000, 10.000000)">
          <g id="tail" transform="translate(0.000000, 59.000000)">
            <path d="M21.9,14.8 C19.5,14.3 16.6,13.5 14.2,11.3 C8.7,6.4 7,-1.7 3.2,0.4 C-0.7,2.5 -0.6,15.6 11.6,19.6 C15.8,21 19.6,21 22.7,20.9 C23.5,20.9 30.4,20.2 32.8,16.8 C35.2,13.4 33.5,12.5 32.7,12.1 C31.8,11.6 25.3,15.4 21.9,14.8 Z" stroke="%23001026" stroke-width="1.2" fill="%23FFAB19" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3.8,0.6 C1.8,1.2 0.8,5.4 1.8,8.9 C2.8,12.4 4.4,14.2 5.7,15.5 C5.5,14.8 5.1,12.6 6.8,11.3 C8.9,9.6 12.6,10.5 12.6,10.5 C12.6,10.5 9.5,6.7 7.9,4 C6.3,1.7 5.8,0.2 3.8,0.6 Z" id="detail" fill="%23FFFFFF"/>
          </g>
          <path d="M37.7,81.5 C35.9,82.7 29.7,87.1 21.8,89.6 L21.4,89.7 C21,89.8 20.8,90.3 21,90.7 C22.7,93.1 25.8,97.9 20.3,99.6 C15,101.3 5.1,87.2 9.3,83.5 C11.2,82.1 12.9,82.8 13.8,83.2 C14.3,83.4 14.8,83.4 15.3,83.3 C16.5,82.9 18.7,82.1 20.4,81.2 C24.7,79 25.7,78.1 27.7,76.6 C29.7,75.1 34.3,71.4 38,74.6 C41.2,77.3 39.4,80.3 37.7,81.5 Z" id="leg" stroke="%23001026" stroke-width="1.2" fill="%23FFAB19" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M53.6,60.7 C54.1,61.1 60.2,68.3 62.2,66.5 C64.6,64.4 67.9,60.3 71.5,63.6 C75.1,66.9 68.3,72.5 65.4,74 C58.5,77.1 52.9,71.2 51.7,69.6 C50.5,68 48.4,65.3 48.4,62.7 C48.5,59.9 51.9,59.2 53.6,60.7 Z" id="arm" stroke="%23001026" stroke-width="1.2" fill="%23FFAB19" stroke-linecap="round" stroke-linejoin="round"/>
          <g id="body-and-leg" transform="translate(28.000000, 57.000000)">
            <path d="M18.2,19.7 C19.4,18.8 20.6,17.3 22.2,15 C23.5,13.1 24.9,9.4 24.9,9.4 C25.8,6.9 26.4,2.1 23.1,2.2 C20.9,2.3 18.9,2 15.5,1.5 C9.5,0.3 8.4,-0.5 5.9,3.6 C3.2,8.4 -3.7,11.9 4.8,20.2 C4.8,20.2 9.7,24 15.6,29.8 C19.6,33.7 25.9,39.3 28.1,41.2 C28.6,41.6 29.2,41.8 29.8,41.9 C39.5,42.8 46.7,41.8 46.7,37.5 C46.7,30.3 32.4,32.8 32.4,32.8 C32.4,32.8 27.8,28.9 25.7,27 L18.2,19.7 Z" id="body" stroke="%23001026" stroke-width="1.2" fill="%23FFAB19" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22.6,13 C22.6,13 24.5,10.5 20.2,7.8 C15.7,4.9 14,8.1 12.2,10.5 C10.2,13.6 12.2,15.1 14.2,16.9 C15.8,18.4 17.3,19.6 17.3,19.6 C17.3,19.6 20.4,17.5 22.6,13 Z" id="tummy" fill="%23FFFFFF"/>
          </g>
          <path d="M30.2,68.4 C32.4,71.2 35.8,74.7 31.5,77.6 C25.6,80.9 20.7,70.9 19.7,67.4 C18.8,64.3 21.4,62.3 23.6,60.6 C27.9,57.5 31.5,54.7 35.5,56.2 C40.5,58 36.9,62 34.4,63.8 C32.9,64.9 31.4,66.1 30.3,66.8 C30,67.3 29.9,67.9 30.2,68.4 Z" id="arm" stroke="%23001026" stroke-width="1.2" fill="%23FFAB19" stroke-linecap="round" stroke-linejoin="round"/>
          <g id="head" transform="translate(14.000000, 0.000000)">
            <path d="M39.1,9 C36.8,8.6 34.4,8.4 31.6,8.6 C26.9,8.8 22.4,10.5 22.4,10.5 L10.3,2.6 C9.9,2.4 9.4,2.7 9.5,3.1 L11.6,21 C12.2,20.2 1,33.8 8.1,45.2 C15.2,56.6 30.3,61.7 49.1,58 C67.9,54.3 72.3,43.5 71.1,37.8 C69.9,32.1 62.8,30 62.8,30 C62.8,30 62.7,25.5 59.5,20 C57.6,16.7 51.2,12 51.2,12 L48.6,1.3 C48.5,0.9 48,0.8 47.7,1 L39.1,9 Z" stroke="%23001026" stroke-width="1.2" fill="%23FFAB19"/>
            <path d="M62.5,30.4 C62.5,30.4 69.4,32.2 70.6,37.9 C71.8,43.6 67,53.9 48.4,57.5 C24.2,62.5 12.7,48.1 19.4,37.5 C26.1,26.8 37.6,35.9 46,35.3 C53.2,34.8 54,28.5 62.5,30.4 Z" id="face" fill="%23FFFFFF"/>
            <path d="M31,41.1 C31,40.7 31.4,40.4 31.8,40.5 C33.7,41.2 39.1,42.8 45.1,43.2 C50.5,43.5 53.7,43.2 55.2,42.9 C55.7,42.8 56.1,43.3 55.9,43.8 C55,46.5 51.2,54 40.7,53.4 C31.6,52.4 30.7,46 31,41.1 Z" id="mouth" stroke="%23001026" stroke-width="1.2" fill="%23FFFFFF" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M69,35.4 C69,35.4 76.2,35.3 80.9,31.5" id="whisker" stroke="%23001026" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M69.4,41.3 C69.4,41.3 73.3,43.2 79.6,42.7" id="whisker" stroke="%23001026" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M45.6,32.7 C47.7,32.7 49.9,32.9 50,33.6 C50.1,35 48.6,37.8 47,37.9 C45.2,38.1 41,35.6 41,34 C40.9,32.8 43.6,32.7 45.6,32.7 Z" id="nose" stroke="%23001026" stroke-width="1.2" fill="%23001026" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M0.6,31.2 C0.6,31.2 9.2,34 12.7,37.1" id="whisker" stroke="%23001026" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M1.3,41.2 C1.3,41.2 8.7,42.3 13,40.6" id="whisker" stroke="%23001026" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <g id="eye" transform="translate(44.000000, 15.000000)">
              <path d="M13.4,6 C16.3,10.5 16.4,15.6 13.6,17.4 C10.8,19.2 6.2,17.1 3.2,12.6 C0.3,8.1 0.2,3 3,1.2 C5.8,-0.7 10.5,1.5 13.4,6 Z" id="pupil" stroke="%23001026" stroke-width="1.2" fill="%23FFFFFF" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M13,11.7 C13,12.8 12.2,13.7 11.2,13.7 C10.2,13.7 9.4,12.8 9.4,11.7 C9.4,10.6 10.2,9.7 11.2,9.7 C12.2,9.7 13,10.6 13,11.7" id="pupil" fill="%23001026"/>
            </g>
            <g id="eye" transform="translate(19.000000, 18.000000)">
              <path d="M13.6,5.8 C16.6,10.2 16.4,15.6 13.7,17.5 C10.4,19.4 6,18 3,13.6 C-0.1,9.2 -0.3,3.5 2.8,1.3 C5.9,-1 10.6,1.4 13.6,5.8 Z" stroke="%23001026" stroke-width="1.2" fill="%23FFFFFF" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M13,11.6 C13,12.7 12.2,13.6 11.2,13.6 C10.2,13.6 9.4,12.7 9.4,11.6 C9.4,10.5 10.2,9.6 11.2,9.6 C12.2,9.7 13,10.5 13,11.6" id="pupil" fill="%23001026"/>
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>
</svg>`;
        this.catImg = new Image();
        this.catImg.onload = () => { this.render(); };
        this.catImg.src = this.catSVG;
    }

    reset() {
        this.sprite = { x: 0, y: 0, dir: 90, visible: true, say: null, sayTime: 0 };
        this.pen = { down: false, color: '#0984e3', size: 2 };
        this.vars = {};
        this.penPaths = [];
        this.currentPath = null;
        this.render();
    }

    recordState() {
        this.history.push({
            sprite: JSON.parse(JSON.stringify(this.sprite)),
            pen: JSON.parse(JSON.stringify(this.pen)),
            vars: JSON.parse(JSON.stringify(this.vars)),
            penPaths: JSON.parse(JSON.stringify(this.penPaths)),
            currentPath: this.currentPath ? JSON.parse(JSON.stringify(this.currentPath)) : null,
            activeBlockId: this.activeBlockId || null
        });
    }

    applyState(index) {
        if (!this.history || this.history.length === 0) return;
        const state = this.history[index];
        this.sprite = JSON.parse(JSON.stringify(state.sprite));
        this.pen = JSON.parse(JSON.stringify(state.pen));
        this.vars = JSON.parse(JSON.stringify(state.vars));
        this.penPaths = JSON.parse(JSON.stringify(state.penPaths));
        this.currentPath = state.currentPath ? JSON.parse(JSON.stringify(state.currentPath)) : null;

        // Highlight active block
        if (this.plugin && this.plugin.allBlocks) {
            this.plugin.allBlocks.forEach(b => {
                if (b.pathEl) b.pathEl.style.filter = "var(--block-filter)";
            });
            if (state.activeBlockId) {
                const activeBlock = this.plugin.allBlocks.find(b => b.id === state.activeBlockId);
                if (activeBlock && activeBlock.pathEl) {
                    activeBlock.pathEl.style.filter = "brightness(1.4) drop-shadow(0 0 4px rgba(0,0,0,0.5))";
                }
            }
        }

        this.render();
    }

    async start(blocks) {
        if (this.isRunning) this.stop();
        this.reset();

        this.isRecording = true;
        this.history = [];
        this.stepCount = 0;
        this.isRunning = true;
        this.activeBlockId = null;
        this.recordState(); // initial state

        let entryPoint = blocks.find(b => b.def.parts[0] === 'quand le drapeau vert est cliqué' && !b.parent);
        if (!entryPoint) entryPoint = blocks.find(b => !b.parent);

        if (entryPoint) {
            await this.runStack(entryPoint);
        }

        this.activeBlockId = null;
        this.recordState(); // final state without highlight

        this.isRunning = false;
        this.isRecording = false;

        this.playbackIndex = 0;
        this.isPlaying = true;
        this.applyState(0);
        this.startPlayback();
    }

    startPlayback() {
        if (this.playbackTimer) clearTimeout(this.playbackTimer);
        this.isPlaying = true;

        const tick = () => {
            if (this.isPlaying && this.playbackIndex < this.history.length - 1) {
                this.playbackIndex++;
                this.applyState(this.playbackIndex);
            }
            if (this.isPlaying) {
                const speedSlider = document.getElementById('sc-speed-slider');
                const delay = speedSlider ? parseInt(speedSlider.value) : 150;
                this.playbackTimer = setTimeout(tick, delay);
            }
        };
        tick();
    }

    pausePlayback() {
        this.isPlaying = false;
    }

    stepPlayback(dir) {
        this.pausePlayback();
        this.playbackIndex = Math.max(0, Math.min(this.history.length - 1, this.playbackIndex + dir));
        this.applyState(this.playbackIndex);
    }

    stop() {
        this.isRunning = false;
        this.isPlaying = false;
        if (this.playbackTimer) clearTimeout(this.playbackTimer);
    }

    async runStack(block) {
        let current = block;
        while (current && this.isRunning) {
            await this.runBlock(current);
            if (!this.isRecording) {
                this.render();
                await this.sleep(16);
            }
            current = current.next;
        }
    }

    async getArgs(block) {
        const args = [];
        for (let i = 0; i < block.parts.length; i++) {
            const p = block.parts[i];
            if (p.type === 'input') {
                const slot = p.spec;
                if (slot && slot.childBlock) {
                    args.push(await this.evalReporter(slot.childBlock));
                } else if (slot && slot.val !== undefined) {
                    args.push(slot.val);
                } else {
                    args.push("");
                }
            }
        }
        return args;
    }

    async runBlock(block) {
        if (!this.isRunning) return;
        if (this.isRecording && this.stepCount > 2000) {
            this.isRunning = false;
            return;
        }
        this.stepCount++;
        this.activeBlockId = block.id;
        this.recordState();

        const text = block.def.parts[0];
        const args = await this.getArgs(block);

        if (text === 'avancer de') {
            const dist = parseFloat(args[0]) || 0;
            const rad = (this.sprite.dir - 90) * Math.PI / 180;
            this.moveSprite(this.sprite.x + Math.cos(rad) * dist, this.sprite.y + Math.sin(rad) * dist);
        }
        else if (text === 'tourner' && block.def.parts[1] === '↻') {
            this.sprite.dir = (this.sprite.dir + (parseFloat(args[0]) || 0)) % 360;
        }
        else if (text === 'tourner' && block.def.parts[1] === '↺') {
            this.sprite.dir = (this.sprite.dir - (parseFloat(args[0]) || 0)) % 360;
        }
        else if (text === "s'orienter à") {
            this.sprite.dir = parseFloat(args[0]) || 90;
        }
        else if (text === 'aller à x:') {
            this.moveSprite(parseFloat(args[0]) || 0, parseFloat(args[1]) || 0);
        }
        else if (text === 'aller à') {
            this.moveSprite((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 300);
        }
        else if (text === 'dire' && block.def.parts.includes('pendant')) {
            this.sprite.say = String(args[0]);
            this.render();
            await this.sleep((parseFloat(args[1]) || 1) * 1000);
            this.sprite.say = null;
        }
        else if (text === 'montrer') this.sprite.visible = true;
        else if (text === 'cacher') this.sprite.visible = false;
        else if (text === 'jouer le son') {
            if (typeof showToast === 'function') showToast("🎵 Son joué : " + args[0], "#0984e3", "🎵");
            await this.sleep(1000);
        }
        else if (text === 'demander') {
            let res = prompt(String(args[0]));
            this.vars['réponse'] = res || "";
        }

        else if (text === 'effacer tout') {
            this.penPaths = [];
            this.currentPath = null;
        }
        else if (text === "stylo en position d'écriture") {
            this.pen.down = true;
            this.currentPath = { color: this.pen.color, size: this.pen.size, lines: [] };
            this.penPaths.push(this.currentPath);
        }
        else if (text === 'relever le stylo') {
            this.pen.down = false;
            this.currentPath = null;
        }
        else if (text === 'mettre la couleur du stylo à') {
            this.pen.color = args[0] || '#000000';
            if (this.pen.down) {
                this.currentPath = { color: this.pen.color, size: this.pen.size, lines: [] };
                this.penPaths.push(this.currentPath);
            }
        }
        else if (text === 'mettre la taille du stylo à') {
            this.pen.size = parseFloat(args[0]) || 1;
            if (this.pen.down) {
                this.currentPath = { color: this.pen.color, size: this.pen.size, lines: [] };
                this.penPaths.push(this.currentPath);
            }
        }
        else if (text === 'ajouter' && block.def.parts.includes('à la taille du stylo')) {
            this.pen.size += parseFloat(args[0]) || 0;
            if (this.pen.down) {
                this.currentPath = { color: this.pen.color, size: this.pen.size, lines: [] };
                this.penPaths.push(this.currentPath);
            }
        }
        else if (text === 'mettre') {
            this.vars[args[0]] = parseFloat(args[1]) || args[1];
        }
        else if (text === 'ajouter' && block.def.parts.includes('à')) {
            let v = parseFloat(this.vars[args[1]]) || 0;
            this.vars[args[1]] = v + (parseFloat(args[0]) || 0);
        }
        else if (text === 'attendre') {
            await this.sleep((parseFloat(args[0]) || 0) * 1000);
        }
        else if (text === 'répéter') {
            const count = parseInt(args[0]) || 0;
            for (let k = 0; k < count; k++) {
                if (!this.isRunning) break;
                if (block.child) await this.runStack(block.child);
                await this.sleep(10);
            }
        }
        else if (text === 'indéfiniment') {
            while (this.isRunning) {
                if (block.child) await this.runStack(block.child);
                await this.sleep(10);
            }
        }
        else if (text === 'si' && !block.def.parts.includes('sinon')) {
            if (this.isTruthy(args[0])) {
                if (block.child) await this.runStack(block.child);
            }
        }
        else if (text === 'si' && block.def.parts.includes('sinon')) {
            if (this.isTruthy(args[0])) {
                if (block.child) await this.runStack(block.child);
            } else {
                if (block.child2) await this.runStack(block.child2);
            }
        }

        if (this.isRecording) {
            this.recordState();
        } else {
            this.render();
            await this.sleep(30);
        }
    }

    async evalReporter(block) {
        if (!block) return 0;
        const text = block.def.parts[0];
        const args = await this.getArgs(block);

        if (text === 'ma variable') return this.vars['var'] || 0;
        if (text === 'réponse') return this.vars['réponse'] || "";
        if (text === 'touche le') return false;
        if (text === 'distance de') return 100;

        if (block.def.parts.includes('+')) return (parseFloat(args[0]) || 0) + (parseFloat(args[1]) || 0);
        if (block.def.parts.includes('-')) return (parseFloat(args[0]) || 0) - (parseFloat(args[1]) || 0);
        if (block.def.parts.includes('*')) return (parseFloat(args[0]) || 0) * (parseFloat(args[1]) || 0);
        if (text === 'nombre aléatoire entre') {
            const min = parseFloat(args[0]) || 0;
            const max = parseFloat(args[1]) || 0;
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        if (text === 'regrouper') return String(args[0]) + String(args[1]);
        if (block.def.parts.includes('>')) return (parseFloat(args[0]) || 0) > (parseFloat(args[1]) || 0);
        if (block.def.parts.includes('<')) return (parseFloat(args[0]) || 0) < (parseFloat(args[1]) || 0);
        if (block.def.parts.includes('=')) return String(args[0]) === String(args[1]) || (parseFloat(args[0]) === parseFloat(args[1]));
        if (block.def.parts.includes('et')) return this.isTruthy(args[0]) && this.isTruthy(args[1]);
        if (block.def.parts.includes('ou')) return this.isTruthy(args[0]) || this.isTruthy(args[1]);

        return this.vars[text] || text;
    }

    isTruthy(val) {
        return val === true || val === 'true' || val === 1 || val === '1' || val === 'vrai';
    }

    moveSprite(nx, ny) {
        if (this.pen.down && this.currentPath) {
            this.currentPath.lines.push({ x1: this.sprite.x, y1: this.sprite.y, x2: nx, y2: ny });
        }
        this.sprite.x = nx;
        this.sprite.y = ny;
    }

    sleep(ms) {
        if (this.isRecording) return Promise.resolve();
        return new Promise(r => setTimeout(r, ms));
    }

    render() {
        if (this.isRecording) return;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);

        for (const path of this.penPaths) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = path.color;
            this.ctx.lineWidth = path.size;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            for (const line of path.lines) {
                this.ctx.moveTo(480 / 2 + line.x1, 360 / 2 - line.y1);
                this.ctx.lineTo(480 / 2 + line.x2, 360 / 2 - line.y2);
            }
            this.ctx.stroke();
        }

        if (this.sprite.visible && this.catImg.complete) {
            this.ctx.save();
            this.ctx.translate(480 / 2 + this.sprite.x, 360 / 2 - this.sprite.y);
            this.ctx.rotate((this.sprite.dir - 90) * Math.PI / 180);
            this.ctx.drawImage(this.catImg, -25, -25, 50, 50);
            this.ctx.restore();

            if (this.sprite.say) {
                this.ctx.fillStyle = 'white';
                this.ctx.strokeStyle = '#dfe6e9';
                this.ctx.lineWidth = 2;
                this.ctx.font = '14px Arial';
                const textWidth = this.ctx.measureText(this.sprite.say).width;
                const bubbleW = Math.max(textWidth + 20, 60);
                const bubbleH = 30;
                const bx = 480 / 2 + this.sprite.x + 10;
                const by = 360 / 2 - this.sprite.y - 60;

                this.ctx.beginPath();
                this.ctx.roundRect(bx, by, bubbleW, bubbleH, 10);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.moveTo(bx + 15, by + bubbleH);
                this.ctx.lineTo(bx + 20, by + bubbleH + 10);
                this.ctx.lineTo(bx + 25, by + bubbleH);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.fillStyle = '#2d3436';
                this.ctx.fillText(this.sprite.say, bx + 10, by + 20);
            }
        }

        this.ctx.restore();
    }
}

registerPlugin('scratchBlocksTool', 'Informatique', {
    widgetEl: null,
    currentStamp: null,

    // État interne du plugin
    allBlocks: [],
    snapCandidate: null,
    ctxTarget: null,
    teacherMode: false,

    CATEGORIES: {
        motion: { color: '#4C97FF', label: 'Mouvement' },
        looks: { color: '#9966FF', label: 'Apparence' },
        sound: { color: '#CF63CF', label: 'Sons' },
        events: { color: '#FFBF00', label: 'Evénements' },
        control: { color: '#FFAB19', label: 'Contrôle' },
        sensing: { color: '#5CB1D6', label: 'Capteurs' },
        operators: { color: '#59C059', label: 'Opérateurs' },
        variables: { color: '#FF8C1A', label: 'Variables' },
        pen: { color: '#0FBD8C', label: 'Stylo' }
    },

    BLOCK_LIBRARY: [
        { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '10' }, 'pas'] },
        { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '15' }, 'degrés'] },
        { cat: 'motion', type: 'command', parts: ['tourner', '↺', 'de', { t: 'num', v: '15' }, 'degrés'] },
        { cat: 'motion', type: 'command', parts: ['aller à', 'position aléatoire'] },
        { cat: 'motion', type: 'command', parts: ['aller à x:', { t: 'num', v: '0' }, 'y:', { t: 'num', v: '0' }] },
        { cat: 'motion', type: 'command', parts: ["s'orienter à", { t: 'num', v: '90' }] },
        { cat: 'looks', type: 'command', parts: ['dire', { t: 'num', v: 'Bonjour !' }, 'pendant', { t: 'num', v: '2' }, 'secondes'] },
        { cat: 'looks', type: 'command', parts: ['basculer sur le costume', { t: 'num', v: 'costume1' }] },
        { cat: 'looks', type: 'command', parts: ['montrer'] },
        { cat: 'looks', type: 'command', parts: ['cacher'] },
        { cat: 'pen', type: 'command', parts: ['effacer tout'] },
        { cat: 'pen', type: 'command', parts: ["stylo en position d'écriture"] },
        { cat: 'pen', type: 'command', parts: ['relever le stylo'] },
        { cat: 'pen', type: 'command', parts: ['mettre la couleur du stylo à', { t: 'num', v: '#000000' }] },
        { cat: 'pen', type: 'command', parts: ['ajouter', { t: 'num', v: '10' }, 'à la taille du stylo'] },
        { cat: 'pen', type: 'command', parts: ['mettre la taille du stylo à', { t: 'num', v: '1' }] },
        { cat: 'sound', type: 'command', parts: ['jouer le son', { t: 'num', v: 'Miaou' }, "jusqu'au bout"] },
        { cat: 'events', type: 'hat', parts: ['quand le drapeau vert est cliqué'] },
        { cat: 'events', type: 'hat', parts: ['quand la touche', { t: 'num', v: 'espace' }, 'est pressée'] },
        { cat: 'events', type: 'hat', parts: ['quand je reçois', { t: 'num', v: 'message1' }] },
        { cat: 'control', type: 'command', parts: ['attendre', { t: 'num', v: '1' }, 'secondes'] },
        { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '10' }, 'fois'] },
        { cat: 'control', type: 'c-block', parts: ['indéfiniment'] },
        { cat: 'control', type: 'c-block', parts: ['si', { t: 'bool', v: '' }, 'alors'] },
        { cat: 'control', type: 'e-block', parts: ['si', { t: 'bool', v: '' }, 'alors', 'sinon'] },
        { cat: 'control', type: 'command', parts: ['créer un clone de', { t: 'num', v: 'moi-même' }] },
        { cat: 'sensing', type: 'boolean', parts: ['touche le', { t: 'num', v: 'pointeur' }, '?'] },
        { cat: 'sensing', type: 'reporter', parts: ['distance de', { t: 'num', v: 'pointeur' }] },
        { cat: 'sensing', type: 'command', parts: ['demander', { t: 'num', v: 'Ton nom ?' }, 'et attendre'] },
        { cat: 'sensing', type: 'reporter', parts: ['réponse'] },
        { cat: 'operators', type: 'reporter', parts: [{ t: 'num', v: '' }, '+', { t: 'num', v: '' }] },
        { cat: 'operators', type: 'reporter', parts: [{ t: 'num', v: '' }, '-', { t: 'num', v: '' }] },
        { cat: 'operators', type: 'reporter', parts: [{ t: 'num', v: '' }, '*', { t: 'num', v: '' }] },
        { cat: 'operators', type: 'reporter', parts: ['nombre aléatoire entre', { t: 'num', v: '1' }, 'et', { t: 'num', v: '10' }] },
        { cat: 'operators', type: 'boolean', parts: [{ t: 'num', v: '' }, '>', { t: 'num', v: '50' }] },
        { cat: 'operators', type: 'boolean', parts: [{ t: 'num', v: '' }, '<', { t: 'num', v: '50' }] },
        { cat: 'operators', type: 'boolean', parts: [{ t: 'num', v: '' }, '=', { t: 'num', v: '50' }] },
        { cat: 'operators', type: 'boolean', parts: [{ t: 'bool', v: '' }, 'et', { t: 'bool', v: '' }] },
        { cat: 'operators', type: 'boolean', parts: [{ t: 'bool', v: '' }, 'ou', { t: 'bool', v: '' }] },
        { cat: 'operators', type: 'reporter', parts: ['regrouper', { t: 'num', v: 'a' }, 'et', { t: 'num', v: 'b' }] },
        { cat: 'variables', type: 'command', parts: ['mettre', { t: 'num', v: 'var' }, 'à', { t: 'num', v: '0' }] },
        { cat: 'variables', type: 'command', parts: ['ajouter', { t: 'num', v: '1' }, 'à', { t: 'num', v: 'var' }] },
        { cat: 'variables', type: 'reporter', parts: ['ma variable'] }
    ],

    NOTCH_MALE: "c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2",
    NOTCH_FEMALE: "c -2,0 -3,1 -4,2 l -4,4 c -1,1 -2,2 -4,2 h -12 c -2,0 -3,-1 -4,-2 l -4,-4 c -1,-1 -2,-2 -4,-2",

    init: function () {
        const grid = document.getElementById('plugins-grid'); if (!grid) return;
        const btn = document.createElement('button'); btn.className = 'btn'; btn.title = 'Algorithmes (Scratch)';
        btn.innerHTML = `<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3.1-9-7.56c0-1.25.43-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75Z"/></svg>`;
        grid.appendChild(btn);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (typeof setMode === 'function') setMode('pointer');
            this.openWidget();
        });
    },

    openWidget: function () {
        if (this.widgetEl) {
            this.widgetEl.style.display = 'flex';
            const previewEl = document.querySelector('#sc-preview-thumbnail');
            if (previewEl) previewEl.style.display = 'flex';

            // Center the cat whenever we re-open the widget
            if (this.interpreter && this.interpreter.sprite) {
                this.previewPanX = -this.interpreter.sprite.x * this.previewZoom;
                this.previewPanY = this.interpreter.sprite.y * this.previewZoom;
                if (this.updatePreviewTransform) this.updatePreviewTransform();
            }
            return;
        }

        const oldPreview = document.querySelector('#sc-preview-thumbnail');
        if (oldPreview) oldPreview.remove();

        const self = this;

        this.widgetEl = document.createElement('div');
        this.widgetEl.id = 'scratch-plugin-wrap';
        this.widgetEl.style.cssText = `position:fixed; top:5vh; left:calc(50% - 480px); width:960px; height:85vh; background:#fff; border-radius:12px; box-shadow:0 20px 50px rgba(0,0,0,0.2); z-index:100000; display:flex; flex-direction:column; overflow:hidden; font-family:'Roboto', sans-serif; border:1px solid #dfe6e9;`;

        const style = document.createElement('style');
        style.innerHTML = `
            #scratch-plugin-wrap {
                --bg-color: #f8f9fa; 
                --col-motion: #4C97FF; --col-looks: #9966FF; --col-sound: #CF63CF;
                --col-events: #FFBF00; --col-control: #FFAB19; --col-sensing: #5CB1D6;
                --col-operators: #59C059; --col-variables: #FF8C1A; --col-pen: #0FBD8C;
                --block-stroke: rgba(0,0,0,0.15); --block-stroke-width: 1px;
                --text-color: white; --input-bg: white; --input-text: #575E75;
                --slot-hex-bg: rgba(0,0,0,0.2); --slot-stroke: none;
                --block-filter: url(#sc-shadow);
            }
            .sc-header { height: 56px; background: #ffffff; color: #2d3436; border-bottom: 1px solid #dfe6e9; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-weight: 600; font-size: 14px; cursor: grab; user-select:none; }
            .sc-header:active { cursor: grabbing; }
            .sc-toolbar-group { display: flex; align-items: center; gap: 10px; }

            .sc-btn, .sc-select { background: #f1f2f6; color: #2d3436; border: 1px solid transparent; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s ease; outline:none; font-size:13px; }
            .sc-btn:hover, .sc-select:hover { background: #dfe6e9; border-color: #b2bec3; }
            .sc-btn.active { background: #ff7675; color: white; border-color: #ff7675; box-shadow: 0 2px 5px rgba(255, 118, 117, 0.3); }
            .sc-btn-preview { background: #74b9ff; color: white; border-color: #74b9ff; box-shadow: 0 2px 4px rgba(116, 185, 255, 0.3); }
            .sc-btn-preview:hover { background: #0984e3; border-color: #0984e3; color: white; }
            .sc-btn-export { background: #55efc4; color: #2d3436; border-color: #55efc4; box-shadow: 0 2px 4px rgba(85, 239, 196, 0.3); }
            .sc-btn-export:hover { background: #00b894; border-color: #00b894; color: white; }
            .sc-btn-icon { background: transparent; color: #b2bec3; padding: 6px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.2s; }
            .sc-btn-icon:hover { background: #f1f2f6; color: #d63031; }

            .sc-label { cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: #636e72; padding: 4px 8px; border-radius: 6px; transition: background 0.2s; }
            .sc-label:hover { background: #f1f2f6; }
            .sc-label input { accent-color: #4C97FF; cursor: pointer; width: 14px; height: 14px; margin: 0; }

            .sc-body { display: flex; flex: 1; overflow: hidden; background:var(--bg-color);}
            .sc-sidebar { width: 350px; background: white; border-right: 1px solid #dfe6e9; display: flex; flex-direction: column; z-index: 10; position: relative; }

            .sc-sidebar.trash-zone { background-color: #ffcccc; box-shadow: inset 0 0 50px rgba(214, 48, 49, 0.2); transition: all 0.2s; }
            .sc-sidebar.trash-zone::after { content: "🗑️"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 140px; opacity: 1; pointer-events: none; filter: none; z-index: 9999; }
            .sc-sidebar.trash-zone .sc-cat-filters, .sc-sidebar.trash-zone .sc-palette { opacity: 0.1; transition: opacity 0.2s; }

            .sc-cat-filters { padding: 12px 10px; display: flex; gap: 8px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid #dfe6e9; background: #fafafa; }
            .sc-cat-filters::-webkit-scrollbar { display: none; }
            .sc-cat-dot { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .sc-cat-dot:hover { transform: scale(1.25); box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
            .sc-palette { flex: 1; overflow-y: auto; padding: 20px 15px; background: #ffffff; }

            .sc-workspace { flex: 1; position: relative; overflow: visible; z-index: 20; }
            .sc-workspace svg { width: 100%; height: 100%; overflow: visible; touch-action: none; }

            .sc-block-group { cursor: grab; touch-action: none; }
            /* Bloc fantôme pendant le glissement (repris d'AtoutMath) : le bloc
               déplacé s'allège et se décolle, sa vignette d'origine s'estompe. */
            /* L'ombre passe par --block-filter : les blocs portent un style en ligne
               « filter: var(--block-filter) » qui l'emporterait sur toute règle CSS. */
            .sc-block-group.dragging { opacity: 0.7; cursor: grabbing; --block-filter: drop-shadow(0 8px 12px rgba(0,0,0,0.35)); }
            .sc-block-group.dragging .sc-block-text { opacity: 0.9; }
            .sc-palette > div.sc-drag-source { opacity: 0.3; transition: opacity 0.15s; }
            .sc-palette > div { touch-action: none; }
            #sc-preview-thumbnail { max-width: min(480px, 36vw); max-height: min(420px, 32vh); }
            #sc-preview-dock { flex-shrink: 0; border-top: 2px solid #dfe6e9; background: #fff; }
            #sc-preview-dock:empty { display: none; }
            @media (max-width: 1000px) {
                #scratch-plugin-wrap .sc-sidebar { width: 270px; }
            }
            .sc-block-path { stroke: var(--block-stroke); stroke-width: var(--block-stroke-width); fill-rule: evenodd; filter: var(--block-filter); transition: fill 0.2s, stroke 0.2s; }
            .sc-block-text { fill: var(--text-color); font-family: sans-serif; font-weight: 600; font-size: 13px; pointer-events: none; dominant-baseline: central; text-shadow: 0 1px 2px rgba(0,0,0,0.15); }
            #scratch-plugin-wrap.style-bw .sc-block-text { text-shadow: none; }
            #scratch-plugin-wrap.opt-outline {
                --block-stroke: #000; --block-stroke-width: 1.5px;
            }
            #scratch-plugin-wrap.style-grayscale .sc-workspace,
            #scratch-plugin-wrap.style-grayscale .sc-palette,
            #scratch-plugin-wrap.style-grayscale .sc-cat-filters {
                filter: grayscale(100%);
            }
            #scratch-plugin-wrap.style-bw {
                --col-motion: #fff; --col-looks: #fff; --col-sound: #fff;
                --col-events: #fff; --col-control: #fff; --col-sensing: #fff;
                --col-operators: #fff; --col-variables: #fff; --col-pen: #fff;
                --text-color: #000; --input-bg: #fff; --slot-stroke: #000;
            }
            #scratch-plugin-wrap.style-bw .sc-block-path { stroke: #000; stroke-width: 1.5px; }
            #scratch-plugin-wrap.style-bw .sc-cat-dot { border-color: #000; }
            .sc-input-field { width: 100%; height: 100%; border: none; outline: none; background: transparent; color: var(--input-text); font-family: sans-serif; font-size: 13px; font-weight: 600; text-align: center; padding: 0; margin: 0; cursor: text; }
            .sc-slot-bg.num { fill: var(--input-bg); stroke: var(--slot-stroke); stroke-width: 1px; }
            .sc-slot-bg.bool { fill: var(--slot-hex-bg); stroke: var(--slot-stroke); stroke-width: 1px; }
            #sc-context-menu { position: absolute; display: none; background: white; border: 1px solid #ccc; box-shadow: 0 5px 15px rgba(0,0,0,0.1); border-radius: 6px; z-index: 1000; overflow:hidden;}
            .sc-ctx-item { padding: 10px 20px; cursor: pointer; font-size: 13px; color: #d63031; font-weight:bold;}
            .sc-ctx-item:hover { background: #f1f2f6; }
            .teacher-mode .sc-input-field { cursor: crosshair !important; }
            .teacher-mode .sc-input-field:hover { background-color: rgba(255, 118, 117, 0.4) !important; border-radius: 8px; }
        `;
        this.widgetEl.appendChild(style);

        this.widgetEl.innerHTML += `
            <div class="sc-header" id="sc-drag-handle">
                <div class="sc-toolbar-group">
                    <div style="display:flex; align-items:center; gap:8px; margin-right:10px;">
                        <span style="font-size:18px; font-weight:700; color:#4C97FF; letter-spacing:-0.5px;">Studio</span>
                    </div>
                    <div style="width:1px; height:24px; background:#dfe6e9; margin:0 5px;"></div>
                    <select id="sc-style-sel" class="sc-select">
                        <option value="scratch">Standard</option>
                        <option value="grayscale">Niv. Gris</option>
                        <option value="bw">Noir & Blanc</option>
                    </select>
                    <label class="sc-label"><input type="checkbox" id="sc-check-outline"> Bords</label>
                    <label class="sc-label"><input type="checkbox" id="sc-check-grid" checked> Grille</label>
                </div>
                <div class="sc-toolbar-group">
                    <button class="sc-btn" id="sc-btn-teacher" title="Effacer le contenu de toutes les zones de saisie">Effacer</button>
                    <div style="width:1px; height:24px; background:#dfe6e9; margin:0 5px;"></div>
                    <select id="sc-template-sel" class="sc-select">
                        <option value="">Modèles...</option>
                        <option value="square">Carré</option>
                        <option value="triangle">Triangle</option>
                        <option value="hexagon">Hexagone</option>
                        <option value="star">Étoile</option>
                        <option value="stairs">Escalier</option>
                        <option value="dashed">Pointillés</option>
                        <option value="circle">Cercle</option>
                        <option value="flower">Rosace</option>
                        <option value="polygons">Polygones emboîtés</option>
                        <option value="random">Marche Aléatoire</option>
                        <option value="dialog">Dialogue</option>
                    </select>
                    <button class="sc-btn-icon" id="sc-btn-clear" title="Tout effacer">🗑️</button>
                    <button class="sc-btn sc-btn-export" id="sc-btn-export">📥 Tamponner</button>
                    <div style="width:1px; height:24px; background:#dfe6e9; margin:0 5px;"></div>
                    <button class="sc-btn-icon" id="sc-btn-close" title="Fermer">✕</button>
                </div>
            </div>
            
            <div class="sc-body">
                <div class="sc-sidebar" id="sc-sidebar">
                    <div class="sc-cat-filters" id="sc-cat-filters"></div>
                    <div class="sc-palette" id="sc-palette-scroll"></div>
                    <div id="sc-preview-dock"></div>
                </div>
                <div class="sc-workspace">
                    <div style="position:absolute; bottom: 10px; right: 10px; z-index: 999; display:flex; justify-content:flex-end; gap: 5px;">
                        <button id="sc-btn-zoom-in" style="width:30px; height:30px; border-radius:50%; background:#fff; border:1px solid #ccc; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);">➕</button>
                        <button id="sc-btn-zoom-reset" style="width:30px; height:30px; border-radius:50%; background:#fff; border:1px solid #ccc; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);">O</button>
                        <button id="sc-btn-zoom-out" style="width:30px; height:30px; border-radius:50%; background:#fff; border:1px solid #ccc; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);">➖</button>
                    </div>
                    <div id="sc-preview-thumbnail" style="position:absolute; top: 20px; right: 20px; z-index: 999999; width:480px; height:360px; background:white; border:2px solid #dfe6e9; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.2); overflow:hidden; display:flex; flex-direction:column; resize:both;">
                        <div id="sc-preview-header" style="background:#f1f2f6; padding:4px 8px; font-size:12px; font-weight:bold; display:flex; justify-content:space-between; align-items:center; cursor:move;">
                            <span>Aperçu (déplaçable)</span>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <label style="font-size:11px; font-weight:normal; cursor:pointer;"><input type="checkbox" id="sc-checkbox-cat" checked style="vertical-align:middle;"> Chat</label>
                                <button id="sc-btn-preview-stamp" style="font-size:10px; padding:2px 6px; cursor:pointer; background:#00b894; color:white; border:none; border-radius:3px;">📥 Tamponner</button>
                            </div>
                        </div>
                        <div id="sc-preview-toolbar" style="background:#dfe6e9; padding:4px; display:flex; justify-content:center; align-items:center; gap:5px; border-bottom:1px solid #b2bec3;">
                            <button id="sc-btn-play-start" title="Début" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">⏮️</button>
                            <button id="sc-btn-play-prev" title="Précédent" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">⏪</button>
                            <button id="sc-btn-play-pause" title="Lecture/Pause" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">▶️</button>
                            <button id="sc-btn-play-next" title="Suivant" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">⏩</button>
                            <button id="sc-btn-play-end" title="Fin" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">⏭️</button>
                            <div style="width:1px; height:20px; background:#b2bec3; margin:0 5px;"></div>
                            <input type="range" id="sc-speed-slider" min="10" max="300" step="50" value="150" title="Vitesse (crans)" style="width:50px; cursor:pointer;" dir="rtl">
                            <div style="width:1px; height:20px; background:#b2bec3; margin:0 5px;"></div>
                            <button id="sc-btn-prev-zoom-out" title="Dézoomer" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">➖</button>
                            <button id="sc-btn-prev-zoom-reset" title="Réinitialiser" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">O</button>
                            <button id="sc-btn-prev-zoom-in" title="Zoomer" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">➕</button>
                            <div style="width:1px; height:20px; background:#b2bec3; margin:0 5px;"></div>
                            <button id="sc-btn-center-cat" title="Centrer sur le Chat" style="cursor:pointer; border:none; background:white; border-radius:3px; padding:2px 6px;">🐱</button>
                        </div>
                        <div id="sc-preview-canvas-wrap" style="flex:1; position:relative; background:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAACVJREFUKFNjZCASMDKgAhgg/gMxIxnBRbBhQhXBhglVBBtGVQEAhF8Bwa2/9o4AAAAASUVORK5CYII=') repeat; overflow:hidden; cursor:grab;">
                            <div id="sc-preview-canvas-inner" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); pointer-events:none;">
                                <canvas id="sc-preview-canvas" width="480" height="360" style="display:block;"></canvas>
                            </div>
                        </div>
                    </div>
                    <svg id="sc-svg-canvas">
                        <defs>
                            <filter id="sc-shadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.2"/>
                            </filter>
                            <filter id="sc-bevel" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="1" dy="2" stdDeviation="1" flood-opacity="0.3"/>
                                <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                                <feSpecularLighting in="blur" surfaceScale="2" specularConstant="0.8" specularExponent="15" lighting-color="white" result="specOut">
                                    <fePointLight x="-5000" y="-10000" z="10000"/>
                                </feSpecularLighting>
                                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                            </filter>
                            <pattern id="sc-grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                                <circle cx="2" cy="2" r="1" fill="#bdc3c7" />
                            </pattern>
                        </defs>
                        <rect id="sc-grid-bg" width="100%" height="100%" fill="url(#sc-grid-pattern)" />
                        <g id="sc-zoom-layer" transform="scale(1)"></g>
                        <path id="sc-snap-indicator" d="" />
                    </svg>
                    <div id="sc-context-menu">
                        <div class="sc-ctx-item" id="sc-btn-del-block">Supprimer ce bloc</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.widgetEl);

        // --- DRAG FENÊTRE ---
        let isDraggingWindow = false, startX, startY;
        const handle = this.widgetEl.querySelector('#sc-drag-handle');
        // Filet de sécurité : quoi qu'il arrive (bouton relâché hors de la fenêtre,
        // capture de pointeur avortée, événement perdu), un relâchement termine
        // toujours le glissement en cours. Sans ça, la palette pouvait rester
        // bloquée en mode corbeille, plus rien n'étant cliquable.
        const releaseAnyDrag = (ev) => {
            if (!this.widgetEl) return;
            if (this.activeDrag) { try { this.activeDrag.dragEnd(ev); } catch (err) { } this.activeDrag = null; }
            const sb = this.widgetEl.querySelector('#sc-sidebar');
            if (sb) sb.classList.remove('trash-zone');
            const ind = this.widgetEl.querySelector('#sc-snap-indicator');
            if (ind) ind.style.display = 'none';
            this.widgetEl.querySelectorAll('.sc-block-group.dragging').forEach(el => el.classList.remove('dragging'));
            this.widgetEl.querySelectorAll('.sc-palette > div.sc-drag-source').forEach(el => el.classList.remove('sc-drag-source'));
        };
        window.addEventListener('pointerup', releaseAnyDrag);
        window.addEventListener('pointercancel', releaseAnyDrag);
        window.addEventListener('blur', releaseAnyDrag);

        // Pointer Events : la fenêtre se déplace aussi au doigt/stylet
        handle.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('label')) return;
            isDraggingWindow = true; startX = e.clientX - this.widgetEl.offsetLeft; startY = e.clientY - this.widgetEl.offsetTop;
            if (handle.setPointerCapture) { try { handle.setPointerCapture(e.pointerId); } catch (err) { } }
        });
        handle.addEventListener('pointermove', (e) => { if (isDraggingWindow) { this.widgetEl.style.left = (e.clientX - startX) + 'px'; this.widgetEl.style.top = (e.clientY - startY) + 'px'; } });
        handle.addEventListener('pointerup', () => { isDraggingWindow = false; });
        handle.addEventListener('pointercancel', () => { isDraggingWindow = false; });

        // --- EVENTS UI ---
        this.widgetEl.querySelector('#sc-btn-close').onclick = () => {
            this.widgetEl.style.display = 'none';
            if (this.interpreter) this.interpreter.stop();
            const previewEl = document.querySelector('#sc-preview-thumbnail');
            if (previewEl) previewEl.style.display = 'none';
        };
        this.widgetEl.querySelector('#sc-btn-export').onclick = () => this.exportToBoard();

        this.widgetEl.querySelector('#sc-style-sel').onchange = (e) => {
            this.widgetEl.classList.remove('style-grayscale', 'style-bw');
            if (e.target.value !== 'scratch') this.widgetEl.classList.add('style-' + e.target.value);
        };

        this.widgetEl.querySelector('#sc-check-outline').onchange = (e) => {
            e.target.checked ? this.widgetEl.classList.add('opt-outline') : this.widgetEl.classList.remove('opt-outline');
        };

        this.widgetEl.querySelector('#sc-check-grid').onchange = (e) => {
            this.widgetEl.querySelector('#sc-grid-bg').style.display = e.target.checked ? "block" : "none";
        };

        const btnTeacher = this.widgetEl.querySelector('#sc-btn-teacher');
        btnTeacher.onclick = () => {
            self.teacherMode = !self.teacherMode;
            if (self.teacherMode) { this.widgetEl.classList.add('teacher-mode'); btnTeacher.classList.add('active'); }
            else { this.widgetEl.classList.remove('teacher-mode'); btnTeacher.classList.remove('active'); }
        };

        this.widgetEl.querySelector('#sc-btn-clear').onclick = () => {
            self.allBlocks.forEach(b => b.el.remove());
            self.allBlocks = [];
            self.blocksModified = true;
        };

        this.widgetEl.querySelector('#sc-btn-del-block').onclick = () => {
            if (self.ctxTarget) {
                self.ctxTarget.el.remove();
                self.allBlocks = self.allBlocks.filter(b => b !== self.ctxTarget);
                self.ctxTarget = null;
                this.widgetEl.querySelector('#sc-context-menu').style.display = 'none';
                self.blocksModified = true;
            }
        };

        window.addEventListener('click', (e) => {
            if (this.widgetEl && this.widgetEl.style.display !== 'none') {
                this.widgetEl.querySelector('#sc-context-menu').style.display = 'none';
            }
        });

        // --- DEFINITION DE LA CLASSE BLOCK (Moteur Scratch) ---

        function getBlockAbsPos(b) {
            const box = b.pathEl.getBoundingClientRect();
            const pt = self.widgetEl.querySelector('#sc-svg-canvas').createSVGPoint();
            pt.x = box.left; pt.y = box.top;
            return pt.matrixTransform(self.widgetEl.querySelector('#sc-svg-canvas').getScreenCTM().inverse());
        }

        function getTextWidth(text) {
            const c = document.createElement("canvas");
            const ctx = c.getContext("2d");
            ctx.font = "600 13px sans-serif";
            return ctx.measureText(text).width;
        }

        function getSVGPos(e) {
            const pt = self.widgetEl.querySelector('#sc-svg-canvas').createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            return pt.matrixTransform(self.widgetEl.querySelector('#sc-svg-canvas').getScreenCTM().inverse());
        }

        class Block {
            constructor(def, x, y, parentSVG, isPalette = false) {
                this.id = Math.random().toString(36).substr(2, 9);
                this.isPalette = isPalette;
                this.def = def; this.type = def.type; this.cat = def.cat;
                this.parent = null; this.next = null; this.child = null; this.child2 = null;
                this.inputSlots = []; this.x = x; this.y = y;
                this.width = 100; this.height = 40; this.mouth1Height = 32; this.mouth2Height = 32;

                this.el = document.createElementNS("http://www.w3.org/2000/svg", "g");
                this.el.classList.add("sc-block-group");
                this.pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                this.pathEl.classList.add("sc-block-path");
                this.pathEl.style.fill = `var(--col-${this.cat})`;

                if (!isPalette) this.pathEl.style.filter = "var(--block-filter)";

                this.contentGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                this.el.append(this.pathEl, this.contentGroup);

                if (this.type === 'c-block' || this.type === 'e-block') {
                    this.mouthGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    this.el.appendChild(this.mouthGroup);
                    if (this.type === 'e-block') {
                        this.mouthGroup2 = document.createElementNS("http://www.w3.org/2000/svg", "g");
                        this.el.appendChild(this.mouthGroup2);
                    }
                }

                parentSVG.appendChild(this.el);

                this.parts = def.parts.map((p, idx) => {
                    if (typeof p === 'string') return { type: 'label', val: p };
                    const slot = { idx: idx, type: p.t, val: p.v, childBlock: null, inputGroup: null };
                    this.inputSlots.push(slot);
                    return { type: 'input', spec: slot };
                });

                if (!isPalette) {
                    this.initInteractions();
                    self.allBlocks.push(this);
                }
                this.render();
                this.updatePosition(this.x, this.y);
            }

            appendStackTo(firstBlock, container) {
                let current = firstBlock;
                while (current) {
                    container.appendChild(current.el);
                    current.updatePosition(0, 0);
                    current = current.next;
                }
            }

            detachFromParent() {
                if (!this.parent) return;
                const box = this.el.getBoundingClientRect();
                const svgPt = getSVGPos({ clientX: box.left, clientY: box.top });

                const slot = this.parent.inputSlots.find(s => s.childBlock === this);
                if (slot) {
                    slot.childBlock = null;
                    this.appendStackTo(this, self.widgetEl.querySelector('#sc-zoom-layer'));
                    this.updatePosition(svgPt.x, svgPt.y);
                    this.parent.bubbleResize();
                }
                else if (this.parent.next === this) {
                    this.parent.next = null;
                    this.parent.updateLayoutChain();
                    this.appendStackTo(this, self.widgetEl.querySelector('#sc-zoom-layer'));
                    this.updatePosition(svgPt.x, svgPt.y);
                }
                else if (this.parent.child === this) {
                    this.parent.child = null;
                    this.appendStackTo(this, self.widgetEl.querySelector('#sc-zoom-layer'));
                    this.updatePosition(svgPt.x, svgPt.y);
                    this.parent.render();
                }
                else if (this.parent.child2 === this) {
                    this.parent.child2 = null;
                    this.appendStackTo(this, self.widgetEl.querySelector('#sc-zoom-layer'));
                    this.updatePosition(svgPt.x, svgPt.y);
                    this.parent.render();
                }
                this.parent = null;
            }

            initInteractions() {
                // Pointer Events, et non la souris : sur tablette le doigt doit pouvoir
                // saisir, déplacer et emboîter les blocs. En deçà du seuil de 8px, le
                // geste reste un simple appui (le bloc n'est pas détaché de son parent).
                this.el.addEventListener('pointerdown', (e) => {
                    if (self.teacherMode) return;
                    if (e.button !== undefined && e.button !== 0) return;
                    if (e.target.tagName === 'INPUT' || (e.target.closest && e.target.closest('foreignObject'))) return;
                    e.stopPropagation();
                    e.preventDefault();

                    const start = { x: e.clientX, y: e.clientY };
                    let engaged = false;
                    if (this.el.setPointerCapture) { try { this.el.setPointerCapture(e.pointerId); } catch (err) { } }

                    // Écouteurs sur document : beginDrag ré-insère l'élément dans le DOM
                    // (passage au premier plan), ce qui annulerait une capture posée sur lui
                    const onMove = (ev) => {
                        if (!engaged && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
                        if (!engaged) {
                            engaged = true;
                            this.detachFromParent();
                            this.beginDrag(ev);
                        }
                        this.dragMove(ev);
                    };
                    const onUp = (ev) => {
                        document.removeEventListener('pointermove', onMove);
                        document.removeEventListener('pointerup', onUp);
                        document.removeEventListener('pointercancel', onUp);
                        if (engaged) this.dragEnd(ev);
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                    document.addEventListener('pointercancel', onUp);
                });

                this.el.oncontextmenu = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    self.ctxTarget = this;
                    const m = self.widgetEl.querySelector('#sc-context-menu');
                    const rect = self.widgetEl.querySelector('.sc-workspace').getBoundingClientRect();
                    m.style.display = 'block';
                    m.style.left = (e.clientX - rect.left) + 'px';
                    m.style.top = (e.clientY - rect.top) + 'px';
                }
            }

            beginDrag(e, isNew = false) {
                this.el.classList.add('dragging');
                this._dragging = true;
                self.activeDrag = this; // suivi central : permet de terminer un glissement orphelin
                const zoomLayer = self.widgetEl.querySelector('#sc-zoom-layer');

                if (this.el.parentNode !== zoomLayer) {
                    this.appendStackTo(this, zoomLayer);
                } else {
                    let current = this;
                    while (current) {
                        zoomLayer.appendChild(current.el);
                        current = current.next;
                    }
                }

                const pt = getSVGPos(e);
                this._dragOX = pt.x - this.x; this._dragOY = pt.y - this.y;
                this._dragFresh = isNew; // bloc tout juste tiré de la palette
            }

            dragMove(ev) {
                const p = getSVGPos(ev);
                this.updatePosition(p.x - this._dragOX, p.y - this._dragOY);

                const sidebar = self.widgetEl.querySelector('#sc-sidebar');
                const rect = self.widgetEl.getBoundingClientRect();
                const relX = ev.clientX - rect.left;
                const sbW = sidebar.offsetWidth;

                if (relX >= sbW) this._dragFresh = false;

                if (relX < sbW && !this._dragFresh) { // au-dessus de la palette = corbeille
                    sidebar.classList.add('trash-zone');
                    self.widgetEl.querySelector('#sc-snap-indicator').style.display = "none";
                } else {
                    sidebar.classList.remove('trash-zone');
                    self.checkSnap(this);
                }
            }

            dragEnd(ev) {
                if (!this._dragging) return; // idempotent : le filet de sécurité peut doubler l'appel
                this._dragging = false;
                if (self.activeDrag === this) self.activeDrag = null;
                this.el.classList.remove('dragging');
                const sidebar = self.widgetEl.querySelector('#sc-sidebar');
                sidebar.classList.remove('trash-zone');

                const rect = self.widgetEl.getBoundingClientRect();
                const relX = ev.clientX - rect.left;

                if (relX < sidebar.offsetWidth) {
                    let current = this;
                    while (current) {
                        current.el.remove();
                        self.allBlocks = self.allBlocks.filter(b => b !== current);
                        current = current.next;
                    }
                } else {
                    self.applySnap(this);
                }
            }

            render() {
                this.contentGroup.innerHTML = "";
                let cx = 4;
                if (this.type.includes('hat') || this.type.includes('block') || this.type === 'command') cx = 12;
                if (this.type === 'boolean') cx = 16;

                let minH = (this.type.includes('hat') || this.type.includes('block')) ? 48 : 40;
                let maxContentH = 32;

                this.parts.forEach(part => {
                    if (this.type === 'e-block' && part.val === 'sinon') return;
                    if (part.type === 'label') { part.w = (part.val === '↻' || part.val === '↺') ? 16 : getTextWidth(part.val); part.h = 16; }
                    else if (part.type === 'input') {
                        const slot = part.spec;
                        if (slot.childBlock) { part.w = slot.childBlock.width; part.h = slot.childBlock.height; }
                        else {
                            const valW = Math.max(10, getTextWidth(slot.val));
                            part.h = 32;
                            if (slot.type === 'num') part.w = valW + 24; else part.w = valW + 34;
                        }
                        maxContentH = Math.max(maxContentH, part.h);
                    }
                });

                this.topRowHeight = Math.max(minH, maxContentH + 8);
                this.height = this.topRowHeight;
                const midY = this.topRowHeight / 2;

                this.parts.forEach(part => {
                    if (this.type === 'e-block' && part.val === 'sinon') return;

                    if (part.type === 'label') {
                        if ((this.type === 'reporter' || this.type === 'boolean') && cx <= 8) cx += 4;
                        if (part.val === '↻' || part.val === '↺') {
                            // Icône vectorielle plutôt qu'un glyphe Unicode : évite les soucis de
                            // police manquante lors du rendu SVG->image à l'export sur le tableau.
                            const isCW = part.val === '↻';
                            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                            g.setAttribute("transform", `translate(${cx}, ${midY - 8}) scale(0.6)`);
                            g.setAttribute("fill", "none");
                            g.style.stroke = "var(--text-color)";
                            g.setAttribute("stroke-width", "2.5");
                            g.setAttribute("stroke-linecap", "round");
                            g.setAttribute("stroke-linejoin", "round");
                            const poly = document.createElementNS("http://www.w3.org/2000/svg", "path");
                            poly.setAttribute("d", isCW ? "M23 4 L23 10 L17 10" : "M1 4 L1 10 L7 10");
                            const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
                            arc.setAttribute("d", isCW ? "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" : "M3.51 15a9 9 0 1 0 2.13-9.36L1 10");
                            g.appendChild(poly); g.appendChild(arc);
                            this.contentGroup.appendChild(g);
                        } else {
                            const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
                            t.classList.add("sc-block-text"); t.textContent = part.val;
                            t.setAttribute("x", cx); t.setAttribute("y", midY);
                            this.contentGroup.appendChild(t);
                        }
                        cx += part.w + 8;
                    }
                    else if (part.type === 'input') {
                        const slot = part.spec;
                        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                        slot.inputGroup = g;
                        let yOffset = (this.topRowHeight - part.h) / 2;

                        if (!slot.childBlock) {
                            const bg = document.createElementNS("http://www.w3.org/2000/svg", "path");
                            bg.classList.add("sc-slot-bg", slot.type);
                            if (slot.type === 'num') bg.setAttribute("d", this.pathRoundedRect(part.w, part.h));
                            else bg.setAttribute("d", this.pathHexagon(part.w, part.h));
                            g.appendChild(bg);

                            if (slot.type === 'num') {
                                const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
                                fo.setAttribute("width", part.w); fo.setAttribute("height", part.h);
                                const inp = document.createElement("input");
                                inp.value = slot.val; inp.className = "sc-input-field";

                                // En palette, le champ ne doit pas capter le doigt :
                                // c'est le chip entier qui se glisse vers l'espace de travail
                                if (this.isPalette) { inp.readOnly = true; inp.tabIndex = -1; inp.style.pointerEvents = 'none'; }

                                inp.onmousedown = e => {
                                    if (self.teacherMode) { e.preventDefault(); e.stopPropagation(); }
                                    else { e.stopPropagation(); }
                                };
                                inp.onpointerdown = e => {
                                    if (self.teacherMode) { e.preventDefault(); e.stopPropagation(); }
                                    else { e.stopPropagation(); }
                                };
                                inp.onclick = (e) => {
                                    if (self.teacherMode) {
                                        e.target.value = "";
                                        e.target.dispatchEvent(new Event('input'));
                                        e.target.blur();
                                    }
                                };
                                inp.oninput = e => { slot.val = e.target.value; self.blocksModified = true; };
                                inp.onblur = () => { this.bubbleResize(); };
                                inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
                                fo.appendChild(inp); g.appendChild(fo);
                            }
                        } else {
                            g.appendChild(slot.childBlock.el);
                            slot.childBlock.updatePosition(0, 0);
                        }

                        g.setAttribute("transform", `translate(${cx}, ${yOffset})`);
                        this.contentGroup.appendChild(g);
                        slot.relX = cx; slot.relY = yOffset;
                        cx += part.w + 8;
                    }
                });

                let startMargin = 4;
                if (this.type.includes('hat') || this.type.includes('block') || this.type === 'command') startMargin = 12;
                if (this.type === 'boolean') startMargin = 16;

                this.width = cx - 8 + startMargin;
                if (this.width < 80 && !this.type.match(/reporter|boolean/)) this.width = 80;

                if (this.type === 'c-block' || this.type === 'e-block') {
                    this.mouth1Height = this.child ? this.child.getStackHeight() : 32;
                    this.mouth2Height = this.child2 ? this.child2.getStackHeight() : 32;

                    this.mouthGroup.setAttribute("transform", `translate(12, ${this.topRowHeight})`);
                    if (this.child) { this.appendStackTo(this.child, this.mouthGroup); this.child.updatePosition(0, 0); }

                    if (this.type === 'e-block') {
                        const txtElse = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        txtElse.classList.add("sc-block-text"); txtElse.textContent = "sinon";
                        const midBarY = this.topRowHeight + this.mouth1Height + 20;
                        txtElse.setAttribute("x", 16); txtElse.setAttribute("y", midBarY);
                        this.contentGroup.appendChild(txtElse);

                        const m2Y = this.topRowHeight + this.mouth1Height + 40;
                        this.mouthGroup2.setAttribute("transform", `translate(12, ${m2Y})`);
                        if (this.child2) { this.appendStackTo(this.child2, this.mouthGroup2); this.child2.updatePosition(0, 0); }
                    }
                }
                this.drawPath();
            }

            pathRoundedRect(w, h) {
                const r = h / 2; return `M ${r},0 H ${w - r} A ${r},${r} 0 0 1 ${w},${r} A ${r},${r} 0 0 1 ${w - r},${h} H ${r} A ${r},${r} 0 0 1 0,${r} A ${r},${r} 0 0 1 ${r},0 Z`;
            }
            pathHexagon(w, h) {
                const s = h / 2; return `M 0,${h / 2} l ${s},-${h / 2} h ${w - 2 * s} l ${s},${h / 2} l -${s},${h / 2} h -${w - 2 * s} z`;
            }

            drawPath() {
                const w = this.width; const topH = this.topRowHeight;
                let d = ""; const r = 4;

                if (this.type === 'reporter') d = this.pathRoundedRect(w, topH);
                else if (this.type === 'boolean') d = this.pathHexagon(w, topH);
                else if (this.type === 'c-block') {
                    d = `M 0,${r} A ${r},${r} 0 0,1 ${r},0 H 12 ${self.NOTCH_MALE} H ${w - r} A ${r},${r} 0 0,1 ${w},${r} V ${topH - r} A ${r},${r} 0 0,1 ${w - r},${topH}`;
                    d += ` H 60 ${self.NOTCH_FEMALE} H ${12 + r} A ${r},${r} 0 0,0 12,${topH + r}`;
                    const mouthY = topH + this.mouth1Height;
                    d += ` V ${mouthY - r} A ${r},${r} 0 0,0 ${12 + r},${mouthY}`;
                    d += ` H 24 ${self.NOTCH_MALE} H ${w - r} A ${r},${r} 0 0,1 ${w},${mouthY + r}`;
                    const botH = 32; this.totalHeight = mouthY + botH;
                    d += ` V ${this.totalHeight - r} A ${r},${r} 0 0,1 ${w - r},${this.totalHeight} H 48 ${self.NOTCH_FEMALE} H ${r} A ${r},${r} 0 0,1 0,${this.totalHeight - r} Z`;
                }
                else if (this.type === 'e-block') {
                    d = `M 0,${r} A ${r},${r} 0 0,1 ${r},0 H 12 ${self.NOTCH_MALE} H ${w - r} A ${r},${r} 0 0,1 ${w},${r} V ${topH - r} A ${r},${r} 0 0,1 ${w - r},${topH}`;
                    d += ` H 60 ${self.NOTCH_FEMALE} H ${12 + r} A ${r},${r} 0 0,0 12,${topH + r}`;
                    const mouth1Y = topH + this.mouth1Height;
                    d += ` V ${mouth1Y - r} A ${r},${r} 0 0,0 ${12 + r},${mouth1Y}`;
                    const midH = 40; const row2 = mouth1Y + midH;
                    d += ` H 24 ${self.NOTCH_MALE} H ${w - r} A ${r},${r} 0 0,1 ${w},${mouth1Y + r} V ${row2 - r} A ${r},${r} 0 0,1 ${w - r},${row2}`;
                    d += ` H 60 ${self.NOTCH_FEMALE} H ${12 + r} A ${r},${r} 0 0,0 12,${row2 + r}`;
                    const mouth2Y = row2 + this.mouth2Height;
                    d += ` V ${mouth2Y - r} A ${r},${r} 0 0,0 ${12 + r},${mouth2Y}`;
                    d += ` H 24 ${self.NOTCH_MALE} H ${w - r} A ${r},${r} 0 0,1 ${w},${mouth2Y + r}`;
                    const botH = 32; this.totalHeight = mouth2Y + botH;
                    d += ` V ${this.totalHeight - r} A ${r},${r} 0 0,1 ${w - r},${this.totalHeight} H 48 ${self.NOTCH_FEMALE} H ${r} A ${r},${r} 0 0,1 0,${this.totalHeight - r} Z`;
                }
                else if (this.type === 'hat') {
                    d = `M 0,16 Q 0,0 25,0 H ${w - r} A ${r},${r} 0 0,1 ${w},${r} V ${topH - r} A ${r},${r} 0 0,1 ${w - r},${topH} H 48 ${self.NOTCH_FEMALE} H ${r} A ${r},${r} 0 0,1 0,${topH - r} Z`;
                    this.totalHeight = topH;
                }
                else {
                    d = `M 0,${r} A ${r},${r} 0 0,1 ${r},0 H 12 ${self.NOTCH_MALE} H ${w - r} A ${r},${r} 0 0,1 ${w},${r} V ${topH - r} A ${r},${r} 0 0,1 ${w - r},${topH} H 48 ${self.NOTCH_FEMALE} H ${r} A ${r},${r} 0 0,1 0,${topH - r} Z`;
                    this.totalHeight = topH;
                }
                this.pathEl.setAttribute("d", d);
            }

            updatePosition(x, y) {
                this.x = x; this.y = y;
                this.el.setAttribute("transform", `translate(${x},${y})`);
                if (this.next) this.next.updatePosition(x, y + this.totalHeight);
            }

            getStackHeight() {
                let h = this.totalHeight;
                if (this.next) h += this.next.getStackHeight();
                return h;
            }

            bubbleResize() {
                this.render();
                if (this.parent) {
                    if (this.parent.inputSlots.some(s => s.childBlock === this)) this.parent.bubbleResize();
                    else this.parent.updateLayoutChain();
                }
            }

            updateLayoutChain() {
                self.blocksModified = true;
                this.render();
                if (this.next) this.next.updatePosition(this.x, this.y + this.totalHeight);
                if (this.parent && !this.parent.inputSlots.some(s => s.childBlock === this)) this.parent.updateLayoutChain();
            }
        }

        this.BlockClass = Block;

        // Init Palette
        const filters = this.widgetEl.querySelector('#sc-cat-filters');
        const pad = this.widgetEl.querySelector('#sc-palette-scroll');

        const renderPalette = (filter) => {
            pad.innerHTML = "";
            const list = filter === 'all' ? this.BLOCK_LIBRARY : this.BLOCK_LIBRARY.filter(b => b.cat === filter);
            list.forEach(def => {
                const w = document.createElement("div"); w.style.marginBottom = "5px"; w.style.cursor = "grab";
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.style.overflow = "visible";
                const b = new this.BlockClass(def, 0, 0, svg, true);

                const visualHeight = b.totalHeight || b.height;
                svg.style.height = (visualHeight + 4) + "px";
                svg.style.width = (b.width + 4) + "px";

                b.updatePosition(2, 2);
                w.appendChild(svg);
                // Pointer Events + seuil (mécanique AtoutMath) : un appui bref AJOUTE le
                // bloc dans l'espace de travail, un glissé horizontal l'EXTRAIT sous le
                // doigt, un glissé vertical fait DÉFILER la palette (pas de défilement
                // natif au doigt : le body est en touch-action:none).
                w.addEventListener('pointerdown', (e) => {
                    if (self.teacherMode) return;
                    if (e.button !== undefined && e.button !== 0) return;
                    e.preventDefault();

                    const start = { x: e.clientX, y: e.clientY };
                    let nb = null, scrolling = false, lastY = e.clientY;

                    // Écouteurs sur document (et non sur la vignette) : si la capture du
                    // pointeur échoue ou se perd, le relâchement est tout de même reçu.
                    const onMove = (ev) => {
                        if (!nb && !scrolling) {
                            const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
                            if (Math.hypot(dx, dy) < 8) return;
                            if (ev.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx) * 1.5) {
                                scrolling = true; lastY = ev.clientY; return;
                            }
                            const pt = getSVGPos(ev);
                            nb = new self.BlockClass(def, pt.x - b.width / 2, pt.y - b.topRowHeight / 2, self.widgetEl.querySelector('#sc-zoom-layer'));
                            w.classList.add('sc-drag-source'); // la vignette d'origine s'estompe
                            nb.beginDrag(ev, true);
                        }
                        if (scrolling) { pad.scrollTop += lastY - ev.clientY; lastY = ev.clientY; return; }
                        nb.dragMove(ev);
                    };
                    const onUp = (ev) => {
                        document.removeEventListener('pointermove', onMove);
                        document.removeEventListener('pointerup', onUp);
                        document.removeEventListener('pointercancel', onUp);
                        w.classList.remove('sc-drag-source');
                        if (nb) { nb.dragEnd(ev); return; }
                        if (scrolling || ev.type === 'pointercancel') return;
                        // Simple appui : le bloc se pose tout seul dans l'espace de travail
                        const ws = self.widgetEl.querySelector('.sc-workspace').getBoundingClientRect();
                        self._tapDropCount = ((self._tapDropCount || 0) % 8) + 1;
                        const pt = getSVGPos({ clientX: ws.left + 40 + self._tapDropCount * 16, clientY: ws.top + 30 + self._tapDropCount * 20 });
                        new self.BlockClass(def, pt.x, pt.y, self.widgetEl.querySelector('#sc-zoom-layer'));
                        self.blocksModified = true;
                    };
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                    document.addEventListener('pointercancel', onUp);
                });
                pad.appendChild(w);
            });
        };

        Object.keys(this.CATEGORIES).forEach(k => {
            const d = document.createElement('div');
            d.className = 'sc-cat-dot';
            d.style.background = `var(--col-${k})`;
            d.title = this.CATEGORIES[k].label;
            d.onclick = () => renderPalette(k);
            filters.appendChild(d);
        });
        renderPalette('all');

        // Zoom logic
        let currentZoom = 1;
        const zoomLayer = this.widgetEl.querySelector('#sc-zoom-layer');
        this.widgetEl.querySelector('#sc-btn-zoom-in').onclick = () => { currentZoom += 0.2; zoomLayer.style.transform = `scale(${currentZoom})`; };
        this.widgetEl.querySelector('#sc-btn-zoom-out').onclick = () => { currentZoom = Math.max(0.2, currentZoom - 0.2); zoomLayer.style.transform = `scale(${currentZoom})`; };
        this.widgetEl.querySelector('#sc-btn-zoom-reset').onclick = () => { currentZoom = 1; zoomLayer.style.transform = `scale(1)`; };

        // Preview logic
        this.widgetEl.querySelector('#sc-btn-preview-stamp').onclick = () => this.stampPreview();

        self.blocksModified = true;
        const tryRefreshPreview = async () => {
            if (self.blocksModified || !this.interpreter) {
                await this.refreshPreview();
                self.blocksModified = false;
                return true;
            }
            return false;
        };

        this.widgetEl.querySelector('#sc-btn-play-start').onclick = async () => {
            await tryRefreshPreview();
            this.interpreter.pausePlayback();
            this.interpreter.playbackIndex = 0;
            this.interpreter.applyState(0);
        };
        this.widgetEl.querySelector('#sc-btn-play-prev').onclick = async () => {
            await tryRefreshPreview();
            this.interpreter.stepPlayback(-1);
        };
        this.widgetEl.querySelector('#sc-btn-play-pause').onclick = async () => {
            const refreshed = await tryRefreshPreview();
            if (!refreshed) {
                if (this.interpreter.isPlaying) this.interpreter.pausePlayback();
                else this.interpreter.startPlayback();
            }
        };
        this.widgetEl.querySelector('#sc-btn-play-next').onclick = async () => {
            await tryRefreshPreview();
            this.interpreter.stepPlayback(1);
        };
        this.widgetEl.querySelector('#sc-btn-play-end').onclick = async () => {
            await tryRefreshPreview();
            this.interpreter.pausePlayback();
            this.interpreter.playbackIndex = this.interpreter.history.length - 1;
            this.interpreter.applyState(this.interpreter.playbackIndex);
        };


        // --- Pan & Zoom for Canvas Preview ---
        const wrap = this.widgetEl.querySelector('#sc-preview-canvas-wrap');
        const inner = this.widgetEl.querySelector('#sc-preview-canvas-inner');
        const scCanvas = this.widgetEl.querySelector('#sc-preview-canvas');
        if (!this.interpreter && scCanvas) {
            this.interpreter = new ScratchInterpreter(scCanvas, this);
        }
        if (wrap && inner && scCanvas) {
            let isDraggingCanvas = false;
            let lastX, lastY;

            self.previewPanX = 0;
            self.previewPanY = 0;
            self.previewZoom = 1.5; // Bigger from the start

            const updatePreviewTransform = () => {
                inner.style.transform = `translate(calc(-50% + ${self.previewPanX}px), calc(-50% + ${self.previewPanY}px))`;
                const dpr = window.devicePixelRatio || 1;
                scCanvas.width = 480 * self.previewZoom * dpr;
                scCanvas.height = 360 * self.previewZoom * dpr;
                scCanvas.style.width = (480 * self.previewZoom) + 'px';
                scCanvas.style.height = (360 * self.previewZoom) + 'px';

                if (self.interpreter) {
                    self.interpreter.zoom = self.previewZoom * dpr;
                    self.interpreter.render();
                }
            };
            self.updatePreviewTransform = updatePreviewTransform;

            this.widgetEl.querySelector('#sc-btn-prev-zoom-in').onclick = () => { self.previewZoom = Math.min(5, self.previewZoom + 0.2); updatePreviewTransform(); };
            this.widgetEl.querySelector('#sc-btn-prev-zoom-out').onclick = () => { self.previewZoom = Math.max(0.2, self.previewZoom - 0.2); updatePreviewTransform(); };
            this.widgetEl.querySelector('#sc-btn-prev-zoom-reset').onclick = () => { self.previewZoom = 1; self.previewPanX = 0; self.previewPanY = 0; updatePreviewTransform(); };
            this.widgetEl.querySelector('#sc-btn-center-cat').onclick = () => {
                if (self.interpreter && self.interpreter.sprite) {
                    self.previewPanX = -self.interpreter.sprite.x * self.previewZoom;
                    self.previewPanY = self.interpreter.sprite.y * self.previewZoom;
                    updatePreviewTransform();
                }
            };

            // Pointer Events : le pan de l'aperçu marche aussi au doigt
            wrap.addEventListener('pointerdown', (e) => {
                if (self.previewDocked) return; // ancré : le clic sert à détacher
                if (e.button !== undefined && e.button !== 0) return;
                isDraggingCanvas = true;
                wrap.style.cursor = 'grabbing';
                lastX = e.clientX;
                lastY = e.clientY;
                if (wrap.setPointerCapture) { try { wrap.setPointerCapture(e.pointerId); } catch (err) { } }
            });
            wrap.addEventListener('pointermove', (e) => {
                if (isDraggingCanvas) {
                    self.previewPanX += e.clientX - lastX;
                    self.previewPanY += e.clientY - lastY;
                    lastX = e.clientX;
                    lastY = e.clientY;
                    updatePreviewTransform();
                }
            });
            const endPreviewPan = () => {
                isDraggingCanvas = false;
                if (wrap) wrap.style.cursor = 'grab';
            };
            wrap.addEventListener('pointerup', endPreviewPan);
            wrap.addEventListener('pointercancel', endPreviewPan);
            wrap.addEventListener('wheel', (e) => {
                e.preventDefault();
                if (e.ctrlKey) {
                    const zoomDelta = e.deltaY * -0.01;
                    self.previewZoom = Math.max(0.2, Math.min(5, self.previewZoom + zoomDelta));
                } else {
                    self.previewPanX -= e.deltaX;
                    self.previewPanY -= e.deltaY;
                }
                updatePreviewTransform();
            }, { passive: false });

            updatePreviewTransform(); // Call immediately
        }

        // --- Aperçu : ANCRÉ dans la barre latérale par défaut, DÉTACHABLE au clic ---
        // Un clic sur l'image le détache en fenêtre flottante déplaçable ;
        // l'épingle 📌 le ré-ancre dans la fenêtre du plugin.
        const previewEl = this.widgetEl.querySelector('#sc-preview-thumbnail');
        const dockEl = this.widgetEl.querySelector('#sc-preview-dock');
        const headerEl = previewEl.querySelector('#sc-preview-header');
        const titleEl = headerEl.querySelector('span');
        const wrapEl = previewEl.querySelector('#sc-preview-canvas-wrap');

        const pinBtn = document.createElement('button');
        pinBtn.id = 'sc-btn-preview-dock';
        pinBtn.title = "Ré-ancrer l'aperçu dans la fenêtre";
        pinBtn.textContent = '📌';
        pinBtn.style.cssText = "font-size:10px; padding:2px 6px; cursor:pointer; background:#0984e3; color:white; border:none; border-radius:3px;";
        headerEl.querySelector('div').insertBefore(pinBtn, headerEl.querySelector('#sc-btn-preview-stamp'));

        const dockPreview = () => {
            self.previewDocked = true;
            dockEl.appendChild(previewEl);
            previewEl.style.cssText = "position:relative; width:100%; height:240px; background:white; overflow:hidden; display:flex; flex-direction:column; border:none; border-radius:0; box-shadow:none; resize:none; max-width:none; max-height:none;";
            titleEl.textContent = 'Aperçu — cliquer pour détacher';
            wrapEl.style.cursor = 'pointer';
            headerEl.style.cursor = 'default';
            pinBtn.style.display = 'none';
            // Zoom ajusté à la largeur du panneau ancré (le zoom flottant est mémorisé)
            if (self.previewZoom) self._floatZoom = self.previewZoom;
            requestAnimationFrame(() => {
                const w = wrapEl.clientWidth || 260;
                self.previewZoom = Math.max(0.3, Math.min(1.5, (w - 8) / 480));
                if (self.updatePreviewTransform) self.updatePreviewTransform();
            });
        };

        const undockPreview = () => {
            self.previewDocked = false;
            const ws = self.widgetEl.querySelector('.sc-workspace').getBoundingClientRect();
            document.body.appendChild(previewEl);
            previewEl.style.cssText = "position:fixed; z-index:999999; width:480px; height:360px; background:white; border:2px solid #dfe6e9; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.2); overflow:hidden; display:flex; flex-direction:column; resize:both;";
            previewEl.style.top = Math.max(8, ws.top + 12) + 'px';
            previewEl.style.right = Math.max(8, window.innerWidth - ws.right + 12) + 'px';
            titleEl.textContent = 'Aperçu (déplaçable)';
            wrapEl.style.cursor = 'grab';
            headerEl.style.cursor = 'move';
            pinBtn.style.display = '';
            self.previewZoom = self._floatZoom || 1.5;
            if (self.updatePreviewTransform) self.updatePreviewTransform();
        };

        pinBtn.onclick = (e) => { e.stopPropagation(); dockPreview(); };

        // Clic sur l'aperçu ancré (hors boutons) = détachement
        previewEl.addEventListener('click', (e) => {
            if (!self.previewDocked) return;
            if (e.target.closest('button, input, select, label')) return;
            undockPreview();
        });

        // Déplacement par l'en-tête : seulement en mode flottant
        let isDraggingPreview = false, pStartX, pStartY, initX, initY;
        headerEl.onpointerdown = (e) => {
            if (self.previewDocked) return;
            if (e.target.closest('button, input, select, label')) return;
            isDraggingPreview = true;
            pStartX = e.clientX; pStartY = e.clientY;
            const rect = previewEl.getBoundingClientRect();
            initX = rect.left;
            initY = rect.top;
            previewEl.style.right = 'auto';
            previewEl.style.left = initX + 'px';
            previewEl.style.top = initY + 'px';
            if (headerEl.setPointerCapture) { try { headerEl.setPointerCapture(e.pointerId); } catch (err) { } }
            e.stopPropagation();
        };
        headerEl.addEventListener('pointermove', (e) => {
            if (isDraggingPreview) {
                previewEl.style.left = (initX + e.clientX - pStartX) + 'px';
                previewEl.style.top = (initY + e.clientY - pStartY) + 'px';
            }
        });
        headerEl.addEventListener('pointerup', () => { isDraggingPreview = false; });
        headerEl.addEventListener('pointercancel', () => { isDraggingPreview = false; });

        dockPreview(); // état par défaut : intégré à la fenêtre

        // Templates dropdown logic
        this.widgetEl.querySelector('#sc-template-sel').onchange = (e) => {
            const val = e.target.value;
            if (!val) return;
            // Clear workspace
            self.allBlocks.forEach(b => b.el.remove());
            self.allBlocks = [];

            let blocksToCreate = [];
            const HAT = { cat: 'events', type: 'hat', parts: ['quand le drapeau vert est cliqué'] };
            const CLEAR = { cat: 'pen', type: 'command', parts: ['effacer tout'] };
            const PEN_DOWN = { cat: 'pen', type: 'command', parts: ["stylo en position d'écriture"] };
            const PEN_UP = { cat: 'pen', type: 'command', parts: ["relever le stylo"] };
            const GOTO_0 = { cat: 'motion', type: 'command', parts: ['aller à x:', { t: 'num', v: '0' }, 'y:', { t: 'num', v: '0' }] };
            const FACE_90 = { cat: 'motion', type: 'command', parts: ["s'orienter à", { t: 'num', v: '90' }] };

            if (val === 'square') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, FACE_90, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '4' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '100' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '90' }, 'degrés'] }
                ];
            } else if (val === 'triangle') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, FACE_90, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '3' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '100' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↺', 'de', { t: 'num', v: '120' }, 'degrés'] }
                ];
            } else if (val === 'hexagon') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, FACE_90, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '6' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '60' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '60' }, 'degrés'] }
                ];
            } else if (val === 'star') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, FACE_90, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '5' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '150' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '144' }, 'degrés'] }
                ];
            } else if (val === 'circle') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, FACE_90, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '36' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '10' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '10' }, 'degrés'] }
                ];
            } else if (val === 'stairs') {
                blocksToCreate = [HAT, CLEAR, { cat: 'motion', type: 'command', parts: ['aller à x:', { t: 'num', v: '-100' }, 'y:', { t: 'num', v: '100' }] }, FACE_90, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '5' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '30' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '90' }, 'degrés'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '30' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↺', 'de', { t: 'num', v: '90' }, 'degrés'] }
                ];
            } else if (val === 'dashed') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, FACE_90, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '6' }, 'fois'] },
                    PEN_DOWN,
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '20' }, 'pas'] },
                    PEN_UP,
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '20' }, 'pas'] }
                ];
            } else if (val === 'flower') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '18' }, 'fois'] },
                    { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '4' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '60' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '90' }, 'degrés'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '20' }, 'degrés'] }
                ];
            } else if (val === 'polygons') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '6' }, 'fois'] },
                    { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '4' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '80' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '90' }, 'degrés'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '60' }, 'degrés'] }
                ];
            } else if (val === 'random') {
                blocksToCreate = [HAT, CLEAR, GOTO_0, PEN_DOWN, { cat: 'control', type: 'c-block', parts: ['répéter', { t: 'num', v: '30' }, 'fois'] },
                    { cat: 'motion', type: 'command', parts: ['avancer de', { t: 'num', v: '20' }, 'pas'] },
                    { cat: 'motion', type: 'command', parts: ['tourner', '↻', 'de', { t: 'num', v: '90' }, 'degrés'] }
                ];
            } else if (val === 'dialog') {
                blocksToCreate = [HAT,
                    { cat: 'looks', type: 'command', parts: ['dire', { t: 'num', v: 'Bonjour !' }, 'pendant', { t: 'num', v: '2' }, 'secondes'] },
                    { cat: 'sensing', type: 'command', parts: ['demander', { t: 'num', v: "Comment tu t'appelles ?" }, 'et attendre'] },
                    { cat: 'looks', type: 'command', parts: ['dire', { t: 'num', v: 'Enchanté' }, 'pendant', { t: 'num', v: '2' }, 'secondes'] }
                ];
            }

            if (blocksToCreate.length > 0) {
                let currentY = 50;
                const cb = [];
                for (let i = 0; i < blocksToCreate.length; i++) {
                    const newB = new self.BlockClass(blocksToCreate[i], 50, currentY, zoomLayer);
                    self.allBlocks.push(newB);
                    cb.push(newB);
                    currentY += 40;
                }

                const linkSeq = (indices) => {
                    for (let i = 0; i < indices.length - 1; i++) {
                        cb[indices[i + 1]].parent = cb[indices[i]];
                        cb[indices[i]].next = cb[indices[i + 1]];
                    }
                };

                if (val === 'square' || val === 'triangle' || val === 'hexagon' || val === 'star' || val === 'circle') {
                    linkSeq([0, 1, 2, 3, 4, 5]);
                    cb[5].child = cb[6]; cb[6].parent = cb[5];
                    linkSeq([6, 7]);
                } else if (val === 'stairs') {
                    linkSeq([0, 1, 2, 3, 4, 5]);
                    cb[5].child = cb[6]; cb[6].parent = cb[5];
                    linkSeq([6, 7, 8, 9]);
                } else if (val === 'dashed') {
                    linkSeq([0, 1, 2, 3, 4]);
                    cb[4].child = cb[5]; cb[5].parent = cb[4];
                    linkSeq([5, 6, 7, 8]);
                } else if (val === 'flower' || val === 'polygons') {
                    linkSeq([0, 1, 2, 3, 4]);
                    cb[4].child = cb[5]; cb[5].parent = cb[4];
                    cb[5].child = cb[6]; cb[6].parent = cb[5];
                    linkSeq([6, 7]);
                    cb[5].next = cb[8]; cb[8].parent = cb[5];
                } else if (val === 'random') {
                    linkSeq([0, 1, 2, 3, 4]);
                    cb[4].child = cb[5]; cb[5].parent = cb[4];
                    linkSeq([5, 6]);
                    // Create reporter block for 'random'
                    const rep = new self.BlockClass({ cat: 'operators', type: 'reporter', parts: ['nombre aléatoire entre', { t: 'num', v: '-90' }, 'et', { t: 'num', v: '90' }] }, 0, 0, zoomLayer);
                    self.allBlocks.push(rep);
                    cb[6].inputSlots[0].childBlock = rep;
                    rep.parent = cb[6];
                } else if (val === 'dialog') {
                    linkSeq([0, 1, 2, 3]);
                }

                for (let i = cb.length - 1; i >= 0; i--) { cb[i].render(); }
                cb[0].updateLayoutChain();
                if (val === 'dialog') cb[3].bubbleResize();
                else if (val === 'random') cb[6].bubbleResize();
            }
            e.target.value = ""; // reset
        };
    },

    // --- MAGNETISME ---
    checkSnap: function (dragged) {
        this.snapCandidate = null;
        const ind = this.widgetEl.querySelector('#sc-snap-indicator');
        ind.style.display = "none";
        let minDist = 40;

        for (let t of this.allBlocks) {
            if (t === dragged) continue;
            let rootOfT = t;
            while (rootOfT.parent) rootOfT = rootOfT.parent;
            if (rootOfT === dragged) continue;
            if (dragged.el.contains(t.el)) continue;

            const box = t.pathEl.getBoundingClientRect();
            const pt = this.widgetEl.querySelector('#sc-svg-canvas').createSVGPoint();
            pt.x = box.left; pt.y = box.top;
            const bPos = pt.matrixTransform(this.widgetEl.querySelector('#sc-zoom-layer').getScreenCTM().inverse());

            if (dragged.type === 'reporter' || dragged.type === 'boolean') {
                t.parts.forEach(p => {
                    if (p.type === 'input') {
                        const slot = p.spec;
                        if (slot.childBlock) return;

                        let ok = false;
                        if (slot.type === 'num') ok = true;
                        if (slot.type === 'bool' && dragged.type === 'boolean') ok = true;

                        if (ok) {
                            const ibox = slot.inputGroup.getBoundingClientRect();
                            const ipt = this.widgetEl.querySelector('#sc-svg-canvas').createSVGPoint();
                            ipt.x = ibox.left + ibox.width / 2; ipt.y = ibox.top + ibox.height / 2;
                            const svgPt = ipt.matrixTransform(this.widgetEl.querySelector('#sc-zoom-layer').getScreenCTM().inverse());
                            const dist = Math.hypot((dragged.x + dragged.width / 2) - svgPt.x, (dragged.y + dragged.height / 2) - svgPt.y);

                            if (dist < minDist) {
                                minDist = dist;
                                const absX = svgPt.x - p.w / 2; const absY = svgPt.y - p.h / 2;
                                this.snapCandidate = { type: 'input', target: t, slot: slot, absX: absX, absY: absY, w: p.w, h: p.h };
                                this.widgetEl.querySelector('#sc-zoom-layer').appendChild(ind);
                                ind.style.display = "block";
                                if (slot.type === 'num') ind.setAttribute("d", `M ${absX + p.h / 2},${absY} h ${p.w - p.h} a ${p.h / 2},${p.h / 2} 0 0 1 0,${p.h} h -${p.w - p.h} a ${p.h / 2},${p.h / 2} 0 0 1 0,-${p.h} z`);
                                else ind.setAttribute("d", `M ${absX},${absY + p.h / 2} l ${p.h / 2},-${p.h / 2} h ${p.w - p.h} l ${p.h / 2},${p.h / 2} l -${p.h / 2},${p.h / 2} h -${p.w - p.h} z`);
                            }
                        }
                    }
                });
            }

            if (!dragged.type.match(/reporter|boolean/)) {
                const distBot = Math.hypot(dragged.x - bPos.x, dragged.y - (bPos.y + t.totalHeight));
                if (distBot < minDist && !t.type.match(/reporter|boolean/)) {
                    minDist = distBot;
                    this.snapCandidate = { type: 'next', target: t };
                    this.widgetEl.querySelector('#sc-zoom-layer').appendChild(ind);
                    ind.style.display = "block";
                    ind.setAttribute("d", `M ${bPos.x} ${bPos.y + t.totalHeight} h ${t.width} v 8 h -${t.width} z`);
                }

                const draggedBottom = dragged.y + dragged.totalHeight;
                const distTop = Math.hypot(dragged.x - bPos.x, draggedBottom - bPos.y);
                if (distTop < minDist && !t.type.match(/reporter|boolean/) && t.type !== 'hat') {
                    minDist = distTop;
                    this.snapCandidate = { type: 'prev', target: t };
                    this.widgetEl.querySelector('#sc-zoom-layer').appendChild(ind);
                    ind.style.display = "block";
                    ind.setAttribute("d", `M ${bPos.x} ${bPos.y - 8} h ${t.width} v 8 h -${t.width} z`);
                }

                if (t.type.match(/c-block|e-block/)) {
                    const mouthY = bPos.y + t.topRowHeight;
                    const mouthX = bPos.x + 12;

                    if (!t.child) {
                        const isInZone = (dragged.x > bPos.x && dragged.x < bPos.x + t.width) && (dragged.y > mouthY - 10 && dragged.y < mouthY + 50);
                        if (isInZone) {
                            minDist = 0;
                            this.snapCandidate = { type: 'child', target: t };
                            this.widgetEl.querySelector('#sc-zoom-layer').appendChild(ind);
                            ind.style.display = "block";
                            ind.setAttribute("d", `M ${mouthX} ${mouthY} h ${t.width - 12} v 8 h -${t.width - 12} z`);
                        }
                    } else {
                        const distInTop = Math.hypot(dragged.x - mouthX, dragged.y - mouthY);
                        if (distInTop < minDist) {
                            minDist = distInTop;
                            this.snapCandidate = { type: 'insert-child-start', target: t };
                            this.widgetEl.querySelector('#sc-zoom-layer').appendChild(ind);
                            ind.style.display = "block";
                            ind.setAttribute("d", `M ${mouthX} ${mouthY} h ${t.width - 12} v 8 h -${t.width - 12} z`);
                        }
                    }
                }

                if (t.type === 'e-block') {
                    const yElse = bPos.y + t.topRowHeight + t.mouth1Height + 40;
                    const mouthX = bPos.x + 12;

                    if (!t.child2) {
                        const isInZone2 = (dragged.x > bPos.x && dragged.x < bPos.x + t.width) && (dragged.y > yElse - 10 && dragged.y < yElse + 50);
                        if (isInZone2) {
                            minDist = 0;
                            this.snapCandidate = { type: 'child2', target: t };
                            this.widgetEl.querySelector('#sc-zoom-layer').appendChild(ind);
                            ind.style.display = "block";
                            ind.setAttribute("d", `M ${mouthX} ${yElse} h ${t.width - 12} v 8 h -${t.width - 12} z`);
                        }
                    } else {
                        const distIn2Top = Math.hypot(dragged.x - mouthX, dragged.y - yElse);
                        if (distIn2Top < minDist) {
                            minDist = distIn2Top;
                            this.snapCandidate = { type: 'insert-child2-start', target: t };
                            this.widgetEl.querySelector('#sc-zoom-layer').appendChild(ind);
                            ind.style.display = "block";
                            ind.setAttribute("d", `M ${mouthX} ${yElse} h ${t.width - 12} v 8 h -${t.width - 12} z`);
                        }
                    }
                }
            }
        }
    },

    applySnap: function (dragged) {
        this.widgetEl.querySelector('#sc-snap-indicator').style.display = "none";
        if (!this.snapCandidate) return;
        const t = this.snapCandidate.target;

        if (this.snapCandidate.type === 'input') {
            this.snapCandidate.slot.childBlock = dragged;
            dragged.parent = t;
            t.bubbleResize();
        }
        else if (this.snapCandidate.type === 'prev') {
            let lastOfDragged = dragged;
            while (lastOfDragged.next) lastOfDragged = lastOfDragged.next;

            if (t.parent) {
                if (t.parent.next === t) t.parent.next = dragged;
                else if (t.parent.child === t) t.parent.child = dragged;
                else if (t.parent.child2 === t) t.parent.child2 = dragged;
                dragged.parent = t.parent;
            } else {
                dragged.parent = null;
            }

            lastOfDragged.next = t;
            t.parent = lastOfDragged;

            let root = dragged;
            while (root.parent) root = root.parent;
            root.updateLayoutChain();
        }
        else if (this.snapCandidate.type === 'next') {
            const oldNext = t.next;
            t.next = dragged;
            dragged.parent = t;

            if (oldNext) {
                let lastOfDragged = dragged;
                while (lastOfDragged.next) lastOfDragged = lastOfDragged.next;
                lastOfDragged.next = oldNext;
                oldNext.parent = lastOfDragged;
            }

            t.updateLayoutChain();
        }
        else if (this.snapCandidate.type === 'child') {
            t.child = dragged; dragged.parent = t;
            t.updateLayoutChain();
        }
        else if (this.snapCandidate.type === 'insert-child-start') {
            const oldFirst = t.child;
            t.child = dragged;
            dragged.parent = t;

            let l = dragged;
            while (l.next) l = l.next;
            l.next = oldFirst;
            oldFirst.parent = l;

            t.updateLayoutChain();
        }
        else if (this.snapCandidate.type === 'child2') {
            t.child2 = dragged; dragged.parent = t;
            t.updateLayoutChain();
        }
        else if (this.snapCandidate.type === 'insert-child2-start') {
            const oldFirst = t.child2;
            t.child2 = dragged;
            dragged.parent = t;

            let l = dragged;
            while (l.next) l = l.next;
            l.next = oldFirst;
            oldFirst.parent = l;

            t.updateLayoutChain();
        }
        this.snapCandidate = null;
    },

    // --- MOTEUR D'EXPORT SVG (TAMPON) ---

    refreshPreview: async function () {
        const previewThumb = document.querySelector('#sc-preview-thumbnail');
        if (previewThumb) previewThumb.style.display = "flex";

        const canvas = document.querySelector('#sc-preview-canvas');
        if (!this.interpreter) {
            this.interpreter = new ScratchInterpreter(canvas, this);
        }
        const topBlocks = this.allBlocks.filter(b => !b.parent);
        await this.interpreter.start(topBlocks);
    },

    stampPreview: function () {
        const canvas = document.querySelector('#sc-preview-canvas');
        if (canvas.width > 0 && canvas.height > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let svgContent = '';
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            let hasContent = false;

            if (this.interpreter) {
                for (const path of this.interpreter.penPaths) {
                    if (path.lines.length === 0) continue;
                    let d = '';
                    for (const line of path.lines) {
                        const x1 = cx + line.x1, y1 = cy - line.y1;
                        const x2 = cx + line.x2, y2 = cy - line.y2;
                        d += `M ${x1} ${y1} L ${x2} ${y2} `;
                        minX = Math.min(minX, x1, x2);
                        maxX = Math.max(maxX, x1, x2);
                        minY = Math.min(minY, y1, y2);
                        maxY = Math.max(maxY, y1, y2);
                        hasContent = true;
                    }
                    svgContent += `<path d="${d.trim()}" stroke="${path.color}" stroke-width="${path.size}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
                }

                const includeCat = document.querySelector('#sc-checkbox-cat') && document.querySelector('#sc-checkbox-cat').checked;
                if (this.interpreter.sprite.visible && includeCat) {
                    const s = this.interpreter.sprite;
                    const sx = cx + s.x;
                    const sy = cy - s.y;
                    minX = Math.min(minX, sx - 25);
                    maxX = Math.max(maxX, sx + 25);
                    minY = Math.min(minY, sy - 25);
                    maxY = Math.max(maxY, sy + 25);

                    const rot = (s.dir - 90);
                    const catSrc = this.interpreter.catSVG;
                    if (catSrc && catSrc.startsWith('data:image/svg+xml;utf8,')) {
                        let rawSvg = decodeURIComponent(catSrc.substring('data:image/svg+xml;utf8,'.length));
                        rawSvg = rawSvg.replace(/<svg[^>]+>/, match => match.replace(/width="[^"]+"/, 'width="50"').replace(/height="[^"]+"/, 'height="50"'));
                        svgContent += `<g transform="translate(${sx - 25}, ${sy - 25}) rotate(${rot}, 25, 25)">${rawSvg}</g>`;
                    }

                    if (s.say) {
                        const ctx = canvas.getContext('2d');
                        ctx.font = '14px Arial';
                        const textWidth = ctx.measureText(s.say).width;
                        const bx = sx + 20;
                        const by = sy - 40;
                        const bw = textWidth + 20;
                        const bh = 30;
                        minX = Math.min(minX, bx);
                        maxX = Math.max(maxX, bx + bw);
                        minY = Math.min(minY, by - bh);
                        maxY = Math.max(maxY, by);

                        svgContent += `<path d="M ${bx} ${by} L ${bx + 10} ${by - 10} L ${bx + bw} ${by - 10} A 5 5 0 0 0 ${bx + bw + 5} ${by - 15} L ${bx + bw + 5} ${by - 10 - bh + 5} A 5 5 0 0 0 ${bx + bw} ${by - 10 - bh} L ${bx + 10} ${by - 10 - bh} A 5 5 0 0 0 ${bx + 5} ${by - 10 - bh + 5} L ${bx + 5} ${by - 15} A 5 5 0 0 0 ${bx + 10} ${by - 10} Z" fill="white" stroke="#dfe6e9" stroke-width="2" />`;

                        const safeSay = s.say.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        svgContent += `<text x="${bx + 10}" y="${by - 20}" font-family="Arial" font-size="14px" fill="#2d3436">${safeSay}</text>`;
                    }
                    hasContent = true;
                }
            }

            if (!hasContent) return;

            minX -= 10; minY -= 10; maxX += 10; maxY += 10;
            const w = maxX - minX;
            const h = maxY - minY;

            const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}">${svgContent}</svg>`;

            if (typeof createStampFromSVG === 'function') {
                createStampFromSVG(svgStr, (stamp) => {
                    this.currentStamp = stamp;
                    if (typeof setMode === 'function') setMode('scratchBlocksTool');
                    if (typeof showToast === 'function') showToast("📌 Posez l'algorithme !");

                    this.widgetEl.style.display = 'none';
                    if (this.interpreter) this.interpreter.stop();
                    const previewEl = document.querySelector('#sc-preview-thumbnail');
                    if (previewEl) previewEl.style.display = 'none';
                });
            }
        }
    },

    exportToBoard: function () {
        const svg = this.widgetEl.querySelector("#sc-svg-canvas");
        const zoomLayer = this.widgetEl.querySelector("#sc-zoom-layer");

        const clone = svg.cloneNode(true);
        const cloneZoomLayer = clone.querySelector("#sc-zoom-layer");
        cloneZoomLayer.removeAttribute("transform");

        let bbox = { x: 0, y: 0, width: 400, height: 300 };
        if (zoomLayer.getBBox) {
            try {
                const b = zoomLayer.getBBox();
                if (b.width > 0 && b.height > 0) bbox = b;
            } catch (e) { }
        }
        const padding = 15;
        const finalW = bbox.width + padding * 2;
        const finalH = bbox.height + padding * 2;

        clone.setAttribute("viewBox", `${bbox.x - padding} ${bbox.y - padding} ${finalW} ${finalH}`);
        clone.setAttribute("width", finalW);
        clone.setAttribute("height", finalH);

        const originalShapes = svg.querySelectorAll("path, rect, circle, ellipse, polygon");
        const cloneShapes = clone.querySelectorAll("path, rect, circle, ellipse, polygon");

        for (let i = 0; i < originalShapes.length; i++) {
            const computedStyle = window.getComputedStyle(originalShapes[i]);
            cloneShapes[i].style.fill = computedStyle.fill;
            cloneShapes[i].style.stroke = computedStyle.stroke;
            cloneShapes[i].style.strokeWidth = computedStyle.strokeWidth;

            if (originalShapes[i].classList.contains('sc-block-path')) {
                if (this.widgetEl.classList.contains('style-bw')) {
                    cloneShapes[i].style.filter = "none";
                } else {
                    cloneShapes[i].style.filter = "url(#sc-shadow)";
                }
            }
        }

        const cloneGrid = clone.querySelector("#sc-grid-bg");
        if (cloneGrid) cloneGrid.remove();
        clone.style.backgroundColor = "transparent";

        const originalTexts = svg.querySelectorAll("text");
        const cloneTexts = clone.querySelectorAll("text");
        for (let i = 0; i < originalTexts.length; i++) {
            const computedStyle = window.getComputedStyle(originalTexts[i]);
            cloneTexts[i].style.fill = computedStyle.fill;
            cloneTexts[i].style.fontFamily = "sans-serif";
            cloneTexts[i].setAttribute("font-family", "sans-serif");
            cloneTexts[i].style.fontSize = computedStyle.fontSize;
            // svg2pdf/jsPDF ne comprennent que les mots-clés 'normal'/'bold', pas les poids numériques
            // que le navigateur renvoie toujours dans getComputedStyle (ex: "600").
            cloneTexts[i].style.fontWeight = (parseInt(computedStyle.fontWeight, 10) || 400) >= 600 ? 'bold' : 'normal';
            cloneTexts[i].style.textShadow = computedStyle.textShadow;
            cloneTexts[i].setAttribute("dominant-baseline", "central");
            // svg2pdf ignore dominant-baseline (propriété non supportée) et ne comprend que
            // alignment-baseline : sans ça, le texte retombe sur la ligne de base par défaut
            // au lieu d'être centré verticalement, d'où le décalage visible uniquement dans le PDF.
            cloneTexts[i].setAttribute("alignment-baseline", "central");
        }

        const originalInputs = svg.querySelectorAll('input');
        const foreignObjects = clone.querySelectorAll('foreignObject');

        foreignObjects.forEach((fo, i) => {
            if (!originalInputs[i]) return;

            const val = originalInputs[i].value;
            const w = parseFloat(fo.getAttribute('width'));
            const h = parseFloat(fo.getAttribute('height'));
            const computedTextColor = window.getComputedStyle(originalInputs[i]).color;

            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.textContent = val;
            text.setAttribute("x", w / 2);
            text.setAttribute("y", h / 2);
            text.setAttribute("dominant-baseline", "central");
            text.setAttribute("alignment-baseline", "central");
            text.setAttribute("text-anchor", "middle");
            text.style.fontFamily = "sans-serif";
            text.style.fontSize = "12px";
            text.style.fontWeight = "bold";

            if (originalInputs[i].classList.contains('sc-hidden-answer')) {
                text.style.fill = "transparent";
            } else {
                text.style.fill = computedTextColor;
            }

            g.appendChild(text);
            fo.parentNode.replaceChild(g, fo);
        });

        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(clone);
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        this.widgetEl.style.display = 'none';
        const previewEl = document.querySelector('#sc-preview-thumbnail');
        if (previewEl) previewEl.style.display = 'none';

        const serializeBlock = (b) => {
            if (!b) return null;
            let obj = { def: b.def, x: b.x, y: b.y, inputs: [], next: serializeBlock(b.next), child: serializeBlock(b.child), child2: serializeBlock(b.child2) };
            b.parts.forEach((p, idx) => {
                if (p.type === 'input') {
                    if (p.spec.childBlock) obj.inputs.push({ idx: idx, child: serializeBlock(p.spec.childBlock) });
                    else obj.inputs.push({ idx: idx, val: p.spec.val });
                }
            });
            return obj;
        };
        const topBlocks = this.allBlocks.filter(b => !b.parent);
        const serializedState = topBlocks.map(b => serializeBlock(b));

        if (typeof createStampFromSVG === 'function') {
            createStampFromSVG(source, (stamp) => {
                stamp.pluginData = { id: 'scratchBlocksTool', state: serializedState };
                if (this.editingImage) {
                    this.editingImage.src = stamp.src; this.editingImage.w = stamp.w; this.editingImage.h = stamp.h;
                    this.editingImage.cw = stamp.w; this.editingImage.ch = stamp.h;
                    this.editingImage.pluginData = stamp.pluginData;
                    this.editingImage = null;
                    if (typeof saveState === 'function') saveState(); if (typeof draw === 'function') draw(); if (typeof setMode === 'function') setMode('pointer');
                } else {
                    this.currentStamp = stamp;
                    if (typeof setMode === 'function') setMode('scratchBlocksTool');
                    if (typeof showToast === 'function') showToast("📌 Cliquez sur le tableau pour coller l'algorithme", "#0984e3", "🤖");
                }
            });
        }
    },

    edit: function (imgObj) {
        if (!imgObj || !imgObj.pluginData || !imgObj.pluginData.state) return;
        this.editingImage = imgObj;
        this.openWidget();

        // Prevent double click bleed-through
        if (this.widgetEl) {
            this.widgetEl.style.pointerEvents = 'none';
            setTimeout(() => { this.widgetEl.style.pointerEvents = 'auto'; }, 300);
        }

        setTimeout(() => {
            // Nettoyage de l'espace de travail avant réédition pour éviter les duplications
            if (this.allBlocks) {
                this.allBlocks.forEach(b => { if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el); });
                this.allBlocks = [];
            }

            const zoomLayer = this.widgetEl.querySelector('#sc-zoom-layer');
            const deserializeBlock = (obj, container) => {
                if (!obj) return null;
                const b = new this.BlockClass(obj.def, obj.x, obj.y, container);

                b.parts.forEach((p, idx) => {
                    if (p.type === 'input') {
                        const savedInput = obj.inputs.find(i => i.idx === idx);
                        if (savedInput) {
                            if (savedInput.val !== undefined) p.spec.val = savedInput.val;
                            if (savedInput.child) {
                                const cb = deserializeBlock(savedInput.child, container);
                                p.spec.childBlock = cb; cb.parent = b;
                            }
                        }
                    }
                });
                if (obj.child) { b.child = deserializeBlock(obj.child, container); b.child.parent = b; }
                if (obj.child2) { b.child2 = deserializeBlock(obj.child2, container); b.child2.parent = b; }
                if (obj.next) { b.next = deserializeBlock(obj.next, container); b.next.parent = b; }

                // CRITICAL: Re-render the block now that its children and inputs are attached,
                // so it computes the correct totalHeight bottom-up.
                b.render();
                return b;
            };

            const roots = imgObj.pluginData.state.map(s => deserializeBlock(s, zoomLayer));
            roots.forEach(r => r.updateLayoutChain());
        }, 100);
    },

    // --- INTERCEPTION POUR LE TAMPONNAGE ---
    onDraw: function (ctx) {
        if (typeof mode !== 'undefined' && mode === 'scratchBlocksTool' && this.currentStamp && typeof mouseLogicalPos !== 'undefined' && mouseLogicalPos) {
            ctx.globalAlpha = 0.8;
            if (this.currentStamp.img) {
                ctx.drawImage(this.currentStamp.img, mouseLogicalPos.x - this.currentStamp.w / 2, mouseLogicalPos.y - this.currentStamp.h / 2);
            }
            ctx.globalAlpha = 1.0;
        }
    },

    onPointerDown: function (rawPos) {
        if (typeof mode !== 'undefined' && mode === 'scratchBlocksTool' && this.currentStamp) {
            if (typeof imageCache !== 'undefined') imageCache[this.currentStamp.src] = this.currentStamp.img;
            if (typeof images !== 'undefined') {
                images.push({
                    id: typeof nextId !== 'undefined' ? nextId++ : Date.now(),
                    x: rawPos.x - this.currentStamp.w / 2, y: rawPos.y - this.currentStamp.h / 2,
                    w: this.currentStamp.w, h: this.currentStamp.h, cx: 0, cy: 0, cw: this.currentStamp.w, ch: this.currentStamp.h,
                    src: this.currentStamp.src, z: typeof globalZ !== 'undefined' ? globalZ++ : 1000,
                    pluginData: this.currentStamp.pluginData
                });
            }
            if (typeof saveState === 'function') saveState();
            if (typeof setMode === 'function') setMode('pointer');
            this.currentStamp = null;
            if (typeof draw === 'function') draw();
            return true;
        }
        return false;
    }
});
