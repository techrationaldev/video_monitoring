<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

/**
 * Class HandleAppearance
 *
 * Middleware to handle the appearance settings (e.g., light/dark mode) shared with views.
 *
 * @package App\Http\Middleware
 */
class HandleAppearance
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request The incoming request.
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next The next middleware.
     * @return \Symfony\Component\HttpFoundation\Response The response.
     */
    public function handle(Request $request, Closure $next): Response
    {
        View::share('appearance', $request->cookie('appearance') ?? 'system');

        return $next($request);
    }
}
