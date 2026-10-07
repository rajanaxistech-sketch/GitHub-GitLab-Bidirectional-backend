# Backend API Service

A scalable, layered architecture backend template built with **Node.js, Express, JavaScript, PostgreSQL, and TypeORM**.

---

## 1. Project Purpose

This project provides a robust, production-ready foundation for web application backends. It emphasizes clean separation of concerns through a layered architecture (Route → Controller → Service → Repository → Entity/Database), centralized error handling, standardized responses, and migration-driven database schemas.

---

## 2. Technology Stack

* **Runtime:** Node.js (JavaScript CommonJS)
* **Framework:** Express.js
* **Database:** PostgreSQL
* **ORM:** TypeORM (`reflect-metadata`, `pg`)
* **Security & Middleware:**
  * `helmet` (Security headers)
  * `cors` (Cross-Origin Resource Sharing)
  * `morgan` (HTTP request logging)
  * `dotenv` (Environment variable management)
* **Authentication Utilities:**
  * `bcryptjs` (Password hashing)
  * `jsonwebtoken` (JWT token generation/verification)
* **Development:** `nodemon`

---

## 3. Folder Structure

```text
backend/
│
├── src/
│   ├── config/
│   │   ├── database.js          # TypeORM DataSource & DB connection manager
│   │   └── env.js               # Environment variables configuration & validation
│   │
│   ├── controllers/
│   │   └── health.controller.js # HTTP request handler for health checks
│   │
│   ├── services/
│   │   └── health.service.js    # Business logic for health checks
│   │
│   ├── repositories/
│   │   └── base.repository.js   # Generic TypeORM BaseRepository
│   │
│   ├── entities/                # TypeORM Entity definitions
│   │   └── .gitkeep
│   │
│   ├── routes/
│   │   ├── index.js             # Main router aggregator (/api/v1)
│   │   └── health.routes.js     # Health check route definitions
│   │
│   ├── middlewares/
│   │   ├── async.middleware.js     # Wrapper to catch async controller errors
│   │   ├── not-found.middleware.js # 404 Route Not Found handler
│   │   └── error.middleware.js     # Centralized global error handler
│   │
│   ├── utils/
│   │   ├── response.js          # Standardized success/error response helpers & Custom Errors
│   │   └── logger.js            # Centralized logger
│   │
│   ├── constants/
│   │   └── index.js             # HTTP status codes & standard error/success messages
│   │
│   ├── app.js                   # Express application setup & middleware configuration
│   └── server.js                # Server entry point & DB lifecycle handling
│
├── postman/
│   └── project-api.postman_collection.json # Ready-to-import Postman collection
│
├── migrations/                  # TypeORM migration files
│   └── .gitkeep
│
├── seeders/                     # Database seeders
│   └── .gitkeep
│
├── tests/                       # Unit & integration tests
│   └── .gitkeep
│
├── .env                         # Local environment variables (gitignored)
├── .env.example                 # Template for environment variables
├── .gitignore                   # Git ignore configuration
├── package.json                 # Project dependencies and npm scripts
└── README.md                    # Project documentation
```

---

## 4. Architecture & Request Flow

The backend follows a strict **Layered Architecture**:

```text
Client Request
      ↓
Route (/api/v1/...)
      ↓
Controller (Extracts params/body, coordinates responses)
      ↓
Service (Contains business logic & domain rules)
      ↓
Repository (Encapsulates TypeORM database queries)
      ↓
TypeORM DataSource / Entity
      ↓
PostgreSQL Database
```

### Layer Responsibilities

* **Routes:** Route definition and middleware binding only. No business logic.
* **Controllers:** Process HTTP requests, extract parameters, call services, and return standardized JSON responses. No direct database queries.
* **Services:** Pure business logic. Coordinate repositories and third-party integrations. Free from Express request/response dependencies.
* **Repositories:** Database access layer. Encapsulate all TypeORM queries and queries builder logic.
* **Entities:** TypeORM schema and relation definitions.

---

## 5. Environment Setup

Copy `.env.example` to create your local `.env`:

```bash
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=your_database_name

# Authentication Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=1d
```

---

## 6. PostgreSQL Setup

Ensure PostgreSQL is running locally or via Docker.

### Local PostgreSQL:
Create the target database in PostgreSQL:
```sql
CREATE DATABASE your_database_name;
```

### Docker (Optional):
```bash
docker run --name postgres-dev -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p 5432:5432 -d postgres:16
```

---

## 7. Installation

Navigate into the `backend/` directory and install dependencies:

```bash
cd backend
npm install
```

---

## 8. Running the Application

### Development Mode (with hot-reload via nodemon):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

---

## 9. Migration Commands

Database schema changes are managed via TypeORM migrations (with `synchronize: false`).

* **Create a blank migration:**
  ```bash
  npm run migration:create -- migrations/CreateUsersTable
  ```

* **Generate a migration from entity diffs:**
  ```bash
  npm run migration:generate -- migrations/InitialSchema
  ```

* **Run pending migrations:**
  ```bash
  npm run migration:run
  ```

* **Revert the last migration:**
  ```bash
  npm run migration:revert
  ```

---

## 10. API Specification & Base URL

* **Base URL:** `http://localhost:5000/api/v1`

### Health Check Endpoint
* **Route:** `GET /api/v1/health`
* **Response:**
  ```json
  {
    "success": true,
    "message": "API is running",
    "data": {
      "environment": "development",
      "status": "UP",
      "timestamp": "2026-10-07T09:51:49.000Z",
      "uptime": "15s",
      "database": "connected"
    }
  }
  ```

### Standard Response Format

**Success Response (HTTP 200/201):**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error Response (HTTP 4xx/5xx):**
```json
{
  "success": false,
  "message": "Error message description",
  "errors": ["Specific error detail"]
}
```

---

## 11. Postman Collection

The ready-to-import Postman collection is located at:

```text
backend/postman/project-api.postman_collection.json
```

### How to Import:
1. Open Postman.
2. Click **Import** in the top-left corner.
3. Select `backend/postman/project-api.postman_collection.json`.
4. The collection includes the environment variable `{{baseUrl}}` preset to `http://localhost:5000`.
