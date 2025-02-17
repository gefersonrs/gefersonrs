class EpubReader {
    constructor() {
        this.storage = new BookStorage();
        this.book = null;
        this.rendition = null;
        this.currentFontSize = parseInt(localStorage.getItem('fontSize')) || 100;
        this.currentViewMode = localStorage.getItem('viewMode') || 'scrolled';
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.currentPdfPage = 1;
        this.totalPdfPages = 0;
        this.pdfDoc = null;
        this.currentChapter = null;
        
        // DOM elements
        this.viewer = document.getElementById('viewer');
        this.bookTitle = document.getElementById('book-title');
        this.progressText = document.getElementById('progress-text');
        this.progressFill = document.querySelector('.progress-fill');
        this.settingsPanel = document.getElementById('settings-panel');
        this.fontSizeDisplay = document.getElementById('font-size-display');
        
        // Controls
        this.prevButton = document.getElementById('prev-page');
        this.nextButton = document.getElementById('next-page');
        this.decreaseFontButton = document.getElementById('decrease-font');
        this.increaseFontButton = document.getElementById('increase-font');
        this.themeToggle = document.getElementById('theme-toggle');
        this.tocToggle = document.getElementById('toc-toggle');
        this.settingsToggle = document.getElementById('settings-toggle');
        this.viewModeButtons = document.querySelectorAll('.mode-button');

        // Apply initial theme and view mode
        if (this.isDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.themeToggle.querySelector('i').classList.replace('fa-moon', 'fa-sun');
        }
        
        this.fontSizeDisplay.textContent = `${this.currentFontSize}%`;
        this.applyViewMode(this.currentViewMode);
    }

    applyViewMode(mode) {
        this.currentViewMode = mode;
        localStorage.setItem('viewMode', mode);

        // Update buttons
        this.viewModeButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.mode === mode);
        });

        // Clear existing classes
        this.viewer.classList.remove('scrolled-mode', 'paged-mode', 'double-page-mode');

        if (this.rendition) {
            switch (mode) {
                case 'scrolled':
                    this.viewer.classList.add('scrolled-mode');
                    this.rendition.flow('scrolled-doc');
                    break;
                case 'single':
                    this.viewer.classList.add('paged-mode');
                    this.rendition.flow('paginated');
                    break;
                case 'double':
                    this.viewer.classList.add('double-page-mode');
                    this.rendition.flow('paginated');
                    this.rendition.spread('auto');
                    break;
            }
            this.rendition.resize();
        }
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
                    <div id="pdf-pages-container"></div>
                </div>
            `;

            // Hide view mode options for PDF
            const viewModeSection = document.querySelector('.settings-section:has(.view-mode-controls)');
            if (viewModeSection) {
                viewModeSection.style.display = 'none';
            }

            // Load all pages
            await this.renderAllPdfPages();

            // Update progress
            this.updatePdfProgress();

            // Extract and display TOC
            const outline = await this.pdfDoc.getOutline();
            if (outline) {
                await this.displayPdfTOC(outline);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw error;
        }
    }

    async renderAllPdfPages() {
        const pagesContainer = document.getElementById('pdf-pages-container');
        const containerWidth = this.viewer.clientWidth;
        
        // Clear existing pages
        pagesContainer.innerHTML = '';
        
        for (let pageNum = 1; pageNum <= this.totalPdfPages; pageNum++) {
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            const canvas = document.createElement('canvas');
            canvas.id = `pdf-page-${pageNum}`;
            pageContainer.appendChild(canvas);
            pagesContainer.appendChild(pageContainer);

            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1 });
            // Calculate scale based on container width and current font size
            const baseScale = (containerWidth * 0.8) / viewport.width;
            const finalScale = baseScale * (this.currentFontSize / 100);
            const scaledViewport = page.getViewport({ scale: finalScale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            await page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: scaledViewport
            }).promise;
        }

        // Add intersection observer to track current page
        this.observePdfPages();
    }

    observePdfPages() {
        const options = {
            root: this.viewer,
            threshold: 0.5 // 50% visibility
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.querySelector('canvas').id.split('-')[2]);
                    this.currentPdfPage = pageNum;
                    this.updatePdfProgress();
                    this.updateTOCHighlight();
                }
            });
        }, options);

        document.querySelectorAll('.pdf-page-container').forEach(page => {
            observer.observe(page);
        });
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
                flow: this.currentViewMode === 'scrolled' ? 'scrolled-doc' : 'paginated',
                spread: this.currentViewMode === 'double' ? 'auto' : 'none'
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

            // Track progress and current chapter
            this.rendition.on('relocated', (location) => {
                // Calculate progress
                let progress = Math.floor((location.start.percentage || 0) * 100);
                if (location.start.percentage > 0.995) {
                    progress = 100;
                }
                
                this.progressText.textContent = `${progress}%`;
                this.progressFill.style.width = `${progress}%`;
                
                // Update current chapter
                this.updateCurrentChapter(location);
                
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

    async updateCurrentChapter(location) {
        const chapter = await this.book.spine.get(location.start.cfi);
        if (chapter) {
            const tocItem = this.findTocItemByHref(chapter.href);
            if (tocItem) {
                this.currentChapter = tocItem;
                this.updateTOCHighlight();
                // Update chapter display in the header
                const chapterTitle = document.createElement('span');
                chapterTitle.className = 'current-chapter-title';
                chapterTitle.textContent = `${tocItem.label}`;
                this.bookTitle.innerHTML = `${this.book.package.metadata.title} - ${chapterTitle.outerHTML}`;
            }
        }
    }

    findTocItemByHref(href) {
        const searchToc = (items) => {
            for (let item of items) {
                if (item.href === href) return item;
                if (item.subitems) {
                    const found = searchToc(item.subitems);
                    if (found) return found;
                }
            }
            return null;
        };
        return searchToc(this.book.navigation.toc);
    }

    async displayPdfTOC(outline) {
        const tocContainer = document.getElementById('toc-container') || this.createTOCContainer();
        tocContainer.innerHTML = '<h3>Table of Contents</h3>';
        const list = document.createElement('ul');
        
        const createTOCItem = (item) => {
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.textContent = item.title;
            link.href = '#';
            link.dataset.pageNumber = ''; // Will be set when destination is resolved
            
            link.onclick = async (e) => {
                e.preventDefault();
                try {
                    let pageNumber = null;
                    
                    if (item.dest) {
                        // Try to get destination from name
                        try {
                            const dest = await this.pdfDoc.getDestination(item.dest);
                            if (dest) {
                                pageNumber = await this.pdfDoc.getPageIndex(dest[0]) + 1;
                            }
                        } catch (error) {
                            console.log('Could not resolve named destination:', error);
                        }
                    }
                    
                    // If named destination failed, try explicit destination
                    if (!pageNumber && item.dest) {
                        try {
                            if (Array.isArray(item.dest)) {
                                pageNumber = await this.pdfDoc.getPageIndex(item.dest[0]) + 1;
                            }
                        } catch (error) {
                            console.log('Could not resolve explicit destination:', error);
                        }
                    }
                    
                    // Try page reference as fallback
                    if (!pageNumber && item.ref) {
                        try {
                            pageNumber = await this.pdfDoc.getPageIndex(item.ref) + 1;
                        } catch (error) {
                            console.log('Could not resolve page reference:', error);
                        }
                    }
                    
                    if (pageNumber) {
                        this.currentPdfPage = pageNumber;
                        await this.renderPdfPage(pageNumber);
                        this.updatePdfProgress();
                        this.updateTOCHighlight();
                        tocContainer.classList.remove('active');
                    } else {
                        console.warn('Could not resolve destination for:', item.title);
                    }
                } catch (error) {
                    console.error('Error navigating to destination:', error);
                }
            };
            
            listItem.appendChild(link);

            if (item.items && item.items.length > 0) {
                const subList = document.createElement('ul');
                item.items.forEach(subItem => {
                    subList.appendChild(createTOCItem(subItem));
                });
                listItem.appendChild(subList);
            }

            // Store the page number in the link's dataset when it's resolved
            if (item.dest) {
                this.resolveDestination(item.dest).then(pageNumber => {
                    if (pageNumber) {
                        link.dataset.pageNumber = pageNumber;
                    }
                }).catch(error => {
                    console.log('Error resolving destination:', error);
                });
            }

            return listItem;
        };

        outline.forEach(item => {
            list.appendChild(createTOCItem(item));
        });
        
        tocContainer.appendChild(list);
        this.updateTOCHighlight();
    }

    // Add this new method to resolve destinations
    async resolveDestination(dest) {
        try {
            if (typeof dest === 'string') {
                const destination = await this.pdfDoc.getDestination(dest);
                if (destination) {
                    return await this.pdfDoc.getPageIndex(destination[0]) + 1;
                }
            } else if (Array.isArray(dest)) {
                return await this.pdfDoc.getPageIndex(dest[0]) + 1;
            }
        } catch (error) {
            console.log('Error resolving destination:', error);
        }
        return null;
    }

    // Add this new method to highlight current chapter
    updateTOCHighlight() {
        const tocContainer = document.getElementById('toc-container');
        if (!tocContainer) return;

        // Remove previous highlight
        const allLinks = tocContainer.getElementsByTagName('a');
        for (let link of allLinks) {
            link.classList.remove('current-chapter');
        }

        // Find and highlight current chapter
        let currentChapter = null;
        let smallestDiff = Infinity;

        for (let link of allLinks) {
            const pageNumber = parseInt(link.dataset.pageNumber);
            if (!isNaN(pageNumber)) {
                const diff = Math.abs(pageNumber - this.currentPdfPage);
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    currentChapter = link;
                }
            }
        }

        if (currentChapter) {
            currentChapter.classList.add('current-chapter');
            // Scroll the chapter into view if TOC is visible
            if (tocContainer.classList.contains('active')) {
                currentChapter.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
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

        this.decreaseFontButton.addEventListener('click', async () => {
            if (this.currentFontSize > 50) {
                this.currentFontSize -= 10;
                this.fontSizeDisplay.textContent = `${this.currentFontSize}%`;
                localStorage.setItem('fontSize', this.currentFontSize);
                
                if (this.rendition) {
                    this.rendition.themes.fontSize(`${this.currentFontSize}%`);
                } else if (this.pdfDoc) {
                    await this.renderAllPdfPages();
                }
            }
        });

        this.increaseFontButton.addEventListener('click', async () => {
            if (this.currentFontSize < 200) {
                this.currentFontSize += 10;
                this.fontSizeDisplay.textContent = `${this.currentFontSize}%`;
                localStorage.setItem('fontSize', this.currentFontSize);
                
                if (this.rendition) {
                    this.rendition.themes.fontSize(`${this.currentFontSize}%`);
                } else if (this.pdfDoc) {
                    await this.renderAllPdfPages();
                }
            }
        });

        this.themeToggle.addEventListener('click', () => {
            this.isDarkMode = !this.isDarkMode;
            document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
            localStorage.setItem('darkMode', this.isDarkMode);
            this.themeToggle.querySelector('i').classList.replace(
                this.isDarkMode ? 'fa-moon' : 'fa-sun',
                this.isDarkMode ? 'fa-sun' : 'fa-moon'
            );
            
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

        // Add settings panel toggle
        this.settingsToggle.addEventListener('click', () => {
            this.settingsPanel.classList.toggle('active');
        });

        // Add view mode controls
        this.viewModeButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.applyViewMode(button.dataset.mode);
            });
        });

        // Close settings panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.settingsPanel.contains(e.target) && 
                !this.settingsToggle.contains(e.target)) {
                this.settingsPanel.classList.remove('active');
            }
        });
    }

    updatePdfScale() {
        const scaler = document.getElementById('pdf-scaler');
        if (scaler) {
            const scale = this.currentFontSize / 100;
            scaler.style.transform = `scale(${scale})`;
            scaler.style.transformOrigin = 'top left';
        }
    }
}

// Initialize reader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const reader = new EpubReader();
    reader.init();
});