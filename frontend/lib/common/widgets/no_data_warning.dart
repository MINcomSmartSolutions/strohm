import 'package:auto_size_text/auto_size_text.dart';
import 'package:flutter/material.dart';

class NoDataWarning extends StatelessWidget {
  const NoDataWarning({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.warning_rounded,
            color: Colors.red,
            size: 50,
          ),
          AutoSizeText('Beim Laden der Daten ist ein Problem aufgetreten.',
              style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}
