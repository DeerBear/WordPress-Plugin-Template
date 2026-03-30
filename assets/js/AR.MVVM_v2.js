class Dep {
  constructor() { this.subs = []; }
  depend() { if (Dep.target) this.subs.push(Dep.target); }
  notify() { this.subs.forEach(s => s.update()); }
}
Dep.target = null;

function observe(obj) {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(key => {
    let val = obj[key];
    const dep = new Dep();
    observe(val); 
    Object.defineProperty(obj, key, {
      enumerable: true, configurable: true,
      get() { dep.depend(); return val; },
      set(newVal) {
        if (newVal !== val) {
          val = newVal;
          observe(newVal);
          dep.notify();
        }
      }
    });
  });
}

class Watcher {
  constructor(vm, exp, cb) {
    this.vm = vm; this.exp = exp; this.cb = cb;
    Dep.target = this;
    this.value = this.getVal(vm, exp);
    Dep.target = null;
  }
  getVal(vm, exp) {
    try {
      return exp.split('.').reduce((obj, k) => (obj ? obj[k] : undefined), vm);
    } catch (e) { return undefined; }
  }
  update() {
    const val = this.getVal(this.vm, this.exp);
    if (val !== this.value) {
      this.value = val;
      this.cb(val);
    }
  }
}

class Compiler {
  constructor(el, vm) {
    this.vm = vm;
    this.el = document.querySelector(el);
    this.compile(this.el);
  }

  compile(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === 3) this.compileText(child);
      if (child.nodeType === 1) this.compileElement(child);
      if (child.childNodes.length) this.compile(child);
    });
  }

  compileElement(node) {
    [...node.attributes].forEach(attr => {
      const { name, value } = attr;
      if (name === 'v-if') this.compileIf(node, value);
      if (name === 'v-for') this.compileFor(node, value);
      if (name === 'v-model') this.setupModel(node, value);
      if (name.startsWith('v-on:')) {
        const evt = name.split(':')[1];
        node.addEventListener(evt, this.vm[value].bind(this.vm));
      }
    });
  }

  compileIf(node, exp) {
    const parent = node.parentNode;
    const anchor = document.createComment(`v-if-anchor`);
    parent.replaceChild(anchor, node);
    const toggle = (val) => {
      if (val) {
        if (!node.parentNode) parent.insertBefore(node, anchor.nextSibling);
      } else {
        if (node.parentNode) parent.removeChild(node);
      }
    };
    new Watcher(this.vm, exp, toggle);
    toggle(this.vm[exp]);
  }

  compileText(node) {
    const reg = /\{\{(.+?)\}\}/g;
    const raw = node.textContent;
    if (reg.test(raw)) {
      const updateText = () => {
        node.textContent = raw.replace(reg, (_, key) => {
           const val = key.trim().split('.').reduce((obj, k) => obj ? obj[k] : '', this.vm);
           return val !== undefined ? val : '';
        });
      };
      const match = raw.match(/\{\{(.+?)\}\}/);
      if (match) new Watcher(this.vm, match[1].trim(), updateText);
      updateText();
    }
  }

  compileFor(node, exp) {
    const [item, listName] = exp.split(' in ').map(s => s.trim());
    const parent = node.parentNode;
    const template = node.cloneNode(true);
    const anchor = document.createComment(`v-for-anchor-${listName}`);
    parent.replaceChild(anchor, node);

    const render = (newList) => {
      while (anchor.nextSibling && anchor.nextSibling.nodeType !== 8) {
        parent.removeChild(anchor.nextSibling);
      }
      const fragment = document.createDocumentFragment();
      (newList || []).forEach(rowData => {
        const clone = template.cloneNode(true);
        clone.removeAttribute('v-for');
        // Use DOM-safe text replacement to prevent XSS
        clone.querySelectorAll('*').forEach(el => {
          [...el.childNodes].forEach(child => {
            if (child.nodeType === 3) {
              const raw = child.textContent;
              if (/\{\{.+?\}\}/.test(raw)) {
                child.textContent = raw.replace(/\{\{(.+?)\}\}/g, (_, key) => {
                  const path = key.trim().split('.');
                  if (path[0] === item) return path.slice(1).reduce((obj, k) => obj ? obj[k] : '', rowData);
                  return _;
                });
              }
            }
          });
        });
        // Also handle direct text nodes of the clone itself
        [...clone.childNodes].forEach(child => {
          if (child.nodeType === 3) {
            const raw = child.textContent;
            if (/\{\{.+?\}\}/.test(raw)) {
              child.textContent = raw.replace(/\{\{(.+?)\}\}/g, (_, key) => {
                const path = key.trim().split('.');
                if (path[0] === item) return path.slice(1).reduce((obj, k) => obj ? obj[k] : '', rowData);
                return _;
              });
            }
          }
        });
        fragment.appendChild(clone);
      });
      parent.insertBefore(fragment, anchor.nextSibling);
    };
    new Watcher(this.vm, listName, render);
    render(this.vm[listName]);
  }

  setupModel(node, exp) {
    node.value = this.vm[exp];
    new Watcher(this.vm, exp, v => node.value = v);
    node.addEventListener('input', e => this.vm[exp] = e.target.value);
  }
}

class MVVM {
  constructor(options) {
    this.$data = options.data;
    Object.keys(this.$data).forEach(k => {
      Object.defineProperty(this, k, {
        get: () => this.$data[k],
        set: v => (this.$data[k] = v)
      });
    });
    const computed = options.computed || {};
    Object.keys(computed).forEach(k => {
      Object.defineProperty(this, k, { get: computed[k].bind(this) });
    });
    observe(this.$data);
    new Compiler(options.el, this);
  }
}