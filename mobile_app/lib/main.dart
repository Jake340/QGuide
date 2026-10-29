import 'package:flutter/material.dart';

import 'features/patient_home_screen.dart';

void main() {
  runApp(const QGuideApp());
}

class QGuideApp extends StatelessWidget {
  const QGuideApp({super.key});

  @override
  Widget build(BuildContext context) {
    const navy = Color(0xFF16324F);
    const teal = Color(0xFF167D8D);

    return MaterialApp(
      title: 'Q-Guide',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: teal,
          primary: navy,
          secondary: teal,
          surface: const Color(0xFFF7FAFC),
        ),
        scaffoldBackgroundColor: const Color(0xFFF7FAFC),
        appBarTheme: const AppBarTheme(
          backgroundColor: navy,
          foregroundColor: Colors.white,
          centerTitle: false,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFD7E1EA)),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 14,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: Color(0xFFE1EAF0)),
          ),
        ),
      ),
      home: const PatientHomeScreen(),
    );
  }
}
