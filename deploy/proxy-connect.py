#!/usr/bin/env python3
"""
HTTP CONNECT 代理隧道 —— 给 SSH 的 ProxyCommand 用

作用：通过本地的 HTTP 代理（比如 Shadowrocket 的 127.0.0.1:1082）
      建立到远程主机 host:port 的 TCP 隧道，然后把 stdin↔socket 桥接起来。
      SSH 看到的就是一条"到服务器的直连"。

用法：
  在 ssh 命令里：
    ssh -o ProxyCommand='python3 /path/to/proxy-connect.py %h %p' user@host

  环境变量（可选）：
    AIPM_PROXY_HOST   默认 127.0.0.1
    AIPM_PROXY_PORT   默认 1082

退出码：
  0   正常
  1   参数错误
  2   连不上本地代理
  3   代理握手阶段被关
  4   隧道建立失败（CONNECT 非 200）
"""
import os
import select
import socket
import sys


PROXY_HOST = os.environ.get("AIPM_PROXY_HOST", "127.0.0.1")
PROXY_PORT = int(os.environ.get("AIPM_PROXY_PORT", "1082"))
CONNECT_TIMEOUT = 15


def log(msg: str) -> None:
    """只往 stderr 写，stdout 留给 SSH 的 binary 流"""
    sys.stderr.write(f"[proxy-connect] {msg}\n")
    sys.stderr.flush()


def main() -> int:
    if len(sys.argv) != 3:
        log("Usage: proxy-connect.py <host> <port>")
        return 1
    host, port_str = sys.argv[1], sys.argv[2]
    try:
        port = int(port_str)
    except ValueError:
        log(f"port 必须是数字，收到 {port_str!r}")
        return 1

    # 1. 连到本地 HTTP 代理
    try:
        sock = socket.create_connection(
            (PROXY_HOST, PROXY_PORT),
            timeout=CONNECT_TIMEOUT,
        )
    except OSError as exc:
        log(f"连本地代理 {PROXY_HOST}:{PROXY_PORT} 失败: {exc}")
        return 2

    # 2. 发 HTTP CONNECT 请求
    request = (
        f"CONNECT {host}:{port} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Proxy-Connection: Keep-Alive\r\n"
        f"User-Agent: aipm-deploy-proxy-connect/1.0\r\n"
        f"\r\n"
    )
    try:
        sock.sendall(request.encode("ascii"))
    except OSError as exc:
        log(f"给代理发请求失败: {exc}")
        return 3

    # 3. 读响应头，直到 \r\n\r\n
    sock.settimeout(CONNECT_TIMEOUT)
    buf = b""
    while b"\r\n\r\n" not in buf:
        try:
            chunk = sock.recv(4096)
        except OSError as exc:
            log(f"读代理响应失败: {exc}")
            return 3
        if not chunk:
            log("代理在握手阶段就关了连接（可能代理不允许 CONNECT 到这个端口）")
            return 3
        buf += chunk
        if len(buf) > 64 * 1024:
            log("代理响应头过大，疑似不是 HTTP 代理")
            return 3

    header, _, leftover = buf.partition(b"\r\n\r\n")
    status_line = header.split(b"\r\n", 1)[0].decode("ascii", errors="replace")

    try:
        parts = status_line.split(" ", 2)
        status_code = int(parts[1])
    except (IndexError, ValueError):
        log(f"代理响应不是合法 HTTP: {status_line!r}")
        return 4

    if status_code != 200:
        log(f"隧道建立失败: {status_line}")
        return 4

    # 4. 隧道已建立。如果响应头后面有残留数据（少见），先塞回 stdout
    sock.settimeout(None)
    if leftover:
        try:
            sys.stdout.buffer.write(leftover)
            sys.stdout.buffer.flush()
        except OSError:
            return 0

    # 5. 双向 IO 转发：stdin→sock / sock→stdout
    #    用 select 而不是线程，避免 stdin 阻塞在 read 里退不出来
    stdin_fd = sys.stdin.buffer.fileno()
    stdout_fd = sys.stdout.buffer.fileno()
    sock_fd = sock.fileno()

    stdin_open = True
    sock_open = True

    while stdin_open or sock_open:
        rlist = []
        if stdin_open:
            rlist.append(stdin_fd)
        if sock_open:
            rlist.append(sock_fd)
        if not rlist:
            break

        try:
            ready, _, _ = select.select(rlist, [], [], None)
        except (OSError, InterruptedError):
            break

        if sock_fd in ready:
            try:
                data = os.read(sock_fd, 65536)
            except OSError:
                data = b""
            if not data:
                sock_open = False
                try:
                    os.close(stdout_fd)
                except OSError:
                    pass
            else:
                try:
                    os.write(stdout_fd, data)
                except OSError:
                    sock_open = False

        if stdin_fd in ready:
            try:
                data = os.read(stdin_fd, 65536)
            except OSError:
                data = b""
            if not data:
                stdin_open = False
                try:
                    sock.shutdown(socket.SHUT_WR)
                except OSError:
                    pass
            else:
                try:
                    sock.sendall(data)
                except OSError:
                    stdin_open = False

    try:
        sock.close()
    except OSError:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
