<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Class Room
 *
 * Represents a conference room.
 *
 * @package App\Models
 */
class Room extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = ['name', 'created_by', 'active', 'status', 'started_at', 'ended_at'];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'active' => 'boolean',
    ];

    /**
     * Get the user who created the room.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the sessions associated with the room.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany
     */
    public function sessions(): HasMany
    {
        return $this->hasMany(RoomSession::class);
    }

    /**
     * Get the recordings associated with the room.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany
     */
    public function recordings(): HasMany
    {
        return $this->hasMany(Recording::class);
    }
}
