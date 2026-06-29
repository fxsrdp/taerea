/**
 * hero-typewriter.js — Gestaffeltes Wort-für-Wort Reveal für den Hero
 * Ethilium Consulting Single-Page
 *
 * Abhängigkeit: window.Ethilium (core.js) — benötigt Ethilium.ready()
 *
 * DOM-Struktur (erwartet):
 *   <section id="hero" class="hero">
 *     <div class="hero__inner inner">
 *       <p class="hero__pre">Ethilium</p>
 *       <h1 class="hero__headline">...<br><span class="hero__headline-accent">...</span></h1>
 *       <p class="hero__sub">...</p>
 *       <div class="hero__actions">...</div>
 *       <div class="hero__metrics">...</div>
 *     </div>
 *   </section>
 *
 * Timing (ms ab DOMContentLoaded):
 *   .hero__pre         → 200ms
 *   .hero__headline    → +300ms (Wort-für-Wort, 80ms Stagger)
 *   .hero__sub         → +200ms nach letztem Headline-Wort
 *   .hero__actions     → +100ms nach sub
 *   .hero__metrics     → +100ms nach actions
 *
 * Design-System:
 *   Animation:    opacity 0→1 + translateY(8px→0) / translateY(12px→0)
 *   Wort-Dauer:   300ms
 *   Wort-Stagger: 80ms
 *   Easing:       cubic-bezier(0.16, 1, 0.3, 1)
 *
 * Barrierefreiheit:
 *   prefers-reduced-motion → alle Elemente sofort sichtbar
 *   JS deaktiviert → CSS-Fallback (.hero__inner > * { opacity: 1; transform: none; })
 *
 * API:
 *   Ethilium.heroTypewriter.init()    — startet die Animation
 *   Ethilium.heroTypewriter.destroy() — bricht ab, räumt auf
 *
 * @file hero-typewriter.js
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Konfiguration (Design-System Tokens)                              */
  /* ------------------------------------------------------------------ */

  var WORD_STAGGER = 80;          // ms zwischen Wörtern
  var WORD_DURATION = 300;        // ms pro Wort/Element
  var EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

  var PRE_DELAY       = 200;      // ms — pre nach Seitenladung
  var HEADLINE_OFFSET = 300;      // ms — headline-Start nach pre
  var SUB_OFFSET      = 200;      // ms — sub nach letztem Wort
  var ACTIONS_OFFSET  = 100;      // ms — actions nach sub
  var METRICS_OFFSET  = 100;      // ms — metrics nach actions

  var INITIAL_OFFSET      = 12;   // px — versteckter Start (alle Elemente)
  var WORD_START_OFFSET    = 8;   // px — Wort-Animationsstart

  var WILL_CLEANUP_MARGIN = 50;   // ms — Puffer nach Animationsende

  /* ------------------------------------------------------------------ */
  /*  Zustand                                                           */
  /* ------------------------------------------------------------------ */

  var timeouts = [];
  var isActive = false;

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
   * Alle registrierten Timeouts löschen.
   */
  function clearTimeouts() {
    for (var i = 0; i < timeouts.length; i++) {
      clearTimeout(timeouts[i]);
    }
    timeouts = [];
  }

  /**
   * Timeout registrieren + verwalten.
   * @param {Function} fn
   * @param {number}   ms
   * @returns {number} timeoutId
   */
  function addTimeout(fn, ms) {
    var id = setTimeout(fn, ms);
    timeouts.push(id);
    return id;
  }

  /* ------------------------------------------------------------------ */
  /*  DOM-Manipulation                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Splittet den Text von .hero__headline in einzelne <span>-Elemente
   * pro Wort. <br>-Tags bleiben erhalten. Der .hero__headline-accent
   * wird als Ganzes behandelt (ein "Wort").
   *
   * Nach dem Splitten haben alle Wort-Spans display:inline-block
   * und den initialen opacity:0 + translateY(WORD_START_OFFSET).
   *
   * @param {HTMLElement} headline — .hero__headline
   */
  function splitHeadline(headline) {
    var fragment = document.createDocumentFragment();
    var nodes = Array.prototype.slice.call(headline.childNodes);

    nodes.forEach(function (node) {
      // --- Textknoten: nach Wörtern splitten ---
      if (node.nodeType === 3) {
        var text = node.textContent;
        var parts = text.split(/(\s+)/);

        parts.forEach(function (part) {
          if (part.length === 0) return;

          // Whitespace als Textknoten erhalten
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(part));
            return;
          }

          // Wort → <span>
          var span = document.createElement('span');
          span.className = 'hero__headline-word';
          span.textContent = part;
          span.style.display = 'inline-block';
          span.style.opacity = '0';
          span.style.transform = 'translateY(' + WORD_START_OFFSET + 'px)';
          fragment.appendChild(span);
        });
        return;
      }

      // --- Elementknoten ---
      if (node.nodeType === 1) {
        // <br> unverändert übernehmen
        if (node.tagName === 'BR') {
          fragment.appendChild(node.cloneNode(true));
          return;
        }

        // .hero__headline-accent als Ganzes behandeln
        if (node.classList && node.classList.contains('hero__headline-accent')) {
          var wrapper = document.createElement('span');
          wrapper.className = 'hero__headline-word hero__headline-word--accent';
          wrapper.style.display = 'inline-block';
          wrapper.style.opacity = '0';
          wrapper.style.transform = 'translateY(' + WORD_START_OFFSET + 'px)';
          wrapper.appendChild(node.cloneNode(true));
          fragment.appendChild(wrapper);
          return;
        }

        // Alle anderen Elemente unverändert übernehmen
        fragment.appendChild(node.cloneNode(true));
      }
    });

    headline.innerHTML = '';
    headline.appendChild(fragment);
  }

  /**
   * Setzt den initialen (unsichtbaren) Zustand auf alle direkten
   * Kinder von .hero__inner.
   *
   * Die Headline selbst bekommt kein translateY (nur opacity: 0),
   * damit die Wort-Transforms sich nicht mit dem Parent-Transform
   * überlagern.
   *
   * @param {HTMLElement} hero — #hero
   */
  function setInitialStyles(hero) {
    var children = hero.querySelectorAll('.hero__inner > *');
    Array.prototype.forEach.call(children, function (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(' + INITIAL_OFFSET + 'px)';
    });

    // Headline: opacity-only, kein translateY (Wörter regeln selbst)
    var headline = hero.querySelector('.hero__headline');
    if (headline) {
      headline.style.transform = 'none';
    }
  }

  /**
   * Macht alle Hero-Elemente sofort sichtbar.
   * Für prefers-reduced-motion oder als Fallback nach destroy().
   *
   * @param {HTMLElement} hero — #hero
   */
  function revealAllNow(hero) {
    if (!hero) return;

    var all = hero.querySelectorAll('.hero__inner > *, .hero__headline-word');
    Array.prototype.forEach.call(all, function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.transition = 'none';
      el.style.willChange = '';
    });
  }

  /**
   * Animiert ein einzelnes Element von unsichtbar zu sichtbar.
   *
   * @param {HTMLElement} el            — Das Element
   * @param {number}      delay         — Verzögerung in ms
   * @param {number}      [startOffset] — translateY-Startwert (px)
   */
  function revealElement(el, delay, startOffset) {
    if (!el) return;

    var offset = (typeof startOffset !== 'undefined') ? startOffset : INITIAL_OFFSET;

    // 1) Startposition setzen (ohne Transition)
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateY(' + offset + 'px)';
    el.style.willChange = 'transform, opacity';

    // 2) Reflow erzwingen
    void el.offsetWidth;

    // 3) Transition aktivieren
    var trans = 'opacity ' + WORD_DURATION + 'ms ' + EASING +
                ', transform ' + WORD_DURATION + 'ms ' + EASING;
    el.style.transition = trans;
    el.style.transitionDelay = (delay > 0 ? delay : 0) + 'ms';

    // 4) Endzustand → Transition läuft
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';

    // 5) will-change nach Animation entfernen
    var cleanupDelay = WORD_DURATION + (delay || 0) + WILL_CLEANUP_MARGIN;
    addTimeout(function () {
      if (!isActive) return;           // wurde zwischenzeitlich destroyed
      el.style.willChange = '';
      el.style.transition = '';
      el.style.transitionDelay = '';
    }, cleanupDelay);
  }

  /* ------------------------------------------------------------------ */
  /*  Hauptlogik                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Startet die gestaffelte Hero-Typewriter-Animation.
   * Kann mehrfach aufgerufen werden (vorheriger Lauf wird gecleaned).
   */
  function init() {
    // Bestehende Animation abbrechen
    if (isActive) {
      destroy();
    }

    var hero = document.querySelector('#hero');
    if (!hero) return;                    // Clean exit: kein Hero

    var pre     = hero.querySelector('.hero__pre');
    var headline = hero.querySelector('.hero__headline');
    var sub     = hero.querySelector('.hero__sub');
    var actions = hero.querySelector('.hero__actions');
    var metrics = hero.querySelector('.hero__metrics');

    // Reduced Motion → sofort sichtbar, keine Animation
    if (prefersReducedMotion()) {
      revealAllNow(hero);
      return;
    }

    isActive = true;

    // -- Initialen versteckten Zustand setzen --
    setInitialStyles(hero);

    // -- Headline in Wort-Spans splitten --
    if (headline) {
      splitHeadline(headline);
    }

    // -- Wort-Elemente sammeln --
    var wordEls = headline
      ? headline.querySelectorAll('.hero__headline-word')
      : [];
    var wordCount = wordEls.length;

    // -- Timeline berechnen --
    var preDelay          = PRE_DELAY;
    var headlineStart     = preDelay + HEADLINE_OFFSET;                       // 500ms
    var lastWordEnd       = headlineStart + Math.max(0, wordCount - 1) * WORD_STAGGER + WORD_DURATION;
    var subDelay          = lastWordEnd + SUB_OFFSET;
    var actionsDelay      = subDelay + WORD_DURATION + ACTIONS_OFFSET;
    var metricsDelay      = actionsDelay + WORD_DURATION + METRICS_OFFSET;

    // -- 1. .hero__pre --
    revealElement(pre, preDelay);

    // -- 2. .hero__headline Container (opacity-only, damit keine Transform-Überlagerung) --
    if (headline) {
      headline.style.transition = 'none';
      headline.style.opacity = '0';
      headline.style.transform = 'none';
      void headline.offsetWidth;
      headline.style.transition = 'opacity ' + WORD_DURATION + 'ms ' + EASING;
      headline.style.transitionDelay = headlineStart + 'ms';
      headline.style.opacity = '1';

      // will-change zurücksetzen nach Animation
      addTimeout(function () {
        if (!isActive) return;
        headline.style.willChange = '';
        headline.style.transition = '';
        headline.style.transitionDelay = '';
      }, headlineStart + WORD_DURATION + WILL_CLEANUP_MARGIN);
    }

    // -- 3. Headline-Wörter (gestaffelt) --
    if (wordCount > 0) {
      Array.prototype.forEach.call(wordEls, function (word, i) {
        var wordDelay = headlineStart + i * WORD_STAGGER;
        revealElement(word, wordDelay, WORD_START_OFFSET);
      });
    }

    // -- 4. .hero__sub --
    revealElement(sub, subDelay);

    // -- 5. .hero__actions --
    revealElement(actions, actionsDelay);

    // -- 6. .hero__metrics --
    revealElement(metrics, metricsDelay);
  }

  /**
   * Bricht alle laufenden Animationen ab und räumt Inline-Styles auf.
   * Elemente bleiben im aktuellen visuellen Zustand (CSS-Default =
   * opacity: 1; transform: none — siehe components.css Section 13).
   */
  function destroy() {
    isActive = false;
    clearTimeouts();

    var hero = document.querySelector('#hero');
    if (!hero) return;

    // Inline-Styles von allen animierten Elementen entfernen
    var selectors = [
      '.hero__pre',
      '.hero__headline',
      '.hero__headline-word',
      '.hero__sub',
      '.hero__actions',
      '.hero__metrics'
    ];

    selectors.forEach(function (sel) {
      var els = hero.querySelectorAll(sel);
      Array.prototype.forEach.call(els, function (el) {
        el.style.opacity = '';
        el.style.transform = '';
        el.style.transition = '';
        el.style.transitionDelay = '';
        el.style.willChange = '';
        el.style.display = '';          // nur für Wort-Spans → CSS-Klasse regelt
        if (!el.getAttribute('style')) {
          el.removeAttribute('style');
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Public-API                                                         */
  /* ------------------------------------------------------------------ */

  var heroTypewriter = {
    init: init,
    destroy: destroy
  };

  /* ------------------------------------------------------------------ */
  /*  Module Registration                                                */
  /* ------------------------------------------------------------------ */

  window.Ethilium = window.Ethilium || {};
  window.Ethilium.heroTypewriter = heroTypewriter;

  /* ------------------------------------------------------------------ */
  /*  Auto-Start                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Startet automatisch sobald das DOM bereit ist.
   * Nutzt Ethilium.ready() falls vorhanden (aus core.js),
   * sonst DOMContentLoaded-Fallback.
   */
  function autoInit() {
    if (typeof window.Ethilium !== 'undefined' && window.Ethilium.ready) {
      window.Ethilium.ready(init);
    } else {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    }
  }

  autoInit();

})();
