class BookStorage {
    constructor() {
        this.dbName = 'epubReader';
        this.dbVersion = 1;
        this.storeName = 'books';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('lastRead', 'lastRead', { unique: false });
                }
            };
        });
    }

    async saveBook(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const id = await this.generateBookId(arrayBuffer);
            
            // Create temporary book to extract metadata
            const tempBook = ePub(arrayBuffer);
            await tempBook.ready;
            
            // Extract metadata
            const metadata = await tempBook.loaded.metadata;
            console.log('Metadata:', metadata); // For debugging
            
            // Get cover
            let coverUrl = null;
            try {
                coverUrl = await tempBook.coverUrl();
            } catch (e) {
                console.log('No cover found in standard location');
            }

            // If no cover found, try to find first image
            if (!coverUrl) {
                try {
                    const spine = tempBook.spine();
                    for (let item of spine.items) {
                        if (item.href.match(/\.(jpg|jpeg|png|gif)$/i)) {
                            coverUrl = await tempBook.archive.createUrl(item.href, { base64: true });
                            break;
                        }
                    }
                } catch (e) {
                    console.log('No images found in spine');
                }
            }

            const book = {
                id,
                title: metadata.title || file.name.replace(/\.epub$/, ''),
                author: Array.isArray(metadata.creator) 
                    ? metadata.creator.join(', ')
                    : metadata.creator || 'Unknown Author',
                coverUrl,
                data: arrayBuffer,
                lastRead: new Date().toISOString(),
                progress: 0,
                currentLocation: null,
                addedDate: new Date().toISOString()
            };

            console.log('Saving book:', book); // For debugging
            await this.put(book);
            
            if (tempBook.destroy) {
                tempBook.destroy();
            }
            
            return id;
        } catch (error) {
            console.error('Error in saveBook:', error);
            throw error;
        }
    }

    async extractCover(book) {
        try {
            // Try standard cover method
            const cover = await book.coverUrl();
            if (cover) return cover;

            // Try to get from archive
            const coverHref = book.packaging.coverPath;
            if (coverHref) {
                return await book.archive.createUrl(coverHref, { base64: true });
            }

            // Try spine items
            const spine = book.spine();
            for (let item of spine.items) {
                if (item.href.match(/\.(jpg|jpeg|png|gif)$/i)) {
                    return await book.archive.createUrl(item.href, { base64: true });
                }
            }
            return null;
        } catch (error) {
            console.error('Error extracting cover:', error);
            return null;
        }
    }

    async updateProgress(id, progress, currentLocation) {
        const book = await this.get(id);
        if (!book) throw new Error('Book not found');

        book.progress = progress;
        book.currentLocation = currentLocation;
        book.lastRead = new Date().toISOString();
        
        await this.put(book);
    }

    async get(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllBooks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(book) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(book);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async generateBookId(arrayBuffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
} 