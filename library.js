document.addEventListener('DOMContentLoaded', async () => {
    const storage = new BookStorage();
    const fileInput = document.getElementById('file-input');
    const searchInput = document.getElementById('search-input');
    const booksContainer = document.getElementById('books-container');

    await storage.init();
    await loadBooks();
    updateStats();

    async function loadBooks(searchTerm = '') {
        const books = await storage.getAllBooks();
        booksContainer.innerHTML = '';

        const filteredBooks = searchTerm 
            ? books.filter(book => book.title.toLowerCase().includes(searchTerm.toLowerCase()))
            : books;

        filteredBooks.sort((a, b) => new Date(b.lastRead) - new Date(a.lastRead));

        filteredBooks.forEach(book => {
            const card = createBookCard(book);
            booksContainer.appendChild(card);
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
        card.querySelector('.read-button').addEventListener('click', () => {
            window.location.href = `reader.html?id=${book.id}`;
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