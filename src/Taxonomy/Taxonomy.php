<?php
/**
 * Custom Taxonomy registration helper.
 *
 * @package YourPlugin\Taxonomy
 */

declare(strict_types=1);

namespace YourPlugin\Taxonomy;

use YourPlugin\Config;

/**
 * Registers a custom taxonomy with sensible defaults.
 *
 * Usage:
 *   new Taxonomy( 'genre', 'Genres', 'Genre', [ 'book' ] );
 */
class Taxonomy {

	private string $taxonomy;
	private string $plural;
	private string $single;
	private array  $post_types;
	private array  $options;

	/**
	 * @param string       $taxonomy   Taxonomy key (max 32 chars, no uppercase).
	 * @param string       $plural     Plural label.
	 * @param string       $single     Singular label.
	 * @param string|array $post_types Post type(s) to attach to.
	 * @param array        $options    Override any register_taxonomy args.
	 */
	public function __construct(
		string $taxonomy,
		string $plural,
		string $single,
		string|array $post_types = [],
		array $options = []
	) {
		$this->taxonomy   = $taxonomy;
		$this->plural     = $plural;
		$this->single     = $single;
		$this->post_types = (array) $post_types;
		$this->options    = $options;

		add_action( 'init', [ $this, 'register' ] );
	}

	/**
	 * Register the taxonomy.
	 */
	public function register(): void {
		$labels = [
			'name'                       => $this->plural,
			'singular_name'              => $this->single,
			'search_items'               => sprintf( __( 'Search %s', Config::TEXT_DOMAIN ), $this->plural ),
			'popular_items'              => sprintf( __( 'Popular %s', Config::TEXT_DOMAIN ), $this->plural ),
			'all_items'                  => sprintf( __( 'All %s', Config::TEXT_DOMAIN ), $this->plural ),
			'parent_item'                => sprintf( __( 'Parent %s', Config::TEXT_DOMAIN ), $this->single ),
			'parent_item_colon'          => sprintf( __( 'Parent %s:', Config::TEXT_DOMAIN ), $this->single ),
			'edit_item'                  => sprintf( __( 'Edit %s', Config::TEXT_DOMAIN ), $this->single ),
			'update_item'                => sprintf( __( 'Update %s', Config::TEXT_DOMAIN ), $this->single ),
			'add_new_item'               => sprintf( __( 'Add New %s', Config::TEXT_DOMAIN ), $this->single ),
			'new_item_name'              => sprintf( __( 'New %s Name', Config::TEXT_DOMAIN ), $this->single ),
			'separate_items_with_commas' => sprintf( __( 'Separate %s with commas', Config::TEXT_DOMAIN ), strtolower( $this->plural ) ),
			'add_or_remove_items'        => sprintf( __( 'Add or remove %s', Config::TEXT_DOMAIN ), strtolower( $this->plural ) ),
			'choose_from_most_used'      => sprintf( __( 'Choose from the most used %s', Config::TEXT_DOMAIN ), strtolower( $this->plural ) ),
			'not_found'                  => sprintf( __( 'No %s found.', Config::TEXT_DOMAIN ), strtolower( $this->plural ) ),
			'menu_name'                  => $this->plural,
			'items_list_navigation'      => sprintf( __( '%s list navigation', Config::TEXT_DOMAIN ), $this->plural ),
			'items_list'                 => sprintf( __( '%s list', Config::TEXT_DOMAIN ), $this->plural ),
			'back_to_items'              => sprintf( __( '&larr; Back to %s', Config::TEXT_DOMAIN ), $this->plural ),
		];

		$defaults = [
			'labels'             => $labels,
			'hierarchical'       => true,
			'public'             => true,
			'show_in_rest'       => true,
			'show_admin_column'  => true,
			'show_in_quick_edit' => true,
			'show_tagcloud'      => true,
			'rewrite'            => [ 'slug' => $this->taxonomy ],
		];

		$args = array_merge( $defaults, $this->options );

		/**
		 * Filters the taxonomy registration args.
		 *
		 * @param array  $args     Registration arguments.
		 * @param string $taxonomy Taxonomy key.
		 */
		$args = apply_filters( Config::PREFIX . "{$this->taxonomy}_register_args", $args, $this->taxonomy );

		register_taxonomy( $this->taxonomy, $this->post_types, $args );
	}
}
