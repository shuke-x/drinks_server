# Flutter 认证接入

当前仓库不含 Flutter 工程；以下文件可放入 Flutter 的 `lib/features/auth/`。依赖：`flutter_secure_storage`、`dio`、`flutter_riverpod`、`uuid`，以及一个**明确支持 RSA-OAEP SHA-256** 的 RSA 实现（例如基于 `pointycastle` 的封装）。不要用 SharedPreferences 存 token 或密码。

```dart
// token_storage.dart — iOS Keychain / Android Keystore
final class TokenStorage {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: false),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  Future<void> save(String access, String refresh) => Future.wait([
    _storage.write(key: 'access_token', value: access),
    _storage.write(key: 'refresh_token', value: refresh),
  ]).then((_) {});
  Future<String?> access() => _storage.read(key: 'access_token');
  Future<String?> refresh() => _storage.read(key: 'refresh_token');
  Future<void> clear() => _storage.deleteAll();
}
```

`AuthApi` 的登录/注册步骤：先 `GET /auth/challenge`，再将密码仅保存在当前方法的局部变量中，构建 payload 并加密。`rsaOaepSha256Encrypt` 必须以 PEM 公钥执行 **RSA-OAEP + SHA-256**；不可退化为 PKCS#1 v1.5 或 OAEP-SHA1。

```dart
Future<TokenPair> submit(String path, String email, String password, {String? name}) async {
  final challenge = (await dio.get('/auth/challenge')).data['data'];
  final payload = jsonEncode({
    'email': email, 'password': password, 'name': name,
    'nonce': challenge['nonce'], 'timestamp': DateTime.now().millisecondsSinceEpoch,
    'requestId': const Uuid().v4(),
  });
  final ciphertext = base64Encode(await rsaOaepSha256Encrypt(
    pem: challenge['publicKey'], plaintext: utf8.encode(payload),
  ));
  final data = (await dio.post(path, data: {
    'challengeId': challenge['challengeId'], 'ciphertext': ciphertext,
  })).data['data'];
  return TokenPair(data['accessToken'], data['refreshToken'], data['expiresIn']);
}
```

密码校验应在注册页提交前完成：

```dart
final passwordRule = RegExp(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$');
```

`AuthRepository` 只调用 `TokenStorage.save` 保存成功返回的两个 token。`user_store` 只放 `UserProfile`、`isLoggedIn`、收藏列表；绝不放 password/accessToken/refreshToken。认证按钮调用 `ref.read(authNotifierProvider.notifier).login(...)`，并在页面以 `state.isLoading` 复用现有莫比乌斯环 Loading；密码控制器在成功和失败后均 `clear()`。

下面的 Dio 拦截器保证 Authorization 自动添加，并让所有 401 请求只共享一次 refresh。`refreshDio` 没有这个拦截器，避免递归。

```dart
final class AuthInterceptor extends QueuedInterceptor {
  AuthInterceptor(this.api, this.storage, this.onExpired);
  final Dio api; final TokenStorage storage; final VoidCallback onExpired;
  Future<void>? _refreshing;
  @override Future<void> onRequest(RequestOptions o, RequestInterceptorHandler h) async {
    final token = await storage.access();
    if (token != null) o.headers['Authorization'] = 'Bearer $token';
    h.next(o);
  }
  @override Future<void> onError(DioException e, ErrorInterceptorHandler h) async {
    if (e.response?.statusCode != 401 || e.requestOptions.extra['retried'] == true) return h.next(e);
    try {
      _refreshing ??= _refresh(); await _refreshing;
      final retry = e.requestOptions..extra['retried'] = true;
      retry.headers['Authorization'] = 'Bearer ${await storage.access()}';
      h.resolve(await api.fetch(retry));
    } catch (_) { await storage.clear(); onExpired(); h.next(e); }
    finally { _refreshing = null; }
  }
  Future<void> _refresh() async {
    final refresh = await storage.refresh(); if (refresh == null) throw StateError('no refresh token');
    final data = (await refreshDio.post('/auth/refresh', data: {'refreshToken': refresh})).data['data'];
    await storage.save(data['accessToken'], data['refreshToken']);
  }
}
```

当 refresh 失败时，notifier 清空 `TokenStorage`、清空仅展示用的 `user_store`，并通过路由跳转 `/login`。登出时调用 `/auth/logout` 后也清空本地安全存储。

创建酒单页可使用 `isLoggedIn` 决定是否显示“私人酒单”开关。开关值仅作为此次 `POST /cocktails` 的 `isPrivate` 字段，不写入本地偏好；Dio 会自动携带 token。未登录时不要发送 `isPrivate`，服务端会按公开酒单创建。
