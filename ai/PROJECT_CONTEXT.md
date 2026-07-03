# Project Context

This file explains Rock Frost Business Suite to an AI agent or developer in under 10 minutes.

## Company

Rock Frost Technologies.

## Product

Rock Frost Business Suite is a premium multi-tenant SaaS platform for managing business operations across industries.

## Mission

Build a secure, modular business operating system that helps organizations manage assets, people, workflows, reporting, and growth from one platform.

## Vision

Create a reusable SaaS backbone that can support fleet management first, then expand into CRM, inventory, POS, accounting, HR, payroll, school, hospital, hotel, construction, agriculture, AI, and future industry modules.

## Current Phase

The project is in platform foundation work:

- Marketing website exists.
- Dashboard shell exists.
- Fleet UI exists with mock data.
- Authentication foundation has started.
- Prisma/database foundation has started.
- Real database-backed application flows are not connected yet.

## Current Modules

- Core platform foundation
- Authentication foundation
- Dashboard shell
- Fleet management UI
- Notifications and audit logging are planned in schema and architecture
- File assets are planned in schema and architecture

## Future Modules

- CRM
- Inventory
- POS
- Accounting
- HR
- Payroll
- School
- Hospital
- Hotel
- Construction
- Agriculture
- AI assistant
- GLV Layaway as a future module

## Current Technology Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- NextAuth/Auth.js foundation
- Prisma ORM
- PostgreSQL planned as the primary database
- Resend for email-related integration points

## Architecture

Rock Frost Business Suite uses one codebase with separated experiences:

- Public marketing website for product discovery.
- SaaS dashboard for authenticated operational workflows.
- Shared platform services for auth, tenant resolution, permissions, modules, audit, notifications, and files.
- Business modules such as Fleet built on top of the platform foundation.
- Shared multi-tenant database model scoped around `Organization`.

## Folder Structure

Current important folders:

- `app/` - Next.js routes and route groups
- `app/(dashboard)/` - authenticated dashboard experience
- `app/(auth)/` - auth-related pages
- `app/api/` - API routes
- `components/` - reusable UI components
- `components/dashboard/` - dashboard shell components
- `components/fleet/` - fleet UI components
- `lib/` - shared helpers and platform libraries
- `lib/auth/` - auth foundation
- `lib/fleet/` - fleet mock data and helpers
- `prisma/` - Prisma schema
- `docs/` - architecture and roadmap documentation
- `ai/` - engineering operating system documentation
- `public/` - static assets

## Current Status

Completed:

- Public Rock Frost website
- Marketing routes and shared components
- Contact/demo/newsletter API routes
- Fleet module UI with mock data
- Dashboard shell
- Architecture Bible
- Development Roadmap
- Authentication planning document
- Operator handoff log
- Prisma schema foundation
- Prisma Client singleton

In progress:

- Authentication foundation
- Dashboard route protection
- Profile menu and profile page
- Database foundation and future migration path
- Operating documentation for AI/developer collaboration

Not yet implemented:

- Production database integration
- Real tenant resolver
- Production auth persistence
- Payment gateway integration
- Fleet backend services
- Admin, organizations, notifications, and root settings routes
- Real module settings and subscriptions

## Future Roadmap

1. Stabilize platform foundation.
2. Complete auth integration with database-backed users.
3. Add tenant resolver and organization context.
4. Implement roles and permissions.
5. Add migrations and seed data.
6. Build fleet backend APIs and services.
7. Connect fleet UI to real data.
8. Add notifications and audit services.
9. Add billing/subscription scaffolding.
10. Expand into future modules.
