# SuiteStack System Architecture

## Overview
SuiteStack is a three-tier enterprise application designed for commercial real estate intelligence, built with modern web technologies and optimized for institutional-grade performance and security.

## System Components

### Frontend Layer
**Technology Stack:** React 18, TypeScript, Vite, TanStack Query

The presentation layer implements a component-based architecture with sophisticated state management and real-time data synchronization. Key architectural decisions include:

- Single Page Application (SPA) with client-side routing via Wouter
- Component composition using Radix UI primitives wrapped with Shadcn/ui
- Optimistic UI updates with TanStack Query for cache management
- TypeScript for end-to-end type safety
- Responsive design system built on Tailwind CSS v4

### API Layer
**Technology Stack:** Node.js, Express, TypeScript, Passport.js

The application server provides RESTful endpoints with comprehensive middleware architecture:

- Session-based authentication with PostgreSQL persistence via connect-pg-simple
- Role-Based Access Control (RBAC) with granular permissions
- Request validation using Zod schemas
- Multi-layered authorization: System → Region → Property Type → Building
- Structured error handling with consistent response formats

### Data Layer
**Technology Stack:** PostgreSQL 16, Drizzle ORM, Neon Serverless

The persistence layer manages complex relational data with optimized query patterns:

- 20+ interconnected tables with foreign key constraints
- Strategic indexing on high-frequency query paths
- Materialized aggregations updated via scheduled batch processing
- Transaction isolation for data consistency
- Connection pooling for concurrent access

## Architectural Patterns

### Microservice-Inspired AI Enrichment
Independent processing queues for discrete enrichment tasks:
- Industry classification pipeline
- Company size determination
- Return-to-office policy extraction
- Corporate URL discovery

Each queue operates autonomously with dedicated rate limiting and error recovery mechanisms.

### Performance Optimization Strategy

**Query Optimization**
- Pre-computed aggregations refreshed nightly at 2 AM ET
- Strategic JOIN reduction through denormalization where appropriate
- PostgreSQL query planning optimization
- Index coverage for common filter combinations

**Caching Architecture**
- React Query cache for frontend state
- Session-based caching for user permissions
- Database connection pooling
- Static asset CDN distribution

**Real-Time Updates**
- Optimistic mutations with rollback capabilities
- Granular cache invalidation by entity type
- Differential updates for large datasets

### Security Architecture

**Authentication & Authorization**
- PBKDF2 password hashing with salt
- Session tokens with httpOnly cookies
- PostgreSQL-backed session storage
- Automatic session expiration

**Data Access Control**
- Row-level security via application logic
- Multi-dimensional permission matrix
- Building-specific access grants
- Universal access flags for administrators

**Public Sharing Mechanism**
- SHA-256 hash generation for public URLs
- Cryptographically secure random token generation
- Time-bound access capabilities
- No authentication required for shared content

## Deployment Architecture

### Development Environment
- Replit-hosted development with hot module replacement
- PostgreSQL via Neon serverless connection
- Environment variable management via .env

### Production Environment
- Autoscale deployment via Replit hosting
- PostgreSQL production database
- SSL/TLS encryption for all connections
- Automated backup and recovery procedures

## Data Flow Architecture

### Request Lifecycle
1. Client initiates request with session cookie
2. Express middleware validates session
3. Permission middleware checks access rights
4. Business logic processes request
5. Drizzle ORM translates to SQL
6. PostgreSQL executes query
7. Response formatted and returned
8. React Query updates cache

### Batch Processing Pipeline
1. Cron scheduler triggers at 2 AM ET
2. Aggregation queries compute metrics
3. Results persisted to aggregation tables
4. Cache invalidation triggered
5. Next-day queries use pre-computed values

## Scalability Considerations

### Horizontal Scaling Capabilities
- Stateless API design enables multi-instance deployment
- Session storage in PostgreSQL supports load balancing
- Database connection pooling prevents resource exhaustion

### Vertical Scaling Optimization
- Efficient query patterns reduce memory footprint
- Lazy loading for large datasets
- Pagination for unbounded result sets
- Streaming for export generation

## Monitoring and Observability

### Application Metrics
- Request/response timing
- Database query performance
- Cache hit ratios
- Error rates by endpoint

### Business Metrics
- Active user sessions
- Data modification frequency
- Export generation patterns
- AI enrichment queue depth

## Technology Decisions Rationale

### PostgreSQL Selection
- ACID compliance for financial data integrity
- Complex query support for analytical operations
- Mature ecosystem with proven scalability
- Native JSON support for flexible schemas

### TypeScript Adoption
- Type safety across full stack
- Enhanced IDE support and refactoring capabilities
- Self-documenting code interfaces
- Reduced runtime errors

### React + TanStack Query
- Declarative UI with predictable state updates
- Sophisticated cache management
- Optimistic updates for responsive UX
- Background refetching for data freshness