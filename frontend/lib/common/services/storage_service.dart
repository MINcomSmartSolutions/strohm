/// This file contains the service that used to write to and read data from storage.
/// Secure storage used to store tokens and sensitive information. Still not considered to be fully secure as
/// tamper proof but we need to use something nonetheless.
///
/// Non-secure storage is for non-sensitive information that is using [GetStorage].
/// Which is significantly faster then the secure storage.
///
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_storage/get_storage.dart';

import '../../constants/global_variables.dart';
import 'error_handler.dart';
import 'global_navigator.dart';
import 'logger_service.dart';

/// A service class that provides methods for reading, writing and deleting data from storage.
class StorageService {
  StorageService._();

  /// A secure storage instance of FlutterSecureStorage.
  /// Used for storing sensitive information. e.g. tokens. It is an asynchronous operation.
  static final FlutterSecureStorage _secureStorage = FlutterSecureStorage();

  /// A GetStorage instance for storing key-value pairs.
  /// Get storage is used for non-sensitive information and it is a synchronous operations.
  static final GetStorage _getStorage = GetStorage();

  /// Writes a value to storage with the given key.
  ///
  /// If [secure] is true, the value is written to secure storage using the [_secureStorage] instance.
  /// If [secure] is false, the value is written to regular storage using the [_getStorage] instance.
  ///
  /// If [secure] is true and the app is in debug mode, the key and value are logged using the [talker.info] method.
  ///
  /// Throws an error if the write operation fails.
  static Future<void> write(String key, dynamic value, {bool secure = false}) async {
    if (kDebugMode) {
      talker.info('Writing to  ${secure ? 'secure' : 'local'} storage');
      talker.info('Key: $key \nValue: $value');
    }

    if (secure) {
      // Write value
      await _secureStorage.write(key: key, value: value);
    } else {
      await _getStorage.write(key, value);
    }
  }

  /// ASYNC
  /// Reads the value associated with the given [key] from the storage.
  /// If [secure] is true, the value is read from secure storage using the [_secureStorage] instance.
  /// If [secure] is false, the value is read from regular storage using the [_getStorage] instance.
  ///
  /// Returns the value associated with the given [key].
  static Future<dynamic> read(String key, {bool secure = false}) async {
    if (secure) {
      return await _secureStorage.read(key: key);
    } else {
      return await _getStorage.read(key);
    }
  }

  /// Deletes the value associated with the given [key] from the storage.
  ///
  /// If [secure] is true, the value will be deleted from the [_secureStorage].
  /// Otherwise, the value will be deleted from the [_getStorage] storage.
  static Future<void> delete(String key, {bool secure = false}) async {
    if (secure) {
      await _secureStorage.delete(key: key);
    } else {
      await _getStorage.remove(key);
    }
  }

  /// Clears all data from the secure storage and the local storage.
  /// Navigates to the login screen after clearing the data.
  /// Throws an exception if an error occurs during the clearing process.
  ///
  /// Whatever happens in the end, the user will be navigated to the login screen.
  static Future clearAllandLogout() async {
    if (kDebugMode) {
      talker.info('Clearing all data and logging out');
    }

    try {
      //TODO: Before delete all, blacklist the refresh token
      await _secureStorage.deleteAll();
      await _getStorage.erase();
    } catch (e, st) {
      customErrorHandler(FlutterErrorDetails(exception: e, stack: st, library: 'StorageService'));
    } finally {
      GlobalNavigator.navigateToLogin();
    }
  }

  /// Saves the user state to the device's storage.
  ///
  /// [id] is the user's ID.
  /// [email] is the user's email address.
  ///
  /// Throws an error if the write operation fails.
  static Future<void> saveUserState(int id, String email) async {
    await StorageService.write(
      'id',
      id,
    );
    await StorageService.write(
      'email',
      email,
    );
  }
}
