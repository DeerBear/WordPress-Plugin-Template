<?php
/**
 * Admin API — form field rendering, validation, and metabox helpers.
 *
 * @package YourPlugin\Admin
 */

declare(strict_types=1);

namespace YourPlugin\Admin;

/**
 * Provides reusable form field rendering and metabox registration.
 */
class AdminAPI {

	public function __construct() {
		add_action( 'save_post', [ $this, 'save_meta_boxes' ], 10, 2 );
	}

	/**
	 * Render a form field.
	 *
	 * @param array{
	 *     id: string,
	 *     type: string,
	 *     label?: string,
	 *     description?: string,
	 *     default?: mixed,
	 *     options?: array<string, string>,
	 *     placeholder?: string,
	 * } $field  Field definition.
	 * @param mixed $value  Current value (null to read from options).
	 * @param string $option_name  Option name prefix for settings fields.
	 */
	public function render_field( array $field, mixed $value = null, string $option_name = '' ): void {
		$id          = $field['id'];
		$type        = $field['type'] ?? 'text';
		$description = $field['description'] ?? '';
		$placeholder = $field['placeholder'] ?? '';
		$options     = $field['options'] ?? [];
		$default     = $field['default'] ?? '';
		$name        = $option_name ? "{$option_name}[{$id}]" : $id;

		if ( null === $value ) {
			$value = $default;
		}

		match ( $type ) {
			'text', 'email', 'url', 'number', 'password' => $this->render_input( $name, $id, $type, $value, $placeholder ),
			'textarea'       => $this->render_textarea( $name, $id, $value, $placeholder ),
			'checkbox'       => $this->render_checkbox( $name, $id, $value ),
			'checkbox_multi' => $this->render_checkbox_multi( $name, $id, $value, $options ),
			'radio'          => $this->render_radio( $name, $id, $value, $options ),
			'select'         => $this->render_select( $name, $id, $value, $options ),
			'select_multi'   => $this->render_select_multi( $name, $id, $value, $options ),
			'hidden'         => $this->render_hidden( $name, $id, $value ),
			'color'          => $this->render_color( $name, $id, $value ),
			'editor'         => $this->render_editor( $id, $value ),
			default          => $this->render_input( $name, $id, 'text', $value, $placeholder ),
		};

		if ( $description ) {
			printf( '<p class="description">%s</p>', esc_html( $description ) );
		}
	}

	// -- Field renderers -----------------------------------------------------

	private function render_input( string $name, string $id, string $type, mixed $value, string $placeholder ): void {
		printf(
			'<input type="%s" id="%s" name="%s" value="%s" placeholder="%s" class="regular-text" />',
			esc_attr( $type ),
			esc_attr( $id ),
			esc_attr( $name ),
			esc_attr( (string) $value ),
			esc_attr( $placeholder )
		);
	}

	private function render_textarea( string $name, string $id, mixed $value, string $placeholder ): void {
		printf(
			'<textarea id="%s" name="%s" placeholder="%s" rows="5" cols="50" class="large-text">%s</textarea>',
			esc_attr( $id ),
			esc_attr( $name ),
			esc_attr( $placeholder ),
			esc_textarea( (string) $value )
		);
	}

	private function render_checkbox( string $name, string $id, mixed $value ): void {
		printf(
			'<input type="checkbox" id="%s" name="%s" value="1" %s />',
			esc_attr( $id ),
			esc_attr( $name ),
			checked( $value, '1', false )
		);
	}

	private function render_checkbox_multi( string $name, string $id, mixed $value, array $options ): void {
		$values = is_array( $value ) ? $value : [];
		foreach ( $options as $key => $label ) {
			printf(
				'<label><input type="checkbox" name="%s[]" value="%s" %s /> %s</label><br>',
				esc_attr( $name ),
				esc_attr( $key ),
				checked( in_array( $key, $values, true ), true, false ),
				esc_html( $label )
			);
		}
	}

	private function render_radio( string $name, string $id, mixed $value, array $options ): void {
		foreach ( $options as $key => $label ) {
			printf(
				'<label><input type="radio" name="%s" value="%s" %s /> %s</label><br>',
				esc_attr( $name ),
				esc_attr( $key ),
				checked( $value, $key, false ),
				esc_html( $label )
			);
		}
	}

	private function render_select( string $name, string $id, mixed $value, array $options ): void {
		printf( '<select id="%s" name="%s">', esc_attr( $id ), esc_attr( $name ) );
		foreach ( $options as $key => $label ) {
			printf(
				'<option value="%s" %s>%s</option>',
				esc_attr( $key ),
				selected( $value, $key, false ),
				esc_html( $label )
			);
		}
		echo '</select>';
	}

