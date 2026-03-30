<?php
/**
 * Plugin configuration — single source of truth for all identifiers.
 *
 * Change values HERE ONLY. Every other file references this class.
 *
 * @package YourPlugin
 */

declare(strict_types=1);

namespace YourPlugin;

/**
 * Central configuration constants for the plugin.
 *
 * To set up your plugin, edit ONLY the values in this file.
 * All other files pull their identifiers from here.
 */
final class Config {

	// -- Plugin identity -----------------------------------------------------

	/** Full display name shown to users. */
	public const NAME = 'Your Plugin Name';

	/** Plugin slug (used in URLs, file names, CSS classes). */
	public const SLUG = 'your-plugin';

	/** Option name prefix (used for wp_options keys). */
	public const PREFIX = 'your_plugin_';

	/** Text domain for translations (must match the slug in most cases). */
	public const TEXT_DOMAIN = 'your-plugin';

	/** Plugin version — keep in sync with the header in your-plugin.php. */
	public const VERSION = '1.0.0';

	// -- URLs ----------------------------------------------------------------

	/** Plugin home page / marketing site. */
	public const PLUGIN_URI = 'https://example.com/your-plugin';

	/** Author website. */
	public const AUTHOR_URI = 'https://example.com';

	/** Author name. */
	public const AUTHOR = 'Your Name';

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

	/**
	 * Generate a meta box nonce key.
	 */
	public static function meta_box_nonce( string $id ): string {
		return self::PREFIX . 'mb_' . $id . '_nonce';
	}

	/**
	 * Generate a meta box nonce action.
	 */
	public static function meta_box_action( string $id ): string {
		return self::PREFIX . 'mb_' . $id;
	}

	/** No instantiation. */
	private function __construct() {}
}
