/**
 * LoaderTree - Root coordinator for managing multiple library loaders
 * Provides a unified interface for loading components from different libraries
 */

/**
 * LoaderTree constructor
 * @param {Object} viewModel - Optional MVVM ViewModel for aggregate state
 */
function LoaderTree(viewModel) {
    this.nodes = {};
    this.viewModel = viewModel;

    // Initialize aggregate view model if provided
    if (this.viewModel) {
        this.viewModel.libraries.setValue([]);
        this.viewModel.totalAvailable.setValue(0);
        this.viewModel.totalLoaded.setValue(0);
        this.viewModel.totalPending.setValue(0);
        this.viewModel.totalFailed.setValue(0);
    }
}

/**
 * Register a LoaderNode with the tree
 * @param {LoaderNode} node - LoaderNode instance to register
 */
LoaderTree.prototype.registerNode = function(node) {
    if (!node || !node.name) {
        throw new Error('Invalid node: must have a name property');
    }

    this.nodes[node.name] = node;
    this.updateAggregateState();
};

/**
 * Get a registered node by library name
 * @param {string} libraryName - Name of library
 * @returns {LoaderNode|null}
 */
LoaderTree.prototype.getNode = function(libraryName) {
    return this.nodes[libraryName] || null;
};

/**
 * Load a component from a specific library
 * @param {string} libraryName - Name of library (e.g., 'UIKit')
 * @param {string} componentName - Name of component to load
 * @param {*} args - Additional arguments passed to node's load method
 * @returns {Promise}
 */
LoaderTree.prototype.load = function(libraryName, componentName) {
    var node = this.getNode(libraryName);

    if (!node) {
        return Promise.reject(new Error('Library "' + libraryName + '" not registered'));
    }

    // Pass remaining arguments to the node's load method
    var args = Array.prototype.slice.call(arguments, 2);
    var self = this;

    return node.load.apply(node, [componentName].concat(args))
        .then(function(result) {
            self.updateAggregateState();
            return result;
        })
        .catch(function(error) {
            self.updateAggregateState();
            throw error;
        });
};

/**
 * Convenience method for loading UIKit components
 * @param {string} componentName - Component name
 * @param {HTMLElement} element - Optional element
 * @param {Object} options - Optional options
 * @returns {Promise}
 */
LoaderTree.prototype.loadUIKit = function(componentName, element, options) {
    return this.load('UIKit', componentName, element, options);
};

/**
 * Get all legitimate script sources (for security monitoring)
 * @returns {Array<string>} List of legitimate script URLs
 */
LoaderTree.prototype.getLegitimateScripts = function() {
    var scripts = [];

    for (var libraryName in this.nodes) {
        var node = this.nodes[libraryName];

        // Add library-specific paths
        if (node.basePath) {
            // Core file
            scripts.push(node.basePath + '/uikit-core.js');

            // All available components
            node.available.forEach(function(componentName) {
                scripts.push(node.basePath + '/components/' + componentName + '.js');
            });
        }
    }

    return scripts;
};

/**
 * Check if a script URL is legitimate according to registered nodes
 * @param {string} scriptUrl - URL to check
 * @returns {boolean}
 */
LoaderTree.prototype.isLegitimateScript = function(scriptUrl) {
    var legitimate = this.getLegitimateScripts();

    // Check exact match
    if (legitimate.indexOf(scriptUrl) !== -1) {
        return true;
    }

    // Check if URL ends with any legitimate path
    for (var i = 0; i < legitimate.length; i++) {
        if (scriptUrl.endsWith(legitimate[i])) {
            return true;
        }
    }

    return false;
};

/**
 * Get aggregate statistics across all nodes
 * @returns {Object} Statistics object
 */
LoaderTree.prototype.getStatistics = function() {
    var stats = {
        libraries: [],
        totalAvailable: 0,
        totalLoaded: 0,
        totalPending: 0,
        totalFailed: 0
    };

    for (var libraryName in this.nodes) {
        var node = this.nodes[libraryName];

        stats.libraries.push({
            name: node.name,
            available: node.available.length,
            loaded: node.loaded.length,
            pending: node.pending.length,
            failed: node.failed.length
        });

        stats.totalAvailable += node.available.length;
        stats.totalLoaded += node.loaded.length;
        stats.totalPending += node.pending.length;
        stats.totalFailed += node.failed.length;
    }

    return stats;
};

/**
 * Update aggregate state in view model
 */
LoaderTree.prototype.updateAggregateState = function() {
    if (!this.viewModel) {
        return;
    }

    var stats = this.getStatistics();

    this.viewModel.libraries.setValue(stats.libraries);
    this.viewModel.totalAvailable.setValue(stats.totalAvailable);
    this.viewModel.totalLoaded.setValue(stats.totalLoaded);
    this.viewModel.totalPending.setValue(stats.totalPending);
    this.viewModel.totalFailed.setValue(stats.totalFailed);
};

/**
 * Get all loaded components across all libraries
 * @returns {Array<Object>} Array of {library, component} objects
 */
LoaderTree.prototype.getAllLoaded = function() {
    var loaded = [];

    for (var libraryName in this.nodes) {
        var node = this.nodes[libraryName];

        node.loaded.forEach(function(componentName) {
            loaded.push({
                library: libraryName,
                component: componentName
            });
        });
    }

    return loaded;
};

/**
 * Get all failed components across all libraries
 * @returns {Array<Object>} Array of failure objects
 */
LoaderTree.prototype.getAllFailed = function() {
    var failed = [];

    for (var libraryName in this.nodes) {
        var node = this.nodes[libraryName];

        node.failed.forEach(function(failureInfo) {
            failed.push({
                library: libraryName,
                component: failureInfo.component,
                error: failureInfo.error,
                timestamp: failureInfo.timestamp
            });
        });
    }

    return failed;
};

export { LoaderTree };
