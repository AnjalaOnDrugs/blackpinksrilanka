/**
 * Convex Client Bridge for Vanilla JS
 * Uses the Convex browser bundle loaded via <script> tag from unpkg CDN.
 * All function references use string format: "module:functionName"
 */

window.ConvexService = {
  client: null,
  _watchers: {},
  _watcherIdCounter: 0,

  /**
   * Initialize Convex client
   * @param {string} deploymentUrl - Convex deployment URL (from .env.local)
   */
  init: function (deploymentUrl) {
    if (this.client) return;
    this.client = new convex.ConvexClient(deploymentUrl);
    console.log('[Convex] Client initialized:', deploymentUrl);
  },

  /**
   * Call a mutation (write operation)
   * @param {string} name - "module:function" e.g. "participants:joinRoom"
   * @param {Object} args - Arguments object
   * @returns {Promise<any>}
   */
  mutation: function (name, args) {
    if (!this.client) throw new Error('ConvexService not initialized');
    return this.client.mutation(name, args || {});
  },

  /**
   * Call a query (one-time read)
   * @param {string} name - "module:function" e.g. "participants:listByRoom"
   * @param {Object} args - Arguments object
   * @returns {Promise<any>}
   */
  query: function (name, args) {
    if (!this.client) throw new Error('ConvexService not initialized');
    return this.client.query(name, args || {});
  },

  /**
   * Subscribe to a reactive query (real-time updates)
   * @param {string} name - "module:function" e.g. "participants:listByRoom"
   * @param {Object} args - Arguments object
   * @param {Function} callback - Called with new data on every update
   * @returns {Function} Unsubscribe function
   */
  watch: function (name, args, callback) {
    if (!this.client) throw new Error('ConvexService not initialized');

    var unsubscribe = this.client.onUpdate(name, args || {}, callback);

    var id = ++this._watcherIdCounter;
    this._watchers[id] = unsubscribe;

    var self = this;
    return function () {
      if (self._watchers[id]) {
        self._watchers[id]();
        delete self._watchers[id];
      }
    };
  },

  /**
   * Destroy all watchers and close connection
   */
  destroy: function () {
    for (var id in this._watchers) {
      if (typeof this._watchers[id] === 'function') {
        this._watchers[id]();
      }
    }
    this._watchers = {};

    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
};
