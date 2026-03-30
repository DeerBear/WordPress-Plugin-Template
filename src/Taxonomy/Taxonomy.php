<?php
/**
 * Custom Taxonomy registration helper.
 *
 * @package YourPlugin\Taxonomy
 */

declare(strict_types=1);

namespace YourPlugin\Taxonomy;

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
			'search_items'               => sprintf( __( 'Search %s', 'your-plugin' ), $this->plural ),
			'popular_items'              => sprintf( __( 'Popular %s', 'your-plugin' ), $this->plural ),
			'all_items'                  => sprintf( __( 'All %s', 'your-plugin' ), $this->plural ),
			'parent_item'                => sprintf( __( 'Parent %s', 'your-plugin' ), $this->single ),
			'parent_item_colon'          => sprintf( __( 'Parent %s:', 'your-plugin' ), $this->single ),
			'edit_item'                  => sprintf( __( 'Edit %s', 'your-plugin' ), $this->single ),
			'update_item'                => sprintf( __( 'Update %s', 'your-plugin' ), $this->single ),
			'add_new_item'               => sprintf( __( 'Add New %s', 'your-plugin' ), $this->single ),
			'new_item_name'              => sprintf( __( 'New %s Name', 'your-plugin' ), $this->single ),
			'separate_items_with_commas' => sprintf( __( 'Separate %s with commas', 'your-plugin' ), strtolower( $this->plural ) ),
			'add_or_remove_items'        => sprintf( __( 'Add or remove %s', 'your-plugin' ), strtolower( $this->plural ) ),
			'choose_from_most_used'      => sprintf( __( 'Choose from the most used %s', 'your-plugin' ), strtolower( $this->plural ) ),
			'not_found'                  => sprintf( __( 'No %s found.', 'your-plugin' ), strtolower( $this->plural ) ),
			'menu_name'                  => $this->plural,
			'items_list_navigation'      => sprintf( __( '%s list navigation', 'your-plugin' ), $this->plural ),
			'items_list'                 => sprintf( __( '%s list', 'your-plugin' ), $this->plural ),
			'back_to_items'              => sprintf( __( '&larr; Back to %s', 'your-plugin' ), $this->plural ),
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
		$args = apply_filters( "your_plugin_{$this->taxonomy}_register_args", $args, $this->taxonomy );

		register_taxonomy( $this->taxonomy, $this->post_types, $args );
	}
}
