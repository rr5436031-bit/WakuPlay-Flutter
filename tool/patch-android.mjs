// Dipanggil setelah `flutter create`: pasang kode Kotlin/manifest/resource WakuPlay dan sesuaikan Gradle.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const and = path.join(root, 'android')
const app = path.join(and, 'app')
if (!fs.existsSync(app)) { console.error('patch-android: folder android/app belum ada (jalankan flutter create dulu)'); process.exit(1) }

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name)
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d)
  }
}

// 1) buang MainActivity bawaan & tema malam bawaan, lalu timpa dengan milik WakuPlay
fs.rmSync(path.join(app, 'src', 'main', 'kotlin'), { recursive: true, force: true })
fs.rmSync(path.join(app, 'src', 'main', 'java'), { recursive: true, force: true })
fs.rmSync(path.join(app, 'src', 'main', 'res', 'values-night'), { recursive: true, force: true })
fs.rmSync(path.join(app, 'src', 'main', 'res', 'drawable-v21'), { recursive: true, force: true })
copyDir(path.join(root, 'android_overlay', 'app', 'src', 'main'), path.join(app, 'src', 'main'))
console.log('patch-android: Kotlin, manifest, resource, ikon terpasang')

// 2) Gradle (Groovy atau Kotlin DSL)
const gf = ['build.gradle.kts', 'build.gradle'].map((n) => path.join(app, n)).find((p) => fs.existsSync(p))
if (!gf) { console.error('patch-android: build.gradle app tidak ditemukan'); process.exit(1) }
const kts = gf.endsWith('.kts')
let g = fs.readFileSync(gf, 'utf8')

g = g.replace(/namespace\s*=?\s*"[^"]*"/, kts ? 'namespace = "com.wakuplay.app"' : 'namespace "com.wakuplay.app"')
g = g.replace(/applicationId\s*=?\s*"[^"]*"/, kts ? 'applicationId = "com.wakuplay.app"' : 'applicationId "com.wakuplay.app"')
g = g.replace(/minSdk(Version)?\s*=?\s*flutter\.minSdkVersion/, kts ? 'minSdk = 24' : 'minSdkVersion 24')

if (!g.includes('wakuplay-sign')) {
  const block = kts
    ? `    // wakuplay-sign: pakai kunci yang sama seperti APK Capacitor lama (~/.wakuplay) supaya login Google & update tetap jalan
    signingConfigs {
        val wpf = java.io.File(System.getProperty("user.home"), ".wakuplay/sign.properties")
        if (wpf.exists()) {
            val wp = java.util.Properties().apply { wpf.inputStream().use { load(it) } }
            create("wakuplay") {
                storeFile = file(wp.getProperty("storeFile"))
                storePassword = wp.getProperty("storePassword")
                keyAlias = wp.getProperty("keyAlias")
                keyPassword = wp.getProperty("keyPassword")
            }
        }
    }

`
    : `    // wakuplay-sign: pakai kunci yang sama seperti APK Capacitor lama (~/.wakuplay) supaya login Google & update tetap jalan
    signingConfigs {
        def wpf = new File(System.getProperty("user.home"), ".wakuplay/sign.properties")
        if (wpf.exists()) {
            def wp = new Properties()
            wpf.withInputStream { wp.load(it) }
            wakuplay {
                storeFile file(wp['storeFile'])
                storePassword wp['storePassword']
                keyAlias wp['keyAlias']
                keyPassword wp['keyPassword']
            }
        }
    }

`
  g = g.replace(/(\n\s*)buildTypes\s*\{/, (m, ws) => '\n' + block + ws.replace(/^\n/, '') + 'buildTypes {')
  const rel = kts ? 'signingConfig = signingConfigs.findByName("wakuplay") ?: signingConfigs.getByName("debug")' : 'signingConfig signingConfigs.findByName("wakuplay") ?: signingConfigs.debug'
  g = g.replace(/signingConfig\s*=?\s*signingConfigs\.(debug|getByName\("debug"\))/, rel)
}
fs.writeFileSync(gf, g)
console.log('patch-android: ' + path.basename(gf) + ' disesuaikan (applicationId com.wakuplay.app, minSdk 24, penandatanganan)')
