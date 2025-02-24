let readingStartTime = null;

function updateReadingTime() {
    const storedTime = parseInt(localStorage.getItem('totalReadingTime') || '0');
    const hours = Math.floor(storedTime / 60);
    const minutes = storedTime % 60;
    
    document.getElementById('reading-time').textContent = 
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function startReadingSession() {
    readingStartTime = new Date();
}

function endReadingSession() {
    if (readingStartTime) {
        const endTime = new Date();
        const duration = Math.floor((endTime - readingStartTime) / (1000 * 60)); // Duration in minutes
        const storedTime = parseInt(localStorage.getItem('totalReadingTime') || '0');
        localStorage.setItem('totalReadingTime', storedTime + duration);
        readingStartTime = null;
        updateReadingTime();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const storage = new BookStorage();
    const fileInput = document.getElementById('file-input');
    const searchInput = document.getElementById('search-input');
    const booksContainer = document.getElementById('books-container');

    await storage.init();
    await loadBooks();
    updateStats();

    // Add theme toggle functionality
    const themeToggle = document.getElementById('theme-toggle');
    let isDarkMode = localStorage.getItem('darkMode') === 'true';

    // Apply initial theme
    if (isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.querySelector('i').classList.replace('fa-moon', 'fa-sun');
    }

    themeToggle.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        themeToggle.querySelector('i').classList.replace(
            isDarkMode ? 'fa-moon' : 'fa-sun',
            isDarkMode ? 'fa-sun' : 'fa-moon'
        );
        localStorage.setItem('darkMode', isDarkMode);
    });

    async function loadBooks(searchTerm = '') {
        const books = await storage.getAllBooks();
        const currentlyReadingContainer = document.getElementById('currently-reading-container');
        const allBooksContainer = document.getElementById('all-books-container');
        currentlyReadingContainer.innerHTML = '';
        allBooksContainer.innerHTML = '';
    
        const filteredBooks = searchTerm 
            ? books.filter(book => book.title.toLowerCase().includes(searchTerm.toLowerCase()))
            : books;
    
        filteredBooks.sort((a, b) => new Date(b.lastRead) - new Date(a.lastRead));
    
        filteredBooks.forEach(book => {
            if (book.progress > 0 && book.progress < 100) {
                const cardForCurrentlyReading = createBookCard(book, true);
                currentlyReadingContainer.appendChild(cardForCurrentlyReading);
            }
        });
    
        filteredBooks.forEach(book => {
            const cardForAllBooks = createBookCard(book, false);
            allBooksContainer.appendChild(cardForAllBooks);
        });
    
        updateStats();

        // After loading books, initialize scroll buttons
        initializeScrollButtons();
    }
    
    function createBookCard(book, isCurrentlyReading = false) {
        const card = document.createElement('div');
        card.className = 'book-card';
        
        if (isCurrentlyReading) {
            // Currently reading card with progress and continue button
            const progressPercent = Math.round(book.progress || 0);
            const circumference = 2 * Math.PI * 20;
            const offset = circumference - (progressPercent / 100) * circumference;
            
            card.innerHTML = `
                <div class="book-cover">
                    ${book.coverUrl 
                        ? `<img src="${book.coverUrl}" alt="Cover of ${book.title}" />`
                        : `<i class="fas fa-book"></i>`
                    }
                </div>
                <div class="book-info">
                    <div>
                        <h3 class="book-title">${book.title}</h3>
                        <p class="book-author">${book.author || 'Unknown Author'}</p>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div class="progress-circle">
                            <svg viewBox="0 0 50 50">
                                <circle class="bg" cx="25" cy="25" r="20" />
                                <circle class="progress" cx="25" cy="25" r="20"
                                    stroke-dasharray="${circumference}"
                                    stroke-dashoffset="${offset}" />
                            </svg>
                            <div class="progress-text">${progressPercent}%</div>
                        </div>
                        <a href="reader.html?id=${book.id}" class="continue-button">
                            <i class="fas fa-book-reader"></i>
                            Continue
                        </a>
                    </div>
                </div>
            `;
        } else {
            // Simple card for all books section
            card.innerHTML = `
                <a href="reader.html?id=${book.id}" class="book-card-link">
                    <div class="book-cover">
                        ${book.coverUrl 
                            ? `<img src="${book.coverUrl}" alt="Cover of ${book.title}" />`
                            : `<i class="fas fa-book"></i>`
                        }
                        ${book.progress > 0 ? `
                            <div class="reading-status-indicator">
                                <i class="fas fa-bookmark"></i>
                            </div>
                        ` : ''}
                    </div>
                    <div class="book-info">
                        <h3 class="book-title">${book.title}</h3>
                        <p class="book-author">${book.author || 'Unknown Author'}</p>
                    </div>
                </a>
            `;
        }

        return card;
    }

    async function updateStats() {
        const books = await storage.getAllBooks();
        document.getElementById('total-books').textContent = books.length;
        document.getElementById('reading-books').textContent = 
            books.filter(book => book.progress > 0 && book.progress < 100).length;
        document.getElementById('completed-books').textContent = 
            books.filter(book => book.progress === 100).length;
    }

    // Add this toast notification system
    function createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    function showToast(message, type = 'info', duration = 3000) {
        const container = document.querySelector('.toast-container') || createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'check-circle' : 
                     type === 'error' ? 'exclamation-circle' : 
                     'info-circle';
        
        toast.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <div class="toast-content">
                <p class="toast-message">${message}</p>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.style.animation = 'slideIn 0.3s ease forwards';
        });
        
        // Remove toast after duration
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                container.removeChild(toast);
                if (container.children.length === 0) {
                    document.body.removeChild(container);
                }
            }, 300);
        }, duration);
        
        return toast;
    }

    // Update the file input handler to use the new toast system
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const loadingToast = showToast('Adding book...', 'info', 0);
        
        try {
            await storage.saveBook(file);
            await loadBooks();
            updateStats();
            fileInput.value = ''; // Reset file input
            
            // Remove loading toast and show success
            loadingToast.remove();
            showToast('Book added successfully!', 'success');
        } catch (error) {
            console.error('Error saving book:', error);
            // Remove loading toast and show error
            loadingToast.remove();
            showToast(`Failed to add book: ${error.message}`, 'error', 5000);
        }
    });

    searchInput.addEventListener('input', (e) => {
        loadBooks(e.target.value);
    });

    // Add reading time update
    updateReadingTime();

    // Add event listener for page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            endReadingSession();
        } else {
            startReadingSession();
        }
    });

    // Add after the DOMContentLoaded event listener
    function initializeScrollButtons() {
        const container = document.getElementById('currently-reading-container');
        const leftButton = document.querySelector('.scroll-button.left');
        const rightButton = document.querySelector('.scroll-button.right');

        function updateScrollButtons() {
            // Show/hide left button based on scroll position
            leftButton.classList.toggle('hidden', container.scrollLeft <= 0);
            
            // Show/hide right button based on whether there's more content to scroll
            const maxScroll = container.scrollWidth - container.clientWidth;
            rightButton.classList.toggle('hidden', container.scrollLeft >= maxScroll);
        }

        // Initial button state
        updateScrollButtons();

        // Scroll on button click
        leftButton.addEventListener('click', () => {
            container.scrollBy({ left: -320, behavior: 'smooth' });
        });

        rightButton.addEventListener('click', () => {
            container.scrollBy({ left: 320, behavior: 'smooth' });
        });

        // Update buttons when scrolling
        container.addEventListener('scroll', updateScrollButtons);

        // Update buttons when window resizes
        window.addEventListener('resize', updateScrollButtons);
    }
}); 