///
/// This file contains the implementation of the [DioSingleton] class and the [AppInterceptors] class.
///
/// The [DioSingleton] class is a singleton class that provides a single instance of the [Dio] class
/// with pre-configured interceptors for making HTTP requests.
///
/// The [AppInterceptors] class is an implementation of the [Interceptor] class that adds headers to
/// outgoing requests and handles responses and errors from the server.
///
/// This file also imports other necessary classes and packages for making HTTP requests and handling errors.
import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:internet_connection_checker_plus/internet_connection_checker_plus.dart';
import 'package:talker_dio_logger/talker_dio_logger_interceptor.dart';
import 'package:talker_dio_logger/talker_dio_logger_settings.dart';

import '../../constants/global_variables.dart';
import '../widgets/snackbar_global.dart';
import 'error_handler.dart';
import 'logger_service.dart';
import 'storage_service.dart';

class DioSingleton {
  static final DioSingleton _instance = DioSingleton._internal();
  late final Dio dio;

  factory DioSingleton() {
    return _instance;
  }

  DioSingleton._internal() {
    dio = Dio(BaseOptions(
        validateStatus: (int? status) {
          return status! >= 200 && status < 300 || status == 304;
        },
        connectTimeout: Duration(seconds: 15), // 60 seconds
        receiveTimeout: Duration(seconds: 10) // 60 seconds
        ));
    dio.interceptors.add(AppInterceptors());
    if (kDebugMode) {
      dio.interceptors.add(TalkerDioLogger(
        talker: talker,
        settings: TalkerDioLoggerSettings(
          printResponseData: false,
          printResponseHeaders: false,
          printResponseMessage: false,
          printRequestData: true,
          printRequestHeaders: false,
        ),
      ));
    }
  }
}

class AppInterceptors extends Interceptor {
  /// Overrides the [onRequest] method for handling Dio request options before sending a request.
  ///
  /// This method is called before a request is sent using Dio. It sets the necessary headers,
  /// such as 'Content-Type' and 'x-access-token', for the request based on the provided [options].
  ///
  /// Parameters:
  /// - [options]: The Dio [RequestOptions] for the request being made.
  /// - [handler]: The [RequestInterceptorHandler] to control the request handling flow.
  ///
  /// Returns a [Future] that resolves to a dynamic result after handling the request options.
  @override
  Future<dynamic> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    bool isInternetReachable = true;

    if (!kDebugMode) {
      isInternetReachable = await InternetConnection().hasInternetAccess;
    }

    if (isInternetReachable == false) {
      talker.error('No internet access');
      return handler.reject(
          DioException(requestOptions: options, error: 'No internet access', type: DioExceptionType.connectionError));
    }

    var accessToken = await StorageService.read(StorageAliases.accessToken, secure: true);

    String path = options.path;

