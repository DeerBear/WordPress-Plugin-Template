
/**
 * AR.Charts.js
 * Pure JavaScript Canvas-based Charting Component
 * Version: 2.0 (with Property Mapping Support)
 * 
 * Features:
 * - NEW: Property-based JSON mapping (works seamlessly with AR.DataGrid)
 * - Backward compatible with column-index approach
 * - Works with AR.DataGrid.Manager for large datasets
 * - Canvas-based rendering for performance
 * - Optional MVVM integration
 * - No dependencies, no build pipeline
 * - Chart types: Line, Bar, Pie, Area
 * - Responsive and accessible
 * - Export to PNG/JPEG
 * NOTE: the filter panel is called "Interactive legend" and it's located in the AR.Charts.Extension.js file
 */
(function (window) {
    'use strict';
    
    var AR = window.AR || {};
    var MVVM = window.MVVM || null; // Optional MVVM framework

    // =========================================================================
    // AR.Chart - Main Chart Component
    // =========================================================================
    
    /**
     * AR.Chart - Canvas-based charting component
     * 
     * @param {string|HTMLElement} selector - Canvas element or selector
     * @param {Object} options - Chart configuration
     * 
     * NEW: Property-based mapping (for JSON data):
     *   - xProperty: String - Property name for X-axis (e.g., 'month', 'date')
     *   - yProperty: String|Array - Property name(s) for Y-axis (e.g., 'sales' or ['sales', 'expenses'])
     *   - labelProperty: String - Property for pie chart labels
     *   - valueProperty: String - Property for pie chart values
     * 
     * Legacy: Column-based mapping (backward compatible):
     *   - xColumn: Number - Column index for X-axis (1-based)
     *   - yColumns: Number|Array - Column index(es) for Y-axis (1-based)
     *   - labelColumn: Number - Column for pie chart labels
     * 
     * Other options:
     *   - type: 'line'|'bar'|'pie'|'area' (default: 'line')
     *   - title: String - Chart title
     *   - legend: Boolean - Show legend (default: true)
     *   - colors: Array - Custom color palette
     *   - responsive: Boolean - Auto-resize on window resize (default: true)
     *   - animation: Boolean - Enable animations (default: true)
     *   - gridLines: Boolean - Show grid lines (default: true)
     *   - padding: Object - Chart padding {top, right, bottom, left}
     */
    AR.Chart = function (selector, options) {
        this.canvas = this.getElement(selector);
        if (!this.canvas) {
            throw new Error('Chart: canvas element not found: ' + selector);
        }
        if (this.canvas.tagName.toUpperCase() !== 'CANVAS') {
            throw new Error('Chart: element must be a <canvas>');
        }
        
        this.ctx = this.canvas.getContext('2d');
        
        // Default options
        var defaultOptions = {
            type: 'line',
            
            // NEW: Property-based mapping (preferred for JSON data)
            xProperty: null,
            yProperty: null,
            labelProperty: null,
            valueProperty: null,
            
            // Legacy: Column-based mapping (backward compatible)
            xColumn: 1,
            yColumns: [2],
            labelColumn: null,
            
            title: '',
            legend: true,
            colors: [
                '#007bff', '#28a745', '#dc3545', '#ffc107',
                '#17a2b8', '#6c757d', '#e83e8c', '#fd7e14'
            ],
            responsive: true,
            padding: {
                top: 40,
                right: 20,
                bottom: 60,
                left: 60
            },
            gridLines: true,
            animation: true,
            animationDuration: 500,
            showValues: false,
            valueFormatter: null,
            tooltips: true
        };
        
        // Merge options
        this.options = this.extend(defaultOptions, options || {});
        
        // Normalize yProperty to array
        if (this.options.yProperty && !Array.isArray(this.options.yProperty)) {
            this.options.yProperty = [this.options.yProperty];
        }
        
        // Normalize yColumns to array
        if (!Array.isArray(this.options.yColumns)) {
            this.options.yColumns = [this.options.yColumns];
        }
        
        // Determine which mapping mode to use
        this._usePropertyMapping = !!(this.options.xProperty || this.options.yProperty);
        
        // Base state
        this.data = options.data || [];
        this.dataManager = null;
        this.chartData = null;
        this.width = 0;
        this.height = 0;
        this.animationProgress = 1;
        
        // Internal flags for MVVM
        this._useMvvm = false;
        this._vm = null;
        
        // Initialize MVVM state (if MVVM exists)
        this.initMvvmState();
        
        // Setup canvas size
        this.setupCanvas();
        
        // Setup responsive behavior
        if (this.options.responsive) {
            this.setupResponsive();
        }
        
        // Initial processing / render
        if (this.data && this.data.length > 0) {
            this.processData();
            this.render();
        }
    };
    
    // =========================================================================
    // MVVM Integration
    // =========================================================================
    
    /**
     * Initialize internal MVVM view model if MVVM is available
     */
    AR.Chart.prototype.initMvvmState = function () {
        var self = this;
        
        if (!MVVM || !MVVM.observable) {
            this.type = this.options.type;
            return;
        }
        
        this._useMvvm = true;
        this._vm = {};
        
        // Core observables
        this._vm.type = MVVM.observable(this.options.type);
        this._vm.data = MVVM.observable(this.data || []);
        this._vm.options = MVVM.observable(this.options);
        
        // Computed empty state
        this._vm.isEmpty = MVVM.computed(function () {
            var d = self._vm.data();
            if (!d) return true;
            if (Array.isArray(d)) return d.length === 0;
            if (d.series && Array.isArray(d.series)) {
                return d.series.length === 0;
            }
            return false;
        });
        
        // Computed effective options
        this._vm.effectiveOptions = MVVM.computed(function () {
            var base = self._vm.options() || {};
            var t = self._vm.type();
            var empty = self._vm.isEmpty();
            
            var merged = self.extend({}, base);
            merged.type = t;
            merged.isEmpty = empty;
            return merged;
        });
        
        // Initial sync
        this.type = this._vm.type();
        this.options = this._vm.effectiveOptions();
        this.data = this._vm.data();
        
        // Subscriptions
        this._vm.type.subscribe(function (newType) {
            self.type = newType;
            self.options.type = newType;
            self._onTypeChanged();
        });
        
        this._vm.data.subscribe(function (newData) {
            self.data = newData || [];
            self._onDataChanged();
        });
        
        this._vm.effectiveOptions.subscribe(function (newOptions) {
            self.options = newOptions || {};
            self._onOptionsChanged();
        });
    };
    
    AR.Chart.prototype._onTypeChanged = function () {
        this.processData();
        this.render();
    };
    
    AR.Chart.prototype._onDataChanged = function () {
        this.processData();
        this.render();
    };
    
    AR.Chart.prototype._onOptionsChanged = function () {
        this.processData();
        this.render();
    };
    
    AR.Chart.prototype.getViewModel = function () {
        return this._useMvvm ? this._vm : null;
    };
    
    // =========================================================================
    // Utility Methods
    // =========================================================================
    
    AR.Chart.prototype.getElement = function (selector) {
        if (typeof selector === 'string') {
            return document.querySelector(selector);
        }
        return selector;
    };
    
    AR.Chart.prototype.extend = function (target, source) {
        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
                    target[key] = this.extend(target[key] || {}, source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        return target;
    };
    
    AR.Chart.prototype.formatNumber = function (num) {
        if (this.options.valueFormatter && typeof this.options.valueFormatter === 'function') {
            return this.options.valueFormatter(num);
        }
        
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    };
    
    // =========================================================================
    // Canvas / Layout
    // =========================================================================
    
    AR.Chart.prototype.setupCanvas = function () {
        var container = this.canvas.parentElement;
        var rect = container.getBoundingClientRect();
        var width = rect.width || 600;
        var height = rect.height || 400;
        
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        
        this.width = width;
        this.height = height;
    };
    
    AR.Chart.prototype.setupResponsive = function () {
        var self = this;
        var resizeTimeout;
        
        window.addEventListener('resize', function () {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(function () {
                self.setupCanvas();
                self.render();
            }, 250);
        });
    };
    
    // =========================================================================
    // Public Data / Options API
    // =========================================================================
    
    AR.Chart.prototype.setData = function (data) {
        if (!Array.isArray(data)) {
            throw new Error('Chart: data must be an array');
        }
        
        this.dataManager = null;
        
        if (this._useMvvm && this._vm && this._vm.data) {
            this._vm.data(data);
        } else {
            this.data = data;
            this.processData();
            this.render();
        }
        
        return this;
    };
    
    AR.Chart.prototype.setDataManager = function (manager) {
        if (!AR.DataGrid || !AR.DataGrid.Manager) {
            throw new Error('Chart: AR.DataGrid.Manager is required');
        }
        if (!(manager instanceof AR.DataGrid.Manager)) {
            throw new Error('Chart: manager must be an AR.DataGrid.Manager instance');
        }
        
        this.dataManager = manager;
        this.loadDataFromManager();
        return this;
    };
    
    AR.Chart.prototype.loadDataFromManager = function () {
        var self = this;
        var totalRows = this.dataManager.getTotalRows();
        var sampleSize = Math.min(totalRows, 1000);
        var tempData = [];
        var loaded = 0;
        
        for (var i = 0; i < sampleSize; i++) {
            var index = Math.floor((i / sampleSize) * totalRows);
            (function (idx) {
                self.dataManager.getRow(idx, function (row) {
                    if (row) {
                        tempData.push(row);
                    }
                    loaded++;
                    if (loaded === sampleSize) {
                        self.setData(tempData);
                    }
                });
            })(index);
        }
    };
    
    AR.Chart.prototype.setType = function (type) {
        if (this._useMvvm && this._vm && this._vm.type) {
            this._vm.type(type);
        } else {
            this.type = type;
            this.options.type = type;
            this._onTypeChanged();
        }
        return this;
    };
    
    AR.Chart.prototype.updateOptions = function (newOptions) {
        if (!newOptions) return this;
        
        if (this._useMvvm && this._vm && this._vm.options) {
            var merged = this.extend({}, this._vm.options() || {});
            merged = this.extend(merged, newOptions);
            this._vm.options(merged);
        } else {
            this.options = this.extend(this.options, newOptions);
            
            // Re-detect mapping mode if properties changed
            if (newOptions.xProperty !== undefined || newOptions.yProperty !== undefined) {
                this._usePropertyMapping = !!(this.options.xProperty || this.options.yProperty);
            }
            
            this.processData();
            this.render();
        }
        return this;
    };
    
    AR.Chart.prototype.setOptions = function (newOptions) {
        return this.updateOptions(newOptions);
    };
    
    // =========================================================================
    // Data Processing (MODIFIED FOR PROPERTY MAPPING)
    // =========================================================================
    
    AR.Chart.prototype.processData = function () {
        var type = this.options.type;
        
        switch (type) {
            case 'line':
            case 'area':
                this.chartData = this.processLineData();
                break;
            case 'bar':
                this.chartData = this.processBarData();
                break;
            case 'pie':
                this.chartData = this.processPieData();
                break;
            default:
                throw new Error('Chart: unknown chart type: ' + type);
        }
    };
    
    /**
     * Process data for line/area charts
     * Supports both property-based and column-based mapping
     */
    AR.Chart.prototype.processLineData = function () {
        var series = [];
        var yKeys, xKey;
        
        if (this._usePropertyMapping) {
            // NEW: Property-based mapping
            xKey = this.options.xProperty;
            yKeys = this.options.yProperty || [];
        } else {
            // Legacy: Column-based mapping
            xKey = this.options.xColumn;
            yKeys = this.options.yColumns;
        }
        
        for (var s = 0; s < yKeys.length; s++) {
            var yKey = yKeys[s];
            var points = [];
            
            for (var i = 0; i < this.data.length; i++) {
                var row = this.data[i];
                var x = row[xKey];
                var y = row[yKey];
                
                // Parse numeric values
                if (typeof y === 'string') {
                    y = parseFloat(y.replace(/[$,]/g, ''));
                }
                
                if (y != null && !isNaN(y)) {
                    points.push({ x: x, y: y, originalIndex: i });
                }
            }
            
            // Generate label (use property name for property mapping)
            var label = this._usePropertyMapping 
                ? (String(yKey) || 'Series ' + (s + 1))
                : 'Series ' + (s + 1);
            
            series.push({
                label: label,
                points: points,
                color: this.options.colors[s % this.options.colors.length]
            });
        }
        
        return { series: series };
    };
    
    /**
     * Process data for bar charts
     * Uses same logic as line charts
     */
    AR.Chart.prototype.processBarData = function () {
        return this.processLineData();
    };
    
    /**
     * Process data for pie charts
     * Supports both property-based and column-based mapping
     */
    AR.Chart.prototype.processPieData = function () {
        var labelKey, valueKey;
        
        if (this._usePropertyMapping) {
            // NEW: Property-based mapping
            labelKey = this.options.labelProperty || this.options.xProperty;
            valueKey = this.options.valueProperty || (this.options.yProperty ? this.options.yProperty[0] : null);
        } else {
            // Legacy: Column-based mapping
            labelKey = this.options.labelColumn || this.options.xColumn;
            valueKey = this.options.yColumns[0];
        }
        
        var slices = [];
        var total = 0;
        
        // First pass: collect data and calculate total
        for (var i = 0; i < this.data.length; i++) {
            var row = this.data[i];
            var label = row[labelKey];
            var value = row[valueKey];
            
            // Parse numeric values
            if (typeof value === 'string') {
                value = parseFloat(value.replace(/[$,]/g, ''));
            }
            
            if (value != null && !isNaN(value) && value > 0) {
                total += value;
                slices.push({
                    label: label,
                    value: value,
                    color: this.options.colors[i % this.options.colors.length]
                });
            }
        }
        
        // Second pass: calculate percentages
        for (var j = 0; j < slices.length; j++) {
            slices[j].percentage = (slices[j].value / total) * 100;
        }
        
        return { slices: slices, total: total };
    };
    
    // =========================================================================
    // Rendering
    // =========================================================================
    
    AR.Chart.prototype.render = function () {
        var self = this;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Check for empty data
        if (!this.data || this.data.length === 0) {
            this.drawEmptyState();
            return;
        }
        
        // Animate if enabled
        if (this.options.animation) {
            this.animationProgress = 0;
            this.animate();
        } else {
            this.animationProgress = 1;
            this.draw();
        }
    };
    
    AR.Chart.prototype.animate = function () {
        var self = this;
        var startTime = Date.now();
        var duration = this.options.animationDuration || 500;
        
        function step() {
            var elapsed = Date.now() - startTime;
            self.animationProgress = Math.min(elapsed / duration, 1);
            
            self.ctx.clearRect(0, 0, self.width, self.height);
            self.draw();
            
            if (self.animationProgress < 1) {
                requestAnimationFrame(step);
            }
        }
        
        requestAnimationFrame(step);
    };
    
    AR.Chart.prototype.draw = function () {
        var type = this.options.type;
        
        switch (type) {
            case 'line':
                this.drawLineChart();
                break;
            case 'bar':
                this.drawBarChart();
                break;
            case 'pie':
                this.drawPieChart();
                break;
            case 'area':
                this.drawAreaChart();
                break;
        }
    };
    
    AR.Chart.prototype.drawEmptyState = function () {
        var ctx = this.ctx;
        ctx.save();
        
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No data available', this.width / 2, this.height / 2);
        
        ctx.restore();
    };
    
    // =========================================================================
    // Line Chart
    // =========================================================================
    
    AR.Chart.prototype.drawLineChart = function () {
        if (!this.chartData || !this.chartData.series || this.chartData.series.length === 0) {
            return;
        }
        
        var pad = this.options.padding;
        var chartWidth = this.width - pad.left - pad.right;
        var chartHeight = this.height - pad.top - pad.bottom;
        
        // Draw title
        if (this.options.title) {
            this.drawTitle();
        }
        
        // Draw grid and axes
        if (this.options.gridLines) {
            this.drawGrid(pad.left, pad.top, chartWidth, chartHeight);
        }
        this.drawAxes(pad.left, pad.top, chartWidth, chartHeight);
        
        // Calculate scales
        var xScale = this.getXScale(this.chartData.series, pad.left, chartWidth);
        var yScale = this.getYScale(this.chartData.series, pad.top, chartHeight);
        
        // Draw each series (checking visibility from filter panel)
        for (var i = 0; i < this.chartData.series.length; i++) {
            // Skip hidden series if _seriesVisibility is set
            if (this._seriesVisibility && this._seriesVisibility[i] === false) {
                continue;
            }
            this.drawLineSeries(this.chartData.series[i], xScale, yScale, pad);
        }
        
        // Draw legend
        if (this.options.legend && this.chartData.series.length > 1) {
            this.drawLegend(this.chartData.series);
        }
    };
    
    AR.Chart.prototype.drawLineSeries = function (series, xScale, yScale, pad) {
        var ctx = this.ctx;
        var points = series.points;

        if (points.length === 0) return;

        ctx.save();
        ctx.strokeStyle = series.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();

        var chartHeight = this.height - pad.top - pad.bottom;
        var baselineY = pad.top + chartHeight;

        for (var i = 0; i < points.length; i++) {
            var point = points[i];
            var x = xScale(i);
            var y = yScale(point.y);

            // Fixed animation formula - animate from baseline up
            var animY = baselineY - (baselineY - y) * this.animationProgress;

            if (i === 0) {
                ctx.moveTo(x, animY);
            } else {
                ctx.lineTo(x, animY);
            }
        }

        ctx.stroke();
        
        // Draw points
        ctx.fillStyle = series.color;
        for (var j = 0; j < points.length; j++) {
            var pt = points[j];
            var px = xScale(j);
            var py = yScale(pt.y);

            // Fixed animation formula - animate from baseline up
            var animPy = baselineY - (baselineY - py) * this.animationProgress;

            ctx.beginPath();
            ctx.arc(px, animPy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    };
    
    // =========================================================================
    // Bar Chart
    // =========================================================================
    
    AR.Chart.prototype.drawBarChart = function () {
        if (!this.chartData || !this.chartData.series || this.chartData.series.length === 0) {
            return;
        }
        
        var pad = this.options.padding;
        var chartWidth = this.width - pad.left - pad.right;
        var chartHeight = this.height - pad.top - pad.bottom;
        
        // Draw title
        if (this.options.title) {
            this.drawTitle();
        }
        
        // Draw grid and axes
        if (this.options.gridLines) {
            this.drawGrid(pad.left, pad.top, chartWidth, chartHeight);
        }
        this.drawAxes(pad.left, pad.top, chartWidth, chartHeight);
        
        // Calculate scales
        var yScale = this.getYScale(this.chartData.series, pad.top, chartHeight);
        
        // Calculate bar dimensions
        var series = this.chartData.series;
        var numPoints = series[0].points.length;
        var numSeries = series.length;
        var groupWidth = chartWidth / numPoints;
        var barWidth = groupWidth / (numSeries + 1);
        
        // Draw bars for each series (checking visibility from filter panel)
        for (var s = 0; s < numSeries; s++) {
            // Skip hidden series if _seriesVisibility is set
            if (this._seriesVisibility && this._seriesVisibility[s] === false) {
                continue;
            }
            var seriesData = series[s];

            for (var i = 0; i < seriesData.points.length; i++) {
                var point = seriesData.points[i];
                var x = pad.left + (i * groupWidth) + (s * barWidth) + barWidth / 2;
                var y = yScale(point.y);
                var barHeight = (pad.top + chartHeight) - y;
                
                // Apply animation
                var animHeight = barHeight * this.animationProgress;
                
                this.ctx.fillStyle = seriesData.color;
                this.ctx.fillRect(x, pad.top + chartHeight - animHeight, barWidth, animHeight);
                
                // Draw value on top if enabled
                if (this.options.showValues) {
                    this.ctx.save();
                    this.ctx.font = '11px sans-serif';
                    this.ctx.fillStyle = '#666';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(
                        this.formatNumber(point.y),
                        x + barWidth / 2,
                        pad.top + chartHeight - animHeight - 5
                    );
                    this.ctx.restore();
                }
            }
        }
        
        // Draw legend
        if (this.options.legend && series.length > 1) {
            this.drawLegend(series);
        }
    };
    
    // =========================================================================
    // Area Chart
    // =========================================================================
    
    AR.Chart.prototype.drawAreaChart = function () {
        if (!this.chartData || !this.chartData.series || this.chartData.series.length === 0) {
            return;
        }
        
        var pad = this.options.padding;
        var chartWidth = this.width - pad.left - pad.right;
        var chartHeight = this.height - pad.top - pad.bottom;
        
        // Draw title
        if (this.options.title) {
            this.drawTitle();
        }
        
        // Draw grid and axes
        if (this.options.gridLines) {
            this.drawGrid(pad.left, pad.top, chartWidth, chartHeight);
        }
        this.drawAxes(pad.left, pad.top, chartWidth, chartHeight);
        
        // Calculate scales
        var xScale = this.getXScale(this.chartData.series, pad.left, chartWidth);
        var yScale = this.getYScale(this.chartData.series, pad.top, chartHeight);
        
        var baselineY = pad.top + chartHeight;
        
        // Draw each series (checking visibility from filter panel)
        for (var i = 0; i < this.chartData.series.length; i++) {
            // Skip hidden series if _seriesVisibility is set
            if (this._seriesVisibility && this._seriesVisibility[i] === false) {
                continue;
            }
            var series = this.chartData.series[i];
            var points = series.points;

            if (points.length === 0) continue;
            
            var ctx = this.ctx;
            ctx.save();
            
            // Draw filled area
            ctx.fillStyle = this.hexToRgba(series.color, 0.3);
            ctx.beginPath();
            
            var firstX = xScale(0);
            var firstY = yScale(points[0].y);
            var animFirstY = baselineY - (baselineY - firstY) * this.animationProgress;
            
            ctx.moveTo(firstX, baselineY);
            ctx.lineTo(firstX, animFirstY);
            
            for (var j = 0; j < points.length; j++) {
                var x = xScale(j);
                var y = yScale(points[j].y);
                var animY = baselineY - (baselineY - y) * this.animationProgress;
                ctx.lineTo(x, animY);
            }
            
            var lastX = xScale(points.length - 1);
            ctx.lineTo(lastX, baselineY);
            ctx.closePath();
            ctx.fill();
            
            // Draw line on top
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (var k = 0; k < points.length; k++) {
                var px = xScale(k);
                var py = yScale(points[k].y);
                var animPy = baselineY - (baselineY - py) * this.animationProgress;
                
                if (k === 0) {
                    ctx.moveTo(px, animPy);
                } else {
                    ctx.lineTo(px, animPy);
                }
            }
            
            ctx.stroke();
            ctx.restore();
        }
        
        // Draw legend
        if (this.options.legend && this.chartData.series.length > 1) {
            this.drawLegend(this.chartData.series);
        }
    };
    
    // =========================================================================
    // Pie Chart
    // =========================================================================
    
    AR.Chart.prototype.drawPieChart = function () {
        if (!this.chartData || !this.chartData.slices || this.chartData.slices.length === 0) {
            return;
        }

        // Draw title
        var titleHeight = 0;
        if (this.options.title) {
            this.drawTitle();
            titleHeight = 40;
        }

        var ctx = this.ctx;

        // Calculate legend dimensions (legend on right side)
        var legendWidth = this.options.legend ? 160 : 0;
        var padding = 20;

        // Calculate available space
        var availableWidth = this.width - legendWidth - padding;
        var availableHeight = this.height - titleHeight - padding * 2;

        // Use the SMALLER of width/height to ensure a perfect circle
        var size = Math.min(availableWidth, availableHeight);
        var radius = (size / 2) - 10;
        radius = Math.max(radius, 50); // Minimum radius

        // Center the pie in the available space (left of legend)
        var centerX = padding + (availableWidth / 2);
        var centerY = titleHeight + padding + (availableHeight / 2);

        var startAngle = -Math.PI / 2;

        // Calculate total percentage of visible slices
        var visibleTotal = 0;
        for (var v = 0; v < this.chartData.slices.length; v++) {
            if (!this._seriesVisibility || this._seriesVisibility[v] !== false) {
                visibleTotal += this.chartData.slices[v].percentage;
            }
        }
        if (visibleTotal === 0) visibleTotal = 1; // Avoid division by zero

        // Draw slices (checking visibility from filter panel)
        for (var i = 0; i < this.chartData.slices.length; i++) {
            // Skip hidden slices if _seriesVisibility is set
            if (this._seriesVisibility && this._seriesVisibility[i] === false) {
                continue;
            }
            var slice = this.chartData.slices[i];
            // Recalculate percentage based on visible slices only
            var adjustedPercentage = (slice.percentage / visibleTotal) * 100;
            var sliceAngle = (adjustedPercentage / 100) * 2 * Math.PI * this.animationProgress;

            ctx.save();
            ctx.fillStyle = slice.color;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();

            // Draw percentage label inside slice (only if slice is big enough)
            if (adjustedPercentage > 5) {
                var labelAngle = startAngle + sliceAngle / 2;
                var labelX = centerX + Math.cos(labelAngle) * (radius * 0.65);
                var labelY = centerY + Math.sin(labelAngle) * (radius * 0.65);

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Add text shadow for better readability
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = 2;
                ctx.fillText(adjustedPercentage.toFixed(1) + '%', labelX, labelY);
                ctx.shadowBlur = 0;
            }

            ctx.restore();

            startAngle += sliceAngle;
        }

        // Draw legend on the right side
        if (this.options.legend) {
            this.drawPieLegendRight(this.chartData.slices, this.width - legendWidth, titleHeight + 20);
        }
    };

    // New legend function that draws on the right side
    AR.Chart.prototype.drawPieLegendRight = function (slices, x, y) {
        var ctx = this.ctx;
        var legendY = y;

        ctx.save();
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        for (var i = 0; i < slices.length; i++) {
            // Skip hidden slices in legend
            if (this._seriesVisibility && this._seriesVisibility[i] === false) {
                continue;
            }
            var slice = slices[i];
            var itemY = legendY + (i * 22);

            // Color box
            ctx.fillStyle = slice.color;
            ctx.fillRect(x, itemY, 14, 14);

            // Label
            ctx.fillStyle = '#333';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(slice.label + ' (' + slice.percentage.toFixed(1) + '%)', x + 20, itemY + 1);
        }

        ctx.restore();
    };
    
    // =========================================================================
    // Drawing Utilities
    // =========================================================================
    
    AR.Chart.prototype.drawTitle = function () {
        var ctx = this.ctx;
        ctx.save();
        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText(this.options.title, this.width / 2, 20);
        ctx.restore();
    };
    
    AR.Chart.prototype.drawAxes = function (x, y, width, height) {
        var ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        
        // Y axis
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height);
        ctx.stroke();
        
        // X axis
        ctx.beginPath();
        ctx.moveTo(x, y + height);
        ctx.lineTo(x + width, y + height);
        ctx.stroke();
        
        ctx.restore();
    };
    
    AR.Chart.prototype.drawGrid = function (x, y, width, height) {
        var ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        
        var numLines = 5;
        
        // Horizontal grid lines
        for (var i = 0; i <= numLines; i++) {
            var gridY = y + (height / numLines) * i;
            ctx.beginPath();
            ctx.moveTo(x, gridY);
            ctx.lineTo(x + width, gridY);
            ctx.stroke();
        }
        
        ctx.restore();
    };
    
    AR.Chart.prototype.drawLegend = function (series) {
        var ctx = this.ctx;
        var legendX = this.width - this.options.padding.right - 120;
        var legendY = this.options.padding.top;
        
        ctx.save();
        ctx.font = '12px sans-serif';
        
        for (var i = 0; i < series.length; i++) {
            var seriesData = series[i];
            var itemY = legendY + (i * 20);
            
            // Color box
            ctx.fillStyle = seriesData.color;
            ctx.fillRect(legendX, itemY, 12, 12);
            
            // Label
            ctx.fillStyle = '#333';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(seriesData.label, legendX + 18, itemY);
        }
        
        ctx.restore();
    };
    
    AR.Chart.prototype.drawPieLegend = function (slices) {
        var ctx = this.ctx;
        var legendX = 20;
        var legendY = this.height - (slices.length * 25) - 20;
        
        ctx.save();
        ctx.font = '12px sans-serif';
        
        for (var i = 0; i < slices.length; i++) {
            var slice = slices[i];
            var itemY = legendY + (i * 25);
            
            // Color box
            ctx.fillStyle = slice.color;
            ctx.fillRect(legendX, itemY, 12, 12);
            
            // Label
            ctx.fillStyle = '#333';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(slice.label + ' (' + slice.percentage.toFixed(1) + '%)', legendX + 18, itemY);
        }
        
        ctx.restore();
    };
    
    // =========================================================================
    // Scale Calculations
    // =========================================================================
    
    AR.Chart.prototype.getXScale = function (series, offsetX, width) {
        var maxPoints = 0;
        for (var i = 0; i < series.length; i++) {
            maxPoints = Math.max(maxPoints, series[i].points.length);
        }
        
        var stepSize = width / Math.max(maxPoints - 1, 1);
        
        return function (index) {
            return offsetX + (index * stepSize);
        };
    };
    
    AR.Chart.prototype.getYScale = function (series, offsetY, height) {
        var minY = Infinity;
        var maxY = -Infinity;
        
        for (var i = 0; i < series.length; i++) {
            var points = series[i].points;
            for (var j = 0; j < points.length; j++) {
                var y = points[j].y;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        
        // Add padding to range
        var range = maxY - minY;
        var padding = range * 0.1;
        minY = Math.max(0, minY - padding);
        maxY = maxY + padding;
        
        var scale = height / (maxY - minY);
        
        return function (value) {
            return offsetY + height - ((value - minY) * scale);
        };
    };
    
    // =========================================================================
    // Color Utilities
    // =========================================================================
    
    AR.Chart.prototype.hexToRgba = function (hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    };
    
    // =========================================================================
    // Export
    // =========================================================================
    
    AR.Chart.prototype.exportToPNG = function () {
        return this.canvas.toDataURL('image/png');
    };
    
    AR.Chart.prototype.exportToJPEG = function (quality) {
        return this.canvas.toDataURL('image/jpeg', quality || 0.9);
    };
    
    AR.Chart.prototype.downloadChart = function (filename, format) {
        format = format || 'png';
        filename = filename || 'chart.' + format;
        
        var dataURL = format === 'jpeg' ? this.exportToJPEG() : this.exportToPNG();
        
        var link = document.createElement('a');
        link.download = filename;
        link.href = dataURL;
        link.click();
    };
    
    // =========================================================================
    // Cleanup
    // =========================================================================
    
    AR.Chart.prototype.destroy = function () {
        // Remove event listeners
        if (this.options.responsive) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        
        // Clear MVVM subscriptions
        if (this._useMvvm && this._vm) {
            // MVVM subscriptions are automatically cleaned up
            this._vm = null;
        }
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Clear references
        this.canvas = null;
        this.ctx = null;
        this.data = null;
        this.chartData = null;
    };
    
    // =========================================================================
    // Export to global namespace
    // =========================================================================
    
    window.AR = AR;
    
})(window);