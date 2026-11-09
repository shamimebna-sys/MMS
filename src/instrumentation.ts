export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installSocketPeerCapture } = await import("@/server/socket-peer");
    installSocketPeerCapture();
    const { installServerPerf } = await import("@/server/perf/runtime");
    installServerPerf();
  }
}
