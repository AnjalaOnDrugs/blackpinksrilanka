/**
 * Room Victory Screen
 * Epic celebration overlay for top 10 participants when a streaming party ends.
 * Triggered by admin via victory_screen event.
 */

window.ROOM = window.ROOM || {};

// Fallback for members home page where room-main.js is not loaded
ROOM.avatarInner =
  ROOM.avatarInner ||
  function (opts) {
    if (opts.profilePicture) {
      return {
        hasImage: true,
        html:
          '<img src="' +
          opts.profilePicture +
          '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">',
      };
    } else {
      var initial = (opts.username || "?").charAt(0).toUpperCase();
      return {
        hasImage: false,
        html: "<span>" + initial + "</span>",
      };
    }
  };

ROOM.Victory = {
  _overlay: null,
  _dismissTimer: null,
  _particleInterval: null,
  _personalOverlay: null,
  _personalTimer: null,
  _activeData: null,
  _didShowPersonal: false,

  init: function () {
    // No init-time DOM needed; overlay is created on demand
  },

  show: function (data) {
    console.log("[Victory.show] Called!", "isMembersPage:", this._isMembersPage(), "data:", !!data, "top10:", data && data.top10 ? data.top10.length : 0);
    // Victory animation is intentionally shown on members page only.
    if (!this._isMembersPage()) {
      console.log("[Victory.show] ABORTED - not on members page");
      return;
    }
    if (!data || !data.top10 || !data.top10.length) {
      console.log("[Victory.show] ABORTED - no data or empty top10");
      return;
    }
    console.log("[Victory.show] Proceeding to build overlay...");

    // Prevent duplicate overlays
    if (this._overlay) this.dismiss({ silent: true });
    this._hidePersonalView(true);

    this._activeData = data;
    this._didShowPersonal = false;

    var self = this;
    var top10 = data.top10;

    // Build overlay
    var overlay = document.createElement("div");
    overlay.className = "room-victory-overlay";

    // Sparkle canvas (background golden particles)
    var sparkleLayer = document.createElement("div");
    sparkleLayer.className = "room-victory-sparkle-layer";
    overlay.appendChild(sparkleLayer);

    // Content container
    var container = document.createElement("div");
    container.className = "room-victory-container";

    // Title
    var title = document.createElement("div");
    title.className = "room-victory-title";
    title.innerHTML =
      'STREAMING PARTY<br><span class="room-victory-title-accent">CHAMPIONS</span>';
    container.appendChild(title);

    // Podium section (top 3) rendered as 2nd, 1st, 3rd
    var podium = document.createElement("div");
    podium.className = "room-victory-podium";

    var podiumOrder = [1, 0, 2];
    for (var p = 0; p < podiumOrder.length; p++) {
      var idx = podiumOrder[p];
      if (idx >= top10.length) continue;
      podium.appendChild(this._buildPodiumCard(top10[idx]));
    }
    container.appendChild(podium);

    // Rest (4-10)
    if (top10.length > 3) {
      var rest = document.createElement("div");
      rest.className = "room-victory-rest";
      for (var r = 3; r < top10.length; r++) {
        rest.appendChild(this._buildRestCard(top10[r], r));
      }
      container.appendChild(rest);
    }

    // Dismiss button
    var dismissBtn = document.createElement("button");
    dismissBtn.className = "room-victory-dismiss";
    dismissBtn.textContent = "Close";
    dismissBtn.addEventListener("click", function () {
      self.dismiss();
    });
    container.appendChild(dismissBtn);

    overlay.appendChild(container);

    // Tap-to-dismiss on backdrop
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target === sparkleLayer) self.dismiss();
    });

    document.body.appendChild(overlay);
    this._overlay = overlay;

    // Animation timeline

    // Screen shake at 4.5s for impact (when 1st place hits)
    setTimeout(function () {
      if (self._overlay !== overlay) return;
      document.body.classList.add("room-screen-shake");
      setTimeout(function () {
        document.body.classList.remove("room-screen-shake");
      }, 600);
    }, 4500);

    // First confetti burst at 4.5s
    setTimeout(function () {
      if (self._overlay !== overlay) return;
      if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
        ROOM.Animations.spawnConfetti(100);
      }
    }, 4500);

    // Second confetti burst at 6.0s
    setTimeout(function () {
      if (self._overlay !== overlay) return;
      if (ROOM.Animations && ROOM.Animations.spawnConfetti) {
        ROOM.Animations.spawnConfetti(60);
      }
    }, 6000);

    // Continuous golden sparkles
    this._particleInterval = setInterval(function () {
      self._spawnSparkles(sparkleLayer, 6);
    }, 700);

    // Auto-dismiss after 30 seconds
    this._dismissTimer = setTimeout(function () {
      self.dismiss();
    }, 30000);
  },

  _buildPodiumCard: function (entry) {
    var rank = entry.rank;
    var tierClass =
      rank === 1
        ? "room-victory-card--gold"
        : rank === 2
          ? "room-victory-card--silver"
          : "room-victory-card--bronze";

    var card = document.createElement("div");
    card.className = "room-victory-card " + tierClass;
    card.style.setProperty("--victory-delay", this._getDelay(rank) + "s");

    // Crown for 1st place
    var crownHtml =
      rank === 1 ? '<div class="room-victory-crown">\uD83D\uDC51</div>' : "";

    // Rank badge
    var rankLabel = rank === 1 ? "1ST" : rank === 2 ? "2ND" : "3RD";

    // Avatar
    var avatarSize = rank === 1 ? 120 : 80;
    var pic = entry.profilePicture || null;
    if (!pic && ROOM.profilePicMap && entry.phoneNumber) {
      pic = ROOM.profilePicMap[entry.phoneNumber];
    }
    if (!pic && window.MembersRoom && window.MembersRoom._pfpCache && entry.phoneNumber) {
      pic = window.MembersRoom._pfpCache[entry.phoneNumber];
    }
    if (!pic && this._activeData && this._activeData.profilePicByPhone && entry.phoneNumber) {
      pic = this._activeData.profilePicByPhone[entry.phoneNumber];
    }
    var av = ROOM.avatarInner({
      profilePicture: pic,
      username: entry.username,
    });
    var avatarBg = av.hasImage
      ? "background:transparent;overflow:hidden;"
      : "background:" +
      (entry.avatarColor || "linear-gradient(135deg,#f7a6b9,#e8758a)") +
      ";";

    // Points
    var pts = this._formatPoints(entry.totalPoints);

    // Time streamed
    var hours = Math.floor((entry.totalMinutes || 0) / 60);
    var mins = (entry.totalMinutes || 0) % 60;
    var timeStr = hours > 0 ? hours + "h " + mins + "m" : mins + "m";

    // Light rays for 1st place
    var raysHtml = rank === 1 ? '<div class="room-victory-rays"></div>' : "";

    card.innerHTML =
      raysHtml +
      crownHtml +
      '<div class="room-victory-avatar" style="width:' +
      avatarSize +
      "px;height:" +
      avatarSize +
      "px;" +
      avatarBg +
      '">' +
      av.html +
      "</div>" +
      '<div class="room-victory-rank-badge">' +
      rankLabel +
      "</div>" +
      '<div class="room-victory-name">' +
      this._esc(entry.username) +
      "</div>" +
      '<div class="room-victory-points">' +
      pts +
      "</div>" +
      '<div class="room-victory-time">' +
      timeStr +
      " streamed</div>";

    return card;
  },

  _buildRestCard: function (entry, index) {
    var card = document.createElement("div");
    card.className = "room-victory-rest-card";
    card.style.setProperty("--victory-delay", 0.5 + (index - 3) * 0.1 + "s");

    var pic = entry.profilePicture || null;
    if (!pic && ROOM.profilePicMap && entry.phoneNumber) {
      pic = ROOM.profilePicMap[entry.phoneNumber];
    }
    if (!pic && window.MembersRoom && window.MembersRoom._pfpCache && entry.phoneNumber) {
      pic = window.MembersRoom._pfpCache[entry.phoneNumber];
    }
    if (!pic && this._activeData && this._activeData.profilePicByPhone && entry.phoneNumber) {
      pic = this._activeData.profilePicByPhone[entry.phoneNumber];
    }
    var av = ROOM.avatarInner({
      profilePicture: pic,
      username: entry.username,
    });
    var avatarBg = av.hasImage
      ? "background:transparent;overflow:hidden;"
      : "background:" +
      (entry.avatarColor || "linear-gradient(135deg,#f7a6b9,#e8758a)") +
      ";";

    card.innerHTML =
      '<div class="room-victory-rest-rank">#' +
      entry.rank +
      "</div>" +
      '<div class="room-victory-rest-avatar" style="' +
      avatarBg +
      '">' +
      av.html +
      "</div>" +
      '<div class="room-victory-rest-info">' +
      '<div class="room-victory-rest-name">' +
      this._esc(entry.username) +
      "</div>" +
      '<div class="room-victory-rest-pts">' +
      this._formatPoints(entry.totalPoints) +
      "</div>" +
      "</div>";

    return card;
  },

  _getDelay: function (rank) {
    if (rank === 1) return 4.5;
    if (rank === 2) return 2.5;
    if (rank === 3) return 1.5;
    return 0.5;
  },

  _spawnSparkles: function (container, count) {
    for (var i = 0; i < count; i++) {
      var sparkle = document.createElement("div");
      sparkle.className = "room-victory-sparkle";
      var symbols = ["\u2726", "\u2728", "\u2736", "\u2605"];
      sparkle.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      sparkle.style.left = Math.random() * 100 + "%";
      sparkle.style.top = Math.random() * 100 + "%";
      sparkle.style.setProperty("--sparkle-delay", Math.random() * 0.5 + "s");
      sparkle.style.setProperty(
        "--sparkle-size",
        10 + Math.random() * 16 + "px",
      );
      container.appendChild(sparkle);
      (function (el) {
        setTimeout(function () {
          if (el.parentNode) el.remove();
        }, 2000);
      })(sparkle);
    }
  },

  _formatPoints: function (pts) {
    if (!pts) return "0 pts";
    if (pts >= 10000) return (pts / 1000).toFixed(1) + "K pts";
    if (pts >= 1000) return pts.toLocaleString() + " pts";
    return pts + " pts";
  },

  _formatPointsShort: function (pts) {
    if (!pts) return "0";
    if (pts >= 100000) return (pts / 1000).toFixed(0) + "K";
    if (pts >= 10000) return (pts / 1000).toFixed(1) + "K";
    return pts.toLocaleString();
  },

  _isMembersPage: function () {
    return !!(
      document.body &&
      document.body.classList &&
      document.body.classList.contains("members-home")
    );
  },

  _getCurrentPhone: function () {
    if (ROOM.currentUser && ROOM.currentUser.phoneNumber) {
      return String(ROOM.currentUser.phoneNumber);
    }
    if (window.MembersRoom && window.MembersRoom._myPhone) {
      return String(window.MembersRoom._myPhone);
    }
    return null;
  },

  _findPlacement: function (data) {
    if (!data) return null;
    var myPhone = this._getCurrentPhone();
    if (!myPhone) return null;

    var rank = null;
    if (data.placementByPhone && data.placementByPhone[myPhone] != null) {
      rank = Number(data.placementByPhone[myPhone]);
    }

    var entry = null;
    if (data.top10 && data.top10.length) {
      for (var i = 0; i < data.top10.length; i++) {
        if (String(data.top10[i].phoneNumber || "") === myPhone) {
          entry = data.top10[i];
          if (!rank) rank = Number(entry.rank || i + 1);
          break;
        }
      }
    }

    if (!rank || rank <= 0) return null;

    return {
      rank: rank,
      totalParticipants: Number(
        data.totalParticipants || (data.top10 ? data.top10.length : 0) || 0,
      ),
      entry: entry,
    };
  },

  _formatOrdinal: function (n) {
    if (n % 100 >= 11 && n % 100 <= 13) return n + "th";
    var mod = n % 10;
    if (mod === 1) return n + "st";
    if (mod === 2) return n + "nd";
    if (mod === 3) return n + "rd";
    return n + "th";
  },

  _buildPlacementMessage: function (rank, totalParticipants) {
    if (rank === 1) return "You owned this round. Absolute champion.";
    if (rank === 2 || rank === 3) return "Podium finish. Massive performance.";
    if (rank <= 10) return "Top 10 finish. You carried strong energy.";

    var cutoff = Math.max(10, Math.ceil((totalParticipants || 0) * 0.25));
    if (rank <= cutoff) return "Great run. You finished in the top quarter.";
    return "Nice effort. Come back stronger next round.";
  },

  _showPersonalView: function () {
    if (!this._isMembersPage()) return;
    if (this._didShowPersonal) return;
    this._didShowPersonal = true;

    var data = this._activeData;
    var placement = this._findPlacement(data);
    var myPhone = this._getCurrentPhone();

    // Get per-user stream stats from the event data
    var myStats = null;
    if (data && data.perUserStats && myPhone) {
      myStats = data.perUserStats[myPhone] || null;
    }

    // Profile picture
    var myPfp = null;
    if (data && data.profilePicByPhone && myPhone) {
      myPfp = data.profilePicByPhone[myPhone];
    }
    if (!myPfp && ROOM.currentUser && ROOM.currentUser.profilePicture) {
      myPfp = ROOM.currentUser.profilePicture;
    }

    var title = "Thanks for joining!";
    var subtitle = "See you in the next streaming party.";
    var cardClass = "room-victory-personal--guest";
    var rank = 0;
    var total = 0;
    var pointsVal = 0;
    var totalMins = 0;
    var iconEmoji = "🎵";

    if (placement) {
      rank = placement.rank;
      total = placement.totalParticipants || 0;
      title = "You placed " + this._formatOrdinal(rank) + "!";
      subtitle = this._buildPlacementMessage(rank, total);

      if (placement.entry) {
        pointsVal = placement.entry.totalPoints || 0;
        totalMins = placement.entry.totalMinutes || 0;
      }

      if (rank === 1) {
        cardClass = "room-victory-personal--gold";
        iconEmoji = "👑";
      } else if (rank === 2) {
        cardClass = "room-victory-personal--silver";
        iconEmoji = "🥈";
      } else if (rank === 3) {
        cardClass = "room-victory-personal--bronze";
        iconEmoji = "🥉";
      } else if (rank <= 10) {
        cardClass = "room-victory-personal--top10";
        iconEmoji = "⭐";
      } else {
        cardClass = "room-victory-personal--participant";
        iconEmoji = "🎶";
      }
    }

    // Build the profile picture or avatar initial HTML
    var avatarHtml = "";
    var username = (ROOM.currentUser && ROOM.currentUser.username) || "BLINK";
    var avatarColor = (ROOM.currentUser && ROOM.currentUser.avatarColor) || "linear-gradient(135deg, #f7a6b9, #e8758a)";
    if (myPfp) {
      avatarHtml =
        '<div class="rvp-avatar-ring ' + (rank <= 3 ? 'rvp-avatar-ring--' + rank : '') + '">' +
        '<img src="' + this._esc(myPfp) + '" class="rvp-avatar-img" alt="" />' +
        '</div>';
    } else {
      avatarHtml =
        '<div class="rvp-avatar-ring ' + (rank <= 3 ? 'rvp-avatar-ring--' + rank : '') + '">' +
        '<div class="rvp-avatar-initial" style="background:' + avatarColor + '">' +
        this._esc(username.charAt(0).toUpperCase()) +
        '</div></div>';
    }

    // Format listening time from streamCounts listenDuration (seconds)
    var listenSecs = (myStats && myStats.totalListenSeconds) || 0;
    var listenH = Math.floor(listenSecs / 3600);
    var listenM = Math.floor((listenSecs % 3600) / 60);
    var listenStr = listenH > 0 ? listenH + "h " + listenM + "m" : listenM + "m";

    // Stream breakdown
    var goStreams = (myStats && myStats.goStreams) || 0;
    var otherStreams = (myStats && myStats.otherStreams) || 0;
    var totalStreams = (myStats && myStats.totalStreams) || 0;
    var goPercent = totalStreams > 0 ? Math.round((goStreams / totalStreams) * 100) : 0;

    // Build stat grid HTML
    var statsHtml =
      '<div class="rvp-stats-grid">' +
      '<div class="rvp-stat">' +
      '<div class="rvp-stat-value">' + this._formatPointsShort(pointsVal) + '</div>' +
      '<div class="rvp-stat-label">Total Points</div>' +
      '</div>' +
      '<div class="rvp-stat">' +
      '<div class="rvp-stat-value">' + totalStreams + '</div>' +
      '<div class="rvp-stat-label">Total Streams</div>' +
      '</div>' +
      '<div class="rvp-stat">' +
      '<div class="rvp-stat-value">' + listenStr + '</div>' +
      '<div class="rvp-stat-label">Listen Time</div>' +
      '</div>' +
      '<div class="rvp-stat">' +
      '<div class="rvp-stat-value">#' + (rank || '—') + '</div>' +
      '<div class="rvp-stat-label">of ' + total + ' BLINKs</div>' +
      '</div>' +
      '</div>';

    // Stream breakdown bar
    var breakdownHtml = '';
    if (totalStreams > 0) {
      breakdownHtml =
        '<div class="rvp-breakdown">' +
        '<div class="rvp-breakdown-title">Stream Breakdown</div>' +
        '<div class="rvp-breakdown-bar-wrap">' +
        '<div class="rvp-breakdown-bar-fill" style="width:' + goPercent + '%"></div>' +
        '</div>' +
        '<div class="rvp-breakdown-row">' +
        '<div class="rvp-breakdown-item">' +
        '<span class="rvp-dot rvp-dot--go"></span>' +
        '<span class="rvp-breakdown-label">GO Streams</span>' +
        '<span class="rvp-breakdown-val">' + goStreams + '</span>' +
        '</div>' +
        '<div class="rvp-breakdown-item">' +
        '<span class="rvp-dot rvp-dot--other"></span>' +
        '<span class="rvp-breakdown-label">Other</span>' +
        '<span class="rvp-breakdown-val">' + otherStreams + '</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    }

    var overlay = document.createElement("div");
    overlay.className = "room-victory-personal-overlay";

    var card = document.createElement("div");
    card.className = "room-victory-personal-card " + cardClass;
    card.innerHTML =
      // Floating particles inside card
      '<div class="rvp-particles"></div>' +
      // Icon
      '<div class="rvp-icon">' + iconEmoji + '</div>' +
      // Avatar
      avatarHtml +
      // Title
      '<div class="rvp-title">' + this._esc(title) + '</div>' +
      // Subtitle
      '<div class="rvp-subtitle">' + this._esc(subtitle) + '</div>' +
      // Stats grid
      statsHtml +
      // Stream breakdown
      breakdownHtml;

    var closeBtn = document.createElement("button");
    closeBtn.className = "rvp-close-btn";
    closeBtn.textContent = "Continue";
    var self = this;
    closeBtn.addEventListener("click", function () {
      self._hidePersonalView();
    });
    card.appendChild(closeBtn);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) self._hidePersonalView();
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._personalOverlay = overlay;

    // ——— CELEBRATION EFFECTS ———

    // 1. Confetti burst — colorful falling pieces
    this._spawnConfettiBurst(overlay, 80);

    // 2. Firework explosions — 3 bursts staggered
    var fwSelf = this;
    setTimeout(function () { fwSelf._spawnFirework(overlay); }, 300);
    setTimeout(function () { fwSelf._spawnFirework(overlay); }, 900);
    setTimeout(function () { fwSelf._spawnFirework(overlay); }, 1600);
    setTimeout(function () { fwSelf._spawnFirework(overlay); }, 2800);
    setTimeout(function () { fwSelf._spawnFirework(overlay); }, 4000);

    // 3. Continuous mini confetti every 2.5s
    this._personalConfettiInterval = setInterval(function () {
      if (!fwSelf._personalOverlay) return;
      fwSelf._spawnConfettiBurst(overlay, 25);
    }, 3000);

    this._personalTimer = setTimeout(function () {
      self._hidePersonalView();
    }, 20000);
  },

  // ——— CONFETTI SYSTEM ———
  _spawnConfettiBurst: function (container, count) {
    var colors = [
      '#f7a6b9', '#e8758a', '#ffc107', '#ff8f00', '#ffd54f',
      '#ff4081', '#7c4dff', '#00e5ff', '#69f0ae', '#ffab40',
      '#e040fb', '#ff6e40', '#c0c0c0', '#ffffff'
    ];
    var shapes = ['rvp-confetti--rect', 'rvp-confetti--circle', 'rvp-confetti--strip'];

    for (var i = 0; i < count; i++) {
      var piece = document.createElement('div');
      piece.className = 'rvp-confetti ' + shapes[Math.floor(Math.random() * shapes.length)];

      var color = colors[Math.floor(Math.random() * colors.length)];
      piece.style.backgroundColor = color;
      piece.style.left = (10 + Math.random() * 80) + '%';
      piece.style.setProperty('--confetti-x', (Math.random() * 200 - 100) + 'px');
      piece.style.setProperty('--confetti-r', (Math.random() * 1080 - 540) + 'deg');
      piece.style.setProperty('--confetti-dur', (1.5 + Math.random() * 2) + 's');
      piece.style.setProperty('--confetti-delay', (Math.random() * 0.5) + 's');
      piece.style.opacity = (0.8 + Math.random() * 0.2).toString();

      container.appendChild(piece);

      (function (el) {
        setTimeout(function () {
          if (el.parentNode) el.remove();
        }, 4500);
      })(piece);
    }
  },

  // ——— FIREWORK SYSTEM ———
  _spawnFirework: function (container) {
    if (!this._personalOverlay) return;

    var cx = 15 + Math.random() * 70; // % from left
    var cy = 10 + Math.random() * 60; // % from top
    var sparkCount = 20 + Math.floor(Math.random() * 16);
    var hue = Math.floor(Math.random() * 360);

    // Launch trail
    var trail = document.createElement('div');
    trail.className = 'rvp-fw-trail';
    trail.style.left = cx + '%';
    trail.style.bottom = '0';
    trail.style.setProperty('--fw-target-y', cy + 'vh');
    container.appendChild(trail);

    var self = this;
    setTimeout(function () {
      if (trail.parentNode) trail.remove();

      // Explosion sparks
      for (var i = 0; i < sparkCount; i++) {
        var spark = document.createElement('div');
        spark.className = 'rvp-fw-spark';

        var angle = (i / sparkCount) * 360 + (Math.random() * 20 - 10);
        var dist = 40 + Math.random() * 80;
        var dx = Math.cos(angle * Math.PI / 180) * dist;
        var dy = Math.sin(angle * Math.PI / 180) * dist;

        var sparkHue = hue + Math.floor(Math.random() * 40 - 20);
        var sat = 80 + Math.random() * 20;
        var light = 55 + Math.random() * 25;

        spark.style.left = cx + '%';
        spark.style.top = cy + '%';
        spark.style.setProperty('--fw-dx', dx + 'px');
        spark.style.setProperty('--fw-dy', dy + 'px');
        spark.style.setProperty('--fw-dur', (0.6 + Math.random() * 0.6) + 's');
        spark.style.backgroundColor = 'hsl(' + sparkHue + ',' + sat + '%,' + light + '%)';
        spark.style.boxShadow = '0 0 6px hsl(' + sparkHue + ',' + sat + '%,' + light + '%)';

        container.appendChild(spark);

        (function (el) {
          setTimeout(function () {
            if (el.parentNode) el.remove();
          }, 1500);
        })(spark);
      }

      // Flash ring
      var ring = document.createElement('div');
      ring.className = 'rvp-fw-ring';
      ring.style.left = cx + '%';
      ring.style.top = cy + '%';
      ring.style.borderColor = 'hsl(' + hue + ',80%,70%)';
      container.appendChild(ring);
      setTimeout(function () { if (ring.parentNode) ring.remove(); }, 600);
    }, 400);
  },

  _esc: function (text) {
    var div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  },

  _hidePersonalView: function (immediate) {
    if (this._personalTimer) {
      clearTimeout(this._personalTimer);
      this._personalTimer = null;
    }
    if (this._personalConfettiInterval) {
      clearInterval(this._personalConfettiInterval);
      this._personalConfettiInterval = null;
    }

    if (!this._personalOverlay) return;
    var overlay = this._personalOverlay;
    this._personalOverlay = null;

    if (immediate) {
      if (overlay.parentNode) overlay.remove();
      return;
    }

    overlay.classList.add("room-victory-personal-overlay--exit");
    setTimeout(function () {
      if (overlay.parentNode) overlay.remove();
    }, 350);
  },

  dismiss: function (options) {
    options = options || {};

    if (this._dismissTimer) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }
    if (this._particleInterval) {
      clearInterval(this._particleInterval);
      this._particleInterval = null;
    }
    if (!this._overlay) return;

    var overlay = this._overlay;
    this._overlay = null;
    overlay.classList.add("room-victory-overlay--exit");
    setTimeout(function () {
      if (overlay.parentNode) overlay.remove();
    }, 500);

    if (!options.silent) {
      this._showPersonalView();
    }
  },

  destroy: function () {
    this.dismiss({ silent: true });
    this._hidePersonalView(true);
    this._activeData = null;
    this._didShowPersonal = false;
  },
};

// If members-home subscribed before this script loaded, play queued payload now.
console.log("[Victory.init] room-victory.js loaded. __pendingVictoryPayload:", !!window.__pendingVictoryPayload, "ROOM.Victory.show:", !!(ROOM.Victory && ROOM.Victory.show));
if (window.__pendingVictoryPayload && ROOM.Victory && ROOM.Victory.show) {
  (function (payload) {
    window.__pendingVictoryPayload = null;
    console.log("[Victory.init] Playing queued victory payload");
    setTimeout(function () {
      ROOM.Victory.show(payload);
    }, 0);
  })(window.__pendingVictoryPayload);
}
