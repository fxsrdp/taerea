/**
 * product_views.js — click-to-cycle through a product's 3 views
 * (OBJEKT → MATERIAL → MOMENT, or A → B → C).
 *
 * Usage: <img class="card-img views-img" data-views="a.png,b.png,c.png" src="a.png">
 * then call window.initProductViews() after DOM is ready.
 *
 * A small view-index dot indicator is inserted as a sibling right after
 * the image, inside the same .card-image/.card-img-wrap container, so it
 * inherits that container's position:relative without extra markup.
 */
(function () {
  function buildDots(container, count, activeIndex) {
    var wrap = document.createElement('div');
    wrap.className = 'view-dots';
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('span');
      dot.className = 'view-dot' + (i === activeIndex ? ' active' : '');
      wrap.appendChild(dot);
    }
    container.appendChild(wrap);
    return wrap;
  }

  function initProductViews() {
    var imgs = document.querySelectorAll('.views-img[data-views]');

    imgs.forEach(function (img) {
      var sources = img.getAttribute('data-views').split(',').map(function (s) { return s.trim(); });
      if (sources.length < 2) return;

      var index = 0;
      var container = img.parentElement;
      var dotsWrap = buildDots(container, sources.length, index);

      function setView(i) {
        index = i;
        img.src = sources[index];
        var dots = dotsWrap.querySelectorAll('.view-dot');
        dots.forEach(function (d, di) {
          d.classList.toggle('active', di === index);
        });
      }

      container.style.cursor = 'pointer';
      container.addEventListener('click', function (e) {
        e.stopPropagation();
        setView((index + 1) % sources.length);
      });
    });
  }

  window.initProductViews = initProductViews;
})();
