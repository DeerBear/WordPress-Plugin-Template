<?php
/**
 * License Client — communicates with your custom license server API.
 *
 * This client is backend-agnostic. Point it at any API that implements
 * the expected endpoints. Works out of the box with:
 *   - cubiclesoft/php-license-server
 *   - UpdatePulse Server
 *   - Any custom REST API
 *
 * Expected API contract (customise via filters):
 *   POST /activate   { license_key, site_url, plugin_version }
 *   POST /deactivate { license_key, site_url }
 *   POST /validate   { license_key, site_url }
 *   GET  /check      { license_key }   — returns tier, features, expiry
 *
 * @package YourPlugin\License
 */

declare(strict_types=1);

namespace YourPlugin\License;

/**
 * Handles license activation, deactivation, validation, and status caching.
 */
class LicenseClient {

	private const OPTION_KEY        = 'your_plugin_license_key';
	private const STATUS_OPTION     = 'your_plugin_license_status';
	private const DATA_OPTION       = 'your_plugin_license_data';
	private const CACHE_TRANSIENT   = 'your_plugin_license_cache';
	private const CACHE_TTL         = 12 * HOUR_IN_SECONDS;

	private string $api_url;

	public function __construct( string $api_url ) {
		$this->api_url = rtrim( $api_url, '/' );

		add_action( 'your_plugin_license_check', [ $this, 'scheduled_check' ] );

		if ( ! wp_next_scheduled( 'your_plugin_license_check' ) ) {
			wp_schedule_event( time(), 'twicedaily', 'your_plugin_license_check' );
		}
	}

	// -- Public API ----------------------------------------------------------

	/**
	 * Activate the license for this site.
	 *
	 * @param string $license_key The license key.
	 * @return array{success: bool, message: string, data?: array}
	 */
	public function activate( string $license_key ): array {
		$response = $this->request( 'POST', '/activate', [
			'license_key'    => $license_key,
			'site_url'       => home_url(),
			'plugin_version' => YOUR_PLUGIN_VERSION,
		] );

		if ( $response['success'] ) {
			update_option( self::OPTION_KEY, $license_key );
			update_option( self::STATUS_OPTION, 'active' );
			update_option( self::DATA_OPTION, $response['data'] ?? [] );
			$this->refresh_cache( $license_key );
		}

		return $response;
	}

	/**
	 * Deactivate the license for this site.
	 *
	 * @param string $license_key The license key.
	 * @return array{success: bool, message: string}
	 */
	public function deactivate( string $license_key ): array {
		$response = $this->request( 'POST', '/deactivate', [
			'license_key' => $license_key,
			'site_url'    => home_url(),
		] );

		if ( $response['success'] ) {
			update_option( self::STATUS_OPTION, 'inactive' );
			update_option( self::DATA_OPTION, [] );
			delete_transient( self::CACHE_TRANSIENT );
		}

		return $response;
	}

	/**
	 * Validate the current license against the remote server.
	 *
	 * @param string $license_key The license key.
	 * @return array{success: bool, message: string, data?: array}
	 */
	public function validate( string $license_key ): array {
		$response = $this->request( 'POST', '/validate', [
			'license_key' => $license_key,
			'site_url'    => home_url(),
		] );

		if ( $response['success'] ) {
			update_option( self::STATUS_OPTION, 'active' );
			update_option( self::DATA_OPTION, $response['data'] ?? [] );
		} else {
			update_option( self::STATUS_OPTION, 'invalid' );
			update_option( self::DATA_OPTION, [] );
		}

		return $response;
	}

	/**
	 * Check license details (tier, features, expiry) with caching.
	 *
	 * @param bool $force_refresh Bypass the cache.
	 * @return array License data or empty array.
	 */
	public function check( bool $force_refresh = false ): array {
		$license_key = $this->get_key();

		if ( empty( $license_key ) ) {
			return [];
		}

		if ( ! $force_refresh ) {
			$cached = get_transient( self::CACHE_TRANSIENT );
			if ( false !== $cached ) {
				return $cached;
			}
		}

		return $this->refresh_cache( $license_key );
	}

	/**
	 * Get the stored license key.
	 */
	public function get_key(): string {
		return (string) get_option( self::OPTION_KEY, '' );
	}

	/**
	 * Get the stored license status.
	 *
	 * @return string One of: 'active', 'inactive', 'expired', 'invalid', or ''.
	 */
	public function get_status(): string {
		return (string) get_option( self::STATUS_OPTION, '' );
	}

	/**
	 * Get stored license data (tier, features, expiry, etc.).
	 */
	public function get_data(): array {
		return (array) get_option( self::DATA_OPTION, [] );
	}

	/**
	 * Check if the license is currently active.
	 */
	public function is_active(): bool {
		return 'active' === $this->get_status();
	}

	// -- Scheduled heartbeat -------------------------------------------------

	/**
	 * Cron callback — revalidate the license periodically.
	 */
	public function scheduled_check(): void {
		$license_key = $this->get_key();
		if ( ! empty( $license_key ) ) {
			$this->validate( $license_key );
		}
	}

	// -- Internal helpers ----------------------------------------------------

	/**
	 * Refresh the cached license data from the server.
	 */
	private function refresh_cache( string $license_key ): array {
		$response = $this->request( 'GET', '/check', [
			'license_key' => $license_key,
		] );

		$data = $response['data'] ?? [];

		if ( $response['success'] && ! empty( $data ) ) {
			set_transient( self::CACHE_TRANSIENT, $data, self::CACHE_TTL );
			update_option( self::DATA_OPTION, $data );
		}

		return $data;
	}

	/**
	 * Make an HTTP request to the license API.
	 *
	 * @param string $method   HTTP method.
	 * @param string $endpoint API endpoint path.
	 * @param array  $params   Request parameters.
	 * @return array{success: bool, message: string, data?: array}
	 */
	private function request( string $method, string $endpoint, array $params = [] ): array {
		$url = $this->api_url . $endpoint;

		/**
		 * Filters the license API request arguments.
		 *
		 * @param array  $params   Request parameters.
		 * @param string $endpoint API endpoint.
		 * @param string $method   HTTP method.
		 */
		$params = apply_filters( 'your_plugin_license_request_params', $params, $endpoint, $method );

		$args = [
			'timeout'   => 15,
			'sslverify' => true,
			'headers'   => [
				'Accept'       => 'application/json',
				'Content-Type' => 'application/json',
			],
		];

		if ( 'GET' === $method ) {
			$url = add_query_arg( $params, $url );
			$response = wp_remote_get( $url, $args );
		} else {
			$args['body'] = wp_json_encode( $params );
			$response = wp_remote_post( $url, $args );
		}

		if ( is_wp_error( $response ) ) {
			return [
				'success' => false,
				'message' => $response->get_error_message(),
			];
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! is_array( $body ) ) {
			return [
				'success' => false,
				'message' => __( 'Invalid response from license server.', 'your-plugin' ),
			];
		}

		return [
			'success' => $code >= 200 && $code < 300 && ( $body['success'] ?? false ),
			'message' => $body['message'] ?? '',
			'data'    => $body['data'] ?? [],
		];
	}
}
