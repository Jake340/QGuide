Q-GUIDE STEP 9 - FLUTTER PATIENT APP (MVP)

WHAT IS INCLUDED
- lib/main.dart: app entry point and theme
- lib/core/config/api_config.dart: API URL for emulator; supports --dart-define override
- lib/core/network/api_client.dart: REST client for the existing Node API
- lib/features/patient_home_screen.dart: registration, returning patient verification, manual clinic check-in, queue ticket/status, clinic guidance

INSTALL INTO YOUR EXISTING PROJECT
1. Stop any running Flutter app/debug session.
2. Extract the ZIP contents into C:\Users\scyle\Q-Guide\mobile_app . Allow the lib folder to merge/replace if prompted.
3. From a VS Code PowerShell terminal run:
   cd "$HOME\Q-Guide\mobile_app"
   flutter pub add http
   flutter pub get
4. Ensure Android internet permission exists in android/app/src/main/AndroidManifest.xml, inside the <manifest> tag but outside <application>:
   <uses-permission android:name="android.permission.INTERNET" />
5. For local-development HTTP only, check android/app/src/debug/AndroidManifest.xml. If this file does not already enable cleartext traffic for debug, add this application attribute in a debug manifest:
   android:usesCleartextTraffic="true"
   Do not enable cleartext HTTP for production/release builds.
6. Start XAMPP MySQL/MariaDB and Node backend first. Verify http://localhost:3000/api/health from the PC.
7. Android Emulator default API URL is http://10.0.2.2:3000/api. That is set in ApiConfig.
8. Run the app:
   flutter doctor -v
   flutter devices
   flutter run

API CONFIGURATION
Android emulator:
  default is http://10.0.2.2:3000/api
Physical Android phone on the same Wi-Fi:
  flutter run --dart-define=QGUIDE_API_BASE_URL=http://YOUR_PC_LAN_IP:3000/api
  Replace YOUR_PC_LAN_IP with the PC's IPv4 address from ipconfig. The Windows firewall may need to allow Node.js on a Private network.
Flutter web/Windows desktop:
  use --dart-define=QGUIDE_API_BASE_URL=http://localhost:3000/api, subject to CORS/firewall configuration.

API CONTRACT USED
GET  /api/clinics
POST /api/patients
POST /api/patients/lookup
POST /api/checkin
GET  /api/guidance/clinics/:clinicCode
POST /api/guidance/queue-status

IMPORTANT
- This Step 9 is manual check-in and API integration. It does not yet implement GPS geofencing or local/push notifications; those are Step 10.
- The app keeps patient/ticket data in memory only. Clearing the app or restarting it clears the current on-screen session. It deliberately does not persist date of birth or patient code on disk in this prototype.
- Use only fictional test data. These endpoint identity checks are development-level, not sufficient for real EVMC patient data without approved identity/session controls and security review.
- If the API says no active clinics are available, fix the Step 6 clinic seed/configuration issue first.
