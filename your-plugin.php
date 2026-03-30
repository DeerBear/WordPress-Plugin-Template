<?php
/**
 * Plugin Name:       Your Plugin Name
 * Plugin URI:        https://example.com/your-plugin
 * Description:       A modern WordPress plugin with licensing and SaaS support.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.1
 * Author:            Your Name
 * Author URI:        https://example.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       your-plugin
 * Domain Path:       /lang
 * Update URI:        https://your-update-server.com/api/plugins/your-plugin
 *
 * NOTE: The header above is parsed by WordPress and CANNOT use PHP constants.
 * Keep it in sync with src/Config.php — that file is the single source of truth
 * for all runtime references.
 *
 * EMERGENCY ESCAPE HATCHES:
 *   1. Add to wp-config.php:  define('YOUR_PLUGIN_DISABLE', true);
 *   2. Create file:           wp-content/plugins/your-plugin/.disable
 *   3. URL parameter:         ?your_plugin_safe_mode=1  (admin only, loads nothing)
 *   4. Run from CLI:          php wp-content/plugins/your-plugin/emergency-uninstall.php
 *
 * @package YourPlugin
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Plugin path constants (these are file-level and must stay here).
define( 'YOUR_PLUGIN_FILE', __FILE__ );
define( 'YOUR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'YOUR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'YOUR_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// ── Escape Hatch 1: wp-config.php constant ──────────────────────────────────
// Add define('YOUR_PLUGIN_DISABLE', true); to wp-config.php to kill the plugin.
if ( defined( 'YOUR_PLUGIN_DISABLE' ) && YOUR_PLUGIN_DISABLE ) {
	add_action( 'admin_notices', function (): void {
		printf(
			'<div class="notice notice-warning"><p><strong>%s</strong> %s <code>YOUR_PLUGIN_DISABLE</code> %s</p></div>',
			esc_html( 'Your Plugin Name' ),
			esc_html__( 'is disabled via', 'your-plugin' ),
			esc_html__( 'constant in wp-config.php. Remove it to re-enable.', 'your-plugin' )
		);
	} );
	return;
}

// ── Escape Hatch 2: .disable file ───────────────────────────────────────────
// Create an empty file called .disable in the plugin directory to kill it.
if ( file_exists( YOUR_PLUGIN_DIR . '.disable' ) ) {
	add_action( 'admin_notices', function (): void {
		printf(
			'<div class="notice notice-warning"><p><strong>%s</strong> %s <code>.disable</code> %s</p></div>',
			esc_html( 'Your Plugin Name' ),
			esc_html__( 'is disabled via', 'your-plugin' ),
			esc_html__( 'file in the plugin directory. Delete it to re-enable.', 'your-plugin' )
		);
	} );
	return;
}

// Composer autoloader.
if ( file_exists( YOUR_PLUGIN_DIR . 'vendor/autoload.php' ) ) {
	require_once YOUR_PLUGIN_DIR . 'vendor/autoload.php';
}

// Version constant derived from Config (single source of truth).
define( 'YOUR_PLUGIN_VERSION', \YourPlugin\Config::VERSION );

// ── Escape Hatch 3: Safe mode via URL parameter ────────────────────────────
// Append ?your_plugin_safe_mode=1 to any admin URL. Only works for admins.
// Loads NOTHING except an admin notice explaining how to deactivate properly.
if ( is_admin()
	&& isset( $_GET[ \YourPlugin\Config::PREFIX . 'safe_mode' ] )
	&& '1' === $_GET[ \YourPlugin\Config::PREFIX . 'safe_mode' ]
) {
	add_action( 'admin_notices', function (): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$deactivate_url = wp_nonce_url(
			admin_url( 'plugins.php?action=deactivate&plugin=' . urlencode( YOUR_PLUGIN_BASENAME ) ),
			'deactivate-plugin_' . YOUR_PLUGIN_BASENAME
		);
		printf(
			'<div class="notice notice-error"><p><strong>%s — Safe Mode</strong></p>' .
			'<p>%s</p>' .
			'<p><a href="%s" class="button button-primary">%s</a></p></div>',
			esc_html( \YourPlugin\Config::NAME ),
			esc_html__( 'The plugin is running in safe mode. No features are loaded. You can safely deactivate or uninstall from here.', \YourPlugin\Config::TEXT_DOMAIN ),
			esc_url( $deactivate_url ),
			esc_html__( 'Deactivate Plugin Now', \YourPlugin\Config::TEXT_DOMAIN )
		);
	} );
	// Don't boot anything else.
	return;
}

/**
 * Returns the main plugin instance.
 *
 * @return \YourPlugin\Plugin
 */
function your_plugin(): \YourPlugin\Plugin {
	return \YourPlugin\Plugin::instance();
}

// Boot the plugin.
add_action( 'plugins_loaded', 'your_plugin' );

// Activation hook.
register_activation_hook( __FILE__, [ \YourPlugin\Plugin::class, 'activate' ] );

// Deactivation hook.
register_deactivation_hook( __FILE__, [ \YourPlugin\Plugin::class, 'deactivate' ] );
