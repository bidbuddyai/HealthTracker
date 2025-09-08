# ScheduleSam - AI-Powered CPM Scheduling Platform

A sophisticated Critical Path Method (CPM) scheduling application comparable to industry standards like MS Project and Primavera P6. ScheduleSam combines advanced project scheduling capabilities with cutting-edge AI-powered schedule generation and optimization.

## 🚀 Key Features

### **AI-Powered Schedule Generation**
- **Intelligent Schedule Creation**: AI analyzes project descriptions and documents to generate comprehensive CPM schedules
- **Multiple AI Models**: Support for GPT-5, GPT-5-Thinking, Claude Sonnet 4, Gemini 2.5 Pro, and more via Poe API
- **Document Analysis**: Upload bid documents, specifications, and drawings for automatic scope extraction
- **Interactive Refinement**: Continuous AI chat for schedule optimization and modifications
- **Preview & Edit**: Quick inline editing of AI-generated schedules before final approval

### **Advanced CPM Scheduling Engine**
- **Complete CPM Calculations**: Forward/backward pass, float calculations, and critical path identification
- **Advanced Activity Types**: Milestones (zero duration), Level of Effort, Hammock activities, and WBS Summary rollups
- **Relationship Management**: Full support for FS, SS, FF, SF relationships with lag/lead times
- **Constraint Handling**: SNET, SNLT, FNET, FNLT, MSO, MFO constraints with violation detection
- **Progress Tracking**: Percent complete, actual dates, and remaining duration updates

### **Work Breakdown Structure (WBS)**
- **Hierarchical Organization**: Complete WBS with parent/child relationships
- **Visual Management**: Indenting/outdenting and hierarchical display
- **Activity Codes & Custom Fields**: Advanced filtering and grouping system
- **Project Organization**: Custom activity codes for comprehensive project categorization

### **Visual Schedule Management**
- **Interactive Gantt Charts**: Enhanced visualization with relationship arrows and critical path highlighting
- **Schedule Grid**: Comprehensive activity grid with filtering, search, and column visibility controls
- **Baseline Management**: Multiple named baselines with variance tracking and color-coded schedule slippage
- **Real-time Updates**: Live collaboration with instant UI updates

### **Collaboration & Audit Trail**
- **Enterprise Authentication**: Replit OpenID Connect with PostgreSQL session management
- **Role-based Access Control**: Owner, Scheduler, Manager, Viewer, and Contributor roles
- **Threaded Comments**: Activity-level discussions and collaboration
- **File Attachments**: Document management via object storage
- **Complete Audit Trail**: Change tracking with timestamps and user attribution
- **Version History**: Schedule versioning with auto-save and restoration capabilities

## 🛠 Tech Stack

### **Frontend Architecture**
- **React 18** with TypeScript for type safety and modern development
- **Tailwind CSS** with custom brand theme and Shadcn/UI component library
- **TanStack Query** for server state management and caching
- **React Hook Form** with Zod validation for form handling
- **Wouter** for lightweight client-side routing
- **Vite** for fast development and optimized builds

### **Backend Architecture**
- **Node.js** with Express.js server using TypeScript
- **PostgreSQL** database with Drizzle ORM for type-safe queries
- **RESTful API** with comprehensive Zod schema validation
- **Enterprise Authentication** via Replit OpenID Connect
- **Object Storage Integration** for file attachments and document management

