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
 * @package YourPlugin
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Plugin constants.
define( 'YOUR_PLUGIN_VERSION', '1.0.0' );
define( 'YOUR_PLUGIN_FILE', __FILE__ );
define( 'YOUR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'YOUR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'YOUR_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// Composer autoloader.
if ( file_exists( YOUR_PLUGIN_DIR . 'vendor/autoload.php' ) ) {
	require_once YOUR_PLUGIN_DIR . 'vendor/autoload.php';
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
