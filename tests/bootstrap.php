<?php
/**
 * PHPUnit bootstrap file.
 *
 * For unit tests that do NOT require a full WordPress environment,
 * we just load the Composer autoloader and define stubs.
 *
 * For integration tests that need WordPress, see the wp-tests-config
 * approach at https://make.wordpress.org/core/handbook/testing/
 *
 * @package YourPlugin\Tests
 */

declare(strict_types=1);

// Composer autoloader.
require_once dirname( __DIR__ ) . '/vendor/autoload.php';

// Define constants that the plugin expects.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/tmp/wordpress/' );
}

if ( ! defined( 'YOUR_PLUGIN_VERSION' ) ) {
	define( 'YOUR_PLUGIN_VERSION', '1.0.0-test' );
}

if ( ! defined( 'YOUR_PLUGIN_FILE' ) ) {
	define( 'YOUR_PLUGIN_FILE', dirname( __DIR__ ) . '/your-plugin.php' );
}

if ( ! defined( 'YOUR_PLUGIN_DIR' ) ) {
	define( 'YOUR_PLUGIN_DIR', dirname( __DIR__ ) . '/' );
}

if ( ! defined( 'YOUR_PLUGIN_URL' ) ) {
	define( 'YOUR_PLUGIN_URL', 'https://example.com/wp-content/plugins/your-plugin/' );
}

if ( ! defined( 'YOUR_PLUGIN_BASENAME' ) ) {
	define( 'YOUR_PLUGIN_BASENAME', 'your-plugin/your-plugin.php' );
}

// Stub WordPress functions used in unit tests.
// For integration tests, load the real WordPress test suite instead.
if ( ! function_exists( 'get_option' ) ) {
	function get_option( string $option, $default = false ) {
		return $default;
	}
}

if ( ! function_exists( 'update_option' ) ) {
	function update_option( string $option, $value, $autoload = null ): bool {
		return true;
	}
}

if ( ! function_exists( 'delete_transient' ) ) {
	function delete_transient( string $transient ): bool {
		return true;
	}
}

if ( ! function_exists( 'get_transient' ) ) {
	function get_transient( string $transient ) {
		return false;
	}
}

if ( ! function_exists( 'set_transient' ) ) {
	function set_transient( string $transient, $value, int $expiration = 0 ): bool {
		return true;
	}
}

if ( ! function_exists( 'home_url' ) ) {
	function home_url( string $path = '' ): string {
		return 'https://example.com' . $path;
	}
}

if ( ! function_exists( 'add_action' ) ) {
	function add_action( string $hook, $callback, int $priority = 10, int $accepted_args = 1 ): bool {
		return true;
	}
}

if ( ! function_exists( 'add_filter' ) ) {
	function add_filter( string $hook, $callback, int $priority = 10, int $accepted_args = 1 ): bool {
		return true;
	}
}

if ( ! function_exists( 'apply_filters' ) ) {
	function apply_filters( string $hook, $value, ...$args ) {
		return $value;
	}
}

if ( ! function_exists( 'wp_next_scheduled' ) ) {
	function wp_next_scheduled( string $hook, array $args = [] ) {
		return false;
	}
}

if ( ! function_exists( 'wp_schedule_event' ) ) {
	function wp_schedule_event( int $timestamp, string $recurrence, string $hook, array $args = [] ): bool {
		return true;
	}
}

if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 3600 );
}

if ( ! defined( 'DAY_IN_SECONDS' ) ) {
	define( 'DAY_IN_SECONDS', 86400 );
}
