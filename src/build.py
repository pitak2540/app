import json
img = json.load(open('img.json'))
s = open('page.src.html', encoding='utf-8').read()
s = s.replace('/*CORE*/', open('core.js', encoding='utf-8').read() + '\n' + open('core2.js', encoding='utf-8').read() + '\n' + open('dict.js', encoding='utf-8').read() + '\n' + open('dict2.js', encoding='utf-8').read() + '\n' + open('mt.js', encoding='utf-8').read() + '\n' + open('fr8x8.js', encoding='utf-8').read())
for k in ('LOGO', 'BANNER'):
    s = s.replace('__%s__' % k, img[k])
ort = open('ortpk2/package/dist/ort.wasm.bundle.min.mjs', encoding='utf-8').read()
assert '</script' not in ort
open('rom-studio.html', 'w', encoding='utf-8').write(s.replace('<!--ORT-->', ''))
glue = open('ortpk2/package/dist/ort-wasm-simd-threaded.mjs', encoding='utf-8').read()
assert '</script' not in glue
s = s.replace('<!--ORT-->', '<script type="text/plain" id="ortsrc">' + ort + '</script>\n<script type="text/plain" id="ortglue">' + glue + '</script>')
local = ('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
         '<link rel="icon" href="%s"><style>body{margin:0}[hidden]{display:none!important}img{max-width:100%%}</style></head><body>\n%s\n</body></html>') % (img['FAVICON'], s)
open('90S Thai ROM Studio.html', 'w', encoding='utf-8').write(local)
print(len(s), len(local))
