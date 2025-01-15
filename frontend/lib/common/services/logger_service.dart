/// This file contains the logger service which initializes the Talker package for logging purposes.
import 'dart:developer';

// 📦 Package imports:
import 'package:talker_flutter/talker_flutter.dart';

final talker = TalkerFlutter.init(
  logger: TalkerLogger(
    output: log, // or log
    settings: TalkerLoggerSettings(),
  ),
);
