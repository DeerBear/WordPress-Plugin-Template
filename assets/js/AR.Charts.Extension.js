/**
AR.Charts.Extension.js - Complete Filter Panel Implementation
✅ Overflow fix: Removed hardcoded maxHeight + added .ar-chart-filter-content wrapper
✅ Callback API: addFilterCallback() / removeFilterCallback() / setFilterCallback()
✅ Double-load guard: Prevents MVVM corruption when loaded twice
✅ Series visibility filters with toggle checkboxes
✅ Date range filters with From/To date inputs
✅ Categorical filters for string-based data columns
✅ Numeric range filters with Min/Max inputs per series
✅ ZERO feature removal - all UI polish preserved (RTL, accordions, hover effects)
@version 3.2.0 - FIXED duplicate function definitions that broke Apply buttons
*/
(function(window) {
'use strict';

// Ensure AR namespace exists
if (typeof window.AR === 'undefined' || typeof window.AR.Chart === 'undefined') {
    console.error('AR.Charts.Extension requires AR.Chart to be loaded first');
    return;
}

// ✅ FIX 1: SMART GUARD - Check if methods already exist on current AR.Chart prototype
// This handles the case where AR.Charts.js is reloaded after the extension
if (typeof AR.Chart.prototype.addFilterCallback === 'function') {
    console.warn('AR.Charts.Extension already applied to this AR.Chart - skipping');
    return;
}

// Extension configuration
const CONFIG = {
    wrapperClass: 'ar-chart-wrapper',
    panelClass: 'ar-chart-filter-panel',
    sectionClass: 'ar-filter-section',
    seriesListClass: 'ar-series-list',
    dateFilterClass: 'ar-date-filter',
    checkboxClass: 'ar-series-checkbox',
    labelClass: 'ar-series-label',
    colorIndicatorClass: 'ar-series-color',
    dateInputClass: 'ar-date-input',
    panelWidth: '280px',
    animationDuration: 300
};

// Store original setData method
const originalSetData = AR.Chart.prototype.setData;
const originalConstructor = AR.Chart;

// Track which charts have been enhanced
const enhancedCharts = new WeakSet();

/**
 * Enhanced setData method that triggers filter panel creation
 */
AR.Chart.prototype.setData = function(data, skipProcess) {
    // ✅ Store raw data for dimension filtering
    this._rawData = data;
    console.log('[Extension] setData called, storing _rawData with', data ? data.length : 0, 'rows');

    // Call original setData
    originalSetData.call(this, data, skipProcess);

    console.log('[Extension] After originalSetData, chartData:', this.chartData);
    console.log('[Extension] Chart type:', this.options?.type);
    console.log('[Extension] Chart canvas:', this.canvas);

    // Create filter panel if not already created
    if (!enhancedCharts.has(this)) {
        try {
            createFilterPanel(this);
            enhancedCharts.add(this);
        } catch (error) {
            console.error('Error creating filter panel:', error);
        }
    } else {
        // Update existing panel with new data
        try {
            updateFilterPanel(this);
        } catch (error) {
            console.error('Error updating filter panel:', error);
        }
    }

    return this;
};

/**
 * Sets friendly labels for data columns (used in filter panel)
 * @param {Object} labels - Object mapping column keys to labels, e.g., { '2': 'Market Share', '3': 'Revenue' }
 */
AR.Chart.prototype.setColumnLabels = function(labels) {
    this._columnLabels = labels;
    console.log('[Extension] Column labels set:', labels);
    return this;
};

/**
 * Creates the complete filter panel structure
 * @param {AR.Chart} chart - The chart instance
 */
function createFilterPanel(chart) {
    console.log('[Extension] createFilterPanel called for chart type:', chart.options?.type);

    // Create wrapper element reference if it doesn't exist
    if (!chart.element) {
        chart.element = chart.canvas;
    }

    if (!chart.element || !chart.chartData) {
        return;
    }

    // Check if already wrapped
    if (chart.element.parentElement && 
        chart.element.parentElement.classList.contains(CONFIG.wrapperClass)) {
        return;
    }

    // Determine document direction
    const isRTL = document.documentElement.dir === 'rtl' || 
                  document.body.dir === 'rtl' ||
                  getComputedStyle(document.documentElement).direction === 'rtl';

    // Create wrapper container
    const wrapper = document.createElement('div');
    wrapper.className = CONFIG.wrapperClass;
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'row';
    wrapper.style.gap = '20px';
    wrapper.style.alignItems = 'flex-start'; // Panel aligns to top, height set explicitly
    wrapper.style.width = '100%';
    wrapper.setAttribute('dir', isRTL ? 'rtl' : 'ltr');

    // Create filter panel
    const panel = document.createElement('div');
    panel.className = CONFIG.panelClass;
    panel.style.width = CONFIG.panelWidth;
    panel.style.minWidth = CONFIG.panelWidth;
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.backgroundColor = '#ffffff';
    panel.style.border = '1px solid #e0e0e0';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    panel.style.overflow = 'hidden'; // Contains the content
    panel.style.position = 'relative'; // Override CSS absolute positioning
    panel.style.top = 'auto';
    panel.style.right = 'auto';
    panel.style.maxHeight = 'none'; // Will be set dynamically
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', 'Chart filters');

    // Create chart container
    const chartContainer = document.createElement('div');
    chartContainer.className = 'ar-chart-container';
    chartContainer.style.flex = '1';
    chartContainer.style.minWidth = '0';
    chartContainer.style.position = 'relative';

    // Insert wrapper before chart element
    const parent = chart.element.parentElement;
    parent.insertBefore(wrapper, chart.element);

    // Move chart into container
    chartContainer.appendChild(chart.element);

    // Arrange panel and chart based on direction
    if (isRTL) {
        wrapper.appendChild(chartContainer);
        wrapper.appendChild(panel);
    } else {
        wrapper.appendChild(panel);
        wrapper.appendChild(chartContainer);
    }

    // Store references
    chart._filterPanel = panel;
    chart._chartWrapper = wrapper;
    chart._chartContainer = chartContainer;
    chart._isRTL = isRTL;

    // Build panel content
    buildPanelContent(chart, panel);

    // ✅ CRITICAL: Resize canvas to fit new container (after panel takes space)
    // Without this, the canvas stays at its original size and gets CSS-squeezed
    if (chart.setupCanvas && chart.render) {
        console.log('[Extension] Resizing canvas to fit new container...');
        chart.setupCanvas();
        chart.render();
    }

    // ✅ Sync panel height with chart canvas
    syncPanelHeight(chart);

    // Re-sync on window resize
    const resizeHandler = debounce(function() {
        syncPanelHeight(chart);
    }, 100);
    window.addEventListener('resize', resizeHandler);
    chart._resizeHandler = resizeHandler;
}

/**
 * Syncs the filter panel height with the chart canvas height
 * @param {AR.Chart} chart - The chart instance
 */
function syncPanelHeight(chart) {
    if (!chart._filterPanel || !chart.element) {
        return;
    }

    // Get the chart canvas height
    const canvas = chart.canvas || chart.element;
    let canvasHeight = canvas.offsetHeight || canvas.clientHeight;

    // If canvas height not available yet, try again after render
    if (!canvasHeight || canvasHeight < 100) {
        requestAnimationFrame(function() {
            syncPanelHeight(chart);
        });
        return;
    }

    // Set panel height to match canvas exactly
    chart._filterPanel.style.height = canvasHeight + 'px';
    chart._filterPanel.style.maxHeight = canvasHeight + 'px';
}

/**
 * Simple debounce utility
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Builds the content of the filter panel
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} panel - The panel element
 */
function buildPanelContent(chart, panel) {
    console.log('[Extension] buildPanelContent called');

    // Clear existing content
    panel.innerHTML = '';

    // ✅ Create STATIC header (not collapsible)
    console.log('[Extension] Creating static panel header...');
    const panelHeader = document.createElement('div');
    panelHeader.className = 'ar-chart-filter-header';
    panelHeader.style.display = 'flex';
    panelHeader.style.alignItems = 'center';
    panelHeader.style.padding = '14px 16px';
    panelHeader.style.backgroundColor = '#f8f9fa';
    panelHeader.style.borderBottom = '1px solid #e0e0e0';
    panelHeader.style.flexShrink = '0';

    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'Filters';
    headerTitle.style.fontWeight = '600';
    headerTitle.style.fontSize = '16px';
    headerTitle.style.color = '#333333';

    panelHeader.appendChild(headerTitle);

    // ✅ Create scrollable content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'ar-chart-filter-content';
    contentWrapper.style.flex = '1';
    contentWrapper.style.overflowY = 'auto';
    contentWrapper.style.padding = '12px';

    // ✅ Create "Value Filters" accordion section
    const isPieChart = chart.options && chart.options.type === 'pie';

    const valueFiltersAccordion = createAccordionSection('Value Filters', true);
    const valueFiltersContent = valueFiltersAccordion.querySelector('.ar-accordion-content');

    // Add dimension filters to Value Filters section
    addDateRangeContent(chart, valueFiltersContent);
    addNumericRangeContent(chart, valueFiltersContent);
    // Skip categorical for pie charts - the Slices section already shows the same items
    if (!isPieChart) {
        addCategoricalContent(chart, valueFiltersContent);
    }

    // Create Series/Slices accordion section (named appropriately for chart type)
    const seriesTitle = isPieChart ? 'Slices' : 'Series';
    const seriesAccordion = createAccordionSection(seriesTitle, true);
    const seriesContent = seriesAccordion.querySelector('.ar-accordion-content');

    // Add series/slice visibility toggles
    createSeriesItems(chart, seriesContent);

    // Assemble structure
    contentWrapper.appendChild(valueFiltersAccordion);
    contentWrapper.appendChild(seriesAccordion);
    panel.appendChild(panelHeader);
    panel.appendChild(contentWrapper);

    console.log('[Extension] Panel structure assembled with Value Filters and Series accordions');
}

/**
 * Creates a collapsible accordion section
 * @param {string} title - The section title
 * @param {boolean} expanded - Whether the section starts expanded
 * @returns {HTMLElement} The accordion section element
 */
function createAccordionSection(title, expanded) {
    const section = document.createElement('div');
    section.className = 'ar-filter-accordion-section';
    section.style.marginBottom = '8px';
    section.style.border = '1px solid #e0e0e0';
    section.style.borderRadius = '6px';
    section.style.overflow = 'hidden';

    // Accordion header
    const header = document.createElement('div');
    header.className = 'ar-accordion-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '10px 12px';
    header.style.backgroundColor = '#f5f5f5';
    header.style.cursor = 'pointer';
    header.style.userSelect = 'none';
    header.style.transition = 'background-color 0.2s';
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    header.setAttribute('tabindex', '0');

    const headerTitle = document.createElement('span');
    headerTitle.textContent = title;
    headerTitle.style.fontWeight = '500';
    headerTitle.style.fontSize = '14px';
    headerTitle.style.color = '#333333';

    const headerIcon = document.createElement('span');
    headerIcon.className = 'ar-accordion-icon';
    headerIcon.innerHTML = '▼';
    headerIcon.style.fontSize = '10px';
    headerIcon.style.transition = 'transform 0.2s';
    headerIcon.style.color = '#666666';
    headerIcon.style.transform = expanded ? 'rotate(0deg)' : 'rotate(-90deg)';

    header.appendChild(headerTitle);
    header.appendChild(headerIcon);

    // Accordion content
    const content = document.createElement('div');
    content.className = 'ar-accordion-content';
    content.style.padding = '12px';
    content.style.backgroundColor = '#ffffff';
    content.style.display = expanded ? 'block' : 'none';

    // Toggle behavior
    let isExpanded = expanded;
    header.addEventListener('click', function() {
        isExpanded = !isExpanded;
        content.style.display = isExpanded ? 'block' : 'none';
        headerIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
        header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    });

    header.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            header.click();
        }
    });

    header.addEventListener('mouseenter', function() {
        header.style.backgroundColor = '#ebebeb';
    });

    header.addEventListener('mouseleave', function() {
        header.style.backgroundColor = '#f5f5f5';
    });

    section.appendChild(header);
    section.appendChild(content);

    return section;
}

