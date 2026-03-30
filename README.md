# WordPress Plugin Template

A modern, pure-PHP WordPress plugin boilerplate with built-in licensing, SaaS support, WooCommerce integration, and self-hosted updates. **Zero Node.js. Zero npm.**

## Requirements

- PHP 8.1+
- WordPress 6.0+
- Composer 2.x

## Quick Start

```bash
# 1. Clone/fork the template
git clone https://github.com/your-org/wordpress-plugin-template.git my-plugin
cd my-plugin

# 2. Edit src/Config.php — set your plugin name, slug, namespace, author, URLs, and mode

# 3. Run the setup script (renames files, namespaces, headers — everything)
php setup.php

# 4. Install dependencies and rebuild the autoloader
composer install
composer dump-autoload

# 5. Delete setup.php — you won't need it again
rm setup.php
```

After setup, `src/Config.php` is the **only file you edit** for configuration. All other files reference `Config::` constants at runtime.

## Directory Structure

```
your-plugin.php                          Main plugin entry point + escape hatches
setup.php                                One-time setup script (delete after use)
emergency-uninstall.php                  Standalone emergency cleanup (CLI)
uninstall.php                            WordPress uninstall hook
composer.json                            Dependencies + PSR-4 autoloading
phpunit.xml                              PHPUnit 10 configuration
phpstan.neon                             PHPStan level 6
phpcs.xml                                WordPress coding standards
.editorconfig                            Editor-agnostic formatting
.github/workflows/ci.yml                 GitHub Actions CI (PHP 8.1–8.4)

src/
  Config.php                             Single source of truth for all identifiers
  Plugin.php                             Singleton bootstrap, mode-aware loading

  Admin/
    AdminAPI.php                         Form field rendering, validation, metaboxes
    Settings.php                         Tabbed settings page (WordPress Settings API)

  License/
    LicenseClient.php                    Activate/deactivate/validate against any API
    FeatureGate.php                      Tier checks, feature flags, usage metering
    LicenseAdmin.php                     License key admin UI with status display

  PostType/
    PostType.php                         Custom post type registration helper

  Taxonomy/
    Taxonomy.php                         Custom taxonomy registration helper

  Update/
    UpdateChecker.php                    Self-hosted plugin updates via WP's update system

  WooCommerce/
    WooCommerceBootstrap.php             WC detection, HPOS compat, license-gated loading
    WooCommerceSettings.php              Custom settings tab under WooCommerce > Settings
    WooCommerceRestAPI.php               REST API endpoints + webhook handler (HMAC)

assets/
  css/admin.css                          Admin stylesheet
  css/frontend.css                       Frontend stylesheet
  js/                                    Drop your own JS library here

tests/
  bootstrap.php                          PHPUnit bootstrap with WP function stubs
  Unit/FeatureGateTest.php               Example unit tests

lang/                                    Translation files (.pot/.po/.mo)
```

## Configuration

Everything is configured in `src/Config.php`. The setup script handles the one-time structural changes (namespace, filenames, headers). After that, Config drives all runtime behaviour.

### Deployment Modes

Set `Config::MODE` to control what loads and what requires a license:

| Mode | WP Features | WooCommerce | License gates... |
|---|---|---|---|
| `wp_only` | Free | Not loaded | Nothing |
| `wc_only` | Not loaded | Free | Nothing |
| `wp_licensed_wc` | Free | Gated | WooCommerce features |
| `wc_licensed_wp` | Gated | Free | WP features |

### Config Reference

| Constant | Purpose |
|---|---|
| `NAME` | Display name shown to users |
| `SLUG` | URL slug, filenames, CSS handles, text domain |
| `PREFIX` | wp_options prefix, transient prefix, cron hook prefix |
| `TEXT_DOMAIN` | i18n text domain (usually same as SLUG) |
| `PHP_NAMESPACE` | PSR-4 namespace (set by setup.php) |
| `FUNCTION_NAME` | Global accessor function name (set by setup.php) |
| `VERSION` | Plugin version |
| `MODE` | Deployment mode (see table above) |
| `LICENSE_API_URL` | Your license server API base URL |
| `UPDATE_URL` | Your self-hosted update server endpoint |
| `REQUIRES_WP` | Minimum WordPress version |
| `REQUIRES_PHP` | Minimum PHP version |

