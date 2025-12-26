-- Add floor_pca column to staff table
-- This stores an array of floor types: ["upper"], ["lower"], or ["upper", "lower"]
-- Similar to special_program TEXT[] pattern - direct mapping, no conversion needed
ALTER TABLE staff
ADD COLUMN IF NOT EXISTS floor_pca TEXT[];