/**
 * Creates series visibility items (checkboxes)
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function createSeriesItems(chart, container) {
    if (!chart.chartData) {
        return;
    }

    // Handle both series (line/bar/area) and slices (pie)
    // Explicitly check for pie chart type to use slices
    let items;
    if (chart.options && chart.options.type === 'pie') {
        items = chart.chartData.slices || [];
        console.log('[Extension] Pie chart detected, using slices:', items.length);
    } else {
        items = chart.chartData.series || [];
        console.log('[Extension] Non-pie chart, using series:', items.length);
    }

    if (items.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = 'No series data';
        emptyMsg.style.color = '#999';
        emptyMsg.style.fontSize = '13px';
        emptyMsg.style.fontStyle = 'italic';
        container.appendChild(emptyMsg);
        return;
    }

    // Initialize visibility state
    if (!chart._seriesVisibility) {
        chart._seriesVisibility = {};
        items.forEach(function(item, index) {
            chart._seriesVisibility[index] = true;
        });
    }

    items.forEach(function(item, index) {
        const itemEl = document.createElement('div');
        itemEl.className = 'ar-series-item';
        itemEl.style.display = 'flex';
        itemEl.style.alignItems = 'center';
        itemEl.style.padding = '6px 0';
        itemEl.style.cursor = 'pointer';

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = chart._seriesVisibility[index] !== false;
        checkbox.style.marginRight = '8px';
        checkbox.style.cursor = 'pointer';

        // Color indicator
        const colorBox = document.createElement('span');
        colorBox.style.width = '12px';
        colorBox.style.height = '12px';
        colorBox.style.backgroundColor = item.color || '#007bff';
        colorBox.style.borderRadius = '2px';
        colorBox.style.marginRight = '8px';
        colorBox.style.flexShrink = '0';

        // Label - check multiple sources for the label
        const label = document.createElement('span');
        let labelText = item.label || item.name;
        // Also try chart.options.seriesLabels if available
        if (!labelText && chart.options && chart.options.seriesLabels && chart.options.seriesLabels[index]) {
            labelText = chart.options.seriesLabels[index];
        }
        label.textContent = labelText || ('Series ' + (index + 1));
        label.style.fontSize = '13px';
        label.style.color = '#333';

        itemEl.appendChild(checkbox);
        itemEl.appendChild(colorBox);
        itemEl.appendChild(label);

        // Toggle handler
        function toggleSeries() {
            chart._seriesVisibility[index] = checkbox.checked;
            itemEl.style.opacity = checkbox.checked ? '1' : '0.5';

            // Trigger filter callback if registered
            if (chart._filterCallbacks && chart._filterCallbacks.length > 0) {
                const visibleSeries = Object.keys(chart._seriesVisibility)
                    .filter(function(key) { return chart._seriesVisibility[key]; })
                    .map(function(key) { return parseInt(key); });

                chart._filterCallbacks.forEach(function(callback) {
                    callback(visibleSeries);
                });
            }

            // Re-render chart
            if (chart.render) {
                chart.render();
            }
        }

        checkbox.addEventListener('change', toggleSeries);
        itemEl.addEventListener('click', function(e) {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                toggleSeries();
            }
        });

        container.appendChild(itemEl);
    });
}

/**
 * Creates a simple labeled sub-section within the Value Filters accordion
 * @param {string} title - The section label
 * @returns {HTMLElement} The section element with a content div
 */
function createFilterSubSection(title) {
    const section = document.createElement('div');
    section.className = 'ar-filter-subsection';
    section.style.marginBottom = '16px';

    const label = document.createElement('div');
    label.className = 'ar-filter-subsection-label';
    label.textContent = title;
    label.style.fontWeight = '500';
    label.style.fontSize = '13px';
    label.style.color = '#555';
    label.style.marginBottom = '8px';
    label.style.borderBottom = '1px solid #eee';
    label.style.paddingBottom = '4px';

    const content = document.createElement('div');
    content.className = 'ar-filter-subsection-content';

    section.appendChild(label);
    section.appendChild(content);

    return section;
}

