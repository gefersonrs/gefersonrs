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
            const card = createBookCard(book);
            if (book.progress > 0 && book.progress < 100) {
                currentlyReadingContainer.appendChild(card);
            }
            allBooksContainer.appendChild(card);
        });
    }

    function createBookCard(book) {
        const card = document.createElement('div');
        card.className = 'book-card';
        
        const progressPercent = Math.round(book.progress || 0);
        const lastReadDate = new Date(book.lastRead).toLocaleDateString();

        card.innerHTML = `
            <div class="book-cover">
                ${book.coverUrl 
                    ? `<img src="${book.coverUrl}" alt="Cover of ${book.title}" />`
                    : `<i class="fas fa-book fa-3x"></i>`
                }
                ${progressPercent > 0 ? `
                    <div class="progress-indicator">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                        <span>${progressPercent}%</span>
                    </div>
                ` : ''}
            </div>
            <div class="book-info">
                <h3 class="book-title">${book.title}</h3>
                <p class="book-author">${book.author}</p>
                <p class="book-meta">Last read: ${lastReadDate}</p>
                <div class="book-actions">
                    <button class="action-button read-button" title="Read">
                        <i class="fas fa-book-reader"></i>
                    </button>
                    <button class="action-button delete-button" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        card.querySelector('.read-button').addEventListener('click', async () => {
            window.location.href = `reader.html?id=${book.id}`;
            if (book.progress === 0) {
                book.progress = 1; // Mark as started
                await storage.updateProgress(book.id, book.progress, book.currentLocation);
                await loadBooks(); // Refresh the book list
            }
        });

        card.querySelector('.delete-button').addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this book?')) {
                await storage.delete(book.id);
                await loadBooks();
                updateStats();
            }
        });

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

    // Event Listeners
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const loadingToast = alert('Adding book...'); // You might want to replace this with a better UI feedback
            await storage.saveBook(file);
            await loadBooks();
            updateStats();
            fileInput.value = ''; // Reset file input
        } catch (error) {
            console.error('Error saving book:', error);
            alert(`Failed to add book: ${error.message}`);
        }
    });

    searchInput.addEventListener('input', (e) => {
        loadBooks(e.target.value);
    });
}); 