    /// Don't set access token header for login and refresh token requests
    if (path == GlobalVariables.loginUri ||
        path == GlobalVariables.refreshTokenUri ||
        path == GlobalVariables.localServerURI ||
        path == GlobalVariables.remoteServerURI) {
      talker.info('Login or refresh token request');
      options.headers.addAll({
        'Content-Type': 'application/json; charset=UTF-8',
        'Keep-Alive': 'timeout=5, max=100',
      });
      talker.info('Interceptor: Request headers set');
      return handler.next(options);
    } else {
      options.headers.addAll({
        'Content-Type': 'application/json; charset=UTF-8',
        'Keep-Alive': 'timeout=5, max=100',
        'Authorization': 'JWT $accessToken',
      });
      talker.info('Interceptor: Request headers set');
      return handler.next(options);
    }
  }

  /// Overrides the [onResponse] method for handling successful Dio responses.
  ///
  /// This method is called whenever a response is received from a Dio request.
  /// It handles the response based on the HTTP status code and response data.
  ///
  /// - If the HTTP status code is 200 (OK), it checks the success flag in the response data.
  ///   - If success is false, it shows an error message based on the response message.
  ///   - If the response message is 'Empty', it displays a specific error message.
  ///   - Otherwise, it displays a generic error message.
  /// - If the HTTP status code is null, it logs an error and rejects the response.
  ///
  /// Parameters:
  /// - [response]: The Dio [Response] received from the request.
  /// - [handler]: The [ResponseInterceptorHandler] to control the response handling flow.
  ///
  /// Returns a [Future] that resolves to a dynamic result based on the response handling actions.
  @override
  Future<dynamic> onResponse(Response response, ResponseInterceptorHandler handler) async {
    int statusCode = response.statusCode ?? 0;

    talker.info('onResponse interceptor');
    talker.info('Status Code: $statusCode');

    if (statusCode == 200) {
      dynamic data = response.data;
      bool success = data['success'] ?? false;
      String msg = data['msg'] ?? 'Something went wrong';

      if (data != null) {
        talker.info('There is a response and statusCode is 200 and data is not null');

        if (success != true) {
          if (msg == 'Empty') {
            talker.error('Unsuccessful: Show empty, error message');
            GlobalSnackBar.show(msg: 'Für diesen Datumsbereich sind keine Daten verfügbar', type: SnackBarType.error);
            return handler.reject(DioException(
              requestOptions: response.requestOptions,
              response: response,
            ));
          }

          /// Even though the response returned success other than true, we'll handle that where the request is called
          return handler.next(response);
        }
        handler.next(response);
      } else {
        //TODO: Refine
        talker.warning('There is no data in the response');
        handler.reject(DioException(
          requestOptions: response.requestOptions,
          response: response,
        ));
        return GlobalSnackBar.show(msg: 'Etwas ist schief gelaufen', type: SnackBarType.error);
      }
    } else if (statusCode == 304) {
      talker.info('Cache hit');
      return handler.next(response);
    } else {
      /// It should'nt have been reached here at all since we have validateStatus in DioSingleton
      talker.error('There is a response but not 200');
      handler.reject(DioException(
        requestOptions: response.requestOptions,
        response: response,
      ));
    }
  }

  /// Overrides the [onError] method for handling DioExceptions.
  ///
  /// This method is called whenever a DioException occurs during a network request.
  /// It handles various HTTP status codes and takes appropriate actions based on the error.
  ///
  /// - If the HTTP status code is 304 (Not Modified), cache hit continues as expected.
  /// - If the HTTP status code is 401 (Unauthorized), typically refresh the tokens.
  /// - If the HTTP status code is 500 (Internal Server Error), display an error message and handle the error.
  ///
  /// Parameters:
  /// - [err]: The DioException representing the error that occurred.
  /// - [handler]: The ErrorInterceptorHandler to control the error handling flow.
  ///
  /// Returns a [Future] that resolves to a dynamic result based on error handling actions.
  @override
  Future<dynamic> onError(DioException err, ErrorInterceptorHandler handler) async {
    int statusCode = err.response?.statusCode ?? 0;
    talker.error('onError interceptor');
    talker.error('Status Code: $statusCode');
    if (err.response != null) {
      if (statusCode != 0) {
        int? statusCode = err.response?.statusCode;
        if (statusCode == 304) {
          /// Cache read continue as expected. Dio treat 304 HTTP status code as error.
          ///    See: https://github.com/cfug/dio/issues/995
          return handler.next(err);
        } else if (statusCode == 401) {
          dynamic msg = err.response?.data['msg'] ?? 'Something went wrong';

          if (msg == 'Expired token') {
            talker.info('Refresh tokens');
            await NetworkService()
                .refreshTokens()
                .then((value) async => {handler.resolve(await NetworkService().retry(err.requestOptions))});
          } else if (msg == 'Expired refresh token') {
            GlobalSnackBar.show(msg: 'Bitte melde dich erneut an', type: SnackBarType.warning);
            sleep(Duration(seconds: 2));
            talker.info('Logout');
            //handler.reject(err);
            return await StorageService.clearAllandLogout();
          }
        } else if (statusCode == 404) {
          talker.error('404 at onError interceptor');
          GlobalSnackBar.show(msg: 'Etwas ist schief gelaufen', type: SnackBarType.error);
          customDioErrorHandler(err);
          return handler.resolve(
            Response(requestOptions: err.requestOptions, statusCode: 200, data: {
              'success': false,
            }),
          );
        } else if (statusCode == 500) {
          talker.error('500 at onError interceptor');
          GlobalSnackBar.show(msg: 'Etwas ist schief gelaufen', type: SnackBarType.error);
          customDioErrorHandler(err);
          return handler.resolve(
            Response(requestOptions: err.requestOptions, statusCode: 200, data: {
              'success': false,
            }),
          );
        } else if (statusCode == 400) {
          talker.error('400 at onError interceptor');
          GlobalSnackBar.show(msg: 'Etwas ist schief gelaufen', type: SnackBarType.error);
          customDioErrorHandler(err);
          return handler.resolve(
            Response(requestOptions: err.requestOptions, statusCode: 200, data: {
              'success': false,
            }),
          );
        }
      } else {
        talker.error('Connection couldnt be established.');
        GlobalVariables.isBackendReachable = false;
        handler.resolve(Response(requestOptions: err.requestOptions, statusCode: 200, data: {
          'success': false,
        }));
      }
    } else {
      talker.error('The server has not been reached at all. Possible client error.');
      handler.reject(err);
    }
  }
}

