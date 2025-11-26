<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Room extends Model
{
    //
    protected $fillable = ['name', 'created_by', 'active', 'status', 'started_at', 'ended_at'];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'active' => 'boolean',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function sessions()
    {
        return $this->hasMany(RoomSession::class);
    }

    public function recordings()
    {
        return $this->hasMany(Recording::class);
    }
}
