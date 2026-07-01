/**
 * depth_parallax.js — vertical depth-parallax coupled to a reference
 * element's position in the viewport.
 *
 * Two modes, auto-detected per call:
 * 1. Embedded shop iframe (settle/carry/root/nts): window.frameElement
 *    (same-origin) exposes THIS iframe's own DOM node as seen from the
 *    parent document, so getBoundingClientRect() on it gives the iframe's
 *    live position in the browser's visible viewport.
 * 2. Top-level page section (e.g. index.html hero): pass
 *    initDepthParallax({ refEl: someElement }) — that element's own
 *    getBoundingClientRect() against window.innerHeight is used directly,
 *    since there's no parent frame to reach through.
 *
 * Either way: the filter's scale attribute is driven every frame by how
 * far the reference element's center has traveled past the viewport's
 * vertical center — max at the edges, zero when centered, so the effect
 * reads as "depth settling into place" as the section scrolls into view.
 *
 * Each product image gets an SVG <filter> with a feImage (RGB displacement
 * map: R=128 neutral, G=depth) + feDisplacementMap. Only yChannelSelector
 * reads a varying channel (G), so displacement is vertical-only.
 *
 * Usage: <img class="depth-img" data-depth="assets/depth_disp/x_disp.png" src="...">
 * then call initDepthParallax() (iframe case) or
 * initDepthParallax({ refEl: el }) (top-level case) after DOM is ready.
 */
(function () {
  var MAX_SCALE = 26; // px displacement at full-strength — kept within the Ken Burns oversize buffer to avoid edge clipping/transparency
  var svgNS = 'http://www.w3.org/2000/svg';
  var filterId = 0;
  var bound = [];
  var refEl = null;

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

  function settleProgress() {
    // 0 = reference element centered in its viewport (max depth settle),
    // 1 = edge-aligned or off-center (flat, no displacement)
    try {
      if (refEl) {
        var r = refEl.getBoundingClientRect();
        var viewH = window.innerHeight || r.height;
        var elCenter = r.top + r.height / 2;
        var viewCenter = viewH / 2;
        var dist = Math.abs(elCenter - viewCenter);
        var maxDist = viewH / 2 + r.height / 2;
        return Math.min(1, dist / maxDist);
      }
      var fe = window.frameElement;
      if (!fe) return 0; // not embedded, no refEl given — treat as fully in view
      var rect = fe.getBoundingClientRect();
      var parentH = window.parent.innerHeight || rect.height;
      var iframeCenter = rect.top + rect.height / 2;
      var viewportCenter = parentH / 2;
      var d = Math.abs(iframeCenter - viewportCenter);
      var maxD = parentH / 2 + rect.height / 2;
      return Math.min(1, d / maxD);
    } catch (e) {
      return 0; // cross-origin or inaccessible — fall back to static max settle
    }
  }

  function tick() {
    var t = settleProgress();
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
    if (opts.refEl) refEl = opts.refEl;
    var svg = getSvgRoot();
    var imgs = document.querySelectorAll('.depth-img[data-depth]');

    imgs.forEach(function (img) {
      if (img.dataset.depthBound) return; // already wired by an earlier call
      img.dataset.depthBound = '1';
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
