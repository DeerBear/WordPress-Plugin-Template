<?php
/**
 * Plugin Setup Script
 *
 * Reads your configuration from src/Config.php and renames everything to match.
 * Run this ONCE after editing Config.php, then delete this file.
 *
 * Usage:
 *   1. Edit src/Config.php with your plugin details
 *   2. Run: php setup.php
 *   3. Run: composer dump-autoload
 *   4. Delete this file
 *
 * What it does:
 *   - Renames the main plugin file (your-plugin.php → {slug}.php)
 *   - Updates the WordPress plugin header to match Config values
 *   - Replaces the PHP namespace (YourPlugin → YourNamespace) across all files
 *   - Replaces the global function name (your_plugin → your_function)
 *   - Replaces the global constant prefix (YOUR_PLUGIN_ → YOUR_PREFIX_)
 *   - Updates composer.json (name, author, namespace mapping)
 *   - Updates phpcs.xml (text domain, filename)
 *   - Updates phpunit.xml if present
 *   - Updates tests/bootstrap.php
 *
 * Safe to run multiple times — it reads current Config values fresh each time.
 *
 * @package YourPlugin
 */

declare(strict_types=1);

if ( php_sapi_name() !== 'cli' ) {
	die( 'This script must be run from the command line.' );
}

$root = __DIR__;

// ── Read Config values ─────────────────────────────────────────────────────

// We can't autoload yet (namespace may have already changed), so parse Config.php directly.
$config_content = file_get_contents( $root . '/src/Config.php' );

function extract_const( string $content, string $name ): string {
	if ( preg_match( "/public\s+const\s+{$name}\s*=\s*'([^']+)'/", $content, $m ) ) {
		return $m[1];
	}
	return '';
}

$name           = extract_const( $config_content, 'NAME' );
$slug           = extract_const( $config_content, 'SLUG' );
$prefix         = extract_const( $config_content, 'PREFIX' );
$text_domain    = extract_const( $config_content, 'TEXT_DOMAIN' );
$namespace      = extract_const( $config_content, 'PHP_NAMESPACE' );
$function_name  = extract_const( $config_content, 'FUNCTION_NAME' );
$version        = extract_const( $config_content, 'VERSION' );
$author         = extract_const( $config_content, 'AUTHOR' );
$author_uri     = extract_const( $config_content, 'AUTHOR_URI' );
$plugin_uri     = extract_const( $config_content, 'PLUGIN_URI' );
$requires_wp    = extract_const( $config_content, 'REQUIRES_WP' );
$requires_php   = extract_const( $config_content, 'REQUIRES_PHP' );
$license_api    = extract_const( $config_content, 'LICENSE_API_URL' );
$update_url     = extract_const( $config_content, 'UPDATE_URL' );

// Derived values.
$constant_prefix = strtoupper( str_replace( '-', '_', $slug ) ) . '_';
$old_constant_prefix = 'YOUR_PLUGIN_';

// ── Validate ────────────────────────────────────────────────────────────────

$errors = [];
if ( empty( $slug ) )          $errors[] = 'SLUG is empty';
if ( empty( $namespace ) )     $errors[] = 'PHP_NAMESPACE is empty';
if ( empty( $function_name ) ) $errors[] = 'FUNCTION_NAME is empty';
if ( empty( $name ) )          $errors[] = 'NAME is empty';

if ( $errors ) {
	echo "ERROR: Fix these in src/Config.php before running setup:\n";
	foreach ( $errors as $e ) {
		echo "  - {$e}\n";
	}
	exit( 1 );
}

echo "╔══════════════════════════════════════════════════════════════╗\n";
echo "║  Plugin Setup                                               ║\n";
echo "╠══════════════════════════════════════════════════════════════╣\n";
echo "║  Name:       {$name}\n";
echo "║  Slug:       {$slug}\n";
echo "║  Namespace:  {$namespace}\n";
echo "║  Function:   {$function_name}()\n";
echo "║  Prefix:     {$prefix}\n";
echo "║  Constants:  {$constant_prefix}*\n";
echo "╚══════════════════════════════════════════════════════════════╝\n\n";

// ── Collect all PHP, JSON, XML, YML files ───────────────────────────────────

function collect_files( string $dir, array $extensions ): array {
	$files = [];
	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $dir, RecursiveDirectoryIterator::SKIP_DOTS )
	);
	foreach ( $iterator as $file ) {
		if ( $file->isFile() ) {
			$ext = strtolower( $file->getExtension() );
			if ( in_array( $ext, $extensions, true ) ) {
				$path = $file->getPathname();
				// Skip vendor, .git, and this setup script itself.
				if ( str_contains( $path, '/vendor/' ) || str_contains( $path, '/.git/' ) || $path === __FILE__ ) {
					continue;
				}
				$files[] = $path;
			}
		}
	}
	return $files;
}

$files = collect_files( $root, [ 'php', 'json', 'xml', 'neon', 'yml', 'yaml' ] );

// ── Replacements ────────────────────────────────────────────────────────────

