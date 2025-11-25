<?php

namespace App\Helpers;

use App\Models\SystemLog;

class Log_Helper
{
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
