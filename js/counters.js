/**
 * Ethilium Counters — animated count-up for metrics
 *
 * Dependencies: window.Ethilium (namespace created if absent)
 *
 * Accent: #2563eb
 * Mono-Font: JetBrains Mono
 *
 * Usage:
 *   <span data-counter="90" data-counter-suffix=" Tage" data-counter-duration="2500">0 Tage</span>
 *   <span data-counter="35" data-counter-suffix="%" data-counter-decimals="0">0%</span>
 *   <span data-counter="10200" data-counter-separator="true" data-counter-prefix="€" data-counter-duration="3000">€0</span>
 *
 * API:
 *   Ethilium.counters.init()    — auto-start via DOMContentLoaded
 *   Ethilium.counters.refresh() — manually re-scan for new [data-counter] elements
 */
(function () {
  'use strict';

  /* ---- helpers ---- */

  /**
   * Ease-out cubic: natural deceleration curve.
   * t ∈ [0, 1] → value ∈ [0, 1]
   */
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Format a number according to locale options.
   *
   * @param {number} value       — current integer/float to display
   * @param {object} opts
   * @param {number} opts.decimals    — decimal places (0 = integer)
   * @param {boolean} opts.separator  — use German thousand separator (dot)
   * @returns {string} formatted number, e.g. "90", "10.000", "99,3"
   */
  function formatNumber(value, opts) {
    var decimals = opts.decimals || 0;
    var useSep   = !!opts.separator;

    // Round to the requested decimal places
    var fixed = value.toFixed(decimals);

    if (!useSep) {
      // Replace dot with comma for decimal display (German locale)
      return decimals > 0 ? fixed.replace('.', ',') : fixed;
    }

    // Thousand-separator: German format uses dots
    // Split integer and decimal parts
    var parts = fixed.split('.');
    var intPart = parts[0];
    var decPart = parts.length > 1 ? parts[1] : null;

    // Add dot every three digits from right
    var separated = '';
    var len = intPart.length;
    for (var i = 0; i < len; i++) {
      if (i > 0 && (len - i) % 3 === 0) {
        separated += '.';
      }
      separated += intPart[i];
    }

    if (decPart !== null) {
      return separated + ',' + decPart;
    }
    return separated;
  }

  /**
   * Build the full display string for a counter element.
   *
   * @param {number} value  — current numeric value
   * @param {HTMLElement} el — the [data-counter] element
   * @returns {string} formatted text including prefix/suffix
   */
  function buildDisplayString(value, el) {
    var prefix   = el.getAttribute('data-counter-prefix') || '';
    var suffix   = el.getAttribute('data-counter-suffix') || '';
    var decimals = parseInt(el.getAttribute('data-counter-decimals'), 10) || 0;
    var hasSep   = el.getAttribute('data-counter-separator') === 'true';

    var numStr = formatNumber(value, { decimals: decimals, separator: hasSep });
    return prefix + numStr + suffix;
  }

  /* ---- core ---- */

  /**
   * Animate a single counter element from 0 to its target value.
   * Uses requestAnimationFrame for smooth 60fps animation.
   * Runs exactly once — subsequent calls are no-ops.
   *
   * @param {HTMLElement} el — element with data-counter attribute
   */
  function animateCounter(el) {
    // Guard: prevent double-animation
    if (el.hasAttribute('data-counter-done')) return;
    el.setAttribute('data-counter-done', '');

    var target    = parseFloat(el.getAttribute('data-counter'));
    var rawDur    = el.getAttribute('data-counter-duration');
    var duration  = rawDur ? parseInt(rawDur, 10) : 2000;

    // Edge case: non-numeric or zero target
    if (isNaN(target) || target <= 0) {
      el.textContent = buildDisplayString(target, el);
      return;
    }

    var startTime = performance.now();

    function tick(now) {
      var elapsed = now - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var eased = easeOutCubic(progress);
      var current = eased * target;

      el.textContent = buildDisplayString(current, el);

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        // Ensure final value is exact
        el.textContent = buildDisplayString(target, el);
      }
    }

    requestAnimationFrame(tick);
  }

  /**
   * Scan the DOM for [data-counter] elements and attach observers.
   * Safe to call multiple times — already-animated elements are skipped.
   *
   * @returns {number} number of newly observed elements
   */
  function observeCounters() {
    var els = document.querySelectorAll('[data-counter]:not([data-counter-observed])');
    var count = 0;

    if (!els.length) return 0;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          // Stop observing once triggered
          observer.unobserve(el);
          animateCounter(el);
        }
      });
    }, {
      threshold: 0.5
    });

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.setAttribute('data-counter-observed', '');
      observer.observe(el);
      count++;
    }

    return count;
  }

  /* ---- public API ---- */

  var counters = {
    /**
     * Initialize: scan for [data-counter] elements and set up observers.
     * Called automatically on DOMContentLoaded if Ethilium boots.
     */
    init: function () {
      observeCounters();
    },

    /**
     * Re-scan the DOM for newly inserted [data-counter] elements.
     * Useful after dynamic content loads (e.g. tabs, modals).
     */
    refresh: function () {
      observeCounters();
    }
  };

  /* ---- register on Ethilium namespace ---- */

  window.Ethilium = window.Ethilium || {};
  window.Ethilium.counters = counters;

  /* ---- auto-start on DOMContentLoaded ---- */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', counters.init);
  } else {
    // DOM already ready
    counters.init();
  }

})();
