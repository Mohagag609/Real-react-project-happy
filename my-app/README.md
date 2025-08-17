# MyApp - Desktop Version

This project wraps your existing web application within Electron and provides a simple backend using Express and SQLite for data persistence, replacing `LocalStorage`.

## Build & Run Instructions

### Development
To run the application in a development environment:

1.  **Install dependencies:**
    ```sh
    npm install
    ```

2.  **Start the application:**
    ```sh
    npm run start
    ```

### If ABI error for better-sqlite3
If you encounter an ABI (Application Binary Interface) mismatch error for `better-sqlite3`, it means the pre-compiled binary is not compatible with your environment. You need to rebuild it from source:

```sh
npm run rebuild
```

**Prerequisites for rebuilding:**
*   **Windows:** You must have Python 3 and Visual Studio 2022 Build Tools installed (specifically the "Desktop development with C++" workload and the Windows SDK).
*   **macOS:** You must have Xcode Command Line Tools installed.
*   **Linux:** You must have `python3`, `make`, and a C++ compiler like `g++` installed.

### Build Windows x64
To package the application into a distributable format for Windows (x64):

```sh
npm run build
```

The output will be located in the `dist/` directory.

---

## Database Information

### Where DB is stored
The application database (`app.db`) is stored in the user's local application data directory. This ensures that user data is persisted securely and is not lost when the application is updated.

-   **Windows:** `%APPDATA%\MyApp\app.db`
    (e.g., `C:\Users\YourUser\AppData\Roaming\MyApp\app.db`)
-   **macOS:** `~/Library/Application Support/MyApp/app.db`
-   **Linux:** `~/.config/MyApp/app.db`

### How to change DB path later
If you need to store the database in a custom location, you can edit the `dbPath` line in `main.js`:

```javascript
// In main.js, find this line:
const dbPath = path.join(app.getPath('userData'), 'app.db');

// Change it to your desired path, for example:
const dbPath = path.join(app.getPath('documents'), 'my-special-app-data', 'app.db');
```
