<?php

namespace App\Http\Controllers;

use App\Helpers\Log_Helper;
use App\Models\Room;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Class RoomController
 *
 * Handles room management operations.
 */
class RoomController extends Controller
{
    /**
     * Lists all rooms.
     *
     * @return \Illuminate\Database\Eloquent\Collection Collection of all rooms with creator.
     */
    public function index(): Collection
    {
        return Room::with('creator')->get();
    }

    /**
     * Creates a new room.
     *
     * @param  \Illuminate\Http\Request  $request  The request object containing 'name'.
     * @return \Illuminate\Http\JsonResponse JSON response with message and created room.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:rooms,name',
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
            'room' => $room,
        ], 201);
    }

    /**
     * Retrieves details of a specific room.
     *
     * @param  \App\Models\Room  $room  The room instance.
     * @return \App\Models\Room The room with creator details loaded.
     */
    public function show(Room $room): Room
    {
        return $room->load('creator');
    }
}
