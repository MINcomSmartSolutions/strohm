import 'dart:io';

import 'package:flutter/foundation.dart';

class GlobalVariables {
  GlobalVariables._();

  static StorageAliases storageAliases = StorageAliases._();
  static RemoteAliases remoteAliases = RemoteAliases._();

  static bool isBackendReachable = true;

  static String remoteServerURI = '';
  static String localServerURI = Platform.isAndroid ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

  static bool forceRemote = false;
  static bool forceLocal = false;

  /// The base URI for the backend.
  /// If it's a debug build, the URI is set to localhost.
  ///   - Android emulator uses a different ip to access localhost.
  ///   - iOS simulator uses the same ip to access localhost.
  /// If it's a release build but not a GitHub Actions build, the URI is set to the production server.
  static String get baseUri {
    if (forceLocal) {
      return localServerURI;
    } else if (forceRemote) {
      return remoteServerURI;
    } else {
      if (kDebugMode) {
        return localServerURI;
      } else {
        return remoteServerURI;
      }
    }
  }

  /// The URI for user login.
  static String loginUriPlain = '/auth/user/signin';

  static String get loginUri => '$baseUri$loginUriPlain';

  /// The URI for updating user password.
  static String passwordChangeUriPlain = '/auth/user/password-update';

  static String get passwordChangeUri => '$baseUri$passwordChangeUriPlain';

  static String refreshTokenUriPlain = '/auth/user/refresh-token';

  static String get refreshTokenUri => '$baseUri$refreshTokenUriPlain';
}

class StorageAliases {
  const StorageAliases._();

  static const String accessToken = 'access-token';
  static const String refreshToken = 'refresh-token';
  static const String email = 'email';
}

class RemoteAliases {
  const RemoteAliases._();

  static const String accessToken = 'access';
  static const String refreshToken = 'refresh';
  static const String email = 'email';
}
