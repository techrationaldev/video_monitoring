<?php

namespace App\Http\Controllers;

use App\Models\RoomSession;
use Illuminate\Http\Request;

class RoomSessionController extends Controller
{
    //
    // POST /rooms/{room}/join
    public function join(Request $request, $roomId)
    {
        // Ensure room exists (using name as ID)
        $room = \App\Models\Room::firstOrCreate(
            ['name' => $roomId],
            ['created_by' => auth()->id() ?? 1, 'active' => true]
        );

        // Update room status to live
        $room->update([
            'status' => 'live',
            'started_at' => now(),
            'ended_at' => null,
        ]);

        $session = RoomSession::create([
            'room_id' => $room->id,
            'user_id' => auth()->id(), // Nullable if guest
            'connection_id' => $request->connection_id,
            'joined_at' => now(),
            'is_active' => true,
        ]);

        return response()->json($session);
    }

    // POST /room-sessions/{id}/leave
    public function leave($id)
    {
        $session = RoomSession::findOrFail($id);

        $session->update([
            'left_at' => now(),
            'is_active' => false,
        ]);

        return response()->json(['left' => true]);
    }
}
