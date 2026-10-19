# CSPC Campus Event Management System

A web app for creating, posting, and managing campus events: students browse and register, organizers manage events and record QR attendance, and admins oversee users and reports. Built for the CSPC College of Computer Studies Midterm Project.

## Team Members
- Abinal, Joland G.
- Cornelio, Kenneth Jay M.
- Talania, Jayson V.

## Features
- Public event list with search, status filter, event details, and live status (open / full / ongoing / completed / cancelled)
- Interactive **CSPC campus map** (SVG) with clickable venue pins and walking directions from the main gate
- Student registration & login; event registration with a personal QR code
- **QR download as PNG** from My Registrations and event detail pages
- Organizer: create, edit, post, start, complete, cancel events; view participants; scan QR (handheld / paste) and manual "Mark present"
- Admin: dashboard summary, user/role management, students grouped Department → Year → Section
- Light/dark theme toggle (persisted via cookie + localStorage)
- Role-based access control, bcrypt password hashing, sessions, CSRF tokens, server-side validation

## Technologies
Node.js, Express, EJS, SQLite (better-sqlite3), express-session, cookie-parser, bcryptjs, qrcode, dotenv, plain CSS.

## Installation
Requires Node.js 18+.
```bash
npm install
cp .env.example .env     # then edit SESSION_SECRET