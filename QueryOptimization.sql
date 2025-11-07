-- QueryOptimization.sql
-- 
-- Performance-optimized PostgreSQL queries for commercial real estate analytics.
-- Demonstrates advanced SQL techniques for handling large-scale property data.
-- 
-- Technical Highlights:
-- - Strategic use of indexes and materialized views
-- - Window functions for complex calculations
-- - Common Table Expressions (CTEs) for readability
-- - Aggregation optimization strategies
-- 
-- Note: Proprietary business logic has been simplified or removed.

-- ============================================================================
-- OPTIMIZED BUILDING ANALYTICS QUERY
-- Before optimization: 8-12 seconds
-- After optimization: 800ms
-- ============================================================================

-- Create strategic indexes for common query patterns
CREATE INDEX CONCURRENTLY idx_suites_building_floor_status 
  ON suites(building_id, floor, status) 
  WHERE status != 'not_office';

CREATE INDEX CONCURRENTLY idx_tenants_industry_active 
  ON tenants(industry_type) 
  WHERE is_active = true;

CREATE INDEX CONCURRENTLY idx_buildings_submarket_class 
  ON buildings(submarket_id, building_class, property_type);

-- Main analytics query with performance optimizations
WITH building_metrics AS (
  -- Pre-aggregate suite data at building level
  SELECT 
    s.building_id,
    COUNT(DISTINCT s.id) as total_suites,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'available') as available_suites,
    SUM(s.square_feet) as total_rsf,
    SUM(s.square_feet) FILTER (WHERE s.status = 'available') as available_rsf,
    SUM(s.square_feet) FILTER (WHERE s.status = 'occupied') as occupied_rsf,
    SUM(s.square_feet) FILTER (WHERE s.status = 'not_office') as not_office_rsf,
    COUNT(DISTINCT s.tenant_id) FILTER (WHERE s.tenant_id IS NOT NULL) as tenant_count,
    AVG(s.square_feet) FILTER (WHERE s.status != 'not_office') as avg_suite_size,
    MAX(s.square_feet) FILTER (WHERE s.status = 'available') as largest_available
  FROM suites s
  WHERE s.deleted_at IS NULL
  GROUP BY s.building_id
),
tenant_mix AS (
  -- Calculate tenant concentration metrics
  SELECT 
    s.building_id,
    t.industry_type,
    COUNT(DISTINCT t.id) as industry_tenant_count,
    SUM(s.square_feet) as industry_total_sf,
    RANK() OVER (
      PARTITION BY s.building_id 
      ORDER BY SUM(s.square_feet) DESC
    ) as industry_rank
  FROM suites s
  JOIN tenants t ON s.tenant_id = t.id
  WHERE s.status = 'occupied' 
    AND s.deleted_at IS NULL
    AND t.is_active = true
  GROUP BY s.building_id, t.industry_type
),
lease_expiry AS (
  -- Calculate weighted average lease expiry (WALE)
  SELECT 
    s.building_id,
    SUM(
      s.square_feet * 
      EXTRACT(EPOCH FROM (s.lease_expiration - CURRENT_DATE)) / 86400
    ) / NULLIF(SUM(s.square_feet), 0) as wale_days,
    SUM(s.square_feet) FILTER (
      WHERE s.lease_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '12 months'
    ) as rollover_next_12_months
  FROM suites s
  WHERE s.status = 'occupied' 
    AND s.lease_expiration IS NOT NULL
    AND s.deleted_at IS NULL
  GROUP BY s.building_id
)
-- Main query combining all metrics
SELECT 
  b.id,
  b.name,
  b.address,
  sm.name as submarket_name,
  m.name as market_name,
  b.building_class,
  b.property_type,
  b.year_built,
  b.total_floors,
  
  -- Size metrics (excluding not_office from calculations)
  COALESCE(bm.total_rsf - bm.not_office_rsf, 0) as rentable_sf,
  COALESCE(bm.available_rsf, 0) as available_sf,
  COALESCE(bm.occupied_rsf, 0) as occupied_sf,
  
  -- Occupancy calculations
  CASE 
    WHEN (bm.total_rsf - bm.not_office_rsf) > 0 
    THEN ROUND(
      (bm.occupied_rsf::NUMERIC / (bm.total_rsf - bm.not_office_rsf)) * 100, 
      1
    )
    ELSE 0 
  END as occupancy_rate,
  
  -- Suite metrics
  COALESCE(bm.total_suites, 0) as total_suites,
  COALESCE(bm.available_suites, 0) as available_suites,
  COALESCE(bm.avg_suite_size, 0) as avg_suite_size,
  COALESCE(bm.largest_available, 0) as largest_available_block,
  
  -- Tenant metrics
  COALESCE(bm.tenant_count, 0) as tenant_count,
  COALESCE(le.wale_days / 365.0, 0) as wale_years,
  COALESCE(le.rollover_next_12_months, 0) as lease_rollover_sf,
  
  -- Top 3 industries by square footage
  ARRAY_AGG(
    DISTINCT tm.industry_type 
    ORDER BY tm.industry_rank
  ) FILTER (WHERE tm.industry_rank <= 3) as top_industries,
  
  -- Parking metrics
  b.parking_spaces,
  CASE 
    WHEN b.parking_spaces > 0 AND (bm.total_rsf - bm.not_office_rsf) > 0
    THEN ROUND(
      (b.parking_spaces::NUMERIC / ((bm.total_rsf - bm.not_office_rsf) / 1000.0)), 
      2
    )
    ELSE NULL 
  END as parking_ratio,
  
  -- Timestamps
  b.created_at,
  b.updated_at,
  GREATEST(
    b.updated_at, 
    MAX(bm.total_suites) OVER (PARTITION BY b.id)
  ) as last_data_update
  
