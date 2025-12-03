<?php

use App\Http\Controllers\RecordingController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\RoomSessionController;
use App\Http\Controllers\SystemLogController;
use Illuminate\Support\Facades\Route;

/**
 * API Routes
 *
 * Registers API routes for the application.
 * These routes are loaded by the RouteServiceProvider.
 */

Route::get('/health', function () {
    return ['status' => 'ok'];
});
Route::middleware(['web', 'auth'])->group(function () {
    // Rooms
    Route::post('/rooms', [RoomController::class, 'store']);
    Route::get('/rooms', [RoomController::class, 'index']);

    // Recording
    Route::post('/recordings/start', [RecordingController::class, 'start']);
    Route::post('/recordings/{id}/stop', [RecordingController::class, 'stop']);
});

Route::middleware(['web'])->group(function () {
    // Room Sessions (Public/Guest allowed)
    Route::post('/rooms/{room}/join', [RoomSessionController::class, 'join']);
    Route::post('/room-sessions/{id}/leave', [RoomSessionController::class, 'leave']);
});

// Internal APIs (Protected by Shared Secret)
Route::middleware(['internal.auth'])->prefix('internal')->group(function () {
    Route::post('/stream-status', [App\Http\Controllers\Internal\StreamStatusController::class, 'update']);
    Route::post('/stream-status/reset', [App\Http\Controllers\Internal\StreamStatusController::class, 'reset']);

    // Recording callbacks
    Route::post('/recording/start', [App\Http\Controllers\RecordingController::class, 'internalStart']);
    Route::post('/recording/stop', [App\Http\Controllers\RecordingController::class, 'internalStop']);
});
