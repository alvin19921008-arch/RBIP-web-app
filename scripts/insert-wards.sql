-- Insert Ward Data
-- Run this in Supabase SQL Editor

INSERT INTO wards (name, total_beds, team_assignments) VALUES
('R7B', 33, '{"NSM": 33}'::jsonb),
('R7C', 45, '{"MC": 45}'::jsonb),
('R8A', 45, '{"NSM": 15, "SMM": 30}'::jsonb),
('R8B', 35, '{"CPPC": 35}'::jsonb),
('R8C', 45, '{"GMC": 30, "NSM": 15}'::jsonb),
('R9A', 45, '{"MC": 15, "CPPC": 30}'::jsonb),
('R9C', 45, '{"DRO": 15, "SFM": 30}'::jsonb),
('R10A', 45, '{"SMM": 45}'::jsonb),
('R10B', 35, '{"GMC": 35}'::jsonb),
('R10C', 45, '{"SFM": 45}'::jsonb),
('R11A', 40, '{"DRO": 40}'::jsonb),
('R11B', 30, '{"FO": 30}'::jsonb),
('R11C', 45, '{"FO": 45}'::jsonb);

-- Verify the data was inserted
SELECT 
  name,
  total_beds,
  team_assignments,
  jsonb_object_keys(team_assignments) as teams,
  (SELECT SUM(value::int) FROM jsonb_each_text(team_assignments)) as assigned_beds_sum
FROM wards
ORDER BY name;

