-- ── Système Main / Alt ────────────────────────────────────────────────────────
-- Ajoute une colonne main_id sur membres : si renseignée, le personnage est un alt
-- et main_id pointe vers son personnage principal.
-- ON DELETE SET NULL : si le main est supprimé, les alts deviennent libres (main_id → NULL).

ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS main_id UUID REFERENCES membres(id) ON DELETE SET NULL;

-- Index pour retrouver rapidement les alts d'un main
CREATE INDEX IF NOT EXISTS membres_main_id_idx ON membres(main_id);
