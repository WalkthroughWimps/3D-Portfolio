// Compatibility shim for cached loaders expecting the legacy path.
(function(){
  const scripts = [
    '/assets/vendor/js-synthesizer/externals/libfluidsynth-2.4.6.js',
    '/assets/vendor/js-synthesizer/dist/js-synthesizer.js'
  ];
  function loadNext(i){
    if(i >= scripts.length) return;
    const s = document.createElement('script');
    s.src = scripts[i];
    s.async = true;
    s.onload = () => loadNext(i + 1);
    s.onerror = () => console.warn('[SF2] legacy shim failed', scripts[i]);
    document.head.appendChild(s);
  }
  loadNext(0);
})();
