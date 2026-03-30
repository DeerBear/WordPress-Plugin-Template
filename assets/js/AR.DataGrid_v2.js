class DataGrid {
  constructor(el, rows, options = {}) {
    this.columns = this.detectColumns(rows);
    this.rows = this.normalizeRows(rows);
    this.expandedGroups = new Set();

    const self = this; 
    this.vm = new MVVM({
      el,
      data: {
        sortKey: '', asc: true, groupBy: [], bucketBy: {},
        columnConfig: options.columnConfig || {},
        calculators: Object.assign({
          sum: v => v.reduce((a, b) => a + b, 0),
          avg: v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0,
          loglog: v => v.reduce((acc, val) => acc + Math.log(Math.log(val + 1) + 1), 0)
        }, options.calculators || {})
      },
      computed: {
        viewRows() { 
          // 'this' here is the MVVM instance. We pass it to the logic.
          return self.computeViewRows(this); 
        }
      }
    });
  }

  computeViewRows(vm) {
    let data = [...this.rows];
    if (vm.sortKey) {
      data.sort((a, b) => {
        const va = a.__normalized[vm.sortKey];
        const vb = b.__normalized[vm.sortKey];
        if (va === vb) return 0;
        return va > vb ? (vm.asc ? 1 : -1) : (vm.asc ? -1 : 1);
      });
    }

    if (!vm.groupBy || !vm.groupBy.length) return data;
    const tree = this.groupRecursive(data, vm.groupBy, 0, [], vm);
    return this.flatten(tree, vm);
  }

  groupRecursive(rows, keys, level, path, vm) {
    if (level >= keys.length) return rows;
    const key = keys[level];
    const map = new Map();

    rows.forEach(r => {
      const v = this.getGroupValue(r, key, vm);
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(r);
    });

    return [...map.entries()].map(([value, children]) => {
      const id = [...path, `${key}:${value}`].join('|');
      return {
        __group: true,
        id,
        value,
        label: this.formatGroupLabel(key, value),
        level,
        expanded: this.expandedGroups.has(id),
        aggregates: this.computeAggregates(children, vm),
        children: this.groupRecursive(children, keys, level + 1, [...path, id], vm)
      };
    });
  }

  computeAggregates(rows, vm) {
    const res = {};
    const { calculators, columnConfig } = vm;
    Object.keys(columnConfig).forEach(col => {
      const values = rows.map(r => r.__normalized[col]).filter(v => typeof v === 'number');
      res[col] = { count: values.length };
      columnConfig[col].forEach(m => {
        if (calculators[m]) res[col][m] = calculators[m](values);
      });
    });
    return res;
  }

  flatten(nodes, vm, out = []) {
    nodes.forEach(n => {
      out.push(n);
      if (n.__group && n.expanded) {
        this.flatten(n.children, vm, out);
        out.push({ __footer: true, group: n });
      }
    });
    return out;
  }

  /**********************
   * Original Helpers Restored
   **********************/
  detectColumns(rows) {
    const cols = {};
    const sample = rows[0] || {};
    Object.keys(sample).forEach(k => {
      const v = sample[k];
      if (typeof v === 'number') cols[k] = 'number';
      else if (this.isDate(v)) cols[k] = 'date';
      else if (this.isDateTime(v)) cols[k] = 'datetime';
      else cols[k] = 'string';
    });
    return cols;
  }

  normalizeRows(rows) {
    return rows.map(r => {
      const n = {};
      Object.keys(r).forEach(k => {
        const t = this.columns[k];
        if (t === 'number') n[k] = r[k];
        else if (t === 'date' || t === 'datetime') n[k] = new Date(r[k]).getTime();
        else n[k] = String(r[k]).toLowerCase();
      });
      return { __raw: r, __normalized: n };
    });
  }

  getGroupValue(row, col, vm) {
    let v = row.__normalized[col];
    const bucket = vm.bucketBy[col];
    if ((this.columns[col] === 'date' || this.columns[col] === 'datetime') && bucket) {
      return this.bucketDate(v, bucket);
    }
    return v;
  }

  bucketDate(ts, unit) {
    const d = new Date(ts);
    if (unit === 'day') d.setHours(0, 0, 0, 0);
    if (unit === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); }
    if (unit === 'year') { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
    return d.getTime();
  }

  isDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  isDateTime(v) { 
    return typeof v === 'string' && !isNaN(Date.parse(v)) && (v.includes('T') || v.includes(':')); 
  }

  formatGroupLabel(col, v) {
    const t = this.columns[col];
    if (t === 'date') return new Date(v).toISOString().slice(0, 10);
    if (t === 'datetime') return new Date(v).toLocaleString();
    return v;
  }

  toggleGroup(id) {
    this.expandedGroups.has(id) ? this.expandedGroups.delete(id) : this.expandedGroups.add(id);
    this.vm.groupBy = [...this.vm.groupBy]; 
  }

  sort(key) {
    if (this.vm.sortKey === key) {
      this.vm.asc = !this.vm.asc;
    } else {
      this.vm.sortKey = key;
      this.vm.asc = true;
    }
  }
}