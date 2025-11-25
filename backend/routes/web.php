<?php

use App\Http\Controllers\Admin\ClientController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::get('/', function () {
    return Inertia::render('welcome', [
        'canRegister' => Features::enabled(Features::registration()),
    ]);
})->name('home');

Route::middleware(['auth', 'verified', 'role:admin'])->group(function () {
    Route::get('dashboard', function () {
        $rooms = \App\Models\Room::where('active', true)->get();
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
