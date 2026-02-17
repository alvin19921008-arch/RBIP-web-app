-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE staff_rank AS ENUM ('SPT', 'APPT', 'RPT', 'PCA', 'workman');
CREATE TYPE team AS ENUM ('FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO');
CREATE TYPE weekday AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri');
CREATE TYPE leave_type AS ENUM ('VL', 'SL', 'TIL', 'study leave', 'conference');

-- Staff master data
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  rank staff_rank NOT NULL,
  special_program TEXT[],
  team team,
  floating BOOLEAN DEFAULT false,
  floor_pca TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff preferences
CREATE TABLE staff_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  preference_teams team[] DEFAULT '{}',
  preference_not_teams team[] DEFAULT '{}',
  preference_days weekday[] DEFAULT '{}',
  preference_slots JSONB DEFAULT '{}',
  gym_schedule JSONB,
  UNIQUE(staff_id)
);

-- Special programs
CREATE TABLE special_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  staff_ids UUID[] DEFAULT '{}',
  weekdays weekday[] DEFAULT '{}',
  slots JSONB DEFAULT '{}',
  fte_subtraction JSONB DEFAULT '{}',
  pca_required DECIMAL,
  therapist_preference_order JSONB DEFAULT '{}',
  pca_preference_order UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SPT allocations
CREATE TABLE spt_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  specialty TEXT,
  teams team[] DEFAULT '{}',
  weekdays weekday[] DEFAULT '{}',
  slots JSONB DEFAULT '{}',
  slot_modes JSONB DEFAULT '{}',
  fte_addon DECIMAL NOT NULL,
  substitute_team_head BOOLEAN DEFAULT false,
  is_rbip_supervisor BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team head substitutions
CREATE TABLE team_head_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spt_staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  fte_when_substituting DECIMAL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(spt_staff_id)
);

-- PCA preferences
CREATE TABLE pca_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team team NOT NULL UNIQUE,
  preferred_pca_ids UUID[] DEFAULT '{}',
  preferred_slots INTEGER[] DEFAULT '{}',
  avoid_gym_schedule BOOLEAN DEFAULT false,
  gym_schedule INTEGER,
  floor_pca_selection TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wards
CREATE TABLE wards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  total_beds INTEGER NOT NULL,
  team_assignments JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily schedules
CREATE TABLE daily_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  is_tentative BOOLEAN DEFAULT true,
  tie_break_decisions JSONB DEFAULT '{}',
  baseline_snapshot JSONB DEFAULT '{}',
  staff_overrides JSONB DEFAULT '{}',
  workflow_state JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Therapist allocations
CREATE TABLE schedule_therapist_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES daily_schedules(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  team team NOT NULL,
  fte_therapist DECIMAL NOT NULL,
  fte_remaining DECIMAL NOT NULL,
  slot_whole INTEGER,
  slot1 team,
  slot2 team,
  slot3 team,
  slot4 team,
  leave_type leave_type,
  special_program_ids UUID[],
  is_substitute_team_head BOOLEAN DEFAULT false,
  spt_slot_display TEXT,
  is_manual_override BOOLEAN DEFAULT false,
  manual_override_note TEXT
);

-- PCA allocations
CREATE TABLE schedule_pca_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES daily_schedules(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  team team NOT NULL,
  fte_pca DECIMAL NOT NULL,
  fte_remaining DECIMAL NOT NULL,
  slot_assigned DECIMAL NOT NULL DEFAULT 0,  -- Renamed from fte_assigned - tracks assigned slots (0.25 per slot)
  slot_whole INTEGER,
  slot1 team,
  slot2 team,
  slot3 team,
  slot4 team,
  leave_type leave_type,
  special_program_ids UUID[],
  invalid_slot INTEGER,
  -- leave_comeback_time / leave_mode removed (legacy feature)
);

-- PCA unmet needs tracking
CREATE TABLE pca_unmet_needs_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES daily_schedules(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  team team NOT NULL,
  pending_pca_fte DECIMAL NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_unmet_needs_date_team ON pca_unmet_needs_tracking(date, team);
CREATE INDEX idx_unmet_needs_date ON pca_unmet_needs_tracking(date);

-- Bed allocations
CREATE TABLE schedule_bed_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES daily_schedules(id) ON DELETE CASCADE,
  from_team team NOT NULL,
  to_team team NOT NULL,
  ward TEXT NOT NULL,
  num_beds INTEGER NOT NULL,
  slot INTEGER
);

