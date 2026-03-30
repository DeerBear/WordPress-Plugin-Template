<?php
/**
 * License Admin UI — admin page for license activation and status.
 *
 * @package YourPlugin\License
 */

declare(strict_types=1);

namespace YourPlugin\License;

use YourPlugin\Config;

/**
 * Adds a License sub-page under the plugin settings, handling
 * activation, deactivation, and displaying license status.
 */
class LicenseAdmin {

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
			__( 'License', Config::TEXT_DOMAIN ),
			/* translators: %s: plugin name */
			sprintf( __( '%s License', Config::TEXT_DOMAIN ), Config::NAME ),
			'manage_options',
			Config::SLUG . '-license',
			[ $this, 'render_page' ]
		);
	}

	/**
	 * Handle activate/deactivate form submissions.
	 */
	public function handle_actions(): void {
		if ( ! isset( $_POST[ Config::PREFIX . 'license_action' ] ) ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$slug = Config::SLUG . '-license';

		check_admin_referer( Config::NONCE_LICENSE, '_wpnonce' );

		$action = sanitize_text_field( $_POST[ Config::PREFIX . 'license_action' ] );

		if ( 'activate' === $action ) {
			$key    = sanitize_text_field( $_POST['license_key'] ?? '' );
			$result = $this->client->activate( $key );

			if ( $result['success'] ) {
				add_settings_error( $slug, 'activated', __( 'License activated successfully.', Config::TEXT_DOMAIN ), 'success' );
			} else {
				add_settings_error( $slug, 'activation_failed', $result['message'] ?: __( 'License activation failed.', Config::TEXT_DOMAIN ), 'error' );
			}
		}

		if ( 'deactivate' === $action ) {
			$key    = $this->client->get_key();
			$result = $this->client->deactivate( $key );

			if ( $result['success'] ) {
				update_option( Config::OPTION_LICENSE_KEY, '' );
				add_settings_error( $slug, 'deactivated', __( 'License deactivated.', Config::TEXT_DOMAIN ), 'success' );
			} else {
				add_settings_error( $slug, 'deactivation_failed', $result['message'] ?: __( 'License deactivation failed.', Config::TEXT_DOMAIN ), 'error' );
			}
		}

		set_transient( 'settings_errors', get_settings_errors(), 30 );
		wp_safe_redirect( admin_url( 'options-general.php?page=' . $slug . '&settings-updated=true' ) );
		exit;
	}

	/**
	 * Show admin notices on the license page.
	 */
	public function license_notices(): void {
		$screen = get_current_screen();
		$slug   = Config::SLUG . '-license';

		if ( ! $screen || 'settings_page_' . $slug !== $screen->id ) {
			return;
		}

		if ( isset( $_GET['settings-updated'] ) ) {
			settings_errors( $slug );
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
						esc_html__( 'Your license expires in %d days. Please renew to avoid interruption.', Config::TEXT_DOMAIN ),
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
		printf( '<h1>%s</h1>', esc_html__( 'License Management', Config::TEXT_DOMAIN ) );

		// Status card.
		echo '<div class="card" style="max-width:600px;">';
		echo '<h2>' . esc_html__( 'License Status', Config::TEXT_DOMAIN ) . '</h2>';
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
			esc_html__( 'Status', Config::TEXT_DOMAIN ),
			esc_attr( $badge_color ),
			esc_html( ucfirst( $status ?: __( 'Not activated', Config::TEXT_DOMAIN ) ) )
		);

		if ( $active && ! empty( $data ) ) {
			// License type (standard / subscription).
			$license_type = $data['license_type'] ?? 'standard';
			$type_label   = match ( $license_type ) {
				'subscription' => __( 'Subscription', Config::TEXT_DOMAIN ),
				default        => __( 'Standard (Perpetual)', Config::TEXT_DOMAIN ),
			};
			printf(
				'<tr><th>%s</th><td>%s</td></tr>',
				esc_html__( 'License Type', Config::TEXT_DOMAIN ),
				esc_html( $type_label )
			);

			if ( ! empty( $data['tier'] ) ) {
				printf(
					'<tr><th>%s</th><td>%s</td></tr>',
					esc_html__( 'Tier', Config::TEXT_DOMAIN ),
					esc_html( ucfirst( $data['tier'] ) )
				);
			}

			if ( ! empty( $data['expires_at'] ) ) {
				$expiry = is_numeric( $data['expires_at'] )
					? wp_date( get_option( 'date_format' ), (int) $data['expires_at'] )
					: wp_date( get_option( 'date_format' ), strtotime( $data['expires_at'] ) );
				printf(
					'<tr><th>%s</th><td>%s</td></tr>',
					esc_html__( 'Expires', Config::TEXT_DOMAIN ),
					esc_html( $expiry )
				);
			}

			if ( ! empty( $data['activations'] ) ) {
				printf(
					'<tr><th>%s</th><td>%s / %s</td></tr>',
					esc_html__( 'Activations', Config::TEXT_DOMAIN ),
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
			echo '<h2>' . esc_html__( 'Deactivate License', Config::TEXT_DOMAIN ) . '</h2>';
			echo '<form method="post">';
			wp_nonce_field( Config::NONCE_LICENSE );
			printf(
				'<p>%s <code>%s</code></p>',
				esc_html__( 'Active license key:', Config::TEXT_DOMAIN ),
				esc_html( substr( $key, 0, 4 ) . str_repeat( '•', max( 0, strlen( $key ) - 8 ) ) . substr( $key, -4 ) )
			);
			printf( '<input type="hidden" name="%slicense_action" value="deactivate" />', esc_attr( Config::PREFIX ) );
			submit_button( __( 'Deactivate License', Config::TEXT_DOMAIN ), 'secondary' );
			echo '</form>';
		} else {
			echo '<h2>' . esc_html__( 'Activate License', Config::TEXT_DOMAIN ) . '</h2>';
			echo '<form method="post">';
			wp_nonce_field( Config::NONCE_LICENSE );
			echo '<table class="form-table"><tr>';
			printf( '<th><label for="license_key">%s</label></th>', esc_html__( 'License Key', Config::TEXT_DOMAIN ) );
			echo '<td><input type="text" id="license_key" name="license_key" class="regular-text" required /></td>';
			echo '</tr></table>';
			printf( '<input type="hidden" name="%slicense_action" value="activate" />', esc_attr( Config::PREFIX ) );
			submit_button( __( 'Activate License', Config::TEXT_DOMAIN ) );
			echo '</form>';
		}

		echo '</div>';
		echo '</div>';
	}
}
