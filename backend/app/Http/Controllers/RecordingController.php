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
            'user_id' => auth()->id(),
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
}