class NetworkService {
  late final Dio dio;

  NetworkService() {
    dio = DioSingleton().dio;
  }

  var baseUri = GlobalVariables.baseUri;

  /// Retries a failed network request using the provided [RequestOptions].
  /// Returns a [Future] that completes with a [Response] object.
  ///
  /// The [retry] method uses the [dio] instance to make a new request using the same
  /// path, data, method, and headers as the original request.
  ///
  /// Possible use case is sending request that failed in token authentication after refreshing tokens.
  Future<Response> retry(RequestOptions requestOptions) async {
    return await dio.request(
      requestOptions.path,
      data: requestOptions.data,
      options: Options(
        method: requestOptions.method,
        headers: requestOptions.headers,
      ),
    );
  }

  /// Sends a GET request to the specified URL with optional query parameters.
  ///
  /// Returns a [Response] object containing the response data.
  /// If an error occurs, a default error response is returned.
  ///
  /// Throws a [DioException] if the request fails due to a network error.
  /// Throws an [Exception] for any other type of error.
  Future get(String url, {Map<String, dynamic>? parameters, bool cacheDisable = false}) async {
    talker.info('GET request to $url');
    try {
      return await dio.get(
        url,
        queryParameters: parameters,
        // options: cacheDisable ? options.copyWith(policy: CachePolicy.refresh).toOptions() : null,
      );
    } on DioException catch (e) {
      customDioErrorHandler(e);
    } on Exception catch (e, st) {
      talker.error(e, st);
      customErrorHandler(FlutterErrorDetails(exception: e, stack: st, library: 'NetworkService GET'));
    }
  }

  /// Sends a POST request to the specified [url] with the given [data].
  ///
  /// If [specialHeaders] is not null, it adds the headers to the request headers.
  ///
  /// Returns a [Response] object containing the response data.
  Future post(String url, dynamic data, {Map<String, String>? specialHeaders}) async {
    try {
      return await dio.post(
        url,
        data: data,
        options: specialHeaders == null
            ? null
            : Options(
                headers: specialHeaders,
              ),
      );
    } on DioException catch (e) {
      customDioErrorHandler(e);
    } on Exception catch (e, st) {
      talker.error(e, st);
      customErrorHandler(FlutterErrorDetails(exception: e, stack: st, library: 'NetworkService POST'));
    }
  }

  /// Refreshes the access and refresh tokens by sending a post request to the server with the refresh token.
  /// If the request is successful, the new access and refresh tokens are stored in the secure storage.
  /// If the request fails, the user is logged out and all tokens are cleared from the secure storage.
  /// Returns a [Response] object with a boolean [success] value indicating whether the request was successful or not.
  Future refreshTokens() async {
    String refreshToken = await StorageService.read(StorageAliases.refreshToken, secure: true);
    try {
      Response result = await dio.post(
        GlobalVariables.refreshTokenUri,
        data: {
          'refreshToken': refreshToken,
        },
      );

      bool? success = result.data['success'] ?? false;

      if (success == true) {
        await StorageService.delete(StorageAliases.accessToken, secure: true);
        await StorageService.delete(StorageAliases.refreshToken, secure: true);
        await StorageService.write(StorageAliases.accessToken, result.data[RemoteAliases.accessToken], secure: true);
        await StorageService.write(StorageAliases.refreshToken, result.data[RemoteAliases.refreshToken], secure: true);
      } else {
        talker.error('Refreshing tokens response success != true, logging out');
        GlobalSnackBar.show(msg: 'Bitte melde dich erneut an', type: SnackBarType.warning);
        sleep(Duration(seconds: 4));

        talker.info('Cleanup');
        await StorageService.clearAllandLogout();
      }
    } on DioException catch (e, st) {
      talker.error('DioException at refreshTokens', st);
      customDioErrorHandler(e);
    } on Exception catch (e, st) {
      talker.error('Exception at refreshTokens', st);
      customErrorHandler(FlutterErrorDetails(exception: e, stack: st, library: 'NetworkService refreshTokens'));
    }
  }
}
