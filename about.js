document.addEventListener('DOMContentLoaded', function() {
    // Fetch the header and insert it into the page
    fetch('header.html')
      .then(response => response.text())
      .then(data => {
        document.getElementById('header-placeholder').innerHTML = data;
      });

    // Scroll-driven gear rails: rotate pseudo-gears by toggling a rotate class on the rails
    let lastY = window.scrollY;
    function onScroll(){
      const y = window.scrollY;
      const dir = Math.sign(y - lastY); // 1 down, -1 up
      lastY = y;
      const left = document.getElementById('left-rail');
      const right = document.getElementById('right-rail');
      if (!left || !right) return;
      const rot = (dir>=0) ? 15 : -15; // small nudge for visual feedback
      left.style.transform = `rotate(${rot}deg)`;
      right.style.transform = `rotate(${rot}deg)`;
      // bounce back after a tick
      clearTimeout(onScroll._t);
      onScroll._t = setTimeout(()=>{ left.style.transform = ''; right.style.transform = ''; }, 120);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  });
  
  // On page load, trigger the "slide-out" animations to reveal the page
  window.addEventListener('load', () => {
  // Doors removed — no-op
  });
  