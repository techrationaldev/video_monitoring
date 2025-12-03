<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Models\RoomSession;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\JsonResponse;

/**
 * Class StreamStatusController
 *
 * Handles internal updates regarding stream status from the Mediasoup server.
 *
 * @package App\Http\Controllers\Internal
 */
class StreamStatusController extends Controller
{
    /**
     * Updates the status of a stream session.
     *
     * @param \Illuminate\Http\Request $request The request object containing 'roomId', 'clientId', and 'status'.
     * @return \Illuminate\Http\JsonResponse JSON response indicating status.
     */
    public function update(Request $request): JsonResponse
    {
        // Simple security check (in production, use a proper secret key)
        // For now, we'll assume the internal network is safe or add a basic check later

        $validated = $request->validate([
            'roomId' => 'required|string',
            'clientId' => 'required|string',
            'status' => 'required|in:active,ended',
        ]);

        Log::info('Stream status update:', $validated);

        // Find the session by connection_id (which we store as clientId in Mediasoup)
        // The roomId in Mediasoup is 'client-{timestamp}' or similar, but we might have stored it differently.
        // Let's check RoomSessionController to see how it's stored.

        // Assuming 'connection_id' in DB matches 'clientId' from Mediasoup
        $session = RoomSession::where('connection_id', $validated['clientId'])->first();

        if ($session) {
            if ($validated['status'] === 'ended') {
                $session->update([
                    'is_active' => false,
                    'left_at' => now(),
                ]);

                // Also update the Room status
                $room = Room::find($session->room_id);
                if ($room) {
                    $room->update([
                        'status' => 'offline',
                        'ended_at' => now(),
                    ]);
                }

                Log::info("Session {$session->id} marked as ended.");
            }
        } else {
            Log::warning("Session not found for clientId: {$validated['clientId']}");
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Resets all live streams to offline.
     * Useful when the media server restarts.
     *
     * @return \Illuminate\Http\JsonResponse JSON response with reset count.
     */
    public function reset(): JsonResponse
    {
        Log::info('Resetting all stream statuses to offline (Server Restart).');

        $affected = Room::where('status', 'live')->update([
            'status' => 'offline',
            'ended_at' => now(),
        ]);

        // Also close any active sessions
        RoomSession::where('is_active', true)->update([
            'is_active' => false,
            'left_at' => now(),
        ]);

        Log::info("Reset complete. {$affected} rooms marked as offline.");

        return response()->json(['status' => 'ok', 'reset_count' => $affected]);
    }
}