/**
 * Adds date range filter content to a container (simplified version)
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function addDateRangeContent(chart, container) {
    console.log('[Extension] addDateRangeContent called');
    console.log('[Extension] chartData:', chart.chartData);
    console.log('[Extension] chartData.labels:', chart.chartData?.labels);
    console.log('[Extension] chartData.series:', chart.chartData?.series);

    // Check for date data in various formats
    let dates = [];

    // Try labels first
    if (chart.chartData && chart.chartData.labels && chart.chartData.labels.length > 0) {
        dates = chart.chartData.labels;
    }
    // Try getting dates from series points
    else if (chart.chartData && chart.chartData.series && chart.chartData.series.length > 0) {
        const firstSeries = chart.chartData.series[0];
        if (firstSeries.points && firstSeries.points.length > 0) {
            dates = firstSeries.points.map(p => p.x);
        }
    }
    // Try raw data column 1 (usually dates)
    else if (chart._rawData && chart._rawData.length > 0) {
        dates = chart._rawData.map(row => row[1] || row['date'] || row['Date']);
    }

    console.log('[Extension] Detected dates:', dates.slice(0, 3), '... (' + dates.length + ' total)');

    if (dates.length === 0) {
        console.log('[Extension] No dates found, skipping date range filter');
        return;
    }

    // Check if values look like dates
    const firstDate = dates[0];
    if (typeof firstDate !== 'string' || !firstDate.match(/^\d{4}-\d{2}-\d{2}/)) {
        console.log('[Extension] First value not a date format:', firstDate);
        return;
    }

    const section = createFilterSubSection('Date Range');
    const content = section.querySelector('.ar-filter-subsection-content');

    // From input
    const fromGroup = document.createElement('div');
    fromGroup.style.marginBottom = '8px';

    const fromLabel = document.createElement('label');
    fromLabel.textContent = 'From:';
    fromLabel.style.display = 'block';
    fromLabel.style.fontSize = '12px';
    fromLabel.style.color = '#666';
    fromLabel.style.marginBottom = '4px';

    const fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.className = 'ar-date-input';
    fromInput.style.width = '100%';
    fromInput.style.padding = '6px 8px';
    fromInput.style.border = '1px solid #ddd';
    fromInput.style.borderRadius = '4px';
    fromInput.style.fontSize = '13px';
    fromInput.value = dates[0];

    fromGroup.appendChild(fromLabel);
    fromGroup.appendChild(fromInput);

    // To input
    const toGroup = document.createElement('div');
    toGroup.style.marginBottom = '8px';

    const toLabel = document.createElement('label');
    toLabel.textContent = 'To:';
    toLabel.style.display = 'block';
    toLabel.style.fontSize = '12px';
    toLabel.style.color = '#666';
    toLabel.style.marginBottom = '4px';

    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.className = 'ar-date-input';
    toInput.style.width = '100%';
    toInput.style.padding = '6px 8px';
    toInput.style.border = '1px solid #ddd';
    toInput.style.borderRadius = '4px';
    toInput.style.fontSize = '13px';
    toInput.value = dates[dates.length - 1];

    toGroup.appendChild(toLabel);
    toGroup.appendChild(toInput);

    content.appendChild(fromGroup);
    content.appendChild(toGroup);

    // Button container for Apply and Reset
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    btnContainer.style.marginTop = '8px';

    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.flex = '1';
    applyBtn.style.padding = '8px';
    applyBtn.style.backgroundColor = '#007bff';
    applyBtn.style.color = 'white';
    applyBtn.style.border = 'none';
    applyBtn.style.borderRadius = '4px';
    applyBtn.style.cursor = 'pointer';
    applyBtn.style.fontSize = '13px';
    applyBtn.addEventListener('click', function(e) {
        console.log('[Extension] Date Apply button CLICKED!');
        e.stopPropagation(); // Prevent event bubbling
        applyDateFilter(chart, fromInput, toInput);
    });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.flex = '1';
    resetBtn.style.padding = '8px';
    resetBtn.style.backgroundColor = '#6c757d';
    resetBtn.style.color = 'white';
    resetBtn.style.border = 'none';
    resetBtn.style.borderRadius = '4px';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.fontSize = '13px';
    resetBtn.addEventListener('click', function(e) {
        console.log('[Extension] Date Reset button CLICKED!');
        e.stopPropagation(); // Prevent event bubbling
        fromInput.value = dates[0];
        toInput.value = dates[dates.length - 1];
        resetDateFilter(chart);
    });

    btnContainer.appendChild(applyBtn);
    btnContainer.appendChild(resetBtn);
    content.appendChild(btnContainer);
    container.appendChild(section);
}

/**
 * Adds numeric range filter content to a container
 * Now detects numeric columns from raw data for all chart types
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function addNumericRangeContent(chart, container) {
    console.log('[Extension] addNumericRangeContent called');

    // Detect numeric columns from raw data
    const numericColumns = detectNumericColumnsFromRawData(chart);
    console.log('[Extension] Detected numeric columns:', numericColumns);

    if (numericColumns.length === 0) {
        console.log('[Extension] No numeric columns found in raw data');
        return;
    }

    // Create a filter section for each numeric column
    numericColumns.forEach(function(colInfo) {
        const section = createFilterSubSection(colInfo.label + ' Range');
        const content = section.querySelector('.ar-filter-subsection-content');

        createNumericRangeInputs(chart, content, colInfo);
        container.appendChild(section);
    });
}

/**
 * Detects numeric columns from raw data
 */
function detectNumericColumnsFromRawData(chart) {
    const columns = [];

    if (!chart._rawData || chart._rawData.length === 0) {
        return columns;
    }

    // Get all keys from the first row
    const firstRow = chart._rawData[0];
    const keys = Object.keys(firstRow);
    const yColumns = chart.options && chart.options.yColumns ? chart.options.yColumns : [];
    const isPie = chart.options && chart.options.type === 'pie';
    let numericIndex = 0;

    keys.forEach(function(key) {
        // Check if this column contains numeric values
        let min = Infinity;
        let max = -Infinity;
        let hasNumeric = false;

        chart._rawData.forEach(function(row) {
            const val = row[key];
            if (typeof val === 'number' && !isNaN(val)) {
                hasNumeric = true;
                min = Math.min(min, val);
                max = Math.max(max, val);
            }
        });

        if (hasNumeric && isFinite(min) && isFinite(max)) {
            // Try to get a friendly label for the column
            let label = null;

            // 1. Check for explicit column labels set via setColumnLabels()
            if (chart._columnLabels && chart._columnLabels[key]) {
                label = chart._columnLabels[key];
            }
            // 2. Check for column headers (from DataGrid integration)
            else if (chart._columnHeaders && chart._columnHeaders[key]) {
                label = chart._columnHeaders[key];
            }
            // 3. For line/bar/area charts, use seriesLabels if column is in yColumns
            else if (chart.options && chart.options.seriesLabels) {
                const idx = yColumns.indexOf(parseInt(key));
                if (idx >= 0 && chart.options.seriesLabels[idx]) {
                    label = chart.options.seriesLabels[idx];
                }
            }

            // 4. Generate smart fallback labels
            if (!label) {
                const keyNum = parseInt(key);
                if (isPie && yColumns.includes(keyNum)) {
                    label = 'Slice Value';
                } else if (yColumns.includes(keyNum)) {
                    label = 'Value ' + (yColumns.indexOf(keyNum) + 1);
                } else {
                    // Use generic but cleaner names
                    numericIndex++;
                    label = 'Metric ' + numericIndex;
                }
            }

            columns.push({
                key: key,
                label: label,
                min: min,
                max: max
            });
        }
    });

    return columns;
}

/**
 * Creates min/max inputs for a numeric column
 */
function createNumericRangeInputs(chart, content, colInfo) {
    // Store column info for later filtering
    if (!chart._numericFilters) {
        chart._numericFilters = {};
    }

    const colKey = colInfo.key;

    // Min input
    const minGroup = document.createElement('div');
    minGroup.style.marginBottom = '8px';

    const minLabel = document.createElement('label');
    minLabel.textContent = 'Min:';
    minLabel.style.display = 'block';
    minLabel.style.fontSize = '12px';
    minLabel.style.color = '#666';
    minLabel.style.marginBottom = '4px';

    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.className = 'ar-numeric-input';
    minInput.style.width = '100%';
    minInput.style.padding = '6px 8px';
    minInput.style.border = '1px solid #ddd';
    minInput.style.borderRadius = '4px';
    minInput.style.fontSize = '13px';
    minInput.placeholder = 'Min: ' + Math.floor(colInfo.min);
    minInput.value = '';

    minGroup.appendChild(minLabel);
    minGroup.appendChild(minInput);

    // Max input
    const maxGroup = document.createElement('div');
    maxGroup.style.marginBottom = '8px';

    const maxLabel = document.createElement('label');
    maxLabel.textContent = 'Max:';
    maxLabel.style.display = 'block';
    maxLabel.style.fontSize = '12px';
    maxLabel.style.color = '#666';
    maxLabel.style.marginBottom = '4px';

    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.className = 'ar-numeric-input';
    maxInput.style.width = '100%';
    maxInput.style.padding = '6px 8px';
    maxInput.style.border = '1px solid #ddd';
    maxInput.style.borderRadius = '4px';
    maxInput.style.fontSize = '13px';
    maxInput.placeholder = 'Max: ' + Math.ceil(colInfo.max);
    maxInput.value = '';

    maxGroup.appendChild(maxLabel);
    maxGroup.appendChild(maxInput);

    content.appendChild(minGroup);
    content.appendChild(maxGroup);

    // Button container for Apply and Reset
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    btnContainer.style.marginTop = '8px';

    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.flex = '1';
    applyBtn.style.padding = '8px';
    applyBtn.style.backgroundColor = '#007bff';
    applyBtn.style.color = 'white';
    applyBtn.style.border = 'none';
    applyBtn.style.borderRadius = '4px';
    applyBtn.style.cursor = 'pointer';
    applyBtn.style.fontSize = '13px';
    applyBtn.addEventListener('click', function(e) {
        console.log('[Extension] Numeric Apply button CLICKED for column:', colKey);
        e.stopPropagation();
        applyNumericFilterForColumn(chart, colKey, minInput.value, maxInput.value);
    });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.flex = '1';
    resetBtn.style.padding = '8px';
    resetBtn.style.backgroundColor = '#6c757d';
    resetBtn.style.color = 'white';
    resetBtn.style.border = 'none';
    resetBtn.style.borderRadius = '4px';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.fontSize = '13px';
    resetBtn.addEventListener('click', function(e) {
        console.log('[Extension] Numeric Reset button CLICKED for column:', colKey);
        e.stopPropagation();
        minInput.value = '';
        maxInput.value = '';
        resetNumericFilterForColumn(chart, colKey);
    });

    btnContainer.appendChild(applyBtn);
    btnContainer.appendChild(resetBtn);
    content.appendChild(btnContainer);
}

/**
 * Apply numeric filter for a specific column
 */
