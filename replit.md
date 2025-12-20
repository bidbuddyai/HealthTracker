# Overview

ScheduleSam is a CPM (Critical Path Method) scheduling application offering comprehensive project scheduling capabilities. It includes advanced activity types, WBS hierarchy management, activity codes, custom fields, and AI-powered assistance. The system features enterprise-grade authentication via Replit Auth with full user management and secure multi-user access. Its AI assistant can manage work calendars, WBS structures, and perform Time Impact Analysis through natural language commands, aiming to be a direct competitor to industry leaders like MS Project and Primavera P6.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Styling**: Tailwind CSS with MeetBud brand colors (orange and blue theme), utilizing Shadcn/UI for consistent design.
- **State Management**: TanStack Query for server state and caching, React Hook Form with Zod for form handling.
- **Routing**: Wouter for lightweight client-side routing.
- **Build Tool**: Vite.

## Backend Architecture
- **Runtime**: Node.js with Express.js server using TypeScript.
- **Data Storage**: In-memory storage for development, PostgreSQL-ready infrastructure.
- **API Design**: RESTful API with Zod schema validation.
- **Authentication**: Replit OpenID Connect with PostgreSQL session storage and JWT.
- **Security**: All routes protected with authentication middleware.

## Database Design
- **Schema**: Drizzle ORM for PostgreSQL, including authentication, project management (projects, activities, WBS, calendars), TIA, collaboration, and scheduling tables.
- **Migration Strategy**: Drizzle Kit for database migrations.

## AI Integration Architecture
- **LLM Provider**: Poe's OpenAI-compatible API endpoint.
- **Function Calling**: Over 40 scheduling tools implemented, covering calendar management, WBS operations, TIA analysis, and activity management.
- **Model Support**: Multiple models including gemini-2.5-pro, Claude-Sonnet-4, Grok-4, Llama-3.1-405B.
- **Streaming**: OpenAI-compatible streaming responses.
- **Natural Language Processing**: AI understands complex scheduling commands.

## RAG (Retrieval-Augmented Generation) Architecture
- **Vector Database**: PostgreSQL with pgvector extension.
- **Embeddings**: OpenAI text-embedding-3-small for vectorizing schedule data.
- **Chunking Strategy**: Intelligent chunking of schedule data (activity clusters, WBS sections, critical path segments, calendar blocks, TIA scenarios).
- **Retrieval Flow**: Semantic search retrieves top 5 relevant chunks for AI context.
- **Context Enrichment**: Retrieved chunks are summarized by Poe before AI prompts.

## Time Impact Analysis Architecture
- **TIA Calculation Engine**: Advanced engine for fragnet insertion, delay modeling, and float consumption.
- **Scenario Management**: Supports multiple TIA scenario types (delay analysis, acceleration, what-if, recovery planning).
- **Analysis Features**: Tracks critical path changes, float erosion, and milestone impact.

## Meeting Workflow Architecture
- **Sequential Meetings**: Automatic numbering and carry-forward logic for action items.
- **6-Topic Construction Agenda**: Standardized agenda structure.
- **Status Tracking**: Comprehensive status management for action items and project milestones.

## System Features
- **Authentication & Security**: Enterprise-grade OpenID Connect via Replit Auth, PostgreSQL-backed session management, user profiles, secure route protection.
- **Adaptive Learning & Onboarding**: Trade selection onboarding, "Brain Load System" for industry-specific scheduling logic, "Pattern Observer" for self-learning activity sequences and user preferences, "Vocabulary Learning" for custom terminology, "Import Style Analysis" that extracts scheduling style (WBS depth, constraint usage, lag preferences, relationship types) from imported files.
- **Interview Mode**: Consultative generation through a state machine flow (SCOPE_GATHERING → SEQUENCE_VERIFICATION → GENERATION) with trade-aware questions and conditional logic.
- **Direct Mode & Training Commands**: Context injection using a "Trade Knowledge Graph," constraint enforcement, and a `/train` command for explicit natural language instruction to create high-confidence user preference rules.
- **Advanced Scheduling Features**: Complete CPM engine, support for Milestones, Level of Effort, Hammock, and WBS Summary activities, comprehensive WBS management, activity codes, custom fields, FS, SS, FF, SF relationships with lag/lead, visual schedule grid, constraint handling, progress tracking, baseline management, Time Impact Analysis (TIA), work calendars, collaboration tools (comments, attachments, role-based access), audit trail, and version history.

# External Dependencies

## Core Infrastructure
- **Poe API**: Primary LLM service (requires POE_API_KEY).
- **PostgreSQL**: Target database, currently using Neon serverless.
- **Google Cloud Storage**: File storage for attachments.

## Development & Build Tools
- **Vite**: Frontend build tool.
- **Replit**: Development environment.

## UI & Styling
- **Radix UI**: Headless component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide Icons**: Icon library.

## Form & Validation
- **React Hook Form**: Form state management.
- **Zod**: Schema validation.

## Data Management
- **TanStack Query**: Server state management.
- **Drizzle ORM**: Type-safe database toolkit.

## File Processing
- **Uppy Ecosystem**: File upload handling, including direct uploads to Replit object storage.
- **Object Storage Integration**: Presigned URLs for file uploads.