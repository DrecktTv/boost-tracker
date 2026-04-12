-- ── Lien utilisateur → personnage principal ────────────────────────────────────
-- Chaque compte Discord peut être associé à son perso principal dans membres.
-- ON DELETE SET NULL : si le membre est supprimé, le lien est effacé proprement.

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS main_membre_id UUID REFERENCES membres(id) ON DELETE SET NULL;
