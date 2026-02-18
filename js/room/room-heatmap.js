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
        path.style.stroke = 'rgba(247, 166, 185, 0.4)';
      } else {
        path.style.fill = self.COLORS[0];
        path.style.stroke = 'rgba(255, 255, 255, 0.08)';
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
  }
};