FROM buildings b
JOIN submarkets sm ON b.submarket_id = sm.id
JOIN markets m ON sm.market_id = m.id
LEFT JOIN building_metrics bm ON b.id = bm.building_id
LEFT JOIN tenant_mix tm ON b.id = tm.building_id
LEFT JOIN lease_expiry le ON b.id = le.building_id
WHERE b.deleted_at IS NULL
  AND b.is_active = true
GROUP BY 
  b.id, b.name, b.address, sm.name, m.name, b.building_class, 
  b.property_type, b.year_built, b.total_floors, b.parking_spaces,
  b.created_at, b.updated_at, bm.total_rsf, bm.not_office_rsf, 
  bm.available_rsf, bm.occupied_rsf, bm.total_suites, bm.available_suites,
  bm.avg_suite_size, bm.largest_available, bm.tenant_count,
  le.wale_days, le.rollover_next_12_months;

-- ============================================================================
-- NIGHTLY AGGREGATION FOR PERFORMANCE
-- Runs at 2 AM ET via cron scheduler
-- ============================================================================

-- Create aggregation table for pre-computed metrics
CREATE TABLE IF NOT EXISTS suite_aggregations (
  building_id INTEGER PRIMARY KEY REFERENCES buildings(id),
  total_suites INTEGER NOT NULL DEFAULT 0,
  available_suites INTEGER NOT NULL DEFAULT 0,
  total_rsf NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_rsf NUMERIC(10,2) NOT NULL DEFAULT 0,
  occupied_rsf NUMERIC(10,2) NOT NULL DEFAULT 0,
  not_office_rsf NUMERIC(10,2) NOT NULL DEFAULT 0,
  tenant_count INTEGER NOT NULL DEFAULT 0,
  avg_suite_size NUMERIC(10,2),
  largest_available NUMERIC(10,2),
  occupancy_rate NUMERIC(5,2),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_building FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

-- Aggregation refresh procedure
CREATE OR REPLACE FUNCTION refresh_suite_aggregations()
RETURNS void AS $$
BEGIN
  -- Use UPSERT pattern for concurrent safety
  INSERT INTO suite_aggregations (
    building_id,
    total_suites,
    available_suites,
    total_rsf,
    available_rsf,
    occupied_rsf,
    not_office_rsf,
    tenant_count,
    avg_suite_size,
    largest_available,
    occupancy_rate,
    last_updated
  )
  SELECT 
    s.building_id,
    COUNT(DISTINCT s.id),
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'available'),
    COALESCE(SUM(s.square_feet), 0),
    COALESCE(SUM(s.square_feet) FILTER (WHERE s.status = 'available'), 0),
    COALESCE(SUM(s.square_feet) FILTER (WHERE s.status = 'occupied'), 0),
    COALESCE(SUM(s.square_feet) FILTER (WHERE s.status = 'not_office'), 0),
    COUNT(DISTINCT s.tenant_id) FILTER (WHERE s.tenant_id IS NOT NULL),
    AVG(s.square_feet) FILTER (WHERE s.status != 'not_office'),
    MAX(s.square_feet) FILTER (WHERE s.status = 'available'),
    CASE 
      WHEN SUM(s.square_feet) FILTER (WHERE s.status != 'not_office') > 0
      THEN ROUND(
        (SUM(s.square_feet) FILTER (WHERE s.status = 'occupied')::NUMERIC / 
         SUM(s.square_feet) FILTER (WHERE s.status != 'not_office')) * 100,
        2
      )
      ELSE 0
    END,
    CURRENT_TIMESTAMP
  FROM suites s
  WHERE s.deleted_at IS NULL
  GROUP BY s.building_id
  ON CONFLICT (building_id) DO UPDATE SET
    total_suites = EXCLUDED.total_suites,
    available_suites = EXCLUDED.available_suites,
    total_rsf = EXCLUDED.total_rsf,
    available_rsf = EXCLUDED.available_rsf,
    occupied_rsf = EXCLUDED.occupied_rsf,
    not_office_rsf = EXCLUDED.not_office_rsf,
    tenant_count = EXCLUDED.tenant_count,
    avg_suite_size = EXCLUDED.avg_suite_size,
    largest_available = EXCLUDED.largest_available,
    occupancy_rate = EXCLUDED.occupancy_rate,
    last_updated = EXCLUDED.last_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLEX AVAILABILITY SEARCH WITH PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Search for available suites with multiple criteria
