-- ═══════════════════════════════════════════════════════════════════════════
-- 03 — NOUVELLE TABLE : blacklist
-- Remplace localStorage DB.blacklist — à exécuter si la table n'existe pas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE blacklist (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom    TEXT NOT NULL,
  rio    TEXT,
  raison TEXT,
  date   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_all" ON blacklist
  FOR SELECT USING (true);

CREATE POLICY "write_member" ON blacklist
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
  );
