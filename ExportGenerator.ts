/**
 * ExportGenerator.ts
 * 
 * Enterprise-grade document generation system for commercial real estate reports.
 * Produces PDF, Excel, and CSV exports with institutional formatting standards.
 * 
 * Technical Features:
 * - Stream-based processing for large datasets
 * - Memory-efficient chunking for 10,000+ record exports
 * - Format-agnostic base class with specialized implementations
 * - Async/await pattern for non-blocking operations
 * 
 * Note: Proprietary formatting and calculation logic has been simplified.
 */

import type { 
  Building, 
  Suite, 
  Tenant, 
  ExportConfiguration,
  ExportFormat 
} from '../types';

// ============================================================================
// Base Export Generator Class
// ============================================================================

abstract class ExportGenerator<T> {
  protected config: ExportConfiguration;
  protected data: T[];
  
  constructor(config: ExportConfiguration, data: T[]) {
    this.config = config;
    this.data = data;
  }
  
  /**
   * Generate export with progress tracking
   */
  async generate(): Promise<Blob> {
    await this.validate();
    await this.preprocess();
    const content = await this.createContent();
    return this.finalize(content);
  }
  
  /**
   * Validate export configuration and data
   */
  protected async validate(): Promise<void> {
    if (!this.data || this.data.length === 0) {
      throw new Error('No data available for export');
    }
    
    if (this.data.length > 50000) {
      throw new Error('Dataset too large. Please filter data or export in batches.');
    }
  }
  
  /**
   * Preprocess data before export (sorting, filtering, calculations)
   */
  protected abstract preprocess(): Promise<void>;
  
  /**
   * Create export content in format-specific way
   */
  protected abstract createContent(): Promise<any>;
  
  /**
   * Finalize and return export as Blob
   */
  protected abstract finalize(content: any): Promise<Blob>;
}

// ============================================================================
// PDF Export Generator
// ============================================================================

class PDFExportGenerator extends ExportGenerator<Building> {
  private pdfDoc: any; // PDFKit instance
  private pageHeight = 792;
  private pageWidth = 612;
  private margin = 50;
  private currentY = 0;
  
  protected async preprocess(): Promise<void> {
    // Sort buildings by market and submarket
    this.data.sort((a, b) => {
      const marketCompare = a.marketName.localeCompare(b.marketName);
      if (marketCompare !== 0) return marketCompare;
      return a.submarketName.localeCompare(b.submarketName);
    });
  }
  
  protected async createContent(): Promise<any> {
    // Initialize PDF document
    const PDFDocument = await import('pdfkit');
    this.pdfDoc = new PDFDocument.default({
      size: 'letter',
      margin: this.margin,
      bufferPages: true
    });
    
    // Generate cover page
    this.generateCoverPage();
    
    // Generate table of contents
    this.generateTableOfContents();
    
    // Generate building pages
    for (const building of this.data) {
      await this.generateBuildingPage(building);
    }
    
    // Generate summary statistics
    this.generateSummaryPage();
    
    return this.pdfDoc;
  }
  
  private generateCoverPage(): void {
    this.pdfDoc.addPage();
    this.currentY = this.margin;
    
    // Title
    this.pdfDoc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Portfolio Stacking Plan Report', this.margin, this.currentY);
    
    this.currentY += 40;
    
    // Metadata
    this.pdfDoc
      .fontSize(12)
      .font('Helvetica')
      .text(`Generated: ${new Date().toLocaleDateString()}`, this.margin, this.currentY);
    
    this.currentY += 20;
    this.pdfDoc.text(`Total Buildings: ${this.data.length}`, this.margin, this.currentY);
    
    const totalRSF = this.data.reduce((sum, b) => sum + b.totalRSF, 0);
    this.currentY += 20;
    this.pdfDoc.text(`Total Square Feet: ${totalRSF.toLocaleString()}`, this.margin, this.currentY);
  }
  
  private generateTableOfContents(): void {
    this.pdfDoc.addPage();
    this.currentY = this.margin;
    
    this.pdfDoc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Table of Contents', this.margin, this.currentY);
    
    this.currentY += 30;
    
    let pageNum = 3; // Starting page for buildings
    this.pdfDoc.fontSize(11).font('Helvetica');
    
    for (const building of this.data) {
      this.pdfDoc.text(
        `${building.name} - ${building.submarketName}`,
        this.margin,
        this.currentY
      );
      
      this.pdfDoc.text(
        `Page ${pageNum}`,
        this.pageWidth - this.margin - 50,
        this.currentY
      );
      
      this.currentY += 20;
      pageNum++;
      
      // Check for page overflow
      if (this.currentY > this.pageHeight - this.margin - 50) {
        this.pdfDoc.addPage();
        this.currentY = this.margin;
      }
    }
  }
  
