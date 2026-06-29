/**
 * card-tilt.js — 3D Tilt + Glow für Service-Cards und Case-Study-Cards
 * Ethilium Consulting Single-Page
 *
 * Abhängigkeit: window.Ethilium (core.js) — wird angelegt falls nicht existent.
 *
 * Ziel-CSS-Selektoren:
 *   .service-card.glass-card  → 4 Service-Karten
 *   .case-card                → 3 Case-Study-Karten
 *   .trust-signal.glass-card  → 6 Trust-Signal-Karten
 *
 * Effekte:
 *   1. 3D-Tilt (max ±8° X/Y) via perspective(1000px) rotateX/Y
 *   2. Radiales Glow-Follow via box-shadow: inset
 *   3. Depth-Lifting (translateY(-4px) on hover)
 *   4. IntersectionObserver — Nur Cards im Viewport werden getracked
 *   5. Ethilium.onFrame (rAF) für Maus-Tracking (kein direkter mousemove)
 *   6. Koordiniert mit scroll-reveal.js (data-reveal-stagger)
 *
 * API:
 *   Ethilium.cardTilt.init()    — Einmalig nach DOMContentLoaded
 *   Ethilium.cardTilt.destroy() — Alle Effekte entfernen, Cards zurücksetzen
 *
 * @file card-tilt.js
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

  var CONFIG = {
    maxRotateX: 8,           // ±8° um X-Achse
    maxRotateY: 8,           // ±8° um Y-Achse
    perspective: 1000,       // px — Blickwinkel
    translateZ: 20,          // px — Content schwebt über Card
    liftY: -4,               // px — translateY bei Hover
    glowAlpha: 0.06,         // Alpha-Wert des Glow
    glowBlur: 60,            // px — box-shadow blur
    glowSpread: 0,           // px — box-shadow spread
    glowIntensity: 0.5,      // Multiplikator für Glow-Verschiebung
    lerpFactor: 0.12,        // Lerp-Smoothing für Rotation
    glowLerpFactor: 0.06,    // Langsameres Lerp für Glow (leichte Verzögerung)
    resetThreshold: 0.01,    // Schwellwert für Transform-Reset
    fastTransition: 'transform 0.1s linear, box-shadow 0.1s linear',
    smoothTransition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1), box-shadow 0.5s ease-out',
    ioThreshold: 0.1,        // IntersectionObserver threshold
    ioRootMargin: '0px 0px -40px 0px' // Vor Eintritt ins Viewport
  };

  /* ------------------------------------------------------------------ */
  /*  Zustand                                                           */
  /* ------------------------------------------------------------------ */

  var cards = [];            // Aktive Card-Elemente (nur im Viewport)
  var tiltData = [];         // Parallel-Array: Maus-/Lerp-Werte
  var cardPool = [];         // Alle gefundenen Cards (auch ausserhalb Viewport)
  var io = null;             // IntersectionObserver
  var unsubFrame = null;     // unsubscribe für Ethilium.onFrame
  var isInitialized = false;

  /* ------------------------------------------------------------------ */
  /*  Selektoren                                                        */
  /* ------------------------------------------------------------------ */

  var GRID_SELECTORS = [
    '.services-grid',
    '.cases-grid',
    '.trust-grid'
  ];

  /* ------------------------------------------------------------------ */
  /*  Hilfsfunktionen                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Prüft ob das Gerät Hover unterstützt (kein Touch).
   * Deaktiviert auf Mobile/Tablet.
   */
  function hasHover() {
    return window.matchMedia('(hover: hover)').matches;
  }

  /**
   * Prüft ob der Nutzer reduzierte Bewegung bevorzugt.
   */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Lineare Interpolation.
   * @param {number} start
   * @param {number} end
   * @param {number} factor
   * @returns {number}
   */
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  /**
   * Clamp-Wert zwischen min/max.
   */
  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  /**
   * Wert von einem Bereich in einen anderen mappen.
   */
  function mapRange(value, inMin, inMax, outMin, outMax) {
    return (value - inMin) / (inMax - inMin) * (outMax - outMin) + outMin;
  }

  /**
   * Prüft ob ein Element in einem der Ziel-Grids liegt.
   * @param {Element} el
   * @returns {boolean}
   */
  function isInTargetGrid(el) {
    var parent = el.parentElement;
    if (!parent) return false;
    var cn = parent.className;
    for (var i = 0; i < GRID_SELECTORS.length; i++) {
      if (cn.indexOf(GRID_SELECTORS[i].slice(1)) !== -1) return true;
    }
    return false;
  }

  /**
   * Content-Elemente innerhalb einer Card mit translateZ versehen,
   * damit sie über der Card schweben (3D-Depth-Effekt).
   * @param {Element} card
   */
  function applyContentTranslateZ(card) {
    var contentSelectors = [
      '.service-card__icon',
      '.service-card__title',
      '.service-card__desc',
      '.service-card__stat',
      '.case-card__metric',
      '.case-card__title',
      '.case-card__desc',
      '.case-card__client',
      '.trust-signal__title',
      '.trust-signal__desc'
    ];

    for (var s = 0; s < contentSelectors.length; s++) {
      var els = card.querySelectorAll(contentSelectors[s]);
      for (var e = 0; e < els.length; e++) {
        els[e].style.transform = 'translateZ(' + CONFIG.translateZ + 'px)';
      }
    }
  }

  /**
   * Entfernt die translateZ von Content-Elementen (bei destroy).
   * @param {Element} card
   */
  function removeContentTranslateZ(card) {
    var contentSelectors = [
      '.service-card__icon',
      '.service-card__title',
      '.service-card__desc',
      '.service-card__stat',
      '.case-card__metric',
      '.case-card__title',
      '.case-card__desc',
      '.case-card__client',
      '.trust-signal__title',
      '.trust-signal__desc'
    ];

    for (var s = 0; s < contentSelectors.length; s++) {
      var els = card.querySelectorAll(contentSelectors[s]);
      for (var e = 0; e < els.length; e++) {
        els[e].style.transform = '';
      }
    }
  }

  /**
   * Erzeugt ein frisches TiltData-Objekt für eine Card.
   * @returns {object}
   */
  function createTiltData() {
    return {
      mouseX: 0.5,          // Maus-X 0-1 (relativ zur Card)
      mouseY: 0.5,          // Maus-Y 0-1
      targetGlowX: 50,      // Ziel-Glow-X in %
      targetGlowY: 50,      // Ziel-Glow-Y in %
      currentX: 0,          // Aktuelle Rotation X (lerped)
      currentY: 0,          // Aktuelle Rotation Y (lerped)
      currentGlowX: 50,     // Aktuelle Glow-X (lerped)
      currentGlowY: 50,     // Aktuelle Glow-Y (lerped)
      isHovered: false,     // Maus drüber?
      isActive: false       // Im Viewport + getracked?
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Event-Handler (pro Card)                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Richtet Mouse-Event-Listener für eine Card ein.
   * Wird nur aufgerufen, wenn die Card im Viewport ist.
   * @param {Element} card
   * @param {number}  index — Index in cards[] + tiltData[]
   */
  function attachCardListeners(card, index) {
    /* mouseenter — will-change setzen, hover-flag */
    card.addEventListener('mouseenter', function onEnter() {
      if (!hasHover()) return;
      card.style.willChange = 'transform, box-shadow';
      tiltData[index].isHovered = true;
    });

    /* mouseleave — will-change entfernen, reset starten */
    card.addEventListener('mouseleave', function onLeave() {
      if (!hasHover()) return;
      card.style.willChange = '';
      tiltData[index].isHovered = false;
      tiltData[index].mouseX = 0.5;
      tiltData[index].mouseY = 0.5;
      tiltData[index].targetGlowX = 50;
      tiltData[index].targetGlowY = 50;
    });

    /* mousemove — Maus-Position relativ zur Card erfassen */
    card.addEventListener('mousemove', function onMove(e) {
      if (!hasHover()) return;
      var rect = card.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width;
      var y = (e.clientY - rect.top) / rect.height;

      tiltData[index].mouseX = clamp(x, 0, 1);
      tiltData[index].mouseY = clamp(y, 0, 1);
      tiltData[index].targetGlowX = x * 100;
      tiltData[index].targetGlowY = y * 100;
    });
  }

  /* ------------------------------------------------------------------ */
  /*  IntersectionObserver — Nur Cards im Viewport werden getracked     */
  /* ------------------------------------------------------------------ */

  /**
   * Callback für IntersectionObserver.
   * Cards die ins Viewport kommen: aktivieren (Listener + Tracking).
   * Cards die rausgehen: deaktivieren, zurücksetzen.
   */
  function onIntersect(entries) {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var card = entry.target;
      var index = cardPool.indexOf(card);
      if (index === -1) continue;

      if (entry.isIntersecting) {
        /* Card kommt ins Viewport → aktivieren */
        var existingIndex = cards.indexOf(card);
        if (existingIndex === -1) {
          var newIndex = cards.length;
          cards.push(card);
          tiltData[newIndex] = createTiltData();
          tiltData[newIndex].isActive = true;
          attachCardListeners(card, newIndex);
          applyContentTranslateZ(card);
          /* Stagger-Koordination via data-reveal-stagger (scroll-reveal.js) */
          var parentGrid = card.parentElement;
          if (parentGrid && parentGrid.hasAttribute('data-reveal-stagger') && !card.hasAttribute('data-reveal')) {
            card.setAttribute('data-reveal', 'fade');
          }
        }
      } else {
        /* Card verlässt Viewport → deaktivieren */
        var idx = cards.indexOf(card);
        if (idx !== -1) {
          /* Card zurücksetzen */
          card.style.transform = '';
          card.style.boxShadow = '';
          card.style.transition = '';
          card.style.willChange = '';
          cards.splice(idx, 1);
          tiltData.splice(idx, 1);
        }
      }
    }
  }

  /**
   * Startet IntersectionObserver für alle gefundenen Cards.
   */
  function startObserver() {
    if (io) {
      io.disconnect();
      io = null;
    }

    io = new IntersectionObserver(onIntersect, {
      threshold: CONFIG.ioThreshold,
      rootMargin: CONFIG.ioRootMargin
    });

    for (var i = 0; i < cardPool.length; i++) {
      io.observe(cardPool[i]);
    }
  }

  /**
   * Beendet IntersectionObserver.
   */
  function stopObserver() {
    if (io) {
      io.disconnect();
      io = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  RAF-Loop (via Ethilium.onFrame)                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Wird jeden Frame von Ethilium.onFrame aufgerufen.
   * Berechnet Rotation + Glow für alle aktiven Cards.
   */
  function onFrame() {
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var data = tiltData[i];

      if (!card || !data || !data.isActive) continue;

      if (data.isHovered) {
        /* ---- Maus drüber: Rotation + Glow verfolgen ---- */

        var rx = mapRange(data.mouseY, 0, 1, -CONFIG.maxRotateX, CONFIG.maxRotateX);
        var ry = mapRange(data.mouseX, 0, 1, CONFIG.maxRotateY, -CONFIG.maxRotateY);

        data.currentX = lerp(data.currentX, rx, CONFIG.lerpFactor);
        data.currentY = lerp(data.currentY, ry, CONFIG.lerpFactor);
        data.currentGlowX = lerp(data.currentGlowX, data.targetGlowX, CONFIG.glowLerpFactor);
        data.currentGlowY = lerp(data.currentGlowY, data.targetGlowY, CONFIG.glowLerpFactor);

        /* Transform: perspective + rotateX/Y + translateY (depth-lift) */
        card.style.transition = CONFIG.fastTransition;
        card.style.transform =
          'perspective(' + CONFIG.perspective + 'px) ' +
          'rotateX(' + data.currentX.toFixed(2) + 'deg) ' +
          'rotateY(' + data.currentY.toFixed(2) + 'deg) ' +
          'translateY(' + CONFIG.liftY + 'px)';

        /* Glow via box-shadow: folgt Mausposition */
        var glowOffsetX = (data.currentGlowX - 50) * CONFIG.glowIntensity;
        var glowOffsetY = (data.currentGlowY - 50) * CONFIG.glowIntensity;
        card.style.boxShadow =
          'inset ' +
          glowOffsetX.toFixed(1) + 'px ' +
          glowOffsetY.toFixed(1) + 'px ' +
          CONFIG.glowBlur + 'px ' +
          'rgba(37,99,235,' + CONFIG.glowAlpha + ')';

      } else {
        /* ---- Maus weg: Smooth Reset ---- */

        data.currentX = lerp(data.currentX, 0, 0.05);
        data.currentY = lerp(data.currentY, 0, 0.05);
        data.currentGlowX = lerp(data.currentGlowX, 50, 0.05);
        data.currentGlowY = lerp(data.currentGlowY, 50, 0.05);

        if (
          Math.abs(data.currentX) < CONFIG.resetThreshold &&
          Math.abs(data.currentY) < CONFIG.resetThreshold
        ) {
          /* Vollständig zurückgesetzt → Inline-Styles entfernen */
          data.currentX = 0;
          data.currentY = 0;
          data.currentGlowX = 50;
          data.currentGlowY = 50;
          card.style.transform = '';
          card.style.boxShadow = '';
          card.style.transition = '';
        } else {
          card.style.transition = CONFIG.smoothTransition;
          card.style.transform =
            'perspective(' + CONFIG.perspective + 'px) ' +
            'rotateX(' + data.currentX.toFixed(2) + 'deg) ' +
            'rotateY(' + data.currentY.toFixed(2) + 'deg)';
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Card-Erfassung                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Findet alle Cards in den Ziel-Grids.
   * @returns {Element[]}
   */
  function collectCards() {
    var collected = [];

    /* .glass-card + .case-card in den Ziel-Grids */
    var glassCards = document.querySelectorAll('.glass-card');
    for (var i = 0; i < glassCards.length; i++) {
      if (isInTargetGrid(glassCards[i])) {
        collected.push(glassCards[i]);
      }
    }

    var caseCards = document.querySelectorAll('.case-card');
    for (var j = 0; j < caseCards.length; j++) {
      /* .case-card könnte auch in target-grid liegen */
      if (isInTargetGrid(caseCards[j]) && collected.indexOf(caseCards[j]) === -1) {
        collected.push(caseCards[j]);
      }
    }

    return collected;
  }

  /* ------------------------------------------------------------------ */
  /*  Public-API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Initialisiert den Tilt-Effekt.
   * - Deaktiviert auf Touch-Geräten (hover: none) und prefers-reduced-motion
   * - Findet alle Cards, startet IntersectionObserver
   * - Registriert RAF-Callback via Ethilium.onFrame
   */
  function init() {
    if (isInitialized) return;

    /* Auf nicht-interaktiven Geräten deaktivieren */
    if (!hasHover() || prefersReducedMotion()) return;

    /* Cards sammeln */
    cardPool = collectCards();
    if (cardPool.length === 0) return;

    /* IntersectionObserver starten (nur Viewport-Cards werden getracked) */
    startObserver();

    /* RAF-Callback registrieren */
    unsubFrame = Ethilium.onFrame(onFrame);

    isInitialized = true;
  }

  /**
   * Entfernt alle Tilt-Effekte und räumt alle Listener auf.
   * Alle Cards werden in ihren Urzustand zurückversetzt.
   */
  function destroy() {
    if (!isInitialized) return;

    /* RAF unsubscriben */
    if (unsubFrame) {
      unsubFrame();
      unsubFrame = null;
    }

    /* IntersectionObserver beenden */
    stopObserver();

    /* Alle aktiven Cards zurücksetzen */
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card) {
        card.style.transform = '';
        card.style.boxShadow = '';
        card.style.transition = '';
        card.style.willChange = '';
        removeContentTranslateZ(card);
      }
    }

    /* Auch Pool-Cards ohne aktive Tracking zurücksetzen (translateZ) */
    for (var j = 0; j < cardPool.length; j++) {
      removeContentTranslateZ(cardPool[j]);
    }

    cards = [];
    tiltData = [];
    cardPool = [];
    isInitialized = false;
  }

  /* ------------------------------------------------------------------ */
  /*  Module Registration                                               */
  /* ------------------------------------------------------------------ */

  var cardTilt = {
    init: init,
    destroy: destroy
  };

  window.Ethilium.cardTilt = cardTilt;

  /* ---- Auto-Start on DOMContentLoaded (konsistent mit core.js) ---- */

  if (typeof Ethilium.ready === 'function') {
    Ethilium.ready(init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