	private function render_select_multi( string $name, string $id, mixed $value, array $options ): void {
		$values = is_array( $value ) ? $value : [];
		printf( '<select id="%s" name="%s[]" multiple="multiple" style="min-width:200px;">', esc_attr( $id ), esc_attr( $name ) );
		foreach ( $options as $key => $label ) {
			printf(
				'<option value="%s" %s>%s</option>',
				esc_attr( $key ),
				selected( in_array( $key, $values, true ), true, false ),
				esc_html( $label )
			);
		}
		echo '</select>';
	}

	private function render_hidden( string $name, string $id, mixed $value ): void {
		printf(
			'<input type="hidden" id="%s" name="%s" value="%s" />',
			esc_attr( $id ),
			esc_attr( $name ),
			esc_attr( (string) $value )
		);
	}

	private function render_color( string $name, string $id, mixed $value ): void {
		printf(
			'<input type="color" id="%s" name="%s" value="%s" />',
			esc_attr( $id ),
			esc_attr( $name ),
			esc_attr( (string) $value )
		);
	}

	private function render_editor( string $id, mixed $value ): void {
		wp_editor(
			(string) $value,
			$id,
			[
				'textarea_name' => $id,
				'media_buttons' => true,
				'textarea_rows' => 10,
			]
		);
	}

	// -- Validation ----------------------------------------------------------

	/**
	 * Sanitise a field value based on its type.
	 *
	 * @param mixed  $value Raw value.
	 * @param string $type  Field type.
	 * @return mixed Sanitised value.
	 */
	public function validate_field( mixed $value, string $type = 'text' ): mixed {
		return match ( $type ) {
			'url'      => esc_url_raw( (string) $value ),
			'email'    => sanitize_email( (string) $value ),
			'number'   => (int) $value,
			'textarea' => sanitize_textarea_field( (string) $value ),
			'checkbox' => $value ? '1' : '',
			'editor'   => wp_kses_post( (string) $value ),
			default    => sanitize_text_field( (string) $value ),
		};
	}

	// -- Meta boxes ----------------------------------------------------------

	/**
	 * Register a meta box.
	 *
	 * @param string         $id        Meta box ID.
	 * @param string         $title     Meta box title.
	 * @param string|array   $screen    Post type(s).
	 * @param array          $fields    Field definitions.
	 * @param string         $context   Meta box context.
	 * @param string         $priority  Meta box priority.
	 */
	public function add_meta_box(
		string $id,
		string $title,
		string|array $screen,
		array $fields,
		string $context = 'advanced',
		string $priority = 'default'
	): void {
		add_meta_box(
			$id,
			$title,
			function ( \WP_Post $post ) use ( $id, $fields ): void {
				wp_nonce_field( "your_plugin_mb_{$id}", "your_plugin_mb_{$id}_nonce" );

				foreach ( $fields as $field ) {
					$value = get_post_meta( $post->ID, $field['id'], true );
					echo '<p>';
					if ( ! empty( $field['label'] ) ) {
						printf( '<label for="%s"><strong>%s</strong></label><br>', esc_attr( $field['id'] ), esc_html( $field['label'] ) );
					}
					$this->render_field( $field, $value ?: ( $field['default'] ?? '' ) );
					echo '</p>';
				}
			},
			$screen,
			$context,
			$priority
		);
	}

	/**
	 * Save meta box data.
	 *
	 * @param int      $post_id Post ID.
	 * @param \WP_Post $post    Post object.
	 */
	public function save_meta_boxes( int $post_id, \WP_Post $post ): void {
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		/**
		 * Filters the meta box fields to save.
		 *
		 * @param array $fields Array of field definitions with 'id' and 'type' keys.
		 */
		$fields = apply_filters( 'your_plugin_meta_box_fields', [] );

		foreach ( $fields as $field ) {
			$meta_box_id = $field['meta_box_id'] ?? '';
			$nonce_key   = "your_plugin_mb_{$meta_box_id}_nonce";

			if ( ! isset( $_POST[ $nonce_key ] ) || ! wp_verify_nonce( $_POST[ $nonce_key ], "your_plugin_mb_{$meta_box_id}" ) ) {
				continue;
			}

			if ( isset( $_POST[ $field['id'] ] ) ) {
				$value = $this->validate_field( $_POST[ $field['id'] ], $field['type'] ?? 'text' );
				update_post_meta( $post_id, $field['id'], $value );
			}
		}
	}
}
