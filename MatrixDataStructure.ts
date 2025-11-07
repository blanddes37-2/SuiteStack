/**
 * MatrixDataStructure.ts
 * 
 * TypeScript interfaces and types for multi-dimensional building comparison matrices.
 * Supports portfolio-level visualization and analysis of commercial real estate data.
 * 
 * Technical Features:
 * - Strongly typed data structures for complex relationships
 * - Nested hierarchy support (Market → Submarket → Building → Floor → Suite)
 * - Aggregation support for rollup calculations
 * - Temporal data tracking for historical analysis
 * 
 * This represents the core data model for institutional-grade real estate analytics.
 */

// ============================================================================
// Core Entity Interfaces
// ============================================================================

export interface Market {
  id: string;
  name: string;
  region: Region;
  submarkets: Submarket[];
  totalBuildings: number;
  totalSquareFeet: number;
  averageOccupancy: number;
  lastUpdated: Date;
}

export interface Submarket {
  id: string;
  marketId: string;
  name: string;
  description?: string;
  buildingCount: number;
  totalRSF: number;
  availableRSF: number;
  occupancyRate: number;
  averageAskingRent?: number;
  classAPercentage: number;
  classBPercentage: number;
  classCPercentage: number;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  submarketId: string;
  propertyType: PropertyType;
  buildingClass: BuildingClass;
  yearBuilt: number;
  totalFloors: number;
  totalRSF: number;
  availableRSF: number;
  occupancyRate: number;
  parkingSpaces?: number;
  parkingRatio?: number;
  amenities: string[];
  publicHash?: string; // For secure external sharing
  lastModified: Date;
  skipThirteenth: boolean; // Cosmetic floor numbering
}

export interface Floor {
  id: string;
  buildingId: string;
  floorNumber: number;
  displayNumber: string; // Accounts for 13th floor skipping
  totalRSF: number;
  availableRSF: number;
  suiteCount: number;
  commonAreaFactor?: number;
  floorPlateSize: number;
}

export interface Suite {
  id: string;
  buildingId: string;
  floorId: string;
  suiteNumber: string;
  previousSuiteNumbers?: SuitePreviousNumber[]; // Temporal tracking
  squareFeet: number;
  status: SuiteStatus;
  availableDate?: Date;
  askingRent?: number;
  tenantId?: string;
  leaseExpiration?: Date;
  notOfficeType?: NotOfficeType;
  lastModified: Date;
  modifiedBy: string;
}

export interface Tenant {
  id: string;
  name: string;
  legalName?: string;
  industryType: IndustryType;
  employeeCount?: EmployeeSize;
  parentCompany?: string;
  creditRating?: string;
  website?: string;
  primaryContactId?: string;
  totalLeasedSF: number;
  suiteCount: number;
  markets: string[]; // Markets where tenant has presence
  enrichmentStatus: EnrichmentStatus;
  lastEnriched?: Date;
}

// ============================================================================
// Matrix-Specific Interfaces
// ============================================================================

export interface BuildingMatrix {
  skylineId: string;
  name: string;
  buildings: BuildingMatrixData[];
  comparisonMetrics: ComparisonMetrics;
  generatedAt: Date;
  shareableHash?: string;
}

export interface BuildingMatrixData {
  buildingId: string;
  buildingName: string;
  buildingAddress: string;
  submarketName: string;
  propertyType: PropertyType;
  buildingClass: BuildingClass;
  totalFloors: number;
  totalRSF: number;
  availableRSF: number;
  occupancyRate: number;
  floors: FloorMatrixData[];
  tenantMix: TenantMixData;
  publicHash?: string; // Enables click-through navigation
  metrics: BuildingMetrics;
}

export interface FloorMatrixData {
  floorNumber: number;
  displayNumber: string;
  totalRSF: number;
  availableRSF: number;
  largestAvailable?: number;
  suites: SuiteMatrixData[];
}

export interface SuiteMatrixData {
  suiteNumber: string;
  squareFeet: number;
  status: SuiteStatus;
  tenantName?: string;
  industryType?: IndustryType;
  industryColor?: string;
  leaseExpiration?: Date;
  widthPercentage: number; // For proportional visualization
}

export interface TenantMixData {
  topTenants: {
    name: string;
    squareFeet: number;
    percentage: number;
    industryType: IndustryType;
  }[];
  industryBreakdown: {
    industry: IndustryType;
    squareFeet: number;
    percentage: number;
    tenantCount: number;
  }[];
  tenantConcentration: number; // Herfindahl index
}

export interface BuildingMetrics {
  availabilityRate: number;
  weightedAverageLeaseExpiry: number; // In months
  tenantRetentionRate: number;
  leaseRolloverNext12Months: number; // Square feet
  averageSuiteSize: number;
  largestAvailableBlock: number;
  parkingRatio?: number;
  yearBuilt: number;
  renovationYear?: number;
}

export interface ComparisonMetrics {
  averageOccupancy: number;
  totalPortfolioRSF: number;
  totalAvailableRSF: number;
  marketBreakdown: {
    market: string;
    buildingCount: number;
    totalRSF: number;
    occupancyRate: number;
  }[];
  propertyTypeBreakdown: {
    propertyType: PropertyType;
    buildingCount: number;
    totalRSF: number;
    occupancyRate: number;
  }[];
  classBreakdown: {
    buildingClass: BuildingClass;
    buildingCount: number;
    totalRSF: number;
    occupancyRate: number;
  }[];
}

