/**
 * PermissionMiddleware.ts
 * 
 * Enterprise-grade Role-Based Access Control (RBAC) middleware for commercial real estate data.
 * Implements multi-dimensional permission checking across regions, property types, and buildings.
 * 
 * Technical Features:
 * - Four-tier role hierarchy (Admin, Researcher, Broker, Viewer)
 * - Building-level granular permissions
 * - Universal access flags for executive users
 * - Performance-optimized permission caching
 * - Comprehensive audit logging
 * 
 * Note: Database queries and caching logic simplified for demonstration.
 */

import { Request, Response, NextFunction } from 'express';
import type { User, UserRole, Region, PropertyType } from '../types';

// ============================================================================
// Permission Types and Interfaces
// ============================================================================

interface SessionUser extends User {
  id: string;
  email: string;
  role: UserRole;
  regions: Region[];
  propertyTypes: PropertyType[];
  assignedBuildings: string[];
  universalAccess: boolean;
  lastActivity: Date;
}

interface PermissionContext {
  user: SessionUser;
  resource: ResourceType;
  action: ActionType;
  resourceId?: string;
  metadata?: Record<string, any>;
}

enum ResourceType {
  BUILDING = 'building',
  SUITE = 'suite',
  TENANT = 'tenant',
  MARKET = 'market',
  ANALYTICS = 'analytics',
  EXPORT = 'export',
  ADMIN = 'admin'
}

enum ActionType {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  EXPORT = 'export',
  SHARE = 'share'
}

interface PermissionRule {
  role: UserRole;
  resource: ResourceType;
  actions: ActionType[];
  condition?: (context: PermissionContext) => boolean;
}

// ============================================================================
// Permission Rules Configuration
// ============================================================================

const PERMISSION_RULES: PermissionRule[] = [
  // Admin - Universal access
  {
    role: 'admin',
    resource: ResourceType.BUILDING,
    actions: [ActionType.READ, ActionType.CREATE, ActionType.UPDATE, ActionType.DELETE, ActionType.EXPORT, ActionType.SHARE]
  },
  {
    role: 'admin',
    resource: ResourceType.TENANT,
    actions: [ActionType.READ, ActionType.CREATE, ActionType.UPDATE, ActionType.DELETE]
  },
  {
    role: 'admin',
    resource: ResourceType.ADMIN,
    actions: [ActionType.READ, ActionType.CREATE, ActionType.UPDATE, ActionType.DELETE]
  },
  
  // Researcher - Data modification with restrictions
  {
    role: 'researcher',
    resource: ResourceType.BUILDING,
    actions: [ActionType.READ, ActionType.UPDATE, ActionType.EXPORT],
    condition: (ctx) => hasRegionAccess(ctx) && hasPropertyTypeAccess(ctx)
  },
  {
    role: 'researcher',
    resource: ResourceType.SUITE,
    actions: [ActionType.READ, ActionType.CREATE, ActionType.UPDATE],
    condition: (ctx) => hasBuildingAccess(ctx)
  },
  {
    role: 'researcher',
    resource: ResourceType.TENANT,
    actions: [ActionType.READ, ActionType.CREATE, ActionType.UPDATE]
  },
  
  // Broker - Read and limited export
  {
    role: 'broker',
    resource: ResourceType.BUILDING,
    actions: [ActionType.READ, ActionType.EXPORT],
    condition: (ctx) => hasBuildingAccess(ctx)
  },
  {
    role: 'broker',
    resource: ResourceType.SUITE,
    actions: [ActionType.READ],
    condition: (ctx) => hasBuildingAccess(ctx)
  },
  {
    role: 'broker',
    resource: ResourceType.TENANT,
    actions: [ActionType.READ]
  },
  
  // Viewer - Read only
  {
    role: 'viewer',
    resource: ResourceType.BUILDING,
    actions: [ActionType.READ],
    condition: (ctx) => hasBuildingAccess(ctx)
  },
  {
    role: 'viewer',
    resource: ResourceType.SUITE,
    actions: [ActionType.READ],
    condition: (ctx) => hasBuildingAccess(ctx)
  }
];

// ============================================================================
// Permission Checking Functions
// ============================================================================

