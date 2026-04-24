const fs = require('fs');
const path = require('path');

/**
 * Tiny JSON-on-disk cache. One file per cache instance, atomic-ish writes.
 * Designed for single-process use (`node server.js`). For serverless/multi-instance,
 * swap the implementation behind the same `get` / `set` / `read` / `write` surface.
 */
class FileCache {
    constructor(filePath) {
        this.filePath = filePath;
        this._memory = null;
    }

    _ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    read() {
        if (this._memory) return this._memory;
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            this._memory = JSON.parse(raw);
        } catch (_e) {
            this._memory = {};
        }
        return this._memory;
    }

    write(data) {
        this._ensureDir();
        this._memory = data;
        const tmp = this.filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, this.filePath);
    }

    get(key) {
        const store = this.read();
        const entry = store[key];
        if (!entry) return null;
        if (entry.expiresAt && Date.now() > entry.expiresAt) return null;
        return entry.value;
    }

    set(key, value, ttlMs) {
        const store = this.read();
        store[key] = {
            value,
            expiresAt: ttlMs ? Date.now() + ttlMs : null,
            updatedAt: Date.now()
        };
        this.write(store);
    }

    delete(key) {
        const store = this.read();
        if (key in store) {
            delete store[key];
            this.write(store);
        }
    }
}

module.exports = { FileCache };
