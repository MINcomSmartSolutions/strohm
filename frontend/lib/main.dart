import 'package:flutter/material.dart';
import 'package:strohm/router.dart';

import 'common/services/navigator_key.dart';

void main() {
  runApp(const StrohmApp());
}

class StrohmApp extends StatelessWidget {
  const StrohmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      onGenerateRoute: generateRoute,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Color(0xff4594c8)),
        useMaterial3: true,
      ),
      home: Scaffold(
          body: const Center(
        child: Text('STROHM'),
      )),
    );
  }
}
