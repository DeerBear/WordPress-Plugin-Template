/**
 * AR.DataGrid.Manager.js
 * Data Manager and Flyweight Row Model for AR.DataGrid
 *
 * Provides:
 * - AR.DataGrid.Manager: Abstracts data source (array, function, endpoint)
 * - AR.DataGrid.RowFlyweight: Virtual scrolling with row recycling
 * - Efficient handling of very large datasets (100k+ rows)
 *
 * Backward compatible: existing DataGrid demos work unchanged
 */
(function(window) {
    'use strict';

    var AR = window.AR || {};

    // Ensure AR.DataGrid exists
    if (!AR.DataGrid) {
        throw new Error('AR.DataGrid.Manager requires AR.DataGrid.js to be loaded first');
    }

    // ============================================================================
    // AR.DataGrid.Manager - Data Source Abstraction
    // ============================================================================

    /**
     * AR.DataGrid.Manager manages data sources and provides chunked data access
     *
     * Uses MVVM for observable state (loading, totalRows, error) when available
     * Falls back to plain properties for backward compatibility
     *
     * Supports:
     * - Static array (backward compatible)
     * - Function provider (lazy loading)
     * - URL endpoint (fetch chunks)
     *
     * @param {Object} options - Configuration
     *   - source: Array|Function|String - Data source
     *   - chunkSize: Number - Rows per chunk (default: 1000)
     *   - totalRows: Number - Total row count (for function/URL sources)
     *   - cache: Boolean - Cache loaded chunks (default: true)
     *   - onLoad: Function - Callback when data loads
     *   - onError: Function - Error callback
     */
    AR.DataGrid.Manager = function(options) {
        this.options = AR.DataGrid.Manager.extend({
            source: [],
            chunkSize: 1000,
            totalRows: 0,
            cache: true,
            onLoad: null,
            onError: null,
            transform: null  // Optional transform function for each row
        }, options || {});

        // Detect source type before MVVM initialization
        this.sourceType = this.detectSourceType(this.options.source);

        // Internal cache (not observable)
        this.chunks = {};

        // Initialize MVVM observables if available
        if (window.MVVM && window.MVVM.ViewModel) {
            MVVM.ViewModel.call(this, {
                loading: false,
                totalRows: 0,
                error: null
            });
            this._useMVVM = true;
        } else {
            // Fallback to plain properties
            this.loading = false;
            this.totalRows = 0;
            this.error = null;
            this._useMVVM = false;
        }

        // Initialize based on source type
        this.init();
    };

    /**
     * Simple object extend utility
     */
    AR.DataGrid.Manager.extend = function(target, source) {
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
        return target;
    };

    /**
     * Detect source type: 'array', 'function', or 'url'
     */
    AR.DataGrid.Manager.prototype.detectSourceType = function(source) {
        if (Array.isArray(source)) {
            return 'array';
        } else if (typeof source === 'function') {
            return 'function';
        } else if (typeof source === 'string') {
            return 'url';
        } else {
            throw new Error('Manager: Invalid source type. Must be Array, Function, or URL string.');
        }
    };

    /**
     * Initialize the manager based on source type
     */
    AR.DataGrid.Manager.prototype.init = function() {
        switch (this.sourceType) {
            case 'array':
                this.initArraySource();
                break;
            case 'function':
                this.initFunctionSource();
                break;
            case 'url':
                this.initUrlSource();
                break;
        }
    };

    /**
     * Initialize array source (immediate, synchronous)
     */
    AR.DataGrid.Manager.prototype.initArraySource = function() {
        var data = this.options.source;
        this._setTotalRows(data.length);

        // Pre-chunk the data for efficient access
        var chunkSize = this.options.chunkSize;
        var chunkCount = Math.ceil(data.length / chunkSize);

        for (var i = 0; i < chunkCount; i++) {
            var start = i * chunkSize;
            var end = Math.min(start + chunkSize, data.length);
            this.chunks[i] = data.slice(start, end);
        }

        if (this.options.onLoad) {
            this.options.onLoad(this.getTotalRows());
        }
    };

    /**
     * Initialize function source (lazy, on-demand)
     */
    AR.DataGrid.Manager.prototype.initFunctionSource = function() {
        this._setTotalRows(this.options.totalRows || 0);

        if (this.options.onLoad) {
            this.options.onLoad(this.getTotalRows());
        }
    };

    /**
     * Initialize URL source (async, chunked fetching)
     */
    AR.DataGrid.Manager.prototype.initUrlSource = function() {
        var self = this;

        // Initial metadata fetch to get total row count
        // Expected endpoint format: /data?chunk=0&size=1000
        // Response: { totalRows: 50000, data: [...] }

        this._setLoading(true);
        this._setError(null);

        fetch(this.options.source + '?chunk=0&size=0')
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to fetch data metadata');
                }
                return response.json();
            })
            .then(function(result) {
                self._setTotalRows(result.totalRows || 0);
                self._setLoading(false);

                if (self.options.onLoad) {
                    self.options.onLoad(self.getTotalRows());
                }
            })
            .catch(function(error) {
                self._setLoading(false);
                self._setError(error.message || 'Failed to load data');
                if (self.options.onError) {
                    self.options.onError(error);
                }
            });
    };

    /**
     * Get chunk index for a given row index
     */
    AR.DataGrid.Manager.prototype.getChunkIndex = function(rowIndex) {
        return Math.floor(rowIndex / this.options.chunkSize);
    };

    /**
     * Get row data by absolute row index
     *
     * @param {Number} rowIndex - Global row index
     * @param {Function} callback - Callback(rowData)
     */
    AR.DataGrid.Manager.prototype.getRow = function(rowIndex, callback) {
        if (rowIndex < 0 || rowIndex >= this.getTotalRows()) {
            callback(null);
            return;
        }

        var chunkIndex = this.getChunkIndex(rowIndex);
        var indexInChunk = rowIndex % this.options.chunkSize;

        var self = this;
        this.getChunk(chunkIndex, function(chunk) {
            if (chunk && chunk[indexInChunk]) {
                var row = chunk[indexInChunk];

                // Apply transform if provided
                if (self.options.transform) {
                    row = self.options.transform(row, rowIndex);
                }

                callback(row);
            } else {
                callback(null);
            }
        });
    };

    /**
     * Get a chunk of data
     *
     * @param {Number} chunkIndex - Chunk index
     * @param {Function} callback - Callback(chunkData)
     */
    AR.DataGrid.Manager.prototype.getChunk = function(chunkIndex, callback) {
        // Check cache first
        if (this.chunks[chunkIndex]) {
            callback(this.chunks[chunkIndex]);
            return;
        }

        // Load chunk based on source type
        switch (this.sourceType) {
            case 'array':
                // Already loaded in init
                callback(null);
                break;

            case 'function':
                this.loadChunkFromFunction(chunkIndex, callback);
                break;

            case 'url':
                this.loadChunkFromUrl(chunkIndex, callback);
                break;
        }
    };

    /**
     * Load chunk using function provider
     */
    AR.DataGrid.Manager.prototype.loadChunkFromFunction = function(chunkIndex, callback) {
        var start = chunkIndex * this.options.chunkSize;
        var size = this.options.chunkSize;

        try {
            this._setError(null);
            var chunk = this.options.source(start, size);

            if (this.options.cache) {
                this.chunks[chunkIndex] = chunk;
            }

            callback(chunk);
        } catch (error) {
            this._setError(error.message || 'Failed to load chunk from function');
            if (this.options.onError) {
                this.options.onError(error);
            }
            callback(null);
        }
    };

    /**
     * Load chunk from URL endpoint
     */
    AR.DataGrid.Manager.prototype.loadChunkFromUrl = function(chunkIndex, callback) {
        var self = this;
        var url = this.options.source + '?chunk=' + chunkIndex + '&size=' + this.options.chunkSize;

        this._setLoading(true);
        this._setError(null);

        fetch(url)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to fetch chunk ' + chunkIndex);
                }
                return response.json();
            })
            .then(function(result) {
                self._setLoading(false);
                var chunk = result.data || [];

                if (self.options.cache) {
                    self.chunks[chunkIndex] = chunk;
                }

                callback(chunk);
            })
            .catch(function(error) {
                self._setLoading(false);
                self._setError(error.message || 'Failed to load chunk');
                if (self.options.onError) {
                    self.options.onError(error);
                }
                callback(null);
            });
    };

    /**
     * Get range of rows
     *
     * @param {Number} startIndex - Start row index
     * @param {Number} count - Number of rows
     * @param {Function} callback - Callback(rows[])
     */
    AR.DataGrid.Manager.prototype.getRange = function(startIndex, count, callback) {
        var endIndex = Math.min(startIndex + count, this.getTotalRows());
        var expected = endIndex - startIndex;
        var rows = [];
        var loaded = 0;
        var self = this;

        if (expected === 0) {
            callback(rows);
            return;
        }

        function checkComplete() {
            loaded++;
            if (loaded === expected) {
                callback(rows);
            }
        }

        for (var i = startIndex; i < endIndex; i++) {
            (function(index) {
                self.getRow(index, function(row) {
                    rows[index - startIndex] = row;
                    checkComplete();
                });
            })(i);
        }
    };

    /**
     * Prefetch chunks for better performance
     *
     * @param {Number} startChunk - Starting chunk index
     * @param {Number} count - Number of chunks to prefetch
     */
    AR.DataGrid.Manager.prototype.prefetch = function(startChunk, count) {
        var self = this;

        for (var i = 0; i < count; i++) {
            var chunkIndex = startChunk + i;

            // Skip if already cached
            if (!this.chunks[chunkIndex]) {
                this.getChunk(chunkIndex, function() {
                    // Chunk loaded and cached
                });
            }
        }
    };

    /**
     * Clear cache to free memory
     *
     * @param {Boolean} keepRecent - Keep recently used chunks
     */
    AR.DataGrid.Manager.prototype.clearCache = function(keepRecent) {
        if (!keepRecent) {
            this.chunks = {};
        } else {
            // TODO: Implement LRU cache eviction
        }
    };

    /**
     * Get total row count
     */
    AR.DataGrid.Manager.prototype.getTotalRows = function() {
        if (this._useMVVM && this.totalRows.getValue) {
            return this.totalRows.getValue();
        }
        return this.totalRows;
    };

    /**
     * Set total row count
     * @private
     */
    AR.DataGrid.Manager.prototype._setTotalRows = function(count) {
        if (this._useMVVM && this.totalRows.setValue) {
            this.totalRows.setValue(count);
        } else {
            this.totalRows = count;
        }
    };

    /**
     * Get loading state
     */
    AR.DataGrid.Manager.prototype.isLoading = function() {
        if (this._useMVVM && this.loading.getValue) {
            return this.loading.getValue();
        }
        return this.loading;
    };

    /**
     * Set loading state
     * @private
     */
    AR.DataGrid.Manager.prototype._setLoading = function(state) {
        if (this._useMVVM && this.loading.setValue) {
            this.loading.setValue(state);
        } else {
            this.loading = state;
        }
    };

    /**
     * Get last error
     */
    AR.DataGrid.Manager.prototype.getError = function() {
        if (this._useMVVM && this.error.getValue) {
            return this.error.getValue();
        }
        return this.error;
    };

    /**
     * Set error
     * @private
     */
    AR.DataGrid.Manager.prototype._setError = function(err) {
        if (this._useMVVM && this.error.setValue) {
            this.error.setValue(err);
        } else {
            this.error = err;
        }
    };

    // ============================================================================
    // AR.DataGrid.RowFlyweight - Virtual Scrolling Renderer
    // ============================================================================

    /**
     * RowFlyweight implements virtual scrolling with row recycling
     *
     * Only renders rows visible in viewport + buffer
     * Reuses DOM elements as user scrolls (flyweight pattern)
     *
     * @param {AR.DataGrid} grid - The DataGrid instance
     * @param {AR.DataGrid.Manager} manager - The data manager
     * @param {Object} options - Configuration
     *   - rowHeight: Number - Fixed row height in pixels (default: auto-detect)
     *   - bufferRows: Number - Extra rows to render above/below viewport (default: 10)
     *   - enabled: Boolean - Enable virtual scrolling (default: true for large datasets)
     */
    AR.DataGrid.RowFlyweight = function(grid, manager, options) {
        this.grid = grid;
        this.manager = manager;

        this.options = AR.DataGrid.Manager.extend({
            rowHeight: 0,  // Auto-detect
            bufferRows: 10,
            enabled: true,
            threshold: 500  // Enable for datasets > 500 rows
        }, options || {});

        // State
        this.rowHeight = 0;
        this.viewportHeight = 0;
        this.scrollTop = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.rowPool = [];  // Reusable DOM rows
        this.activeRows = {};  // Currently visible rows

        // Decide if virtual scrolling should be enabled
        this.virtualEnabled = this.options.enabled &&
                              this.manager.getTotalRows() > this.options.threshold;

        if (this.virtualEnabled) {
            this.init();
        }
    };

    /**
     * Initialize virtual scrolling
     */
    AR.DataGrid.RowFlyweight.prototype.init = function() {
        this.setupScrollContainer();
        this.detectRowHeight();
        this.setupScrollHandler();
        this.createSpacers();
        this.render();
    };

    /**
     * Setup scroll container for virtual scrolling
     */
    AR.DataGrid.RowFlyweight.prototype.setupScrollContainer = function() {
        var container = this.grid.scrollContainer;

        // Set max height to enable scrolling
        if (!container.style.maxHeight) {
            container.style.maxHeight = '600px';
            container.style.overflowY = 'auto';
        }

        this.container = container;
        this.viewportHeight = container.clientHeight;
    };

    /**
     * Detect row height by rendering a sample row
     */
    AR.DataGrid.RowFlyweight.prototype.detectRowHeight = function() {
        if (this.options.rowHeight > 0) {
            this.rowHeight = this.options.rowHeight;
            return;
        }

        // Render first row temporarily to measure height
        var self = this;
        this.manager.getRow(0, function(rowData) {
            if (rowData) {
                var tr = self.grid.createDataRow(rowData, 0);
                self.grid.tbody.appendChild(tr);

                // Measure
                self.rowHeight = tr.offsetHeight;

                // Remove sample row
                self.grid.tbody.removeChild(tr);
            } else {
                // Default fallback
                self.rowHeight = 40;
            }
        });
    };

    /**
     * Create spacer rows for scroll height
     */
    AR.DataGrid.RowFlyweight.prototype.createSpacers = function() {
        // Top spacer
        this.topSpacer = document.createElement('tr');
        this.topSpacer.className = 'datagrid-spacer';
        this.topSpacer.style.height = '0px';

        var td = document.createElement('td');
        td.setAttribute('colspan', this.grid.columns.length + (this.grid.hasNavigation ? 1 : 0));
        this.topSpacer.appendChild(td);

        // Bottom spacer
        this.bottomSpacer = this.topSpacer.cloneNode(true);

        this.grid.tbody.appendChild(this.topSpacer);
        this.grid.tbody.appendChild(this.bottomSpacer);
    };

    /**
     * Setup scroll event handler
     */
    AR.DataGrid.RowFlyweight.prototype.setupScrollHandler = function() {
        var self = this;
        var scrollTimeout;

        this.container.addEventListener('scroll', function() {
            // Throttle scroll events
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }

            scrollTimeout = setTimeout(function() {
                self.scrollTop = self.container.scrollTop;
                self.render();
            }, 16);  // ~60fps
        });
    };

    /**
     * Calculate visible row range
     */
    AR.DataGrid.RowFlyweight.prototype.calculateVisibleRange = function() {
        var totalRows = this.manager.getTotalRows();

        if (this.rowHeight === 0) {
            this.visibleStart = 0;
            this.visibleEnd = Math.min(50, totalRows);  // Default first render
            return;
        }

        // Calculate visible rows
        var scrollTop = this.scrollTop;
        var viewportHeight = this.viewportHeight;

        var firstVisible = Math.floor(scrollTop / this.rowHeight);
        var lastVisible = Math.ceil((scrollTop + viewportHeight) / this.rowHeight);

        // Add buffer
        this.visibleStart = Math.max(0, firstVisible - this.options.bufferRows);
        this.visibleEnd = Math.min(totalRows, lastVisible + this.options.bufferRows);
    };

    /**
     * Render visible rows
     */
    AR.DataGrid.RowFlyweight.prototype.render = function() {
        // Don't use flyweight rendering when grouping is active
        // Let the regular DataGrid render handle it
        if (this.grid.isGrouped) {
            return;
        }

        this.calculateVisibleRange();

        var self = this;
        var start = this.visibleStart;
        var end = this.visibleEnd;

        // Update spacers
        var topHeight = start * this.rowHeight;
        var bottomHeight = (this.manager.getTotalRows() - end) * this.rowHeight;

        this.topSpacer.style.height = topHeight + 'px';
        this.bottomSpacer.style.height = bottomHeight + 'px';

        // Remove rows outside visible range
        this.recycleInvisibleRows(start, end);

        // Render visible rows
        for (var i = start; i < end; i++) {
            if (!this.activeRows[i]) {
                this.renderRow(i);
            }
        }
    };

    /**
     * Recycle rows that are no longer visible
     */
    AR.DataGrid.RowFlyweight.prototype.recycleInvisibleRows = function(start, end) {
        for (var index in this.activeRows) {
            if (this.activeRows.hasOwnProperty(index)) {
                var idx = parseInt(index);

                if (idx < start || idx >= end) {
                    var tr = this.activeRows[index];

                    // Remove from DOM
                    if (tr.parentNode) {
                        tr.parentNode.removeChild(tr);
                    }

                    // Add to pool for reuse
                    this.rowPool.push(tr);

                    // Remove from active
                    delete this.activeRows[index];
                }
            }
        }
    };

    /**
     * Render a single row
     */
    AR.DataGrid.RowFlyweight.prototype.renderRow = function(rowIndex) {
        var self = this;

        this.manager.getRow(rowIndex, function(rowData) {
            if (!rowData) return;

            // Get row from pool or create new
            var tr;
            if (self.rowPool.length > 0) {
                tr = self.rowPool.pop();
                self.updateRowData(tr, rowData, rowIndex);
            } else {
                tr = self.grid.createDataRow(rowData, rowIndex);
            }

            // Insert in correct position (before bottom spacer)
            self.grid.tbody.insertBefore(tr, self.bottomSpacer);

            // Mark as active
            self.activeRows[rowIndex] = tr;
        });
    };

    /**
     * Update existing row with new data (row recycling)
     */
    AR.DataGrid.RowFlyweight.prototype.updateRowData = function(tr, rowData, rowIndex) {
        tr.setAttribute('data-row-index', rowIndex);

        var cells = tr.querySelectorAll('td');
        var cellIndex = this.grid.hasNavigation ? 1 : 0;  // Skip indicator cell

        for (var i = 0; i < this.grid.columns.length; i++) {
            var column = this.grid.columns[i];
            var td = cells[cellIndex + i];

            if (td) {
                var value = rowData[column.index];

                if (value === undefined || value === null || value === '') {
                    td.textContent = '';
                    td.className = 'datagrid-cell-empty';
                } else {
                    if (column.isDate) {
                        td.textContent = this.grid.formatDateValue(value);
                        td.setAttribute('data-raw-value', value);
                    } else {
                        td.textContent = String(value);
                    }
                    td.className = '';
                }
            }
        }
    };

    /**
     * Scroll to specific row
     */
    AR.DataGrid.RowFlyweight.prototype.scrollToRow = function(rowIndex) {
        var scrollTop = rowIndex * this.rowHeight;
        this.container.scrollTop = scrollTop;
    };

    /**
     * Refresh viewport
     */
    AR.DataGrid.RowFlyweight.prototype.refresh = function() {
        this.render();
    };

    // ============================================================================
    // EXTEND AR.DataGrid with Manager Support
    // ============================================================================

    /**
     * Set data using a Manager instance
     *
     * @param {AR.DataGrid.Manager} manager - Data manager
     * @param {Object} flyweightOptions - Options for flyweight renderer
     */
    AR.DataGrid.prototype.setDataManager = function(manager, flyweightOptions) {
        if (!(manager instanceof AR.DataGrid.Manager)) {
            throw new Error('setDataManager requires an AR.DataGrid.Manager instance');
        }

        this.dataManager = manager;
        this.flyweight = new AR.DataGrid.RowFlyweight(this, manager, flyweightOptions);

        // Load all data for grouping/sorting support
        // For large datasets, this is loaded on-demand when grouping is enabled
        this.loadDataFromManager();

        this.displayedRowCount = manager.getTotalRows();

        if (this.hasNavigation) {
            this.updateRowIndicator();
            this.updateNavButtonStates();
        }
    };

    /**
     * Load data from Manager into this.data for grouping/sorting
     */
    AR.DataGrid.prototype.loadDataFromManager = function() {
        if (!this.dataManager) return;

        var self = this;
        var totalRows = this.dataManager.getTotalRows();

        this.data = [];
        var loaded = 0;

        // Load all data
        for (var i = 0; i < totalRows; i++) {
            (function(index) {
                self.dataManager.getRow(index, function(row) {
                    if (row) {
                        self.data[index] = row;
                    }

                    loaded++;

                    // Trigger render when all loaded
                    if (loaded === totalRows && self.flyweight) {
                        self.flyweight.render();
                    }
                });
            })(i);
        }
    };

    /**
     * Check if using manager mode
     */
    AR.DataGrid.prototype.isUsingManager = function() {
        return !!this.dataManager;
    };

    // Override enableGrouping to handle Manager mode
    var originalEnableGrouping = AR.DataGrid.prototype.enableGrouping;
    AR.DataGrid.prototype.enableGrouping = function() {
        // If using Manager, hide flyweight spacers
        if (this.flyweight) {
            this.flyweight.topSpacer.style.display = 'none';
            this.flyweight.bottomSpacer.style.display = 'none';
        }

        // Call original enableGrouping
        originalEnableGrouping.call(this);
    };

    // Override disableGrouping to restore Manager mode
    var originalDisableGrouping = AR.DataGrid.prototype.disableGrouping;
    AR.DataGrid.prototype.disableGrouping = function() {
        // Call original disableGrouping
        originalDisableGrouping.call(this);

        // If using Manager, restore flyweight spacers and re-render
        if (this.flyweight) {
            this.flyweight.topSpacer.style.display = '';
            this.flyweight.bottomSpacer.style.display = '';
            this.flyweight.render();
        }
    };

    // ============================================================================
    // EXPORT
    // ============================================================================

    window.AR = AR;

})(window);
