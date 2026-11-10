"""Build the iPad (no Claude account) version of the register.

Usage: python build-ipad.py [menu_json_dir] [output_dir]
  menu_json_dir: folder with one JSON file per menu item (default ./menu)
  output_dir:    defaults to ./ipad  (writes index.html there)

The iPad version keeps every sale, setting and change on that device only (browser storage)
and is protected by Cloudflare Access (only the owner's email gets in), so the page has no login of its own.
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Safari on iPad ignores user-scalable=no, so block its pinch gestures and double-tap zoom directly.
NO_ZOOM_JS = ("['gesturestart','gesturechange','gestureend'].forEach(function(t){document.addEventListener(t,function(e){e.preventDefault();},{passive:false});});"
              "document.addEventListener('touchmove',function(e){if(e.touches.length>1||(e.scale&&e.scale!==1))e.preventDefault();},{passive:false});"
              "document.addEventListener('dblclick',function(e){e.preventDefault();},{passive:false});")
SRC = os.path.join(HERE, 'caja-madrugada.html')

def load_menu(folder):
    items = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.json'):
            continue
        with open(os.path.join(folder, name), encoding='utf-8') as fh:
            doc = json.load(fh)
        doc = doc.get('data', doc)
        doc['id'] = name[:-5]
        items.append(doc)
    return items

def main():
    menu = load_menu(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'menu'))
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'ipad')
    with open(SRC, encoding='utf-8') as fh:
        page = fh.read()
    marker = "menu: LS.get('menu', [])"
    if page.count(marker) != 1:
        sys.exit('No encontré dónde poner el menú en caja-madrugada.html')
    # The iPad keeps its own copy of the menu. When a new build ships a different menu, take the new one
    # but keep what was switched on/off on the iPad and any product added there.
    menu_json = json.dumps(menu, ensure_ascii=False, sort_keys=True)
    version = hashlib.sha256(menu_json.encode('utf-8')).hexdigest()[:12]
    merge = ("menu: (function(){ const E = " + menu_json + ", V = '" + version + "'; "
             "const saved = LS.get('menu', null); if (saved && LS.get('menuV', '') === V) return saved; "
             "const out = E.map(e => { const o = saved && saved.find(s => s.id === e.id); "
             "return o && typeof o.off === 'boolean' ? { ...e, off: o.off } : e; }); "
             # keep only products added on the iPad itself (random ids); built-in ids like a07 that a build removed stay removed
             "if (saved) for (const s of saved) if (!/^[a-z]\\d{2}$/.test(s.id) && !E.some(e => e.id === s.id)) out.push(s); "
             "LS.set('menu', out); LS.set('menuV', V); return out; })()")
    page = page.replace(marker, merge)
    page = page.replace('<title>Caja de Madrugada</title>', '', 1)
    head = (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover">'
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-title" content="NP6">'
        '<meta name="robots" content="noindex,nofollow">'
        '<title>NP6</title>'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}'
        # iPad: no pinch or double-tap zoom, every tap counts, no text selection or callout on long press,
        # and inputs at 16px so Safari does not zoom in when one gets focus.
        'html,body{touch-action:manipulation;-webkit-text-size-adjust:100%;overscroll-behavior:none}'
        'button,.tile,.key,.digit,.tab,nav{touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}'
        'input,select,textarea{font-size:16px!important}</style>'
        '<script>window.CM_STANDALONE = true;' + NO_ZOOM_JS + '</script>'
        '</head><body>'
    )
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'index.html')
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(head + page + '</body></html>')
    print(f'{len(menu)} productos -> {out}')

if __name__ == '__main__':
    main()
