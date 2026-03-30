# WP Module Loader — Product Concept

## The Problem

WordPress plugin vendors have no native way to protect their source code.
Plugins must be extracted as plain PHP files on disk, fully readable by anyone
with FTP or file manager access. Existing solutions (ionCube, Zend Guard)
require server extensions that most shared hosts don't install.

## The Product

A WordPress-native module runtime that lets plugin vendors ship their
commercial code inside zip archives. A thin loader plugin handles extraction,
license validation, and lifecycle management — no special PHP extensions
required, works on any host.

## How It Works

### Architecture

```
wp-content/plugins/
  my-plugin/                    ← The vendor's plugin (normal WP plugin)
    my-plugin.php               ← Standard plugin header + loader bootstrap
    loader.php                  ← The Module Loader (this product)
    modules/
      core.zip                  ← Zipped module — always loaded
      pro-features.zip          ← Zipped module — loaded for Pro tier
      enterprise-api.zip        ← Zipped module — loaded for Enterprise tier
    cache/                      ← Temporary extraction directory
      core/                     ← Extracted, cached, auto-cleaned
      pro-features/             ← Only exists while license is valid
```

### Lifecycle

1. WordPress activates the plugin normally (standard plugin header).
2. The loader bootstrap runs on `plugins_loaded`.
3. For each registered module:
   a. Check license tier — is this module allowed?
   b. Check cache — is it already extracted and current? (hash comparison)
   c. If not cached → extract from zip to `cache/` directory.
   d. Load the module's entry-point class.
   e. The loader wires the module into WordPress (hooks, filters, menus).
   f. Update the module's "last accessed" timestamp.
4. WP-Cron job runs periodically (configurable TTL, e.g. 24 hours).
   - Modules not accessed within TTL → delete extracted files.
   - License expired → wipe all cached extractions immediately.

### Module Structure (Inside the Zip)

Modules are **plain PHP classes**, not standalone WordPress plugins.
They have no plugin header. The loader handles all WordPress integration.

```
pro-features.zip
  module.json                   ← Module manifest (name, version, entry class, hooks)
  src/
    ProFeatures.php             ← Entry-point class
    Dashboard.php
    Exporter.php
    ...
```

**module.json example:**

```json
{
  "name": "pro-features",
  "version": "1.2.0",
  "entry_class": "ProFeatures",
  "namespace": "MyPlugin\\Pro",
  "requires_tier": "pro",
  "hooks": {
    "admin_menu": "register_menu",
    "init": "init",
    "wp_ajax_export": "handle_export"
  }
}
```

The `hooks` map tells the loader which WordPress hooks to register and which
methods on the entry class to call. The module itself never calls
`add_action()` directly — the loader does it on behalf of the module.

### The Loader (Decorator Pattern)

The loader is a decorator around each module. It:

- Validates the license before extraction
- Extracts and caches the module files
- Autoloads the module's classes (PSR-4 from the extracted path)
- Registers WordPress hooks as defined in `module.json`
- Provides WordPress path helpers that work correctly for extracted modules
  (wrapping `plugin_dir_path()`, `plugin_dir_url()`, etc.)
- Manages the cache TTL and cleanup

**Key class responsibilities:**

| Class | Role |
|-------|------|
| `ModuleLoader` | Core orchestrator — reads manifests, validates, extracts, loads |
| `ModuleCache` | Extraction, hash verification, TTL cleanup |
| `ModuleProxy` | Decorator around a loaded module — registers hooks, provides WP path helpers |
| `LicenseGate` | Validates tier/feature before allowing module extraction |

## WordPress Compatibility Challenges

### Hook Timing

WordPress hooks fire in a specific order. Modules must be extracted and loaded
early enough to register their hooks before they fire.

**Solution:** The loader runs on `plugins_loaded` (priority 0, earliest).
Module hooks are registered immediately after extraction. For hooks that have
already fired by this point (e.g., `muplugins_loaded`), those cannot be
supported — but `plugins_loaded` is early enough for virtually all use cases
(`init`, `admin_menu`, `wp_enqueue_scripts`, etc. all fire later).

