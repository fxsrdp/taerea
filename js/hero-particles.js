/**
 * hero-particles.js — Canvas Particle Network für den Hero-Bereich
 * Ethilium Consulting Page
 *
 * Abhängigkeit: window.Ethilium (core.js)
 *
 * Design: Sauberes, professionelles Partikel-Netzwerk im Consulting-Stil.
 * Accent wird dynamisch via --c-accent CSS-Variable gelesen.
 *
 * API:
 *   Ethilium.heroParticles.init()    — Initialisiert Partikel in #hero
 *   Ethilium.heroParticles.destroy() — Räumt Canvas, Events und rAF auf
 *   Ethilium.heroParticles.resize()  — Passt Canvas an Container an
 *
 * Auto-Init: Startet bei DOMContentLoaded wenn #hero existiert.
 *
 * Integration:
 *   - <script src="js/core.js"></script>
 *   - <script src="js/hero-particles.js"></script>
 *
 * CSS (in components.css ergänzen):
 *   #heroCanvas{position:absolute;inset:0;z-index:1;pointer-events:auto;will-change:transform}
 *
 * @file hero-particles.js
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Namespace                                                         */
  /* ------------------------------------------------------------------ */

  window.Ethilium = window.Ethilium || {};

  /* ------------------------------------------------------------------ */
  /*  Konfiguration (Design-System-Werte, keine Arbitrary-Werte)        */
  /* ------------------------------------------------------------------ */

  var CONFIG = {
    PARTICLE_COUNT_MIN: 60,
    PARTICLE_COUNT_MAX: 80,
    PARTICLE_COUNT_MOBILE_MIN: 30,
    PARTICLE_COUNT_MOBILE_MAX: 40,

    SPEED_MIN: 0.2,
    SPEED_MAX: 0.5,

    RADIUS_MIN: 2,
    RADIUS_MAX: 3,
    NODE_OPACITY: 0.15,

    CONNECTION_DIST: 150,
    CONNECTION_OPACITY: 0.06,
    CONNECTION_WIDTH: 0.5,

    MOUSE_RADIUS: 120,
    MOUSE_FORCE: 0.3,

    RESIZE_DEBOUNCE: 200,
    DAMPING: 0.02,
    BOUNCE_DAMPEN: 0.5,
    BOUNCE_MIN: 0.1
  };

  /* ------------------------------------------------------------------ */
  /*  Zustand                                                           */
  /* ------------------------------------------------------------------ */

  var _canvas = null;
  var _ctx = null;
  var _particles = [];
  var _hero = null;
  var _animFrameId = null;
  var _mouse = { x: -1000, y: -1000, active: false };
  var _width = 0;
  var _height = 0;
  var _dpr = 1;
  var _destroyed = false;
  var _reducedMotion = false;
  var _reducedMotionMedia = null;
  var _onFrameUnsub = null;
  var _resizeHandler = null;

  /* ------------------------------------------------------------------ */
  /*  Farben aus CSS-Variable                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Parst einen Hex-Farbwert (#RRGGBB oder #RGB) in [r, g, b].
   * @param {string} hex
   * @returns {number[]}
   */
  function parseHexColor(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16)
    ];
  }

  /**
   * Liest --c-accent via Ethilium.cssVar, fallback auf #2563eb.
   * @returns {number[]} [r, g, b]
   */
  function getAccentRGB() {
    var hex = '#2563eb';
    if (window.Ethilium && typeof Ethilium.cssVar === 'function') {
      var val = Ethilium.cssVar('--c-accent');
      if (val && val.charAt(0) === '#') {
        hex = val;
      }
    }
    return parseHexColor(hex);
  }

  /* ------------------------------------------------------------------ */
  /*  Particle Factory                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Erzeugt einen Partikel mit zufälliger Position und Drift-Geschwindigkeit.
   * @returns {object}
   */
  function createParticle() {
    var speed = CONFIG.SPEED_MIN + Math.random() * (CONFIG.SPEED_MAX - CONFIG.SPEED_MIN);
    var angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * _width,
      y: Math.random() * _height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: CONFIG.RADIUS_MIN + Math.random() * (CONFIG.RADIUS_MAX - CONFIG.RADIUS_MIN),
      baseSpeed: speed
    };
  }

  /**
   * Erzeugt n Partikel.
   * @param {number} count
   */
  function initParticles(count) {
    _particles = [];
    for (var i = 0; i < count; i++) {
      _particles.push(createParticle());
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Canvas Setup                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Erstellt Canvas-Element, injected als erstes Child in #hero.
   */
  function setupCanvas() {
    if (!_hero) return;

    if (_canvas) {
      // Bereits vorhanden — nur Größe aktualisieren
      updateCanvasSize();
      _ctx = _canvas.getContext('2d');
      return;
    }

    _canvas = document.createElement('canvas');
    _canvas.id = 'heroCanvas';

    // Erstes Child in #hero (hinter .hero__inner mit z-index:2)
    var first = _hero.firstChild;
    _hero.insertBefore(_canvas, first);

    updateCanvasSize();
    _ctx = _canvas.getContext('2d');
  }

  /**
   * Aktualisiert Canvas-Abmessungen anhand des Hero-Containers.
   * Berücksichtigt devicePixelRatio für scharfe Darstellung auf Retina.
   */
  function updateCanvasSize() {
    if (!_hero || !_canvas) return;

    var rect = _hero.getBoundingClientRect();
    _dpr = window.devicePixelRatio || 1;
    _width = rect.width;
    _height = rect.height;

    _canvas.width = _width * _dpr;
    _canvas.height = _height * _dpr;
    _canvas.style.width = _width + 'px';
    _canvas.style.height = _height + 'px';
  }

  /* ------------------------------------------------------------------ */
  /*  Event-Handler                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Speichert Mausposition in Canvas-Koordinaten.
   * @param {MouseEvent} e
   */
  function onMouseMove(e) {
    if (!_canvas || _destroyed) return;
    var rect = _canvas.getBoundingClientRect();
    _mouse.x = e.clientX - rect.left;
    _mouse.y = e.clientY - rect.top;
    _mouse.active = true;
  }

  function onMouseLeave() {
    _mouse.active = false;
    _mouse.x = -1000;
    _mouse.y = -1000;
  }

  function bindEvents() {
    if (!_canvas) return;
    _canvas.addEventListener('mousemove', onMouseMove, { passive: true });
    _canvas.addEventListener('mouseleave', onMouseLeave, { passive: true });
  }

  function unbindEvents() {
    if (!_canvas) return;
    _canvas.removeEventListener('mousemove', onMouseMove);
    _canvas.removeEventListener('mouseleave', onMouseLeave);
  }

  /* ------------------------------------------------------------------ */
  /*  Physik & Rendering                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Aktualisiert Partikel-Positionen: Drift, Bounce, Maus-Anziehung.
   */
  function updateParticles() {
    var i, p, dx, dy, dist, force;

    for (i = 0; i < _particles.length; i++) {
      p = _particles[i];

      // Maus-Anziehung (force: 0.3, radius: 120px)
      if (_mouse.active) {
        dx = _mouse.x - p.x;
        dy = _mouse.y - p.y;
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONFIG.MOUSE_RADIUS && dist > 0) {
          force = CONFIG.MOUSE_FORCE * (1 - dist / CONFIG.MOUSE_RADIUS);
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      // Position
      p.x += p.vx;
      p.y += p.vy;

      // Bounce an Canvas-Grenzen (smooth — gedämpfter Richtungswechsel)
      if (p.x < 0) {
        p.x = 0;
        p.vx = Math.abs(p.vx) * CONFIG.BOUNCE_DAMPEN + CONFIG.BOUNCE_MIN;
      } else if (p.x > _width) {
        p.x = _width;
        p.vx = -Math.abs(p.vx) * CONFIG.BOUNCE_DAMPEN - CONFIG.BOUNCE_MIN;
      }

      if (p.y < 0) {
        p.y = 0;
        p.vy = Math.abs(p.vy) * CONFIG.BOUNCE_DAMPEN + CONFIG.BOUNCE_MIN;
      } else if (p.y > _height) {
        p.y = _height;
        p.vy = -Math.abs(p.vy) * CONFIG.BOUNCE_DAMPEN - CONFIG.BOUNCE_MIN;
      }

      // Geschwindigkeit sanft zur Basisgeschwindigkeit zurückführen
      // (verhindert Aufschaukeln durch Maus-Kraft)
      var currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (currentSpeed > 0) {
        var targetVx = (p.vx / currentSpeed) * p.baseSpeed;
        var targetVy = (p.vy / currentSpeed) * p.baseSpeed;
        p.vx += (targetVx - p.vx) * CONFIG.DAMPING;
        p.vy += (targetVy - p.vy) * CONFIG.DAMPING;
      }
    }
  }

  /**
   * Zeichnet das gesamte Partikel-Netzwerk auf das Canvas.
   */
  function render() {
    if (!_ctx || _destroyed || _width === 0 || _height === 0) return;

    var rgb = getAccentRGB();
    var r = rgb[0];
    var g = rgb[1];
    var b = rgb[2];

    // Context-Skala für Retina zurücksetzen und neu setzen
    _ctx.setTransform(1, 0, 0, 1, 0, 0);
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _ctx.scale(_dpr, _dpr);

    // ---- Connections (Linien zwischen nahen Nodes) ----
    _ctx.lineWidth = CONFIG.CONNECTION_WIDTH;

    for (var i = 0; i < _particles.length; i++) {
      var p1 = _particles[i];

      for (var j = i + 1; j < _particles.length; j++) {
        var p2 = _particles[j];
        var dx = p1.x - p2.x;
        var dy = p1.y - p2.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.CONNECTION_DIST) {
          var alpha = CONFIG.CONNECTION_OPACITY * (1 - dist / CONFIG.CONNECTION_DIST);
          _ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(4) + ')';
          _ctx.beginPath();
          _ctx.moveTo(p1.x, p1.y);
          _ctx.lineTo(p2.x, p2.y);
          _ctx.stroke();
        }
      }
    }

    // ---- Nodes (kleine Kreise) ----
    _ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + CONFIG.NODE_OPACITY + ')';
    for (var k = 0; k < _particles.length; k++) {
      var node = _particles[k];
      _ctx.beginPath();
      _ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      _ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Animationsschleife                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Ein Frame der Animation: Update + Render.
   * Wird via Ethilium.onFrame (bevorzugt) oder eigener rAF aufgerufen.
   */
  function tick() {
    if (_destroyed) return;

    if (_reducedMotion) {
      // Nur statisch rendern bei prefers-reduced-motion
      render();
      return;
    }

    updateParticles();
    render();
  }

  /**
   * Startet die rAF-Schleife (Fallback wenn Ethilium.onFrame nicht verfügbar).
   */
  function startFallbackRAF() {
    function loop() {
      if (_destroyed) return;
      tick();
      _animFrameId = window.requestAnimationFrame(loop);
    }
    _animFrameId = window.requestAnimationFrame(loop);
  }

  /**
   * Stoppt die rAF-Schleife.
   */
  function stopFallbackRAF() {
    if (_animFrameId !== null) {
      window.cancelAnimationFrame(_animFrameId);
      _animFrameId = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  prefers-reduced-motion                                            */
  /* ------------------------------------------------------------------ */

  function updateReducedMotion() {
    _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (_reducedMotion && !_destroyed) {
      render();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Resize                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Passt Canvas und Partikel-Positionen proportional an.
   */
  function onResize() {
    if (_destroyed || !_hero) return;

    var oldW = _width || 1;
    var oldH = _height || 1;

    updateCanvasSize();

    if (_particles.length === 0) return;

    // Partikel proportional zur neuen Größe verschieben
    var scaleX = _width / oldW;
    var scaleY = _height / oldH;

    for (var i = 0; i < _particles.length; i++) {
      var p = _particles[i];
      p.x *= scaleX;
      p.y *= scaleY;
    }

    // Einmal neu rendern
    if (_reducedMotion) {
      render();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Initialisiert das Partikel-Netzwerk im Hero-Container.
   *
   * @param {HTMLElement|string} [container] — Hero-Element oder CSS-Selektor.
   *   Standard: #hero
   */
  function init(container) {
    // Vorhandene Instanz sauber trennen
    if (_canvas) {
      destroy();
    }

    _destroyed = false;

    // Container bestimmen
    if (!container) {
      _hero = document.getElementById('hero');
    } else if (typeof container === 'string') {
      _hero = document.querySelector(container);
    } else {
      _hero = container;
    }

    if (!_hero) return;

    // prefers-reduced-motion überwachen
    _reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    _reducedMotion = _reducedMotionMedia.matches;
    try {
      _reducedMotionMedia.addEventListener('change', updateReducedMotion);
    } catch (e) {
      // Fallback für ältere Browser
      _reducedMotionMedia.addListener(updateReducedMotion);
    }

    // Canvas erstellen
    setupCanvas();
    if (!_canvas) return;

    // Partikel-Anzahl basierend auf Breakpoint
    var count;
    if (window.Ethilium && Ethilium.breakpoint === 'mobile') {
      count = CONFIG.PARTICLE_COUNT_MOBILE_MIN +
        Math.floor(Math.random() * (CONFIG.PARTICLE_COUNT_MOBILE_MAX - CONFIG.PARTICLE_COUNT_MOBILE_MIN + 1));
    } else {
      count = CONFIG.PARTICLE_COUNT_MIN +
        Math.floor(Math.random() * (CONFIG.PARTICLE_COUNT_MAX - CONFIG.PARTICLE_COUNT_MIN + 1));
    }
    initParticles(count);

    // Maus-Events binden
    bindEvents();

    // Resize-Handler (debounced via Ethilium.core)
    if (window.Ethilium && typeof Ethilium.debounce === 'function') {
      _resizeHandler = Ethilium.debounce(onResize, CONFIG.RESIZE_DEBOUNCE);
    } else {
      _resizeHandler = onResize;
    }
    window.addEventListener('resize', _resizeHandler, { passive: true });

    // Animation starten
    if (_reducedMotion) {
      render();
    } else if (window.Ethilium && typeof Ethilium.onFrame === 'function') {
      // Bevorzugter Weg: via zentraler rAF-Schleife
      _onFrameUnsub = Ethilium.onFrame(tick);
    } else {
      // Fallback: eigener rAF
      startFallbackRAF();
    }
  }

  /**
   * Zerstört das Partikel-Netzwerk und räumt alle Resourcen.
   */
  function destroy() {
    _destroyed = true;

    // rAF stoppen
    if (_onFrameUnsub) {
      _onFrameUnsub();
      _onFrameUnsub = null;
    }
    stopFallbackRAF();

    // Event-Listener entfernen
    unbindEvents();

    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }

    // reduced-motion Listener entfernen
    if (_reducedMotionMedia) {
      try {
        _reducedMotionMedia.removeEventListener('change', updateReducedMotion);
      } catch (e) {
        _reducedMotionMedia.removeListener(updateReducedMotion);
      }
      _reducedMotionMedia = null;
    }

    // Canvas aus DOM entfernen
    if (_canvas && _canvas.parentNode) {
      _canvas.parentNode.removeChild(_canvas);
    }

    // Referenzen räumen
    _canvas = null;
    _ctx = null;
    _particles = [];
    _hero = null;
    _mouse.active = false;
    _mouse.x = -1000;
    _mouse.y = -1000;
    _width = 0;
    _height = 0;
  }

  /**
   * Manuelles Resize (öffentlich aufrufbar).
   */
  function resize() {
    onResize();
  }

  /* ------------------------------------------------------------------ */
  /*  Module Registration                                               */
  /* ------------------------------------------------------------------ */

  var heroParticles = {
    init: init,
    destroy: destroy,
    resize: resize
  };

  window.Ethilium.heroParticles = heroParticles;

  /* ------------------------------------------------------------------ */
  /*  Auto-Init: Startet bei DOMContentLoaded wenn #hero existiert       */
  /* ------------------------------------------------------------------ */

  function autoInit() {
    if (document.getElementById('hero')) {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})();