-- Schedule calculations
CREATE TABLE schedule_calculations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES daily_schedules(id) ON DELETE CASCADE,
  team team NOT NULL,
  designated_wards TEXT[] DEFAULT '{}',
  total_beds_designated INTEGER NOT NULL,
  total_beds INTEGER NOT NULL,
  total_pt_on_duty DECIMAL NOT NULL,
  beds_per_pt DECIMAL NOT NULL,
  pt_per_team DECIMAL NOT NULL,
  beds_for_relieving DECIMAL NOT NULL,
  pca_on_duty DECIMAL NOT NULL,
  total_pt_per_pca DECIMAL NOT NULL,
  total_pt_per_team DECIMAL NOT NULL,
  average_pca_per_team DECIMAL NOT NULL,
  base_average_pca_per_team DECIMAL NOT NULL DEFAULT 0,
  expected_beds_per_team DECIMAL NOT NULL DEFAULT 0,
  required_pca_per_team DECIMAL NOT NULL DEFAULT 0,
  UNIQUE(schedule_id, team)
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'regular' CHECK (role IN ('admin', 'regular')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_staff_team ON staff(team);
CREATE INDEX idx_staff_rank ON staff(rank);
CREATE INDEX idx_schedule_date ON daily_schedules(date);
CREATE INDEX idx_therapist_schedule ON schedule_therapist_allocations(schedule_id);
CREATE INDEX idx_pca_schedule ON schedule_pca_allocations(schedule_id);
CREATE INDEX idx_bed_schedule ON schedule_bed_allocations(schedule_id);
CREATE INDEX idx_calc_schedule ON schedule_calculations(schedule_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_special_programs_updated_at BEFORE UPDATE ON special_programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spt_allocations_updated_at BEFORE UPDATE ON spt_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_head_substitutions_updated_at BEFORE UPDATE ON team_head_substitutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pca_preferences_updated_at BEFORE UPDATE ON pca_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wards_updated_at BEFORE UPDATE ON wards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_schedules_updated_at BEFORE UPDATE ON daily_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_head_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pca_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_therapist_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_pca_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_bed_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access" ON staff FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access" ON staff_preferences FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access" ON special_programs FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access" ON spt_allocations FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access" ON team_head_substitutions FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access" ON pca_preferences FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access" ON wards FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Regular users can read schedules and create/edit tentative schedules
CREATE POLICY "Users can read schedules" ON daily_schedules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can create tentative schedules" ON daily_schedules FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND is_tentative = true
);
CREATE POLICY "Users can update tentative schedules" ON daily_schedules FOR UPDATE USING (
  auth.role() = 'authenticated' AND is_tentative = true
);

-- Users can read/write schedule allocations for tentative schedules
CREATE POLICY "Users can manage tentative schedule allocations" ON schedule_therapist_allocations FOR ALL USING (
  auth.role() = 'authenticated' AND
  EXISTS (SELECT 1 FROM daily_schedules WHERE id = schedule_id AND is_tentative = true)
);

CREATE POLICY "Users can manage tentative schedule allocations" ON schedule_pca_allocations FOR ALL USING (
  auth.role() = 'authenticated' AND
  EXISTS (SELECT 1 FROM daily_schedules WHERE id = schedule_id AND is_tentative = true)
);

CREATE POLICY "Users can manage tentative schedule allocations" ON schedule_bed_allocations FOR ALL USING (
  auth.role() = 'authenticated' AND
  EXISTS (SELECT 1 FROM daily_schedules WHERE id = schedule_id AND is_tentative = true)
);

CREATE POLICY "Users can manage tentative schedule calculations" ON schedule_calculations FOR ALL USING (
  auth.role() = 'authenticated' AND
  EXISTS (SELECT 1 FROM daily_schedules WHERE id = schedule_id AND is_tentative = true)
);

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);

