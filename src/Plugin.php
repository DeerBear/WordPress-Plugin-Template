<?php
/**
 * Main plugin class.
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
		$this->init_admin();
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
	 */
	private function init_license(): void {
		$this->license_client = new LicenseClient(
			/**
			 * Filters the license API base URL.
			 *
			 * @param string $api_url The base URL of your license server API.
			 */
			apply_filters( Config::PREFIX . 'license_api_url', Config::LICENSE_API_URL )
		);

		$this->feature_gate = new FeatureGate( $this->license_client );
	}

	/**
	 * Initialise admin components.
	 */
	private function init_admin(): void {
		if ( ! is_admin() ) {
			return;
		}

		$this->admin_api = new AdminAPI();
		$this->settings  = new Settings( $this->admin_api );

		new LicenseAdmin( $this->license_client );
	}

	/**
	 * Initialise the self-hosted update checker.
	 */
	private function init_update_checker(): void {
		$this->update_checker = new UpdateChecker(
			YOUR_PLUGIN_FILE,
			/**
			 * Filters the update server URL.
			 *
			 * @param string $update_url The URL of your update server endpoint.
			 */
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
		// Deactivate the license on the remote server.
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
}
