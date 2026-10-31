import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:google_sign_in/google_sign_in.dart';

const int _kPort = 8080;
const String _kHome = 'http://localhost:$_kPort/index.html';
const Color _kBg = Color(0xFF111214);

/// Jalur ke modul Kotlin (PiP, notifikasi, pembayaran, GIF ke link, notifikasi lokal).
const MethodChannel _native = MethodChannel('com.wakuplay.app/native');

/// Aplikasi web hasil build (assets/www) disajikan lokal, jadi tetap jalan offline-first seperti APK sebelumnya.
final InAppLocalhostServer _server = InAppLocalhostServer(port: _kPort, documentRoot: 'assets/www');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _server.start();
  runApp(const WakuApp());
}

class WakuApp extends StatelessWidget {
  const WakuApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'WakuPlay',
        theme: ThemeData(scaffoldBackgroundColor: _kBg, brightness: Brightness.dark),
        home: const WebHost(),
      );
}

class WebHost extends StatefulWidget {
  const WebHost({super.key});

  @override
  State<WebHost> createState() => _WebHostState();
}

class _WebHostState extends State<WebHost> with WidgetsBindingObserver {
  InAppWebViewController? _web;
  bool _loaded = false;
  final List<String> _queue = <String>[];
  GoogleSignIn? _gsi;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _native.setMethodCallHandler(_fromNative);
    _native.invokeMethod<void>('App.ready').catchError((Object _) {});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _emit('App', 'resume', '{}');
  }

  // ---- native/Dart -> JS -------------------------------------------------
  void _emit(String plugin, String event, String json) {
    final js = 'window.__wpEmit&&window.__wpEmit(${jsonEncode(plugin)},${jsonEncode(event)},$json)';
    final c = _web;
    if (c == null || !_loaded) {
      _queue.add(js);
      if (_queue.length > 50) _queue.removeAt(0);
    } else {
      c.evaluateJavascript(source: js);
    }
  }

  Future<dynamic> _fromNative(MethodCall call) async {
    if (call.method == 'event') {
      final a = Map<String, dynamic>.from(call.arguments as Map);
      _emit(a['plugin'] as String, a['event'] as String, (a['json'] as String?) ?? '{}');
    }
    return null;
  }

  // ---- JS -> Dart/Kotlin ---------------------------------------------------
  Future<dynamic> _handle(List<dynamic> a) async {
    final plugin = a[0] as String;
    final method = a[1] as String;
    final args = (a.length > 2 && a[2] is Map) ? Map<String, dynamic>.from(a[2] as Map) : <String, dynamic>{};
    try {
      switch (plugin) {
        case 'Http':
          return await _httpGet(args);
        case 'SocialLogin':
          return await _social(method, args);
        case 'App':
          if (method == 'exitApp') {
            await SystemNavigator.pop();
            return <String, dynamic>{};
          }
          break;
      }
      final r = await _native.invokeMethod<dynamic>('$plugin.$method', args);
      return r ?? <String, dynamic>{};
    } on PlatformException catch (e) {
      return <String, dynamic>{'__error': e.message ?? e.code};
    } catch (e) {
      return <String, dynamic>{'__error': e.toString()};
    }
  }

  /// Pengganti CapacitorHttp.get: ambil gambar lewat Dart (tanpa batasan CORS), kirim balik base64.
  Future<Map<String, dynamic>> _httpGet(Map<String, dynamic> a) async {
    final client = HttpClient()
      ..connectionTimeout = Duration(milliseconds: (a['connectTimeout'] as num?)?.toInt() ?? 15000)
      ..autoUncompress = true;
    try {
      final read = Duration(milliseconds: (a['readTimeout'] as num?)?.toInt() ?? 20000);
      final req = await client.getUrl(Uri.parse(a['url'] as String));
      final hs = a['headers'];
      if (hs is Map) hs.forEach((k, v) => req.headers.set(k.toString(), v.toString()));
      final res = await req.close().timeout(read);
      final bb = BytesBuilder(copy: false);
      await for (final chunk in res.timeout(read)) {
        bb.add(chunk);
      }
      final headers = <String, String>{};
      res.headers.forEach((n, v) => headers[n] = v.join(','));
      final ct = headers['content-type'];
      if (ct != null) headers['Content-Type'] = ct;
      return <String, dynamic>{
        'status': res.statusCode,
        'headers': headers,
        'data': base64Encode(bb.takeBytes()),
        'url': a['url'],
      };
    } finally {
      client.close(force: true);
    }
  }

  // ---- Login Google (pengganti @capgo/capacitor-social-login) ------------------
  Future<Map<String, dynamic>> _social(String m, Map<String, dynamic> a) async {
    switch (m) {
      case 'initialize':
        final g = a['google'];
        final id = (g is Map) ? g['webClientId']?.toString() : null;
        _gsi = GoogleSignIn(scopes: const <String>['email', 'profile'], serverClientId: id);
        return <String, dynamic>{};
      case 'login':
        _gsi ??= GoogleSignIn(scopes: const <String>['email', 'profile']);
        final acc = await _gsi!.signIn();
        if (acc == null) return <String, dynamic>{'__error': 'Login Google dibatalkan'};
        return _socialResult(acc);
      case 'refresh':
        _gsi ??= GoogleSignIn(scopes: const <String>['email', 'profile']);
        final acc = await _gsi!.signInSilently();
        if (acc == null) return <String, dynamic>{'__error': 'Belum ada sesi Google'};
        return _socialResult(acc);
      case 'logout':
        try {
          await _gsi?.signOut();
        } catch (_) {}
        return <String, dynamic>{};
    }
    return <String, dynamic>{'__error': 'metode tidak dikenal'};
  }

  Future<Map<String, dynamic>> _socialResult(GoogleSignInAccount acc) async {
    final auth = await acc.authentication;
    return <String, dynamic>{
      'provider': 'google',
      'result': <String, dynamic>{
        'idToken': auth.idToken,
        'accessToken': <String, dynamic>{'token': auth.accessToken},
        'profile': <String, dynamic>{'id': acc.id, 'email': acc.email, 'name': acc.displayName, 'imageUrl': acc.photoUrl},
      },
    };
  }

  void _openExternal(String url) {
    _native.invokeMethod<void>('App.openUrl', <String, dynamic>{'url': url}).catchError((Object _) {});
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _emit('App', 'backButton', '{}');
      },
      child: Scaffold(
        backgroundColor: _kBg,
        resizeToAvoidBottomInset: true,
        body: InAppWebView(
          initialUrlRequest: URLRequest(url: WebUri(_kHome)),
          initialUserScripts: UnmodifiableListView<UserScript>(<UserScript>[
            UserScript(source: 'window.__WP_FLUTTER__=true;', injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START),
          ]),
          initialSettings: InAppWebViewSettings(
            javaScriptEnabled: true,
            domStorageEnabled: true,
            databaseEnabled: true,
            mediaPlaybackRequiresUserGesture: false,
            allowsInlineMediaPlayback: true,
            useShouldOverrideUrlLoading: true,
            supportMultipleWindows: true,
            javaScriptCanOpenWindowsAutomatically: false,
            supportZoom: false,
            builtInZoomControls: false,
            displayZoomControls: false,
            overScrollMode: OverScrollMode.NEVER,
            thirdPartyCookiesEnabled: true,
            allowFileAccess: false,
            allowContentAccess: true,
            mixedContentMode: MixedContentMode.MIXED_CONTENT_COMPATIBILITY_MODE,
            isInspectable: false,
          ),
          onWebViewCreated: (c) {
            _web = c;
            c.addJavaScriptHandler(handlerName: 'wp', callback: (args) => _handle(args));
          },
          onLoadStop: (c, url) {
            _loaded = true;
            for (final js in _queue) {
              c.evaluateJavascript(source: js);
            }
            _queue.clear();
          },
          shouldOverrideUrlLoading: (c, action) async {
            final uri = action.request.url;
            if (uri == null || !action.isForMainFrame) return NavigationActionPolicy.ALLOW;
            if (uri.host == 'localhost' || uri.host == '127.0.0.1') return NavigationActionPolicy.ALLOW;
            if (uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data') return NavigationActionPolicy.ALLOW;
            _openExternal(uri.toString());
            return NavigationActionPolicy.CANCEL;
          },
          onCreateWindow: (c, action) async {
            final u = action.request.url?.toString();
            if (u != null && u.isNotEmpty) _openExternal(u);
            return false;
          },
        ),
      ),
    );
  }
}