function applyNumericFilterForColumn(chart, colKey, minVal, maxVal) {
    console.log('[Extension] Applying numeric filter for column', colKey, ':', minVal, 'to', maxVal);

    if (!chart._rawData) {
        console.warn('[Extension] Cannot apply numeric filter - missing data');
        return;
    }

    // Store original data if not already stored
    if (!chart._originalRawData) {
        chart._originalRawData = chart._rawData.slice();
    }

    // Store this column's filter
    if (!chart._numericFilters) {
        chart._numericFilters = {};
    }
    chart._numericFilters[colKey] = {
        min: minVal !== '' ? parseFloat(minVal) : null,
        max: maxVal !== '' ? parseFloat(maxVal) : null
    };

    // Apply all active filters
    applyAllNumericFilters(chart);
}

/**
 * Reset numeric filter for a specific column
 */
function resetNumericFilterForColumn(chart, colKey) {
    console.log('[Extension] Resetting numeric filter for column:', colKey);

    if (chart._numericFilters) {
        delete chart._numericFilters[colKey];
    }

    // If no more filters, reset to original data
    if (!chart._numericFilters || Object.keys(chart._numericFilters).length === 0) {
        if (chart._originalRawData) {
            chart._rawData = chart._originalRawData.slice();
            chart.setData(chart._originalRawData);

            // Sync to linked DataGrid
            syncDataToLinkedGrid(chart, chart._originalRawData);
        }
    } else {
        // Re-apply remaining filters (this will also sync to grid)
        applyAllNumericFilters(chart);
    }
}

/**
 * Apply all active numeric filters
 */
function applyAllNumericFilters(chart) {
    if (!chart._originalRawData) {
        return;
    }

    let filteredData = chart._originalRawData.slice();

    // Apply each column filter
    Object.keys(chart._numericFilters).forEach(function(colKey) {
        const filter = chart._numericFilters[colKey];
        if (filter.min === null && filter.max === null) {
            return; // No filter set
        }

        filteredData = filteredData.filter(function(row) {
            const val = row[colKey];
            if (typeof val !== 'number') return true;
            if (filter.min !== null && val < filter.min) return false;
            if (filter.max !== null && val > filter.max) return false;
            return true;
        });
    });

    console.log('[Extension] Filtered data:', filteredData.length, 'rows (from', chart._originalRawData.length, ')');

    chart._rawData = filteredData;
    chart.setData(filteredData);

    // Sync to linked DataGrid
    syncDataToLinkedGrid(chart, filteredData);
}

/**
 * Adds categorical filter content to a container (simplified version)
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function addCategoricalContent(chart, container) {
    console.log('[Extension] addCategoricalContent called');
    console.log('[Extension] _rawData exists:', !!chart._rawData);
    console.log('[Extension] _rawData length:', chart._rawData ? chart._rawData.length : 0);

    // Get unique categories from data if available
    if (!chart._rawData || !Array.isArray(chart._rawData)) {
        console.log('[Extension] No _rawData available for categorical filters');
        return;
    }

    // Find categorical columns (non-numeric, non-date)
    const categories = {};
    chart._rawData.forEach(function(row) {
        Object.keys(row).forEach(function(key) {
            const val = row[key];
            if (typeof val === 'string' && !val.match(/^\d{4}-\d{2}-\d{2}/)) {
                if (!categories[key]) {
                    categories[key] = new Set();
                }
                categories[key].add(val);
            }
        });
    });

    console.log('[Extension] Found categorical columns:', Object.keys(categories));

    // Create checkbox groups for each categorical column
    Object.keys(categories).forEach(function(colKey) {
        const values = Array.from(categories[colKey]);
        if (values.length < 2 || values.length > 20) {
            return; // Skip if only 1 value or too many
        }

        const section = createFilterSubSection('Filter by ' + (chart._columnHeaders && chart._columnHeaders[colKey] || 'Category'));
        const content = section.querySelector('.ar-filter-subsection-content');

        // Initialize state
        if (!chart._categoricalFilters) {
            chart._categoricalFilters = {};
        }
        if (!chart._categoricalFilters[colKey]) {
            chart._categoricalFilters[colKey] = {};
            values.forEach(function(v) {
                chart._categoricalFilters[colKey][v] = true;
            });
        }

        values.forEach(function(val) {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.padding = '4px 0';
            item.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = chart._categoricalFilters[colKey][val] !== false;
            checkbox.style.marginRight = '8px';

            const label = document.createElement('span');
            label.textContent = val;
            label.style.fontSize = '13px';

            checkbox.addEventListener('change', function() {
                chart._categoricalFilters[colKey][val] = checkbox.checked;
                applyCategoricalFilter(chart);
            });

            item.addEventListener('click', function(e) {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    chart._categoricalFilters[colKey][val] = checkbox.checked;
                    applyCategoricalFilter(chart);
                }
            });

            item.appendChild(checkbox);
            item.appendChild(label);
            content.appendChild(item);
        });

        container.appendChild(section);
    });
}

/**
 * Apply date filter to chart - actually filters the data
 */
function applyDateFilter(chart, fromInput, toInput) {
    const fromDate = fromInput.value;
    const toDate = toInput.value;
    console.log('[Extension] Applying date filter:', fromDate, 'to', toDate);

    if (!chart._rawData || !fromDate || !toDate) {
        console.warn('[Extension] Cannot apply date filter - missing data or dates');
        return;
    }

    // Store original data if not already stored
    if (!chart._originalRawData) {
        chart._originalRawData = chart._rawData.slice();
    }

    // Filter the raw data by date (assuming column 1 contains dates)
    const filteredData = chart._originalRawData.filter(function(row) {
        const rowDate = row[1] || row['date'] || row['Date'];
        if (!rowDate) return true;
        return rowDate >= fromDate && rowDate <= toDate;
    });

    console.log('[Extension] Filtered data:', filteredData.length, 'rows (from', chart._originalRawData.length, ')');

    // Update chart with filtered data
    chart._rawData = filteredData;
    chart.setData(filteredData);

    // Sync to linked DataGrid
    syncDataToLinkedGrid(chart, filteredData);

    // Notify callbacks
    if (chart._filterCallbacks) {
        chart._filterCallbacks.forEach(function(cb) {
            cb({ dateRange: { from: fromDate, to: toDate }, filteredCount: filteredData.length });
        });
    }
}

/**
 * Reset date filter to original values
 */
function resetDateFilter(chart) {
    console.log('[Extension] Resetting date filter');

    if (chart._originalRawData) {
        chart._rawData = chart._originalRawData.slice();
        chart.setData(chart._originalRawData);

        // Sync to linked DataGrid
        syncDataToLinkedGrid(chart, chart._originalRawData);
    }

    // Notify callbacks
    if (chart._filterCallbacks) {
        chart._filterCallbacks.forEach(function(cb) {
            cb({ dateRange: null, reset: true });
        });
    }
}

/**
 * Apply numeric filter to chart - actually filters the data
 */
function applyNumericFilter(chart, minVal, maxVal) {
    console.log('[Extension] Applying numeric filter:', minVal, 'to', maxVal);

    if (!chart._rawData) {
        console.warn('[Extension] Cannot apply numeric filter - missing data');
        return;
    }

    // Store original data if not already stored
    if (!chart._originalRawData) {
        chart._originalRawData = chart._rawData.slice();
    }

    const minNum = minVal !== '' ? parseFloat(minVal) : -Infinity;
    const maxNum = maxVal !== '' ? parseFloat(maxVal) : Infinity;

    // Filter the raw data by numeric columns
    const filteredData = chart._originalRawData.filter(function(row) {
        // Check numeric values in columns 2 and 3 (typical y-axis columns)
        const val2 = row[2];
        const val3 = row[3];

        let matches = true;
        if (typeof val2 === 'number') {
            matches = matches && (val2 >= minNum && val2 <= maxNum);
        }
        // For now, just check column 2. Column 3 might have different scale.
        return matches;
    });

    console.log('[Extension] Filtered data:', filteredData.length, 'rows (from', chart._originalRawData.length, ')');

    // Update chart with filtered data
    chart._rawData = filteredData;
    chart.setData(filteredData);

    // Notify callbacks
    if (chart._filterCallbacks) {
        chart._filterCallbacks.forEach(function(cb) {
            cb({ numericRange: { min: minVal, max: maxVal }, filteredCount: filteredData.length });
        });
    }
}

/**
 * Reset numeric filter
 */
function resetNumericFilter(chart) {
    console.log('[Extension] Resetting numeric filter');

    if (chart._originalRawData) {
        chart._rawData = chart._originalRawData.slice();
        chart.setData(chart._originalRawData);
    }

    // Notify callbacks
    if (chart._filterCallbacks) {
        chart._filterCallbacks.forEach(function(cb) {
            cb({ numericRange: null, reset: true });
        });
    }
}

/**
 * Apply categorical filter to chart - actually filters the data
 */
