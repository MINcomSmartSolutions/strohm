import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../constants/styles.dart';
import '../services/logger_service.dart';
import '../services/navigator_key.dart';
import '../services/snackbar_key.dart';
import 'add_height_width.dart';

enum SnackBarType { error, warning, success, info }

/// A class that provides a global snackbar to display messages to the user.
class GlobalSnackBar {
  /// Creates a new instance of [GlobalSnackBar].
  ///
  /// The [message] parameter is required and specifies the message to be displayed in the snackbar.
  /// The [type] parameter specifies the type of snackbar to be displayed.
  GlobalSnackBar({
    required this.msg,
    required this.type,
  });

  final String msg;
  final SnackBarType type;

  // Static variables to track the last displayed message and time
  static String? _lastMessage;
  static DateTime? _lastMessageTime;
  static const Duration _minInterval = Duration(seconds: 5);

  /// Displays a global snackbar with the specified [message] and optional parameters.
  static void show({required String msg, required SnackBarType type}) {
    // Check if the message is the same and if the interval has passed
    final now = DateTime.now();
    if (_lastMessage == msg && _lastMessageTime != null) {
      final timeSinceLastMessage = now.difference(_lastMessageTime!);
      if (timeSinceLastMessage < _minInterval) {
        return; // Do not show the SnackBar
      }
    }

    // Update the tracking variables
    _lastMessage = msg;
    _lastMessageTime = now;

    IconData icon;
    Color? backgroundColor;
    switch (type) {
      case SnackBarType.error:
        icon = Icons.error;
        backgroundColor = Theme.of(snackbarKey.currentContext!).colorScheme.error;
        break;
      case SnackBarType.warning:
        icon = Icons.warning;
        backgroundColor = const Color(0xffF6A609);
        break;
      case SnackBarType.success:
        icon = Icons.check_circle;
        backgroundColor = const Color(0xff2AC769);
        break;
      case SnackBarType.info:
        icon = Icons.info;
        backgroundColor = const Color(0xff10b5e6);
        break;
    }

    var themeColor = type == SnackBarType.error
        ? Theme.of(snackbarKey.currentContext!).colorScheme.onError
        : Theme.of(snackbarKey.currentContext!).colorScheme.surface;

    snackbarKey.currentState?.showSnackBar(
      SnackBar(
        duration: Duration(seconds: type == SnackBarType.warning ? 15 : 10),
        clipBehavior: Clip.antiAlias,
        behavior: SnackBarBehavior.floating,
        content: Row(
          children: [
            Icon(
              icon,
              color: themeColor,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                msg,
                maxLines: 3,
                style: TextStyle(
                  color: themeColor,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: backgroundColor,
      ),
    );
  }
}
