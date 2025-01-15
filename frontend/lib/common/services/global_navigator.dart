/// A class that provides methods for showing alert dialogs and navigating to the login screen.
import 'package:strohm/common/services/navigator_key.dart';
import 'package:strohm/features/auth/screens/login_screen.dart';

class GlobalNavigator {
  static void navigateToLogin() {
    navigatorKey.currentState!.pushNamedAndRemoveUntil(LoginScreen.routeName, (route) => false);
  }
}