function applyCategoricalFilter(chart) {
    console.log('[Extension] Applying categorical filter:', chart._categoricalFilters);

    if (!chart._rawData || !chart._categoricalFilters) {
        return;
    }

    // Store original data if not already stored
    if (!chart._originalRawData) {
        chart._originalRawData = chart._rawData.slice();
    }

    // Filter the raw data by categorical values
    const filteredData = chart._originalRawData.filter(function(row) {
        let passes = true;
        Object.keys(chart._categoricalFilters).forEach(function(colKey) {
            const colFilters = chart._categoricalFilters[colKey];
            const rowValue = row[colKey];
            if (rowValue && colFilters[rowValue] === false) {
                passes = false;
            }
        });
        return passes;
    });

    console.log('[Extension] Categorical filtered data:', filteredData.length, 'rows');

    // Update chart with filtered data
    chart._rawData = filteredData;
    chart.setData(filteredData);

    // Sync to linked DataGrid
    syncDataToLinkedGrid(chart, filteredData);

    // Notify callbacks
    if (chart._filterCallbacks) {
        chart._filterCallbacks.forEach(function(cb) {
            cb({ categorical: chart._categoricalFilters, filteredCount: filteredData.length });
        });
    }
}

/**
 * Creates the series visibility section with checkboxes (OLD - kept for compatibility)
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function createSeriesSection(chart, container) {
    if (!chart.chartData || !chart.chartData.series || chart.chartData.series.length === 0) {
        return;
    }

    // Create section wrapper
    const section = document.createElement('div');
    section.className = CONFIG.sectionClass + ' ar-series-section';
    section.style.marginBottom = '12px';

    // Create accordion header
    const accordionHeader = document.createElement('div');
    accordionHeader.className = 'ar-accordion-header';
    accordionHeader.style.display = 'flex';
    accordionHeader.style.alignItems = 'center';
    accordionHeader.style.justifyContent = 'space-between';
    accordionHeader.style.padding = '12px';
    accordionHeader.style.backgroundColor = '#f5f5f5';
    accordionHeader.style.borderRadius = '6px';
    accordionHeader.style.cursor = 'pointer';
    accordionHeader.style.userSelect = 'none';
    accordionHeader.style.transition = 'background-color 0.2s';
    accordionHeader.setAttribute('role', 'button');
    accordionHeader.setAttribute('aria-expanded', 'true');
    accordionHeader.setAttribute('tabindex', '0');

    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'Series Visibility';
    headerTitle.style.fontWeight = '500';
    headerTitle.style.fontSize = '14px';
    headerTitle.style.color = '#333333';

    const headerIcon = document.createElement('span');
    headerIcon.className = 'ar-accordion-icon';
    headerIcon.innerHTML = '▼';
    headerIcon.style.fontSize = '12px';
    headerIcon.style.transition = 'transform 0.3s';
    headerIcon.style.color = '#666666';

    accordionHeader.appendChild(headerTitle);
    accordionHeader.appendChild(headerIcon);

    // Create accordion content
    const accordionContent = document.createElement('div');
    accordionContent.className = 'ar-accordion-content';
    accordionContent.style.maxHeight = '300px';
    accordionContent.style.overflowY = 'auto';
    accordionContent.style.padding = '12px';
    accordionContent.style.transition = `max-height ${CONFIG.animationDuration}ms ease-out`;
    accordionContent.setAttribute('role', 'region');

    // Create series list
    const seriesList = document.createElement('div');
    seriesList.className = CONFIG.seriesListClass;

    chart.chartData.series.forEach((series, index) => {
        const seriesItem = createSeriesCheckbox(chart, series, index);
        seriesList.appendChild(seriesItem);
    });

    accordionContent.appendChild(seriesList);
    section.appendChild(accordionHeader);
    section.appendChild(accordionContent);
    container.appendChild(section);

    // Add accordion toggle behavior
    let isExpanded = true;
    accordionHeader.addEventListener('click', function() {
        isExpanded = !isExpanded;
        if (isExpanded) {
            accordionContent.style.maxHeight = '300px';
            headerIcon.style.transform = 'rotate(0deg)';
            accordionHeader.setAttribute('aria-expanded', 'true');
        } else {
            accordionContent.style.maxHeight = '0';
            accordionContent.style.padding = '0 12px';
            headerIcon.style.transform = 'rotate(-90deg)';
            accordionHeader.setAttribute('aria-expanded', 'false');
        }
    });

    accordionHeader.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            accordionHeader.click();
        }
    });

    accordionHeader.addEventListener('mouseenter', function() {
        accordionHeader.style.backgroundColor = '#eeeeee';
    });

    accordionHeader.addEventListener('mouseleave', function() {
        accordionHeader.style.backgroundColor = '#f5f5f5';
    });
}

/**
 * Creates a checkbox item for a series
 * @param {AR.Chart} chart - The chart instance
 * @param {Object} series - The series data
 * @param {number} index - The series index
 * @returns {HTMLElement} The series checkbox element
 */
function createSeriesCheckbox(chart, series, index) {
    const item = document.createElement('div');
    item.className = 'ar-series-item';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.padding = '8px';
    item.style.marginBottom = '4px';
    item.style.borderRadius = '4px';
    item.style.transition = 'background-color 0.2s';

    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CONFIG.checkboxClass;
    checkbox.id = `series-${chart.id || 'chart'}-${index}`;
    checkbox.checked = series.visible !== false;
    checkbox.style.width = '16px';
    checkbox.style.height = '16px';
    checkbox.style.marginRight = chart._isRTL ? '0' : '8px';
    checkbox.style.marginLeft = chart._isRTL ? '8px' : '0';
    checkbox.style.cursor = 'pointer';
    checkbox.setAttribute('aria-label', `Toggle ${series.label || 'Series ' + (index + 1)}`);

    // Create color indicator
    const colorIndicator = document.createElement('span');
    colorIndicator.className = CONFIG.colorIndicatorClass;
    colorIndicator.style.display = 'inline-block';
    colorIndicator.style.width = '16px';
    colorIndicator.style.height = '16px';
    colorIndicator.style.backgroundColor = series.color || '#cccccc';
    colorIndicator.style.borderRadius = '50%';
    colorIndicator.style.marginRight = chart._isRTL ? '0' : '8px';
    colorIndicator.style.marginLeft = chart._isRTL ? '8px' : '0';
    colorIndicator.style.border = '2px solid #ffffff';
    colorIndicator.style.boxShadow = '0 0 0 1px #cccccc';

    // Create label
    const label = document.createElement('label');
    label.className = CONFIG.labelClass;
    label.htmlFor = checkbox.id;
    label.textContent = series.label || `Series ${index + 1}`;
    label.style.cursor = 'pointer';
    label.style.fontSize = '14px';
    label.style.color = '#333333';
    label.style.flex = '1';
    label.style.userSelect = 'none';

    if (!checkbox.checked) {
        label.style.color = '#999999';
        label.style.textDecoration = 'line-through';
    }

    // Add change handler
    checkbox.addEventListener('change', function() {
        series.visible = checkbox.checked;
        label.style.color = checkbox.checked ? '#333333' : '#999999';
        label.style.textDecoration = checkbox.checked ? 'none' : 'line-through';
        
        // ✅ Fire callbacks
        fireFilterCallbacks(chart);
        
        // Re-render chart
        try {
            chart.render();
        } catch (error) {
            console.error('Error rendering chart:', error);
        }
    });

    // Hover effect
    item.addEventListener('mouseenter', function() {
        item.style.backgroundColor = '#f9f9f9';
    });

    item.addEventListener('mouseleave', function() {
        item.style.backgroundColor = 'transparent';
    });

    // Assemble item
    item.appendChild(checkbox);
    item.appendChild(colorIndicator);
    item.appendChild(label);

    return item;
}

