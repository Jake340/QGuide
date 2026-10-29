import 'package:flutter/material.dart';

import '../core/network/api_client.dart';

class PatientHomeScreen extends StatefulWidget {
  const PatientHomeScreen({super.key});

  @override
  State<PatientHomeScreen> createState() => _PatientHomeScreenState();
}

class _PatientHomeScreenState extends State<PatientHomeScreen> {
  final ApiClient _api = ApiClient();

  final _registerFormKey = GlobalKey<FormState>();
  final _lookupFormKey = GlobalKey<FormState>();
  final _queueLookupFormKey = GlobalKey<FormState>();

  final _fullNameController = TextEditingController();
  final _registerDobController = TextEditingController();
  final _contactController = TextEditingController();
  final _lookupCodeController = TextEditingController();
  final _lookupDobController = TextEditingController();
  final _queueCodeController = TextEditingController();
  final _queueDobController = TextEditingController();
  final _queueTokenController = TextEditingController();
  final _queueDateController = TextEditingController();

  int _selectedTab = 0;
  bool _busy = false;
  bool _loadingClinics = true;
  String? _clinicError;
  List<Map<String, dynamic>> _clinics = <Map<String, dynamic>>[];
  String? _selectedClinicCode;

  Map<String, dynamic>? _patient;
  String? _patientDateOfBirth;
  Map<String, dynamic>? _ticket;
  Map<String, dynamic>? _ticketClinic;
  Map<String, dynamic>? _queueStatusResult;
  Map<String, dynamic>? _guidanceResult;

  @override
  void initState() {
    super.initState();
    _loadClinics();
  }

  @override
  void dispose() {
    _api.close();
    _fullNameController.dispose();
    _registerDobController.dispose();
    _contactController.dispose();
    _lookupCodeController.dispose();
    _lookupDobController.dispose();
    _queueCodeController.dispose();
    _queueDobController.dispose();
    _queueTokenController.dispose();
    _queueDateController.dispose();
    super.dispose();
  }

