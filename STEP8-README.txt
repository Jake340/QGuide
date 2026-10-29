Q-GUIDE STEP 8 - STAFF / ADMIN REACT DASHBOARD

WHAT IS INCLUDED
- React dashboard source files for staff_dashboard/src
- API client that sends JSON requests and Bearer tokens to the Node.js API
- Login screen
- Queue list, queue summary, Call Next, and queue status updates
- Admin-only clinic management, staff management, and audit log screens
- Backend admin-management endpoints required for those admin screens

IMPORTANT PRECONDITIONS
- The existing React project was created in C:\Users\scyle\Q-Guide\staff_dashboard using Vite + React.
- Node/Express API is running in C:\Users\scyle\Q-Guide\backend on port 3000.
- Step 5 authentication files exist, including auth.middleware.js and authorize.middleware.js.
- The existing schema.sql has been imported into qguide_db.
- The Step 6 and Step 7 modules are installed and working.
- bcryptjs is installed in the backend from Step 5.

INSTALL FRONTEND
1. Stop the Vite dashboard if it is running (Ctrl+C in that terminal).
2. Extract/copy the ZIP's staff_dashboard/src folder into C:\Users\scyle\Q-Guide\staff_dashboard\src.
3. Allow replacement of App.jsx, App.css, index.css and main.jsx if prompted. The API helper is added under src\api.
4. Copy staff_dashboard\.env.example to C:\Users\scyle\Q-Guide\staff_dashboard\.env and keep:
   VITE_API_BASE_URL=http://localhost:3000/api
5. In VS Code terminal:
   cd "$HOME\Q-Guide\staff_dashboard"
   npm install
   npm run dev
6. Open the URL printed by Vite, normally http://localhost:5173.

INSTALL BACKEND MANAGEMENT ENDPOINTS
1. Stop the backend (Ctrl+C).
2. Copy the ZIP's backend\src\modules\admin\admin.routes.js to:
   C:\Users\scyle\Q-Guide\backend\src\modules\admin\admin.routes.js
3. Copy admin-management.controller.js to the same backend\src\modules\admin folder.
4. Do not replace backend\.env, app.js, server.js, db.js, or package.json.
5. Confirm bcryptjs is installed: npm list bcryptjs
6. Restart the backend:
   cd "$HOME\Q-Guide\backend"
   npm run dev

NEW ADMIN ROUTES (all require a valid ADMIN token)
GET    /api/admin/clinics
POST   /api/admin/clinics
PATCH  /api/admin/clinics/:clinicId
GET    /api/admin/staff
POST   /api/admin/staff
PATCH  /api/admin/staff/:userId
GET    /api/admin/audit-logs?limit=50&offset=0

EXISTING STAFF/ADMIN QUEUE ROUTES
GET    /api/clinics
GET    /api/queues?clinicCode=FAMED
POST   /api/queues/call-next
PATCH  /api/queues/:ticketId/status
POST   /api/auth/login
GET    /api/auth/me

TESTING ORDER
1. Keep XAMPP MySQL running.
2. Start backend; open http://localhost:3000/api/health and confirm database status is ok.
3. Start Vite and open the printed frontend address.
4. Sign in using a STAFF or ADMIN account created with the backend create-user script.
5. Select Queue dashboard and verify that the active clinic list loads.
6. Admin accounts see Clinic management, Staff management and Audit logs.
7. Only try Call Next if the selected clinic has at least one WAITING ticket for today's Manila date.

NOTES / LIMITATIONS
- Current CORS configuration allows http://localhost:5173; use Vite's default port or update backend CORS_ORIGIN and restart the API if Vite selects another port.
- The backend schema has roles, but not a staff-to-clinic assignment table. This implementation applies role-level access only; production must add authorized clinic scoping approved by EVMC.
- The dashboard stores the short-lived access token in sessionStorage for local development. Before production, review token storage, HTTPS, CSP, user session lifecycle, access revocation, and hospital security requirements.
- Clinic room details must be confirmed by EVMC; demo clinic and room values are not official hospital data.
- No passwords or JWTs are shown in the audit screen. Audit details should be kept free of diagnoses, passwords, and unnecessary patient data.
