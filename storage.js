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
            console.log('Metadata:', metadata);
            
            // Get cover
            let coverUrl = null;
            try {
                // Try to get cover as blob URL
                const coverBuffer = await this.extractCoverBuffer(tempBook);
                if (coverBuffer) {
                    // Convert array buffer to base64
                    const base64 = await this.arrayBufferToBase64(coverBuffer);
                    coverUrl = `data:image/jpeg;base64,${base64}`;
                }
            } catch (e) {
                console.log('Error extracting cover:', e);
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

            console.log('Saving book:', book);
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

    async extractCoverBuffer(book) {
        try {
            // Try to get cover from standard location
            const cover = await book.resources.get('cover');
            if (cover) {
                return await cover.getData();
            }

            // Try to get from manifest
            const coverHref = book.packaging.coverPath;
            if (coverHref) {
                const coverResource = await book.resources.get(coverHref);
                if (coverResource) {
                    return await coverResource.getData();
                }
            }

            // Try spine items
            const spine = book.spine();
            for (let item of spine.items) {
                if (item.href.match(/\.(jpg|jpeg|png|gif)$/i)) {
                    const resource = await book.resources.get(item.href);
                    if (resource) {
                        return await resource.getData();
                    }
                }
            }
            return null;
        } catch (error) {
            console.error('Error extracting cover:', error);
            return null;
        }
    }

    async arrayBufferToBase64(buffer) {
        const blob = new Blob([buffer]);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
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