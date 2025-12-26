-- Initial Floor PCA data mapping
-- Maps PCA staff by name to their floor_pca property
-- Upper: 珊, 明, 光劭, 浩然, 秋, 桂花, 友好
-- Lower: 淑貞, 婉儀, 宛諭, 張麗, 少華, 君
-- Both: 麗雅

-- Update floor_pca for Upper floor PCAs
UPDATE staff
SET floor_pca = ARRAY['upper']::TEXT[]
WHERE rank = 'PCA' AND name IN ('珊', '明', '光劭', '浩然', '秋', '桂花', '友好');

-- Update floor_pca for Lower floor PCAs
UPDATE staff
SET floor_pca = ARRAY['lower']::TEXT[]
WHERE rank = 'PCA' AND name IN ('淑貞', '婉儀', '宛諭', '張麗', '少華', '君');

-- Update floor_pca for Both (Upper and Lower)
UPDATE staff
SET floor_pca = ARRAY['upper', 'lower']::TEXT[]
WHERE rank = 'PCA' AND name = '麗雅';

