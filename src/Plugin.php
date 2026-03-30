<?php
/**
 * Main plugin class.
 *
 * Respects Config::MODE to determine which features load freely
 * and which require a license. See Config.php for mode definitions.
 *
 * @package YourPlugin
 */

declare(strict_types=1);

namespace YourPlugin;

use YourPlugin\Admin\Settings;
use YourPlugin\Admin\AdminAPI;
use YourPlugin\License\LicenseClient;
use YourPlugin\License\FeatureGate;
use YourPlugin\License\LicenseAdmin;
use YourPlugin\Update\UpdateChecker;
use YourPlugin\WooCommerce\WooCommerceBootstrap;

/**
 * Plugin singleton class.
 */
final class Plugin {

	private static ?Plugin $instance = null;

	private ?Settings $settings = null;
	private ?AdminAPI $admin_api = null;
	private ?LicenseClient $license_client = null;
	private ?FeatureGate $feature_gate = null;
	private ?UpdateChecker $update_checker = null;
	private ?WooCommerceBootstrap $woocommerce = null;

	/**
	 * Returns the singleton instance.
	 */
	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Plugin boot — called on plugins_loaded.
	 */
	private function __construct() {
		$this->load_textdomain();
		$this->init_license();
		$this->init_wp_features();
		$this->init_woocommerce();
		$this->init_update_checker();
		$this->register_hooks();
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}

	/**
	 * Load translations.
	 */
	private function load_textdomain(): void {
		load_plugin_textdomain(
			Config::TEXT_DOMAIN,
			false,
			dirname( YOUR_PLUGIN_BASENAME ) . '/lang'
		);
	}

	/**
	 * Initialise the license client and feature gate.
	 *
	 * Always loads — every mode needs licensing (either to gate WP or WC features,
	 * or for update checks). In 'wp_only' mode it still powers self-hosted updates.
	 */
	private function init_license(): void {
		$this->license_client = new LicenseClient(
			apply_filters( Config::PREFIX . 'license_api_url', Config::LICENSE_API_URL )
		);

		$this->feature_gate = new FeatureGate( $this->license_client );

		// License admin page always available so users can activate.
		if ( is_admin() ) {
			new LicenseAdmin( $this->license_client );
		}
	}

	/**
	 * Initialise general WP features (settings page, CPTs, taxonomies, admin API).
	 *
	 * Behaviour per mode:
	 *   wp_only        — loads freely
	 *   wc_only        — skipped entirely
	 *   wp_licensed_wc — loads freely
	 *   wc_licensed_wp — loads only with a valid license
	 */
	private function init_wp_features(): void {
		if ( ! Config::wp_features_enabled() ) {
			return;
		}

		// If WP features require a license, check before loading.
		if ( Config::wp_features_require_license() ) {
			if ( ! $this->feature_gate->is_valid() ) {
				if ( is_admin() ) {
					add_action( 'admin_notices', [ $this, 'wp_features_license_notice' ] );
				}
				return;
			}

			// Optionally gate behind a specific feature or tier.
			$allowed = apply_filters(
				Config::PREFIX . 'wp_features_allowed',
				$this->feature_gate->can( 'wp_features' ) || $this->feature_gate->tier_at_least( 'pro' ),
				$this->feature_gate
			);

			if ( ! $allowed ) {
				if ( is_admin() ) {
					add_action( 'admin_notices', [ $this, 'wp_features_tier_notice' ] );
				}
				return;
			}
		}

		// Load WP features.
		if ( is_admin() ) {
			$this->admin_api = new AdminAPI();
			$this->settings  = new Settings( $this->admin_api );
		}
	}

	/**
	 * Initialise WooCommerce integration.
	 *
	 * Behaviour per mode:
	 *   wp_only        — skipped entirely
	 *   wc_only        — loads freely (no license required for WC)
	 *   wp_licensed_wc — loads, but WC features gated behind license
	 *   wc_licensed_wp — loads freely (no license required for WC)
	 */
	private function init_woocommerce(): void {
		if ( ! Config::wc_features_enabled() ) {
			return;
		}

		$this->woocommerce = new WooCommerceBootstrap();
	}

	/**
	 * Initialise the self-hosted update checker.
	 */
	private function init_update_checker(): void {
		$this->update_checker = new UpdateChecker(
			YOUR_PLUGIN_FILE,
			apply_filters( Config::PREFIX . 'update_url', Config::UPDATE_URL ),
			$this->license_client
		);
	}

