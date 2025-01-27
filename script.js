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
    let currentFontSize = 100;
    let isDarkMode = false;

    async function loadBook(file) {
        try {
            viewer.innerHTML = '<div class="loading">Loading book...</div>';

            // Read the file as ArrayBuffer
            const arrayBuffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error('Error reading file'));
                reader.readAsArrayBuffer(file);
            });

            // Clean up previous instances
            if (book) {
                book.destroy();
            }

            // Create new book instance
            book = ePub(arrayBuffer);
            
            // Wait for book to be ready
            await book.ready;

            // Clear the viewer
            viewer.innerHTML = '';

            // Create rendition
            rendition = book.renderTo(viewer, {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'scrolled-doc'
            });

            // Set initial theme
            rendition.themes.register('light', {
                body: {
                    color: '#000000',
                    background: '#ffffff'
                }
            });

            rendition.themes.register('dark', {
                body: {
                    color: '#ffffff',
                    background: '#1a1a1a'
                }
            });

            rendition.themes.select(isDarkMode ? 'dark' : 'light');
            rendition.themes.fontSize(`${currentFontSize}%`);

            // Display first page
            await rendition.display();

            // Setup navigation
            book.loaded.navigation.then(nav => {
                if (nav.toc) {
                    console.log('TOC available:', nav.toc);
                    displayTOC(nav.toc);
                }
            });

            return true;
        } catch (error) {
            console.error('Error loading book:', error);
            throw error;
        }
    }

    function displayTOC(toc) {
        const tocContainer = document.getElementById('toc-container') || createTOCContainer();
        tocContainer.innerHTML = '<h3>Table of Contents</h3>';
        const list = document.createElement('ul');
        toc.forEach(chapter => {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.textContent = chapter.label;
            link.href = '#';
            link.onclick = (e) => {
                e.preventDefault();
                rendition.display(chapter.href);
                tocContainer.classList.remove('active');
            };
            item.appendChild(link);
            list.appendChild(item);
        });
        tocContainer.appendChild(list);
    }

    function createTOCContainer() {
        const container = document.createElement('div');
        container.id = 'toc-container';
        document.body.appendChild(container);
        return container;
    }

    // Theme toggle
    themeToggle.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        if (rendition) {
            rendition.themes.select(isDarkMode ? 'dark' : 'light');
        }
    });

    // Font size controls
    decreaseFontButton.addEventListener('click', () => {
        if (currentFontSize > 50 && rendition) {
            currentFontSize -= 10;
            rendition.themes.fontSize(`${currentFontSize}%`);
        }
    });

    increaseFontButton.addEventListener('click', () => {
        if (currentFontSize < 200 && rendition) {
            currentFontSize += 10;
            rendition.themes.fontSize(`${currentFontSize}%`);
        }
    });

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

    // TOC toggle
    tocToggle.addEventListener('click', () => {
        const tocContainer = document.getElementById('toc-container');
        if (tocContainer) {
            tocContainer.classList.toggle('active');
        }
    });

    // File input handler
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            console.error('No file selected');
            return;
        }

        try {
            await loadBook(file);
        } catch (error) {
            console.error('Final error:', error);
            viewer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    });
}); 