$replacements = [
	// Namespace.
	'YourPlugin'            => $namespace,
	// Global function.
	'your_plugin()'         => $function_name . '()',
	"'your_plugin'"         => "'{$function_name}'",
	'"your_plugin"'         => "\"{$function_name}\"",
	// Global constants.
	$old_constant_prefix    => $constant_prefix,
	// Composer vendor/package.
	'your-vendor/your-plugin' => strtolower( str_replace( '\\', '/', $namespace ) ) . '/' . $slug,
	// Author in composer.json.
	'"Your Name"'           => '"' . $author . '"',
	'"you@example.com"'     => '"you@' . parse_url( $author_uri, PHP_URL_HOST ) . '"',
];

$count = 0;

foreach ( $files as $filepath ) {
	$content  = file_get_contents( $filepath );
	$original = $content;

	foreach ( $replacements as $search => $replace ) {
		if ( $search === $replace ) {
			continue;
		}
		$content = str_replace( $search, $replace, $content );
	}

	if ( $content !== $original ) {
		file_put_contents( $filepath, $content );
		$relative = str_replace( $root . '/', '', $filepath );
		echo "  Updated: {$relative}\n";
		$count++;
	}
}

// ── Rename main plugin file ─────────────────────────────────────────────────

$old_main = $root . '/your-plugin.php';
$new_main = $root . '/' . $slug . '.php';

if ( file_exists( $old_main ) && $old_main !== $new_main ) {
	rename( $old_main, $new_main );
	echo "  Renamed: your-plugin.php → {$slug}.php\n";
	$count++;

	// Update the WP plugin header in the renamed file.
	$main_content = file_get_contents( $new_main );
	$main_content = preg_replace( '/Plugin Name:\s+.+/',   "Plugin Name:       {$name}", $main_content );
	$main_content = preg_replace( '/Plugin URI:\s+.+/',    "Plugin URI:        {$plugin_uri}", $main_content );
	$main_content = preg_replace( '/Version:\s+.+/',       "Version:           {$version}", $main_content );
	$main_content = preg_replace( '/Requires at least:\s+.+/', "Requires at least: {$requires_wp}", $main_content );
	$main_content = preg_replace( '/Requires PHP:\s+.+/',  "Requires PHP:      {$requires_php}", $main_content );
	$main_content = preg_replace( '/Author:\s+.+/',        "Author:            {$author}", $main_content );
	$main_content = preg_replace( '/Author URI:\s+.+/',    "Author URI:        {$author_uri}", $main_content );
	$main_content = preg_replace( '/Text Domain:\s+.+/',   "Text Domain:       {$text_domain}", $main_content );
	$main_content = preg_replace( '/Update URI:\s+.+/',    "Update URI:        {$update_url}", $main_content );
	file_put_contents( $new_main, $main_content );
	echo "  Updated: {$slug}.php (WP plugin header)\n";
} elseif ( ! file_exists( $old_main ) ) {
	// Maybe already renamed — find the current main file and update its header.
	$main_file = $root . '/' . $slug . '.php';
	if ( file_exists( $main_file ) ) {
		$main_content = file_get_contents( $main_file );
		$main_content = preg_replace( '/Plugin Name:\s+.+/',   "Plugin Name:       {$name}", $main_content );
		$main_content = preg_replace( '/Plugin URI:\s+.+/',    "Plugin URI:        {$plugin_uri}", $main_content );
		$main_content = preg_replace( '/Version:\s+.+/',       "Version:           {$version}", $main_content );
		$main_content = preg_replace( '/Requires at least:\s+.+/', "Requires at least: {$requires_wp}", $main_content );
		$main_content = preg_replace( '/Requires PHP:\s+.+/',  "Requires PHP:      {$requires_php}", $main_content );
		$main_content = preg_replace( '/Author:\s+.+/',        "Author:            {$author}", $main_content );
		$main_content = preg_replace( '/Author URI:\s+.+/',    "Author URI:        {$author_uri}", $main_content );
		$main_content = preg_replace( '/Text Domain:\s+.+/',   "Text Domain:       {$text_domain}", $main_content );
		$main_content = preg_replace( '/Update URI:\s+.+/',    "Update URI:        {$update_url}", $main_content );
		file_put_contents( $main_file, $main_content );
		echo "  Updated: {$slug}.php (WP plugin header)\n";
	}
}

// ── Update phpcs.xml references to the main file ────────────────────────────

$phpcs_file = $root . '/phpcs.xml';
if ( file_exists( $phpcs_file ) ) {
	$phpcs = file_get_contents( $phpcs_file );
	$phpcs = str_replace( 'your-plugin.php', $slug . '.php', $phpcs );
	$phpcs = preg_replace( '/value="your-plugin"/', 'value="' . $text_domain . '"', $phpcs );
	$phpcs = str_replace( 'YourPlugin', $namespace, $phpcs );
	$phpcs = str_replace( 'Your Plugin', $name, $phpcs );
	file_put_contents( $phpcs_file, $phpcs );
}

// ── Summary ─────────────────────────────────────────────────────────────────

echo "\n";
if ( $count > 0 ) {
	echo "Done! {$count} files updated.\n\n";
	echo "Next steps:\n";
	echo "  1. Run: composer dump-autoload\n";
	echo "  2. Delete this file: rm setup.php\n";
	echo "  3. Test your plugin in WordPress\n";
} else {
	echo "No changes needed — everything already matches Config.\n";
}
