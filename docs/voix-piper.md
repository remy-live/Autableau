# Installer une vraie voix française pour la dictée (Piper)

**À qui s'adresse cette page.** À qui reprend le code avec une machine
connectée. Elle décrit, pas à pas, comment brancher Piper sur la dictée d'« Au
Tableau ! ». Elle a été écrite dans un environnement **sans accès réseau** :
tout ce qui n'a pas pu être vérifié est marqué **[à vérifier]**. Ne recopiez
pas une URL d'ici sans l'ouvrir d'abord dans un navigateur.

---

## 1. Pourquoi Piper, et ce qui est déjà fait

La dictée lit aujourd'hui avec `window.speechSynthesis`, la voix du système.
Sur un ordinateur d'école, c'est souvent la vieille voix compacte : elle hache
les liaisons, et l'on nous l'a dit — « on ne comprend rien ». On classe déjà
les voix pour proposer la meilleure en premier (`rangDeLaVoix`, dans
`plugin.js`), mais on ne peut pas faire mieux que ce que la machine porte.

**Piper** est un synthétiseur vocal libre (licence MIT **[à vérifier]**), qui
tourne entièrement hors ligne, à partir d'un fichier de modèle. Ses voix françaises
sont bien meilleures que les voix compactes. Il existe des portages
navigateur, en WebAssembly.

**La plomberie est déjà dans le code** (voir `lecteurDicteeTool` dans
`plugin.js`, et le chapitre de tests `tests/18-francais-langues-techno.cjs`) :

- une voix rangée dans le navigateur (via `localforage`, donc IndexedDB),
  désignée par l'enseignant avec un sélecteur de fichiers, et relue à
  l'ouverture de la fenêtre de dictée ;
- le refus d'une fiche incomplète — modèle absent ou tronqué, fiche technique
  sans fréquence d'échantillonnage, voix sans nom ;
- son apparition **en tête** de la liste des voix, devant même une voix
  « améliorée » du système, avec la mention « installée, hors ligne » ;
- le choix, la mémorisation de ce choix, et le retrait de la voix — qui nettoie
  le réglage au passage ;
- **le repli propre** : si la voix est rangée mais que le synthétiseur n'est
  pas là, la dictée ne part pas en silence — elle le dit, redit le groupe qui
  n'a pas été entendu, et continue avec une voix du système.

Il ne manque donc que **le synthétiseur lui-même**, et de quoi le nourrir.

---

## 2. La décision qui commande tout : la page ne télécharge rien

« Au Tableau ! » s'ouvre aussi bien depuis `file://` qu'en ligne, et doit
fonctionner dans une salle sans réseau. Deux faits mesurés dans ce dépôt :

- depuis `file://`, **`fetch()` échoue** (Chrome refuse les requêtes vers
  `file:`) : une page qui irait chercher son modèle au premier usage ne
  marcherait pas pour la moitié des utilisateurs ;
- IndexedDB et WebAssembly, eux, **fonctionnent** depuis `file://`.

D'où le choix retenu : **l'enseignant télécharge les deux fichiers lui-même**
(une fois, chez lui) et les **désigne** avec un `<input type="file">`. La page
les range dans IndexedDB et ne sort jamais sur le réseau. Cela règle du même
coup la question de la bande passante de l'école, celle du proxy académique,
et celle du consentement : rien ne part et rien n'arrive sans un geste.

> Ne remplacez pas cela par un téléchargement automatique « pour simplifier ».
> Ce serait une page de 60 Mo à la première dictée, sur le réseau d'un
> collège, un mercredi à 9 h.

---

## 3. Les fichiers d'une voix

Une voix Piper, c'est **deux fichiers**, toujours :

| Fichier | Ce que c'est | Ordre de grandeur |
|---|---|---|
| `<voix>.onnx` | le modèle lui-même | ~20 Mo en `low`, ~60 Mo en `medium` **[à vérifier]** |
| `<voix>.onnx.json` | sa fiche : fréquence d'échantillonnage, table de phonèmes, locuteurs | quelques kilo-octets |

