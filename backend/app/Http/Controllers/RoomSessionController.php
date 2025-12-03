<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Models\RoomSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\JsonResponse;

/**
 * Class RoomSessionController
 *
 * Handles room session management (joining and leaving rooms).
 *
 * @package App\Http\Controllers
 */
class RoomSessionController extends Controller
{
    /**
     * Joins a room, creating a new session.
     *
     * @param \Illuminate\Http\Request $request The request object containing 'connection_id'.
     * @param string $roomId The name of the room to join.
     * @return \Illuminate\Http\JsonResponse JSON response with the created session.
     */
    public function join(Request $request, string $roomId): JsonResponse
    {
        // Ensure room exists (using name as ID)
        $room = Room::firstOrCreate(
            ['name' => $roomId],
            ['created_by' => Auth::id() ?? 1, 'active' => true]
        );

        // Update room status to live
        $room->update([
            'status' => 'live',
            'started_at' => now(),
            'ended_at' => null,
        ]);

        $session = RoomSession::create([
            'room_id' => $room->id,
            'user_id' => Auth::id(), // Nullable if guest
            'connection_id' => $request->connection_id,
            'joined_at' => now(),
            'is_active' => true,
        ]);

        return response()->json($session);
    }

    /**
     * Leaves a room session.
     *
     * @param int $id The ID of the session to leave.
     * @return \Illuminate\Http\JsonResponse JSON response indicating success.
     */
    public function leave(int $id): JsonResponse
    {
        $session = RoomSession::findOrFail($id);

        $session->update([
            'left_at' => now(),
            'is_active' => false,
        ]);

        return response()->json(['left' => true]);
    }
}
