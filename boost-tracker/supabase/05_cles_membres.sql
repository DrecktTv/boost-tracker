-- ═══════════════════════════════════════════════════════════════════════════
-- 05 — Ajout des colonnes clés sur la table membres
-- À exécuter une seule fois dans l'éditeur SQL Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE membres ADD COLUMN IF NOT EXISTS cle_donjon TEXT;
ALTER TABLE membres ADD COLUMN IF NOT EXISTS cle_niveau INT;