/**
 * Creates the date range filter section
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function createDateRangeSection(chart, container) {
    if (!chart.chartData || !chart.chartData.labels || chart.chartData.labels.length === 0) {
        return;
    }

    // Create section wrapper
    const section = document.createElement('div');
    section.className = CONFIG.sectionClass + ' ar-daterange-section';
    section.style.marginBottom = '12px';

    // Create accordion header
    const accordionHeader = document.createElement('div');
    accordionHeader.className = 'ar-accordion-header';
    accordionHeader.style.display = 'flex';
    accordionHeader.style.alignItems = 'center';
    accordionHeader.style.justifyContent = 'space-between';
    accordionHeader.style.padding = '12px';
    accordionHeader.style.backgroundColor = '#f5f5f5';
    accordionHeader.style.borderRadius = '6px';
    accordionHeader.style.cursor = 'pointer';
    accordionHeader.style.userSelect = 'none';
    accordionHeader.style.transition = 'background-color 0.2s';
    accordionHeader.setAttribute('role', 'button');
    accordionHeader.setAttribute('aria-expanded', 'true');
    accordionHeader.setAttribute('tabindex', '0');

    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'Date Range';
    headerTitle.style.fontWeight = '500';
    headerTitle.style.fontSize = '14px';
    headerTitle.style.color = '#333333';

    const headerIcon = document.createElement('span');
    headerIcon.className = 'ar-accordion-icon';
    headerIcon.innerHTML = '▼';
    headerIcon.style.fontSize = '12px';
    headerIcon.style.transition = 'transform 0.3s';
    headerIcon.style.color = '#666666';

    accordionHeader.appendChild(headerTitle);
    accordionHeader.appendChild(headerIcon);

    // Create accordion content
    const accordionContent = document.createElement('div');
    accordionContent.className = 'ar-accordion-content';
    accordionContent.style.padding = '12px';
    accordionContent.style.transition = `max-height ${CONFIG.animationDuration}ms ease-out`;
    accordionContent.setAttribute('role', 'region');

    // Create date filter container
    const dateFilter = document.createElement('div');
    dateFilter.className = CONFIG.dateFilterClass;

    // Create "From" date input
    const fromGroup = createDateInputGroup(chart, 'from', 'From:');
    dateFilter.appendChild(fromGroup);

    // Create "To" date input
    const toGroup = createDateInputGroup(chart, 'to', 'To:');
    dateFilter.appendChild(toGroup);

    // Create apply button
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply Filter';
    applyButton.className = 'ar-apply-filter';
    applyButton.style.width = '100%';
    applyButton.style.padding = '10px';
    applyButton.style.marginTop = '12px';
    applyButton.style.backgroundColor = '#007bff';
    applyButton.style.color = '#ffffff';
    applyButton.style.border = 'none';
    applyButton.style.borderRadius = '4px';
    applyButton.style.fontSize = '14px';
    applyButton.style.fontWeight = '500';
    applyButton.style.cursor = 'pointer';
    applyButton.style.transition = 'background-color 0.2s';

    applyButton.addEventListener('click', function() {
        applyDateFilter(chart, fromGroup.querySelector('input'), toGroup.querySelector('input'));
    });

    applyButton.addEventListener('mouseenter', function() {
        applyButton.style.backgroundColor = '#0056b3';
    });

    applyButton.addEventListener('mouseleave', function() {
        applyButton.style.backgroundColor = '#007bff';
    });

    // Create clear button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Filter';
    clearButton.className = 'ar-clear-filter';
    clearButton.style.width = '100%';
    clearButton.style.padding = '10px';
    clearButton.style.marginTop = '8px';
    clearButton.style.backgroundColor = '#6c757d';
    clearButton.style.color = '#ffffff';
    clearButton.style.border = 'none';
    clearButton.style.borderRadius = '4px';
    clearButton.style.fontSize = '14px';
    clearButton.style.fontWeight = '500';
    clearButton.style.cursor = 'pointer';
    clearButton.style.transition = 'background-color 0.2s';

    clearButton.addEventListener('click', function() {
        clearDateFilter(chart, fromGroup.querySelector('input'), toGroup.querySelector('input'));
    });

    clearButton.addEventListener('mouseenter', function() {
        clearButton.style.backgroundColor = '#5a6268';
    });

    clearButton.addEventListener('mouseleave', function() {
        clearButton.style.backgroundColor = '#6c757d';
    });

    dateFilter.appendChild(applyButton);
    dateFilter.appendChild(clearButton);

    accordionContent.appendChild(dateFilter);
    section.appendChild(accordionHeader);
    section.appendChild(accordionContent);
    container.appendChild(section);

    // Add accordion toggle behavior
    let isExpanded = true;
    accordionHeader.addEventListener('click', function() {
        isExpanded = !isExpanded;
        if (isExpanded) {
            accordionContent.style.maxHeight = '500px';
            headerIcon.style.transform = 'rotate(0deg)';
            accordionHeader.setAttribute('aria-expanded', 'true');
        } else {
            accordionContent.style.maxHeight = '0';
            accordionContent.style.padding = '0 12px';
            headerIcon.style.transform = 'rotate(-90deg)';
            accordionHeader.setAttribute('aria-expanded', 'false');
        }
    });

    accordionHeader.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            accordionHeader.click();
        }
    });

    accordionHeader.addEventListener('mouseenter', function() {
        accordionHeader.style.backgroundColor = '#eeeeee';
    });

    accordionHeader.addEventListener('mouseleave', function() {
        accordionHeader.style.backgroundColor = '#f5f5f5';
    });

    // Store initial data for filtering
    if (!chart._originalData) {
        chart._originalData = {
            labels: chart.chartData.labels.slice(),
            series: chart.chartData.series.map(s => ({
                label: s.label,
                data: s.data ? s.data.slice() : null,
                color: s.color,
                visible: s.visible
            }))
        };
    }
}

/**
 * Creates a date input group
 * @param {AR.Chart} chart - The chart instance
 * @param {string} type - 'from' or 'to'
 * @param {string} labelText - Label text
 * @returns {HTMLElement} The date input group element
 */
function createDateInputGroup(chart, type, labelText) {
    const group = document.createElement('div');
    group.className = 'ar-date-group';
    group.style.marginBottom = '12px';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.display = 'block';
    label.style.marginBottom = '6px';
    label.style.fontSize = '13px';
    label.style.fontWeight = '500';
    label.style.color = '#555555';

    const input = document.createElement('input');
    input.type = 'date';
    input.className = CONFIG.dateInputClass + ' ' + type;
    input.style.width = '100%';
    input.style.padding = '8px';
    input.style.border = '1px solid #cccccc';
    input.style.borderRadius = '4px';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    input.setAttribute('aria-label', labelText);

    // Set min/max based on data if available
    if (chart.chartData && chart.chartData.labels && chart.chartData.labels.length > 0) {
        const dates = chart.chartData.labels.filter(l => l instanceof Date).sort((a, b) => a - b);
        if (dates.length > 0) {
            input.min = formatDateForInput(dates[0]);
            input.max = formatDateForInput(dates[dates.length - 1]);
        }
    }

    label.appendChild(input);
    group.appendChild(label);

    return group;
}

// NOTE: applyDateFilter is defined earlier in the file (lines 876-910)
// This duplicate was removed to prevent the newer version from being overwritten

/**
 * Clears date range filter
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLInputElement} fromInput - From date input
 * @param {HTMLInputElement} toInput - To date input
 */
function clearDateFilter(chart, fromInput, toInput) {
    if (!chart._originalData) {
        return;
    }

    // Clear inputs
    fromInput.value = '';
    toInput.value = '';

    // Restore original data
    chart.chartData.labels = chart._originalData.labels.slice();
    chart.chartData.series.forEach((series, index) => {
        if (chart._originalData.series[index].data) {
            series.data = chart._originalData.series[index].data.slice();
        }
    });

    // Re-process and render
    try {
        if (chart.processData) {
            chart.processData();
        }
        chart.render();
    } catch (error) {
        console.error('Error clearing date filter:', error);
    }
}

/**
 * Formats a date for input element
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Creates a categorical filter section for filtering by category values
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function createCategoricalSection(chart, container) {
    // Detect categorical columns from data
    const categoricalColumns = detectCategoricalColumns(chart);

    if (categoricalColumns.length === 0) {
        return;
    }

    categoricalColumns.forEach(colInfo => {
        const section = document.createElement('div');
        section.className = CONFIG.sectionClass + ' ar-chart-filter-categorical-section';
        section.style.marginBottom = '12px';

        // Create accordion header
        const accordionHeader = document.createElement('div');
        accordionHeader.className = 'ar-accordion-header';
        accordionHeader.style.display = 'flex';
        accordionHeader.style.alignItems = 'center';
        accordionHeader.style.justifyContent = 'space-between';
        accordionHeader.style.padding = '12px';
        accordionHeader.style.backgroundColor = '#f5f5f5';
        accordionHeader.style.borderRadius = '6px';
        accordionHeader.style.cursor = 'pointer';
        accordionHeader.style.userSelect = 'none';
        accordionHeader.style.transition = 'background-color 0.2s';
        accordionHeader.setAttribute('role', 'button');
        accordionHeader.setAttribute('aria-expanded', 'true');
        accordionHeader.setAttribute('tabindex', '0');

        const headerTitle = document.createElement('span');
        headerTitle.textContent = colInfo.label || `Category Filter`;
        headerTitle.style.fontWeight = '500';
        headerTitle.style.fontSize = '14px';
        headerTitle.style.color = '#333333';

        const headerIcon = document.createElement('span');
        headerIcon.className = 'ar-accordion-icon';
        headerIcon.innerHTML = '▼';
        headerIcon.style.fontSize = '12px';
        headerIcon.style.transition = 'transform 0.3s';
        headerIcon.style.color = '#666666';

        accordionHeader.appendChild(headerTitle);
        accordionHeader.appendChild(headerIcon);

        // Create accordion content
        const accordionContent = document.createElement('div');
        accordionContent.className = 'ar-accordion-content ar-chart-filter-categorical-items';
        accordionContent.style.maxHeight = '200px';
        accordionContent.style.overflowY = 'auto';
        accordionContent.style.padding = '8px 0';
        accordionContent.style.transition = `max-height ${CONFIG.animationDuration}ms ease-out`;
        accordionContent.setAttribute('role', 'region');

        // Create checkboxes for each unique value
        colInfo.values.forEach((value, index) => {
            const item = document.createElement('div');
            item.className = 'ar-chart-filter-item';

            const label = document.createElement('label');
            label.className = 'ar-chart-filter-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.dataset.column = colInfo.column;
            checkbox.dataset.value = value;

            const text = document.createElement('span');
            text.className = 'ar-chart-filter-text';
            text.textContent = value;

            checkbox.addEventListener('change', function() {
                text.classList.toggle('ar-chart-filter-crossed', !checkbox.checked);
                applyCategoricalFilter(chart);
            });

            label.appendChild(checkbox);
            label.appendChild(text);
            item.appendChild(label);
            accordionContent.appendChild(item);
        });

        section.appendChild(accordionHeader);
        section.appendChild(accordionContent);
        container.appendChild(section);

        // Add accordion toggle behavior
        let isExpanded = true;
        accordionHeader.addEventListener('click', function() {
            isExpanded = !isExpanded;
            if (isExpanded) {
                accordionContent.style.maxHeight = '200px';
                headerIcon.style.transform = 'rotate(0deg)';
                accordionHeader.setAttribute('aria-expanded', 'true');
            } else {
                accordionContent.style.maxHeight = '0';
                accordionContent.style.padding = '0';
                headerIcon.style.transform = 'rotate(-90deg)';
                accordionHeader.setAttribute('aria-expanded', 'false');
            }
        });

        accordionHeader.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                accordionHeader.click();
            }
        });
    });

    // Store categorical filter state
    if (!chart._categoricalFilters) {
        chart._categoricalFilters = {};
    }
}

/**
 * Detects categorical columns from chart data
 * @param {AR.Chart} chart - The chart instance
 * @returns {Array} Array of categorical column info objects
 */
