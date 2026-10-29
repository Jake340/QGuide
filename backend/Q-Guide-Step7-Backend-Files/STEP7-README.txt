Q-GUIDE STEP 7 - QUEUE MANAGEMENT AND GUIDANCE API

PRECONDITION
- Complete Step 4 backend setup and Step 5 auth middleware.
- Step 6 patient, clinic, and check-in files should already be installed.
- The database must match the schema.sql created in Step 3.
- XAMPP's MySQL/MariaDB service must be running.

INSTALL
1. Stop the backend server using Ctrl+C in its terminal.
2. Extract this ZIP into C:\Users\scyle\Q-Guide\backend.
3. Allow the src folder to merge with the existing src folder.
4. Replace src\routes\api.routes.js when prompted. The supplied version retains the Step 4-6 routes and adds queues and guidance.
5. Do not replace .env, package.json, app.js, server.js, db.js, or auth files.
6. Ensure express-rate-limit is installed: npm install express-rate-limit
7. Restart: npm run dev

QUEUE MANAGEMENT (STAFF/ADMIN ACCESS TOKEN REQUIRED)
GET   /api/queues?clinicCode=FAMED
GET   /api/queues?clinicCode=FAMED&date=YYYY-MM-DD
GET   /api/queues?clinicCode=FAMED&status=WAITING
POST  /api/queues/call-next
PATCH /api/queues/:ticketId/status

POST /api/queues/call-next JSON body:
{ "clinicCode": "FAMED" }

PATCH /api/queues/:ticketId/status JSON body examples:
{ "status": "IN_SERVICE" }
{ "status": "COMPLETED", "reason": "Consultation finished" }

Allowed transitions:
WAITING -> CALLED, CANCELLED, NO_SHOW
CALLED -> WAITING, IN_SERVICE, CANCELLED, NO_SHOW
IN_SERVICE -> COMPLETED
NO_SHOW -> WAITING
COMPLETED and CANCELLED are final.

GUIDANCE
GET  /api/guidance/clinics/FAMED
POST /api/guidance/queue-status
JSON body:
{
  "patientCode": "PATIENT-CODE",
  "dateOfBirth": "1992-08-12",
  "tokenNumber": "F-001",
  "queueDate": "YYYY-MM-DD"
}

The patient queue-status endpoint returns only a ticket verified by matching patient code and date of birth. This is demonstration-grade verification, not sufficient for real hospital use without additional identity/session controls approved by EVMC.

TESTING
- Test GET /api/clinics first and use an actual clinicCode returned by the API.
- If the FAMED clinic error from Step 6 still exists, resolve the clinic seed/data issue before expecting check-in and queue endpoints to work.
- Queue listing, Call Next, and status change endpoints require an existing STAFF or ADMIN JWT in the Authorization: Bearer header.
- Guidance values come from clinic_rooms and clinic configuration. Demo locations are unverified and must not be presented as official EVMC directions until confirmed.

NOTES
- Queue status changes are transactional and append queue_status_history and audit_logs records.
- Call Next serializes callers for one clinic per Manila calendar date using a named database lock.
- This is a local development implementation; before production, use EVMC-approved identity, staff-to-clinic authorization, secure deployment, monitoring, and privacy review.
