<?php

namespace App\Http\Controllers;

use App\Helpers\Log_Helper;
use App\Models\Room;
use Illuminate\Http\Request;

class RoomController extends Controller
{
    //

    // GET /rooms
    public function index()
    {
        return Room::with('creator')->get();
    }

    // Create room
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $room = Room::create([
            'name' => $request->name,
            'created_by' => auth()->id(),
            'active' => true,
        ]);

        Log_Helper::log(
            type: 'room_created',
            message: "Room '{$room->name}' created",
            context: ['room_id' => $room->id],
            roomId: $room->id
        );

        return response()->json([
            'message' => 'Room created',
            'room' => $room
        ], 201);
    }

    // Get single room
    public function show(Room $room)
    {
        return $room->load('creator');
    }
}
