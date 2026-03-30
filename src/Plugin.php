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
use YourPlugin\Admin\Dashboard;
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
	private ?Dashboard $dashboard = null;

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
		$this->init_dashboard();
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
	 * Initialise the licensed dashboard.
	 *
	 * Registers the dashboard admin page only when the license is valid.
	 * Panels are added externally via the {@see Config::PREFIX}dashboard_panels filter.
	 */
	private function init_dashboard(): void {
		if ( ! is_admin() ) {
			return;
		}

		if ( ! $this->feature_gate->is_valid() ) {
			return;
		}

		$this->dashboard = new Dashboard( $this->feature_gate );
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
		$this->enqueue_ar_styles();
		$this->enqueue_ar_scripts();

		wp_enqueue_style(
			Config::SLUG . '-frontend',
			YOUR_PLUGIN_URL . 'assets/css/frontend.css',
			[ Config::SLUG . '-ar-utilities' ],
			Config::VERSION
		);
	}

	/**
	 * Enqueue admin assets.
	 *
	 * The AR library is loaded only on the dashboard page.
	 * The admin stylesheet loads on all admin pages for notices, settings, etc.
	 *
	 * @param string $hook_suffix The current admin page hook suffix.
	 */
	public function enqueue_admin_assets( string $hook_suffix = '' ): void {
		$dashboard_hook = $this->dashboard ? $this->dashboard->get_hook() : '';

		// AR library only on the dashboard page.
		if ( $dashboard_hook && $hook_suffix === $dashboard_hook ) {
			$this->enqueue_ar_styles();
			$this->enqueue_ar_scripts();
		}

		wp_enqueue_style(
			Config::SLUG . '-admin',
			YOUR_PLUGIN_URL . 'assets/css/admin.css',
			$dashboard_hook && $hook_suffix === $dashboard_hook
				? [ Config::SLUG . '-ar-utilities' ]
				: [],
			Config::VERSION
		);
	}

	/**
	 * Enqueue AR CSS library.
	 */
	private function enqueue_ar_styles(): void {
		$slug = Config::SLUG;
		$url  = YOUR_PLUGIN_URL . 'assets/css/';
		$ver  = Config::VERSION;

		wp_enqueue_style( $slug . '-ar-utilities',   $url . 'AR.Utilities.css',   [], $ver );
		wp_enqueue_style( $slug . '-ar-icons',        $url . 'AR.Icons.css',        [], $ver );
		wp_enqueue_style( $slug . '-ar-components',   $url . 'AR.Components.css',   [ $slug . '-ar-utilities' ], $ver );
		wp_enqueue_style( $slug . '-ar-datagrid',     $url . 'AR.DataGrid.css',     [ $slug . '-ar-utilities' ], $ver );
		wp_enqueue_style( $slug . '-ar-datepicker',   $url . 'AR.DatePicker.css',   [ $slug . '-ar-utilities' ], $ver );
		wp_enqueue_style( $slug . '-ar-charts',       $url . 'AR.Charts.css',       [ $slug . '-ar-utilities' ], $ver );
		wp_enqueue_style( $slug . '-ar-textprompt',   $url . 'AR.TextPrompt.css',   [ $slug . '-ar-utilities', $slug . '-ar-icons' ], $ver );
		wp_enqueue_style( $slug . '-ar-weganalytics', $url . 'WegAnalytics.css',    [], $ver );
	}

	/**
	 * Enqueue AR JavaScript library.
	 *
	 * Load order respects dependencies:
	 *   1. MVVM (foundation — no deps)
	 *   2. Components, DatePicker (depend on MVVM optionally)
	 *   3. DataGrid, Charts (depend on MVVM)
	 *   4. DataGrid.Manager (depends on DataGrid + MVVM)
	 *   5. Charts.Extension (depends on Charts)
	 *   6. TextPrompt, TenantManager (depend on Components + MVVM)
	 *   7. DataGrid v2 variants (standalone, depend on nothing)
	 *   8. Loader modules (ES modules, loaded separately)
	 */
	private function enqueue_ar_scripts(): void {
		$slug = Config::SLUG;
		$url  = YOUR_PLUGIN_URL . 'assets/js/';
		$ver  = Config::VERSION;

		// Foundation: MVVM frameworks
		wp_enqueue_script( $slug . '-ar-mvvm',     $url . 'AR.MVVM.js',     [], $ver, true );
		wp_enqueue_script( $slug . '-ar-mvvm-v2',  $url . 'AR.MVVM_v2.js',  [], $ver, true );

		// Core UI components (optional MVVM dependency)
		$mvvm = [ $slug . '-ar-mvvm' ];
		wp_enqueue_script( $slug . '-ar-components', $url . 'AR.Components.js', [],    $ver, true );
		wp_enqueue_script( $slug . '-ar-datepicker', $url . 'AR.DatePicker.js', [],    $ver, true );

		// DataGrid (requires MVVM)
		wp_enqueue_script( $slug . '-ar-datagrid',         $url . 'AR.DataGrid.js',         $mvvm, $ver, true );
		wp_enqueue_script( $slug . '-ar-datagrid-manager', $url . 'AR.DataGrid.Manager.js', [ $slug . '-ar-datagrid' ], $ver, true );
		wp_enqueue_script( $slug . '-ar-datagrid-v2',      $url . 'AR.DataGrid_v2.js',      [], $ver, true );
		wp_enqueue_script( $slug . '-ar-datagrid-v2-draft', $url . 'AR.DataGridv2_Draft.js', [], $ver, true );

		// Charts (optional MVVM)
		wp_enqueue_script( $slug . '-ar-charts',     $url . 'AR.Charts.js',           $mvvm, $ver, true );
		wp_enqueue_script( $slug . '-ar-charts-ext', $url . 'AR.Charts.Extension.js', [ $slug . '-ar-charts' ], $ver, true );

		// TextPrompt (uses Components for ProgressBar)
		wp_enqueue_script( $slug . '-ar-textprompt', $url . 'AR.TextPrompt.js', [ $slug . '-ar-components' ], $ver, true );

		// TenantManager (uses MVVM, Components, DataGrid)
		wp_enqueue_script(
			$slug . '-ar-tenantmanager',
			$url . 'AR.TenantManager.js',
			[ $slug . '-ar-mvvm', $slug . '-ar-components', $slug . '-ar-datagrid' ],
			$ver,
			true
		);

		// ES module loaders — add type="module" attribute via filter
		wp_enqueue_script( $slug . '-ar-loader-node',      $url . 'LoaderNode.js',      [], $ver, true );
		wp_enqueue_script( $slug . '-ar-loader-tree',      $url . 'LoaderTree.js',      [ $slug . '-ar-loader-node' ], $ver, true );
		wp_enqueue_script( $slug . '-ar-uikit-loader-node', $url . 'UIKitLoaderNode.js', [ $slug . '-ar-loader-node' ], $ver, true );

		add_filter( 'script_loader_tag', function ( $tag, $handle ) use ( $slug ) {
			$module_handles = [
				$slug . '-ar-loader-node',
				$slug . '-ar-loader-tree',
				$slug . '-ar-uikit-loader-node',
			];
			if ( in_array( $handle, $module_handles, true ) ) {
				$tag = str_replace( '<script ', '<script type="module" ', $tag );
			}
			return $tag;
		}, 10, 2 );
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

	public function dashboard(): ?Dashboard {
		return $this->dashboard;
	}
}
