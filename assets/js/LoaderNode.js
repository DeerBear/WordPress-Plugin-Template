/**
 * LoaderNode - Abstract base class for library loaders
 * Each library (UIKit, Bootstrap, etc.) gets its own node implementation
 */

/**
 * Abstract LoaderNode constructor
 * @param {string} name - Name of the library
 * @param {Array<string>} sbomComponents - List of components from SBOM
 * @param {Object} viewModel - MVVM ViewModel instance for state updates
 */
function LoaderNode(name, sbomComponents, viewModel) {
    this.name = name;
    this.available = sbomComponents || [];
    this.loaded = [];
    this.pending = [];
    this.failed = [];
    this.viewModel = viewModel;

    // Initialize view model if provided
    if (this.viewModel) {
        this.viewModel.available.setValue(this.available.slice());
        this.viewModel.loaded.setValue([]);
        this.viewModel.pending.setValue([]);
        this.viewModel.failed.setValue([]);
    }
}

/**
 * Abstract load method - must be overridden by subclasses
 * @param {string} componentName - Name of component to load
 * @param {Object} options - Component-specific options
 * @returns {Promise} Resolves when component is loaded
 */
LoaderNode.prototype.load = function(componentName, options) {
    throw new Error('LoaderNode.load() must be implemented by subclass');
};

/**
 * Check if component is available in SBOM
 * @param {string} componentName - Component to check
 * @returns {boolean}
 */
LoaderNode.prototype.isAvailable = function(componentName) {
    return this.available.indexOf(componentName) !== -1;
};

/**
 * Check if component is already loaded
 * @param {string} componentName - Component to check
 * @returns {boolean}
 */
LoaderNode.prototype.isLoaded = function(componentName) {
    return this.loaded.indexOf(componentName) !== -1;
};

/**
 * Mark component as pending
 * @param {string} componentName
 */
LoaderNode.prototype.markPending = function(componentName) {
    if (this.pending.indexOf(componentName) === -1) {
        this.pending.push(componentName);
        if (this.viewModel) {
            this.viewModel.pending.setValue(this.pending.slice());
        }
    }
};

/**
 * Mark component as loaded successfully
 * @param {string} componentName
 */
LoaderNode.prototype.markLoaded = function(componentName) {
    // Remove from pending
    var pendingIndex = this.pending.indexOf(componentName);
    if (pendingIndex > -1) {
        this.pending.splice(pendingIndex, 1);
    }

    // Add to loaded
    if (this.loaded.indexOf(componentName) === -1) {
        this.loaded.push(componentName);
    }

    // Update view model
    if (this.viewModel) {
        this.viewModel.pending.setValue(this.pending.slice());
        this.viewModel.loaded.setValue(this.loaded.slice());
    }
};

/**
 * Mark component as failed
 * @param {string} componentName
 * @param {Error} error
 */
LoaderNode.prototype.markFailed = function(componentName, error) {
    // Remove from pending
    var pendingIndex = this.pending.indexOf(componentName);
    if (pendingIndex > -1) {
        this.pending.splice(pendingIndex, 1);
    }

    // Add to failed
    var failedEntry = {
        component: componentName,
        error: error.message || String(error),
        timestamp: new Date().toISOString()
    };

    this.failed.push(failedEntry);

    // Update view model
    if (this.viewModel) {
        this.viewModel.pending.setValue(this.pending.slice());
        this.viewModel.failed.setValue(this.failed.slice());
    }
};

export { LoaderNode };
