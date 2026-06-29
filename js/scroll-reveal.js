/**
 * scroll-reveal.js — Scroll-getriggerte Reveal-Animationen
 * Ethilium Consulting Single-Page
 *
 * Abhängigkeit: window.Ethilium (core.js) — wird angelegt falls nicht existent.
 *
 * data-Attribut-System:
 *   data-reveal="up"    → translateY(30px) → translateY(0) + opacity 0→1
 *   data-reveal="fade"  → opacity 0→1
 *   data-reveal="scale" → scale(0.95)→scale(1) + opacity 0→1
 *   data-reveal="left"  → translateX(-30px) → translateX(0) + opacity 0→1
 *   data-reveal="right" → translateX(30px) → translateX(0) + opacity 0→1
 *
 *   data-reveal-stagger="100" → Direkte Kinder werden gestaffelt um je 100ms
 *     eingeblendet (Standard: fade). Kinder mit eigenem data-reveal verwenden
 *     dessen Animationstyp.
 *
 * API:
 *   Ethilium.scrollReveal.init()    — einmalig nach DOMContentLoaded
 *   Ethilium.scrollReveal.refresh() — nach dynamischem DOM-Nachschub
 *
 * Design-System:
 *   Transition: 0.8s cubic-bezier(0.16,1,0.3,1)
 *   Threshold:  0.15 (15% sichtbar → reveal)
 *   rootMargin: "0px 0px -40px 0px" (40px vor Eintritt ins Viewport)
 *
 * Performance:
 *   IntersectionObserver-basiert (kein scroll-event).
 *   transitionend-Listener + Safety-Timeout (1200ms).
 *
 * Barrierefreiheit:
 *   Respektiert prefers-reduced-motion: Dann sofort sichtbar ohne Animation.
 *
 * @file scroll-reveal.js
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Namespace                                                         */
  /* ------------------------------------------------------------------ */

  window.Ethilium = window.Ethilium || {};

  /* ------------------------------------------------------------------ */
  /*  Konfiguration (Design-System)                                     */
  /* ------------------------------------------------------------------ */

  var THRESHOLD = 0.15;
  var ROOT_MARGIN = '0px 0px -40px 0px';
  var TRANSITION_DURATION = '0.8s';
  var TRANSITION_EASING = 'cubic-bezier(0.16,1,0.3,1)';
  var TRANSITION = 'opacity ' + TRANSITION_DURATION + ' ' + TRANSITION_EASING + ', transform ' + TRANSITION_DURATION + ' ' + TRANSITION_EASING;
  var SAFETY_TIMEOUT = 1200; // ms — fallback falls transitionend ausbleibt

  /* ------------------------------------------------------------------ */
  /*  Zustand                                                           */
  /* ------------------------------------------------------------------ */

  var observer = null;
  var revealed = new WeakSet();
  var fallbackTimers = [];

  /* ------------------------------------------------------------------ */
  /*  Entry-Styles (data-reveal="…" → initialer CSS-Zustand)            */
  /* ------------------------------------------------------------------ */

  var ENTRY_STYLES = {
    up:    { opacity: '0', transform: 'translateY(30px)' },
    fade:  { opacity: '0' },
    scale: { opacity: '0', transform: 'scale(0.95)' },
    left:  { opacity: '0', transform: 'translateX(-30px)' },
    right: { opacity: '0', transform: 'translateX(30px)' }
  };

  /* ------------------------------------------------------------------ */
  /*  Hilfsfunktionen                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Gibt den Reveal-Typ eines Elements zurück.
   * @param {Element} el
   * @returns {string} 'up' | 'fade' | 'scale' | 'left' | 'right'
   */
  function getRevealType(el) {
    var type = el.getAttribute('data-reveal');
    if (type && ENTRY_STYLES[type]) return type;
    return 'fade';
  }

  /**
   * Prüft ob der Nutzer reduzierte Bewegung bevorzugt.
   * @returns {boolean}
   */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Entfernt die Inline-Transition-Styles eines Elements nach der Animation,
   * behält aber opacity/transform-Endwerte, fügt .revealed hinzu.
   * @param {Element} el
   */
  function cleanupAfterTransition(el) {
    el.removeEventListener('transitionend', cleanupAfterTransition);
    el.classList.add('revealed');
    // Transition-Eigenschaften entfernen (würden Hover-Effekte blockieren)
    el.style.transition = '';
    el.style.transitionDelay = '';
    // opacity/transform als finale Werte belassen (Inline = sicher)
  }

  /* ------------------------------------------------------------------ */
  /*  Kernfunktionen                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Wendet die initialen (unsichtbaren) Styles auf ein Element an.
   * @param {Element} el
   */
  function applyInitialStyles(el) {
    if (revealed.has(el)) return;

    var type = getRevealType(el);
    var styles = ENTRY_STYLES[type];

    el.style.transition = TRANSITION;
    el.style.opacity = styles.opacity;

    if (styles.transform) {
      el.style.transform = styles.transform;
    }
  }

  /**
   * Revealt ein einzelnes Element (opacity 1, transform none).
   * Hängt transitionend-Listener und Safety-Timeout.
   * @param {Element} el
   * @param {number}  [delay=0] — Verzögerung in ms (für Stagger)
   */
  function revealElement(el, delay) {
    if (revealed.has(el)) return;
    revealed.add(el);

    if (delay && delay > 0) {
      el.style.transitionDelay = delay + 'ms';
    }

    // Endzustand setzen → CSS-Transition läuft
    el.style.opacity = '1';
    el.style.transform = 'none';

    // Auf Ende der Transition warten
    el.addEventListener('transitionend', cleanupAfterTransition);

    // Safety-Timeout falls transitionend ausbleibt
    var tid = setTimeout(function () {
      el.removeEventListener('transitionend', cleanupAfterTransition);
      cleanupAfterTransition(el);
    }, SAFETY_TIMEOUT + (delay || 0));

    fallbackTimers.push(tid);
  }

  /**
   * Staffelt direkte Kinder eines Parents mit data-reveal-stagger.
   * Kinder OHNE eigenes data-reveal bekommen Standard "fade".
   * Kinder MIT data-reveal verwenden ihren eigenen Animationstyp.
   * @param {Element} parent
   */
  function staggerChildren(parent) {
    var raw = parent.getAttribute('data-reveal-stagger');
    if (raw === null) return;

    var staggerMs = parseInt(raw, 10);
    if (isNaN(staggerMs) || staggerMs <= 0) return;

    var children = parent.children;
    if (!children || children.length === 0) return;

    // Jedes direkte Kind wird gestaffelt eingeblendet
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (revealed.has(child)) continue;

      // Initial-Styles setzen (falls nicht schon geschehen)
      applyInitialStyles(child);

      // Staffelverzögerung: Index × Stagger-Intervall
      var delay = (i + 1) * staggerMs;
      revealElement(child, delay);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  IntersectionObserver-Callback                                     */
  /* ------------------------------------------------------------------ */

  /**
   * IntersectionObserver-Callback.
   * Zwei Passes: 1. Stagger-Parents (damit Kinder vor den Kindern selbst),
   *              2. alle anderen Elemente.
   * @param {IntersectionObserverEntry[]} entries
   */
  function onIntersect(entries) {
    // -- Pass 1: Stagger-Parents zuerst verarbeiten --
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry.isIntersecting) continue;

      var el = entry.target;
      if (revealed.has(el)) continue;

      if (el.hasAttribute('data-reveal-stagger')) {
        staggerChildren(el);
        revealElement(el, 0);
      }
    }

    // -- Pass 2: Alle restlichen Elemente --
    for (var j = 0; j < entries.length; j++) {
      var entry2 = entries[j];
      if (!entry2.isIntersecting) continue;

      var el2 = entry2.target;
      if (revealed.has(el2)) continue;

      // Stagger-Parents bereits in Pass 1 behandelt
      if (!el2.hasAttribute('data-reveal-stagger')) {
        revealElement(el2, 0);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public-API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Initialisiert Scroll-Reveal.
   * - Baut bestehenden Observer ab
   * - Räumt Safety-Timeouts auf (revealed bleibt erhalten)
   * - Bei prefers-reduced-motion: Sofort alle Elemente sichtbar
   * - Ohne IntersectionObserver: Fallback → sofort sichtbar
   * - Sonst: Neue Observation aller [data-reveal]-Elemente
   */
  function init() {
    // Vorherigen Observer sauber trennen
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Safety-Timeouts räumen
    for (var t = 0; t < fallbackTimers.length; t++) {
      clearTimeout(fallbackTimers[t]);
    }
    fallbackTimers = [];

    // Reduced Motion oder kein IntersectionObserver → sofort sichtbar
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      var all = document.querySelectorAll('[data-reveal]');
      for (var r = 0; r < all.length; r++) {
        var el = all[r];
        el.classList.add('revealed');
        revealed.add(el);
      }
      return;
    }

    // Neuen Observer starten
    observer = new IntersectionObserver(onIntersect, {
      threshold: THRESHOLD,
      rootMargin: ROOT_MARGIN
    });

    // Alle [data-reveal]-Elemente initialisieren und observieren
    var targets = document.querySelectorAll('[data-reveal]');
    for (var k = 0; k < targets.length; k++) {
      var target = targets[k];
      applyInitialStyles(target);
      observer.observe(target);
    }
  }

  /**
   * Erneute Initialisierung nach dynamischem DOM-Nachschub.
   * Ruft init() intern auf.
   */
  function refresh() {
    init();
  }

  /* ------------------------------------------------------------------ */
  /*  Module Registration                                               */
  /* ------------------------------------------------------------------ */

  var scrollReveal = {
    init: init,
    refresh: refresh
  };

  window.Ethilium.scrollReveal = scrollReveal;

  /* ---- Auto-Start on DOMContentLoaded (konsistent mit counters.js) ---- */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
