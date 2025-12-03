<?php

use App\Models\Room;
use App\Models\User;

test('cannot create duplicate rooms', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    // Create first room
    $response1 = $this->postJson('/api/rooms', [
        'name' => 'Meeting Room',
    ]);
    $response1->assertCreated();

    // Try to create second room with same name
    $response2 = $this->postJson('/api/rooms', [
        'name' => 'Meeting Room',
    ]);

    // This assertions confirm the fix. Failing them confirms the bug.
    $response2->assertStatus(422);
    $response2->assertJsonValidationErrors(['name']);
});
