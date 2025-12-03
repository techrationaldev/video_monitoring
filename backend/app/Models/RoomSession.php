<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Class RoomSession
 *
 * Represents a user's session within a room.
 *
 * @package App\Models
 */
class RoomSession extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'room_id',
        'user_id',
        'connection_id',
        'joined_at',
        'left_at',
        'is_active'
    ];

    /**
     * Get the user associated with the session.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the room associated with the session.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    /**
     * Get the recordings associated with the session.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany
     */
    public function recordings(): HasMany
    {
        return $this->hasMany(Recording::class);
    }
}
