/**
 * Calendar Page Logic
 * Full-page calendar with daily check-in and special day animations.
 */

// ========== SPECIAL DAYS CONFIG ==========
var SPECIAL_DAYS = {
  "2026-02-27": {
    title: "BLACKPINK Comeback",
    subtitle: 'Title Track: "GO"',
    type: "comeback",
    icon: "\uD83D\uDDA4",
    animation: "comeback"
  }
};

// Sri Lanka UTC+5:30 offset
var SL_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getSriLankaDateKey(d) {
  var ts = (d ? d.getTime() : Date.now()) + SL_OFFSET_MS;
  return new Date(ts).toISOString().split('T')[0];
}

function getSriLankaToday() {
  var ts = Date.now() + SL_OFFSET_MS;
  return new Date(ts);
}

// Lottie success check animation (same as room-run-playlist.js)
var SUCCESS_LOTTIE_DATA_URI = 'data:application/octet-stream;base64,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';

var MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ========== AUTH PROTECTION ==========
checkAuthState().then(async function (user) {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  try {
    var userData = await getCurrentUserData();
    CalendarApp.init(userData);
  } catch (err) {
    console.error('Error loading calendar:', err);
    document.getElementById('calLoading').innerHTML =
      '<div class="cal-loading"><div class="cal-loading-text">Could not load calendar. Please try again.</div></div>';
  }
});

