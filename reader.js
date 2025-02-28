class EpubReader {
    constructor() {
        this.storage = new BookStorage();
        this.book = null;
        this.rendition = null;
        this.currentFontSize = parseInt(localStorage.getItem('fontSize')) || 100;
        this.currentViewMode = localStorage.getItem('viewMode') || 'scrolled';
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
        this.tocToggle = document.getElementById('toc-toggle');
        this.settingsToggle = document.getElementById('settings-toggle');
        this.viewModeButtons = document.querySelectorAll('.mode-button');

        // Update theme initialization
        this.currentTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        
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

    async loadEpub(bookData) {
        try {
            // Show loading overlay
            const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading EPUB...</div>
            `;
            document.body.appendChild(loadingOverlay);

            this.bookTitle.textContent = bookData.title;
            
            // Create book with optimized settings
            this.book = ePub({
                encoding: 'binary',
                replacements: 'blobUrl',
                openAs: 'epub'
            });
            await this.book.open(bookData.data);

            // Create rendition with optimized settings
            this.rendition = this.book.renderTo(this.viewer, {
                width: '100%',
                height: '100%',
                flow: this.currentViewMode === 'scrolled' ? 'scrolled-doc' : 'paginated',
                spread: this.currentViewMode === 'double' ? 'auto' : 'none',
                minSpreadWidth: 800,
                manager: 'continuous'
            });

            // Set up themes for EPUB content
            this.rendition.themes.register('light', {
                body: { 
                    color: '#333333', 
                    background: '#ffffff' 
                }
            });
            
            this.rendition.themes.register('sepia', {
                body: { 
                    color: '#5c4b37',
                    background: '#f4ecd8'
                }
            });

            this.rendition.themes.register('cream', {
                body: { 
                    color: '#4a4a4a',
                    background: '#fff9f0'
                }
            });

            this.rendition.themes.register('night', {
                body: { 
                    color: '#e1e1e1',
                    background: '#1a1a2e'
                }
            });

            this.rendition.themes.register('dark', {
                body: { 
                    color: '#ffffff',
                    background: '#1a1a1a'
                }
            });

            this.rendition.themes.register('sage', {
                body: { 
                    color: '#2c3a2c',
                    background: '#f0f4f0'
                }
            });

            // Apply initial theme
            this.rendition.themes.select(this.currentTheme);
            this.rendition.themes.fontSize(`${this.currentFontSize}%`);

            // Initialize progress from stored value
            if (bookData.progress) {
                console.log(`Setting initial EPUB progress: ${bookData.progress}%`);
                this.progressText.textContent = `${bookData.progress}%`;
                this.progressFill.style.width = `${bookData.progress}%`;
            }

            // Load TOC in parallel with initial display
            const tocPromise = this.book.loaded.navigation.then(navigation => {
                if (navigation.toc) {
                    this.displayTOC(navigation.toc);
                }
            });

            // Store current progress before display
            const storedProgress = bookData.progress || 0;

            // Generate locations in the background after initial display
            const displayPromise = bookData.currentLocation 
                ? this.rendition.display(bookData.currentLocation)
                : this.rendition.display();

            // Wait for initial display before removing loading overlay
            await displayPromise;
            
            // Check if progress was changed during display
            console.log(`EPUB progress after display: ${this.progressText.textContent}`);
            
            // Ensure progress value wasn't reset during display
            if (storedProgress > 0 && parseInt(this.progressText.textContent) === 0) {
                console.log(`Restoring progress after display to: ${storedProgress}%`);
                this.progressText.textContent = `${storedProgress}%`;
                this.progressFill.style.width = `${storedProgress}%`;
            }
            
            loadingOverlay.remove();

            // Continue with background tasks
            Promise.all([
                tocPromise,
                this.book.locations.generate(1000) // Reduced number of locations for faster loading
            ]).catch(console.error);

            // Track progress and current chapter
            this.rendition.on('relocated', (location) => {
                // Calculate progress
                let progress = Math.floor((location.start.percentage || 0) * 100);
                if (location.start.percentage > 0.995) progress = 100;
                
                // Get current progress value
                const currentProgress = parseInt(this.progressText.textContent) || 0;
                
                // Only update progress if it's higher than the current value
                // This prevents the progress from being reset to a lower value when opening a book
                if (progress >= currentProgress) {
                    console.log(`Updating progress from ${currentProgress}% to ${progress}%`);
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
                } else {
                    console.log(`Not updating progress: current=${currentProgress}%, new=${progress}%`);
                }
            });

        } catch (error) {
            console.error('Error loading book:', error);
            throw error;
        }
    }

    async loadPdf(bookData) {
        try {
            // Show loading overlay
            const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading PDF...</div>
            `;
            document.body.appendChild(loadingOverlay);

            // Load PDF document with optimized settings
            const loadingTask = pdfjsLib.getDocument({
                data: bookData.data,
                cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
                cMapPacked: true,
                enableXfa: false,
                disableFontFace: false
            });

            this.pdfDoc = await loadingTask.promise;
            this.totalPdfPages = this.pdfDoc.numPages;
            
            // Create PDF viewer container with current theme
            this.viewer.innerHTML = `
                <div id="pdf-container" class="${this.currentTheme === 'dark' || this.currentTheme === 'night' ? 'dark-mode' : ''}">
                    <div id="pdf-pages-container"></div>
                </div>
            `;

            // Initialize containers and settings
            if (!document.getElementById('toc-container')) {
                this.createTOCContainer();
            }
            this.settingsPanel = document.getElementById('settings-panel');
            
            // Hide view mode options for PDF
            const viewModeSection = document.querySelector('.settings-section:has(.view-mode-controls)');
            if (viewModeSection) {
                viewModeSection.style.display = 'none';
            }

            // Initialize progress from stored value
            if (bookData.progress) {
                console.log(`Setting initial PDF progress: ${bookData.progress}%`);
                this.progressText.textContent = `${bookData.progress}%`;
                this.progressFill.style.width = `${bookData.progress}%`;
                // For PDFs, also set the current page if available
                if (bookData.currentLocation) {
                    this.currentPdfPage = bookData.currentLocation;
                    console.log(`Setting current PDF page: ${this.currentPdfPage}`);
                }
            }

            // Store current progress before loading pages
            const storedProgress = bookData.progress || 0;
            
            try {
                // Load first few pages initially
                const initialPagesToLoad = Math.min(3, this.totalPdfPages);
                const loadingPromises = [];

                for (let i = 1; i <= initialPagesToLoad; i++) {
                    loadingPromises.push(this.renderPdfPage(i));
                }

                // Wait for initial pages to load
                await Promise.all(loadingPromises);
                
                // Check if progress was changed during rendering
                console.log(`PDF progress after initial render: ${this.progressText.textContent}`);
                
                // Ensure progress value wasn't reset during page loading
                if (storedProgress > 0 && parseInt(this.progressText.textContent) === 0) {
                    console.log(`Restoring PDF progress after render to: ${storedProgress}%`);
                    this.progressText.textContent = `${storedProgress}%`;
                    this.progressFill.style.width = `${storedProgress}%`;
                }

                // Remove loading overlay after initial pages are loaded
                loadingOverlay.remove();

                // Load remaining pages in the background
                if (this.totalPdfPages > initialPagesToLoad) {
                    this.loadRemainingPages(initialPagesToLoad + 1);
                }

                // Load TOC in parallel
                const outline = await this.pdfDoc.getOutline();
                if (outline) {
                    await this.displayPdfTOC(outline);
                }

                // Hide navigation controls
                const navControls = document.querySelector('.navigation-controls');
                if (navControls) {
                    navControls.style.display = 'none';
                }

                // Set up page tracking
                this.observePdfPages();

            } catch (error) {
                console.error('Error rendering PDF:', error);
                loadingOverlay.remove();
                throw error;
            }

        } catch (error) {
            console.error('Error loading PDF:', error);
            throw error;
        }
    }

    // Add method to load remaining PDF pages
    async loadRemainingPages(startPage) {
        const loadNextBatch = async (currentPage) => {
            if (currentPage > this.totalPdfPages) return;

            const batchSize = 3;
            const endPage = Math.min(currentPage + batchSize - 1, this.totalPdfPages);
            const promises = [];

            for (let i = currentPage; i <= endPage; i++) {
                promises.push(this.renderPdfPage(i));
            }

            await Promise.all(promises);

            // Load next batch with a small delay to prevent UI blocking
            if (endPage < this.totalPdfPages) {
                setTimeout(() => loadNextBatch(endPage + 1), 100);
            }
        };

        loadNextBatch(startPage);
    }

    // Add this method to render individual PDF pages
    async renderPdfPage(pageNum) {
        const pagesContainer = document.getElementById('pdf-pages-container');
        const containerWidth = this.viewer.clientWidth;
        
        // Create page container if it doesn't exist
        let pageContainer = document.getElementById(`pdf-page-container-${pageNum}`);
        if (!pageContainer) {
            pageContainer = document.createElement('div');
            pageContainer.id = `pdf-page-container-${pageNum}`;
            pageContainer.className = 'pdf-page-container';
            const canvas = document.createElement('canvas');
            canvas.id = `pdf-page-${pageNum}`;
            pageContainer.appendChild(canvas);
            pagesContainer.appendChild(pageContainer);
        }

        const canvas = pageContainer.querySelector('canvas');
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
        
        const createTOCItem = (item) => {
            const link = document.createElement('a');
            link.textContent = item.title;
            link.href = '#';
            link.onclick = async (e) => {
                e.preventDefault();
                if (item.dest) {
                    const destination = await this.pdfDoc.getDestination(item.dest);
                    if (destination) {
                        const pageNumber = await this.pdfDoc.getPageIndex(destination[0]) + 1;
                        await this.renderPdfPage(pageNumber);
                        this.currentPdfPage = pageNumber;
                        this.updatePdfProgress();
                    }
                } else if (item.pageNumber) {
                    await this.renderPdfPage(item.pageNumber);
                    this.currentPdfPage = item.pageNumber;
                    this.updatePdfProgress();
                }
                tocContainer.classList.remove('active');
            };
            return link;
        };

        const buildTOCList = (items) => {
            const ul = document.createElement('ul');
            items.forEach(item => {
                const li = document.createElement('li');
                li.appendChild(createTOCItem(item));
                if (item.items && item.items.length > 0) {
                    li.appendChild(buildTOCList(item.items));
                }
                ul.appendChild(li);
            });
            return ul;
        };

        if (outline && outline.length > 0) {
            tocContainer.appendChild(buildTOCList(outline));
        } else {
            tocContainer.innerHTML += '<p>No table of contents available</p>';
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
        this.tocContainer = container;
        return container;
    }

    bindEvents() {
        // Navigation buttons
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

        // Font size controls
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

        // Settings toggle
        this.settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.settingsPanel.classList.toggle('active');
            
            // Close TOC when opening settings
            const tocContainer = document.getElementById('toc-container');
            if (tocContainer) {
                tocContainer.classList.remove('active');
            }
        });

        // Theme options
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            // Mark the current theme as active
            if (option.dataset.theme === this.currentTheme) {
                option.classList.add('active');
            }

            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                
                // Update active state
                themeOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                // Apply theme
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
                this.currentTheme = theme;
                
                // Update reader specific elements
                if (this.rendition) {
                    this.rendition.themes.select(theme);
                }
                
                const pdfContainer = document.getElementById('pdf-container');
                if (pdfContainer) {
                    pdfContainer.classList.toggle('dark-mode', theme === 'dark' || theme === 'night');
                    this.renderAllPdfPages();
                }

                // Don't close the settings panel when changing theme
                e.stopPropagation();
            });
        });

        // TOC toggle
        this.tocToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('TOC toggle clicked'); // Debug log
            const tocContainer = document.getElementById('toc-container');
            if (tocContainer) {
                tocContainer.classList.toggle('active');
                // Close settings panel when opening TOC
                this.settingsPanel.classList.remove('active');
            }
        });

        // Keyboard navigation
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

        // View mode controls
        this.viewModeButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.applyViewMode(button.dataset.mode);
            });
        });

        // Close panels when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.settingsPanel.contains(e.target) && 
                !this.settingsToggle.contains(e.target)) {
                this.settingsPanel.classList.remove('active');
            }

            const tocContainer = document.getElementById('toc-container');
            if (tocContainer && 
                !tocContainer.contains(e.target) && 
                !this.tocToggle.contains(e.target)) {
                tocContainer.classList.remove('active');
            }
        });

        // Prevent clicks inside panels from closing them
        this.settingsPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        if (this.tocContainer) {
            this.tocContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    updatePdfScale() {
        const scaler = document.getElementById('pdf-scaler');
        if (scaler) {
            const scale = this.currentFontSize / 100;
            scaler.style.transform = `scale(${scale})`;
            scaler.style.transformOrigin = 'top left';
        }
    }

    // Add this method to properly track PDF progress
    async updatePdfProgress() {
        if (!this.pdfDoc) return;
        
        const progress = Math.floor((this.currentPdfPage / this.totalPdfPages) * 100);
        console.log(`PDF progress calculated in updatePdfProgress: ${progress}%`);
        this.progressText.textContent = `${progress}%`;
        this.progressFill.style.width = `${progress}%`;

        // Save progress
        const urlParams = new URLSearchParams(window.location.search);
        const bookId = urlParams.get('id');
        if (bookId) {
            await this.storage.updateProgress(bookId, progress, this.currentPdfPage);
            console.log(`PDF progress saved for book ${bookId}: ${progress}%`);
        }
    }

    // Also add back the intersection observer to track current page
    observePdfPages() {
        const options = {
            root: this.viewer,
            threshold: 0.5 // 50% visibility
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.querySelector('canvas').id.split('-')[2]);
                    
                    // Only update progress if the page actually changed
                    // This prevents resetting progress on initial load
                    if (this.currentPdfPage !== pageNum) {
                        console.log(`Observed page change from ${this.currentPdfPage} to ${pageNum}`);
                        this.currentPdfPage = pageNum;
                        this.updatePdfProgress();
                        this.updateTOCHighlight();
                    } else {
                        console.log(`Observed current page: ${pageNum} (no change)`);
                    }
                }
            });
        }, options);

        document.querySelectorAll('.pdf-page-container').forEach(page => {
            observer.observe(page);
        });
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
}

// Initialize reader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const reader = new EpubReader();
    reader.init();
});