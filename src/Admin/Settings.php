<?php
/**
 * Settings page — tabbed admin settings using the WordPress Settings API.
 *
 * @package YourPlugin\Admin
 */

declare(strict_types=1);

namespace YourPlugin\Admin;

use YourPlugin\Config;

/**
 * Registers and renders a tabbed settings page under Settings > Your Plugin.
 */
class Settings {

	private AdminAPI $admin_api;

	/** @var array<string, array{title: string, fields: array}> */
	private array $tabs = [];

	public function __construct( AdminAPI $admin_api ) {
		$this->admin_api = $admin_api;

		$this->init_tabs();

		add_action( 'admin_menu', [ $this, 'add_menu_page' ] );
		add_action( 'admin_init', [ $this, 'register_settings' ] );
		add_filter( 'plugin_action_links_' . YOUR_PLUGIN_BASENAME, [ $this, 'add_settings_link' ] );
	}

	/**
	 * Define settings tabs and their fields.
	 *
	 * Override or extend via the '{prefix}settings_tabs' filter.
	 */
	private function init_tabs(): void {
		$this->tabs = [
			'general' => [
				'title'  => __( 'General', Config::TEXT_DOMAIN ),
				'fields' => [
					[
						'id'          => 'example_text',
						'type'        => 'text',
						'label'       => __( 'Example Text', Config::TEXT_DOMAIN ),
						'description' => __( 'An example text setting.', Config::TEXT_DOMAIN ),
						'default'     => '',
						'placeholder' => __( 'Enter something…', Config::TEXT_DOMAIN ),
					],
					[
						'id'          => 'example_select',
						'type'        => 'select',
						'label'       => __( 'Example Select', Config::TEXT_DOMAIN ),
						'description' => __( 'Choose an option.', Config::TEXT_DOMAIN ),
						'default'     => 'option_1',
						'options'     => [
							'option_1' => __( 'Option 1', Config::TEXT_DOMAIN ),
							'option_2' => __( 'Option 2', Config::TEXT_DOMAIN ),
							'option_3' => __( 'Option 3', Config::TEXT_DOMAIN ),
						],
					],
					[
						'id'          => 'example_checkbox',
						'type'        => 'checkbox',
						'label'       => __( 'Enable Feature', Config::TEXT_DOMAIN ),
						'description' => __( 'Check to enable this feature.', Config::TEXT_DOMAIN ),
						'default'     => '',
					],
				],
			],
			'advanced' => [
				'title'  => __( 'Advanced', Config::TEXT_DOMAIN ),
				'fields' => [
					[
						'id'          => 'example_number',
						'type'        => 'number',
						'label'       => __( 'Cache Duration', Config::TEXT_DOMAIN ),
						'description' => __( 'Cache duration in seconds.', Config::TEXT_DOMAIN ),
						'default'     => '3600',
					],
					[
						'id'          => 'example_textarea',
						'type'        => 'textarea',
						'label'       => __( 'Custom Code', Config::TEXT_DOMAIN ),
						'description' => __( 'Custom code snippet.', Config::TEXT_DOMAIN ),
						'default'     => '',
					],
				],
			],
		];

		/**
		 * Filters the settings tabs.
		 *
		 * @param array $tabs Settings tabs configuration.
		 */
		$this->tabs = apply_filters( Config::PREFIX . 'settings_tabs', $this->tabs );
	}

	/**
	 * Add the settings page to the admin menu.
	 */
	public function add_menu_page(): void {
		add_options_page(
			/* translators: %s: plugin name */
			sprintf( __( '%s Settings', Config::TEXT_DOMAIN ), Config::NAME ),
			Config::NAME,
			'manage_options',
			Config::SLUG . '-settings',
			[ $this, 'render_page' ]
		);
	}

	/**
	 * Register settings with the Settings API.
	 */
	public function register_settings(): void {
		register_setting(
			Config::PREFIX . 'settings',
			Config::OPTION_SETTINGS,
			[ 'sanitize_callback' => [ $this, 'sanitize_options' ] ]
		);

		foreach ( $this->tabs as $tab_id => $tab ) {
			$section_id = Config::PREFIX . 'section_' . $tab_id;
			$page_slug  = Config::SLUG . '-settings_' . $tab_id;

			add_settings_section(
				$section_id,
				'',
				'__return_false',
				$page_slug
			);

			foreach ( $tab['fields'] as $field ) {
				add_settings_field(
					$field['id'],
					$field['label'] ?? '',
					function () use ( $field ): void {
						$options = get_option( Config::OPTION_SETTINGS, [] );
						$value   = $options[ $field['id'] ] ?? ( $field['default'] ?? '' );
						$this->admin_api->render_field( $field, $value, Config::OPTION_SETTINGS );
					},
					$page_slug,
					$section_id
				);
			}
		}
	}

	/**
	 * Sanitise all options on save.
	 *
	 * @param array $input Raw input.
	 * @return array Sanitised output.
	 */
	public function sanitize_options( array $input ): array {
		$output = [];

		foreach ( $this->tabs as $tab ) {
			foreach ( $tab['fields'] as $field ) {
				$id   = $field['id'];
				$type = $field['type'] ?? 'text';

				if ( isset( $input[ $id ] ) ) {
					$output[ $id ] = $this->admin_api->validate_field( $input[ $id ], $type );
				} elseif ( 'checkbox' === $type ) {
					$output[ $id ] = '';
				}
			}
		}

		return $output;
	}

	/**
	 * Add a Settings link on the Plugins page.
	 *
	 * @param array $links Existing action links.
	 * @return array Modified action links.
	 */
	public function add_settings_link( array $links ): array {
		$settings_link = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'options-general.php?page=' . Config::SLUG . '-settings' ) ),
			esc_html__( 'Settings', Config::TEXT_DOMAIN )
		);

		array_unshift( $links, $settings_link );

		return $links;
	}

	/**
	 * Render the settings page.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$current_tab = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : array_key_first( $this->tabs );

		if ( ! isset( $this->tabs[ $current_tab ] ) ) {
			$current_tab = array_key_first( $this->tabs );
		}

		$slug = Config::SLUG . '-settings';

		echo '<div class="wrap">';
		printf( '<h1>%s</h1>', esc_html( get_admin_page_title() ) );

		// Render tabs.
		echo '<nav class="nav-tab-wrapper">';
		foreach ( $this->tabs as $tab_id => $tab ) {
			$active = ( $tab_id === $current_tab ) ? ' nav-tab-active' : '';
			printf(
				'<a href="%s" class="nav-tab%s">%s</a>',
				esc_url( add_query_arg( 'tab', $tab_id, admin_url( 'options-general.php?page=' . $slug ) ) ),
				esc_attr( $active ),
				esc_html( $tab['title'] )
			);
		}
		echo '</nav>';

		// Render form.
		echo '<form method="post" action="options.php">';
		settings_fields( Config::PREFIX . 'settings' );
		do_settings_sections( $slug . '_' . $current_tab );
		submit_button();
		echo '</form>';

		echo '</div>';
	}
}