Le `.json` n'est pas facultatif : il porte le `sample_rate` et la table des
phonèmes sans lesquels le `.onnx` ne veut rien dire.

**Où les prendre.** Le dépôt de référence est `rhasspy/piper-voices` sur
Hugging Face, rangé par langue : `fr/fr_FR/<locuteur>/<qualité>/`. Voix
françaises qui y figuraient : `siwis`, `upmc`, `gilles`, `mls`, `tom`
**[à vérifier : les noms, les qualités disponibles et les tailles]**.

**Les licences ne sont pas toutes les mêmes.** Piper est MIT, mais **chaque
voix suit la licence de son corpus** — certaines en CC0, d'autres en CC BY,
d'autres avec une clause non commerciale. Le dossier de chaque voix porte sa
mention. **Vérifiez-la voix par voix**, et notez-la dans `NOTICE.md` si une
voix est recommandée par défaut. C'est d'autant plus important ici que le
projet est sous PolyForm Noncommercial : une voix CC BY demande une mention,
pas davantage, mais une mention absente est un manquement.

---

## 4. Le synthétiseur dans le navigateur

Piper, en dehors du navigateur, s'appuie sur deux morceaux :

1. **onnxruntime-web** — exécute le modèle `.onnx` en WebAssembly ;
2. **un phonémiseur** — `piper-phonemize`, c'est-à-dire **espeak-ng** compilé
   en WebAssembly, qui transforme « Les cigognes » en phonèmes. Sans lui, pas
   de français correct : c'est lui qui sait les liaisons et les nombres.

Des portages tout faits existent sur npm (autour du nom `piper-tts-web`)
**[à vérifier : nom exact du paquet, licence, état de maintenance]**. Comptez
**10 à 20 Mo** de WebAssembly pour le moteur, en plus du modèle **[à
vérifier]**.

**Ces fichiers-là doivent être servis depuis le dépôt**, dans `lib/piper/`,
comme `lib/pdfjs/` ou `lib/mathlive/` : pas de CDN. Un CDN casse le hors
ligne, casse `file://`, et fait dépendre une salle de classe d'un domaine
tiers. C'est la règle déjà suivie par toutes les bibliothèques du projet.

> Contrainte à mesurer avant de s'engager : `onnxruntime-web` charge son
> `.wasm` par `fetch` relatif. Depuis `file://`, cela **échouera** comme le
> reste. Il faudra sans doute l'inliner en `data:` URI, ou fournir le binaire
> par `WebAssembly.instantiate` à partir d'un `ArrayBuffer` lu autrement.
> **C'est le point dur du portage : traitez-le en premier, avant même de
> brancher la voix.** S'il ne se résout pas, Piper reste possible en ligne
> seulement, et il faut alors le dire clairement à l'utilisateur plutôt que de
> lui offrir un bouton qui ne marche que chez certains.

---

## 5. Les points d'accroche dans le code

Tout se passe dans `plugin.js`, dans `registerPlugin('lecteurDicteeTool', …)`.

### `moteur` — l'objet à quatre méthodes

```js
moteur: {
    disponible: function () { … },
    voix:       function () { … },   // -> tableau de voix
    dire:       function (texte, opts, quandFini) { … },
    taire:      function () { … }
}
```

C'est **la seule frontière à franchir**. `dire` reçoit déjà
`{ vitesse, voix }` et rappelle `quandFini()` à la fin, ou
`quandFini({ panne: '…' })` en cas d'échec — cette distinction existe déjà et
sert au repli. Un moteur Piper doit offrir exactement ces quatre méthodes.

### Les autres endroits à connaître

