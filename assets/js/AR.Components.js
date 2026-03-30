/**
 * AR.Components.js
 * Pure JavaScript UI Components
 * * * FIX APPLIED: "Borrow and Return" logic for AR.Modal to allow re-opening * * *
 */
(function(window) {
    'use strict';
    
    var AR = window.AR || {};
    
    // ============================================================================
    // UTILITIES
    // ============================================================================
    
    function addClass(element, className) {
        if (element.classList) {
            element.classList.add(className);
        } else {
            element.className += ' ' + className;
        }
    }
    
    function removeClass(element, className) {
        if (element.classList) {
            element.classList.remove(className);
        } else {
            element.className = element.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
        }
    }
    
    function hasClass(element, className) {
        if (element.classList) {
            return element.classList.contains(className);
        } else {
            return new RegExp('(^| )' + className + '( |$)', 'gi').test(element.className);
        }
    }
    
    function getElement(selector) {
        if (typeof selector === 'string') {
            return document.querySelector(selector);
        }
        return selector;
    }
    
    var uniqueIdCounter = 0;
    function generateId(prefix) {
        uniqueIdCounter++;
        return prefix + '-' + uniqueIdCounter;
    }
    
    // ============================================================================
    // ACCORDION
    // ============================================================================
    
    /**
     * AR.Accordion - Collapsible sections with optional icons
     */
    AR.Accordion = function(selector, options) {
        this.element = getElement(selector);
        if (!this.element) {
            throw new Error('Accordion element not found: ' + selector);
        }
        
        this.options = {
            fixedOpenIndexes: options && options.fixedOpenIndexes || [],
            multiOpen: options && options.multiOpen !== undefined ? options.multiOpen : true,
            icons: options && options.icons || null
        };
        
        // Items are determined in init() to support list/classless structures
        this.items = [];
        this.init();
    };
    
    AR.Accordion.prototype.init = function() {
        var self = this;
        
        addClass(this.element, 'ar-accordion');
        
        // Determine item selector based on element type
        var tagName = this.element.tagName.toUpperCase();
        var itemSelector = (tagName === 'UL' || tagName === 'OL') ? 'li' : '.accordion-item';
        this.items = this.element.querySelectorAll(itemSelector);
        
        for (var i = 0; i < this.items.length; i++) {
            var item = this.items[i];
            
            // Try to find header and content using required classes first
            var header = item.querySelector('.accordion-header');
            var content = item.querySelector('.accordion-content');
            
            var isClasslessStructure = false;
            
            // Fallback: If classes not found and item has at least two children,
            // assume first child is header and second is content (semantic structure)
            if (!header && !content && item.children.length >= 2) {
                header = item.children[0];
                content = item.children[1];
                isClasslessStructure = true;
            }
            
            // If still no valid header/content pair, skip this item
            if (!header || !content) continue;
            
            // Ensure the item has the base class for CSS styling
            if (!hasClass(item, 'accordion-item')) {
                addClass(item, 'accordion-item');
            }
            
            // If using classless structure, add required inner classes
            if (isClasslessStructure) {
                addClass(header, 'accordion-header');
                addClass(content, 'accordion-content');
            }
            
            // Generate IDs for ARIA relationships
            var headerId = header.id || generateId('accordion-header');
            var contentId = content.id || generateId('accordion-content');
            header.id = headerId;
            content.id = contentId;
            
            // ARIA attributes for header (acts as button)
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.setAttribute('aria-controls', contentId);
            
            // ARIA attributes for content panel
            content.setAttribute('role', 'region');
            content.setAttribute('aria-labelledby', headerId);
            
            // Add icon if configured
            if (this.options.icons) {
                // Check if icon already exists to avoid duplication
                if (!header.querySelector('.accordion-icon')) {
                    var iconSpan = document.createElement('span');
                    addClass(iconSpan, 'accordion-icon');
                    iconSpan.setAttribute('aria-hidden', 'true');
                    addClass(iconSpan, this.options.icons.closed);
                    
                    // Insert icon before any other content in the header
                    if (header.firstChild) {
                        header.insertBefore(iconSpan, header.firstChild);
                    } else {
                        header.appendChild(iconSpan);
                    }
                }
            }
            
            // Check if this section should be fixed open
            var isFixed = this.options.fixedOpenIndexes.indexOf(i) !== -1;
            
            if (isFixed) {
                addClass(item, 'accordion-open');
                addClass(item, 'accordion-fixed');
                header.setAttribute('aria-expanded', 'true');
                
                // Use 'none' for fixed open sections to guarantee no clipping
                content.style.maxHeight = 'none'; 
                
                if (this.options.icons) {
                    var icon = header.querySelector('.accordion-icon');
                    if (icon) {
                        removeClass(icon, this.options.icons.closed);
                        addClass(icon, this.options.icons.open);
                    }
                }
            } else {
                content.style.maxHeight = '0';
                header.setAttribute('aria-expanded', 'false');
            }
            
            // Bind click handler using closure to capture variables
            (function(index, item, header, content, isFixed) {
                header.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent bubbling to modal backdrop
                    if (isFixed) return; // Don't toggle fixed sections
                    self.toggle(index);
                });
                
                // Keyboard support: Enter and Space
                header.addEventListener('keydown', function(e) {
                    if (isFixed) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        self.toggle(index);
                    }
                });
            })(i, item, header, content, isFixed);
        }
    };
    
    AR.Accordion.prototype.toggle = function(index) {
        var item = this.items[index];
        if (!item) return;
        
        var isOpen = hasClass(item, 'accordion-open');
        
        // Close other sections if multiOpen is false
        if (!this.options.multiOpen && !isOpen) {
            this.closeAll();
        }
        
        if (isOpen) {
            this.close(index);
        } else {
            this.open(index);
        }
    };
    
    AR.Accordion.prototype.open = function(index) {
        var item = this.items[index];
        if (!item) return;
        
        var header = item.querySelector('.accordion-header');
        var content = item.querySelector('.accordion-content');
        
        if (!header || !content) return;
        
        addClass(item, 'accordion-open');
        header.setAttribute('aria-expanded', 'true');
        
        // Reliable max-height logic
        content.removeEventListener('transitionend', content.transitionEndHandler);
        
        content.transitionEndHandler = function() {
            if (hasClass(item, 'accordion-open')) {
                content.style.maxHeight = 'none'; 
            }
            content.removeEventListener('transitionend', content.transitionEndHandler);
        };

        content.addEventListener('transitionend', content.transitionEndHandler);
        content.style.maxHeight = '9999px'; 
        
        if (this.options.icons) {
            var icon = header.querySelector('.accordion-icon');
            if (icon) {
                removeClass(icon, this.options.icons.closed);
                addClass(icon, this.options.icons.open);
            }
        }
    };
    
    AR.Accordion.prototype.close = function(index) {
        var item = this.items[index];
        if (!item) return;
        
        if (hasClass(item, 'accordion-fixed')) return;
        
        var header = item.querySelector('.accordion-header');
        var content = item.querySelector('.accordion-content');
        
        if (!header || !content) return;
        
        content.removeEventListener('transitionend', content.transitionEndHandler);

        if (content.style.maxHeight === 'none' || content.style.maxHeight === 'auto') {
            content.style.maxHeight = content.scrollHeight + 'px';
            content.offsetHeight; // Force reflow
        }

        content.style.maxHeight = '0';
        
        removeClass(item, 'accordion-open');
        header.setAttribute('aria-expanded', 'false');
        
        if (this.options.icons) {
            var icon = header.querySelector('.accordion-icon');
            if (icon) {
                removeClass(icon, this.options.icons.open);
                addClass(icon, this.options.icons.closed);
            }
        }
    };
    
    AR.Accordion.prototype.closeAll = function() {
        for (var i = 0; i < this.items.length; i++) {
            this.close(i);
        }
    };
    
    AR.Accordion.prototype.refresh = function() {
        for (var i = 0; i < this.items.length; i++) {
            var item = this.items[i];
            if (hasClass(item, 'accordion-open')) {
                var content = item.querySelector('.accordion-content');
                if (content && !hasClass(item, 'accordion-fixed')) {
                    content.offsetHeight; 
                    if (content.style.maxHeight !== 'none' && content.style.maxHeight !== 'auto') {
                         content.style.maxHeight = 'none';
                    }
                }
            }
        }
    };
    
    // ============================================================================
    // MODAL
    // ============================================================================
    
    /**
     * AR.Modal - Basic modal dialog with backdrop
     */
    AR.Modal = function(selectorOrOptions, options) {
        // If first argument is a string OR an HTMLElement, treat as content to wrap
        if (typeof selectorOrOptions === 'string' || selectorOrOptions instanceof HTMLElement) {
            var element = getElement(selectorOrOptions);
            if (!element) {
                throw new Error('Element not found: ' + selectorOrOptions);
            }
            
            // Store original location for when the modal closes
            this.originalElement = element;
            this.originalParent = element.parentNode;
            this.originalNextSibling = element.nextSibling;
            
            // The element must be visible when inside the modal (it is often hidden in the page)
            element.style.removeProperty('display');
            
            options = options || {};
            this.options = {
                title: options.title || '',
                content: element, // Use the original element
                trigger: options.trigger || null,
                closeOnBackdrop: options.closeOnBackdrop !== undefined ? options.closeOnBackdrop : true,
                closeOnEscape: options.closeOnEscape !== undefined ? options.closeOnEscape : true,
                closeButtonOnly: options.closeButtonOnly || false,
                onClose: options.onClose || null,
                onShow: options.onShow || null
            };
        } else {
            // Original behavior: first argument is options object
            options = selectorOrOptions;
            this.options = {
                title: options && options.title || '',
                content: options && options.content || '',
                trigger: options && options.trigger || null,
                closeOnBackdrop: options && options.closeOnBackdrop !== undefined ? options.closeOnBackdrop : true,
                closeOnEscape: options && options.closeOnEscape !== undefined ? options.closeOnEscape : true,
                closeButtonOnly: options && options.closeButtonOnly || false,
                onClose: options && options.onClose || null,
                onShow: options && options.onShow || null
            };
        }
        
        this.create();
        this.setupTrigger();
    };
    
    AR.Modal.prototype.setupTrigger = function() {
        if (!this.options.trigger) return;
        
        var self = this;
        var trigger = getElement(this.options.trigger);
        if (trigger) {
            trigger.addEventListener('click', function(e) {
                e.preventDefault();
                self.show();
            });
        }
    };
    
    AR.Modal.prototype.create = function() {
        var self = this;
        
        // Create backdrop
        this.backdrop = document.createElement('div');
        addClass(this.backdrop, 'ar-modal-backdrop');
        
        // Create modal container
        this.container = document.createElement('div');
        addClass(this.container, 'ar-modal');
        
        // Create modal dialog
        this.dialog = document.createElement('div');
        addClass(this.dialog, 'modal-dialog');
        this.dialog.setAttribute('role', 'dialog');
        this.dialog.setAttribute('aria-modal', 'true');
        
        // Create header
        if (this.options.title) {
            var header = document.createElement('div');
            addClass(header, 'modal-header');
            
            var title = document.createElement('h3');
            var titleId = generateId('modal-title');
            title.id = titleId;
            title.textContent = this.options.title;
            header.appendChild(title);
            
            // Link dialog to title
            this.dialog.setAttribute('aria-labelledby', titleId);
            
            var closeBtn = document.createElement('button');
            addClass(closeBtn, 'modal-close');
            closeBtn.setAttribute('type', 'button');
            closeBtn.setAttribute('aria-label', 'Close');
            this.closeBtn = closeBtn;
            
            // Add close icon
            var closeIcon = document.createElement('span');
            addClass(closeIcon, 'icon-close');
            closeIcon.setAttribute('aria-hidden', 'true');
            closeBtn.appendChild(closeIcon);
            
            header.appendChild(closeBtn);
            
            this.dialog.appendChild(header);
            
            closeBtn.addEventListener('click', function() {
                self.hide();
            });
        }
        
        // Create body
        this.body = document.createElement('div');
        addClass(this.body, 'modal-body');
        
        if (typeof this.options.content === 'string') {
            this.body.innerHTML = this.options.content;
        } else if (this.options.content instanceof HTMLElement) {
            this.body.appendChild(this.options.content);
        }
        
        this.dialog.appendChild(this.body);
        this.container.appendChild(this.dialog);
        
        // Backdrop click handler - close when clicking the backdrop itself
        if (this.options.closeOnBackdrop && !this.options.closeButtonOnly) {
            this.backdrop.addEventListener('click', function(e) {
                self.hide();
            });
        }
        
        // Escape key to close
        this.escapeHandler = function(e) {
            if (e.key === 'Escape' && self.options.closeOnEscape && !self.options.closeButtonOnly) {
                self.hide();
            }
        };
        
        // Focus trap
        this.focusTrapHandler = function(e) {
            if (e.key !== 'Tab') return;
            
            var focusableElements = self.dialog.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            
            if (focusableElements.length === 0) return;
            
            var firstElement = focusableElements[0];
            var lastElement = focusableElements[focusableElements.length - 1];
            
            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };
    };
    
    AR.Modal.prototype.show = function() {
        var self = this;
        
        // --- FIX START: Re-acquire the element if it was moved back ---
        // If the element is currently sitting in the original parent, bring it back to the modal
        if (this.originalElement && this.originalParent) {
            if (this.originalElement.parentNode === this.originalParent) {
                this.body.appendChild(this.originalElement);
                this.originalElement.style.removeProperty('display');
            }
        }
        // --- FIX END ---
        
        // Store element that had focus before opening
        this.previousFocus = document.activeElement;
        
        document.body.appendChild(this.backdrop);
        document.body.appendChild(this.container);
        
        // Attach keyboard handlers
        document.addEventListener('keydown', this.escapeHandler);
        this.dialog.addEventListener('keydown', this.focusTrapHandler);
        
        // Trigger fade-in
        setTimeout(function() {
            addClass(self.backdrop, 'show');
            addClass(self.container, 'show');
            
            // Run onShow AFTER the modal has started to show (applied .show class).
            if (self.options.onShow) {
                self.options.onShow(self);
            }
            
            // Focus first focusable element
            var focusTarget = self.closeBtn || self.dialog.querySelector(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusTarget) {
                focusTarget.focus();
            }
        }, 10);
    };
    
    AR.Modal.prototype.hide = function() {
        removeClass(this.backdrop, 'show');
        removeClass(this.container, 'show');
        
        // Remove keyboard handlers
        document.removeEventListener('keydown', this.escapeHandler);
        this.dialog.removeEventListener('keydown', this.focusTrapHandler);

        // --- FIX: Restore original element IMMEDIATELY (synchronously) ---
        if (this.originalElement && this.originalParent) {
            // Insert the element back where it came from
            this.originalParent.insertBefore(this.originalElement, this.originalNextSibling);
            
            // Re-hide the element
            this.originalElement.style.display = 'none'; 
        }

        // Return focus immediately
        if (this.previousFocus && this.previousFocus.focus) {
            this.previousFocus.focus();
        }
        
        // Cleanup modal DOM elements (delayed for transition)
        var self = this;
        setTimeout(function() {
            if (self.backdrop.parentNode) {
                self.backdrop.parentNode.removeChild(self.backdrop);
            }
            if (self.container.parentNode) {
                self.container.parentNode.removeChild(self.container);
            }
            
            // --- FIX START: WE DO NOT CLEAR THESE REFERENCES ANYMORE ---
            // This ensures we can find the element again if show() is called a second time
            /* self.originalElement = null;
            self.originalParent = null;
            self.originalNextSibling = null;
            */
            // --- FIX END ---
            
            if (self.options.onClose) {
                self.options.onClose(self);
            }
        }, 300); // Match CSS transition duration
    };
    
    /**
     * Query for an element within the modal body.
     */
    AR.Modal.prototype.querySelector = function(selector) {
        return this.body.querySelector(selector);
    };
    
    /**
     * Query for all matching elements within the modal body.
     */
    AR.Modal.prototype.querySelectorAll = function(selector) {
        return this.body.querySelectorAll(selector);
    };
    
    /**
     * Create modal from existing element (static method)
     */
    AR.Modal.fromElement = function(selector, options) {
        return new AR.Modal(selector, options);
    };
    
    // ============================================================================
    // FORM MODAL (HTMX Integration)
    // ============================================================================
    
    /**
     * AR.FormModal - Convert a form into a modal dialog
     */
    AR.FormModal = function(formSelector, options) {
        this.form = getElement(formSelector);
        if (!this.form) {
            throw new Error('Form not found: ' + formSelector);
        }
        
        this.options = {
            trigger: options && options.trigger || null,
            title: options && options.title || 'Form',
            closeOnSuccess: options && options.closeOnSuccess !== undefined ? options.closeOnSuccess : true,
            onSuccess: options && options.onSuccess || null,
            onError: options && options.onError || null
        };
        
        this.init();
    };
    
    AR.FormModal.prototype.init = function() {
        var self = this;
        
        // Create modal with form as content (moves the original form)
        this.modal = AR.Modal.fromElement(this.form, {
            title: this.options.title,
            closeOnBackdrop: false
        });
        
        // Get reference to the form inside the modal
        this.modalForm = this.modal.body.querySelector('form') || this.modal.body.querySelector('[hx-post], [hx-put], [hx-patch]');
        
        // Setup trigger button
        if (this.options.trigger) {
            var trigger = getElement(this.options.trigger);
            if (trigger) {
                trigger.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.show();
                });
            }
        }
        
        // Listen for HTMX events if HTMX is present
        if (window.htmx && this.modalForm) {
            // Success
            this.modalForm.addEventListener('htmx:afterOnLoad', function(event) {
                if (event.detail.successful) {
                    if (self.options.onSuccess) {
                        self.options.onSuccess(event.detail);
                    }
                    if (self.options.closeOnSuccess) {
                        self.hide();
                    }
                }
            });
            
            // Error
            this.modalForm.addEventListener('htmx:responseError', function(event) {
                if (self.options.onError) {
                    self.options.onError(event.detail);
                }
            });
        }
        
        // Fallback for non-HTMX forms
        if (this.modalForm) {
            this.modalForm.addEventListener('submit', function(e) {
                if (!window.htmx) {
                    setTimeout(function() {
                        if (self.options.closeOnSuccess) {
                            self.hide();
                        }
                    }, 100);
                }
            });
        }
    };
    
    AR.FormModal.prototype.show = function() {
        this.modal.show();
    };
    
    AR.FormModal.prototype.hide = function() {
        this.modal.hide();
    };
    
    // ============================================================================
    // DRAWER
    // ============================================================================
    
    /**
     * AR.Drawer - Side navigation drawer
     */
    AR.Drawer = function(drawerSelector) {
        this.drawer = getElement(drawerSelector);
        
        if (!this.drawer) {
            throw new Error('Drawer element not found: ' + drawerSelector);
        }
        
        this.isOpen = false;
        this.detectPosition();
        this.init();
    };
    
    AR.Drawer.prototype.detectPosition = function() {
        if (hasClass(this.drawer, 'drawer-left')) {
            this.position = 'left';
            return;
        }
        
        if (hasClass(this.drawer, 'drawer-right')) {
            this.position = 'right';
            return;
        }
        
        var dir = document.documentElement.dir ||
                  window.getComputedStyle(document.documentElement).direction;
        
        this.position = (dir === 'rtl') ? 'right' : 'left';
        
        addClass(this.drawer, 'drawer-' + this.position);
    };
    
    AR.Drawer.prototype.init = function() {
        var self = this;
        
        this.closeBtn = this.drawer.querySelector('.drawer-close');
        if (!this.closeBtn) {
            throw new Error('Drawer must contain a .drawer-close button');
        }
        this.closeBtn.setAttribute('aria-label', 'Close menu');
        
        this.hamburger = document.createElement('button');
        this.hamburger.setAttribute('type', 'button');
        this.hamburger.setAttribute('aria-label', 'Open menu');
        addClass(this.hamburger, 'drawer-hamburger');
        addClass(this.hamburger, 'hamburger-' + this.position);
        
        var hamburgerIcon = document.createElement('span');
        addClass(hamburgerIcon, 'icon-menu');
        this.hamburger.appendChild(hamburgerIcon);
        
        document.body.appendChild(this.hamburger);
        
        this.backdrop = document.createElement('div');
        addClass(this.backdrop, 'ar-drawer-backdrop');
        
        var drawerId = this.drawer.id || 'drawer-' + Math.random().toString(36).substr(2, 9);
        this.drawer.id = drawerId;
        this.drawer.setAttribute('aria-hidden', 'true');
        
        this.hamburger.setAttribute('aria-expanded', 'false');
        this.hamburger.setAttribute('aria-controls', drawerId);
        
        if (this.position === 'left') {
            this.drawer.style.transform = 'translateX(-100%)';
        } else {
            this.drawer.style.transform = 'translateX(100%)';
        }
        
        this.setFocusableState(false);
        
        this.hamburger.addEventListener('click', function(e) {
            e.preventDefault();
            self.toggle();
        });
        
        this.closeBtn.addEventListener('click', function() {
            self.close();
        });
        
        this.backdrop.addEventListener('click', function() {
            self.close();
        });
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && self.isOpen) {
                self.close();
            }
        });
        
        var links = this.drawer.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                self.close();
            });
        }
        
        this.setupFocusTrap();
    };
    
    AR.Drawer.prototype.setupFocusTrap = function() {
        var self = this;
        
        this.drawer.addEventListener('keydown', function(e) {
            if (!self.isOpen) return;
            
            if (e.key === 'Tab') {
                var focusableElements = self.drawer.querySelectorAll(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                
                if (focusableElements.length === 0) return;
                
                var firstElement = focusableElements[0];
                var lastElement = focusableElements[focusableElements.length - 1];
                
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        });
    };
    
    AR.Drawer.prototype.open = function() {
        if (this.isOpen) return;
        
        this.isOpen = true;
        this.previousFocus = document.activeElement;
        
        this.setFocusableState(true);
        document.body.appendChild(this.backdrop);
        
        this.drawer.setAttribute('aria-hidden', 'false');
        this.hamburger.setAttribute('aria-expanded', 'true');
        
        this.drawer.style.transform = 'translateX(0)';
        
        var self = this;
        setTimeout(function() {
            addClass(self.backdrop, 'show');
        }, 10);
        
        this.closeBtn.focus();
    };
    
    AR.Drawer.prototype.close = function() {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        
        this.setFocusableState(false);
        this.drawer.setAttribute('aria-hidden', 'true');
        this.hamburger.setAttribute('aria-expanded', 'false');
        
        if (this.position === 'left') {
            this.drawer.style.transform = 'translateX(-100%)';
        } else {
            this.drawer.style.transform = 'translateX(100%)';
        }
        
        removeClass(this.backdrop, 'show');
        
        var self = this;
        setTimeout(function() {
            if (self.backdrop.parentNode) {
                self.backdrop.parentNode.removeChild(self.backdrop);
            }
        }, 300);
        
        if (this.previousFocus && this.previousFocus.focus) {
            this.previousFocus.focus();
        } else {
            this.hamburger.focus();
        }
    };
    
    AR.Drawer.prototype.setFocusableState = function(enabled) {
        var focusableElements = this.drawer.querySelectorAll(
            'a[href], button, input, select, textarea, [tabindex]'
        );
        
        for (var i = 0; i < focusableElements.length; i++) {
            var el = focusableElements[i];
            
            if (enabled) {
                if (el.hasAttribute('data-original-tabindex')) {
                    var original = el.getAttribute('data-original-tabindex');
                    if (original === 'none') {
                        el.removeAttribute('tabindex');
                    } else {
                        el.setAttribute('tabindex', original);
                    }
                    el.removeAttribute('data-original-tabindex');
                }
            } else {
                if (!el.hasAttribute('data-original-tabindex')) {
                    var current = el.getAttribute('tabindex');
                    el.setAttribute('data-original-tabindex', current === null ? 'none' : current);
                }
                el.setAttribute('tabindex', '-1');
            }
        }
    };
    
    AR.Drawer.prototype.toggle = function() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    };
    
    // ============================================================================
    // ALERT
    // ============================================================================
    
    AR.Alert = {};
    
    AR.Alert.show = function(containerSelector, options) {
        var container = getElement(containerSelector);
        if (!container) {
            throw new Error('Alert container not found: ' + containerSelector);
        }
        
        var opts = {
            type: options && options.type || 'info',
            message: options && options.message || '',
            dismissible: options && options.dismissible !== undefined ? options.dismissible : true,
            duration: options && options.duration || 0
        };
        
        var alert = document.createElement('div');
        addClass(alert, 'ar-alert');
        addClass(alert, 'alert-' + opts.type);
        
        if (opts.type === 'error' || opts.type === 'warning') {
            alert.setAttribute('role', 'alert');
        } else {
            alert.setAttribute('role', 'status');
        }
        
        var messageSpan = document.createElement('span');
        messageSpan.textContent = opts.message;
        alert.appendChild(messageSpan);
        
        if (opts.dismissible) {
            var closeBtn = document.createElement('button');
            addClass(closeBtn, 'alert-close');
            closeBtn.innerHTML = '&times;';
            closeBtn.setAttribute('type', 'button');
            closeBtn.setAttribute('aria-label', 'Dismiss');
            alert.appendChild(closeBtn);
            
            closeBtn.addEventListener('click', function() {
                AR.Alert.dismiss(alert);
            });
        }
        
        container.appendChild(alert);
        setTimeout(function() {
            addClass(alert, 'show');
        }, 10);
        
        if (opts.duration > 0) {
            setTimeout(function() {
                AR.Alert.dismiss(alert);
            }, opts.duration);
        }
        
        return alert;
    };
    
    AR.Alert.dismiss = function(alert) {
        removeClass(alert, 'show');
        setTimeout(function() {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 300);
    };
    
    // ============================================================================
    // NOTIFICATION (Toast)
    // ============================================================================
    
    AR.Notification = {};
    AR.Notification.container = null;
    
    AR.Notification.init = function() {
        if (this.container) return;
        
        this.container = document.createElement('div');
        addClass(this.container, 'ar-notification-container');
        this.container.setAttribute('role', 'status');
        this.container.setAttribute('aria-live', 'polite');
        this.container.setAttribute('aria-atomic', 'false');
        document.body.appendChild(this.container);
    };
    
    AR.Notification.show = function(options) {
        this.init();
        
        var opts = {
            type: options && options.type || 'info',
            message: options && options.message || '',
            duration: options && options.duration !== undefined ? options.duration : 3000,
            position: options && options.position || 'top-right'
        };
        
        removeClass(this.container, 'top-right');
        removeClass(this.container, 'top-left');
        removeClass(this.container, 'bottom-right');
        removeClass(this.container, 'bottom-left');
        addClass(this.container, opts.position);
        
        var notification = document.createElement('div');
        addClass(notification, 'ar-notification');
        addClass(notification, 'notification-' + opts.type);
        
        var messageSpan = document.createElement('span');
        messageSpan.textContent = opts.message;
        notification.appendChild(messageSpan);
        
        this.container.appendChild(notification);
        setTimeout(function() {
            addClass(notification, 'show');
        }, 10);
        
        if (opts.duration > 0) {
            setTimeout(function() {
                AR.Notification.dismiss(notification);
            }, opts.duration);
        }
        
        return notification;
    };
    
    AR.Notification.dismiss = function(notification) {
        removeClass(notification, 'show');
        setTimeout(function() {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    };
    
    // ============================================================================
    // GRID
    // ============================================================================
    
    AR.Grid = {};
    
    AR.Grid.create = function(selector, options) {
        var element = getElement(selector);
        if (!element) {
            throw new Error('Grid container not found: ' + selector);
        }
        
        var opts = {
            columns: options && options.columns || 12,
            gap: options && options.gap || '1rem'
        };
        
        addClass(element, 'ar-grid');
        element.style.gridTemplateColumns = 'repeat(' + opts.columns + ', 1fr)';
        element.style.gap = opts.gap;
        
        return element;
    };
    
    // ============================================================================
    // FLOATER
    // ============================================================================

    /**
     * AR.Floater - Floating draggable component (like sticky notes)
     */
    AR.Floater = function(selectorOrOptions, options) {
        // If first argument is a string OR an HTMLElement, treat as content to wrap
        if (typeof selectorOrOptions === 'string' || selectorOrOptions instanceof HTMLElement) {
            var element = getElement(selectorOrOptions);
            if (!element) {
                throw new Error('Element not found: ' + selectorOrOptions);
            }

            // Store original location for when the floater is removed
            this.originalElement = element;
            this.originalParent = element.parentNode;
            this.originalNextSibling = element.nextSibling;

            options = options || {};
            this.options = {
                title: options.title || '',
                content: element,
                position: options.position || 'center',
                draggable: options.draggable !== undefined ? options.draggable : true,
                minimizable: options.minimizable !== undefined ? options.minimizable : true,
                onClose: options.onClose || null,
                onMinimize: options.onMinimize || null,
                onMaximize: options.onMaximize || null,
                width: options.width || '320px',
                height: options.height || 'auto'
            };
        } else {
            // First argument is options object
            options = selectorOrOptions || {};
            this.options = {
                title: options.title || 'Floater',
                content: options.content || '',
                position: options.position || 'center',
                draggable: options.draggable !== undefined ? options.draggable : true,
                minimizable: options.minimizable !== undefined ? options.minimizable : true,
                onClose: options.onClose || null,
                onMinimize: options.onMinimize || null,
                onMaximize: options.onMaximize || null,
                width: options.width || '320px',
                height: options.height || 'auto'
            };
        }

        this.isMinimized = false;
        this.dragState = null;
        this.create();
    };

    AR.Floater.prototype.create = function() {
        var self = this;

        // Create floater container
        this.container = document.createElement('div');
        addClass(this.container, 'ar-floater');
        this.container.style.width = this.options.width;

        if (this.options.height !== 'auto') {
            this.container.style.height = this.options.height;
        }

        this.container.setAttribute('role', 'dialog');
        this.container.setAttribute('aria-modal', 'false');

        // Create header
        this.header = document.createElement('div');
        addClass(this.header, 'floater-header');

        if (this.options.draggable) {
            this.header.style.cursor = 'move';
            this.header.setAttribute('role', 'button');
            this.header.setAttribute('aria-label', 'Drag to move');
        }

        // Title
        var title = document.createElement('span');
        addClass(title, 'floater-title');
        var titleId = generateId('floater-title');
        title.id = titleId;
        title.textContent = this.options.title;
        this.header.appendChild(title);

        // Link container to title
        this.container.setAttribute('aria-labelledby', titleId);

        // Controls container
        var controls = document.createElement('div');
        addClass(controls, 'floater-controls');

        // Minimize button
        if (this.options.minimizable) {
            this.minimizeBtn = document.createElement('button');
            addClass(this.minimizeBtn, 'floater-minimize');
            this.minimizeBtn.setAttribute('type', 'button');
            this.minimizeBtn.setAttribute('aria-label', 'Minimize');
            this.minimizeBtn.innerHTML = '&minus;';
            controls.appendChild(this.minimizeBtn);

            this.minimizeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.toggleMinimize();
            });
        }

        // Close button
        this.closeBtn = document.createElement('button');
        addClass(this.closeBtn, 'floater-close');
        this.closeBtn.setAttribute('type', 'button');
        this.closeBtn.setAttribute('aria-label', 'Close');
        this.closeBtn.innerHTML = '&times;';
        controls.appendChild(this.closeBtn);

        this.header.appendChild(controls);
        this.container.appendChild(this.header);

        // Create body
        this.body = document.createElement('div');
        addClass(this.body, 'floater-body');

        if (typeof this.options.content === 'string') {
            this.body.innerHTML = this.options.content;
        } else if (this.options.content instanceof HTMLElement) {
            this.body.appendChild(this.options.content);
            this.options.content.style.removeProperty('display');
        }

        this.container.appendChild(this.body);

        // Close button handler
        this.closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            self.remove();
        });

        // Setup dragging
        if (this.options.draggable) {
            this.setupDragging();
        }

        // Add to DOM
        document.body.appendChild(this.container);

        // Position the floater
        this.setInitialPosition();

        // Trigger show animation
        setTimeout(function() {
            addClass(self.container, 'show');
        }, 10);
    };

    AR.Floater.prototype.setInitialPosition = function() {
        var rect = this.container.getBoundingClientRect();
        var viewportWidth = window.innerWidth;
        var viewportHeight = window.innerHeight;

        var left, top;

        switch (this.options.position) {
            case 'top-left':
                left = 20;
                top = 20;
                break;
            case 'top-right':
                left = viewportWidth - rect.width - 20;
                top = 20;
                break;
            case 'bottom-left':
                left = 20;
                top = viewportHeight - rect.height - 20;
                break;
            case 'bottom-right':
                left = viewportWidth - rect.width - 20;
                top = viewportHeight - rect.height - 20;
                break;
            case 'center':
            default:
                left = (viewportWidth - rect.width) / 2;
                top = (viewportHeight - rect.height) / 2;
                break;
        }

        this.container.style.left = Math.max(0, left) + 'px';
        this.container.style.top = Math.max(0, top) + 'px';
    };

    AR.Floater.prototype.setupDragging = function() {
        var self = this;

        this.header.addEventListener('mousedown', function(e) {
            // Don't drag when clicking on buttons
            if (e.target.tagName === 'BUTTON') return;

            e.preventDefault();

            var rect = self.container.getBoundingClientRect();

            self.dragState = {
                startX: e.clientX,
                startY: e.clientY,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top
            };

            addClass(self.container, 'dragging');

            // Add global mouse handlers
            document.addEventListener('mousemove', self.handleMouseMove);
            document.addEventListener('mouseup', self.handleMouseUp);
        });

        // Bind these handlers to the instance so we can remove them later
        this.handleMouseMove = function(e) {
            if (!self.dragState) return;

            var left = e.clientX - self.dragState.offsetX;
            var top = e.clientY - self.dragState.offsetY;

            // Keep within viewport bounds
            var rect = self.container.getBoundingClientRect();
            var maxLeft = window.innerWidth - rect.width;
            var maxTop = window.innerHeight - rect.height;

            left = Math.max(0, Math.min(left, maxLeft));
            top = Math.max(0, Math.min(top, maxTop));

            self.container.style.left = left + 'px';
            self.container.style.top = top + 'px';
        };

        this.handleMouseUp = function(e) {
            self.dragState = null;
            removeClass(self.container, 'dragging');

            document.removeEventListener('mousemove', self.handleMouseMove);
            document.removeEventListener('mouseup', self.handleMouseUp);
        };
    };

    AR.Floater.prototype.toggleMinimize = function() {
        if (this.isMinimized) {
            this.maximize();
        } else {
            this.minimize();
        }
    };

    AR.Floater.prototype.minimize = function() {
        if (this.isMinimized) return;

        this.isMinimized = true;
        addClass(this.container, 'minimized');
        this.body.style.display = 'none';

        if (this.minimizeBtn) {
            this.minimizeBtn.innerHTML = '&#9633;'; // Square symbol
            this.minimizeBtn.setAttribute('aria-label', 'Maximize');
        }

        if (this.options.onMinimize) {
            this.options.onMinimize(this);
        }
    };

    AR.Floater.prototype.maximize = function() {
        if (!this.isMinimized) return;

        this.isMinimized = false;
        removeClass(this.container, 'minimized');
        this.body.style.display = '';

        if (this.minimizeBtn) {
            this.minimizeBtn.innerHTML = '&minus;';
            this.minimizeBtn.setAttribute('aria-label', 'Minimize');
        }

        if (this.options.onMaximize) {
            this.options.onMaximize(this);
        }
    };

    AR.Floater.prototype.remove = function() {
        var self = this;

        removeClass(this.container, 'show');

        // Restore original element if it was moved
        if (this.originalElement && this.originalParent) {
            this.originalParent.insertBefore(this.originalElement, this.originalNextSibling);
            this.originalElement.style.display = 'none';
        }

        setTimeout(function() {
            if (self.container.parentNode) {
                self.container.parentNode.removeChild(self.container);
            }

            if (self.options.onClose) {
                self.options.onClose(self);
            }
        }, 300); // Match CSS transition duration
    };

    AR.Floater.prototype.bringToFront = function() {
        // Get all floaters
        var floaters = document.querySelectorAll('.ar-floater');
        var maxZ = 1500; // Start from base z-index

        // Find the highest z-index
        for (var i = 0; i < floaters.length; i++) {
            var z = parseInt(window.getComputedStyle(floaters[i]).zIndex) || 1500;
            if (z > maxZ) maxZ = z;
        }

        // Set this floater to be on top
        this.container.style.zIndex = maxZ + 1;
    };

    /**
     * Create floater from existing element (static method)
     */
    AR.Floater.fromElement = function(selector, options) {
        return new AR.Floater(selector, options);
    };

    // Bring floater to front when clicked
    document.addEventListener('mousedown', function(e) {
        var floater = e.target.closest('.ar-floater');
        if (floater) {
            // Find the AR.Floater instance (we'll store it on the DOM element)
            var instance = floater.floaterInstance;
            if (instance) {
                instance.bringToFront();
            }
        }
    });

    // Store instance on container for easy access
    var originalCreate = AR.Floater.prototype.create;
    AR.Floater.prototype.create = function() {
        originalCreate.call(this);
        this.container.floaterInstance = this;
    };

    // ============================================================================
    // PROGRESS BAR
    // ============================================================================

    /**
     * AR.ProgressBar - Visual progress indicator
     * Options:
     *   - value: Current value (0-max)
     *   - max: Maximum value (default: 100)
     *   - showLabel: Show percentage/value label (default: true)
     *   - labelFormat: 'percentage' | 'value' | 'both' (default: 'percentage')
     *   - variant: 'default' | 'success' | 'warning' | 'danger' (default: 'default')
     *   - animated: Enable animation (default: false)
     *   - striped: Enable striped pattern (default: false)
     */
    AR.ProgressBar = function(selector, options) {
        this.element = getElement(selector);
        if (!this.element) {
            throw new Error('ProgressBar container not found: ' + selector);
        }

        this.options = {
            value: options && options.value !== undefined ? options.value : 0,
            max: options && options.max !== undefined ? options.max : 100,
            showLabel: options && options.showLabel !== undefined ? options.showLabel : true,
            labelFormat: options && options.labelFormat || 'percentage',
            variant: options && options.variant || 'default',
            animated: options && options.animated !== undefined ? options.animated : false,
            striped: options && options.striped !== undefined ? options.striped : false,
            onChange: options && options.onChange || null
        };

        this.init();
    };

    AR.ProgressBar.prototype.init = function() {
        addClass(this.element, 'ar-progress');
        this.element.setAttribute('role', 'progressbar');
        this.element.setAttribute('aria-valuemin', '0');
        this.element.setAttribute('aria-valuemax', this.options.max);

        // Create bar element
        this.bar = document.createElement('div');
        addClass(this.bar, 'progress-bar');
        addClass(this.bar, 'progress-' + this.options.variant);

        if (this.options.striped) {
            addClass(this.bar, 'progress-striped');
        }

        if (this.options.animated) {
            addClass(this.bar, 'progress-animated');
        }

        // Create label
        if (this.options.showLabel) {
            this.label = document.createElement('span');
            addClass(this.label, 'progress-label');
            this.bar.appendChild(this.label);
        }

        this.element.appendChild(this.bar);

        // Set initial value
        this.setValue(this.options.value);
    };

    AR.ProgressBar.prototype.setValue = function(value) {
        value = Math.max(0, Math.min(value, this.options.max));
        this.options.value = value;

        var percentage = (value / this.options.max) * 100;
        this.bar.style.width = percentage + '%';

        this.element.setAttribute('aria-valuenow', value);

        if (this.label) {
            var labelText = '';
            switch (this.options.labelFormat) {
                case 'percentage':
                    labelText = Math.round(percentage) + '%';
                    break;
                case 'value':
                    labelText = value + ' / ' + this.options.max;
                    break;
                case 'both':
                    labelText = value + ' / ' + this.options.max + ' (' + Math.round(percentage) + '%)';
                    break;
            }
            this.label.textContent = labelText;
        }

        if (this.options.onChange) {
            this.options.onChange(value, percentage);
        }
    };

    AR.ProgressBar.prototype.getValue = function() {
        return this.options.value;
    };

    AR.ProgressBar.prototype.setMax = function(max) {
        this.options.max = max;
        this.element.setAttribute('aria-valuemax', max);
        this.setValue(this.options.value); // Recalculate percentage
    };

    AR.ProgressBar.prototype.setVariant = function(variant) {
        removeClass(this.bar, 'progress-' + this.options.variant);
        this.options.variant = variant;
        addClass(this.bar, 'progress-' + variant);
    };

    AR.ProgressBar.prototype.reset = function() {
        this.setValue(0);
    };

    /**
     * Static factory method
     */
    AR.ProgressBar.create = function(selector, options) {
        return new AR.ProgressBar(selector, options);
    };

    // ============================================================================
    // EXPORT
    // ============================================================================

    window.AR = AR;

})(window);