  Future<void> _loadClinics() async {
    setState(() {
      _loadingClinics = true;
      _clinicError = null;
    });

    try {
      final clinics = await _api.getClinics();
      if (!mounted) return;
      setState(() {
        _clinics = clinics;
        if (_selectedClinicCode == null ||
            !_clinics.any((c) => c['clinicCode'] == _selectedClinicCode)) {
          _selectedClinicCode = clinics.isEmpty
              ? null
              : clinics.first['clinicCode']?.toString();
        }
        _loadingClinics = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingClinics = false;
        _clinicError = error.toString();
      });
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  String? _validateRequired(String? value, String label) {
    if (value == null || value.trim().isEmpty) return '$label is required.';
    return null;
  }

  String? _validateDate(String? value) {
    final text = value?.trim() ?? '';
    final regex = RegExp(r'^\d{4}-\d{2}-\d{2}$');
    if (!regex.hasMatch(text)) return 'Use YYYY-MM-DD format.';
    final parsed = DateTime.tryParse(text);
    if (parsed == null || parsed.toIso8601String().substring(0, 10) != text) {
      return 'Enter a valid calendar date.';
    }
    return null;
  }

  Future<void> _registerPatient() async {
    if (!_registerFormKey.currentState!.validate()) return;
    setState(() => _busy = true);

    try {
      final data = await _api.registerPatient(
        fullName: _fullNameController.text.trim(),
        dateOfBirth: _registerDobController.text.trim(),
        contactNumber: _contactController.text.trim(),
      );
      final patient = Map<String, dynamic>.from(data['patient'] as Map);
      final dob = _registerDobController.text.trim();

      if (!mounted) return;
      setState(() {
        _patient = patient;
        _patientDateOfBirth = dob;
        _lookupCodeController.text = patient['patientCode']?.toString() ?? '';
        _lookupDobController.text = dob;
        _queueCodeController.text = patient['patientCode']?.toString() ?? '';
        _queueDobController.text = dob;
      });
      _showMessage('Registration successful. Keep your patient code private.');
    } catch (error) {
      _showMessage(error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _lookupPatient() async {
    if (!_lookupFormKey.currentState!.validate()) return;
    setState(() => _busy = true);

    try {
      final dob = _lookupDobController.text.trim();
      final data = await _api.lookupPatient(
        patientCode: _lookupCodeController.text.trim(),
        dateOfBirth: dob,
      );
      final patient = Map<String, dynamic>.from(data['patient'] as Map);

      if (!mounted) return;
      setState(() {
        _patient = patient;
        _patientDateOfBirth = dob;
        _queueCodeController.text = patient['patientCode']?.toString() ?? '';
        _queueDobController.text = dob;
      });
      _showMessage('Patient profile verified. Select a clinic to check in.');
    } catch (error) {
      _showMessage(error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _checkIn() async {
    final patient = _patient;
    final clinicCode = _selectedClinicCode;
    final dob = _patientDateOfBirth;

    if (patient == null || dob == null) {
      _showMessage('Register or verify a patient profile first.');
      return;
    }
    if (clinicCode == null || clinicCode.isEmpty) {
      _showMessage('No active clinic is available. Refresh the clinic list.');
      return;
    }

    setState(() => _busy = true);
    try {
      final data = await _api.checkIn(
        patientCode: patient['patientCode'].toString(),
        dateOfBirth: dob,
        clinicCode: clinicCode,
      );
      final ticket = Map<String, dynamic>.from(data['ticket'] as Map);
      final clinic = Map<String, dynamic>.from(data['clinic'] as Map);

      if (!mounted) return;
      setState(() {
        _ticket = ticket;
        _ticketClinic = clinic;
        _queueStatusResult = null;
        _queueTokenController.text = ticket['tokenNumber']?.toString() ?? '';
        _queueDateController.text = ticket['queueDate']?.toString() ?? '';
        _selectedTab = 1;
      });
      _showMessage('Check-in completed. Your queue ticket is ready.');
    } catch (error) {
      if (error is ApiException &&
          error.data?['code'] == 'ACTIVE_QUEUE_EXISTS' &&
          error.data?['ticket'] is Map) {
        final existingTicket =
            Map<String, dynamic>.from(error.data!['ticket'] as Map);
        final selectedClinic = _clinics.cast<Map<String, dynamic>?>().firstWhere(
          (clinic) => clinic?['clinicCode'] == clinicCode,
          orElse: () => null,
        );
        if (!mounted) return;
        setState(() {
          _ticket = existingTicket;
          _ticketClinic = selectedClinic == null
              ? <String, dynamic>{'clinicName': existingTicket['clinicName']}
              : selectedClinic;
          _queueStatusResult = null;
          _queueTokenController.text =
              existingTicket['tokenNumber']?.toString() ?? '';
          _queueDateController.text =
              existingTicket['queueDate']?.toString() ?? '';
          _selectedTab = 1;
        });
        _showMessage(error.message);
      } else {
        _showMessage(error.toString());
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refreshQueueStatus({bool fromForm = false}) async {
    String code;
    String dob;
    String token;
    String queueDate;

    if (fromForm || _ticket == null || _patient == null) {
      if (!_queueLookupFormKey.currentState!.validate()) return;
      code = _queueCodeController.text.trim();
      dob = _queueDobController.text.trim();
      token = _queueTokenController.text.trim();
      queueDate = _queueDateController.text.trim();
    } else {
      code = _patient!['patientCode']?.toString() ?? '';
      dob = _patientDateOfBirth ?? '';
      token = _ticket!['tokenNumber']?.toString() ?? '';
      queueDate = _ticket!['queueDate']?.toString() ?? '';
      if (code.isEmpty || dob.isEmpty || token.isEmpty || queueDate.isEmpty) {
        _showMessage('Queue details are incomplete. Enter the ticket details below.');
        return;
      }
    }

    setState(() => _busy = true);
    try {
      final data = await _api.getPatientQueueStatus(
        patientCode: code,
        dateOfBirth: dob,
        tokenNumber: token,
        queueDate: queueDate,
      );
      final ticket = Map<String, dynamic>.from(data['ticket'] as Map);
      final clinic = Map<String, dynamic>.from(data['clinic'] as Map);

      if (!mounted) return;
      setState(() {
        _ticket = ticket;
        _ticketClinic = clinic;
        _queueStatusResult = data;
        _queueCodeController.text = code;
        _queueDobController.text = dob;
        _queueTokenController.text = token;
        _queueDateController.text = queueDate;
      });
      _showMessage('Queue status updated.');
    } catch (error) {
      _showMessage(error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadGuidance() async {
    final code = _selectedClinicCode;
    if (code == null || code.isEmpty) {
      _showMessage('Select an active clinic first.');
      return;
    }

    setState(() => _busy = true);
    try {
      final result = await _api.getClinicGuidance(code);
      if (!mounted) return;
      setState(() => _guidanceResult = result);
    } catch (error) {
      _showMessage(error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _clearPatientSession() {
    setState(() {
      _patient = null;
      _patientDateOfBirth = null;
      _ticket = null;
      _ticketClinic = null;
      _queueStatusResult = null;
      _guidanceResult = null;
      _fullNameController.clear();
      _registerDobController.clear();
      _contactController.clear();
      _lookupCodeController.clear();
      _lookupDobController.clear();
      _queueCodeController.clear();
      _queueDobController.clear();
      _queueTokenController.clear();
      _queueDateController.clear();
    });
    _showMessage('Patient details cleared from this app session.');
  }

  @override
  Widget build(BuildContext context) {
    final titles = <String>['Patient Check-in', 'My Queue', 'Clinic Guide'];

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text('Q-Guide', style: TextStyle(fontWeight: FontWeight.bold)),
            Text(
              titles[_selectedTab],
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal),
            ),
          ],
        ),
        actions: <Widget>[
          IconButton(
            tooltip: 'Refresh clinics',
            onPressed: _busy ? null : _loadClinics,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _selectedTab,
          children: <Widget>[
            _buildCheckInTab(),
            _buildQueueTab(),
            _buildGuideTab(),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedTab,
        onDestinationSelected: (index) => setState(() => _selectedTab = index),
        destinations: const <NavigationDestination>[
          NavigationDestination(
            icon: Icon(Icons.how_to_reg_outlined),
            selectedIcon: Icon(Icons.how_to_reg),
            label: 'Check-in',
          ),
          NavigationDestination(
            icon: Icon(Icons.confirmation_number_outlined),
            selectedIcon: Icon(Icons.confirmation_number),
            label: 'My Queue',
          ),
          NavigationDestination(
            icon: Icon(Icons.location_on_outlined),
            selectedIcon: Icon(Icons.location_on),
            label: 'Clinic Guide',
          ),
        ],
      ),
    );
  }

  Widget _buildCheckInTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        _welcomeCard(),
        const SizedBox(height: 16),
        if (_clinicError != null) _errorCard(_clinicError!),
        if (_patient == null) ...<Widget>[
          _sectionTitle('New patient'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _registerFormKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const Text(
                      'Create a basic patient profile. Your patient code will be generated after registration.',
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _fullNameController,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Full name',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: (value) {
                        final error = _validateRequired(value, 'Full name');
                        if (error != null) return error;
                        if (value!.trim().length < 2 || value.trim().length > 150) {
                          return 'Enter a name between 2 and 150 characters.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _registerDobController,
                      keyboardType: TextInputType.datetime,
                      decoration: const InputDecoration(
                        labelText: 'Date of birth',
                        hintText: 'YYYY-MM-DD',
                        prefixIcon: Icon(Icons.calendar_today_outlined),
                      ),
                      validator: _validateDate,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _contactController,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Contact number (optional)',
                        prefixIcon: Icon(Icons.phone_outlined),
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _busy ? null : _registerPatient,
                      icon: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.person_add_alt_1),
                      label: const Text('Register patient'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          _sectionTitle('Returning patient'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _lookupFormKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const Text('Verify your existing profile using your patient code and date of birth.'),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _lookupCodeController,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Patient code',
                        prefixIcon: Icon(Icons.badge_outlined),
                      ),
                      validator: (value) => _validateRequired(value, 'Patient code'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _lookupDobController,
                      keyboardType: TextInputType.datetime,
                      decoration: const InputDecoration(
                        labelText: 'Date of birth',
                        hintText: 'YYYY-MM-DD',
                        prefixIcon: Icon(Icons.calendar_today_outlined),
                      ),
                      validator: _validateDate,
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _lookupPatient,
                      icon: const Icon(Icons.verified_user_outlined),
                      label: const Text('Verify existing patient'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ] else ...<Widget>[
          _patientCard(),
          const SizedBox(height: 16),
          _sectionTitle('Select OPD clinic'),
          _clinicSelector(),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _busy ? null : _checkIn,
            icon: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check_circle_outline),
            label: const Text('Confirm check-in'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busy ? null : _clearPatientSession,
            icon: const Icon(Icons.logout),
            label: const Text('Clear patient details'),
          ),
          const SizedBox(height: 8),
          const Text(
            'This development version uses manual check-in. Geofencing and arrival notifications are added in Step 10.',
            style: TextStyle(color: Colors.black54, fontSize: 12),
          ),
        ],
      ],
    );
  }

  Widget _buildQueueTab() {
    final ticket = _ticket;
    final statusResult = _queueStatusResult;
    final liveTicket = statusResult?['ticket'] is Map
        ? Map<String, dynamic>.from(statusResult!['ticket'] as Map)
        : ticket;
    final liveClinic = statusResult?['clinic'] is Map
        ? Map<String, dynamic>.from(statusResult!['clinic'] as Map)
        : _ticketClinic;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        _sectionTitle('Your queue ticket'),
        if (liveTicket != null) ...<Widget>[
          _ticketCard(liveTicket, liveClinic),
          if (statusResult?['guidance'] != null) ...<Widget>[
            const SizedBox(height: 12),
            _infoCard(
              title: 'Clinic directions',
              body: statusResult!['guidance'].toString(),
              icon: Icons.directions_outlined,
            ),
          ],
          if (liveTicket['position'] != null) ...<Widget>[
            const SizedBox(height: 12),
            _infoCard(
              title: 'Queue position',
              body: 'Your position is ${liveTicket['position']}. This is based on waiting tickets and can change as staff update the queue.',
              icon: Icons.format_list_numbered,
            ),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _busy ? null : () => _refreshQueueStatus(),
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh queue status'),
          ),
        ] else ...<Widget>[
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'After check-in, your queue ticket will appear here. You can also enter your ticket details below to look up its current status.',
              ),
            ),
          ),
        ],
        const SizedBox(height: 18),
        _sectionTitle('Look up a ticket'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Form(
              key: _queueLookupFormKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  TextFormField(
                    controller: _queueCodeController,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'Patient code'),
                    validator: (value) => _validateRequired(value, 'Patient code'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _queueDobController,
                    keyboardType: TextInputType.datetime,
                    decoration: const InputDecoration(
                      labelText: 'Date of birth',
                      hintText: 'YYYY-MM-DD',
                    ),
                    validator: _validateDate,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _queueTokenController,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'Queue ticket number'),
                    validator: (value) => _validateRequired(value, 'Queue ticket number'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _queueDateController,
                    keyboardType: TextInputType.datetime,
                    decoration: const InputDecoration(
                      labelText: 'Queue date',
                      hintText: 'YYYY-MM-DD',
                    ),
                    validator: _validateDate,
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _refreshQueueStatus(fromForm: true),
                    icon: const Icon(Icons.search),
                    label: const Text('Look up queue status'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildGuideTab() {
    final guidance = _guidanceResult;
    final location = guidance?['location'];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        _infoCard(
          title: 'Clinic guidance',
          body: 'Select an active OPD clinic to view its configured floor, room, and directions. This app does not provide diagnosis or medical triage.',
          icon: Icons.assistant_outlined,
        ),
        const SizedBox(height: 16),
        _clinicSelector(),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _busy ? null : _loadGuidance,
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.directions),
          label: const Text('Get clinic directions'),
        ),
        if (guidance != null) ...<Widget>[
          const SizedBox(height: 16),
          _infoCard(
            title: guidance['clinicName']?.toString() ?? 'Selected clinic',
            body: guidance['message']?.toString() ?? 'No guidance message was provided.',
            icon: Icons.location_on_outlined,
          ),
          if (location is Map) ...<Widget>[
            const SizedBox(height: 12),
            _infoCard(
              title: 'Location details',
              body: <String>[
                if (location['buildingName'] != null && location['buildingName'].toString().isNotEmpty)
                  'Building: ${location['buildingName']}',
                if (location['floorLabel'] != null && location['floorLabel'].toString().isNotEmpty)
                  'Floor: ${location['floorLabel']}',
                if (location['roomNumber'] != null && location['roomNumber'].toString().isNotEmpty)
                  'Room: ${location['roomNumber']}',
                if (location['directions'] != null && location['directions'].toString().isNotEmpty)
                  location['directions'].toString(),
              ].join('\n'),
              icon: Icons.apartment_outlined,
            ),
          ],
        ],
        const SizedBox(height: 16),
        const Text(
          'Directions depend on the clinic configuration stored in the database. Demo room information must be verified by EVMC before real-world use.',
          style: TextStyle(color: Colors.black54, fontSize: 12),
        ),
      ],
    );
  }

  Widget _welcomeCard() {
    return Card(
      color: const Color(0xFFE8F4F7),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: <Widget>[
            const CircleAvatar(
              radius: 26,
              backgroundColor: Color(0xFF16324F),
              child: Icon(Icons.local_hospital_outlined, color: Colors.white, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const <Widget>[
                  Text('Welcome to Q-Guide', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  SizedBox(height: 4),
                  Text('Check in, receive a queue ticket, and view clinic directions.'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _patientCard() {
    final patient = _patient!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Row(
              children: <Widget>[
                Icon(Icons.verified_user, color: Colors.green),
                SizedBox(width: 8),
                Text('Patient profile verified', style: TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 12),
            Text(patient['fullName']?.toString() ?? 'Patient', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            SelectableText('Patient code: ${patient['patientCode'] ?? ''}'),
            const SizedBox(height: 8),
            const Text(
              'Keep this code private. This prototype holds the verified profile in memory only for the current app session.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }

  Widget _clinicSelector() {
    if (_loadingClinics) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    if (_clinics.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(_clinicError ?? 'No active clinics were returned by the API.'),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _busy ? null : _loadClinics,
                icon: const Icon(Icons.refresh),
                label: const Text('Refresh clinics'),
              ),
            ],
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: DropdownButtonFormField<String>(
          value: _clinics.any((clinic) => clinic['clinicCode'] == _selectedClinicCode)
              ? _selectedClinicCode
              : null,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Choose OPD clinic',
            prefixIcon: Icon(Icons.local_hospital_outlined),
          ),
          items: _clinics.map((clinic) {
            final code = clinic['clinicCode']?.toString() ?? '';
            final name = clinic['clinicName']?.toString() ?? code;
            return DropdownMenuItem<String>(
              value: code,
              child: Text('$name ($code)', overflow: TextOverflow.ellipsis),
            );
          }).toList(),
          onChanged: _busy ? null : (value) {
            setState(() {
              _selectedClinicCode = value;
              _guidanceResult = null;
            });
          },
        ),
      ),
    );
  }

  Widget _ticketCard(
    Map<String, dynamic> ticket,
    Map<String, dynamic>? clinic,
  ) {
    final status = ticket['status']?.toString() ?? 'UNKNOWN';
    final token = ticket['tokenNumber']?.toString() ?? 'Ticket pending';
    final clinicName = clinic?['clinicName']?.toString() ??
        ticket['clinicName']?.toString() ?? 'OPD clinic';

    return Card(
      color: const Color(0xFFEAF5F1),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            const Icon(Icons.confirmation_number, size: 38, color: Color(0xFF167D8D)),
            const SizedBox(height: 8),
            const Text('YOUR QUEUE NUMBER', style: TextStyle(fontSize: 12, letterSpacing: 1.2)),
            const SizedBox(height: 4),
            Text(token, style: const TextStyle(fontSize: 34, fontWeight: FontWeight.bold, color: Color(0xFF16324F))),
            const SizedBox(height: 10),
            Text(clinicName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
            const SizedBox(height: 10),
            Chip(label: Text(status.replaceAll('_', ' '))),
            const SizedBox(height: 4),
            Text('Queue date: ${ticket['queueDate'] ?? 'Not available'}'),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF16324F))),
    );
  }

  Widget _infoCard({required String title, required String body, required IconData icon}) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon, color: const Color(0xFF167D8D), size: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 6),
                  Text(body.isEmpty ? 'No additional details configured.' : body),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorCard(String message) {
    return Card(
      color: const Color(0xFFFFF1F0),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Text(message, style: const TextStyle(color: Color(0xFF9D2525))),
      ),
    );
  }
}
