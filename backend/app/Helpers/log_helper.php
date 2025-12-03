<?php

namespace App\Helpers;

use App\Models\SystemLog;

/**
 * Class Log_Helper
 *
 * Helper class for logging system events.
 *
 * @package App\Helpers
 */
class Log_Helper
{
    /**
     * Logs an event to the database.
     *
     * @param string $type The type of the log entry.
     * @param string $message The log message.
     * @param array $context Additional context data (optional).
     * @param int|null $roomId The ID of the room related to the log (optional).
     * @return void
     */
    public static function log(string $type, string $message, array $context = [], $roomId = null)
    {
        SystemLog::create([
            'type' => $type,
            'user_id' => auth()->id(),
            'room_id' => $roomId,
            'message' => $message,
            'context' => $context,
        ]);
    }
}