### File Paths and URLs

WordPress path functions (`plugin_dir_url()`, `plugins_url()`) resolve based
on the calling file's location. Extracted files live in `cache/`, not the
expected plugin directory.

**Solution:** `ModuleProxy` provides path helpers that map the cache path back
to the correct plugin URL:

```php
// Instead of: plugins_url( 'assets/style.css', __FILE__ )
// Module uses: $this->module_url( 'assets/style.css' )
```

### Plugin Updates

WordPress expects to overwrite files in the plugin directory. The zip modules
need to be updated too.

**Solution:** The vendor's update package includes updated zip files. When
WordPress updates the plugin, the new zips replace the old ones. On next
request, the loader detects hash mismatch → re-extracts from the new zip.

### WP-CLI and Cron

WP-CLI and cron requests also need modules loaded. The loader handles this
transparently since it runs on `plugins_loaded` regardless of context.

## Vendor Workflow

1. Vendor builds their plugin using the standard template structure.
2. Business logic goes into module directories (plain PHP classes).
3. Build script zips each module directory → places in `modules/`.
4. `module.json` in each module defines entry class, hooks, tier requirement.
5. The thin loader plugin + zipped modules = the distributable package.
6. License server controls which tiers unlock which modules.

## Tier-Based Module Loading

```php
// module.json → "requires_tier": "pro"
// The loader checks:
$gate->tier_at_least( $manifest['requires_tier'] )
// If false → module is never extracted or loaded.
// If license expires → cron wipes the extracted files.
```

This means a single plugin download can serve free, pro, and enterprise
customers. The license key determines which modules activate.

## Cache / Extraction Strategy

| Event | Action |
|-------|--------|
| First request after install | Extract needed modules, cache them |
| Subsequent requests | Load from cache (fast, opcache-friendly) |
| Module not accessed for TTL period | Cron deletes extracted files |
| License expires | Cron wipes all tier-gated extractions |
| Plugin updated (new zip hash) | Re-extract on next request |
| Manual cache clear | Re-extract on next request |

## Security Considerations

- **Not encryption** — this is obfuscation through transience. Files exist on
  disk while cached. A determined attacker with persistent file access can
  capture them. This raises the bar significantly for casual copying but does
  not provide cryptographic protection.
- **Zip integrity** — verify zip hashes against a manifest to detect tampering.
- **Cache directory** — should have an `.htaccess` / `index.php` to prevent
  direct web access to extracted PHP files.
- **License validation** — should phone home periodically, not just check a
  local flag. Cached license status + periodic server validation.

## Revenue Model

| Plan | Price | Includes |
|------|-------|----------|
| Solo | €120/yr | Loader for 1 plugin project |
| Pro | €249/yr | Up to 5 plugin projects |
| Agency | €499/yr | Unlimited projects, white-label loader |

The loader itself is licensed per-project. Vendors embed it in their plugins.
Their customers never see or interact with it — it's invisible infrastructure.

## What This Does NOT Do

- Does not encrypt PHP source code (no ionCube-style bytecode encoding)
- Does not work with plugins that aren't built for this architecture
- Does not protect against a server admin with root access and patience
- Does not replace proper licensing — it *complements* it

## Future Possibility: Beyond WordPress

> WordPress is slowly losing ground. The alternative might be a new CMS
> entirely with something like this included natively.

A module loader like this is not inherently WordPress-specific. The core
concepts (zip-based module delivery, manifest-driven hook registration,
tier-gated extraction, cache TTL) could work in any PHP application. The
WordPress-specific parts (hook names, path helpers, cron) are isolated in
`ModuleProxy` and could be swapped for another framework's equivalents.

If a future CMS were built with this architecture natively, modules would be
first-class citizens rather than an afterthought. Install, activate, tier-gate,
update — all built into the core, not bolted on.

---

*This document is a product concept. No code has been written yet.*
