class EpubReader {
    constructor() {
        this.storage = new BookStorage();
        this.book = null;
        this.rendition = null;
        this.currentFontSize = 100;
        this.isDarkMode = false;
        this.currentPdfPage = 1;
        this.totalPdfPages = 0;
        this.pdfDoc = null;
        
        // DOM elements
        this.viewer = document.getElementById('viewer');
        this.bookTitle = document.getElementById('book-title');
        this.progressText = document.getElementById('progress-text');
        this.progressFill = document.querySelector('.progress-fill');
        
        // Controls
        this.prevButton = document.getElementById('prev-page');
        this.nextButton = document.getElementById('next-page');
        this.decreaseFontButton = document.getElementById('decrease-font');
        this.increaseFontButton = document.getElementById('increase-font');
        this.themeToggle = document.getElementById('theme-toggle');
        this.tocToggle = document.getElementById('toc-toggle');
    }

    async init() {
        try {
            await this.storage.init();
            const bookId = new URLSearchParams(window.location.search).get('id');
            if (!bookId) {
                throw new Error('No book ID provided in URL');
            }
            console.log('Attempting to load book with ID:', bookId);

            const bookData = await this.storage.get(bookId);
            console.log('Retrieved book data:', bookData ? 'Found' : 'Not found');
            
            if (!bookData) {
                throw new Error('Book not found in storage');
            }

            await this.loadBook(bookData);
            this.bindEvents();
        } catch (error) {
            console.error('Detailed error in reader initialization:', error);
            console.error('Stack trace:', error.stack);
            this.viewer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    async loadBook(bookData) {
        try {
            this.bookTitle.textContent = bookData.title;
            
            if (bookData.fileType === 'pdf') {
                await this.loadPdf(bookData);
            } else {
                await this.loadEpub(bookData);
            }
        } catch (error) {
            console.error('Error loading book:', error);
            throw error;
        }
    }

    async loadPdf(bookData) {
        try {
            this.pdfDoc = await pdfjsLib.getDocument(bookData.data).promise;
            this.totalPdfPages = this.pdfDoc.numPages;
            
            // Create PDF viewer container
            this.viewer.innerHTML = `
                <div id="pdf-container" class="${this.isDarkMode ? 'dark-mode' : ''}">
                    <canvas id="pdf-canvas"></canvas>
                </div>
            `;
            
            // Load last viewed page or first page
            this.currentPdfPage = bookData.currentLocation || 1;
            await this.renderPdfPage(this.currentPdfPage);

            // Update progress
            this.updatePdfProgress();
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw error;
        }
    }

    async renderPdfPage(pageNumber) {
        try {
            const page = await this.pdfDoc.getPage(pageNumber);
            const canvas = document.getElementById('pdf-canvas');
            const context = canvas.getContext('2d');

            // Calculate scale to fit width
            const viewport = page.getViewport({ scale: 1 });
            const containerWidth = this.viewer.clientWidth;
            const scale = containerWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;

            // Save progress
            this.storage.updateProgress(
                new URLSearchParams(window.location.search).get('id'),
                (pageNumber / this.totalPdfPages) * 100,
                pageNumber
            ).catch(console.error);
        } catch (error) {
            console.error('Error rendering PDF page:', error);
        }
    }

    updatePdfProgress() {
        const progress = Math.floor((this.currentPdfPage / this.totalPdfPages) * 100);
        this.progressText.textContent = `${progress}%`;
        this.progressFill.style.width = `${progress}%`;
    }

    async loadEpub(bookData) {
        try {
            this.bookTitle.textContent = bookData.title;
            
            // Create book
            this.book = ePub();
            await this.book.open(bookData.data);

            // Create rendition
            this.rendition = this.book.renderTo(this.viewer, {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'scrolled-doc'
            });

            // Set up themes
            this.rendition.themes.register('light', {
                body: { color: '#000000', background: '#ffffff' }
            });
            this.rendition.themes.register('dark', {
                body: { color: '#ffffff', background: '#1a1a1a' }
            });

            // Apply initial theme and font size
            this.rendition.themes.select(this.isDarkMode ? 'dark' : 'light');
            this.rendition.themes.fontSize(`${this.currentFontSize}%`);

            // Load TOC
            const navigation = await this.book.loaded.navigation;
            if (navigation.toc) {
                this.displayTOC(navigation.toc);
            }

            // Set up progress tracking
            await this.book.locations.generate();
            
            // Display from last location or start
            if (bookData.currentLocation) {
                await this.rendition.display(bookData.currentLocation);
            } else {
                await this.rendition.display();
            }

            // Track progress
            this.rendition.on('relocated', (location) => {
                const progress = Math.floor((location.start.percentage || 0) * 100);
                this.progressText.textContent = `${progress}%`;
                this.progressFill.style.width = `${progress}%`;
                
                // Save progress
                this.storage.updateProgress(
                    bookData.id,
                    progress,
                    location.start.cfi
                ).catch(console.error);
            });

        } catch (error) {
            console.error('Error loading book:', error);
            throw error;
        }
    }

    displayTOC(toc) {
        const tocContainer = document.getElementById('toc-container') || this.createTOCContainer();
        tocContainer.innerHTML = '<h3>Table of Contents</h3>';
        const list = document.createElement('ul');
        
        const createTOCItem = (chapter) => {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.textContent = chapter.label;
            link.href = '#';
            link.onclick = (e) => {
                e.preventDefault();
                this.rendition.display(chapter.href);
                tocContainer.classList.remove('active');
            };
            item.appendChild(link);

            if (chapter.subitems && chapter.subitems.length > 0) {
                const subList = document.createElement('ul');
                chapter.subitems.forEach(subChapter => {
                    subList.appendChild(createTOCItem(subChapter));
                });
                item.appendChild(subList);
            }

            return item;
        };

        toc.forEach(chapter => {
            list.appendChild(createTOCItem(chapter));
        });
        
        tocContainer.appendChild(list);
    }

    createTOCContainer() {
        const container = document.createElement('div');
        container.id = 'toc-container';
        document.body.appendChild(container);
        return container;
    }

    bindEvents() {
        this.prevButton.addEventListener('click', async () => {
            if (this.pdfDoc && this.currentPdfPage > 1) {
                this.currentPdfPage--;
                await this.renderPdfPage(this.currentPdfPage);
                this.updatePdfProgress();
            } else if (this.rendition) {
                this.rendition.prev();
            }
        });

        this.nextButton.addEventListener('click', async () => {
            if (this.pdfDoc && this.currentPdfPage < this.totalPdfPages) {
                this.currentPdfPage++;
                await this.renderPdfPage(this.currentPdfPage);
                this.updatePdfProgress();
            } else if (this.rendition) {
                this.rendition.next();
            }
        });

        this.decreaseFontButton.addEventListener('click', () => {
            if (this.currentFontSize > 50 && this.rendition) {
                this.currentFontSize -= 10;
                this.rendition.themes.fontSize(`${this.currentFontSize}%`);
            }
        });

        this.increaseFontButton.addEventListener('click', () => {
            if (this.currentFontSize < 200 && this.rendition) {
                this.currentFontSize += 10;
                this.rendition.themes.fontSize(`${this.currentFontSize}%`);
            }
        });

        this.themeToggle.addEventListener('click', () => {
            this.isDarkMode = !this.isDarkMode;
            document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
            
            // Handle theme for both EPUB and PDF
            if (this.rendition) {
                this.rendition.themes.select(this.isDarkMode ? 'dark' : 'light');
            }
            const pdfContainer = document.getElementById('pdf-container');
            if (pdfContainer) {
                pdfContainer.classList.toggle('dark-mode', this.isDarkMode);
            }
        });

        this.tocToggle.addEventListener('click', () => {
            const tocContainer = document.getElementById('toc-container');
            if (tocContainer) {
                tocContainer.classList.toggle('active');
            }
        });

        document.addEventListener('keyup', async (event) => {
            if (this.pdfDoc) {
                if (event.key === 'ArrowLeft' && this.currentPdfPage > 1) {
                    this.currentPdfPage--;
                    await this.renderPdfPage(this.currentPdfPage);
                    this.updatePdfProgress();
                }
                if (event.key === 'ArrowRight' && this.currentPdfPage < this.totalPdfPages) {
                    this.currentPdfPage++;
                    await this.renderPdfPage(this.currentPdfPage);
                    this.updatePdfProgress();
                }
            } else if (this.rendition) {
                if (event.key === 'ArrowLeft') this.rendition.prev();
                if (event.key === 'ArrowRight') this.rendition.next();
            }
        });
    }
}

// Initialize reader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const reader = new EpubReader();
    reader.init();
}); 