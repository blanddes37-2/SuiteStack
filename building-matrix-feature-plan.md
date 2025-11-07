# Building Matrix Feature - Implementation Plan

## Overview
Create an exportable matrix view of selected buildings from the /buildings page, displaying summary information with toggleable views between building photos and miniaturized stacking plans. The stacking plans will be proportionally sized (10 floors = 2x height of 5 floors) and use simplified color-coded rectangles.

## Reference Image
Similar to the Pittsburgh Skyline (stacking plan matrix) provided, but simplified with standardized rectangular building shapes rather than bespoke outlines.

## Architecture Overview

### Phase 1: Building Selection Infrastructure
**Components needed:**
- Enhance `BuildingTable` with multi-select checkboxes
- Add a floating action bar that appears when buildings are selected (similar to Gmail)
- "Create Matrix" button that opens the matrix view with selected buildings

### Phase 2: Matrix View Component Structure
**New components to create:**
- `BuildingMatrix` - Main container component
- `BuildingMatrixCard` - Individual building display (switchable between photo/stack view)  
- `SimplifiedStackingPlan` - SVG-based visualization component
- `BuildingMatrixExport` - Export functionality wrapper

### Phase 3: Simplified Stacking Plan Renderer
**Key features:**
- Use SVG for clean, scalable graphics
- Calculate building height: `(floors * BASE_FLOOR_HEIGHT)` pixels
- Each floor is a simple rectangle with color based on occupancy status
- Reuse existing color logic from `SuiteCard` but simplified (no text, just colors)
- Width standardized across all buildings for easy comparison

### Phase 4: Data Requirements
**For each building we'll need:**
```typescript
interface BuildingMatrixData {
  // Basic info
  id: number;
  name: string;
  address: string;
  photo_url: string;
  stories: number;
  
  // Summary stats
  total_sf: number;
  available_sf: number;
  occupied_sf: number;
  availability_rate: number;
  asking_rent_avg: number;
  
  // Ownership
  owners: string;
  property_manager: string;
  leasing_company: string;
  
  // Floor/Suite data (aggregated)
  floors_with_status: {
    floor_number: number;
    suites: {
      status: string;
      sf: number;
      tenant?: string;
      industry_tag?: string;
      lease_expiry?: Date;
    }[];
  }[];
  
  // Top tenants
  top_tenants: {
    name: string;
    sf: number;
    floors: number[];
  }[];
}
```

## Implementation Steps

### Step 1: Backend API Endpoint
**File:** `server/routes.ts`
- Create `/api/buildings/matrix-data` endpoint
- Accept array of building IDs
- Return aggregated data optimized for visualization
- Include user permission filtering

### Step 2: Selection UI
**Files to modify:**
- `client/src/components/building/BuildingTable.tsx`
- `client/src/pages/buildings/index.tsx`

**Features:**
- Add checkbox column to BuildingTable
- Implement selection state management
- Create floating action bar with count and actions
- Show "X buildings selected" with actions

### Step 3: Matrix View Layout
**New file:** `client/src/components/building/BuildingMatrix.tsx`

**Features:**
- Responsive grid (2-4 columns depending on screen)
- Toggle button for photo/stack mode
- Color scheme selector (reuse existing options)
- Export button

### Step 4: Stacking Plan SVG Generation
**New file:** `client/src/components/building/SimplifiedStackingPlan.tsx`

```javascript
// Simplified approach
const FLOOR_HEIGHT = 20; // pixels per floor
const BUILDING_WIDTH = 150; // standardized width
const MAX_HEIGHT = 400; // max pixels for tallest building

// For each floor, create rectangles based on suite status
<svg height={calculateHeight(stories)} width={BUILDING_WIDTH}>
  {floors.map((floor, index) => 
    <rect 
      y={index * FLOOR_HEIGHT}
      height={FLOOR_HEIGHT}
      width={calculateWidth(floor.occupancy)}
      fill={getColorForStatus(floor.status)}
    />
  )}
</svg>
```

### Step 5: Export Functionality
**New file:** `client/src/components/building/BuildingMatrixExport.tsx`

