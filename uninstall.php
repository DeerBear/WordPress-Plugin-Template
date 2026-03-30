<?php
/**
 * Fired when the plugin is uninstalled.
 *
 * Clean up all plugin data: options, transients, post meta, custom tables, etc.
 *
 * @package YourPlugin
 */

declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Load autoloader for Config access.
if ( file_exists( __DIR__ . '/vendor/autoload.php' ) ) {
	require_once __DIR__ . '/vendor/autoload.php';
}

use YourPlugin\Config;

// Remove plugin options.
delete_option( Config::OPTION_VERSION );
delete_option( Config::OPTION_SETTINGS );
delete_option( Config::OPTION_LICENSE_KEY );
delete_option( Config::OPTION_LICENSE_STATUS );
delete_option( Config::OPTION_LICENSE_DATA );

// Remove transients.
delete_transient( Config::TRANSIENT_LICENSE_CACHE );
delete_transient( Config::TRANSIENT_UPDATE_INFO );

// Remove scheduled events.
$timestamp = wp_next_scheduled( Config::CRON_LICENSE_CHECK );
if ( $timestamp ) {
	wp_unschedule_event( $timestamp, Config::CRON_LICENSE_CHECK );
}

// Uncomment to remove custom post types and their content:
// $posts = get_posts( [
//     'post_type'   => 'your_post_type',
//     'numberposts' => -1,
//     'post_status' => 'any',
// ] );
// foreach ( $posts as $post ) {
//     wp_delete_post( $post->ID, true );
// }

// Uncomment to drop custom database tables:
// global $wpdb;
// $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}your_table" );
