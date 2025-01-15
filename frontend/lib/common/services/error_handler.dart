/// This file contains the error handler service which handles errors and exceptions.
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../constants/global_variables.dart';
import '../widgets/snackbar_global.dart';
import 'logger_service.dart';

/// [CustomErrorWidget] is a stateless widget that displays details
/// about an error that occurred in the application.
class CustomErrorWidget extends StatelessWidget {
  /// Error details containing information about the exception.
  final FlutterErrorDetails errorDetails;

  /// Creates a custom error widget with the provided [FlutterErrorDetails].
  const CustomErrorWidget({super.key, required this.errorDetails});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Error Occurred')),
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              Text(
                'An unexpected error occurred.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 20),
              Text(
                'Error details: ${errorDetails.exceptionAsString()}',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Handles Flutter-specific errors and displays the custom error widget.
Future<void> customErrorHandler(FlutterErrorDetails details) async {
  // Logging the error and its stack trace.
  talker.error('Error: ${details.exception}');
  if (details.stack != null) {
    talker.error('Stack trace: ${details.stack}');
    talker.handle(details.exception, details.stack, 'Exception in');
  }

  // if (!kDebugMode || !Platform.environment.containsKey('FLUTTER_TEST')) {
  //   await Sentry.captureException(details.exception, stackTrace: details.stack);
  // }

  // Overriding the default error widget to show our custom error widget.
  if (!Platform.environment.containsKey('FLUTTER_TEST')) {
    ErrorWidget.builder = (errorDetails) => CustomErrorWidget(errorDetails: details);
  }
}

/// Handles Dio-specific errors and performs appropriate actions based on the error type.
Future<void> customDioErrorHandler(DioException dioError) async {
  talker.error('customDioErrorHandler Error: ${dioError.toString()}');
  if (!kDebugMode) {
    // await Sentry.captureException(dioError);
  }

  switch (dioError.type) {
    case DioExceptionType.connectionTimeout:
      talker.error('Connection timeout');
      // The server might be under load
      GlobalSnackBar.show(
        msg:
            'Zeitüberschreitung der Verbindung. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
        type: SnackBarType.error,
      );
      break;
    case DioExceptionType.sendTimeout:
      talker.error('Send timeout');
      GlobalSnackBar.show(
        msg:
            'Zeitüberschreitung der Verbindung. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
        type: SnackBarType.error,
      );
      break;
    case DioExceptionType.receiveTimeout:
      talker.error('Receive timeout');
      GlobalSnackBar.show(
          msg: 'Wir konnten keine Antwort vom Server erhalten. Bitte versuchen Sie es später erneut.',
          type: SnackBarType.error);
      break;
    case DioExceptionType.connectionError:
      if (dioError.error.toString().contains('Connection refused')) {
        talker.error('Backend is down');
        GlobalSnackBar.show(
            msg: 'Wir haben Probleme auf unserer Seite. Bitte versuchen Sie es zu einem späteren Zeitpunkt.',
            type: SnackBarType.error);
        break;
      } else {
        talker.error('Connection error');
        GlobalSnackBar.show(
            msg: 'Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
            type: SnackBarType.error);
        break;
      }
    case DioExceptionType.cancel:
      talker.error('Request cancelled');
      break;
    case DioExceptionType.badCertificate:
      talker.error('Bad certificate');
      GlobalSnackBar.show(
          msg: 'Ungültiges Zertifikat. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
          type: SnackBarType.error);
      break;
    case DioExceptionType.badResponse:
      talker.error('Bad response');
      talker.error('Response: ${dioError.response?.data}');
      GlobalSnackBar.show(
          msg: 'Wir haben Probleme auf unserer Seite. Bitte versuchen Sie es später erneut.', type: SnackBarType.error);
      break;
    case DioExceptionType.unknown:
      talker.warning('Unknown error');
      if (dioError.error.toString().contains('Connection refused')) {
        talker.error('Backend is down');
        GlobalVariables.isBackendReachable = false;
        GlobalSnackBar.show(
            msg: 'Wir haben Probleme auf unserer Seite. Bitte versuchen Sie es zu einem späteren Zeitpunkt.',
            type: SnackBarType.error);
        break;
      }
      if (dioError.response?.data is Map &&
          (dioError.response?.data['msg'] == null || dioError.response?.data['success'] == null)) {
        print(dioError.response?.data);
        talker.error('Unknown error');
        GlobalSnackBar.show(msg: 'Unbekannter Fehler. Bitte versuchen Sie es später erneut.', type: SnackBarType.error);
        break;
      }
  }
}
