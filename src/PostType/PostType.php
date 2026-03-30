<?php
/**
 * Custom Post Type registration helper.
 *
 * @package YourPlugin\PostType
 */

declare(strict_types=1);

namespace YourPlugin\PostType;

/**
 * Registers a custom post type with sensible defaults.
 *
 * Usage:
 *   new PostType( 'book', 'Books', 'Book', 'A library of books.' );
 */
class PostType {

	private string $post_type;
	private string $plural;
	private string $single;
	private string $description;
	private array  $options;

	/**
	 * @param string $post_type   Post type key (max 20 chars, no uppercase).
	 * @param string $plural      Plural label.
	 * @param string $single      Singular label.
	 * @param string $description Description.
	 * @param array  $options     Override any register_post_type args.
	 */
	public function __construct(
		string $post_type,
		string $plural,
		string $single,
		string $description = '',
		array $options = []
	) {
		$this->post_type   = $post_type;
		$this->plural      = $plural;
		$this->single      = $single;
		$this->description = $description;
		$this->options     = $options;

		add_action( 'init', [ $this, 'register' ] );
		add_filter( 'post_updated_messages', [ $this, 'updated_messages' ] );
		add_filter( 'bulk_post_updated_messages', [ $this, 'bulk_updated_messages' ], 10, 2 );
	}

	/**
	 * Register the post type.
	 */
	public function register(): void {
		$labels = [
			'name'                  => $this->plural,
			'singular_name'         => $this->single,
			'add_new'               => _x( 'Add New', 'post type', 'your-plugin' ),
			'add_new_item'          => sprintf( __( 'Add New %s', 'your-plugin' ), $this->single ),
			'edit_item'             => sprintf( __( 'Edit %s', 'your-plugin' ), $this->single ),
			'new_item'              => sprintf( __( 'New %s', 'your-plugin' ), $this->single ),
			'view_item'             => sprintf( __( 'View %s', 'your-plugin' ), $this->single ),
			'view_items'            => sprintf( __( 'View %s', 'your-plugin' ), $this->plural ),
			'search_items'          => sprintf( __( 'Search %s', 'your-plugin' ), $this->plural ),
			'not_found'             => sprintf( __( 'No %s found.', 'your-plugin' ), strtolower( $this->plural ) ),
			'not_found_in_trash'    => sprintf( __( 'No %s found in Trash.', 'your-plugin' ), strtolower( $this->plural ) ),
			'all_items'             => sprintf( __( 'All %s', 'your-plugin' ), $this->plural ),
			'archives'              => sprintf( __( '%s Archives', 'your-plugin' ), $this->single ),
			'insert_into_item'      => sprintf( __( 'Insert into %s', 'your-plugin' ), strtolower( $this->single ) ),
			'uploaded_to_this_item' => sprintf( __( 'Uploaded to this %s', 'your-plugin' ), strtolower( $this->single ) ),
			'filter_items_list'     => sprintf( __( 'Filter %s list', 'your-plugin' ), strtolower( $this->plural ) ),
			'items_list_navigation' => sprintf( __( '%s list navigation', 'your-plugin' ), $this->plural ),
			'items_list'            => sprintf( __( '%s list', 'your-plugin' ), $this->plural ),
		];

		$defaults = [
			'labels'             => $labels,
			'description'        => $this->description,
			'public'             => true,
			'show_in_rest'       => true,
			'has_archive'        => true,
			'hierarchical'       => false,
			'supports'           => [ 'title', 'editor', 'excerpt', 'thumbnail', 'author', 'revisions' ],
			'menu_icon'          => 'dashicons-admin-post',
			'menu_position'      => 25,
			'rewrite'            => [ 'slug' => $this->post_type ],
		];

		$args = array_merge( $defaults, $this->options );

		/**
		 * Filters the post type registration args.
		 *
		 * @param array  $args      Registration arguments.
		 * @param string $post_type Post type key.
		 */
		$args = apply_filters( "your_plugin_{$this->post_type}_register_args", $args, $this->post_type );

		register_post_type( $this->post_type, $args );
	}

	/**
	 * Customise update messages.
	 *
	 * @param array $messages Existing messages.
	 * @return array Modified messages.
	 */
	public function updated_messages( array $messages ): array {
		global $post;

		$messages[ $this->post_type ] = [
			0  => '',
			1  => sprintf( __( '%s updated.', 'your-plugin' ), $this->single ),
			2  => __( 'Custom field updated.', 'your-plugin' ),
			3  => __( 'Custom field deleted.', 'your-plugin' ),
			4  => sprintf( __( '%s updated.', 'your-plugin' ), $this->single ),
			5  => isset( $_GET['revision'] )
				? sprintf( __( '%1$s restored to revision from %2$s.', 'your-plugin' ), $this->single, wp_post_revision_title( (int) $_GET['revision'], false ) )
				: false,
			6  => sprintf( __( '%s published.', 'your-plugin' ), $this->single ),
			7  => sprintf( __( '%s saved.', 'your-plugin' ), $this->single ),
			8  => sprintf( __( '%s submitted.', 'your-plugin' ), $this->single ),
			9  => sprintf( __( '%s scheduled.', 'your-plugin' ), $this->single ),
			10 => sprintf( __( '%s draft updated.', 'your-plugin' ), $this->single ),
		];

		return $messages;
	}

	/**
	 * Customise bulk update messages.
	 *
	 * @param array $messages    Existing messages.
	 * @param array $bulk_counts Counts.
	 * @return array Modified messages.
	 */
	public function bulk_updated_messages( array $messages, array $bulk_counts ): array {
		$messages[ $this->post_type ] = [
			'updated'   => sprintf( _n( '%s %s updated.', '%s %s updated.', $bulk_counts['updated'], 'your-plugin' ), $bulk_counts['updated'], $bulk_counts['updated'] > 1 ? $this->plural : $this->single ),
			'locked'    => sprintf( _n( '%s %s not updated, somebody is editing it.', '%s %s not updated, somebody is editing them.', $bulk_counts['locked'], 'your-plugin' ), $bulk_counts['locked'], $bulk_counts['locked'] > 1 ? $this->plural : $this->single ),
			'deleted'   => sprintf( _n( '%s %s permanently deleted.', '%s %s permanently deleted.', $bulk_counts['deleted'], 'your-plugin' ), $bulk_counts['deleted'], $bulk_counts['deleted'] > 1 ? $this->plural : $this->single ),
			'trashed'   => sprintf( _n( '%s %s moved to the Trash.', '%s %s moved to the Trash.', $bulk_counts['trashed'], 'your-plugin' ), $bulk_counts['trashed'], $bulk_counts['trashed'] > 1 ? $this->plural : $this->single ),
			'untrashed' => sprintf( _n( '%s %s restored from the Trash.', '%s %s restored from the Trash.', $bulk_counts['untrashed'], 'your-plugin' ), $bulk_counts['untrashed'], $bulk_counts['untrashed'] > 1 ? $this->plural : $this->single ),
		];

		return $messages;
	}
}
