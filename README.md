# TaskmasterPro – Full-Stack Portfolio Project

## Table of Contents

- [Motivation](#motivation)
- [Overview](#overview)
- [Demo Videos](#demo-videos)
- [Backend (TaskmasterPro API)](#backend-taskmasterpro-api)
  - [Getting Started – Backend](#getting-started--backend)
  - [Admin Functionality](#admin-functionality)
- [Frontend (TaskmasterPro UI)](#frontend-taskmasterpro-ui)
- [Additional Notes](#additional-notes)
- [License](#license)

## Motivation

Built as a portfolio project to demonstrate mastery of modern full-stack engineering: a production-grade .NET 9 Web API (Onion/CQRS patterns) paired with an Angular 20 front end. The goals are pragmatic — show real-world authentication/authorization, deployability, and maintainable architecture — while keeping sensitive admin access restricted and auditable for security.

## Overview
TaskmasterPro is a modern task and scheduling management application, featuring a rich Angular front end and a robust .NET 9.0 Web API backend. The API is built with ASP.NET Core 9 and follows a clean, Onion (DDD-inspired) architecture: the Domain layer defines entities (Orders, Schedules, etc.); the Application layer implements CQRS with MediatR, FluentValidation, and AutoMapper for clean separation of concerns; and the Infrastructure layer handles persistence and external integrations. The front end is an Angular 20 app using Angular Material for a polished UI, complete with responsive design, charts, and secure authentication.

## Demo Videos

To illustrate the main features, two short demo videos are provided:

- 🎥 **User Demo (Core Functionality):** [Watch on YouTube](https://youtu.be/PVK60qk6a6U)
  - Shows registration, login, dashboard, orders, and schedules.

- 🎥 **Admin Demo (Advanced Features):** [Watch on YouTube](https://youtu.be/NOU8oSUIJV8)
  - Shows admin login, user management, role editing, and order/schedule control.

> Full live admin access is disabled for security. The admin demo illustrates all restricted features.

---

## Backend (TaskmasterPro API)

**Framework:** The backend runs on .NET 9.0 [1] (ASP.NET Core Web API), exposing RESTful endpoints for managing orders, schedules, and user accounts. All data access is code-first with Entity Framework Core (EF Core 9) and SQL Server. The database schema is managed via EF migrations (with custom tables/views like user-role views) and seeded with initial data (including an administrator account) using libraries like AutoBogus.

**Architecture & Patterns:** The project uses the Onion/Clean Architecture pattern. Business logic lives in the Application layer, which uses MediatR (a simple in-process mediator library)[2] to implement CQRS (commands/queries) and notifications. Entities and DTOs are defined in Domain and Application layers. I also implemented repository and service layers for data access (e.g. generic repositories, custom Schedule/Order repositories, User/Authentication services) to encapsulate the EF logic. Object mapping between entities and DTOs is handled by AutoMapper[3], which maps complex models to flat DTOs by convention. Input validation uses FluentValidation[4], allowing me to express validation rules (e.g. required fields, formats) in a fluent, strongly-typed way.

**Authentication & Security:** User accounts leverage ASP.NET Core Identity (with custom ApplicationUser extending IdentityUser) for robust authentication. I require email confirmation and strong passwords (min 8 chars with mixed case and digits). All API endpoints use JWT (JSON Web Tokens) for stateless auth – after login the client gets a signed JWT, which is included in requests. JWT is an industry-standard token format for secure information exchange[5]. I enforce role-based authorization: users can have User or Admin roles (defined in configuration). Admin-only controllers (like AdminController) are protected by `[Authorize(Roles="Admin")]`. Additionally, Google reCAPTCHA (v3 with occasional challenge prompts) is integrated on all forms that change state (registration, password reset) to prevent bots – normally invisible, but sometimes users must complete a visual challenge.

**Email / External Services:** The API sends email notifications (confirmations, password resets) using SMTP via a pluggable IEmailSender. By default the application uses a generic SMTP sender configured via MailSettings. Supported providers include:
- Gmail
- Brevo (formerly Sendinblue) - recommended for production with a verified custom domain (e.g., `taskmasterpro.site`) and a dedicated sender email like `no-reply@taskmasterpro.site`. **This ensures deliverability and avoids errors (like HTTP 400 on registration) due to unverified sender addresses.**
- Mailjet
- Elastic Email

Provider-specific capabilities (template management, webhooks, analytics, higher throughput, improved deliverability) can be integrated later via provider API/SDK.

**User sessions:** Cached in Redis (StackExchange.Redis) for distributed session support – Redis is an in-memory store often used for caching/scalable session state[7].
Note: session/request caching can use Redis for distributed sessions. In this repository and the portfolio demo the resend-confirmation cooldown is implemented with `IMemoryCache` (in-memory). That is **acceptable for a single-server/single-instance deployment** (what the demo uses). If you deploy across multiple nodes or need global rate-limits, switch to a distributed cache (e.g. Redis) or a global rate-limiter — `IMemoryCache` will not provide global enforcement across instances.
**Application configuration:** Managed via `appsettings.json` and environment variables (JWT secret, email SMTP settings, reCAPTCHA secret, etc.).
**Logging:** Handled by Serilog, writing to console and rolling log files (in a `/Logs` directory).

**API Features:** Key backend features include:
- **User Management:** Register, email-confirm, login, password reset (with security question and reCAPTCHA), profile update, change password, delete account (soft delete). Admins can list users, change roles, and unlock locked accounts.
- **Orders & Schedules:** CRUD operations for Orders and Schedules, with ordering and pagination. Each order must have an assigned schedule. Schedules include date/time and assigned user (which for regular users is the same user that created the schedule, while admins can assign any other existing and non-deleted user).
- **Security Hardening:** Custom exception middleware returns standard error responses on failure. Sensitive fields (passwords, security answers) are hashed. Identity tables have added fields (SecurityQuestion/AnswerHash, lockout fields). I also add `IsDeleted` flags for soft deletes. Database views (`vw_UserRoles` etc.) aggregate user-role info for reporting.
- **Security-question hardening:** `GetSecurityQuestion` always issues a session token (real or fake) so timing/response shape is consistent. If the email isn’t found the API returns a generic/fake security question (no existence leak). `VerifySecurityAnswer` will also block issuing sensitive tokens for unconfirmed accounts and returns a sentinel code `Code = "EmailNotConfirmed"` when applicable. `ForgotPassword` likewise returns an empty token for unconfirmed emails.
- **Testing & Quality:** While not including a separate test project in this repo, the design emphasizes testability (dependencies injected via DI, MediatR handlers, clean layering). Static analysis and code reviews ensure quality.
- **Resend confirmation: flow**  Added POST `/api/Authentication/resend-confirmation-link` which safely resends email confirmation links. Behavior:
  - Avoids leaking account existence (returns HTTP 200 OK with a generic success message regardless of whether the email exists).
  - Returns a clear error when the account is already confirmed.
  - Enforces rate limits: short per-email cooldown (30s) and hourly per-email cap (6/hr) using `IMemoryCache` for demo.
  - Builds confirmation links using encoded UserId + Base64Url token for frontend consumption.
  **Note**: The portfolio/demo deployment intentionally uses `IMemoryCache` (per-instance) for resend cooldowns — acceptable for a single-server demo. For multi-node production or global rate-limits you must use a distributed cache (e.g. Redis) or a global rate-limiter.

**Getting Started – Backend:** To run the API locally, you need .NET 9 SDK and SQL Server (or LocalDB). Key steps:
1. **Configure:** Copy secrets.example.json to secrets.json in the project root in the `taskmaster-pro.WebApi` project and fill in your local credentials. **See Admin Functionality below for local admin credentials and demo instructions.** Required keys include: JWT settings, reCAPTCHA secret, SMTP mail settings, Redis connection, STS Server URL, admin user password, Frontend:BaseUrl, and database connection string (ConnectionStrings:DefaultConnection). The example file contains placeholder values so you can run the project locally without exposing real secrets.
- **Redis:** For local development, use `localhost:6379` (Docker Redis).  
- **Production:** Use your Upstash Redis TCP connection (format: **hostname:port,password=<token>,ssl=True,abortConnect=False**). This ensures distributed session support without publishing a new version of the app.
- **Security note:** **Do not commit** `secrets.json` or any file containing real credentials. Keep production secrets in your host's secure configuration (App Service settings, environment variables, or a secret store). `secrets.example.json` should contain **placeholders only**.
- **Frontend Base URL:** `Frontend:BaseUrl` may be placed in `appsettings.json` as a default **and** overridden by `secrets.json` or environment-specific settings in production (recommended). For local development you can set it to `http://localhost:4200`.
- The app registers `IMemoryCache` in `Program.cs` - e.g.:
	```csharp
	// Program.cs
	builder.Services.AddMemoryCache();
	```
This is used for demo rate-limits/cooldowns. **Switch to a distributed cache (Redis)** in production to enforce global limits across instances.
2. **Database Migrations:** The app automatically applies migrations at startup via `db.Database.Migrate()` in `Program.cs`. Alternatively, to create/update the schema manually run the following from the `taskmaster-pro.WebApi` folder:

   ```powershell
   dotnet ef database update --project ..\taskmaster-pro.Infrastructure.Persistence\
   ```
3. **Run:** Use `dotnet run` in the WebApi project. Swagger UI is enabled – navigate to `https://localhost:<port>/swagger` or `https://taskmasterpro.runasp.net/swagger` to explore endpoints. The API logs to console and the `Logs` folder.
4. **Seeding:** On first run the app will create an administrator account from configuration (values under AdminUser in secrets.json / environment). Make sure AdminUser:Email, AdminUser:Password, AdminUser:SecurityQuestion and AdminUser:SecurityAnswer are set in your secrets or environment for the initial admin. After startup you can change the admin password via the UI or API.

## Admin Functionality

The app includes a full admin dashboard for managing users, orders, and schedules.

### Local / Production Admin seeding

The project seeds an administrator account on first run using values from configuration/secrets. For local development, copy `secrets.example.json` → `secrets.json` and set `AdminUser:Email`/`AdminUser:Password` (placeholders in `secrets.example.json`). Example local credentials (placeholders — do **not** commit real secrets):

- Email: `admin@example.local`
- Password: `Admin123!`

**Production behavior:** the app reads admin credentials from the host's secret store / environment variables. The seeder **only creates the admin if it does not already exist** (no automatic overwrite). Store production admin credentials securely (App Service settings, Azure Key Vault, etc.), use a strong password, and keep backups. For serious evaluation you can provide temporary access to a sandbox restored from backup.

### Admin Demo
- See the [🎥 **Admin Demo**](#demo-videos) above for a complete walkthrough of all restricted admin features.
- Full live admin access is **not publicly available**. For **serious evaluation**, temporary access can be provided on request by:
  1. Restoring a database backup to a sandbox environment, or  
  2. Supplying a database dump the evaluator can run locally.
- If you need temporary live access, contact me; access will be time-limited and performed only after a backup is taken.

### Notes on secrets and safety
- `secrets.example.json` contains placeholder values and **should be committed**.  
- **Never** commit `secrets.json` (real credentials). Ensure `secrets.json` is in `.gitignore`.

✅ v1.0.1 update: The database now auto-creates on first run; no manual `dotnet ef database update` is required for local setup.
✅ v1.1 update: Added `resend-confirmation` endpoint + UI + tests (Login & Security-Question flows). Removed automatic resend on ResetPassword; demo rate-limiting implemented via `IMemoryCache` (per-instance) — **the portfolio demo runs with this configuration as a single-instance deployment**. For multi-node or production-grade global rate limiting, use a distributed cache such as Redis.

**Tech Stack – Backend:** .NET 9.0 (ASP.NET Core), C#, Entity Framework Core (Code-First) with SQL Server, MediatR (CQRS), AutoMapper, FluentValidation, ASP.NET Identity (customized), JWT authentication, StackExchange.Redis (caching), Serilog (logging), Swashbuckle/Swagger, AutoBogus (data seeding), and custom Middleware/Filters. The solution is structured into Projects (`.Application`, `.Domain`, `.Infrastructure`, `.WebApi`) illustrating Onion architecture for maintainability and testability.

---

## Frontend (TaskmasterPro UI)

**Framework:** The front end is built with Angular 20 (generated via Angular CLI 20.0.0). It is a Single-Page Application (SPA) that communicates with the backend API for all data. The UI is responsive and mobile-friendly, with a clean layout: a top toolbar and a side navigation menu that can be collapsed or expanded via a toggle (automatically collapsed on small screens but user-controllable on all screen sizes).

**UI Components:** I use Angular Material (Google’s Material Design library) for consistent, high-quality UI widgets[8]. The app has custom themes and global SCSS styles for branding. Reusable components include forms (login, register, profiles), data tables for lists (with pagination and sorting), charts for the dashboard, dialogs, and feedback toasts. Notable features:
- **Authentication Forms:** Standalone, responsive forms for Login, Register, Forgot/Reset Password, and Change Password. Each form has client-side validation (via Angular Reactive Forms and custom validators) and helpful error messages. The Register form and Reset password form include a password strength meter (a Material progress bar) that dynamically evaluates the strength of the entered password. All state-changing auth forms (register, password reset/change) include Google reCAPTCHA v3 widgets (ng-recaptcha) for spam protection – tokens are sent to the API for validation.
- **Resend confirmation UX**: The UI implements a safe resend-confirmation flow limited to the Login and Security-Question flows:
  - Login: If a login attempt fails because the email isn’t confirmed, the page shows a neutral banner with a Resend confirmation link button (uses the current email input).
  - Security Question answer flow: If a user reaches the security-question step and the backend identifies the account as unconfirmed after a successful answer, a banner/dialog allows resending a confirmation link.
  - Important: The Reset Password page does not automatically offer a resend CTA — password-reset tokens are only issued for confirmed accounts and the reset page handles invalid/expired links by prompting the user to request a new reset through the Forgot Password flow.
  - Client-side cooldown prevents double-clicks (30s); server-side limits (IMemoryCache demo) are authoritative.
- **Password Visibility:** Password inputs have a toggle icon to show/hide characters, improving UX on mobile and helping avoid typos.
- **Dashboard:** A landing dashboard (protected by login) shows quick stats (total orders, schedules, users) in cards, and an orders/schedules chart. I use ng2-charts (Chart.js) for the bar chart of monthly activity, demonstrating data visualization[2]. The dashboard shows a spinner while loading.
- **Navigation:** The app has a main layout with a toolbar (app title, user menu/logout) and a side nav for routing between features. Routes are protected by auth guards. I also include “Not Found” (404) and “Unauthorized” (403) pages as standalone components, linked via routing for invalid or forbidden access.
- **Admin Section:** If the user has an Admin role, additional menu items appear. Admins can manage all users (change roles, reset failed attempts), and view list/detail of all orders and schedules, not just their own.

**State & Services:** Shared Angular services handle API calls (e.g. `AuthService`, `OrderService`, `ScheduleService`, `DashboardService`). I maintain global application state (e.g. current user profile) via simple service patterns. The code is organized into feature modules (e.g. `AuthenticationModule`, `AdminModule`, `DashboardModule`, `OrdersModule`, etc.) and shared modules for Material imports and utilities. I use Angular InjectionTokens for configuration (e.g. pagination options).

**Styling & Assets:** Custom global SCSS and Angular Material theming provide a professional look. The app includes a custom favicon and consistent branding colors. All layouts are designed mobile-first, adjusting to various screen sizes (e.g. form width, margins via media queries).

**Testing:** The front-end includes extensive unit tests (using Jasmine/Karma) with 48 specs covering components, services, guards, utils, modules and validators. I focus on core functionality rather than trying to hit 100% coverage. Current test coverage is ~78% (statements) with all main paths verified. These tests serve as documentation of component behavior and help ensure stability during refactoring. (To run tests: `ng test --code-coverage`, which also generates coverage reports.)

![Test Coverage](docs/coverage-screenshot.png)

### ✅ Test Coverage All frontend unit tests executed successfully.

**Results:** 376 tests, all passing (100% success)
**Coverage:** 78.34% Statements (1711/2184) | 54.28% Branches (380/700) | 83.3% Functions (489/587) | 80.46% Lines (1643/2042)

**Getting Started – Frontend:** To launch the UI locally:
1. **Install Dependencies:**
- Using npm: `npm install --legacy-peer-deps` (necessary due to peer dependency conflict in ng-recaptcha)  
- Using yarn: `yarn install`
2. **Configure API URL:** The Angular environment files already point to `https://localhost:44378/api` (development) and `https://taskmasterpro.runasp.net/api` (production). Adjust `environment.ts` or `environment.prod.ts` if needed to avoid mixed-content errors.
3. **Run Dev Server:** Execute `ng serve`. Then open `http://localhost:4200/` in a browser. The app will hot-reload on code changes.
4. **Build for Production:** Run `ng build` to produce optimized assets in `dist/`. The production build is AOT-compiled and minified.

**Tech Stack – Frontend:** Angular 20 (TypeScript), Angular Material components[8], ng2-charts (Chart.js), ng-recaptcha (Google reCAPTCHA v3), RxJS, and SASS for styling. I use Angular CLI tooling and standard Angular best practices for reactivity.

**Testing & Quality:** The UI code follows best practices for modular Angular apps. I employ Angular Reactive Forms with strict typing, custom pipes for any formatting (e.g. date helpers), and consistent error handling. The code is linted and formatted via Angular CLI standards.

---

## Additional Notes

- **Deployment:** The API can be hosted on any .NET-compatible host. I use the free tier of Azure App Service for demonstration (Azure offers always-free hosting options for small apps[9]). The Angular app can be built and served via Azure Static Web Apps or any static hosting. (No custom domain is needed for dev; you can point DNS later if desired.)
- **Documentation:** Swagger (OpenAPI) is integrated – after running the API, the Swagger UI is available at `/swagger`. This documents all endpoints, request/response models, and authentication schemes.
- **Future Work:** Features like email templates, additional user roles, and enhanced error logging are all structured in so they can be extended. The architecture easily allows adding new modules (e.g. a messaging system or another entity) by following the existing patterns.

### Known limitation: timestamps in CSV / Excel exports

Exported **Created** and **Updated** timestamps are generated on the server and are **not converted to the user's local timezone**. 
They are provided in server time (UTC) and may appear different depending on your local timezone. If you need local-time values, convert the exported ISO timestamps using your spreadsheet app or a quick script (e.g. Excel `= (A2) + TIMEZONE_OFFSET`).

---

In summary, TaskmasterPro demonstrates a full-stack implementation with current technologies: modern Angular on the front end with Material design and a responsive layout; and a secure, well-structured .NET 9 backend with EF Core, clean architecture (CQRS/Mediator, Onion architecture layered projects), and integration of third-party services (JWT auth, reCAPTCHA, SMTP email via providers like Gmail, Brevo, or Mailjet, and Redis caching). These choices highlight professional-level skills in designing scalable, maintainable applications.

---

[1] .NET - Wikipedia  
https://en.wikipedia.org/wiki/.NET

[2] GitHub - LuckyPennySoftware/MediatR: Simple, unambitious mediator implementation in .NET  
https://github.com/LuckyPennySoftware/MediatR

[3] AutoMapper: The Object-Object Mapper - AutoMapper  
https://automapper.io/

[4] GitHub - FluentValidation/FluentValidation: A popular .NET validation library for building strongly-typed validation rules.  
https://github.com/FluentValidation/FluentValidation

[5] JSON Web Tokens  
https://auth0.com/docs/secure/tokens/json-web-tokens

[6] reCAPTCHA  |  Google for Developers  
https://developers.google.com/recaptcha

[7] Redis: What It Is, What It Does, and Why You Should Care | Backendless  
https://backendless.com/redis-what-it-is-what-it-does-and-why-you-should-care/

[8] GitHub - angular/components: Component infrastructure and Material Design components for Angular  
https://github.com/angular/components

[9] Explore Free Azure Services | Microsoft Azure  
https://azure.microsoft.com/en-us/pricing/free-services

---

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
