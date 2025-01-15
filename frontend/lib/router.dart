import 'package:flutter/material.dart';
import 'package:strohm/features/auth/screens/login_screen.dart';

Route<dynamic> generateRoute(RouteSettings routeSettings) {
  switch (routeSettings.name) {
    case LoginScreen.routeName:
      return MaterialPageRoute(
        settings: routeSettings,
        builder: (_) => LoginScreen(),
      );
    case '/':
      return MaterialPageRoute(
        settings: routeSettings,
        builder: (_) => const Placeholder(),
      );
    default:
      return MaterialPageRoute(
        settings: routeSettings,
        builder: (_) => const Placeholder(),
      );
  }
}
