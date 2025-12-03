<?php

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;
use Laravel\Fortify\Features;
use Laravel\Fortify\InteractsWithTwoFactorState;

/**
 * Class TwoFactorAuthenticationRequest
 *
 * Form request for Two-Factor Authentication settings.
 *
 * @package App\Http\Requests\Settings
 */
class TwoFactorAuthenticationRequest extends FormRequest
{
    use InteractsWithTwoFactorState;

    /**
     * Determine if the user is authorized to make this request.
     *
     * @return bool True if 2FA is enabled in features.
     */
    public function authorize(): bool
    {
        return Features::enabled(Features::twoFactorAuthentication());
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [];
    }
}
