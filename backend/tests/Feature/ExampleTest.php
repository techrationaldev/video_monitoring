<?php

/**
 * Example Feature Test
 *
 * Tests the basic functionality of the application.
 */

it('returns a successful response', function () {
    $response = $this->get('/');

    $response->assertStatus(200);
});
