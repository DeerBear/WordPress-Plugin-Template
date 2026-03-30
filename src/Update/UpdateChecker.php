<?php
/**
 * Update Checker — hooks into WordPress to check for updates from your own server.
 *
 * @package YourPlugin\Update
 */

declare(strict_types=1);

namespace YourPlugin\Update;

use YourPlugin\License\LicenseClient;

/**
 * Checks a custom update server for new plugin versions and integrates
 * with the WordPress update system.
 *
 * Expected server response (JSON):
 * {
 *   "version": "1.2.0",
 *   "download_url": "https://your-server.com/downloads/your-plugin-1.2.0.zip",
 *   "requires": "6.0",
 *   "requires_php": "8.1",
 *   "tested": "6.7",
 *   "changelog": "<h4>1.2.0</h4><ul><li>New feature</li></ul>"
 * }
 */
class UpdateChecker {

	private string $plugin_file;
	private string $plugin_basename;
	private string $update_url;
	private string $plugin_slug;
	private LicenseClient $license_client;

	/**
	 * @param string        $plugin_file    Full path to the main plugin file.
	 * @param string        $update_url     URL of the update endpoint.
	 * @param LicenseClient $license_client License client for authenticated requests.
	 */
	public function __construct( string $plugin_file, string $update_url, LicenseClient $license_client ) {
		$this->plugin_file     = $plugin_file;
		$this->plugin_basename = plugin_basename( $plugin_file );
		$this->plugin_slug     = dirname( $this->plugin_basename );
		$this->update_url      = $update_url;
		$this->license_client  = $license_client;

		add_filter( 'pre_set_site_transient_update_plugins', [ $this, 'check_for_update' ] );
		add_filter( 'plugins_api', [ $this, 'plugin_info' ], 10, 3 );
		add_filter( 'upgrader_post_install', [ $this, 'post_install' ], 10, 3 );
	}

	/**
	 * Check the remote server for an available update.
	 *
	 * @param object $transient The update_plugins transient.
	 * @return object Modified transient.
	 */
	public function check_for_update( object $transient ): object {
		if ( empty( $transient->checked ) ) {
			return $transient;
		}

		$remote = $this->fetch_update_info();

		if ( ! $remote ) {
			return $transient;
		}

		$current_version = $transient->checked[ $this->plugin_basename ] ?? YOUR_PLUGIN_VERSION;

		if ( version_compare( $remote['version'], $current_version, '>' ) ) {
			$transient->response[ $this->plugin_basename ] = (object) [
				'slug'         => $this->plugin_slug,
				'plugin'       => $this->plugin_basename,
				'new_version'  => $remote['version'],
				'url'          => $remote['homepage'] ?? '',
				'package'      => $remote['download_url'] ?? '',
				'requires'     => $remote['requires'] ?? '',
				'requires_php' => $remote['requires_php'] ?? '8.1',
				'tested'       => $remote['tested'] ?? '',
			];
		} else {
			// No update available — still add to no_update to clear stale data.
			$transient->no_update[ $this->plugin_basename ] = (object) [
				'slug'         => $this->plugin_slug,
				'plugin'       => $this->plugin_basename,
				'new_version'  => $current_version,
				'url'          => '',
				'package'      => '',
			];
		}

		return $transient;
	}

	/**
	 * Provide plugin info for the "View details" popup.
	 *
	 * @param false|object|array $result The result object/array.
	 * @param string             $action The API action.
	 * @param object             $args   API arguments.
	 * @return false|object
	 */
	public function plugin_info( false|object|array $result, string $action, object $args ): false|object {
		if ( 'plugin_information' !== $action || ( $args->slug ?? '' ) !== $this->plugin_slug ) {
			return $result;
		}

		$remote = $this->fetch_update_info();

		if ( ! $remote ) {
			return $result;
		}

		return (object) [
			'name'          => $remote['name'] ?? 'Your Plugin',
			'slug'          => $this->plugin_slug,
			'version'       => $remote['version'],
			'author'        => $remote['author'] ?? '',
			'homepage'      => $remote['homepage'] ?? '',
			'requires'      => $remote['requires'] ?? '',
			'requires_php'  => $remote['requires_php'] ?? '8.1',
			'tested'        => $remote['tested'] ?? '',
			'download_link' => $remote['download_url'] ?? '',
			'sections'      => [
				'description' => $remote['description'] ?? '',
				'changelog'   => $remote['changelog'] ?? '',
			],
			'banners'       => $remote['banners'] ?? [],
		];
	}

	/**
	 * After install, ensure the plugin folder name is correct.
	 *
	 * @param bool  $response   Install response.
	 * @param array $hook_extra Extra arguments.
	 * @param array $result     Install result.
	 * @return bool
	 */
	public function post_install( bool $response, array $hook_extra, array $result ): bool {
		if ( ! isset( $hook_extra['plugin'] ) || $hook_extra['plugin'] !== $this->plugin_basename ) {
			return $response;
		}

		global $wp_filesystem;

		$proper_destination = WP_PLUGIN_DIR . '/' . $this->plugin_slug;

		if ( $result['destination'] !== $proper_destination ) {
			$wp_filesystem->move( $result['destination'], $proper_destination );
		}

		activate_plugin( $this->plugin_basename );

		return $response;
	}

	/**
	 * Fetch update information from the remote server.
	 *
	 * @return array|null Update data or null on failure.
	 */
	private function fetch_update_info(): ?array {
		$cache_key = 'your_plugin_update_info';
		$cached    = get_transient( $cache_key );

		if ( false !== $cached ) {
			return $cached;
		}

		$url = add_query_arg( [
			'license_key'    => $this->license_client->get_key(),
			'site_url'       => home_url(),
			'plugin_version' => YOUR_PLUGIN_VERSION,
		], $this->update_url );

		$response = wp_remote_get( $url, [
			'timeout'   => 15,
			'sslverify' => true,
			'headers'   => [ 'Accept' => 'application/json' ],
		] );

		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! is_array( $body ) || empty( $body['version'] ) ) {
			return null;
		}

		// Cache for 6 hours.
		set_transient( $cache_key, $body, 6 * HOUR_IN_SECONDS );

		return $body;
	}
}
