"""MagiClash backend CLI.

    python main.py runserver [--host 127.0.0.1] [--port 8000] [--no-reload]
    python main.py test [pytest args...]

Use the project virtualenv: `.venv\\Scripts\\python.exe main.py runserver` (or activate it first).
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def runserver(args: argparse.Namespace) -> None:
    import uvicorn

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