  private async generateBuildingPage(building: Building): Promise<void> {
    this.pdfDoc.addPage();
    this.currentY = this.margin;
    
    // Building header
    this.pdfDoc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(building.name, this.margin, this.currentY);
    
    this.currentY += 25;
    
    // Building details
    this.pdfDoc.fontSize(10).font('Helvetica');
    
    const details = [
      `Address: ${building.address}`,
      `Submarket: ${building.submarketName}`,
      `Class: ${building.buildingClass}`,
      `Total Floors: ${building.totalFloors}`,
      `Total RSF: ${building.totalRSF.toLocaleString()}`,
      `Available RSF: ${building.availableRSF.toLocaleString()}`,
      `Occupancy: ${building.occupancyRate.toFixed(1)}%`
    ];
    
    for (const detail of details) {
      this.pdfDoc.text(detail, this.margin, this.currentY);
      this.currentY += 15;
    }
    
    // Stacking visualization (simplified)
    this.currentY += 20;
    await this.generateStackingVisualization(building);
    
    // Tenant list
    if (this.config.includeTenantInfo && building.tenants) {
      this.currentY += 30;
      this.generateTenantList(building.tenants);
    }
  }
  
  private async generateStackingVisualization(building: Building): Promise<void> {
    const floors = building.floors || [];
    const floorHeight = 20;
    const maxWidth = this.pageWidth - (2 * this.margin);
    
    // Draw each floor
    for (const floor of floors) {
      const occupancyPercent = (floor.occupiedRSF / floor.totalRSF) * 100;
      const availablePercent = (floor.availableRSF / floor.totalRSF) * 100;
      
      // Floor label
      this.pdfDoc
        .fontSize(9)
        .text(`Floor ${floor.displayNumber}`, this.margin - 35, this.currentY + 5);
      
      // Occupied portion (blue)
      const occupiedWidth = (occupancyPercent / 100) * maxWidth;
      if (occupiedWidth > 0) {
        this.pdfDoc
          .rect(this.margin, this.currentY, occupiedWidth, floorHeight)
          .fill('#3b82f6');
      }
      
      // Available portion (green)
      const availableWidth = (availablePercent / 100) * maxWidth;
      if (availableWidth > 0) {
        this.pdfDoc
          .rect(this.margin + occupiedWidth, this.currentY, availableWidth, floorHeight)
          .fill('#22c55e');
      }
      
      // Not office portion (gray)
      const notOfficeWidth = maxWidth - occupiedWidth - availableWidth;
      if (notOfficeWidth > 0) {
        this.pdfDoc
          .rect(this.margin + occupiedWidth + availableWidth, this.currentY, notOfficeWidth, floorHeight)
          .fill('#6b7280');
      }
      
      this.currentY += floorHeight + 2;
    }
    
    // Legend
    this.currentY += 15;
    this.pdfDoc.fontSize(8);
    
    const legendItems = [
      { color: '#3b82f6', label: 'Occupied' },
      { color: '#22c55e', label: 'Available' },
      { color: '#6b7280', label: 'Not Office' }
    ];
    
    let legendX = this.margin;
    for (const item of legendItems) {
      this.pdfDoc
        .rect(legendX, this.currentY, 10, 10)
        .fill(item.color);
      
      this.pdfDoc
        .fillColor('black')
        .text(item.label, legendX + 15, this.currentY + 2);
      
      legendX += 80;
    }
    
    this.pdfDoc.fillColor('black');
  }
  
  private generateTenantList(tenants: Tenant[]): void {
    this.pdfDoc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Major Tenants', this.margin, this.currentY);
    
    this.currentY += 20;
    
    this.pdfDoc.fontSize(9).font('Helvetica');
    
    // Sort tenants by square footage
    const sortedTenants = [...tenants].sort((a, b) => b.totalSF - a.totalSF);
    const topTenants = sortedTenants.slice(0, 10);
    
    for (const tenant of topTenants) {
      const tenantText = `${tenant.name} - ${tenant.totalSF.toLocaleString()} SF`;
      this.pdfDoc.text(tenantText, this.margin + 10, this.currentY);
      this.currentY += 12;
      
      // Check for page overflow
      if (this.currentY > this.pageHeight - this.margin - 50) {
        this.pdfDoc.addPage();
        this.currentY = this.margin;
      }
    }
  }
  
