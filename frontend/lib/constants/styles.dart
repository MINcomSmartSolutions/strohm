import 'dart:io';

import 'package:flutter/material.dart';

class Styles {
  static Paddings paddings = Paddings();

  /// See: https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
  static double smoothness = 0.6;

  /// Recommended border radius overall
  static get borderRadius => BorderRadius.circular(22);

  /// Recommended border radius for buttons
  static get buttonBorderRadius => BorderRadius.circular(13);

  /// Recommended spacing between elements. See: Paddings
  static double gridSpacing = 8.0;
}

class Paddings {
  const Paddings();

  /// 8: Small
  static double paddingS = 8.0;

  /// 16: Medium
  static double paddingM = 16.0;

  /// 24: Large
  static double paddingL = 24.0;

  /// 32: Extra Large
  static double paddingXL = 32.0;

  /// 64: Extra Extra Large
  static double paddingXXL = 64.0;
}

class TextStyles {
  static TextStyle get h1 => TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.w700,
      );

  static TextStyle get h2 => TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w700,
      );

  static TextStyle get h3 => TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get h4 => TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
      );

  static TextStyle get h5 => TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w500,
      );

  static TextStyle get body1 => TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get body2 => TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get body3 => TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get body4 => TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get pageTitle => TextStyle(
        fontSize: 20,
        fontWeight: Platform.isIOS ? FontWeight.w600 : FontWeight.w500,
      );

  static TextStyle get buttonTitle => TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get caption => TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get header => TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w400,
        // color: Styles.customColors.white.withAlpha(150),
      );

  static TextStyle get listItem => TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.normal,
        color: Colors.white,
      );

  static TextStyle get listItemSubtitle => TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.normal,
      );

  static TextStyle textInput({Color? color}) => TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.normal,
        color: color,
      );

  static TextStyle modelTitle({Color? color}) => TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        letterSpacing: Platform.isIOS ? -0.43 : 0,
        color: color,
      );

  static TextStyle modelSubtitle = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.normal,
  );

  static TextStyle modelDefaultAction = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w600,
    letterSpacing: Platform.isIOS ? -0.43 : 0,
  );

  static TextStyle modelSecondaryAction = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.normal,
  );

  static TextStyle appTitle = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w500,
  );
}
