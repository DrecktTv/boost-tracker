-- ═══════════════════════════════════════════════════════════════════════════
-- 01 — TABLES EXISTANTES (déjà en prod dans V2)
-- À titre de documentation — ne pas réexécuter si les tables existent déjà.
-- ═══════════════════════════════════════════════════════════════════════════

-- Rôles utilisateurs (Auth Discord)
CREATE TABLE IF NOT EXISTS user_roles (
  id             UUID PRIMARY KEY,  -- = auth.users.id
  role           TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','member','viewer')),
  discord_name   TEXT,
  discord_avatar TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"    ON user_roles FOR SELECT USING (true);
CREATE POLICY "self_insert" ON user_roles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "admin_write" ON user_roles FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role = 'admin')
);

-- Membres de la team
CREATE TABLE IF NOT EXISTS membres (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        TEXT NOT NULL,
  spe        TEXT,
  classe     TEXT,
  ilvl       INT,
  rio        INT,
  owner_id   UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE membres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"     ON membres FOR SELECT USING (true);
CREATE POLICY "write_member" ON membres FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"     ON teams FOR SELECT USING (true);
CREATE POLICY "write_member" ON teams FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
);

-- Slots des teams
CREATE TABLE IF NOT EXISTS team_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  slot_index  INT NOT NULL,
  role        TEXT,
  membre_id   UUID REFERENCES membres(id) ON DELETE SET NULL,
  paye        BOOLEAN DEFAULT false,
  tarif       INT DEFAULT 0
);
ALTER TABLE team_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"     ON team_slots FOR SELECT USING (true);
CREATE POLICY "write_member" ON team_slots FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
);

-- Runs de session
CREATE TABLE IF NOT EXISTS runs (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id  UUID REFERENCES teams(id) ON DELETE SET NULL,
  cle      TEXT,
  cles     JSONB,
  note     TEXT,
  prix     INT DEFAULT 0,
  membres  JSONB,
  paye     BOOLEAN DEFAULT false,
  date     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"     ON runs FOR SELECT USING (true);
CREATE POLICY "write_member" ON runs FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
);

-- Historique des resets de session
CREATE TABLE IF NOT EXISTS historique_resets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date         TIMESTAMPTZ DEFAULT NOW(),
  note         TEXT,
  total        BIGINT DEFAULT 0,
  paid_count   INT DEFAULT 0,
  unpaid_count INT DEFAULT 0,
  runs_count   INT DEFAULT 0,
  snapshot     TEXT  -- JSON stringifié de la session complète
);
ALTER TABLE historique_resets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"     ON historique_resets FOR SELECT USING (true);
CREATE POLICY "write_member" ON historique_resets FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
);

-- Catches du Smizz (easter egg)
CREATE TABLE IF NOT EXISTS smizz_catches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       TIMESTAMPTZ DEFAULT NOW(),
  caught_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE smizz_catches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"     ON smizz_catches FOR SELECT USING (true);
CREATE POLICY "write_member" ON smizz_catches FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role IN ('admin','member'))
);
CREATE POLICY "admin_delete" ON smizz_catches FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role = 'admin')
);
