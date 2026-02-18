/**
 * Room HeatMap
 * Renders a Sri Lanka district heat map colored by stream count.
 * Uses ConvexService.watch() for real-time updates.
 */

window.ROOM = window.ROOM || {};

ROOM.HeatMap = {
  watchCancel: null,
  districtData: {},
  maxStreams: 0,
  svgEl: null,
  tooltipEl: null,
  legendEl: null,
  statsEl: null,
  panelEl: null,
  isVisible: false,

  // Pink gradient steps (5 levels: dim → hot)
  COLORS: [
    'rgba(247, 166, 185, 0.08)',  // 0 – no streams
    'rgba(247, 166, 185, 0.25)',  // 1
    'rgba(247, 166, 185, 0.45)',  // 2
    'rgba(247, 166, 185, 0.70)',  // 3
    '#f7a6b9'                     // 4 – hottest
  ],

  init: function (roomId) {
    this.svgEl = document.getElementById('heatMapSvg');
    this.tooltipEl = document.getElementById('heatMapTooltip');
    this.legendEl = document.getElementById('heatMapLegend');
    this.statsEl = document.getElementById('heatMapStats');
    this.panelEl = document.getElementById('panelHeatMap');
    if (!this.svgEl) return;

    this.setupInteraction();
    this.subscribe(roomId);
    this.setupTabs(roomId);
  },

  setupTabs: function (roomId) {
    var self = this;
    var tabDistricts = document.getElementById('heatmapTabDistricts');
    var tabPrecise = document.getElementById('heatmapTabPrecise');
    var contentDistricts = document.getElementById('heatmapContentDistricts');
    var contentPrecise = document.getElementById('heatmapContentPrecise');

    if (!tabDistricts || !tabPrecise) return;

    tabDistricts.addEventListener('click', function () {
      tabDistricts.classList.add('room-heatmap-tab--active');
      tabPrecise.classList.remove('room-heatmap-tab--active');
      if (contentDistricts) contentDistricts.style.display = '';
      if (contentPrecise) contentPrecise.style.display = 'none';
    });

    tabPrecise.addEventListener('click', function () {
      tabPrecise.classList.add('room-heatmap-tab--active');
      tabDistricts.classList.remove('room-heatmap-tab--active');
      if (contentPrecise) contentPrecise.style.display = '';
      if (contentDistricts) contentDistricts.style.display = 'none';

      // Lazy-init Deck.gl on first click
      if (!ROOM.HeatMap.Deck._initialized) {
        ROOM.HeatMap.Deck.init(roomId, 'heatMapDeckCanvas');
      }
    });
  },

  subscribe: function (roomId) {
    var self = this;
    this.watchCancel = ConvexService.watch(
      'streams:getStreamsByDistrict',
      { roomId: roomId },
      function (data) {
        if (data) self.updateData(data);
      }
    );
  },

  updateData: function (data) {
    this.districtData = {};
    this.maxStreams = 0;

    var totalStreams = 0;
    var totalUsers = 0;
    var districtsActive = 0;

    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      this.districtData[d.district] = d;
      if (d.totalStreams > this.maxStreams) {
        this.maxStreams = d.totalStreams;
      }
      totalStreams += d.totalStreams;
      totalUsers += d.uniqueUsers;
      districtsActive++;
    }

    this.render();
    this.updateLegend();
    this.updateStats(totalStreams, totalUsers, districtsActive);
  },

  render: function () {
    var paths = this.svgEl.querySelectorAll('.room-heatmap-district');
    var self = this;

    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      var district = path.getAttribute('data-district');
      var data = self.districtData[district];

      if (data && data.totalStreams > 0 && self.maxStreams > 0) {
        var ratio = data.totalStreams / self.maxStreams;
        var colorIndex;
        if (ratio <= 0) colorIndex = 0;
        else if (ratio < 0.25) colorIndex = 1;
        else if (ratio < 0.5) colorIndex = 2;
        else if (ratio < 0.75) colorIndex = 3;
        else colorIndex = 4;

        path.style.fill = self.COLORS[colorIndex];
        path.style.stroke = 'rgba(247, 166, 185, 0.45)';
      } else {
        path.style.fill = self.COLORS[0];
        path.style.stroke = 'rgba(247, 166, 185, 0.22)';
      }
    }
  },

  updateLegend: function () {
    if (!this.legendEl) return;
    var labels = this.legendEl.querySelectorAll('.room-heatmap-legend-label');
    if (labels.length >= 2) {
      labels[0].textContent = '0';
      labels[1].textContent = this.maxStreams || '0';
    }
  },

  updateStats: function (totalStreams, totalUsers, districtsActive) {
    if (!this.statsEl) return;
    this.statsEl.innerHTML =
      '<div class="room-heatmap-stat">' +
      '<span class="room-heatmap-stat-value">' + totalStreams + '</span>' +
      '<span class="room-heatmap-stat-label">Streams</span>' +
      '</div>' +
      '<div class="room-heatmap-stat">' +
      '<span class="room-heatmap-stat-value">' + totalUsers + '</span>' +
      '<span class="room-heatmap-stat-label">Streamers</span>' +
      '</div>' +
      '<div class="room-heatmap-stat">' +
      '<span class="room-heatmap-stat-value">' + districtsActive + '/25</span>' +
      '<span class="room-heatmap-stat-label">Districts</span>' +
      '</div>';
  },

  setupInteraction: function () {
    var paths = this.svgEl.querySelectorAll('.room-heatmap-district');
    var self = this;

    // Desktop hover
    for (var i = 0; i < paths.length; i++) {
      (function (path) {
        path.addEventListener('mouseenter', function (e) {
          self.showTooltip(path, e);
        });
        path.addEventListener('mousemove', function (e) {
          self.moveTooltip(e);
        });
        path.addEventListener('mouseleave', function () {
          self.hideTooltip();
        });
        // Mobile tap
        path.addEventListener('click', function (e) {
          e.stopPropagation();
          self.showTooltip(path, e);
          // Auto-hide after 3s
          clearTimeout(self._tapTimer);
          self._tapTimer = setTimeout(function () {
            self.hideTooltip();
          }, 3000);
        });
      })(paths[i]);
    }

    // Hide tooltip on tap outside on mobile
    if (this.panelEl) {
      this.panelEl.addEventListener('click', function () {
        self.hideTooltip();
      });
    }
  },

  showTooltip: function (path, event) {
    var district = path.getAttribute('data-district');
    var data = this.districtData[district];
    var streams = data ? data.totalStreams : 0;
    var users = data ? data.uniqueUsers : 0;

    this.tooltipEl.innerHTML =
      '<strong>' + district + '</strong><br>' +
      streams + ' stream' + (streams !== 1 ? 's' : '') + ' &middot; ' +
      users + ' user' + (users !== 1 ? 's' : '');
    this.tooltipEl.style.display = 'block';
    this.moveTooltip(event);
  },

  moveTooltip: function (event) {
    if (!this.tooltipEl || this.tooltipEl.style.display === 'none') return;
    var wrap = this.svgEl.closest('.room-heatmap-map-wrap');
    if (!wrap) return;
    var rect = wrap.getBoundingClientRect();
    var x = event.clientX - rect.left + 12;
    var y = event.clientY - rect.top - 10;

    // Keep tooltip within bounds
    var tw = this.tooltipEl.offsetWidth;
    if (x + tw > rect.width) x = x - tw - 24;

    this.tooltipEl.style.left = x + 'px';
    this.tooltipEl.style.top = y + 'px';
  },

  hideTooltip: function () {
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  },

  // Toggle panel visibility (desktop overlay mode)
  toggle: function () {
    if (!this.panelEl) return;
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.panelEl.style.display = '';
      this.panelEl.classList.add('room-panel--heatmap-open');
    } else {
      this.panelEl.classList.remove('room-panel--heatmap-open');
      // Only hide on desktop; on mobile the panel system handles it
      if (window.innerWidth > 768) {
        this.panelEl.style.display = 'none';
      }
    }
  },

  show: function () {
    if (!this.panelEl) return;
    this.isVisible = true;
    this.panelEl.style.display = '';
    this.panelEl.classList.add('room-panel--heatmap-open');
  },

  hide: function () {
    if (!this.panelEl) return;
    this.isVisible = false;
    this.panelEl.classList.remove('room-panel--heatmap-open');
    if (window.innerWidth > 768) {
      this.panelEl.style.display = 'none';
    }
  },

  destroy: function () {
    if (this.watchCancel) {
      this.watchCancel();
      this.watchCancel = null;
    }
    this.hideTooltip();
    ROOM.HeatMap.Deck.destroy();
  }
};

