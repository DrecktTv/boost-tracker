# Déploiement GitHub Pages

## 1. Adapter le base path

Dans `vite.config.js`, remplace la ligne `base` par le nom exact de ton repo GitHub :

```js
base: '/nom-de-ton-repo/',
```

Exemple : si ton repo s'appelle `boost-tracker` → `base: '/boost-tracker/'`

---

## 2. Pousser le projet

Le contenu de ce dossier doit être **à la racine** de ton repo GitHub (pas dans un sous-dossier).

```bash
git init
git remote add origin https://github.com/TON-PSEUDO/TON-REPO.git
git add .
git commit -m "init: Boosterinos Vite"
git push origin main
```

---

## 3. Activer GitHub Pages

Dans ton repo GitHub :
`Settings → Pages → Source → GitHub Actions`

Le fichier `.github/workflows/deploy.yml` s'occupe du build et du déploiement automatiquement à chaque push sur `main`.

---

## 4. Créer la table Supabase manquante

Exécute le fichier `supabase/02_nouvelle_table_alltime.sql` dans l'éditeur SQL de ton projet Supabase.

Si la table `blacklist` n'existe pas encore, exécute aussi `supabase/03_nouvelle_table_blacklist.sql`.

---

## 5. (Optionnel) Migrer les données localStorage

Si tu as des données dans l'ancienne version (alltime / blacklist), ouvre l'ancien `indexV2.html` dans ton navigateur, connecte-toi en admin, puis colle le contenu de `supabase/04_migration_localStorage.js` dans la console (F12).

---

## Résultat

L'app sera disponible sur : `https://ton-pseudo.github.io/ton-repo/`
