# Video Conferencing Application

This repository contains a full-stack video conferencing application built with **Laravel** (Backend) and **Mediasoup** (Media Server).

## Directory Structure

*   `backend/`: A Laravel application handling user authentication, room management, and the frontend UI (via Inertia.js + React).
*   `mediasoup-server/`: A Node.js application utilizing Mediasoup to handle real-time WebRTC media streams.

## Features

*   **User Authentication**: Secure login and registration using Laravel Fortify.
*   **Room Management**: Create and manage conference rooms.
*   **Real-time Streaming**: Low-latency video/audio streaming via WebRTC (Mediasoup).
*   **Recording**: Capability to record sessions (infrastructure present).
*   **Admin Dashboard**: Monitor active rooms and clients.

## Prerequisites

*   **PHP**: 8.2 or higher
*   **Composer**: Dependency manager for PHP
*   **Node.js**: 18.x or higher
*   **NPM**: Package manager for Node.js
*   **SQLite** (or another database supported by Laravel)

## Setup Instructions

### 1. Backend (Laravel)

The backend serves the API and the React frontend.

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Install PHP dependencies:
    ```bash
    composer install
    ```
3.  Install Node.js dependencies:
    ```bash
    npm install
    ```
4.  Configure the environment:
    ```bash
    cp .env.example .env
    ```
    *   Update `DB_CONNECTION` if needed (defaults to SQLite).
    *   Set `INTERNAL_API_SECRET` to a secure random string (must match the one in `mediasoup-server`).
5.  Generate the application key:
    ```bash
    php artisan key:generate
    ```
6.  Run database migrations and seeders:
    ```bash
    php artisan migrate --seed
    ```
    *   This creates default roles (`admin`, `client`) and a test user.
7.  Start the development server:
    ```bash
    php artisan serve
    ```
8.  In a separate terminal, start the frontend asset watcher:
    ```bash
    npm run dev
    ```

### 2. Media Server (Mediasoup)

The media server handles the heavy lifting of media routing.

1.  Navigate to the mediasoup-server directory:
    ```bash
    cd mediasoup-server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
    *   *Note: This may require build tools (like `python`, `make`, `g++`) for compiling Mediasoup.*
3.  Configure the environment:
    ```bash
    cp .env.example .env
    ```
    *   Set `ANNOUNCED_IP` to your machine's public IP or local network IP (not `127.0.0.1` if testing from other devices).
    *   Set `INTERNAL_API_SECRET` to match the backend's secret.
    *   Set `LARAVEL_API_URL` to point to your backend (e.g., `http://127.0.0.1:8000/api`).
4.  Build the project:
    ```bash
    npm run build
    ```
5.  Start the server:
    ```bash
    npm start
    ```
    *   Or for development: `npm run dev`

## Usage

1.  Open your browser and navigate to the backend URL (e.g., `http://127.0.0.1:8000`).
2.  Login with the seeded credentials (check `DatabaseSeeder.php` or create a new user).
3.  Create a room or join an existing one.
4.  The frontend will connect to the Mediasoup server for media transmission.

## Documentation

The codebase is fully documented.
*   **PHP**: PHPDoc blocks are available on all classes and methods.
*   **TypeScript**: JSDoc/TSDoc comments are available on all exported functions and classes.

## License

[MIT](https://opensource.org/licenses/MIT)