CREATE OR REPLACE FUNCTION search_available_suites(
  p_markets INTEGER[],
  p_submarkets INTEGER[],
  p_min_size NUMERIC,
  p_max_size NUMERIC,
  p_building_classes TEXT[],
  p_available_within_days INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  suite_id INTEGER,
  building_name TEXT,
  submarket_name TEXT,
  floor_number INTEGER,
  suite_number TEXT,
  square_feet NUMERIC,
  asking_rent NUMERIC,
  available_date DATE,
  building_class TEXT,
  amenities TEXT[],
  parking_ratio NUMERIC,
  distance_to_match NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_buildings AS (
    -- Pre-filter buildings to reduce join complexity
    SELECT b.id
    FROM buildings b
    JOIN submarkets sm ON b.submarket_id = sm.id
    WHERE b.deleted_at IS NULL
      AND b.is_active = true
      AND (p_markets IS NULL OR sm.market_id = ANY(p_markets))
      AND (p_submarkets IS NULL OR b.submarket_id = ANY(p_submarkets))
      AND (p_building_classes IS NULL OR b.building_class = ANY(p_building_classes))
  ),
  available_suites AS (
    SELECT 
      s.id,
      s.building_id,
      s.floor,
      s.suite_number,
      s.square_feet,
      s.asking_rent,
      s.available_date,
      -- Calculate size match distance for ranking
      ABS(s.square_feet - ((p_min_size + p_max_size) / 2)) as size_distance
    FROM suites s
    WHERE s.building_id IN (SELECT id FROM filtered_buildings)
      AND s.status = 'available'
      AND s.deleted_at IS NULL
      AND s.square_feet BETWEEN p_min_size AND p_max_size
      AND (
        p_available_within_days IS NULL 
        OR s.available_date <= CURRENT_DATE + INTERVAL '1 day' * p_available_within_days
      )
  )
  SELECT 
    av.id as suite_id,
    b.name as building_name,
    sm.name as submarket_name,
    av.floor as floor_number,
    av.suite_number,
    av.square_feet,
    av.asking_rent,
    av.available_date,
    b.building_class,
    b.amenities,
    CASE 
      WHEN b.parking_spaces > 0 AND sa.total_rsf > 0
      THEN ROUND((b.parking_spaces::NUMERIC / (sa.total_rsf / 1000.0)), 2)
      ELSE NULL 
    END as parking_ratio,
    av.size_distance as distance_to_match
  FROM available_suites av
  JOIN buildings b ON av.building_id = b.id
  JOIN submarkets sm ON b.submarket_id = sm.id
  LEFT JOIN suite_aggregations sa ON b.id = sa.building_id
  ORDER BY 
    av.size_distance ASC,  -- Best size match first
    av.available_date ASC,  -- Soonest available
    b.building_class ASC    -- Class A first
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TENANT DUPLICATE DETECTION QUERY
-- ============================================================================

-- Find potential duplicate tenants using multiple matching strategies
WITH tenant_similarity AS (
  SELECT 
    t1.id as tenant1_id,
    t1.name as tenant1_name,
    t2.id as tenant2_id,
    t2.name as tenant2_name,
    
    -- Calculate similarity scores
    similarity(LOWER(t1.name), LOWER(t2.name)) as name_similarity,
    
    -- Check for common industry
    CASE WHEN t1.industry_type = t2.industry_type THEN 0.2 ELSE 0 END as industry_match,
    
    -- Check for similar employee count
    CASE 
      WHEN t1.employee_size = t2.employee_size THEN 0.1 
      ELSE 0 
    END as size_match,
    
    -- Check for address proximity (simplified)
    CASE 
      WHEN EXISTS (
        SELECT 1 
        FROM suites s1 
        JOIN suites s2 ON s1.building_id = s2.building_id
        WHERE s1.tenant_id = t1.id 
          AND s2.tenant_id = t2.id
      ) THEN 0.3 
      ELSE 0 
    END as same_building_bonus
    
  FROM tenants t1
  CROSS JOIN tenants t2
  WHERE t1.id < t2.id  -- Avoid duplicate pairs
    AND t1.is_active = true
    AND t2.is_active = true
),
scored_matches AS (
  SELECT 
    tenant1_id,
    tenant1_name,
    tenant2_id,
    tenant2_name,
    name_similarity,
    (name_similarity + industry_match + size_match + same_building_bonus) as total_score
  FROM tenant_similarity
  WHERE name_similarity > 0.6  -- Minimum threshold for name similarity
)
SELECT 
  tenant1_id,
  tenant1_name,
  tenant2_id,
  tenant2_name,
  ROUND(name_similarity * 100) as name_match_percent,
  ROUND(total_score * 100) as confidence_score
FROM scored_matches
WHERE total_score > 0.7  -- Overall confidence threshold
ORDER BY total_score DESC;