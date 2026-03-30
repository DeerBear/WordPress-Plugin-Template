<?php
/**
 * WooCommerce Bootstrap — detects WooCommerce and wires up all WC integrations.
 *
 * @package YourPlugin\WooCommerce
 */

declare(strict_types=1);

namespace YourPlugin\WooCommerce;

use YourPlugin\Config;
use YourPlugin\License\FeatureGate;
use YourPlugin\License\LicenseClient;

/**
 * Central entry point for all WooCommerce functionality.
 *
 * Only loads if WooCommerce is active. Safe to instantiate unconditionally —
 * it checks for WC availability before doing anything.
 *
 * License integration:
 *   - WC features can be gated behind license tiers via FeatureGate
 *   - Completed orders can auto-provision license keys via your backend
 *   - Admin notices warn if the license doesn't include WC features
 */
class WooCommerceBootstrap {

	private bool $wc_active = false;

	public function __construct() {
		add_action( 'plugins_loaded', [ $this, 'init' ], 20 );
	}

	/**
	 * Initialise WooCommerce integrations if WC is available.
	 */
	public function init(): void {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return;
		}

		$this->wc_active = true;

		// Always register these regardless of license (needed for HPOS compat).
		add_action( 'before_woocommerce_init', [ $this, 'declare_hpos_compatibility' ] );

		// Check license before loading premium WC features.
		$gate = $this->get_feature_gate();

		if ( ! $gate->is_valid() ) {
			add_action( 'admin_notices', [ $this, 'license_inactive_notice' ] );
			// Still load basic settings so the user can configure/activate.
			add_filter( 'woocommerce_get_settings_pages', [ $this, 'add_settings_tab' ] );
			return;
		}

		// Gate WC features behind license — check for 'woocommerce' feature
		// or require a minimum tier. Customise this logic for your needs.
		if ( ! $this->is_wc_feature_allowed( $gate ) ) {
			add_action( 'admin_notices', [ $this, 'wc_feature_not_included_notice' ] );
			add_filter( 'woocommerce_get_settings_pages', [ $this, 'add_settings_tab' ] );
			return;
		}

		// Full WC integration — license is valid and includes WC features.
		add_filter( 'woocommerce_get_settings_pages', [ $this, 'add_settings_tab' ] );
		add_action( 'woocommerce_loaded', [ $this, 'load_product_types' ] );
		add_filter( 'woocommerce_payment_gateways', [ $this, 'register_payment_gateways' ] );
		add_action( 'rest_api_init', [ $this, 'register_rest_routes' ] );
		add_action( 'woocommerce_before_single_product', [ $this, 'before_single_product' ] );
		add_action( 'woocommerce_cart_calculate_fees', [ $this, 'maybe_add_fees' ] );
		add_action( 'woocommerce_order_status_completed', [ $this, 'on_order_completed' ] );

