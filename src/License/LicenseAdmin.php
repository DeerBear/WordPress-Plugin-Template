<?php
/**
 * License Admin UI — admin page for license activation and status.
 *
 * @package YourPlugin\License
 */

declare(strict_types=1);

namespace YourPlugin\License;

/**
 * Adds a License sub-page under the plugin settings, handling
 * activation, deactivation, and displaying license status.
 */
class LicenseAdmin {

	private const SLUG   = 'your-plugin-license';
	private const NONCE  = 'your_plugin_license_action';

	private LicenseClient $client;

	public function __construct( LicenseClient $client ) {
		$this->client = $client;

		add_action( 'admin_menu', [ $this, 'add_menu_page' ] );
		add_action( 'admin_init', [ $this, 'handle_actions' ] );
		add_action( 'admin_notices', [ $this, 'license_notices' ] );
	}

	/**
	 * Add the license management page.
	 */
	public function add_menu_page(): void {
		add_options_page(
			__( 'License', 'your-plugin' ),
			__( 'Your Plugin License', 'your-plugin' ),
			'manage_options',
			self::SLUG,
			[ $this, 'render_page' ]
		);
	}

	/**
	 * Handle activate/deactivate form submissions.
	 */
	public function handle_actions(): void {
		if ( ! isset( $_POST['your_plugin_license_action'] ) ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		check_admin_referer( self::NONCE, '_wpnonce' );

		$action = sanitize_text_field( $_POST['your_plugin_license_action'] );

		if ( 'activate' === $action ) {
			$key    = sanitize_text_field( $_POST['license_key'] ?? '' );
			$result = $this->client->activate( $key );

			if ( $result['success'] ) {
				add_settings_error( self::SLUG, 'activated', __( 'License activated successfully.', 'your-plugin' ), 'success' );
			} else {
				add_settings_error( self::SLUG, 'activation_failed', $result['message'] ?: __( 'License activation failed.', 'your-plugin' ), 'error' );
			}
		}

		if ( 'deactivate' === $action ) {
			$key    = $this->client->get_key();
			$result = $this->client->deactivate( $key );

			if ( $result['success'] ) {
				update_option( 'your_plugin_license_key', '' );
				add_settings_error( self::SLUG, 'deactivated', __( 'License deactivated.', 'your-plugin' ), 'success' );
			} else {
				add_settings_error( self::SLUG, 'deactivation_failed', $result['message'] ?: __( 'License deactivation failed.', 'your-plugin' ), 'error' );
			}
		}

		set_transient( 'settings_errors', get_settings_errors(), 30 );
		wp_safe_redirect( admin_url( 'options-general.php?page=' . self::SLUG . '&settings-updated=true' ) );
		exit;
	}

	/**
	 * Show admin notices on the license page.
	 */
	public function license_notices(): void {
		$screen = get_current_screen();
		if ( ! $screen || 'settings_page_' . self::SLUG !== $screen->id ) {
			return;
		}

		if ( isset( $_GET['settings-updated'] ) ) {
			settings_errors( self::SLUG );
		}

		// Warn about expiring licenses.
		$data       = $this->client->get_data();
		$expires_at = $data['expires_at'] ?? null;

		if ( $expires_at && $this->client->is_active() ) {
			$expiry_time = is_numeric( $expires_at ) ? (int) $expires_at : strtotime( (string) $expires_at );
			$days_left   = (int) ceil( ( $expiry_time - time() ) / DAY_IN_SECONDS );

			if ( $days_left <= 30 && $days_left > 0 ) {
				printf(
					'<div class="notice notice-warning"><p>%s</p></div>',
					sprintf(
						esc_html__( 'Your license expires in %d days. Please renew to avoid interruption.', 'your-plugin' ),
						$days_left
					)
				);
			}
		}
	}

	/**
	 * Render the license management page.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$key    = $this->client->get_key();
		$status = $this->client->get_status();
		$data   = $this->client->get_data();
		$active = $this->client->is_active();

		echo '<div class="wrap">';
		printf( '<h1>%s</h1>', esc_html__( 'License Management', 'your-plugin' ) );

		// Status card.
		echo '<div class="card" style="max-width:600px;">';
		echo '<h2>' . esc_html__( 'License Status', 'your-plugin' ) . '</h2>';
		echo '<table class="form-table" role="presentation">';

		// Status badge.
		$badge_color = match ( $status ) {
			'active'  => '#00a32a',
			'expired' => '#d63638',
			'invalid' => '#d63638',
			default   => '#787c82',
		};
		printf(
			'<tr><th>%s</th><td><span style="display:inline-block;padding:2px 8px;border-radius:3px;color:#fff;background:%s;">%s</span></td></tr>',
			esc_html__( 'Status', 'your-plugin' ),
			esc_attr( $badge_color ),
			esc_html( ucfirst( $status ?: __( 'Not activated', 'your-plugin' ) ) )
		);

		if ( $active && ! empty( $data ) ) {
			// License type (standard / subscription).
			$license_type = $data['license_type'] ?? 'standard';
			$type_label   = match ( $license_type ) {
				'subscription' => __( 'Subscription', 'your-plugin' ),
				default        => __( 'Standard (Perpetual)', 'your-plugin' ),
			};
			printf(
				'<tr><th>%s</th><td>%s</td></tr>',
				esc_html__( 'License Type', 'your-plugin' ),
				esc_html( $type_label )
			);

			if ( ! empty( $data['tier'] ) ) {
				printf(
					'<tr><th>%s</th><td>%s</td></tr>',
					esc_html__( 'Tier', 'your-plugin' ),
					esc_html( ucfirst( $data['tier'] ) )
				);
			}

			if ( ! empty( $data['expires_at'] ) ) {
				$expiry = is_numeric( $data['expires_at'] )
					? wp_date( get_option( 'date_format' ), (int) $data['expires_at'] )
					: wp_date( get_option( 'date_format' ), strtotime( $data['expires_at'] ) );
				printf(
					'<tr><th>%s</th><td>%s</td></tr>',
					esc_html__( 'Expires', 'your-plugin' ),
					esc_html( $expiry )
				);
			}

			if ( ! empty( $data['activations'] ) ) {
				printf(
					'<tr><th>%s</th><td>%s / %s</td></tr>',
					esc_html__( 'Activations', 'your-plugin' ),
					esc_html( (string) ( $data['activations']['used'] ?? '?' ) ),
					esc_html( (string) ( $data['activations']['limit'] ?? '∞' ) )
				);
			}
		}

		echo '</table>';
		echo '</div>';

		// Activate / Deactivate form.
		echo '<div class="card" style="max-width:600px;margin-top:20px;">';

		if ( $active ) {
			echo '<h2>' . esc_html__( 'Deactivate License', 'your-plugin' ) . '</h2>';
			echo '<form method="post">';
			wp_nonce_field( self::NONCE );
			printf(
				'<p>%s <code>%s</code></p>',
				esc_html__( 'Active license key:', 'your-plugin' ),
				esc_html( substr( $key, 0, 4 ) . str_repeat( '•', max( 0, strlen( $key ) - 8 ) ) . substr( $key, -4 ) )
			);
			echo '<input type="hidden" name="your_plugin_license_action" value="deactivate" />';
			submit_button( __( 'Deactivate License', 'your-plugin' ), 'secondary' );
			echo '</form>';
		} else {
			echo '<h2>' . esc_html__( 'Activate License', 'your-plugin' ) . '</h2>';
			echo '<form method="post">';
			wp_nonce_field( self::NONCE );
			echo '<table class="form-table"><tr>';
			printf( '<th><label for="license_key">%s</label></th>', esc_html__( 'License Key', 'your-plugin' ) );
			echo '<td><input type="text" id="license_key" name="license_key" class="regular-text" required /></td>';
			echo '</tr></table>';
			echo '<input type="hidden" name="your_plugin_license_action" value="activate" />';
			submit_button( __( 'Activate License', 'your-plugin' ) );
			echo '</form>';
		}

		echo '</div>';
		echo '</div>';
	}
}
