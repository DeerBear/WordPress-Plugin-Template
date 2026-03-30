<?php
/**
 * Custom Post Type registration helper.
 *
 * @package YourPlugin\PostType
 */

declare(strict_types=1);

namespace YourPlugin\PostType;

use YourPlugin\Config;

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
			'add_new'               => _x( 'Add New', 'post type', Config::TEXT_DOMAIN ),
			'add_new_item'          => sprintf( __( 'Add New %s', Config::TEXT_DOMAIN ), $this->single ),
			'edit_item'             => sprintf( __( 'Edit %s', Config::TEXT_DOMAIN ), $this->single ),
			'new_item'              => sprintf( __( 'New %s', Config::TEXT_DOMAIN ), $this->single ),
			'view_item'             => sprintf( __( 'View %s', Config::TEXT_DOMAIN ), $this->single ),
			'view_items'            => sprintf( __( 'View %s', Config::TEXT_DOMAIN ), $this->plural ),
			'search_items'          => sprintf( __( 'Search %s', Config::TEXT_DOMAIN ), $this->plural ),
			'not_found'             => sprintf( __( 'No %s found.', Config::TEXT_DOMAIN ), strtolower( $this->plural ) ),
			'not_found_in_trash'    => sprintf( __( 'No %s found in Trash.', Config::TEXT_DOMAIN ), strtolower( $this->plural ) ),
			'all_items'             => sprintf( __( 'All %s', Config::TEXT_DOMAIN ), $this->plural ),
			'archives'              => sprintf( __( '%s Archives', Config::TEXT_DOMAIN ), $this->single ),
			'insert_into_item'      => sprintf( __( 'Insert into %s', Config::TEXT_DOMAIN ), strtolower( $this->single ) ),
			'uploaded_to_this_item' => sprintf( __( 'Uploaded to this %s', Config::TEXT_DOMAIN ), strtolower( $this->single ) ),
			'filter_items_list'     => sprintf( __( 'Filter %s list', Config::TEXT_DOMAIN ), strtolower( $this->plural ) ),
			'items_list_navigation' => sprintf( __( '%s list navigation', Config::TEXT_DOMAIN ), $this->plural ),
			'items_list'            => sprintf( __( '%s list', Config::TEXT_DOMAIN ), $this->plural ),
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
		$args = apply_filters( Config::PREFIX . "{$this->post_type}_register_args", $args, $this->post_type );

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
			1  => sprintf( __( '%s updated.', Config::TEXT_DOMAIN ), $this->single ),
			2  => __( 'Custom field updated.', Config::TEXT_DOMAIN ),
			3  => __( 'Custom field deleted.', Config::TEXT_DOMAIN ),
			4  => sprintf( __( '%s updated.', Config::TEXT_DOMAIN ), $this->single ),
			5  => isset( $_GET['revision'] )
				? sprintf( __( '%1$s restored to revision from %2$s.', Config::TEXT_DOMAIN ), $this->single, wp_post_revision_title( (int) $_GET['revision'], false ) )
				: false,
			6  => sprintf( __( '%s published.', Config::TEXT_DOMAIN ), $this->single ),
			7  => sprintf( __( '%s saved.', Config::TEXT_DOMAIN ), $this->single ),
			8  => sprintf( __( '%s submitted.', Config::TEXT_DOMAIN ), $this->single ),
			9  => sprintf( __( '%s scheduled.', Config::TEXT_DOMAIN ), $this->single ),
			10 => sprintf( __( '%s draft updated.', Config::TEXT_DOMAIN ), $this->single ),
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
			'updated'   => sprintf( _n( '%s %s updated.', '%s %s updated.', $bulk_counts['updated'], Config::TEXT_DOMAIN ), $bulk_counts['updated'], $bulk_counts['updated'] > 1 ? $this->plural : $this->single ),
			'locked'    => sprintf( _n( '%s %s not updated, somebody is editing it.', '%s %s not updated, somebody is editing them.', $bulk_counts['locked'], Config::TEXT_DOMAIN ), $bulk_counts['locked'], $bulk_counts['locked'] > 1 ? $this->plural : $this->single ),
			'deleted'   => sprintf( _n( '%s %s permanently deleted.', '%s %s permanently deleted.', $bulk_counts['deleted'], Config::TEXT_DOMAIN ), $bulk_counts['deleted'], $bulk_counts['deleted'] > 1 ? $this->plural : $this->single ),
			'trashed'   => sprintf( _n( '%s %s moved to the Trash.', '%s %s moved to the Trash.', $bulk_counts['trashed'], Config::TEXT_DOMAIN ), $bulk_counts['trashed'], $bulk_counts['trashed'] > 1 ? $this->plural : $this->single ),
			'untrashed' => sprintf( _n( '%s %s restored from the Trash.', '%s %s restored from the Trash.', $bulk_counts['untrashed'], Config::TEXT_DOMAIN ), $bulk_counts['untrashed'], $bulk_counts['untrashed'] > 1 ? $this->plural : $this->single ),
		];

		return $messages;
	}
}
