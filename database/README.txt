Q-GUIDE DATABASE SCRIPTS

Contents
- schema.sql: creates qguide_db and its initial relational tables.
- seed_clinics.sql: inserts a demonstration FAMED clinic and sample room.
- seed_demo_data.sql: optionally inserts one fictional patient record.

IMPORT ORDER (XAMPP / phpMyAdmin)
1. Start Apache and MySQL in XAMPP Control Panel.
2. Open http://localhost/phpmyadmin in your browser.
3. Import schema.sql first. It creates the qguide_db database itself.
   - From the phpMyAdmin home screen, open Import, choose schema.sql, then click Import/Go.
4. In the left sidebar, select qguide_db.
5. Open Import and import seed_clinics.sql.
6. Optionally import seed_demo_data.sql for one fictional patient record.
7. Click qguide_db and confirm the tables are listed under Structure.

IMPORTANT
- XAMPP's control panel labels its bundled MariaDB service as MySQL.
- The FAMED/2nd Floor/204 values are demonstration values from the proposal example, not verified hospital data.
- Do not use real EVMC patient information during development.
- Do not insert staff users with plaintext passwords. The backend will create accounts with securely hashed passwords later.
- Do not expose phpMyAdmin or the database port publicly. XAMPP is for local development, not production hosting.
