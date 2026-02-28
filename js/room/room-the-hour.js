/**
 * THE Hour — 2x points happy hour indicator
 * Subscribes to theHour:getTheHour and shows/hides a golden banner.
 */

window.ROOM = window.ROOM || {};

ROOM.TheHour = {
  _active: false,
  _unsub: null,
  _bannerEl: null,

  init: function () {
    var self = this;
    var roomId = ROOM.Firebase.roomId;

    this._unsub = ConvexService.watch(
      'theHour:getTheHour',
      { roomId: roomId },
      function (status) {
        if (!status) return;
        var wasActive = self._active;
        self._active = status.active;
        self._renderBanner();
        // Show toast on activation
        if (!wasActive && self._active && ROOM.Animations && ROOM.Animations.showToast) {
          ROOM.Animations.showToast('THE Hour is LIVE! All points are 2x!');
        }
      }
    );
  },

  isActive: function () {
    return this._active;
  },

  _renderBanner: function () {
    if (this._active) {
      this._showBanner();
    } else {
      this._hideBanner();
    }
  },

  _showBanner: function () {
    if (this._bannerEl) return;

    var banner = document.createElement('div');
    banner.className = 'room-the-hour-banner';
    banner.innerHTML =
      '<span class="room-the-hour-icon">⚡ 2x</span>' +
      '<span class="room-the-hour-label"><span class="room-the-hour-title">THE Hour</span> is LIVE — All points doubled!</span>';

    // Insert between topbar and layout, not inside the grid
    var topbar = document.getElementById('roomTopbar');
    if (topbar && topbar.parentNode) {
      topbar.parentNode.insertBefore(banner, topbar.nextSibling);
    }

    this._bannerEl = banner;
    document.body.classList.add('room-the-hour-active');
  },

  _hideBanner: function () {
    if (this._bannerEl) {
      this._bannerEl.remove();
      this._bannerEl = null;
    }
    document.body.classList.remove('room-the-hour-active');
  },

  destroy: function () {
    this._hideBanner();
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  }
};
