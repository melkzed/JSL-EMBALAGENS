from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json


ROOT = Path(__file__).resolve().parents[1]
RESULT_PATH = ROOT / "tmp" / "pagbank-card-sandbox-result.json"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != "/__pagbank_result":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)

        try:
            data = json.loads(body.decode("utf-8"))
            RESULT_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as exc:
            RESULT_PATH.write_text(json.dumps({"fatalError": str(exc)}), encoding="utf-8")

        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 5500), Handler)
    print("Serving PagBank sandbox test on http://127.0.0.1:5500")
    server.serve_forever()