function detectCategoricalColumns(chart) {
    const categorical = [];

    if (!chart._originalData || !chart._originalData.labels || chart._originalData.labels.length === 0) {
        return categorical;
    }

    // Check if labels contain categorical data (non-date, non-numeric strings)
    const labels = chart._originalData.labels;
    const uniqueValues = [...new Set(labels)];

    // Only show as categorical if there are multiple distinct values but not too many
    // and the values are strings (not dates or numbers)
    if (uniqueValues.length >= 2 && uniqueValues.length <= 20) {
        const isStringData = labels.every(l =>
            typeof l === 'string' &&
            !(l instanceof Date) &&
            isNaN(Date.parse(l)) &&
            isNaN(parseFloat(l))
        );

        if (isStringData) {
            categorical.push({
                column: 'labels',
                label: 'Categories',
                values: uniqueValues
            });
        }
    }

    return categorical;
}

// NOTE: applyCategoricalFilter is defined earlier in the file (lines 1000-1037)
// This duplicate was removed to prevent the newer version from being overwritten

/**
 * Creates numeric range filter section for filtering by min/max values
 * @param {AR.Chart} chart - The chart instance
 * @param {HTMLElement} container - The container element
 */
function createNumericRangeSection(chart, container) {
    // Detect numeric columns that could be filtered
    const numericColumns = detectNumericColumns(chart);

    if (numericColumns.length === 0) {
        return;
    }

    const section = document.createElement('div');
    section.className = CONFIG.sectionClass + ' ar-chart-filter-numeric-section';
    section.style.marginBottom = '12px';

    // Create accordion header
    const accordionHeader = document.createElement('div');
    accordionHeader.className = 'ar-accordion-header';
    accordionHeader.style.display = 'flex';
    accordionHeader.style.alignItems = 'center';
    accordionHeader.style.justifyContent = 'space-between';
    accordionHeader.style.padding = '12px';
    accordionHeader.style.backgroundColor = '#f5f5f5';
    accordionHeader.style.borderRadius = '6px';
    accordionHeader.style.cursor = 'pointer';
    accordionHeader.style.userSelect = 'none';
    accordionHeader.style.transition = 'background-color 0.2s';
    accordionHeader.setAttribute('role', 'button');
    accordionHeader.setAttribute('aria-expanded', 'true');
    accordionHeader.setAttribute('tabindex', '0');

    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'Value Ranges';
    headerTitle.style.fontWeight = '500';
    headerTitle.style.fontSize = '14px';
    headerTitle.style.color = '#333333';

    const headerIcon = document.createElement('span');
    headerIcon.className = 'ar-accordion-icon';
    headerIcon.innerHTML = '▼';
    headerIcon.style.fontSize = '12px';
    headerIcon.style.transition = 'transform 0.3s';
    headerIcon.style.color = '#666666';

    accordionHeader.appendChild(headerTitle);
    accordionHeader.appendChild(headerIcon);

    // Create accordion content
    const accordionContent = document.createElement('div');
    accordionContent.className = 'ar-accordion-content';
    accordionContent.style.padding = '12px';
    accordionContent.style.transition = `max-height ${CONFIG.animationDuration}ms ease-out`;
    accordionContent.setAttribute('role', 'region');

    // Create range inputs for each numeric series
    numericColumns.forEach((colInfo, idx) => {
        const rangeDiv = document.createElement('div');
        rangeDiv.className = 'ar-chart-filter-numeric-range';

        const rangeHeader = document.createElement('span');
        rangeHeader.className = 'ar-chart-filter-numeric-header';
        rangeHeader.textContent = colInfo.label;
        rangeDiv.appendChild(rangeHeader);

        // Min input
        const minGroup = document.createElement('div');
        minGroup.className = 'ar-chart-filter-numeric-group';

        const minLabel = document.createElement('label');
        minLabel.className = 'ar-chart-filter-numeric-label';
        minLabel.textContent = 'Min:';

        const minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.className = 'ar-chart-filter-numeric-input';
        minInput.placeholder = colInfo.min.toFixed(0);
        minInput.dataset.seriesIndex = colInfo.seriesIndex;
        minInput.dataset.type = 'min';
        minInput.setAttribute('aria-label', `Minimum ${colInfo.label}`);

        minGroup.appendChild(minLabel);
        minGroup.appendChild(minInput);
        rangeDiv.appendChild(minGroup);

        // Max input
        const maxGroup = document.createElement('div');
        maxGroup.className = 'ar-chart-filter-numeric-group';

        const maxLabel = document.createElement('label');
        maxLabel.className = 'ar-chart-filter-numeric-label';
        maxLabel.textContent = 'Max:';

        const maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.className = 'ar-chart-filter-numeric-input';
        maxInput.placeholder = colInfo.max.toFixed(0);
        maxInput.dataset.seriesIndex = colInfo.seriesIndex;
        maxInput.dataset.type = 'max';
        maxInput.setAttribute('aria-label', `Maximum ${colInfo.label}`);

        maxGroup.appendChild(maxLabel);
        maxGroup.appendChild(maxInput);
        rangeDiv.appendChild(maxGroup);

        // Add input event listeners with debounce
        let debounceTimer;
        const handleInput = function() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => applyNumericRangeFilter(chart), 300);
        };

        minInput.addEventListener('input', handleInput);
        maxInput.addEventListener('input', handleInput);

        accordionContent.appendChild(rangeDiv);
    });

    // Add clear button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Ranges';
    clearButton.className = 'ar-clear-filter';
    clearButton.style.width = '100%';
    clearButton.style.padding = '8px';
    clearButton.style.marginTop = '12px';
    clearButton.style.backgroundColor = '#6c757d';
    clearButton.style.color = '#ffffff';
    clearButton.style.border = 'none';
    clearButton.style.borderRadius = '4px';
    clearButton.style.fontSize = '13px';
    clearButton.style.cursor = 'pointer';
    clearButton.style.transition = 'background-color 0.2s';

    clearButton.addEventListener('click', function() {
        const inputs = accordionContent.querySelectorAll('.ar-chart-filter-numeric-input');
        inputs.forEach(input => { input.value = ''; });
        clearNumericRangeFilter(chart);
    });

    clearButton.addEventListener('mouseenter', function() {
        clearButton.style.backgroundColor = '#5a6268';
    });

    clearButton.addEventListener('mouseleave', function() {
        clearButton.style.backgroundColor = '#6c757d';
    });

    accordionContent.appendChild(clearButton);

    section.appendChild(accordionHeader);
    section.appendChild(accordionContent);
    container.appendChild(section);

    // Add accordion toggle behavior
    let isExpanded = true;
    accordionHeader.addEventListener('click', function() {
        isExpanded = !isExpanded;
        if (isExpanded) {
            accordionContent.style.maxHeight = '500px';
            headerIcon.style.transform = 'rotate(0deg)';
            accordionHeader.setAttribute('aria-expanded', 'true');
        } else {
            accordionContent.style.maxHeight = '0';
            accordionContent.style.padding = '0 12px';
            headerIcon.style.transform = 'rotate(-90deg)';
            accordionHeader.setAttribute('aria-expanded', 'false');
        }
    });

    accordionHeader.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            accordionHeader.click();
        }
    });
}

/**
 * Detects numeric columns from chart data series
 * @param {AR.Chart} chart - The chart instance
 * @returns {Array} Array of numeric column info objects
 */
