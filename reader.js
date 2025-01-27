class EpubReader {
    constructor() {
        this.storage = new BookStorage();
        this.book = null;
        this.rendition = null;
        this.currentFontSize = 100;
        this.isDarkMode = false;
        
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
                throw new Error('No book ID provided');
            }

            const bookData = await this.storage.get(bookId);
            if (!bookData) {
                throw new Error('Book not found');
            }

            await this.loadBook(bookData);
            this.bindEvents();
        } catch (error) {
            console.error('Error initializing reader:', error);
            this.viewer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    async loadBook(bookData) {
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
        this.prevButton.addEventListener('click', () => {
            if (this.rendition) this.rendition.prev();
        });

        this.nextButton.addEventListener('click', () => {
            if (this.rendition) this.rendition.next();
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
            if (this.rendition) {
                this.rendition.themes.select(this.isDarkMode ? 'dark' : 'light');
            }
        });

        this.tocToggle.addEventListener('click', () => {
            const tocContainer = document.getElementById('toc-container');
            if (tocContainer) {
                tocContainer.classList.toggle('active');
            }
        });

        document.addEventListener('keyup', (event) => {
            if (!this.rendition) return;
            if (event.key === 'ArrowLeft') this.rendition.prev();
            if (event.key === 'ArrowRight') this.rendition.next();
        });
    }
}

// Initialize reader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const reader = new EpubReader();
    reader.init();
}); 