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
            console.log('Starting to save book:', file.name);
            const arrayBuffer = await file.arrayBuffer();
            const id = await this.generateBookId(arrayBuffer);
            console.log('Generated book ID:', id);
            
            const fileType = file.type === 'application/pdf' ? 'pdf' : 'epub';
            let metadata = {};
            let coverUrl = null;

            // Create a copy of the ArrayBuffer for processing
            const processingBuffer = arrayBuffer.slice(0);

            if (fileType === 'epub') {
                const tempBook = ePub(processingBuffer);
                await tempBook.ready;
                metadata = await tempBook.loaded.metadata;
                
                try {
                    const coverBuffer = await this.extractCoverBuffer(tempBook);
                    if (coverBuffer) {
                        const base64 = await this.arrayBufferToBase64(coverBuffer);
                        coverUrl = `data:image/jpeg;base64,${base64}`;
                    }
                } catch (e) {
                    console.log('Error extracting cover:', e);
                }

                if (tempBook.destroy) {
                    tempBook.destroy();
                }
            } else {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(processingBuffer)).promise;
                const metadataObj = await pdf.getMetadata();
                metadata = {
                    title: metadataObj.info?.Title || file.name.replace(/\.pdf$/, ''),
                    creator: metadataObj.info?.Author || 'Unknown Author'
                };

                try {
                    const page = await pdf.getPage(1);
                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    await page.render({
                        canvasContext: canvas.getContext('2d'),
                        viewport: viewport
                    }).promise;
                    coverUrl = canvas.toDataURL();
                } catch (e) {
                    console.log('Error generating PDF thumbnail:', e);
                }
            }

            // Store the original ArrayBuffer as Uint8Array
            const uint8Array = new Uint8Array(arrayBuffer);
            const book = {
                id,
                title: metadata.title || file.name.replace(/\.(epub|pdf)$/, ''),
                author: Array.isArray(metadata.creator) 
                    ? metadata.creator.join(', ')
                    : metadata.creator || 'Unknown Author',
                coverUrl,
                data: Array.from(uint8Array), // Store as regular array
                fileType,
                lastRead: new Date().toISOString(),
                progress: 0,
                currentLocation: null,
                addedDate: new Date().toISOString()
            };

            await this.put(book);
            console.log('Successfully saved book with ID:', id);
            
            // Verify the save by immediately retrieving
            const savedBook = await this.get(id);
            console.log('Verification - Retrieved saved book:', savedBook ? 'Success' : 'Failed');
            
            return id;
        } catch (error) {
            console.error('Detailed error in saveBook:', error);
            console.error('Stack trace:', error.stack);
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

    async getBookData(book) {
        if (Array.isArray(book.data)) {
            // Convert array back to ArrayBuffer
            return new Uint8Array(book.data).buffer;
        }
        return book.data;
    }

    async get(id) {
        return new Promise((resolve, reject) => {
            console.log('Attempting to get book with ID:', id);
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            
            request.onsuccess = async () => {
                const book = request.result;
                console.log('Database lookup result:', book ? 'Book found' : 'Book not found');
                if (book) {
                    console.log('Book data type:', book.fileType);
                    try {
                        book.data = await this.getBookData(book);
                        console.log('Successfully converted book data');
                    } catch (e) {
                        console.error('Error converting book data:', e);
                        reject(e);
                        return;
                    }
                }
                resolve(book);
            };
            
            request.onerror = (event) => {
                console.error('Error in database lookup:', event.target.error);
                reject(request.error);
            };
        });
    }

    async getAllBooks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const books = request.result;
                // Note: We don't convert Blobs to ArrayBuffers here since we don't need the data
                // in the library view
                resolve(books);
            };
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