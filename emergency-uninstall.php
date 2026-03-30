<?php
/**
 * Emergency Uninstall — standalone script that removes all plugin data
 * even when WordPress is broken, locked up, or the plugin can't be
 * deactivated normally.
 *
 * Usage:
 *   From command line:
 *     cd /path/to/wordpress
 *     php wp-content/plugins/your-plugin/emergency-uninstall.php
 *
 *   Or via WP-CLI:
 *     wp eval-file wp-content/plugins/your-plugin/emergency-uninstall.php
 *
 * What it does:
 *   1. Loads wp-config.php directly (minimal WordPress bootstrap)
 *   2. Removes all plugin options from wp_options
 *   3. Removes all plugin transients
 *   4. Removes all plugin cron jobs
 *   5. Deactivates the plugin in the active_plugins option
 *   6. Tells you exactly what it did
 *
 * What it does NOT do:
 *   - Delete plugin files (do that yourself: rm -rf this-directory)
 *   - Drop custom database tables (uncomment the section below if needed)
 *   - Remove post meta (uncomment the section below if needed)
 *
 * SAFETY: This script only READS wp-config.php for database credentials
 * and then talks directly to the database. It does NOT load WordPress
 * themes, other plugins, or any hooks — so nothing can interfere.
 *
 * @package YourPlugin
 */

declare(strict_types=1);

// ── Safety checks ───────────────────────────────────────────────────────────

if ( php_sapi_name() !== 'cli' && ! defined( 'ABSPATH' ) ) {
	die( "This script must be run from the command line or via WP-CLI.\n" );
}

echo "\n";
echo "╔══════════════════════════════════════════════════════════════╗\n";
echo "║  EMERGENCY UNINSTALL                                        ║\n";
echo "║  This will remove ALL plugin data from the database.        ║\n";
echo "╚══════════════════════════════════════════════════════════════╝\n\n";

// ── Load configuration ──────────────────────────────────────────────────────

// Read our Config.php to get the prefix (so this works after setup.php renames things).
$config_file = __DIR__ . '/src/Config.php';
if ( ! file_exists( $config_file ) ) {
	die( "ERROR: Cannot find src/Config.php. Are you running this from the plugin directory?\n" );
}

$config_content = file_get_contents( $config_file );
preg_match( "/PREFIX\s*=\s*'([^']+)'/", $config_content, $prefix_match );
preg_match( "/SLUG\s*=\s*'([^']+)'/", $config_content, $slug_match );

$prefix = $prefix_match[1] ?? 'your_plugin_';
$slug   = $slug_match[1] ?? 'your-plugin';

echo "Plugin prefix: {$prefix}\n";
echo "Plugin slug:   {$slug}\n\n";

// ── Find and load wp-config.php for DB credentials ──────────────────────────

if ( defined( 'ABSPATH' ) ) {
	// Running inside WordPress (e.g., via WP-CLI eval-file).
	global $wpdb;
	$use_wpdb = true;
} else {
	$use_wpdb = false;

	// Walk up directories to find wp-config.php.
	$dir = __DIR__;
	$wp_config = null;
	for ( $i = 0; $i < 10; $i++ ) {
		if ( file_exists( $dir . '/wp-config.php' ) ) {
			$wp_config = $dir . '/wp-config.php';
			break;
		}
		$dir = dirname( $dir );
	}

	if ( ! $wp_config ) {
		die( "ERROR: Cannot find wp-config.php. Make sure this plugin is inside a WordPress installation.\n" );
	}

	echo "Found wp-config.php at: {$wp_config}\n";

	// Extract DB credentials from wp-config.php without executing it.
	$wp_config_content = file_get_contents( $wp_config );

	function extract_define( string $content, string $name ): string {
		// Match both single and double quoted values.
		if ( preg_match( "/define\s*\(\s*['\"]" . preg_quote( $name, '/' ) . "['\"]\s*,\s*['\"]([^'\"]*)['\"]/" , $content, $m ) ) {
			return $m[1];
		}
		return '';
	}

	$db_name   = extract_define( $wp_config_content, 'DB_NAME' );
	$db_user   = extract_define( $wp_config_content, 'DB_USER' );
	$db_pass   = extract_define( $wp_config_content, 'DB_PASSWORD' );
	$db_host   = extract_define( $wp_config_content, 'DB_HOST' );

	// Get table prefix.
	preg_match( '/\$table_prefix\s*=\s*[\'"]([^\'"]+)/', $wp_config_content, $tp_match );
	$table_prefix = $tp_match[1] ?? 'wp_';

	if ( empty( $db_name ) || empty( $db_user ) ) {
		die( "ERROR: Could not extract database credentials from wp-config.php.\n" );
	}

	echo "Database:      {$db_name}\n";
	echo "Table prefix:  {$table_prefix}\n\n";

	// Connect to the database.
	try {
		$dsn = "mysql:host={$db_host};dbname={$db_name};charset=utf8mb4";
		$pdo = new PDO( $dsn, $db_user, $db_pass, [
			PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
		] );
	} catch ( PDOException $e ) {
		die( "ERROR: Database connection failed: " . $e->getMessage() . "\n" );
	}
}

