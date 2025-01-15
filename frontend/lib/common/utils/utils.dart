Map<String, dynamic> transformResultData(Map<String, dynamic> data, Map<String, dynamic> defaultValues) {
  return defaultValues.map((key, defaultValue) {
    return MapEntry(key, data[key] ?? defaultValue);
  });
}