		/**
		 * Fires after the plugin's WooCommerce integrations are loaded.
		 *
		 * Only fires when the license is valid and WC features are allowed.
		 */
		do_action( Config::PREFIX . 'woocommerce_loaded' );
	}

	// -- License checks ------------------------------------------------------

	/**
	 * Get the FeatureGate instance.
	 */
	private function get_feature_gate(): FeatureGate {
		return your_plugin()->features();
	}

	/**
	 * Get the LicenseClient instance.
	 */
	private function get_license_client(): LicenseClient {
		return your_plugin()->license();
	}

	/**
	 * Check if the current license includes WooCommerce features.
	 *
	 * By default, checks for a 'woocommerce' feature flag OR a 'pro' tier
	 * or above. Customise this to match your licensing model.
	 *
	 * @param FeatureGate $gate The feature gate instance.
	 * @return bool
	 */
	private function is_wc_feature_allowed( FeatureGate $gate ): bool {
		/**
		 * Filters whether WooCommerce features are allowed by the current license.
		 *
		 * @param bool        $allowed Whether WC features are allowed.
		 * @param FeatureGate $gate    The feature gate instance.
		 */
		return apply_filters(
			Config::PREFIX . 'wc_features_allowed',
			$gate->can( 'woocommerce' ) || $gate->tier_at_least( 'pro' ),
			$gate
		);
	}

	// -- Admin notices -------------------------------------------------------

	/**
	 * Show notice when no active license is found.
	 */
	public function license_inactive_notice(): void {
		$screen = get_current_screen();
		if ( ! $screen || ! str_starts_with( $screen->id, 'woocommerce' ) ) {
			return;
		}

		printf(
			'<div class="notice notice-warning"><p>%s <a href="%s">%s</a></p></div>',
			esc_html(
				sprintf(
					/* translators: %s: plugin name */
					__( '%s WooCommerce features are disabled — no active license found.', Config::TEXT_DOMAIN ),
					Config::NAME
				)
			),
			esc_url( admin_url( 'options-general.php?page=' . Config::SLUG . '-license' ) ),
			esc_html__( 'Activate your license', Config::TEXT_DOMAIN )
		);
	}

	/**
	 * Show notice when the license doesn't include WC features.
	 */
	public function wc_feature_not_included_notice(): void {
		$screen = get_current_screen();
		if ( ! $screen || ! str_starts_with( $screen->id, 'woocommerce' ) ) {
			return;
		}

		printf(
			'<div class="notice notice-info"><p>%s</p></div>',
			esc_html(
				sprintf(
					/* translators: %s: plugin name */
					__( '%s WooCommerce integration requires a Pro license or higher.', Config::TEXT_DOMAIN ),
					Config::NAME
				)
			)
		);
	}

	// -- HPOS compat ---------------------------------------------------------

	/**
	 * Declare compatibility with WooCommerce HPOS (Custom Order Tables).
	 */
	public function declare_hpos_compatibility(): void {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
				'custom_order_tables',
				YOUR_PLUGIN_FILE,
				true
			);
		}
	}

	// -- WC integration hooks ------------------------------------------------

	/**
	 * Add a custom WooCommerce settings tab.
	 *
	 * @param array $settings Existing settings pages.
	 * @return array Modified settings pages.
	 */
	public function add_settings_tab( array $settings ): array {
		$settings[] = new WooCommerceSettings();
		return $settings;
	}

	/**
	 * Load custom WooCommerce product types.
	 */
	public function load_product_types(): void {
		// Example: new ProductType\YourCustomProduct();
	}

	/**
	 * Register custom payment gateways.
	 *
	 * @param array $gateways Existing gateways.
	 * @return array Modified gateways.
	 */
	public function register_payment_gateways( array $gateways ): array {
		// Uncomment when you have a gateway:
		// $gateways[] = PaymentGateway::class;
		return $gateways;
	}

	/**
	 * Register custom WooCommerce REST API routes.
	 */
	public function register_rest_routes(): void {
		$controller = new WooCommerceRestAPI();
		$controller->register_routes();
	}

	/**
	 * Hook into the single product page.
	 */
	public function before_single_product(): void {
		// Add custom functionality before product display.
	}

	/**
	 * Add custom fees to the cart (license-gated example).
	 *
	 * @param \WC_Cart $cart Cart object.
	 */
	public function maybe_add_fees( \WC_Cart $cart ): void {
		// Example: only add fee if the license has the feature enabled.
		// $gate = $this->get_feature_gate();
		// if ( $gate->can( 'custom_fees' ) ) {
		//     $cart->add_fee( 'Custom Fee', 5.00 );
		// }
	}

	/**
	 * Handle completed orders — provision licenses from your backend.
	 *
	 * This is where you'd call your license server to create/activate a
	 * license key for the customer who just purchased.
	 *
	 * @param int $order_id Order ID.
	 */
	public function on_order_completed( int $order_id ): void {
		$order  = wc_get_order( $order_id );
		$client = $this->get_license_client();

		if ( ! $order ) {
			return;
		}

		// Skip if already processed.
		if ( $order->get_meta( Config::PREFIX . 'license_provisioned' ) ) {
			return;
		}

		/**
		 * Fires when an order is completed and license provisioning should occur.
		 *
		 * Use this hook to call your license server API and create a license
		 * key for the customer. Example implementation:
		 *
		 *   add_action( '{prefix}provision_license', function( $order, $client ) {
		 *       $response = wp_remote_post( Config::LICENSE_API_URL . '/create', [
		 *           'body' => json_encode([
		 *               'customer_email' => $order->get_billing_email(),
		 *               'product_id'     => ...,
		 *               'order_id'       => $order->get_id(),
		 *           ]),
		 *       ]);
		 *       $data = json_decode( wp_remote_retrieve_body( $response ), true );
		 *       $order->update_meta_data( '{prefix}customer_license_key', $data['license_key'] );
		 *       $order->save();
		 *   }, 10, 2 );
		 *
		 * @param \WC_Order     $order  The completed order.
		 * @param LicenseClient $client The license client instance.
		 */
		do_action( Config::PREFIX . 'provision_license', $order, $client );

		$order->update_meta_data( Config::PREFIX . 'license_provisioned', '1' );
		$order->save();
	}

	/**
	 * Check if WooCommerce is active.
	 */
	public function is_active(): bool {
		return $this->wc_active;
	}
}
