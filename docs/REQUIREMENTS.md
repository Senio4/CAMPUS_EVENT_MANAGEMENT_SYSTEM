# Requirements Document — Campus Event Management System

## 1. Purpose and Scope
A system to create, post, organize, and manage campus events. Organizers post event information, students view and register, and authorized users monitor participants and attendance. Scope: event posting, registration, updates, attendance, QR attendance, event information, map/directions, and student organization by Department → Year → Section.

## 2. Users and Stakeholders
| Stakeholder | Category | Role |
|---|---|---|
| Students | Primary user | View events, register, attend |
| Event Organizer | Primary user | Create, post, manage events |
| Student Organization | Primary user | Organize and manage organization events |
| Instructor | Secondary user | Check verified student attendance |
| SASO / Student Affairs Office | Administrator | Help manage and oversee campus events |
| School Administrator | Decision-maker | Approve and oversee the system |
| IT / System Administrator | Administrator | Maintain the system |

## 3. Interview & Observation Summary
Organizers plan events through proposal → legislative review → approval → budgeting, use their own checklists, coordinate venues directly with the scheduling authority, and announce via social media/group chats. Students find events on official pages, register via Google Form, and record attendance by QR scan. Nothing is broken; the request is to have announcements, registration, maps, and QR check-in in one place. A scheduling conflict has happened once.

## 4. Functional Requirements
| ID | Requirement | Status (AI Verification Log) |
|---|---|---|
| FR-1 | Authorized organizers create an event (title, date, time, location, description) | Verified |
| FR-2 | Authorized organizers post events so students can view them | Verified |
| FR-3 | Students view title, date, time, location, description, organizer | Verified |
| FR-4 | Organizers view students registered for an event | Unverified |
| FR-5 | Students register for available events | Verified |
| FR-6 | Organizers update venue, date, or time | Unverified |
| FR-7 | Organizers record and view attendance | Verified |
| FR-8 | System provides a QR code to record attendance | Verified |
| FR-9 | System saves attendance records | Verified |
| FR-10 | Student information organized by Department, Year, Section | Unverified |
| FR-11 | System shows event location with map/directions | Verified |
| FR-12 | System shows event status (open, full, ongoing, completed, cancelled) | Unverified |

Rejected: automatic venue assignment (venue approval is handled by the venue scheduling authority).

## 5. Non-Functional Requirements
- **Usability:** simple menus, buttons, labels.
- **Performance:** event info and search results within 3 seconds under normal use.
- **Security:** only authorized users create/update/manage events and attendance.
- **Privacy:** student information shown only to permitted users (organizers of the event, admins). Only name, department, year, section collected.
- **Accessibility:** clear text, readable information, easy-to-use controls.
- **Reliability:** registrations and attendance are persisted.

## 6. Use Cases
**UC-1 Create and Post Event** — Actor: Organizer. Pre: logged in as organizer. Steps: open Manage Events → Create event → enter details → save (draft) → Post event. Exception: missing/invalid fields show errors and nothing is saved. Result: event is open and visible to students.

**UC-2 Register for an Event** — Actor: Student. Pre: logged in; event open. Steps: view events → select event → read info → Register → system saves registration → QR code shown under My Registrations. Exception: full, closed, or duplicate registration is refused. Result: student registered.

**UC-3 Monitor Event Attendance** — Actor: Organizer. Pre: event is ongoing; organizer owns it. Steps: open Attendance page → student presents QR → organizer scans/enters it → system records Attended → organizer views list. Exception: invalid or already-used QR is not recorded again. Result: attendance saved.

## 7. Inclusive Requirements
1. Accessible event information (name, date, time, location, organizer shown clearly) — *to be verified via interview/observation/school policy.*
2. Minimal student information (name, department, year level, section only) — *to be verified.*

## 8. Implementation Map
Routes: `routes/events.js` (FR-3, 5, 11, 12), `routes/organizer.js` (FR-1, 2, 4, 6, 7, 8, 9), `routes/admin.js` (FR-10, reports, users), `routes/auth.js` (login/session/registration).
