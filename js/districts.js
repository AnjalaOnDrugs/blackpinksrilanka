/**
 * Sri Lanka Districts Module
 * District list, centroid coordinates for reverse geocoding, and helpers.
 */

var SL_DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo",
  "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara",
  "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar",
  "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya",
  "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya"
];

// Approximate centroid [lat, lng] for each district
var SL_DISTRICT_CENTROIDS = {
  "Ampara":        [7.2964, 81.6745],
  "Anuradhapura":  [8.3114, 80.4037],
  "Badulla":       [6.9934, 81.0550],
  "Batticaloa":    [7.7310, 81.6747],
  "Colombo":       [6.9271, 79.8612],
  "Galle":         [6.0535, 80.2210],
  "Gampaha":       [7.0840, 80.0098],
  "Hambantota":    [6.1243, 81.1185],
  "Jaffna":        [9.6615, 80.0255],
  "Kalutara":      [6.5854, 80.1140],
  "Kandy":         [7.2906, 80.6337],
  "Kegalle":       [7.2513, 80.3464],
  "Kilinochchi":   [9.3803, 80.3770],
  "Kurunegala":    [7.4863, 80.3623],
  "Mannar":        [8.9810, 79.9044],
  "Matale":        [7.4675, 80.6234],
  "Matara":        [5.9549, 80.5550],
  "Monaragala":    [6.8728, 81.3507],
  "Mullaitivu":    [9.2671, 80.8142],
  "Nuwara Eliya":  [6.9497, 80.7891],
  "Polonnaruwa":   [7.9403, 81.0188],
  "Puttalam":      [8.0362, 79.8283],
  "Ratnapura":     [6.6828, 80.4028],
  "Trincomalee":   [8.5874, 81.2152],
  "Vavuniya":      [8.7514, 80.4971]
};

/**
 * Find the closest district to given GPS coordinates.
 * Uses squared Euclidean distance on lat/lng (adequate for a small island).
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string|null} District name or null if coordinates are too far from Sri Lanka
 */
function findDistrictByCoords(lat, lng) {
  // Quick bounds check — if clearly outside Sri Lanka, bail
  if (lat < 5.5 || lat > 10.0 || lng < 79.0 || lng > 82.5) {
    return null;
  }

  var closest = null;
  var minDist = Infinity;

  for (var name in SL_DISTRICT_CENTROIDS) {
    var c = SL_DISTRICT_CENTROIDS[name];
    var d = Math.pow(lat - c[0], 2) + Math.pow(lng - c[1], 2);
    if (d < minDist) {
      minDist = d;
      closest = name;
    }
  }

  return closest;
}

/**
 * Populate a <select> element with district options.
 *
 * @param {string} selectId - The ID of the <select> element
 */
function populateDistrictDropdown(selectId) {
  var sel = document.getElementById(selectId);
  if (!sel) return;

  SL_DISTRICTS.forEach(function (d) {
    var opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    sel.appendChild(opt);
  });
}
