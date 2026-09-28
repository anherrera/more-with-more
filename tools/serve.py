"""Local dev server for the game: like `python3 -m http.server`, but tells the browser never to cache,
so a plain refresh always picks up edited .js files.   python3 tools/serve.py [port]"""
import functools, http.server, pathlib, sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    root = pathlib.Path(__file__).resolve().parents[1]
    handler = functools.partial(NoCache, directory=str(root))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