// ========== MAIN CALENDAR OBJECT ==========
var CalendarApp = {
  _userData: null,
  _currentMonth: null,
  _currentYear: null,
  _checkins: {},
  _streak: 0,
  _toastTimer: null,

  init: function (userData) {
    this._userData = userData;
    var now = getSriLankaToday();
    this._currentMonth = now.getUTCMonth();
    this._currentYear = now.getUTCFullYear();

    var self = this;
    document.getElementById('prevMonthBtn').addEventListener('click', function () { self._prevMonth(); });
    document.getElementById('nextMonthBtn').addEventListener('click', function () { self._nextMonth(); });
    document.getElementById('calCheckinBtn').addEventListener('click', function () { self._doCheckIn(); });

    this._loadStreak();
    this._loadMonthData();

    document.getElementById('calLoading').style.display = 'none';
    document.getElementById('calContent').style.display = '';

    // Show special panel if today is special
    var todayKey = this._todayKey();
    if (SPECIAL_DAYS[todayKey]) {
      this._showSpecialPanel(todayKey);
    }
  },

  // ========== DATA LOADING ==========
  _loadMonthData: function () {
    var self = this;
    var monthPrefix = this._currentYear + '-' + String(this._currentMonth + 1).padStart(2, '0');

    ConvexService.query('checkins:getMonthCheckins', {
      phoneNumber: this._userData.phoneNumber,
      monthPrefix: monthPrefix
    }).then(function (checkins) {
      self._checkins = {};
      for (var i = 0; i < checkins.length; i++) {
        self._checkins[checkins[i].dateKey] = true;
      }
      self._renderMonth();
      self._updateCheckinButton();
    }).catch(function (err) {
      console.error('Error loading check-ins:', err);
      self._renderMonth();
    });
  },

  _loadStreak: function () {
    var self = this;
    ConvexService.query('checkins:getStreak', {
      phoneNumber: this._userData.phoneNumber
    }).then(function (result) {
      self._streak = result.streak;
      document.getElementById('streakCount').textContent = result.streak;
    }).catch(function (err) {
      console.error('Error loading streak:', err);
    });
  },

  // ========== RENDERING ==========
  _renderMonth: function () {
    var container = document.getElementById('calDays');
    container.innerHTML = '';

    // Update title
    document.getElementById('monthTitle').textContent =
      MONTH_NAMES[this._currentMonth] + ' ' + this._currentYear;

    var todayKey = this._todayKey();
    var today = getSriLankaToday();
    var todayYear = today.getUTCFullYear();
    var todayMonth = today.getUTCMonth();
    var todayDate = today.getUTCDate();

    // First day of month (0=Sun, convert to Mon=0)
    var firstDay = new Date(Date.UTC(this._currentYear, this._currentMonth, 1));
    var startDow = firstDay.getUTCDay();
    startDow = startDow === 0 ? 6 : startDow - 1; // Convert Sun=0 to Mon-based

    // Days in month
    var daysInMonth = new Date(Date.UTC(this._currentYear, this._currentMonth + 1, 0)).getUTCDate();

    // Days in previous month
    var daysInPrevMonth = new Date(Date.UTC(this._currentYear, this._currentMonth, 0)).getUTCDate();

    // Fill leading cells from previous month
    for (var p = startDow - 1; p >= 0; p--) {
      var prevDate = daysInPrevMonth - p;
      this._createDayCell(container, prevDate, true, false);
    }

    // Fill current month days
    for (var d = 1; d <= daysInMonth; d++) {
      var dateKey = this._currentYear + '-' +
        String(this._currentMonth + 1).padStart(2, '0') + '-' +
        String(d).padStart(2, '0');

      var isToday = (this._currentYear === todayYear &&
        this._currentMonth === todayMonth && d === todayDate);

      var isPast = false;
      if (this._currentYear < todayYear) {
        isPast = true;
      } else if (this._currentYear === todayYear) {
        if (this._currentMonth < todayMonth) {
          isPast = true;
        } else if (this._currentMonth === todayMonth && d < todayDate) {
          isPast = true;
        }
      }

      var isFuture = false;
      if (this._currentYear > todayYear) {
        isFuture = true;
      } else if (this._currentYear === todayYear) {
        if (this._currentMonth > todayMonth) {
          isFuture = true;
        } else if (this._currentMonth === todayMonth && d > todayDate) {
          isFuture = true;
        }
      }

      var isChecked = !!this._checkins[dateKey];
      var isSpecial = !!SPECIAL_DAYS[dateKey];

      var cell = document.createElement('div');
      cell.className = 'cal-day';

      if (isToday) cell.classList.add('cal-day--today');
      if (isChecked) cell.classList.add('cal-day--checked');
      if (isSpecial) cell.classList.add('cal-day--special');
      if (isPast && !isChecked && !isToday) cell.classList.add('cal-day--past-unchecked');
      if (isFuture && !isToday) cell.classList.add('cal-day--future');

      // Date number
      var num = document.createElement('span');
      num.className = 'cal-day-num';
      num.textContent = d;
      cell.appendChild(num);

      // Check indicator
      if (isChecked) {
        var check = document.createElement('div');
        check.className = 'cal-day-check';
        check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        cell.appendChild(check);
      }

      // Special badge
      if (isSpecial) {
        var badge = document.createElement('div');
        badge.className = 'cal-day-special-badge';
        badge.textContent = SPECIAL_DAYS[dateKey].icon || '\u2728';
        cell.appendChild(badge);
      }

      // Click handler for special days
      if (isSpecial) {
        (function (key) {
          cell.style.cursor = 'pointer';
          cell.addEventListener('click', function () {
            CalendarApp._showSpecialPanel(key);
          });
        })(dateKey);
      }

      container.appendChild(cell);
    }

    // Fill trailing cells from next month
    var totalCells = startDow + daysInMonth;
    var trailingCells = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
    for (var n = 1; n <= trailingCells; n++) {
      this._createDayCell(container, n, true, false);
    }

    // Update nav buttons
    this._updateNavButtons();
  },

  _createDayCell: function (container, dayNum, isOtherMonth) {
    var cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isOtherMonth) cell.classList.add('cal-day--other-month');

    var num = document.createElement('span');
    num.className = 'cal-day-num';
    num.textContent = dayNum;
    cell.appendChild(num);

    container.appendChild(cell);
  },

  _updateCheckinButton: function () {
    var todayKey = this._todayKey();
    var today = getSriLankaToday();
    var isCurrentMonth = (this._currentMonth === today.getUTCMonth() &&
      this._currentYear === today.getUTCFullYear());

    var btn = document.getElementById('calCheckinBtn');
    var done = document.getElementById('checkinDone');
    var section = document.getElementById('checkinSection');

    if (!isCurrentMonth) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    if (this._checkins[todayKey]) {
      btn.style.display = 'none';
      done.style.display = 'flex';
    } else {
      btn.style.display = 'flex';
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Check In Today';
      done.style.display = 'none';
    }
  },

  _showSpecialPanel: function (dateKey) {
    var special = SPECIAL_DAYS[dateKey];
    if (!special) return;

    var panel = document.getElementById('specialPanel');
    document.getElementById('specialBadgeIcon').textContent = special.icon || '\u2728';
    document.getElementById('specialTitle').textContent = special.title;
    document.getElementById('specialSubtitle').textContent = special.subtitle;
    panel.style.display = '';
  },

  _updateNavButtons: function () {
    var today = getSriLankaToday();
    var todayMonth = today.getUTCMonth();
    var todayYear = today.getUTCFullYear();

    // Disable next if viewing next month
    var nextBtn = document.getElementById('nextMonthBtn');
    if (this._currentYear > todayYear ||
      (this._currentYear === todayYear && this._currentMonth >= todayMonth + 1)) {
      nextBtn.disabled = true;
    } else {
      nextBtn.disabled = false;
    }

    // Disable prev if viewing more than 12 months ago
    var prevBtn = document.getElementById('prevMonthBtn');
    var monthsDiff = (todayYear - this._currentYear) * 12 + (todayMonth - this._currentMonth);
    prevBtn.disabled = monthsDiff >= 12;
  },

  // ========== CHECK-IN ==========
  _doCheckIn: function () {
    var self = this;
    var btn = document.getElementById('calCheckinBtn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Checking in...';

    ConvexService.mutation('checkins:checkIn', {
      phoneNumber: this._userData.phoneNumber
    }).then(function (result) {
      if (result.alreadyCheckedIn) {
        self._showToast('Already checked in today!');
        self._updateCheckinButton();
        return;
      }

      // Update local state
      self._checkins[result.dateKey] = true;
      self._renderMonth();
      self._updateCheckinButton();
      self._loadStreak();

      // Play animation
      var special = SPECIAL_DAYS[result.dateKey];
      if (special) {
        self._playSpecialCheckInAnimation(special);
      } else {
        self._playNormalCheckInAnimation();
      }
    }).catch(function (err) {
      console.error('Check-in error:', err);
      self._showToast('Check-in failed. Please try again.');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Check In Today';
    });
  },

  // ========== ANIMATIONS ==========
  _playNormalCheckInAnimation: function () {
    var overlay = document.getElementById('calAnimationOverlay');
    overlay.style.pointerEvents = 'auto';

    overlay.innerHTML =
      '<div class="cal-success-wrap">' +
      '<dotlottie-player src="' + SUCCESS_LOTTIE_DATA_URI + '" autoplay speed="1" style="width:120px;height:120px;"></dotlottie-player>' +
      '<div class="cal-success-text">Checked In!</div>' +
      '</div>';
    overlay.classList.add('cal-animation-overlay--visible');

    this._spawnConfetti(30, ['#f7a6b9', '#25D366', '#ffc107', '#fff']);

    setTimeout(function () {
      overlay.classList.remove('cal-animation-overlay--visible');
      overlay.style.pointerEvents = 'none';
      setTimeout(function () { overlay.innerHTML = ''; }, 500);
    }, 2000);
  },

  _playSpecialCheckInAnimation: function (special) {
    if (special.animation === 'comeback') {
      this._playComebackAnimation(special);
      return;
    }
    this._playNormalCheckInAnimation();
  },

  _playComebackAnimation: function (special) {
    var overlay = document.getElementById('calAnimationOverlay');
    overlay.style.pointerEvents = 'auto';

    overlay.innerHTML =
      '<div class="cal-comeback-bg"></div>' +
      '<div class="cal-comeback-content">' +
      '<div class="cal-comeback-icon">' + (special.icon || '\uD83D\uDDA4') + '</div>' +
      '<div class="cal-comeback-title">BLACKPINK</div>' +
      '<div class="cal-comeback-track">"GO"</div>' +
      '<div class="cal-comeback-date">February 27, 2026</div>' +
      '</div>';
    overlay.classList.add('cal-animation-overlay--visible');

    this._spawnConfetti(80, ['#f7a6b9', '#000', '#fcd5de', '#e8758a', '#fff']);

    setTimeout(function () {
      overlay.classList.remove('cal-animation-overlay--visible');
      overlay.style.pointerEvents = 'none';
      setTimeout(function () { overlay.innerHTML = ''; }, 600);
    }, 4000);
  },

  _spawnConfetti: function (count, colors) {
    var overlay = document.getElementById('calAnimationOverlay');
    if (!overlay) return;

    for (var i = 0; i < count; i++) {
      var confetti = document.createElement('div');
      confetti.className = 'cal-confetti';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = (Math.random() * 100) + '%';
      confetti.style.top = '-20px';
      confetti.style.setProperty('--cf-speed', (2 + Math.random() * 2) + 's');
      confetti.style.setProperty('--cf-delay', (Math.random() * 0.5) + 's');
      confetti.style.setProperty('--cf-x', '0px');
      confetti.style.setProperty('--cf-drift', (Math.random() * 100 - 50) + 'px');
      confetti.style.setProperty('--cf-rot', (Math.random() * 720 + 360) + 'deg');
      confetti.style.width = (4 + Math.random() * 6) + 'px';
      confetti.style.height = (6 + Math.random() * 8) + 'px';
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      overlay.appendChild(confetti);
      (function (el) {
        setTimeout(function () { if (el.parentNode) el.remove(); }, 4500);
      })(confetti);
    }
  },

  // ========== NAVIGATION ==========
  _prevMonth: function () {
    this._currentMonth--;
    if (this._currentMonth < 0) {
      this._currentMonth = 11;
      this._currentYear--;
    }
    this._hideSpecialPanel();
    this._loadMonthData();
  },

  _nextMonth: function () {
    this._currentMonth++;
    if (this._currentMonth > 11) {
      this._currentMonth = 0;
      this._currentYear++;
    }
    this._hideSpecialPanel();
    this._loadMonthData();
  },

  _hideSpecialPanel: function () {
    document.getElementById('specialPanel').style.display = 'none';
  },

  // ========== HELPERS ==========
  _todayKey: function () {
    return getSriLankaDateKey();
  },

  _showToast: function (msg) {
    var toast = document.getElementById('calToast');
    toast.textContent = msg;
    toast.classList.add('cal-toast--visible');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () {
      toast.classList.remove('cal-toast--visible');
    }, 3000);
  },

  _esc: function (str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