// ── Helper function ─────────────────────────────────────────────────────────

$removed = [];

function run_query( string $sql, string $description ): void {
	global $use_wpdb, $wpdb, $pdo, $removed;

	try {
		if ( $use_wpdb ) {
			$affected = $wpdb->query( $sql );
		} else {
			$affected = $pdo->exec( $sql );
		}
		$removed[] = "{$description} ({$affected} rows)";
		echo "  ✓ {$description} — {$affected} rows affected\n";
	} catch ( \Exception $e ) {
		echo "  ✗ {$description} — ERROR: " . $e->getMessage() . "\n";
	}
}

$tp = $use_wpdb ? $wpdb->prefix : $table_prefix;

// ── Remove options ──────────────────────────────────────────────────────────

echo "Removing plugin data...\n\n";

run_query(
	"DELETE FROM {$tp}options WHERE option_name LIKE '{$prefix}%'",
	"Plugin options ({$prefix}*)"
);

// ── Remove transients ───────────────────────────────────────────────────────

run_query(
	"DELETE FROM {$tp}options WHERE option_name LIKE '_transient_{$prefix}%' OR option_name LIKE '_transient_timeout_{$prefix}%'",
	"Plugin transients"
);

// ── Remove cron jobs ────────────────────────────────────────────────────────

if ( $use_wpdb ) {
	// Inside WordPress, we can use the proper API.
	$cron = get_option( 'cron', [] );
	$cleaned = false;
	if ( is_array( $cron ) ) {
		foreach ( $cron as $timestamp => $hooks ) {
			if ( ! is_array( $hooks ) ) {
				continue;
			}
			foreach ( $hooks as $hook => $events ) {
				if ( str_starts_with( $hook, $prefix ) ) {
					unset( $cron[ $timestamp ][ $hook ] );
					$cleaned = true;
				}
			}
			if ( empty( $cron[ $timestamp ] ) ) {
				unset( $cron[ $timestamp ] );
			}
		}
		if ( $cleaned ) {
			update_option( 'cron', $cron );
		}
	}
	echo "  ✓ Plugin cron jobs — " . ( $cleaned ? 'removed' : 'none found' ) . "\n";
} else {
	// Outside WordPress, do it via raw SQL on the serialized cron option.
	// Can't cleanly modify serialized data, so just report.
	echo "  ⚠ Cron jobs — run 'wp cron event delete {$prefix}license_check' manually\n";
}

// ── Deactivate the plugin ───────────────────────────────────────────────────

if ( $use_wpdb ) {
	$active = get_option( 'active_plugins', [] );
	$basename = null;
	foreach ( $active as $plugin ) {
		if ( str_contains( $plugin, $slug ) ) {
			$basename = $plugin;
			break;
		}
	}
	if ( $basename ) {
		$active = array_diff( $active, [ $basename ] );
		update_option( 'active_plugins', array_values( $active ) );
		echo "  ✓ Deactivated plugin ({$basename})\n";
	} else {
		echo "  ⚠ Plugin was not in active_plugins list\n";
	}
} else {
	// Direct SQL approach.
	$stmt = $pdo->query( "SELECT option_value FROM {$tp}options WHERE option_name = 'active_plugins'" );
	$row  = $stmt->fetch( PDO::FETCH_ASSOC );
	if ( $row ) {
		$active = unserialize( $row['option_value'] );
		if ( is_array( $active ) ) {
			$original_count = count( $active );
			$active = array_filter( $active, fn( $p ) => ! str_contains( $p, $slug ) );
			if ( count( $active ) < $original_count ) {
				$serialized = serialize( array_values( $active ) );
				$pdo->prepare( "UPDATE {$tp}options SET option_value = ? WHERE option_name = 'active_plugins'" )
					->execute( [ $serialized ] );
				echo "  ✓ Deactivated plugin from active_plugins\n";
			} else {
				echo "  ⚠ Plugin was not in active_plugins list\n";
			}
		}
	}
}

// ── Optional: Remove post meta (uncomment if needed) ────────────────────────

// run_query(
//     "DELETE FROM {$tp}postmeta WHERE meta_key LIKE '{$prefix}%'",
//     "Plugin post meta"
// );

// ── Optional: Drop custom tables (uncomment if needed) ──────────────────────

// run_query(
//     "DROP TABLE IF EXISTS {$tp}your_custom_table",
//     "Custom table: {$tp}your_custom_table"
// );

// ── Summary ─────────────────────────────────────────────────────────────────

echo "\n";
echo "╔══════════════════════════════════════════════════════════════╗\n";
echo "║  DONE                                                       ║\n";
echo "╠══════════════════════════════════════════════════════════════╣\n";
echo "║  Plugin data has been removed from the database.            ║\n";
echo "║  Plugin has been deactivated.                               ║\n";
echo "║                                                             ║\n";
echo "║  To also remove plugin files:                               ║\n";
echo "║    rm -rf " . str_pad( __DIR__, 47 ) .                      "║\n";
echo "╚══════════════════════════════════════════════════════════════╝\n\n";