**Features:**
- Use `html2canvas` (already installed) for image export
- Use `jsPDF` (already installed) for PDF generation
- Export options:
  - PNG image
  - PDF document
  - Excel spreadsheet (data only)
- Allow customization of export size and format

## UI/UX Specifications

### Photo Mode Display
- Large building photo (dominant element)
- Below photo:
  - Building name and address
  - Total SF | Available SF | % Available
  - Asking rent range
  - Top 5 tenants with SF
  - Owner information
  - Leasing company contact

### Stack Mode Display
- Miniaturized stacking plan (dominant element)
- Below stack:
  - Building name
  - Total SF | % Available
  - Top 3 tenants
  - Minimal details to emphasize visual

### Color Schemes (from existing system)
1. **Status Based:**
   - Occupied: Green
   - Vacant: Red
   - Unknown: Yellow
   - Not Office: Dark Gray

2. **Availability Based:**
   - Available: Red
   - Sublease: Orange
   - Not Available: Green

3. **Lease Expiry Based:**
   - <1 year: Dark teal
   - 1-3 years: Medium teal
   - 3-5 years: Light teal
   - 5+ years: Very light teal

4. **Industry Based:**
   - Dynamic colors per industry tag

## Technical Considerations

### Performance Optimization
- Limit selection to 20 buildings max
- Implement virtual scrolling if >10 buildings
- Lazy load detailed suite data
- Use React.memo for card components
- Debounce color scheme changes

### Proportional Heights
```javascript
const calculateHeight = (stories, maxStories) => {
  const ratio = stories / maxStories;
  return Math.max(MIN_HEIGHT, ratio * MAX_HEIGHT);
};
```

### Responsive Design
- Desktop: 4 columns
- Tablet: 3 columns  
- Mobile: 2 columns
- Card width: min 250px, max 400px

### Export Quality
- Render at 2x resolution for retina displays
- SVG exports for vector quality
- Allow user to choose export resolution
- Maximum export size: 4096x4096 pixels

## Database Queries Needed

### Get Matrix Data Query
```sql
-- Get building summary with aggregated stats
SELECT 
  b.*,
  COUNT(DISTINCT s.id) as total_suites,
  SUM(CASE WHEN s.status = 'vacant' THEN s.square_footage ELSE 0 END) as available_sf,
  AVG(s.asking_rent) as avg_asking_rent
FROM buildings b
LEFT JOIN suites s ON b.id = s.building_id
WHERE b.id IN (?)
GROUP BY b.id;

-- Get top tenants per building
SELECT 
  building_id,
  tenant,
  SUM(square_footage) as total_sf,
  COUNT(*) as suite_count
FROM suites
WHERE building_id IN (?)
  AND tenant IS NOT NULL
  AND tenant != 'VACANT'
GROUP BY building_id, tenant
ORDER BY building_id, total_sf DESC
LIMIT 5 per building;
```

## Existing Components to Reuse
- Color scheme logic from `SuiteCard.tsx`
- Building data hooks from `use-building-data.ts`
- Export utilities (html2canvas, jsPDF)
- Color scheme toggle from `ColorSchemeToggle.tsx`
- Building photo display from `BuildingPhotoUpload.tsx`

## Future Enhancements (Phase 2)
1. Interactive tooltips on stack hover
2. Click-through to building detail page
3. Comparison mode highlighting differences
4. Save matrix configurations for reuse
5. Email matrix as attachment
6. Animation transitions between photo/stack view
7. Custom grouping by submarket or class
8. Side-by-side comparison view (2 buildings)

## Testing Requirements
1. Test with 1-20 buildings selected
2. Test with buildings of varying heights (1-50 floors)
3. Test all color scheme options
4. Test export at different resolutions
5. Test responsive layout on all screen sizes
6. Test with buildings missing photos
7. Test with incomplete suite data

## Success Metrics
- Users can select and compare 5+ buildings in under 30 seconds
- Export quality suitable for presentations
- Matrix loads in <2 seconds for 10 buildings
- Color coding immediately understandable
- Mobile experience fully functional