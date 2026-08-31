// Identifiant client Google, nécessaire au sélecteur de fichiers Drive.
//
// Ce n'est pas un secret : Google le prévoit visible dans la page, et il ne
// donne rien à lui seul. Ce qui protège le compte, c'est la liste des
// « origines JavaScript autorisées » déclarée dans la console Google Cloud :
// n'y mettre QUE le domaine du site. Sans cela, le sélecteur refusera de
// s'ouvrir ailleurs — c'est le comportement voulu.
//
// Laisser vide désactive proprement la fonction : le bouton ne s'affiche pas.
window.AUTABLEAU_DRIVE_CLIENT_ID = '104179953661-2h0q8ada8m22j3d8uhe4ra3rbgfdp83p.apps.googleusercontent.com';
