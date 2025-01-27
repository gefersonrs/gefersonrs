document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const viewer = document.getElementById('viewer');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const decreaseFontButton = document.getElementById('decrease-font');
    const increaseFontButton = document.getElementById('increase-font');
    const themeToggle = document.getElementById('theme-toggle');
    const tocToggle = document.getElementById('toc-toggle');
    
    let book = null;
    let rendition = null;
    let currentBlobUrl = null;
    let currentFontSize = 100; // percentage
    let isDarkMode = false;

    // Add TOC toggle functionality
    tocToggle.addEventListener('click', () => {
        const tocContainer = document.getElementById('toc-container');
        if (tocContainer) {
            tocContainer.classList.toggle('active');
        }
    });

    // Theme toggle functionality
    themeToggle.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        if (rendition) {
            rendition.themes.default({
                body: {
                    color: isDarkMode ? '#ffffff' : '#000000',
                    background: isDarkMode ? '#1a1a1a' : '#ffffff'
                }
            });
        }
    });

    // Font size controls
    decreaseFontButton.addEventListener('click', () => {
        if (currentFontSize > 50 && rendition) {
            currentFontSize -= 10;
            updateFontSize();
        }
    });

    increaseFontButton.addEventListener('click', () => {
        if (currentFontSize < 200 && rendition) {
            currentFontSize += 10;
            updateFontSize();
        }
    });

    function updateFontSize() {
        rendition.themes.default({
            body: {
                'font-size': `${currentFontSize}% !important`
            }
        });
    }

    // Navigation controls
    prevButton.addEventListener('click', () => {
        if (rendition) {
            rendition.prev();
        }
    });

    nextButton.addEventListener('click', () => {
        if (rendition) {
            rendition.next();
        }
    });

    async function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const buffer = event.target.result;
                console.log('File read successfully, size:', buffer.byteLength);
                resolve(buffer);
            };
            
            reader.onerror = (event) => {
                console.error('FileReader error:', reader.error);
                reject(reader.error || new Error('Failed to read file'));
            };
            
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const progress = Math.round((event.loaded / event.total) * 100);
                    console.log(`Reading progress: ${progress}%`);
                }
            };

            try {
                reader.readAsArrayBuffer(file);
            } catch (error) {
                console.error('Error starting file read:', error);
                reject(error);
            }
        });
    }

    async function loadBook(file) {
        try {
            console.log('Starting to load file:', {
                name: file.name,
                size: file.size,
                type: file.type
            });

            // Clean up previous instances
            if (book) {
                book.destroy();
            }
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
            }

            // Create blob URL directly
            currentBlobUrl = URL.createObjectURL(file);
            console.log('Created blob URL:', currentBlobUrl);

            // Initialize book with options
            book = ePub(currentBlobUrl, {
                openAs: 'epub',
                encoding: 'binary'
            });

            // Add error handler before loading
            book.on('error', error => {
                console.error('Book error:', error);
                throw new Error(`Book error: ${error.message}`);
            });

            console.log('Waiting for book to be ready...');
            await book.ready;

            // Get book metadata
            const metadata = await book.loaded.metadata;
            console.log('Book metadata:', metadata);

            // Clear loading message
            viewer.innerHTML = '';

            // Create rendition
            rendition = book.renderTo('viewer', {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'scrolled-doc', // Changed from 'paginated' to 'scrolled-doc'
                manager: 'continuous' // Added continuous scrolling
            });

            // Set initial theme
            rendition.themes.default({
                body: {
                    color: isDarkMode ? '#ffffff' : '#000000',
                    background: isDarkMode ? '#1a1a1a' : '#ffffff',
                    'font-size': `${currentFontSize}% !important`,
                    padding: '20px'
                }
            });

            // Add rendition event handlers
            rendition.on('rendered', (section, iframeView) => {
                console.log('Rendered section:', section);
                updateNavigationState();
            });

            rendition.on('relocated', (location) => {
                console.log('Current location:', location);
                updateNavigationState();
            });

            // Load and display TOC after rendition is created
            const navigation = await book.loaded.navigation;
            if (navigation && navigation.toc) {
                console.log('Table of Contents:', navigation.toc);
                displayTOC(navigation);
            }

            // Display first page
            console.log('Displaying first page...');
            await rendition.display();

            console.log('Book loaded successfully');
            setupKeyboardNavigation();

            return true;
        } catch (error) {
            console.error('Error in loadBook:', error);
            throw error;
        }
    }

    function displayTOC(toc) {
        // Create TOC container if it doesn't exist
        let tocContainer = document.getElementById('toc-container');
        if (!tocContainer) {
            tocContainer = document.createElement('div');
            tocContainer.id = 'toc-container';
            viewer.parentNode.insertBefore(tocContainer, viewer);
        }

        tocContainer.innerHTML = '<h3>Table of Contents</h3>';
        const tocList = document.createElement('ul');
        tocContainer.appendChild(tocList);

        function addTocItems(items, parent) {
            items.forEach(item => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.textContent = item.label;
                a.href = '#';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (rendition) {
                        rendition.display(item.href);
                    }
                });
                li.appendChild(a);

                if (item.subitems && item.subitems.length > 0) {
                    const subList = document.createElement('ul');
                    addTocItems(item.subitems, subList);
                    li.appendChild(subList);
                }

                parent.appendChild(li);
            });
        }

        addTocItems(toc.toc, tocList);
    }

    function updateNavigationState() {
        if (!book || !rendition) return;

        const currentLocation = rendition.currentLocation();
        prevButton.disabled = !rendition.prev;
        nextButton.disabled = !rendition.next;
    }

    function setupKeyboardNavigation() {
        const keyListener = (event) => {
            if (event.key === 'ArrowLeft') {
                rendition.prev();
            }
            if (event.key === 'ArrowRight') {
                rendition.next();
            }
        };

        document.removeEventListener('keyup', keyListener);
        document.addEventListener('keyup', keyListener);
    }

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            console.error('No file selected');
            return;
        }

        // Clear previous content and show loading
        viewer.innerHTML = '<div class="loading">Loading book...</div>';

        try {
            await loadBook(file);
        } catch (error) {
            console.error('Final error:', error);
            viewer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
            alert(`Error loading the EPUB file: ${error.message}`);
            
            // Clean up on error
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
                currentBlobUrl = null;
            }
            if (book) {
                book.destroy();
                book = null;
            }
            if (rendition) {
                rendition = null;
            }
        }
    });
}); 