/**
 * Check if user has access to a specific region or universal access
 */
function hasRegionAccess(context: PermissionContext): boolean {
  const { user, metadata } = context;
  
  // Universal access bypass
  if (user.universalAccess || user.regions.includes('all_regions' as Region)) {
    return true;
  }
  
  if (!metadata?.regionId) return false;
  
  return user.regions.includes(metadata.regionId);
}

/**
 * Check if user has access to a specific property type or universal access
 */
function hasPropertyTypeAccess(context: PermissionContext): boolean {
  const { user, metadata } = context;
  
  // Universal access bypass
  if (user.universalAccess || user.propertyTypes.includes('all_types' as PropertyType)) {
    return true;
  }
  
  if (!metadata?.propertyType) return false;
  
  return user.propertyTypes.includes(metadata.propertyType);
}

/**
 * Check if user has access to a specific building
 */
function hasBuildingAccess(context: PermissionContext): boolean {
  const { user, resourceId } = context;
  
  // Admins always have access
  if (user.role === 'admin' || user.universalAccess) {
    return true;
  }
  
  // Check both region/property type AND building assignment
  if (!hasRegionAccess(context) || !hasPropertyTypeAccess(context)) {
    return false;
  }
  
  // Check specific building assignment
  if (resourceId && user.assignedBuildings.length > 0) {
    return user.assignedBuildings.includes(resourceId);
  }
  
  return true; // If no specific building, allow based on region/property type
}

/**
 * Main permission checking function
 */
function checkPermission(context: PermissionContext): boolean {
  const { user, resource, action } = context;
  
  // Find applicable rules for user's role and resource
  const applicableRules = PERMISSION_RULES.filter(
    rule => rule.role === user.role && rule.resource === resource
  );
  
  // Check if any rule allows the action
  for (const rule of applicableRules) {
    if (!rule.actions.includes(action)) continue;
    
    // If rule has condition, evaluate it
    if (rule.condition) {
      if (rule.condition(context)) return true;
    } else {
      return true; // No condition means allowed
    }
  }
  
  return false;
}

// ============================================================================
// Middleware Factory Functions
// ============================================================================

/**
 * Create middleware for checking permissions on a resource
 */
export function requirePermission(
  resource: ResourceType,
  action: ActionType
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get user from session
      const user = (req as any).user as SessionUser;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Extract resource ID from various possible locations
      const resourceId = req.params.id || req.params.buildingId || req.body?.buildingId;
      
      // Get metadata for context (would typically query database)
      const metadata = await getResourceMetadata(resource, resourceId);
      
      // Create permission context
      const context: PermissionContext = {
        user,
        resource,
        action,
        resourceId,
        metadata
      };
      
      // Check permission
      if (!checkPermission(context)) {
        // Log failed permission attempt
        await logPermissionDenied(context);
        
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: `${action} permission on ${resource}`,
          userRole: user.role
        });
      }
      
      // Permission granted, continue
      next();
    } catch (error) {
      console.error('Permission check failed:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Create middleware for filtering query results based on permissions
 */
export function filterByPermission(
  resource: ResourceType
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user as SessionUser;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Build filter conditions based on user permissions
      const filters = buildPermissionFilters(user, resource);
      
      // Attach filters to request for use in route handler
      (req as any).permissionFilters = filters;
      
      next();
    } catch (error) {
      console.error('Permission filtering failed:', error);
      res.status(500).json({ error: 'Permission filtering failed' });
    }
  };
}

/**
 * Build SQL/ORM filter conditions based on user permissions
 */
function buildPermissionFilters(user: SessionUser, resource: ResourceType): any {
  const filters: any = {};
  
  // Admins see everything
  if (user.role === 'admin' || user.universalAccess) {
    return filters;
  }
  
  // Universal region access
  if (!user.regions.includes('all_regions' as Region)) {
    filters.regionId = { in: user.regions };
  }
  
  // Universal property type access
  if (!user.propertyTypes.includes('all_types' as PropertyType)) {
    filters.propertyType = { in: user.propertyTypes };
  }
  
  // Building-specific access
  if (user.assignedBuildings.length > 0 && resource === ResourceType.BUILDING) {
    filters.id = { in: user.assignedBuildings };
  }
  
  return filters;
}

