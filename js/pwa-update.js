(function () {
  if (window.__karpusUpdateBannerLoader) return;
  window.__karpusUpdateBannerLoader = true;

  function load() {
    import('/js/shared/update-banner.js')
      .then(function (mod) {
        if (mod && typeof mod.initUpdateBanner === 'function') {
          mod.initUpdateBanner();
        }
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