  private generateSummaryPage(): void {
    this.pdfDoc.addPage();
    this.currentY = this.margin;
    
    this.pdfDoc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Portfolio Summary', this.margin, this.currentY);
    
    this.currentY += 30;
    
    // Calculate portfolio metrics
    const metrics = this.calculatePortfolioMetrics();
    
    this.pdfDoc.fontSize(11).font('Helvetica');
    
    const summaryItems = [
      `Total Buildings: ${metrics.totalBuildings}`,
      `Total Square Feet: ${metrics.totalRSF.toLocaleString()}`,
      `Total Available: ${metrics.totalAvailable.toLocaleString()}`,
      `Portfolio Occupancy: ${metrics.occupancyRate.toFixed(1)}%`,
      `Average Building Size: ${metrics.avgBuildingSize.toLocaleString()} SF`,
      `Class A Buildings: ${metrics.classACount}`,
      `Class B Buildings: ${metrics.classBCount}`,
      `Class C Buildings: ${metrics.classCCount}`
    ];
    
    for (const item of summaryItems) {
      this.pdfDoc.text(item, this.margin, this.currentY);
      this.currentY += 20;
    }
  }
  
  private calculatePortfolioMetrics(): any {
    const totalRSF = this.data.reduce((sum, b) => sum + b.totalRSF, 0);
    const totalAvailable = this.data.reduce((sum, b) => sum + b.availableRSF, 0);
    
    return {
      totalBuildings: this.data.length,
      totalRSF,
      totalAvailable,
      occupancyRate: ((totalRSF - totalAvailable) / totalRSF) * 100,
      avgBuildingSize: totalRSF / this.data.length,
      classACount: this.data.filter(b => b.buildingClass === 'A').length,
      classBCount: this.data.filter(b => b.buildingClass === 'B').length,
      classCCount: this.data.filter(b => b.buildingClass === 'C').length
    };
  }
  
  protected async finalize(content: any): Promise<Blob> {
    // Convert PDF stream to Blob
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      
      content.on('data', (chunk: any) => chunks.push(chunk));
      content.on('end', () => {
        const blob = new Blob(chunks, { type: 'application/pdf' });
        resolve(blob);
      });
      content.on('error', reject);
      
      content.end();
    });
  }
}

// ============================================================================
// Excel Export Generator
// ============================================================================

class ExcelExportGenerator extends ExportGenerator<any> {
  private workbook: any;
  private worksheets: Map<string, any> = new Map();
  
  protected async preprocess(): Promise<void> {
    // Group data by type for different worksheets
    this.organizeDataByType();
  }
  
  private organizeDataByType(): void {
    // Group suites by building for separate worksheets
    const buildingGroups = new Map<string, any[]>();
    
    for (const item of this.data) {
      const key = item.buildingName || 'Unknown';
      if (!buildingGroups.has(key)) {
        buildingGroups.set(key, []);
      }
      buildingGroups.get(key)!.push(item);
    }
    
    // Store for later worksheet creation
    this.worksheets = buildingGroups;
  }
  
  protected async createContent(): Promise<any> {
    const XLSX = await import('xlsx');
    this.workbook = XLSX.utils.book_new();
    
    // Create summary worksheet
    this.createSummaryWorksheet();
    
    // Create building detail worksheets
    for (const [buildingName, suites] of this.worksheets) {
      this.createBuildingWorksheet(buildingName, suites);
    }
    
    // Create pivot table data worksheet
    if (this.config.includeAnalytics) {
      this.createPivotDataWorksheet();
    }
    
    return this.workbook;
  }
  
  private createSummaryWorksheet(): void {
    const summaryData = this.generateSummaryData();
    const XLSX = require('xlsx');
    
    const ws = XLSX.utils.json_to_sheet(summaryData);
    
    // Apply formatting
    ws['!cols'] = [
      { wch: 30 }, // Metric name column
      { wch: 20 }, // Value column
      { wch: 15 }  // Percentage column
    ];
    
    XLSX.utils.book_append_sheet(this.workbook, ws, 'Portfolio Summary');
  }
  
