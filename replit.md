# Overview

ScheduleSam is a sophisticated CPM (Critical Path Method) scheduling application comparable to industry standards like MS Project and Primavera P6. The system provides comprehensive project scheduling capabilities including advanced activity types, WBS hierarchy management, activity codes, custom fields, and AI-powered scheduling assistance. Now featuring enterprise-grade authentication via Replit Auth with full user management, session handling, and secure multi-user access control. The AI assistant can now manage work calendars, WBS structures, and Time Impact Analysis through natural language commands.

# User Preferences

Preferred communication style: Simple, everyday language.

## Authentication & Security
- **Replit Auth Integration**: Enterprise-grade OpenID Connect authentication with seamless single sign-on
- **Session Management**: PostgreSQL-backed session storage with automatic refresh token handling
- **User Profile Management**: Complete user profiles with avatars, names, and email addresses
- **Secure Route Protection**: All API endpoints and application routes protected with authentication middleware
- **Graceful Authentication Flow**: Automatic redirection to login for unauthenticated users with session preservation

## Advanced Scheduling Features
- **Complete CPM Engine**: Full Critical Path Method calculations with forward/backward pass, float calculations, and constraint handling
- **Advanced Activity Types**: Support for Milestones (zero duration), Level of Effort activities, Hammock activities (spanning), and WBS Summary rollups
- **WBS Hierarchy Management**: Complete Work Breakdown Structure with parent/child relationships, indenting/outdenting, and hierarchical display
- **Activity Codes & Custom Fields**: Comprehensive filtering and grouping system with custom activity codes and fields for advanced project organization
- **Relationship Management**: Full support for FS, SS, FF, SF relationships with lag/lead times and constraint enforcement
- **Visual Schedule Grid**: Enhanced activity grid with hierarchical WBS display, comprehensive filtering, search, and column visibility controls
- **Constraint Handling**: Advanced constraint types (SNET, SNLT, FNET, FNLT, MSO, MFO) with violation detection and reporting
- **Progress Tracking**: Comprehensive progress management with percent complete, actual dates, and remaining duration updates
- **Baseline Management**: Multiple named baselines with snapshot capture, variance tracking, and color-coded schedule slippage visualization
- **Time Impact Analysis (TIA)**: Enterprise-grade TIA system with delay modeling, fragnet insertion, what-if scenarios, schedule compression analysis, and recovery planning
- **Work Calendars**: Complete calendar management system with workweek patterns, shifts, exceptions, and assignments to activities and resources
- **Collaboration Tools**: Threaded comments on activities, file attachments via object storage, role-based access control (Owner, Scheduler, Manager, Viewer, Contributor)
- **Audit Trail System**: Complete change tracking with timestamps, user attribution, and detailed change logs for all schedule modifications
- **Version History**: Schedule versioning with auto-save capabilities, complete snapshot storage, and version restoration functionality

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development patterns
- **Styling**: Tailwind CSS with MeetBud brand colors (orange and blue theme), using Shadcn/UI component library for consistent design system
- **State Management**: TanStack Query for server state management and caching, React Hook Form with Zod validation for form handling
- **Routing**: Wouter for lightweight client-side routing
- **Build Tool**: Vite for fast development and optimized production builds

## Backend Architecture
- **Runtime**: Node.js with Express.js server using TypeScript
- **Data Storage**: In-memory storage (MemStorage) for development with PostgreSQL-ready infrastructure
- **API Design**: RESTful API with Zod schema validation for request/response handling
- **Authentication**: Replit OpenID Connect authentication with PostgreSQL session storage and JWT token management
- **Security**: All routes protected with authentication middleware, automatic token refresh, and secure cookie handling

## Database Design
- **Schema**: Comprehensive Drizzle ORM schema with PostgreSQL including:
  - **Authentication Tables**: Users and sessions for Replit Auth (mandatory tables)
  - **Project Management**: Projects, activities, WBS, calendars, relationships
  - **Time Impact Analysis**: TIA scenarios, fragnets, delays, and analysis results
  - **Collaboration**: Comments, attachments, audit logs, project members
  - **Scheduling**: Baselines, resource assignments, schedule versions
- **Migration Strategy**: Drizzle Kit for database migrations with `npm run db:push`
- **Current State**: PostgreSQL database active with authentication tables deployed

## AI Integration Architecture
- **LLM Provider**: Poe's OpenAI-compatible API endpoint (https://api.poe.com/v1)
- **Function Calling**: Comprehensive app-level implementation with 40+ scheduling tools
- **Assistant Tools**: Full scheduler operations including:
  - **Calendar Management**: createCalendar, updateCalendar, deleteCalendar, addCalendarException, assignCalendar, createShift
  - **WBS Operations**: createWbs, updateWbs, deleteWbs, moveWbs, assignActivityToWbs, calculateWbsRollups, exportWbs
  - **TIA Analysis**: createTiaScenario, addTiaFragnet, addTiaDelay, runTiaAnalysis, getTiaResult, compareTiaScenarios, generateTiaReport
  - **Activity Management**: createActivity, updateActivity, linkActivities, assignResources, updateProgress
  - **Meeting Operations**: insertActionItems, createRFI, updateAgendaDiscussion, distributeMinutes, summarizeMeeting
