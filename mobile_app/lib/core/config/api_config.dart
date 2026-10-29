class ApiConfig {
  // Android Emulator reaches the host computer through 10.0.2.2.
  // Override when running on a physical phone or a different environment:
  // flutter run --dart-define=QGUIDE_API_BASE_URL=http://192.168.1.10:3000/api
  static const String baseUrl = String.fromEnvironment(
    'QGUIDE_API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );

  static const Duration requestTimeout = Duration(seconds: 15);
}
