-- ═══════════════════════════════════════════════════════════════════════════
-- 02 — NOUVELLE TABLE : alltime
-- Remplace localStorage DB.alltime — à exécuter une seule fois en prod.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE alltime (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id  UUID NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  spe        TEXT,
  classe     TEXT,
  earned     BIGINT NOT NULL DEFAULT 0,
  runs       INT    NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Un seul enregistrement par membre
CREATE UNIQUE INDEX alltime_membre_idx ON alltime(membre_id);

ALTER TABLE alltime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_all" ON alltime
  FOR SELECT USING (true);

CREATE POLICY "write_member" ON alltime
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
  );
