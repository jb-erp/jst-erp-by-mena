"""Join src/js/*.js into one script inside src/page.html and write dist/index.html."""
import glob, pathlib
src = pathlib.Path(__file__).parent
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(str(src / 'js' / '*.js'))))
page = open(src / 'page.html', encoding='utf-8').read()
assert '/*__APP_JS__*/' in page
out = page.replace('/*__APP_JS__*/', "(() => {\n'use strict';\n" + js + "\n})();")
dst = src.parent / 'dist' / 'index.html'
dst.parent.mkdir(exist_ok=True)
dst.write_text(out, encoding='utf-8')
print('built', dst, len(out.encode()), 'bytes')
