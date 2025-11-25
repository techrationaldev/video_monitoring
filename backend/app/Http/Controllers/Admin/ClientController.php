<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;

class ClientController extends Controller
{
    //
    public function index()
    {
        $clients = User::role('client')->paginate(20);

        return Inertia::render('admin/clients/index', [
            'clients' => $clients
        ]);
    }

    public function create()
    {
        return Inertia::render('admin/clients/create');
    }

    public function store(Request $request)
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

    public function edit(User $client)
    {
        if (!$client->hasRole('client')) {
            abort(403);
        }

        return Inertia::render('admin/clients/edit', ['client' => $client]);
    }

    public function update(Request $request, User $client)
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

    public function destroy(User $client)
    {
        if (!$client->hasRole('client')) {
            abort(403);
        }

        $client->delete();

        return redirect()->route('clients.index');
    }
}
