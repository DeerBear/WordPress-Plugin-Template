/**
 * AR.DatePicker.js
 * Date Picker and Range Picker components
 * Accessible, keyboard-navigable, no drag operations
 */
(function(window) {
    'use strict';
    
    var AR = window.AR || {};
    
    // ============================================================================
    // UTILITIES
    // ============================================================================
    
    var MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    var DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var DAY_NAMES_SHORT_SUNDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
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
        }
    }
    
    function hasClass(element, className) {
        return element.classList && element.classList.contains(className);
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
    
    /**
     * Format date as YYYY-MM-DD
     */
    function formatDate(date) {
        if (!date) return '';
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }
    
    /**
     * Format date for display (e.g., "10 Dec 2025")
     */
    function formatDateDisplay(date) {
        if (!date) return '';
        return date.getDate() + ' ' + MONTH_SHORT[date.getMonth()] + ' ' + date.getFullYear();
    }
    
    /**
     * Parse YYYY-MM-DD string to Date
     */
    function parseDate(str) {
        if (!str) return null;
        var parts = str.split('-');
        if (parts.length !== 3) return null;
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    
    /**
     * Check if two dates are the same day
     */
    function isSameDay(d1, d2) {
        if (!d1 || !d2) return false;
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }
    
    /**
     * Check if date is between start and end (inclusive)
     */
    function isInRange(date, start, end) {
        if (!date || !start || !end) return false;
        var time = date.getTime();
        return time >= start.getTime() && time <= end.getTime();
    }
    
    /**
     * Get days in month
     */
    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }
    
    /**
     * Get day of week (0 = Monday, 6 = Sunday) for Monday-start weeks
     * @param {Date} date
     * @param {boolean} sundayStart - if true, 0 = Sunday
     */
    function getDayOfWeek(date, sundayStart) {
        var day = date.getDay(); // 0 = Sunday
        if (sundayStart) {
            return day;
        }
        // Convert to Monday-start: Mon=0, Tue=1, ..., Sun=6
        return day === 0 ? 6 : day - 1;
    }
    
    /**
     * Find month by type-ahead
     * @param {string} input - typed characters
     * @returns {number} month index (0-11) or -1 if not found
     */
    function findMonthByTypeAhead(input) {
        if (!input) return -1;
        var lower = input.toLowerCase();
        
        for (var i = 0; i < MONTH_NAMES.length; i++) {
            if (MONTH_NAMES[i].toLowerCase().startsWith(lower)) {
                return i;
            }
        }
        return -1;
    }
    
    // ============================================================================
    // DATE PICKER
    // ============================================================================
    
    /**
     * AR.DatePicker - Single date selection
     * @param {string|HTMLElement} selector - Input element or selector
     * @param {Object} options - Configuration options
     */
    AR.DatePicker = function(selector, options) {
        this.input = getElement(selector);
        if (!this.input) {
            throw new Error('DatePicker input not found: ' + selector);
        }
        
        options = options || {};
        this.options = {
            minDate: options.minDate ? parseDate(options.minDate) : null,
            maxDate: options.maxDate ? parseDate(options.maxDate) : null,
            sundayStart: options.sundayStart || false,
            onChange: options.onChange || null
        };
        
        this.selectedDate = this.input.value ? parseDate(this.input.value) : null;
        this.viewDate = this.selectedDate ? new Date(this.selectedDate) : new Date();
        this.isOpen = false;
        this.typeAheadBuffer = '';
        this.typeAheadTimeout = null;
        
        this.init();
    };
    
    AR.DatePicker.prototype.init = function() {
        var self = this;
        
        // Wrap input for positioning
        this.wrapper = document.createElement('div');
        addClass(this.wrapper, 'ar-datepicker-wrapper');
        this.input.parentNode.insertBefore(this.wrapper, this.input);
        this.wrapper.appendChild(this.input);
        
        // Add calendar icon button
        this.trigger = document.createElement('button');
        this.trigger.type = 'button';
        addClass(this.trigger, 'ar-datepicker-trigger');
        this.trigger.setAttribute('aria-label', 'Open calendar');
        this.trigger.innerHTML = '<span class="icon-calendar" aria-hidden="true"></span>';
        this.wrapper.appendChild(this.trigger);
        
        // Create popup
        this.popup = document.createElement('div');
        addClass(this.popup, 'ar-datepicker-popup');
        this.popup.setAttribute('role', 'dialog');
        this.popup.setAttribute('aria-label', 'Choose date');
        this.wrapper.appendChild(this.popup);
        
        // Build calendar structure
        this.buildCalendar();
        
        // Event listeners
        this.trigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self.toggle();
        });
        
        this.input.addEventListener('focus', function() {
            self.open();
        });
        
        this.input.addEventListener('change', function() {
            var date = parseDate(self.input.value);
            if (date) {
                self.selectedDate = date;
                self.viewDate = new Date(date);
                self.renderCalendar();
            }
        });
        
        // Close on outside click
        this._outsideClickHandler = function(e) {
            if (self.isOpen && !self.wrapper.contains(e.target)) {
                self.close();
            }
        };
        document.addEventListener('click', this._outsideClickHandler);

        // Keyboard navigation
        this.popup.addEventListener('keydown', function(e) {
            self.handleKeydown(e);
        });
    };
    
    AR.DatePicker.prototype.buildCalendar = function() {
        var self = this;
        
        // Header with navigation
        this.header = document.createElement('div');
        addClass(this.header, 'ar-datepicker-header');
        
        // Previous month button
        this.prevBtn = document.createElement('button');
        this.prevBtn.type = 'button';
        addClass(this.prevBtn, 'ar-datepicker-nav');
        this.prevBtn.setAttribute('aria-label', 'Previous month');
        this.prevBtn.innerHTML = '<span class="icon-chevron-left" aria-hidden="true"></span>';
        this.prevBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self.navigateMonth(-1);
        });
        
        // Month/Year selectors container
        this.selectors = document.createElement('div');
        addClass(this.selectors, 'ar-datepicker-selectors');
        
        // Month dropdown
        this.monthSelect = document.createElement('select');
        addClass(this.monthSelect, 'ar-datepicker-month');
        this.monthSelect.setAttribute('aria-label', 'Select month');
        for (var i = 0; i < 12; i++) {
            var opt = document.createElement('option');
            opt.value = i;
            opt.textContent = MONTH_NAMES[i];
            this.monthSelect.appendChild(opt);
        }
        this.monthSelect.addEventListener('change', function() {
            self.viewDate.setMonth(parseInt(self.monthSelect.value));
            self.renderCalendar();
        });
        
        // Year dropdown
        this.yearSelect = document.createElement('select');
        addClass(this.yearSelect, 'ar-datepicker-year');
        this.yearSelect.setAttribute('aria-label', 'Select year');
        this.populateYears();
        this.yearSelect.addEventListener('change', function() {
            self.viewDate.setFullYear(parseInt(self.yearSelect.value));
            self.renderCalendar();
        });
        
        this.selectors.appendChild(this.monthSelect);
        this.selectors.appendChild(this.yearSelect);
        
        // Next month button
        this.nextBtn = document.createElement('button');
        this.nextBtn.type = 'button';
        addClass(this.nextBtn, 'ar-datepicker-nav');
        this.nextBtn.setAttribute('aria-label', 'Next month');
        this.nextBtn.innerHTML = '<span class="icon-chevron-right" aria-hidden="true"></span>';
        this.nextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self.navigateMonth(1);
        });
        
        this.header.appendChild(this.prevBtn);
        this.header.appendChild(this.selectors);
        this.header.appendChild(this.nextBtn);
        
        // Calendar grid
        this.grid = document.createElement('div');
        addClass(this.grid, 'ar-datepicker-grid');
        this.grid.setAttribute('role', 'grid');
        
        // Day headers
        this.dayHeaders = document.createElement('div');
        addClass(this.dayHeaders, 'ar-datepicker-days');
        var dayNames = this.options.sundayStart ? DAY_NAMES_SHORT_SUNDAY : DAY_NAMES_SHORT;
        for (var d = 0; d < 7; d++) {
            var dayHeader = document.createElement('div');
            addClass(dayHeader, 'ar-datepicker-day-header');
            dayHeader.textContent = dayNames[d];
            this.dayHeaders.appendChild(dayHeader);
        }
        
        // Dates container
        this.datesContainer = document.createElement('div');
        addClass(this.datesContainer, 'ar-datepicker-dates');
        this.datesContainer.setAttribute('role', 'rowgroup');
        
        this.grid.appendChild(this.dayHeaders);
        this.grid.appendChild(this.datesContainer);
        
        this.popup.appendChild(this.header);
        this.popup.appendChild(this.grid);
        
        this.renderCalendar();
    };
    
    AR.DatePicker.prototype.populateYears = function() {
        var currentYear = new Date().getFullYear();
        var startYear = currentYear - 100;
        var endYear = currentYear + 10;
        
        this.yearSelect.innerHTML = '';
        for (var y = startYear; y <= endYear; y++) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            this.yearSelect.appendChild(opt);
        }
    };
    
    AR.DatePicker.prototype.renderCalendar = function() {
        var self = this;
        var year = this.viewDate.getFullYear();
        var month = this.viewDate.getMonth();
        
        // Update selectors
        this.monthSelect.value = month;
        this.yearSelect.value = year;
        
        // Clear dates
        this.datesContainer.innerHTML = '';
        
        var daysInMonth = getDaysInMonth(year, month);
        var firstDay = new Date(year, month, 1);
        var startOffset = getDayOfWeek(firstDay, this.options.sundayStart);
        
        // Previous month padding
        var prevMonth = month === 0 ? 11 : month - 1;
        var prevYear = month === 0 ? year - 1 : year;
        var daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
        
        for (var p = startOffset - 1; p >= 0; p--) {
            var prevDate = new Date(prevYear, prevMonth, daysInPrevMonth - p);
            this.createDateCell(prevDate, true);
        }
        
        // Current month days
        for (var d = 1; d <= daysInMonth; d++) {
            var date = new Date(year, month, d);
            this.createDateCell(date, false);
        }
        
        // Next month padding to complete grid
        var totalCells = this.datesContainer.children.length;
        var remaining = 42 - totalCells; // 6 rows * 7 days
        var nextMonth = month === 11 ? 0 : month + 1;
        var nextYear = month === 11 ? year + 1 : year;
        
        for (var n = 1; n <= remaining; n++) {
            var nextDate = new Date(nextYear, nextMonth, n);
            this.createDateCell(nextDate, true);
        }
    };
    
    AR.DatePicker.prototype.createDateCell = function(date, isOtherMonth) {
        var self = this;
        var cell = document.createElement('button');
        cell.type = 'button';
        addClass(cell, 'ar-datepicker-date');
        cell.textContent = date.getDate();
        cell.setAttribute('data-date', formatDate(date));
        cell.setAttribute('role', 'gridcell');
        
        if (isOtherMonth) {
            addClass(cell, 'other-month');
        }
        
        if (isSameDay(date, this.selectedDate)) {
            addClass(cell, 'selected');
            cell.setAttribute('aria-selected', 'true');
        }
        
        if (isSameDay(date, new Date())) {
            addClass(cell, 'today');
        }
        
        // Check min/max constraints
        var disabled = false;
        if (this.options.minDate && date < this.options.minDate) {
            disabled = true;
        }
        if (this.options.maxDate && date > this.options.maxDate) {
            disabled = true;
        }
        
        if (disabled) {
            cell.disabled = true;
            addClass(cell, 'disabled');
        }
        
        cell.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) {
                self.selectDate(date);
            }
        });
        
        this.datesContainer.appendChild(cell);
    };
    
    AR.DatePicker.prototype.selectDate = function(date) {
        this.selectedDate = date;
        this.input.value = formatDate(date);
        this.renderCalendar();
        this.close();
        
        if (this.options.onChange) {
            this.options.onChange(date);
        }
        
        // Trigger change event on input
        var event = new Event('change', { bubbles: true });
        this.input.dispatchEvent(event);
    };
    
    AR.DatePicker.prototype.navigateMonth = function(delta) {
        this.viewDate.setMonth(this.viewDate.getMonth() + delta);
        this.renderCalendar();
    };
    
    AR.DatePicker.prototype.handleKeydown = function(e) {
        var self = this;
        
        // Type-ahead for months
        if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
            e.preventDefault();
            this.typeAheadBuffer += e.key;
            
            clearTimeout(this.typeAheadTimeout);
            this.typeAheadTimeout = setTimeout(function() {
                self.typeAheadBuffer = '';
            }, 500);
            
            var monthIndex = findMonthByTypeAhead(this.typeAheadBuffer);
            if (monthIndex !== -1) {
                this.viewDate.setMonth(monthIndex);
                this.renderCalendar();
            }
            return;
        }
        
        switch (e.key) {
            case 'Escape':
                this.close();
                this.input.focus();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.viewDate.setDate(this.viewDate.getDate() - 1);
                this.renderCalendar();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.viewDate.setDate(this.viewDate.getDate() + 1);
                this.renderCalendar();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.viewDate.setDate(this.viewDate.getDate() - 7);
                this.renderCalendar();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.viewDate.setDate(this.viewDate.getDate() + 7);
                this.renderCalendar();
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                this.selectDate(new Date(this.viewDate));
                break;
        }
    };
    
    AR.DatePicker.prototype.open = function() {
        if (this.isOpen) return;
        this.isOpen = true;
        addClass(this.popup, 'open');
        this.popup.focus();
    };
    
    AR.DatePicker.prototype.close = function() {
        if (!this.isOpen) return;
        this.isOpen = false;
        removeClass(this.popup, 'open');
    };
    
    AR.DatePicker.prototype.toggle = function() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    };

    AR.DatePicker.prototype.destroy = function() {
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler);
            this._outsideClickHandler = null;
        }
        this.close();
    };

    // ============================================================================
    // RANGE PICKER
    // ============================================================================
    
    /**
     * Default presets for range picker
     */
    var DEFAULT_PRESETS = [
        { label: 'Today', getValue: function() { var t = new Date(); return { start: t, end: t }; }},
        { label: 'Yesterday', getValue: function() { var d = new Date(); d.setDate(d.getDate() - 1); return { start: d, end: d }; }},
        { label: 'Tomorrow', getValue: function() { var d = new Date(); d.setDate(d.getDate() + 1); return { start: d, end: d }; }},
        { label: 'Last 7 days', getValue: function() { var e = new Date(); var s = new Date(); s.setDate(s.getDate() - 7); return { start: s, end: e }; }},
        { label: 'Next 7 days', getValue: function() { var s = new Date(); var e = new Date(); e.setDate(e.getDate() + 7); return { start: s, end: e }; }}
    ];
    
    /**
     * AR.RangePicker - Date range selection with two calendars
     * @param {string|HTMLElement} selector - Container element or selector
     * @param {Object} options - Configuration options
     */
    AR.RangePicker = function(selector, options) {
        this.container = getElement(selector);
        if (!this.container) {
            throw new Error('RangePicker container not found: ' + selector);
        }
        
        options = options || {};
        this.options = {
            minDate: options.minDate ? parseDate(options.minDate) : null,
            maxDate: options.maxDate ? parseDate(options.maxDate) : null,
            sundayStart: options.sundayStart || false,
            presets: options.presets !== undefined ? options.presets : DEFAULT_PRESETS,
            onChange: options.onChange || null
        };
        
        this.startDate = null;
        this.endDate = null;
        this.selectingEnd = false; // true when start is selected, waiting for end
        
        // View dates for left and right calendars
        this.leftViewDate = new Date();
        this.rightViewDate = new Date();
        this.rightViewDate.setMonth(this.rightViewDate.getMonth() + 1);
        
        this.isOpen = false;
        this.typeAheadBuffer = '';
        this.typeAheadTimeout = null;
        this.activeCalendar = 'left'; // which calendar has focus for type-ahead
        
        this.init();
    };
    
    AR.RangePicker.prototype.init = function() {
        var self = this;
        
        // Create wrapper
        addClass(this.container, 'ar-rangepicker-wrapper');
        
        // Create display input
        this.display = document.createElement('div');
        addClass(this.display, 'ar-rangepicker-display');
        this.display.setAttribute('tabindex', '0');
        this.display.setAttribute('role', 'button');
        this.display.setAttribute('aria-label', 'Select date range');
        this.updateDisplay();
        this.container.appendChild(this.display);
        
        // Create popup
        this.popup = document.createElement('div');
        addClass(this.popup, 'ar-rangepicker-popup');
        this.popup.setAttribute('role', 'dialog');
        this.popup.setAttribute('aria-label', 'Choose date range');
        this.container.appendChild(this.popup);
        
        // Build structure
        this.buildRangePicker();
        
        // Event listeners
        this.display.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self.toggle();
        });
        
        this.display.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                self.toggle();
            }
        });
        
        // Close on outside click
        this._outsideClickHandler = function(e) {
            if (self.isOpen && !self.container.contains(e.target)) {
                self.close();
            }
        };
        document.addEventListener('click', this._outsideClickHandler);
    };
    
    AR.RangePicker.prototype.buildRangePicker = function() {
        var self = this;
        
        // Main content area
        this.content = document.createElement('div');
        addClass(this.content, 'ar-rangepicker-content');
        
        // Presets sidebar (if configured)
        if (this.options.presets && this.options.presets.length > 0) {
            this.presetsSidebar = document.createElement('div');
            addClass(this.presetsSidebar, 'ar-rangepicker-presets');
            
            var presetsLabel = document.createElement('div');
            addClass(presetsLabel, 'ar-rangepicker-presets-label');
            presetsLabel.textContent = 'Quick Select';
            this.presetsSidebar.appendChild(presetsLabel);
            
            for (var i = 0; i < this.options.presets.length; i++) {
                (function(preset) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    addClass(btn, 'ar-rangepicker-preset');
                    btn.textContent = preset.label;
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var range = preset.getValue();
                        self.setRange(range.start, range.end);
                        self.close();
                    });
                    self.presetsSidebar.appendChild(btn);
                })(this.options.presets[i]);
            }
            
            this.content.appendChild(this.presetsSidebar);
        }
        
        // Calendars container
        this.calendarsContainer = document.createElement('div');
        addClass(this.calendarsContainer, 'ar-rangepicker-calendars');
        
        // Left calendar
        this.leftCalendar = this.buildCalendar('left');
        this.calendarsContainer.appendChild(this.leftCalendar.element);
        
        // Right calendar
        this.rightCalendar = this.buildCalendar('right');
        this.calendarsContainer.appendChild(this.rightCalendar.element);
        
        this.content.appendChild(this.calendarsContainer);
        this.popup.appendChild(this.content);
        
        // Initial render
        this.renderCalendars();
    };
    
    AR.RangePicker.prototype.buildCalendar = function(side) {
        var self = this;
        var calendar = {
            side: side,
            element: document.createElement('div')
        };
        
        addClass(calendar.element, 'ar-rangepicker-calendar');
        addClass(calendar.element, 'ar-rangepicker-calendar-' + side);
        
        // Header
        calendar.header = document.createElement('div');
        addClass(calendar.header, 'ar-datepicker-header');
        
        // Prev button (only on left calendar)
        if (side === 'left') {
            calendar.prevBtn = document.createElement('button');
            calendar.prevBtn.type = 'button';
            addClass(calendar.prevBtn, 'ar-datepicker-nav');
            calendar.prevBtn.setAttribute('aria-label', 'Previous month');
            calendar.prevBtn.innerHTML = '<span class="icon-chevron-left" aria-hidden="true"></span>';
            calendar.prevBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.navigateMonth(-1);
            });
            calendar.header.appendChild(calendar.prevBtn);
        } else {
            // Spacer for right calendar
            var spacer = document.createElement('div');
            addClass(spacer, 'ar-datepicker-nav-spacer');
            calendar.header.appendChild(spacer);
        }
        
        // Selectors
        calendar.selectors = document.createElement('div');
        addClass(calendar.selectors, 'ar-datepicker-selectors');
        
        // Month dropdown
        calendar.monthSelect = document.createElement('select');
        addClass(calendar.monthSelect, 'ar-datepicker-month');
        calendar.monthSelect.setAttribute('aria-label', 'Select month');
        for (var i = 0; i < 12; i++) {
            var opt = document.createElement('option');
            opt.value = i;
            opt.textContent = MONTH_NAMES[i];
            calendar.monthSelect.appendChild(opt);
        }
        calendar.monthSelect.addEventListener('change', function() {
            var viewDate = side === 'left' ? self.leftViewDate : self.rightViewDate;
            viewDate.setMonth(parseInt(calendar.monthSelect.value));
            self.syncCalendars(side);
            self.renderCalendars();
        });
        calendar.monthSelect.addEventListener('focus', function() {
            self.activeCalendar = side;
        });
        
        // Year dropdown
        calendar.yearSelect = document.createElement('select');
        addClass(calendar.yearSelect, 'ar-datepicker-year');
        calendar.yearSelect.setAttribute('aria-label', 'Select year');
        var currentYear = new Date().getFullYear();
        for (var y = currentYear - 100; y <= currentYear + 10; y++) {
            var yopt = document.createElement('option');
            yopt.value = y;
            yopt.textContent = y;
            calendar.yearSelect.appendChild(yopt);
        }
        calendar.yearSelect.addEventListener('change', function() {
            var viewDate = side === 'left' ? self.leftViewDate : self.rightViewDate;
            viewDate.setFullYear(parseInt(calendar.yearSelect.value));
            self.syncCalendars(side);
            self.renderCalendars();
        });
        calendar.yearSelect.addEventListener('focus', function() {
            self.activeCalendar = side;
        });
        
        calendar.selectors.appendChild(calendar.monthSelect);
        calendar.selectors.appendChild(calendar.yearSelect);
        calendar.header.appendChild(calendar.selectors);
        
        // Next button (only on right calendar)
        if (side === 'right') {
            calendar.nextBtn = document.createElement('button');
            calendar.nextBtn.type = 'button';
            addClass(calendar.nextBtn, 'ar-datepicker-nav');
            calendar.nextBtn.setAttribute('aria-label', 'Next month');
            calendar.nextBtn.innerHTML = '<span class="icon-chevron-right" aria-hidden="true"></span>';
            calendar.nextBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.navigateMonth(1);
            });
            calendar.header.appendChild(calendar.nextBtn);
        } else {
            // Spacer for left calendar
            var spacer2 = document.createElement('div');
            addClass(spacer2, 'ar-datepicker-nav-spacer');
            calendar.header.appendChild(spacer2);
        }
        
        calendar.element.appendChild(calendar.header);
        
        // Grid
        calendar.grid = document.createElement('div');
        addClass(calendar.grid, 'ar-datepicker-grid');
        
        // Day headers
        calendar.dayHeaders = document.createElement('div');
        addClass(calendar.dayHeaders, 'ar-datepicker-days');
        var dayNames = this.options.sundayStart ? DAY_NAMES_SHORT_SUNDAY : DAY_NAMES_SHORT;
        for (var d = 0; d < 7; d++) {
            var dayHeader = document.createElement('div');
            addClass(dayHeader, 'ar-datepicker-day-header');
            dayHeader.textContent = dayNames[d];
            calendar.dayHeaders.appendChild(dayHeader);
        }
        
        // Dates container
        calendar.datesContainer = document.createElement('div');
        addClass(calendar.datesContainer, 'ar-datepicker-dates');
        
        calendar.grid.appendChild(calendar.dayHeaders);
        calendar.grid.appendChild(calendar.datesContainer);
        calendar.element.appendChild(calendar.grid);
        
        // Keyboard handler
        calendar.element.addEventListener('keydown', function(e) {
            self.handleKeydown(e, side);
        });
        
        return calendar;
    };
    
    AR.RangePicker.prototype.syncCalendars = function(changedSide) {
        // Ensure right is always at least one month after left
        if (changedSide === 'left') {
            var leftTime = this.leftViewDate.getTime();
            var rightTime = this.rightViewDate.getTime();
            if (rightTime <= leftTime) {
                this.rightViewDate = new Date(this.leftViewDate);
                this.rightViewDate.setMonth(this.rightViewDate.getMonth() + 1);
            }
        } else {
            var leftTime2 = this.leftViewDate.getTime();
            var rightTime2 = this.rightViewDate.getTime();
            if (leftTime2 >= rightTime2) {
                this.leftViewDate = new Date(this.rightViewDate);
                this.leftViewDate.setMonth(this.leftViewDate.getMonth() - 1);
            }
        }
    };
    
    AR.RangePicker.prototype.renderCalendars = function() {
        this.renderSingleCalendar(this.leftCalendar, this.leftViewDate);
        this.renderSingleCalendar(this.rightCalendar, this.rightViewDate);
    };
    
    AR.RangePicker.prototype.renderSingleCalendar = function(calendar, viewDate) {
        var self = this;
        var year = viewDate.getFullYear();
        var month = viewDate.getMonth();
        
        // Update selectors
        calendar.monthSelect.value = month;
        calendar.yearSelect.value = year;
        
        // Clear dates
        calendar.datesContainer.innerHTML = '';
        
        var daysInMonth = getDaysInMonth(year, month);
        var firstDay = new Date(year, month, 1);
        var startOffset = getDayOfWeek(firstDay, this.options.sundayStart);
        
        // Previous month padding
        var prevMonth = month === 0 ? 11 : month - 1;
        var prevYear = month === 0 ? year - 1 : year;
        var daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
        
        for (var p = startOffset - 1; p >= 0; p--) {
            var prevDate = new Date(prevYear, prevMonth, daysInPrevMonth - p);
            this.createRangeDateCell(calendar, prevDate, true);
        }
        
        // Current month days
        for (var d = 1; d <= daysInMonth; d++) {
            var date = new Date(year, month, d);
            this.createRangeDateCell(calendar, date, false);
        }
        
        // Next month padding
        var totalCells = calendar.datesContainer.children.length;
        var remaining = 42 - totalCells;
        var nextMonth = month === 11 ? 0 : month + 1;
        var nextYear = month === 11 ? year + 1 : year;
        
        for (var n = 1; n <= remaining; n++) {
            var nextDate = new Date(nextYear, nextMonth, n);
            this.createRangeDateCell(calendar, nextDate, true);
        }
    };
    
    AR.RangePicker.prototype.createRangeDateCell = function(calendar, date, isOtherMonth) {
        var self = this;
        var cell = document.createElement('button');
        cell.type = 'button';
        addClass(cell, 'ar-datepicker-date');
        cell.textContent = date.getDate();
        cell.setAttribute('data-date', formatDate(date));
        
        if (isOtherMonth) {
            addClass(cell, 'other-month');
        }
        
        // Selection states
        if (isSameDay(date, this.startDate)) {
            addClass(cell, 'range-start');
            addClass(cell, 'selected');
        }
        
        if (isSameDay(date, this.endDate)) {
            addClass(cell, 'range-end');
            addClass(cell, 'selected');
        }
        
        if (this.startDate && this.endDate && isInRange(date, this.startDate, this.endDate)) {
            addClass(cell, 'in-range');
        }
        
        if (isSameDay(date, new Date())) {
            addClass(cell, 'today');
        }
        
        // Min/max constraints
        var disabled = false;
        if (this.options.minDate && date < this.options.minDate) {
            disabled = true;
        }
        if (this.options.maxDate && date > this.options.maxDate) {
            disabled = true;
        }
        
        if (disabled) {
            cell.disabled = true;
            addClass(cell, 'disabled');
        }
        
        cell.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) {
                self.handleDateClick(date);
            }
        });
        
        calendar.datesContainer.appendChild(cell);
    };
    
    AR.RangePicker.prototype.handleDateClick = function(date) {
        if (!this.selectingEnd || !this.startDate) {
            // Selecting start date
            this.startDate = date;
            this.endDate = null;
            this.selectingEnd = true;
        } else {
            // Selecting end date
            if (date < this.startDate) {
                // If clicked date is before start, swap
                this.endDate = this.startDate;
                this.startDate = date;
            } else {
                this.endDate = date;
            }
            this.selectingEnd = false;
            
            // Close popup after range is complete
            this.updateDisplay();
            this.renderCalendars();
            
            if (this.options.onChange) {
                this.options.onChange(this.startDate, this.endDate);
            }
            
            this.close();
            return;
        }
        
        this.updateDisplay();
        this.renderCalendars();
    };
    
    AR.RangePicker.prototype.setRange = function(start, end) {
        this.startDate = start;
        this.endDate = end;
        this.selectingEnd = false;
        
        // Update view to show the range
        this.leftViewDate = new Date(start);
        this.rightViewDate = new Date(start);
        this.rightViewDate.setMonth(this.rightViewDate.getMonth() + 1);
        
        this.updateDisplay();
        this.renderCalendars();
        
        if (this.options.onChange) {
            this.options.onChange(this.startDate, this.endDate);
        }
    };
    
    AR.RangePicker.prototype.updateDisplay = function() {
        if (this.startDate && this.endDate) {
            this.display.textContent = formatDateDisplay(this.startDate) + ' – ' + formatDateDisplay(this.endDate);
        } else if (this.startDate) {
            this.display.textContent = formatDateDisplay(this.startDate) + ' – Select end date';
        } else {
            this.display.textContent = 'Select date range';
        }
    };
    
    AR.RangePicker.prototype.navigateMonth = function(delta) {
        this.leftViewDate.setMonth(this.leftViewDate.getMonth() + delta);
        this.rightViewDate.setMonth(this.rightViewDate.getMonth() + delta);
        this.renderCalendars();
    };
    
    AR.RangePicker.prototype.handleKeydown = function(e, side) {
        var self = this;
        
        // Type-ahead for months
        if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
            e.preventDefault();
            this.typeAheadBuffer += e.key;
            
            clearTimeout(this.typeAheadTimeout);
            this.typeAheadTimeout = setTimeout(function() {
                self.typeAheadBuffer = '';
            }, 500);
            
            var monthIndex = findMonthByTypeAhead(this.typeAheadBuffer);
            if (monthIndex !== -1) {
                var viewDate = side === 'left' ? this.leftViewDate : this.rightViewDate;
                viewDate.setMonth(monthIndex);
                this.syncCalendars(side);
                this.renderCalendars();
            }
            return;
        }
        
        if (e.key === 'Escape') {
            this.close();
            this.display.focus();
        }
    };
    
    AR.RangePicker.prototype.open = function() {
        if (this.isOpen) return;
        this.isOpen = true;
        addClass(this.popup, 'open');
    };
    
    AR.RangePicker.prototype.close = function() {
        if (!this.isOpen) return;
        this.isOpen = false;
        removeClass(this.popup, 'open');
        this.selectingEnd = false; // Reset selection state
    };
    
    AR.RangePicker.prototype.toggle = function() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    };
    
    AR.RangePicker.prototype.getRange = function() {
        return {
            start: this.startDate,
            end: this.endDate
        };
    };

    AR.RangePicker.prototype.destroy = function() {
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler);
            this._outsideClickHandler = null;
        }
        this.close();
    };

    // ============================================================================
    // EXPORT
    // ============================================================================
    
    window.AR = AR;
    
})(window);
