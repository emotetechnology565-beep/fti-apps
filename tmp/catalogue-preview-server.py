import argparse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8081)
port = parser.parse_args().port
dist = Path(__file__).resolve().parents[1] / 'artifacts' / 'catalogue-preview'
class SPAHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path)).is_file() and '.' not in self.path.rsplit('/',1)[-1]:
            self.path='/index.html'
        super().do_GET()

print(f'FTI preview: http://localhost:{port}', flush=True)
ThreadingHTTPServer.allow_reuse_address = True
ThreadingHTTPServer(('127.0.0.1',port),partial(SPAHandler,directory=str(dist))).serve_forever()
