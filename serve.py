"""Minimal zero-dependency static file server for local development.
Usage: python serve.py [port]   (default 5173)
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, format, *args):
        pass  # keep terminal output clean

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

if __name__ == "__main__":
    server_cls = getattr(http.server, "ThreadingHTTPServer", http.server.HTTPServer)
    server_cls.allow_reuse_address = True
    server = server_cls(("127.0.0.1", PORT), Handler)
    print(f"BARAHA running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
