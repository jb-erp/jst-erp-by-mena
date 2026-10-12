"""Join src/js/*.js into src/page.html.
dist/index.html : the claude.ai artifact (runtime supplied by claude.ai)
index.html      : the GitHub Pages version (src/standalone.js supplies the runtime: own Apify token, data in the browser)"""
import glob, pathlib
src = pathlib.Path(__file__).parent
root = src.parent
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(str(src / 'js' / '*.js'))))
app = "(() => {\n'use strict';\n" + js + "\n})();"
page = open(src / 'page.html', encoding='utf-8').read()
assert '/*__APP_JS__*/' in page
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(page.replace('/*__APP_JS__*/', app), encoding='utf-8')
sa = open(src / 'standalone.js', encoding='utf-8').read()
gh = page.replace('<script>\n/*__APP_JS__*/', '<script>\n' + sa + '\n</script>\n<script>\n/*__APP_JS__*/').replace('/*__APP_JS__*/', app)
head = '<!doctype html>\n<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
(root / 'index.html').write_text(head + gh.replace('<style>', '<style>\nhtml,body{height:100%}', 1) + '\n</html>\n', encoding='utf-8')
print('built dist/index.html and index.html')
