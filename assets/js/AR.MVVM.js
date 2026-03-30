/**
 * Pure JavaScript MVVM Framework
 * No dependencies, no NPM, no Node.js
 * Copyright - Public Domain
 */
(function(window) {
    'use strict';

    /**
     * Sanitize HTML string to prevent XSS.
     * Strips script tags, event handler attributes, and javascript: URLs.
     */
    function sanitizeHTML(html) {
        if (typeof html !== 'string') return '';
        var temp = document.createElement('div');
        temp.innerHTML = html;
        // Remove script elements
        var scripts = temp.querySelectorAll('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            scripts[i].parentNode.removeChild(scripts[i]);
        }
        // Remove event handler attributes and javascript: URLs from all elements
        var allElements = temp.querySelectorAll('*');
        for (var j = 0; j < allElements.length; j++) {
            var el = allElements[j];
            var attrs = el.attributes;
            for (var k = attrs.length - 1; k >= 0; k--) {
                var attrName = attrs[k].name.toLowerCase();
                var attrValue = attrs[k].value.toLowerCase().trim();
                if (attrName.startsWith('on') || attrValue.startsWith('javascript:')) {
                    el.removeAttribute(attrs[k].name);
                }
            }
        }
        return temp.innerHTML;
    }

    function Observable(initialValue) {
        var value = initialValue;
        var subscribers = [];
        
        function notify() {
            subscribers.forEach(function(callback) {
                callback(value);
            });
        }
        
        return {
            getValue: function() { return value; },
            setValue: function(newValue) {
                if (value !== newValue) {
                    value = newValue;
                    notify();
                }
            },
            subscribe: function(callback) {
                subscribers.push(callback);
                callback(value); // Initial notification
                return function unsubscribe() {
                    var index = subscribers.indexOf(callback);
                    if (index > -1) subscribers.splice(index, 1);
                };
            }
        };
    }
    
    function ObservableArray(initialArray) {
        var obs = Observable(initialArray || []);
        
        return {
            getValue: obs.getValue,
            setValue: obs.setValue,
            subscribe: obs.subscribe,
            push: function(item) {
                var arr = obs.getValue();
                arr.push(item);
                obs.setValue(arr.slice()); // Trigger update
            },
            remove: function(item) {
                var arr = obs.getValue();
                var index = arr.indexOf(item);
                if (index > -1) {
                    arr.splice(index, 1);
                    obs.setValue(arr.slice());
                }
            },
            clear: function() {
                obs.setValue([]);
            },
            length: function() {
                return obs.getValue().length;
            }
        };
    }
    
    function Computed(computeFn, dependencies) {
        var obs = Observable(computeFn());
        
        dependencies.forEach(function(dep) {
            dep.subscribe(function() {
                obs.setValue(computeFn());
            });
        });
        
        return {
            getValue: obs.getValue,
            subscribe: obs.subscribe
        };
    }
    
    function ViewModel(data) {
        var self = this;
        
        Object.keys(data).forEach(function(key) {
            if (Array.isArray(data[key])) {
                self[key] = ObservableArray(data[key]);
            } else if (typeof data[key] === 'function') {
                self[key] = data[key];
            } else if (data[key] && data[key]._isComputed) {
                self[key] = Computed(data[key].compute, data[key].dependencies);
            } else {
                self[key] = Observable(data[key]);
            }
        });
    }
    
    function applyBindings(viewModel, rootElement) {
        // Handle value bindings (two-way)
        rootElement.querySelectorAll('[data-bind*="value:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.value;

            // Try nested path first
            var nested = resolveNestedPath(viewModel, prop);
            if (nested) {
                // Nested path (e.g., selectedTenant.name)
                var updateElement = function() {
                    var value = nested.getValue();
                    element.value = value || '';
                };

                // Set initial value
                updateElement();

                // Subscribe to parent observable
                nested.observable.subscribe(updateElement);

                // Handle user input
                element.addEventListener('input', function() {
                    nested.setValue(element.value);
                });
            } else if (viewModel[prop]) {
                // Simple path
                // Set initial value
                element.value = viewModel[prop].getValue() || '';

                // Subscribe to changes
                viewModel[prop].subscribe(function(newValue) {
                    if (element.value !== newValue) {
                        element.value = newValue || '';
                    }
                });

                // Handle user input
                element.addEventListener('input', function() {
                    viewModel[prop].setValue(element.value);
                });
            }
        });
        
        // Handle checked bindings (checkboxes)
        rootElement.querySelectorAll('[data-bind*="checked:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.checked;
            
            if (viewModel[prop]) {
                element.checked = viewModel[prop].getValue();
                
                viewModel[prop].subscribe(function(newValue) {
                    element.checked = newValue;
                });
                
                element.addEventListener('change', function() {
                    viewModel[prop].setValue(element.checked);
                });
            }
        });
        
        // Handle click bindings
        rootElement.querySelectorAll('[data-bind*="click:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var method = binding.click;
            
            if (typeof viewModel[method] === 'function') {
                element.addEventListener('click', function(e) {
                    viewModel[method].call(viewModel, e);
                });
            }
        });
        
        // Handle submit bindings
        rootElement.querySelectorAll('[data-bind*="submit:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var method = binding.submit;
            
            if (typeof viewModel[method] === 'function') {
                element.addEventListener('submit', function(e) {
                    e.preventDefault();
                    viewModel[method].call(viewModel, e);
                });
            }
        });
        
        // Handle text bindings
        rootElement.querySelectorAll('[data-bind*="text:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.text;

            // Try nested path first
            var nested = resolveNestedPath(viewModel, prop);
            if (nested) {
                // Nested path
                nested.observable.subscribe(function() {
                    element.textContent = nested.getValue() || '';
                });
            } else if (viewModel[prop]) {
                // Simple path
                viewModel[prop].subscribe(function(newValue) {
                    element.textContent = newValue || '';
                });
            }
        });
        
        // Handle html bindings (sanitized to prevent XSS)
        rootElement.querySelectorAll('[data-bind*="html:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.html;

            if (viewModel[prop]) {
                viewModel[prop].subscribe(function(newValue) {
                    element.innerHTML = sanitizeHTML(newValue || '');
                });
            }
        });
        
        // Handle visible bindings
        rootElement.querySelectorAll('[data-bind*="visible:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.visible;

            // Handle negation
            var isNegated = prop.startsWith('!');
            var cleanProp = isNegated ? prop.substring(1) : prop;

            // Try nested path first
            var nested = resolveNestedPath(viewModel, cleanProp);
            if (nested) {
                // Nested path
                nested.observable.subscribe(function() {
                    var value = nested.getValue();
                    var show = isNegated ? !value : value;
                    element.style.display = show ? '' : 'none';
                });
            } else if (viewModel[cleanProp]) {
                // Simple path
                viewModel[cleanProp].subscribe(function(newValue) {
                    var show = isNegated ? !newValue : newValue;
                    element.style.display = show ? '' : 'none';
                });
            }
        });
        
        // Handle enable bindings
        rootElement.querySelectorAll('[data-bind*="enable:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.enable;
            
            if (viewModel[prop]) {
                viewModel[prop].subscribe(function(newValue) {
                    element.disabled = !newValue;
                });
            }
        });
        
        // Handle css bindings
        rootElement.querySelectorAll('[data-bind*="css:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.css;
            
            if (viewModel[prop]) {
                viewModel[prop].subscribe(function(cssClass) {
                    // Remove all previous classes that might have been added
                    element.className = element.className.split(' ').filter(function(c) {
                        return !c.startsWith('mvvm-');
                    }).join(' ');
                    
                    if (cssClass) {
                        element.classList.add(cssClass);
                    }
                });
            }
        });
        
        // Handle foreach bindings
        rootElement.querySelectorAll('[data-bind*="foreach:"]').forEach(function(element) {
            var binding = parseBinding(element.getAttribute('data-bind'));
            var prop = binding.foreach;
            var template = element.innerHTML;
            
            if (viewModel[prop]) {
                viewModel[prop].subscribe(function(items) {
                    element.innerHTML = '';
                    
                    items.forEach(function(item) {
                        var itemElement = document.createElement('div');
                        itemElement.innerHTML = template;
                        
                        // Bind item properties
                        itemElement.querySelectorAll('[data-bind]').forEach(function(child) {
                            var childBinding = parseBinding(child.getAttribute('data-bind'));
                            
                            if (childBinding.text && item[childBinding.text] !== undefined) {
                                child.textContent = item[childBinding.text];
                            }
                            
                            if (childBinding.html && item[childBinding.html] !== undefined) {
                                child.innerHTML = sanitizeHTML(item[childBinding.html]);
                            }
                            
                            if (childBinding.click) {
                                child.addEventListener('click', function() {
                                    if (typeof viewModel[childBinding.click] === 'function') {
                                        viewModel[childBinding.click].call(viewModel, item);
                                    }
                                });
                            }
                        });
                        
                        // Extract actual content (skip wrapper div)
                        while (itemElement.firstChild) {
                            element.appendChild(itemElement.firstChild);
                        }
                    });
                });
            }
        });
    }
    
    function parseBinding(bindingString) {
        var result = {};
        bindingString.split(',').forEach(function(pair) {
            var parts = pair.trim().split(':');
            if (parts.length === 2) {
                result[parts[0].trim()] = parts[1].trim();
            }
        });
        return result;
    }

    /**
     * Resolve a nested property path (e.g., "selectedTenant.name")
     * Supports one level of nesting: observable.property
     * Returns: { observable, property, getValue, setValue }
     */
    function resolveNestedPath(viewModel, path) {
        // Check if path contains a dot
        var dotIndex = path.indexOf('.');
        if (dotIndex === -1) {
            // Simple path - no nesting
            return null;
        }

        // Split into parent and child
        var parentPath = path.substring(0, dotIndex);
        var childPath = path.substring(dotIndex + 1);

        var parent = viewModel[parentPath];
        if (!parent || !parent.getValue) {
            return null;
        }

        return {
            observable: parent,
            property: childPath,
            getValue: function() {
                var obj = parent.getValue();
                return obj ? obj[childPath] : null;
            },
            setValue: function(value) {
                var obj = parent.getValue();
                if (obj) {
                    obj[childPath] = value;
                    // Trigger update by setting the parent observable
                    parent.setValue(obj);
                }
            }
        };
    }
    
    // Helper to create computed observables
    function computed(computeFn, dependencies) {
        return {
            _isComputed: true,
            compute: computeFn,
            dependencies: dependencies
        };
    }
    
    // Export to global scope
    window.MVVM = {
        Observable: Observable,
        ObservableArray: ObservableArray,
        Computed: Computed,
        ViewModel: ViewModel,
        applyBindings: applyBindings,
        computed: computed
    };
    
})(window);