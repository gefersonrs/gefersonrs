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
                },
                a: {
                    color: '#80ccff',  // Light blue color for links in night mode
                    'text-decoration': 'underline'
                }
            });

            this.rendition.themes.register('dark', {
                body: { 
                    color: '#ffffff',
                    background: '#1a1a1a'
                },
                a: {
                    color: '#80ccff',  // Light blue color for links in dark mode
                    'text-decoration': 'underline'
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
                
                // Store whether this is a user-initiated navigation (like clicking a TOC item)
                const isDirectNavigation = this.isDirectNavigation || false;
                // Reset the flag
                this.isDirectNavigation = false;
                
                // Get current progress value
                const currentProgress = parseInt(this.progressText.textContent) || 0;
                
                // Always update progress for direct navigation or when progress increases
                if (isDirectNavigation || progress >= currentProgress) {
                    console.log(`Updating progress from ${currentProgress}% to ${progress}%${isDirectNavigation ? ' (direct navigation)' : ''}`);
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
            console.log(`PDF loaded with ${this.totalPdfPages} pages`);
            
            // Create PDF viewer container with current theme
            this.viewer.innerHTML = `
                <div id="pdf-container" class="${this.currentTheme === 'dark' || this.currentTheme === 'night' ? 'dark-mode' : ''}">
                    <div id="pdf-pages-container"></div>
                </div>
            `;
            
            // Mark the viewer as PDF mode for CSS targeting
            this.viewer.classList.add('pdf-mode');

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

            // Store the current book
            this.currentBook = bookData.id;
            this.currentFormat = 'pdf';

            // Initialize progress and current page from stored value
            let storedPage = 1;
            
            if (bookData.progress) {
                console.log(`Found stored progress: ${bookData.progress}%`);
                
                // For PDFs, use the stored page number if available
                if (bookData.currentLocation && typeof bookData.currentLocation === 'number') {
                    storedPage = Math.min(this.totalPdfPages, Math.max(1, bookData.currentLocation));
                    console.log(`Using stored page number: ${storedPage}`);
                } 
                // Otherwise calculate from percentage
                else {
                    storedPage = Math.max(1, Math.min(this.totalPdfPages, 
                        Math.round(bookData.progress * this.totalPdfPages / 100)));
                    console.log(`Calculated page from percentage: ${storedPage}`);
                }
                
                this.currentPdfPage = storedPage;
                
                // Immediately update the progress display
                const progressPercentage = this.totalPdfPages > 1 
                    ? ((storedPage - 1) / (this.totalPdfPages - 1)) * 100 
                    : 100;
                    
                this.progressText.textContent = `${storedPage} / ${this.totalPdfPages}`;
                this.progressFill.style.width = `${progressPercentage}%`;
                
                console.log(`Set initial PDF progress display: Page ${storedPage}/${this.totalPdfPages} (${progressPercentage.toFixed(2)}%)`);
            } else {
                console.log('No stored progress found, starting from page 1');
                this.currentPdfPage = 1;
                this.progressText.textContent = `1 / ${this.totalPdfPages}`;
                this.progressFill.style.width = '0%';
            }
            
            try {
                // Load visible pages around the current page
                const pagesToLoad = [];
                const startPage = Math.max(1, this.currentPdfPage - 1);
                const endPage = Math.min(this.totalPdfPages, this.currentPdfPage + 2);
                
                for (let i = startPage; i <= endPage; i++) {
                    pagesToLoad.push(i);
                }
                
                // Add the first page if it's not already included
                if (!pagesToLoad.includes(1)) {
                    pagesToLoad.push(1);
                }
                
                const loadingPromises = pagesToLoad.map(page => this.renderPdfPage(page));
                
                // Wait for initial pages to load
                await Promise.all(loadingPromises);
                
                // Remove loading overlay after initial pages are loaded
                loadingOverlay.remove();
                
                // Scroll to the current page
                const currentPageElement = document.getElementById(`pdf-page-container-${this.currentPdfPage}`);
                if (currentPageElement) {
                    setTimeout(() => {
                        currentPageElement.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                }

                // Load remaining pages in the background
                this.loadRemainingPages(1, pagesToLoad);

                // Load TOC in parallel
                const outline = await this.pdfDoc.getOutline();
                if (outline) {
                    await this.displayPdfTOC(outline);
                    // Update TOC highlight after it's loaded
                    if (typeof this.updateTOCHighlight === 'function') {
                        this.updateTOCHighlight();
                    }
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

    // Update the method to load remaining PDF pages
    async loadRemainingPages(startPage, excludePages = []) {
        // Create an array of page numbers to load
        const pagesToLoad = [];
        for (let i = 1; i <= this.totalPdfPages; i++) {
            if (!excludePages.includes(i)) {
                pagesToLoad.push(i);
            }
        }
        
        // Sort pages by proximity to the current page
        pagesToLoad.sort((a, b) => 
            Math.abs(a - this.currentPdfPage) - Math.abs(b - this.currentPdfPage)
        );
        
        // Load pages in batches
        const loadNextBatch = async (index) => {
            if (index >= pagesToLoad.length) return;

            const batchSize = 3;
            const endIndex = Math.min(index + batchSize, pagesToLoad.length);
            const promises = [];

            for (let i = index; i < endIndex; i++) {
                promises.push(this.renderPdfPage(pagesToLoad[i]));
            }

            await Promise.all(promises);

            // Load next batch with a delay to prevent UI blocking
            if (endIndex < pagesToLoad.length) {
                setTimeout(() => loadNextBatch(endIndex), 500);
            }
        };

        loadNextBatch(0);
    }

    // Add this method to render individual PDF pages
    async renderPdfPage(pageNum) {
        // Validate page number
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPdfPages) {
            console.error(`Invalid page number: ${pageNum}. Total pages: ${this.totalPdfPages}`);
            return null;
        }
        
        console.log(`Rendering PDF page ${pageNum}`);
        
        // Get the PDF page container or create one if needed
        const pdfPagesContainer = document.getElementById('pdf-pages-container');
        if (!pdfPagesContainer) {
            console.error('PDF pages container not found');
            return null;
        }
        
        let pageContainer = document.getElementById(`pdf-page-container-${pageNum}`);
        
        // If the container doesn't exist, create it
        if (!pageContainer) {
            console.log(`Creating new container for page ${pageNum}`);
            
            pageContainer = document.createElement('div');
            pageContainer.id = `pdf-page-container-${pageNum}`;
            pageContainer.className = 'pdf-page-container placeholder';
            pageContainer.dataset.pageNumber = pageNum;
            
            const pageLabel = document.createElement('div');
            pageLabel.className = 'pdf-page-label';
            pageLabel.textContent = `Page ${pageNum} of ${this.totalPdfPages}`;
            
            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-placeholder';
            placeholder.textContent = `Loading page ${pageNum}...`;
            
            pageContainer.appendChild(pageLabel);
            pageContainer.appendChild(placeholder);
            
            // Find the correct position to insert the new page container
            let inserted = false;
            const existingPages = pdfPagesContainer.querySelectorAll('.pdf-page-container');
            
            for (let i = 0; i < existingPages.length; i++) {
                const existingPage = existingPages[i];
                const existingPageNum = parseInt(existingPage.dataset.pageNumber);
                if (existingPageNum > pageNum) {
                    pdfPagesContainer.insertBefore(pageContainer, existingPage);
                    inserted = true;
                    break;
                }
            }
            
            if (!inserted) {
                pdfPagesContainer.appendChild(pageContainer);
            }
            
            // Add click handler to page for quick navigation
            pageContainer.addEventListener('click', (e) => {
                // Only handle clicks on the page label or border
                if (e.target === pageLabel || e.target === pageContainer || e.target === placeholder) {
                    this.currentPdfPage = pageNum;
                    this.lastDirectPageChange = Date.now(); // Mark as direct navigation
                    this.updatePdfProgress();
                    pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
        
        // If this page is already rendered (not a placeholder), return it
        if (!pageContainer.classList.contains('placeholder')) {
            console.log(`Page ${pageNum} is already rendered`);
            return pageContainer;
        }
        
        try {
            // Get the page from PDF.js
            const page = await this.pdfDoc.getPage(pageNum);
            
            // Clear the placeholder content
            pageContainer.innerHTML = '';
            
            // Create a label for the page
            const pageLabel = document.createElement('div');
            pageLabel.className = 'pdf-page-label';
            pageLabel.textContent = `Page ${pageNum} of ${this.totalPdfPages}`;
            pageContainer.appendChild(pageLabel);
            
            // Create a canvas for the PDF page
            const canvas = document.createElement('canvas');
            canvas.id = `pdf-page-${pageNum}`;
            pageContainer.appendChild(canvas);
            
            // Calculate scale based on container width and current font size
            const containerWidth = this.viewer.clientWidth;
            const viewport = page.getViewport({ scale: 1 });
            
            // Calculate scale based on container width and current font size
            const baseScale = (containerWidth * 0.8) / viewport.width;
            const finalScale = baseScale * (this.currentFontSize / 100);
            const scaledViewport = page.getViewport({ scale: finalScale });
    
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
    
            // Render the PDF page to the canvas
            await page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: scaledViewport
            }).promise;
            
            // Remove the placeholder class
            pageContainer.classList.remove('placeholder');
            
            // Make sure this page is observed for visibility
            if (this.pageObserver && !pageContainer.dataset.observed) {
                this.pageObserver.observe(pageContainer);
                pageContainer.dataset.observed = 'true';
                console.log(`Added observer for page ${pageNum}`);
            }
            
            return pageContainer;
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
            return null;
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
        
        // Process destinations more reliably
        const processDestination = async (dest) => {
            try {
                if (typeof dest === 'string') {
                    // Named destination
                    const destination = await this.pdfDoc.getDestination(dest);
                    if (destination && destination.length > 0) {
                        return await this.pdfDoc.getPageIndex(destination[0]) + 1;
                    }
                } else if (Array.isArray(dest) && dest.length > 0) {
                    // Explicit destination
                    return await this.pdfDoc.getPageIndex(dest[0]) + 1;
                }
            } catch (error) {
                console.error('Error processing destination:', error);
            }
            return null;
        };
        
        const createTOCItem = (item) => {
            const link = document.createElement('a');
            link.textContent = item.title || 'Unnamed section';
            link.href = '#';
            link.onclick = async (e) => {
                e.preventDefault();
                
                let pageNumber = null;
                
                try {
                    // Try multiple ways to get the page number
                    if (item.dest) {
                        pageNumber = await processDestination(item.dest);
                    } 
                    
                    if (!pageNumber && item.pageNumber) {
                        pageNumber = parseInt(item.pageNumber);
                    }
                    
                    if (!pageNumber && item.ref) {
                        try {
                            const num = parseInt(item.ref);
                            if (!isNaN(num)) {
                                const ref = await this.pdfDoc.getPageRef(num);
                                if (ref) {
                                    pageNumber = await this.pdfDoc.getPageIndex(ref) + 1;
                                }
                            }
                        } catch (e) {
                            console.error('Error processing page ref:', e);
                        }
                    }
                    
                    // Finally, see if we have a page from PDF.js annotations
                    if (!pageNumber && item.page) {
                        pageNumber = parseInt(item.page);
                    }
                    
                    // Now navigate to the page if we found one
                    if (pageNumber && pageNumber > 0 && pageNumber <= this.totalPdfPages) {
                        console.log(`TOC navigation to page ${pageNumber} from "${item.title}"`);
                        
                        // Highlight this TOC item before navigating
                        document.querySelectorAll('#toc-container a').forEach(a => 
                            a.classList.remove('current-chapter'));
                        link.classList.add('current-chapter');
                        
                        // Store page number for highlighting later
                        link.dataset.pageNumber = pageNumber;
                        
                        // Use the improved goToPdfPage method for navigation
                        this.goToPdfPage(pageNumber);
                    } else {
                        console.warn(`Could not determine page number for TOC item: ${item.title}`);
                    }
                } catch (error) {
                    console.error('Error navigating to TOC item:', error);
                }
                
                // Hide TOC after clicking
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
            console.log(`PDF TOC built with ${outline.length} top-level items`);
        } else {
            tocContainer.innerHTML += '<p>No table of contents available</p>';
            console.log('No PDF outline available');
        }
        
        // Add a method to update TOC highlighting
        this.updateTOCHighlight = () => {
            if (!this.pdfDoc) return;
            
            const currentPage = this.currentPdfPage;
            const links = tocContainer.querySelectorAll('a');
            
            // Remove current highlighting
            links.forEach(link => link.classList.remove('current-chapter'));
            
            // Find the best matching TOC entry
            let bestLink = null;
            let bestPageDiff = Infinity;
            
            links.forEach(link => {
                const pageNum = parseInt(link.dataset.pageNumber);
                if (!isNaN(pageNum)) {
                    // For items before current page, the diff is always positive
                    // For items after current page, we don't want to highlight them
                    if (pageNum <= currentPage) {
                        const diff = currentPage - pageNum;
                        if (diff < bestPageDiff) {
                            bestPageDiff = diff;
                            bestLink = link;
                        }
                    }
                }
            });
            
            // Highlight the best match if found
            if (bestLink) {
                bestLink.classList.add('current-chapter');
                
                // Only scroll while TOC is visible
                if (tocContainer.classList.contains('active')) {
                    bestLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        };
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
                
                // Set the flag for direct navigation
                this.isDirectNavigation = true;
                
                // Navigate to the chapter
                this.rendition.display(chapter.href);
                
                // Hide the TOC
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
        // Navigation buttons
        this.prevButton.addEventListener('click', async () => {
            if (this.pdfDoc && this.currentPdfPage > 1) {
                this.currentPdfPage--;
                // Mark this as a direct page change
                this.lastDirectPageChange = Date.now();
                await this.renderPdfPage(this.currentPdfPage);
                // Force update progress
                this.updatePdfProgress();
                // Scroll to the current page
                const pageElement = document.getElementById(`pdf-page-container-${this.currentPdfPage}`);
                if (pageElement) pageElement.scrollIntoView({ behavior: 'smooth' });
            } else if (this.rendition) {
                // Set the flag for direct navigation
                this.isDirectNavigation = true;
                this.rendition.prev();
            }
        });

        this.nextButton.addEventListener('click', async () => {
            if (this.pdfDoc && this.currentPdfPage < this.totalPdfPages) {
                this.currentPdfPage++;
                // Mark this as a direct page change
                this.lastDirectPageChange = Date.now();
                await this.renderPdfPage(this.currentPdfPage);
                // Force update progress
                this.updatePdfProgress();
                // Scroll to the current page
                const pageElement = document.getElementById(`pdf-page-container-${this.currentPdfPage}`);
                if (pageElement) pageElement.scrollIntoView({ behavior: 'smooth' });
            } else if (this.rendition) {
                // Set the flag for direct navigation
                this.isDirectNavigation = true;
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
            e.preventDefault();
            e.stopPropagation();
            
            // Create TOC container if it doesn't exist
            let tocContainer = document.getElementById('toc-container');
            if (!tocContainer) {
                tocContainer = this.createTOCContainer();
                console.log('TOC container created');
            }
            
            console.log('TOC toggle clicked, current active state:', tocContainer.classList.contains('active'));
            
            // Toggle TOC visibility
            tocContainer.classList.toggle('active');
            
            // Update TOC highlight when showing
            if (tocContainer.classList.contains('active') && typeof this.updateTOCHighlight === 'function') {
                console.log('Updating TOC highlight');
                this.updateTOCHighlight();
            }
            
            // Close settings panel when opening TOC
            this.settingsPanel.classList.remove('active');
        });

        // Keyboard navigation
        document.addEventListener('keyup', async (event) => {
            if (this.pdfDoc) {
                if (event.key === 'ArrowLeft' && this.currentPdfPage > 1) {
                    this.currentPdfPage--;
                    await this.renderPdfPage(this.currentPdfPage);
                    this.updatePdfProgress();
                    // Scroll to the current page
                    const pageElement = document.getElementById(`pdf-page-container-${this.currentPdfPage}`);
                    if (pageElement) pageElement.scrollIntoView({ behavior: 'smooth' });
                }
                if (event.key === 'ArrowRight' && this.currentPdfPage < this.totalPdfPages) {
                    this.currentPdfPage++;
                    await this.renderPdfPage(this.currentPdfPage);
                    this.updatePdfProgress();
                    // Scroll to the current page
                    const pageElement = document.getElementById(`pdf-page-container-${this.currentPdfPage}`);
                    if (pageElement) pageElement.scrollIntoView({ behavior: 'smooth' });
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
    updatePdfProgress() {
        // Validate current page
        if (isNaN(this.currentPdfPage) || this.currentPdfPage < 1) {
            this.currentPdfPage = 1;
            console.warn('Invalid current page, resetting to 1');
        } else if (this.currentPdfPage > this.totalPdfPages) {
            this.currentPdfPage = this.totalPdfPages;
            console.warn(`Current page out of range, resetting to ${this.totalPdfPages}`);
        }
        
        // Calculate progress as a percentage for storage
        const progressPercentage = this.totalPdfPages > 1 
            ? ((this.currentPdfPage - 1) / (this.totalPdfPages - 1)) * 100 
            : 100;
        
        console.log(`PDF progress: ${progressPercentage.toFixed(2)}% (Page ${this.currentPdfPage}/${this.totalPdfPages})`);
        
        // Update progress elements with page numbers for display
        const progressText = document.getElementById('progress-text');
        if (progressText) {
            progressText.textContent = `${this.currentPdfPage} / ${this.totalPdfPages}`;
        }
        
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            progressFill.style.width = `${progressPercentage}%`;
        }
        
        // Save progress to storage
        try {
            // Get the book ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const bookId = urlParams.get('id');
            
            if (bookId) {
                // Save both the percentage and the page number
                this.storage.updateProgress(
                    bookId,
                    progressPercentage,  // For compatibility with EPUB progress
                    this.currentPdfPage  // Store the actual page number
                ).then(() => {
                    console.log(`Progress saved for book ${bookId}: ${progressPercentage.toFixed(2)}% (Page ${this.currentPdfPage})`);
                }).catch(error => {
                    console.error('Error saving progress:', error);
                });
            } else {
                console.warn('No book ID found in URL, progress not saved');
            }
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }

    // Also add back the intersection observer to track current page
    observePdfPages() {
        // Remove any existing observers
        if (this.pageObserver) {
            this.pageObserver.disconnect();
            this.pageObserver = null;
        }
        
        const options = {
            root: this.viewer,
            threshold: [0.1, 0.5, 0.9], // Track multiple visibility thresholds
            rootMargin: "0px"
        };

        this.pageObserver = new IntersectionObserver((entries) => {
            // Find the most visible page
            let mostVisibleEntry = null;
            let highestVisibility = 0;
            
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > highestVisibility) {
                    highestVisibility = entry.intersectionRatio;
                    mostVisibleEntry = entry;
                }
            });
            
            // Only update if we found a visible page
            if (mostVisibleEntry) {
                const pageElement = mostVisibleEntry.target;
                const pageNum = parseInt(pageElement.dataset.pageNumber);
                
                if (!isNaN(pageNum) && pageNum > 0) {
                    console.log(`Observed page ${pageNum} with ${(highestVisibility*100).toFixed(1)}% visibility`);
                    
                    // Update only if the page changed
                    if (this.currentPdfPage !== pageNum) {
                        console.log(`Changing current page from ${this.currentPdfPage} to ${pageNum}`);
                        this.currentPdfPage = pageNum;
                        this.updatePdfProgress();
                    }
                }
            }
        }, options);

        // Observe all PDF page containers
        const pages = document.querySelectorAll('.pdf-page-container');
        pages.forEach(page => {
            this.pageObserver.observe(page);
        });
        
        console.log(`Set up observer for ${pages.length} PDF pages`);
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

    async loadPDF(pdfPath, progress) {
        console.log(`Loading PDF: ${pdfPath} with progress ${progress}`);
        try {
            // Clear current content
            document.getElementById('epub-container').style.display = 'none';
            document.getElementById('pdf-container').style.display = 'flex';
            
            const pdfPagesContainer = document.getElementById('pdf-pages-container');
            if (pdfPagesContainer) {
                pdfPagesContainer.innerHTML = '';
            }
            
            // Show loading indicator
            this.showLoading(true);
            
            // Load the PDF document
            const loadingTask = pdfjsLib.getDocument(pdfPath);
            loadingTask.onProgress = (progressData) => {
                if (progressData.total > 0) {
                    const percent = (progressData.loaded / progressData.total) * 100;
                    console.log(`PDF loading: ${percent.toFixed(2)}%`);
                }
            };
            
            this.pdfDoc = await loadingTask.promise;
            this.totalPdfPages = this.pdfDoc.numPages;
            console.log(`PDF loaded with ${this.totalPdfPages} pages`);
            
            // Set initial page to stored progress or first page
            const storedPage = progress ? Math.max(1, Math.min(this.totalPdfPages, Math.round(progress * this.totalPdfPages))) : 1;
            this.currentPdfPage = storedPage;
            console.log(`Starting at page ${this.currentPdfPage} based on progress ${progress}`);
            
            // Create page containers for the PDF
            const visibleRange = 2; // Number of pages to load before and after current page
            const initialPagePromises = [];
            
            // Create observer for page visibility
            this.setupPdfObserver();
            
            // Preload range of pages around the current page
            const startPage = Math.max(1, this.currentPdfPage - visibleRange);
            const endPage = Math.min(this.totalPdfPages, this.currentPdfPage + visibleRange);
            
            for (let i = startPage; i <= endPage; i++) {
                initialPagePromises.push(this.renderPdfPage(i));
            }
            
            // Wait for initial pages to render
            await Promise.all(initialPagePromises);
            
            // Hide loading indicator
            this.showLoading(false);
            
            // Scroll to current page
            const currentPageElement = document.getElementById(`pdf-page-container-${this.currentPdfPage}`);
            if (currentPageElement) {
                currentPageElement.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
            
            // Update TOC and progress
            this.displayPdfTOC();
            this.updatePdfProgress();
            
            // Add lazy loading for remaining pages when scrolling
            this.setupPdfLazyLoading();
            
            // Setup keyboard navigation
            this.setupPdfKeyboardNavigation();
            
            return true;
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showLoading(false);
            
            // Show error message
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.textContent = `Failed to load PDF: ${error.message}`;
            document.getElementById('pdf-pages-container').appendChild(errorElement);
            
            return false;
        }
    }
    
    setupPdfObserver() {
        // Remove existing observer if any
        if (this.pageObserver) {
            this.pageObserver.disconnect();
        }
        
        // Track the last time a page was set directly via TOC or navigation buttons
        this.lastDirectPageChange = Date.now();
        
        // Create new observer with multiple thresholds for better accuracy
        this.pageObserver = new IntersectionObserver((entries) => {
            // Only change pages via scrolling if we haven't directly navigated recently
            // This prevents observer from overriding direct navigation
            const timeSinceDirectChange = Date.now() - this.lastDirectPageChange;
            if (timeSinceDirectChange < 1500) { // Increased timeout
                console.log('Skipping observer update due to recent direct navigation');
                return; // Skip observer updates for 1.5 seconds after direct navigation
            }
            
            // Find the most visible page
            let maxVisibility = 0;
            let mostVisiblePage = null;
            
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageElement = entry.target;
                    const pageNum = parseInt(pageElement.dataset.pageNumber);
                    const visibilityRatio = entry.intersectionRatio;
                    
                    // Only log if significantly visible (reduces console spam)
                    if (visibilityRatio > 0.3) {
                        console.log(`Page ${pageNum} visibility: ${(visibilityRatio * 100).toFixed(2)}%`);
                    }
                    
                    if (visibilityRatio > maxVisibility) {
                        maxVisibility = visibilityRatio;
                        mostVisiblePage = pageNum;
                    }
                }
            });
            
            // Only update if we have a significantly visible page (>40% visible)
            // This prevents bouncing between pages when scrolling
            if (mostVisiblePage !== null && mostVisiblePage !== this.currentPdfPage && maxVisibility > 0.4) {
                console.log(`Changing current page from ${this.currentPdfPage} to ${mostVisiblePage} (visibility: ${(maxVisibility * 100).toFixed(2)}%)`);
                this.currentPdfPage = mostVisiblePage;
                this.updatePdfProgress();
                this.updateTOCHighlight();
            }
        }, {
            root: null,
            rootMargin: '0px',
            threshold: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] // More thresholds for better accuracy
        });
        
        // Observe all existing page containers
        const pageContainers = document.querySelectorAll('.pdf-page-container');
        pageContainers.forEach(container => {
            this.pageObserver.observe(container);
            container.dataset.observed = 'true';
        });
    }
    
    setupPdfLazyLoading() {
        // Create intersection observer for lazy loading pages
        const lazyLoadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const container = entry.target;
                    const pageNum = parseInt(container.dataset.pageNumber);
                    
                    // Load pages before and after
                    const pagesToLoad = [];
                    for (let i = Math.max(1, pageNum - 2); i <= Math.min(this.totalPdfPages, pageNum + 2); i++) {
                        pagesToLoad.push(i);
                    }
                    
                    // Render all needed pages
                    pagesToLoad.forEach(num => {
                        if (!document.getElementById(`pdf-page-container-${num}`)) {
                            this.renderPdfPage(num);
                        }
                    });
                    
                    // Stop observing once loaded
                    lazyLoadObserver.unobserve(container);
                }
            });
        }, {
            root: null,
            rootMargin: '500px', // Start loading when page is within 500px
            threshold: 0.1
        });
        
        // Create placeholder containers for all pages
        const pagesContainer = document.getElementById('pdf-pages-container');
        for (let i = 1; i <= this.totalPdfPages; i++) {
            // Skip pages that are already rendered
            if (document.getElementById(`pdf-page-container-${i}`)) {
                continue;
            }
            
            // Create placeholder for lazy loading
            const placeholder = document.createElement('div');
            placeholder.id = `pdf-page-container-${i}`;
            placeholder.className = 'pdf-page-container placeholder';
            placeholder.dataset.pageNumber = i;
            placeholder.style.minHeight = '500px';
            placeholder.innerHTML = `<div class="pdf-page-label">Page ${i} of ${this.totalPdfPages}</div><div class="pdf-placeholder">Loading page ${i}...</div>`;
            
            pagesContainer.appendChild(placeholder);
            
            // Observe for lazy loading
            lazyLoadObserver.observe(placeholder);
        }
    }
    
    setupPdfKeyboardNavigation() {
        // Add keyboard navigation for PDF
        document.addEventListener('keydown', (event) => {
            if (this.isReaderOpen && this.currentFormat === 'pdf') {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    this.prevPdfPage();
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    this.nextPdfPage();
                } else if (event.key === 'Home') {
                    this.goToPdfPage(1);
                } else if (event.key === 'End') {
                    this.goToPdfPage(this.totalPdfPages);
                }
            }
        });
    }

    // Navigation methods for PDF
    nextPdfPage() {
        if (this.currentPdfPage < this.totalPdfPages) {
            this.goToPdfPage(this.currentPdfPage + 1);
        }
    }
    
    prevPdfPage() {
        if (this.currentPdfPage > 1) {
            this.goToPdfPage(this.currentPdfPage - 1);
        }
    }
    
    goToPdfPage(pageNum) {
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPdfPages) {
            console.error(`Invalid page number: ${pageNum}. Total pages: ${this.totalPdfPages}`);
            return;
        }
        
        console.log(`Navigating to PDF page ${pageNum}`);
        
        // Mark this as a direct navigation and update current page
        this.lastDirectPageChange = Date.now();
        this.currentPdfPage = pageNum;
        
        // First, check if the target page container exists
        let pageContainer = document.getElementById(`pdf-page-container-${pageNum}`);
        
        if (!pageContainer) {
            // If page container doesn't exist, we need to create it and render the page
            console.log(`Page container for page ${pageNum} doesn't exist, creating new one`);
            
            const pdfPagesContainer = document.getElementById('pdf-pages-container');
            if (!pdfPagesContainer) {
                console.error('PDF pages container not found');
                return;
            }
            
            // Create placeholder for the page
            pageContainer = document.createElement('div');
            pageContainer.id = `pdf-page-container-${pageNum}`;
            pageContainer.className = 'pdf-page-container placeholder';
            pageContainer.dataset.pageNumber = pageNum;
            
            // Add placeholder content
            const pageLabel = document.createElement('div');
            pageLabel.className = 'pdf-page-label';
            pageLabel.textContent = `Page ${pageNum} of ${this.totalPdfPages}`;
            
            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-placeholder';
            placeholder.textContent = `Loading page ${pageNum}...`;
            
            pageContainer.appendChild(pageLabel);
            pageContainer.appendChild(placeholder);
            
            // Find the correct position to insert the new page container
            let inserted = false;
            const existingPages = pdfPagesContainer.querySelectorAll('.pdf-page-container');
            
            for (let i = 0; i < existingPages.length; i++) {
                const existingPage = existingPages[i];
                const existingPageNum = parseInt(existingPage.dataset.pageNumber);
                if (existingPageNum > pageNum) {
                    pdfPagesContainer.insertBefore(pageContainer, existingPage);
                    inserted = true;
                    break;
                }
            }
            
            if (!inserted) {
                pdfPagesContainer.appendChild(pageContainer);
            }
        }
        
        // Next, start rendering if needed
        if (pageContainer.classList.contains('placeholder')) {
            // Render this page
            this.renderPdfPage(pageNum).then(() => {
                // After rendering, scroll to the page
                const updatedContainer = document.getElementById(`pdf-page-container-${pageNum}`);
                if (updatedContainer) {
                    updatedContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Force update progress and TOC highlight
                    this.updatePdfProgress();
                    this.updateTOCHighlight();
                    
                    // Also render pages before and after for better experience
                    const adjacentPages = [];
                    for (let i = Math.max(1, pageNum - 1); i <= Math.min(this.totalPdfPages, pageNum + 1); i++) {
                        if (i !== pageNum) {
                            adjacentPages.push(i);
                        }
                    }
                    
                    // Render adjacent pages in the background
                    adjacentPages.forEach(p => {
                        const adjacentContainer = document.getElementById(`pdf-page-container-${p}`);
                        if (adjacentContainer && adjacentContainer.classList.contains('placeholder')) {
                            this.renderPdfPage(p);
                        }
                    });
                }
            });
        } else {
            // Page is already rendered, just scroll to it
            pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Force update progress and TOC highlight
            this.updatePdfProgress();
            this.updateTOCHighlight();
            
            // Render adjacent pages if needed
            const adjacentPages = [];
            for (let i = Math.max(1, pageNum - 1); i <= Math.min(this.totalPdfPages, pageNum + 1); i++) {
                if (i !== pageNum) {
                    adjacentPages.push(i);
                }
            }
            
            // Render adjacent pages in the background
            adjacentPages.forEach(p => {
                const adjacentContainer = document.getElementById(`pdf-page-container-${p}`);
                if (adjacentContainer && adjacentContainer.classList.contains('placeholder')) {
                    this.renderPdfPage(p);
                }
            });
        }
    }
}

// Initialize reader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const reader = new EpubReader();
    reader.init();
});