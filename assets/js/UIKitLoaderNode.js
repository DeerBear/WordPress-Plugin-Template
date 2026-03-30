/**
 * UIKitLoaderNode - Concrete implementation for UIKit library
 */

import { LoaderNode } from './LoaderNode.js';

// Static imports - always loaded regardless of components used
import UIkit from '/static/uikit/js/uikit-core.js';
import Icons from '/static/uikit/js/uikit-icons.js';

// Register icons with core
UIkit.use(Icons);

/**
 * UIKitLoaderNode constructor
 * @param {Array<string>} sbomComponents - UIKit components from SBOM
 * @param {Object} viewModel - MVVM ViewModel for state
 * @param {string} basePath - Base path to UIKit component files (default: '/static/uikit/js/components')
 */
function UIKitLoaderNode(sbomComponents, viewModel, basePath) {
    LoaderNode.call(this, 'UIKit', sbomComponents, viewModel);

    this.basePath = basePath || '/static/uikit/js/components';
    this.UIkit = UIkit;
}

// Inherit from LoaderNode
UIKitLoaderNode.prototype = Object.create(LoaderNode.prototype);
UIKitLoaderNode.prototype.constructor = UIKitLoaderNode;

/**
 * Load a UIKit component
 * @param {string} componentName - Name of component (e.g., 'accordion', 'modal')
 * @param {HTMLElement} element - Optional element to initialize component on
 * @param {Object} options - Optional component options
 * @returns {Promise} Resolves with component instance or UIkit method
 */
UIKitLoaderNode.prototype.load = function(componentName, element, options) {
    var self = this;
    var UIkit = this.UIkit;

    // Check if component is in SBOM
    if (!this.isAvailable(componentName)) {
        var sbomError = new Error('Component "' + componentName + '" not found in SBOM');
        this.markFailed(componentName, sbomError);
        return Promise.reject(sbomError);
    }

    // Check if already loaded
    if (this.isLoaded(componentName)) {
        // Return immediately - no async needed
        if (element) {
            return Promise.resolve(UIkit[componentName](element, options));
        }
        return Promise.resolve(UIkit[componentName]);
    }

    // Mark as pending
    this.markPending(componentName);

    // Dynamically import only the component
    var componentPath = this.basePath + '/' + componentName + '.js';
    
    return import(componentPath)
        .then(function(module) {
            // Register component with UIkit
            var Component = module.default;
            UIkit.use(Component);

            // Mark as loaded
            self.markLoaded(componentName);

            // Return component instance or method
            if (element) {
                return UIkit[componentName](element, options);
            }
            return UIkit[componentName];
        })
        .catch(function(error) {
            self.markFailed(componentName, error);
            throw error;
        });
};

/**
 * Get UIKit global object (only available after core is loaded)
 * @returns {Object|null}
 */
UIKitLoaderNode.prototype.getUIkit = function() {
    return this.UIkit;
};

export { UIKitLoaderNode };
