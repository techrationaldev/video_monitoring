<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\ProfileUpdateRequest;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Class ProfileController
 *
 * Manages user profile settings.
 *
 * @package App\Http\Controllers\Settings
 */
class ProfileController extends Controller
{
    /**
     * Shows the user's profile settings page.
     *
     * @param \Illuminate\Http\Request $request The request object.
     * @return \Inertia\Response Inertia response with profile data.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('settings/profile', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => $request->session()->get('status'),
        ]);
    }

    /**
     * Updates the user's profile settings.
     *
     * @param \App\Http\Requests\Settings\ProfileUpdateRequest $request The validated request object.
     * @return \Illuminate\Http\RedirectResponse Redirect back to the profile edit page.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        return to_route('profile.edit');
    }

    /**
     * Deletes the user's account.
     *
     * @param \Illuminate\Http\Request $request The request object containing the password for confirmation.
     * @return \Illuminate\Http\RedirectResponse Redirect to the home page.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validate([
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
