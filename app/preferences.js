// Runs synchronously in <head> to apply the existing preference before first paint.
(() => {
  let prefs = { lang: 'en', dark: false };
  for (const key of ['university_it_preferences', 'university_it_inventory_v2']) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      const candidate = key === 'university_it_preferences' ? value : value?.settings;
      if (candidate && ['en', 'ps'].includes(candidate.lang) && typeof candidate.dark === 'boolean') {
        prefs = candidate;
        break;
      }
    } catch { /* Try the existing inventory preference before using defaults. */ }
  }
  document.documentElement.lang = prefs.lang === 'ps' ? 'ps' : 'en';
  document.documentElement.dir = prefs.lang === 'ps' ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = prefs.dark ? 'dark' : 'light';
})();