| Où | Ce qu'il fait |
|---|---|
| `moteurLocal` | le moteur de la voix installée — **c'est lui qu'il faut nourrir** |
| `moteurDeLaVoix(v)` | choisit le moteur selon la voix : `v.locale` ou non |
| `voixFrancaises()` | la liste montrée, la voix installée en tête |
| `voixChoisie()` | résout le réglage mémorisé en voix réelle |
| `majLesVoix()` | remplit le `<select id="dic-voix">` et le mot sous la liste |
| `rangerLaVoixLocale` / `lireLaVoixLocale` / `retirerLaVoixLocale` | le stockage |
| `installerDepuisLesFichiers(fichiers)` | les deux fichiers désignés → une voix |
| `reglages.voix` | le nom mémorisé (`localStorage`, via `ecrireLesReglages`) |
| `#dic-sansvoix` | la ligne d'alerte, branchée sur les pannes et sur le repli |
| `#dic-voix-locale` | la zone d'installation, dans les « Réglages fins » |

### Ce qu'il reste à faire, exactement

`moteurLocal` cherche le synthétiseur sur **`window.VoixInstallee`**, et lui
demande deux choses :

```js
window.VoixInstallee = {
    dire: function (texte, opts, quandFini) { … },   // opts : { vitesse, voix }
    taire: function () { … }
};
```

`quandFini()` à la fin de l'énonciation, `quandFini({ panne: '…' })` si elle
échoue. Tant que cet objet n'existe pas, `moteurLocal.dire` rend
`{ panne: 'voix-installee-absente' }`, et la dictée se replie sur une voix du
système en redisant le groupe. C'est tout le contrat.

Le modèle à charger est dans `LECTEUR.voixLocale` : `{ nom, langue, config,
modele }`, où `modele` est l'`ArrayBuffer` du `.onnx` et `config` le contenu du
`.onnx.json`.

**Rien d'autre ne change** : la découpe en groupes de souffle, la ponctuation
dite en toutes lettres, les relectures, le mode automatique — tout cela est
au-dessus du moteur et ne sait pas quelle voix parle.

---

## 6. La marche à suivre, dans l'ordre

1. **Régler le point dur d'abord** (§ 4) : faire dire « bonjour » à
   `onnxruntime-web` depuis une page ouverte en `file://`, dans une page
   d'essai isolée, sans rien du projet. Si cela ne marche pas, s'arrêter là et
   décider : en ligne seulement, ou pas du tout.
2. **Poser les fichiers** dans `lib/piper/`, avec leur licence dans
   `NOTICE.md`, et les charger depuis `index.html` comme les autres
   bibliothèques — avec leur `?v=` de cache.
3. **Écrire `window.VoixInstallee`** (§ 5) : `dire` et `taire`, rien de plus.
   Il n'y a aucune bifurcation à ajouter dans la dictée — elle est déjà là.
4. **Le bouton d'installation existe déjà** dans les réglages fins : il attend
   un `.onnx` et son `.onnx.json`, refuse une fiche incomplète et range les
   deux. Rien à y toucher.
5. **Les tests.** Le chapitre 18 installe une **fausse** voix et un **faux**
   synthétiseur : il prouve la plomberie sans rien télécharger. En ajoutant un
   vrai moteur, garder ces épreuves telles quelles — elles décrivent le
   contrat — et en ajouter une seule, ignorée si les fichiers réels ne sont
   pas là.
7. **Mesurer la première phrase.** Une voix qui met quatre secondes à dire
   « Les cigognes » ne servira pas en classe : il faut savoir, avant de la
   proposer, combien coûte le chargement du modèle et combien coûte chaque
   phrase. Le chargement se fait une fois, à l'ouverture de la fenêtre, pas au
   premier mot d'une dictée commencée.

---

## 7. Ce qu'il ne faut pas faire

- **Pas de CDN**, pas d'appel réseau à l'insu de l'utilisateur. Voir § 2.
- **Pas de téléchargement automatique** du modèle.
- **Ne pas retirer la voix du navigateur.** Elle reste le repli, et sur bien
  des machines elle suffit. Piper est un **plus**, jamais un passage obligé.
- **Ne pas faire dépendre la dictée du chargement de Piper** : si le moteur
  met six secondes à s'éveiller, la dictée doit pouvoir commencer sans lui.