## Licensing System

The licensing module is backend-agnostic. It talks to any REST API that implements the expected contract. Compatible with:

- [cubiclesoft/php-license-server](https://github.com/cubiclesoft/php-license-server) (pure PHP, self-hosted)
- [UpdatePulse Server](https://github.com/Anyape/updatepulse-server) (WordPress-based)
- Any custom REST API

### Expected API Contract

```
POST /activate    { license_key, site_url, plugin_version } -> { success, message, data }
POST /deactivate  { license_key, site_url }                 -> { success, message }
POST /validate    { license_key, site_url }                 -> { success, message, data }
GET  /check       { license_key }                           -> { success, data }
```

### License Data Structure

The `data` object returned by your API should include:

```json
{
  "tier": "pro",
  "license_type": "subscription",
  "features": ["woocommerce", "export_csv", "api_access"],
  "expires_at": "2026-12-31",
  "activations": { "used": 2, "limit": 5 },
  "usage": {
    "api_calls": { "used": 450, "limit": 1000 }
  }
}
```

### Feature Gating

```php
$gate = your_plugin()->features();

// Check specific features
if ( $gate->can( 'export_csv' ) ) { /* ... */ }

// Check tier
if ( $gate->tier_at_least( 'pro' ) ) { /* ... */ }
if ( $gate->tier_is( 'enterprise' ) ) { /* ... */ }

// Check license type
if ( $gate->is_subscription() ) { /* ... */ }
if ( $gate->is_standard() ) { /* ... */ }  // perpetual / one-time

// Check validity
if ( $gate->is_valid() ) { /* active + not expired */ }
if ( $gate->is_expired() ) { /* ... */ }

// Usage metering
$remaining = $gate->usage_remaining( 'api_calls' ); // int or null
if ( $gate->has_capacity( 'api_calls' ) ) { /* ... */ }
```

### Tier Hierarchy

Default: `free < starter < pro < business < enterprise`

Customise via filter:

```php
add_filter( 'your_plugin_tier_hierarchy', function( $tiers ) {
    return [ 'free', 'basic', 'premium', 'ultimate' ];
} );
```

## Self-Hosted Updates

The `UpdateChecker` hooks into WordPress's native update system (`pre_set_site_transient_update_plugins`) to check your own server for new versions. No wordpress.org required.

Your update server should return:

```json
{
  "version": "1.2.0",
  "download_url": "https://your-server.com/downloads/your-plugin-1.2.0.zip",
  "requires": "6.0",
  "requires_php": "8.1",
  "tested": "6.7",
  "changelog": "<h4>1.2.0</h4><ul><li>New feature</li></ul>"
}
```

License key and site URL are sent as query parameters for authenticated downloads.

## WooCommerce Integration

WooCommerce support auto-detects WC and only loads when it's active. Includes:

- **HPOS compatibility** (Custom Order Tables) declared automatically
- **Settings tab** under WooCommerce > Settings with General, API, and Display sections
- **REST API** at `/wp-json/{slug}/v1/` with status, license, and webhook endpoints
- **Webhook handler** with HMAC-SHA256 signature verification for receiving events from your backend
- **Order completion hook** with license provisioning via `{prefix}provision_license` action
- **License gating** based on `Config::MODE`

### Webhook Events

The webhook endpoint (`POST /wp-json/{slug}/v1/webhook`) handles:

- `license.activated` / `license.deactivated` / `license.expired`
- `subscription.renewed` / `subscription.cancelled`

Verify webhooks by setting an API key in WooCommerce > Settings > {Plugin} > API and sending it as an `X-Webhook-Signature` header (HMAC-SHA256 of the request body).

## Custom Post Types and Taxonomies

```php
use YourPlugin\PostType\PostType;
use YourPlugin\Taxonomy\Taxonomy;

// Register a custom post type
new PostType( 'book', 'Books', 'Book', 'A library of books.', [
    'menu_icon' => 'dashicons-book',
    'supports'  => [ 'title', 'editor', 'thumbnail' ],
] );

// Register a taxonomy for it
new Taxonomy( 'genre', 'Genres', 'Genre', [ 'book' ] );
```

Registration args are filterable via `{prefix}{post_type}_register_args` and `{prefix}{taxonomy}_register_args`.

## Admin Settings

Tabbed settings page under Settings > {Plugin Name} with support for:

text, email, url, number, password, textarea, checkbox, checkbox_multi, radio, select, select_multi, hidden, color, editor (wp_editor)

Add or modify tabs via the `{prefix}settings_tabs` filter.

## Adding Your Own JavaScript Library

Drop your `.js` file in `assets/js/` and uncomment the enqueue lines in `src/Plugin.php`:

```php
wp_enqueue_script(
    Config::SLUG . '-frontend',
    YOUR_PLUGIN_URL . 'assets/js/your-library.js',
    [],
    Config::VERSION,
    true
);
```

No build step. No npm. Just enqueue and go.

## Emergency Escape Hatches

Four ways to disable the plugin, from gentle to nuclear:

| Level | Method | When to use |
|---|---|---|
| 1 | `define('YOUR_PLUGIN_DISABLE', true);` in wp-config.php | Clean disable, zero code runs |
| 2 | Create `.disable` file in the plugin directory | FTP/SSH access but can't edit wp-config |
| 3 | `?{prefix}safe_mode=1` on any admin URL | wp-admin works but plugin is causing chaos |
| 4 | `php emergency-uninstall.php` from CLI | WordPress is completely bricked |

**Safe mode** (level 3) loads nothing except an admin notice with a one-click deactivate button.

**Emergency uninstall** (level 4) bypasses WordPress entirely, connects directly to the database, removes all plugin data, and deactivates the plugin. Also works via `wp eval-file`.

## Quality Tooling

All pure PHP. Zero Node.js dependencies.

```bash
# Run tests
composer test

# Static analysis (PHPStan level 6)
composer phpstan

# Coding standards (WordPress + PHP 8.1 compat)
composer phpcs

# Auto-fix coding standard violations
composer phpcbf
```

GitHub Actions CI runs all three across PHP 8.1, 8.2, 8.3, and 8.4.

## Filters Reference

| Filter | Description |
|---|---|
| `{prefix}license_api_url` | Override the license server URL |
| `{prefix}update_url` | Override the update server URL |
| `{prefix}settings_tabs` | Add/modify settings tabs |
| `{prefix}tier_hierarchy` | Customise tier ordering |
| `{prefix}unlicensed_feature` | Allow features without a license |
| `{prefix}wp_features_allowed` | Override WP feature license gate |
| `{prefix}wc_features_allowed` | Override WC feature license gate |
| `{prefix}license_request_params` | Modify license API request params |
| `{prefix}meta_box_fields` | Register meta box fields for saving |
| `{prefix}wc_settings_sections` | Add WC settings sections |
| `{prefix}wc_settings` | Modify WC settings fields |
| `{prefix}{post_type}_register_args` | Modify CPT registration args |
| `{prefix}{taxonomy}_register_args` | Modify taxonomy registration args |

## Actions Reference

| Action | Description |
|---|---|
| `{prefix}woocommerce_loaded` | Fires after WC integrations are loaded |
| `{prefix}provision_license` | Fires on order completion for license provisioning |
| `{prefix}webhook_received` | Fires when a webhook event is received |

## License

GPL-2.0-or-later. See [LICENSE](LICENSE) for details.