// ============================================================================
// Caching Layer for Performance
// ============================================================================

class PermissionCache {
  private cache: Map<string, { result: boolean; timestamp: number }> = new Map();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes
  
  getCacheKey(context: PermissionContext): string {
    return `${context.user.id}:${context.resource}:${context.action}:${context.resourceId || ''}`;
  }
  
  get(context: PermissionContext): boolean | null {
    const key = this.getCacheKey(context);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.result;
  }
  
  set(context: PermissionContext, result: boolean): void {
    const key = this.getCacheKey(context);
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }
  
  invalidateUser(userId: string): void {
    // Remove all cache entries for a user
    for (const [key] of this.cache) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
}

const permissionCache = new PermissionCache();

/**
 * Enhanced permission check with caching
 */
export function checkPermissionWithCache(context: PermissionContext): boolean {
  // Check cache first
  const cached = permissionCache.get(context);
  if (cached !== null) return cached;
  
  // Perform actual permission check
  const result = checkPermission(context);
  
  // Cache the result
  permissionCache.set(context, result);
  
  return result;
}

// ============================================================================
// Audit Logging
// ============================================================================

interface AuditLog {
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  granted: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
}

async function logPermissionDenied(context: PermissionContext): Promise<void> {
  const log: AuditLog = {
    userId: context.user.id,
    userEmail: context.user.email,
    action: context.action,
    resource: context.resource,
    resourceId: context.resourceId,
    granted: false,
    timestamp: new Date(),
    metadata: context.metadata
  };
  
  // In production, this would write to database or logging service
  console.warn('Permission denied:', log);
  
  // Could also trigger alerts for suspicious activity
  if (await isSupiciousActivity(context)) {
    await alertSecurityTeam(context);
  }
}

async function isSupiciousActivity(context: PermissionContext): Promise<boolean> {
  // Check for patterns indicating potential security issues
  // - Multiple failed attempts in short time
  // - Attempts to access admin resources by non-admins
  // - Access attempts outside normal hours
  // - Unusual geographic location
  
  return context.resource === ResourceType.ADMIN && context.user.role !== 'admin';
}

async function alertSecurityTeam(context: PermissionContext): Promise<void> {
  // Send alert to security team
  console.error('SECURITY ALERT: Suspicious activity detected', context);
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getResourceMetadata(
  resource: ResourceType,
  resourceId?: string
): Promise<Record<string, any>> {
  // In production, this would query the database
  // Simplified for demonstration
  
  if (resource === ResourceType.BUILDING && resourceId) {
    // Would query: SELECT region_id, property_type FROM buildings WHERE id = resourceId
    return {
      regionId: 'south_florida',
      propertyType: 'office'
    };
  }
  
  return {};
}

// ============================================================================
// Session Management Integration
// ============================================================================

/**
 * Load user permissions from database and attach to session
 */
export async function loadUserPermissions(
  userId: string
): Promise<SessionUser | null> {
  // Would query database for user details and permissions
  // Simplified for demonstration
  
  const userData = {
    id: userId,
    email: 'user@example.com',
    role: 'broker' as UserRole,
    regions: ['south_florida', 'central_florida'] as Region[],
    propertyTypes: ['office'] as PropertyType[],
    assignedBuildings: ['building_123', 'building_456'],
    universalAccess: false,
    lastActivity: new Date()
  };
  
  return userData;
}

/**
 * Middleware to ensure user permissions are loaded
 */
export async function ensurePermissionsLoaded(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const session = (req as any).session;
  
  if (!session?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Load permissions if not in session or expired
  if (!session.permissions || isPermissionsExpired(session.permissions)) {
    const permissions = await loadUserPermissions(session.userId);
    
    if (!permissions) {
      return res.status(401).json({ error: 'Invalid user session' });
    }
    
    session.permissions = permissions;
  }
  
  // Attach to request for easy access
  (req as any).user = session.permissions;
  
  next();
}

function isPermissionsExpired(permissions: SessionUser): boolean {
  const EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes
  return Date.now() - permissions.lastActivity.getTime() > EXPIRY_TIME;
}