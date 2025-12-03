<?php

namespace App\Http\Controllers;

use App\Models\Recording;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

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
     * List recordings.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        $query = Recording::query()->with('room');

        if ($request->has('room_id')) {
            $query->where('room_id', $request->room_id);
        }

        if ($request->has('room_name')) {
            $query->whereHas('room', function($q) use ($request) {
                $q->where('name', $request->room_name);
            });
        }

        return response()->json($query->latest()->get());
    }

    /**
     * Starts a new recording session (Manual).
     *
     * @param \Illuminate\Http\Request $request The request object containing 'roomId'.
     * @return \Illuminate\Http\JsonResponse JSON response.
     */
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'roomId' => 'required', // Room Name
        ]);

        $url = env('RECORDING_SERVICE_URL', 'http://localhost:4000');
        $secret = env('INTERNAL_API_SECRET', 'super-secret-key');

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $secret
        ])->post("$url/recording/start", [
            'roomId' => $data['roomId']
        ]);

        if ($response->failed()) {
            return response()->json(['error' => 'Failed to start recording', 'details' => $response->body()], 500);
        }

        return response()->json($response->json());
    }

    /**
     * Stops a recording session (Manual).
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse JSON response.
     */
    public function stop(Request $request): JsonResponse
    {
         $data = $request->validate([
            'roomId' => 'required', // Room Name
        ]);

        $url = env('RECORDING_SERVICE_URL', 'http://localhost:4000');
        $secret = env('INTERNAL_API_SECRET', 'super-secret-key');

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $secret
        ])->post("$url/recording/stop", [
            'roomId' => $data['roomId']
        ]);

         if ($response->failed()) {
            return response()->json(['error' => 'Failed to stop recording', 'details' => $response->body()], 500);
        }

        return response()->json($response->json());
    }

    /**
     * Webhook for Recording Service.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function webhook(Request $request): JsonResponse
    {
        $secret = config('app.internal_api_secret', env('INTERNAL_API_SECRET'));

        $header = $request->header('Authorization');
        if ($header !== 'Bearer ' . $secret) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $event = $request->input('event');
        $roomId = $request->input('roomId');

        if ($event === 'recording.complete') {
            try {
                $room = Room::where('name', $roomId)->first();
                if (!$room) {
                    Log::error("Room not found for recording: $roomId");
                    return response()->json(['error' => 'Room not found'], 404);
                }

                Recording::create([
                    'room_id' => $room->id,
                    'file_path' => $request->input('filePath'),
                    'duration' => $request->input('duration'),
                    'size' => $request->input('size'),
                    'started_at' => now()->subSeconds($request->input('duration')),
                    'ended_at' => now(),
                    // 'resolution' => '720p', // Default
                ]);

                Log::info("Recording saved for room: $roomId");
            } catch (\Exception $e) {
                Log::error("Failed to save recording: " . $e->getMessage());
                return response()->json(['error' => 'Database error'], 500);
            }
        } elseif ($event === 'recording.failed') {
            Log::error("Recording failed for room $roomId: " . $request->input('error'));
        }

        return response()->json(['status' => 'ok']);
    }
}