### **AI Integration**
- **Poe OpenAI-Compatible API** (https://api.poe.com/v1)
- **Multiple Model Support**: GPT-5, GPT-5-Thinking, Claude, Gemini, and more
- **Custom Function Calling**: App-level implementation with structured JSON schemas
- **Streaming Responses** for real-time AI interactions
- **Document Processing**: AI-powered extraction from uploaded project files

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Poe API key ([Get yours here](https://poe.com/api_key))

### Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd schedulesam
   npm install
   ```

2. **Environment Configuration**
   ```env
   POE_API_KEY=your_poe_api_key_here
   DATABASE_URL=postgresql://username:password@localhost:5432/schedulesam
   SESSION_SECRET=your_random_session_secret
   NODE_ENV=development
   PORT=5000
   ```

3. **Database Setup**
   ```bash
   npm run db:push
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Access Application**
   - Open http://localhost:5000
   - Complete Replit Auth setup for user authentication

## 📊 Core Workflows

### **AI Schedule Generation**
1. **Create Project** → Auto-navigate to project page
2. **Open AI Modal** → Access AI assistant 
3. **Generate Schedule** → Describe project or upload documents
4. **Preview & Edit** → Quick inline edits and activity additions
5. **Save to Project** → Commit final schedule with CPM calculations
6. **Continuous Refinement** → Use mini chat for ongoing optimizations

### **Traditional CPM Workflow**
1. **WBS Creation** → Define work breakdown structure
2. **Activity Definition** → Add tasks with durations and constraints
3. **Relationship Building** → Link activities with dependencies
4. **Schedule Calculation** → Run CPM analysis for critical path
5. **Baseline Management** → Save baselines and track progress
6. **Progress Updates** → Update actual dates and percent complete

## 🎯 Advanced Features

### **Activity Types**
- **Tasks**: Standard work activities with duration
- **Milestones**: Zero-duration project markers
- **Level of Effort**: Ongoing activities spanning other work
- **Hammock Activities**: Summary activities spanning multiple tasks
- **WBS Summary**: Automatically calculated parent rollups

### **Relationship Types**
- **Finish-to-Start (FS)**: Traditional sequence dependencies
- **Start-to-Start (SS)**: Parallel work coordination
- **Finish-to-Finish (FF)**: Coordinated completion
- **Start-to-Finish (SF)**: Just-in-time sequencing
- **Lag/Lead Times**: Positive or negative time offsets

### **Constraint Management**
- **Start No Earlier Than (SNET)**
- **Start No Later Than (SNLT)**
- **Finish No Earlier Than (FNET)**
- **Finish No Later Than (FNLT)**
- **Must Start On (MSO)**
- **Must Finish On (MFO)**

## 🔧 API Reference

### **Projects**
```http
GET    /api/projects                    # List all projects
POST   /api/projects                    # Create project
GET    /api/projects/:id                # Get project details
PUT    /api/projects/:id                # Update project
DELETE /api/projects/:id                # Delete project
```

### **Activities & Scheduling**
```http
GET    /api/projects/:id/activities     # Get project activities
POST   /api/projects/:id/activities     # Create activity
PUT    /api/activities/:id              # Update activity
DELETE /api/activities/:id              # Delete activity
GET    /api/projects/:id/relationships  # Get activity relationships
POST   /api/projects/:id/calculate-cpm  # Run CPM calculations
```

### **AI Integration**
```http
POST   /api/ai/generate-schedule        # AI schedule generation
POST   /api/ai/chat                     # Interactive AI chat
POST   /api/ai/analyze-documents        # Document analysis
GET    /api/ai/models                   # Available AI models
```

### **Collaboration**
```http
GET    /api/activities/:id/comments     # Get activity comments
POST   /api/activities/:id/comments     # Add comment
GET    /api/projects/:id/members        # Get project members
POST   /api/projects/:id/members        # Add member
```

## 📈 Data Management

### **Database Schema**
- **Projects**: Project metadata and settings
- **Activities**: CPM activities with all scheduling data
- **Relationships**: Activity dependencies and constraints
- **WBS**: Work breakdown structure hierarchy
- **Baselines**: Snapshot schedules for variance analysis
- **Comments**: Collaboration and communication threads
- **Audit Logs**: Complete change tracking and version history

### **File Storage**
- **Object Storage Integration**: Secure file uploads and management
- **Document Processing**: AI analysis of uploaded project documents
- **Version Control**: File versioning and access control
- **Public/Private Assets**: Granular permission management

## 🔐 Security & Authentication

### **Enterprise Authentication**
- **Replit OpenID Connect**: Seamless single sign-on integration
- **PostgreSQL Sessions**: Secure session management and storage
- **Automatic Token Refresh**: Transparent authentication handling
- **User Profile Management**: Complete user information and preferences

### **Access Control**
- **Role-based Permissions**: Fine-grained access control system
- **Project-level Security**: Per-project member management
- **API Authentication**: Secure endpoint protection
- **Session Security**: Encrypted session storage and handling

## 🚀 Deployment

ScheduleSam is designed for seamless deployment on Replit with:
- **Automatic Database Provisioning**: PostgreSQL setup included
- **Environment Management**: Secure secrets handling
- **Scalable Architecture**: Ready for production workloads
- **Domain Integration**: Custom domain support available

## 🤝 Contributing

This project follows modern development practices:
- **TypeScript**: Full type safety across frontend and backend
- **Code Quality**: ESLint and Prettier for consistent code style
- **Database Migrations**: Safe schema evolution with Drizzle Kit
- **Testing**: Comprehensive test coverage (planned)

---

**Built with ❤️ for construction professionals who demand enterprise-grade project scheduling with the power of AI.**