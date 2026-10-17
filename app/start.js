// Keep direct-file users able to export from the SAME index.html storage context.
// The supported application runs on HTTP; no writes occur in this recovery screen.
if (location.protocol !== 'file:') {
  import('./main.js');
} else {
  const root = document.querySelector('#app');
  const box = document.createElement('section');
  box.className = 'card file-recovery';
  const addText = (en, ps, tag = 'p') => {
    for (const [content, lang, dir] of [[en, 'en', 'ltr'], [ps, 'ps', 'rtl']]) {
      const node = document.createElement(tag); node.textContent = content; node.lang = lang; node.dir = dir; box.append(node);
    }
  };
  addText('Export your existing inventory', 'د خپل اوسني زېرمتون معلومات ښکته کړئ', 'h1');
  addText('This application now runs through a local server. First download your existing records from this original file location. Then run npm start and restore the inventory backup at http://127.0.0.1:8080.', 'دا کاریال اوس د محلي سرور له لارې چلېږي. لومړی له همدې اصلي فایل څخه خپل معلومات ښکته کړئ. بیا npm start وچلوئ او په http://127.0.0.1:8080 کې د زېرمتون شاتړ بېرته راوګرځوئ.');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  function download(raw) {
    try {
      const key = 'university_it_inventory_v2';
      let data;
      if (raw) {
        const records = {};
        for (const name of [key, `${key}_recovery`, 'ims_categories', 'ims_suppliers', 'ims_products', 'ims_orders', 'ims_adjustments', 'ims_log']) records[name] = localStorage.getItem(name);
        data = { format: 'university-it-raw-archive', version: 1, records };
      } else {
        const source = localStorage.getItem(key);
        if (source === null) throw Error();
        data = { app: 'University IT Material Management', version: 2, data: JSON.parse(source) };
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = raw ? 'university-it-raw-archive.json' : 'university-it-inventory-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Download prepared. / د ښکته کولو فایل چمتو شو.';
    } catch {
      status.textContent = 'No readable inventory at this file location. Try the raw archive, or use the original browser profile and exact file path. / په دې فایل کې د لوستلو وړ زېرمتون نشته. خام آرشیف ښکته کړئ، یا اصلي براوزر او د فایل اصلي پته وکاروئ.';
    }
  }
  for (const [label, raw] of [['Download inventory backup / د زېرمتون شاتړ ښکته کړئ', false], ['Download raw archive / خام آرشیف ښکته کړئ', true]]) {
    const button = document.createElement('button'); button.className = 'button'; button.textContent = label; button.onclick = () => download(raw); box.append(button);
  }
  box.append(status); root.append(box);
}