function detectNumericColumns(chart) {
    const numeric = [];

    if (!chart._originalData || !chart._originalData.series) {
        return numeric;
    }

    chart._originalData.series.forEach((series, index) => {
        if (series.data && series.data.length > 0) {
            // Check if data is numeric
            const numericData = series.data.filter(v => typeof v === 'number' && !isNaN(v));
            if (numericData.length > 0) {
                const min = Math.min(...numericData);
                const max = Math.max(...numericData);

                numeric.push({
                    seriesIndex: index,
                    label: series.label || `Series ${index + 1}`,
                    min: min,
                    max: max
                });
            }
        }
    });

    return numeric;
}

/**
 * Applies numeric range filter to chart data
 * @param {AR.Chart} chart - The chart instance
 */
function applyNumericRangeFilter(chart) {
    if (!chart._originalData || !chart._filterPanel) {
        return;
    }

    // Get all numeric range inputs
    const inputs = chart._filterPanel.querySelectorAll('.ar-chart-filter-numeric-input');
    const filters = {};

    inputs.forEach(input => {
        const seriesIndex = parseInt(input.dataset.seriesIndex);
        const type = input.dataset.type;
        const value = parseFloat(input.value);

        if (!isNaN(value)) {
            if (!filters[seriesIndex]) {
                filters[seriesIndex] = {};
            }
            filters[seriesIndex][type] = value;
        }
    });

    // If no filters are set, restore original data
    if (Object.keys(filters).length === 0) {
        clearNumericRangeFilter(chart);
        return;
    }

    // Find indices that pass all filters
    const filteredIndices = [];
    const dataLength = chart._originalData.labels.length;

    for (let i = 0; i < dataLength; i++) {
        let passesAllFilters = true;

        for (const seriesIndex in filters) {
            const filter = filters[seriesIndex];
            const value = chart._originalData.series[seriesIndex].data[i];

            if (typeof value === 'number') {
                if (filter.min !== undefined && value < filter.min) {
                    passesAllFilters = false;
                    break;
                }
                if (filter.max !== undefined && value > filter.max) {
                    passesAllFilters = false;
                    break;
                }
            }
        }

        if (passesAllFilters) {
            filteredIndices.push(i);
        }
    }

    // Update chart data
    chart.chartData.labels = filteredIndices.map(i => chart._originalData.labels[i]);
    chart.chartData.series.forEach((series, seriesIndex) => {
        if (chart._originalData.series[seriesIndex].data) {
            series.data = filteredIndices.map(i => chart._originalData.series[seriesIndex].data[i]);
        }
    });

    // Fire callbacks and re-render
    fireFilterCallbacks(chart);

    try {
        if (chart.processData) {
            chart.processData();
        }
        chart.render();
    } catch (error) {
        console.error('Error applying numeric range filter:', error);
    }
}

/**
 * Clears numeric range filters
 * @param {AR.Chart} chart - The chart instance
 */
function clearNumericRangeFilter(chart) {
    if (!chart._originalData) {
        return;
    }

    // Restore original data
    chart.chartData.labels = chart._originalData.labels.slice();
    chart.chartData.series.forEach((series, index) => {
        if (chart._originalData.series[index].data) {
            series.data = chart._originalData.series[index].data.slice();
        }
    });

    // Fire callbacks and re-render
    fireFilterCallbacks(chart);

    try {
        if (chart.processData) {
            chart.processData();
        }
        chart.render();
    } catch (error) {
        console.error('Error clearing numeric range filter:', error);
    }
}

/**
 * Updates existing filter panel with new data
 * @param {AR.Chart} chart - The chart instance
 */
function updateFilterPanel(chart) {
    if (!chart._filterPanel) {
        return;
    }

    // Rebuild panel content
    buildPanelContent(chart, chart._filterPanel);

    // Reset original data for filtering
    if (chart.chartData && chart.chartData.labels) {
        chart._originalData = {
            labels: chart.chartData.labels.slice(),
            series: chart.chartData.series.map(s => ({
                label: s.label,
                data: s.data ? s.data.slice() : null,
                color: s.color,
                visible: s.visible
            }))
        };
    }
}

/**
 * ✅ FIX 4: Public API - Add filter callback (resolves "not a function" error)
 * @param {Function} callback - Callback function to receive visible series indexes
 * @returns {AR.Chart} - Chainable
 */
AR.Chart.prototype.addFilterCallback = function(callback) {
    if (typeof callback !== 'function') {
        throw new Error('addFilterCallback requires a function argument');
    }

    // Initialize callback array if needed
    if (!this._filterCallbacks) {
        this._filterCallbacks = [];
    }

    // Add callback
    this._filterCallbacks.push(callback);

    return this;
};

/**
 * Public API - Remove filter callback
 * @param {Function} callback - Callback function to remove
 * @returns {AR.Chart} - Chainable
 */
AR.Chart.prototype.removeFilterCallback = function(callback) {
    if (!this._filterCallbacks) {
        return this;
    }

    const index = this._filterCallbacks.indexOf(callback);
    if (index > -1) {
        this._filterCallbacks.splice(index, 1);
    }

    return this;
};

/**
 * ✅ BACKWARD COMPATIBILITY: setFilterCallback alias for addFilterCallback
 * Many demo files use setFilterCallback, so we provide this alias
 * @param {Function} callback - Callback function to receive filter data
 * @returns {AR.Chart} - Chainable
 */
AR.Chart.prototype.setFilterCallback = function(callback) {
    // Clear existing callbacks and set this one as the only callback
    this._filterCallbacks = [];
    return this.addFilterCallback(callback);
};

/**
 * Fire filter callbacks
 * @param {AR.Chart} chart - The chart instance
 */
function fireFilterCallbacks(chart) {
    if (!chart._filterCallbacks || chart._filterCallbacks.length === 0) {
        return;
    }

    // Get visible series indexes
    const visibleSeriesIndexes = [];
    if (chart.chartData && chart.chartData.series) {
        chart.chartData.series.forEach((series, index) => {
            if (series.visible !== false) {
                visibleSeriesIndexes.push(index);
            }
        });
    }

    // Fire each callback
    chart._filterCallbacks.forEach(callback => {
        try {
            callback(visibleSeriesIndexes);
        } catch (error) {
            console.error('Error in filter callback:', error);
        }
    });
}

/**
 * Public API for manual panel creation (if needed)
 */
AR.Chart.prototype.createFilterPanel = function() {
    if (!enhancedCharts.has(this)) {
        createFilterPanel(this);
        enhancedCharts.add(this);
    }
    return this;
};

/**
 * Public API for removing filter panel
 */
AR.Chart.prototype.removeFilterPanel = function() {
    if (this._chartWrapper && this._filterPanel) {
        const parent = this._chartWrapper.parentElement;
        if (parent) {
            parent.insertBefore(this.element, this._chartWrapper);
            parent.removeChild(this._chartWrapper);
        }
        this._filterPanel = null;
        this._chartWrapper = null;
        enhancedCharts.delete(this);
    }
    return this;
};

/**
 * Link a DataGrid to this chart - grid will receive filtered data when chart filters are applied
 * @param {AR.DataGrid} grid - The DataGrid instance to link
 */
AR.Chart.prototype.linkGrid = function(grid) {
    if (!grid || typeof grid.setData !== 'function') {
        console.warn('[Extension] linkGrid requires a valid DataGrid instance');
        return this;
    }
    this._linkedGrid = grid;
    console.log('[Extension] DataGrid linked to chart');

    // Sync current data to grid
    if (this._rawData) {
        grid.setData(this._rawData);
    }
    return this;
};

/**
 * Unlink the DataGrid from this chart
 */
AR.Chart.prototype.unlinkGrid = function() {
    this._linkedGrid = null;
    return this;
};

/**
 * Get the linked DataGrid
 */
AR.Chart.prototype.getLinkedGrid = function() {
    return this._linkedGrid || null;
};

/**
 * Helper: Sync filtered data to linked grid
 */
function syncDataToLinkedGrid(chart, data) {
    if (chart._linkedGrid && typeof chart._linkedGrid.setData === 'function') {
        console.log('[Extension] Syncing', data.length, 'rows to linked DataGrid');
        chart._linkedGrid.setData(data);
    }
}

// Auto-initialize for existing charts
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExistingCharts);
} else {
    initializeExistingCharts();
}

function initializeExistingCharts() {
    // Find all canvas elements that might be AR.Charts
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        // Check if it has an AR.Chart instance
        if (canvas._arChart && canvas._arChart instanceof AR.Chart) {
            if (!enhancedCharts.has(canvas._arChart) && canvas._arChart.chartData) {
                try {
                    createFilterPanel(canvas._arChart);
                    enhancedCharts.add(canvas._arChart);
                } catch (error) {
                    console.error('Error auto-initializing filter panel:', error);
                }
            }
        }
    });
}

// Export for debugging/testing
window.AR.ChartFilterPanel = {
    version: '3.2.0',
    config: CONFIG,
    createPanel: createFilterPanel,
    updatePanel: updateFilterPanel
};

console.log('%c[Extension] AR.Charts.Extension v3.2.0 loaded - FIXED Apply/Reset buttons', 'color: green; font-weight: bold');
})(window);