/**
 * BuildingStackVisualization.tsx
 * 
 * Interactive stacking plan component for commercial real estate buildings.
 * Renders floor-by-floor suite visualization with color-coded availability status.
 * 
 * Technical Features:
 * - Dynamic SVG generation based on suite square footage
 * - Responsive scaling for various viewport sizes
 * - Hover interactions for tenant details
 * - Industry-based color coding system
 * - Print optimization with vector graphics
 * 
 * This is a simplified version with proprietary calculations removed.
 */

import { useMemo } from 'react';
import type { Suite, Floor, Building } from '../types';

interface BuildingStackVisualizationProps {
  building: Building;
  floors: Floor[];
  suites: Suite[];
  showTenantNames?: boolean;
  interactiveMode?: boolean;
  displayMode?: 'standard' | 'compact' | 'detailed';
}

interface ProcessedFloor {
  floorNumber: number;
  displayNumber: string;
  suites: ProcessedSuite[];
  totalSqFt: number;
  availableSqFt: number;
}

interface ProcessedSuite {
  id: string;
  suiteNumber: string;
  sqFt: number;
  status: 'available' | 'occupied' | 'not_office';
  tenantName?: string;
  industryColor?: string;
  widthPercentage: number;
}

export function BuildingStackVisualization({
  building,
  floors,
  suites,
  showTenantNames = false,
  interactiveMode = true,
  displayMode = 'standard'
}: BuildingStackVisualizationProps) {
  
  // Process and organize suite data by floor
  const processedFloors = useMemo(() => {
    return floors.map(floor => {
      const floorSuites = suites.filter(s => s.floorId === floor.id);
      const totalSqFt = floorSuites.reduce((sum, s) => sum + s.sqFt, 0);
      
      // Calculate proportional widths for visual representation
      const processedSuites: ProcessedSuite[] = floorSuites.map(suite => ({
        id: suite.id,
        suiteNumber: suite.suiteNumber || 'Unknown',
        sqFt: suite.sqFt,
        status: suite.status,
        tenantName: suite.tenantName,
        industryColor: getIndustryColor(suite.industryType),
        widthPercentage: (suite.sqFt / totalSqFt) * 100
      }));
      
      return {
        floorNumber: floor.floorNumber,
        displayNumber: applyFloorNumberTransform(floor.floorNumber, building.skipThirteenth),
        suites: processedSuites,
        totalSqFt,
        availableSqFt: floorSuites
          .filter(s => s.status === 'available')
          .reduce((sum, s) => sum + s.sqFt, 0)
      };
    });
  }, [floors, suites, building]);
  
  // Calculate building-wide metrics
  const buildingMetrics = useMemo(() => {
    const totalRSF = processedFloors.reduce((sum, f) => sum + f.totalSqFt, 0);
    const availableRSF = processedFloors.reduce((sum, f) => sum + f.availableSqFt, 0);
    const occupancyRate = ((totalRSF - availableRSF) / totalRSF) * 100;
    
    return {
      totalRSF,
      availableRSF,
      occupancyRate,
      floorCount: floors.length,
      tenantCount: new Set(suites.filter(s => s.tenantName).map(s => s.tenantName)).size
    };
  }, [processedFloors, floors, suites]);
  
  // Dynamic height calculation based on floor count
  const floorHeight = displayMode === 'compact' ? 25 : 40;
  const svgHeight = (floors.length * floorHeight) + 100; // Extra space for labels
  
  return (
    <div className="building-stack-visualization">
      {/* Building Header */}
      <div className="building-header">
        <h2>{building.name}</h2>
        <div className="building-metrics">
          <span>Total RSF: {buildingMetrics.totalRSF.toLocaleString()}</span>
          <span>Available: {buildingMetrics.availableRSF.toLocaleString()}</span>
          <span>Occupancy: {buildingMetrics.occupancyRate.toFixed(1)}%</span>
        </div>
      </div>
      
      {/* SVG Stack Visualization */}
      <svg 
        width="100%" 
        height={svgHeight}
        viewBox={`0 0 800 ${svgHeight}`}
        className="stack-svg"
      >
        {processedFloors.map((floor, index) => (
          <g key={floor.floorNumber} transform={`translate(0, ${index * floorHeight})`}>
            {/* Floor Label */}
            <text 
              x="10" 
              y={floorHeight / 2} 
              className="floor-label"
              dominantBaseline="middle"
            >
              Floor {floor.displayNumber}
            </text>
            
            {/* Suite Rectangles */}
            <g transform="translate(100, 0)">
              {floor.suites.reduce((acc, suite, suiteIndex) => {
                const previousWidth = floor.suites
                  .slice(0, suiteIndex)
                  .reduce((sum, s) => sum + s.widthPercentage, 0);
                const xPosition = (previousWidth / 100) * 600; // 600px width for suites
                const width = (suite.widthPercentage / 100) * 600;
                
                acc.push(
                  <g key={suite.id}>
                    <rect
                      x={xPosition}
                      y={2}
                      width={width - 2} // 2px gap between suites
                      height={floorHeight - 4}
                      fill={getSuiteColor(suite)}
                      stroke="#333"
                      strokeWidth="1"
                      className={interactiveMode ? 'interactive-suite' : ''}
                      data-suite-id={suite.id}
                    >
                      {interactiveMode && (
                        <title>
                          Suite {suite.suiteNumber}
                          {'\n'}SF: {suite.sqFt.toLocaleString()}
                          {suite.tenantName && `\nTenant: ${suite.tenantName}`}
                          {'\n'}Status: {suite.status}
                        </title>
                      )}
                    </rect>
                    
                    {/* Tenant Name Label (if enabled and space permits) */}
                    {showTenantNames && suite.tenantName && width > 50 && (
                      <text
                        x={xPosition + width / 2}
                        y={floorHeight / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="tenant-label"
                        fontSize="10"
                      >
                        {truncateText(suite.tenantName, width)}
                      </text>
                    )}
                  </g>
                );
                
                return acc;
              }, [] as JSX.Element[])}
            </g>
          </g>
        ))}
        
        {/* Legend */}
        <g transform={`translate(0, ${svgHeight - 30})`}>
          <rect x="100" y="0" width="20" height="15" fill="#22c55e" />
          <text x="125" y="12" fontSize="12">Available</text>
          
          <rect x="200" y="0" width="20" height="15" fill="#3b82f6" />
          <text x="225" y="12" fontSize="12">Occupied</text>
          
          <rect x="300" y="0" width="20" height="15" fill="#6b7280" />
          <text x="325" y="12" fontSize="12">Not Office</text>
        </g>
      </svg>
      
      {/* Floor Detail Table (for detailed mode) */}
      {displayMode === 'detailed' && (
        <div className="floor-details">
          <table>
            <thead>
              <tr>
                <th>Floor</th>
                <th>Suite</th>
                <th>Square Feet</th>
                <th>Status</th>
                <th>Tenant</th>
              </tr>
            </thead>
            <tbody>
              {processedFloors.map(floor => 
                floor.suites.map(suite => (
                  <tr key={suite.id}>
                    <td>{floor.displayNumber}</td>
                    <td>{suite.suiteNumber}</td>
                    <td>{suite.sqFt.toLocaleString()}</td>
                    <td>{suite.status}</td>
                    <td>{suite.tenantName || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Helper functions (simplified - actual implementations contain proprietary logic)

function getSuiteColor(suite: ProcessedSuite): string {
  if (suite.status === 'available') return '#22c55e';
  if (suite.status === 'not_office') return '#6b7280';
  
  // Industry-based coloring for occupied suites
  return suite.industryColor || '#3b82f6';
}

function getIndustryColor(industryType?: string): string {
  // Simplified - actual implementation uses 25+ industry categories
  const industryColors: Record<string, string> = {
    'technology': '#8b5cf6',
    'finance': '#0891b2',
    'healthcare': '#dc2626',
    'legal': '#1e3a8a',
    // ... additional industries
  };
  
  return industryColors[industryType || ''] || '#3b82f6';
}

function applyFloorNumberTransform(
  floorNumber: number, 
  skipThirteenth: boolean
): string {
  // Handle 13th floor display logic
  if (skipThirteenth && floorNumber >= 13) {
    return String(floorNumber + 1);
  }
  return String(floorNumber);
}

function truncateText(text: string, maxWidth: number): string {
  // Simplified text truncation based on available width
  const charWidth = 6; // Approximate character width in pixels
  const maxChars = Math.floor(maxWidth / charWidth);
  
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 3) + '...';
}