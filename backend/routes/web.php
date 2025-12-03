<?php

use App\Http\Controllers\Admin\ClientController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

/**
 * Web Routes
 *
 * Registers web routes for the application.
 */

Route::get('/', function () {
    if (!Auth::check()) {
        return Inertia::render('welcome', [
            'canRegister' => Features::enabled(Features::registration()),
        ]);
    }

    /** @var \App\Models\User $user */
    $user = Auth::user();
    if ($user->hasRole('admin')) {
        return redirect()->route('dashboard');
    }

    return Inertia::render('client/stream/index');
})->name('home');

Route::middleware(['auth', 'verified', 'role:admin'])->group(function () {
    Route::get('dashboard', function () {
        // Only show rooms that have active sessions
        // Only show rooms that are live
        $rooms = \App\Models\Room::where('status', 'live')->get();
        return Inertia::render('dashboard', [
            'rooms' => $rooms
        ]);
    })->name('dashboard');
    Route::resource('clients', ClientController::class)
        ->except(['show']);

    Route::get('rooms/{room}/monitor', function ($roomId) {
        return Inertia::render('admin/room-monitor', [
            'roomId' => $roomId
        ]);
    })->name('admin.rooms.monitor');
});

Route::middleware(['auth', 'role:client'])->group(function () {
    Route::get('/client/stream', fn() => inertia('client/stream/index'))
        ->name('client.stream');
});

require __DIR__ . '/settings.php';
