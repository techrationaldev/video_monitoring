<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Class PasswordController
 *
 * Manages user password settings.
 *
 * @package App\Http\Controllers\Settings
 */
class PasswordController extends Controller
{
    /**
     * Show the user's password settings page.
     *
     * @return \Inertia\Response Inertia response with the password form.
     */
    public function edit(): Response
    {
        return Inertia::render('settings/password');
    }

    /**
     * Update the user's password.
     *
     * @param \Illuminate\Http\Request $request The request object containing current and new passwords.
     * @return \Illuminate\Http\RedirectResponse Redirect back to the password edit page.
     */
    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', Password::defaults(), 'confirmed'],
        ]);

        $request->user()->update([
            'password' => $validated['password'],
        ]);

        return back();
    }
}