- **Model Support**: Multiple models including gemini-2.5-pro, Claude-Sonnet-4, Grok-4, Llama-3.1-405B
- **Streaming**: OpenAI-compatible streaming responses for real-time interactions
- **Natural Language Processing**: AI can understand and execute complex scheduling commands like "Create a 5-day work calendar with US holidays" or "Analyze 10-day delay impact on concrete pour"

## RAG (Retrieval-Augmented Generation) Architecture
- **Vector Database**: PostgreSQL with pgvector extension for semantic search
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions) for vectorizing schedule data
- **Chunking Strategy**: Intelligent chunking of schedule data into logical units:
  - Activity Clusters: Groups of 10-12 related activities with relationships
  - WBS Sections: Work breakdown structure nodes with summaries
  - Critical Path Segments: Critical path activities in sequence
  - Calendar Blocks: Calendar definitions with exceptions
  - TIA Scenarios: Time impact analysis summaries
- **Retrieval Flow**: On AI queries, semantic search retrieves top 5 most relevant chunks
- **Context Enrichment**: Retrieved chunks are summarized by Poe before being included in AI prompts
- **Token Savings**: Estimated 40-60% reduction in tokens per AI conversation
- **API Endpoints**:
  - GET /api/projects/:projectId/rag/status - Check embedding status
  - POST /api/projects/:projectId/rag/generate - Trigger embedding generation
- **Environment Variables**: Requires OPENAI_API_KEY secret for embeddings

## Time Impact Analysis Architecture
- **TIA Calculation Engine**: Advanced schedule impact calculator with fragnet insertion, delay modeling, and float consumption analysis
- **Scenario Management**: Support for multiple TIA scenario types (delay analysis, acceleration, what-if, recovery planning)
- **Impact Types**: EOT claims, disruption analysis, change order impacts, weather delays
- **Analysis Features**: Critical path changes, float erosion tracking, milestone impact assessment, schedule compression opportunities
- **Recovery Planning**: Pace analysis, fast-tracking opportunities, crashing options, shift work recommendations

## Meeting Workflow Architecture
- **Sequential Meetings**: Automatic meeting numbering and carry-forward logic for action items
- **6-Topic Construction Agenda**: Standardized agenda structure tailored for construction projects:
  1. Welcome & Introductions
  2. Site Safety
  3. Project Schedule
  4. Ongoing Project Details
  5. Open Discussion
  6. Action Items & Next Steps
- **Status Tracking**: Comprehensive status management for action items, safety incidents, and project milestones
- **Export System**: JSON export capability with planned DOCX/PDF support

## Data Flow Patterns
- **Client-Server**: Standard REST API communication with JSON payloads
- **Real-time Features**: Foundation for live collaboration (WebSocket integration planned)
- **Validation**: Dual validation with Zod schemas on both client and server
- **Caching**: TanStack Query provides client-side caching and background updates

# External Dependencies

## Core Infrastructure
- **Poe API**: Primary LLM service requiring POE_API_KEY environment variable
- **PostgreSQL**: Target database (currently using Neon serverless for deployment)
- **Google Cloud Storage**: File storage integration for meeting attachments and audio files

## Development & Build Tools
- **Vite**: Frontend build tool and development server
- **Replit**: Development environment with specific plugins for error handling and cartographer
- **Uppy**: File upload components for handling meeting attachments

## UI & Styling
- **Radix UI**: Headless component primitives for accessibility
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide Icons**: Icon library for consistent UI elements

## Form & Validation
- **React Hook Form**: Form state management and validation
- **Zod**: Schema validation library used across client and server

## Data Management
- **TanStack Query**: Server state management and caching
- **Drizzle ORM**: Type-safe database toolkit and query builder
- **Drizzle Kit**: Database migration and introspection tools

## Authentication & Security
- **Environment Variables**: POE_API_KEY and DATABASE_URL management
- **CORS Configuration**: Express.js CORS setup for API security

## File Processing
- **Uppy Ecosystem**: File upload handling with AWS S3 integration, drag-drop interface, and progress tracking
- **Object Storage Integration**: Direct file uploads to Replit object storage with presigned URLs
- **Schedule File Processing**: AI-powered extraction of activities from CPM schedules and lookaheads
- **Meeting File Analysis**: Automatic extraction of action items from uploaded meeting documents