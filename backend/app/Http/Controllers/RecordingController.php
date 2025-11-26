<?php

namespace App\Http\Controllers;

use App\Models\Recording;
use Illuminate\Http\Request;

class RecordingController extends Controller
{
    //
    // POST /recordings/start
    public function start(Request $request)
    {
        $data = $request->validate([
            'room_session_id' => 'required',
            'room_id' => 'required',
        ]);

        $rec = Recording::create([
            'room_session_id' => $data['room_session_id'],
            'user_id' => \Illuminate\Support\Facades\Auth::id(),
            'room_id' => $data['room_id'],
            'file_path' => '',
            'started_at' => now(),
        ]);

        return response()->json($rec);
    }

    // POST /recordings/{id}/stop
    public function stop($id)
    {
        $rec = Recording::findOrFail($id);
        $rec->update(['ended_at' => now()]);

        return response()->json($rec);
    }
    // Internal: Called by Mediasoup when recording actually starts
    public function internalStart(Request $request)
    {
        $data = $request->validate([
            'roomId' => 'required',
            'filename' => 'required',
        ]);

        // Find the active room session or just link to the room
        // For simplicity, we'll just link to the Room and the current User (if we can identify them, but here it's system)
        // Actually, we should probably pass the 'roomSessionId' if we have it, or just the Room.

        $room = \App\Models\Room::where('name', $data['roomId'])->firstOrFail();

        $rec = Recording::create([
            'room_id' => $room->id,
            'file_path' => $data['filename'], // Relative path in storage
            'started_at' => now(),
            'status' => 'recording', // We might need to add this column or just infer from ended_at
        ]);

        return response()->json(['id' => $rec->id]);
    }

    // Internal: Called by Mediasoup when recording stops
    public function internalStop(Request $request)
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