	/**
	 * Register WordPress hooks.
	 */
	private function register_hooks(): void {
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_frontend_assets' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_admin_assets' ] );
	}

	// -- Admin notices for licensed WP features ------------------------------

	/**
	 * Notice: WP features require an active license.
	 */
	public function wp_features_license_notice(): void {
		printf(
			'<div class="notice notice-warning"><p>%s <a href="%s">%s</a></p></div>',
			esc_html(
				sprintf(
					/* translators: %s: plugin name */
					__( '%s features are disabled — no active license found.', Config::TEXT_DOMAIN ),
					Config::NAME
				)
			),
			esc_url( admin_url( 'options-general.php?page=' . Config::SLUG . '-license' ) ),
			esc_html__( 'Activate your license', Config::TEXT_DOMAIN )
		);
	}

	/**
	 * Notice: WP features require a higher license tier.
	 */
	public function wp_features_tier_notice(): void {
		printf(
			'<div class="notice notice-info"><p>%s</p></div>',
			esc_html(
				sprintf(
					/* translators: %s: plugin name */
					__( '%s features require a Pro license or higher. Please upgrade to unlock.', Config::TEXT_DOMAIN ),
					Config::NAME
				)
			)
		);
	}

	// -- Assets --------------------------------------------------------------

	/**
	 * Enqueue frontend assets.
	 */
	public function enqueue_frontend_assets(): void {
		wp_enqueue_style(
			Config::SLUG . '-frontend',
			YOUR_PLUGIN_URL . 'assets/css/frontend.css',
			[],
			Config::VERSION
		);

		// Enqueue your own JS library here:
		// wp_enqueue_script(
		//     Config::SLUG . '-frontend',
		//     YOUR_PLUGIN_URL . 'assets/js/your-library.js',
		//     [],
		//     Config::VERSION,
		//     true
		// );
	}

	/**
	 * Enqueue admin assets.
	 */
	public function enqueue_admin_assets(): void {
		wp_enqueue_style(
			Config::SLUG . '-admin',
			YOUR_PLUGIN_URL . 'assets/css/admin.css',
			[],
			Config::VERSION
		);

		// Enqueue your own JS library for admin here:
		// wp_enqueue_script(
		//     Config::SLUG . '-admin',
		//     YOUR_PLUGIN_URL . 'assets/js/your-library.js',
		//     [],
		//     Config::VERSION,
		//     true
		// );
	}

	// -- Activation / Deactivation -------------------------------------------

	/**
	 * Plugin activation.
	 */
	public static function activate(): void {
		if ( version_compare( PHP_VERSION, Config::REQUIRES_PHP, '<' ) ) {
			deactivate_plugins( YOUR_PLUGIN_BASENAME );
			wp_die(
				sprintf(
					/* translators: %s: Required PHP version. */
					esc_html__( 'This plugin requires PHP %s or higher.', Config::TEXT_DOMAIN ),
					Config::REQUIRES_PHP
				),
				'Plugin Activation Error',
				[ 'back_link' => true ]
			);
		}

		// Set default options.
		add_option( Config::OPTION_VERSION, Config::VERSION );
		add_option( Config::OPTION_LICENSE_KEY, '' );
		add_option( Config::OPTION_LICENSE_STATUS, '' );
		add_option( Config::OPTION_LICENSE_DATA, [] );

		flush_rewrite_rules();
	}

	/**
	 * Plugin deactivation.
	 */
	public static function deactivate(): void {
		$license_key = get_option( Config::OPTION_LICENSE_KEY, '' );
		if ( ! empty( $license_key ) ) {
			$client = new LicenseClient(
				apply_filters( Config::PREFIX . 'license_api_url', Config::LICENSE_API_URL )
			);
			$client->deactivate( $license_key );
		}

		flush_rewrite_rules();
	}

	// -- Accessors -----------------------------------------------------------

	public function settings(): ?Settings {
		return $this->settings;
	}

	public function license(): LicenseClient {
		return $this->license_client;
	}

	public function features(): FeatureGate {
		return $this->feature_gate;
	}

	public function woocommerce(): ?WooCommerceBootstrap {
		return $this->woocommerce;
	}
}
