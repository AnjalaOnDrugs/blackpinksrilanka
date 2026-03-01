/**
 * room-member-popup.js — Admin-controlled BLACKPINK member popup
 *
 * Admin triggers entrance/exit and sends dialog text via Convex events.
 * All participants see the popup in real-time.
 */
window.ROOM = window.ROOM || {};

ROOM.MemberPopup = {
  _popupEl: null,
  _bubbleEl: null,
  _currentMember: null,

  _members: {
    lisa:   { name: 'Lisa',   img: 'assets/bps/lisa.png' },
    jennie: { name: 'Jennie', img: 'assets/bps/jennie.png' },
    rose:   { name: 'Rosé',   img: 'assets/bps/rose.png' },
    jisoo:  { name: 'Jisoo',  img: 'assets/bps/kim.png' }
  },

  init: function () {
    // No subscriptions needed — events arrive via room-events.js handleEvent
  },

  handleShow: function (data) {
    if (!data || !data.member) return;
    var memberInfo = this._members[data.member];
    if (!memberInfo) return;

    // Remove any existing popup (admin or leftover DJ solo)
    this._removeExisting();

    this._currentMember = data.member;

    var popup = document.createElement('div');
    popup.className = 'room-member-popup';

    var img = document.createElement('img');
    img.src = memberInfo.img;
    img.className = 'room-member-popup__img';
    img.alt = memberInfo.name;

    popup.appendChild(img);
    document.body.appendChild(popup);
    this._popupEl = popup;
    this._bubbleEl = null;
  },

  handleDialog: function (data) {
    if (!data || !data.dialog) return;
    if (!this._popupEl) return;

    // Remove old bubble if any
    if (this._bubbleEl && this._bubbleEl.parentNode) {
      this._bubbleEl.parentNode.removeChild(this._bubbleEl);
    }

    var bubble = document.createElement('div');
    bubble.className = 'room-member-popup__bubble';
    bubble.textContent = data.dialog;

    this._popupEl.appendChild(bubble);
    this._bubbleEl = bubble;
  },

  handleHide: function () {
    if (!this._popupEl) return;

    var popup = this._popupEl;
    popup.classList.add('room-member-popup--exit');

    var self = this;
    setTimeout(function () {
      if (popup.parentNode) popup.parentNode.removeChild(popup);
      if (self._popupEl === popup) {
        self._popupEl = null;
        self._bubbleEl = null;
        self._currentMember = null;
      }
    }, 600);
  },

  _removeExisting: function () {
    // Remove admin popup
    if (this._popupEl && this._popupEl.parentNode) {
      this._popupEl.parentNode.removeChild(this._popupEl);
    }
    this._popupEl = null;
    this._bubbleEl = null;
    this._currentMember = null;

    // Also remove any leftover DJ solo popup
    var old = document.querySelector('.room-dj-solo-popup');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  },

  destroy: function () {
    this._removeExisting();
  }
};
