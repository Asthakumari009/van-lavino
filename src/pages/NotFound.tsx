import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(193,120,32,0.15),transparent_60%)] pointer-events-none" />
      <div className="relative text-center max-w-lg">
        <p className="font-mono text-xs text-brand-500 tracking-[0.4em] uppercase mb-4">
          404
        </p>
        <h1 className="font-display italic text-5xl md:text-7xl leading-[1.05] text-cream mb-6">
          Table Not Found · Wrong QR?
        </h1>
        <p className="text-cream/60 mb-10 font-body">
          The link you followed points somewhere that no longer exists. Scan
          the QR at your table again, or head back to the homepage.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            to="/"
            className="bg-brand-500 text-ink px-6 py-3 rounded-full text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-400 hover:shadow-glow transition-all"
          >
            Back to Home
          </Link>
          <Link
            to="/menu"
            className="border border-brand-500/40 text-brand-500 px-6 py-3 rounded-full text-sm uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition-all"
          >
            Browse Menu
          </Link>
        </div>
      </div>
    </div>
  );
}
