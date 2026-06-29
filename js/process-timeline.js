/**
 * process-timeline.js — Scroll-getriggerte Step-Reveal-Animation
 * Ethilium Consulting Single-Page
 *
 * Abhängigkeit: window.Ethilium (core.js)
 *
 * Die 4 Prozess-Schritte (#process) bauen sich beim Scrollen nacheinander auf.
 * Gestaffelt nach Viewport-Visibility: 20 % → Step 1, 40 % → Step 2,
 * 60 % → Step 3, 80 % → Step 4.
 *
 * Jeder Step fade- + translateY-animiert (0.6 s, custom easing).
 * Innenstaffelung: num → title → desc (je 100 ms).
 * Connector-Linien wachsen horizontal (scaleX), sobald der linke Step revealed ist.
 *
 * API:
 *   Ethilium.processTimeline.init()    — Observer starten (Auto-Start via readyState)
 *   Ethilium.processTimeline.destroy() — Observer trennen, Zustand zurücksetzen
 *
 * Design-System:
 *   Step-Transition:   0.6 s cubic-bezier(0.16,1,0.3,1)
 *   Connector:         0.3 s ease-out
 *   Within-Step-Stagger: 100 ms
 *   Accent:            #2563eb (var(--c-accent))
 *
 * Performance:
 *   IntersectionObserver-basiert (kein scroll-event).
 *   Einmalig — keine Re-Animation nach allen 4 Steps.
 *   Respektiert prefers-reduced-motion.
 *
 * @file process-timeline.js
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

  var TRANSITION =
    'opacity 0.6s cubic-bezier(0.16,1,0.3,1), ' +
    'transform 0.6s cubic-bezier(0.16,1,0.3,1)';

  var STAGGER_MS = 100;
  var CONNECTOR_DURATION_MS = 300;
  var THRESHOLDS = [0.2, 0.4, 0.6, 0.8];
  var TOTAL_STEPS = 4;

  /* ------------------------------------------------------------------ */
  /*  DOM-Selektoren                                                    */
  /* ------------------------------------------------------------------ */

  var SECTION_SEL = '#process';
  var STEP_SEL = '.process-step';
  var CONNECTOR_SEL = '.process-step__num-connector';
  var CHILD_SEL =
    '.process-step__num, .process-step__title, .process-step__desc';
  var STEPS_CONTAINER_SEL = '.process-steps';

  /* ------------------------------------------------------------------ */
  /*  Zustand                                                           */
  /* ------------------------------------------------------------------ */

  var observer = null;
  var sectionEl = null;
  var steps = [];
  var connectors = [];
  var revealedStepIndex = -1;
  var allDone = false;

  /* ------------------------------------------------------------------ */
  /*  Hilfsfunktionen                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Prüft ob der Nutzer reduzierte Bewegung bevorzugt.
   * @returns {boolean}
   */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Sammelt alle relevanten DOM-Elemente innerhalb der Process-Section.
   * @returns {boolean} true bei Erfolg, false bei fehlender Section / falscher
   *   Step-Anzahl
   */
  function collectElements() {
    sectionEl = document.querySelector(SECTION_SEL);
    if (!sectionEl) return false;

    steps = Array.prototype.slice.call(
      sectionEl.querySelectorAll(STEP_SEL)
    );
    if (steps.length !== TOTAL_STEPS) return false;

    connectors = Array.prototype.slice.call(
      sectionEl.querySelectorAll(CONNECTOR_SEL)
    );

    return true;
  }

  /**
   * Wendet initialen (unsichtbaren) CSS-Zustand auf alle Steps, Connectors
   * und inneren Kind-Elemente an — bevor der Observer startet.
   *
   * Steps:        opacity 0, translateY(20 px)
   * Connectors:   scaleX(0), transform-origin: left center (via CSS)
   * Innere Kinder: opacity 0, translateY(10 px)
   */
  function applyInitialStyles() {
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];

      s.style.opacity = '0';
      s.style.transform = 'translateY(20px)';
      s.style.transition = TRANSITION;

      // Innere Elemente (num, title, desc) ebenfalls initial unsichtbar
      var children = s.querySelectorAll(CHILD_SEL);
      for (var c = 0; c < children.length; c++) {
        children[c].style.opacity = '0';
        children[c].style.transform = 'translateY(10px)';
        children[c].style.transition = TRANSITION;
      }
    }

    // Connectors: horizontal gestaucht
    for (var j = 0; j < connectors.length; j++) {
      connectors[j].style.transform = 'scaleX(0)';
      connectors[j].style.transition =
        'transform ' + CONNECTOR_DURATION_MS + 'ms ease-out';
    }
  }

  /**
   * Revelat einen einzelnen Step inklusive innerer Staffelung und Connector.
   *
   * 1. Step erhält opacity:1 / translateY(0) + .revealed-Klasse
   * 2. Innen: num (0 ms) → title (100 ms) → desc (200 ms)
   * 3. Nach 100 ms erhält der Step .step-active (accent-glow)
   * 4. Rechter Connector wächst sofort (scaleX(0 → 1))
   *
   * @param {number} index 0-basierter Step-Index
   */
  function revealStep(index) {
    if (index >= steps.length || index <= revealedStepIndex) return;

    var step = steps[index];

    // 1. Step-Endzustand → CSS-Transition läuft an
    step.style.opacity = '1';
    step.style.transform = 'translateY(0)';
    step.classList.add('revealed');

    // 2. Innere Elemente gestaffelt einblenden (num → title → desc)
    var children = [];
    var numEl = step.querySelector('.process-step__num');
    var titleEl = step.querySelector('.process-step__title');
    var descEl = step.querySelector('.process-step__desc');
    if (numEl) children.push(numEl);
    if (titleEl) children.push(titleEl);
    if (descEl) children.push(descEl);

    for (var c = 0; c < children.length; c++) {
      (function (el, delay) {
        setTimeout(function () {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, delay);
      })(children[c], (c + 1) * STAGGER_MS);
    }

    // 3. Step als "aktiv" markieren (accent-glow, siehe CSS)
    setTimeout(function () {
      step.classList.add('step-active');
    }, 100);

    // 4. Verbindungslinie zum nächsten Step "wächst" (von links)
    if (index < connectors.length) {
      connectors[index].style.transform = 'scaleX(1)';
      connectors[index].classList.add('connected');
    }

    revealedStepIndex = index;
  }

  /**
   * Revelat alle Steps & Connectors sofort — für reduced-motion und
   * IntersectionObserver-Fallback. Überspringt die gestaffelten Timeouts.
   */
  function revealAllImmediately() {
    if (allDone) return;
    allDone = true;

    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];

      step.style.opacity = '1';
      step.style.transform = 'translateY(0)';
      step.classList.add('revealed');
      step.classList.add('step-active');

      var children = step.querySelectorAll(CHILD_SEL);
      for (var c = 0; c < children.length; c++) {
        children[c].style.opacity = '1';
        children[c].style.transform = 'translateY(0)';
      }
    }

    for (var j = 0; j < connectors.length; j++) {
      connectors[j].style.transform = 'scaleX(1)';
      connectors[j].classList.add('connected');
    }

    revealedStepIndex = TOTAL_STEPS - 1;

    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /**
   * Aktualisiert die Timeline-Fortschrittslinie (nice-to-have).
   *
   * Setzt CSS-Variable --timeline-progress auf .process-steps.
   * Der Wert läuft von 0 % bis 100 % proportional zum Intersection-Ratio.
   * Das CSS-Pseudo-Element ::before nutzt diesen Wert via var().
   *
   * @param {number} ratio intersectionRatio des Section-Entry (0–1)
   */
  function updateTimelineProgress(ratio) {
    if (!sectionEl) return;

    var stepsEl = sectionEl.querySelector(STEPS_CONTAINER_SEL);
    if (!stepsEl) return;

    var progress = Math.min(Math.max(ratio, 0), 1);
    stepsEl.style.setProperty(
      '--timeline-progress',
      Math.round(progress * 100) + '%'
    );
  }

  /* ------------------------------------------------------------------ */
  /*  IntersectionObserver-Callback                                     */
  /* ------------------------------------------------------------------ */

  /**
   * IntersectionObserver-Callback für die Process-Section.
   *
   * Bei jedem Threshold-Crossing (20/40/60/80 %) wird geprüft, welche
   * Steps nun sichtbar sein sollen. Noch nicht revealed Steps bis zum
   * aktuellen Schwellwert werden über revealStep() nacheinander aktiviert.
   *
   * Sobald alle 4 Steps revealed sind, wird der Observer getrennt
   * (einmalig, keine Re-Animation).
   *
   * @param {IntersectionObserverEntry[]} entries
   */
  function onIntersect(entries) {
    if (allDone) return;

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var ratio = entry.intersectionRatio;

      // Timeline-Fortschritt updaten
      updateTimelineProgress(ratio);

      // Schritt anhand der aktuellen Visibility bestimmen
      var targetIndex = -1;
      if (ratio >= 0.8) {
        targetIndex = 3;
      } else if (ratio >= 0.6) {
        targetIndex = 2;
      } else if (ratio >= 0.4) {
        targetIndex = 1;
      } else if (ratio >= 0.2) {
        targetIndex = 0;
      }

      if (targetIndex < 0) continue;

      // Alle noch nicht revealed Steps bis targetIndex revealen
      for (var s = revealedStepIndex + 1; s <= targetIndex; s++) {
        revealStep(s);
      }

      // Observer trennen sobald alle 4 Steps durch sind
      if (revealedStepIndex >= TOTAL_STEPS - 1) {
        allDone = true;
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        break;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public-API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Initialisiert die Process-Timeline.
   *
   * 1. Baut bestehenden Observer ab
   * 2. Setzt Zustand zurück
   * 3. Sammelt DOM-Elemente (#process, .process-step, …)
   * 4. Wendet initial unsichtbare Styles an
   * 5. Bei prefers-reduced-motion oder fehlendem IntersectionObserver:
   *    sofort alle Steps sichtbar
   * 6. Sonst: Neuer IntersectionObserver mit Threshold-Array
   *    [0.2, 0.4, 0.6, 0.8] auf #process
   */
  function init() {
    // Vorherigen Observer sauber trennen
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Zustand zurücksetzen
    revealedStepIndex = -1;
    allDone = false;

    // DOM-Elemente sammeln (stiller Abbruch wenn nicht vorhanden)
    if (!collectElements()) return;

    // Initiale CSS-Zustände setzen
    applyInitialStyles();

    // Reduced Motion oder kein IntersectionObserver → sofort sichtbar
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      revealAllImmediately();
      return;
    }

    // Neuen Observer starten
    observer = new IntersectionObserver(onIntersect, {
      threshold: THRESHOLDS
    });

    observer.observe(sectionEl);
  }

  /**
   * Zerstört die Process-Timeline.
   *
   * - Trennt den Observer
   * - Setzt den internen Zustand zurück
   *
   * Entfernt KEINE CSS-Klassen/Styles — bereits animierte Steps bleiben
   * sichtbar. Ruft man init() später erneut, werden die Styles neu
   * gesetzt (die Animation wiederholt sich).
   */
  function destroy() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    revealedStepIndex = -1;
    allDone = false;
    steps = [];
    connectors = [];
    sectionEl = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Module Registration                                               */
  /* ------------------------------------------------------------------ */

  var processTimeline = {
    init: init,
    destroy: destroy
  };

  window.Ethilium.processTimeline = processTimeline;

  /* ---- Auto-Start on DOMContentLoaded (konsistent mit scroll-reveal.js
         und counters.js) ---------------------------------------------- */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
