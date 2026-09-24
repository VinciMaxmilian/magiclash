"""MagiClash backend CLI.

    python main.py runserver [--host 127.0.0.1] [--port 8000] [--no-reload]
    python main.py test [pytest args...]

Use the project virtualenv: `.venv\\Scripts\\python.exe main.py runserver` (or activate it first).
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def port_available(host: str, port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
        except OSError:
            return False
    return True


def runserver(args: argparse.Namespace) -> None:
    import uvicorn

    if not port_available(args.host, args.port):
        # On Windows a busy (or reserved) port surfaces as WinError 10013/10048.
        print(
            f"\nA porta {args.port} em {args.host} já está em uso ou reservada pelo sistema.\n"
            f"  - Feche o outro servidor (outro terminal rodando runserver?), ou\n"
            f"  - use outra porta:  python main.py runserver --port {args.port + 1}\n"
            f"  - para ver quem usa: Get-NetTCPConnection -LocalPort {args.port} (PowerShell)\n",
            file=sys.stderr,
        )
        sys.exit(1)

    os.chdir(HERE)  # so `.env` and the `app` package resolve regardless of the caller's cwd
    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        reload_dirs=[os.path.join(HERE, "app")],
        log_level="info",
    )


def test(extra: list[str]) -> int:
    import pytest

    os.chdir(HERE)
    return pytest.main(extra)


def main() -> None:
    parser = argparse.ArgumentParser(prog="main.py", description="MagiClash backend")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("runserver", help="start the API with uvicorn (auto-reload by default)")
    run.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    run.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    run.add_argument("--no-reload", action="store_true", help="disable auto-reload")

    sub.add_parser("test", help="run the pytest suite (extra args are forwarded)")

    args, extra = parser.parse_known_args()
    if args.command == "runserver":
        runserver(args)
    elif args.command == "test":
        sys.exit(test(extra))


if __name__ == "__main__":
    main()
