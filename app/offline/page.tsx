export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl font-black mb-3">Offline</div>
      <p className="text-muted max-w-xs">
        No signal right now. Anything you already opened still works; new pages load as soon as you are back
        online.
      </p>
    </main>
  );
}
