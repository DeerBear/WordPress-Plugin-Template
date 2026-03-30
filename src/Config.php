<?php
/**
 * Plugin configuration — single source of truth for all runtime identifiers.
 *
 * SETUP INSTRUCTIONS:
 *
 *   1. Edit the constants below (NAME, SLUG, PREFIX, etc.) to match your plugin.
 *   2. Run: php setup.php
 *      This will automatically rename files, namespaces, function names,
 *      composer.json, phpcs.xml, and the WP plugin header to match Config.
 *   3. Run: composer dump-autoload
 *   4. Delete setup.php — you won't need it again.
 *
 * After setup, THIS FILE is the only place you change identifiers.
 * All other files reference Config:: constants at runtime.
 *
 * WHAT CANNOT BE DRIVEN AT RUNTIME (and why setup.php handles them):
 *   - PHP namespace           — PSR-4 autoloading requires static strings
 *   - WP plugin header        — WordPress parses it as plain text, not PHP
 *   - Global function name    — must be a static function declaration
 *   - composer.json namespace — Composer needs static JSON
 *   - Main plugin filename    — WordPress uses it as the plugin identifier
 *
 * @package YourPlugin
 */

declare(strict_types=1);

namespace YourPlugin;

/**
 * Central configuration. Edit these values, then run setup.php.
 */
final class Config {

	// ========================================================================
	// EDIT THESE VALUES FOR YOUR PLUGIN
	// ========================================================================

	// -- Plugin identity -----------------------------------------------------

	/** Full display name shown to users. */
	public const NAME = 'Your Plugin Name';

	/** Plugin slug — used in URLs, filenames, CSS handles, text domain. */
	public const SLUG = 'your-plugin';

	/** Option name prefix — used for wp_options, transients, cron hooks. */
	public const PREFIX = 'your_plugin_';

	/** Text domain for i18n — should match SLUG in almost all cases. */
	public const TEXT_DOMAIN = 'your-plugin';

	/** PHP namespace — must match composer.json PSR-4 key (set by setup.php). */
	public const PHP_NAMESPACE = 'YourPlugin';

	/** Global accessor function name, e.g. your_plugin() (set by setup.php). */
	public const FUNCTION_NAME = 'your_plugin';

	/** Plugin version. */
	public const VERSION = '1.0.0';

	// -- Author --------------------------------------------------------------

	/** Author name. */
	public const AUTHOR = 'Your Name';

	/** Author website. */
	public const AUTHOR_URI = 'https://example.com';

	/** Plugin home page / marketing site. */
	public const PLUGIN_URI = 'https://example.com/your-plugin';

	// -- Deployment mode -----------------------------------------------------

	/**
	 * Controls which parts of the plugin load freely vs require a license.
	 *
	 *   'wp_only'         — WP plugin only. WooCommerce not loaded.
	 *   'wc_only'         — WooCommerce only. General WP features not loaded.
	 *   'wp_licensed_wc'  — WP free, WooCommerce requires license.
	 *   'wc_licensed_wp'  — WooCommerce free, WP features require license.
	 */
	public const MODE = 'wp_licensed_wc';

	// -- Licensing -----------------------------------------------------------

	/** Base URL of your license server API. */
	public const LICENSE_API_URL = 'https://your-license-server.com/api';

	/** URL of your plugin update endpoint. */
	public const UPDATE_URL = 'https://your-update-server.com/api/plugins/your-plugin';

	// -- WordPress requirements ----------------------------------------------

	/** Minimum WordPress version. */
	public const REQUIRES_WP = '6.0';

	/** Minimum PHP version. */
	public const REQUIRES_PHP = '8.1';

	// ========================================================================
	// DERIVED VALUES — DO NOT EDIT BELOW THIS LINE
	// ========================================================================

	// -- Option keys (derived from PREFIX) -----------------------------------

	public const OPTION_VERSION        = self::PREFIX . 'version';
	public const OPTION_SETTINGS       = self::PREFIX . 'options';
	public const OPTION_LICENSE_KEY    = self::PREFIX . 'license_key';
	public const OPTION_LICENSE_STATUS = self::PREFIX . 'license_status';
	public const OPTION_LICENSE_DATA   = self::PREFIX . 'license_data';

	// -- Transient keys ------------------------------------------------------

	public const TRANSIENT_LICENSE_CACHE = self::PREFIX . 'license_cache';
	public const TRANSIENT_UPDATE_INFO   = self::PREFIX . 'update_info';

	// -- Hooks / cron --------------------------------------------------------

	public const CRON_LICENSE_CHECK = self::PREFIX . 'license_check';

	// -- Nonce actions -------------------------------------------------------

	public const NONCE_LICENSE = self::PREFIX . 'license_action';

	// -- Mode helpers --------------------------------------------------------

	public static function wp_features_enabled(): bool {
		return self::MODE !== 'wc_only';
	}

	public static function wc_features_enabled(): bool {
		return self::MODE !== 'wp_only';
	}

	public static function wp_features_require_license(): bool {
		return self::MODE === 'wc_licensed_wp';
	}

	public static function wc_features_require_license(): bool {
		return self::MODE === 'wp_licensed_wc';
	}

	// -- Nonce helpers -------------------------------------------------------

	public static function meta_box_nonce( string $id ): string {
		return self::PREFIX . 'mb_' . $id . '_nonce';
	}

	public static function meta_box_action( string $id ): string {
		return self::PREFIX . 'mb_' . $id;
	}

	private function __construct() {}
}
