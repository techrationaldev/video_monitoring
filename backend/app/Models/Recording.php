<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Recording extends Model
{
    //
    protected $fillable = [
        'session_id',
        'user_id',
        'room_id',
        'file_path',
        'resolution',
        'started_at',
        'ended_at'
    ];

    public function room()
    {
        return $this->belongsTo(Room::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
