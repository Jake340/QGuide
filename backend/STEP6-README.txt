Q-GUIDE STEP 6 BACKEND FILES

This archive contains the new patient registration, existing-patient lookup,
active clinic listing, check-in API files, and a replacement API route registry.

HOW TO INSTALL
1. Stop the backend server with Ctrl+C.
2. Extract this archive into your existing Q-Guide\backend folder.
3. Allow the files under src to merge with existing folders.
4. Replace src\routes\api.routes.js when prompted. It preserves the Step 4/5
   health, auth, admin, and staff routes while adding patient, clinic, check-in routes.
5. Do NOT replace your existing .env, package.json, src\app.js, src\server.js,
   src\config\db.js, or authentication files.
6. Ensure packages from Steps 4 and 5 are installed, then start with npm run dev.

ENDPOINTS
GET  /api/clinics
POST /api/patients
POST /api/patients/lookup
POST /api/checkin

REQUEST BODY EXAMPLES
POST /api/patients
{
  "fullName": "Alex Demo",
  "dateOfBirth": "1990-01-01",
  "contactNumber": "09171234567"
}

POST /api/patients/lookup
{
  "patientCode": "QG-PASTE-CODE-HERE",
  "dateOfBirth": "1990-01-01"
}

POST /api/checkin
{
  "patientCode": "QG-PASTE-CODE-HERE",
  "dateOfBirth": "1990-01-01",
  "clinicCode": "FAMED",
  "arrivalMethod": "MANUAL"
}

NOTES
- Patient registration and check-in are public demo endpoints secured with basic
  validation and IP-based rate limits. Do not use with real patient information
  until the hospital approves stronger patient identity verification, abuse
  controls, security review, HTTPS and privacy arrangements.
- The public lookup uses high-entropy patient code plus date of birth and returns
  minimum profile fields. Do not log or share this data.
- Duplicate registration is flagged using full name + date of birth. This is a
  possible duplicate, not proof that two people are identical; never auto-merge.
- A client-supplied GEOFENCE_PROMPT value is not trusted proof of location. Actual
  geofence event verification belongs in the later geofencing stage.
- Clinic/room seed data is demonstration data only and must be verified by EVMC.
- Queue numbers are issued transactionally with a per-patient/clinic/day lock and
  a locked daily counter, using the current schema's queue_sequences table.
