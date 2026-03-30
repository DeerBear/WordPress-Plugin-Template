<?php
/**
 * Licensed Dashboard — a full application page powered by the AR.* library.
 *
 * This page only appears in the admin menu when the user has a valid license.
 * It provides a generic mount-point shell so consuming developers can wire up
 * any combination of AR components (DataGrid, Charts, Modals, MVVM, etc.)
 * via the {@see Config::PREFIX}dashboard_panels filter.
 *
 * @package YourPlugin\Admin
 */

declare(strict_types=1);

namespace YourPlugin\Admin;

use YourPlugin\Config;
use YourPlugin\License\FeatureGate;

/**
 * Registers and renders the licensed dashboard admin page.
 */
class Dashboard {

	private FeatureGate $gate;

	/** Admin page hook suffix, set by add_menu_page(). */
	private string $hook = '';

	public function __construct( FeatureGate $gate ) {
		$this->gate = $gate;

		add_action( 'admin_menu', [ $this, 'register_menu' ] );
	}

	/**
	 * Register the top-level dashboard menu page.
	 */
	public function register_menu(): void {
		$this->hook = add_menu_page(
			sprintf(
				/* translators: %s: plugin name */
				__( '%s Dashboard', Config::TEXT_DOMAIN ),
				Config::NAME
			),
			Config::NAME,
			'manage_options',
			Config::SLUG . '-dashboard',
			[ $this, 'render' ],
			'dashicons-analytics',
			30
		);
	}

	/**
	 * Get the page hook suffix.
	 */
	public function get_hook(): string {
		return $this->hook;
	}

	/**
	 * Render the dashboard page.
	 */
	public function render(): void {
		/**
		 * Filters the dashboard panel definitions.
		 *
		 * Each panel is an associative array:
		 *   'id'       => (string) Unique panel identifier (used as HTML id).
		 *   'title'    => (string) Panel heading text.
		 *   'size'     => (string) 'full', 'half', or 'third'. Default 'full'.
		 *   'callback' => (callable|null) Optional. Called to render inner HTML.
		 *                  Receives the panel array as its argument.
		 *
		 * Example — add a chart and a grid side by side:
		 *
		 *   add_filter( 'your_plugin_dashboard_panels', function ( $panels ) {
		 *       $panels[] = [ 'id' => 'sales-chart',  'title' => 'Sales',     'size' => 'half' ];
		 *       $panels[] = [ 'id' => 'orders-grid',  'title' => 'Orders',    'size' => 'half' ];
		 *       $panels[] = [ 'id' => 'tenant-mgr',   'title' => 'Tenants',   'size' => 'full' ];
		 *       return $panels;
		 *   });
		 *
		 * @param array[] $panels Panel definitions.
		 */
		$panels = apply_filters( Config::PREFIX . 'dashboard_panels', [] );
		?>
		<div class="wrap ar-dashboard">
			<h1><?php echo esc_html( sprintf(
				/* translators: %s: plugin name */
				__( '%s Dashboard', Config::TEXT_DOMAIN ),
				Config::NAME
			) ); ?></h1>

			<?php if ( empty( $panels ) ) : ?>
				<div class="ar-dashboard-empty">
					<p><?php esc_html_e(
						'No dashboard panels registered. Use the dashboard_panels filter to add panels.',
						Config::TEXT_DOMAIN
					); ?></p>
				</div>
			<?php else : ?>
				<div class="ar-dashboard-grid">
					<?php foreach ( $panels as $panel ) :
						$id    = sanitize_html_class( $panel['id'] ?? 'panel' );
						$title = $panel['title'] ?? '';
						$size  = $panel['size'] ?? 'full';
						$class = 'ar-dashboard-panel ar-dashboard-panel--' . sanitize_html_class( $size );
					?>
						<div id="<?php echo esc_attr( $id ); ?>" class="<?php echo esc_attr( $class ); ?>">
							<?php if ( $title ) : ?>
								<h2 class="ar-dashboard-panel__title"><?php echo esc_html( $title ); ?></h2>
							<?php endif; ?>
							<div class="ar-dashboard-panel__body">
								<?php
								if ( ! empty( $panel['callback'] ) && is_callable( $panel['callback'] ) ) {
									call_user_func( $panel['callback'], $panel );
								}
								?>
							</div>
						</div>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
		</div>

		<?php
		/**
		 * Fires after the dashboard shell is rendered.
		 *
		 * Use this to output inline <script> blocks that initialise AR components
		 * against the panel containers rendered above.
		 *
		 * Example:
		 *   add_action( 'your_plugin_dashboard_after', function () {
		 *       ?>
		 *       <script>
		 *           var chart = new AR.Chart('#sales-chart .ar-dashboard-panel__body', { ... });
		 *           var grid  = new AR.DataGrid('#orders-grid .ar-dashboard-panel__body table', { ... });
		 *       </script>
		 *       <?php
		 *   });
		 */
		do_action( Config::PREFIX . 'dashboard_after' );
	}
}
