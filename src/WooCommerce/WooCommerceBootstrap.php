<?php
/**
 * WooCommerce Bootstrap — detects WooCommerce and wires up all WC integrations.
 *
 * @package YourPlugin\WooCommerce
 */

declare(strict_types=1);

namespace YourPlugin\WooCommerce;

use YourPlugin\Config;

/**
 * Central entry point for all WooCommerce functionality.
 *
 * Only loads if WooCommerce is active. Safe to instantiate unconditionally —
 * it checks for WC availability before doing anything.
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

		// Declare HPOS (High-Performance Order Storage) compatibility.
		add_action( 'before_woocommerce_init', [ $this, 'declare_hpos_compatibility' ] );

		// Register WC settings tab.
		add_filter( 'woocommerce_get_settings_pages', [ $this, 'add_settings_tab' ] );

		// Load custom product types.
		add_action( 'woocommerce_loaded', [ $this, 'load_product_types' ] );

		// Load payment gateways.
		add_filter( 'woocommerce_payment_gateways', [ $this, 'register_payment_gateways' ] );

		// REST API extensions.
		add_action( 'rest_api_init', [ $this, 'register_rest_routes' ] );

		// Frontend hooks.
		add_action( 'woocommerce_before_single_product', [ $this, 'before_single_product' ] );

		// Cart / checkout hooks.
		add_action( 'woocommerce_cart_calculate_fees', [ $this, 'maybe_add_fees' ] );

		// Order hooks.
		add_action( 'woocommerce_order_status_completed', [ $this, 'on_order_completed' ] );

		/**
		 * Fires after the plugin's WooCommerce integrations are loaded.
		 *
		 * Use this hook to extend WooCommerce functionality from add-ons.
		 */
		do_action( Config::PREFIX . 'woocommerce_loaded' );
	}

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
	 *
	 * Uncomment and implement when you need a custom product type:
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
	 * Add custom fees to the cart.
	 *
	 * @param \WC_Cart $cart Cart object.
	 */
	public function maybe_add_fees( \WC_Cart $cart ): void {
		// Example: $cart->add_fee( 'Custom Fee', 5.00 );
	}

	/**
	 * Handle completed orders.
	 *
	 * @param int $order_id Order ID.
	 */
	public function on_order_completed( int $order_id ): void {
		// Provision license keys, trigger SaaS access, etc.
	}

	/**
	 * Check if WooCommerce is active.
	 */
	public function is_active(): bool {
		return $this->wc_active;
	}
}
