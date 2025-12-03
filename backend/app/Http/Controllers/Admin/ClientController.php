<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Http\RedirectResponse;

/**
 * Class ClientController
 *
 * Manages client users in the admin panel.
 *
 * @package App\Http\Controllers\Admin
 */
class ClientController extends Controller
{
    /**
     * Lists all clients.
     *
     * @return \Inertia\Response Inertia response with the list of clients.
     */
    public function index(): Response
    {
        $clients = User::role('client')->paginate(20);

        return Inertia::render('admin/clients/index', [
            'clients' => $clients
        ]);
    }

    /**
     * Shows the form to create a new client.
     *
     * @return \Inertia\Response Inertia response with the create form.
     */
    public function create(): Response
    {
        return Inertia::render('admin/clients/create');
    }

    /**
     * Stores a new client in the database.
     *
     * @param \Illuminate\Http\Request $request The request object containing client details.
     * @return \Illuminate\Http\RedirectResponse Redirect to the clients list.
     */
    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            'password' => 'required|string|min:6'
        ]);

        $user = User::create([
            'name'     => $request->name,
            'email'    => $request->email,
            'password' => Hash::make($request->password),
        ]);

        $user->assignRole('client');

        return redirect()->route('clients.index');
    }

    /**
     * Shows the form to edit an existing client.
     *
     * @param \App\Models\User $client The client user instance.
     * @return \Inertia\Response Inertia response with the edit form.
     */
    public function edit(User $client): Response
    {
        if (!$client->hasRole('client')) {
            abort(403);
        }

        return Inertia::render('admin/clients/edit', ['client' => $client]);
    }

    /**
     * Updates an existing client.
     *
     * @param \Illuminate\Http\Request $request The request object containing updated details.
     * @param \App\Models\User $client The client user instance.
     * @return \Illuminate\Http\RedirectResponse Redirect to the clients list.
     */
    public function update(Request $request, User $client): RedirectResponse
    {
        if (!$client->hasRole('client')) {
            abort(403);
        }

        $request->validate([
            'name'  => 'required|string|max:255',
            'email' => 'required|email|unique:users,email,' . $client->id,
        ]);

        $client->update([
            'name'  => $request->name,
            'email' => $request->email,
        ]);

        return redirect()->route('clients.index');
    }

    /**
     * Deletes a client.
     *
     * @param \App\Models\User $client The client user instance.
     * @return \Illuminate\Http\RedirectResponse Redirect to the clients list.
     */
    public function destroy(User $client): RedirectResponse
    {
        if (!$client->hasRole('client')) {
            abort(403);
        }

        $client->delete();

        return redirect()->route('clients.index');
    }
}
