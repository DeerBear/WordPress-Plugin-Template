<?php
/**
 * Feature Gate — check license tier and feature entitlements.
 *
 * @package YourPlugin\License
 */

declare(strict_types=1);

namespace YourPlugin\License;

/**
 * Provides helpers to gate features behind license tiers.
 *
 * Supports both license types:
 *   - 'standard'     — perpetual / one-time purchase (no expiry, no usage metering)
 *   - 'subscription' — SaaS / recurring (expiry, usage metering, periodic validation)
 *
 * Usage:
 *   $gate = your_plugin()->features();
 *
 *   if ( $gate->can( 'export_csv' ) ) { ... }
 *   if ( $gate->tier_is( 'pro' ) ) { ... }
 *   if ( $gate->tier_at_least( 'business' ) ) { ... }
 *   if ( $gate->is_subscription() ) { ... }
 *   if ( $gate->is_standard() ) { ... }
 */
class FeatureGate {

	/**
	 * Tier hierarchy — lowest to highest. Extend via filter.
	 *
	 * @var string[]
	 */
	private array $tier_hierarchy;

	private LicenseClient $client;

	public function __construct( LicenseClient $client ) {
		$this->client = $client;

		/**
		 * Filters the tier hierarchy from lowest to highest.
		 *
		 * @param string[] $tiers Ordered tier names.
		 */
		$this->tier_hierarchy = apply_filters( 'your_plugin_tier_hierarchy', [
			'free',
			'starter',
			'pro',
			'business',
			'enterprise',
		] );
	}

	// -- License type helpers ------------------------------------------------

	/**
	 * Get the license type.
	 *
	 * @return string 'standard', 'subscription', or 'none'.
	 */
	public function license_type(): string {
		if ( ! $this->client->is_active() ) {
			return 'none';
		}

		$data = $this->client->get_data();

		return $data['license_type'] ?? 'standard';
	}

	/**
	 * Check if this is a standard (perpetual / one-time) license.
	 */
	public function is_standard(): bool {
		return 'standard' === $this->license_type();
	}

	/**
	 * Check if this is a subscription (SaaS / recurring) license.
	 */
	public function is_subscription(): bool {
		return 'subscription' === $this->license_type();
	}

	/**
	 * Check if the license is valid right now — active and not expired.
	 * For standard licenses without an expiry, this just checks active status.
	 */
	public function is_valid(): bool {
		if ( ! $this->client->is_active() ) {
			return false;
		}

		// Standard licenses without expiry are valid as long as they're active.
		if ( $this->is_standard() && ! $this->has_expiry() ) {
			return true;
		}

		return ! $this->is_expired();
	}

	/**
	 * Check whether the license has an expiry date set.
	 */
	public function has_expiry(): bool {
		$data = $this->client->get_data();
		return ! empty( $data['expires_at'] );
	}

	/**
	 * Check if the current license includes a specific feature.
	 *
	 * Expects license data to contain a 'features' array, e.g.:
	 *   [ 'export_csv', 'white_label', 'api_access' ]
	 *
	 * @param string $feature Feature identifier.
	 * @return bool
	 */
	public function can( string $feature ): bool {
		if ( ! $this->client->is_active() ) {
			/**
			 * Filters whether unlicensed users can access a feature.
			 *
			 * @param bool   $allowed Whether to allow the feature without a license.
			 * @param string $feature The feature being checked.
			 */
			return apply_filters( 'your_plugin_unlicensed_feature', false, $feature );
		}

		$data     = $this->client->get_data();
		$features = $data['features'] ?? [];

		return in_array( $feature, $features, true );
	}

	/**
	 * Get the current license tier.
	 *
	 * @return string Tier name or 'free' if no active license.
	 */
	public function tier(): string {
		if ( ! $this->client->is_active() ) {
			return 'free';
		}

		$data = $this->client->get_data();

		return $data['tier'] ?? 'free';
	}

	/**
	 * Check if the current tier matches exactly.
	 *
	 * @param string $tier Tier name.
	 * @return bool
	 */
	public function tier_is( string $tier ): bool {
		return $this->tier() === $tier;
	}

	/**
	 * Check if the current tier is at or above a given level.
	 *
	 * @param string $minimum_tier Minimum required tier.
	 * @return bool
	 */
	public function tier_at_least( string $minimum_tier ): bool {
		$current_index = array_search( $this->tier(), $this->tier_hierarchy, true );
		$minimum_index = array_search( $minimum_tier, $this->tier_hierarchy, true );

		if ( false === $current_index || false === $minimum_index ) {
			return false;
		}

		return $current_index >= $minimum_index;
	}

	/**
	 * Check if the license has expired.
	 *
	 * Expects license data to contain an 'expires_at' timestamp or date string.
	 *
	 * @return bool
	 */
	public function is_expired(): bool {
		$data       = $this->client->get_data();
		$expires_at = $data['expires_at'] ?? null;

		if ( null === $expires_at ) {
			return false; // No expiry = lifetime license.
		}

		$expiry_time = is_numeric( $expires_at ) ? (int) $expires_at : strtotime( (string) $expires_at );

		return $expiry_time < time();
	}

	/**
	 * Get the remaining usage count for a metered feature.
	 *
	 * Expects license data like: { "usage": { "api_calls": { "used": 450, "limit": 1000 } } }
	 *
	 * @param string $meter The usage meter key.
	 * @return int|null Remaining count or null if not metered.
	 */
	public function usage_remaining( string $meter ): ?int {
		$data  = $this->client->get_data();
		$usage = $data['usage'][ $meter ] ?? null;

		if ( null === $usage ) {
			return null;
		}

		$limit = $usage['limit'] ?? PHP_INT_MAX;
		$used  = $usage['used'] ?? 0;

		return max( 0, $limit - $used );
	}

	/**
	 * Check if a metered feature has remaining capacity.
	 *
	 * @param string $meter The usage meter key.
	 * @return bool True if under limit or not metered.
	 */
	public function has_capacity( string $meter ): bool {
		$remaining = $this->usage_remaining( $meter );

		return null === $remaining || $remaining > 0;
	}
}
