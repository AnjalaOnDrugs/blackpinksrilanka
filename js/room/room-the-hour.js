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
      '<div class="room-the-hour-icon">2x</div>' +
      '<div class="room-the-hour-text">' +
        '<strong>THE Hour is LIVE!</strong>' +
        '<span>All points are doubled right now</span>' +
      '</div>';

    var roomArea = document.getElementById('roomLayout');
    if (roomArea) {
      roomArea.insertBefore(banner, roomArea.firstChild);
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
