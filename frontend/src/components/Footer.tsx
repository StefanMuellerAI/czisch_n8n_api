"use client";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-12">
      <div className="max-w-7xl mx-auto px-6 py-4 text-center text-sm text-[var(--text-secondary)]">
        API Documentation:{" "}
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline"
        >
          Swagger UI
        </a>
        {" • "}
        <a
          href="http://localhost:8000/redoc"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline"
        >
          ReDoc
        </a>
      </div>
    </footer>
  );
}

