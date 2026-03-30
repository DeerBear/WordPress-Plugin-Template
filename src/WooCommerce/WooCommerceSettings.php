<?php
/**
 * WooCommerce Settings Tab — adds a custom tab under WooCommerce > Settings.
 *
 * @package YourPlugin\WooCommerce
 */

declare(strict_types=1);

namespace YourPlugin\WooCommerce;

use YourPlugin\Config;

/**
 * Registers a custom settings tab within the WooCommerce settings page.
 */
class WooCommerceSettings extends \WC_Settings_Page {

	public function __construct() {
		$this->id    = Config::SLUG;
		$this->label = Config::NAME;

		parent::__construct();
	}

	/**
	 * Get sections for this tab.
	 *
	 * @return array
	 */
	public function get_sections(): array {
		$sections = [
			''        => __( 'General', Config::TEXT_DOMAIN ),
			'api'     => __( 'API Settings', Config::TEXT_DOMAIN ),
			'display' => __( 'Display', Config::TEXT_DOMAIN ),
		];

		/**
		 * Filters the WooCommerce settings sections.
		 *
		 * @param array $sections Settings sections.
		 */
		return apply_filters( Config::PREFIX . 'wc_settings_sections', $sections );
	}

	/**
	 * Get settings fields for a section.
	 *
	 * @param string $current_section The current section slug.
	 * @return array
	 */
	public function get_settings( $current_section = '' ): array {
		$settings = match ( $current_section ) {
			'api'     => $this->get_api_settings(),
			'display' => $this->get_display_settings(),
			default   => $this->get_general_settings(),
		};

		/**
		 * Filters the WooCommerce settings for a section.
		 *
		 * @param array  $settings        Settings fields.
		 * @param string $current_section Section slug.
		 */
		return apply_filters( Config::PREFIX . 'wc_settings', $settings, $current_section );
	}

	/**
	 * General settings.
	 */
	private function get_general_settings(): array {
		return [
			[
				'title' => __( 'General Settings', Config::TEXT_DOMAIN ),
				'type'  => 'title',
				'desc'  => __( 'Configure general plugin settings for WooCommerce.', Config::TEXT_DOMAIN ),
				'id'    => Config::PREFIX . 'wc_general_options',
			],
			[
				'title'    => __( 'Enable Integration', Config::TEXT_DOMAIN ),
				'desc'     => __( 'Enable WooCommerce integration features.', Config::TEXT_DOMAIN ),
				'id'       => Config::PREFIX . 'wc_enabled',
				'type'     => 'checkbox',
				'default'  => 'yes',
			],
			[
				'title'    => __( 'Order Processing', Config::TEXT_DOMAIN ),
				'desc'     => __( 'Choose how to process orders.', Config::TEXT_DOMAIN ),
				'id'       => Config::PREFIX . 'wc_order_processing',
				'type'     => 'select',
				'options'  => [
					'automatic' => __( 'Automatic', Config::TEXT_DOMAIN ),
					'manual'    => __( 'Manual', Config::TEXT_DOMAIN ),
					'queued'    => __( 'Queued (Background)', Config::TEXT_DOMAIN ),
				],
				'default'  => 'automatic',
			],
			[
				'type' => 'sectionend',
				'id'   => Config::PREFIX . 'wc_general_options',
			],
		];
	}

	/**
	 * API settings.
	 */
	private function get_api_settings(): array {
		return [
			[
				'title' => __( 'API Settings', Config::TEXT_DOMAIN ),
				'type'  => 'title',
				'desc'  => __( 'Configure API connection settings.', Config::TEXT_DOMAIN ),
				'id'    => Config::PREFIX . 'wc_api_options',
			],
			[
				'title'    => __( 'API Endpoint', Config::TEXT_DOMAIN ),
				'desc'     => __( 'Your SaaS backend API endpoint.', Config::TEXT_DOMAIN ),
				'id'       => Config::PREFIX . 'wc_api_endpoint',
				'type'     => 'url',
				'default'  => '',
				'desc_tip' => true,
			],
			[
				'title'    => __( 'API Key', Config::TEXT_DOMAIN ),
				'desc'     => __( 'Your API key for authentication.', Config::TEXT_DOMAIN ),
				'id'       => Config::PREFIX . 'wc_api_key',
				'type'     => 'password',
				'default'  => '',
				'desc_tip' => true,
			],
			[
				'title'    => __( 'Request Timeout', Config::TEXT_DOMAIN ),
				'desc'     => __( 'API request timeout in seconds.', Config::TEXT_DOMAIN ),
				'id'       => Config::PREFIX . 'wc_api_timeout',
				'type'     => 'number',
				'default'  => '30',
				'desc_tip' => true,
				'custom_attributes' => [
					'min'  => '5',
					'max'  => '120',
					'step' => '5',
				],
			],
			[
				'type' => 'sectionend',
				'id'   => Config::PREFIX . 'wc_api_options',
			],
		];
	}

	/**
	 * Display settings.
	 */
	private function get_display_settings(): array {
		return [
			[
				'title' => __( 'Display Settings', Config::TEXT_DOMAIN ),
				'type'  => 'title',
				'desc'  => __( 'Configure display and frontend settings.', Config::TEXT_DOMAIN ),
				'id'    => Config::PREFIX . 'wc_display_options',
			],
			[
				'title'    => __( 'Show on Product Page', Config::TEXT_DOMAIN ),
				'desc'     => __( 'Display plugin widget on single product pages.', Config::TEXT_DOMAIN ),
				'id'       => Config::PREFIX . 'wc_show_on_product',
				'type'     => 'checkbox',
				'default'  => 'yes',
			],
			[
				'title'    => __( 'Widget Position', Config::TEXT_DOMAIN ),
				'desc'     => __( 'Where to display the widget on product pages.', Config::TEXT_DOMAIN ),
				'id'       => Config::PREFIX . 'wc_widget_position',
				'type'     => 'select',
				'options'  => [
					'before_add_to_cart' => __( 'Before Add to Cart', Config::TEXT_DOMAIN ),
					'after_add_to_cart'  => __( 'After Add to Cart', Config::TEXT_DOMAIN ),
					'after_summary'      => __( 'After Product Summary', Config::TEXT_DOMAIN ),
					'custom_tab'         => __( 'Custom Product Tab', Config::TEXT_DOMAIN ),
				],
				'default'  => 'after_add_to_cart',
			],
			[
				'type' => 'sectionend',
				'id'   => Config::PREFIX . 'wc_display_options',
			],
		];
	}
}