// ─────────────────────────────────────────────
// ROOM.HeatMap.Deck  –  Precise Deck.gl map
// ─────────────────────────────────────────────
ROOM.HeatMap.Deck = {
  _initialized: false,
  _deckCompact: null,
  _deckFull: null,
  _watchCancel: null,
  _data: [],           // [{ lat, lng, weight }]
  _radiusPixels: 30,

  // Match district map pink palette (low → high)
  COLOR_RANGE: [
    [247, 166, 185, 50],
    [247, 166, 185, 90],
    [247, 166, 185, 130],
    [247, 166, 185, 170],
    [247, 166, 185, 210],
    [247, 166, 185, 255]
  ],

  // Sri Lanka center
  INITIAL_VIEW: {
    longitude: 80.7718,
    latitude: 7.8731,
    zoom: 7,
    pitch: 0,
    bearing: 0
  },

  init: function (roomId, compactContainerId) {
    this._initialized = true;
    this._initCompact(compactContainerId);
    this._subscribe(roomId);
    this._setupControls();
  },

  _initCompact: function (containerId) {
    var self = this;
    var container = document.getElementById(containerId);
    if (!container || typeof deck === 'undefined') return;

    this._deckCompact = new deck.DeckGL({
      container: containerId,
      mapLib: maplibregl,
      mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      initialViewState: this.INITIAL_VIEW,
      controller: true,
      layers: [],
      onLoad: function () {
        // Collapse attribution bar by default (same as clicking the (i) button once)
        var el = document.querySelector('#' + containerId + ' .maplibregl-ctrl-attrib');
        if (el) el.classList.add('maplibregl-compact');
        self._applyPinkBasemapStyle(self._deckCompact);
      }
    });
  },

  _getMapInstance: function (deckInstance) {
    if (!deckInstance) return null;
    if (typeof deckInstance.getMap === 'function') return deckInstance.getMap();
    if (typeof deckInstance.getMapboxMap === 'function') return deckInstance.getMapboxMap();
    if (deckInstance.map) return deckInstance.map;
    if (deckInstance._map) return deckInstance._map;
    if (deckInstance._mapboxMap) return deckInstance._mapboxMap;
    if (deckInstance.deck && deckInstance.deck.map) return deckInstance.deck.map;
    return null;
  },

  _applyPinkBasemapStyle: function (deckInstance) {
    var map = this._getMapInstance(deckInstance);
    if (!map || typeof map.getStyle !== 'function' || typeof map.setPaintProperty !== 'function') return;
    if (map.__roomPinkMapStyled) return;
    map.__roomPinkMapStyled = true;

    var apply = function () {
      var style = map.getStyle();
      if (!style || !style.layers) return;

      for (var i = 0; i < style.layers.length; i++) {
        var layer = style.layers[i];
        var id = (layer.id || '').toLowerCase();

        try {
          if (layer.type === 'line') {
            var isBoundary = /admin|boundary|district|province|state|country|border/.test(id);
            var isCountryBoundary = /country|admin.?0|adm.?0|national|admin.?level.?2|boundary.?country|boundary.?2|boundary_2/.test(id);
            var isRoad = /road|street|transport|rail|highway|motorway|trunk/.test(id);
            var lineColor = 'rgba(247,166,185,0.16)';
            var lineOpacity = 0.35;
            var lineWidth = 0.75;
            if (isRoad) {
              lineColor = 'rgba(247,166,185,0.22)';
              lineOpacity = 0.45;
            }
            if (isBoundary) {
              lineColor = 'rgba(247,166,185,0.35)';
              lineOpacity = 0.5;
              lineWidth = 1;
            }
            if (isCountryBoundary) {
              lineColor = 'rgba(247,166,185,1)';
              lineOpacity = 1;
              lineWidth = 4;
            }
            map.setPaintProperty(layer.id, 'line-color', lineColor);
            map.setPaintProperty(layer.id, 'line-opacity', lineOpacity);
            map.setPaintProperty(layer.id, 'line-width', lineWidth);
          } else if (layer.type === 'fill') {
            if (/water|ocean|sea|marine|bathymetry/.test(id)) {
              map.setPaintProperty(layer.id, 'fill-color', 'rgba(18,12,20,1)');
              map.setPaintProperty(layer.id, 'fill-opacity', 0.2);
            } else if (/land|earth|landcover|landuse|building/.test(id)) {
              // Land fill — more visible pink tint so Sri Lanka shape stands out against dark ocean
              map.setPaintProperty(layer.id, 'fill-color', 'rgba(247,166,185,0.15)');
              map.setPaintProperty(layer.id, 'fill-opacity', 1);
            }
          } else if (layer.type === 'raster') {
            if (/water|ocean|sea|marine|bathymetry/.test(id)) {
              map.setPaintProperty(layer.id, 'raster-opacity', 0.2);
            }
          } else if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', 'rgba(18,12,20,0.22)');
          } else if (layer.type === 'symbol' && /label|place|city|country|town/.test(id)) {
            map.setPaintProperty(layer.id, 'text-color', 'rgba(247,166,185,0.70)');
            map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(12,10,14,0.85)');
            map.setPaintProperty(layer.id, 'text-halo-width', 0.8);
          }
        } catch (e) {
          // Some style layers may not support all paint props.
        }
      }
    };

    apply();
    if (typeof map.on === 'function') {
      map.on('styledata', apply);
    }
  },

  _subscribe: function (roomId) {
    var self = this;
    this._watchCancel = ConvexService.watch(
      'streams:getPreciseHeatmapData',
      { roomId: roomId },
      function (data) {
        if (data) {
          self._data = data;
          self._render();
        }
      }
    );
  },

  _buildLayer: function () {
    var self = this;
    if (typeof deck === 'undefined') return null;
    return new deck.HeatmapLayer({
      id: 'precise-heatmap',
      data: self._data,
      getPosition: function (d) { return [d.lng, d.lat]; },
      getWeight: function (d) { return d.weight || 1; },
      radiusPixels: self._radiusPixels,
      intensity: 1.2,
      threshold: 0.03,
      opacity: 0.85,
      colorRange: self.COLOR_RANGE,
      aggregation: 'SUM'
    });
  },

  _render: function () {
    var layer = this._buildLayer();
    if (!layer) return;

    if (this._deckCompact) {
      this._deckCompact.setProps({ layers: [layer] });
    }
    if (this._deckFull) {
      // Build a fresh layer instance for the full-screen instance
      this._deckFull.setProps({ layers: [this._buildLayer()] });
    }

    // Update hint text
    var hint = document.getElementById('deckHintText');
    if (hint) {
      var count = this._data.length;
      hint.textContent = count > 0
        ? count + ' user' + (count !== 1 ? 's' : '') + ' with precise location'
        : 'Only users who shared their precise location appear here.';
    }
  },

  _setupControls: function () {
    var self = this;

    // Compact panel radius slider
    var slider = document.getElementById('deckRadiusSlider');
    var sliderVal = document.getElementById('deckRadiusVal');
    if (slider) {
      slider.addEventListener('input', function () {
        self._radiusPixels = Number(this.value);
        if (sliderVal) sliderVal.textContent = self._radiusPixels + 'px';
        self._render();
        // Keep fullscreen slider in sync
        var fullSlider = document.getElementById('deckRadiusSliderFull');
        if (fullSlider) fullSlider.value = self._radiusPixels;
        var fullVal = document.getElementById('deckRadiusValFull');
        if (fullVal) fullVal.textContent = self._radiusPixels + 'px';
      });
    }

    // Fullscreen open button
    var fsBtn = document.getElementById('deckFullscreenBtn');
    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        self._openFullscreen();
      });
    }

    // Fullscreen close button
    var closeBtn = document.getElementById('deckFullscreenClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        self._closeFullscreen();
      });
    }

    // Fullscreen radius slider
    var fullSlider = document.getElementById('deckRadiusSliderFull');
    var fullVal = document.getElementById('deckRadiusValFull');
    if (fullSlider) {
      fullSlider.addEventListener('input', function () {
        self._radiusPixels = Number(this.value);
        if (fullVal) fullVal.textContent = self._radiusPixels + 'px';
        self._render();
        // Sync compact slider
        var cSlider = document.getElementById('deckRadiusSlider');
        if (cSlider) cSlider.value = self._radiusPixels;
        var cVal = document.getElementById('deckRadiusVal');
        if (cVal) cVal.textContent = self._radiusPixels + 'px';
      });
    }
  },

  _openFullscreen: function () {
    var self = this;
    var modal = document.getElementById('deckFullscreenModal');
    if (!modal) return;
    modal.style.display = 'flex';

    // Lazy-create fullscreen DeckGL instance
    if (!this._deckFull && typeof deck !== 'undefined') {
      this._deckFull = new deck.DeckGL({
        container: 'heatMapDeckCanvasFull',
        mapLib: maplibregl,
        mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        initialViewState: this.INITIAL_VIEW,
        controller: true,
        layers: [],
        onLoad: function () {
          var el = document.querySelector('#heatMapDeckCanvasFull .maplibregl-ctrl-attrib');
          if (el) el.classList.add('maplibregl-compact');
          self._applyPinkBasemapStyle(self._deckFull);
        }
      });
      // Render current data into the new instance
      this._render();
    }
  },

  _closeFullscreen: function () {
    var modal = document.getElementById('deckFullscreenModal');
    if (modal) modal.style.display = 'none';
  },

  destroy: function () {
    if (this._watchCancel) {
      this._watchCancel();
      this._watchCancel = null;
    }
    if (this._deckCompact) {
      this._deckCompact.finalize();
      this._deckCompact = null;
    }
    if (this._deckFull) {
      this._deckFull.finalize();
      this._deckFull = null;
    }
    this._initialized = false;
  }
};
