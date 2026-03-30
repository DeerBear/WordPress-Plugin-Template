/**
 * AR.DataGrid.js
 * Pure JavaScript Data Grid Component
 * No dependencies, no NPM, no Node.js
 * 
 * Features (Phase 1 - Basic):
 * - Semantic <table> based
 * - JSON data loading (1-based column indexes)
 * - Row hover highlighting
 * - Read-only display
 */
/* AR.DataGrid.js (MVVM-based, wired to MVVM.js) */
(function (window) {
    'use strict';

    var AR = window.AR || {};
    var MVVM = window.MVVM;
    if (!MVVM) {
        throw new Error('AR.DataGrid requires MVVM.js to be loaded (window.MVVM).');
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    function addClass(el, cls) {
        if (!el) return;
        if (el.classList) el.classList.add(cls);
        else if (!hasClass(el, cls)) el.className += ' ' + cls;
    }

    function removeClass(el, cls) {
        if (!el) return;
        if (el.classList) el.classList.remove(cls);
        else {
            el.className = el.className.replace(
                new RegExp('(^|\\b)' + cls.split(' ').join('|') + '(\\b|$)', 'gi'),
                ' '
            );
        }
    }

    function hasClass(el, cls) {
        if (!el) return false;
        if (el.classList) return el.classList.contains(cls);
        return new RegExp('(^| )' + cls + '( |$)', 'gi').test(el.className);
    }

    function getElement(selector) {
        if (typeof selector === 'string') return document.querySelector(selector);
        return selector;
    }

    function parseNumericValue(val) {
        if (typeof val === 'number') return val;
        if (typeof val !== 'string') return null;
        var cleaned = val.replace(/[$€£¥,\s]/g, '');
        if (!cleaned || isNaN(cleaned)) return null;
        return parseFloat(cleaned);
    }

    // =========================================================================
    // AR.DataGrid
    // =========================================================================

    AR.DataGrid = function (selector, options) {
        this.table = getElement(selector);
        if (!this.table) throw new Error('DataGrid: table element not found: ' + selector);
        if (this.table.tagName.toUpperCase() !== 'TABLE') {
            throw new Error('DataGrid: element must be a <table>');
        }

        this.options = {
            rowCapDefault: 100,
            rowCapFirst: 200
        };
        if (options) {
            for (var k in options) {
                if (options.hasOwnProperty(k)) this.options[k] = options[k];
            }
        }

        this.columns = [];
        this.tbody = null;
        this.tfoot = null;
        this.scrollContainer = null;
        this.hasNavigation = this.table.getAttribute('navigation') === 'true';

        // NEW: keep track of linked charts (artifact)
        // Each entry: { chart: chartInstance, mapping: function(vm, chart) {} }
        this._linkedCharts = [];

        // If external ViewModel is given, use it; otherwise create our own
        if (options && options.viewModel) {
            this._vm = options.viewModel;
            this._ownVm = false;
        } else {
            try {
                this._vm = this._createViewModel();
                this._ownVm = true;
            } catch (e) {
                console.error('DataGrid: Failed to create ViewModel:', e);
                throw new Error('DataGrid: ViewModel creation failed - ' + e.message);
            }
        }

        if (!this._vm) {
            throw new Error('DataGrid: ViewModel is null after creation');
        }

        this.init();
    };

    // -------------------------------------------------------------------------
    // ViewModel creation (using MVVM.ViewModel & MVVM.Computed)
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype._createViewModel = function () {
        var self = this;

        // Verify MVVM is available
        if (!MVVM || !MVVM.ViewModel) {
            throw new Error('MVVM.ViewModel is not available. Check script load order.');
        }

        // Base config for ViewModel (non-computed)
        var config = {
            data: [],                 // ObservableArray
            columns: [],              // ObservableArray
            sortColumn: null,         // Observable (1-based index)
            sortDirection: null,      // 'asc' | 'desc' | null
            groupByColumn: null,      // Observable (1-based index)
            groupByDirection: null,   // 'asc' | 'desc' | null
            isGrouped: false,         // Observable
            groups: [],               // ObservableArray
            collapsedGroups: {},      // Observable
            displayedRowCount: 0,     // Observable
            currentRowIndex: 0        // Observable
        };

        var vm = new MVVM.ViewModel(config);

        // Attach computeds using MVVM.Computed so we get real change tracking.
        vm.totalRowCount = MVVM.Computed(function () {
            return vm.data.getValue().length;
        }, [vm.data]);

        vm.isEmpty = MVVM.Computed(function () {
            return vm.data.getValue().length === 0;
        }, [vm.data]);

        vm.hasMoreRows = MVVM.Computed(function () {
            return vm.displayedRowCount.getValue() < vm.data.getValue().length;
        }, [vm.displayedRowCount, vm.data]);

        vm.effectiveRows = MVVM.Computed(function () {
            if (!vm.isGrouped.getValue() || vm.groups.getValue().length === 0) {
                return vm.data.getValue();
            }
            var result = [];
            var groups = vm.groups.getValue();
            for (var g = 0; g < groups.length; g++) {
                var group = groups[g];
                var rows = group.rows || [];
                for (var i = 0; i < rows.length; i++) result.push(rows[i]);
            }
            return result;
        }, [vm.data, vm.groups, vm.isGrouped]);

        // Subscriptions
        vm.data.subscribe(function () {
            self._onDataChanged();
        });
        vm.sortColumn.subscribe(function () {
            self._onSortChanged();
        });
        vm.sortDirection.subscribe(function () {
            self._onSortChanged();
        });
        vm.groupByColumn.subscribe(function () {
            self._onGroupConfigChanged();
        });
        vm.groupByDirection.subscribe(function () {
            self._onGroupConfigChanged();
        });
        vm.isGrouped.subscribe(function () {
            self._onGroupConfigChanged();
        });
        vm.collapsedGroups.subscribe(function () {
            if (vm.isGrouped.getValue()) {
                self.render();
                self._notifyLinkedCharts(); // NEW: keep charts in sync when groups expand/collapse
            }
        });
        vm.displayedRowCount.subscribe(function () {
            self._onDisplayedRowCountChanged();
        });
        vm.currentRowIndex.subscribe(function () {
            self._onCurrentRowChanged();
        });

        return vm;
    };

    AR.DataGrid.prototype.getViewModel = function () {
        return this._vm;
    };

    // -------------------------------------------------------------------------
    // NEW: Chart linking API
    // -------------------------------------------------------------------------

    /**
     * Link a chart instance to this grid.
     *
     * @param {AR.Chart} chartInstance - The chart to link.
     * @param {Function} [mapping] - Optional mapping callback (vm, chart).
     *        Use this to call chart.setData / chart.setOptions / etc based on the grid VM.
     *        If omitted and chart has setViewModel(vm), the grid will call that once.
     */
    AR.DataGrid.prototype.linkChart = function (chartInstance, mapping) {
        if (!chartInstance) return;

        // Avoid duplicates
        for (var i = 0; i < this._linkedCharts.length; i++) {
            if (this._linkedCharts[i].chart === chartInstance) {
                // Update mapping if provided
                if (typeof mapping === 'function') {
                    this._linkedCharts[i].mapping = mapping;
                    mapping(this._vm, chartInstance);
                }
                return;
            }
        }

        var entry = {
            chart: chartInstance,
            mapping: typeof mapping === 'function' ? mapping : null
        };
        this._linkedCharts.push(entry);

        // If chart supports MVVM-style linking, give it the same ViewModel
        if (typeof chartInstance.setViewModel === 'function') {
            chartInstance.setViewModel(this._vm);
        }

        // Run mapping once initially so chart shows current state
        if (entry.mapping) {
            entry.mapping(this._vm, chartInstance);
        }
    };

    /**
     * Unlink a specific chart instance from this grid.
     */
    AR.DataGrid.prototype.unlinkChart = function (chartInstance) {
        if (!chartInstance) return;
        var next = [];
        for (var i = 0; i < this._linkedCharts.length; i++) {
            if (this._linkedCharts[i].chart !== chartInstance) {
                next.push(this._linkedCharts[i]);
            }
        }
        this._linkedCharts = next;
    };

    /**
     * Unlink all charts from this grid.
     */
    AR.DataGrid.prototype.unlinkAllCharts = function () {
        this._linkedCharts = [];
    };

    /**
     * Internal: notify all linked charts that the VM / data / grouping has changed.
     * This does not assume any particular chart API beyond the mapping callback.
     */
    AR.DataGrid.prototype._notifyLinkedCharts = function () {
        if (!this._vm) return;
        if (!this._linkedCharts || this._linkedCharts.length === 0) return;
        var vm = this._vm;
        for (var i = 0; i < this._linkedCharts.length; i++) {
            var entry = this._linkedCharts[i];
            if (!entry || !entry.chart) continue;

            // If a mapping function was provided, use it as the "artifact"
            // to express the data contract between grid VM and chart.
            if (typeof entry.mapping === 'function') {
                entry.mapping(vm, entry.chart);
            } else {
                // Fallback: if chart has setData and expects flat array
                if (typeof entry.chart.setData === 'function') {
                    entry.chart.setData(vm.effectiveRows.getValue ?
                        vm.effectiveRows.getValue() :
                        vm.data.getValue()
                    );
                }
            }
        }
    };

    // -------------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype.init = function () {
        addClass(this.table, 'ar-datagrid');
        this.setupScrollContainer();
        this.parseColumns();
        this.ensureTbody();
        if (this.hasNavigation) {
            this.setupNavigation();
        }
        this.setupSorting();
        this.setupAccessibility();
        this.setupKeyboard();
        this.setupEdgeScroll();
    };

    AR.DataGrid.prototype.setupScrollContainer = function () {
        if (this.table.parentElement && hasClass(this.table.parentElement, 'ar-datagrid-container')) {
            this.scrollContainer = this.table.parentElement;
            return;
        }
        this.scrollContainer = document.createElement('div');
        addClass(this.scrollContainer, 'ar-datagrid-container');
        this.table.parentNode.insertBefore(this.scrollContainer, this.table);
        this.scrollContainer.appendChild(this.table);
    };

    AR.DataGrid.prototype.setupEdgeScroll = function () {
        var self = this;
        var scrollSpeed = 5;
        var edgeThreshold = 50;
        var scrollInterval = null;

        function updateScrollIndicators() {
            var containerWidth = self.scrollContainer.clientWidth;
            var maxScrollLeft = self.scrollContainer.scrollWidth - containerWidth;
            var currentScroll = self.scrollContainer.scrollLeft;

            if (currentScroll > 0) addClass(self.scrollContainer, 'can-scroll-left');
            else removeClass(self.scrollContainer, 'can-scroll-left');

            if (currentScroll < maxScrollLeft - 1) addClass(self.scrollContainer, 'can-scroll-right');
            else removeClass(self.scrollContainer, 'can-scroll-right');
        }

        updateScrollIndicators();
        this.scrollContainer.addEventListener('scroll', updateScrollIndicators);
        window.addEventListener('resize', updateScrollIndicators);

        this.scrollContainer.addEventListener('mousemove', function (e) {
            var rect = self.scrollContainer.getBoundingClientRect();
            var mouseX = e.clientX - rect.left;
            var width = rect.width;
            var maxScrollLeft = self.scrollContainer.scrollWidth - width;
            var currentScroll = self.scrollContainer.scrollLeft;

            var nearLeft = mouseX < edgeThreshold && currentScroll > 0;
            var nearRight = mouseX > width - edgeThreshold && currentScroll < maxScrollLeft;

            if (scrollInterval) {
                clearInterval(scrollInterval);
                scrollInterval = null;
            }

            if (nearLeft) {
                scrollInterval = setInterval(function () {
                    self.scrollContainer.scrollLeft -= scrollSpeed;
                    if (self.scrollContainer.scrollLeft <= 0) {
                        clearInterval(scrollInterval);
                        scrollInterval = null;
                    }
                }, 16);
            } else if (nearRight) {
                scrollInterval = setInterval(function () {
                    self.scrollContainer.scrollLeft += scrollSpeed;
                    var max = self.scrollContainer.scrollWidth - self.scrollContainer.clientWidth;
                    if (self.scrollContainer.scrollLeft >= max) {
                        clearInterval(scrollInterval);
                        scrollInterval = null;
                    }
                }, 16);
            }
        });

        this.scrollContainer.addEventListener('mouseleave', function () {
            if (scrollInterval) {
                clearInterval(scrollInterval);
                scrollInterval = null;
            }
        });
    };

    AR.DataGrid.prototype.parseColumns = function () {
        var thead = this.table.querySelector('thead');
        if (!thead) throw new Error('DataGrid: <thead> required');
        var headerRow = thead.querySelector('tr');
        if (!headerRow) throw new Error('DataGrid: <thead><tr> required');

        var ths = headerRow.querySelectorAll('th');
        this.columns = [];

        for (var i = 0; i < ths.length; i++) {
            var th = ths[i];
            var groupByAttr = th.getAttribute('col-is-group-by');
            var col = {
                index: i + 1,
                element: th,
                label: th.textContent.trim(),
                isDate: th.getAttribute('col-is-date') === 'true',
                groupBy: groupByAttr   // 'asc'|'desc'|null
            };
            this.columns.push(col);

            if (groupByAttr) {
                this._vm.groupByColumn.setValue(col.index);
                this._vm.groupByDirection.setValue(groupByAttr);
            }
        }
        this._vm.columns.setValue(this.columns.slice());
    };

    AR.DataGrid.prototype.ensureTbody = function () {
        this.tbody = this.table.querySelector('tbody');
        if (!this.tbody) {
            this.tbody = document.createElement('tbody');
            this.table.appendChild(this.tbody);
        }
    };

    AR.DataGrid.prototype.setupAccessibility = function () {
        this.table.setAttribute('role', 'grid');
        this.table.setAttribute('aria-readonly', 'true');

        for (var i = 0; i < this.columns.length; i++) {
            var th = this.columns[i].element;
            th.setAttribute('role', 'columnheader');
            th.setAttribute('scope', 'col');
        }
    };

    // -------------------------------------------------------------------------
    // Sorting & Grouping UI
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype.setupSorting = function () {
        var self = this;

        for (var i = 0; i < this.columns.length; i++) {
            (function (col) {
                var th = col.element;

                addClass(th, 'datagrid-sortable');

                // Pin (group by) icon
                var pinIcon = document.createElement('span');
                addClass(pinIcon, 'datagrid-pin-icon');
                addClass(pinIcon, 'icon-pin-asc');
                pinIcon.setAttribute('title', 'Click to group by this column');
                pinIcon.setAttribute('role', 'button');
                pinIcon.setAttribute('tabindex', '0');
                pinIcon.setAttribute('aria-label', 'Group by ' + col.label);
                th.appendChild(pinIcon);
                col.pinIcon = pinIcon;

                pinIcon.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.handlePinClick(col.index);
                });
                pinIcon.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        self.handlePinClick(col.index);
                    }
                });

                // Sort icon
                var sortIcon = document.createElement('span');
                addClass(sortIcon, 'datagrid-sort-icon');
                sortIcon.setAttribute('aria-hidden', 'true');
                th.appendChild(sortIcon);
                col.sortIcon = sortIcon;

                th.setAttribute('aria-sort', 'none');
                th.style.cursor = 'pointer';
                th.setAttribute('tabindex', '0');

                th.addEventListener('click', function (e) {
                    e.preventDefault();
                    self.sortByColumn(col.index);
                });
                th.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        self.sortByColumn(col.index);
                    }
                });
            })(this.columns[i]);
        }

        this.updatePinStates();
    };

    AR.DataGrid.prototype.handlePinClick = function (colIndex) {
        var vm = this._vm;
        var gbCol = vm.groupByColumn.getValue();
        var isGrouped = vm.isGrouped.getValue();

        if (gbCol === colIndex) {
            if (isGrouped) {
                this.toggleGroupOrder();
            } else {
                this.enableGrouping();
            }
        } else {
            this.setGroupByColumn(colIndex);
        }
    };

    AR.DataGrid.prototype.setGroupByColumn = function (colIndex) {
        var col = this.getColumnByIndex(colIndex);
        if (!col) return;

        var vm = this._vm;
        vm.groupByColumn.setValue(colIndex);
        vm.groupByDirection.setValue('asc');
        this.updatePinStates();

        if (!vm.isGrouped.getValue()) {
            this.enableGrouping();
        } else {
            this._buildGroupsFromVM();
            this.render();
            this._notifyLinkedCharts();
        }
    };

    AR.DataGrid.prototype.updatePinStates = function () {
        var vm = this._vm;
        var groupByColumn = vm.groupByColumn.getValue();
        var groupByDirection = vm.groupByDirection.getValue() || 'asc';
        var isGrouped = vm.isGrouped.getValue();

        for (var i = 0; i < this.columns.length; i++) {
            var col = this.columns[i];
            var th = col.element;
            var pin = col.pinIcon;
            if (!pin) continue;

            removeClass(th, 'datagrid-group-by-header');
            removeClass(pin, 'icon-pin-asc');
            removeClass(pin, 'icon-pin-desc');
            removeClass(pin, 'datagrid-pin-active');

            if (col.index === groupByColumn) {
                addClass(pin, 'datagrid-pin-active');
                addClass(pin, groupByDirection === 'asc' ? 'icon-pin-asc' : 'icon-pin-desc');

                if (isGrouped) {
                    addClass(th, 'datagrid-group-by-header');
                    pin.setAttribute('title', 'Click to reverse group order');
                } else {
                    pin.setAttribute('title', 'Click to enable grouping by this column');
                }
            } else {
                addClass(pin, 'icon-pin-asc');
                pin.setAttribute('title', 'Click to group by this column');
            }
        }
    };

    AR.DataGrid.prototype.toggleGroupOrder = function () {
        var vm = this._vm;
        if (!vm.groupByColumn.getValue()) return;

        var dir = vm.groupByDirection.getValue() || 'asc';
        vm.groupByDirection.setValue(dir === 'asc' ? 'desc' : 'asc');
        this.updatePinStates();
        if (vm.isGrouped.getValue()) {
            this._buildGroupsFromVM();
            this.render();
            this._notifyLinkedCharts();
        }
    };

    AR.DataGrid.prototype.sortByColumn = function (colIndex) {
        var vm = this._vm;
        var currentCol = vm.sortColumn.getValue();
        var currentDir = vm.sortDirection.getValue();
        var newDir;

        if (currentCol === colIndex) {
            newDir = currentDir === 'asc' ? 'desc' : 'asc';
        } else {
            newDir = 'asc';
        }

        vm.sortColumn.setValue(colIndex);
        vm.sortDirection.setValue(newDir);
    };

    AR.DataGrid.prototype.getColumnByIndex = function (colIndex) {
        for (var i = 0; i < this.columns.length; i++) {
            if (this.columns[i].index === colIndex) return this.columns[i];
        }
        return null;
    };

    AR.DataGrid.prototype.clearSortIndicators = function () {
        for (var i = 0; i < this.columns.length; i++) {
            var col = this.columns[i];
            col.element.setAttribute('aria-sort', 'none');
            if (col.sortIcon) col.sortIcon.className = 'datagrid-sort-icon';
        }
    };

    AR.DataGrid.prototype.updateSortIndicator = function (col, direction) {
        col.element.setAttribute(
            'aria-sort',
            direction === 'asc' ? 'ascending' : 'descending'
        );
        if (col.sortIcon) {
            removeClass(col.sortIcon, 'icon-chevron-up');
            removeClass(col.sortIcon, 'icon-chevron-down');
            addClass(col.sortIcon, direction === 'asc' ? 'icon-chevron-up' : 'icon-chevron-down');
        }
    };

    AR.DataGrid.prototype._sortDataArrayInPlace = function (data, colIndex, direction) {
        var col = this.getColumnByIndex(colIndex);
        var isDate = col && col.isDate;

        data.sort(function (a, b) {
            var valA = a[colIndex];
            var valB = b[colIndex];

            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;

            var result;
            if (isDate) {
                var dA = new Date(valA);
                var dB = new Date(valB);
                result = dA.getTime() - dB.getTime();
            } else {
                var nA = parseNumericValue(valA);
                var nB = parseNumericValue(valB);
                if (nA !== null && nB !== null) {
                    result = nA - nB;
                } else {
                    var sA = String(valA).toLowerCase();
                    var sB = String(valB).toLowerCase();
                    result = sA.localeCompare(sB);
                }
            }
            return direction === 'asc' ? result : -result;
        });
    };

    // -------------------------------------------------------------------------
    // Grouping
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype.enableGrouping = function () {
        var vm = this._vm;
        if (!vm.groupByColumn.getValue()) {
            console.warn('DataGrid: No group-by column set.');
            return;
        }
        vm.isGrouped.setValue(true);
        this.updatePinStates();
        this._buildGroupsFromVM();
        this.render();
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype.disableGrouping = function () {
        var vm = this._vm;
        vm.isGrouped.setValue(false);
        vm.groups.setValue([]);
        vm.collapsedGroups.setValue({});
        this.updatePinStates();
        this.render();
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype.toggleGrouping = function () {
        var vm = this._vm;
        vm.isGrouped.setValue(!vm.isGrouped.getValue());
    };

    AR.DataGrid.prototype._buildGroupsFromVM = function () {
        var vm = this._vm;
        var data = vm.data.getValue();
        var groupByColumn = vm.groupByColumn.getValue();
        if (!groupByColumn) return;

        var col = this.getColumnByIndex(groupByColumn);
        var isDate = col && col.isDate;
        var groupMap = {};
        var problemRows = [];

        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var rawValue = row[groupByColumn];
            if (rawValue == null || rawValue === '') {
                problemRows.push(row);
                continue;
            }

            var groupKey = isDate ? this.getDateBucket(rawValue) : String(rawValue);
            var sortKey = isDate ? this.getDateSortKey(rawValue) : groupKey.toLowerCase();

            if (!groupMap[groupKey]) {
                groupMap[groupKey] = {
                    key: groupKey,
                    sortKey: sortKey,
                    rows: [],
                    rawValue: rawValue
                };
            }
            groupMap[groupKey].rows.push(row);
        }

        var groups = [];
        for (var key in groupMap) {
            if (groupMap.hasOwnProperty(key)) groups.push(groupMap[key]);
        }

        var direction = vm.groupByDirection.getValue() || 'asc';
        groups.sort(function (a, b) {
            var result;
            if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
                result = a.sortKey - b.sortKey;
            } else {
                result = String(a.sortKey).localeCompare(String(b.sortKey));
            }
            return direction === 'asc' ? result : -result;
        });

        if (problemRows.length > 0) {
            groups.push({
                key: '⚠ Incomplete data',
                sortKey: 'zzzzzz',
                rows: problemRows,
                isProblemBucket: true
            });
        }

        var collapsed = {};
        for (var j = 1; j < groups.length; j++) {
            collapsed[groups[j].key] = true;
        }

        vm.groups.setValue(groups);
        vm.collapsedGroups.setValue(collapsed);
    };

    AR.DataGrid.prototype.getDateBucket = function (dateValue) {
        var date = new Date(dateValue);
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        var diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24));

        if (diffDays < -365) return 'Over a year ago';
        if (diffDays < -30) return 'Over a month ago';
        if (diffDays < -14) return '2-4 weeks ago';
        if (diffDays < -7) return 'Last 2 weeks';
        if (diffDays < -1) return 'Last week';
        if (diffDays === -1) return 'Yesterday';
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        if (diffDays <= 7) return 'This week';
        if (diffDays <= 14) return 'Next 2 weeks';
        if (diffDays <= 30) return 'In 2-4 weeks';
        if (diffDays <= 365) return 'In 1-12 months';
        return 'Over a year away';
    };

    AR.DataGrid.prototype.getDateSortKey = function (dateValue) {
        return new Date(dateValue).getTime();
    };

    AR.DataGrid.prototype.toggleGroup = function (groupKey) {
        var vm = this._vm;
        var map = Object.assign({}, vm.collapsedGroups.getValue());
        if (map[groupKey]) delete map[groupKey];
        else map[groupKey] = true;
        vm.collapsedGroups.setValue(map);
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype.expandAllGroups = function () {
        this._vm.collapsedGroups.setValue({});
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype.collapseAllGroups = function () {
        var groups = this._vm.groups.getValue() || [];
        var map = {};
        for (var i = 0; i < groups.length; i++) {
            map[groups[i].key] = true;
        }
        this._vm.collapsedGroups.setValue(map);
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype.createGroupRow = function (group) {
        var self = this;
        var vm = this._vm;

        var tr = document.createElement('tr');
        addClass(tr, 'datagrid-group-row');
        if (group.isProblemBucket) addClass(tr, 'datagrid-group-problem');

        var td = document.createElement('td');
        var colCount = this.columns.length + (this.hasNavigation ? 1 : 0);
        td.setAttribute('colspan', colCount);
        addClass(td, 'datagrid-group-cell');

        var collapsed = vm.collapsedGroups.getValue() || {};
        var isCollapsed = !!collapsed[group.key];

        var toggleBtn = document.createElement('span');
        addClass(toggleBtn, 'datagrid-group-toggle');
        toggleBtn.setAttribute('role', 'button');
        toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
        toggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand group' : 'Collapse group');
        toggleBtn.innerHTML = isCollapsed ? '&#43;' : '&#8722;';
        td.appendChild(toggleBtn);

        var labelSpan = document.createElement('span');
        addClass(labelSpan, 'datagrid-group-label');
        var col = this.getColumnByIndex(vm.groupByColumn.getValue());
        var colLabel = col ? col.label : 'Group';
        labelSpan.textContent =
            ' ' +
            colLabel +
            ': ' +
            group.key +
            ' (' +
            group.rows.length +
            ' item' +
            (group.rows.length !== 1 ? 's' : '') +
            ')';
        td.appendChild(labelSpan);

        tr.appendChild(td);

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.toggleGroup(group.key);
        });

        tr.setAttribute('tabindex', '0');
        tr.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                self.toggleGroup(group.key);
            }
        });

        return tr;
    };

    // -------------------------------------------------------------------------
    // Navigation / footer
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype.setupNavigation = function () {
        this.injectIndicatorHeader();
        this.createFooter();
        this.table.setAttribute('tabindex', '0');
    };

    AR.DataGrid.prototype.injectIndicatorHeader = function () {
        var theadRow = this.table.querySelector('thead tr');
        if (!theadRow) return;
        var th = document.createElement('th');
        addClass(th, 'datagrid-indicator-header');
        th.setAttribute('role', 'columnheader');
        th.setAttribute('aria-label', 'Row indicator');
        th.innerHTML = '&nbsp;';
        theadRow.insertBefore(th, theadRow.firstChild);
    };

    AR.DataGrid.prototype.createFooter = function () {
        var self = this;

        this.tfoot = document.createElement('tfoot');
        var footerRow = document.createElement('tr');
        var footerCell = document.createElement('td');
        footerCell.setAttribute('colspan', this.columns.length + 1);
        addClass(footerCell, 'datagrid-footer');

        var navContainer = document.createElement('div');
        addClass(navContainer, 'datagrid-nav-container');

        this.btnFirst = this.createNavButton('first', 'First row', function () {
            self.navigateFirst();
        });
        this.btnFirst.innerHTML =
            '<span class="icon-chevron-left"></span><span class="icon-chevron-left" style="margin-left: -8px;"></span>';

        this.btnPrev = this.createNavButton('prev', 'Previous row', function () {
            self.navigatePrev();
        });
        this.btnPrev.innerHTML = '<span class="icon-chevron-left"></span>';

        this.btnNext = this.createNavButton('next', 'Next row', function () {
            self.navigateNext();
        });
        this.btnNext.innerHTML = '<span class="icon-chevron-right"></span>';

        this.btnLast = this.createNavButton('last', 'Last row', function () {
            self.navigateLast();
        });
        this.btnLast.innerHTML =
            '<span class="icon-chevron-right"></span><span class="icon-chevron-right" style="margin-left: -8px;"></span>';

        this.rowIndicator = document.createElement('span');
        addClass(this.rowIndicator, 'datagrid-row-indicator');
        this.rowIndicator.textContent = 'Row 0 of 0';

        this.btnRefresh = this.createNavButton('refresh', 'Refresh', function () {
            self.refresh();
        });
        this.btnRefresh.innerHTML = '↻';
        this.btnRefresh.setAttribute('title', 'Refresh');

        this.loadMoreContainer = document.createElement('span');
        addClass(this.loadMoreContainer, 'datagrid-load-more');
        this.loadMoreLink = document.createElement('a');
        this.loadMoreLink.href = '#';
        this.loadMoreLink.textContent = 'Load more...';
        this.loadMoreLink.addEventListener('click', function (e) {
            e.preventDefault();
            self.loadMoreRows();
        });
        this.loadMoreContainer.appendChild(this.loadMoreLink);
        this.loadMoreContainer.style.display = 'none';

        navContainer.appendChild(this.btnFirst);
        navContainer.appendChild(this.btnPrev);
        navContainer.appendChild(this.btnNext);
        navContainer.appendChild(this.btnLast);
        navContainer.appendChild(this.rowIndicator);
        navContainer.appendChild(this.btnRefresh);
        navContainer.appendChild(this.loadMoreContainer);

        footerCell.appendChild(navContainer);
        footerRow.appendChild(footerCell);
        this.tfoot.appendChild(footerRow);
        this.table.appendChild(this.tfoot);
    };

    AR.DataGrid.prototype.createNavButton = function (name, ariaLabel, onClick) {
        var btn = document.createElement('button');
        btn.type = 'button';
        addClass(btn, 'datagrid-nav-btn');
        addClass(btn, 'datagrid-nav-' + name);
        btn.setAttribute('aria-label', ariaLabel);
        btn.addEventListener('click', onClick);
        return btn;
    };

    AR.DataGrid.prototype.setupKeyboard = function () {
        if (!this.hasNavigation) return;
        var self = this;
        this.table.addEventListener('keydown', function (e) {
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    self.navigatePrev();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    self.navigateNext();
                    break;
                case 'Home':
                    e.preventDefault();
                    self.navigateFirst();
                    break;
                case 'End':
                    e.preventDefault();
                    self.navigateLast();
                    break;
            }
        });
    };

    AR.DataGrid.prototype.navigateFirst = function () {
        this._vm.currentRowIndex.setValue(0);
    };

    AR.DataGrid.prototype.navigatePrev = function () {
        var i = this._vm.currentRowIndex.getValue();
        if (i > 0) this._vm.currentRowIndex.setValue(i - 1);
    };

    AR.DataGrid.prototype.navigateNext = function () {
        var i = this._vm.currentRowIndex.getValue();
        var max = this._vm.displayedRowCount.getValue() - 1;
        if (i < max) this._vm.currentRowIndex.setValue(i + 1);
    };

    AR.DataGrid.prototype.navigateLast = function () {
        var last = this._vm.displayedRowCount.getValue() - 1;
        if (last >= 0) this._vm.currentRowIndex.setValue(last);
    };

    AR.DataGrid.prototype.setCurrentRow = function (index) {
        this._vm.currentRowIndex.setValue(index);
    };

    AR.DataGrid.prototype._onCurrentRowChanged = function () {
        // Guard: _vm may not be assigned yet during initial subscription callback
        if (!this._vm) return;
        var index = this._vm.currentRowIndex.getValue();
        var displayed = this._vm.displayedRowCount.getValue();
        if (index < 0 || index >= displayed) return;

        var prevRow = this.tbody.querySelector('.datagrid-row-current');
        if (prevRow) {
            removeClass(prevRow, 'datagrid-row-current');
            var prevInd = prevRow.querySelector('.datagrid-indicator-cell');
            if (prevInd) prevInd.innerHTML = '&nbsp;';
        }

        var rows = this.tbody.querySelectorAll('.datagrid-row');
        var currentRow = rows[index];
        if (currentRow) {
            addClass(currentRow, 'datagrid-row-current');
            var ind = currentRow.querySelector('.datagrid-indicator-cell');
            if (ind) ind.innerHTML = '►';
            currentRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }

        this.updateRowIndicator();
        this.updateNavButtonStates();

        // NEW: notify charts that the "current row" changed
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype.updateRowIndicator = function () {
        if (!this.rowIndicator) return;
        var displayed = this._vm.displayedRowCount.getValue();
        if (displayed === 0) {
            this.rowIndicator.textContent = 'Row 0 of 0';
        } else {
            var current = this._vm.currentRowIndex.getValue();
            var total = this._vm.data.getValue().length;
            this.rowIndicator.textContent = 'Row ' + (current + 1) + ' of ' + total;
        }
    };

    AR.DataGrid.prototype.updateNavButtonStates = function () {
        if (!this.hasNavigation) return;
        var displayed = this._vm.displayedRowCount.getValue();
        var idx = this._vm.currentRowIndex.getValue();

        var noData = displayed === 0;
        var atFirst = idx === 0;
        var atLast = idx >= displayed - 1;

        this.btnFirst.disabled = atFirst || noData;
        this.btnPrev.disabled = atFirst || noData;
        this.btnNext.disabled = atLast || noData;
        this.btnLast.disabled = atLast || noData;
    };

    AR.DataGrid.prototype.updateLoadMore = function () {
        if (!this.hasNavigation || !this.loadMoreContainer) return;
        var hasMore = this._vm.displayedRowCount.getValue() < this._vm.data.getValue().length;
        this.loadMoreContainer.style.display = hasMore ? 'inline' : 'none';

        if (hasMore) {
            this.loadMoreLink.textContent =
                'Load more (' +
                this._vm.displayedRowCount.getValue() +
                ' of ' +
                this._vm.data.getValue().length +
                ')';
        }
    };

    AR.DataGrid.prototype.loadMoreRows = function () {
        var vm = this._vm;
        var cap = this.options.rowCapDefault;
        var newCount = Math.min(vm.displayedRowCount.getValue() + cap, vm.data.getValue().length);
        vm.displayedRowCount.setValue(newCount);
    };

    AR.DataGrid.prototype._onDisplayedRowCountChanged = function () {
        // Guard: _vm may not be assigned yet during initial subscription callback
        if (!this._vm) return;
        this.render();
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype.refresh = function () {
        this.render();
        this._notifyLinkedCharts();
    };

    // -------------------------------------------------------------------------
    // Data API (public)
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype.setData = function (data) {
        if (!Array.isArray(data)) throw new Error('DataGrid: data must be an array');
        if (!this._vm || !this._vm.data) {
            throw new Error('DataGrid: ViewModel not initialized. Ensure MVVM.js is loaded before DataGrid.js');
        }
        this._vm.data.setValue(data); // subscriptions handle everything else
    };

    AR.DataGrid.prototype.loadFromJSON = function (data) {
        this.setData(data);
    };

    AR.DataGrid.prototype.appendData = function (data) {
        if (!Array.isArray(data)) throw new Error('DataGrid: data must be an array');
        var current = this._vm.data.getValue().slice();
        this._vm.data.setValue(current.concat(data));
    };

    AR.DataGrid.prototype.clearData = function () {
        this._vm.data.setValue([]);
    };

    AR.DataGrid.prototype.getData = function () {
        return this._vm.data.getValue().slice();
    };

    AR.DataGrid.prototype.getColumns = function () {
        return this.columns.slice();
    };

    AR.DataGrid.prototype.getRowCount = function () {
        return this._vm.data.getValue().length;
    };

    // -------------------------------------------------------------------------
    // Reactive handlers
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype._onDataChanged = function () {
        // Guard: _vm may not be assigned yet during initial subscription callback
        if (!this._vm) return;
        // Guard: prevent re-entry (setValue below would trigger this again)
        if (this._inDataChanged) return;
        this._inDataChanged = true;

        try {
            var vm = this._vm;
            var data = vm.data.getValue().slice();

            var colIndex = vm.sortColumn.getValue();
            var direction = vm.sortDirection.getValue();
            if (colIndex && direction) {
                this._sortDataArrayInPlace(data, colIndex, direction);
            }

            vm.data.setValue(data);

            if (vm.isGrouped.getValue() && vm.groupByColumn.getValue()) {
                this._buildGroupsFromVM();
            } else {
                vm.groups.setValue([]);
                vm.collapsedGroups.setValue({});
            }

            var cap = this.options.rowCapFirst;
            var initial = Math.min(data.length, cap);
            vm.displayedRowCount.setValue(initial);
            vm.currentRowIndex.setValue(initial > 0 ? 0 : 0);

            this.render();
            this._notifyLinkedCharts();
        } finally {
            this._inDataChanged = false;
        }
    };

    AR.DataGrid.prototype._onSortChanged = function () {
        // Guard: _vm may not be assigned yet during initial subscription callback
        if (!this._vm) return;

        var vm = this._vm;
        var data = vm.data.getValue().slice();
        var colIndex = vm.sortColumn.getValue();
        var direction = vm.sortDirection.getValue();

        this.clearSortIndicators();

        if (!colIndex || !direction) {
            vm.data.setValue(data);
            this.render();
            this._notifyLinkedCharts();
            return;
        }

        var col = this.getColumnByIndex(colIndex);
        if (col) this.updateSortIndicator(col, direction);

        this._sortDataArrayInPlace(data, colIndex, direction);
        vm.data.setValue(data);

        if (vm.isGrouped.getValue() && vm.groupByColumn.getValue()) {
            this._buildGroupsFromVM();
        }

        this.render();
        this._notifyLinkedCharts();
    };

    AR.DataGrid.prototype._onGroupConfigChanged = function () {
        // Guard: _vm may not be assigned yet during initial subscription callback
        if (!this._vm) return;

        this.updatePinStates();
        var vm = this._vm;

        if (!vm.isGrouped.getValue() || !vm.groupByColumn.getValue()) {
            vm.groups.setValue([]);
            vm.collapsedGroups.setValue({});
            this.render();
            this._notifyLinkedCharts();
            return;
        }

        this._buildGroupsFromVM();
        this.render();
        this._notifyLinkedCharts();
    };

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    AR.DataGrid.prototype.render = function () {
        // Guard: _vm may not be assigned yet during initial subscription callback
        if (!this._vm) return;
        if (!this.tbody) this.ensureTbody();
        this.tbody.innerHTML = '';

        if (this._vm.isGrouped.getValue() && this._vm.groups.getValue().length > 0) {
            this._renderGroupedFromVM();
        } else {
            this._renderFlatFromVM();
        }

        if (this.scrollContainer) {
            var self = this;
            setTimeout(function () {
                self.scrollContainer.dispatchEvent(new Event('scroll'));
            }, 0);
        }
    };

    AR.DataGrid.prototype._renderFlatFromVM = function () {
        var vm = this._vm;
        var data = vm.data.getValue();
        var displayed = vm.displayedRowCount.getValue();

        if (displayed === 0 || displayed > data.length) {
            displayed = Math.min(data.length, this.options.rowCapFirst);
            vm.displayedRowCount.setValue(displayed);
        }

        var rowsToShow = Math.min(displayed, data.length);
        for (var i = 0; i < rowsToShow; i++) {
            var rowData = data[i];
            var tr = this.createDataRow(rowData, i);
            this.tbody.appendChild(tr);
        }

        if (this.hasNavigation) {
            if (rowsToShow > 0) {
                var idx = vm.currentRowIndex.getValue();
                if (idx < 0 || idx >= rowsToShow) idx = 0;
                this.setCurrentRow(idx);
            } else {
                this.updateRowIndicator();
                this.updateNavButtonStates();
            }
            this.updateLoadMore();
        }
    };

    AR.DataGrid.prototype._renderGroupedFromVM = function () {
        var vm = this._vm;
        var groups = vm.groups.getValue();
        var collapsed = vm.collapsedGroups.getValue() || {};
        var totalRendered = 0;
        var rowIndexCounter = 0;

        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            var groupRow = this.createGroupRow(group);
            this.tbody.appendChild(groupRow);

            if (!collapsed[group.key]) {
                var groupRows = group.rows;
                if (vm.sortColumn.getValue()) {
                    groupRows = this.sortRowsWithinGroup(groupRows);
                }
                for (var i = 0; i < groupRows.length; i++) {
                    var rowData = groupRows[i];
                    var tr = this.createDataRow(rowData, rowIndexCounter);
                    this.tbody.appendChild(tr);
                    totalRendered++;
                    rowIndexCounter++;
                }
            } else {
                rowIndexCounter += group.rows.length;
            }
        }

        vm.displayedRowCount.setValue(totalRendered);

        if (this.hasNavigation) {
            if (totalRendered > 0) {
                var idx = vm.currentRowIndex.getValue();
                if (idx < 0 || idx >= totalRendered) idx = 0;
                this.setCurrentRow(idx);
            } else {
                this.updateRowIndicator();
                this.updateNavButtonStates();
            }
            if (this.loadMoreContainer) {
                this.loadMoreContainer.style.display = 'none';
            }
        }
    };

    AR.DataGrid.prototype.sortRowsWithinGroup = function (rows) {
        var vm = this._vm;
        var colIndex = vm.sortColumn.getValue();
        if (!colIndex) return rows;

        var direction = vm.sortDirection.getValue();
        var col = this.getColumnByIndex(colIndex);
        var isDate = col && col.isDate;

        var sorted = rows.slice();
        sorted.sort(function (a, b) {
            var valA = a[colIndex];
            var valB = b[colIndex];

            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;

            var result;
            if (isDate) {
                var dA = new Date(valA);
                var dB = new Date(valB);
                result = dA.getTime() - dB.getTime();
            } else {
                var nA = parseNumericValue(valA);
                var nB = parseNumericValue(valB);
                if (nA !== null && nB !== null) {
                    result = nA - nB;
                } else {
                    var sA = String(valA).toLowerCase();
                    var sB = String(valB).toLowerCase();
                    result = sA.localeCompare(sB);
                }
            }
            return direction === 'asc' ? result : -result;
        });

        return sorted;
    };

    AR.DataGrid.prototype.createDataRow = function (rowData, rowIndex) {
        var tr = document.createElement('tr');
        addClass(tr, 'datagrid-row');
        tr.setAttribute('role', 'row');
        tr.setAttribute('data-row-index', rowIndex);

        if (this.hasNavigation) {
            var indicatorTd = document.createElement('td');
            addClass(indicatorTd, 'datagrid-indicator-cell');
            indicatorTd.setAttribute('role', 'gridcell');
            indicatorTd.innerHTML = '&nbsp;';
            tr.appendChild(indicatorTd);
        }

        for (var i = 0; i < this.columns.length; i++) {
            var column = this.columns[i];
            var td = document.createElement('td');
            td.setAttribute('role', 'gridcell');

            var value = rowData[column.index];
            if (value === undefined || value === null || value === '') {
                td.textContent = '';
                addClass(td, 'datagrid-cell-empty');
            } else {
                if (column.isDate) {
                    td.textContent = this.formatDateValue(value);
                    td.setAttribute('data-raw-value', value);
                } else {
                    td.textContent = String(value);
                }
            }
            tr.appendChild(td);
        }

        this.setupRowInteraction(tr, rowIndex);
        return tr;
    };

    AR.DataGrid.prototype.setupRowInteraction = function (tr, rowIndex) {
        var self = this;
        tr.addEventListener('mouseenter', function () {
            addClass(tr, 'datagrid-row-hover');
        });
        tr.addEventListener('mouseleave', function () {
            removeClass(tr, 'datagrid-row-hover');
        });
        if (this.hasNavigation) {
            tr.addEventListener('click', function () {
                self.setCurrentRow(rowIndex);
            });
        }
    };

    AR.DataGrid.prototype.formatDateValue = function (value) {
        var date = new Date(value);
        if (isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString();
    };

    // -------------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------------

    window.AR = AR;

})(window);