-- Migration: Convert specialty values in spt_allocations to dropdown options
-- Map existing specialty values to new dropdown options using fuzzy matching

-- MSK/Ortho variations
UPDATE spt_allocations 
SET specialty = 'MSK/Ortho' 
WHERE specialty IS NOT NULL 
  AND (
    LOWER(specialty) LIKE '%msk%' OR
    LOWER(specialty) LIKE '%musculoskeletal%' OR
    LOWER(specialty) LIKE '%ortho%' OR
    LOWER(specialty) LIKE '%orthopedic%'
  )
  AND specialty NOT IN ('Cardiac', 'Cardio', 'Cardiology', 'Neuro', 'Neurology', 'Neurological', 'Cancer', 'Oncology');

-- Cardiac variations
UPDATE spt_allocations 
SET specialty = 'Cardiac' 
WHERE specialty IS NOT NULL 
  AND (
    LOWER(specialty) LIKE '%cardiac%' OR
    LOWER(specialty) LIKE '%cardio%' OR
    LOWER(specialty) LIKE '%cardiology%'
  );

-- Neuro variations
UPDATE spt_allocations 
SET specialty = 'Neuro' 
WHERE specialty IS NOT NULL 
  AND (
    LOWER(specialty) LIKE '%neuro%' OR
    LOWER(specialty) LIKE '%neurological%'
  );

-- Cancer variations
UPDATE spt_allocations 
SET specialty = 'Cancer' 
WHERE specialty IS NOT NULL 
  AND (
    LOWER(specialty) LIKE '%cancer%' OR
    LOWER(specialty) LIKE '%oncology%'
  );

-- Set everything else that doesn't match to NULL
UPDATE spt_allocations 
SET specialty = NULL 
WHERE specialty IS NOT NULL 
  AND specialty NOT IN ('MSK/Ortho', 'Cardiac', 'Neuro', 'Cancer', 'nil');

-- Verify the migration
SELECT DISTINCT specialty, COUNT(*) 
FROM spt_allocations 
WHERE specialty IS NOT NULL 
GROUP BY specialty 
ORDER BY specialty;
