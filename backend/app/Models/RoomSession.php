<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoomSession extends Model
{
    //
    protected $fillable = [
        'room_id',
        'user_id',
        'connection_id',
        'joined_at',
        'left_at',
        'is_active'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function room()
    {
        return $this->belongsTo(Room::class);
    }

    public function recordings()
    {
        return $this->hasMany(Recording::class);
    }
}
