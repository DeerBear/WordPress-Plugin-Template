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

// Remove plugin options.
delete_option( 'your_plugin_version' );
delete_option( 'your_plugin_options' );
delete_option( 'your_plugin_license_key' );
delete_option( 'your_plugin_license_status' );
delete_option( 'your_plugin_license_data' );

// Remove transients.
delete_transient( 'your_plugin_license_cache' );
delete_transient( 'your_plugin_update_info' );

// Remove scheduled events.
$timestamp = wp_next_scheduled( 'your_plugin_license_check' );
if ( $timestamp ) {
	wp_unschedule_event( $timestamp, 'your_plugin_license_check' );
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
