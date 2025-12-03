<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Class CheckInternalApiSecret
 *
 * Middleware to verify the internal API secret for secure communication between services.
 *
 * @package App\Http\Middleware
 */
class CheckInternalApiSecret
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request The incoming request.
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next The next middleware.
     * @return \Symfony\Component\HttpFoundation\Response The response or error JSON.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('app.internal_api_secret');

        if (!$secret) {
            // If no secret is configured, block everything for security
            return response()->json(['error' => 'Internal API secret not configured'], 500);
        }

        if ($request->header('X-Internal-Secret') !== $secret) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return $next($request);
    }
}
