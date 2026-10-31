// Samakan pubspec.yaml dengan hasil build web: versi dari webapp/package.json + daftar folder aset (Flutter tidak rekursif).
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'webapp', 'package.json'), 'utf8'))
const [a, b, c] = String(pkg.version).split('.').map((n) => parseInt(n, 10) || 0)
const code = a * 10000 + b * 100 + c // sama seperti update.sh lama: 1.5.9 -> 10509
const www = path.join(root, 'assets', 'www')
if (!fs.existsSync(path.join(www, 'index.html'))) { console.error('sync-pubspec: assets/www/index.html tidak ada (build web dulu)'); process.exit(1) }

const dirs = []
const walk = (d) => {
  dirs.push(path.relative(root, d).split(path.sep).join('/') + '/')
  for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) walk(path.join(d, e.name))
}
walk(www)

const f = path.join(root, 'pubspec.yaml')
let y = fs.readFileSync(f, 'utf8')
y = y.replace(/^version:.*$/m, `version: ${pkg.version}+${code}`)
y = y.replace(/(# WP-ASSETS-BEGIN[^\n]*\n)[\s\S]*?(\s*# WP-ASSETS-END)/, (_, s, e) => s + dirs.map((d) => `    - ${d}\n`).join('') + e.replace(/^\n/, ''))
fs.writeFileSync(f, y)
console.log(`sync-pubspec: versi ${pkg.version}+${code}, ${dirs.length} folder aset`)