// ============================================================================
// Temporal Tracking Interfaces
// ============================================================================

export interface SuitePreviousNumber {
  previousNumber: string;
  effectiveFrom: Date;
  effectiveTo: Date;
  changeReason?: string;
  show90DayWarning: boolean;
}

export interface OccupancyHistory {
  buildingId: string;
  date: Date;
  occupancyRate: number;
  totalRSF: number;
  occupiedRSF: number;
  availableRSF: number;
  tenantCount: number;
}

export interface LeaseTransaction {
  id: string;
  buildingId: string;
  suiteId: string;
  transactionType: 'new_lease' | 'renewal' | 'expansion' | 'contraction' | 'termination';
  tenantName: string;
  squareFeet: number;
  leaseCommencementDate: Date;
  leaseExpirationDate: Date;
  askingRent?: number;
  effectiveRent?: number;
  recordedDate: Date;
}

// ============================================================================
// Enumeration Types
// ============================================================================

export enum Region {
  SOUTH_FLORIDA = 'south_florida',
  CENTRAL_FLORIDA = 'central_florida',
  CAROLINAS = 'carolinas',
  ALL_REGIONS = 'all_regions' // Universal access flag
}

export enum PropertyType {
  OFFICE = 'office',
  INDUSTRIAL = 'industrial',
  ALL_TYPES = 'all_types' // Universal access flag
}

export enum BuildingClass {
  CLASS_A = 'A',
  CLASS_B = 'B',
  CLASS_C = 'C',
  NOT_CLASSIFIED = 'NC'
}

export enum SuiteStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  NOT_OFFICE = 'not_office',
  UNDER_RENOVATION = 'under_renovation',
  PRE_LEASED = 'pre_leased'
}

export enum NotOfficeType {
  RETAIL = 'retail',
  PARKING = 'parking',
  STORAGE = 'storage',
  MECHANICAL = 'mechanical',
  LOBBY = 'lobby',
  AMENITY = 'amenity'
}

export enum IndustryType {
  TECHNOLOGY = 'technology',
  FINANCE = 'finance',
  LEGAL = 'legal',
  HEALTHCARE = 'healthcare',
  INSURANCE = 'insurance',
  REAL_ESTATE = 'real_estate',
  GOVERNMENT = 'government',
  NONPROFIT = 'nonprofit',
  RETAIL = 'retail',
  MANUFACTURING = 'manufacturing',
  MEDIA = 'media',
  HOSPITALITY = 'hospitality',
  EDUCATION = 'education',
  ENERGY = 'energy',
  TELECOMMUNICATIONS = 'telecommunications',
  TRANSPORTATION = 'transportation',
  CONSTRUCTION = 'construction',
  CONSULTING = 'consulting',
  ADVERTISING = 'advertising',
  PHARMACEUTICAL = 'pharmaceutical',
  FOOD_BEVERAGE = 'food_beverage',
  FITNESS = 'fitness',
  ENTERTAINMENT = 'entertainment',
  OTHER = 'other'
}

export enum EmployeeSize {
  SMALL = '1-49',
  MEDIUM = '50-249',
  LARGE = '250-999',
  ENTERPRISE = '1000+'
}

export enum EnrichmentStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  MANUAL_OVERRIDE = 'manual_override'
}

// ============================================================================
// Permission & Access Types
// ============================================================================

export interface UserPermissions {
  userId: string;
  role: UserRole;
  regions: Region[];
  propertyTypes: PropertyType[];
  assignedBuildings: string[];
  universalAccess: boolean;
}

export enum UserRole {
  ADMIN = 'admin',
  RESEARCHER = 'researcher',
  BROKER = 'broker',
  VIEWER = 'viewer'
}

// ============================================================================
// Export & Deliverable Types
// ============================================================================

export interface ExportConfiguration {
  format: ExportFormat;
  includeVacant: boolean;
  includeTenantInfo: boolean;
  includeFinancials: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  buildings?: string[];
  markets?: string[];
  customFields?: string[];
}

export enum ExportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
  JSON = 'json'
}

// ============================================================================
// Aggregation & Analytics Types
// ============================================================================

export interface PortfolioAnalytics {
  totalBuildings: number;
  totalSquareFeet: number;
  totalAvailable: number;
  overallOccupancy: number;
  marketMetrics: MarketMetric[];
  topTenantsBySize: TenantMetric[];
  leaseExpirationSchedule: LeaseExpirationBucket[];
  industryConcentration: IndustryConcentration[];
}

export interface MarketMetric {
  marketName: string;
  buildingCount: number;
  totalRSF: number;
  availableRSF: number;
  occupancyRate: number;
  averageRent?: number;
  quarterOverQuarterChange: number;
}

export interface TenantMetric {
  tenantName: string;
  totalSquareFeet: number;
  buildingCount: number;
  portfolioPercentage: number;
  industryType: IndustryType;
}

export interface LeaseExpirationBucket {
  period: string; // e.g., "Q1 2024"
  expiringSquareFeet: number;
  tenantCount: number;
  percentageOfPortfolio: number;
  keyExpirations: string[]; // Major tenant names
}

export interface IndustryConcentration {
  industry: IndustryType;
  squareFeet: number;
  percentage: number;
  tenantCount: number;
  averageTenantSize: number;
  growthRate: number; // Year-over-year
}