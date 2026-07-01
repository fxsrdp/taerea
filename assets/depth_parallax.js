/**
 * depth_parallax.js — vertical depth-parallax coupled to the iframe's own
 * position in the parent viewport.
 *
 * Each shop page is loaded as a 100vw×100vw same-origin iframe stacked in
 * index.html. window.frameElement (same-origin) exposes THIS iframe's own
 * DOM node as seen from the parent document, so getBoundingClientRect() on
 * it gives the iframe's live position in the browser's visible viewport —
 * that's the "position in viewport" the effect is coupled to.
 *
 * Each product image gets an SVG <filter> with a feImage (RGB displacement
 * map: R=128 neutral, G=depth) + feDisplacementMap. Only yChannelSelector
 * reads a varying channel (G), so displacement is vertical-only. The
 * filter's scale attribute is driven every frame by how far the iframe's
 * center has traveled past the viewport's vertical center — max at the
 * edges, zero when the iframe is exactly centered, so the effect reads as
 * "depth settling into place" as the shop scrolls into full view.
 *
 * Usage: <img class="depth-img" data-depth="assets/depth_disp/x_disp.png" src="...">
 * then call initDepthParallax() after DOM is ready.
 */
(function () {
  var MAX_SCALE = 45; // px displacement at full-strength (matches ~4vw at 1100px viewport)
  var svgNS = 'http://www.w3.org/2000/svg';
  var filterId = 0;
  var bound = [];

  function buildFilter(dispSrc) {
    var id = 'depthDisp' + (filterId++);
    var filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    var feImage = document.createElementNS(svgNS, 'feImage');
    feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dispSrc);
    feImage.setAttribute('href', dispSrc);
    feImage.setAttribute('x', '0');
    feImage.setAttribute('y', '0');
    feImage.setAttribute('width', '100%');
    feImage.setAttribute('height', '100%');
    feImage.setAttribute('result', 'dispMap');
    feImage.setAttribute('preserveAspectRatio', 'none');

    var feDisp = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', 'dispMap');
    feDisp.setAttribute('scale', '0');
    feDisp.setAttribute('xChannelSelector', 'R');
    feDisp.setAttribute('yChannelSelector', 'G');

    filter.appendChild(feImage);
    filter.appendChild(feDisp);
    return { id: id, filterEl: filter, feDisp: feDisp };
  }

  function getSvgRoot() {
    var svg = document.getElementById('depth-filter-defs');
    if (svg) return svg;
    svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('id', 'depth-filter-defs');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);
    return svg;
  }

  function iframeProgress() {
    // 0 = iframe centered in parent viewport (max depth settle),
    // 1 = iframe edge-aligned or off-center (flat, no displacement)
    try {
      var fe = window.frameElement;
      if (!fe) return 0; // not embedded — treat as fully in view
      var rect = fe.getBoundingClientRect();
      var parentH = window.parent.innerHeight || rect.height;
      var iframeCenter = rect.top + rect.height / 2;
      var viewportCenter = parentH / 2;
      var dist = Math.abs(iframeCenter - viewportCenter);
      var maxDist = parentH / 2 + rect.height / 2;
      var t = Math.min(1, dist / maxDist);
      return t;
    } catch (e) {
      return 0; // cross-origin or inaccessible — fall back to static max settle
    }
  }

  function tick() {
    var t = iframeProgress();
    var settle = 1 - t; // 1 = centered/settled, 0 = far from center
    bound.forEach(function (b) {
      var scale = MAX_SCALE * settle * b.strength;
      b.feDisp.setAttribute('scale', scale.toFixed(2));
    });
    requestAnimationFrame(tick);
  }

  function initDepthParallax(opts) {
    opts = opts || {};
    var strength = opts.strength || 1;
    var svg = getSvgRoot();
    var imgs = document.querySelectorAll('.depth-img[data-depth]');

    imgs.forEach(function (img) {
      var dispSrc = img.getAttribute('data-depth');
      var built = buildFilter(dispSrc);
      svg.appendChild(built.filterEl);
      img.style.filter = 'url(#' + built.id + ')';
      bound.push({ feDisp: built.feDisp, strength: strength });
    });

    if (bound.length) {
      requestAnimationFrame(tick);
    }
  }

  window.initDepthParallax = initDepthParallax;
})();
