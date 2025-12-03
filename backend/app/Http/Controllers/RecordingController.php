<?php

namespace App\Http\Controllers;

use App\Models\Recording;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * Class RecordingController
 *
 * Handles recording operations.
 *
 * @package App\Http\Controllers
 */
class RecordingController extends Controller
{
    /**
     * Starts a new recording session.
     *
     * @param \Illuminate\Http\Request $request The request object containing 'room_session_id' and 'room_id'.
     * @return \Illuminate\Http\JsonResponse JSON response with the created recording.
     */
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_session_id' => 'required',
            'room_id' => 'required',
        ]);

        $rec = Recording::create([
            'room_session_id' => $data['room_session_id'],
            'user_id' => Auth::id(),
            'room_id' => $data['room_id'],
            'file_path' => '',
            'started_at' => now(),
        ]);

        return response()->json($rec);
    }

    /**
     * Stops a recording session.
     *
     * @param int $id The ID of the recording to stop.
     * @return \Illuminate\Http\JsonResponse JSON response with the updated recording.
     */
    public function stop($id): JsonResponse
    {
        $rec = Recording::findOrFail($id);
        $rec->update(['ended_at' => now()]);

        return response()->json($rec);
    }

    /**
     * Internal endpoint called by Mediasoup when recording actually starts.
     *
     * @param \Illuminate\Http\Request $request The request object containing 'roomId' and 'filename'.
     * @return \Illuminate\Http\JsonResponse JSON response with the recording ID.
     */
    public function internalStart(Request $request): JsonResponse
    {
        $data = $request->validate([
            'roomId' => 'required',
            'filename' => 'required',
        ]);

        // Find the active room session or just link to the room
        // For simplicity, we'll just link to the Room and the current User (if we can identify them, but here it's system)
        // Actually, we should probably pass the 'roomSessionId' if we have it, or just the Room.

        $room = Room::where('name', $data['roomId'])->firstOrFail();

        $rec = Recording::create([
            'room_id' => $room->id,
            'file_path' => $data['filename'], // Relative path in storage
            'started_at' => now(),
            'status' => 'recording', // We might need to add this column or just infer from ended_at
        ]);

        return response()->json(['id' => $rec->id]);
    }

    /**
     * Internal endpoint called by Mediasoup when recording stops.
     *
     * @param \Illuminate\Http\Request $request The request object containing 'roomId' and 'filename'.
     * @return \Illuminate\Http\JsonResponse JSON response indicating status.
     */
    public function internalStop(Request $request): JsonResponse
    {
        $data = $request->validate([
            'roomId' => 'required',
            'filename' => 'required',
        ]);

        // Find the active recording for this file
        $rec = Recording::where('file_path', $data['filename'])
            ->whereNull('ended_at')
            ->latest()
            ->first();

        if ($rec) {
            $rec->update(['ended_at' => now()]);
        }

        return response()->json(['status' => 'ok']);
    }
}
