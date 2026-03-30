<?php
/**
 * WooCommerce REST API extensions.
 *
 * @package YourPlugin\WooCommerce
 */

declare(strict_types=1);

namespace YourPlugin\WooCommerce;

use YourPlugin\Config;

/**
 * Registers custom REST API endpoints under the WooCommerce namespace.
 *
 * Endpoints are available at: /wp-json/{slug}/v1/
 */
class WooCommerceRestAPI {

	private string $namespace;

	public function __construct() {
		$this->namespace = Config::SLUG . '/v1';
	}

	/**
	 * Register all routes.
	 */
	public function register_routes(): void {
		register_rest_route( $this->namespace, '/status', [
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => [ $this, 'get_status' ],
			'permission_callback' => [ $this, 'check_admin_permissions' ],
		] );

		register_rest_route( $this->namespace, '/license', [
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => [ $this, 'get_license_info' ],
			'permission_callback' => [ $this, 'check_admin_permissions' ],
		] );

		register_rest_route( $this->namespace, '/webhook', [
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => [ $this, 'handle_webhook' ],
			'permission_callback' => [ $this, 'verify_webhook_signature' ],
		] );
	}

	/**
	 * GET /status — plugin and WooCommerce status overview.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function get_status( \WP_REST_Request $request ): \WP_REST_Response {
		return new \WP_REST_Response( [
			'plugin_version' => Config::VERSION,
			'wc_version'     => defined( 'WC_VERSION' ) ? WC_VERSION : 'unknown',
			'php_version'    => PHP_VERSION,
			'wp_version'     => get_bloginfo( 'version' ),
		] );
	}

	/**
	 * GET /license — current license info.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function get_license_info( \WP_REST_Request $request ): \WP_REST_Response {
		$license = your_plugin()->license();

		return new \WP_REST_Response( [
			'status' => $license->get_status(),
			'data'   => $license->get_data(),
		] );
	}

	/**
	 * POST /webhook — receive events from your SaaS backend.
	 *
	 * Use this to receive subscription changes, payment events,
	 * license updates, etc. from your backend server.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function handle_webhook( \WP_REST_Request $request ): \WP_REST_Response {
		$event = $request->get_param( 'event' );
		$data  = $request->get_json_params();

		/**
		 * Fires when a webhook event is received from the SaaS backend.
		 *
		 * @param string $event Event type identifier.
		 * @param array  $data  Full webhook payload.
		 */
		do_action( Config::PREFIX . 'webhook_received', $event, $data );

		// Handle specific events.
		match ( $event ) {
			'license.activated'   => $this->handle_license_event( $data ),
			'license.deactivated' => $this->handle_license_event( $data ),
			'license.expired'     => $this->handle_license_event( $data ),
			'subscription.renewed' => $this->handle_subscription_event( $data ),
			'subscription.cancelled' => $this->handle_subscription_event( $data ),
			default => null,
		};

		return new \WP_REST_Response( [ 'received' => true ] );
	}

	/**
	 * Handle a license-related webhook event.
	 */
	private function handle_license_event( array $data ): void {
		$status = $data['status'] ?? '';
		if ( $status ) {
			update_option( Config::OPTION_LICENSE_STATUS, sanitize_text_field( $status ) );
		}

		if ( ! empty( $data['license_data'] ) ) {
			update_option( Config::OPTION_LICENSE_DATA, $data['license_data'] );
		}
	}

	/**
	 * Handle a subscription-related webhook event.
	 */
	private function handle_subscription_event( array $data ): void {
		// Update local subscription data.
		$license_data = (array) get_option( Config::OPTION_LICENSE_DATA, [] );
		$license_data['subscription_status'] = $data['subscription_status'] ?? '';
		$license_data['expires_at']          = $data['expires_at'] ?? $license_data['expires_at'] ?? null;

		update_option( Config::OPTION_LICENSE_DATA, $license_data );
	}

	/**
	 * Permission check for admin-only endpoints.
	 */
	public function check_admin_permissions(): bool {
		return current_user_can( 'manage_woocommerce' );
	}

	/**
	 * Verify the webhook signature from your backend.
	 *
	 * Override this with your actual signature verification logic.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool|\WP_Error
	 */
	public function verify_webhook_signature( \WP_REST_Request $request ): bool|\WP_Error {
		$signature = $request->get_header( 'X-Webhook-Signature' );
		$secret    = get_option( Config::PREFIX . 'wc_api_key', '' );

		if ( empty( $secret ) ) {
			return new \WP_Error(
				'webhook_not_configured',
				__( 'Webhook secret not configured.', Config::TEXT_DOMAIN ),
				[ 'status' => 403 ]
			);
		}

		if ( empty( $signature ) ) {
			return new \WP_Error(
				'missing_signature',
				__( 'Missing webhook signature.', Config::TEXT_DOMAIN ),
				[ 'status' => 401 ]
			);
		}

		$body            = $request->get_body();
		$expected_sig    = hash_hmac( 'sha256', $body, $secret );

		if ( ! hash_equals( $expected_sig, $signature ) ) {
			return new \WP_Error(
				'invalid_signature',
				__( 'Invalid webhook signature.', Config::TEXT_DOMAIN ),
				[ 'status' => 401 ]
			);
		}

		return true;
	}
}
