<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Room extends Model
{
    //
    protected $fillable = ['name', 'slug', 'created_by', 'active'];

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