  private createBuildingWorksheet(buildingName: string, suites: any[]): void {
    const XLSX = require('xlsx');
    
    // Prepare data with calculated fields
    const worksheetData = suites.map(suite => ({
      'Floor': suite.floor,
      'Suite Number': suite.suiteNumber,
      'Square Feet': suite.squareFeet,
      'Status': suite.status,
      'Tenant': suite.tenantName || '',
      'Industry': suite.industryType || '',
      'Lease Expiration': suite.leaseExpiration || '',
      'Asking Rent': suite.askingRent || '',
      'Available Date': suite.availableDate || ''
    }));
    
    const ws = XLSX.utils.json_to_sheet(worksheetData);
    
    // Apply column formatting
    ws['!cols'] = [
      { wch: 8 },   // Floor
      { wch: 15 },  // Suite Number
      { wch: 12 },  // Square Feet
      { wch: 12 },  // Status
      { wch: 25 },  // Tenant
      { wch: 15 },  // Industry
      { wch: 15 },  // Lease Expiration
      { wch: 12 },  // Asking Rent
      { wch: 15 }   // Available Date
    ];
    
    // Add to workbook with truncated name if necessary
    const sheetName = buildingName.length > 31 
      ? buildingName.substring(0, 28) + '...' 
      : buildingName;
    
    XLSX.utils.book_append_sheet(this.workbook, ws, sheetName);
  }
  
  private createPivotDataWorksheet(): void {
    // Create flattened data for pivot table analysis
    const pivotData = this.data.map(item => ({
      'Market': item.marketName,
      'Submarket': item.submarketName,
      'Building': item.buildingName,
      'Class': item.buildingClass,
      'Property Type': item.propertyType,
      'Floor': item.floor,
      'Suite': item.suiteNumber,
      'Square Feet': item.squareFeet,
      'Status': item.status,
      'Tenant': item.tenantName || '',
      'Industry': item.industryType || '',
      'Year': new Date(item.leaseExpiration).getFullYear() || ''
    }));
    
    const XLSX = require('xlsx');
    const ws = XLSX.utils.json_to_sheet(pivotData);
    
    XLSX.utils.book_append_sheet(this.workbook, ws, 'Pivot Data');
  }
  
  private generateSummaryData(): any[] {
    // Calculate portfolio-level metrics
    const totalSF = this.data.reduce((sum, item) => sum + item.squareFeet, 0);
    const availableSF = this.data
      .filter(item => item.status === 'available')
      .reduce((sum, item) => sum + item.squareFeet, 0);
    
    return [
      { Metric: 'Total Portfolio SF', Value: totalSF, Percentage: '100%' },
      { Metric: 'Available SF', Value: availableSF, Percentage: `${((availableSF/totalSF)*100).toFixed(1)}%` },
      { Metric: 'Occupied SF', Value: totalSF - availableSF, Percentage: `${(((totalSF-availableSF)/totalSF)*100).toFixed(1)}%` },
      { Metric: 'Total Suites', Value: this.data.length, Percentage: '' },
      { Metric: 'Available Suites', Value: this.data.filter(item => item.status === 'available').length, Percentage: '' }
    ];
  }
  
  protected async finalize(content: any): Promise<Blob> {
    const XLSX = await import('xlsx');
    
    // Write workbook to buffer
    const wbout = XLSX.write(content, { 
      bookType: 'xlsx', 
      type: 'array',
      compression: true 
    });
    
    // Convert to Blob
    return new Blob([wbout], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
  }
}

// ============================================================================
// Export Factory
// ============================================================================

export class ExportFactory {
  static createExporter(
    format: ExportFormat,
    config: ExportConfiguration,
    data: any[]
  ): ExportGenerator<any> {
    switch (format) {
      case 'pdf':
        return new PDFExportGenerator(config, data);
      case 'excel':
        return new ExcelExportGenerator(config, data);
      // Additional formats (CSV, JSON) would be implemented similarly
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
  
  /**
   * Stream large datasets for memory efficiency
   */
  static async *streamData(
    query: any,
    batchSize: number = 1000
  ): AsyncGenerator<any[]> {
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const batch = await query.limit(batchSize).offset(offset);
      
      if (batch.length === 0) {
        hasMore = false;
      } else {
        yield batch;
        offset += batchSize;
      }
      
      // Prevent memory buildup
      if (global.gc) global.gc();
    }
  }
}