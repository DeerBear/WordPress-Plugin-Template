/**
 * AR.DataGrid.js
 * COORDINATED PERFORMANCE VERSION (v2_FullUnified)
 * Fully unified: external 1-based indexing, internal offsets handled automatically
 */
(function(window) {
    'use strict';

    var AR = window.AR || {};

    // ============================================================================
    // UTILITIES
    // ============================================================================
    function addClass(element, className) {
        if (element.classList) { element.classList.add(className); } 
        else { element.className += ' ' + className; }
    }
    function removeClass(element, className) {
        if (element.classList) { element.classList.remove(className); } 
        else { element.className = element.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' '); }
    }
    function hasClass(element, className) {
        if (element.classList) { return element.classList.contains(className); }
        return new RegExp('(^| )' + className + '( |$)', 'gi').test(element.className);
    }
    function getElement(selector) {
        if (typeof selector === 'string') return document.querySelector(selector);
        return selector;
    }
    function parseNumericValue(val) {
        if (typeof val === 'number') return val;
        if (typeof val !== 'string') return null;
        var cleaned = val.replace(/[$€£¥,\s]/g, '');
        if (cleaned === '' || isNaN(cleaned)) return null;
        return parseFloat(cleaned);
    }

    // ============================================================================
    // AR.DataGrid Constructor
    // ============================================================================
    AR.DataGrid = function(selector, options) {
        this.table = getElement(selector);
        if (!this.table) throw new Error('DataGrid: table element not found');

        this.options = { rowCapDefault: 100, rowCapFirst: 200 };
        if (options) for (var key in options) if (options.hasOwnProperty(key)) this.options[key] = options[key];

        this.columns = [];
        this.data = [];
        this.displayedRowCount = 0;
        this.currentRowIndex = 0;
        this.hasNavigation = this.table.getAttribute('navigation') === 'true';
        this.sortColumn = null;
        this.sortDirection = null;
        this.groupByColumn = null;
        this.groupByDirection = null;
        this.isGrouped = false;
        this.groups = [];
        this.collapsedGroups = {};

        // PERFORMANCE COORDINATOR
        var self = this;
        this._rowRegistry = {
            viewIndex: [],
            sort: function(data, colIndex, direction, isDate) {
                var dataIdx = colIndex - 1; // internal adjustment
                this.viewIndex.sort(function(a, b) {
                    var valA = data[a][dataIdx], valB = data[b][dataIdx];
                    if (valA == null && valB == null) return 0;
                    if (valA == null) return 1;
                    if (valB == null) return -1;
                    var result;
                    if (isDate) result = new Date(valA).getTime() - new Date(valB).getTime();
                    else {
                        var numA = parseNumericValue(valA), numB = parseNumericValue(valB);
                        if (numA !== null && numB !== null) result = numA - numB;
                        else result = String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
                    }
                    return direction === 'asc' ? result : -result;
                });
            }
        };

        this.init();
    };

    // ============================================================================
    // INITIALIZATION & SCROLLING
    // ============================================================================
    AR.DataGrid.prototype.init = function() {
        addClass(this.table, 'ar-datagrid');
        this.setupScrollContainer();
        this.parseColumns();
        this.ensureTbody();
        if (this.hasNavigation) {
            this.setupNavigation();
            this.setupKeyboard();
        }
        this.setupSorting();
        this.setupAccessibility();
        this.setupEdgeScroll();
    };

    AR.DataGrid.prototype.setupScrollContainer = function() {
        if (this.table.parentElement && hasClass(this.table.parentElement, 'ar-datagrid-container')) {
            this.scrollContainer = this.table.parentElement;
            return;
        }
        this.scrollContainer = document.createElement('div');
        addClass(this.scrollContainer, 'ar-datagrid-container');
        this.table.parentNode.insertBefore(this.scrollContainer, this.table);
        this.scrollContainer.appendChild(this.table);
    };

    AR.DataGrid.prototype.setupEdgeScroll = function() {
        var self = this;
        var speed = 5, threshold = 50, interval = null;
        function updateIndicators() {
            var max = self.scrollContainer.scrollWidth - self.scrollContainer.clientWidth;
            var curr = self.scrollContainer.scrollLeft;
            (curr > 0) ? addClass(self.scrollContainer,'can-scroll-left') : removeClass(self.scrollContainer,'can-scroll-left');
            (curr < max-1) ? addClass(self.scrollContainer,'can-scroll-right') : removeClass(self.scrollContainer,'can-scroll-right');
        }
        updateIndicators();
        this.scrollContainer.addEventListener('scroll', updateIndicators);
        this.scrollContainer.addEventListener('mousemove', function(e){
            var rect=self.scrollContainer.getBoundingClientRect(), mx=e.clientX-rect.left;
            var nearLeft = mx<threshold && self.scrollContainer.scrollLeft>0;
            var nearRight = mx>rect.width-threshold && self.scrollContainer.scrollLeft<(self.scrollContainer.scrollWidth-rect.width);
            if(interval){clearInterval(interval);interval=null;}
            if(nearLeft||nearRight){interval=setInterval(function(){self.scrollContainer.scrollLeft += nearLeft?-speed:speed;},16);}
        });
        this.scrollContainer.addEventListener('mouseleave',function(){if(interval)clearInterval(interval);});
    };

    // ============================================================================
    // NAVIGATION & KEYBOARD
    // ============================================================================
    AR.DataGrid.prototype.setupNavigation = function() {
        var headTr=this.table.querySelector('thead tr');
        if(!headTr.querySelector('.datagrid-indicator-header')){
            var th=document.createElement('th');
            th.className='datagrid-indicator-header';
            headTr.insertBefore(th, headTr.firstChild);
        }
        this.createFooter();
    };

    AR.DataGrid.prototype.createFooter = function() {
        if(this.footer)return;
        this.footer=document.createElement('div');
        this.footer.className='datagrid-footer';
        this.footerIndicator=document.createElement('span');
        this.footerIndicator.className='datagrid-footer-info';
        this.footer.appendChild(this.footerIndicator);
        this.table.parentNode.insertBefore(this.footer,this.table.nextSibling);
    };

    AR.DataGrid.prototype.setCurrentRow=function(idx){
        if(idx<0||idx>=this.displayedRowCount)return;
        this.currentRowIndex=idx;
        this.updateRowIndicator();
    };

    AR.DataGrid.prototype.updateRowIndicator=function(){
        var rows=this.tbody.querySelectorAll('tr.datagrid-row');
        for(var i=0;i<rows.length;i++){
            var cell=rows[i].querySelector('.datagrid-indicator-cell');
            if(cell)cell.innerHTML=(i===this.currentRowIndex)?'►':'&nbsp;';
        }
        if(this.footerIndicator)this.footerIndicator.textContent='Row '+(this.currentRowIndex+1)+' of '+this.data.length;
    };

    AR.DataGrid.prototype.setupKeyboard=function(){
        var self=this;
        this.table.setAttribute('tabindex','0');
        this.table.addEventListener('keydown',function(e){
            if(e.key==='ArrowUp'){e.preventDefault();self.setCurrentRow(self.currentRowIndex-1);}
            else if(e.key==='ArrowDown'){e.preventDefault();self.setCurrentRow(self.currentRowIndex+1);}
        });
    };

    // ============================================================================
    // COLUMNS & DATA
    // ============================================================================
    AR.DataGrid.prototype.parseColumns=function(){
        var ths=this.table.querySelectorAll('thead th');
        this.columns=[];
        var key=1;
        for(var i=0;i<ths.length;i++){
            if(hasClass(ths[i],'datagrid-indicator-header'))continue;
            this.columns.push({index:key++,element:ths[i],isDate:ths[i].getAttribute('col-is-date')==='true'});
        }
    };

    AR.DataGrid.prototype.ensureTbody=function(){
        this.tbody=this.table.querySelector('tbody')||document.createElement('tbody');
        if(!this.tbody.parentElement)this.table.appendChild(this.tbody);
    };

    AR.DataGrid.prototype.setData=function(data){
        this.data=data||[];
        this._rowRegistry.viewIndex=this.data.map(function(_,i){return i;});
        if(this.isGrouped)this.buildGroups();
        else if(this.sortColumn)this.sortData();
        this.render();
    };

    AR.DataGrid.prototype.sortByColumn=function(colIndex,direction){
        this.sortDirection=direction||(this.sortColumn===colIndex&&this.sortDirection==='asc'?'desc':'asc');
        this.sortColumn=colIndex;
        this.sortData();
        this.render();
    };

    AR.DataGrid.prototype.sortData=function(){
        var col=this.columns.find(function(c){return c.index===this.sortColumn;}.bind(this));
        if(col)this._rowRegistry.sort(this.data,this.sortColumn,this.sortDirection,col.isDate);
    };

    // ============================================================================
    // SORTING / PINS
    // ============================================================================
    AR.DataGrid.prototype.setupSorting=function(){
        var self=this;
        this.columns.forEach(function(col){
            addClass(col.element,'datagrid-sortable');
            var pin=document.createElement('span');
            pin.className='datagrid-pin-icon icon-pin-asc';
            pin.onclick=function(e){e.stopPropagation();self.handlePinClick(col.index);};
            col.element.appendChild(pin);
            col.element.onclick=function(){self.sortByColumn(col.index);};
        });
    };

    AR.DataGrid.prototype.handlePinClick=function(colIndex){
        if(this.groupByColumn===colIndex)this.toggleGroupOrder();
        else this.enableGrouping(colIndex);
    };

    AR.DataGrid.prototype.enableGrouping=function(colIndex){
        this.isGrouped=true;
        this.groupByColumn=colIndex||this.groupByColumn;
        this.groupByDirection='asc';
        this.buildGroups();
        this.render();
    };

    AR.DataGrid.prototype.toggleGroupOrder=function(){
        this.groupByDirection=this.groupByDirection==='asc'?'desc':'asc';
        this.buildGroups();
        this.render();
    };

    AR.DataGrid.prototype.buildGroups=function(){
        var self=this;
        var col=this.columns.find(function(c){return c.index===self.groupByColumn;});
        var map={};
        this._rowRegistry.viewIndex.forEach(function(idx){
            var val=self.data[idx][self.groupByColumn-1];
            var key=(val==null||val==='')?'Incomplete':(col&&col.isDate?self.getDateBucket(val):String(val));
            if(!map[key])map[key]={key:key,pointers:[]};
            map[key].pointers.push(idx);
        });
        this.groups=Object.keys(map).map(function(k){return map[k];});
        this.groups.sort(function(a,b){return self.groupByDirection==='asc'?a.key.localeCompare(b.key):-a.key.localeCompare(b.key);});
    };

    AR.DataGrid.prototype.getDateBucket=function(v){
        var d=new Date(v);if(isNaN(d.getTime()))return'Invalid';
        var now=new Date();now.setHours(0,0,0,0);d.setHours(0,0,0,0);
        var diff=Math.floor((d-now)/86400000);
        if(diff===0)return'Today';
        if(diff===-1)return'Yesterday';
        if(diff===1)return'Tomorrow';
        if(diff<-1&&diff>-7)return'Last Week';
        return diff<0?'Past':'Future';
    };

    // ============================================================================
    // RENDERING
    // ============================================================================
    AR.DataGrid.prototype.render=function(){
        this.tbody.innerHTML='';
        if(this.isGrouped)this.renderGrouped();
        else this.renderFlat();
        if(this.hasNavigation)this.updateRowIndicator();
    };

    AR.DataGrid.prototype.renderFlat=function(){
        var cap=Math.min(this._rowRegistry.viewIndex.length,this.options.rowCapFirst);
        for(var i=0;i<cap;i++)this.tbody.appendChild(this.createDataRow(this._rowRegistry.viewIndex[i],i));
        this.displayedRowCount=cap;
    };

    AR.DataGrid.prototype.renderGrouped=function(){
        var self=this,dIdx=0;
        this.groups.forEach(function(g){
            var tr=document.createElement('tr');tr.className='datagrid-group-row';
            var icon=self.collapsedGroups[g.key]?'&#43;':'&#8722;';
            tr.innerHTML='<td colspan="100%"><span class="group-toggle">'+icon+'</span> '+g.key+' ('+g.pointers.length+')</td>';
            tr.onclick=function(){self.collapsedGroups[g.key]=!self.collapsedGroups[g.key];self.render();};
            self.tbody.appendChild(tr);
            if(!self.collapsedGroups[g.key])g.pointers.forEach(function(p){self.tbody.appendChild(self.createDataRow(p,dIdx++));});
        });
        this.displayedRowCount=dIdx;
    };

    AR.DataGrid.prototype.createDataRow=function(dataIdx,displayIdx){
        var rowData=this.data[dataIdx],tr=document.createElement('tr');tr.className='datagrid-row';
        if(this.hasNavigation){var td=document.createElement('td');td.className='datagrid-indicator-cell';tr.appendChild(td);}
        this.columns.forEach(function(col){
            var td=document.createElement('td');
            var val=rowData[col.index-1]; // 1-based external → 0-based internal
            td.textContent=(col.isDate&&val)?new Date(val).toLocaleDateString():String(val||'');
            tr.appendChild(td);
        });
        var self=this;tr.onclick=function(){self.setCurrentRow(displayIdx);};
        return tr;
    };

    // ============================================================================
    // ACCESSIBILITY
    // ============================================================================
    AR.DataGrid.prototype.setupAccessibility=function(){
        this.table.setAttribute('role','grid');
        this.table.setAttribute('aria-readonly','true');
    };

    window.AR=AR;
})(window);
