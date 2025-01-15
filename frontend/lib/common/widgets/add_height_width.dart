import 'package:flutter/material.dart';

/// A widget that adds a fixed height to its child.
class addHeight extends StatelessWidget {
  /// The height to be added to the child.
  final double height;

  const addHeight(this.height, {Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SizedBox(height: height);
  }
}

/// A widget that adds a fixed width to its child.
class addWidth extends StatelessWidget {
  /// The width to be added to the child.
  final double width;

  const addWidth(this.width, {Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SizedBox(width: width);
  }
}

class Filler extends StatelessWidget {
  const Filler({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox.shrink();
  }
}
