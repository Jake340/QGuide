import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.statusCode,
    this.data,
  });

  final String message;
  final int? statusCode;
  final Map<String, dynamic>? data;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<Map<String, dynamic>> get(String path) async {
    return _send('GET', path);
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _send('POST', path, body: body);
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    late http.Response response;

    try {
      final headers = <String, String>{
        'Accept': 'application/json',
      };

      if (body != null) {
        headers['Content-Type'] = 'application/json; charset=UTF-8';
      }

      if (method == 'GET') {
        response = await _client
            .get(uri, headers: headers)
            .timeout(ApiConfig.requestTimeout);
      } else {
        response = await _client
            .post(uri, headers: headers, body: jsonEncode(body))
            .timeout(ApiConfig.requestTimeout);
      }
    } on ApiException {
      rethrow;
    } catch (error) {
      throw ApiException(
        'Could not connect to Q-Guide API at ${ApiConfig.baseUrl}. '
        'Check that the backend is running and the device API address is correct.',
      );
    }

    Map<String, dynamic> data;
    try {
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is Map<String, dynamic>) {
        data = decoded;
      } else {
        data = <String, dynamic>{};
      }
    } catch (_) {
      data = <String, dynamic>{};
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        data['message']?.toString() ??
            'The server returned HTTP ${response.statusCode}.',
        statusCode: response.statusCode,
        data: data,
      );
    }

    return data;
  }

  Future<List<Map<String, dynamic>>> getClinics() async {
    final data = await get('/clinics');
    final clinics = data['clinics'];
    if (clinics is! List) return <Map<String, dynamic>>[];
    return clinics
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<Map<String, dynamic>> registerPatient({
    required String fullName,
    required String dateOfBirth,
    String? contactNumber,
  }) {
    return post('/patients', <String, dynamic>{
      'fullName': fullName,
      'dateOfBirth': dateOfBirth,
      if (contactNumber != null && contactNumber.trim().isNotEmpty)
        'contactNumber': contactNumber.trim(),
    });
  }

  Future<Map<String, dynamic>> lookupPatient({
    required String patientCode,
    required String dateOfBirth,
  }) {
    return post('/patients/lookup', <String, dynamic>{
      'patientCode': patientCode,
      'dateOfBirth': dateOfBirth,
    });
  }

  Future<Map<String, dynamic>> checkIn({
    required String patientCode,
    required String dateOfBirth,
    required String clinicCode,
  }) {
    return post('/checkin', <String, dynamic>{
      'patientCode': patientCode,
      'dateOfBirth': dateOfBirth,
      'clinicCode': clinicCode,
      'arrivalMethod': 'MANUAL',
    });
  }

  Future<Map<String, dynamic>> getClinicGuidance(String clinicCode) {
    return get('/guidance/clinics/${Uri.encodeComponent(clinicCode)}');
  }

  Future<Map<String, dynamic>> getPatientQueueStatus({
    required String patientCode,
    required String dateOfBirth,
    required String tokenNumber,
    required String queueDate,
  }) {
    return post('/guidance/queue-status', <String, dynamic>{
      'patientCode': patientCode,
      'dateOfBirth': dateOfBirth,
      'tokenNumber': tokenNumber,
      'queueDate': queueDate,
    });
  }

  void close() {
    _client.close();
  }
}
