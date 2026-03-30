<?php
/**
 * Unit tests for the FeatureGate class.
 *
 * @package YourPlugin\Tests\Unit
 */

declare(strict_types=1);

namespace YourPlugin\Tests\Unit;

use PHPUnit\Framework\TestCase;
use YourPlugin\License\FeatureGate;
use YourPlugin\License\LicenseClient;

/**
 * @covers \YourPlugin\License\FeatureGate
 */
class FeatureGateTest extends TestCase {

	private function make_gate( string $status, array $data ): FeatureGate {
		$client = $this->createMock( LicenseClient::class );
		$client->method( 'is_active' )->willReturn( 'active' === $status );
		$client->method( 'get_status' )->willReturn( $status );
		$client->method( 'get_data' )->willReturn( $data );

		return new FeatureGate( $client );
	}

	public function test_tier_returns_free_when_inactive(): void {
		$gate = $this->make_gate( 'inactive', [] );
		$this->assertSame( 'free', $gate->tier() );
	}

	public function test_tier_returns_stored_tier(): void {
		$gate = $this->make_gate( 'active', [ 'tier' => 'pro' ] );
		$this->assertSame( 'pro', $gate->tier() );
	}

	public function test_tier_is(): void {
		$gate = $this->make_gate( 'active', [ 'tier' => 'business' ] );
		$this->assertTrue( $gate->tier_is( 'business' ) );
		$this->assertFalse( $gate->tier_is( 'pro' ) );
	}

	public function test_tier_at_least(): void {
		$gate = $this->make_gate( 'active', [ 'tier' => 'pro' ] );
		$this->assertTrue( $gate->tier_at_least( 'free' ) );
		$this->assertTrue( $gate->tier_at_least( 'starter' ) );
		$this->assertTrue( $gate->tier_at_least( 'pro' ) );
		$this->assertFalse( $gate->tier_at_least( 'business' ) );
		$this->assertFalse( $gate->tier_at_least( 'enterprise' ) );
	}

	public function test_can_returns_false_when_inactive(): void {
		$gate = $this->make_gate( 'inactive', [ 'features' => [ 'export_csv' ] ] );
		$this->assertFalse( $gate->can( 'export_csv' ) );
	}

	public function test_can_checks_feature_list(): void {
		$gate = $this->make_gate( 'active', [
			'tier'     => 'pro',
			'features' => [ 'export_csv', 'api_access' ],
		] );

		$this->assertTrue( $gate->can( 'export_csv' ) );
		$this->assertTrue( $gate->can( 'api_access' ) );
		$this->assertFalse( $gate->can( 'white_label' ) );
	}

	public function test_is_expired_with_future_date(): void {
		$gate = $this->make_gate( 'active', [
			'tier'       => 'pro',
			'expires_at' => gmdate( 'Y-m-d', strtotime( '+30 days' ) ),
		] );

		$this->assertFalse( $gate->is_expired() );
	}

	public function test_is_expired_with_past_date(): void {
		$gate = $this->make_gate( 'active', [
			'tier'       => 'pro',
			'expires_at' => gmdate( 'Y-m-d', strtotime( '-1 day' ) ),
		] );

		$this->assertTrue( $gate->is_expired() );
	}

	public function test_is_expired_returns_false_without_expiry(): void {
		$gate = $this->make_gate( 'active', [ 'tier' => 'pro' ] );
		$this->assertFalse( $gate->is_expired() );
	}

	public function test_usage_remaining(): void {
		$gate = $this->make_gate( 'active', [
			'tier'  => 'pro',
			'usage' => [
				'api_calls' => [ 'used' => 450, 'limit' => 1000 ],
			],
		] );

		$this->assertSame( 550, $gate->usage_remaining( 'api_calls' ) );
	}

	public function test_usage_remaining_returns_null_for_unknown_meter(): void {
		$gate = $this->make_gate( 'active', [ 'tier' => 'pro' ] );
		$this->assertNull( $gate->usage_remaining( 'unknown' ) );
	}

	public function test_has_capacity(): void {
		$gate = $this->make_gate( 'active', [
			'tier'  => 'pro',
			'usage' => [
				'api_calls' => [ 'used' => 1000, 'limit' => 1000 ],
			],
		] );

		$this->assertFalse( $gate->has_capacity( 'api_calls' ) );
		$this->assertTrue( $gate->has_capacity( 'unknown_meter' ) ); // Not metered = unlimited.
	}
}
