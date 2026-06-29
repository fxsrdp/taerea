/* Ethilium core.js — Vanilla JS Foundation
   Design System: frosted-glass, white, clean consulting
   Accent: #2563eb · Fonts: DM Sans (body), JetBrains Mono (mono)
   No dependencies · IIFE pattern
*/
(function (window, document) {
  'use strict';

  var Ethilium = {};

  /* ──────────────────────────────────────────────
     1. SCROLL OBSERVER (rAF-based)
     ────────────────────────────────────────────── */
  var scrollData = {
    scrollY: 0,
    scrollProgress: 0,
    scrollDirection: 'down'
  };

  var _lastScrollY = 0;
  var _scrollFrame = null;
  var _scrollListeners = [];

  function _updateScroll() {
    var sy = window.pageYOffset || document.documentElement.scrollTop;
    var docH = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    );
    var winH = window.innerHeight;
    var maxScroll = Math.max(docH - winH, 1);

    scrollData.scrollY = sy;
    scrollData.scrollProgress = Math.min(sy / maxScroll, 1);
    scrollData.scrollDirection = sy > _lastScrollY ? 'down' : (sy < _lastScrollY ? 'up' : scrollData.scrollDirection);
    _lastScrollY = sy;

    for (var i = 0; i < _scrollListeners.length; i++) {
      _scrollListeners[i](scrollData);
    }
  }

  function _onScroll() {
    if (_scrollFrame) return;
    _scrollFrame = window.requestAnimationFrame(function () {
      _scrollFrame = null;
      _updateScroll();
    });
  }

  /* ──────────────────────────────────────────────
     2. INTERSECTION OBSERVER HELPER
     ────────────────────────────────────────────── */
  var _ioMap = [];

  function _cleanupIO(entry) {
    var idx = _ioMap.indexOf(entry);
    if (idx !== -1) {
      _ioMap.splice(idx, 1);
    }
    if (entry.io) {
      entry.io.disconnect();
      entry.io = null;
    }
  }

  /* ──────────────────────────────────────────────
     3. RAF LOOP
     ────────────────────────────────────────────── */
  var _frameCallbacks = [];
  var _rafId = null;

  function _runFrame() {
    for (var i = 0; i < _frameCallbacks.length; i++) {
      _frameCallbacks[i]();
    }
    if (_frameCallbacks.length > 0) {
      _rafId = window.requestAnimationFrame(_runFrame);
    } else {
      _rafId = null;
    }
  }

  function _startRAF() {
    if (_rafId === null) {
      _rafId = window.requestAnimationFrame(_runFrame);
    }
  }

  /* ──────────────────────────────────────────────
     4. BREAKPOINT DETECTION
     ────────────────────────────────────────────── */
  var breakpoint = 'desktop';

  function _updateBreakpoint() {
    var w = window.innerWidth;
    if (w < 768) {
      breakpoint = 'mobile';
    } else if (w < 1024) {
      breakpoint = 'tablet';
    } else {
      breakpoint = 'desktop';
    }
  }

  /* ──────────────────────────────────────────────
     5. PUBLIC API
     ────────────────────────────────────────────── */

  /* Scroll data — read-only access */
  Object.defineProperty(Ethilium, 'scrollY', {
    get: function () { return scrollData.scrollY; },
    enumerable: true
  });
  Object.defineProperty(Ethilium, 'scrollProgress', {
    get: function () { return scrollData.scrollProgress; },
    enumerable: true
  });
  Object.defineProperty(Ethilium, 'scrollDirection', {
    get: function () { return scrollData.scrollDirection; },
    enumerable: true
  });

  /* Breakpoint — read-only access */
  Object.defineProperty(Ethilium, 'breakpoint', {
    get: function () { return breakpoint; },
    enumerable: true
  });

  /**
   * Ethilium.ready(fn) — Execute fn when DOM is ready.
   * If DOM is already interactive/complete, fn runs immediately.
   */
  Ethilium.ready = function (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  };

  /**
   * Ethilium.watch(el, callback, options)
   * Creates an IntersectionObserver for the given element.
   * callback receives (entries, observer) like standard IO.
   * Returns a cleanup function that disconnects the observer.
   */
  Ethilium.watch = function (el, callback, options) {
    options = options || {};
    var threshold = options.threshold || 0.2;
    var rootMargin = options.rootMargin || '0px';

    var io = new IntersectionObserver(function (entries, observer) {
      callback(entries, observer);
    }, {
      threshold: threshold,
      rootMargin: rootMargin
    });

    io.observe(el);

    var entry = { io: io, el: el };
    _ioMap.push(entry);

    return function cleanup() {
      _cleanupIO(entry);
    };
  };

  /**
   * Ethilium.throttle(fn, ms)
   * Returns a throttled version of fn that fires at most once per ms.
   */
  Ethilium.throttle = function (fn, ms) {
    if (typeof ms === 'undefined') ms = 100;
    var lastCall = 0;
    var timer = null;
    var lastArgs = null;
    var lastCtx = null;

    function invoke() {
      lastCall = Date.now();
      fn.apply(lastCtx, lastArgs);
      lastArgs = null;
      lastCtx = null;
      timer = null;
    }

    return function throttled() {
      var now = Date.now();
      var remaining = ms - (now - lastCall);

      lastArgs = arguments;
      lastCtx = this;

      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        invoke();
      } else if (!timer) {
        timer = setTimeout(invoke, remaining);
      }
    };
  };

  /**
   * Ethilium.debounce(fn, ms)
   * Returns a debounced version of fn that fires after ms of inactivity.
   */
  Ethilium.debounce = function (fn, ms) {
    if (typeof ms === 'undefined') ms = 150;
    var timer = null;

    return function debounced() {
      var ctx = this;
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
        timer = null;
      }, ms);
    };
  };

  /**
   * Ethilium.onFrame(callback)
   * Registers a callback in the central rAF loop.
   * Returns an unsubscribe function.
   */
  Ethilium.onFrame = function (callback) {
    _frameCallbacks.push(callback);
    _startRAF();

    return function unsubscribe() {
      var idx = _frameCallbacks.indexOf(callback);
      if (idx !== -1) {
        _frameCallbacks.splice(idx, 1);
      }
      if (_frameCallbacks.length === 0 && _rafId !== null) {
        window.cancelAnimationFrame(_rafId);
        _rafId = null;
      }
    };
  };

  /**
   * Ethilium.cssVar(name, value)
   * Get or set CSS custom properties on :root.
   *   Ethilium.cssVar('--c-accent')        // returns '#2563eb'
   *   Ethilium.cssVar('--c-accent', '#fff') // sets it
   */
  Ethilium.cssVar = function (name, value) {
    var root = document.documentElement;
    if (typeof value === 'undefined') {
      return getComputedStyle(root).getPropertyValue(name).trim();
    }
    root.style.setProperty(name, value);
  };

  /* ──────────────────────────────────────────────
     6. INIT
     ────────────────────────────────────────────── */
  function _init() {
    /* Start scroll observer */
    _updateScroll();
    window.addEventListener('scroll', _onScroll, { passive: true });

    /* Set initial breakpoint */
    _updateBreakpoint();

    /* Debounced resize handler */
    var _resizeDebounced = Ethilium.debounce(function () {
      _updateBreakpoint();
      _updateScroll();
    }, 150);
    window.addEventListener('resize', _resizeDebounced, { passive: true });
  }

  /* Auto-init on DOMContentLoaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* Expose namespace */
  window.Ethilium = Ethilium;

})(window, document);
